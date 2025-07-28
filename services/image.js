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
            // Extract EXIF data including GPS coordinates
            const exifData = await exifr.parse(imagePath, {
                gps: true,
                pick: ['GPS', 'DateTime', 'DateTimeOriginal', 'Make', 'Model', 'Software']
            });

            const metadata = {
                hasGPS: false,
                location: null,
                timestamp: null,
                camera: null
            };

            // Check for GPS data
            if (exifData && exifData.latitude && exifData.longitude) {
                metadata.hasGPS = true;
                metadata.location = {
                    latitude: exifData.latitude,
                    longitude: exifData.longitude,
                    altitude: exifData.altitude || null
                };
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
            // Create temporary file from base64 data
            const tempDir = path.join(__dirname, '../temp');
            if (!fs.existsSync(tempDir)) {
                fs.mkdirSync(tempDir, { recursive: true });
            }

            const tempFilename = `temp-${Date.now()}.jpg`;
            const tempFilepath = path.join(tempDir, tempFilename);

            // Remove data URL prefix if present and save to temp file
            const base64String = base64Data.replace(/^data:image\/[a-z]+;base64,/, '');
            const buffer = Buffer.from(base64String, 'base64');
            fs.writeFileSync(tempFilepath, buffer);

            // Extract metadata
            const metadata = await this.extractImageMetadata(tempFilepath);

            // Clean up temp file
            fs.unlinkSync(tempFilepath);
            console.log("metadata", metadata);

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