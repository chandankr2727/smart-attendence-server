import express from 'express';
import { handleWhatsAppWebhook } from '../controllers/webhookController.js';

const router = express.Router();

// POST /api/webhook/whatsapp - Handle incoming WhatsApp messages
router.post('/whatsapp', handleWhatsAppWebhook);

export default router; 