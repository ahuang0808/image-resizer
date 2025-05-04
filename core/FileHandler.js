const { dialog } = require("electron");
const { SUPPORTED_IMAGE_EXTENSIONS } = require("./config");

class FileHandler {
  /**
   * Open file or folder selection dialog.
   * Allows multi-selection and filters supported image types.
   */
  async selectFilesOrFolder() {
    const result = await dialog.showOpenDialog({
      properties: ["openFile", "openDirectory", "multiSelections"],
      filters: [{ name: "Images", extensions: SUPPORTED_IMAGE_EXTENSIONS }]
    });

    return result.canceled ? null : result.filePaths;
  }

  /**
   * Open output directory selection dialog.
   * Allows creating a new folder from the dialog window.
   */
  async selectOutputDirectory() {
    const result = await dialog.showOpenDialog({
      properties: ["openDirectory", "createDirectory"]
    });

    return result.canceled ? null : result.filePaths[0];
  }
}

module.exports = FileHandler;