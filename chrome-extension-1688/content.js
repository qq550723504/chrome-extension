// 1688商品ID收集器 - 完全动态版本
if (typeof window.ProductIdCollector === 'undefined') {

window.ProductIdCollector = class ProductIdCollector {
    constructor() {
        this.isShopPage = false;
        this.collectedData = []; // 本地存储收集的数据
        this.messageListener = null;
        console.log('🚀 [Content] ProductIdCollector 初始化');
        this.init();
    }

    init() {
        console.log('🔧 [Content] 开始初始化');
        this.detectPageType();
        
        if (this.isShopPage) {
            console.log('🏪 [Content] 检测到店铺页面');
            
            // 注入页面脚本
            this.injectPageScript();
            
            // 设置消息监听器
            this.setupMessageListener();
            
            // 延迟触发数据检查
            setTimeout(() => {
                this.triggerDataCheck();
            }, 1000);
        }

        // 监听来自popup的消息
        chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
            console.log('📨 [Content] 收到消息:', request.action, request);
            
            if (request.action === 'collectProductIds') {
                console.log('🎯 [Content] 开始处理收集请求');
                this.collectProductIds(request).then(result => {
                    console.log('📊 [Content] 收集结果:', result);
                    sendResponse(result);
                }).catch(error => {
                    console.error('❌ [Content] 收集失败:', error);
                    sendResponse({ success: false, message: error.message });
                });
                return true; // 保持消息通道开放
            }
            
            if (request.action === 'ping') {
                const response = { 
                    success: true, 
                    message: 'Content script正常运行',
                    pageType: this.isShopPage ? 'shop' : 'search',
                    collectedDataCount: this.collectedData.length
                };
                console.log('🏓 [Content] Ping响应:', response);
                sendResponse(response);
                return true;
            }
        });
        
        console.log('✅ [Content] 初始化完成');
    }

    // 注入页面脚本
    injectPageScript() {
        console.log('🔧 [Content] 注入页面脚本');
        
        try {
            const script = document.createElement('script');
            script.src = chrome.runtime.getURL('page-script.js');
            script.onload = () => {
                console.log('✅ [Content] 页面脚本加载成功');
                script.remove();
            };
            script.onerror = () => {
                console.error('❌ [Content] 页面脚本加载失败');
                script.remove();
            };
            
            (document.head || document.documentElement).appendChild(script);
        } catch (error) {
            console.error('❌ [Content] 注入页面脚本失败:', error);
        }
    }

    // 设置消息监听器
    setupMessageListener() {
        if (this.messageListener) {
            window.removeEventListener('message', this.messageListener);
        }
        
        this.messageListener = (event) => {
            if (event.source !== window) return;
            
            if (event.data.type === 'SHOP_PRODUCT_DATA_RESPONSE' && event.data.productIds) {
                this.collectedData = [...new Set([...this.collectedData, ...event.data.productIds])];
                console.log(`✅ [Content] 已接收${event.data.productIds.length}个商品ID`);
            }
            
            if (event.data.type === 'SHOP_PRODUCT_DATA_UPDATE' && event.data.productIds) {
                this.collectedData = [...new Set([...this.collectedData, ...event.data.productIds])];
                console.log(`✅ [Content] 已更新${event.data.productIds.length}个商品ID`);
            }
            
            if (event.data.type === 'ALL_PAGES_COLLECTION_COMPLETE') {
                this.collectedData = [...new Set([...this.collectedData, ...event.data.productIds])];
            }
        };
        
        window.addEventListener('message', this.messageListener);
    }
    
    // 主动触发数据检查
    triggerDataCheck() {
        console.log('🔍 [Content] 主动触发数据检查');
        
        window.postMessage({
            type: 'CHECK_SHOP_PRODUCT_DATA',
            source: 'content-script'
        }, '*');
    }

    // 检测页面类型
    detectPageType() {
        const url = window.location.href;
        console.log('🔍 [Content] 检测页面类型:', url);
        
        const shopPagePatterns = [
            /https:\/\/[^.]+\.1688\.com\/page\/offerlist/,
            /https:\/\/shop\d+\.1688\.com/,
            /https:\/\/[^.]+\.1688\.com\/.*shop/
        ];
        
        this.isShopPage = shopPagePatterns.some(pattern => pattern.test(url));
        console.log(`🏷️ [Content] 页面类型: ${this.isShopPage ? '🏪店铺页面' : '🔍搜索结果页面'}`);
    }

    async collectProductIds(request = {}) {
        try {
            if (this.isShopPage) {
                // 检查是否要收集所有页面
                if (request.collectAllPages) {
                    return await this.collectAllShopPages(request.totalPages || 5);
                } else {
                    return await this.collectShopPageIds();
                }
            } else {
                return await this.collectSearchPageIds();
            }
        } catch (error) {
            return { success: false, message: '收集失败: ' + error.message };
        }
    }
    
    // 收集所有店铺页面商品ID
    async collectAllShopPages(totalPages = 5) {
        console.log(`🚀 [Content] 开始收集所有${totalPages}页商品ID`);
        
        // 清空之前的数据
        this.collectedData = [];
        
        // 发送消息给页面脚本开始收集所有页面
        window.postMessage({
            type: 'COLLECT_ALL_PAGES',
            source: 'content-script',
            totalPages: totalPages
        }, '*');
        
        // 等待收集完成
        return new Promise((resolve) => {
            const timeout = setTimeout(() => {
                resolve({
                    success: false,
                    message: '收集超时，请重试'
                });
            }, totalPages * 10000); // 每页10秒超时
            
            const completeListener = (event) => {
                if (event.source !== window) return;
                
                if (event.data.type === 'ALL_PAGES_COLLECTION_COMPLETE') {
                    clearTimeout(timeout);
                    window.removeEventListener('message', completeListener);
                    
                    const validIds = this.collectedData.filter(id => this.isValidProductId(id));
                    const uniqueIds = [...new Set(validIds)];
                    
                    if (uniqueIds.length > 0) {
                        this.saveProductIds(uniqueIds).then(() => {
                            resolve({
                                success: true,
                                count: uniqueIds.length,
                                message: `成功收集所有${totalPages}页，共${uniqueIds.length}个商品ID`,
                                ids: uniqueIds
                            });
                        }).catch(() => {
                            resolve({
                                success: true,
                                count: uniqueIds.length,
                                message: `成功收集所有${totalPages}页，共${uniqueIds.length}个商品ID（保存失败）`,
                                ids: uniqueIds
                            });
                        });
                    } else {
                        resolve({
                            success: false,
                            message: '未能收集到有效的商品ID'
                        });
                    }
                }
            };
            
            window.addEventListener('message', completeListener);
        });
    }

    // 收集店铺页面商品ID
    async collectShopPageIds() {
        console.log('🏪 [Content] 开始收集店铺页面商品ID');
        
        // 首先检查是否已经有收集好的数据
        if (this.collectedData && this.collectedData.length > 0) {
            console.log('✅ [Content] 使用已收集的数据:', this.collectedData.length, '个商品ID');
            
            const validIds = this.collectedData.filter(id => this.isValidProductId(id));
            const uniqueIds = [...new Set(validIds)];
            
            if (uniqueIds.length > 0) {
                try {
                    await this.saveProductIds(uniqueIds);
                    return {
                        success: true,
                        count: uniqueIds.length,
                        message: `店铺页面成功收集 ${uniqueIds.length} 个商品ID`,
                        ids: uniqueIds
                    };
                } catch (error) {
                    return {
                        success: true,
                        count: uniqueIds.length,
                        message: `店铺页面成功收集 ${uniqueIds.length} 个商品ID（保存失败）`,
                        ids: uniqueIds
                    };
                }
            }
        }
        
        // 如果没有已收集的数据，主动触发收集
        console.log('ℹ️ [Content] 没有已收集的数据，主动触发收集');
        this.triggerDataCheck();
        
        // 等待数据收集完成
        await new Promise(resolve => setTimeout(resolve, 3000));
        
        const validIds = this.collectedData.filter(id => this.isValidProductId(id));
        const uniqueIds = [...new Set(validIds)];
        
        if (uniqueIds.length > 0) {
            try {
                await this.saveProductIds(uniqueIds);
                return {
                    success: true,
                    count: uniqueIds.length,
                    message: `店铺页面成功收集 ${uniqueIds.length} 个商品ID`,
                    ids: uniqueIds
                };
            } catch (error) {
                return {
                    success: true,
                    count: uniqueIds.length,
                    message: `店铺页面成功收集 ${uniqueIds.length} 个商品ID（保存失败）`,
                    ids: uniqueIds
                };
            }
        }
        
        return {
            success: false,
            message: '未能收集到有效的商品ID，请刷新页面重试'
        };
    }

    // 验证商品ID
    isValidProductId(id) {
        if (!id) return false;
        const idStr = id.toString();
        
        // 必须是12-13位数字
        if (!/^\d{12,13}$/.test(idStr)) return false;
        
        // 排除明显无效的ID模式
        const invalidPatterns = [
            /^000000000/,     // 以9个0开头
            /^111111111/,     // 以9个1开头
            /^999999999/,     // 以9个9开头
            /^2213887014416/, // 店铺ID
            /^1234567/,       // 测试ID
            /^9876543/,       // 测试ID
            /^1624614382/,    // 时间戳ID (用户指出的错误ID)
            /^2221314611/,    // 系统ID (用户指出的错误ID)
        ];
        
        // 检查是否匹配无效模式
        if (invalidPatterns.some(pattern => pattern.test(idStr))) {
            return false;
        }
        
        return true;
    }

    // 保存商品ID
    async saveProductIds(productIds) {
        if (!productIds || productIds.length === 0) return;
        
        try {
            const result = await chrome.storage.local.get(['productData']);
            const existingData = result.productData || { ids: [], exportedIds: [], stats: {} };
            
            const existingIds = existingData.ids || [];
            const uniqueNewIds = productIds.filter(id => !existingIds.includes(id));
            const allIds = [...existingIds, ...uniqueNewIds];
            
            const updatedData = {
                ids: allIds,
                exportedIds: existingData.exportedIds || [],
                stats: {
                    totalIds: allIds.length,
                    exportedCount: existingData.exportedIds?.length || 0,
                    lastCollectTime: new Date().toISOString(),
                    lastCollectCount: uniqueNewIds.length,
                    source: 'shop_page'
                }
            };
            
            await chrome.storage.local.set({ productData: updatedData });
            console.log('✅ [Content] 商品ID保存成功');
            
        } catch (error) {
            console.error('❌ [Content] 保存失败:', error);
        }
    }

    // 收集搜索结果页面商品ID
    async collectSearchPageIds() {
        console.log('🔍 [Content] 收集搜索结果页面商品ID');
        
        const productIds = [];
        const renderKeyElements = document.querySelectorAll('[data-renderkey]');
        
        renderKeyElements.forEach((el) => {
            const renderKey = el.getAttribute('data-renderkey');
            if (renderKey) {
                const longNumbers = renderKey.match(/\d{12,13}/g);
                if (longNumbers && longNumbers.length > 0) {
                    const productId = longNumbers[longNumbers.length - 1];
                    if (this.isValidProductId(productId) && !productIds.includes(productId)) {
                        productIds.push(productId);
                    }
                }
            }
        });
        
        if (productIds.length > 0) {
            await this.saveProductIds(productIds);
            return {
                success: true,
                count: productIds.length,
                message: `搜索页面成功收集 ${productIds.length} 个商品ID`
            };
        } else {
            return {
                success: false,
                message: '未找到商品ID'
            };
        }
    }
};

} // 结束 if (typeof window.ProductIdCollector === 'undefined')

// 初始化收集器
if (!window.productIdCollectorInstance) {
    window.productIdCollectorInstance = new window.ProductIdCollector();
}