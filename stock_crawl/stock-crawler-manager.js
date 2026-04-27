/**
 * stock_crawl/stock-crawler-manager.js - 背景股票爬蟲管理器 (2026/02/13)
 * 功能：在背景運行股票清單爬取，支援狀態持久化
 * 職責：
 * - 管理定時和單次爬取流程
 * - 解析 MOPS 系統返回的 HTML 數據
 * - 比對和合併股票清單（含安全檢查）
 * - 記錄股票異動變更（新增/刪除記錄）
 * - 記錄爬取執行歷史（爬取記錄）
 * - 通知 popup 和 content script 狀態變化
 * - 跨設備同步爬蟲啟用狀態
 * 
 * 依賴：
 * - LogUtils（來自 default.js）
 * - STOCK_CRAWLER_CONFIG（來自 stock-crawler-config.js）
 * - StockCrawlerUrls（來自 stock-crawler-urls.js）
 * - StockCrawlLog（來自 stock-crawl-log.js）
 * - BACKGROUND_CONSTANTS（來自 background.js）
 * - Chrome Extensions API (storage, alarms, tabs)
 */

/**
 * 背景股票爬蟲管理器
 * 功能：在背景運行，支援狀態持久化，避免重複執行
 */
const BackgroundStockCrawlerManager = {
  /** 爬蟲狀態 */
  running: false,
  
  /** 當前爬取進度 */
  currentProgress: 0,
  
  /** 是否已排程自動爬取（使用 chrome.alarms 持久化） */
  isScheduled: false,
  
  /** 爬取中的延遲定時器（頁面間等待用） */
  crawlTimer: null,
  
  /** 定時間隔（分鐘） */
  intervalMinutes: 0,
  
  /** 狀態更新監聽器 */
  statusListeners: new Set(),

  /** 當前爬取的觸發方式（'手動' | '定時'） */
  _currentTriggerType: '手動',

  // 簡化的進度更新方法
  _updateProgress(status, progress, extraData = {}) {
    this.currentProgress = progress;
    this._notifyStatusChange(BACKGROUND_CONSTANTS.STATUS_TYPES.RUNNING, { 
      status, 
      progress,
      ...extraData
    });
  },

  // 簡化的狀態更新方法
  _updateStatus(type, status, extraData = {}) {
    this._notifyStatusChange(type, { 
      status,
      progress: this.currentProgress,
      ...extraData
    });
  },

  /**
   * 初始化爬蟲管理器，恢復持久化狀態
   * 🆕 修復：優先從 sync storage 載入啟動狀態，實現跨設備同步
   */
  async init() {
    LogUtils.log('初始化背景股票爬蟲管理器');
    try {
      // 🆕 優先從 sync storage 讀取可同步的狀態
      const syncResult = await chrome.storage.sync.get(['crawlerAutoEnabled', 'crawlerInterval']);
      const localResult = await chrome.storage.local.get(['stockCrawlerState']);
      
      const syncState = {
        isScheduled: syncResult.crawlerAutoEnabled || false,
        intervalMinutes: syncResult.crawlerInterval || 30
      };
      
      const localState = localResult.stockCrawlerState || {};
      
      // 合併狀態，sync storage 優先
      const state = {
        ...localState,
        ...syncState
      };
      
      LogUtils.log('恢復的爬蟲狀態', state);
      
      // 🔧 chrome.alarms 是持久化的，Service Worker 重啟時 alarm 仍然存在
      // 只需恢復內部狀態變數，不需要重新建立 alarm
      if (state.isScheduled && state.intervalMinutes) {
        this.intervalMinutes = state.intervalMinutes;
        this.isScheduled = true;
        
        // 驗證 alarm 是否確實存在（防禦性檢查）
        const existingAlarm = await chrome.alarms.get(STOCK_CRAWLER_CONFIG.ALARM_NAME);
        if (existingAlarm) {
          LogUtils.log(`✅ chrome.alarms 定時器仍在運行，間隔 ${state.intervalMinutes} 分鐘，下次觸發: ${new Date(existingAlarm.scheduledTime).toLocaleString()}`);
        } else {
          // alarm 不存在（可能是瀏覽器重啟後丟失），重新建立
          LogUtils.important(`⚠️ chrome.alarms 定時器不存在，重新建立，間隔 ${state.intervalMinutes} 分鐘`);
          chrome.alarms.create(STOCK_CRAWLER_CONFIG.ALARM_NAME, {
            periodInMinutes: state.intervalMinutes
          });
        }
      }
      
      // 🆕 監聽 sync storage 的變化，實現跨設備即時同步
      chrome.storage.sync.onChanged.addListener((changes, areaName) => {
        LogUtils.log('🔍 收到 sync storage 變更', {
          areaName,
          changeKeys: Object.keys(changes),
          hasCrawlerEnabled: !!changes.crawlerAutoEnabled,
          hasCrawlerInterval: !!changes.crawlerInterval
        });
        
        // 🔧 修復：由於 areaName 可能是 undefined，改為直接檢查相關鍵值
        if (changes.crawlerAutoEnabled || changes.crawlerInterval) {
          LogUtils.important('🔄 檢測到爬蟲同步狀態變更', changes);
          this._handleSyncStorageChange(changes);
        } else {
          LogUtils.log('⏸️ 不是爬蟲相關的變更，忽略');
        }
      });
      
      LogUtils.important('✅ 背景股票爬蟲管理器初始化完成');
    } catch (error) {
      LogUtils.error('初始化背景股票爬蟲管理器失敗', error);
    }
  },

  /**
   * 🆕 處理同步儲存變更，實現跨設備即時同步
   */
  async _handleSyncStorageChange(changes) {
    try {
      let needsUpdate = false;
      let newEnabled = null;
      let newInterval = null;
      
      // 檢查啟用狀態變更
      if (changes.crawlerAutoEnabled) {
        newEnabled = changes.crawlerAutoEnabled.newValue;
        LogUtils.log(`⚡ 爬蟲啟用狀態變更: ${changes.crawlerAutoEnabled.oldValue} → ${newEnabled}`);
        needsUpdate = true;
      }
      
      // 檢查間隔變更
      if (changes.crawlerInterval) {
        newInterval = changes.crawlerInterval.newValue;
        LogUtils.log(`⚡ 爬蟲間隔變更: ${changes.crawlerInterval.oldValue} → ${newInterval}`);
        needsUpdate = true;
      }
      
      if (!needsUpdate) return;
      
      // 取得目前的完整狀態
      const syncResult = await chrome.storage.sync.get(['crawlerAutoEnabled', 'crawlerInterval']);
      const isEnabled = syncResult.crawlerAutoEnabled;
      const interval = Number(syncResult.crawlerInterval) || 30;
      
      LogUtils.log(`🔄 應用新的爬蟲設定: 啟用=${isEnabled}, 間隔=${interval}分鐘`);
      
      if (isEnabled && interval) {
        // 啟動定時爬取
        await this._startScheduledCrawl(interval, false);
      } else {
        // 停止定時爬取
        await this.stopScheduledCrawl();
      }
      
    } catch (error) {
      LogUtils.error('處理同步儲存變更失敗', error);
    }
  },

  /**
   * 啟動定時爬取
   * @param {number} intervalMinutes - 間隔分鐘數
   * @param {boolean} runImmediately - 是否立即執行一次
   */
  async _startScheduledCrawl(intervalMinutes, runImmediately = false) {
    LogUtils.log(`啟動定時爬取，間隔 ${intervalMinutes} 分鐘`);
    
    // 驗證參數
    if (!intervalMinutes || isNaN(intervalMinutes) || intervalMinutes < STOCK_CRAWLER_CONFIG.MIN_CRAWL_INTERVAL) {
      throw new Error(`無效的間隔時間: ${intervalMinutes}（最小 ${STOCK_CRAWLER_CONFIG.MIN_CRAWL_INTERVAL} 分鐘）`);
    }
    
    // 防止重複設置：如果已經是相同間隔的排程，直接返回
    if (this.isScheduled && this.intervalMinutes === intervalMinutes) {
      LogUtils.log(`已存在相同間隔 ${intervalMinutes} 分鐘的排程，跳過重複設置`);
      return;
    }
    
    // 清除現有的 alarm
    await this._clearAlarm();
    
    this.intervalMinutes = intervalMinutes;
    this.isScheduled = true;
    
    // 保存狀態
    await this._saveState({ 
      isScheduled: true, 
      intervalMinutes: intervalMinutes,
      lastStartTime: Date.now()
    });
    
    // 立即執行一次（如果需要）
    if (runImmediately) {
      this.startCrawl('定時');
    }
    
    // 🔧 使用 chrome.alarms 取代 setInterval
    // chrome.alarms 是持久化的，不受 Service Worker 休眠影響
    chrome.alarms.create(STOCK_CRAWLER_CONFIG.ALARM_NAME, {
      periodInMinutes: intervalMinutes
    });
    
    LogUtils.log(`✅ chrome.alarms 定時器已設置，間隔 ${intervalMinutes} 分鐘，名稱: ${STOCK_CRAWLER_CONFIG.ALARM_NAME}`);
    
    this._updateStatus(BACKGROUND_CONSTANTS.STATUS_TYPES.SCHEDULED, `自動爬取已啟用，間隔 ${intervalMinutes} 分鐘`, { intervalMinutes });
  },

  /**
   * 停止定時爬取
   */
  async stopScheduledCrawl() {
    LogUtils.log('停止定時爬取');
    
    // 清除 chrome.alarms 定時器
    await this._clearAlarm();
    this.intervalMinutes = 0;
    this.isScheduled = false;
    
    // 保存狀態
    await this._saveState({ 
      isScheduled: false, 
      intervalMinutes: 0 
    });
    
    this._updateStatus('scheduledStopped', '已停止自動爬取');
  },

  /**
   * 清除 chrome.alarms 定時爬取
   */
  async _clearAlarm() {
    try {
      const wasCleared = await chrome.alarms.clear(STOCK_CRAWLER_CONFIG.ALARM_NAME);
      if (wasCleared) {
        LogUtils.log(`✅ chrome.alarms 定時器 "${STOCK_CRAWLER_CONFIG.ALARM_NAME}" 已清除`);
      } else {
        LogUtils.log('沒有需要清除的 chrome.alarms 定時器');
      }
    } catch (error) {
      LogUtils.error('清除 chrome.alarms 定時器失敗', error);
    }
    
    // 清除爬取中的延遲定時器（仍需要 setTimeout）
    if (this.crawlTimer) {
      LogUtils.log('清除現有的爬取延遲定時器 (ID:', this.crawlTimer, ')');
      clearTimeout(this.crawlTimer);
      this.crawlTimer = null;
      LogUtils.log('爬取延遲定時器已清除');
    }
  },

  /**
   * 開始爬取股票清單
   * @param {string} [triggerType='手動'] - 觸發方式：'手動' | '定時'
   */
  async startCrawl(triggerType = '手動') {
    const crawlStartTime = Date.now();
    this._currentTriggerType = triggerType;
    const startTime = new Date().toLocaleString();
    LogUtils.important(`=== 開始背景爬取股票清單 === [${startTime}] (${triggerType})`);
    
    if (this.running) {
      LogUtils.log('爬蟲已在運行中，跳過此次請求');
      return;
    }
    
    this.running = true;
    this._updateProgress('初始化爬取程序...', 0);
    
    try {
      const urls = StockCrawlerUrls.getAllUrls();
      const totalUrls = urls.length;
      const allStocks = new Map();
      
      if (totalUrls === 0) {
        throw new Error('沒有找到任何爬取網址');
      }
      
      LogUtils.log(`共需爬取 ${totalUrls} 個頁面`);
      this._updateProgress(`共需爬取 ${totalUrls} 個頁面`, 0);
      
      // 依序爬取每個網址
      for (let i = 0; i < urls.length && this.running; i++) {
        const url = urls[i];
        const industryName = StockCrawlerUrls.getIndustryName(url);
        
        LogUtils.log(`[${i + 1}/${totalUrls}] 開始爬取: ${industryName}`);
        
        const progressPercent = Math.round((i / totalUrls) * STOCK_CRAWLER_CONFIG.PROGRESS_CRAWLING_MAX);
        this._updateProgress(`正在爬取 ${industryName} (${i + 1}/${totalUrls})`, progressPercent);
        
        try {
          const stocks = await this._fetchStockData(url);
          LogUtils.log(`${industryName} 爬取完成，獲得 ${stocks.length} 支股票`);
          
          // 將股票加入總列表，標記市場別
          const marketName = industryName.replace('股票', '');
          stocks.forEach(stock => {
            allStocks.set(stock.code, { ...stock, market: marketName });
          });
          
        } catch (error) {
          LogUtils.error(`爬取 ${industryName} 失敗`, error);
          this._updateProgress(`爬取 ${industryName} 失敗: ${error.message}`, progressPercent);
        }
        
        // 等待指定時間
        if (i < urls.length - 1 && this.running) {
          LogUtils.log(`等待 ${STOCK_CRAWLER_CONFIG.CRAWL_DELAY_MS / 1000} 秒後繼續下一個網頁...`);
          await this._delay(STOCK_CRAWLER_CONFIG.CRAWL_DELAY_MS);
        }
      }
      
      // 使用者手動停止
      if (!this.running) {
        const durationSec = Math.round((Date.now() - crawlStartTime) / 1000);
        await StockCrawlLog.addRecord({
          triggerType,
          status: '中斷',
          crawledCount: allStocks.size,
          added: 0, removed: 0, total: 0,
          durationSec,
          remark: '使用者手動停止'
        });
        return;
      }

      LogUtils.log(`所有網頁爬取完成，共獲得 ${allStocks.size} 支股票`);
      this._updateProgress('正在更新股票清單...', STOCK_CRAWLER_CONFIG.PROGRESS_UPDATING);
      
      // 更新股票清單 - 添加安全檢查處理
      try {
        const updateResult = await this._updateStockList(allStocks);
        LogUtils.log('股票清單更新結果', updateResult);
        
        this.running = false;
        const statusMsg = `爬取完成！新增 ${updateResult.added} 支，刪除 ${updateResult.removed} 支股票，總計 ${updateResult.total} 支`;
        this._updateStatus(BACKGROUND_CONSTANTS.STATUS_TYPES.COMPLETED, statusMsg, { 
          progress: STOCK_CRAWLER_CONFIG.PROGRESS_COMPLETED,
          result: updateResult
        });
        
        // 記錄成功的爬取記錄
        const durationSec = Math.round((Date.now() - crawlStartTime) / 1000);
        await StockCrawlLog.addRecord({
          triggerType,
          status: '成功',
          crawledCount: allStocks.size,
          added: updateResult.added,
          removed: updateResult.removed,
          total: updateResult.total,
          durationSec,
          changes: updateResult.changeDetails || []
        });
        
      } catch (updateError) {
        // 如果是安全檢查失敗，顯示警告但不讓整個流程失敗
        LogUtils.error('股票清單更新被安全檢查阻止', updateError);
        
        this.running = false;
        const currentTime = new Date().toLocaleString();
        const warningMsg = `[${currentTime}] 爬取完成但未更新：${updateError.message}`;
        this._updateStatus(BACKGROUND_CONSTANTS.STATUS_TYPES.WARNING, warningMsg, { 
          progress: STOCK_CRAWLER_CONFIG.PROGRESS_COMPLETED,
          warning: updateError.message,
          crawledCount: allStocks.size
        });
        
        // 記錄警告的爬取記錄
        const durationSec = Math.round((Date.now() - crawlStartTime) / 1000);
        await StockCrawlLog.addRecord({
          triggerType,
          status: '警告',
          crawledCount: allStocks.size,
          added: 0, removed: 0, total: 0,
          durationSec,
          remark: updateError.message
        });
      }
      
      const endTime = new Date().toLocaleString();
      LogUtils.important(`=== 背景爬取流程完成 === [${endTime}]`);
      
    } catch (error) {
      LogUtils.error('背景爬取過程發生錯誤', error);
      this._updateStatus(BACKGROUND_CONSTANTS.STATUS_TYPES.ERROR, `爬取失敗: ${error.message}`, { 
        progress: 0,
        error: error.message 
      });
      
      // 記錄失敗的爬取記錄
      const durationSec = Math.round((Date.now() - crawlStartTime) / 1000);
      await StockCrawlLog.addRecord({
        triggerType,
        status: '失敗',
        crawledCount: 0,
        added: 0, removed: 0, total: 0,
        durationSec,
        remark: error.message
      });
    } finally {
      this.running = false;
    }
  },

  /**
   * 爬取單個網頁的股票數據
   */
  async _fetchStockData(url) {
    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      const data = await response.text();
      return this._parseStockData(data);
    } catch (error) {
      LogUtils.error('爬取網頁失敗', error);
      throw error;
    }
  },

  /**
   * 解析股票資料
   * 使用正則表達式解析 MOPS 返回的 HTML 表格數據
   * Service Worker 環境中沒有 DOMParser，需要使用字符串處理
   */
  _parseStockData(html) {
    const stocks = [];
    
    try {
      // 使用正則表達式匹配表格行，專門匹配包含 class="even" 或 class="odd" 的數據行
      // 支持單引號和雙引號兩種格式，並匹配跨行內容
      const trRegex = /<tr\s*class=['"]?(even|odd)['"]?[^>]*>([\s\S]*?)<\/tr>/gi;
      
      let trMatch;
      let rowCount = 0;
      
      while ((trMatch = trRegex.exec(html)) !== null) {
        rowCount++;
        const rowHtml = trMatch[2]; // 第二個捕獲組是行內容
        const cells = [];
        
        // 提取每個 td 的內容
        const tempTdRegex = /<td[^>]*>(.*?)<\/td>/gi;
        let tdMatch;
        
        while ((tdMatch = tempTdRegex.exec(rowHtml)) !== null) {
          // 移除 HTML 標籤和特殊字符
          let cellContent = tdMatch[1]
            .replace(/<[^>]*>/g, '') // 移除 HTML 標籤
            .replace(/&nbsp;/g, ' ') // 將 &nbsp; 替換為空格
            .replace(/\s+/g, ' ') // 將多個空白字符替換為單個空格
            .trim(); // 去除首尾空白
          cells.push(cellContent);
        }
        
        // MOPS格式：第1欄是股票代號，第3欄是公司簡稱
        if (cells.length >= 3) {
          const stockCode = cells[0].trim(); // 第一欄：股票代號
          const fullName = cells[1].trim();  // 第二欄：公司全名
          const shortName = cells[2].trim(); // 第三欄：公司簡稱
          
          // 檢查是否為有效的股票代號（純數字，4-6位）
          if (stockCode && /^\d{4,6}$/.test(stockCode) && shortName) {
            const stock = {
              code: stockCode,
              name: shortName,  // 使用公司簡稱
              fullName: fullName  // 保留完整公司名稱作為參考
            };
            
            stocks.push(stock);
          }
        }
      }
      
      LogUtils.log(`MOPS 解析完成，共找到 ${stocks.length} 支股票`);
      if (stocks.length === 0) {
        LogUtils.warn('未解析到任何股票，檢查HTML結構...');
        const hasTable = html.includes('<table');
        const hasClassEven = html.includes('class="even"');
        LogUtils.log('HTML結構檢查', { hasTable, hasClassEven });
      }
      
      return stocks;
      
    } catch (error) {
      LogUtils.error('解析 MOPS 股票資料時發生錯誤', error);
      return [];
    }
  },

  /**
   * 更新股票清單
   */
  async _updateStockList(crawledStocks) {
    try {
      // 獲取現有股票清單和變更記錄
      const result = await chrome.storage.local.get(['stockList', 'stockChangeLog']);
      const currentStockList = result.stockList || '';
      const currentChangeLog = result.stockChangeLog || '';
      
      // 解析現有清單
      const existingStocks = this._parseStockList(currentStockList);
      LogUtils.log(`現有股票清單包含 ${existingStocks.size} 支股票`);
      
      const currentTime = new Date().toLocaleString();
      
      // 預先檢查要刪除的股票數量
      let wouldBeRemovedCount = 0;
      const wouldBeRemovedStocks = [];
      existingStocks.forEach((existing, code) => {
        if (!crawledStocks.has(code)) {
          wouldBeRemovedCount++;
          wouldBeRemovedStocks.push(`${code}(${existing.name})`);
        }
      });
      
      // 安全檢查：如果要刪除的股票數量達到安全閾值，則不執行更新
      if (wouldBeRemovedCount >= STOCK_CRAWLER_CONFIG.SAFETY_DELETE_THRESHOLD) {
        const errorMsg = `[${currentTime}] 檢測到將刪除 ${wouldBeRemovedCount} 檔股票，超過安全閾值(${STOCK_CRAWLER_CONFIG.SAFETY_DELETE_THRESHOLD}檔)，可能是來源網站有問題，已跳過更新以保護現有資料`;
        LogUtils.error(errorMsg);
        LogUtils.log('將被刪除的股票清單', wouldBeRemovedStocks.slice(0, 10)); // 只顯示前10檔
        throw new Error(`將刪除 ${wouldBeRemovedCount} 檔股票，超過安全閾值，已跳過更新以保護現有資料`);
      }
      
      // 比對和合併
      const mergedStocks = new Map();
      let addedCount = 0;
      let removedCount = wouldBeRemovedCount;
      
      // 收集異動明細（供爬取記錄使用）
      const changeDetails = [];
      
      // 添加爬取到的股票
      crawledStocks.forEach((stock, code) => {
        const existing = existingStocks.get(code);
        if (existing) {
          // 保留現有的匹配規則
          mergedStocks.set(code, {
            code: code,
            name: stock.name,
            pattern: existing.pattern
          });
        } else {
          // 新股票
          mergedStocks.set(code, {
            code: code,
            name: stock.name
          });
          addedCount++;
          // 記錄新增的股票明細
          changeDetails.push({
            name: stock.name,
            code: code,
            market: stock.market || '',
            operation: '新增'
          });
        }
      });
      
      // 記錄被刪除的股票（在這裡記錄，因為已經通過安全檢查）
      existingStocks.forEach((existing, code) => {
        if (!crawledStocks.has(code)) {
          LogUtils.log(`股票已消失: ${code}(${existing.name})`);
          // 記錄刪除的股票明細（被刪除的股票無法從本次爬取得知市場別）
          changeDetails.push({
            name: existing.name,
            code: code,
            market: '',
            operation: '刪除'
          });
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
      
      // 記錄變更（只有通過安全檢查後才記錄）
      const newChangeRecords = [];
      const now = new Date();
      const dateStr = now.toISOString().split('T')[0]; // 2026-01-06
      const timeStr = now.toTimeString().slice(0, 5);  // 15:30
      
      // 記錄新增的股票
      crawledStocks.forEach((stock, code) => {
        if (!existingStocks.has(code)) {
          newChangeRecords.push(`${dateStr},${timeStr},新增,${stock.market || ''},${code},${stock.name}`);
        }
      });
      
      // 記錄刪除的股票（被刪除的股票無法從本次爬取得知市場別）
      existingStocks.forEach((existing, code) => {
        if (!crawledStocks.has(code)) {
          newChangeRecords.push(`${dateStr},${timeStr},刪除,,${code},${existing.name}`);
        }
      });
      
      // 合併新舊記錄，並清理超過30天的記錄
      let updatedChangeLog = currentChangeLog;
      if (newChangeRecords.length > 0) {
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        const thirtyDaysAgoStr = thirtyDaysAgo.toISOString().split('T')[0];
        
        // 過濾舊記錄（保留30天內的）
        const existingRecords = currentChangeLog
          .split('\n')
          .filter(line => {
            if (!line.trim()) return false;
            const recordDate = line.split(',')[0];
            return recordDate >= thirtyDaysAgoStr;
          });
        
        // 合併新記錄（新記錄放在前面）
        updatedChangeLog = [...newChangeRecords, ...existingRecords].join('\n');
        
        LogUtils.log(`記錄了 ${newChangeRecords.length} 筆股票變更`);
      }
      
      // 儲存更新後的清單和變更記錄
      await chrome.storage.local.set({ 
        stockList: newStockListText,
        stockChangeLog: updatedChangeLog
      });
      
      LogUtils.log(`股票清單更新完成: 新增 ${addedCount} 支，刪除 ${removedCount} 支`);
      
      return {
        added: addedCount,
        removed: removedCount,
        total: sortedStocks.length,
        changeDetails: changeDetails
      };
      
    } catch (error) {
      LogUtils.error('更新股票清單失敗', error);
      throw error;
    }
  },

  /**
   * 解析股票清單文字
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
   */
  _delay(ms) {
    return new Promise(resolve => {
      this.crawlTimer = setTimeout(resolve, ms);
    });
  },

  /**
   * 保存狀態到儲存空間
   * 🆕 修復：使用 sync storage 儲存爬蟲啟動狀態，實現跨設備同步
   */
  async _saveState(state) {
    try {
      // 分離可同步的狀態和本地狀態
      const syncableState = {
        isScheduled: state.isScheduled,
        intervalMinutes: state.intervalMinutes
      };
      
      const localState = {
        isRunning: state.isRunning,
        progress: state.progress || 0,
        lastCrawlTime: state.lastCrawlTime
      };
      
      // 同步狀態使用 sync storage（跨設備同步）
      await chrome.storage.sync.set({ 
        crawlerAutoEnabled: syncableState.isScheduled,
        crawlerInterval: syncableState.intervalMinutes || 30
      });
      
      // 執行狀態使用 local storage（設備獨立）
      await chrome.storage.local.set({ 
        stockCrawlerState: {
          ...state,
          // 確保本地狀態完整
          ...localState,
          ...syncableState
        }
      });
      
    } catch (error) {
      LogUtils.error('保存爬蟲狀態失敗', error);
    }
  },

  /**
   * 通知狀態變化
   */
  _notifyStatusChange(type, data = {}) {
    const message = {
      type: 'stockCrawlerStatus',
      status: type,
      data: data,
      isRunning: this.running,
      intervalMinutes: this.intervalMinutes
    };
    
    // 發送給所有監聽的 popup
    this.statusListeners.forEach(sendResponse => {
      try {
        sendResponse(message);
      } catch (error) {
        this.statusListeners.delete(sendResponse);
      }
    });
    
    // 🆕 同時發送到content script
    this._notifyContentScriptStatusChange(message);
  },

  /**
   * 🆕 通知content script狀態變化（類似同步狀態的實現）
   */
  async _notifyContentScriptStatusChange(message) {
    try {
      LogUtils.log('通知content script自動爬取狀態變化:', message);
      
      // 發送消息到所有匹配的 content scripts
      try {
        const tabs = await chrome.tabs.query({url: 'https://data.uanalyze.com.tw/*'});
        
        for (const tab of tabs) {
          try {
            await chrome.tabs.sendMessage(tab.id, message);
          } catch (error) {
            // 忽略無法發送的 tab（可能尚未載入 content script）
            LogUtils.log(`無法發送爬取狀態消息到 tab ${tab.id}:`, error.message);
          }
        }
        
        LogUtils.log(`已發送爬取狀態通知到 ${tabs.length} 個匹配的分頁`);
      } catch (error) {
        LogUtils.warn('發送爬取狀態通知失敗:', error);
      }
    } catch (error) {
      LogUtils.error('通知content script狀態變化失敗:', error);
    }
  },

  /**
   * 添加狀態監聽器
   */
  addStatusListener(sendResponse) {
    this.statusListeners.add(sendResponse);
    
    // 立即發送當前狀態
    const currentStatus = this.getCurrentStatus();
    const statusMessage = {
      type: 'stockCrawlerStatus',
      status: currentStatus.isRunning ? 'running' : (currentStatus.isScheduled ? 'scheduled' : 'idle'),
      data: {
        status: currentStatus.isRunning ? '正在背景爬取中...' : 
                currentStatus.isScheduled ? `自動爬取已啟用，間隔 ${currentStatus.intervalMinutes} 分鐘` : 
                '點擊按鈕開始爬取股票清單',
        progress: currentStatus.progress || 0,
        intervalMinutes: currentStatus.intervalMinutes
      },
      isRunning: currentStatus.isRunning,
      intervalMinutes: currentStatus.intervalMinutes
    };
    
    try {
      sendResponse(statusMessage);
    } catch (error) {
      this.statusListeners.delete(sendResponse);
    }
  },

  /**
   * 獲取當前狀態
   */
  getCurrentStatus() {
    return {
      isRunning: this.running,
      progress: this.currentProgress,
      intervalMinutes: this.intervalMinutes,
      isScheduled: this.isScheduled
    };
  },

  /**
   * 執行單次爬取（不啟動定時器）
   */
  async startSingleCrawl() {
    LogUtils.log('開始單次爬取');
    return await this.startCrawl('手動');
  },

  /**
   * 停止爬取
   */
  stopCrawl() {
    LogUtils.log('停止爬取');
    this.running = false;
    this.currentProgress = 0;  // 重置進度
    
    if (this.crawlTimer) {
      clearTimeout(this.crawlTimer);
      this.crawlTimer = null;
    }
    
    this._notifyStatusChange('singleStopped', { 
      status: '已停止爬取',
      progress: 0  // 確保停止時進度重置
    });
  }
};
