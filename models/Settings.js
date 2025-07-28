import mongoose from 'mongoose';

const settingsSchema = new mongoose.Schema({
    whatsappApi: {
        apiKey: {
            type: String,
            required: false,
            default: ''
        },
        accessToken: {
            type: String,
            required: false,
            default: ''
        },
        webhookUrl: {
            type: String,
            required: false,
            default: ''
        },
        businessId: {
            type: String,
            required: false,
            default: ''
        },
        phoneNumberId: {
            type: String,
            required: false,
            default: ''
        },
        isActive: {
            type: Boolean,
            default: false
        }
    },
    centers: [{
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
            default: 2000 // meters (2km)
        },
        isActive: {
            type: Boolean,
            default: true
        },
        contactInfo: {
            phone: String,
            email: String,
            manager: String
        }
    }],
    attendanceSettings: {
        timeSlots: {
            morning: {
                start: {
                    type: String,
                    default: '09:00'
                },
                end: {
                    type: String,
                    default: '13:00'
                }
            },
            afternoon: {
                start: {
                    type: String,
                    default: '14:00'
                },
                end: {
                    type: String,
                    default: '18:00'
                }
            }
        },
        lateThreshold: {
            type: Number,
            default: 15 // minutes
        },
        autoVerification: {
            enabled: {
                type: Boolean,
                default: true
            },
            requireImage: {
                type: Boolean,
                default: true
            },
            geoVerification: {
                type: Boolean,
                default: true
            }
        },
        notifications: {
            sendConfirmation: {
                type: Boolean,
                default: true
            },
            sendReminders: {
                type: Boolean,
                default: true
            },
            reminderTime: {
                type: String,
                default: '08:30'
            }
        }
    },
    googleSheets: {
        enabled: {
            type: Boolean,
            default: false
        },
        credentials: {
            type: String, // JSON string of service account credentials
            default: null
        },
        spreadsheetId: {
            type: String,
            default: null
        },
        worksheetName: {
            type: String,
            default: 'Students'
        },
        syncInterval: {
            type: Number,
            default: 3600000 // 1 hour in milliseconds
        },
        lastSync: {
            type: Date,
            default: null
        }
    },
    system: {
        timezone: {
            type: String,
            default: 'Asia/Kolkata'
        },
        dateFormat: {
            type: String,
            default: 'DD/MM/YYYY'
        },
        timeFormat: {
            type: String,
            default: '24h'
        },
        language: {
            type: String,
            default: 'en'
        },
        maxFileSize: {
            type: Number,
            default: 5242880 // 5MB in bytes
        },
        allowedFileTypes: {
            type: [String],
            default: ['image/jpeg', 'image/png', 'image/jpg']
        }
    },
    templates: {
        welcomeMessage: {
            type: String,
            default: 'Welcome to Smart Attendance System! Please send your location and a photo to mark your attendance.'
        },
        confirmationMessage: {
            type: String,
            default: 'Your attendance has been marked successfully for {{date}} at {{time}}.'
        },
        rejectionMessage: {
            type: String,
            default: 'Your attendance could not be verified. Please ensure you are at the training center and try again.'
        },
        reminderMessage: {
            type: String,
            default: 'Reminder: Please mark your attendance for today\'s training session.'
        }
    }
}, {
    timestamps: true
});

// Ensure only one settings document exists
settingsSchema.index({}, { unique: true });

// Static method to get or create settings
settingsSchema.statics.getSettings = async function () {
    let settings = await this.findOne();
    if (!settings) {
        settings = await this.create({});
    }
    return settings;
};

// Method to update WhatsApp API settings
settingsSchema.methods.updateWhatsAppSettings = function (newSettings) {
    this.whatsappApi = { ...this.whatsappApi, ...newSettings };
    return this.save();
};

// Method to add center
settingsSchema.methods.addCenter = function (centerData) {
    this.centers.push(centerData);
    return this.save();
};

// Method to update center
settingsSchema.methods.updateCenter = function (centerId, updateData) {
    const center = this.centers.id(centerId);
    if (center) {
        Object.assign(center, updateData);
        return this.save();
    }
    throw new Error('Center not found');
};

// Method to remove center
settingsSchema.methods.removeCenter = function (centerId) {
    this.centers.pull(centerId);
    return this.save();
};

export default mongoose.model('Settings', settingsSchema); 