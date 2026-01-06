// 1688选品工具 - 后台脚本
// 防止重复初始化
if (typeof self.BackgroundService !== 'undefined') {
    console.log('后台服务已经初始化，跳过重复加载');
} else {

class BackgroundService {
    constructor() {
        this.init();
    }

    init() {
        // 监听扩展安装
        chrome.runtime.onInstalled.addListener((details) => {
            if (details.reason === 'install') {
                this.onInstall();
            } else if (details.reason === 'update') {
                this.onUpdate(details.previousVersion);
            }
        });

        // 监听来自内容脚本和popup的消息
        chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
            this.handleMessage(request, sender, sendResponse);
            return true; // 保持消息通道开放
        });

        // 监听标签页更新
        chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
            if (changeInfo.status === 'complete' && tab.url && tab.url.includes('1688.com')) {
                this.onTabUpdated(tabId, tab);
            }
        });

        // 监听存储变化
        chrome.storage.onChanged.addListener((changes, namespace) => {
            this.onStorageChanged(changes, namespace);
        });
    }

    // 扩展安装时的处理
    async onInstall() {
        console.log('1688选品工具已安装');
        
        // 初始化存储
        await chrome.storage.local.set({
            products: [],
            stats: {
                totalProducts: 0,
                currentPage: 0,
                avgPrice: 0
            },
            settings: {
                autoCollect: false,
                collectImages: true,
                maxProducts: 1000,
                exportFormat: 'csv'
            }
        });

        // 显示欢迎页面
        chrome.tabs.create({
            url: chrome.runtime.getURL('welcome.html')
        });
    }

    // 扩展更新时的处理
    async onUpdate(previousVersion) {
        console.log(`1688选品工具已更新: ${previousVersion} -> ${chrome.runtime.getManifest().version}`);
        
        // 这里可以处理数据迁移等逻辑
        await this.migrateData(previousVersion);
    }

    // 处理消息
    async handleMessage(request, sender, sendResponse) {
        try {
            switch (request.action) {
                case 'contentScriptReady':
                    console.log('Content script已准备就绪:', request.url);
                    sendResponse({ success: true });
                    break;

                case 'getProducts':
                    const result = await chrome.storage.local.get(['products']);
                    sendResponse({ success: true, products: result.products || [] });
                    break;

                case 'saveProduct':
                    await this.saveProduct(request.product);
                    sendResponse({ success: true });
                    break;

                case 'deleteProduct':
                    await this.deleteProduct(request.productId);
                    sendResponse({ success: true });
                    break;

                case 'exportData':
                    const exportResult = await this.exportData(request.format);
                    sendResponse(exportResult);
                    break;

                case 'getStats':
                    const stats = await this.getStats();
                    sendResponse({ success: true, stats });
                    break;

                case 'updateSettings':
                    await this.updateSettings(request.settings);
                    sendResponse({ success: true });
                    break;

                default:
                    sendResponse({ success: false, message: '未知操作' });
            }
        } catch (error) {
            console.error('处理消息失败:', error);
            sendResponse({ success: false, message: error.message });
        }
    }

    // 标签页更新处理
    async onTabUpdated(tabId, tab) {
        try {
            // 检查是否是1688相关页面
            if (this.is1688Page(tab.url)) {
                // 更新图标状态
                await this.updateIcon(tabId, 'active');
            }
        } catch (error) {
            console.error('标签页更新处理失败:', error);
        }
    }

    // 存储变化处理
    onStorageChanged(changes, namespace) {
        if (namespace === 'local') {
            // 如果产品数据发生变化，更新统计信息
            if (changes.products) {
                this.updateStats();
            }
        }
    }

    // 检查是否是1688页面
    is1688Page(url) {
        return url && (url.includes('1688.com') || url.includes('alibaba.com'));
    }

    // 更新图标状态
    async updateIcon(tabId, status) {
        const iconPath = status === 'active' 
            ? 'icons/icon32.png' 
            : 'icons/icon32-gray.png';
        
        try {
            await chrome.action.setIcon({
                tabId,
                path: iconPath
            });
        } catch (error) {
            console.debug('更新图标失败:', error);
        }
    }

    // 保存单个商品
    async saveProduct(product) {
        const result = await chrome.storage.local.get(['products']);
        const products = result.products || [];
        
        // 检查是否已存在（基于URL去重）
        const existingIndex = products.findIndex(p => p.url === product.url);
        
        if (existingIndex >= 0) {
            // 更新现有商品
            products[existingIndex] = { ...products[existingIndex], ...product };
        } else {
            // 添加新商品
            products.push({
                ...product,
                id: this.generateId(),
                collectTime: new Date().toISOString()
            });
        }
        
        await chrome.storage.local.set({ products });
        await this.updateStats();
    }

    // 删除商品
    async deleteProduct(productId) {
        const result = await chrome.storage.local.get(['products']);
        const products = result.products || [];
        
        const filteredProducts = products.filter(p => p.id !== productId);
        await chrome.storage.local.set({ products: filteredProducts });
        await this.updateStats();
    }

    // 导出数据
    async exportData(format = 'csv') {
        try {
            const result = await chrome.storage.local.get(['products']);
            const products = result.products || [];
            
            if (products.length === 0) {
                return { success: false, message: '暂无数据可导出' };
            }

            let exportData;
            let filename;
            let mimeType;

            switch (format) {
                case 'json':
                    exportData = JSON.stringify(products, null, 2);
                    filename = `1688选品数据_${this.getDateString()}.json`;
                    mimeType = 'application/json';
                    break;
                
                case 'csv':
                default:
                    exportData = this.convertToCSV(products);
                    filename = `1688选品数据_${this.getDateString()}.csv`;
                    mimeType = 'text/csv';
                    break;
            }

            return {
                success: true,
                data: exportData,
                filename,
                mimeType
            };
        } catch (error) {
            return { success: false, message: error.message };
        }
    }

    // 转换为CSV格式
    convertToCSV(products) {
        const headers = ['ID', '商品标题', '价格', '最小订购量', '供应商', '商品链接', '图片链接', '收集时间', '来源'];
        const csvRows = [headers.join(',')];
        
        products.forEach(product => {
            const row = [
                product.id || '',
                `"${(product.title || '').replace(/"/g, '""')}"`,
                `"${product.price || ''}"`,
                `"${product.minOrder || ''}"`,
                `"${(product.supplier || '').replace(/"/g, '""')}"`,
                `"${product.url || ''}"`,
                `"${product.imageUrl || ''}"`,
                `"${product.collectTime || ''}"`,
                `"${product.source || ''}"`
            ];
            csvRows.push(row.join(','));
        });
        
        return csvRows.join('\n');
    }

    // 获取统计信息
    async getStats() {
        const result = await chrome.storage.local.get(['products', 'stats']);
        const products = result.products || [];
        
        const stats = {
            totalProducts: products.length,
            todayProducts: this.getTodayProductsCount(products),
            avgPrice: this.calculateAveragePrice(products),
            topSuppliers: this.getTopSuppliers(products),
            priceRanges: this.getPriceRanges(products)
        };
        
        return stats;
    }

    // 更新统计信息
    async updateStats() {
        const stats = await this.getStats();
        await chrome.storage.local.set({ stats });
    }

    // 更新设置
    async updateSettings(newSettings) {
        const result = await chrome.storage.local.get(['settings']);
        const currentSettings = result.settings || {};
        
        const updatedSettings = { ...currentSettings, ...newSettings };
        await chrome.storage.local.set({ settings: updatedSettings });
    }

    // 数据迁移
    async migrateData(previousVersion) {
        // 根据版本进行数据迁移
        console.log(`从版本 ${previousVersion} 迁移数据`);
        
        // 这里可以添加具体的迁移逻辑
    }

    // 辅助方法
    generateId() {
        return Date.now().toString(36) + Math.random().toString(36).substr(2);
    }

    getDateString() {
        return new Date().toISOString().split('T')[0];
    }

    getTodayProductsCount(products) {
        const today = new Date().toDateString();
        return products.filter(p => {
            const collectDate = new Date(p.collectTime).toDateString();
            return collectDate === today;
        }).length;
    }

    calculateAveragePrice(products) {
        const prices = products
            .map(p => this.extractPrice(p.price))
            .filter(price => price > 0);
        
        return prices.length > 0 
            ? Math.round(prices.reduce((sum, price) => sum + price, 0) / prices.length)
            : 0;
    }

    extractPrice(priceStr) {
        if (!priceStr) return 0;
        const match = priceStr.match(/[\d,]+\.?\d*/);
        return match ? parseFloat(match[0].replace(/,/g, '')) : 0;
    }

    getTopSuppliers(products) {
        const supplierCount = {};
        products.forEach(p => {
            if (p.supplier) {
                supplierCount[p.supplier] = (supplierCount[p.supplier] || 0) + 1;
            }
        });
        
        return Object.entries(supplierCount)
            .sort(([,a], [,b]) => b - a)
            .slice(0, 5)
            .map(([supplier, count]) => ({ supplier, count }));
    }

    getPriceRanges(products) {
        const ranges = {
            '0-50': 0,
            '50-100': 0,
            '100-500': 0,
            '500-1000': 0,
            '1000+': 0
        };
        
        products.forEach(p => {
            const price = this.extractPrice(p.price);
            if (price <= 50) ranges['0-50']++;
            else if (price <= 100) ranges['50-100']++;
            else if (price <= 500) ranges['100-500']++;
            else if (price <= 1000) ranges['500-1000']++;
            else ranges['1000+']++;
        });
        
        return ranges;
    }
}

// 初始化后台服务并标记为已加载
self.BackgroundService = BackgroundService;
new BackgroundService();

}