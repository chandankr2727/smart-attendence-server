import mongoose from 'mongoose';

const attendanceSchema = new mongoose.Schema({
    student: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Student',
        required: true
    },
    date: {
        type: Date,
        required: true,
        default: Date.now
    },
    status: {
        type: String,
        enum: ['present', 'absent', 'late', 'pending_verification'],
        default: 'pending_verification'
    },
    whatsappMessage: {
        messageId: {
            type: String,
            required: true
        },
        from: {
            type: String,
            required: true
        },
        timestamp: {
            type: Date,
            required: true
        },
        messageType: {
            type: String,
            enum: ['text', 'image', 'document'],
            required: true
        },
        content: {
            text: String,
            mediaUrl: String,
            caption: String
        }
    },
    location: {
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
        accuracy: {
            type: Number,
            default: null
        },
        address: {
            type: String,
            default: null
        },
        isWithinRadius: {
            type: Boolean,
            required: true
        },
        distanceFromCenter: {
            type: Number, // in meters
            required: true
        }
    },
    verification: {
        isVerified: {
            type: Boolean,
            default: false
        },
        verifiedBy: {
            type: String,
            default: 'system'
        },
        verifiedAt: {
            type: Date,
            default: null
        },
        verificationMethod: {
            type: String,
            enum: ['auto_geo', 'manual_admin', 'image_recognition'],
            default: 'auto_geo'
        },
        notes: {
            type: String,
            default: null
        }
    },
    images: [{
        url: {
            type: String,
            required: true
        },
        uploadedAt: {
            type: Date,
            default: Date.now
        },
        metadata: {
            originalName: String,
            size: Number,
            mimeType: String
        }
    }],
    timeSlot: {
        expected: {
            start: String, // HH:MM format
            end: String    // HH:MM format
        },
        actual: {
            checkedIn: Date,
            checkedOut: Date
        }
    },
    session: {
        type: String,
        enum: ['morning', 'afternoon', 'evening', 'full_day'],
        default: 'full_day'
    },
    metadata: {
        deviceInfo: {
            userAgent: String,
            platform: String,
            browser: String
        },
        ipAddress: String,
        processingTime: Number, // milliseconds
        webhookReceived: Date,
        processed: Date
    }
}, {
    timestamps: true
});

// Compound indexes for better performance
attendanceSchema.index({ student: 1, date: 1 }, { unique: true });
attendanceSchema.index({ date: 1, status: 1 });
attendanceSchema.index({ 'whatsappMessage.from': 1 });
attendanceSchema.index({ 'whatsappMessage.messageId': 1 });
attendanceSchema.index({ status: 1, 'verification.isVerified': 1 });

// Virtual for formatted date
attendanceSchema.virtual('formattedDate').get(function () {
    return this.date.toLocaleDateString('en-IN');
});

// Virtual for formatted time
attendanceSchema.virtual('formattedTime').get(function () {
    return this.date.toLocaleTimeString('en-IN');
});

// Method to calculate if attendance is late
attendanceSchema.methods.isLate = function (expectedStartTime = '09:00') {
    const attendanceTime = this.date.toTimeString().slice(0, 5); // HH:MM
    return attendanceTime > expectedStartTime;
};

// Static method to get attendance summary for a date range
attendanceSchema.statics.getAttendanceSummary = async function (startDate, endDate) {
    return await this.aggregate([
        {
            $match: {
                date: {
                    $gte: new Date(startDate),
                    $lte: new Date(endDate)
                }
            }
        },
        {
            $group: {
                _id: '$status',
                count: { $sum: 1 }
            }
        }
    ]);
};

// Pre-save middleware to auto-verify based on location
attendanceSchema.pre('save', function (next) {
    if (this.location.isWithinRadius && !this.verification.isVerified) {
        this.verification.isVerified = true;
        this.verification.verifiedAt = new Date();
        this.verification.verificationMethod = 'auto_geo';
        this.status = this.isLate() ? 'late' : 'present';
    }
    next();
});

export default mongoose.model('Attendance', attendanceSchema); 