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

// GET /api/settings/centers - Get all centers
export const getCenters = async (req, res) => {
    try {
        const settings = await Settings.getSettings();
        res.json(settings.centers);
    } catch (error) {
        console.error('Error fetching centers:', error);
        res.status(500).json({ error: 'Failed to fetch centers' });
    }
};

// POST /api/settings/centers - Add new center
export const addCenter = async (req, res) => {
    try {
        const { name, address, coordinates, radius, contactInfo } = req.body;

        // Validation
        if (!name || !address || !coordinates || !coordinates.latitude || !coordinates.longitude) {
            return res.status(400).json({
                error: 'Name, address, and coordinates (latitude, longitude) are required'
            });
        }

        if (coordinates.latitude < -90 || coordinates.latitude > 90) {
            return res.status(400).json({ error: 'Invalid latitude. Must be between -90 and 90' });
        }

        if (coordinates.longitude < -180 || coordinates.longitude > 180) {
            return res.status(400).json({ error: 'Invalid longitude. Must be between -180 and 180' });
        }

        const centerData = {
            name: name.trim(),
            address: address.trim(),
            coordinates: {
                latitude: parseFloat(coordinates.latitude),
                longitude: parseFloat(coordinates.longitude)
            },
            radius: radius ? parseInt(radius) : 2000, // Default 2km
            isActive: true,
            contactInfo: contactInfo || {}
        };

        const settings = await Settings.getSettings();
        await settings.addCenter(centerData);

        res.status(201).json({
            message: 'Center added successfully',
            center: settings.centers[settings.centers.length - 1]
        });
    } catch (error) {
        console.error('Error adding center:', error);
        res.status(500).json({ error: 'Failed to add center' });
    }
};

// PUT /api/settings/centers/:id - Update center
export const updateCenter = async (req, res) => {
    try {
        const { id } = req.params;
        const updateData = req.body;

        // Validate coordinates if provided
        if (updateData.coordinates) {
            if (updateData.coordinates.latitude < -90 || updateData.coordinates.latitude > 90) {
                return res.status(400).json({ error: 'Invalid latitude. Must be between -90 and 90' });
            }
            if (updateData.coordinates.longitude < -180 || updateData.coordinates.longitude > 180) {
                return res.status(400).json({ error: 'Invalid longitude. Must be between -180 and 180' });
            }
        }

        const settings = await Settings.getSettings();
        await settings.updateCenter(id, updateData);

        res.json({
            message: 'Center updated successfully',
            center: settings.centers.id(id)
        });
    } catch (error) {
        console.error('Error updating center:', error);
        if (error.message === 'Center not found') {
            res.status(404).json({ error: 'Center not found' });
        } else {
            res.status(500).json({ error: 'Failed to update center' });
        }
    }
};

// DELETE /api/settings/centers/:id - Remove center
export const removeCenter = async (req, res) => {
    try {
        const { id } = req.params;

        const settings = await Settings.getSettings();
        const center = settings.centers.id(id);

        if (!center) {
            return res.status(404).json({ error: 'Center not found' });
        }

        await settings.removeCenter(id);

        res.json({
            message: 'Center removed successfully'
        });
    } catch (error) {
        console.error('Error removing center:', error);
        res.status(500).json({ error: 'Failed to remove center' });
    }
};

// GET /api/settings/centers/:id - Get specific center
export const getCenter = async (req, res) => {
    try {
        const { id } = req.params;

        const settings = await Settings.getSettings();
        const center = settings.centers.id(id);

        if (!center) {
            return res.status(404).json({ error: 'Center not found' });
        }

        res.json(center);
    } catch (error) {
        console.error('Error fetching center:', error);
        res.status(500).json({ error: 'Failed to fetch center' });
    }
}; 