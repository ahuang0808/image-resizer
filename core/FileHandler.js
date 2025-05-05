const fs = require("fs");
const path = require("path");
const { dialog } = require("electron");
const { SUPPORTED_IMAGE_EXTENSIONS } = require("./config");

class FileHandler {
  /**
   * Open a file/folder picker dialog.
   * @returns {Promise<string[] | null>} Selected file or folder paths, or null if cancelled.
   */
  async selectFilesOrFolder() {
    const result = await dialog.showOpenDialog({
      properties: ["openFile", "openDirectory", "multiSelections"],
      filters: [{ name: "Images", extensions: SUPPORTED_IMAGE_EXTENSIONS }]
    });

    return result.canceled ? null : result.filePaths;
  }

  /**
   * Open a folder picker dialog for selecting output directory.
   * @returns {Promise<string | null>} Selected directory path, or null if cancelled.
   */
  async selectOutputDirectory() {
    const result = await dialog.showOpenDialog({
      properties: ["openDirectory", "createDirectory"]
    });

    return result.canceled ? null : result.filePaths[0];
  }

  /**
   * Recursively walk given paths to collect all valid image files.
   * @param {string[]} inputPaths - Paths of files or folders.
   * @returns {string[]} Valid image file paths.
   */
  static collectAllImagePaths(inputPaths) {
    const imagePaths = [];

    const walkDirectory = (currentPath) => {
      try {
        const stat = fs.statSync(currentPath);

        if (stat.isDirectory()) {
          const entries = fs.readdirSync(currentPath);
          entries.forEach(entry => walkDirectory(path.join(currentPath, entry)));
        } else {
          const ext = path.extname(currentPath).toLowerCase();
          if (SUPPORTED_IMAGE_EXTENSIONS.includes(ext)) {
            imagePaths.push(currentPath);
          }
        }
      } catch (error) {
        console.error(`Failed to access path: ${currentPath}`, error);
      }
    };

    inputPaths.forEach(p => walkDirectory(p));
    return imagePaths;
  }
}

module.exports = FileHandler;