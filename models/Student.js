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
    assignedCenter: {
        type: String, // Will store center ID or name
        required: false,
        default: null // If null, student can attend at any center
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
studentSchema.index({ 'assignedCenter': 1 });

// Virtual for full name display
studentSchema.virtual('displayName').get(function () {
    return `${this.name} (${this.studentId})`;
});

// Method to check if student is within any center radius
studentSchema.methods.isWithinAnyCenterRadius = function (userLat, userLng, centers) {
    const geolib = require('geolib');

    // If student has assigned center, check only that center
    if (this.assignedCenter) {
        const assignedCenter = centers.find(center =>
            center._id.toString() === this.assignedCenter ||
            center.name === this.assignedCenter
        );

        if (assignedCenter && assignedCenter.isActive) {
            const distance = geolib.getDistance(
                { latitude: userLat, longitude: userLng },
                {
                    latitude: assignedCenter.coordinates.latitude,
                    longitude: assignedCenter.coordinates.longitude
                }
            );
            return {
                isWithin: distance <= assignedCenter.radius,
                distance,
                center: assignedCenter
            };
        }
    }

    // Check all active centers and return the closest one within radius
    let closestValidCenter = null;
    let minDistance = Infinity;

    for (const center of centers) {
        if (!center.isActive) continue;

        const distance = geolib.getDistance(
            { latitude: userLat, longitude: userLng },
            {
                latitude: center.coordinates.latitude,
                longitude: center.coordinates.longitude
            }
        );

        if (distance <= center.radius && distance < minDistance) {
            minDistance = distance;
            closestValidCenter = center;
        }
    }

    return {
        isWithin: !!closestValidCenter,
        distance: closestValidCenter ? minDistance : Infinity,
        center: closestValidCenter
    };
};

export default mongoose.model('Student', studentSchema); 