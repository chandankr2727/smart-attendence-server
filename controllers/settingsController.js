import Settings from '../models/Settings.js';

// GET /api/settings - Get system settings
export const getSettings = async (req, res) => {
    try {
        const settings = await Settings.getSettings();
        res.json(settings);
    } catch (error) {
        console.error('Error fetching settings:', error);
        res.status(500).json({ error: 'Failed to fetch settings' });
    }
};

// PUT /api/settings - Update system settings
export const updateSettings = async (req, res) => {
    try {
        const settings = await Settings.getSettings();
        Object.assign(settings, req.body);
        await settings.save();

        res.json({
            message: 'Settings updated successfully',
            settings
        });
    } catch (error) {
        console.error('Error updating settings:', error);
        res.status(500).json({ error: 'Failed to update settings' });
    }
}; 