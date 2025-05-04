const sharp = require("sharp");
const path = require("path");
const fs = require("fs");
const { SUPPORTED_IMAGE_EXTENSIONS, DEBUG } = require("./config");
const { getFormattedTimestamp } = require("./utils");

class ImageConverter {
  constructor(format = "jpg") {
    this.outputFormat = format.toLowerCase(); // jpg / png / webp
  }

  log(msg) {
    if (DEBUG) console.log(`[ImageConverter] ${msg}`);
  }

  async processBatch(inputPaths, outputDir) {
    const results = [];

    for (const inputPath of inputPaths) {
      const stat = await fs.promises.stat(inputPath);
      if (stat.isDirectory()) {
        const files = await fs.promises.readdir(inputPath);
        const nested = files.map(f => path.join(inputPath, f));
        const nestedResults = await this.processBatch(nested, outputDir);
        results.push(...nestedResults);
      } else if (SUPPORTED_IMAGE_EXTENSIONS.includes(path.extname(inputPath).toLowerCase())) {
        const output = await this.convertSingle(inputPath, outputDir);
        if (output) results.push(output);
      }
    }

    return results;
  }

  async convertSingle(inputPath, outputDir) {
    const ext = path.extname(inputPath);
    const base = path.basename(inputPath, ext);
    const timestamp = getFormattedTimestamp();
    const outputPath = path.join(outputDir, `${base}_${timestamp}.${this.outputFormat}`);

    const imageBuffer = await fs.promises.readFile(inputPath);
    this.log(`Converting: ${inputPath}`);

    let outputBuffer;

    // Convert to target format using highest quality settings
    if (this.outputFormat === "png") {
      outputBuffer = await sharp(imageBuffer).png({ compressionLevel: 0 }).toBuffer(); // no compression
    } else if (this.outputFormat === "webp") {
      outputBuffer = await sharp(imageBuffer).webp({ quality: 100 }).toBuffer();
    } else {
      outputBuffer = await sharp(imageBuffer).jpeg({ quality: 100 }).toBuffer();
    }

    await fs.promises.writeFile(outputPath, outputBuffer);
    return outputPath;
  }

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
}



module.exports = ImageConverter;