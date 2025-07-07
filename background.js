// background.js - 背景服務工作器
// 2025/01/02 更新：集成 SettingsIO 雲端同步功能
// 2025/06/08 修復：解決 SettingsIO.toggleAutoSync 返回值格式問題
// 2025/01/23 清理：移除過時代碼，簡化日誌輸出
// 
// 功能：
// - 股票爬蟲管理：背景運行股票清單爬取
// - 雲端同步管理：整合 SettingsIO 的 Google Drive 同步
// - 消息路由：處理來自 popup 和 content scripts 的消息
// - 狀態持久化：維護爬蟲和同步狀態
// 
// 職責：
// - 管理 BackgroundStockCrawlerManager 的定時和單次爬取
// - 管理 BackgroundSyncManager 的雲端同步
// - 處理 chrome.storage 數據持久化
// - 維護與 popup 的雙向通信
// 
// 依賴：
// - Chrome Extensions API (runtime, storage, tabs)
// - settings.js：全域設定管理
// - SettingsIO/settings-io.js：雲端同步功能

// 背景同步功能相關變數
let backgroundSettingsIO = null;
let backgroundSyncInitialized = false;

// 背景同步的真實實現 - 集成完整的 SettingsIO 功能
class BackgroundSyncManager {
  constructor() {
    this.syncInProgress = false;
    this.isInitialized = false;
    this.settingsIO = null;
  }

  // 通用的錯誤處理和日誌記錄方法
  async _executeWithErrorHandling(methodName, asyncFn, returnSuccess = true) {
    const prefix = BACKGROUND_CONSTANTS.LOG_PREFIXES.SYNC;
    console.log(`${prefix}[${methodName}] 開始執行`);
    
    try {
      if (!this.settingsIO) {
        throw new Error(BACKGROUND_CONSTANTS.MESSAGES.SETTINGS_IO_NOT_INIT);
      }
      
      const result = await asyncFn();
      console.log(`${prefix}[${methodName}] 執行成功`);
      
      if (returnSuccess && typeof result === 'object' && result.success !== undefined) {
        return result;
      }
      return returnSuccess ? { success: true, ...(result || {}) } : result;
    } catch (error) {
      console.error(`${prefix}[${methodName}] 執行失敗:`, error);
      return { success: false, error: error.message };
    }
  }

  async init() {
    if (this.isInitialized) return;
    
    console.log(`${BACKGROUND_CONSTANTS.LOG_PREFIXES.SYNC}[init] 🔧 初始化背景同步管理器...`);
    
    try {
      // 創建 SettingsIO 實例（真實或備用）
      const SettingsIOClass = this.loadSettingsIO();
      this.settingsIO = new SettingsIOClass();
      await this.settingsIO.init();
      
      // 檢查是否使用的是真實或備用實現
      const isRealImplementation = typeof SettingsIO !== 'undefined' && this.settingsIO instanceof SettingsIO;
      if (isRealImplementation) {
        console.log('[BackgroundSync][init] 🎉 真實 SettingsIO 實例已創建並初始化 - 具備完整雲端同步功能');
      } else {
        console.log('[BackgroundSync][init] ⚠️ 備用 SettingsIO 實例已創建並初始化 - 功能受限（僅模擬）');
        console.log('[BackgroundSync][init] 💡 提示：要獲得真正的雲端同步功能，請確保 SettingsIO/settings-io.js 正確載入');
      }
      
      // 檢查是否已啟用自動同步，如果是則啟動定期同步
      const [localResult, syncResult] = await Promise.all([
        chrome.storage.local.get(['syncEnabled']),
        chrome.storage.sync.get(['autoSyncEnabled'])
      ]);
      
      // 修正：以 local storage 為準（因為 SettingsIO 使用 local storage）
      // 如果 local storage 有值，使用它；否則使用 sync storage 的值
      const enabled = localResult.syncEnabled !== undefined ? 
        localResult.syncEnabled : 
        (syncResult.autoSyncEnabled || false);
      
      // 確保 local storage 有正確的值（這是 SettingsIO 讀取的位置）
      if (localResult.syncEnabled === undefined) {
        await chrome.storage.local.set({ syncEnabled: enabled });
      }
      
      if (enabled) {
        // 🆕 改為訊號驅動，不再使用定期同步
        console.log('[BackgroundSync][init] 🔄 檢測到自動同步已啟用，使用訊號驅動模式');
        console.log('[BackgroundSync][init] 💡 雲端更新訊號由 SettingsIO 直接處理');
      } else {
        console.log('[BackgroundSync][init] ⏸️ 自動同步未啟用');
      }
    } catch (error) {
      console.error('[BackgroundSync][init] ❌ 檢查同步狀態失敗:', error);
    }
    
    this.isInitialized = true;
    console.log('[BackgroundSync][init] ✅ 背景同步管理器初始化完成');
  }

  // 載入 SettingsIO 類別（依賴於 importScripts）
  loadSettingsIO() {
    if (typeof SettingsIO !== 'undefined') {
      console.log('[BackgroundSync][loadSettingsIO] ✅ SettingsIO 已可用');
      return SettingsIO;
    }
    
    console.warn('[BackgroundSync][loadSettingsIO] ⚠️ SettingsIO 未載入，使用備用實現');
    // 創建備用實現
    return this.createFallbackSettingsIO();
  }

  // 創建備用的 SettingsIO 實現
  createFallbackSettingsIO() {
    return class FallbackSettingsIO {
      constructor() {
        this.syncInProgress = false;
        console.log('[FallbackSettingsIO] 初始化備用同步實現（將提供基本功能）');
      }
      
      async init() {
        console.log('[FallbackSettingsIO] ⚠️ 使用備用同步實現 - 功能有限');
        console.log('[FallbackSettingsIO] 建議: 檢查 SettingsIO/settings-io.js 是否正確載入');
      }
      
      async manualSync() {
        if (this.syncInProgress) {
          return { success: false, error: '同步正在進行中' };
        }
        
        this.syncInProgress = true;
        try {
          console.log('[FallbackSettingsIO] ⚠️ 執行備用手動同步（僅模擬）');
          
          // 模擬同步操作
          await new Promise(resolve => setTimeout(resolve, 1000));
          
          await chrome.storage.local.set({ 
            lastSyncTime: Date.now(),
            syncError: null 
          });
          
          const message = '備用同步完成（模擬）- 請使用真正的 SettingsIO 以獲得完整功能';
          console.log('[FallbackSettingsIO]', message);
          return { success: true, message };
        } finally {
          this.syncInProgress = false;
        }
      }
      
      async toggleAutoSync(enabled) {
        console.log('[FallbackSettingsIO] 切換自動同步（備用）:', enabled);
        // 修正：只更新 local storage，與 SettingsIO 保持一致
        await chrome.storage.local.set({ syncEnabled: enabled });
        return enabled; // 返回值與真實 SettingsIO 保持一致
      }
      
      async getSyncStatus() {
        const result = await chrome.storage.local.get(['syncEnabled', 'lastSyncTime', 'syncError']);
        return {
          success: true,
          status: {
            enabled: result.syncEnabled || false,
            lastSync: result.lastSyncTime || null,
            error: result.syncError || null,
            status: result.syncError ? 'error' : 'idle'
          }
        };
      }
      
      async resetSyncStatus() {
        console.log('[FallbackSettingsIO] 重置同步狀態（備用）');
        // 修正：只清理 local storage，與 SettingsIO 保持一致
        await chrome.storage.local.remove(['syncEnabled', 'lastSyncTime', 'syncError']);
        return { success: true };
      }
      
      async signOut() {
        console.log('[FallbackSettingsIO] 登出（備用）');
        await this.resetSyncStatus();
        return { success: true };
      }
      
      async forceUpload() {
        console.log('[FallbackSettingsIO] ⚠️ 備用強制上傳（僅模擬）');
        return { 
          success: true, 
          message: '備用上傳完成（模擬）- 請使用真正的 SettingsIO 以獲得實際雲端同步' 
        };
      }
      
      async forceUploadToCloud() {
        return await this.forceUpload();
      }
    };
  }

  async manualSync() {
    return await this._executeWithErrorHandling('manual', async () => {
      const result = await this.settingsIO.manualSync();
      if (result.success) {
        return { message: result.message || '手動同步完成' };
      } else {
        throw new Error(result.error || '手動同步失敗');
      }
    });
  }

  async toggleAutoSync(enabled) {
    return await this._executeWithErrorHandling('auto', async () => {
      console.log('切換自動同步:', enabled);
      
      const resultEnabled = await this.settingsIO.toggleAutoSync(enabled);
      
      if (resultEnabled === enabled) {
        await chrome.storage.local.set({ syncEnabled: enabled });
        
        if (enabled) {
          console.log('訊號驅動同步已啟用，無需定期計時器');
        }
        
        return { enabled };
      } else {
        throw new Error(`切換自動同步失敗：期望 ${enabled}，實際返回 ${resultEnabled}`);
      }
    });
  }

  async getSyncStatus() {
    return await this._executeWithErrorHandling('status', async () => {
      const statusResult = await this.settingsIO.getSyncStatus();
      const autoSyncActive = statusResult.enabled || false;
      
      return {
        ...statusResult,
        autoSyncActive: autoSyncActive,
        status: statusResult.error ? BACKGROUND_CONSTANTS.STATUS_TYPES.ERROR : 
                (statusResult.enabled ? 'connected' : 'disconnected')
      };
    });
  }

  async resetSyncStatus() {
    return await this._executeWithErrorHandling('reset', async () => {
      await this.settingsIO.resetSyncStatus();
      await chrome.storage.local.remove(['syncEnabled', 'lastSyncTime', 'syncError']);
    });
  }

  async signOut() {
    return await this._executeWithErrorHandling('signout', async () => {
      await this.settingsIO.signOut();
    });
  }

  async forceUpload() {
    return await this._executeWithErrorHandling('upload', async () => {
      const result = await this.settingsIO.forceUploadToCloud();
      
      if (result.success) {
        return { message: result.message || '強制上傳完成' };
      } else {
        throw new Error(result.error || '強制上傳失敗');
      }
    });
  }
}

// === 配置常數 ===
const BACKGROUND_CONSTANTS = {
  LOG_PREFIXES: {
    SYNC: '[BackgroundSync]',
    CRAWLER: '[BackgroundStockCrawlerManager]'
  },
  DELAYS: {
    STATUS_UPDATE: 100,
    REINIT_DELAY: 150,
    UI_REFRESH_DELAY: 200,
    SYNC_RESET_DELAY: 100
  },
  STATUS_TYPES: {
    RUNNING: 'running',
    COMPLETED: 'completed',
    ERROR: 'error',
    IDLE: 'idle',
    SCHEDULED: 'scheduled',
    WARNING: 'warning'
  },
  MESSAGES: {
    SETTINGS_IO_NOT_INIT: 'SettingsIO 實例未初始化',
    UNKNOWN_COMMAND: '未知命令',
    SYNC_IN_PROGRESS: '同步正在進行中',
    AUTH_FAILED: '認證失敗，跳過'
  },
  LOG_STYLES: {
    '#4CAF50': 'color: #2E7D32',
    '#2196F3': 'color: #1565C0', 
    '#9C27B0': 'color: #9C27B0; font-weight: bold;',
    '#F44336': 'color: #F44336; font-weight: bold;',
    '#FF9800': 'color: #FF9800; font-weight: bold;'
  },
  DEBUG_STYLES: {
    timestamp: { emoji: '⏰', style: 'color: #FF9800; font-weight: bold;' },
    filtered_content: { emoji: '📊', style: 'color: #2196F3;' },
    missing_keys: { emoji: '🔑', style: 'color: #FF5722; font-weight: bold;' },
    different_values: { emoji: '📝', style: 'color: #E91E63; font-weight: bold;' },
    final_result: { emoji: '🎯', style: 'color: #9C27B0; font-weight: bold;' },
    local_update: { emoji: '✏️', style: 'color: #FF5722; font-weight: bold;' },
    protect_local: { emoji: '🛡️', style: 'color: #F44336; font-weight: bold;' },
    force_upload: { emoji: '🚀', style: 'color: #4CAF50; font-weight: bold;' },
    download: { emoji: '⬇️', style: 'color: #4CAF50; font-weight: bold;' },
    upload: { emoji: '⬆️', style: 'color: #3F51B5; font-weight: bold;' },
    none: { emoji: '✅', style: 'color: #8BC34A;' }
  },
  SIGNAL_MESSAGES: {
    sendSignal: (data) => `📡 設備 ${data.deviceId} 發送訊號:`,
    receiveSignal: (data) => `📥 設備 ${data.myDeviceId} 收到來自 ${data.signal.source} 的訊號`,
    ignoreSelfSignal: (data) => `🔄 設備 ${data.myDeviceId} 忽略自己的訊號`,
    syncDisabled: () => `⏸️ 設備同步已停用，忽略訊號`,
    scheduleSync: (data) => `⏰ 排程 ${data.intervalMinutes} 分鐘後同步`,
    startSync: () => `🚀 開始執行訊號驅動同步`,
    syncSuccess: () => `✅ 訊號驅動同步成功完成`,
    syncError: (data) => `❌ 訊號驅動同步失敗: ${data.error}`
  }
};

const STOCK_CRAWLER_CONFIG = {
  // 安全保護閾值：要刪除的股票數量達到此值時將跳過更新
  SAFETY_DELETE_THRESHOLD: 5,
  
  // 爬蟲間隔時間限制（分鐘）
  MIN_CRAWL_INTERVAL: 0.1,
  
  // 網頁爬取間隔（毫秒）
  CRAWL_DELAY_MS: 300,
  
  // 進度更新百分比
  PROGRESS_CRAWLING_MAX: 90,
  PROGRESS_UPDATING: 95,
  PROGRESS_COMPLETED: 100
};

// 用於追踪每個標籤頁的內容腳本狀態
const tabContentScriptStatus = new Map();

// === 股票爬蟲相關代碼 ===

/**
 * 股票爬蟲網址配置
 * 資料來源：台灣證券交易所 MOPS 系統
 */
const StockCrawlerUrls = {
  // MOPS 系統股票清單網址
  urls: [
    {
      name: '上市股票',
      url: 'https://mopsov.twse.com.tw/mops/web/ajax_t51sb01?parameters=32b138d25ee38c00fbf70ec5a53724971d1df89c34d9a0ef54fddd0eca765118e1d5d55f2907af83df59ae82756caca30645f4a87baa01551cc98a6ff0816cbaad9c5c8c6df699b1ac8bf50f27c999868a65d5f5dd71b407c4d61b426833ab8c'
    },
    {
      name: '上櫃股票',
      url: 'https://mopsov.twse.com.tw/mops/web/ajax_t51sb01?parameters=32b138d25ee38c00fbf70ec5a53724971d1df89c34d9a0ef54fddd0eca7651189431092059e57ec5acce2508557bbb820645f4a87baa01551cc98a6ff0816cbaad9c5c8c6df699b1ac8bf50f27c999868a65d5f5dd71b407c4d61b426833ab8c'
    },
    {
      name: '興櫃股票', 
      url: 'https://mopsov.twse.com.tw/mops/web/ajax_t51sb01?parameters=32b138d25ee38c00fbf70ec5a53724971d1df89c34d9a0ef54fddd0eca765118150b1250f6b0d18c5da95b58aafad725152f445b9d55dd4c51df9e26ea7918af4de96261009bdfefb47812fc6ed9b9145701ed44236616fb09e84fed0c84caa6'
    }
  ],

  getAllUrls() {
    return this.urls.map(item => item.url);
  },

  getIndustryName(url) {
    const item = this.urls.find(item => item.url === url);
    return item ? item.name : '未知市場';
  }
};

/**
 * 背景股票爬蟲管理器
 * 功能：在背景運行，支援狀態持久化，避免重複執行
 */
const BackgroundStockCrawlerManager = {
  /** 爬蟲狀態 */
  running: false,
  
  /** 當前爬取進度 */
  currentProgress: 0,
  
  /** 定時器 ID */
  intervalTimer: null,
  
  /** 爬取定時器 */
  crawlTimer: null,
  
  /** 定時間隔（分鐘） */
  intervalMinutes: 0,
  
  /** 狀態更新監聽器 */
  statusListeners: new Set(),

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
    console.log('初始化背景股票爬蟲管理器');
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
      
      console.log('恢復的爬蟲狀態:', state, {
        fromSync: syncState,
        fromLocal: localState
      });
      
      if (state.isScheduled && state.intervalMinutes) {
        console.log(`恢復定時爬取，間隔 ${state.intervalMinutes} 分鐘（來源：sync storage）`);
        this.intervalMinutes = state.intervalMinutes; // 重要：先設置 intervalMinutes
        await this._startScheduledCrawl(state.intervalMinutes, false); // false = 不立即執行
      }
      
      // 🆕 監聽 sync storage 的變化，實現跨設備即時同步
      chrome.storage.sync.onChanged.addListener((changes, areaName) => {
        console.log('🔍 BackgroundStockCrawlerManager 收到 sync storage 變更:', {
          areaName,
          changeKeys: Object.keys(changes),
          hasCrawlerEnabled: !!changes.crawlerAutoEnabled,
          hasCrawlerInterval: !!changes.crawlerInterval
        });
        
        // 🔧 修復：由於 areaName 可能是 undefined，改為直接檢查相關鍵值
        if (changes.crawlerAutoEnabled || changes.crawlerInterval) {
          console.log('🔄 檢測到爬蟲同步狀態變更:', changes);
          this._handleSyncStorageChange(changes);
        } else {
          console.log('⏸️ 不是爬蟲相關的變更，忽略');
        }
      });
      
      console.log('背景股票爬蟲管理器初始化完成');
    } catch (error) {
      console.error('初始化背景股票爬蟲管理器失敗:', error);
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
        console.log(`⚡ 爬蟲啟用狀態變更: ${changes.crawlerAutoEnabled.oldValue} → ${newEnabled}`);
        needsUpdate = true;
      }
      
      // 檢查間隔變更
      if (changes.crawlerInterval) {
        newInterval = changes.crawlerInterval.newValue;
        console.log(`⚡ 爬蟲間隔變更: ${changes.crawlerInterval.oldValue} → ${newInterval}`);
        needsUpdate = true;
      }
      
      if (!needsUpdate) return;
      
      // 取得目前的完整狀態
      const syncResult = await chrome.storage.sync.get(['crawlerAutoEnabled', 'crawlerInterval']);
      const isEnabled = syncResult.crawlerAutoEnabled;
      const interval = syncResult.crawlerInterval || 30;
      
      console.log(`🔄 應用新的爬蟲設定: 啟用=${isEnabled}, 間隔=${interval}分鐘`);
      
      if (isEnabled && interval) {
        // 啟動定時爬取
        await this._startScheduledCrawl(interval, false);
      } else {
        // 停止定時爬取
        await this.stopScheduledCrawl();
      }
      
    } catch (error) {
      console.error('處理同步儲存變更失敗:', error);
    }
  },

  /**
   * 啟動定時爬取
   * @param {number} intervalMinutes - 間隔分鐘數
   * @param {boolean} runImmediately - 是否立即執行一次
   */
  async _startScheduledCrawl(intervalMinutes, runImmediately = false) {
    console.log(`啟動定時爬取，間隔 ${intervalMinutes} 分鐘`);
    
    // 驗證參數
    if (!intervalMinutes || isNaN(intervalMinutes) || intervalMinutes < STOCK_CRAWLER_CONFIG.MIN_CRAWL_INTERVAL) {
      throw new Error(`無效的間隔時間: ${intervalMinutes}`);
    }
    
    // 防止重複設置：如果已經有相同間隔的定時器在運行，直接返回
    if (this.intervalTimer && this.intervalMinutes === intervalMinutes) {
      console.log(`已存在相同間隔 ${intervalMinutes} 分鐘的定時器，跳過重複設置`);
      return;
    }
    
    // 清除現有定時器
    this._clearTimers();
    
    this.intervalMinutes = intervalMinutes;
    
    // 保存狀態
    await this._saveState({ 
      isScheduled: true, 
      intervalMinutes: intervalMinutes,
      lastStartTime: Date.now()
    });
    
    // 立即執行一次（如果需要）
    if (runImmediately) {
      this.startCrawl();
    }
    
    // 設置定時器
    this.intervalTimer = setInterval(() => {
      if (!this.running) {
        this.startCrawl();
      }
    }, intervalMinutes * 60 * 1000);
    
    console.log(`新定時器已設置，間隔 ${intervalMinutes} 分鐘 (${intervalMinutes * 60 * 1000}ms)，定時器ID:`, this.intervalTimer);
    
    this._updateStatus(BACKGROUND_CONSTANTS.STATUS_TYPES.SCHEDULED, `自動爬取已啟用，間隔 ${intervalMinutes} 分鐘`, { intervalMinutes });
  },

  /**
   * 停止定時爬取
   */
  async stopScheduledCrawl() {
    console.log('停止定時爬取');
    
    this._clearTimers();
    this.intervalMinutes = 0;
    
    // 保存狀態
    await this._saveState({ 
      isScheduled: false, 
      intervalMinutes: 0 
    });
    
    this._updateStatus('scheduledStopped', '已停止自動爬取');
  },

  /**
   * 清除所有定時器
   */
  _clearTimers() {
    if (this.intervalTimer) {
      console.log('清除現有的間隔定時器 (ID:', this.intervalTimer, ')');
      clearInterval(this.intervalTimer);
      this.intervalTimer = null;
      console.log('間隔定時器已清除');
    } else {
      console.log('沒有需要清除的間隔定時器');
    }
    
    if (this.crawlTimer) {
      console.log('清除現有的爬取定時器 (ID:', this.crawlTimer, ')');
      clearTimeout(this.crawlTimer);
      this.crawlTimer = null;
      console.log('爬取定時器已清除');
    }
  },

  /**
   * 開始爬取股票清單
   */
  async startCrawl() {
    const startTime = new Date().toLocaleString();
    console.log(`=== 開始背景爬取股票清單 === [${startTime}]`);
    
    if (this.running) {
      console.log('爬蟲已在運行中，跳過此次請求');
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
      
      console.log(`共需爬取 ${totalUrls} 個頁面`);
      this._updateProgress(`共需爬取 ${totalUrls} 個頁面`, 0);
      
      // 依序爬取每個網址
      for (let i = 0; i < urls.length && this.running; i++) {
        const url = urls[i];
        const industryName = StockCrawlerUrls.getIndustryName(url);
        
        console.log(`[${i + 1}/${totalUrls}] 開始爬取: ${industryName}`);
        
        const progressPercent = Math.round((i / totalUrls) * STOCK_CRAWLER_CONFIG.PROGRESS_CRAWLING_MAX);
        this._updateProgress(`正在爬取 ${industryName} (${i + 1}/${totalUrls})`, progressPercent);
        
        try {
          const stocks = await this._fetchStockData(url);
          console.log(`${industryName} 爬取完成，獲得 ${stocks.length} 支股票`);
          
          // 將股票加入總列表
          stocks.forEach(stock => {
            allStocks.set(stock.code, stock);
          });
          
        } catch (error) {
          console.error(`爬取 ${industryName} 失敗:`, error);
          this._updateProgress(`爬取 ${industryName} 失敗: ${error.message}`, progressPercent);
        }
        
        // 等待指定時間
        if (i < urls.length - 1 && this.running) {
          console.log(`等待 ${STOCK_CRAWLER_CONFIG.CRAWL_DELAY_MS / 1000} 秒後繼續下一個網頁...`);
          await this._delay(STOCK_CRAWLER_CONFIG.CRAWL_DELAY_MS);
        }
      }
      
      if (this.running) {
        console.log(`所有網頁爬取完成，共獲得 ${allStocks.size} 支股票`);
        this._updateProgress('正在更新股票清單...', STOCK_CRAWLER_CONFIG.PROGRESS_UPDATING);
        
        // 更新股票清單 - 添加安全檢查處理
        try {
          const updateResult = await this._updateStockList(allStocks);
          console.log('股票清單更新結果:', updateResult);
          
          this.running = false;
          const statusMsg = `爬取完成！新增 ${updateResult.added} 支，刪除 ${updateResult.removed} 支股票，總計 ${updateResult.total} 支`;
          this._updateStatus(BACKGROUND_CONSTANTS.STATUS_TYPES.COMPLETED, statusMsg, { 
            progress: STOCK_CRAWLER_CONFIG.PROGRESS_COMPLETED,
            result: updateResult
          });
          
        } catch (updateError) {
          // 如果是安全檢查失敗，顯示警告但不讓整個流程失敗
          console.error('股票清單更新被安全檢查阻止:', updateError.message);
          
          this.running = false;
          const currentTime = new Date().toLocaleString();
          const warningMsg = `[${currentTime}] 爬取完成但未更新：${updateError.message}`;
          this._updateStatus(BACKGROUND_CONSTANTS.STATUS_TYPES.WARNING, warningMsg, { 
            progress: STOCK_CRAWLER_CONFIG.PROGRESS_COMPLETED,
            warning: updateError.message,
            crawledCount: allStocks.size
          });
        }
        
        const endTime = new Date().toLocaleString();
        console.log(`=== 背景爬取流程完成 === [${endTime}]`);
      }
      
    } catch (error) {
      console.error('背景爬取過程發生錯誤:', error);
      this._updateStatus(BACKGROUND_CONSTANTS.STATUS_TYPES.ERROR, `爬取失敗: ${error.message}`, { 
        progress: 0,
        error: error.message 
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
      console.error('爬取網頁失敗:', error);
      throw error;
    }
  },

  /**
   * 解析股票資料
   * 使用正則表達式解析 MOPS 返回的 HTML 表格數據
   * Service Worker 環境中沒有 DOMParser，需要使用字符串處理
   */
  _parseStockData(html) {
    console.log('開始解析 MOPS 股票資料（使用正則表達式）');
    console.log('HTML 長度:', html.length);
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
      
      console.log(`總共處理了 ${rowCount} 行數據`);
      console.log(`MOPS 解析完成，共找到 ${stocks.length} 支股票`);
      if (stocks.length > 0) {
        console.log('解析範例:', stocks.slice(0, 3).map(s => `${s.code}(${s.name})`));
      } else {
        console.log('⚠️ 未解析到任何股票，檢查HTML結構...');
        // 如果沒有找到數據行，嘗試查找HTML中是否包含預期的結構
        const hasTable = html.includes('<table');
        const hasTr = html.includes('<tr');
        const hasTd = html.includes('<td');
        const hasClassEven = html.includes('class="even"');
        const hasClassOdd = html.includes('class="odd"');
        console.log('HTML結構檢查:', { hasTable, hasTr, hasTd, hasClassEven, hasClassOdd });
        
        // 打印HTML的前5000個字符用於調試
        console.log('HTML 前5000字符:', html.substring(0, 5000));
      }
      
      return stocks;
      
    } catch (error) {
      console.error('解析 MOPS 股票資料時發生錯誤:', error);
      return [];
    }
  },

  /**
   * 更新股票清單
   */
  async _updateStockList(crawledStocks) {
    try {
      // 獲取現有股票清單
      const result = await chrome.storage.local.get(['stockList']);
      const currentStockList = result.stockList || '';
      
      // 解析現有清單
      const existingStocks = this._parseStockList(currentStockList);
      console.log(`現有股票清單包含 ${existingStocks.size} 支股票`);
      
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
        console.error(errorMsg);
        console.log('將被刪除的股票清單:', wouldBeRemovedStocks.slice(0, 10)); // 只顯示前10檔
        throw new Error(`將刪除 ${wouldBeRemovedCount} 檔股票，超過安全閾值，已跳過更新以保護現有資料`);
      }
      
      // 比對和合併
      const mergedStocks = new Map();
      let addedCount = 0;
      let removedCount = wouldBeRemovedCount;
      
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
        }
      });
      
      // 記錄被刪除的股票（在這裡記錄，因為已經通過安全檢查）
      wouldBeRemovedStocks.forEach(stockInfo => {
        console.log(`股票已消失: ${stockInfo}`);
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
      await chrome.storage.local.set({ stockList: newStockListText });
      
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
      console.error('保存爬蟲狀態失敗:', error);
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
      isScheduled: this.intervalTimer !== null
    };
  },

  /**
   * 執行單次爬取（不啟動定時器）
   */
  async startSingleCrawl() {
    console.log('開始單次爬取');
    return await this.startCrawl();
  },

  /**
   * 停止爬取
   */
  stopCrawl() {
    console.log('停止爬取');
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

// 初始化背景同步功能
async function initializeBackgroundSync() {
  if (backgroundSyncInitialized) {
    console.log('[BackgroundSync][init] 同步功能已初始化，跳過');
    return;
  }
  
  try {
    console.log('[BackgroundSync][init] 開始初始化背景同步功能...');
    
    // 載入必要的依賴
    loadDependencies();
    
    // 創建背景同步管理器實例
    backgroundSettingsIO = new BackgroundSyncManager();
    await backgroundSettingsIO.init();
    backgroundSyncInitialized = true;
    
    console.log('[BackgroundSync][init] 背景同步功能初始化完成');
  } catch (error) {
    console.error('[BackgroundSync][init] 初始化背景同步功能失敗:', error);
  }
}

// 載入必要的依賴項  
function loadDependencies() {
  console.log('[BackgroundSync][loadDependencies] 開始載入依賴項...');
  
  // 檢查是否已經載入 SettingsIO
  if (typeof SettingsIO !== 'undefined') {
    console.log('[BackgroundSync][loadDependencies] SettingsIO 已載入');
    return;
  }
  
  try {
    // 使用 importScripts 載入依賴檔案（Service Worker 環境中的標準方法）
    console.log('[BackgroundSync][loadDependencies] 使用 importScripts 載入依賴檔案...');
    
    // 載入必要的依賴
    importScripts('default.js');
    importScripts('settings.js');
    importScripts('settings/settings-key.js');
    importScripts('SettingsIO/settings-io.js');
    
    console.log('[BackgroundSync][loadDependencies] 🎉 真實 SettingsIO 載入完成 - 將提供完整的雲端同步功能');
    
    // 檢查是否成功載入
    if (typeof SettingsIO === 'undefined') {
      throw new Error('importScripts 執行完成但 SettingsIO 仍未定義');
    }
    
    console.log('[BackgroundSync][loadDependencies] ✅ SettingsIO 類別載入確認完成');
    
  } catch (error) {
    console.error('[BackgroundSync][loadDependencies] ❌ importScripts 載入 SettingsIO 失敗:', error);
    console.warn('[BackgroundSync][loadDependencies] 📋 錯誤詳情:', {
      errorMessage: error.message,
      errorType: error.constructor.name,
      solution: '請檢查 default.js, settings.js, SettingsIO/settings-io.js 檔案是否存在且語法正確',
      note: 'Service Worker 環境不支援 ES6 import，必須使用 importScripts'
    });
    console.log('[BackgroundSync][loadDependencies] ⚠️ 將使用備用實現（功能受限）');
  }
}

// 初始化背景服務
async function initializeBackgroundServices() {
  try {
    console.log('[Background][init] 🚀 初始化背景服務...');
    
    // 初始化背景爬蟲管理器
    BackgroundStockCrawlerManager.init();
    
    // 初始化背景同步功能
    await initializeBackgroundSync();
    
    console.log('[Background][init] ✅ 背景服務初始化完成');
  } catch (error) {
    console.error('[Background][init] ❌ 背景服務初始化失敗:', error);
  }
}

// 啟動背景服務
initializeBackgroundServices();

// 處理來自 popup 的長連接
chrome.runtime.onConnect.addListener((port) => {
  if (port.name === 'stockCrawlerStatus') {
    // 將 port 添加到狀態監聽器
    const portListener = (message) => {
      try {
        port.postMessage(message);
      } catch (error) {
        BackgroundStockCrawlerManager.statusListeners.delete(portListener);
      }
    };
    
    BackgroundStockCrawlerManager.statusListeners.add(portListener);
    
    // 立即發送當前狀態
    const currentStatus = BackgroundStockCrawlerManager.getCurrentStatus();
    const statusMessage = {
      type: 'stockCrawlerStatus',
      status: currentStatus.isRunning ? 'running' : (currentStatus.isScheduled ? 'scheduled' : 'idle'),
      data: {
        status: currentStatus.isRunning ? '正在背景爬取中...' : 
                currentStatus.isScheduled ? `自動爬取已啟用，間隔 ${currentStatus.intervalMinutes} 分鐘` : 
                '點擊按鈕開始爬取股票清單',
        progress: currentStatus.progress || 0,
        intervalMinutes: currentStatus.intervalMinutes  // 確保傳遞分鐘數
      },
      isRunning: currentStatus.isRunning,
      intervalMinutes: currentStatus.intervalMinutes
    };
    
    try {
      port.postMessage(statusMessage);
    } catch (error) {
      // 忽略錯誤
    }
    
    // 監聽端口斷開
    port.onDisconnect.addListener(() => {
      BackgroundStockCrawlerManager.statusListeners.delete(portListener);
    });
  }
});

// === 原有的訊息處理邏輯 ===

// 監聽標籤頁關閉事件
chrome.tabs.onRemoved.addListener((tabId) => {
    tabContentScriptStatus.delete(tabId);
});

// 監聽來自其他部分的消息
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  // 處理股票爬蟲相關請求
  if (request.action === 'stockCrawler') {
    const crawlerCommands = {
      startSingle: { method: 'startSingleCrawl', async: true },
      startScheduled: { method: '_startScheduledCrawl', async: true, args: [request.intervalMinutes] },
      stopScheduled: { method: 'stopScheduledCrawl', async: true },
      stopCrawl: { method: 'stopCrawl', async: false },
      getStatus: { method: 'getCurrentStatus', async: false, transform: status => ({ success: true, status }) },
      addListener: { method: 'addStatusListener', async: false, args: [sendResponse], keepConnection: true }
    };
    
    const command = crawlerCommands[request.command];
    if (!command) {
      sendResponse({ success: false, error: '未知命令' });
      return false;
    }
    
    const args = command.args || [];
    const result = BackgroundStockCrawlerManager[command.method](...args);
    
    if (command.async) {
      result.then(() => sendResponse({ success: true }))
            .catch(error => sendResponse({ success: false, error: error.message }));
      return true;
    }
    
    const response = command.transform ? command.transform(result) : { success: true };
    sendResponse(response);
    return command.keepConnection || false;
  }
  
  // 處理設定同步相關請求
  if (request.action === 'settingsSync') {
    // 統一的同步命令配置
    const syncCommands = {
      manualSync: { method: 'manualSync', log: '處理手動同步請求' },
      toggleAutoSync: { method: 'toggleAutoSync', log: '切換自動同步', args: ['enabled'], response: 'enabled' },
      getSyncStatus: { method: 'getSyncStatus', log: '獲取同步狀態', directResponse: true },
      resetSyncStatus: { method: 'resetSyncStatus', log: '重置同步狀態' },
      signOut: { method: 'signOut', log: '登出同步功能' },
      forceUpload: { method: 'forceUpload', log: '強制上傳設定' }
    };

    const handleSyncRequest = async () => {
      if (!backgroundSyncInitialized || !backgroundSettingsIO) {
        console.log('[BackgroundSync][message] 同步功能未初始化，嘗試重新初始化...');
        try {
          await initializeBackgroundSync();
          if (!backgroundSettingsIO) {
            sendResponse({ success: false, error: '背景同步管理器初始化失敗' });
            return;
          }
        } catch (error) {
          sendResponse({ success: false, error: `初始化錯誤: ${error.message}` });
          return;
        }
      }

      const command = syncCommands[request.command];
      if (!command) {
        sendResponse({ success: false, error: '未知的同步命令' });
        return;
      }

      console.log(`[BackgroundSync][message] ${command.log}${command.args?.includes('enabled') ? ': ' + request.enabled : ''}`);
      
      try {
        const args = command.args?.map(arg => request[arg]) || [];
        const result = await backgroundSettingsIO[command.method](...args);
        
        if (command.directResponse) {
          sendResponse(result);
        } else if (command.response) {
          sendResponse({ success: true, [command.response]: result });
        } else {
          sendResponse(result.success !== undefined ? result : { success: true });
        }
      } catch (error) {
        sendResponse({ success: false, error: error.message });
      }
    };

    handleSyncRequest().catch(error => {
      console.error('[BackgroundSync][message] 處理同步請求時發生錯誤:', error);
      sendResponse({ success: false, error: error.message });
    });

    return true;
  }

  // 處理日誌消息 - 使用統一的日誌配置
  if (request.type === 'LOG') {
    const style = BACKGROUND_CONSTANTS.LOG_STYLES[request.color] || 
                  (request.color ? `color: ${request.color}` : '');
    console.log(`%c[${new Date(request.timestamp).toLocaleTimeString()}] ${request.source}: ${request.message}`, style);
    return true;
  }

  // 處理內容腳本準備就緒的通知
  if (request.action === "contentScriptReady") {
    const tabId = sender.tab?.id;
    if (tabId) {
        tabContentScriptStatus.set(tabId, true);
    }
    sendResponse({received: true});
    return false; // 同步響應，不需要保持連接
  }
  // 處理更新內容腳本的請求
  if (request.action === "updateContentScript") {
    chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
      if (tabs[0]) {
        chrome.tabs.sendMessage(tabs[0].id, request, (response) => {
          sendResponse(chrome.runtime.lastError ? 
            {error: "與內容腳本通信失敗", details: chrome.runtime.lastError.message} : 
            response);
        });
      } else {
        sendResponse({error: "未找到活動的標籤頁"});
      }
    });
    return true;
  }
  // 處理設定管理器的日誌
  if (request.action === 'settingsLog') {
    const { logType, message: logMessage, data, timestamp } = request;
    const logMethods = {
      error: () => console.error(`[設定管理器 ${timestamp}]`, logMessage, data || ''),
      warn: () => console.warn(`[設定管理器 ${timestamp}]`, logMessage, data || ''),
      success: () => console.log(`%c[設定管理器 ${timestamp}] ${logMessage}`, 'color: #2E7D32', data || ''),
      info: () => console.log(`[設定管理器 ${timestamp}]`, logMessage, data || '')
    };
    
    (logMethods[logType] || logMethods.info)();
    return null; // 不需要回應
  }
  // 處理同步調試信息
  if (request.action === 'syncDebug') {
    const debugType = request.data?.reason || 'general';
    const debugAction = request.data?.action || 'info';
    const config = BACKGROUND_CONSTANTS.DEBUG_STYLES[debugType] || 
                  BACKGROUND_CONSTANTS.DEBUG_STYLES[debugAction] || 
                  { emoji: '🔍', style: 'color: #666' };
    
    console.log(
      `%c[SyncDebug][${new Date().toLocaleTimeString()}] ${config.emoji} ${request.message}`, 
      config.style, request.data || ''
    );
    
    sendResponse({ status: 'success' });
    return null;
  }

  // 處理雲端訊號調試信息
  if (request.action === 'cloudSignalDebug') {
    const { message: debugMessage, data } = request;
    console.log(`[BackgroundSync][CloudSignalDebug][${data.currentTime}] ${debugMessage}:`, data);
    
    const messageFunc = BACKGROUND_CONSTANTS.SIGNAL_MESSAGES[data.action];
    if (messageFunc) {
      const logData = data.action === 'sendSignal' ? data.signal : '';
      console.log(`[BackgroundSync][CloudSignalDebug] ${messageFunc(data)}`, logData);
    }
    
    return null;
  }

  // 🐛 調試：處理來自 content script 的調試訊息
  if (request.action === 'debug') {
    handleDebugMessage(request, sender);
    sendResponse({ success: true });
    return;
  }

  return false; // 未處理的消息，不需要保持連接
});

// 監聽插件啟動事件
chrome.runtime.onInstalled.addListener((details) => {
  if(details.reason === "install"){
    chrome.storage.sync.set({ isFirstTime: true });
  }
});

// 監聽標籤頁更新事件
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.status === 'complete') {
        // 重置該標籤頁的內容腳本狀態
        tabContentScriptStatus.set(tabId, false);
    }
});

// 🐛 調試：處理來自 content script 的調試訊息
function handleDebugMessage(message, sender) {
  const tabId = sender.tab ? sender.tab.id : 'unknown';
  const url = sender.tab ? sender.tab.url : 'unknown';
  
  console.log(`🐛 [Debug][Tab-${tabId}][${message.timestamp}] ${message.message}`);
  
  if (message.debugInfo) {
    const { startTime, refreshCount, autoReloadAttempts } = message.debugInfo;
    const elapsed = Date.now() - startTime;
    
    console.log(`📊 [Debug][Tab-${tabId}] 統計資訊:`, {
      運行時間: `${elapsed}ms`,
      重新整理次數: refreshCount,
      檢查次數: autoReloadAttempts,
      頁面: url.split('/').pop()
    });
    
    // 如果檢測到過多的自動重新整理嘗試，發出警告
    if (autoReloadAttempts > 5) {
      console.warn(`⚠️ [Debug][Tab-${tabId}] 可能的惡性循環：檢查次數過多 (${autoReloadAttempts})`);
    }
    
    if (refreshCount > 2) {
      console.error(`🚨 [Debug][Tab-${tabId}] 檢測到重複重新整理！次數：${refreshCount}`);
    }
  }
}
