const { app, BrowserWindow, ipcMain } = require("electron");
const FileHandler = require("./core/FileHandler");
const ImageResizer = require("./core/ImageResizer");

let win;

function createWindow() {
    const win = new BrowserWindow({
        width: 700,
        height: 500,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
        }
    });

    win.loadFile("index.html");
}

app.whenReady().then(createWindow);

ipcMain.handle("resize-images", async (event, { filePaths, outputDir, sizeMB }) => {
    const resizer = new ImageResizer(sizeMB);

    const allImagePaths = resizer.collectValidImagePaths(filePaths);
    const total = allImagePaths.length;
    const results = [];

    for (let i = 0; i < total; i++) {
        const inputPath = allImagePaths[i];
        const output = await resizer._processSingle(inputPath, outputDir);
        results.push(output);

        event.sender.send("resize-progress", {
            current: i + 1,
            total
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