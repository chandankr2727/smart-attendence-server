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
    try {
        console.log('🚀 Starting isWithinAnyCenterRadius method');

        // Ensure coordinates are numbers with proper precision
        const userLatitude = parseFloat(parseFloat(userLat).toFixed(6));
        const userLongitude = parseFloat(parseFloat(userLng).toFixed(6));

        console.log('🧮 Calculating distances for user location:', { userLat: userLatitude, userLng: userLongitude });
        console.log('🧮 Original input:', { userLat, userLng });
        console.log('🏢 Checking against', centers.length, 'centers');
        console.log('🔧 Testing geolib availability:', typeof geolib, geolib ? 'available' : 'not available');

        if (!geolib) {
            console.error('❌ Geolib is not available!');
            return { isWithin: false, distance: Infinity, center: null };
        }

        // If student has assigned center, check only that center
        if (this.assignedCenter) {
            console.log('👤 Student has assigned center:', this.assignedCenter);
            const assignedCenter = centers.find(center =>
                center._id.toString() === this.assignedCenter ||
                center.name === this.assignedCenter
            );

            if (assignedCenter && assignedCenter.isActive) {
                const centerLatitude = parseFloat(parseFloat(assignedCenter.coordinates.latitude).toFixed(6));
                const centerLongitude = parseFloat(parseFloat(assignedCenter.coordinates.longitude).toFixed(6));

                let distance;
                try {
                    distance = geolib.getDistance(
                        { latitude: userLatitude, longitude: userLongitude },
                        {
                            latitude: centerLatitude,
                            longitude: centerLongitude
                        }
                    );
                    console.log(`📏 Distance to assigned center "${assignedCenter.name}": ${distance}m (radius: ${assignedCenter.radius}m)`);
                } catch (error) {
                    console.error(`❌ Error calculating distance to assigned center "${assignedCenter.name}":`, error);
                    distance = Infinity;
                }

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
            if (!center.isActive) {
                console.log(`⏸️ Skipping inactive center: ${center.name}`);
                continue;
            }

            const centerLatitude = parseFloat(parseFloat(center.coordinates.latitude).toFixed(6));
            const centerLongitude = parseFloat(parseFloat(center.coordinates.longitude).toFixed(6));

            let distance;
            try {
                distance = geolib.getDistance(
                    { latitude: userLatitude, longitude: userLongitude },
                    {
                        latitude: centerLatitude,
                        longitude: centerLongitude
                    }
                );
                console.log(`📏 Distance to center "${center.name}": ${distance}m (radius: ${center.radius}m) - Within radius: ${distance <= center.radius}`);
                console.log(`📍 User coords: (${userLatitude}, ${userLongitude}) vs Center coords: (${centerLatitude}, ${centerLongitude})`);
            } catch (error) {
                console.error(`❌ Error calculating distance to center "${center.name}":`, error);
                distance = Infinity;
            }

            if (distance <= center.radius && distance < minDistance) {
                minDistance = distance;
                closestValidCenter = center;
                console.log(`✅ New closest valid center: ${center.name} at ${distance}m`);
            }
        }

        const result = {
            isWithin: !!closestValidCenter,
            distance: closestValidCenter ? minDistance : Infinity,
            center: closestValidCenter
        };

        console.log('🏁 Final result:', result);
        return result;

    } catch (error) {
        console.error('❌ Error in isWithinAnyCenterRadius method:', error);
        return { isWithin: false, distance: Infinity, center: null };
    }
};

// Method to determine current time slot based on center's time configuration
studentSchema.methods.getCurrentTimeSlot = function (center, checkTime = new Date()) {
    try {
        if (!center || !center.timeSlots) {
            console.log('⚠️ No center or time slots provided');
            return { slot: null, isWithinHours: false };
        }

        const timeString = checkTime.toTimeString().slice(0, 5); // HH:MM format
        console.log(`🕐 Checking time ${timeString} against center ${center.name} time slots`);

        const timeSlots = center.timeSlots;

        // Check each time slot
        for (const [slotName, times] of Object.entries(timeSlots)) {
            if (times && times.start && times.end) {
                console.log(`⏰ Checking ${slotName} slot: ${times.start} - ${times.end}`);

                if (timeString >= times.start && timeString <= times.end) {
                    console.log(`✅ Time ${timeString} is within ${slotName} slot`);
                    return {
                        slot: slotName,
                        isWithinHours: true,
                        startTime: times.start,
                        endTime: times.end
                    };
                }
            }
        }

        console.log(`❌ Time ${timeString} is outside all operating hours`);
        return { slot: null, isWithinHours: false };

    } catch (error) {
        console.error('❌ Error determining current time slot:', error);
        return { slot: null, isWithinHours: false };
    }
};

// Method to check if attendance is late based on center's time slots and late threshold
studentSchema.methods.isAttendanceLate = function (center, attendanceTime = new Date(), lateThreshold = 15) {
    try {
        if (!center || !center.timeSlots) {
            console.log('⚠️ No center or time slots for late check');
            return false;
        }

        const timeSlotInfo = this.getCurrentTimeSlot(center, attendanceTime);

        if (!timeSlotInfo.isWithinHours) {
            console.log('📅 Attendance outside operating hours - marking as late');
            return true;
        }

        // Calculate if late based on slot start time + threshold
        const attendanceTimeString = attendanceTime.toTimeString().slice(0, 5);
        const slotStartTime = timeSlotInfo.startTime;

        // Convert times to minutes for comparison
        const attendanceMinutes = this._timeToMinutes(attendanceTimeString);
        const slotStartMinutes = this._timeToMinutes(slotStartTime);
        const thresholdMinutes = slotStartMinutes + lateThreshold;

        const isLate = attendanceMinutes > thresholdMinutes;

        console.log(`⏰ Late check: attendance ${attendanceTimeString} vs slot start ${slotStartTime} + ${lateThreshold}min threshold = ${isLate ? 'LATE' : 'ON TIME'}`);

        return isLate;

    } catch (error) {
        console.error('❌ Error checking if attendance is late:', error);
        return false;
    }
};

// Helper method to convert HH:MM time to minutes
studentSchema.methods._timeToMinutes = function (timeString) {
    const [hours, minutes] = timeString.split(':').map(Number);
    return hours * 60 + minutes;
};

export default mongoose.model('Student', studentSchema); 