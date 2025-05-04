const { ipcRenderer, webUtils } = require("electron");
const fs = require("fs");

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

// Drag & Drop entire start box
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

// Select files on button click
startSelectBtn.addEventListener("click", async () => {
  const paths = await ipcRenderer.invoke("dialog:select-files");
  if (paths && paths.length > 0) {
    selectedPaths = paths;
    switchToResizer();
  }
});

// Output directory
outputBtn.addEventListener("click", async () => {
  const dir = await ipcRenderer.invoke("dialog:select-output-dir");
  if (dir) {
    outputPath = dir;
    outputDir.textContent = outputPath;
  }
});

// Resize
document.getElementById("resizeBtn").addEventListener("click", async () => {
  const size = Number(document.getElementById("sizeInput").value);
  if (selectedPaths.length === 0 || !outputPath) {
    alert("请选择图片和导出路径！");
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

// Resize progress
ipcRenderer.on("resize-progress", (event, { current, total }) => {
  const percent = Math.floor((current / total) * 100);
  progressBar.value = percent;
  progressText.textContent = `进度：${percent}%（${current}/${total}）`;
});

// UI switch
function switchToResizer() {
  startScreen.classList.remove("active");
  resizerScreen.classList.add("active");
}