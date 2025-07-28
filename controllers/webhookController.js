import Student from '../models/Student.js';
import Attendance from '../models/Attendance.js';
import Settings from '../models/Settings.js';
import { whatsappService } from '../services/whatsapp.js';
import { geoService } from '../services/geo.js';
import { imageService } from '../services/image.js';
import geolib from 'geolib';
import path from 'path';

// Helper function to find the closest valid center for a location
async function findClosestValidCenter(location, student) {
    try {
        console.log('🔍 Finding closest center for location:', location);
        const Settings = (await import('../models/Settings.js')).default;
        const settings = await Settings.getSettings();
        const centers = settings.centers;

        console.log('📍 Available centers:', centers.length);
        centers.forEach((center, index) => {
            console.log(`Center ${index + 1}: ${center.name} at (${center.coordinates.latitude}, ${center.coordinates.longitude}) - radius: ${center.radius}m - active: ${center.isActive}`);

            // Manual distance calculation for debugging
            const manualDistance = geolib.getDistance(
                { latitude: location.latitude, longitude: location.longitude },
                { latitude: center.coordinates.latitude, longitude: center.coordinates.longitude }
            );
            console.log(`🔢 Manual distance calculation to ${center.name}: ${manualDistance}m - Within ${center.radius}m radius: ${manualDistance <= center.radius}`);
        });

        const result = student.isWithinAnyCenterRadius(
            location.latitude,
            location.longitude,
            centers
        );

        console.log('🎯 Center verification result:', result);
        return result;
    } catch (error) {
        console.error('Error finding closest valid center:', error);
        return {
            isWithin: false,
            distance: Infinity,
            center: null
        };
    }
}

// POST /api/webhook/whatsapp - Handle incoming WhatsApp messages
export const handleWhatsAppWebhook = async (req, res) => {
    try {
        console.log('Webhook received:', JSON.stringify(req.body, null, 2));
        console.log('Processing webhook with timestamp:', new Date().toISOString());

        const webhookData = req.body;

        // Handle WhatsApp Business API webhook structure
        if (webhookData.originalPayload && webhookData.originalPayload.entry) {
            for (const entry of webhookData.originalPayload.entry) {
                for (const change of entry.changes) {
                    if (change.value && change.value.messages) {
                        for (const message of change.value.messages) {
                            await handleIncomingMessage(message, webhookData);
                        }
                    }
                    if (change.value && change.value.statuses) {
                        for (const status of change.value.statuses) {
                            await handleMessageStatus(status);
                        }
                    }
                }
            }
        }
        // Legacy format support
        else if (webhookData.type === 'message') {
            await handleIncomingMessage(webhookData);
        } else if (webhookData.type === 'status') {
            await handleMessageStatus(webhookData);
        } else if (webhookData.type === 'button_reply') {
            await handleButtonReply(webhookData);
        }

        res.status(200).json({ success: true });
    } catch (error) {
        console.error('Webhook error:', error);
        res.status(500).json({ error: 'Webhook processing failed' });
    }
};

// Handle incoming WhatsApp messages
async function handleIncomingMessage(message, webhookData = null) {
    try {
        // Extract message data from new format or legacy format
        let messageId, from, timestamp, messageType, content, location;

        if (message.id && message.from) {
            // New WhatsApp Business API format
            console.log('Processing new WhatsApp Business API format message:', {
                id: message.id,
                from: message.from,
                type: message.type,
                timestamp: message.timestamp
            });

            messageId = message.id;
            from = message.from;
            timestamp = message.timestamp ? new Date(parseInt(message.timestamp) * 1000) : new Date();
            messageType = message.type;

            // Extract content based on message type
            if (messageType === 'text') {
                content = { text: message.text.body };
            } else if (messageType === 'image') {
                content = {
                    mediaId: message.image.id,
                    mimeType: message.image.mime_type,
                    sha256: message.image.sha256,
                    filename: message.image.filename || 'image.jpg'
                };

                // Check if we have processed media data
                if (message.processedMedia) {
                    content.mediaUrl = message.processedMedia.url;
                    content.base64Data = message.processedMedia.base64Data;
                    content.dataUrl = message.processedMedia.dataUrl;
                    content.fileSize = message.processedMedia.file_size;
                    content.contentType = message.processedMedia.contentType;
                }
            } else if (messageType === 'document') {
                // Handle documents - check if it's an image document
                const documentMimeType = message.document.mime_type;
                const isImageDocument = documentMimeType && documentMimeType.startsWith('image/');

                content = {
                    mediaId: message.document.id,
                    mimeType: documentMimeType,
                    sha256: message.document.sha256,
                    filename: message.document.filename || 'document',
                    isImageDocument
                };

                // Check if we have processed media data
                if (message.processedMedia) {
                    content.mediaUrl = message.processedMedia.url;
                    content.base64Data = message.processedMedia.base64Data;
                    content.dataUrl = message.processedMedia.dataUrl;
                    content.fileSize = message.processedMedia.file_size;
                    content.contentType = message.processedMedia.contentType;
                }

                console.log('Document received:', {
                    mimeType: documentMimeType,
                    filename: content.filename,
                    isImageDocument,
                    hasProcessedMedia: !!message.processedMedia
                });
            } else if (messageType === 'location') {
                location = {
                    latitude: message.location.latitude,
                    longitude: message.location.longitude,
                    address: message.location.address || null,
                    name: message.location.name || null
                };
                content = { location: true };
            }
        } else {
            // Legacy format
            ({ messageId, from, timestamp, messageType, content, location } = message);
        }

        // Find student by phone number (match last 10 digits)
        const last10Digits = from.slice(-10);
        const student = await Student.findOne({
            $or: [
                { phone: from },
                { phone: { $regex: `${last10Digits}$` } }
            ]
        });

        if (!student) {
            console.log(`Student not found for phone: ${from}, last 10 digits: ${last10Digits}`);
            await whatsappService.sendTextMessage(from, 'Sorry, you are not registered in our system. Please contact your administrator.');
            return;
        }

        console.log(`Student found: ${student.name} (${student.phone}) for incoming phone: ${from}`);

        // Check if student is active
        if (!student.isActive) {
            await whatsappService.sendTextMessage(from, 'Your account is currently inactive. Please contact your administrator.');
            return;
        }

        // Check if attendance already marked for today
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);

        const existingAttendance = await Attendance.findOne({
            student: student._id,
            date: {
                $gte: today,
                $lt: tomorrow
            }
        });

        if (existingAttendance && existingAttendance.status !== 'pending_verification') {
            await whatsappService.sendTextMessage(from, `Your attendance for today has already been marked as ${existingAttendance.status}.`);
            return;
        }

        // Process attendance based on message type
        const processData = {
            messageId,
            from,
            timestamp,
            messageType,
            content,
            location,
            originalMessage: message,
            webhookData
        };

        console.log('Process data created:', { messageType, contentKeys: Object.keys(content || {}) });

        if (messageType === 'location' || (messageType === 'text' && content.location)) {
            await processLocationAttendance(student, processData);
        } else if (messageType === 'image') {
            await processImageAttendance(student, processData);
        } else if (messageType === 'document' && content.isImageDocument) {
            console.log('Processing document as image for attendance, messageType:', messageType);
            // Process image documents as images for attendance
            await processImageAttendance(student, processData);
        } else if (messageType === 'document' && !content.isImageDocument) {
            await whatsappService.sendTextMessage(from, 'Please send an image file or photo to mark your attendance.');
        } else if (messageType === 'text') {
            await processTextAttendance(student, processData);
        } else {
            await whatsappService.sendTextMessage(from, 'Please send your location and a photo as a document to mark your attendance.');
        }
    } catch (error) {
        console.error('Error handling incoming message:', error);
        if (message.from || message.messageId) {
            await whatsappService.sendTextMessage(message.from, 'Sorry, there was an error processing your request. Please try again.');
        }
    }
}

// Process location-based attendance
async function processLocationAttendance(student, processData) {
    const { messageId, from, timestamp, location } = processData;

    try {
        // Find the closest valid center for the location
        const centerVerification = await findClosestValidCenter(location, student);
        const { isWithin: isWithinRadius, distance, center } = centerVerification;

        // Create attendance record
        const attendanceData = {
            student: student._id,
            date: new Date(timestamp),
            whatsappMessage: {
                messageId,
                from,
                timestamp: new Date(timestamp),
                messageType: 'location',
                content: {
                    text: 'Location shared for attendance'
                }
            },
            location: {
                coordinates: {
                    latitude: location.latitude,
                    longitude: location.longitude
                },
                accuracy: location.accuracy || null,
                address: location.address || null,
                isWithinRadius,
                distanceFromCenter: distance,
                verifiedCenter: center ? {
                    id: center._id,
                    name: center.name,
                    address: center.address
                } : null
            },
            verification: {
                isVerified: isWithinRadius,
                verifiedAt: isWithinRadius ? new Date() : null
            },
            metadata: {
                webhookReceived: new Date(),
                processed: new Date()
            }
        };

        const attendance = new Attendance(attendanceData);
        await attendance.save();

        // Send confirmation message
        const settings = await Settings.getSettings();
        let message;

        if (isWithinRadius) {
            message = settings.templates.confirmationMessage
                .replace('{{date}}', new Date().toLocaleDateString('en-IN'))
                .replace('{{time}}', new Date().toLocaleTimeString('en-IN'));
        } else {
            const centerName = center ? center.name : 'any center';
            message = `You are ${distance}m away from ${centerName}. ${settings.templates.rejectionMessage}`;
        }

        await whatsappService.sendTextMessage(from, message);

        // Request photo if location is verified but no image yet
        if (isWithinRadius && settings.attendanceSettings.autoVerification.requireImage) {
            await whatsappService.sendTextMessage(from, 'Please also send a photo to complete your attendance verification.');
        }
    } catch (error) {
        console.error('Error processing location attendance:', error);
        throw error;
    }
}

// Process image-based attendance
async function processImageAttendance(student, processData) {
    console.log('processImageAttendance called with processData keys:', Object.keys(processData));
    console.log('processData:', JSON.stringify(processData, null, 2));

    const { messageId, from, timestamp, messageType, content } = processData;

    console.log('Extracted variables:', { messageId, from, timestamp, messageType, contentKeys: Object.keys(content || {}) });

    try {
        // Log received image/document content for debugging
        console.log(`${messageType === 'document' ? 'Document' : 'Image'} content received:`, {
            messageType,
            mediaId: content.mediaId,
            mimeType: content.mimeType || content.contentType,
            sha256: content.sha256,
            filename: content.filename,
            isImageDocument: content.isImageDocument,
            fileSize: content.fileSize || content.file_size,
            hasBase64Data: !!content.base64Data,
            hasDataUrl: !!content.dataUrl,
            hasMediaUrl: !!content.mediaUrl,
            base64DataLength: content.base64Data ? content.base64Data.length : 0
        });

        // Save image from base64 data or download from URL
        let imageUrl;
        let imageMetadata = null;

        if (content.base64Data) {
            console.log(`Processing ${messageType} from base64 data`);
            console.log('Base64 data available, length:', content.base64Data.length);
            console.log('First 100 chars of base64:', content.base64Data.substring(0, 100));

            // Use base64 data directly
            imageUrl = await imageService.saveImageFromBase64(content.base64Data, student._id, content.contentType || content.mimeType);
            console.log('Image saved to:', imageUrl);

            // Extract metadata from base64 data (this preserves EXIF data for documents)
            console.log('Starting metadata extraction...');
            imageMetadata = await imageService.extractMetadataFromBase64(content.base64Data);
            console.log('Metadata extraction completed');
        } else if (content.dataUrl) {
            console.log(`Processing ${messageType} from data URL`);
            // Use data URL  
            imageUrl = await imageService.saveImageFromDataUrl(content.dataUrl, student._id);
            // Extract metadata from data URL (this preserves EXIF data for documents)
            imageMetadata = await imageService.extractMetadataFromBase64(content.dataUrl);
        } else if (content.mediaUrl) {
            console.log(`Processing ${messageType} from media URL (legacy)`);
            // Fallback to downloading from URL (legacy)
            imageUrl = await imageService.downloadAndSaveImage(content.mediaUrl, student._id);
            // Extract metadata from saved file
            try {
                const fullPath = path.join(process.cwd(), 'uploads/attendance', path.basename(imageUrl));
                imageMetadata = await imageService.extractImageMetadata(fullPath);
            } catch (error) {
                console.error('Error extracting metadata from downloaded image:', error);
            }
        } else {
            throw new Error(`No ${messageType} data available`);
        }

        console.log('Extracted image metadata:', {
            hasGPS: imageMetadata?.hasGPS,
            location: imageMetadata?.location,
            timestamp: imageMetadata?.timestamp,
            camera: imageMetadata?.camera,
            messageType: messageType,
            extractionSuccess: !!imageMetadata
        });

        if (!imageMetadata) {
            console.warn('No metadata extracted from image/document');
        } else if (!imageMetadata.hasGPS) {
            console.warn('No GPS data found in image/document metadata');
        } else {
            console.log('✓ GPS location successfully extracted from image/document');
        }

        // Provide guidance if image was sent as "image" type without GPS data
        if (messageType === 'image' && (!imageMetadata || !imageMetadata.hasGPS)) {
            console.log('Image sent as image type without GPS data, suggesting document format');
            // Send this tip as a separate message after the main response
            setTimeout(async () => {
                await whatsappService.sendTextMessage(from,
                    '💡 Pro Tip: Send photos as DOCUMENTS instead of images to enable automatic attendance marking with GPS location data!'
                );
            }, 2000); // Delay to avoid overwhelming the user
        }

        // Find or update today's attendance record
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);

        let attendance = await Attendance.findOne({
            student: student._id,
            date: {
                $gte: today,
                $lt: tomorrow
            }
        });

        if (attendance) {
            // Update existing record with image
            attendance.images.push({
                url: imageUrl,
                metadata: {
                    originalName: content.filename || 'image.jpg',
                    size: content.fileSize || content.file_size || null,
                    mimeType: content.mimeType || content.contentType || 'image/jpeg',
                    mediaId: content.mediaId || null,
                    sha256: content.sha256 || null,
                    exif: imageMetadata || null
                }
            });

            // If image has GPS location and attendance doesn't have location yet, use image location
            if (imageMetadata && imageMetadata.hasGPS && !attendance.location.isWithinRadius) {
                const imageLocation = imageMetadata.location;
                const centerVerification = await findClosestValidCenter(imageLocation, student);
                const { isWithin: isWithinRadius, distance, center } = centerVerification;

                // Update location with image GPS data
                attendance.location = {
                    coordinates: {
                        latitude: imageLocation.latitude,
                        longitude: imageLocation.longitude
                    },
                    accuracy: null,
                    address: null,
                    isWithinRadius,
                    distanceFromCenter: distance,
                    source: 'image_exif',
                    verifiedCenter: center ? {
                        id: center._id,
                        name: center.name,
                        address: center.address
                    } : null
                };

                // Update status if now within radius
                if (isWithinRadius) {
                    attendance.status = attendance.isLate() ? 'late' : 'present';
                    attendance.verification.isVerified = true;
                    attendance.verification.verifiedAt = new Date();
                }
            }

            // If location was already verified and now we have image, mark as present
            if (attendance.location.isWithinRadius) {
                attendance.status = attendance.isLate() ? 'late' : 'present';
                attendance.verification.isVerified = true;
                attendance.verification.verifiedAt = new Date();
            }

            await attendance.save();
        } else {
            // Create new attendance record with image only
            const initialStatus = (imageMetadata && imageMetadata.hasGPS) ?
                await (async () => {
                    const imageLocation = imageMetadata.location;
                    const centerVerification = await findClosestValidCenter(imageLocation, student);
                    return centerVerification.isWithin ? 'present' : 'pending_verification';
                })() : 'pending_verification';

            attendance = new Attendance({
                student: student._id,
                date: new Date(timestamp),
                status: initialStatus,
                whatsappMessage: {
                    messageId,
                    from,
                    timestamp: new Date(timestamp),
                    messageType: messageType,
                    content: {
                        mediaUrl: content.mediaUrl || null,
                        mediaId: content.mediaId || null,
                        caption: content.caption || '',
                        mimeType: content.mimeType || content.contentType || 'image/jpeg',
                        sha256: content.sha256 || null,
                        filename: content.filename || null
                    }
                },
                location: await (async () => {
                    // Use image GPS location if available
                    if (imageMetadata && imageMetadata.hasGPS) {
                        const imageLocation = imageMetadata.location;
                        const centerVerification = await findClosestValidCenter(imageLocation, student);
                        const { isWithin: isWithinRadius, distance, center } = centerVerification;

                        return {
                            coordinates: {
                                latitude: imageLocation.latitude,
                                longitude: imageLocation.longitude
                            },
                            accuracy: null,
                            address: null,
                            isWithinRadius,
                            distanceFromCenter: distance,
                            source: 'image_exif',
                            verifiedCenter: center ? {
                                id: center._id,
                                name: center.name,
                                address: center.address
                            } : null
                        };
                    } else {
                        return {
                            coordinates: {
                                latitude: 0, // Will be updated when location is received
                                longitude: 0
                            },
                            isWithinRadius: false,
                            distanceFromCenter: 999999,
                            source: 'pending'
                        };
                    }
                })(),
                images: [{
                    url: imageUrl,
                    metadata: {
                        originalName: content.filename || 'image.jpg',
                        size: content.fileSize || content.file_size || null,
                        mimeType: content.mimeType || content.contentType || 'image/jpeg',
                        mediaId: content.mediaId || null,
                        sha256: content.sha256 || null,
                        exif: imageMetadata || null
                    }
                }],
                metadata: {
                    webhookReceived: new Date(),
                    processed: new Date()
                }
            });

            await attendance.save();
        }

        // Send response based on whether GPS location was extracted and message type
        let responseMessage;
        if (imageMetadata && imageMetadata.hasGPS) {
            const imageLocation = imageMetadata.location;
            console.log('🎯 Processing image location for attendance:', {
                latitude: imageLocation.latitude.toFixed(6),
                longitude: imageLocation.longitude.toFixed(6)
            });

            const centerVerification = await findClosestValidCenter(imageLocation, student);
            const { isWithin: isWithinRadius, distance, center } = centerVerification;

            console.log('📊 Center verification complete:', {
                isWithinRadius,
                distance: distance === Infinity ? 'Infinity' : `${distance}m`,
                centerName: center ? center.name : 'none found'
            });

            if (isWithinRadius) {
                const centerName = center ? center.name : 'a center';
                const mediaType = messageType === 'document' ? 'Document' : 'Photo';
                responseMessage = `✅ ${mediaType} received with GPS location data. Your attendance has been marked as PRESENT at ${centerName}!`;

                // If this is a document with GPS within radius, mark as present immediately
                if (messageType === 'document') {
                    console.log('🎯 Document with GPS within radius - marking attendance as present');
                    responseMessage += `\n\n📍 GPS coordinates from image: ${imageLocation.latitude.toFixed(6)}, ${imageLocation.longitude.toFixed(6)}`;
                    responseMessage += `\n📏 Distance to center: ${distance}m`;
                }
            } else {
                const centerName = center ? center.name : 'any center';
                const mediaType = messageType === 'document' ? 'Document' : 'Photo';
                const distanceText = distance === Infinity ? 'far' : `${distance}m`;
                responseMessage = `📍 ${mediaType} received with GPS location data. You are ${distanceText} away from ${centerName} (required: within 2km).`;

                if (messageType === 'document') {
                    responseMessage += `\n\n❌ Too far from center - please get closer to mark attendance.`;
                } else {
                    responseMessage += ` Please come closer or share your current location.`;
                }
            }
        } else {
            const mediaType = messageType === 'document' ? 'Document' : 'Photo';

            if (messageType === 'document') {
                responseMessage = `📄 Document received but no GPS location data found. Please send your location separately to mark attendance.`;
            } else {
                responseMessage = `📷 Photo received. Please send your location or send photos as DOCUMENTS to preserve GPS data for automatic location detection.`;
            }
        }

        await whatsappService.sendTextMessage(from, responseMessage);
    } catch (error) {
        console.error('Error processing image attendance:', error);
        throw error;
    }
}

// Process text-based attendance
async function processTextAttendance(student, processData) {
    const { from, content } = processData;

    try {
        const text = content.text.toLowerCase();

        if (text.includes('attendance') || text.includes('present') || text.includes('here')) {
            await whatsappService.sendTextMessage(from, 'To mark your attendance, please share your current location and send a photo as a document (to preserve location data).');
        } else if (text.includes('help') || text.includes('?')) {
            const helpMessage = `Smart Attendance System Help:
      
1. Share your location to mark attendance
2. Send a photo as a DOCUMENT (not as image) for verification
3. Sending as document preserves GPS location data in the photo
4. Both location and photo are required
5. You must be at the training center

📍 Pro tip: Send photos as documents to enable automatic location detection from image metadata!

Need more help? Contact your administrator.`;

            await whatsappService.sendTextMessage(from, helpMessage);
        } else {
            await whatsappService.sendTextMessage(from, 'Please share your location and send a photo as a document to mark your attendance.');
        }
    } catch (error) {
        console.error('Error processing text attendance:', error);
        throw error;
    }
}

// Handle message status updates
async function handleMessageStatus(webhookData) {
    const { messageId, status, timestamp } = webhookData;

    try {
        // Update message status in attendance record
        await Attendance.updateMany(
            { 'whatsappMessage.messageId': messageId },
            {
                $set: {
                    'metadata.messageStatus': status,
                    'metadata.statusUpdated': new Date(timestamp)
                }
            }
        );

        console.log(`Message ${messageId} status updated to ${status}`);
    } catch (error) {
        console.error('Error handling message status:', error);
    }
}

// Handle button replies
async function handleButtonReply(webhookData) {
    const { messageId, from, context } = webhookData;

    try {
        const student = await Student.findOne({ phone: from });
        if (!student) return;

        const { buttonPayload, buttonText } = context;

        if (buttonPayload === 'mark_attendance') {
            await whatsappService.sendTextMessage(from, 'Please share your location and send a photo as a document to mark your attendance.');
        } else if (buttonPayload === 'check_status') {
            // Get today's attendance status
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            const tomorrow = new Date(today);
            tomorrow.setDate(tomorrow.getDate() + 1);

            const attendance = await Attendance.findOne({
                student: student._id,
                date: {
                    $gte: today,
                    $lt: tomorrow
                }
            });

            const status = attendance ? attendance.status : 'absent';
            const message = `Your attendance status for today: ${status.toUpperCase()}`;

            await whatsappService.sendTextMessage(from, message);
        }
    } catch (error) {
        console.error('Error handling button reply:', error);
    }
}

