/**
 * Amazon ASIN Collector - Content Script
 * 
 * @version 1.2.0
 * @author Your Name
 * @license MIT
 * @description 自动收集亚马逊搜索结果中的产品ASIN
 */

let isCollecting = false;
let collectionAborted = false;
let floatingButton = null;
let collectedASINsInPage = new Set();

// 从产品链接中提取ASIN
function extractASIN(url) {
  // Amazon ASIN格式: /dp/ASIN 或 /gp/product/ASIN
  const patterns = [
    /\/dp\/([A-Z0-9]{10})/,
    /\/gp\/product\/([A-Z0-9]{10})/,
    /\/product\/([A-Z0-9]{10})/,
    /data-asin="([A-Z0-9]{10})"/
  ];
  
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) {
      return match[1];
    }
  }
  return null;
}

// 从当前页面收集ASIN
function collectASINsFromPage() {
  const asins = new Set();
  
  // 方法1: 从data-asin属性获取
  const elementsWithDataAsin = document.querySelectorAll('[data-asin]');
  elementsWithDataAsin.forEach(el => {
    const asin = el.getAttribute('data-asin');
    if (asin && asin.length === 10 && /^[A-Z0-9]{10}$/.test(asin)) {
      asins.add(asin);
    }
  });
  
  // 方法2: 从产品链接中提取
  const productLinks = document.querySelectorAll('a[href*="/dp/"], a[href*="/gp/product/"]');
  productLinks.forEach(link => {
    const asin = extractASIN(link.href);
    if (asin) {
      asins.add(asin);
    }
  });
  
  // 方法3: 从搜索结果项中提取
  const searchResults = document.querySelectorAll('[data-component-type="s-search-result"]');
  searchResults.forEach(result => {
    const asin = result.getAttribute('data-asin');
    if (asin && asin.length === 10 && /^[A-Z0-9]{10}$/.test(asin)) {
      asins.add(asin);
    }
  });
  
  return Array.from(asins);
}

// 查找下一页按钮
function findNextPageButton() {
  // 尝试多种选择器来找到下一页按钮
  const selectors = [
    'a.s-pagination-next',
    '.s-pagination-next',
    'a[aria-label*="下一页"]',
    'a[aria-label*="Next"]',
    '.a-pagination .a-last a',
    'li.a-last a'
  ];
  
  for (const selector of selectors) {
    const button = document.querySelector(selector);
    if (button && !button.classList.contains('a-disabled')) {
      return button;
    }
  }
  
  return null;
}

// 等待页面加载完成
function waitForPageLoad(timeout = 10000) {
  return new Promise((resolve, reject) => {
    const startTime = Date.now();
    
    const checkLoaded = setInterval(() => {
      // 检查搜索结果是否已加载
      const results = document.querySelectorAll('[data-component-type="s-search-result"]');
      
      if (results.length > 0) {
        clearInterval(checkLoaded);
        // 额外等待一点时间确保所有内容都加载完成
        setTimeout(() => resolve(), 500);
      } else if (Date.now() - startTime > timeout) {
        clearInterval(checkLoaded);
        reject(new Error('页面加载超时'));
      }
    }, 500);
  });
}

// 滚动页面以加载所有内容
async function scrollToLoadAll() {
  return new Promise((resolve) => {
    let lastHeight = document.body.scrollHeight;
    let scrollCount = 0;
    const maxScrolls = 5;
    
    const scrollInterval = setInterval(() => {
      window.scrollTo(0, document.body.scrollHeight);
      scrollCount++;
      
      setTimeout(() => {
        const newHeight = document.body.scrollHeight;
        if (newHeight === lastHeight || scrollCount >= maxScrolls) {
          clearInterval(scrollInterval);
          window.scrollTo(0, 0);
          resolve();
        }
        lastHeight = newHeight;
      }, 1000);
    }, 1000);
  });
}

// 保存ASIN到存储
async function saveASINsToStorage(newAsins) {
  try {
    const result = await chrome.storage.local.get(['asins']);
    const existingAsins = result.asins || [];
    const allAsins = [...new Set([...existingAsins, ...newAsins])];
    await chrome.storage.local.set({ asins: allAsins });
    return allAsins;
  } catch (error) {
    console.error('保存ASIN失败:', error);
    throw error;
  }
}

// 跳转到指定页数
async function navigateToPage(targetPage) {
  const currentUrl = new URL(window.location.href);
  const currentPageParam = currentUrl.searchParams.get('page');
  const currentPageNum = currentPageParam ? parseInt(currentPageParam) : 1;
  
  if (currentPageNum === targetPage) {
    return true; // 已经在目标页
  }
  
  // 设置页码参数
  currentUrl.searchParams.set('page', targetPage.toString());
  
  // 跳转到目标页
  window.location.href = currentUrl.toString();
  
  // 等待页面加载
  await waitForPageLoad(15000);
  
  return true;
}

// 开始收集流程
async function startCollection(pageCount, startPage = 1) {
  if (isCollecting) {
    return { success: false, error: '正在收集中，请勿重复操作' };
  }
  
  isCollecting = true;
  collectionAborted = false;
  updateFloatingButtonState(true);
  
  let currentPage = 1;
  let actualPage = startPage;
  const allASINs = new Set();
  
  try {
    // 如果起始页不是1，先跳转到起始页
    if (startPage > 1) {
      showNotification(`正在跳转到第 ${startPage} 页...`, 'info');
      await navigateToPage(startPage);
      actualPage = startPage;
    }
    
    while (currentPage <= pageCount && !collectionAborted) {
      // 滚动页面加载所有内容
      await scrollToLoadAll();
      
      // 收集当前页面的ASIN
      const asins = collectASINsFromPage();
      
      asins.forEach(asin => allASINs.add(asin));
      
      // 标记已采集的产品
      markCollectedProducts(asins);
      
      // 保存到存储
      await saveASINsToStorage(asins);
      
      // 发送进度更新
      chrome.runtime.sendMessage({
        action: 'collectionProgress',
        current: currentPage,
        total: pageCount,
        actualPage: actualPage,
        asins: asins
      });
      
      // 如果还有下一页，点击下一页按钮
      if (currentPage < pageCount) {
        const nextButton = findNextPageButton();
        
        if (!nextButton) {
          break;
        }
        
        // 点击下一页
        nextButton.click();
        
        // 等待新页面加载
        await waitForPageLoad();
        
        // 等待一小段时间避免请求过快
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
      
      currentPage++;
      actualPage++;
    }
    
    // 获取最终保存的所有ASIN
    const result = await chrome.storage.local.get(['asins']);
    const totalASINs = result.asins ? result.asins.length : allASINs.size;
    
    // 发送完成消息
    chrome.runtime.sendMessage({
      action: 'collectionComplete',
      totalASINs: totalASINs,
      pagesCollected: currentPage - 1
    });
    
    // 显示完成提示
    showNotification(`采集完成！共收集 ${totalASINs} 个ASIN`, 'success');
    
    return { success: true, totalASINs: totalASINs };
    
  } catch (error) {
    console.error('收集过程出错:', error);
    chrome.runtime.sendMessage({
      action: 'collectionError',
      error: error.message
    });
    showNotification(`采集出错: ${error.message}`, 'error');
    return { success: false, error: error.message };
  } finally {
    isCollecting = false;
    updateFloatingButtonState(false);
  }
}

// 显示通知
function showNotification(message, type = 'info') {
  const notification = document.createElement('div');
  notification.className = `asin-notification asin-notification-${type}`;
  notification.textContent = message;
  
  const style = document.createElement('style');
  style.textContent = `
    .asin-notification {
      position: fixed;
      top: 20px;
      right: 20px;
      z-index: 1000000;
      padding: 15px 20px;
      border-radius: 8px;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif;
      font-size: 14px;
      font-weight: 500;
      box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
      animation: slideIn 0.3s ease;
    }
    
    @keyframes slideIn {
      from {
        transform: translateX(400px);
        opacity: 0;
      }
      to {
        transform: translateX(0);
        opacity: 1;
      }
    }
    
    .asin-notification-success {
      background: #10b981;
      color: white;
    }
    
    .asin-notification-error {
      background: #ef4444;
      color: white;
    }
    
    .asin-notification-info {
      background: #3b82f6;
      color: white;
    }
  `;
  
  if (!document.getElementById('asin-notification-styles')) {
    style.id = 'asin-notification-styles';
    document.head.appendChild(style);
  }
  
  document.body.appendChild(notification);
  
  setTimeout(() => {
    notification.style.animation = 'slideIn 0.3s ease reverse';
    setTimeout(() => notification.remove(), 300);
  }, 3000);
}

// 监听来自popup的消息
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'startCollection') {
    const startPage = message.startPage || 1;
    const pageCount = message.pageCount || 5;
    
    startCollection(pageCount, startPage)
      .then(result => sendResponse(result))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true; // 保持消息通道开启以支持异步响应
  }
  
  if (message.action === 'stopCollection') {
    collectionAborted = true;
    sendResponse({ success: true });
  }
  
  if (message.action === 'collectSingleASIN') {
    collectSingleASIN(message.asin)
      .then(result => sendResponse(result))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }
});

// 创建浮动按钮
function createFloatingButton() {
  if (floatingButton) return;
  
  floatingButton = document.createElement('div');
  floatingButton.id = 'asin-collector-floating-btn';
  floatingButton.innerHTML = `
    <div class="asin-btn-content">
      <span class="asin-btn-icon">🛒</span>
      <span class="asin-btn-text">开始采集ASIN</span>
    </div>
  `;
  
  // 添加样式
  const style = document.createElement('style');
  style.textContent = `
    #asin-collector-floating-btn {
      position: fixed;
      bottom: 80px;
      right: 30px;
      z-index: 999999;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      padding: 12px 20px;
      border-radius: 50px;
      box-shadow: 0 4px 20px rgba(102, 126, 234, 0.4);
      cursor: pointer;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif;
      font-size: 14px;
      font-weight: 600;
      transition: all 0.3s ease;
      user-select: none;
    }
    
    #asin-collector-floating-btn:hover {
      transform: translateY(-2px);
      box-shadow: 0 6px 25px rgba(102, 126, 234, 0.5);
    }
    
    #asin-collector-floating-btn.collecting {
      background: linear-gradient(135deg, #f59e0b 0%, #ef4444 100%);
      animation: pulse 2s infinite;
    }
    
    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.8; }
    }
    
    .asin-btn-content {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    
    .asin-btn-icon {
      font-size: 18px;
    }
    
    .asin-btn-text {
      white-space: nowrap;
    }
    
    /* 已采集标记样式 */
    .asin-collected-badge {
      position: absolute;
      top: 10px;
      right: 10px;
      background: linear-gradient(135deg, #10b981 0%, #059669 100%);
      color: white;
      padding: 4px 10px;
      border-radius: 12px;
      font-size: 11px;
      font-weight: 600;
      z-index: 10;
      box-shadow: 0 2px 8px rgba(16, 185, 129, 0.3);
      display: flex;
      align-items: center;
      gap: 4px;
    }
    
    .asin-collected-badge::before {
      content: "✓";
      font-size: 12px;
    }
    
    /* 产品项高亮 */
    [data-component-type="s-search-result"].asin-collected {
      position: relative;
      outline: 2px solid #10b981;
      outline-offset: 2px;
      border-radius: 4px;
      background: rgba(16, 185, 129, 0.02);
    }
    
    /* 单个采集按钮样式 */
    .asin-single-collect-btn {
      position: absolute;
      top: 50px;
      right: 10px;
      z-index: 100;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      border: none;
      padding: 6px 12px;
      border-radius: 20px;
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;
      box-shadow: 0 2px 8px rgba(102, 126, 234, 0.3);
      transition: all 0.3s ease;
      display: flex;
      align-items: center;
      gap: 4px;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif;
    }
    
    .asin-single-collect-btn:hover {
      transform: translateY(-2px);
      box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
    }
    
    .asin-single-collect-btn:active {
      transform: translateY(0);
    }
    
    .asin-single-collect-btn:disabled {
      opacity: 0.6;
      cursor: not-allowed;
    }
    
    .asin-single-collect-btn.collected {
      background: linear-gradient(135deg, #10b981 0%, #059669 100%);
      cursor: default;
    }
    
    .asin-single-collect-btn.collected:hover {
      transform: none;
      box-shadow: 0 2px 8px rgba(16, 185, 129, 0.3);
    }
    
    .asin-single-collect-btn .btn-icon {
      font-size: 14px;
      line-height: 1;
    }
    
    .asin-single-collect-btn .btn-text {
      white-space: nowrap;
    }
  `;
  
  if (!document.getElementById('asin-collector-styles')) {
    style.id = 'asin-collector-styles';
    document.head.appendChild(style);
  }
  
  // 点击事件
  floatingButton.addEventListener('click', () => {
    if (isCollecting) {
      if (confirm('正在采集中，确定要停止吗？')) {
        collectionAborted = true;
      }
    } else {
      openCollectorPopup();
    }
  });
  
  document.body.appendChild(floatingButton);
}

// 更新浮动按钮状态
function updateFloatingButtonState(collecting) {
  if (!floatingButton) return;
  
  if (collecting) {
    floatingButton.classList.add('collecting');
    floatingButton.querySelector('.asin-btn-text').textContent = '采集中...';
    floatingButton.querySelector('.asin-btn-icon').textContent = '⏸️';
  } else {
    floatingButton.classList.remove('collecting');
    floatingButton.querySelector('.asin-btn-text').textContent = '开始采集ASIN';
    floatingButton.querySelector('.asin-btn-icon').textContent = '🛒';
  }
}

// 打开采集弹窗
function openCollectorPopup() {
  const startPage = prompt('请输入起始页数 (1-100):', '1');
  if (startPage === null) return;
  
  const start = parseInt(startPage);
  if (!start || start < 1 || start > 100) {
    alert('请输入有效的起始页数 (1-100)');
    return;
  }
  
  const pageCount = prompt('请输入要采集的页数 (1-100):', '5');
  if (pageCount === null) return;
  
  const count = parseInt(pageCount);
  if (!count || count < 1 || count > 100) {
    alert('请输入有效的页数 (1-100)');
    return;
  }
  
  startCollection(count, start);
}

// 单个产品采集
async function collectSingleASIN(asin) {
  if (!asin) return { success: false, error: 'ASIN无效' };
  
  try {
    // 保存到存储
    await saveASINsToStorage([asin]);
    
    // 添加到当前页面集合
    collectedASINsInPage.add(asin);
    
    // 标记产品
    markCollectedProducts([asin]);
    
    // 发送消息通知popup更新
    chrome.runtime.sendMessage({
      action: 'singleASINCollected',
      asin: asin
    });
    
    showNotification(`已采集 ASIN: ${asin}`, 'success');
    
    return { success: true, asin: asin };
  } catch (error) {
    console.error('采集单个ASIN失败:', error);
    showNotification(`采集失败: ${error.message}`, 'error');
    return { success: false, error: error.message };
  }
}

// 添加单个采集按钮到产品
function addSingleCollectButtons() {
  const searchResults = document.querySelectorAll('[data-component-type="s-search-result"]');
  
  searchResults.forEach(result => {
    const asin = result.getAttribute('data-asin');
    if (!asin || result.querySelector('.asin-single-collect-btn')) return;
    
    const isCollected = collectedASINsInPage.has(asin);
    
    // 创建采集按钮
    const collectBtn = document.createElement('button');
    collectBtn.className = `asin-single-collect-btn ${isCollected ? 'collected' : ''}`;
    collectBtn.innerHTML = isCollected ? 
      '<span class="btn-icon">✓</span><span class="btn-text">已采集</span>' : 
      '<span class="btn-icon">+</span><span class="btn-text">采集</span>';
    collectBtn.title = isCollected ? `已采集: ${asin}` : `采集 ASIN: ${asin}`;
    
    // 点击事件
    collectBtn.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      
      if (isCollected) {
        showNotification(`ASIN ${asin} 已经采集过了`, 'info');
        return;
      }
      
      collectBtn.disabled = true;
      collectBtn.innerHTML = '<span class="btn-icon">⏳</span><span class="btn-text">采集中...</span>';
      
      const result = await collectSingleASIN(asin);
      
      if (result.success) {
        collectBtn.classList.add('collected');
        collectBtn.innerHTML = '<span class="btn-icon">✓</span><span class="btn-text">已采集</span>';
        collectBtn.title = `已采集: ${asin}`;
      } else {
        collectBtn.disabled = false;
        collectBtn.innerHTML = '<span class="btn-icon">+</span><span class="btn-text">采集</span>';
      }
    });
    
    // 找到合适的位置插入按钮
    const imageContainer = result.querySelector('.s-image');
    if (imageContainer && imageContainer.parentElement) {
      imageContainer.parentElement.style.position = 'relative';
      imageContainer.parentElement.appendChild(collectBtn);
    }
  });
}

// 标记已采集的产品
function markCollectedProducts(asins) {
  if (!asins || asins.length === 0) return;
  
  asins.forEach(asin => collectedASINsInPage.add(asin));
  
  // 查找并标记产品
  const searchResults = document.querySelectorAll('[data-component-type="s-search-result"]');
  
  searchResults.forEach(result => {
    const asin = result.getAttribute('data-asin');
    
    if (asin && collectedASINsInPage.has(asin)) {
      // 添加已采集类名
      result.classList.add('asin-collected');
      
      // 如果还没有标记徽章，添加一个
      if (!result.querySelector('.asin-collected-badge')) {
        const badge = document.createElement('div');
        badge.className = 'asin-collected-badge';
        badge.textContent = '已采集';
        
        // 找到产品图片容器
        const imageContainer = result.querySelector('.s-image');
        if (imageContainer && imageContainer.parentElement) {
          imageContainer.parentElement.style.position = 'relative';
          imageContainer.parentElement.appendChild(badge);
        }
      }
      
      // 更新单个采集按钮状态
      const collectBtn = result.querySelector('.asin-single-collect-btn');
      if (collectBtn && !collectBtn.classList.contains('collected')) {
        collectBtn.classList.add('collected');
        collectBtn.innerHTML = '<span class="btn-icon">✓</span><span class="btn-text">已采集</span>';
        collectBtn.title = `已采集: ${asin}`;
      }
    }
  });
}

// 加载已采集的ASIN
async function loadCollectedASINs() {
  try {
    const result = await chrome.storage.local.get(['asins']);
    if (result.asins && Array.isArray(result.asins)) {
      collectedASINsInPage = new Set(result.asins);
      markCollectedProducts(result.asins);
      addSingleCollectButtons();
    }
  } catch (error) {
    console.error('加载已采集ASIN失败:', error);
  }
}

// 检查是否在亚马逊搜索页面
function isAmazonSearchPage() {
  return window.location.href.includes('amazon.') && 
         (window.location.href.includes('/s?') || 
          window.location.href.includes('/s/'));
}

// 页面加载完成后的初始化
function initializePage() {
  if (isAmazonSearchPage()) {
    createFloatingButton();
    loadCollectedASINs();
    
    // 监听DOM变化，为动态加载的产品添加按钮
    const observer = new MutationObserver(() => {
      addSingleCollectButtons();
    });
    
    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
  }
}

// 监听页面变化（SPA导航）
let lastUrl = location.href;
new MutationObserver(() => {
  const url = location.href;
  if (url !== lastUrl) {
    lastUrl = url;
    
    // 移除旧按钮
    if (floatingButton) {
      floatingButton.remove();
      floatingButton = null;
    }
    
    // 重新初始化
    setTimeout(initializePage, 1000);
  }
}).observe(document, { subtree: true, childList: true });

// 初始化
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializePage);
} else {
  initializePage();
}
