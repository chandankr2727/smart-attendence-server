import mongoose from 'mongoose';

const studentSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        trim: true
    },
    email: {
        type: String,
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
        unique: true,
        trim: true
    },
    course: {
        type: String,
        trim: true
    },
    batch: {
        type: String,
        trim: true
    },
    isActive: {
        type: Boolean,
        default: true
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

// Virtual for full name display
studentSchema.virtual('displayName').get(function () {
    return `${this.name} (${this.studentId})`;
});

export default mongoose.model('Student', studentSchema); 