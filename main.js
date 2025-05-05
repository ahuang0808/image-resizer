const { app, BrowserWindow, ipcMain } = require("electron");
const FileHandler = require("./core/FileHandler");
const ImageCompressor = require("./core/ImageCompressor");
const ImageConverter = require("./core/ImageConverter");
const ImageCropper = require("./core/ImageCropper");
const path = require("path");
const os = require("os");
const { clearPreviewDir } = require("./core/utils");
const { PREVIEW_DIR_NAME } = require("./core/config");

let win;
const PREVIEW_DIR = path.join(os.tmpdir(), PREVIEW_DIR_NAME);

function createWindow() {
  win = new BrowserWindow({
    width: 1080,
    height: 720,
    resizable: false,
    fullscreenable: false,
    maximizable: false,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    }
  });

  win.loadFile("index.html");
}

app.whenReady().then(() => {
  clearPreviewDir(PREVIEW_DIR);
  createWindow();
});

app.on("before-quit", () => {
  clearPreviewDir(PREVIEW_DIR);
});

ipcMain.handle("compress-images", async (event, { filePaths, outputDir, sizeMB, format }) => {
  const compresor = new ImageCompressor(sizeMB, format);
  const validPaths = await compresor.collectValidImagePaths(filePaths);

  const results = [];
  const total = validPaths.length;

  for (let i = 0; i < total; i++) {
    const inputPath = validPaths[i];
    const output = await compresor.processSingle(inputPath, outputDir);
    if (output) results.push(output);

    event.sender.send("compress-progress", {
      current: i + 1,
      total,
    });
  }

  return results;
});

ipcMain.handle("dialog:select-files", async () => {
  const fileHandler = new FileHandler(win);
  return await fileHandler.selectFilesOrFolder();
});

ipcMain.handle("dialog:select-output-dir", async () => {
  const fileHandler = new FileHandler(win);
  return await fileHandler.selectOutputDirectory();
});

ipcMain.handle("convert-images", async (event, { filePaths, outputDir, format }) => {
  const converter = new ImageConverter(format);
  const validPaths = await converter.collectValidImagePaths(filePaths);

  const results = [];
  const total = validPaths.length;

  for (let i = 0; i < total; i++) {
    const inputPath = validPaths[i];
    const output = await converter.convertSingle(inputPath, outputDir);
    if (output) results.push(output);

    // send progress back to renderer
    event.sender.send("convert-progress", {
      current: i + 1,
      total,
    });
  }

  return results;
});

ipcMain.handle("crop-images", async (event, { edits, outputDir }) => {
  const cropper = new ImageCropper(); // no need to pass global ratio/rotate

  const results = [];
  const total = edits.length;

  for (let i = 0; i < total; i++) {
    const { filePath, cropData, rotation } = edits[i];

    const output = await cropper.cropSingle(filePath, outputDir, cropData, rotation);
    if (output) results.push(output);

    event.sender.send("crop-progress", {
      current: i + 1,
      total,
    });
  }

  return results;
});