const { ipcRenderer, webUtils } = require("electron");
const fs = require("fs");
const path = require("path");
const os = require("os");

const FileHandler = require("./core/FileHandler");
const { generatePreview, ensurePreviewDirExists } = require("./core/utils");
const { SUPPORTED_IMAGE_EXTENSIONS, PREVIEW_DIR_NAME } = require("./core/config");

let selectedPaths = [];
let outputPath = "";

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
    outputPath = dir;
    compressOutputDir.textContent = dir;
  }
});
compressBtn.addEventListener("click", async () => {
  const size = Number(compressSizeInput.value);
  if (!outputPath) return alert("请选择导出路径！");
  if (!selectedPaths.length) return alert("请选择图片！");
  compressProgressBar.value = 0;
  compressProgressText.textContent = "进度：0%";
  const results = await ipcRenderer.invoke("compress-images", {
    filePaths: selectedPaths,
    outputDir: outputPath,
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
  if (dir) convertOutputDir.textContent = dir;
});
convertBtn.addEventListener("click", async () => {
  const format = convertFormatSelect.value;
  const output = convertOutputDir.textContent;
  if (!output) return alert("请选择导出路径！");
  if (!selectedPaths.length) return alert("请选择图片！");
  const bar = document.getElementById("convertProgressBar");
  const text = document.getElementById("convertProgressText");
  bar.value = 0;
  text.textContent = "进度：0%";
  const results = await ipcRenderer.invoke("convert-images", {
    filePaths: selectedPaths,
    outputDir: output,
    format
  });
  text.textContent = `完成！共转换 ${results.length} 张图片。`;
});
ipcRenderer.on("convert-progress", (event, { current, total }) => {
  const percent = Math.floor((current / total) * 100);
  document.getElementById("convertProgressBar").value = percent;
  document.getElementById("convertProgressText").textContent = `进度：${percent}%（${current}/${total}）`;
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
});

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

    const meta = document.createElement("div");
    meta.className = "image-meta";
    meta.textContent = path.basename(filePath);

    card.appendChild(toolbar);
    card.appendChild(wrapper);
    card.appendChild(meta);

    card.addEventListener("click", () => showLargeImage(displayPath));
    previewGrid.appendChild(card);
  }
}

// Show full image
function showLargeImage(imagePath) {
  currentPreviewIndex = selectedPaths.findIndex(p => imagePath.includes(path.basename(p)));
  const overlay = document.getElementById("imageOverlay");
  const img = document.getElementById("overlayImage");
  img.src = `file://${imagePath}`;
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

  if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
    if (selectedPaths.length === 0) return;

    if (event.key === "ArrowLeft" && currentPreviewIndex > 0) {
      currentPreviewIndex--;
    } else if (event.key === "ArrowRight" && currentPreviewIndex < selectedPaths.length - 1) {
      currentPreviewIndex++;
    } else {
      return; // At boundary: do nothing
    }

    const targetPath = selectedPaths[currentPreviewIndex];
    const ext = path.extname(targetPath).toLowerCase();

    // 👉 For .tif: use pre-generated preview image
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
  }
});