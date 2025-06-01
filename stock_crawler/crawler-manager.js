/**
 * 股票爬蟲管理器
 * 功能：
 * - 定時爬取股票清單
 * - 數據解析和處理
 * - 與現有清單比對更新
 * - 狀態管理和進度通知
 * 依賴：StockCrawlerUrls, GlobalSettings
 */

// 配置常數
const CRAWL_DELAY_SECONDS = 0.3; // 每個網頁之間的等待秒數

const StockCrawlerManager = {
  /** 爬蟲狀態 */
  running: false,
  
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
      if (!this.running) {
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
   * 開始爬取股票清單
   * @returns {Promise<void>}
   */
  async startCrawl() {
    console.log('=== 開始爬取股票清單 ===');
    console.log('當前運行狀態:', this.running);
    
    if (this.running) {
      console.log('爬蟲已在運行中，跳過此次請求');
      return;
    }
    
    console.log('設置運行狀態為 true');
    this.running = true;
    this.currentProgress = 0;
    
    this._updateStatus('初始化爬取程序...');
    console.log('已設置運行狀態，當前狀態:', this.running);
    
    try {
      console.log('獲取爬取網址列表...');
      
      // 檢查 StockCrawlerUrls 是否載入
      if (!window.StockCrawlerUrls) {
        throw new Error('StockCrawlerUrls 未載入');
      }
      
      console.log('StockCrawlerUrls 已載入，正在獲取網址...');
      const urls = window.StockCrawlerUrls.getAllUrls();
      const totalUrls = urls.length;
      const allStocks = new Map(); // 儲存所有爬取到的股票
      
      if (totalUrls === 0) {
        throw new Error('沒有找到任何爬取網址');
      }
      
      console.log(`共需爬取 ${totalUrls} 個頁面:`, urls);
      this._updateStatus(`共需爬取 ${totalUrls} 個頁面`);
      
      // 依序爬取每個網址
      for (let i = 0; i < urls.length && this.running; i++) {
        const url = urls[i];
        const industryName = window.StockCrawlerUrls.getIndustryName(url);
        
        console.log(`[${i + 1}/${totalUrls}] 開始爬取: ${industryName}`);
        console.log(`爬取網址: ${url}`);
        
        this._updateStatus(`正在爬取 ${industryName} (${i + 1}/${totalUrls})`);
        const progressPercent = Math.round((i / totalUrls) * 90); // 留10%給最後的更新處理
        this._updateProgress(progressPercent);
        console.log(`更新進度: ${progressPercent}%`);
        
        try {
          console.log(`開始爬取 ${industryName} 的數據...`);
          const stocks = await this._fetchStockData(url);
          console.log(`${industryName} 爬取完成，獲得 ${stocks.length} 支股票:`, stocks.map(s => `${s.code}(${s.name})`));
          
          // 將股票加入總列表
          stocks.forEach(stock => {
            allStocks.set(stock.code, stock);
          });
          
          console.log(`目前總共收集到 ${allStocks.size} 支股票`);
          
        } catch (error) {
          console.error(`爬取 ${industryName} 失敗:`, error);
          this._updateStatus(`爬取 ${industryName} 失敗: ${error.message}`);
        }
        
        // 等待指定秒數再爬取下一個（避免過於頻繁的請求）
        if (i < urls.length - 1 && this.running) {
          console.log(`等待 ${CRAWL_DELAY_SECONDS} 秒後繼續下一個網頁...`);
          this._updateStatus(`等待 ${CRAWL_DELAY_SECONDS} 秒後繼續下一個網頁... (${i + 1}/${totalUrls})`);
          await this._delay(CRAWL_DELAY_SECONDS * 1000);
          console.log('等待結束，繼續爬取');
        }
      }
      
      if (this.running) {
        console.log(`所有網頁爬取完成，共獲得 ${allStocks.size} 支股票`);
        this._updateStatus('正在更新股票清單...');
        this._updateProgress(95);
        
        // 更新股票清單
        console.log('開始更新股票清單到設定中...');
        const updateResult = await this._updateStockList(allStocks);
        console.log('股票清單更新結果:', updateResult);
        
        this._updateProgress(100);
        const statusMsg = `爬取完成！新增 ${updateResult.added} 支，刪除 ${updateResult.removed} 支股票，總計 ${updateResult.total} 支`;
        this._updateStatus(statusMsg);
        console.log('=== 爬取流程完成 ===');
        
        if (this.completeCallback) {
          console.log('調用完成回調函數');
          this.completeCallback(updateResult);
        }
      } else {
        console.log('爬取過程中被中斷');
      }
      
    } catch (error) {
      console.error('爬取過程發生錯誤:', error);
      this._updateStatus(`爬取失敗: ${error.message}`);
    } finally {
      console.log('重置運行狀態為 false');
      this.running = false;
      console.log('=== 爬取流程結束 ===');
    }
  },

  /**
   * 停止爬取
   */
  stopCrawl() {
    console.log('停止爬取');
    this.running = false;
    
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
    console.log(`開始爬取網頁: ${url}`);
    
    try {
      console.log('發送跨域請求到 background script...');
      
      // 使用 background script 來處理跨域請求
      const response = await new Promise((resolve, reject) => {
        console.log('正在發送 chrome.runtime.sendMessage...');
        chrome.runtime.sendMessage({
          action: 'fetchUrl',
          url: url
        }, (response) => {
          console.log('收到 background script 回應:', response);
          
          if (chrome.runtime.lastError) {
            console.error('Chrome runtime 錯誤:', chrome.runtime.lastError);
            reject(new Error(chrome.runtime.lastError.message));
          } else if (!response) {
            console.error('收到空回應');
            reject(new Error('收到空回應'));
          } else if (response.error) {
            console.error('Background script 回報錯誤:', response.error);
            reject(new Error(response.error));
          } else if (!response.success) {
            console.error('請求失敗，無成功標記');
            reject(new Error('請求失敗'));
          } else {
            console.log('請求成功，數據長度:', response.data ? response.data.length : 0);
            resolve(response);
          }
        });
      });
      
      console.log('開始解析 HTML 數據...');
      const stocks = this._parseStockData(response.data);
      console.log(`HTML 解析完成，提取到 ${stocks.length} 支股票`);
      
      return stocks;
      
    } catch (error) {
      console.error('爬取網頁失敗，詳細錯誤:', error);
      console.error('錯誤堆疊:', error.stack);
      throw error;
    }
  },

  /**
   * 解析股票資料
   * @param {string} html - HTML 內容
   * @returns {Array} 解析出的股票陣列
   */
  _parseStockData(html) {
    console.log('開始解析 MOPS 股票資料');
    const stocks = [];
    
    try {
      // 建立暫時的 DOM 元素來解析 HTML
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, 'text/html');
      
      // 查找所有表格行
      const rows = doc.querySelectorAll('tr');
      console.log(`找到 ${rows.length} 個表格行`);
      
      rows.forEach((row, index) => {
        try {
          const cells = row.querySelectorAll('td');
          
          // MOPS格式至少需要有足夠的欄位
          if (cells.length >= 3) {
            // 第一欄：股票代號（去除空白字符）
            const codeCell = cells[0];
            const stockCode = codeCell ? codeCell.textContent.trim().replace(/&nbsp;/g, '').replace(/\s+/g, '') : '';
            
            // 第二欄：公司全名
            const fullNameCell = cells[1];
            const fullName = fullNameCell ? fullNameCell.textContent.trim() : '';
            
            // 第三欄：公司簡稱
            const shortNameCell = cells[2];
            const shortName = shortNameCell ? shortNameCell.textContent.trim() : '';
            
            // 檢查是否為有效的股票代號（數字開頭，4-6位）
            if (stockCode && /^\d{4,6}$/.test(stockCode) && shortName) {
              const stock = {
                code: stockCode,
                name: shortName,  // 使用公司簡稱
                fullName: fullName  // 保留完整公司名稱作為參考
              };
              
              stocks.push(stock);
            }
          }
        } catch (error) {
          // 跳過單個行的解析錯誤
        }
      });
      
      console.log(`MOPS 解析完成，共找到 ${stocks.length} 支股票`);
      return stocks;
      
    } catch (error) {
      console.error('解析 MOPS 股票資料時發生錯誤:', error);
      return [];
    }
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
    return this.running;
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