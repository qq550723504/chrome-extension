// 1688商品ID收集工具 - 弹窗脚本
class PopupManager {
    constructor() {
        this.init();
    }

    async init() {
        await this.loadStats();
        this.bindEvents();
    }

    // 加载统计数据
    async loadStats() {
        try {
            // 检测当前页面类型
            await this.detectCurrentPageType();
            
            const result = await chrome.storage.local.get(['productData']);
            const productData = result.productData || {
                ids: [],
                exportedIds: [],
                stats: {
                    totalIds: 0,
                    exportedCount: 0,
                    lastCollectCount: 0
                }
            };

            const totalIds = productData.ids.length;
            const exportedCount = productData.exportedIds.length;
            const unExportedCount = totalIds - exportedCount;
            const lastCollectCount = productData.stats.lastCollectCount || 0;

            document.getElementById('totalProducts').textContent = totalIds;
            document.getElementById('currentPage').textContent = lastCollectCount;
            document.getElementById('avgPrice').textContent = `${unExportedCount} 未导出`;
        } catch (error) {
            console.error('加载统计数据失败:', error);
        }
    }

    // 检测当前页面类型
    async detectCurrentPageType() {
        try {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            
            if (!tab.url.includes('1688.com')) {
                this.updatePageTypeDisplay('非1688页面');
                return;
            }

            // 尝试获取页面类型信息
            try {
                const response = await chrome.tabs.sendMessage(tab.id, { action: 'ping' });
                if (response && response.success) {
                    const pageType = response.pageType === 'shop' ? '店铺页面' : '搜索结果页';
                    this.updatePageTypeDisplay(pageType);
                } else {
                    this.updatePageTypeDisplay('1688页面（未检测）');
                }
            } catch (error) {
                this.updatePageTypeDisplay('1688页面（需刷新）');
            }
        } catch (error) {
            this.updatePageTypeDisplay('页面检测失败');
        }
    }

    // 更新页面类型显示
    updatePageTypeDisplay(pageType) {
        const pageTypeElement = document.getElementById('pageType');
        if (pageTypeElement) {
            pageTypeElement.textContent = pageType;
            
            // 根据页面类型设置不同的样式
            pageTypeElement.className = 'page-type';
            if (pageType.includes('店铺')) {
                pageTypeElement.classList.add('shop-page');
            } else if (pageType.includes('搜索')) {
                pageTypeElement.classList.add('search-page');
            }
        }
    }

    // 绑定事件
    bindEvents() {
        document.getElementById('collectBtn').addEventListener('click', () => this.collectProductIds());
        document.getElementById('exportBtn').addEventListener('click', () => this.exportData());
        document.getElementById('clearBtn').addEventListener('click', () => this.clearData());
    }

    // 收集商品ID
    async collectProductIds() {
        const collectBtn = document.getElementById('collectBtn');
        const pageCountInput = document.getElementById('pageCount');
        const progressDiv = document.getElementById('progressDiv');
        
        try {
            const pageCount = parseInt(pageCountInput.value) || 1;
            if (pageCount < 1 || pageCount > 50) {
                this.showStatus('页数必须在1-50之间', 'error');
                return;
            }

            collectBtn.textContent = '收集中...';
            collectBtn.disabled = true;
            progressDiv.classList.add('show');
            
            // 获取当前活动标签页
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            
            if (!tab.url.includes('1688.com')) {
                this.showStatus('请在1688网站上使用此工具', 'error');
                return;
            }

            // 检测content script是否已注入
            let response;
            try {
                response = await chrome.tabs.sendMessage(tab.id, { action: 'ping' });
            } catch (error) {
                try {
                    await chrome.scripting.executeScript({
                        target: { tabId: tab.id },
                        files: ['content.js']
                    });
                    
                    // 等待脚本初始化
                    await new Promise(resolve => setTimeout(resolve, 1000));
                    
                    response = await chrome.tabs.sendMessage(tab.id, { action: 'ping' });
                } catch (injectError) {
                    this.showStatus('无法注入脚本，请刷新页面后重试', 'error');
                    return;
                }
            }

            if (!response || !response.success) {
                this.showStatus('Content script未正常运行，请刷新页面重试', 'error');
                return;
            }

            // 更新页面类型显示
            const pageType = response.pageType === 'shop' ? '店铺页面' : '搜索结果页';
            this.updatePageTypeDisplay(pageType);

            // 根据页面类型选择收集策略
            if (response.pageType === 'shop') {
                // 店铺页面：使用API拦截方式
                await this.collectFromShopPage(tab.id, progressDiv);
            } else {
                // 搜索结果页：使用DOM方式收集单页
                await this.collectFromSearchPage(tab.id, progressDiv);
            }
            
        } catch (error) {
            this.showStatus('收集失败，请刷新页面重试', 'error');
            console.error('收集过程出错:', error);
        } finally {
            collectBtn.textContent = '收集商品ID';
            collectBtn.disabled = false;
            progressDiv.classList.remove('show');
        }
    }

    // 从店铺页面收集商品ID
    async collectFromShopPage(tabId, progressDiv) {
        const pageCountInput = document.getElementById('pageCount');
        const pageCount = parseInt(pageCountInput.value) || 1;
        
        if (pageCount === 1) {
            // 收集单页
            this.showStatus('开始从店铺页面收集商品ID...', 'info');
            progressDiv.textContent = '正在从店铺页面收集商品ID...';
            
            console.log('🚀 [Popup] 发送收集消息到content script, tabId:', tabId);
            
            try {
                // 发送收集命令
                const collectResponse = await chrome.tabs.sendMessage(tabId, { 
                    action: 'collectProductIds',
                    pageType: 'shop'
                });
                
                console.log('📨 [Popup] 收到content script响应:', collectResponse);
                
                if (collectResponse && collectResponse.success) {
                    this.showStatus(`店铺页面收集完成！共收集了 ${collectResponse.count} 个商品ID`, 'success');
                    await this.loadStats();
                } else {
                    const errorMsg = collectResponse ? collectResponse.message : '未收到响应';
                    this.showStatus(`店铺页面收集失败：${errorMsg}`, 'error');
                }
            } catch (error) {
                console.error('❌ [Popup] 发送消息失败:', error);
                this.showStatus(`通信失败：${error.message}`, 'error');
            }
        } else {
            // 收集多页
            this.showStatus(`开始收集所有${pageCount}页商品ID...`, 'info');
            progressDiv.textContent = `正在收集所有${pageCount}页商品ID...`;
            
            console.log('🚀 [Popup] 发送收集所有页面消息, pageCount:', pageCount);
            
            try {
                // 发送收集所有页面命令
                const collectResponse = await chrome.tabs.sendMessage(tabId, { 
                    action: 'collectProductIds',
                    pageType: 'shop',
                    collectAllPages: true,
                    totalPages: pageCount
                });
                
                console.log('📨 [Popup] 收到所有页面收集响应:', collectResponse);
                
                if (collectResponse && collectResponse.success) {
                    this.showStatus(`所有页面收集完成！共收集了 ${collectResponse.count} 个商品ID`, 'success');
                    await this.loadStats();
                } else {
                    const errorMsg = collectResponse ? collectResponse.message : '未收到响应';
                    this.showStatus(`所有页面收集失败：${errorMsg}`, 'error');
                }
            } catch (error) {
                console.error('❌ [Popup] 发送消息失败:', error);
                this.showStatus(`通信失败：${error.message}`, 'error');
            }
        }
    }

    // 从搜索结果页收集商品ID（单页）
    async collectFromSearchPage(tabId, progressDiv) {
        this.showStatus('开始从搜索结果页收集商品ID...', 'info');
        progressDiv.textContent = '正在从搜索结果页收集商品ID...';
        
        try {
            // 发送收集命令
            const collectResponse = await chrome.tabs.sendMessage(tabId, { 
                action: 'collectProductIds',
                pageType: 'search'
            });
            
            if (collectResponse && collectResponse.success) {
                this.showStatus(`搜索页面收集完成！共收集了 ${collectResponse.count} 个商品ID`, 'success');
                await this.loadStats();
            } else {
                const errorMsg = collectResponse ? collectResponse.message : '未收到响应';
                this.showStatus(`搜索页面收集失败：${errorMsg}`, 'error');
            }
        } catch (error) {
            console.error('❌ [Popup] 搜索页面收集失败:', error);
            this.showStatus(`通信失败：${error.message}`, 'error');
        }
    }

    // 导出数据
    async exportData() {
        try {
            const result = await chrome.storage.local.get(['productData']);
            const productData = result.productData || {
                ids: [],
                exportedIds: [],
                stats: {}
            };
            
            // 只导出未导出的ID
            const unExportedIds = productData.ids.filter(id => !productData.exportedIds.includes(id));
            
            if (unExportedIds.length === 0) {
                this.showStatus('暂无新数据可导出', 'error');
                return;
            }

            // 转换为CSV格式
            const csvContent = this.convertIdsToCSV(unExportedIds);
            const filename = `1688商品ID_${new Date().toISOString().split('T')[0]}.csv`;
            
            // 创建下载链接
            const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
            const link = document.createElement('a');
            const url = URL.createObjectURL(blob);
            
            link.setAttribute('href', url);
            link.setAttribute('download', filename);
            link.style.visibility = 'hidden';
            
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            
            // 标记这些ID为已导出
            const updatedExportedIds = [...productData.exportedIds, ...unExportedIds];
            const updatedData = {
                ...productData,
                exportedIds: updatedExportedIds,
                stats: {
                    ...productData.stats,
                    exportedCount: updatedExportedIds.length,
                    lastExportTime: new Date().toISOString(),
                    lastExportCount: unExportedIds.length
                }
            };
            
            await chrome.storage.local.set({ productData: updatedData });
            await this.loadStats();
            
            this.showStatus(`成功导出 ${unExportedIds.length} 个新商品ID`, 'success');
            
        } catch (error) {
            console.error('导出数据失败:', error);
            this.showStatus('导出失败', 'error');
        }
    }

    // 转换商品ID为CSV格式
    convertIdsToCSV(productIds) {
        const headers = ['商品ID', '商品链接', '收集时间'];
        const csvRows = [headers.join(',')];
        
        productIds.forEach(productId => {
            const row = [
                `"${productId}"`,
                `"https://detail.1688.com/offer/${productId}.html"`,
                `"${new Date().toISOString()}"`
            ];
            csvRows.push(row.join(','));
        });
        
        return csvRows.join('\n');
    }

    // 清空数据
    async clearData() {
        if (confirm('确定要清空所有收集的商品ID吗？此操作不可恢复。')) {
            try {
                await chrome.storage.local.clear();
                await this.loadStats();
                this.showStatus('数据已清空', 'success');
            } catch (error) {
                console.error('清空数据失败:', error);
                this.showStatus('清空失败', 'error');
            }
        }
    }

    // 显示状态信息
    showStatus(message, type = 'info') {
        const statusDiv = document.getElementById('statusDiv');
        statusDiv.textContent = message;
        statusDiv.className = `status ${type}`;
        statusDiv.style.display = 'block';
        
        // 3秒后自动隐藏
        setTimeout(() => {
            statusDiv.style.display = 'none';
        }, 3000);
    }
}

// 初始化弹窗管理器
document.addEventListener('DOMContentLoaded', () => {
    new PopupManager();
});