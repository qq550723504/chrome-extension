// 1688商品ID收集工具 - 后台脚本
class BackgroundService {
    constructor() {
        this.init();
    }

    init() {
        // 监听扩展安装
        chrome.runtime.onInstalled.addListener((details) => {
            if (details.reason === 'install') {
                this.onInstall();
            }
        });

        // 监听来自内容脚本和popup的消息
        chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
            this.handleMessage(request, sender, sendResponse);
            return true; // 保持消息通道开放
        });
    }

    // 扩展安装时的处理
    async onInstall() {
        console.log('1688商品ID收集工具已安装');
        
        // 初始化存储
        await chrome.storage.local.set({
            productData: {
                ids: [],
                exportedIds: [],
                stats: {
                    totalIds: 0,
                    exportedCount: 0,
                    lastCollectTime: null,
                    lastExportTime: null,
                    lastCollectCount: 0
                }
            }
        });
    }

    // 处理消息
    async handleMessage(request, sender, sendResponse) {
        try {
            switch (request.action) {
                case 'ping':
                    sendResponse({ success: true, message: 'Background script正常运行' });
                    break;

                default:
                    sendResponse({ success: false, message: '未知操作' });
            }
        } catch (error) {
            console.error('处理消息失败:', error);
            sendResponse({ success: false, message: error.message });
        }
    }
}

// 初始化后台服务
new BackgroundService();