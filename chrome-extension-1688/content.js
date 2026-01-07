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
            
            // 立即注入页面脚本（在页面加载早期）
            this.injectPageScriptEarly();
            
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
            
            if (request.action === 'collectMultipleSearchPages') {
                console.log('🔄 [Content] 开始处理多页收集请求');
                this.collectMultipleSearchPages(request).then(result => {
                    console.log('📊 [Content] 多页收集结果:', result);
                    sendResponse(result);
                }).catch(error => {
                    console.error('❌ [Content] 多页收集失败:', error);
                    sendResponse({ success: false, message: error.message });
                });
                return true; // 保持消息通道开放
            }
            
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
            
            if (request.action === 'saveCollectedIds') {
                console.log('💾 [Content] 开始处理保存请求');
                this.saveProductIds(request.ids).then(() => {
                    console.log('✅ [Content] 保存完成');
                    sendResponse({ success: true, message: '保存成功' });
                }).catch(error => {
                    console.error('❌ [Content] 保存失败:', error);
                    sendResponse({ success: false, message: error.message });
                });
                return true; // 保持消息通道开放
            }
            
            if (request.action === 'goToNextPage') {
                console.log('🔄 [Content] 开始处理翻页请求');
                this.goToNextPage(request).then(result => {
                    console.log('📄 [Content] 翻页结果:', result);
                    sendResponse(result);
                }).catch(error => {
                    console.error('❌ [Content] 翻页失败:', error);
                    sendResponse({ success: false, message: error.message });
                });
                return true; // 保持消息通道开放
            }
            
            if (request.action === 'getCurrentPageInfo') {
                console.log('📍 [Content] 获取当前页面信息');
                const currentPage = this.getCurrentPageNumber();
                sendResponse({ 
                    success: true, 
                    currentPage: currentPage,
                    message: `当前在第${currentPage}页`
                });
                return true;
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
        
        // 检查是否有未完成的多页收集任务
        this.checkPendingMultiPageCollection();
    }

    // 检查未完成的多页收集任务
    async checkPendingMultiPageCollection() {
        try {
            console.log('🔍 [Content] 检查是否有未完成的多页收集任务');
            
            // 获取所有storage中的数据
            const allData = await chrome.storage.local.get(null);
            
            // 查找多页收集任务
            for (const [key, value] of Object.entries(allData)) {
                if (key.startsWith('multiPageCollection_') && value && typeof value === 'object') {
                    console.log('🔄 [Content] 发现未完成的多页收集任务:', key, value);
                    
                    // 延迟3秒后继续执行，确保页面完全加载
                    setTimeout(async () => {
                        try {
                            console.log('🚀 [Content] 继续执行多页收集任务');
                            const result = await this.processMultiPageCollection(key);
                            console.log('📊 [Content] 继续收集结果:', result);
                        } catch (error) {
                            console.error('❌ [Content] 继续收集失败:', error);
                            // 清理失败的任务
                            await chrome.storage.local.remove([key]);
                        }
                    }, 3000);
                    
                    break; // 只处理第一个找到的任务
                }
            }
        } catch (error) {
            console.error('❌ [Content] 检查未完成任务失败:', error);
        }
    }

    // 早期注入页面脚本 - 确保在API请求之前设置拦截器
    injectPageScriptEarly() {
        console.log('🚀 [Content] 早期注入页面脚本');
        
        try {
            // 创建脚本元素
            const script = document.createElement('script');
            script.src = chrome.runtime.getURL('page-script.js');
            
            // 设置为立即执行
            script.async = false;
            script.defer = false;
            
            script.onload = () => {
                console.log('✅ [Content] 页面脚本早期加载成功');
                script.remove();
            };
            
            script.onerror = () => {
                console.error('❌ [Content] 页面脚本早期加载失败');
                script.remove();
                // 如果早期注入失败，回退到普通注入
                setTimeout(() => this.injectPageScript(), 100);
            };
            
            // 尝试注入到document.documentElement（更早的时机）
            if (document.documentElement) {
                document.documentElement.appendChild(script);
            } else {
                // 如果documentElement还不存在，等待DOM ready
                if (document.readyState === 'loading') {
                    document.addEventListener('DOMContentLoaded', () => {
                        (document.head || document.documentElement).appendChild(script);
                    });
                } else {
                    (document.head || document.documentElement).appendChild(script);
                }
            }
            
        } catch (error) {
            console.error('❌ [Content] 早期注入页面脚本失败:', error);
            // 回退到普通注入
            setTimeout(() => this.injectPageScript(), 100);
        }
    }

    // 注入页面脚本 - 备用方案
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

    // 收集多页搜索结果 - 使用storage保持状态
    async collectMultipleSearchPages(request) {
        const pageCount = request.pageCount || 1;
        console.log(`🚀 [Content] 开始多页收集，目标页数: ${pageCount}`);
        
        // 获取当前页码
        const currentPageNum = this.getCurrentPageNumber();
        console.log(`📍 [Content] 当前页码: ${currentPageNum}`);
        
        // 使用storage保存收集状态
        const collectionKey = `multiPageCollection_${Date.now()}`;
        const collectionState = {
            startPage: currentPageNum,
            targetPageCount: pageCount,
            currentIndex: 0,
            collectedIds: [],
            totalCollected: 0
        };
        
        // 保存初始状态
        await chrome.storage.local.set({ [collectionKey]: collectionState });
        
        // 开始收集流程
        return await this.processMultiPageCollection(collectionKey);
    }
    
    // 处理多页收集流程 - 改进版本
    async processMultiPageCollection(collectionKey) {
        try {
            // 获取当前状态
            const result = await chrome.storage.local.get([collectionKey]);
            const state = result[collectionKey];
            
            if (!state) {
                return { success: false, message: '收集状态丢失' };
            }
            
            const targetPage = state.startPage + state.currentIndex;
            console.log(`📄 [Content] 处理第${state.currentIndex + 1}/${state.targetPageCount}页，页码: ${targetPage}`);
            
            // 验证当前页码是否正确
            const actualCurrentPage = this.getCurrentPageNumber();
            console.log(`📍 [Content] 期望页码: ${targetPage}, 实际页码: ${actualCurrentPage}`);
            
            // 如果页码不匹配，可能需要重新翻页
            if (actualCurrentPage !== targetPage && state.currentIndex > 0) {
                console.log(`⚠️ [Content] 页码不匹配，尝试重新翻页到第${targetPage}页`);
                const flipResult = await this.goToNextPage({ targetPage: targetPage });
                if (!flipResult.success) {
                    await chrome.storage.local.remove([collectionKey]);
                    return { success: false, message: `重新翻页到第${targetPage}页失败: ${flipResult.message}` };
                }
                
                // 翻页后等待页面稳定
                await new Promise(resolve => setTimeout(resolve, 3000));
            }
            
            // 收集当前页面数据
            const pageData = await this.collectSearchPageIds(true); // skipSave = true
            
            if (pageData.success && pageData.ids) {
                // 累积数据
                const beforeCount = state.collectedIds.length;
                state.collectedIds = [...state.collectedIds, ...pageData.ids];
                state.totalCollected += pageData.count;
                state.currentIndex++;
                
                console.log(`✅ [Content] 第${targetPage}页收集完成，本页${pageData.count}个，累计${state.collectedIds.length}个`);
                console.log(`📊 [Content] 本页前5个ID:`, pageData.ids.slice(0, 5));
                console.log(`📊 [Content] 新增ID数量: ${state.collectedIds.length - beforeCount}`);
                
                // 更新状态
                await chrome.storage.local.set({ [collectionKey]: state });
                
                // 检查是否完成所有页面
                if (state.currentIndex >= state.targetPageCount) {
                    // 完成收集，保存数据
                    console.log(`📊 [Content] 收集完成，准备去重和保存`);
                    console.log(`📊 [Content] 原始数据总数: ${state.collectedIds.length}`);
                    console.log(`📊 [Content] 前10个ID样本:`, state.collectedIds.slice(0, 10));
                    
                    const uniqueIds = [...new Set(state.collectedIds)];
                    console.log(`📊 [Content] 去重后数量: ${uniqueIds.length}`);
                    console.log(`📊 [Content] 重复数量: ${state.collectedIds.length - uniqueIds.length}`);
                    
                    await this.saveProductIds(uniqueIds);
                    
                    // 清理状态
                    await chrome.storage.local.remove([collectionKey]);
                    
                    console.log(`🎉 [Content] 多页收集完成！总计${uniqueIds.length}个唯一商品ID`);
                    
                    return {
                        success: true,
                        count: uniqueIds.length,
                        message: `成功收集${state.targetPageCount}页，共${uniqueIds.length}个商品ID`,
                        ids: uniqueIds
                    };
                } else {
                    // 需要翻页到下一页
                    const nextPage = state.startPage + state.currentIndex;
                    console.log(`🔄 [Content] 准备翻页到第${nextPage}页`);
                    
                    // 翻页
                    const flipResult = await this.goToNextPage({ targetPage: nextPage });
                    
                    if (flipResult.success) {
                        // 翻页成功，等待页面加载后继续收集
                        console.log(`✅ [Content] 翻页成功到第${nextPage}页`);
                        console.log(`⏳ [Content] 等待第${nextPage}页加载完成...`);
                        await new Promise(resolve => setTimeout(resolve, 3000));
                        
                        // 递归继续收集下一页
                        return await this.processMultiPageCollection(collectionKey);
                    } else {
                        // 翻页失败
                        await chrome.storage.local.remove([collectionKey]);
                        return {
                            success: false,
                            message: `翻页到第${nextPage}页失败: ${flipResult.message}`
                        };
                    }
                }
            } else {
                // 当前页面收集失败
                await chrome.storage.local.remove([collectionKey]);
                return {
                    success: false,
                    message: `第${targetPage}页收集失败: ${pageData.message}`
                };
            }
            
        } catch (error) {
            console.error('❌ [Content] 多页收集处理异常:', error);
            await chrome.storage.local.remove([collectionKey]);
            return {
                success: false,
                message: `收集异常: ${error.message}`
            };
        }
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
                // 搜索页面收集，支持skipSave参数
                const skipSave = request.skipSave || false;
                return await this.collectSearchPageIds(skipSave);
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

    // 收集店铺页面商品ID - 增强版本
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
        await new Promise(resolve => setTimeout(resolve, 5000)); // 增加等待时间
        
        let validIds = this.collectedData.filter(id => this.isValidProductId(id));
        let uniqueIds = [...new Set(validIds)];
        
        // 如果数据量不足，进行重试
        if (uniqueIds.length < 10) {
            console.log(`⚠️ [Content] 数据量不足(${uniqueIds.length}个)，进行重试收集`);
            
            // 重新触发数据检查
            this.triggerDataCheck();
            await new Promise(resolve => setTimeout(resolve, 3000));
            
            // 重新获取数据
            validIds = this.collectedData.filter(id => this.isValidProductId(id));
            uniqueIds = [...new Set(validIds)];
            
            console.log(`🔄 [Content] 重试后获得${uniqueIds.length}个商品ID`);
        }
        
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

    // 保存商品ID - 保留导出跟踪
    async saveProductIds(productIds) {
        if (!productIds || productIds.length === 0) return;
        
        try {
            const result = await chrome.storage.local.get(['productData']);
            const existingData = result.productData || { ids: [], exportedIds: [] };
            
            const existingIds = existingData.ids || [];
            const existingExportedIds = existingData.exportedIds || [];
            const uniqueNewIds = productIds.filter(id => !existingIds.includes(id));
            const allIds = [...existingIds, ...uniqueNewIds];
            
            // 保存ID数组和已导出ID数组
            const updatedData = {
                ids: allIds,
                exportedIds: existingExportedIds
            };
            
            await chrome.storage.local.set({ productData: updatedData });
            console.log('✅ [Content] 商品ID保存成功');
            
        } catch (error) {
            console.error('❌ [Content] 保存失败:', error);
        }
    }

    // 收集搜索结果页面商品ID
    async collectSearchPageIds(skipSave = false) {
        console.log('🔍 [Content] 收集搜索结果页面商品ID', skipSave ? '(跳过保存)' : '');
        
        // 先滚动到页面底部，触发懒加载
        await this.scrollToLoadAllProducts();
        
        const productIds = [];
        const renderKeyElements = document.querySelectorAll('[data-renderkey]');
        
        console.log(`🔍 [Content] 找到${renderKeyElements.length}个data-renderkey元素`);
        
        renderKeyElements.forEach((el, index) => {
            const renderKey = el.getAttribute('data-renderkey');
            if (renderKey) {
                const longNumbers = renderKey.match(/\d{12,13}/g);
                if (longNumbers && longNumbers.length > 0) {
                    const productId = longNumbers[longNumbers.length - 1];
                    
                    // 添加调试日志
                    if (index < 5) { // 只打印前5个元素的详细信息
                        console.log(`🔍 [Content] 元素${index + 1}: renderKey="${renderKey}"`);
                        console.log(`🔍 [Content] 匹配到的数字:`, longNumbers);
                        console.log(`🔍 [Content] 选择的商品ID: ${productId}`);
                    }
                    
                    if (this.isValidProductId(productId) && !productIds.includes(productId)) {
                        productIds.push(productId);
                    } else if (index < 5) {
                        console.log(`❌ [Content] 商品ID无效或重复: ${productId}`);
                    }
                }
            }
        });
        
        if (productIds.length > 0) {
            // 根据skipSave参数决定是否保存
            if (!skipSave) {
                await this.saveProductIds(productIds);
            }
            
            return {
                success: true,
                count: productIds.length,
                message: `搜索页面成功收集 ${productIds.length} 个商品ID`,
                ids: productIds // 返回实际的商品ID数组
            };
        } else {
            return {
                success: false,
                message: '未找到商品ID',
                ids: []
            };
        }
    }

    // 滚动页面加载所有商品 - 改进版本
    async scrollToLoadAllProducts() {
        console.log('📜 [Content] 开始智能滚动加载所有商品');
        
        // 获取更准确的页面高度
        const getPageHeight = () => Math.max(
            document.body.scrollHeight,
            document.documentElement.scrollHeight,
            document.body.offsetHeight,
            document.documentElement.offsetHeight
        );
        
        // 获取当前商品数量
        const getCurrentProductCount = () => document.querySelectorAll('[data-renderkey]').length;
        
        let lastHeight = getPageHeight();
        let lastProductCount = getCurrentProductCount();
        let scrollAttempts = 0;
        let noChangeCount = 0; // 连续无变化次数
        const maxScrollAttempts = 15; // 增加最大尝试次数
        const maxNoChangeCount = 3; // 连续3次无变化就停止
        
        console.log(`📜 [Content] 初始状态 - 页面高度: ${lastHeight}, 商品数量: ${lastProductCount}`);
        
        while (scrollAttempts < maxScrollAttempts && noChangeCount < maxNoChangeCount) {
            scrollAttempts++;
            
            // 渐进式滚动，而不是直接跳到底部
            const currentScrollTop = window.pageYOffset || document.documentElement.scrollTop;
            const targetScrollTop = getPageHeight() - window.innerHeight;
            const scrollStep = Math.min(1000, targetScrollTop - currentScrollTop); // 每次滚动1000px或到底部
            
            if (scrollStep > 0) {
                window.scrollTo(0, currentScrollTop + scrollStep);
                console.log(`📜 [Content] 第${scrollAttempts}次滚动，滚动到: ${currentScrollTop + scrollStep}`);
            } else {
                // 已经到底部，直接滚动到最底部确保触发懒加载
                window.scrollTo(0, getPageHeight());
                console.log(`📜 [Content] 第${scrollAttempts}次滚动到页面底部`);
            }
            
            // 触发额外的事件来确保懒加载被激活
            window.dispatchEvent(new Event('scroll'));
            window.dispatchEvent(new Event('resize'));
            
            // 动态等待时间：根据页面加载状态调整
            let waitTime = 1000; // 基础等待时间
            
            // 检测是否有加载指示器
            const loadingIndicators = document.querySelectorAll('.loading, .spinner, [class*="load"]');
            if (loadingIndicators.length > 0) {
                waitTime = 3000; // 如果有加载指示器，等待更长时间
                console.log(`📜 [Content] 检测到${loadingIndicators.length}个加载指示器，延长等待时间`);
            }
            
            await new Promise(resolve => setTimeout(resolve, waitTime));
            
            // 检查变化
            const newHeight = getPageHeight();
            const newProductCount = getCurrentProductCount();
            
            console.log(`📜 [Content] 第${scrollAttempts}次检查 - 页面高度: ${newHeight} (${newHeight > lastHeight ? '+' + (newHeight - lastHeight) : '无变化'}), 商品数量: ${newProductCount} (${newProductCount > lastProductCount ? '+' + (newProductCount - lastProductCount) : '无变化'})`);
            
            // 检查是否有任何变化（高度或商品数量）
            if (newHeight === lastHeight && newProductCount === lastProductCount) {
                noChangeCount++;
                console.log(`📜 [Content] 连续${noChangeCount}次无变化`);
                
                if (noChangeCount >= maxNoChangeCount) {
                    console.log('📜 [Content] 连续多次无变化，可能已加载完所有内容');
                    break;
                }
                
                // 尝试更激进的滚动策略
                if (noChangeCount === 2) {
                    console.log('📜 [Content] 尝试激进滚动策略');
                    // 快速滚动到不同位置触发懒加载
                    const positions = [newHeight * 0.8, newHeight * 0.9, newHeight];
                    for (const pos of positions) {
                        window.scrollTo(0, pos);
                        await new Promise(resolve => setTimeout(resolve, 500));
                    }
                }
            } else {
                // 有变化，重置计数器
                noChangeCount = 0;
                lastHeight = newHeight;
                lastProductCount = newProductCount;
            }
        }
        
        // 最终统计
        const finalHeight = getPageHeight();
        const finalProductCount = getCurrentProductCount();
        
        console.log(`📜 [Content] 滚动完成！`);
        console.log(`📜 [Content] - 滚动次数: ${scrollAttempts}`);
        console.log(`📜 [Content] - 最终页面高度: ${finalHeight} (增加了 ${finalHeight - lastHeight})`);
        console.log(`📜 [Content] - 最终商品数量: ${finalProductCount} (增加了 ${finalProductCount - lastProductCount})`);
        
        // 滚动回到顶部，方便用户查看
        window.scrollTo({ top: 0, behavior: 'smooth' });
        
        // 等待滚动动画完成
        await new Promise(resolve => setTimeout(resolve, 1000));
    }

    // 获取当前页码
    getCurrentPageNumber() {
        try {
            const url = new URL(window.location.href);
            const beginPageStr = url.searchParams.get('beginPage');
            const pageNumStr = url.searchParams.get('pageNum');
            
            console.log(`📍 [Content] URL参数 - beginPage: "${beginPageStr}", pageNum: "${pageNumStr}"`);
            
            const beginPage = beginPageStr ? parseInt(beginPageStr) : null;
            const pageNum = pageNumStr ? parseInt(pageNumStr) : null;
            
            console.log(`📍 [Content] 解析结果 - beginPage: ${beginPage}, pageNum: ${pageNum}`);
            
            // 优先使用beginPage，其次使用pageNum，默认为1
            let currentPage = 1;
            if (beginPage && !isNaN(beginPage) && beginPage > 0) {
                currentPage = beginPage;
            } else if (pageNum && !isNaN(pageNum) && pageNum > 0) {
                currentPage = pageNum;
            }
            
            console.log(`📍 [Content] 最终页码: ${currentPage}`);
            return currentPage;
        } catch (error) {
            console.error('❌ [Content] 获取页码失败:', error);
            return 1; // 默认返回第1页
        }
    }

    // 搜索页面翻页功能 - 只使用点击，不使用URL跳转
    async goToNextPage(request) {
        try {
            const targetPage = request.targetPage || 2;
            console.log(`🔄 [Content] 尝试翻页到第${targetPage}页`);
            
            // 记录翻页前的页面状态
            const beforeUrl = window.location.href;
            const beforeProductCount = document.querySelectorAll('[data-renderkey]').length;
            console.log(`📊 [Content] 翻页前状态 - URL: ${beforeUrl}, 商品数: ${beforeProductCount}`);
            
            // 方法1：如果目标页码是当前页+1，优先使用"下一页"按钮（最稳定）
            const currentPage = this.getCurrentPageNumber();
            if (targetPage === currentPage + 1) {
                const nextButtons = this.findNextPageButtons();
                if (nextButtons.length > 0) {
                    console.log(`🖱️ [Content] 找到${nextButtons.length}个下一页按钮，优先使用`);
                    const success = await this.clickElementAndWait(nextButtons[0], '下一页按钮');
                    if (success) {
                        return await this.verifyPageChange(beforeUrl, beforeProductCount, targetPage);
                    }
                }
            }
            
            // 方法2：查找并点击具体页码按钮
            const pageButtons = this.findPageButtons(targetPage);
            if (pageButtons.length > 0) {
                console.log(`🎯 [Content] 找到${pageButtons.length}个页码${targetPage}按钮`);
                const success = await this.clickElementAndWait(pageButtons[0], `页码${targetPage}按钮`);
                if (success) {
                    return await this.verifyPageChange(beforeUrl, beforeProductCount, targetPage);
                }
            }
            
            // 方法3：查找分页组件中的页码
            const paginationElements = this.findPaginationElements(targetPage);
            if (paginationElements.length > 0) {
                console.log(`🎯 [Content] 找到${paginationElements.length}个分页组件页码${targetPage}`);
                const success = await this.clickElementAndWait(paginationElements[0], `分页组件页码${targetPage}`);
                if (success) {
                    return await this.verifyPageChange(beforeUrl, beforeProductCount, targetPage);
                }
            }
            
            // 所有点击方法都失败
            console.error(`❌ [Content] 所有点击方法都失败，无法翻页到第${targetPage}页`);
            return {
                success: false,
                message: `无法找到可点击的翻页元素，翻页到第${targetPage}页失败`
            };
            
        } catch (error) {
            console.error(`❌ [Content] 翻页失败:`, error);
            return { success: false, message: `翻页失败: ${error.message}` };
        }
    }
    
    // 查找页码按钮
    findPageButtons(targetPage) {
        // 优先查找1688特定的页码按钮
        const fuiPageButtons = Array.from(document.querySelectorAll('.fui-paging-num, .fui-paging-item')).filter(el => {
            const text = el.textContent.trim();
            const isVisible = el.offsetParent !== null && el.offsetWidth > 0 && el.offsetHeight > 0;
            const isPageNumber = text === targetPage.toString();
            const isCurrentPage = el.classList.contains('fui-paging-current') || el.classList.contains('current');
            
            return isPageNumber && isVisible && !isCurrentPage;
        });
        
        if (fuiPageButtons.length > 0) {
            console.log(`🎯 [Content] 找到1688页码按钮: ${fuiPageButtons.length}个`);
            return fuiPageButtons;
        }
        
        // 备用方案：通用页码按钮查找
        return Array.from(document.querySelectorAll('a, button, span')).filter(el => {
            const text = el.textContent.trim();
            const isVisible = el.offsetParent !== null && el.offsetWidth > 0 && el.offsetHeight > 0;
            const isClickable = !el.disabled && el.style.pointerEvents !== 'none';
            const isPageNumber = text === targetPage.toString();
            
            // 额外检查：确保不是当前页（当前页通常不可点击）
            const isCurrentPage = el.classList.contains('current') || el.classList.contains('active') || el.classList.contains('selected');
            
            return isPageNumber && isVisible && isClickable && !isCurrentPage;
        });
    }
    
    // 查找下一页按钮
    findNextPageButtons() {
        // 优先查找1688特定的下一页按钮
        const fuiNextButton = document.querySelector('.fui-arrow.fui-next');
        if (fuiNextButton && fuiNextButton.offsetParent !== null) {
            console.log('🎯 [Content] 找到1688下一页按钮: .fui-arrow.fui-next');
            return [fuiNextButton];
        }
        
        // 备用方案：查找文本内容的下一页按钮
        return Array.from(document.querySelectorAll('a, button, div')).filter(el => {
            const text = el.textContent.trim();
            const isVisible = el.offsetParent !== null && el.offsetWidth > 0 && el.offsetHeight > 0;
            const isClickable = !el.disabled && el.style.pointerEvents !== 'none';
            const isNextButton = text.includes('下一页') || text === '>' || text.includes('Next') || text.includes('next');
            
            return isNextButton && isVisible && isClickable;
        });
    }
    
    // 查找分页组件中的页码
    findPaginationElements(targetPage) {
        const selectors = [
            '[class*="page"] a',
            '[class*="pagination"] a',
            '[class*="pager"] a',
            '.page-link',
            '.pagination-item',
            '[data-page]'
        ];
        
        const elements = [];
        selectors.forEach(selector => {
            const found = Array.from(document.querySelectorAll(selector)).filter(el => {
                const text = el.textContent.trim();
                const isVisible = el.offsetParent !== null && el.offsetWidth > 0 && el.offsetHeight > 0;
                const isPageNumber = text === targetPage.toString();
                const dataPage = el.getAttribute('data-page');
                const hasDataPage = dataPage === targetPage.toString();
                
                return (isPageNumber || hasDataPage) && isVisible;
            });
            elements.push(...found);
        });
        
        return elements;
    }
    
    // 点击元素并等待
    async clickElementAndWait(element, description) {
        try {
            console.log(`🖱️ [Content] 准备点击${description}`);
            console.log(`🖱️ [Content] 元素信息:`, {
                tagName: element.tagName,
                className: element.className,
                text: element.textContent.trim(),
                href: element.href || 'N/A'
            });
            
            // 滚动到元素可见位置
            element.scrollIntoView({ behavior: 'smooth', block: 'center' });
            await new Promise(resolve => setTimeout(resolve, 500));
            
            // 使用原生点击而不是dispatchEvent
            try {
                element.click();
                console.log(`✅ [Content] 成功点击${description}`);
            } catch (clickError) {
                console.log(`⚠️ [Content] 原生点击失败，尝试事件触发`);
                // 如果原生点击失败，再尝试事件触发
                const clickEvent = new MouseEvent('click', {
                    bubbles: true,
                    cancelable: true,
                    view: window,
                    detail: 1
                });
                element.dispatchEvent(clickEvent);
            }
            
            // 等待页面开始变化 - 给1688异步加载更多时间
            await new Promise(resolve => setTimeout(resolve, 2000));
            return true;
            
        } catch (error) {
            console.error(`❌ [Content] 点击${description}失败:`, error);
            return false;
        }
    }
    
    // 验证页面是否发生了变化
    async verifyPageChange(beforeUrl, beforeProductCount, targetPage) {
        console.log(`🔍 [Content] 验证翻页是否成功，目标页码: ${targetPage}`);
        
        // 等待页面加载
        let waitTime = 0;
        const maxWaitTime = 10000; // 最多等待10秒
        const checkInterval = 500; // 每500ms检查一次
        
        while (waitTime < maxWaitTime) {
            await new Promise(resolve => setTimeout(resolve, checkInterval));
            waitTime += checkInterval;
            
            const currentUrl = window.location.href;
            const currentProductCount = document.querySelectorAll('[data-renderkey]').length;
            const currentPageNum = this.getCurrentPageNumber();
            
            console.log(`🔍 [Content] 检查${waitTime}ms - URL变化: ${currentUrl !== beforeUrl}, 商品数变化: ${currentProductCount !== beforeProductCount}, 当前页码: ${currentPageNum}`);
            
            // 检查是否翻页成功的多个条件
            const urlChanged = currentUrl !== beforeUrl;
            const productCountChanged = currentProductCount !== beforeProductCount;
            const pageNumberMatches = currentPageNum === targetPage;
            
            // 如果满足任一成功条件
            if (urlChanged || productCountChanged || pageNumberMatches) {
                console.log(`✅ [Content] 翻页成功验证通过`);
                console.log(`📊 [Content] 翻页后状态 - URL: ${currentUrl}, 商品数: ${currentProductCount}, 页码: ${currentPageNum}`);
                
                // 额外等待确保页面完全加载
                await new Promise(resolve => setTimeout(resolve, 2000));
                
                return {
                    success: true,
                    message: `成功翻页到第${targetPage}页`,
                    pageChanged: true,
                    newUrl: currentUrl,
                    newProductCount: currentProductCount,
                    actualPage: currentPageNum
                };
            }
        }
        
        // 超时未检测到变化
        console.log(`⚠️ [Content] 翻页验证超时，可能翻页失败`);
        return {
            success: false,
            message: `翻页到第${targetPage}页可能失败，页面未发生预期变化`,
            pageChanged: false
        };
    }
};

} // 结束 if (typeof window.ProductIdCollector === 'undefined')

// 初始化收集器
if (!window.productIdCollectorInstance) {
    window.productIdCollectorInstance = new window.ProductIdCollector();
}