import Student from '../models/Student.js';
import Attendance from '../models/Attendance.js';
import Settings from '../models/Settings.js';
import { whatsappService } from '../services/whatsapp.js';
import { geoService } from '../services/geo.js';
import { imageService } from '../services/image.js';
import geolib from 'geolib';

// POST /api/webhook/whatsapp - Handle incoming WhatsApp messages
export const handleWhatsAppWebhook = async (req, res) => {
    try {
        console.log('Webhook received:', JSON.stringify(req.body, null, 2));

        const webhookData = req.body;

        // Handle different types of webhook events
        if (webhookData.type === 'message') {
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
async function handleIncomingMessage(webhookData) {
    const { messageId, from, timestamp, messageType, content, location } = webhookData;

    try {
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
        if (messageType === 'location' || (messageType === 'text' && content.location)) {
            await processLocationAttendance(student, webhookData);
        } else if (messageType === 'image') {
            await processImageAttendance(student, webhookData);
        } else if (messageType === 'text') {
            await processTextAttendance(student, webhookData);
        } else {
            await whatsappService.sendMessage(from, {
                type: 'text',
                text: 'Please send your location and a photo to mark your attendance.'
            });
        }
    } catch (error) {
        console.error('Error handling incoming message:', error);
        await whatsappService.sendMessage(from, {
            type: 'text',
            text: 'Sorry, there was an error processing your request. Please try again.'
        });
    }
}

// Process location-based attendance
async function processLocationAttendance(student, webhookData) {
    const { messageId, from, timestamp, location } = webhookData;

    try {
        // Verify location is within training center radius
        const distance = geolib.getDistance(
            { latitude: location.latitude, longitude: location.longitude },
            {
                latitude: student.trainingCenter.coordinates.latitude,
                longitude: student.trainingCenter.coordinates.longitude
            }
        );

        const isWithinRadius = distance <= student.trainingCenter.radius;

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
                distanceFromCenter: distance
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
            message = `You are ${distance}m away from the training center. ${settings.templates.rejectionMessage}`;
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
async function processImageAttendance(student, webhookData) {
    const { messageId, from, timestamp, content } = webhookData;

    try {
        // Download and save image
        const imageUrl = await imageService.downloadAndSaveImage(content.mediaUrl, student._id);

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
                    size: content.fileSize || null,
                    mimeType: content.mimeType || 'image/jpeg'
                }
            });

            // If location was already verified and now we have image, mark as present
            if (attendance.location.isWithinRadius) {
                attendance.status = attendance.isLate() ? 'late' : 'present';
                attendance.verification.isVerified = true;
                attendance.verification.verifiedAt = new Date();
            }

            await attendance.save();
        } else {
            // Create new attendance record with image only
            attendance = new Attendance({
                student: student._id,
                date: new Date(timestamp),
                whatsappMessage: {
                    messageId,
                    from,
                    timestamp: new Date(timestamp),
                    messageType: 'image',
                    content: {
                        mediaUrl: content.mediaUrl,
                        caption: content.caption || ''
                    }
                },
                location: {
                    coordinates: {
                        latitude: 0, // Will be updated when location is received
                        longitude: 0
                    },
                    isWithinRadius: false,
                    distanceFromCenter: 999999
                },
                images: [{
                    url: imageUrl,
                    metadata: {
                        originalName: content.filename || 'image.jpg',
                        size: content.fileSize || null,
                        mimeType: content.mimeType || 'image/jpeg'
                    }
                }],
                metadata: {
                    webhookReceived: new Date(),
                    processed: new Date()
                }
            });

            await attendance.save();
        }

        // Send response
        await whatsappService.sendMessage(from, {
            type: 'text',
            text: 'Photo received. Please also share your location to complete attendance marking.'
        });
    } catch (error) {
        console.error('Error processing image attendance:', error);
        throw error;
    }
}

// Process text-based attendance
async function processTextAttendance(student, webhookData) {
    const { from, content } = webhookData;

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

