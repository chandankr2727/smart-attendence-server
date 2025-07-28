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
            enum: ['text', 'image', 'document', 'location'],
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
        },
        verifiedCenter: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Center',
            default: null
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
attendanceSchema.methods.isLate = function (center = null, lateThreshold = 15) {
    try {
        if (!center || !center.timeSlots) {
            // Fallback to simple time check if no center provided
            const attendanceTime = this.date.toTimeString().slice(0, 5); // HH:MM
            return attendanceTime > '09:00'; // Default fallback
        }

        const attendanceTime = this.date;
        const timeString = attendanceTime.toTimeString().slice(0, 5); // HH:MM format

        // Find which time slot this attendance falls into
        for (const [slotName, times] of Object.entries(center.timeSlots)) {
            if (times && times.start && times.end) {
                if (timeString >= times.start && timeString <= times.end) {
                    // Within this time slot - check if late based on start time + threshold
                    const attendanceMinutes = this._timeToMinutes(timeString);
                    const slotStartMinutes = this._timeToMinutes(times.start);
                    const thresholdMinutes = slotStartMinutes + lateThreshold;

                    return attendanceMinutes > thresholdMinutes;
                }
            }
        }

        // If outside all time slots, consider it late
        return true;

    } catch (error) {
        console.error('Error checking if attendance is late:', error);
        return false;
    }
};

// Method to determine which time slot this attendance belongs to
attendanceSchema.methods.getTimeSlot = function (center = null) {
    try {
        if (!center || !center.timeSlots) {
            return { slot: 'unknown', isWithinHours: false };
        }

        const timeString = this.date.toTimeString().slice(0, 5); // HH:MM format

        // Check each time slot
        for (const [slotName, times] of Object.entries(center.timeSlots)) {
            if (times && times.start && times.end) {
                if (timeString >= times.start && timeString <= times.end) {
                    return {
                        slot: slotName,
                        isWithinHours: true,
                        startTime: times.start,
                        endTime: times.end
                    };
                }
            }
        }

        return { slot: null, isWithinHours: false };

    } catch (error) {
        console.error('Error determining time slot:', error);
        return { slot: null, isWithinHours: false };
    }
};

// Helper method to convert HH:MM time to minutes
attendanceSchema.methods._timeToMinutes = function (timeString) {
    const [hours, minutes] = timeString.split(':').map(Number);
    return hours * 60 + minutes;
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

// Pre-save middleware to auto-verify based on location and update time slot info
attendanceSchema.pre('save', async function (next) {
    try {
        if (this.location.isWithinRadius && !this.verification.isVerified) {
            this.verification.isVerified = true;
            this.verification.verifiedAt = new Date();
            this.verification.verificationMethod = 'auto_geo';

            // If we have center information, use center-specific time checking
            if (this.location.verifiedCenter) {
                const Settings = (await import('./Settings.js')).default;
                const settings = await Settings.getSettings();
                const center = settings.centers.find(c =>
                    c._id.toString() === this.location.verifiedCenter.id.toString()
                );

                if (center) {
                    const timeSlotInfo = this.getTimeSlot(center);
                    this.session = timeSlotInfo.slot || 'unknown';
                    this.timeSlot = {
                        expected: {
                            start: timeSlotInfo.startTime || null,
                            end: timeSlotInfo.endTime || null
                        }
                    };

                    // Get late threshold from settings
                    const lateThreshold = settings.attendanceSettings.lateThreshold || 15;
                    this.status = this.isLate(center, lateThreshold) ? 'late' : 'present';
                }
            } else {
                // Fallback to old logic
                this.status = this.isLate() ? 'late' : 'present';
            }
        }
        next();
    } catch (error) {
        console.error('Error in pre-save middleware:', error);
        next();
    }
});

export default mongoose.model('Attendance', attendanceSchema); 