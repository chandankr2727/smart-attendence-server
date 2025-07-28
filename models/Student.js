import mongoose from 'mongoose';

const studentSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        trim: true
    },
    email: {
        type: String,
        required: true,
        unique: true,
        lowercase: true,
        trim: true
    },
    phone: {
        type: String,
        required: true,
        unique: true,
        trim: true
    },
    studentId: {
        type: String,
        required: true,
        unique: true,
        trim: true
    },
    course: {
        type: String,
        required: true,
        trim: true
    },
    batch: {
        type: String,
        required: true,
        trim: true
    },
    trainingCenter: {
        name: {
            type: String,
            required: true
        },
        address: {
            type: String,
            required: true
        },
        coordinates: {
            latitude: {
                type: Number,
                required: true
            },
            longitude: {
                type: Number,
                required: true
            }
        },
        radius: {
            type: Number,
            default: 100 // meters
        }
    },
    profileImage: {
        type: String,
        default: null
    },
    isActive: {
        type: Boolean,
        default: true
    },
    whatsappVerified: {
        type: Boolean,
        default: false
    },
    lastSeen: {
        type: Date,
        default: null
    },
    metadata: {
        importedFrom: {
            type: String,
            enum: ['manual', 'google_sheets', 'csv'],
            default: 'manual'
        },
        importedAt: {
            type: Date,
            default: Date.now
        },
        importedBy: {
            type: String,
            default: 'system'
        }
    }
}, {
    timestamps: true
});

// Indexes for better performance
studentSchema.index({ phone: 1 });
studentSchema.index({ studentId: 1 });
studentSchema.index({ email: 1 });
studentSchema.index({ course: 1, batch: 1 });
studentSchema.index({ 'trainingCenter.name': 1 });

// Virtual for full name display
studentSchema.virtual('displayName').get(function () {
    return `${this.name} (${this.studentId})`;
});

// Method to check if student is within training center radius
studentSchema.methods.isWithinTrainingCenter = function (userLat, userLng) {
    const geolib = require('geolib');
    const distance = geolib.getDistance(
        { latitude: userLat, longitude: userLng },
        {
            latitude: this.trainingCenter.coordinates.latitude,
            longitude: this.trainingCenter.coordinates.longitude
        }
    );
    return distance <= this.trainingCenter.radius;
};

export default mongoose.model('Student', studentSchema); 