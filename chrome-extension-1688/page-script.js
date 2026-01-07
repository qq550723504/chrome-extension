// 页面上下文脚本 - 清理版本
(function() {
    console.log('🔍 [Page] 页面脚本已加载');
    
    // 全局商品数据存储
    if (!window._shopProductData) {
        window._shopProductData = [];
    }
    
    // 立即设置网络拦截器
    setupNetworkInterception();
    
    // 监听来自content script的消息
    window.addEventListener('message', function(event) {
        if (event.source !== window) return;
        
        if (event.data.type === 'CHECK_SHOP_PRODUCT_DATA' && event.data.source === 'content-script') {
            console.log('📨 [Page] 收到数据检查请求');
            
            collectShopProductData().then(productIds => {
                console.log('📤 [Page] 发送数据响应:', productIds.length, '个商品ID');
                
                window.postMessage({
                    type: 'SHOP_PRODUCT_DATA_RESPONSE',
                    productIds: productIds,
                    timestamp: Date.now()
                }, '*');
            });
        }
        
        if (event.data.type === 'COLLECT_ALL_PAGES' && event.data.source === 'content-script') {
            console.log('📨 [Page] 收到收集所有页面请求');
            
            const totalPages = event.data.totalPages || 5;
            collectAllPages(totalPages);
        }
    });
    
    // 收集店铺商品数据的主函数
    async function collectShopProductData() {
        console.log('🔍 [Page] 收集店铺商品数据');
        
        // 等待API请求完成
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        // 从全局拦截器数据中获取商品ID
        const productIds = [...new Set(window._shopProductData || [])];
        console.log(`✅ [Page] 从拦截器获取到${productIds.length}个商品ID`);
        
        return productIds;
    }
    
    // 设置网络拦截器
    function setupNetworkInterception() {
        console.log('🔧 [Page] 设置网络拦截器');
        
        // 拦截fetch请求
        const originalFetch = window.fetch;
        window.fetch = async function(...args) {
            const url = args[0];
            const response = await originalFetch(...args);
            
            // 拦截关键的商品列表API
            if (url && (
                url.includes('mtop.alibaba.alisite.cbu.server.moduleasyncservice') ||
                url.includes('mtop.1688.shop.data.get') ||
                url.includes('mtop.1688.shop.offerlist')
            )) {
                console.log('🎯 [Page] 拦截到API请求:', url);
                
                const clonedResponse = response.clone();
                try {
                    const responseData = await clonedResponse.json();
                    
                    const productIds = extractProductIdsFromApiResponse(responseData);
                    if (productIds.length > 0) {
                        console.log('✅ [Page] 从API提取到商品ID:', productIds.length, '个');
                        window._shopProductData = [...new Set([...window._shopProductData, ...productIds])];
                        
                        // 通知content script
                        window.postMessage({
                            type: 'SHOP_PRODUCT_DATA_UPDATE',
                            productIds: productIds,
                            timestamp: Date.now()
                        }, '*');
                    }
                } catch (error) {
                    console.log('ℹ️ [Page] 响应解析失败:', error);
                }
            }
            
            return response;
        };
        
        // 拦截XMLHttpRequest
        const originalXHROpen = XMLHttpRequest.prototype.open;
        const originalXHRSend = XMLHttpRequest.prototype.send;
        
        XMLHttpRequest.prototype.open = function(method, url, ...args) {
            this._url = url;
            return originalXHROpen.call(this, method, url, ...args);
        };
        
        XMLHttpRequest.prototype.send = function(data) {
            if (this._url && (
                this._url.includes('mtop.alibaba.alisite.cbu.server.moduleasyncservice') ||
                this._url.includes('mtop.1688.shop.data.get') ||
                this._url.includes('mtop.1688.shop.offerlist')
            )) {
                console.log('🎯 [Page] 拦截到XHR API请求:', this._url);
                
                this.addEventListener('load', function() {
                    try {
                        const responseData = JSON.parse(this.responseText);
                        
                        const productIds = extractProductIdsFromApiResponse(responseData);
                        if (productIds.length > 0) {
                            console.log('✅ [Page] XHR提取到商品ID:', productIds.length, '个');
                            window._shopProductData = [...new Set([...window._shopProductData, ...productIds])];
                            
                            window.postMessage({
                                type: 'SHOP_PRODUCT_DATA_UPDATE',
                                productIds: productIds,
                                timestamp: Date.now()
                            }, '*');
                        }
                    } catch (error) {
                        console.log('ℹ️ [Page] XHR响应解析失败:', error);
                    }
                });
            }
            
            return originalXHRSend.call(this, data);
        };
        
        console.log('✅ [Page] 网络拦截器设置完成');
    }
    
    // 从API响应中提取商品ID - 简化版本
    function extractProductIdsFromApiResponse(apiData) {
        const productIds = [];
        
        try {
            // 检查API响应是否成功
            if (apiData?.ret && Array.isArray(apiData.ret) && apiData.ret.length > 0) {
                const retCode = apiData.ret[0];
                if (retCode.includes('FAIL') || retCode.includes('ERROR')) {
                    return productIds;
                }
            }
            
            // 处理主要的商品列表API响应
            if (apiData?.data?.content?.offerList) {
                const offerList = apiData.data.content.offerList;
                
                offerList.forEach((offer) => {
                    if (offer.id && isValidProductId(offer.id)) {
                        const productId = offer.id.toString();
                        if (!productIds.includes(productId)) {
                            productIds.push(productId);
                        }
                    }
                });
            }
            // 处理其他格式的商品列表
            else if (apiData?.data?.content?.offerModuleList) {
                const offerModules = apiData.data.content.offerModuleList;
                
                offerModules.forEach((module) => {
                    if (module.id && isValidProductId(module.id)) {
                        const productId = module.id.toString();
                        if (!productIds.includes(productId)) {
                            productIds.push(productId);
                        }
                    }
                });
            }
            
        } catch (error) {
            console.error('❌ [Page] 解析失败:', error);
        }
        
        return productIds;
    }
    
    // 收集所有页面的商品数据 - 真实翻页版本
    async function collectAllPages(totalPages = 5) {
        console.log(`🚀 [Page] 开始收集${totalPages}页商品数据`);
        let allProductIds = [];
        
        // 先收集当前页面的数据（第1页）
        const currentPageIds = [...new Set(window._shopProductData || [])];
        if (currentPageIds.length > 0) {
            allProductIds = [...currentPageIds];
            console.log(`✅ [Page] 第1页完成: ${currentPageIds.length}个商品ID`);
        } else {
            console.log(`⚠️ [Page] 第1页暂无数据，等待API请求...`);
            // 等待第1页数据加载
            await new Promise(resolve => setTimeout(resolve, 3000));
            const retryIds = [...new Set(window._shopProductData || [])];
            if (retryIds.length > 0) {
                allProductIds = [...retryIds];
                console.log(`✅ [Page] 第1页重试成功: ${retryIds.length}个商品ID`);
            }
        }
        
        // 如果只收集1页，直接返回
        if (totalPages === 1) {
            console.log(`🎉 [Page] 单页收集完成！总计${allProductIds.length}个商品ID`);
            window.postMessage({
                type: 'ALL_PAGES_COLLECTION_COMPLETE',
                totalCount: allProductIds.length,
                productIds: allProductIds
            }, '*');
            return allProductIds;
        }
        
        // 收集其他页面 - 使用真实翻页
        for (let pageNum = 2; pageNum <= totalPages; pageNum++) {
            console.log(`📄 [Page] 开始收集第${pageNum}/${totalPages}页`);
            
            try {
                // 记录翻页前的数据量
                const beforePageCount = window._shopProductData ? window._shopProductData.length : 0;
                
                // 点击翻页
                const success = await clickToNextPage(pageNum);
                if (!success) {
                    console.log(`❌ [Page] 第${pageNum}页翻页失败，停止收集`);
                    break;
                }
                
                // 等待页面加载和API请求完成
                console.log(`⏳ [Page] 等待第${pageNum}页数据加载...`);
                await new Promise(resolve => setTimeout(resolve, 4000));
                
                // 检查是否有新数据
                const afterPageCount = window._shopProductData ? window._shopProductData.length : 0;
                const newDataCount = afterPageCount - beforePageCount;
                
                if (newDataCount > 0) {
                    // 获取新增的数据
                    const newPageIds = window._shopProductData.slice(beforePageCount);
                    const uniqueNewIds = newPageIds.filter(id => !allProductIds.includes(id));
                    allProductIds = [...allProductIds, ...uniqueNewIds];
                    console.log(`✅ [Page] 第${pageNum}页完成: +${uniqueNewIds.length}个新ID，累计${allProductIds.length}个`);
                } else {
                    console.log(`⚠️ [Page] 第${pageNum}页未检测到新数据，可能已到最后一页`);
                    // 继续尝试下一页，可能是数据延迟
                }
                
            } catch (error) {
                console.error(`❌ [Page] 第${pageNum}页收集异常:`, error);
                break;
            }
        }
        
        // 确保全局存储是最新的
        window._shopProductData = [...new Set(allProductIds)];
        
        console.log(`🎉 [Page] 所有页面收集完成！总计${allProductIds.length}个商品ID`);
        
        // 通知content script收集完成
        window.postMessage({
            type: 'ALL_PAGES_COLLECTION_COMPLETE',
            totalCount: allProductIds.length,
            productIds: allProductIds
        }, '*');
        
        return allProductIds;
    }
    
    // 点击翻页到指定页面
    async function clickToNextPage(targetPage) {
        try {
            console.log(`🖱️ [Page] 尝试翻页到第${targetPage}页`);
            
            // 方法1：直接点击页码数字（最准确的方法）
            const pageNumbers = Array.from(document.querySelectorAll('button, a')).filter(el => {
                const text = el.textContent.trim();
                return text === targetPage.toString() && el.offsetParent !== null; // 确保元素可见
            });
            
            if (pageNumbers.length > 0) {
                console.log(`🎯 [Page] 找到页码${targetPage}按钮，点击`);
                pageNumbers[0].click();
                return true;
            }
            
            // 方法2：如果是连续翻页，点击"下一页"按钮
            const nextButtons = Array.from(document.querySelectorAll('button, a')).filter(el => {
                const text = el.textContent.trim();
                return (text.includes('下一页') || text === '>') && el.offsetParent !== null;
            });
            
            if (nextButtons.length > 0) {
                console.log(`🖱️ [Page] 点击下一页按钮`);
                nextButtons[0].click();
                return true;
            }
            
            // 方法3：通过URL参数跳转（备用方案）
            const currentUrl = new URL(window.location.href);
            if (currentUrl.searchParams.has('pageNum')) {
                currentUrl.searchParams.set('pageNum', targetPage.toString());
            } else {
                currentUrl.searchParams.set('pageNum', targetPage.toString());
            }
            
            console.log(`🔗 [Page] 通过URL跳转到第${targetPage}页`);
            window.location.href = currentUrl.href;
            return true;
            
        } catch (error) {
            console.error(`❌ [Page] 翻页到第${targetPage}页失败:`, error);
            return false;
        }
    }
    
    // 收集当前页面的数据
    async function collectCurrentPageData() {
        console.log('📊 [Page] 开始收集当前页面数据');
        
        // 等待页面稳定和API请求完成
        await new Promise(resolve => setTimeout(resolve, 4000));
        
        // 直接从全局数据中获取最新的商品ID
        const allCurrentData = [...new Set(window._shopProductData || [])];
        console.log(`📈 [Page] 当前全局数据总数：${allCurrentData.length}个商品ID`);
        
        // 返回当前页面可能的新数据（最后30个，因为每页通常30个商品）
        const recentIds = allCurrentData.slice(-30);
        console.log(`✅ [Page] 返回最近的${recentIds.length}个商品ID作为当前页面数据`);
        
        return recentIds;
    }
    
    // 验证商品ID有效性
    function isValidProductId(id) {
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
            /^1624614382/,    // 时间戳ID (用户指出的错误ID)
            /^2221314611/,    // 系统ID (用户指出的错误ID)
        ];
        
        return !invalidPatterns.some(pattern => pattern.test(idStr));
    }
    
    console.log('✅ [Page] 页面脚本初始化完成');
})();