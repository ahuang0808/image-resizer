const sharp = require("sharp");
const path = require("path");
const fs = require("fs");


function getFormattedTimestamp() {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return [
    now.getFullYear(),
    pad(now.getMonth() + 1),
    pad(now.getDate()),
    pad(now.getHours()),
    pad(now.getMinutes()),
    pad(now.getSeconds())
  ].join("_");
}

async function generatePreview(inputPath, previewDir) {
  const ext = path.extname(inputPath).toLowerCase();
  const base = path.basename(inputPath, ext);
  const outputPath = path.join(previewDir, `${base}_preview.jpg`);

  // Skip if already generated
  if (fs.existsSync(outputPath)) {
    return outputPath;
  }

  try {
    await sharp(inputPath)
      .resize({ width: 300 })
      .jpeg({ quality: 70 })
      .toFile(outputPath);
    return outputPath;
  } catch (err) {
    console.error(`Preview generation failed for ${inputPath}`, err);
    return null; // fallback to placeholder
  }
}

function ensurePreviewDirExists(previewDir) {
  if (!fs.existsSync(previewDir)) {
    fs.mkdirSync(previewDir, { recursive: true });
  }
}

function clearPreviewDir(previewDir) {
  if (fs.existsSync(previewDir)) {
      const files = fs.readdirSync(previewDir);
      for (const file of files) {
          fs.unlinkSync(path.join(previewDir, file));
      }
  }
}

module.exports = {
  getFormattedTimestamp,
  generatePreview,
  ensurePreviewDirExists,
  clearPreviewDir
};