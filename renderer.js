const { ipcRenderer, webUtils } = require("electron");
const fs = require("fs");
const path = require("path");
const os = require("os");

const FileHandler = require("./core/FileHandler");
const { generatePreview, ensurePreviewDirExists, selectOutputDirectory, setupProgressListener } = require("./core/utils");
const { SUPPORTED_IMAGE_EXTENSIONS, PREVIEW_DIR_NAME } = require("./core/config");

// ==================== global vars ====================
let selectedPaths = [];
let currentPreviewIndex = -1;
let selectedCropRatio = "free";
let selectedRotation = 0;
let currentCropper = null;
let cropEdits = {}; // key: imagePath, value: { cropData, rotation }
let editingPath = null;

// ==================== DOM elements ====================
const startScreen = document.getElementById("start-screen");
const workspaceScreen = document.getElementById("workspace-screen");
const startSelectBtn = document.getElementById("startSelectBtn");
const startBox = document.querySelector(".app-start-box");
const previewGrid = document.getElementById("previewGrid");

// Compress
const compressBtn = document.getElementById("compressBtn");
const compressSizeInput = document.getElementById("compressSizeInput");
const compressOutputBtn = document.getElementById("compressOutputBtn");
const compressOutputDir = document.getElementById("compressOutputDir");
const compressProgressBar = document.getElementById("compressProgressBar");
const compressProgressText = document.getElementById("compressProgressText");
compressOutputBtn.addEventListener("click", () => selectOutputDirectory(compressOutputDir));
setupProgressListener("compress-progress", compressProgressBar, compressProgressText);

// Convert
const convertBtn = document.getElementById("convertBtn");
const convertOutputBtn = document.getElementById("convertOutputBtn");
const convertOutputDir = document.getElementById("convertOutputDir");
const convertProgressBar = document.getElementById("convertProgressBar");
const convertProgressText = document.getElementById("convertProgressText");
const convertFormatSelect = document.getElementById("convertFormatSelect");
convertOutputBtn.addEventListener("click", () => selectOutputDirectory(convertOutputDir));
setupProgressListener("convert-progress", convertProgressBar, convertProgressText);

// Crop
const cropBtn = document.getElementById("cropBtn");
const cropOutputBtn = document.getElementById("cropOutputBtn");
const cropOutputDir = document.getElementById("cropOutputDir");
const cropProgressBar = document.getElementById("cropProgressBar");
const cropProgressText = document.getElementById("cropProgressText");
const cropRotateSlider = document.getElementById("cropRotateSlider");
const cropRotateValue = document.getElementById("cropRotateValue");
const cropEditorContainer = document.getElementById("cropEditorContainer");
const cropperImage = document.getElementById("cropperImage");
const confirmCropBtn = document.getElementById("confirmCropBtn");
const ratioButtons = document.querySelectorAll(".ratio-btn");
cropOutputBtn.addEventListener("click", () => selectOutputDirectory(cropOutputDir));
setupProgressListener("crop-progress", cropProgressBar, cropProgressText);

// Tab
const tabCompress = document.getElementById("tab-compress");
const tabConvert = document.getElementById("tab-convert");
const tabCrop = document.getElementById("tab-crop");
const tabBack = document.getElementById("tab-back");

// ==================== Init ====================
const previewDir = path.join(os.tmpdir(), PREVIEW_DIR_NAME);
ensurePreviewDirExists(previewDir);

// ==================== File Ops ====================
// Drag & Drop
startBox.addEventListener("dragover", (e) => {
  e.preventDefault();
  startBox.classList.add("dragging");
});
startBox.addEventListener("dragleave", () => {
  startBox.classList.remove("dragging");
});
startBox.addEventListener("drop", (e) => {
  e.preventDefault();
  startBox.classList.remove("dragging");
  const files = Array.from(e.dataTransfer.files);
  if (files.length === 0) return;
  const rawPaths = files.map(file => webUtils.getPathForFile(file));
  if (rawPaths.length === 0) return;
  selectedPaths = FileHandler.collectAllImagePaths(rawPaths);
  switchToWorkspace();
});

// Selct files
startSelectBtn.addEventListener("click", async () => {
  const paths = await ipcRenderer.invoke("dialog:select-files");
  if (paths?.length) {
    selectedPaths = FileHandler.collectAllImagePaths(paths);
    switchToWorkspace();
  }
});

// ==================== Compress ====================

compressBtn.addEventListener("click", async () => {
  const size = Number(compressSizeInput.value);
  if (!compressOutputDir.textContent) return alert("请选择导出路径！");
  if (!selectedPaths.length) return alert("请选择图片！");
  compressProgressBar.value = 0;
  compressProgressText.textContent = "进度：0%";
  const results = await ipcRenderer.invoke("compress-images", {
    filePaths: selectedPaths,
    outputDir: compressOutputDir.textContent,
    sizeMB: size
  });
  compressProgressText.textContent = `完成！共处理 ${results.length} 张图片。`;
});

// ==================== Convert ====================
convertBtn.addEventListener("click", async () => {
  const format = convertFormatSelect.value;
  if (!convertOutputDir.textContent) return alert("请选择导出路径！");
  if (!selectedPaths.length) return alert("请选择图片！");
  const bar = document.getElementById("convertProgressBar");
  const text = document.getElementById("convertProgressText");
  bar.value = 0;
  text.textContent = "进度：0%";
  const results = await ipcRenderer.invoke("convert-images", {
    filePaths: selectedPaths,
    outputDir: convertOutputDir.textContent,
    format
  });
  text.textContent = `完成！共转换 ${results.length} 张图片。`;
});

// ==================== Crop ====================
function getAspectRatioValue(ratio, imageWidth = 1, imageHeight = 1) {
  if (ratio === "free") return NaN;
  if (ratio === "original") return imageWidth / imageHeight;
  const [w, h] = ratio.split("/").map(Number);
  return w / h;
}

function updateRatioButtons(selected) {
  ratioButtons.forEach(btn => {
    btn.classList.toggle("active", btn.dataset.ratio === selected);
  });
}

function exitCropEditor() {
  cropEditorContainer.classList.add("hidden");
  previewGrid.classList.remove("hidden");
  if (currentCropper) {
    currentCropper.destroy();
    currentCropper = null;
  }
  editingPath = null;
  selectedRotation = 0;
  cropRotateSlider.value = 0;
  cropRotateValue.textContent = "0°";
}

function enterCropEditor(filePath) {
  previewGrid.classList.add("hidden");
  cropEditorContainer.classList.remove("hidden");

  const ext = path.extname(filePath).toLowerCase();
  let imagePathToUse = filePath;

  if (ext === ".tif" || ext === ".tiff") {
    const base = path.basename(filePath, ext);
    const previewPath = path.join(previewDir, `${base}_preview.jpg`);
    if (fs.existsSync(previewPath)) {
      imagePathToUse = previewPath;
    } else {
      alert("TIF 文件的预览图不存在，无法裁切。");
      return;
    }
  }

  cropperImage.src = `file://${imagePathToUse}`;
  cropperImage.onload = () => {
    if (currentCropper) currentCropper.destroy();

    const existing = cropEdits[filePath];

    if (!existing) {
      selectedCropRatio = "original";
      updateRatioButtons("original");
    } else {
      selectedCropRatio = "free";
      updateRatioButtons("free");
    }

    selectedRotation = existing?.rotation || 0;
    let previousCropBox = null;
    const imageWidth = cropperImage.naturalWidth;
    const imageHeight = cropperImage.naturalHeight;
    const aspectRatio = getAspectRatioValue(selectedCropRatio, imageWidth, imageHeight);

    currentCropper = new Cropper(cropperImage, {
      aspectRatio: aspectRatio,
      rotatable: true,
      viewMode: 1,
      responsive: true,
      restore: false,
      autoCropArea: 0.8,
      checkOrientation: false,
      ready() {
        if (existing?.rotation) currentCropper.rotateTo(existing.rotation);
        if (existing?.canvasData) currentCropper.setCanvasData(existing.canvasData);
        if (existing?.cropData) currentCropper.setData(existing.cropData);
      },
      cropend() {
        const currentBox = currentCropper.getCropBoxData();

        if (
          Math.abs(currentBox.width - previousCropBox.width) > 1 ||
          Math.abs(currentBox.height - previousCropBox.height) > 1
        ) {
          selectedCropRatio = "free";
          updateRatioButtons("free");
        }

        previousCropBox = currentBox;
      }
    });

    editingPath = filePath;
  };
}

// Crop listener
ratioButtons.forEach(button => {
  button.addEventListener("click", () => {
    const newRatio = button.dataset.ratio;
    selectedCropRatio = newRatio;
    updateRatioButtons(newRatio);

    if (currentCropper) {
      currentCropper.setAspectRatio(getAspectRatioValue(newRatio));

      if (newRatio === "free" || newRatio === "original") {
        const containerData = currentCropper.getContainerData();
        const boxWidth = containerData.width * 0.8;
        const boxHeight = containerData.height * 0.8;
        const x = (containerData.width - boxWidth) / 2;
        const y = (containerData.height - boxHeight) / 2;

        currentCropper.setCropBoxData({ left: x, top: y, width: boxWidth, height: boxHeight });
      }
    }
  });
});

cropRotateSlider.addEventListener("input", () => {
  const angle = parseInt(cropRotateSlider.value, 10);
  cropRotateValue.textContent = `${angle}°`;
  selectedRotation = angle;

  if (currentCropper) {
    currentCropper.rotateTo(angle);
  }
});

confirmCropBtn.addEventListener("click", () => {
  if (!currentCropper || !editingPath) return;

  cropEdits[editingPath] = {
    cropData: currentCropper.getData(true),
    canvasData: currentCropper.getCanvasData(),
    rotation: selectedRotation
  };

  exitCropEditor();
});

cropBtn.addEventListener("click", async () => {
  const output = cropOutputDir.textContent;
  if (!output) return alert("请选择导出路径！");
  if (!selectedPaths.length) return alert("请选择图片！");
  cropProgressBar.value = 0;
  cropProgressText.textContent = "进度：0%";

  const cropList = Object.entries(cropEdits).map(([filePath, info]) => ({
    filePath,
    ...info,
  }));

  if (!cropList.length) {
    alert("没有图片被设置裁切，已跳过");
    return;
  }

  const results = await ipcRenderer.invoke("crop-images", {
    edits: cropList,
    outputDir: output,
  });

  cropProgressText.textContent = `完成！共裁切 ${results.length} 张图片。`;
});

// ==================== Tab ====================
function activateTab(selectedTab) {
  document.querySelectorAll(".app-tab").forEach(tab => tab.classList.remove("active"));
  selectedTab.classList.add("active");
  document.querySelectorAll(".app-compress-config, .app-convert-config, .app-crop-config").forEach(box => box.classList.add("hidden"));
  if (selectedTab.id === "tab-compress") {
    document.querySelector(".app-compress-config").classList.remove("hidden");
  } else if (selectedTab.id === "tab-convert") {
    document.querySelector(".app-convert-config").classList.remove("hidden");
  } else if (selectedTab.id === "tab-crop") {
    document.querySelector(".app-crop-config")?.classList.remove("hidden");
  }
}

tabCompress.addEventListener("click", () => activateTab(tabCompress));
tabConvert.addEventListener("click", () => activateTab(tabConvert));
tabCrop.addEventListener("click", () => activateTab(tabCrop));
tabBack.addEventListener("click", () => {
  startScreen.classList.add("active");
  workspaceScreen.classList.remove("active");
  exitCropEditor()
});

function getActiveTabId() {
  return document.querySelector(".app-tab.active")?.id || "";
}

// ==================== Preview Grid ====================
function createAddCard() {
  const addCard = document.createElement("div");
  addCard.className = "image-card add-card";
  addCard.innerHTML = `<div class="add-icon">+</div>`;
  addCard.addEventListener("click", async () => {
    const paths = await ipcRenderer.invoke("dialog:select-files");
    if (paths?.length) {
      const newPaths = FileHandler.collectAllImagePaths(paths);
      selectedPaths = [...newPaths, ...selectedPaths];
      renderPreview(selectedPaths);
    }
  });
  return addCard;
}

async function renderPreview(paths) {
  previewGrid.innerHTML = "";
  previewGrid.appendChild(createAddCard());

  for (const filePath of paths) {
    const ext = path.extname(filePath).toLowerCase();
    if (!SUPPORTED_IMAGE_EXTENSIONS.includes(ext)) continue;

    const card = document.createElement("div");
    card.className = "image-card";

    const toolbar = document.createElement("div");
    toolbar.className = "image-toolbar";

    const delBtn = document.createElement("div");
    delBtn.className = "delete-btn";
    delBtn.textContent = "×";
    delBtn.addEventListener("click", () => {
      selectedPaths = selectedPaths.filter(p => p !== filePath);
      renderPreview(selectedPaths);
    });
    toolbar.appendChild(delBtn);

    const wrapper = document.createElement("div");
    wrapper.className = "image-wrapper";

    const img = document.createElement("img");
    let displayPath = filePath;

    try {
      if (ext === ".tif" || ext === ".tiff") {
        const previewPath = await generatePreview(filePath, previewDir);
        displayPath = previewPath || path.join(__dirname, "assets", "no-preview.png");
        img.src = `file://${displayPath}`;
      } else {
        img.src = `file://${filePath}`;
      }
    } catch {
      displayPath = path.join(__dirname, "assets", "no-preview.png");
      img.src = `file://${displayPath}`;
    }

    img.alt = path.basename(filePath);
    wrapper.appendChild(img);
    wrapper.addEventListener("click", () => {
      const activeTab = getActiveTabId();
      if (activeTab === "tab-compress" || activeTab === "tab-convert") {
        showLargeImage(filePath);
      } else if (activeTab === "tab-crop") {
        enterCropEditor(filePath);
      }
    });

    const meta = document.createElement("div");
    meta.className = "image-meta";
    meta.textContent = path.basename(filePath);

    card.appendChild(toolbar);
    card.appendChild(wrapper);
    card.appendChild(meta);

    previewGrid.appendChild(card);
  }
}

// ==================== Preview ====================
function showLargeImage(filePath) {
  currentPreviewIndex = selectedPaths.findIndex(p => p === filePath);
  const overlay = document.getElementById("imageOverlay");
  const img = document.getElementById("overlayImage");

  img.src = `file://${getPreviewPathForImage(filePath)}`;
  overlay.classList.remove("hidden");
}

document.getElementById("imageOverlay").addEventListener("click", () => {
  document.getElementById("imageOverlay").classList.add("hidden");
});

// ==================== Screen switch ====================
function switchToWorkspace() {
  startScreen.classList.remove("active");
  workspaceScreen.classList.add("active");
  renderPreview(selectedPaths);
  activateTab(tabCompress);
}

// ==================== Global Listeners ====================
window.addEventListener("resize", () => {
  if (currentCropper && !cropEditorContainer.classList.contains("hidden")) {
    const rotation = selectedRotation;

    currentCropper.destroy();

    currentCropper = new Cropper(cropperImage, {
      aspectRatio: getAspectRatioValue(selectedCropRatio),
      rotatable: true,
      viewMode: 1,
      responsive: true,
      restore: false,
      autoCropArea: 0.8,
      checkOrientation: false,
      ready() {
        if (rotation) currentCropper.rotateTo(rotation);
      }
    });
  }
});

// Exit Crop mode
document.getElementById("exitCropEditorBtn").addEventListener("click", exitCropEditor);

// Key binding
document.addEventListener("keydown", (e) => {
  // Esc to exit crop mode
  if (e.key === "Escape" && !cropEditorContainer.classList.contains("hidden")) {
    exitCropEditor();
  }
  
  // Enter to confirm crop
  if (!cropEditorContainer.classList.contains("hidden") && e.key === "Enter") {
    confirmCropBtn.click();
  }

  // preview
  const overlay = document.getElementById("imageOverlay");
  const img = document.getElementById("overlayImage");

  if (overlay.classList.contains("hidden")) return;

  if (e.key === "Escape") {
    overlay.classList.add("hidden");
    return;
  }

  if (!["ArrowLeft", "ArrowRight"].includes(e.key)) return;
  if (selectedPaths.length === 0 || currentPreviewIndex === -1) return;

  if (e.key === "ArrowLeft" && currentPreviewIndex > 0) {
    currentPreviewIndex--;
  } else if (e.key === "ArrowRight" && currentPreviewIndex < selectedPaths.length - 1) {
    currentPreviewIndex++;
  } else {
    return;
  }

  const targetPath = selectedPaths[currentPreviewIndex];
  const ext = path.extname(targetPath).toLowerCase();

  if (ext === ".tif" || ext === ".tiff") {
    const base = path.basename(targetPath, ext);
    const previewPath = path.join(previewDir, `${base}_preview.jpg`);
    if (fs.existsSync(previewPath)) {
      img.src = `file://${previewPath}`;
    } else {
      img.src = `file://${path.join(__dirname, "assets", "no-preview.png")}`;
    }
  } else {
    img.src = `file://${targetPath}`;
  }
});