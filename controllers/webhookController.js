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
        const Settings = (await import('../models/Settings.js')).default;
        const settings = await Settings.getSettings();
        const centers = settings.centers;

        const result = student.isWithinAnyCenterRadius(
            location.latitude,
            location.longitude,
            centers
        );

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
                    sha256: message.image.sha256
                };

                // Check if we have processed media data
                if (message.processedMedia) {
                    content.mediaUrl = message.processedMedia.url;
                    content.base64Data = message.processedMedia.base64Data;
                    content.dataUrl = message.processedMedia.dataUrl;
                    content.fileSize = message.processedMedia.file_size;
                    content.contentType = message.processedMedia.contentType;
                }
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

        // Find student by phone number
        const student = await Student.findOne({ phone: from });
        if (!student) {
            await whatsappService.sendMessage(from, {
                type: 'text',
                text: 'Sorry, you are not registered in our system. Please contact your administrator.'
            });
            return;
        }

        // Check if student is active
        if (!student.isActive) {
            await whatsappService.sendMessage(from, {
                type: 'text',
                text: 'Your account is currently inactive. Please contact your administrator.'
            });
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
            await whatsappService.sendMessage(from, {
                type: 'text',
                text: `Your attendance for today has already been marked as ${existingAttendance.status}.`
            });
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

        if (messageType === 'location' || (messageType === 'text' && content.location)) {
            await processLocationAttendance(student, processData);
        } else if (messageType === 'image') {
            await processImageAttendance(student, processData);
        } else if (messageType === 'text') {
            await processTextAttendance(student, processData);
        } else {
            await whatsappService.sendMessage(from, {
                type: 'text',
                text: 'Please send your location and a photo to mark your attendance.'
            });
        }
    } catch (error) {
        console.error('Error handling incoming message:', error);
        if (message.from || message.messageId) {
            await whatsappService.sendMessage(message.from, {
                type: 'text',
                text: 'Sorry, there was an error processing your request. Please try again.'
            });
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
            verification: await (async () => {
                if (imageMetadata && imageMetadata.hasGPS) {
                    const imageLocation = imageMetadata.location;
                    const centerVerification = await findClosestValidCenter(imageLocation, student);
                    const { isWithin: isWithinRadius } = centerVerification;
                    return {
                        isVerified: isWithinRadius,
                        verifiedAt: isWithinRadius ? new Date() : null
                    };
                }
                return {
                    isVerified: false,
                    verifiedAt: null
                };
            })(),
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

        await whatsappService.sendMessage(from, {
            type: 'text',
            text: message
        });

        // Request photo if location is verified but no image yet
        if (isWithinRadius && settings.attendanceSettings.autoVerification.requireImage) {
            await whatsappService.sendMessage(from, {
                type: 'text',
                text: 'Please also send a photo to complete your attendance verification.'
            });
        }
    } catch (error) {
        console.error('Error processing location attendance:', error);
        throw error;
    }
}

// Process image-based attendance
async function processImageAttendance(student, processData) {
    const { messageId, from, timestamp, content } = processData;

    try {
        // Save image from base64 data or download from URL
        let imageUrl;
        let imageMetadata = null;

        if (content.base64Data) {
            // Use base64 data directly
            imageUrl = await imageService.saveImageFromBase64(content.base64Data, student._id, content.contentType || content.mimeType);
            // Extract metadata from base64 data
            imageMetadata = await imageService.extractMetadataFromBase64(content.base64Data);
        } else if (content.dataUrl) {
            // Use data URL  
            imageUrl = await imageService.saveImageFromDataUrl(content.dataUrl, student._id);
            // Extract metadata from data URL
            imageMetadata = await imageService.extractMetadataFromBase64(content.dataUrl);
        } else if (content.mediaUrl) {
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
            throw new Error('No image data available');
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
                    messageType: 'image',
                    content: {
                        mediaUrl: content.mediaUrl || null,
                        mediaId: content.mediaId || null,
                        caption: content.caption || '',
                        mimeType: content.mimeType || content.contentType || 'image/jpeg',
                        sha256: content.sha256 || null
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

        // Send response based on whether GPS location was extracted
        let responseMessage;
        if (imageMetadata && imageMetadata.hasGPS) {
            const imageLocation = imageMetadata.location;
            const centerVerification = await findClosestValidCenter(imageLocation, student);
            const { isWithin: isWithinRadius, distance, center } = centerVerification;

            if (isWithinRadius) {
                const centerName = center ? center.name : 'a center';
                responseMessage = `Photo received with location data. Your attendance has been marked as present at ${centerName}!`;
            } else {
                const centerName = center ? center.name : 'any center';
                responseMessage = `Photo received. You are ${distance}m away from ${centerName}. Please come closer or share your current location.`;
            }
        } else {
            responseMessage = 'Photo received. Please also share your location to complete attendance marking.';
        }

        await whatsappService.sendMessage(from, {
            type: 'text',
            text: responseMessage
        });
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
            await whatsappService.sendMessage(from, {
                type: 'text',
                text: 'To mark your attendance, please share your current location and a photo.'
            });
        } else if (text.includes('help') || text.includes('?')) {
            const helpMessage = `Smart Attendance System Help:
      
1. Share your location to mark attendance
2. Send a photo for verification
3. Both location and photo are required
4. You must be at the training center

Need more help? Contact your administrator.`;

            await whatsappService.sendMessage(from, {
                type: 'text',
                text: helpMessage
            });
        } else {
            await whatsappService.sendMessage(from, {
                type: 'text',
                text: 'Please share your location and a photo to mark your attendance.'
            });
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
            await whatsappService.sendMessage(from, {
                type: 'text',
                text: 'Please share your location and a photo to mark your attendance.'
            });
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

            await whatsappService.sendMessage(from, {
                type: 'text',
                text: message
            });
        }
    } catch (error) {
        console.error('Error handling button reply:', error);
    }
}

