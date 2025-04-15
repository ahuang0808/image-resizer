const { ipcRenderer, webUtils } = require("electron");

let selectedPaths = [];
let outputPath = "";

const dropArea = document.getElementById("dropArea");
const fs = require("fs");
console.log("fs available:", typeof fs.readFileSync);

dropArea.addEventListener("dragover", (e) => {
    e.preventDefault();
    dropArea.classList.add("dragging");
});

dropArea.addEventListener("dragleave", () => {
    dropArea.classList.remove("dragging");
});

dropArea.addEventListener("drop", (e) => {
    e.preventDefault();
    dropArea.classList.remove("dragging");

    const files = Array.from(e.dataTransfer.files);
    if (files.length === 0) return;

    selectedPaths = files.map(file => webUtils.getPathForFile(file));
    document.getElementById("fileList").textContent = selectedPaths.join("\n");
});


const progressBar = document.getElementById("progressBar");
const progressText = document.getElementById("progressText");

ipcRenderer.on("resize-progress", (event, { current, total }) => {
    const percent = Math.floor((current / total) * 100);
    document.getElementById("progressBar").value = percent;
    document.getElementById("progressText").textContent = `进度：${percent}%（${current}/${total}）`;
});

document.getElementById("resizeBtn").addEventListener("click", async () => {
    // 重置进度条
    progressBar.value = 0;
    progressText.textContent = "进度：0%";

    const size = Number(document.getElementById("sizeInput").value);
    if (selectedPaths.length === 0 || !outputPath) {
        alert("请选择图片和导出路径！");
        return;
    }

    const results = await ipcRenderer.invoke("resize-images", {
        filePaths: selectedPaths,
        outputDir: outputPath,
        sizeMB: size
    });

    progressText.textContent = `完成！共处理 ${results.length} 张图片。`;
});
document.getElementById("selectBtn").addEventListener("click", async () => {
    const paths = await ipcRenderer.invoke("dialog:select-files");
    if (paths) {
        selectedPaths = paths;
        document.getElementById("fileList").textContent = selectedPaths.join("\n");
    }
});

document.getElementById("outputBtn").addEventListener("click", async () => {
    const dir = await ipcRenderer.invoke("dialog:select-output-dir");
    if (dir) {
        outputPath = dir;
        document.getElementById("outputDir").textContent = outputPath;
    }
});

document.getElementById("resizeBtn").addEventListener("click", async () => {
    const size = Number(document.getElementById("sizeInput").value);
    if (selectedPaths.length === 0 || !outputPath) {
        alert("请选择图片和导出路径！");
        return;
    }

    const results = await ipcRenderer.invoke("resize-images", {
        filePaths: selectedPaths,
        outputDir: outputPath,
        sizeMB: size
    });

    alert(`完成！共处理 ${results.length} 张图片。`);
});