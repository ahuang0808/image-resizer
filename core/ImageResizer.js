const sharp = require("sharp");
const path = require("path");
const fs = require("fs");
const { getFormattedTimestamp } = require("./utils");

class ImageResizer {
    constructor(targetSizeMB = 1) {
        this.targetSizeBytes = targetSizeMB * 1024 * 1024;
        this.supportedExts = [".jpg", ".jpeg", ".png", ".tif", ".webp"];
    }

    // Log utility (only in development)
    log(message) {
        if (process.env.NODE_ENV !== "production") {
            console.log(`[ImageResizer] ${message}`);
        }
    }

    // Get all valid image paths from files or folders (recursive)
    async collectValidImagePaths(inputPaths) {
        const allPaths = [];

        const walk = async (paths) => {
            for (const inputPath of paths) {
                try {
                    const stat = await fs.promises.stat(inputPath);
                    if (stat.isDirectory()) {
                        const nested = await fs.promises.readdir(inputPath);
                        const fullPaths = nested.map(f => path.join(inputPath, f));
                        await walk(fullPaths);
                    } else if (this.supportedExts.includes(path.extname(inputPath).toLowerCase())) {
                        allPaths.push(inputPath);
                    }
                } catch (err) {
                    this.log(`Error accessing ${inputPath}: ${err.message}`);
                }
            }
        };

        await walk(inputPaths);
        return allPaths;
    }

    // Process multiple images
    async processBatch(inputPaths, outputDir) {
        const results = [];

        for (const inputPath of inputPaths) {
            try {
                const stat = await fs.promises.stat(inputPath);
                if (stat.isDirectory()) {
                    const nestedFiles = await fs.promises.readdir(inputPath);
                    const fullPaths = nestedFiles.map(f => path.join(inputPath, f));
                    const nestedResults = await this.processBatch(fullPaths, outputDir);
                    results.push(...nestedResults);
                } else if (this.supportedExts.includes(path.extname(inputPath).toLowerCase())) {
                    const output = await this.processSingle(inputPath, outputDir);
                    if (output) results.push(output);
                }
            } catch (err) {
                this.log(`Error processing ${inputPath}: ${err.message}`);
            }
        }

        return results;
    }

    // Process a single image
    async processSingle(inputPath, outputDir) {
        const ext = path.extname(inputPath).toLowerCase();
        const base = path.basename(inputPath, ext);
        const isJPG = ext === ".jpg" || ext === ".jpeg";

        const imageBuffer = await fs.promises.readFile(inputPath);
        const originalSize = imageBuffer.length;

        const formatted = getFormattedTimestamp();
        const outputPath = path.join(outputDir, `${base}_${formatted}.jpg`);

        this.log(`Processing: ${inputPath}`);

        // If already JPG and smaller than target size, copy directly
        if (isJPG && (this.targetSizeBytes === 0 || originalSize <= this.targetSizeBytes)) {
            await fs.promises.copyFile(inputPath, outputPath);
            return outputPath;
        }

        // No compression requested: just convert to JPG with high quality
        if (this.targetSizeBytes === 0) {
            const converted = await this.compressToJPG(imageBuffer, 100);
            await fs.promises.writeFile(outputPath, converted);
            return outputPath;
        }

        // Try compressing with decreasing quality
        let quality = 100;
        let compressed = await this.compressToJPG(imageBuffer, quality);

        while (compressed.length > this.targetSizeBytes && quality > 10) {
            quality -= 5;
            compressed = await this.compressToJPG(imageBuffer, quality);
        }

        await fs.promises.writeFile(outputPath, compressed);
        return outputPath;
    }

    // Compress buffer to JPEG with specified quality
    async compressToJPG(buffer, quality) {
        return await sharp(buffer).jpeg({ quality }).toBuffer();
    }
}

module.exports = ImageResizer;