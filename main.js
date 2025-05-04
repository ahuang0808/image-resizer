const { app, BrowserWindow, ipcMain } = require("electron");
const FileHandler = require("./core/FileHandler");
const ImageResizer = require("./core/ImageResizer");
const path = require("path");
const os = require("os");
const { clearPreviewDir } = require("./core/utils");

let win;

function createWindow() {
    win = new BrowserWindow({
        width: 1080,
        height: 720,
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
    const previewDir = path.join(os.tmpdir(), "image-resizer-previews");
    clearPreviewDir(previewDir); // clear previews when starting
    createWindow();
});

app.on("before-quit", () => {
    const previewDir = path.join(os.tmpdir(), "image-resizer-previews");
    clearPreviewDir(previewDir); // clear previews when quiting
});

ipcMain.handle("resize-images", async (event, { filePaths, outputDir, sizeMB }) => {
    const resizer = new ImageResizer(sizeMB);
    const validPaths = await resizer.collectValidImagePaths(filePaths);

    const results = [];
    const total = validPaths.length;

    for (let i = 0; i < total; i++) {
        const inputPath = validPaths[i];
        const output = await resizer.processSingle(inputPath, outputDir);
        if (output) results.push(output);

        event.sender.send("resize-progress", {
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