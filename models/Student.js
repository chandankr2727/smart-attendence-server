import mongoose from 'mongoose';
import geolib from 'geolib';

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

// Method to check if student is within any center's radius
studentSchema.methods.isWithinAnyCenterRadius = function (latitude, longitude, centers) {
    try {
        let closestCenter = null;
        let minDistance = Infinity;
        let isWithinAnyRadius = false;

        for (const center of centers) {
            // Skip inactive centers
            if (!center.isActive) {
                continue;
            }

            const distance = geolib.getDistance(
                { latitude: latitude, longitude: longitude },
                { latitude: center.coordinates.latitude, longitude: center.coordinates.longitude }
            );

            if (distance < minDistance) {
                minDistance = distance;
                closestCenter = center;
            }

            if (distance <= center.radius) {
                isWithinAnyRadius = true;
                // Return the first center found within radius
                return {
                    isWithin: true,
                    distance: distance,
                    center: center
                };
            }
        }

        return {
            isWithin: isWithinAnyRadius,
            distance: minDistance,
            center: closestCenter
        };
    } catch (error) {
        console.error('Error checking center radius:', error);
        return {
            isWithin: false,
            distance: Infinity,
            center: null
        };
    }
};

// Method to get current time slot for a center
studentSchema.methods.getCurrentTimeSlot = function (center, date = new Date()) {
    try {
        if (!center || !center.timeSlots) {
            return {
                slot: 'unknown',
                isWithinHours: false,
                startTime: null,
                endTime: null
            };
        }

        const timeString = date.toTimeString().slice(0, 5); // HH:MM format

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

        return {
            slot: null,
            isWithinHours: false,
            startTime: null,
            endTime: null
        };

    } catch (error) {
        console.error('Error determining time slot:', error);
        return {
            slot: null,
            isWithinHours: false,
            startTime: null,
            endTime: null
        };
    }
};

// Method to check if attendance is late
studentSchema.methods.isAttendanceLate = function (center, date = new Date(), lateThreshold = 15) {
    try {
        if (!center || !center.timeSlots) {
            // Fallback to simple time check if no center provided
            const attendanceTime = date.toTimeString().slice(0, 5); // HH:MM
            return attendanceTime > '09:00'; // Default fallback
        }

        const timeString = date.toTimeString().slice(0, 5); // HH:MM format

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

// Helper method to convert HH:MM time to minutes
studentSchema.methods._timeToMinutes = function (timeString) {
    const [hours, minutes] = timeString.split(':').map(Number);
    return hours * 60 + minutes;
};

export default mongoose.model('Student', studentSchema); 