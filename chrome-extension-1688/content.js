// 1688商品ID收集器
class ProductIdCollector {
    constructor() {
        this.init();
    }

    init() {
        // 监听来自popup的消息
        chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
            if (request.action === 'collectProductIds') {
                this.collectProductIds(request).then(result => {
                    sendResponse(result);
                }).catch(error => {
                    sendResponse({ success: false, message: error.message });
                });
                return true;
            }
            
            if (request.action === 'goToNextPage') {
                this.goToNextPage().then(result => {
                    sendResponse(result);
                }).catch(error => {
                    sendResponse({ success: false, message: error.message });
                });
                return true;
            }
            
            if (request.action === 'ping') {
                sendResponse({ 
                    success: true, 
                    message: 'Content script正常运行'
                });
                return true;
            }
        });
    }

    // 收集商品ID
    async collectProductIds(request = {}) {
        try {
            // 先滚动页面确保所有商品都加载完成
            await this.scrollToLoadAllProducts();
            
            // 再等待一下确保DOM更新完成
            await new Promise(resolve => setTimeout(resolve, 1000));
            
            // 提取商品ID
            const productIds = this.extractProductIds();
            
            if (productIds.length === 0) {
                return { 
                    success: false, 
                    message: '未找到任何商品ID，请刷新页面重试'
                };
            }

            // 保存到存储
            await this.saveProductIds(productIds, request.isMultiPage);
            
            const pageInfo = request.pageNumber ? `第${request.pageNumber}页` : '';
            return { 
                success: true, 
                count: productIds.length,
                message: `${pageInfo}成功收集 ${productIds.length} 个商品ID`
            };

        } catch (error) {
            return { success: false, message: '收集失败: ' + error.message };
        }
    }

    // 翻到下一页
    async goToNextPage() {
        try {
            // 1688特定的分页查找逻辑
            let nextButton = null;
            
            // 方法1: 查找1688的标准下一页按钮
            const nextPageSelectors = [
                '.fui-next',
                '.fui-page-next', 
                '.pagination .next',
                'a[title="下一页"]',
                'a[aria-label="下一页"]',
                '.page-next'
            ];
            
            for (const selector of nextPageSelectors) {
                const element = document.querySelector(selector);
                if (element && !element.classList.contains('fui-disabled') && !element.disabled) {
                    nextButton = element;
                    break;
                }
            }
            
            // 方法2: 查找当前页码，然后找下一页
            if (!nextButton) {
                const currentPageElement = document.querySelector('.fui-current');
                if (currentPageElement) {
                    const currentPageNum = parseInt(currentPageElement.textContent.trim());
                    if (!isNaN(currentPageNum)) {
                        const nextPageNum = currentPageNum + 1;
                        // 查找下一页的链接
                        nextButton = document.querySelector(`a[href*="beginPage=${nextPageNum}"]`) ||
                                   document.querySelector(`a[href*="page=${nextPageNum}"]`) ||
                                   document.querySelector(`.fui-page-item:not(.fui-current)`);
                    }
                }
            }
            
            // 方法3: 通过URL参数直接跳转
            if (!nextButton) {
                const url = new URL(window.location.href);
                const currentPage = parseInt(url.searchParams.get('beginPage') || '1');
                const nextPage = currentPage + 1;
                
                // 检查是否还有下一页（通过检查总页数或最大页码）
                const maxPageElement = document.querySelector('.fui-page-item:last-child');
                if (maxPageElement) {
                    const maxPage = parseInt(maxPageElement.textContent.trim());
                    if (!isNaN(maxPage) && nextPage > maxPage) {
                        return { 
                            success: false, 
                            message: '已到最后一页' 
                        };
                    }
                }
                
                // 构造下一页URL
                url.searchParams.set('beginPage', nextPage.toString());
                window.location.href = url.toString();
                
                return { 
                    success: true, 
                    message: `跳转到第${nextPage}页` 
                };
            }
            
            if (nextButton) {
                // 滚动到按钮可见区域
                nextButton.scrollIntoView({ behavior: 'smooth', block: 'center' });
                await new Promise(resolve => setTimeout(resolve, 500));
                
                // 点击下一页按钮
                nextButton.click();
                
                return { 
                    success: true, 
                    message: '成功点击下一页按钮' 
                };
            } else {
                return { 
                    success: false, 
                    message: '未找到下一页按钮，可能已到最后一页' 
                };
            }
            
        } catch (error) {
            return { 
                success: false, 
                message: '翻页失败: ' + error.message 
            };
        }
    }

    // 滚动页面加载所有商品
    async scrollToLoadAllProducts() {
        // 先滚动到页面顶部
        window.scrollTo(0, 0);
        await new Promise(resolve => setTimeout(resolve, 500));
        
        // 获取初始商品数量和页面高度
        let previousCount = document.querySelectorAll('[data-renderkey]').length;
        let previousHeight = document.body.scrollHeight;
        let stableCount = 0;
        const maxAttempts = 8; // 最多尝试8次
        
        for (let attempt = 0; attempt < maxAttempts; attempt++) {
            // 分步滚动到底部，模拟用户滚动行为
            const targetHeight = document.body.scrollHeight;
            const currentScroll = window.pageYOffset;
            const scrollStep = Math.max(500, (targetHeight - currentScroll) / 3);
            
            // 分3步滚动到底部
            for (let step = 0; step < 3; step++) {
                const nextScroll = Math.min(currentScroll + scrollStep * (step + 1), targetHeight);
                window.scrollTo(0, nextScroll);
                await new Promise(resolve => setTimeout(resolve, 300));
            }
            
            // 确保滚动到最底部
            window.scrollTo(0, document.body.scrollHeight);
            
            // 等待懒加载触发
            await new Promise(resolve => setTimeout(resolve, 2000));
            
            // 检查商品数量和页面高度变化
            const currentCount = document.querySelectorAll('[data-renderkey]').length;
            const currentHeight = document.body.scrollHeight;
            
            // 如果商品数量和页面高度都没有变化，说明加载完成
            if (currentCount === previousCount && currentHeight === previousHeight) {
                stableCount++;
                if (stableCount >= 2) {
                    break;
                }
            } else {
                stableCount = 0;
                previousCount = currentCount;
                previousHeight = currentHeight;
            }
        }
        
        // 最后滚动回顶部
        window.scrollTo({ top: 0, behavior: 'smooth' });
        await new Promise(resolve => setTimeout(resolve, 1000));
    }

    // 提取商品ID
    extractProductIds() {
        const productIds = [];
        
        // 从data-renderkey提取商品ID
        const renderKeyElements = document.querySelectorAll('[data-renderkey]');
        
        renderKeyElements.forEach((el) => {
            const renderKey = el.getAttribute('data-renderkey');
            if (renderKey) {
                // 提取12-13位数字（商品ID通常在renderkey的最后部分）
                const longNumbers = renderKey.match(/\d{12,13}/g);
                if (longNumbers && longNumbers.length > 0) {
                    const productId = longNumbers[longNumbers.length - 1];
                    if (this.isValidProductId(productId) && !productIds.includes(productId)) {
                        productIds.push(productId);
                    }
                }
            }
        });
        
        return productIds;
    }

    // 验证是否是有效的商品ID
    isValidProductId(id) {
        // 1688商品ID通常是12-13位数字
        if (!id || !/^\d{12,13}$/.test(id)) {
            return false;
        }
        
        // 过滤掉明显不是商品ID的数字
        const invalidPrefixes = [
            '000000000',  // 无效ID
            '111111111',  // 测试ID
            '999999999',  // 测试ID
        ];
        
        return !invalidPrefixes.some(prefix => id.startsWith(prefix));
    }

    // 保存商品ID到存储
    async saveProductIds(newProductIds, isMultiPage = false) {
        try {
            const result = await chrome.storage.local.get(['productData']);
            const existingData = result.productData || {
                ids: [],
                exportedIds: [],
                stats: {
                    totalIds: 0,
                    exportedCount: 0,
                    lastCollectTime: null,
                    lastExportTime: null
                }
            };
            
            // 只保存ID，去重
            const existingIds = existingData.ids || [];
            const uniqueNewIds = newProductIds.filter(id => !existingIds.includes(id));
            const allIds = [...existingIds, ...uniqueNewIds];
            
            // 更新数据结构
            const updatedData = {
                ids: allIds,
                exportedIds: existingData.exportedIds || [],
                stats: {
                    totalIds: allIds.length,
                    exportedCount: existingData.exportedIds?.length || 0,
                    lastCollectTime: new Date().toISOString(),
                    lastExportTime: existingData.stats?.lastExportTime || null,
                    lastCollectCount: uniqueNewIds.length,
                    isMultiPageCollection: isMultiPage
                }
            };
            
            await chrome.storage.local.set({ productData: updatedData });
            
        } catch (error) {
            throw error;
        }
    }
}

// 初始化收集器
new ProductIdCollector();