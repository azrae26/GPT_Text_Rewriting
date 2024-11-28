/**
 * 股票分析器模組
 * 
 * 依賴模組：
 * 1. stock_report_helper/quick-copy.js
 *    - performQuickCopy：用於複製股票代碼和名稱
 * 
 * 2. Chrome Storage API
 *    - chrome.storage.local：用於存儲處理過的股票和失敗的股票
 * 
 * 3. Chrome Runtime API
 *    - chrome.runtime.sendMessage：用於發送日誌訊息
 * 
 * 主要功能：
 * - 自動處理股票代碼輸入
 * - 監控股票更新狀態
 * - 處理失敗重試機制
 * - 日誌記錄和錯誤處理
 */

// 配置文件：定義顏色、超時時間、重試次數等全局設定
if (typeof CONFIG !== 'undefined') {
    Object.assign(CONFIG, {
        // 顏色配置
        COLORS: {
            INFO: '#2196F3',    // 一般信息的顏色
            SUCCESS: '#4CAF50', // 成功信息的顏色
            WARNING: '#FFC107', // 警告信息的顏色
            ERROR: '#F44336',   // 錯誤信息的顏色
            PROGRESS: '#9C27B0' // 進度信息的顏色
        },
        
        // 各種操作的超時時間（單位：毫秒）
        TIMEOUTS: {
            ...CONFIG.TIMEOUTS,
            STOCK_UPDATE: 4000,      // 等待股票代碼更新的最大時間
            CHECK_INTERVAL: 100,     // 檢查股票代碼更新的間隔時間
            SUGGESTION_WAIT: 300,    // 每次檢查建議選項的間隔時間
            CLOSE_PAGE_DELAY: 500,   // 關閉當前分頁前的延遲時間
            NEXT_PAGE_DELAY: 300,    // 開啟下一個分頁前的延遲時間
            ENTER_KEY: 100,           // 模擬按鍵事件的間隔時間
        },
        
        // 重試相關配置
        RETRY: {
            MAX_ATTEMPTS: 2,         // 處理單個股票時的最大重試次數
            SUGGESTION_MAX: 20       // 等待建議選項出現的最大檢查次數（總等待時間 = SUGGESTION_WAIT * SUGGESTION_MAX）
        },
        
        // URL配置
        URLS: {
            ...CONFIG.URLS,
            STOCK_ANALYSIS: 'https://pro.uanalyze.com.tw/lab/dashboard/lynch-tengrower/38364'  // 不得修改此網址
        }
    });
}

// Logger類：用於記錄和發送日誌信息到背景頁面
const originalLog = Logger.log;
const originalError = Logger.error;

Logger.log = function(message, data = null, type = 'INFO') {
    // 調用原始的日誌函數
    originalLog(message, data);
    
    // 發送到背景頁
    const logMessage = data ? `${message} ${JSON.stringify(data)}` : message;
    chrome.runtime.sendMessage({
        type: 'LOG',
        source: 'StockAnalyzer',
        message: logMessage,
        color: CONFIG.COLORS[type],
        timestamp: new Date().toISOString()
    });
};

Logger.error = function(message, error = null) {
    // 調用原始的錯誤日誌函數
    originalError(message, error);
    
    // 發送到背景頁
    chrome.runtime.sendMessage({
        type: 'LOG',
        source: 'StockAnalyzer',
        message: `${message} ${error ? error.message || JSON.stringify(error) : ''}`,
        color: CONFIG.COLORS.ERROR,
        timestamp: new Date().toISOString()
    });
};

// DOMHelper類：提供DOM操作相關的輔助方法
class DOMHelper {
    static async waitForElement(selector, timeout = 5000) {
        const startTime = Date.now();
        while (Date.now() - startTime < timeout) {
            const element = document.querySelector(selector);
            if (element) return element;
            await new Promise(resolve => setTimeout(resolve, 100));
        }
        return null;
    }
    // 創建按鈕
    static createButton(text, styles) {
        const button = document.createElement('button');
        button.textContent = text;
        Object.assign(button.style, styles);
        return button;
    }
    // 模擬鍵盤事件
    static async simulateKeyEvents(element, key) {
        const events = ['keydown', 'keypress', 'keyup'];
        for (const eventType of events) {
            const event = new KeyboardEvent(eventType, {
                key,
                code: key,
                keyCode: key === 'Enter' ? 13 : key.charCodeAt(0),
                which: key === 'Enter' ? 13 : key.charCodeAt(0),
                bubbles: true,
                cancelable: true
            });
            element.dispatchEvent(event);
            await new Promise(resolve => setTimeout(resolve, CONFIG.TIMEOUTS.ENTER_KEY));
        }
    }
}

// StockProcessor類：處理單個股票的核心邏輯
class StockProcessor {
    constructor() {
        this.processedStocks = new Set();
        this.failedStocks = new Set();
    }

    async processStock(code, retryCount = 0) {
        try {
            Logger.log(`開始處理股票 ${code}，重試次數：${retryCount}`, null, 'INFO');
            
            const input = await this.getStockInput();
            if (!input) {
                Logger.log('找不到輸入框', { selector: 'input[type="text"][aria-autocomplete="list"]' }, 'ERROR');
                throw new Error('找不到輸入框');
            }
            Logger.log('找到輸入框', { element: input.outerHTML }, 'INFO');

            await this.inputStockCode(input, code);
            Logger.log('已輸入股票代碼', { code }, 'INFO');

            const success = await this.waitForStockUpdate(code);
            Logger.log('等待股票更新結果', { success, code }, 'INFO');
            
            if (!success) {
                throw new Error('股票更新超時');
            }

            this.processedStocks.add(code);
            await this.updateStorage();
            return true;
        } catch (error) {
            Logger.log(`處理股票 ${code} 失敗`, { error: error.message }, 'ERROR');
            
            // 處理股票代碼不存在或已達最大重試次數
            if (error.message === '股票代碼不存在' || retryCount >= CONFIG.RETRY.MAX_ATTEMPTS) {
                this.failedStocks.add(code);
                await this.updateStorage();
                await this.processNextStock();
                return true;
            }
            
            // 需要重試
            await this.retryStock(code, retryCount);
            return false;
        }
    }

    // 處理下一個股票
    async processNextStock() {
        const storage = await chrome.storage.local.get(['pendingStockCodes']);
        const { pendingStockCodes = [] } = storage;
        
        if (pendingStockCodes.length > 0) {
            const nextCode = pendingStockCodes[0];
            await chrome.storage.local.set({
                pendingStockCodes: pendingStockCodes.slice(1),
                currentProcessing: {
                    code: nextCode,
                    retryCount: 0
                }
            });
            
            const url = CONFIG.URLS.STOCK_ANALYSIS;
            Logger.log(`開啟下一個股票分頁`, { url, nextCode }, 'INFO');
            window.open(url, '_blank');
            
            // 等待確保新分頁開啟
            await new Promise(resolve => setTimeout(resolve, CONFIG.TIMEOUTS.CLOSE_PAGE_DELAY));
        }
        
        window.close();
    }

    // 重試當前股票
    async retryStock(code, retryCount) {
        await chrome.storage.local.set({
            currentProcessing: {
                code: code,
                retryCount: retryCount + 1
            }
        });

        const url = CONFIG.URLS.STOCK_ANALYSIS;
        Logger.log(`開啟重試分頁`, { url, code, nextRetry: retryCount + 1 }, 'INFO');
        window.open(url, '_blank');

        // 等待確保新分頁開啟
        await new Promise(resolve => setTimeout(resolve, CONFIG.TIMEOUTS.CLOSE_PAGE_DELAY));
        window.close();
    }

    // 獲取股票輸入框
    async getStockInput() {
        Logger.log('開始尋找輸入框', null, 'INFO');
        const input = await DOMHelper.waitForElement('input[type="text"][aria-autocomplete="list"]');
        if (input) {
            Logger.log('成功找到輸入框', { element: input.outerHTML }, 'SUCCESS');
        } else {
            Logger.log('等待輸入框超時', null, 'ERROR');
        }
        return input;
    }

    // 輸入股票代碼
    async inputStockCode(input, code) {
        Logger.log('準備輸入股票代碼', { code }, 'INFO');
        input.focus();
        input.value = code;
        input.dispatchEvent(new Event('input', { bubbles: true }));
        Logger.log('已設置輸入框值', { value: input.value }, 'INFO');
        
        // 等待建議選項出現
        let retryCount = 0;
        let suggestionFound = false;

        while (retryCount < CONFIG.RETRY.SUGGESTION_MAX && !suggestionFound) {
            const suggestionContainer = document.querySelector('.react-autosuggest__suggestions-container--open');
            const suggestions = suggestionContainer?.querySelectorAll('.react-autosuggest__suggestion');
            
            if (suggestions?.length > 0) {
                // 找到完全匹配的建議
                for (const suggestion of suggestions) {
                    if (suggestion.textContent.includes(code)) {
                        Logger.log('找到匹配的建議選項', { text: suggestion.textContent }, 'INFO');
                        suggestion.click();
                        suggestionFound = true;
                        break;
                    }
                }
                // 如果沒有找到完全匹配，直接拋出錯誤
                if (!suggestionFound) {
                    Logger.log('未找到匹配的建議選項', { code }, 'ERROR');
                    throw new Error('股票代碼不存在');
                }
                break;
            }
            
            retryCount++;
            await new Promise(resolve => setTimeout(resolve, CONFIG.TIMEOUTS.SUGGESTION_WAIT));
            Logger.log('等待建議選項中...', { 
                retryCount, 
                maxRetries: CONFIG.RETRY.SUGGESTION_MAX,
                totalWaitTime: retryCount * CONFIG.TIMEOUTS.SUGGESTION_WAIT
            }, 'INFO');
        }

        if (!suggestionFound) {
            const totalTime = retryCount * CONFIG.TIMEOUTS.SUGGESTION_WAIT;
            Logger.log('等待建議選項超時', { code, totalTime }, 'ERROR');
            throw new Error('等待建議選項超時');
        }

        // 找到匹配的建議後，發送Enter
        await DOMHelper.simulateKeyEvents(input, 'Enter');
        Logger.log('已發送Enter鍵事件', null, 'INFO');
    }

    // 等待股票更新
    async waitForStockUpdate(code) {
        Logger.log('開始等待股票更新', { code }, 'INFO');
        const startTime = Date.now();
        while (Date.now() - startTime < CONFIG.TIMEOUTS.STOCK_UPDATE) {
            const element = document.querySelector('.stock-number');
            if (element) {
                Logger.log('找到股票號碼元素', { text: element.textContent }, 'INFO');
                if (element.textContent.trim() === code) {
                    Logger.log('股票更新成功', { code }, 'SUCCESS');
                    return true;
                }
            }
            await new Promise(resolve => setTimeout(resolve, CONFIG.TIMEOUTS.CHECK_INTERVAL));
        }
        Logger.log('股票更新超時', { code }, 'ERROR');
        return false;
    }

    // 更新儲存
    async updateStorage() {
        await chrome.storage.local.set({
            processedStocks: Array.from(this.processedStocks),
            failedStocks: Array.from(this.failedStocks)
        });
    }
}

// 全局鎖：防止重複初始化和處理
window.stockAnalyzerLock = window.stockAnalyzerLock || {
    processing: false,
    initialized: false
};

// StockAnalyzer類：主要的分析器類，負責UI和流程控制
class StockAnalyzer {
    constructor() {
        // 檢查是否已經初始化
        if (window.stockAnalyzerLock.initialized) {
            Logger.log('StockAnalyzer 已經初始化，跳過', null, 'INFO');
            return;
        }
        
        Logger.log('初始化 StockAnalyzer', null, 'INFO');
        this.button = null;
        this.processor = new StockProcessor();
        this.init();
        
        // 標記為已初始化
        window.stockAnalyzerLock.initialized = true;
    }

    // 初始化
    init() {
        this.checkAndHandlePage();
        this.setupUrlChangeListener();
    }

    // 設置 URL 監聽器
    setupUrlChangeListener() {
        let lastUrl = location.href;
        new MutationObserver(() => {
            const url = location.href;
            if (url !== lastUrl) {
                lastUrl = url;
                this.checkAndHandlePage();
            }
        }).observe(document, { subtree: true, childList: true });

        window.addEventListener('popstate', () => this.checkAndHandlePage());
    }

    // 檢查和處理頁面
    checkAndHandlePage() {
        const isResearchListPage = location.href.startsWith(CONFIG.URLS.RESEARCH_LIST);
        isResearchListPage ? this.createAnalyzeButton() : this.removeAnalyzeButton();
    }

    // 創建分析按鈕
    createAnalyzeButton() {
        if (this.button) return;

        Logger.log('創建分析按鈕', null, 'INFO');
        this.button = DOMHelper.createButton('開啟', {
            marginTop: '-11px',
            padding: '6px 14px',
            backgroundColor: '#1976d2',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
            fontSize: '14px',
            fontWeight: '500',
            transition: 'background-color 0.2s',
            boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
        });

        this.button.addEventListener('mouseover', () => this.button.style.backgroundColor = '#1565c0');
        this.button.addEventListener('mouseout', () => this.button.style.backgroundColor = '#1976d2');
        this.button.addEventListener('click', () => this.handleAnalyze());

        const toolbar = document.querySelector('.MuiDataGrid-toolbarContainer');
        if (toolbar) {
            toolbar.insertBefore(this.button, toolbar.firstChild.nextSibling);
            Logger.log('分析按鈕已添加到工具欄', null, 'SUCCESS');
        }
    }

    // 移除分析按鈕
    removeAnalyzeButton() {
        if (this.button?.parentNode) {
            this.button.parentNode.removeChild(this.button);
            this.button = null;
            Logger.log('分析按鈕已移除', null, 'INFO');
        }
    }

    // 處理分析流程
    async handleAnalyze() {
        Logger.log('開始分析流程', null, 'INFO');
        
        try {
            // 使用performQuickCopy函數進行複製
            const clipboardText = await window.performQuickCopy();
            if (!clipboardText) {
                Logger.log('複製操作失敗', null, 'ERROR');
                return;
            }

            // 解析股票代碼
            const stockCodes = this.parseStockCodes(clipboardText);
            if (stockCodes.length === 0) {
                Logger.log('未找到有效的股票代碼', null, 'ERROR');
                return;
            }

            Logger.log('開始處理股票列表', { count: stockCodes.length }, 'INFO');
            
            // 開啟第一個分頁
            this.openStockPage(stockCodes[0]);
            
            // 儲存待處理的股票列表
            await chrome.storage.local.set({
                pendingStockCodes: stockCodes.slice(1),  // 儲存剩餘的股票代碼
                currentProcessing: {
                    code: stockCodes[0],
                    retryCount: 0
                }
            });

        } catch (error) {
            Logger.log('處理過程發生錯誤', { error: error.message }, 'ERROR');
        }
    }

    // 解析股票代碼
    parseStockCodes(text) {
        const stockCodes = new Set();
        const lines = text.split('\n\n'); // 使用兩個換行符分割，因為performQuickCopy返回的格式是這樣的
        
        lines.forEach(line => {
            // 直接提取股票代碼（前4位數字）
            const match = line.match(/^(\d{4})/);
            if (match) {
                stockCodes.add(match[1]);
            }
        });

        const codes = Array.from(stockCodes);
        Logger.log('解析到的股票代碼', { codes }, 'INFO');
        return codes;
    }

    // 開啟股票分析頁面
    openStockPage(code) {
        const url = CONFIG.URLS.STOCK_ANALYSIS;
        Logger.log('開啟股票分析頁面', { url }, 'INFO');
        window.open(url, '_blank');
    }
}

// 在特定頁面初始化股票處理邏輯
if (location.href.includes('lynch-tengrower')) {
    Logger.log('檢測到 lynch-tengrower 頁面', null, 'INFO');
    
    window.addEventListener('load', async () => {
        // 檢查是否已在處理中
        if (window.stockAnalyzerLock.processing) {
            Logger.log('已有處理程序在執行，跳過', null, 'WARNING');
            return;
        }
        
        try {
            window.stockAnalyzerLock.processing = true;
            
            const storage = await chrome.storage.local.get(['currentProcessing', 'pendingStockCodes']);
            const { currentProcessing, pendingStockCodes = [] } = storage;
            
            if (!currentProcessing) {
                window.stockAnalyzerLock.processing = false;
                return;
            }

            const processor = new StockProcessor();
            const success = await processor.processStock(currentProcessing.code, currentProcessing.retryCount);

            if (!success && currentProcessing.retryCount < CONFIG.RETRY.MAX_ATTEMPTS) {
                // 需要重試
                await chrome.storage.local.set({
                    currentProcessing: {
                        code: currentProcessing.code,
                        retryCount: currentProcessing.retryCount + 1
                    }
                });
                // 重新開啟同一個股票的頁面
                setTimeout(() => {
                    window.open(CONFIG.URLS.STOCK_ANALYSIS, '_blank');
                }, CONFIG.TIMEOUTS.NEXT_PAGE_DELAY);
            } else if (pendingStockCodes.length > 0) {
                // 處理下一個股票
                const nextCode = pendingStockCodes[0];
                await chrome.storage.local.set({
                    pendingStockCodes: pendingStockCodes.slice(1),
                    currentProcessing: {
                        code: nextCode,
                        retryCount: 0
                    }
                });
                // 開啟下一個股票的頁面
                setTimeout(() => {
                    window.open(CONFIG.URLS.STOCK_ANALYSIS, '_blank');
                }, CONFIG.TIMEOUTS.NEXT_PAGE_DELAY);
            }
        } catch (error) {
            Logger.log('處理股票時發生錯誤', { error: error.message }, 'ERROR');
            window.close();
        } finally {
            window.stockAnalyzerLock.processing = false;
        }
    });
}

// 初始化主分析器
new StockAnalyzer(); 