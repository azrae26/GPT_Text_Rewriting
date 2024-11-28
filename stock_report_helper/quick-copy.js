/**
 * 快速複製模組
 * 
 * 依賴模組：
 * 1. regex_helper/regex-helper.js
 *    - RegexHelper.createRegex：用於創建股票代碼匹配的正則表達式
 * 
 * 2. Chrome Storage API
 *    - localStorage：用於存儲位置設定
 * 
 * 3. Chrome Runtime API
 *    - chrome.runtime.sendMessage：用於發送日誌訊息
 * 
 * 主要功能：
 * - 提供快速複製股票代碼和名稱的功能
 * - 自動格式化複製的內容
 * - 支援拖曳和位置記憶
 * - 錯誤處理和日誌記錄
 */

// 配置常量
const CONFIG = {
    URLS: {
        RESEARCH_LIST: 'https://data.uanalyze.twobitto.com/research-reports'
    },
    SELECTORS: {
        TOOLBAR: '.MuiDataGrid-toolbarContainer',
        GRID_ROOT: '.MuiDataGrid-root',
        SELECT_ALL: 'input[aria-label="取消全選"]'
    },
    STYLES: {
        BUTTON: {
            margin: '-11px 0 0 2px',
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
        }
    },
    DELAYS: {
        EVENT: 100,
        COPY: 200
    }
};

// 日誌工具
class Logger {
    static log(message, data = null) {
        console.log(message, data || '');
    }

    static error(message, error = null) {
        console.error(message, error || '');
    }
}

// DOM 事件模擬器
class EventSimulator {
    static createMouseEvent(type, x, y) {
        return new MouseEvent(type, {
            bubbles: true,
            cancelable: true,
            view: window,
            clientX: x,
            clientY: y,
            button: 0,
            buttons: type === 'mousedown' ? 1 : 0
        });
    }

    static createKeyboardEvent(type, key) {
        return new KeyboardEvent(type, {
            key,
            code: `Key${key.toUpperCase()}`,
            keyCode: key.toUpperCase().charCodeAt(0),
            which: key.toUpperCase().charCodeAt(0),
            ctrlKey: true,
            bubbles: true,
            cancelable: true,
            composed: true
        });
    }

    static async simulateMouseSequence(element, x, y) {
        if (!element) return false;
        
        const events = ['mouseenter', 'mouseover', 'mousedown', 'mouseup', 'click'];
        for (const type of events) {
            element.dispatchEvent(this.createMouseEvent(type, x, y));
            await new Promise(resolve => setTimeout(resolve, 10));
        }
        return true;
    }

    static async simulateKeySequence(element, key) {
        if (!element) return false;
        
        element.focus();
        const events = ['keydown', 'keypress', 'keyup'];
        for (const type of events) {
            element.dispatchEvent(this.createKeyboardEvent(type, key));
            await new Promise(resolve => setTimeout(resolve, 10));
        }
        return true;
    }
}

// 剪貼板管理器
class ClipboardManager {
    static async read() {
        try {
            const text = await navigator.clipboard.readText();
            Logger.log('讀取剪貼板成功', { length: text.length });
            return text;
        } catch (error) {
            Logger.error('讀取剪貼板失敗', error);
            return '';
        }
    }

    static async write(text) {
        try {
            await navigator.clipboard.writeText(text);
            Logger.log('寫入剪貼板成功');
            return true;
        } catch (error) {
            Logger.error('寫入剪貼板失敗', error);
            return false;
        }
    }
}

// 股票數據處理器
class StockDataProcessor {
    constructor(stockList = []) {
        this.stockList = stockList;
    }

    processText(text) {
        const stockCodes = new Set();
        const lines = text.split('\n');
        
        lines.forEach(line => {
            if (line.includes('公司') && !line.includes('優分析')) {
                const match = line.match(/(\d{4,})/);
                if (match) stockCodes.add(match[1]);
            }
        });

        const stocks = Array.from(stockCodes)
            .map(code => this.formatStock(code));
            
        Logger.log('股票處理結果', { 
            總數: stocks.length,
            股票列表: stocks 
        });
        
        return stocks.join('\n\n');
    }

    formatStock(code) {
        const stock = this.stockList.find(s => s.code === code);
        return stock ? `${code}【${stock.name}】` : code;
    }
}

// 主要複製功能類
class QuickCopy {
    constructor() {
        Logger.log('初始化 QuickCopy');
        this.button = null;
        this.stockList = window.stockList || [];
        this.processor = new StockDataProcessor(this.stockList);
        this.init();
    }

    init() {
        this.checkAndHandlePage();
        this.setupUrlChangeListener();
    }

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

    checkAndHandlePage() {
        const isResearchList = location.href.startsWith(CONFIG.URLS.RESEARCH_LIST);
        isResearchList ? this.createCopyButton() : this.removeCopyButton();
    }

    createCopyButton() {
        if (this.button) return;

        Logger.log('創建快速複製按鈕');
        this.button = document.createElement('button');
        this.button.textContent = '快速複製';
        Object.assign(this.button.style, CONFIG.STYLES.BUTTON);
        
        this.button.addEventListener('mouseover', () => this.button.style.backgroundColor = '#1565c0');
        this.button.addEventListener('mouseout', () => this.button.style.backgroundColor = '#1976d2');
        this.button.addEventListener('click', () => this.handleCopy());

        const toolbar = document.querySelector(CONFIG.SELECTORS.TOOLBAR);
        if (toolbar) {
            toolbar.insertBefore(this.button, toolbar.firstChild);
            Logger.log('按鈕已添加到工具欄');
        }
    }

    removeCopyButton() {
        if (this.button?.parentNode) {
            this.button.parentNode.removeChild(this.button);
            this.button = null;
            Logger.log('按鈕已移除');
        }
    }

    async handleCopy() {
        Logger.log('開始複製操作');
        
        try {
            // 1. 觸發表格複製
            Logger.log('正在複製表格內容...');
            if (!await this.triggerGridCopy()) {
                throw new Error('表格複製失敗');
            }
            Logger.log('表格複製成功');

            // 2. 等待複製完成
            await new Promise(resolve => setTimeout(resolve, CONFIG.DELAYS.COPY));
            
            // 3. 獲取和處理剪貼板內容
            const text = await ClipboardManager.read();
            if (!text) throw new Error('剪貼板內容為空');
            Logger.log('獲取剪貼板內容', { 長度: text.length });
            
            // 4. 處理並重新寫入剪貼板
            const processed = this.processor.processText(text);
            const success = await ClipboardManager.write(processed);
            
            if (success) {
                Logger.log('複製完成', { 
                    狀態: '成功',
                    處理後內容長度: processed.length 
                });
            } else {
                throw new Error('寫入剪貼板失敗');
            }
            
        } catch (error) {
            Logger.error('複製過程出錯', error.message);
        }
    }

    async triggerGridCopy() {
        const grid = document.querySelector(CONFIG.SELECTORS.GRID_ROOT);
        if (!grid) {
            Logger.error('未找到表格元素');
            return false;
        }

        const rect = grid.getBoundingClientRect();
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;
        const centerElement = document.elementFromPoint(centerX, centerY);

        if (!centerElement) {
            Logger.error('未找到表格中心元素');
            return false;
        }

        Logger.log('開始模擬選擇和複製操作');
        
        // 模擬選擇和複製操作
        await EventSimulator.simulateMouseSequence(centerElement, centerX, centerY);
        await EventSimulator.simulateKeySequence(centerElement, 'a');
        await EventSimulator.simulateKeySequence(centerElement, 'c');

        // 清除選擇
        const selectAll = document.querySelector(CONFIG.SELECTORS.SELECT_ALL);
        if (selectAll) {
            await EventSimulator.simulateMouseSequence(selectAll);
            Logger.log('已清除表格選擇');
        }

        return true;
    }
}

// 導出複製功能
async function performQuickCopy() {
    Logger.log('開始複製操作');
    
    try {
        const gridRoot = document.querySelector(CONFIG.SELECTORS.GRID_ROOT);
        if (!gridRoot) {
            throw new Error('找不到資料表格');
        }

        // 1. 觸發表格複製
        Logger.log('正在複製表格內容...');
        
        const rect = gridRoot.getBoundingClientRect();
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;
        const centerElement = document.elementFromPoint(centerX, centerY);

        if (!centerElement) {
            throw new Error('未找到表格中心元素');
        }

        // 模擬選擇和複製操作
        await EventSimulator.simulateMouseSequence(centerElement, centerX, centerY);
        await EventSimulator.simulateKeySequence(centerElement, 'a');
        await EventSimulator.simulateKeySequence(centerElement, 'c');

        // 清除選擇
        const selectAll = document.querySelector(CONFIG.SELECTORS.SELECT_ALL);
        if (selectAll) {
            await EventSimulator.simulateMouseSequence(selectAll);
            Logger.log('已清除表格選擇');
        }

        // 2. 等待複製完成
        await new Promise(resolve => setTimeout(resolve, CONFIG.DELAYS.COPY));
        
        // 3. 獲取和處理剪貼板內容
        const text = await ClipboardManager.read();
        if (!text) throw new Error('剪貼板內容為空');
        Logger.log('獲取剪貼板內容', { 長度: text.length });
        
        // 4. 處理並重新寫入剪貼板
        const processor = new StockDataProcessor(window.stockList || []);
        const processed = processor.processText(text);
        const success = await ClipboardManager.write(processed);
        
        if (success) {
            Logger.log('複製完成', { 
                狀態: '成功',
                處理後內容長度: processed.length 
            });
            return processed; // 返回處理後的文本
        } else {
            throw new Error('寫入剪貼板失敗');
        }
        
    } catch (error) {
        Logger.error('複製過程出錯', error.message);
        throw error;
    }
}

// 如果是作為獨立腳本運行，則創建按鈕
if (typeof module === 'undefined') {
    new QuickCopy();
}

// 導出函數供其他模組使用
if (typeof module !== 'undefined') {
    module.exports = { performQuickCopy };
} else {
    window.performQuickCopy = performQuickCopy;
} 