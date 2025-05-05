const sharp = require("sharp");
const path = require("path");
const fs = require("fs");
const { getFormattedTimestamp } = require("./utils");
const {
  SUPPORTED_IMAGE_EXTENSIONS,
  DEFAULT_TARGET_MB,
  DEBUG
} = require("./config");

class ImageCompressor {
  constructor(targetSizeMB = DEFAULT_TARGET_MB) {
    this.targetSizeBytes = targetSizeMB * 1024 * 1024;
  }

  /**
   * Conditional logger for debug mode
   * @param {string} message
   */
  log(message) {
    if (DEBUG) {
      console.log(`[ImageCompressor] ${message}`);
    }
  }

  /**
   * Recursively collect all valid image paths
   * @param {string[]} inputPaths
   * @returns {Promise<string[]>}
   */
  async collectValidImagePaths(inputPaths) {
    const allPaths = [];

    const walk = async (paths) => {
      for (const inputPath of paths) {
        try {
          const stat = await fs.promises.stat(inputPath);
          if (stat.isDirectory()) {
            const nested = await fs.promises.readdir(inputPath);
            const fullPaths = nested.map((f) => path.join(inputPath, f));
            await walk(fullPaths);
          } else if (SUPPORTED_IMAGE_EXTENSIONS.includes(path.extname(inputPath).toLowerCase())) {
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

  /**
   * Compress a batch of images
   * @param {string[]} inputPaths
   * @param {string} outputDir
   * @returns {Promise<string[]>} list of output image paths
   */
  async processBatch(inputPaths, outputDir) {
    const results = [];

    for (const inputPath of inputPaths) {
      try {
        const stat = await fs.promises.stat(inputPath);
        if (stat.isDirectory()) {
          const nested = await fs.promises.readdir(inputPath);
          const fullPaths = nested.map((f) => path.join(inputPath, f));
          const nestedResults = await this.processBatch(fullPaths, outputDir);
          results.push(...nestedResults);
        } else if (SUPPORTED_IMAGE_EXTENSIONS.includes(path.extname(inputPath).toLowerCase())) {
          const output = await this.processSingleImage(inputPath, outputDir);
          if (output) results.push(output);
        }
      } catch (err) {
        this.log(`Error processing ${inputPath}: ${err.message}`);
      }
    }

    return results;
  }

  /**
   * Compress or convert a single image
   * @param {string} inputPath
   * @param {string} outputDir
   * @returns {Promise<string | null>}
   */
  async processSingleImage(inputPath, outputDir) {
    try {
      const ext = path.extname(inputPath);
      let base = path.basename(inputPath, ext);
      base = base.replace(/_(compressed|converted|cropped)$/, "");

      const isJPG = [".jpg", ".jpeg"].includes(ext.toLowerCase());
      const imageBuffer = await fs.promises.readFile(inputPath);
      const originalSize = imageBuffer.length;

      const timestamp = getFormattedTimestamp();
      const outputPath = path.join(outputDir, `${base}_${timestamp}_compressed.jpg`);

      this.log(`Processing: ${inputPath}`);

      if (isJPG && (this.targetSizeBytes === 0 || originalSize <= this.targetSizeBytes)) {
        await fs.promises.copyFile(inputPath, outputPath);
        return outputPath;
      }

      // No compression required, just convert to JPG with max quality
      if (this.targetSizeBytes === 0) {
        const converted = await this.compressToJPG(imageBuffer, 100);
        await fs.promises.writeFile(outputPath, converted);
        return outputPath;
      }

      // Iteratively compress to target size
      let quality = 100;
      let compressed = await this.compressToJPG(imageBuffer, quality);

      while (compressed.length > this.targetSizeBytes && quality > 10) {
        quality -= 5;
        compressed = await this.compressToJPG(imageBuffer, quality);
      }

      await fs.promises.writeFile(outputPath, compressed);
      return outputPath;
    } catch (error) {
      this.log(`Failed to compress ${inputPath}: ${error.message}`);
      return null;
    }
  }

  /**
   * Compress JPEG with given quality, auto-rotate to match EXIF
   * @param {Buffer} buffer
   * @param {number} quality
   * @returns {Promise<Buffer>}
   */
  async compressToJPG(buffer, quality) {
    return sharp(buffer)
      .rotate() // ✅ Fix orientation using EXIF
      .jpeg({ quality })
      .toBuffer();
  }
}

module.exports = ImageCompressor;