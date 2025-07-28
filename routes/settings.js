import express from 'express';
import {
    getSettings,
    updateSettings,
    getCenters,
    addCenter,
    updateCenter,
    removeCenter,
    getCenter,
    updateTemplates,
    getTemplates
} from '../controllers/settingsController.js';

const router = express.Router();

// GET /api/settings - Get system settings
router.get('/', getSettings);

// PUT /api/settings - Update system settings
router.put('/', updateSettings);

// Center management routes
// GET /api/settings/centers - Get all centers
router.get('/centers', getCenters);

// POST /api/settings/centers - Add new center
router.post('/centers', addCenter);

// GET /api/settings/centers/:id - Get specific center
router.get('/centers/:id', getCenter);

// PUT /api/settings/centers/:id - Update center
router.put('/centers/:id', updateCenter);

// DELETE /api/settings/centers/:id - Remove center
router.delete('/centers/:id', removeCenter);

// Template management routes
// GET /api/settings/templates - Get message templates
router.get('/templates', getTemplates);

// PUT /api/settings/templates - Update message templates
router.put('/templates', updateTemplates);

export default router; 