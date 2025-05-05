const sharp = require("sharp");
const path = require("path");
const fs = require("fs");
const { SUPPORTED_IMAGE_EXTENSIONS, DEBUG } = require("./config");
const { getFormattedTimestamp } = require("./utils");

class ImageConverter {
  constructor(format = "jpg") {
    this.outputFormat = format.toLowerCase(); // 'jpg' | 'png' | 'webp'
  }

  /**
   * Conditional logger for debug mode
   * @param {string} message
   */
  log(message) {
    if (DEBUG) {
      console.log(`[ImageConverter] ${message}`);
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
            const entries = await fs.promises.readdir(inputPath);
            const nestedPaths = entries.map(f => path.join(inputPath, f));
            await walk(nestedPaths);
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
   * Convert a batch of images to the target format
   * @param {string[]} inputPaths
   * @param {string} outputDir
   * @returns {Promise<string[]>}
   */
  async processBatch(inputPaths, outputDir) {
    const results = [];

    for (const inputPath of inputPaths) {
      try {
        const stat = await fs.promises.stat(inputPath);
        if (stat.isDirectory()) {
          const nested = await fs.promises.readdir(inputPath);
          const fullPaths = nested.map(f => path.join(inputPath, f));
          const nestedResults = await this.processBatch(fullPaths, outputDir);
          results.push(...nestedResults);
        } else if (SUPPORTED_IMAGE_EXTENSIONS.includes(path.extname(inputPath).toLowerCase())) {
          const result = await this.convertSingleImage(inputPath, outputDir);
          if (result) results.push(result);
        }
      } catch (err) {
        this.log(`Error reading ${inputPath}: ${err.message}`);
      }
    }

    return results;
  }

  /**
   * Convert a single image to the target format
   * @param {string} inputPath
   * @param {string} outputDir
   * @returns {Promise<string | null>}
   */
  async convertSingleImage(inputPath, outputDir) {
    try {
      const ext = path.extname(inputPath);
      let base = path.basename(inputPath, ext);
      base = base.replace(/_(compressed|converted|cropped)$/, ""); // sanitize

      const timestamp = getFormattedTimestamp();
      const outputPath = path.join(outputDir, `${base}_${timestamp}_converted.${this.outputFormat}`);

      this.log(`Converting: ${inputPath} → ${this.outputFormat}`);

      const imageBuffer = await fs.promises.readFile(inputPath);
      const sharpInstance = sharp(imageBuffer).rotate(); // auto-rotate using EXIF

      let outputBuffer;
      if (this.outputFormat === "png") {
        outputBuffer = await sharpInstance.png({ compressionLevel: 0 }).toBuffer();
      } else if (this.outputFormat === "webp") {
        outputBuffer = await sharpInstance.webp({ quality: 100 }).toBuffer();
      } else {
        outputBuffer = await sharpInstance.jpeg({ quality: 100 }).toBuffer();
      }

      await fs.promises.writeFile(outputPath, outputBuffer);
      return outputPath;
    } catch (error) {
      this.log(`Failed to convert ${inputPath}: ${error.message}`);
      return null;
    }
  }
}

module.exports = ImageConverter;