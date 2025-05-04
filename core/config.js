// core/config.js

module.exports = {
    // Supported image file extensions for input filtering
    SUPPORTED_IMAGE_EXTENSIONS: [".jpg", ".jpeg", ".png", ".tif", ".tiff", ".webp"],
  
    // Name of the preview directory (resolved under os.tmpdir())
    PREVIEW_DIR_NAME: "swing-image-previews",
  
    // Thumbnail preview image width in pixels
    PREVIEW_WIDTH: 300,
  
    // JPEG quality (1–100) for preview generation
    PREVIEW_QUALITY: 70,
  
    // Default compression target size in megabytes
    DEFAULT_TARGET_MB: 1,
  
    // Enable debug logging when not in production
    DEBUG: process.env.NODE_ENV !== "production"
  };