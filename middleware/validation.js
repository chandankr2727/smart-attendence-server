import Joi from 'joi';

// Student validation schema
const studentSchema = Joi.object({
    name: Joi.string().trim().min(2).max(100).required(),
    email: Joi.string().email().lowercase().required(),
    phone: Joi.string().pattern(/^\+?[1-9]\d{1,14}$/).required(),
    studentId: Joi.string().trim().min(1).max(50).required(),
    course: Joi.string().trim().min(2).max(100).required(),
    batch: Joi.string().trim().min(1).max(50).required(),
    trainingCenter: Joi.object({
        name: Joi.string().trim().min(2).max(100).required(),
        address: Joi.string().trim().min(5).max(500).required(),
        coordinates: Joi.object({
            latitude: Joi.number().min(-90).max(90).required(),
            longitude: Joi.number().min(-180).max(180).required()
        }).required(),
        radius: Joi.number().min(10).max(1000).default(100)
    }).required(),
    profileImage: Joi.string().optional(),
    isActive: Joi.boolean().default(true),
    whatsappVerified: Joi.boolean().default(false),
    metadata: Joi.object({
        importedFrom: Joi.string().valid('manual', 'google_sheets', 'csv').default('manual'),
        importedAt: Joi.date().default(Date.now),
        importedBy: Joi.string().default('system')
    }).optional()
});

// Student update schema (all fields optional)
const studentUpdateSchema = Joi.object({
    name: Joi.string().trim().min(2).max(100).optional(),
    email: Joi.string().email().lowercase().optional(),
    phone: Joi.string().pattern(/^\+?[1-9]\d{1,14}$/).optional(),
    studentId: Joi.string().trim().min(1).max(50).optional(),
    course: Joi.string().trim().min(2).max(100).optional(),
    batch: Joi.string().trim().min(1).max(50).optional(),
    trainingCenter: Joi.object({
        name: Joi.string().trim().min(2).max(100).optional(),
        address: Joi.string().trim().min(5).max(500).optional(),
        coordinates: Joi.object({
            latitude: Joi.number().min(-90).max(90).optional(),
            longitude: Joi.number().min(-180).max(180).optional()
        }).optional(),
        radius: Joi.number().min(10).max(1000).optional()
    }).optional(),
    profileImage: Joi.string().optional(),
    isActive: Joi.boolean().optional(),
    whatsappVerified: Joi.boolean().optional()
});

// Validation middleware
export const validateStudent = (req, res, next) => {
    const { error, value } = studentSchema.validate(req.body, {
        abortEarly: false,
        allowUnknown: true
    });

    if (error) {
        const errors = error.details.map(detail => ({
            field: detail.path.join('.'),
            message: detail.message
        }));

        return res.status(400).json({
            error: 'Validation failed',
            details: errors
        });
    }

    req.body = value;
    next();
};

export const validateStudentUpdate = (req, res, next) => {
    const { error, value } = studentUpdateSchema.validate(req.body, {
        abortEarly: false,
        allowUnknown: true
    });

    if (error) {
        const errors = error.details.map(detail => ({
            field: detail.path.join('.'),
            message: detail.message
        }));

        return res.status(400).json({
            error: 'Validation failed',
            details: errors
        });
    }

    req.body = value;
    next();
}; 