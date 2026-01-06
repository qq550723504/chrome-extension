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
            
            this.showStatus(`开始收集 ${pageCount} 页商品ID...`, 'info');

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

            // 开始多页收集
            let totalCollected = 0;
            for (let currentPage = 1; currentPage <= pageCount; currentPage++) {
                progressDiv.textContent = `正在收集第 ${currentPage}/${pageCount} 页...`;
                
                // 发送收集命令
                const collectResponse = await chrome.tabs.sendMessage(tab.id, { 
                    action: 'collectProductIds',
                    pageNumber: currentPage,
                    isMultiPage: pageCount > 1
                });
                
                if (collectResponse.success) {
                    totalCollected += collectResponse.count;
                    progressDiv.textContent = `第 ${currentPage}/${pageCount} 页完成，收集了 ${collectResponse.count} 个商品ID`;
                    
                    // 如果不是最后一页，需要翻页
                    if (currentPage < pageCount) {
                        progressDiv.textContent = `第 ${currentPage}/${pageCount} 页完成，正在翻页...`;
                        
                        const nextPageResponse = await chrome.tabs.sendMessage(tab.id, { 
                            action: 'goToNextPage' 
                        });
                        
                        if (!nextPageResponse.success) {
                            this.showStatus(`翻页失败：${nextPageResponse.message}`, 'error');
                            break;
                        }
                        
                        // 等待页面加载
                        await new Promise(resolve => setTimeout(resolve, 3000));
                    }
                } else {
                    this.showStatus(`第 ${currentPage} 页收集失败：${collectResponse.message}`, 'error');
                    break;
                }
            }
            
            if (totalCollected > 0) {
                this.showStatus(`收集完成！共收集了 ${totalCollected} 个商品ID`, 'success');
                await this.loadStats();
            }
            
        } catch (error) {
            this.showStatus('收集失败，请刷新页面重试', 'error');
        } finally {
            collectBtn.textContent = '收集商品ID';
            collectBtn.disabled = false;
            progressDiv.classList.remove('show');
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