const fs = require("fs");
const path = require("path");
const sharp = require("sharp");
const { SUPPORTED_IMAGE_EXTENSIONS } = require("./config");
const { getFormattedTimestamp } = require("./utils");

class ImageCropper {
  constructor() { }

  // Recursively collect all image file paths from input paths
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

  // Ensure crop area does not exceed image bounds
  sanitizeCropArea(cropData, imageWidth, imageHeight) {
    const x = Math.max(0, Math.min(Math.round(cropData.x), imageWidth - 1));
    const y = Math.max(0, Math.min(Math.round(cropData.y), imageHeight - 1));
    const width = Math.min(Math.round(cropData.width), imageWidth - x);
    const height = Math.min(Math.round(cropData.height), imageHeight - y);

    return { left: x, top: y, width, height };
  }

  // Crop a single image using explicit cropData and rotation
  async cropSingle(inputPath, outputDir, cropData, rotation) {
    try {
      if (!cropData || typeof cropData !== "object") return null;
  
      const ext = path.extname(inputPath);
      const base = path.basename(inputPath, ext);
      const timestamp = getFormattedTimestamp();
      const outputPath = path.join(outputDir, `${base}_${timestamp}_cropped.jpg`);
  
      // Step 1: auto rotate + user-defined rotation
      let image = sharp(inputPath).rotate(); // EXIF
      if (rotation) {
        image = image.rotate(rotation); // user-specified
      }
  
      // Step 2: force apply and read new dimensions
      const rotatedBuffer = await image.toBuffer();
      const rotatedMeta = await sharp(rotatedBuffer).metadata();
  
      // Step 3: safe crop based on new dimensions
      const safeCropArea = this.sanitizeCropArea(cropData, rotatedMeta.width, rotatedMeta.height);
      if (!safeCropArea.width || !safeCropArea.height) return null;
  
      // Step 4: crop and save
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