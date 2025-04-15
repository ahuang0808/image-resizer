const sharp = require("sharp");
const path = require("path");
const fs = require("fs");

class ImageResizer {
    constructor(targetSizeMB = 1) {
        this.targetSizeBytes = targetSizeMB * 1024 * 1024;
        this.supportedExts = [".jpg", ".jpeg", ".png", ".tif", ".webp"];
    }

    collectValidImagePaths(inputPaths) {
        const allPaths = [];

        const walk = (paths) => {
            for (const inputPath of paths) {
                const stat = fs.statSync(inputPath);
                if (stat.isDirectory()) {
                    const nested = fs.readdirSync(inputPath).map(f => path.join(inputPath, f));
                    walk(nested);
                } else if (this.supportedExts.includes(path.extname(inputPath).toLowerCase())) {
                    allPaths.push(inputPath);
                }
            }
        };

        walk(inputPaths);
        return allPaths;
    }

    async processBatch(inputPaths, outputDir) {
        const results = [];

        for (const inputPath of inputPaths) {
            const stat = fs.statSync(inputPath);
            if (stat.isDirectory()) {
                const nestedFiles = fs.readdirSync(inputPath).map(f => path.join(inputPath, f));
                const nestedResults = await this.processBatch(nestedFiles, outputDir);
                results.push(...nestedResults);
            } else if (this.supportedExts.includes(path.extname(inputPath).toLowerCase())) {
                const output = await this._processSingle(inputPath, outputDir);
                results.push(output);
            }
        }

        return results;
    }

    async _processSingle(inputPath, outputDir) {
        const ext = path.extname(inputPath).toLowerCase();
        const base = path.basename(inputPath, ext);
        const isJPG = ext === ".jpg" || ext === ".jpeg";

        const imageBuffer = fs.readFileSync(inputPath);
        const originalSize = imageBuffer.length;

        const outputPath = path.join(outputDir, `${base}_compressed.jpg`);

        if (isJPG && originalSize <= this.targetSizeBytes) {
            fs.copyFileSync(inputPath, outputPath);
            return outputPath;
        }

        let quality = 100;
        let compressed = await sharp(imageBuffer).jpeg({ quality }).toBuffer();

        while (compressed.length > this.targetSizeBytes && quality > 10) {
            quality -= 5;
            compressed = await sharp(imageBuffer).jpeg({ quality }).toBuffer();
        }

        fs.writeFileSync(outputPath, compressed);
        return outputPath;
    }
}

module.exports = ImageResizer;