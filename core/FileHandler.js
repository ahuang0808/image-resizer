const fs = require("fs");
const path = require("path");
const { dialog } = require("electron");
const { SUPPORTED_IMAGE_EXTENSIONS } = require("./config");

class FileHandler {
  /**
   * Open file or folder selection dialog (multi-select).
   * @returns {Promise<string[] | null>}
   */
  async selectFilesOrFolder() {
    const result = await dialog.showOpenDialog({
      properties: ["openFile", "openDirectory", "multiSelections"],
      filters: [
        { name: "Images", extensions: SUPPORTED_IMAGE_EXTENSIONS }
      ]
    });

    return result.canceled ? null : result.filePaths;
  }

  /**
   * Open directory selection dialog for output path.
   * @returns {Promise<string | null>}
   */
  async selectOutputDirectory() {
    const result = await dialog.showOpenDialog({
      properties: ["openDirectory", "createDirectory"]
    });

    return result.canceled ? null : result.filePaths[0];
  }

  /**
   * Recursively collect all image file paths from input paths (files or folders).
   * @param {string[]} inputPaths
   * @returns {string[]} image file paths
   */
  static collectAllImagePaths(inputPaths) {
    const allPaths = [];

    const walk = (currentPath) => {
      const stat = fs.statSync(currentPath);
      if (stat.isDirectory()) {
        const entries = fs.readdirSync(currentPath);
        entries.forEach(entry => walk(path.join(currentPath, entry)));
      } else {
        const ext = path.extname(currentPath).toLowerCase();
        if (SUPPORTED_IMAGE_EXTENSIONS.includes(ext)) {
          allPaths.push(currentPath);
        }
      }
    };

    inputPaths.forEach(p => walk(p));
    return allPaths;
  }
}

module.exports = FileHandler;