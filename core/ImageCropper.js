const fs = require("fs");
const path = require("path");
const sharp = require("sharp");
const { SUPPORTED_IMAGE_EXTENSIONS } = require("./config");
const { getFormattedTimestamp } = require("./utils");

class ImageCropper {
  constructor() {}

  /**
   * Recursively collect all valid image paths from a list of input files/folders
   * @param {string[]} inputPaths
   * @returns {string[]}
   */
  collectValidImagePaths(inputPaths) {
    const validPaths = [];

    const walk = (paths) => {
      for (const inputPath of paths) {
        if (!inputPath || typeof inputPath !== "string") continue;
        if (!fs.existsSync(inputPath)) continue;

        const stat = fs.statSync(inputPath);
        if (stat.isDirectory()) {
          const nested = fs.readdirSync(inputPath).map(f => path.join(inputPath, f));
          walk(nested);
        } else if (SUPPORTED_IMAGE_EXTENSIONS.includes(path.extname(inputPath).toLowerCase())) {
          validPaths.push(inputPath);
        }
      }
    };

    walk(inputPaths);
    return validPaths;
  }

  /**
   * Sanitize crop data to ensure it falls within image dimensions
   * @param {Object} cropData
   * @param {number} imageWidth
   * @param {number} imageHeight
   * @returns {{ left: number, top: number, width: number, height: number }}
   */
  sanitizeCropArea(cropData, imageWidth, imageHeight) {
    const x = Math.max(0, Math.min(Math.round(cropData.x), imageWidth - 1));
    const y = Math.max(0, Math.min(Math.round(cropData.y), imageHeight - 1));
    const width = Math.min(Math.round(cropData.width), imageWidth - x);
    const height = Math.min(Math.round(cropData.height), imageHeight - y);

    return { left: x, top: y, width, height };
  }

  /**
   * Crop a single image based on given crop area and rotation
   * @param {string} inputPath - Full path to the input image
   * @param {string} outputDir - Directory to save the cropped image
   * @param {Object} cropData - Crop area with { x, y, width, height }
   * @param {number} rotation - Degrees to rotate image (user-defined)
   * @returns {Promise<string|null>} - Output path or null on failure
   */
  async cropSingleImage(inputPath, outputDir, cropData, rotation) {
    try {
      if (!cropData || typeof cropData !== "object") return null;

      const ext = path.extname(inputPath);
      let base = path.basename(inputPath, ext);
      base = base.replace(/_(compressed|converted|cropped)$/, ""); // sanitize base

      const timestamp = getFormattedTimestamp();
      const outputPath = path.join(outputDir, `${base}_${timestamp}_cropped.jpg`);

      // Step 1: auto-rotate from EXIF + user rotation
      let image = sharp(inputPath).rotate(); // fix EXIF
      if (rotation) {
        image = image.rotate(rotation);
      }

      // Step 2: generate new buffer + metadata
      const rotatedBuffer = await image.toBuffer();
      const rotatedMeta = await sharp(rotatedBuffer).metadata();

      // Step 3: sanitize crop area
      const safeCropArea = this.sanitizeCropArea(cropData, rotatedMeta.width, rotatedMeta.height);
      if (!safeCropArea.width || !safeCropArea.height) return null;

      // Step 4: extract and save
      await sharp(rotatedBuffer)
        .extract(safeCropArea)
        .jpeg({ quality: 100 })
        .toFile(outputPath);

      return outputPath;
    } catch (err) {
      console.error(`Crop failed for ${inputPath}`, err);
      return null;
    }
  }
}

module.exports = ImageCropper;