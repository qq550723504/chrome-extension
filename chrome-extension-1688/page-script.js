// 页面上下文脚本 - 早期拦截版本
(function() {
    console.log('🔍 [Page] 页面脚本已加载');
    
    // 全局商品数据存储
    if (!window._shopProductData) {
        window._shopProductData = [];
    }
    
    // 立即设置网络拦截器（最高优先级）
    setupNetworkInterception();
    
    // 立即尝试从页面已有数据中提取商品ID
    setTimeout(() => {
        const initialIds = extractFromPageGlobals();
        if (initialIds.length > 0) {
            window._shopProductData = [...new Set([...window._shopProductData, ...initialIds])];
            console.log(`🚀 [Page] 页面加载时立即获取到${initialIds.length}个商品ID`);
        }
    }, 50); // 减少延迟到50ms
    
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
    
    // 收集店铺商品数据的主函数 - 简化版本
    async function collectShopProductData() {
        console.log('🔍 [Page] 收集店铺商品数据');
        
        // 1. 立即尝试从页面全局变量中获取数据
        const initialIds = extractFromPageGlobals();
        if (initialIds.length > 0) {
            window._shopProductData = [...new Set([...window._shopProductData, ...initialIds])];
            console.log(`🌐 [Page] 从页面全局变量获取到${initialIds.length}个商品ID`);
        }
        
        // 2. 等待API请求完成
        await new Promise(resolve => setTimeout(resolve, 3000));
        
        // 3. 只从API拦截器获取数据（店铺页面专用）
        let productIds = [...new Set(window._shopProductData || [])];
        console.log(`📡 [Page] 从API拦截器获取到${productIds.length}个商品ID`);
        
        // 4. 如果数据量明显不足，进行重试
        if (productIds.length < 10) {
            console.log('⚠️ [Page] 数据量不足，进行重试收集');
            
            // 再次尝试从全局变量获取
            const retryGlobalIds = extractFromPageGlobals();
            if (retryGlobalIds.length > 0) {
                window._shopProductData = [...new Set([...window._shopProductData, ...retryGlobalIds])];
                console.log(`🌐 [Page] 重试从全局变量获取到${retryGlobalIds.length}个商品ID`);
            }
            
            await new Promise(resolve => setTimeout(resolve, 2000));
            
            // 重新收集API数据
            productIds = [...new Set(window._shopProductData || [])];
            console.log(`🔄 [Page] 重试后从API获取到${productIds.length}个商品ID`);
        }
        
        // 更新全局存储
        window._shopProductData = productIds;
        
        console.log(`✅ [Page] 店铺页面收集完成，总计${productIds.length}个商品ID`);
        console.log(`📋 [Page] 前10个ID预览:`, productIds.slice(0, 10));
        
        return productIds;
    }
    
    // 从页面全局变量中提取商品ID
    function extractFromPageGlobals() {
        console.log('🌐 [Page] 尝试从页面全局变量提取商品ID');
        const productIds = [];
        
        try {
            // 1. 检查window对象中的常见数据变量
            const globalVars = [
                'pageData', 'shopData', 'offerData', 'productData', 
                'moduleData', 'initData', 'serverData', '__INITIAL_STATE__',
                'g_config', 'window.g_config', 'SHOP_DATA', 'OFFER_LIST'
            ];
            
            globalVars.forEach(varName => {
                try {
                    let data = null;
                    if (varName.includes('.')) {
                        // 处理嵌套属性
                        const parts = varName.split('.');
                        data = window;
                        for (const part of parts) {
                            data = data?.[part];
                        }
                    } else {
                        data = window[varName];
                    }
                    
                    if (data && typeof data === 'object') {
                        const ids = extractIdsFromObject(data, varName);
                        if (ids.length > 0) {
                            productIds.push(...ids);
                            console.log(`🌐 [Page] 从${varName}提取到${ids.length}个商品ID`);
                        }
                    }
                } catch (e) {
                    // 忽略单个变量的错误
                }
            });
            
            // 2. 检查页面中的script标签中的JSON数据
            const scriptTags = document.querySelectorAll('script[type="application/json"], script:not([src])');
            scriptTags.forEach((script, index) => {
                try {
                    const content = script.textContent || script.innerHTML;
                    if (content && (content.includes('offer') || content.includes('product') || content.includes('shop'))) {
                        const jsonData = JSON.parse(content);
                        const ids = extractIdsFromObject(jsonData, `script[${index}]`);
                        if (ids.length > 0) {
                            productIds.push(...ids);
                            console.log(`🌐 [Page] 从script[${index}]提取到${ids.length}个商品ID`);
                        }
                    }
                } catch (e) {
                    // 忽略解析错误
                }
            });
            
        } catch (error) {
            console.log('⚠️ [Page] 全局变量提取出错:', error);
        }
        
        const uniqueIds = [...new Set(productIds)];
        console.log(`🌐 [Page] 全局变量提取完成，共${uniqueIds.length}个唯一商品ID`);
        return uniqueIds;
    }
    
    // 从对象中递归提取商品ID
    function extractIdsFromObject(obj, source) {
        const ids = [];
        
        function recursiveExtract(data, depth = 0) {
            if (depth > 10) return; // 防止无限递归
            
            if (!data || typeof data !== 'object') return;
            
            if (Array.isArray(data)) {
                data.forEach(item => recursiveExtract(item, depth + 1));
            } else {
                for (const [key, value] of Object.entries(data)) {
                    // 检查已知的商品ID字段
                    if ((key === 'id' || key === 'offerId' || key === 'productId') && 
                        value && isValidProductId(value)) {
                        const productId = value.toString();
                        if (!ids.includes(productId)) {
                            ids.push(productId);
                        }
                    }
                    
                    // 检查已知的商品列表字段
                    if ((key === 'offerList' || key === 'offerModuleList' || key === 'items' || key === 'products') &&
                        Array.isArray(value)) {
                        value.forEach(item => {
                            if (item && typeof item === 'object') {
                                if (item.id && isValidProductId(item.id)) {
                                    const productId = item.id.toString();
                                    if (!ids.includes(productId)) {
                                        ids.push(productId);
                                    }
                                }
                                if (item.offerId && isValidProductId(item.offerId)) {
                                    const productId = item.offerId.toString();
                                    if (!ids.includes(productId)) {
                                        ids.push(productId);
                                    }
                                }
                            }
                        });
                    }
                    
                    // 递归处理嵌套对象
                    if (typeof value === 'object') {
                        recursiveExtract(value, depth + 1);
                    }
                }
            }
        }
        
        recursiveExtract(obj);
        return ids;
    }
    
    // 设置网络拦截器 - 增强版本
    function setupNetworkInterception() {
        console.log('🔧 [Page] 设置网络拦截器');
        
        // 拦截fetch请求
        const originalFetch = window.fetch;
        window.fetch = async function(...args) {
            const url = args[0];
            
            // 过滤掉无效的URL，避免错误日志
            if (!url || typeof url !== 'string' || url.includes('chrome-extension://invalid')) {
                return originalFetch(...args);
            }
            
            const response = await originalFetch(...args);
            
            // 拦截更多可能的店铺商品API
            if (url && (
                url.includes('mtop.alibaba.alisite.cbu.server.moduleasyncservice') ||
                url.includes('mtop.1688.shop.data.get') ||
                url.includes('mtop.1688.shop.offerlist') ||
                url.includes('mtop.1688.shop.offer.list') ||
                url.includes('mtop.1688.offerlist') ||
                url.includes('mtop.alibaba.cbu.shop') ||
                url.includes('shop/data') ||
                url.includes('offer/list') ||
                url.includes('offerlist') ||
                url.includes('shop.data') ||
                url.includes('moduleasyncservice')
            )) {
                console.log('🎯 [Page] 拦截到Fetch API请求:', url);
                
                const clonedResponse = response.clone();
                try {
                    const responseData = await clonedResponse.json();
                    
                    const productIds = extractProductIdsFromApiResponse(responseData);
                    if (productIds.length > 0) {
                        console.log('✅ [Page] 从Fetch API提取到商品ID:', productIds.length, '个');
                        console.log('📋 [Page] 提取的ID:', productIds.slice(0, 5)); // 显示前5个
                        window._shopProductData = [...new Set([...window._shopProductData, ...productIds])];
                        
                        // 通知content script
                        window.postMessage({
                            type: 'SHOP_PRODUCT_DATA_UPDATE',
                            productIds: productIds,
                            source: 'fetch',
                            timestamp: Date.now()
                        }, '*');
                    } else {
                        console.log('⚠️ [Page] Fetch API响应中未找到商品ID');
                        console.log('📄 [Page] 响应数据结构:', Object.keys(responseData));
                    }
                } catch (error) {
                    console.log('ℹ️ [Page] Fetch响应解析失败:', error);
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
            // 过滤掉无效的URL
            if (this._url && typeof this._url === 'string' && !this._url.includes('chrome-extension://invalid') && (
                this._url.includes('mtop.alibaba.alisite.cbu.server.moduleasyncservice') ||
                this._url.includes('mtop.1688.shop.data.get') ||
                this._url.includes('mtop.1688.shop.offerlist') ||
                this._url.includes('mtop.1688.shop.offer.list') ||
                this._url.includes('mtop.1688.offerlist') ||
                this._url.includes('mtop.alibaba.cbu.shop') ||
                this._url.includes('shop/data') ||
                this._url.includes('offer/list') ||
                this._url.includes('offerlist') ||
                this._url.includes('shop.data') ||
                this._url.includes('moduleasyncservice')
            )) {
                console.log('🎯 [Page] 拦截到XHR API请求:', this._url);
                
                this.addEventListener('load', function() {
                    try {
                        const responseData = JSON.parse(this.responseText);
                        
                        const productIds = extractProductIdsFromApiResponse(responseData);
                        if (productIds.length > 0) {
                            console.log('✅ [Page] 从XHR API提取到商品ID:', productIds.length, '个');
                            console.log('📋 [Page] 提取的ID:', productIds.slice(0, 5)); // 显示前5个
                            window._shopProductData = [...new Set([...window._shopProductData, ...productIds])];
                            
                            window.postMessage({
                                type: 'SHOP_PRODUCT_DATA_UPDATE',
                                productIds: productIds,
                                source: 'xhr',
                                timestamp: Date.now()
                            }, '*');
                        } else {
                            console.log('⚠️ [Page] XHR API响应中未找到商品ID');
                            console.log('📄 [Page] 响应数据结构:', Object.keys(responseData));
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
    
    // 从API响应中提取商品ID - 精确版本
    function extractProductIdsFromApiResponse(apiData) {
        const productIds = [];
        
        try {
            console.log('🔍 [Page] 开始解析API响应');
            console.log('📄 [Page] API响应结构:', Object.keys(apiData || {}));
            
            // 检查API响应是否成功
            if (apiData?.ret && Array.isArray(apiData.ret) && apiData.ret.length > 0) {
                const retCode = apiData.ret[0];
                if (retCode.includes('FAIL') || retCode.includes('ERROR')) {
                    console.log('❌ [Page] API返回错误:', retCode);
                    return productIds;
                }
            }
            
            // 只从已知的结构化字段中提取商品ID
            
            // 处理主要的商品列表API响应
            if (apiData?.data?.content?.offerList) {
                const offerList = apiData.data.content.offerList;
                console.log(`📋 [Page] 处理offerList，包含${offerList.length}个商品`);
                
                offerList.forEach((offer, index) => {
                    if (offer.id && isValidProductId(offer.id)) {
                        const productId = offer.id.toString();
                        if (!productIds.includes(productId)) {
                            productIds.push(productId);
                            console.log(`🎯 [Page] offerList[${index}].id = ${productId}`);
                        }
                    }
                });
            }
            
            // 处理其他格式的商品列表
            if (apiData?.data?.content?.offerModuleList) {
                const offerModules = apiData.data.content.offerModuleList;
                console.log(`📋 [Page] 处理offerModuleList，包含${offerModules.length}个模块`);
                
                offerModules.forEach((module, index) => {
                    if (module.id && isValidProductId(module.id)) {
                        const productId = module.id.toString();
                        if (!productIds.includes(productId)) {
                            productIds.push(productId);
                            console.log(`🎯 [Page] offerModuleList[${index}].id = ${productId}`);
                        }
                    }
                });
            }
            
            // 处理其他可能的商品数据结构
            if (apiData?.data?.content?.items) {
                const items = apiData.data.content.items;
                console.log(`📋 [Page] 处理items，包含${items.length}个商品`);
                
                items.forEach((item, index) => {
                    if (item.id && isValidProductId(item.id)) {
                        const productId = item.id.toString();
                        if (!productIds.includes(productId)) {
                            productIds.push(productId);
                            console.log(`🎯 [Page] items[${index}].id = ${productId}`);
                        }
                    }
                    
                    // 检查item中的offerId字段
                    if (item.offerId && isValidProductId(item.offerId)) {
                        const productId = item.offerId.toString();
                        if (!productIds.includes(productId)) {
                            productIds.push(productId);
                            console.log(`🎯 [Page] items[${index}].offerId = ${productId}`);
                        }
                    }
                });
            }
            
            // 处理商品详情数据
            if (apiData?.data?.content?.offer) {
                const offer = apiData.data.content.offer;
                if (offer.id && isValidProductId(offer.id)) {
                    const productId = offer.id.toString();
                    if (!productIds.includes(productId)) {
                        productIds.push(productId);
                        console.log(`🎯 [Page] offer.id = ${productId}`);
                    }
                }
            }
            
        } catch (error) {
            console.error('❌ [Page] API响应解析失败:', error);
        }
        
        console.log(`✅ [Page] API解析完成，提取到${productIds.length}个商品ID`);
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
    
    // 点击翻页到指定页面 - 只使用点击，不使用URL跳转
    async function clickToNextPage(targetPage) {
        try {
            console.log(`🖱️ [Page] 尝试翻页到第${targetPage}页`);
            
            // 方法1：优先查找1688下一页按钮
            const fuiNextButton = document.querySelector('.fui-arrow.fui-next');
            if (fuiNextButton && fuiNextButton.offsetParent !== null) {
                console.log(`🎯 [Page] 找到1688下一页按钮，点击`);
                fuiNextButton.click();
                return true;
            }
            
            // 方法2：直接点击页码数字（最准确的方法）
            const pageNumbers = Array.from(document.querySelectorAll('button, a, span')).filter(el => {
                const text = el.textContent.trim();
                return text === targetPage.toString() && el.offsetParent !== null; // 确保元素可见
            });
            
            if (pageNumbers.length > 0) {
                console.log(`🎯 [Page] 找到页码${targetPage}按钮，点击`);
                pageNumbers[0].click();
                return true;
            }
            
            // 方法3：如果是连续翻页，点击"下一页"按钮
            const nextButtons = Array.from(document.querySelectorAll('button, a')).filter(el => {
                const text = el.textContent.trim();
                return (text.includes('下一页') || text === '>') && el.offsetParent !== null;
            });
            
            if (nextButtons.length > 0) {
                console.log(`🖱️ [Page] 点击下一页按钮`);
                nextButtons[0].click();
                return true;
            }
            
            // 所有点击方法都失败
            console.error(`❌ [Page] 无法找到可点击的翻页元素，翻页到第${targetPage}页失败`);
            return false;
            
        } catch (error) {
            console.error(`❌ [Page] 翻页到第${targetPage}页失败:`, error);
            return false;
        }
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