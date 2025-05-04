const { ipcRenderer, webUtils } = require("electron");
const fs = require("fs");
const path = require("path");
const os = require("os");
const { generatePreview, ensurePreviewDirExists } = require("./core/utils");

let selectedPaths = [];
let outputPath = "";

// Elements
const startScreen = document.getElementById("start-screen");
const resizerScreen = document.getElementById("resizer-screen");
const startBox = document.querySelector(".start-box");
const startSelectBtn = document.getElementById("startSelectBtn");
const progressBar = document.getElementById("progressBar");
const progressText = document.getElementById("progressText");
const outputBtn = document.getElementById("outputBtn");
const outputDir = document.getElementById("outputDir");
const previewGrid = document.getElementById("previewGrid");
const previewDir = path.join(os.tmpdir(), "image-resizer-previews");
ensurePreviewDirExists(previewDir);

// Drag & Drop for entire start box
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

    selectedPaths = files.map(file => webUtils.getPathForFile(file));
    switchToResizer();
});

// File selection via button
startSelectBtn.addEventListener("click", async () => {
    const paths = await ipcRenderer.invoke("dialog:select-files");
    if (paths && paths.length > 0) {
        selectedPaths = paths;
        switchToResizer();
    }
});

// Select output directory
outputBtn.addEventListener("click", async () => {
    const dir = await ipcRenderer.invoke("dialog:select-output-dir");
    if (dir) {
        outputPath = dir;
        outputDir.textContent = outputPath;
    }
});

// Start resizing
document.getElementById("resizeBtn").addEventListener("click", async () => {
    const size = Number(document.getElementById("sizeInput").value);
    if (!outputPath) {
        alert("请选择导出路径！");
        return;
    }
    if (selectedPaths.length === 0) {
        alert("请选择图片！");
        return;
    }

    progressBar.value = 0;
    progressText.textContent = "进度：0%";

    const results = await ipcRenderer.invoke("resize-images", {
        filePaths: selectedPaths,
        outputDir: outputPath,
        sizeMB: size
    });

    progressText.textContent = `完成！共处理 ${results.length} 张图片。`;
});

// Progress update from main process
ipcRenderer.on("resize-progress", (event, { current, total }) => {
    const percent = Math.floor((current / total) * 100);
    progressBar.value = percent;
    progressText.textContent = `进度：${percent}%（${current}/${total}）`;
});

// Switch UI to resizer screen
function switchToResizer() {
    startScreen.classList.remove("active");
    resizerScreen.classList.add("active");
    renderPreview(selectedPaths);
}

// Render thumbnails in right preview panel
async function renderPreview(paths) {
    previewGrid.innerHTML = "";

    for (let i = 0; i < paths.length; i++) {
        const filePath = paths[i];
        const ext = path.extname(filePath).toLowerCase();
        if (![".jpg", ".jpeg", ".png", ".webp", ".tif", ".tiff"].includes(ext)) continue;

        const card = document.createElement("div");
        card.className = "image-card";

        const toolbar = document.createElement("div");
        toolbar.className = "image-toolbar";

        const wrapper = document.createElement("div");
        wrapper.className = "image-wrapper";

        const delBtn = document.createElement("div");
        delBtn.className = "delete-btn";
        delBtn.textContent = "×";
        delBtn.addEventListener("click", () => {
            selectedPaths.splice(i, 1);
            renderPreview(selectedPaths);
        });
        toolbar.appendChild(delBtn);

        const img = document.createElement("img");

        try {
            if (ext === ".tif" || ext === ".tiff") {
                const previewPath = await generatePreview(filePath, previewDir);
                img.src = previewPath
                    ? `file://${previewPath}`
                    : `file://${path.join(__dirname, "assets", "no-preview.png")}`;
            } else {
                img.src = `file://${filePath}`;
            }
        } catch (err) {
            img.src = `file://${path.join(__dirname, "assets", "no-preview.png")}`;
        }

        img.alt = path.basename(filePath);
        wrapper.appendChild(img);

        const meta = document.createElement("div");
        meta.className = "image-meta";
        meta.textContent = path.basename(filePath);

        card.appendChild(toolbar);
        card.appendChild(wrapper);
        card.appendChild(meta);
        previewGrid.appendChild(card);
    }
}