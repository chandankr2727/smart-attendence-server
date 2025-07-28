import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import sharp from 'sharp';

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