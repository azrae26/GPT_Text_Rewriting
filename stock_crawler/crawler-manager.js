/**
 * 股票爬蟲管理器
 * 功能：
 * - 定時爬取股票清單
 * - 數據解析和處理
 * - 與現有清單比對更新
 * - 狀態管理和進度通知
 * 依賴：StockCrawlerUrls, GlobalSettings
 */

const StockCrawlerManager = {
  /** 爬蟲狀態 */
  isRunning: false,
  
  /** 當前爬取進度 */
  currentProgress: 0,
  
  /** 定時器 */
  intervalTimer: null,
  
  /** 爬取定時器 */
  crawlTimer: null,
  
  /** 狀態回調函數 */
  statusCallback: null,
  
  /** 進度回調函數 */
  progressCallback: null,
  
  /** 完成回調函數 */
  completeCallback: null,

  /**
   * 設置回調函數
   * @param {Function} statusCb - 狀態更新回調
   * @param {Function} progressCb - 進度更新回調
   * @param {Function} completeCb - 完成回調
   */
  setCallbacks(statusCb, progressCb, completeCb) {
    this.statusCallback = statusCb;
    this.progressCallback = progressCb;
    this.completeCallback = completeCb;
  },

  /**
   * 啟動定時爬取
   * @param {number} intervalMinutes - 間隔分鐘數
   */
  startScheduledCrawl(intervalMinutes) {
    console.log(`啟動定時爬取，間隔 ${intervalMinutes} 分鐘`);
    
    // 清除現有定時器
    if (this.intervalTimer) {
      clearInterval(this.intervalTimer);
    }
    
    // 立即執行一次
    this.startCrawl();
    
    // 設置定時器
    this.intervalTimer = setInterval(() => {
      if (!this.isRunning) {
        this.startCrawl();
      }
    }, intervalMinutes * 60 * 1000);
  },

  /**
   * 停止定時爬取
   */
  stopScheduledCrawl() {
    console.log('停止定時爬取');
    
    if (this.intervalTimer) {
      clearInterval(this.intervalTimer);
      this.intervalTimer = null;
    }
    
    this.stopCrawl();
  },

  /**
   * 開始爬取
   */
  async startCrawl() {
    if (this.isRunning) {
      console.log('爬蟲已在運行中');
      return;
    }
    
    console.log('開始爬取股票清單');
    this.isRunning = true;
    this.currentProgress = 0;
    
    this._updateStatus('開始爬取股票清單...');
    
    try {
      const urls = window.StockCrawlerUrls.getAllUrls();
      const totalUrls = urls.length;
      const allStocks = new Map(); // 儲存所有爬取到的股票
      
      console.log(`共需爬取 ${totalUrls} 個頁面`);
      
      // 依序爬取每個網址
      for (let i = 0; i < urls.length && this.isRunning; i++) {
        const url = urls[i];
        const industryName = window.StockCrawlerUrls.getIndustryName(url);
        
        this._updateStatus(`正在爬取 ${industryName} (${i + 1}/${totalUrls})`);
        this._updateProgress(Math.round((i / totalUrls) * 100));
        
        try {
          const stocks = await this._fetchStockData(url);
          console.log(`${industryName} 爬取到 ${stocks.length} 支股票`);
          
          // 將股票加入總列表
          stocks.forEach(stock => {
            allStocks.set(stock.code, stock);
          });
          
        } catch (error) {
          console.error(`爬取 ${industryName} 失敗:`, error);
          this._updateStatus(`爬取 ${industryName} 失敗: ${error.message}`);
        }
        
        // 等待 10 秒再爬取下一個（避免過於頻繁的請求）
        if (i < urls.length - 1 && this.isRunning) {
          await this._delay(10000);
        }
      }
      
      if (this.isRunning) {
        console.log(`爬取完成，共獲得 ${allStocks.size} 支股票`);
        this._updateStatus('正在更新股票清單...');
        
        // 更新股票清單
        const updateResult = await this._updateStockList(allStocks);
        
        this._updateProgress(100);
        this._updateStatus(`爬取完成！新增 ${updateResult.added} 支，刪除 ${updateResult.removed} 支股票`);
        
        if (this.completeCallback) {
          this.completeCallback(updateResult);
        }
      }
      
    } catch (error) {
      console.error('爬取過程發生錯誤:', error);
      this._updateStatus(`爬取失敗: ${error.message}`);
    } finally {
      this.isRunning = false;
    }
  },

  /**
   * 停止爬取
   */
  stopCrawl() {
    console.log('停止爬取');
    this.isRunning = false;
    
    if (this.crawlTimer) {
      clearTimeout(this.crawlTimer);
      this.crawlTimer = null;
    }
    
    this._updateStatus('已停止爬取');
  },

  /**
   * 爬取單個網頁的股票數據
   * @param {string} url - 要爬取的網址
   * @returns {Promise<Array>} 股票數據陣列
   */
  async _fetchStockData(url) {
    try {
      // 使用 background script 來處理跨域請求
      const response = await new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({
          action: 'fetchUrl',
          url: url
        }, (response) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
          } else if (response.error) {
            reject(new Error(response.error));
          } else {
            resolve(response);
          }
        });
      });
      
      return this._parseStockData(response.data);
      
    } catch (error) {
      console.error('爬取網頁失敗:', error);
      throw error;
    }
  },

  /**
   * 解析 HTML 獲取股票數據
   * @param {string} html - 網頁 HTML 內容
   * @returns {Array} 股票數據陣列
   */
  _parseStockData(html) {
    const stocks = [];
    
    try {
      // 創建 DOM 解析器
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, 'text/html');
      
      // 尋找股票資料的表格行
      const rows = doc.querySelectorAll('tr[id^="hrow"], tr[id^="row"]');
      
      rows.forEach(row => {
        try {
          const cells = row.querySelectorAll('td');
          if (cells.length >= 2) {
            // 第一個 td 包含股票代號
            const codeCell = cells[0];
            const codeLink = codeCell.querySelector('a');
            const code = codeLink ? codeLink.textContent.trim() : '';
            
            // 第二個 td 包含公司名稱
            const nameCell = cells[1];
            const nameLink = nameCell.querySelector('a');
            const name = nameLink ? nameLink.textContent.trim() : '';
            
            if (code && name && /^\d{4}$/.test(code)) {
              stocks.push({
                code: code,
                name: name
              });
            }
          }
        } catch (error) {
          console.warn('解析股票行失敗:', error);
        }
      });
      
    } catch (error) {
      console.error('解析 HTML 失敗:', error);
    }
    
    return stocks;
  },

  /**
   * 更新股票清單
   * @param {Map} crawledStocks - 爬取到的股票清單
   * @returns {Promise<Object>} 更新結果
   */
  async _updateStockList(crawledStocks) {
    try {
      // 載入現有股票清單
      const settings = await window.GlobalSettings.loadSettings();
      const currentStockList = settings.stockList || '';
      
      // 解析現有清單
      const existingStocks = this._parseStockList(currentStockList);
      console.log(`現有股票清單包含 ${existingStocks.size} 支股票`);
      
      // 比對和合併
      const mergedStocks = new Map();
      let addedCount = 0;
      let removedCount = 0;
      
      // 添加爬取到的股票
      crawledStocks.forEach((stock, code) => {
        const existing = existingStocks.get(code);
        if (existing) {
          // 保留現有的匹配規則
          mergedStocks.set(code, {
            code: code,
            name: stock.name, // 使用最新的公司名稱
            pattern: existing.pattern // 保留匹配規則
          });
        } else {
          // 新股票
          mergedStocks.set(code, {
            code: code,
            name: stock.name
          });
          addedCount++;
        }
      });
      
      // 檢查被刪除的股票
      existingStocks.forEach((existing, code) => {
        if (!crawledStocks.has(code)) {
          removedCount++;
          console.log(`股票已消失: ${code} ${existing.name}`);
        }
      });
      
      // 按股票代號排序
      const sortedStocks = Array.from(mergedStocks.values()).sort((a, b) => {
        return parseInt(a.code) - parseInt(b.code);
      });
      
      // 格式化為文字
      const newStockListText = sortedStocks.map(stock => {
        if (stock.pattern) {
          return `${stock.code},${stock.name},${stock.pattern}`;
        } else {
          return `${stock.code},${stock.name}`;
        }
      }).join('\n');
      
      // 儲存更新後的清單
      await window.GlobalSettings.saveSingleSetting('stockList', newStockListText);
      
      console.log(`股票清單更新完成: 新增 ${addedCount} 支，刪除 ${removedCount} 支`);
      
      return {
        added: addedCount,
        removed: removedCount,
        total: sortedStocks.length
      };
      
    } catch (error) {
      console.error('更新股票清單失敗:', error);
      throw error;
    }
  },

  /**
   * 解析股票清單文字
   * @param {string} stockListText - 股票清單文字
   * @returns {Map} 股票 Map
   */
  _parseStockList(stockListText) {
    const stocks = new Map();
    
    if (!stockListText || typeof stockListText !== 'string') {
      return stocks;
    }

    const lines = stockListText.split('\n');
    
    for (const line of lines) {
      const trimmedLine = line.trim();
      if (!trimmedLine) continue;

      const parts = trimmedLine.split(',').map(part => part.trim());
      
      if (parts.length >= 2) {
        const stock = {
          code: parts[0],
          name: parts[1]
        };
        
        // 如果有第三個部分，作為匹配模式
        if (parts.length >= 3 && parts[2]) {
          stock.pattern = parts[2];
        }
        
        stocks.set(stock.code, stock);
      }
    }

    return stocks;
  },

  /**
   * 延遲函數
   * @param {number} ms - 延遲毫秒數
   * @returns {Promise}
   */
  _delay(ms) {
    return new Promise(resolve => {
      this.crawlTimer = setTimeout(resolve, ms);
    });
  },

  /**
   * 更新狀態
   * @param {string} status - 狀態文字
   */
  _updateStatus(status) {
    console.log('爬蟲狀態:', status);
    if (this.statusCallback) {
      this.statusCallback(status);
    }
  },

  /**
   * 更新進度
   * @param {number} progress - 進度百分比 (0-100)
   */
  _updateProgress(progress) {
    this.currentProgress = progress;
    if (this.progressCallback) {
      this.progressCallback(progress);
    }
  },

  /**
   * 檢查是否正在運行
   * @returns {boolean}
   */
  isRunning() {
    return this.isRunning;
  },

  /**
   * 獲取當前進度
   * @returns {number}
   */
  getCurrentProgress() {
    return this.currentProgress;
  }
};

// 導出到全域
window.StockCrawlerManager = StockCrawlerManager; 