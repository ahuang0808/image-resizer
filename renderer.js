const { ipcRenderer, webUtils } = require("electron");
const fs = require("fs");
const path = require("path");
const os = require("os");

const FileHandler = require("./core/FileHandler");
const { generatePreview, ensurePreviewDirExists } = require("./core/utils");
const { SUPPORTED_IMAGE_EXTENSIONS, PREVIEW_DIR_NAME } = require("./core/config");

let selectedPaths = [];
let currentPreviewIndex = -1;
let selectedCropRatio = "free";
let selectedRotation = 0;
let currentCropper = null;
let cropEdits = {}; // key: imagePath, value: { cropData, rotation }
let editingPath = null;

const startScreen = document.getElementById("start-screen");
const workspaceScreen = document.getElementById("workspace-screen");
const startSelectBtn = document.getElementById("startSelectBtn");
const startBox = document.querySelector(".app-start-box");
const previewGrid = document.getElementById("previewGrid");

const compressBtn = document.getElementById("compressBtn");
const compressSizeInput = document.getElementById("compressSizeInput");
const compressOutputBtn = document.getElementById("compressOutputBtn");
const compressOutputDir = document.getElementById("compressOutputDir");
const compressProgressBar = document.getElementById("compressProgressBar");
const compressProgressText = document.getElementById("compressProgressText");

const convertBtn = document.getElementById("convertBtn");
const convertOutputBtn = document.getElementById("convertOutputBtn");
const convertOutputDir = document.getElementById("convertOutputDir");
const convertFormatSelect = document.getElementById("convertFormatSelect");

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


const tabCompress = document.getElementById("tab-compress");
const tabConvert = document.getElementById("tab-convert");
const tabCrop = document.getElementById("tab-crop");
const tabBack = document.getElementById("tab-back");

const previewDir = path.join(os.tmpdir(), PREVIEW_DIR_NAME);
ensurePreviewDirExists(previewDir);

// Drag and drop
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

// File dialog select
startSelectBtn.addEventListener("click", async () => {
  const paths = await ipcRenderer.invoke("dialog:select-files");
  if (paths?.length) {
    selectedPaths = FileHandler.collectAllImagePaths(paths);
    switchToWorkspace();
  }
});

// Compress
compressOutputBtn.addEventListener("click", async () => {
  const dir = await ipcRenderer.invoke("dialog:select-output-dir");
  if (dir) {
    compressOutputDir.textContent = dir;
  }
});
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
ipcRenderer.on("compress-progress", (event, { current, total }) => {
  const percent = Math.floor((current / total) * 100);
  compressProgressBar.value = percent;
  compressProgressText.textContent = `进度：${percent}%（${current}/${total}）`;
});

// Convert
convertOutputBtn.addEventListener("click", async () => {
  const dir = await ipcRenderer.invoke("dialog:select-output-dir");
  if (dir) {
    convertOutputDir.textContent = dir;
  }
});
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
ipcRenderer.on("convert-progress", (event, { current, total }) => {
  const percent = Math.floor((current / total) * 100);
  document.getElementById("convertProgressBar").value = percent;
  document.getElementById("convertProgressText").textContent = `进度：${percent}%（${current}/${total}）`;
});

// Crop
cropOutputBtn.addEventListener("click", async () => {
  const dir = await ipcRenderer.invoke("dialog:select-output-dir");
  if (dir) {
    cropOutputDir.textContent = dir;
  }
});



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
        // ⚠️ Don't call setData() to avoid distortion
      }
    });
  }
});

// Esc or click button to exit crop mode
function exitCropEditor() {
  cropEditorContainer.classList.add("hidden");
  previewGrid.classList.remove("hidden");
  if (currentCropper) {
    currentCropper.destroy();
    currentCropper = null;
  }
}

document.getElementById("exitCropEditorBtn").addEventListener("click", exitCropEditor);

// Support esc
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !cropEditorContainer.classList.contains("hidden")) {
    exitCropEditor();
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

ipcRenderer.on("crop-progress", (event, { current, total }) => {
  const percent = Math.floor((current / total) * 100);
  cropProgressBar.value = percent;
  cropProgressText.textContent = `进度：${percent}%（${current}/${total}）`;
});

function updateRatioButtons(selected) {
  ratioButtons.forEach(btn => {
    btn.classList.toggle("active", btn.dataset.ratio === selected);
  });
}

ratioButtons.forEach(button => {
  button.addEventListener("click", () => {
    const newRatio = button.dataset.ratio;
    selectedCropRatio = newRatio;
    updateRatioButtons(newRatio);

    if (currentCropper) {
      currentCropper.setAspectRatio(getAspectRatioValue(newRatio));

      // Reset crop box to 80% if free or original
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

// Convert crop ratio string to numeric value (e.g., "4/3" → 1.33)
function getAspectRatioValue(ratio, imageWidth = 1, imageHeight = 1) {
  if (ratio === "free") return NaN;
  if (ratio === "original") return imageWidth / imageHeight;
  const [w, h] = ratio.split("/").map(Number);
  return w / h;
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

    // ✅ default to original if no previous crop
    if (!existing) {
      selectedCropRatio = "original";
      updateRatioButtons("original");
    } else {
      selectedCropRatio = "free"; // edited image → show as freeform
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

        // Only consider as freeform if size changed (not just moved)
        if (
          Math.abs(currentBox.width - previousCropBox.width) > 1 ||
          Math.abs(currentBox.height - previousCropBox.height) > 1
        ) {
          selectedCropRatio = "free";
          updateRatioButtons("free");
        }

        // Update previous crop box
        previousCropBox = currentBox;
      }
    });

    editingPath = filePath;
  };
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

document.addEventListener("keydown", (e) => {
  if (!cropEditorContainer.classList.contains("hidden") && e.key === "Enter") {
    confirmCropBtn.click();
  }
});

// Tabs
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

// Utility: get active tab
function getActiveTabId() {
  return document.querySelector(".app-tab.active")?.id || "";
}

// Switch screen
function switchToWorkspace() {
  startScreen.classList.remove("active");
  workspaceScreen.classList.add("active");
  renderPreview(selectedPaths);
  activateTab(tabCompress);
}

// Add-card
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

// Render previews
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

// Show full image
function showLargeImage(filePath) {
  currentPreviewIndex = selectedPaths.findIndex(p => p === filePath);
  const overlay = document.getElementById("imageOverlay");
  const img = document.getElementById("overlayImage");

  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".tif" || ext === ".tiff") {
    const base = path.basename(filePath, ext);
    const previewPath = path.join(previewDir, `${base}_preview.jpg`);
    if (fs.existsSync(previewPath)) {
      img.src = `file://${previewPath}`;
    } else {
      img.src = `file://${path.join(__dirname, "assets", "no-preview.png")}`;
    }
  } else {
    img.src = `file://${filePath}`;
  }

  overlay.classList.remove("hidden");
}

document.getElementById("imageOverlay").addEventListener("click", () => {
  document.getElementById("imageOverlay").classList.add("hidden");
});

document.addEventListener("keydown", (event) => {
  const overlay = document.getElementById("imageOverlay");
  const img = document.getElementById("overlayImage");

  if (overlay.classList.contains("hidden")) return;

  if (event.key === "Escape") {
    overlay.classList.add("hidden");
    return;
  }

  if (!["ArrowLeft", "ArrowRight"].includes(event.key)) return;
  if (selectedPaths.length === 0 || currentPreviewIndex === -1) return;

  if (event.key === "ArrowLeft" && currentPreviewIndex > 0) {
    currentPreviewIndex--;
  } else if (event.key === "ArrowRight" && currentPreviewIndex < selectedPaths.length - 1) {
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