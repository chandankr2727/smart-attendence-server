import axios from 'axios';
import Settings from '../models/Settings.js';

class WhatsAppService {
    constructor() {
        this.apiBaseUrl = process.env.WHATSAPP_API_BASE_URL || 'https://wabe.arekiv.com';
        this.settings = null;
    }

    async getSettings() {
        if (!this.settings) {
            this.settings = await Settings.getSettings();
        }
        return this.settings;
    }

    async sendMessage(to, messageData) {
        try {
            const settings = await this.getSettings();

            if (!settings.whatsappApi.isActive) {
                throw new Error('WhatsApp API is not active');
            }

            const { apiKey, accessToken } = settings.whatsappApi;

            const payload = {
                to: to.startsWith('+') ? to : `+${to}`,
                ...messageData
            };

            const response = await axios.post(
                `${this.apiBaseUrl}/api/dev/v1/direct/${apiKey}`,
                payload,
                {
                    headers: {
                        'Content-Type': 'application/json',
                        'X-Access-Token': accessToken
                    }
                }
            );

            console.log('WhatsApp message sent successfully:', response.data);
            return response.data;
        } catch (error) {
            console.error('Error sending WhatsApp message:', error.response?.data || error.message);
            throw error;
        }
    }

    async sendTextMessage(to, text) {
        return this.sendMessage(to, {
            type: 'text',
            text: {
                body: text,
                preview_url: true
            }
        });
    }

    async sendImageMessage(to, imageUrl, caption = '') {
        return this.sendMessage(to, {
            type: 'image',
            image: {
                link: imageUrl,
                caption
            }
        });
    }

    async sendTemplateMessage(to, templateName, templateData = {}) {
        try {
            const settings = await this.getSettings();
            const { apiKey, accessToken } = settings.whatsappApi;

            const payload = {
                to: to.startsWith('+') ? to : `+${to}`,
                template: {
                    name: templateName,
                    language: {
                        code: templateData.language || 'en_US'
                    }
                }
            };

            // Add components if provided
            if (templateData.components && templateData.components.length > 0) {
                payload.template.components = templateData.components;
            }

            const response = await axios.post(
                `${this.apiBaseUrl}/api/dev/v1/template/${apiKey}`,
                payload,
                {
                    headers: {
                        'Content-Type': 'application/json',
                        'X-Access-Token': accessToken
                    }
                }
            );

            console.log('WhatsApp template message sent successfully:', response.data);
            return response.data;
        } catch (error) {
            console.error('Error sending WhatsApp template message:', error.response?.data || error.message);
            throw error;
        }
    }

    async sendAttendanceReminder(to, studentName) {
        const settings = await this.getSettings();
        const message = settings.templates.reminderMessage
            .replace('{{name}}', studentName)
            .replace('{{date}}', new Date().toLocaleDateString('en-IN'));

        return this.sendTextMessage(to, message);
    }

    async sendAttendanceConfirmation(to, studentName, status, timestamp) {
        const settings = await this.getSettings();
        const message = settings.templates.confirmationMessage
            .replace('{{name}}', studentName)
            .replace('{{status}}', status)
            .replace('{{date}}', new Date(timestamp).toLocaleDateString('en-IN'))
            .replace('{{time}}', new Date(timestamp).toLocaleTimeString('en-IN'));

        return this.sendTextMessage(to, message);
    }

    async sendWelcomeMessage(to, studentName) {
        const settings = await this.getSettings();
        const message = settings.templates.welcomeMessage
            .replace('{{name}}', studentName);

        return this.sendTextMessage(to, message);
    }

    async sendLocationRequest(to) {
        return this.sendTextMessage(to,
            'Please share your current location to mark your attendance. Make sure you are at the training center.'
        );
    }

    async sendPhotoRequest(to) {
        return this.sendTextMessage(to,
            'Please send a photo as a DOCUMENT (not as image) to complete your attendance verification and preserve location data.'
        );
    }

    async sendAttendanceInstructions(to) {
        const instructions = `📍 Smart Attendance System Instructions:

1. Share your current location
2. Send a clear photo of yourself as a DOCUMENT (not as image)
3. Sending as document preserves GPS location data in the photo
4. Ensure you are within the training center premises
5. Both location and photo are required

🔧 Technical tip: WhatsApp removes location data from photos sent as "image" but preserves it when sent as "document"

Your attendance will be automatically verified if you are at the correct location.

Need help? Reply with "help" for more information.`;

        return this.sendTextMessage(to, instructions);
    }

    async sendDailyReminder(students) {
        const results = [];

        for (const student of students) {
            try {
                await this.sendAttendanceReminder(student.phone, student.name);
                results.push({
                    studentId: student._id,
                    phone: student.phone,
                    status: 'sent'
                });
            } catch (error) {
                console.error(`Failed to send reminder to ${student.phone}:`, error);
                results.push({
                    studentId: student._id,
                    phone: student.phone,
                    status: 'failed',
                    error: error.message
                });
            }
        }

        return results;
    }

    async verifyWebhook(signature, payload) {
        // Implement webhook signature verification based on your provider
        // This is a placeholder implementation
        const expectedSignature = process.env.WHATSAPP_WEBHOOK_SECRET;
        return signature === expectedSignature;
    }

    async getMessageStatus(messageId) {
        try {
            const settings = await this.getSettings();
            const { apiKey, accessToken } = settings.whatsappApi;

            const response = await axios.get(
                `${this.apiBaseUrl}/api/dev/v1/message/${messageId}/status`,
                {
                    headers: {
                        'X-Access-Token': accessToken
                    }
                }
            );

            return response.data;
        } catch (error) {
            console.error('Error getting message status:', error);
            throw error;
        }
    }

    async downloadMedia(mediaId) {
        try {
            const settings = await this.getSettings();
            const { apiKey, accessToken } = settings.whatsappApi;

            const response = await axios.get(
                `${this.apiBaseUrl}/api/dev/v1/media/${mediaId}`,
                {
                    headers: {
                        'X-Access-Token': accessToken
                    },
                    responseType: 'stream'
                }
            );

            return response.data;
        } catch (error) {
            console.error('Error downloading media:', error);
            throw error;
        }
    }
}

export const whatsappService = new WhatsAppService(); 