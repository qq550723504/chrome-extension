/**
 * Amazon ASIN Collector - Popup Script
 * 
 * @version 1.2.0
 * @author Your Name
 * @license MIT
 * @description 插件弹窗界面逻辑
 */

const VERSION = '1.2.0';

// 获取DOM元素
const startBtn = document.getElementById("startBtn");
const exportBtn = document.getElementById("exportBtn");
const exportAllBtn = document.getElementById("exportAllBtn");
const clearBtn = document.getElementById("clearBtn");
const resetExportBtn = document.getElementById("resetExportBtn");
const refreshBtn = document.getElementById("refreshBtn");
const startPageInput = document.getElementById("startPage");
const pageCountInput = document.getElementById("pageCount");
const statusDiv = document.getElementById("status");
const resultsDiv = document.getElementById("results");
const asinList = document.getElementById("asinList");
const asinCount = document.getElementById("asinCount");
const progress = document.getElementById("progress");
const progressFill = document.getElementById("progressFill");
const progressText = document.getElementById("progressText");

let collectedASINs = new Set();
let exportedASINs = new Set(); // 跟踪已导出的ASIN
let isCollecting = false;

// 显示状态消息
function showStatus(message, type = "info") {
  statusDiv.textContent = message;
  statusDiv.className = `status ${type}`;
  statusDiv.style.display = "block";

  if (type === "success" || type === "error") {
    setTimeout(() => {
      statusDiv.style.display = "none";
    }, 3000);
  }
}

// 更新进度
function updateProgress(current, total, actualPage) {
  const percent = (current / total) * 100;
  progressFill.style.width = `${percent}%`;
  if (actualPage) {
    progressText.textContent = `正在收集第 ${actualPage} 页 (${current}/${total})...`;
  } else {
    progressText.textContent = `正在收集第 ${current}/${total} 页...`;
  }
}

// 显示收集的ASIN
function displayASINs() {
  if (collectedASINs.size === 0) {
    resultsDiv.style.display = "none";
    exportBtn.disabled = true;
    exportAllBtn.disabled = true;
    return;
  }

  resultsDiv.style.display = "block";
  
  // 计算未导出的ASIN数量
  const unexportedASINs = Array.from(collectedASINs).filter(asin => !exportedASINs.has(asin));
  const unexportedCount = unexportedASINs.length;
  
  // 更新显示文本
  asinCount.innerHTML = `
    <span style="color: #059669; font-weight: bold;">${collectedASINs.size}</span> 
    <span style="color: #6b7280; font-size: 12px;">
      (未导出: <span style="color: #dc2626; font-weight: bold;">${unexportedCount}</span>)
    </span>
  `;

  asinList.innerHTML = "";
  const asinArray = Array.from(collectedASINs);

  // 只显示前100个，避免列表过长
  const displayCount = Math.min(asinArray.length, 100);

  for (let i = 0; i < displayCount; i++) {
    const asin = asinArray[i];
    const div = document.createElement("div");
    div.className = "asin-item";
    
    // 标记已导出的ASIN
    const isExported = exportedASINs.has(asin);
    div.innerHTML = `
      <span style="color: ${isExported ? '#9ca3af' : '#374151'};">
        ${i + 1}. ${asin}
      </span>
      ${isExported ? '<span style="color: #059669; font-size: 11px; margin-left: 8px;">✓ 已导出</span>' : ''}
    `;
    
    if (isExported) {
      div.style.backgroundColor = '#f9fafb';
    }
    
    asinList.appendChild(div);
  }

  if (asinArray.length > 100) {
    const moreDiv = document.createElement("div");
    moreDiv.className = "asin-item";
    moreDiv.style.fontStyle = "italic";
    moreDiv.style.color = "#9ca3af";
    moreDiv.textContent = `... 还有 ${asinArray.length - 100} 个ASIN`;
    asinList.appendChild(moreDiv);
  }

  // 只有未导出的ASIN时才启用导出按钮
  exportBtn.disabled = unexportedCount === 0;
  exportAllBtn.disabled = collectedASINs.size === 0;
  
  // 更新导出按钮文本
  if (unexportedCount === 0) {
    exportBtn.textContent = "全部已导出";
  } else {
    exportBtn.textContent = `导出新增 (${unexportedCount})`;
  }
}

// 从存储中加载ASIN
async function loadASINs() {
  try {
    const result = await chrome.storage.local.get(["asins", "exportedAsins"]);
    if (result.asins && Array.isArray(result.asins)) {
      collectedASINs = new Set(result.asins);
    } else {
      collectedASINs = new Set();
    }
    
    if (result.exportedAsins && Array.isArray(result.exportedAsins)) {
      exportedASINs = new Set(result.exportedAsins);
    } else {
      exportedASINs = new Set();
    }
    
    displayASINs();
  } catch (error) {
    console.error("加载ASIN失败:", error);
    showStatus("加载数据失败", "error");
  }
}

// 保存ASIN到存储
async function saveASINs() {
  try {
    await chrome.storage.local.set({ 
      asins: Array.from(collectedASINs),
      exportedAsins: Array.from(exportedASINs)
    });
  } catch (error) {
    console.error("保存ASIN失败:", error);
    showStatus("保存数据失败", "error");
  }
}

// 开始收集
startBtn.addEventListener("click", async () => {
  if (isCollecting) return;

  const startPage = parseInt(startPageInput.value);
  const pageCount = parseInt(pageCountInput.value);

  if (!startPage || startPage < 1 || startPage > 100) {
    showStatus("请输入有效的起始页数 (1-100)", "error");
    return;
  }

  if (!pageCount || pageCount < 1 || pageCount > 100) {
    showStatus("请输入有效的收集页数 (1-100)", "error");
    return;
  }

  // 检查当前标签页是否是亚马逊搜索页面
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab.url.includes("amazon.") || !tab.url.includes("/s?")) {
    showStatus("请在亚马逊搜索结果页面使用此功能", "error");
    return;
  }

  isCollecting = true;
  startBtn.disabled = true;
  startBtn.textContent = "收集中...";
  progress.style.display = "block";
  showStatus(`准备从第 ${startPage} 页开始收集...`, "info");

  try {
    // 发送消息到content script开始收集
    const response = await chrome.tabs.sendMessage(tab.id, {
      action: "startCollection",
      startPage: startPage,
      pageCount: pageCount,
    });

    if (response.success) {
      // 监听收集进度
      chrome.runtime.onMessage.addListener(handleCollectionProgress);
    } else {
      throw new Error(response.error || "启动收集失败");
    }
  } catch (error) {
    showStatus(`错误: ${error.message}`, "error");
    resetCollectionState();
  }
});

// 处理收集进度消息
function handleCollectionProgress(message, sender, sendResponse) {
  if (message.action === "collectionProgress") {
    updateProgress(message.current, message.total, message.actualPage);

    if (message.asins && message.asins.length > 0) {
      message.asins.forEach((asin) => collectedASINs.add(asin));
      displayASINs();
      saveASINs();
    }
  } else if (message.action === "collectionComplete") {
    // 重新加载最新数据
    loadASINs().then(() => {
      showStatus(`收集完成！共收集到 ${collectedASINs.size} 个ASIN`, "success");
      resetCollectionState();
    });
    chrome.runtime.onMessage.removeListener(handleCollectionProgress);
  } else if (message.action === "collectionError") {
    showStatus(`收集出错: ${message.error}`, "error");
    resetCollectionState();
    chrome.runtime.onMessage.removeListener(handleCollectionProgress);
  }
}

// 重置收集状态
function resetCollectionState() {
  isCollecting = false;
  startBtn.disabled = false;
  startBtn.textContent = "开始收集";
  progress.style.display = "none";
  progressFill.style.width = "0%";
}

// 导出ASIN
exportBtn.addEventListener("click", async () => {
  // 先重新加载最新数据
  await loadASINs();

  // 计算未导出的ASIN
  const unexportedASINs = Array.from(collectedASINs).filter(asin => !exportedASINs.has(asin));
  
  if (unexportedASINs.length === 0) {
    showStatus("没有新的ASIN需要导出", "error");
    return;
  }

  try {
    const text = unexportedASINs.join("\n");
    const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = `amazon_asins_new_${new Date().getTime()}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);

    URL.revokeObjectURL(url);
    
    // 将导出的ASIN标记为已导出
    unexportedASINs.forEach(asin => exportedASINs.add(asin));
    await saveASINs();
    
    // 更新显示
    displayASINs();
    
    showStatus(`已导出 ${unexportedASINs.length} 个新ASIN`, "success");
  } catch (error) {
    console.error("导出失败:", error);
    showStatus("导出失败: " + error.message, "error");
  }
});

// 导出全部ASIN
exportAllBtn.addEventListener("click", async () => {
  // 先重新加载最新数据
  await loadASINs();

  if (collectedASINs.size === 0) {
    showStatus("没有可导出的数据", "error");
    return;
  }

  try {
    const asinArray = Array.from(collectedASINs);
    const text = asinArray.join("\n");
    const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = `amazon_asins_all_${new Date().getTime()}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);

    URL.revokeObjectURL(url);
    
    // 将所有ASIN标记为已导出
    collectedASINs.forEach(asin => exportedASINs.add(asin));
    await saveASINs();
    
    // 更新显示
    displayASINs();
    
    showStatus(`已导出全部 ${collectedASINs.size} 个ASIN`, "success");
  } catch (error) {
    console.error("导出失败:", error);
    showStatus("导出失败: " + error.message, "error");
  }
});

// 刷新数据
refreshBtn.addEventListener("click", async () => {
  showStatus("正在刷新数据...", "info");
  await loadASINs();
  await updateDebugInfo();
  showStatus("数据已刷新", "success");
});

// 清空数据
clearBtn.addEventListener("click", async () => {
  if (confirm("确定要清空所有收集的ASIN吗？")) {
    collectedASINs.clear();
    exportedASINs.clear();
    await chrome.storage.local.remove(["asins", "exportedAsins"]);
    displayASINs();
    await updateDebugInfo();
    exportBtn.disabled = true;
    exportAllBtn.disabled = true;
    showStatus("数据已清空", "success");
  }
});

// 重置导出状态
resetExportBtn.addEventListener("click", async () => {
  if (confirm("确定要重置导出状态吗？所有ASIN将被标记为未导出。")) {
    exportedASINs.clear();
    await saveASINs();
    displayASINs();
    await updateDebugInfo();
    showStatus("导出状态已重置", "success");
  }
});

// 监听存储变化
chrome.storage.onChanged.addListener((changes, namespace) => {
  if (namespace === "local" && (changes.asins || changes.exportedAsins)) {
    loadASINs();
  }
});

// 显示调试信息
async function updateDebugInfo() {
  const debugInfo = document.getElementById("debugInfo");
  const storageStatus = document.getElementById("storageStatus");

  if (!debugInfo || !storageStatus) return;

  try {
    const result = await chrome.storage.local.get(["asins", "exportedAsins"]);
    const totalCount = result.asins ? result.asins.length : 0;
    const exportedCount = result.exportedAsins ? result.exportedAsins.length : 0;
    const unexportedCount = totalCount - exportedCount;
    
    storageStatus.textContent = `已保存 ${totalCount} 个ASIN (已导出: ${exportedCount}, 未导出: ${unexportedCount})`;
    debugInfo.style.display = "block";
  } catch (error) {
    storageStatus.textContent = "读取失败";
    debugInfo.style.display = "block";
  }
}

// 初始化
loadASINs().then(() => {
  updateDebugInfo();
});
