const { dialog } = require("electron");

class FileHandler {
    async selectFilesOrFolder() {
        const result = await dialog.showOpenDialog({
            properties: ["openFile", "openDirectory", "multiSelections"],
            filters: [{ name: "Images", extensions: ["jpg", "jpeg", "png", "tif", "webp"] }]
        });

        return result.canceled ? null : result.filePaths;
    }

    async selectOutputDirectory() {
        const result = await dialog.showOpenDialog({
            properties: ["openDirectory", "createDirectory"]
        });

        return result.canceled ? null : result.filePaths[0];
    }
}

module.exports = FileHandler;