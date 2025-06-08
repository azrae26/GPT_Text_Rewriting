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
  static SYNC_INTERVAL_SECONDS = 15; // 同步間隔（秒）
  
  constructor() {
    this.syncInProgress = false;
    this.syncIntervalId = null;
    this.isInitialized = false;
    this.settingsIO = null;
  }

  async init() {
    if (this.isInitialized) return;
    
    console.log('[BackgroundSync][init] 🔧 初始化背景同步管理器...');
    
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
        console.log('[BackgroundSync][init] 🔄 檢測到自動同步已啟用，啟動定期同步');
        this.startPeriodicSync();
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
      
      async performSync() {
        if (this.syncInProgress) return;
        
        this.syncInProgress = true;
        try {
          console.log('[FallbackSettingsIO] ⚠️ 執行備用定期同步（僅模擬）');
          await new Promise(resolve => setTimeout(resolve, 500));
          await chrome.storage.local.set({ 
            lastSyncTime: Date.now(),
            syncError: null 
          });
        } finally {
          this.syncInProgress = false;
        }
      }
    };
  }

  async manualSync() {
    console.log('[BackgroundSync][manual] 執行手動同步');
    
    try {
      if (!this.settingsIO) {
        throw new Error('SettingsIO 實例未初始化');
      }
      
      // 使用真正的 SettingsIO 進行手動同步
      const result = await this.settingsIO.manualSync();
      
      if (result.success) {
        console.log('[BackgroundSync][manual] 真實手動同步完成');
        return { success: true, message: result.message || '手動同步完成' };
      } else {
        throw new Error(result.error || '手動同步失敗');
      }
    } catch (error) {
      console.error('[BackgroundSync][manual] 手動同步失敗:', error);
      return { success: false, error: error.message };
    }
  }

  async toggleAutoSync(enabled) {
    console.log('[BackgroundSync][auto] 切換自動同步:', enabled);
    
    try {
      if (!this.settingsIO) {
        throw new Error('SettingsIO 實例未初始化');
      }
      
      // 使用真正的 SettingsIO 進行自動同步切換
      // 注意：SettingsIO.toggleAutoSync 返回的是 enabled 值，不是 success 對象
      const resultEnabled = await this.settingsIO.toggleAutoSync(enabled);
      
      // 驗證返回值是否符合預期
      if (resultEnabled === enabled) {
        // 同時儲存到 local storage（用於背景狀態檢查）
        await chrome.storage.local.set({ syncEnabled: enabled });
        
        if (enabled) {
          this.startPeriodicSync();
        } else {
          this.stopPeriodicSync();
        }
        
        console.log(`[BackgroundSync][auto] 切換自動同步成功: ${enabled}`);
        return { success: true, enabled };
      } else {
        throw new Error(`切換自動同步失敗：期望 ${enabled}，實際返回 ${resultEnabled}`);
      }
    } catch (error) {
      console.error('[BackgroundSync][auto] 切換自動同步失敗:', error);
      return { success: false, error: error.message };
    }
  }

  async getSyncStatus() {
    console.log('[BackgroundSync][status] 獲取同步狀態');
    
    try {
      if (!this.settingsIO) {
        throw new Error('SettingsIO 實例未初始化');
      }
      
      // 使用真正的 SettingsIO 獲取同步狀態（直接返回狀態物件）
      const statusResult = await this.settingsIO.getSyncStatus();
      
      // 結合背景計時器狀態
      const actuallyEnabled = this.syncIntervalId !== null;
      
      
      
      return {
        success: true,
        status: {
          ...statusResult,
          enabled: actuallyEnabled && statusResult.enabled, // 兩者都要啟用
          status: statusResult.error ? 'error' : (actuallyEnabled ? 'active' : 'idle')
        }
      };
    } catch (error) {
      console.error('[BackgroundSync][status] 獲取同步狀態失敗:', error);
      return { success: false, error: error.message };
    }
  }

  async resetSyncStatus() {
    console.log('[BackgroundSync][reset] 重置同步狀態');
    
    try {
      if (!this.settingsIO) {
        throw new Error('SettingsIO 實例未初始化');
      }
      
      // 使用真正的 SettingsIO 重置同步狀態（void 方法）
      await this.settingsIO.resetSyncStatus();
      
      // 同時清除 local storage 中的同步設定
      await chrome.storage.local.remove(['syncEnabled', 'lastSyncTime', 'syncError']);
      this.stopPeriodicSync();
      return { success: true };
    } catch (error) {
      console.error('[BackgroundSync][reset] 重置同步狀態失敗:', error);
      return { success: false, error: error.message };
    }
  }

  async signOut() {
    console.log('[BackgroundSync][signout] 登出同步功能');
    
    try {
      if (!this.settingsIO) {
        throw new Error('SettingsIO 實例未初始化');
      }
      
      // 使用真正的 SettingsIO 登出（void 方法）
      await this.settingsIO.signOut();
      
      this.stopPeriodicSync();
      return { success: true };
    } catch (error) {
      console.error('[BackgroundSync][signout] 登出失敗:', error);
      return { success: false, error: error.message };
    }
  }

  async forceUpload() {
    console.log('[BackgroundSync][upload] 強制上傳設定');
    
    try {
      if (!this.settingsIO) {
        throw new Error('SettingsIO 實例未初始化');
      }
      
      // 使用真正的 SettingsIO 進行強制上傳
      const result = await this.settingsIO.forceUploadToCloud();
      
      if (result.success) {
        console.log('[BackgroundSync][upload] 真實強制上傳完成');
        return { 
          success: true, 
          message: result.message || '強制上傳完成' 
        };
      } else {
        throw new Error(result.error || '強制上傳失敗');
      }
    } catch (error) {
      console.error('[BackgroundSync][upload] 強制上傳失敗:', error);
      return { success: false, error: error.message };
    }
  }

  startPeriodicSync() {
    this.stopPeriodicSync(); // 避免重複的計時器
    
    this.syncIntervalId = setInterval(async () => {
      console.log('[BackgroundSync][periodic] ⏰ 定期同步計時器觸發');
      await this.performPeriodicSync();
    }, BackgroundSyncManager.SYNC_INTERVAL_SECONDS * 1000);
    
    console.log(`[BackgroundSync][periodic] ✅ 定期同步已啟動（每${BackgroundSyncManager.SYNC_INTERVAL_SECONDS}秒執行一次）`);
  }

  stopPeriodicSync() {
    if (this.syncIntervalId) {
      clearInterval(this.syncIntervalId);
      this.syncIntervalId = null;
      console.log('[BackgroundSync][periodic] 定期同步已停止');
    }
  }

  async performPeriodicSync() {
    const timestamp = new Date().toLocaleTimeString();
    
    if (this.syncInProgress) {
      console.log(`[BackgroundSync][periodic][${timestamp}] 🔄 同步進行中，跳過此次執行`);
      return;
    }

    try {
      this.syncInProgress = true;
      console.log(`[BackgroundSync][periodic][${timestamp}] 🚀 開始執行定期同步`);
      
      // 檢查是否啟用自動同步
      const result = await chrome.storage.local.get(['syncEnabled']);
      
      if (!result.syncEnabled) {
        console.log(`[BackgroundSync][periodic][${timestamp}] ⏸️ 自動同步已停用，跳過執行`);
        return;
      }

      if (!this.settingsIO) {
        console.log(`[BackgroundSync][periodic][${timestamp}] ⚠️ SettingsIO 實例未初始化，跳過執行`);
        return;
      }

      // 執行真正的同步操作
      console.log(`[BackgroundSync][periodic][${timestamp}] 💾 執行真實同步操作...`);
      
      try {
        // 使用真正的 SettingsIO 進行定期同步
        await this.settingsIO.performSync();
        console.log(`[BackgroundSync][periodic][${timestamp}] 📥 真實同步完成`);
        
        // 更新最後同步時間
        const syncTime = Date.now();
        await chrome.storage.local.set({ 
          lastSyncTime: syncTime,
          syncError: null // 清除之前的錯誤
        });
        
        // 嘗試通知 popup 更新狀態 
        try {
          chrome.runtime.sendMessage({
            action: 'syncStatusUpdate',
            data: { lastSync: syncTime, status: 'success' }
          }).catch(() => {}); // 忽略錯誤（popup可能未開啟）
        } catch (e) {}
        
        console.log(`[BackgroundSync][periodic][${timestamp}] ✅ 定期同步完成 (時間: ${new Date(syncTime).toLocaleTimeString()})`);
      } catch (syncError) {
        console.error(`[BackgroundSync][periodic][${timestamp}] ⚠️ 真實同步失敗:`, syncError);
        
        await chrome.storage.local.set({ syncError: syncError.message });
        
        // 嘗試通知 popup 同步失敗
        try {
          chrome.runtime.sendMessage({
            action: 'syncStatusUpdate',
            data: { error: syncError.message, status: 'error' }
          }).catch(() => {}); // 忽略錯誤（popup可能未開啟）
        } catch (e) {}
      }
      
    } catch (error) {
      console.error(`[BackgroundSync][periodic][${timestamp}] ❌ 定期同步失敗:`, error);
      await chrome.storage.local.set({ syncError: error.message });
      
      // 嘗試通知 popup 同步失敗
      try {
        chrome.runtime.sendMessage({
          action: 'syncStatusUpdate',
          data: { error: error.message, status: 'error' }
        }).catch(() => {}); // 忽略錯誤（popup可能未開啟）
      } catch (e) {}
    } finally {
      this.syncInProgress = false;
      console.log(`[BackgroundSync][periodic][${timestamp}] 🔓 同步鎖定已釋放`);
    }
  }
}

// === 配置常數 ===
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

  /**
   * 初始化爬蟲管理器，恢復持久化狀態
   */
  async init() {
    console.log('初始化背景股票爬蟲管理器');
    try {
      const result = await chrome.storage.local.get(['stockCrawlerState']);
      const state = result.stockCrawlerState || {};
      
      console.log('恢復的爬蟲狀態:', state);
      
      if (state.isScheduled && state.intervalMinutes) {
        console.log(`恢復定時爬取，間隔 ${state.intervalMinutes} 分鐘`);
        this.intervalMinutes = state.intervalMinutes; // 重要：先設置 intervalMinutes
        await this._startScheduledCrawl(state.intervalMinutes, false); // false = 不立即執行
      }
      
      console.log('背景股票爬蟲管理器初始化完成');
    } catch (error) {
      console.error('初始化背景股票爬蟲管理器失敗:', error);
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
    
    this._notifyStatusChange('scheduled', { intervalMinutes });
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
    
    this._notifyStatusChange('scheduledStopped', { 
      status: '已停止自動爬取' 
    });
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
    this.currentProgress = 0;
    
    this._notifyStatusChange('running', { 
      status: '初始化爬取程序...', 
      progress: 0 
    });
    
    try {
      const urls = StockCrawlerUrls.getAllUrls();
      const totalUrls = urls.length;
      const allStocks = new Map();
      
      if (totalUrls === 0) {
        throw new Error('沒有找到任何爬取網址');
      }
      
      console.log(`共需爬取 ${totalUrls} 個頁面`);
      this._notifyStatusChange('running', { 
        status: `共需爬取 ${totalUrls} 個頁面`, 
        progress: 0 
      });
      
      // 依序爬取每個網址
      for (let i = 0; i < urls.length && this.running; i++) {
        const url = urls[i];
        const industryName = StockCrawlerUrls.getIndustryName(url);
        
        console.log(`[${i + 1}/${totalUrls}] 開始爬取: ${industryName}`);
        
        const progressPercent = Math.round((i / totalUrls) * STOCK_CRAWLER_CONFIG.PROGRESS_CRAWLING_MAX);
        this.currentProgress = progressPercent;  // 更新當前進度
        this._notifyStatusChange('running', { 
          status: `正在爬取 ${industryName} (${i + 1}/${totalUrls})`, 
          progress: progressPercent 
        });
        
        try {
          const stocks = await this._fetchStockData(url);
          console.log(`${industryName} 爬取完成，獲得 ${stocks.length} 支股票`);
          
          // 將股票加入總列表
          stocks.forEach(stock => {
            allStocks.set(stock.code, stock);
          });
          
        } catch (error) {
          console.error(`爬取 ${industryName} 失敗:`, error);
          this._notifyStatusChange('running', { 
            status: `爬取 ${industryName} 失敗: ${error.message}`, 
            progress: progressPercent 
          });
        }
        
        // 等待指定時間
        if (i < urls.length - 1 && this.running) {
          console.log(`等待 ${STOCK_CRAWLER_CONFIG.CRAWL_DELAY_MS / 1000} 秒後繼續下一個網頁...`);
          await this._delay(STOCK_CRAWLER_CONFIG.CRAWL_DELAY_MS);
        }
      }
      
      if (this.running) {
        console.log(`所有網頁爬取完成，共獲得 ${allStocks.size} 支股票`);
        this.currentProgress = STOCK_CRAWLER_CONFIG.PROGRESS_UPDATING;  // 更新進度到 95%
        this._notifyStatusChange('running', { 
          status: '正在更新股票清單...', 
          progress: STOCK_CRAWLER_CONFIG.PROGRESS_UPDATING 
        });
        
        // 更新股票清單 - 添加安全檢查處理
        try {
          const updateResult = await this._updateStockList(allStocks);
          console.log('股票清單更新結果:', updateResult);
          
          // 先設置 running 為 false，再發送 completed 狀態
          this.running = false;
          this.currentProgress = STOCK_CRAWLER_CONFIG.PROGRESS_COMPLETED;  // 設置最終進度為 100%
          
          const statusMsg = `爬取完成！新增 ${updateResult.added} 支，刪除 ${updateResult.removed} 支股票，總計 ${updateResult.total} 支`;
          this._notifyStatusChange('completed', { 
            status: statusMsg, 
            progress: STOCK_CRAWLER_CONFIG.PROGRESS_COMPLETED,
            result: updateResult
          });
          
        } catch (updateError) {
          // 如果是安全檢查失敗，顯示警告但不讓整個流程失敗
          console.error('股票清單更新被安全檢查阻止:', updateError.message);
          
          // 先設置 running 為 false
          this.running = false;
          this.currentProgress = STOCK_CRAWLER_CONFIG.PROGRESS_COMPLETED;  // 設置進度為 100%
          
          // 發送警告狀態（使用 completed 但帶有警告訊息）
          const currentTime = new Date().toLocaleString();
          const warningMsg = `[${currentTime}] 爬取完成但未更新：${updateError.message}`;
          this._notifyStatusChange('warning', { 
            status: warningMsg, 
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
      this._notifyStatusChange('error', { 
        status: `爬取失敗: ${error.message}`, 
        progress: 0,  // 確保錯誤狀態也包含進度資料
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
   */
  async _saveState(state) {
    try {
      await chrome.storage.local.set({ stockCrawlerState: state });
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
   * 移除狀態監聽器
   */
  removeStatusListener(sendResponse) {
    this.statusListeners.delete(sendResponse);
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
    switch (request.command) {
      case 'startSingle':
        BackgroundStockCrawlerManager.startSingleCrawl()
          .then(() => sendResponse({ success: true }))
          .catch(error => sendResponse({ success: false, error: error.message }));
        return true;
        
      case 'startScheduled':
        BackgroundStockCrawlerManager._startScheduledCrawl(request.intervalMinutes)
          .then(() => sendResponse({ success: true }))
          .catch(error => sendResponse({ success: false, error: error.message }));
        return true;
        
      case 'stopScheduled':
        BackgroundStockCrawlerManager.stopScheduledCrawl()
          .then(() => sendResponse({ success: true }))
          .catch(error => sendResponse({ success: false, error: error.message }));
        return true;
        
      case 'stopCrawl':
        BackgroundStockCrawlerManager.stopCrawl();
        sendResponse({ success: true });
        return false;
        
      case 'getStatus':
        sendResponse({ 
          success: true, 
          status: BackgroundStockCrawlerManager.getCurrentStatus() 
        });
        return false;
        
      case 'addListener':
        BackgroundStockCrawlerManager.addStatusListener(sendResponse);
        return true; // 保持連接開啟
        
      default:
        sendResponse({ success: false, error: '未知命令' });
        return false;
    }
  }
  
  // 處理設定同步相關請求
  if (request.action === 'settingsSync') {
         // 異步處理設定同步請求
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
    
         switch (request.command) {
       case 'manualSync':
         console.log('[BackgroundSync][message] 處理手動同步請求');
         try {
           const result = await backgroundSettingsIO.manualSync();
           sendResponse(result);
         } catch (error) {
           sendResponse({ success: false, error: error.message });
         }
         return;
         
       case 'toggleAutoSync':
         console.log('[BackgroundSync][message] 切換自動同步:', request.enabled);
         try {
           const enabled = await backgroundSettingsIO.toggleAutoSync(request.enabled);
           sendResponse({ success: true, enabled });
         } catch (error) {
           sendResponse({ success: false, error: error.message });
         }
         return;
         
       case 'getSyncStatus':
         console.log('[BackgroundSync][message] 獲取同步狀態');
         try {
           const result = await backgroundSettingsIO.getSyncStatus();
           sendResponse(result); // 直接發送結果，不要重複包裝
         } catch (error) {
           sendResponse({ success: false, error: error.message });
         }
         return;
         
       case 'resetSyncStatus':
         console.log('[BackgroundSync][message] 重置同步狀態');
         try {
           await backgroundSettingsIO.resetSyncStatus();
           sendResponse({ success: true });
         } catch (error) {
           sendResponse({ success: false, error: error.message });
         }
         return;
         
       case 'signOut':
         console.log('[BackgroundSync][message] 登出同步功能');
         try {
           await backgroundSettingsIO.signOut();
           sendResponse({ success: true });
         } catch (error) {
           sendResponse({ success: false, error: error.message });
         }
         return;
         
       case 'forceUpload':
         console.log('[BackgroundSync][message] 強制上傳設定');
         try {
           const result = await backgroundSettingsIO.forceUpload();
           sendResponse(result);
         } catch (error) {
           sendResponse({ success: false, error: error.message });
         }
         return;
        
             default:
         sendResponse({ success: false, error: '未知的同步命令' });
         return;
     }
   };
   
   // 執行異步處理
   handleSyncRequest().catch(error => {
     console.error('[BackgroundSync][message] 處理同步請求時發生錯誤:', error);
     sendResponse({ success: false, error: error.message });
   });
   
   return true; // 表示會異步發送回應
  }



  // 處理原有的 URL 爬取請求（保持向後兼容）
  if (request.action === 'fetchUrl') {
    const { url } = request;
    
    console.log('開始爬取網址:', url);
    
    fetch(url)
      .then(response => {
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        return response.text();
      })
      .then(data => {
        console.log('爬取成功，數據長度:', data.length);
        sendResponse({ success: true, data: data });
      })
      .catch(error => {
        console.error('爬取失敗:', error);
        sendResponse({ 
          success: false, 
          error: error.message || '爬取網頁失敗' 
        });
      });
    
    return true; // 表示會異步發送回應
  }

  // 處理日誌消息
  if (request.type === 'LOG') {
    const timestamp = new Date(request.timestamp).toLocaleTimeString();
    let style = '';
    
    // 根據不同顏色設置不同的樣式
    switch (request.color) {
      case '#4CAF50': // 成功
        style = 'color: #2E7D32'; // 更深的綠色
        break;
      case '#2196F3': // 信息
        style = 'color: #1565C0'; // 更深的藍色
        break;
      case '#9C27B0': // 等待/處理中
        style = 'color: #9C27B0; font-weight: bold;'; // 紫色加粗
        break;
      case '#F44336': // 錯誤
        style = 'color: #F44336; font-weight: bold;'; // 紅色加粗
        break;
      case '#FF9800': // 警告
        style = 'color: #FF9800; font-weight: bold;'; // 橙色加粗
        break;
      default:
        style = request.color ? `color: ${request.color}` : '';
    }
    
    console.log(
        `%c[${timestamp}] ${request.source}: ${request.message}`,
        style
    );
    return true;
  }

  // 處理內容腳本準備就緒的通知
  if (request.action === "contentScriptReady") {
    const tabId = sender.tab?.id;
    if (tabId) {
        tabContentScriptStatus.set(tabId, true);
    }
    sendResponse({received: true});
  }


  // 處理更新內容腳本的請求
  else if (request.action === "updateContentScript") {
    // 查找當前活動的標籤頁
    chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
      if (tabs[0]) {
        // 向內容腳本發送消息
        chrome.tabs.sendMessage(tabs[0].id, request, (response) => {
          // 錯誤處理
          if (chrome.runtime.lastError) {
            sendResponse({error: "與內容腳本通信失敗", details: chrome.runtime.lastError.message});
          } else {
            sendResponse(response);
          }
        });
      } else {
        sendResponse({error: "未找到活動的標籤頁"});
      }
    });
    return true;
  }
  // 處理設定管理器的日誌
  else if (request.action === 'settingsLog') {
    const { logType, message: logMessage, data, timestamp } = request;
    
    // 根據日誌類型使用不同的 console 方法
    switch (logType) {
        case 'error':
            console.error(`[設定管理器 ${timestamp}]`, logMessage, data || '');
            break;
        case 'warn':
            console.warn(`[設定管理器 ${timestamp}]`, logMessage, data || '');
            break;
        case 'success':
            console.log(`%c[設定管理器 ${timestamp}] ${logMessage}`, 
                'color: #2E7D32', // 更深的綠色
                data || '');
            break;
        case 'info':
        default:
            console.log(`[設定管理器 ${timestamp}]`, logMessage, data || '');
    }
  }
  // 處理同步調試信息
  else if (request.action === 'syncDebug') {
    const timestamp = new Date().toLocaleTimeString();
    const debugType = request.data?.reason || 'general';
    const debugAction = request.data?.action || 'info';
    
    // 根據調試類型使用不同的表情符號和顏色
    let emoji = '🔍';
    let style = 'color: #666';
    
    if (debugType === 'timestamp') {
      emoji = '⏰';
      style = 'color: #FF9800; font-weight: bold;';
    } else if (debugType === 'filtered_content') {
      emoji = '📊';
      style = 'color: #2196F3;';
    } else if (debugType === 'missing_keys') {
      emoji = '🔑';
      style = 'color: #FF5722; font-weight: bold;';
    } else if (debugType === 'different_values') {
      emoji = '📝';
      style = 'color: #E91E63; font-weight: bold;';
    } else if (debugType === 'final_result') {
      emoji = '🎯';
      style = 'color: #9C27B0; font-weight: bold;';
    } else if (debugType === 'local_update') {
      emoji = '✏️';
      style = 'color: #FF5722; font-weight: bold;';
    } else if (debugType === 'protect_local') {
      emoji = '🛡️';
      style = 'color: #F44336; font-weight: bold;';
    } else if (debugType === 'force_upload') {
      emoji = '🚀';
      style = 'color: #4CAF50; font-weight: bold;';
    } else if (debugAction === 'download') {
      emoji = '⬇️';
      style = 'color: #4CAF50; font-weight: bold;';
    } else if (debugAction === 'upload') {
      emoji = '⬆️';
      style = 'color: #3F51B5; font-weight: bold;';
    } else if (debugAction === 'none') {
      emoji = '✅';
      style = 'color: #8BC34A;';
    }
    
    console.log(
      `%c[SyncDebug][${timestamp}] ${emoji} ${request.message}`, 
      style,
      request.data || ''
    );
    
    sendResponse({ status: 'success' });
  }
  return true; // 表示我們會異步發送回應
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

// 調試函數：顯示當前Google帳號
async function debugShowGoogleAccount() {
  try {
    console.log('[DEBUG] 開始獲取當前Google帳號信息...');
    
    // 獲取認證token（使用Drive API權限）
    const tokenResult = await chrome.identity.getAuthToken({ 
      interactive: false,
      scopes: ['https://www.googleapis.com/auth/drive.appdata']
    });
    
    if (!tokenResult) {
      console.log('[DEBUG] ❌ 未獲取到認證token，可能未登入Google帳號');
      return;
    }
    
    const token = typeof tokenResult === 'object' ? tokenResult.token : tokenResult;
    console.log('[DEBUG] ✅ 成功獲取認證token');
    
    // 使用Drive API的about接口獲取用戶信息
    const response = await fetch('https://www.googleapis.com/drive/v3/about?fields=user', {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });
    
    if (!response.ok) {
      console.log('[DEBUG] ❌ 獲取用戶信息失敗:', response.status, response.statusText);
      return;
    }
    
    const data = await response.json();
    const userInfo = data.user;
    
    console.log('=================================');
    console.log('🔍 當前Google帳號信息:');
    console.log('📧 Email:', userInfo.emailAddress);
    console.log('👤 顯示名稱:', userInfo.displayName);
    console.log('🆔 用戶ID:', userInfo.permissionId);
    console.log('🖼️ 頭像:', userInfo.photoLink);
    console.log('=================================');
    
    return userInfo;
    
  } catch (error) {
    console.error('[DEBUG] ❌ 獲取Google帳號信息失敗:', error);
    console.log('提示：可能需要先登入Google帳號或重新認證');
  }
}

// 全局暴露調試函數
self.debugShowGoogleAccount = debugShowGoogleAccount;


