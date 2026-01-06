/**
 * Amazon ASIN Collector - Background Service Worker
 * 
 * @version 1.2.0
 * @author Your Name
 * @license MIT
 * @description 后台服务，处理插件生命周期和消息转发
 */

const VERSION = '1.0.0';

// 监听插件安装
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    console.log(`Amazon ASIN Collector v${VERSION} 已安装`);
    // 可以在这里打开欢迎页面或设置默认配置
  } else if (details.reason === 'update') {
    console.log(`Amazon ASIN Collector 已更新到 v${VERSION}`);
  }
});

// 监听来自content script和popup的消息
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // 转发消息到popup（如果需要）
  if (message.action === 'collectionProgress' || 
      message.action === 'collectionComplete' || 
      message.action === 'collectionError') {
    // 这些消息会被popup直接接收，background只是记录日志
    console.log('收集状态更新:', message);
  }
  
  return true;
});

// 监听标签页更新，检测是否在亚马逊页面
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url) {
    const isAmazonSearch = tab.url.includes('amazon.') && tab.url.includes('/s?');
    
    if (isAmazonSearch) {
      // 可以在这里添加页面图标或其他提示
      console.log('检测到亚马逊搜索页面');
    }
  }
});

console.log('Amazon ASIN Collector - Background Service Worker 已启动');
