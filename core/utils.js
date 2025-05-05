const sharp = require("sharp");
const path = require("path");
const fs = require("fs");
const {
  PREVIEW_QUALITY
} = require("./config");

/**
 * Get a formatted timestamp for file naming.
 */
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

/**
 * Generate a thumbnail preview (JPEG) for a given image file.
 * Only used for TIFF files to improve UI performance.
 */
async function generatePreview(inputPath, previewDir) {
  const ext = path.extname(inputPath).toLowerCase();
  const base = path.basename(inputPath, ext);
  const outputPath = path.join(previewDir, `${base}_preview.jpg`);

  // Return cached preview if it already exists
  if (fs.existsSync(outputPath)) {
    return outputPath;
  }

  try {
    await sharp(inputPath)
      .jpeg({ quality: PREVIEW_QUALITY })
      .toFile(outputPath);
    return outputPath;
  } catch (err) {
    console.error(`Preview generation failed for ${inputPath}`, err);
    return null;
  }
}

/**
 * Ensure the preview directory exists.
 */
function ensurePreviewDirExists(previewDir) {
  if (!fs.existsSync(previewDir)) {
    fs.mkdirSync(previewDir, { recursive: true });
  }
}

/**
 * Remove all preview images inside the preview directory.
 */
function clearPreviewDir(previewDir) {
  if (fs.existsSync(previewDir)) {
    const files = fs.readdirSync(previewDir);
    for (const file of files) {
      fs.unlinkSync(path.join(previewDir, file));
    }
  }
}

/**
 * Select output directory and update label text.
 * @param {HTMLElement} labelElement
 */
async function selectOutputDirectory(labelElement) {
  const dir = await ipcRenderer.invoke("dialog:select-output-dir");
  if (dir) labelElement.textContent = dir;
}

/**
 * Set up progress bar and text update listener.
 * @param {string} channel - IPC channel name.
 * @param {HTMLProgressElement} progressBar
 * @param {HTMLElement} progressText
 */
function setupProgressListener(channel, progressBar, progressText) {
  ipcRenderer.on(channel, (event, { current, total }) => {
    const percent = Math.floor((current / total) * 100);
    progressBar.value = percent;
    progressText.textContent = `进度：${percent}%（${current}/${total}）`;
  });
}

module.exports = {
  getFormattedTimestamp,
  generatePreview,
  ensurePreviewDirExists,
  clearPreviewDir,
  selectOutputDirectory,
  setupProgressListener,
};