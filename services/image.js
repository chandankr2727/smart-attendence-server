import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import sharp from 'sharp';
import exifr from 'exifr';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const imageService = {
    async downloadAndSaveImage(imageUrl, studentId) {
        try {
            const response = await axios({
                method: 'GET',
                url: imageUrl,
                responseType: 'stream'
            });

            const uploadsDir = path.join(__dirname, '../uploads/attendance');
            if (!fs.existsSync(uploadsDir)) {
                fs.mkdirSync(uploadsDir, { recursive: true });
            }

            const filename = `${studentId}-${Date.now()}.jpg`;
            const filepath = path.join(uploadsDir, filename);

            const writer = fs.createWriteStream(filepath);
            response.data.pipe(writer);

            return new Promise((resolve, reject) => {
                writer.on('finish', () => {
                    resolve(`/uploads/attendance/${filename}`);
                });
                writer.on('error', reject);
            });
        } catch (error) {
            console.error('Error downloading image:', error);
            throw error;
        }
    },

    async saveImageFromBase64(base64Data, studentId, mimeType = 'image/jpeg') {
        try {
            // Remove data URL prefix if present
            const base64String = base64Data.replace(/^data:image\/[a-z]+;base64,/, '');

            const uploadsDir = path.join(__dirname, '../uploads/attendance');
            if (!fs.existsSync(uploadsDir)) {
                fs.mkdirSync(uploadsDir, { recursive: true });
            }

            // Determine file extension from mime type
            const extension = mimeType.split('/')[1] || 'jpg';
            const filename = `${studentId}-${Date.now()}.${extension}`;
            const filepath = path.join(uploadsDir, filename);

            // Convert base64 to buffer and save
            const buffer = Buffer.from(base64String, 'base64');
            fs.writeFileSync(filepath, buffer);

            return `/uploads/attendance/${filename}`;
        } catch (error) {
            console.error('Error saving image from base64:', error);
            throw error;
        }
    },

    async saveImageFromDataUrl(dataUrl, studentId) {
        try {
            // Extract mime type and base64 data from data URL
            const matches = dataUrl.match(/^data:([a-zA-Z0-9]+\/[a-zA-Z0-9-.+]+);base64,(.+)$/);
            if (!matches) {
                throw new Error('Invalid data URL format');
            }

            const mimeType = matches[1];
            const base64Data = matches[2];

            const uploadsDir = path.join(__dirname, '../uploads/attendance');
            if (!fs.existsSync(uploadsDir)) {
                fs.mkdirSync(uploadsDir, { recursive: true });
            }

            // Determine file extension from mime type
            const extension = mimeType.split('/')[1] || 'jpg';
            const filename = `${studentId}-${Date.now()}.${extension}`;
            const filepath = path.join(uploadsDir, filename);

            // Convert base64 to buffer and save
            const buffer = Buffer.from(base64Data, 'base64');
            fs.writeFileSync(filepath, buffer);

            return `/uploads/attendance/${filename}`;
        } catch (error) {
            console.error('Error saving image from data URL:', error);
            throw error;
        }
    },

    async extractImageMetadata(imagePath) {
        try {
            console.log('Extracting EXIF data from image path:', imagePath);

            // Extract all EXIF data first (without filtering)
            const allExifData = await exifr.parse(imagePath, {
                gps: true
            }).catch(() => null);

            // Extract specific EXIF data with filtering  
            const exifData = await exifr.parse(imagePath, {
                gps: true,
                pick: ['GPS', 'DateTime', 'DateTimeOriginal', 'Make', 'Model', 'Software',
                    'GPSLatitude', 'GPSLongitude', 'GPSLatitudeRef', 'GPSLongitudeRef',
                    'GPSDateTime', 'GPSTimeStamp', 'GPSDateStamp']
            }).catch(() => null);

            // Also try to get all GPS-related data without filtering
            const gpsData = await exifr.gps(imagePath).catch(() => null);

            console.log('All EXIF data extracted:', JSON.stringify(allExifData, null, 2));
            console.log('Filtered EXIF data extracted:', JSON.stringify(exifData, null, 2));
            console.log('GPS data extracted:', JSON.stringify(gpsData, null, 2));

            const metadata = {
                hasGPS: false,
                location: null,
                timestamp: null,
                camera: null
            };

            // Check for GPS data - try multiple sources
            let latitude = null;
            let longitude = null;

            // Method 1: From dedicated GPS data extraction
            if (gpsData && gpsData.latitude && gpsData.longitude) {
                latitude = gpsData.latitude;
                longitude = gpsData.longitude;
                console.log('GPS found in gpsData (method 1):', { latitude, longitude });
            }
            // Method 2: Direct from allExifData
            else if (allExifData && allExifData.latitude && allExifData.longitude) {
                latitude = allExifData.latitude;
                longitude = allExifData.longitude;
                console.log('GPS found in allExifData (method 2):', { latitude, longitude });
            }
            // Method 3: Direct from exifData
            else if (exifData && exifData.latitude && exifData.longitude) {
                latitude = exifData.latitude;
                longitude = exifData.longitude;
                console.log('GPS found in exifData (method 3):', { latitude, longitude });
            }
            // Method 4: From GPSLatitude/GPSLongitude fields in allExifData
            else if (allExifData && allExifData.GPSLatitude && allExifData.GPSLongitude) {
                latitude = allExifData.GPSLatitude;
                longitude = allExifData.GPSLongitude;

                // Handle reference directions
                if (allExifData.GPSLatitudeRef === 'S' || allExifData.GPSLatitudeRef === 'South') {
                    latitude = -latitude;
                }
                if (allExifData.GPSLongitudeRef === 'W' || allExifData.GPSLongitudeRef === 'West') {
                    longitude = -longitude;
                }
                console.log('GPS found in allExifData GPSLatitude/GPSLongitude (method 4):', { latitude, longitude });
            }
            // Method 5: From GPSLatitude/GPSLongitude fields in exifData
            else if (exifData && exifData.GPSLatitude && exifData.GPSLongitude) {
                latitude = exifData.GPSLatitude;
                longitude = exifData.GPSLongitude;

                // Handle reference directions
                if (exifData.GPSLatitudeRef === 'S' || exifData.GPSLatitudeRef === 'South') {
                    latitude = -latitude;
                }
                if (exifData.GPSLongitudeRef === 'W' || exifData.GPSLongitudeRef === 'West') {
                    longitude = -longitude;
                }
                console.log('GPS found in exifData GPSLatitude/GPSLongitude (method 5):', { latitude, longitude });
            }

            if (latitude !== null && longitude !== null) {
                metadata.hasGPS = true;
                metadata.location = {
                    latitude: parseFloat(latitude),
                    longitude: parseFloat(longitude),
                    altitude: gpsData?.altitude || allExifData?.altitude || exifData?.altitude || null
                };
                console.log('Final GPS coordinates:', metadata.location);
            } else {
                console.log('No GPS coordinates found in any format');
            }

            // Extract timestamp
            if (exifData && (exifData.DateTimeOriginal || exifData.DateTime)) {
                metadata.timestamp = exifData.DateTimeOriginal || exifData.DateTime;
            }

            // Extract camera info
            if (exifData && (exifData.Make || exifData.Model)) {
                metadata.camera = {
                    make: exifData.Make || null,
                    model: exifData.Model || null,
                    software: exifData.Software || null
                };
            }
            console.log("metadata", metadata);

            return metadata;
        } catch (error) {
            console.error('Error extracting image metadata:', error);
            return {
                hasGPS: false,
                location: null,
                timestamp: null,
                camera: null
            };
        }
    },

    async extractMetadataFromBase64(base64Data) {
        try {
            console.log('Starting EXIF extraction from base64 data');
            console.log('Base64 data length:', base64Data?.length);

            // Create temporary file from base64 data
            const tempDir = path.join(__dirname, '../temp');
            if (!fs.existsSync(tempDir)) {
                fs.mkdirSync(tempDir, { recursive: true });
            }

            const tempFilename = `temp-${Date.now()}.jpg`;
            const tempFilepath = path.join(tempDir, tempFilename);

            // Remove data URL prefix if present and save to temp file
            const base64String = base64Data.replace(/^data:image\/[a-z]+;base64,/, '');
            console.log('Cleaned base64 string length:', base64String.length);

            const buffer = Buffer.from(base64String, 'base64');
            console.log('Buffer size:', buffer.length, 'bytes');

            fs.writeFileSync(tempFilepath, buffer);
            console.log('Temporary file created:', tempFilepath);

            // Extract metadata
            const metadata = await this.extractImageMetadata(tempFilepath);
            console.log('EXIF extraction completed, result:', {
                hasGPS: metadata.hasGPS,
                hasLocation: !!metadata.location,
                hasTimestamp: !!metadata.timestamp,
                fullMetadata: metadata
            });

            // Clean up temp file
            fs.unlinkSync(tempFilepath);
            console.log('Temporary file cleaned up');

            return metadata;
        } catch (error) {
            console.error('Error extracting metadata from base64:', error);
            return {
                hasGPS: false,
                location: null,
                timestamp: null,
                camera: null
            };
        }
    },

    async processImage(inputPath, outputPath, options = {}) {
        try {
            const { width = 800, height = 600, quality = 80 } = options;

            await sharp(inputPath)
                .resize(width, height, { fit: 'inside', withoutEnlargement: true })
                .jpeg({ quality })
                .toFile(outputPath);

            return outputPath;
        } catch (error) {
            console.error('Error processing image:', error);
            throw error;
        }
    }
}; 