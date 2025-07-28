import express from 'express';
import { getDashboardAnalytics } from '../controllers/analyticsController.js';

const router = express.Router();

// GET /api/analytics/dashboard - Get dashboard analytics
router.get('/dashboard', getDashboardAnalytics);

export default router; 