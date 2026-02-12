// background.js - 背景服務工作器
// 2025/01/02 更新：集成 SettingsIO 雲端同步功能
// 2025/06/08 修復：解決 SettingsIO.toggleAutoSync 返回值格式問題
// 2025/01/23 清理：移除過時代碼，簡化日誌輸出
// 2026/02/13 重構：將股票爬蟲代碼拆分至 stock_crawl/ 資料夾
// 
// 功能：
// - 股票爬蟲管理：背景運行股票清單爬取（代碼已移至 stock_crawl/）
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
// - stock_crawl/：股票爬蟲模組（config, urls, log, manager）

// 載入必要的依賴 - LogUtils 工具函數
importScripts('default.js');

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
    try {
      if (!this.settingsIO) {
        throw new Error(BACKGROUND_CONSTANTS.MESSAGES.SETTINGS_IO_NOT_INIT);
      }
      
      const result = await asyncFn();
      
      if (returnSuccess && typeof result === 'object' && result.success !== undefined) {
        return result;
      }
      return returnSuccess ? { success: true, ...(result || {}) } : result;
    } catch (error) {
      LogUtils.error(`${methodName} 執行失敗`, error);
      return { success: false, error: error.message };
    }
  }

  async init() {
    if (this.isInitialized) return;
    
    LogUtils.important('🔧 初始化背景同步管理器...');
    
    try {
      // 獲取或創建 SettingsIO 單例實例
      const SettingsIOClass = this.loadSettingsIO();
      if (SettingsIOClass.getInstance) {
        // 使用單例模式
        this.settingsIO = SettingsIOClass.getInstance();
        LogUtils.log('✅ 使用 SettingsIO 單例實例');
      } else {
        // 備用實現不支援單例模式
        this.settingsIO = new SettingsIOClass();
        LogUtils.warn('⚠️ 使用備用 SettingsIO 實例（不支援單例）');
      }
      await this.settingsIO.init();
      
      // 檢查是否使用的是真實或備用實現
      const isRealImplementation = typeof SettingsIO !== 'undefined' && this.settingsIO instanceof SettingsIO;
      if (!isRealImplementation) {
        LogUtils.warn('使用備用 SettingsIO 實例 - 功能受限');
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
        LogUtils.important('🔄 檢測到自動同步已啟用，使用訊號驅動模式');
        LogUtils.log('💡 雲端更新訊號由 SettingsIO 直接處理');
      } else {
        LogUtils.log('⏸️ 自動同步未啟用');
      }
    } catch (error) {
      LogUtils.error('檢查同步狀態失敗', error);
    }
    
    this.isInitialized = true;
    LogUtils.important('✅ 背景同步管理器初始化完成');
  }

  // 載入 SettingsIO 類別（依賴於 importScripts）
  loadSettingsIO() {
    if (typeof SettingsIO !== 'undefined') {
      LogUtils.log('✅ SettingsIO 已可用');
      return SettingsIO;
    }
    
    LogUtils.warn('⚠️ SettingsIO 未載入，使用備用實現');
    // 創建備用實現
    return this.createFallbackSettingsIO();
  }

  // 創建備用的 SettingsIO 實現
  createFallbackSettingsIO() {
    return class FallbackSettingsIO {
      constructor() {
        this.syncInProgress = false;
        LogUtils.log('初始化備用同步實現（將提供基本功能）');
      }
      
      async init() {
        LogUtils.warn('⚠️ 使用備用同步實現 - 功能有限');
        LogUtils.log('建議: 檢查 SettingsIO/settings-io.js 是否正確載入');
      }
      
      async manualSync() {
        if (this.syncInProgress) {
          return { success: false, error: '同步正在進行中' };
        }
        
        this.syncInProgress = true;
        try {
          LogUtils.log('⚠️ 執行備用手動同步（僅模擬）');
          
          // 模擬同步操作
          await new Promise(resolve => setTimeout(resolve, 1000));
          
          await chrome.storage.local.set({ 
            lastSyncTime: Date.now(),
            syncError: null 
          });
          
          const message = '備用同步完成（模擬）- 請使用真正的 SettingsIO 以獲得完整功能';
          LogUtils.log(message);
          return { success: true, message };
        } finally {
          this.syncInProgress = false;
        }
      }
      
      async toggleAutoSync(enabled) {
        LogUtils.log(`切換自動同步（備用）: ${enabled}`);
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
        LogUtils.log('重置同步狀態（備用）');
        // 修正：只清理 local storage，與 SettingsIO 保持一致
        await chrome.storage.local.remove(['syncEnabled', 'lastSyncTime', 'syncError']);
        return { success: true };
      }
      
      async signOut() {
        LogUtils.log('登出（備用）');
        await this.resetSyncStatus();
        return { success: true };
      }
      
      async forceUpload() {
        LogUtils.log('⚠️ 備用強制上傳（僅模擬）');
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
      LogUtils.log(`切換自動同步: ${enabled}`);
      
      const resultEnabled = await this.settingsIO.toggleAutoSync(enabled);
      
      if (resultEnabled === enabled) {
        await chrome.storage.local.set({ syncEnabled: enabled });
        
        if (enabled) {
          LogUtils.log('訊號驅動同步已啟用，無需定期計時器');
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
  STATUS_TYPES: {
    RUNNING: 'running',
    COMPLETED: 'completed',
    ERROR: 'error',
    IDLE: 'idle',
    SCHEDULED: 'scheduled',
    WARNING: 'warning'
  },
  MESSAGES: {
    SETTINGS_IO_NOT_INIT: 'SettingsIO 實例未初始化'
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

// 載入股票爬蟲模組
importScripts('stock_crawl/stock-crawler-config.js');
importScripts('stock_crawl/stock-crawler-urls.js');
importScripts('stock_crawl/stock-crawl-log.js');
importScripts('stock_crawl/stock-crawler-manager.js');

// 用於追踪每個標籤頁的內容腳本狀態
const tabContentScriptStatus = new Map();

// 初始化背景同步功能
async function initializeBackgroundSync() {
  if (backgroundSyncInitialized) {
    LogUtils.log('同步功能已初始化，跳過');
    return;
  }
  
  try {
    LogUtils.important('🔧 開始初始化背景同步功能...');
    
    // 載入必要的依賴
    loadDependencies();
    
    // 創建背景同步管理器實例
    backgroundSettingsIO = new BackgroundSyncManager();
    await backgroundSettingsIO.init();
    backgroundSyncInitialized = true;
    
    LogUtils.important('✅ 背景同步功能初始化完成');
  } catch (error) {
    LogUtils.error('初始化背景同步功能失敗', error);
  }
}

// 載入必要的依賴項  
function loadDependencies() {
  // 檢查是否已經載入 SettingsIO
  if (typeof SettingsIO !== 'undefined') {
    return;
  }
  
  try {
    // 載入必要的依賴（default.js 已在檔案開頭載入）
    importScripts('settings.js');
    importScripts('settings/settings-key.js');
    importScripts('settings/settings-classifier.js');
    importScripts('settings/settings-exporter.js');
    importScripts('settings/settings-importer.js');
    importScripts('settings/storage-manager.js');
    importScripts('settings/model-manager.js');
    importScripts('SettingsIO/settings-io.js');
    importScripts('SettingsIO/settings-io-startup.js');
    
    // 檢查是否成功載入
    if (typeof SettingsIO === 'undefined') {
      throw new Error('importScripts 執行完成但 SettingsIO 仍未定義');
    }
    
  } catch (error) {
    LogUtils.error('❌ 載入 SettingsIO 失敗', error);
    LogUtils.log('⚠️ 將使用備用實現（功能受限）');
  }
}

// 初始化背景服務
async function initializeBackgroundServices() {
  try {
    LogUtils.important('🚀 初始化背景服務...');
    
    // 初始化背景爬蟲管理器
    BackgroundStockCrawlerManager.init();
    
    // 初始化背景同步功能
    await initializeBackgroundSync();
    
    // 觸發啟動時同步檢查
    setTimeout(async () => {
      try {
        LogUtils.log('🚀 觸發背景啟動同步檢查...');
        const result = await performBackgroundStartupSync();
        if (result.success) {
          LogUtils.log(`✅ 背景啟動同步檢查完成: ${result.reason || 'executed'}`);
        } else {
          LogUtils.warn(`⚠️ 背景啟動同步檢查失敗: ${result.error}`);
        }
      } catch (error) {
        LogUtils.error('背景啟動同步檢查異常:', error);
      }
    }, 2000); // 延遲2秒執行，確保所有初始化完成
    
    LogUtils.important('✅ 背景服務初始化完成');
  } catch (error) {
    LogUtils.error('背景服務初始化失敗', error);
  }
}

// 啟動背景服務
initializeBackgroundServices();

// 🔧 chrome.alarms 定時爬取監聽器
// 這是 Service Worker 被 alarm 喚醒時的入口點，必須在頂層註冊
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === STOCK_CRAWLER_CONFIG.ALARM_NAME) {
    LogUtils.important(`⏰ chrome.alarms 觸發定時爬取: ${alarm.name}`);
    if (!BackgroundStockCrawlerManager.running) {
      BackgroundStockCrawlerManager.startCrawl('定時');
    } else {
      LogUtils.log('爬蟲已在運行中，跳過此次 alarm 觸發');
    }
  }
});

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
        LogUtils.log('同步功能未初始化，嘗試重新初始化...');
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

      LogUtils.log(`${command.log}${command.args?.includes('enabled') ? ': ' + request.enabled : ''}`);
      
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
      LogUtils.error('處理同步請求時發生錯誤', error);
      sendResponse({ success: false, error: error.message });
    });

    return true;
  }

  // 處理日誌消息 - 使用統一的日誌配置
  if (request.type === 'LOG') {
    const style = BACKGROUND_CONSTANTS.LOG_STYLES[request.color] || 
                  (request.color ? `color: ${request.color}` : '');
    LogUtils.log(`%c[${new Date(request.timestamp).toLocaleTimeString()}] ${request.source}: ${request.message}`, style);
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
      error: () => LogUtils.error(`[設定管理器 ${timestamp}] ${logMessage}`, data || ''),
      warn: () => LogUtils.warn(`[設定管理器 ${timestamp}] ${logMessage}`, data || ''),
      success: () => LogUtils.log(`%c[設定管理器 ${timestamp}] ${logMessage}`, 'color: #2E7D32', data || ''),
      info: () => LogUtils.log(`[設定管理器 ${timestamp}] ${logMessage}`, data || '')
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
    
    LogUtils.log(
      `%c[SyncDebug][${new Date().toLocaleTimeString()}] ${config.emoji} ${request.message}`, 
      config.style, request.data || ''
    );
    
    sendResponse({ status: 'success' });
    return null;
  }

  // 處理雲端訊號調試信息
  if (request.action === 'cloudSignalDebug') {
    const { message: debugMessage, data } = request;
    LogUtils.log(`[CloudSignalDebug][${data.currentTime}] ${debugMessage}`, data);
    
    const messageFunc = BACKGROUND_CONSTANTS.SIGNAL_MESSAGES[data.action];
    if (messageFunc) {
      const logData = data.action === 'sendSignal' ? data.signal : '';
      LogUtils.log(`[CloudSignalDebug] ${messageFunc(data)}`, logData);
    }
    
    return null;
  }

  // 處理啟動同步請求（來自 Content Script）
  if (request.action === 'performStartupSync') {
    LogUtils.log(`🚀 收到來自 ${request.source || 'unknown'} 的啟動同步請求`);
    
    const handleStartupSyncRequest = async () => {
      try {
        // 檢查背景同步是否已初始化
        if (!backgroundSyncInitialized || !backgroundSettingsIO) {
          LogUtils.warn('背景同步未初始化，嘗試重新初始化...');
          await initializeBackgroundSync();
          
          if (!backgroundSettingsIO) {
            return { success: false, error: '背景同步管理器初始化失敗' };
          }
        }
        
        // 使用全域函數直接執行背景啟動同步
        if (typeof performBackgroundStartupSync === 'function') {
          LogUtils.log('使用全域 performBackgroundStartupSync 函數');
          const result = await performBackgroundStartupSync();
          return result;
        } else {
          LogUtils.warn('performBackgroundStartupSync 函數不可用，使用手動同步');
          const result = await backgroundSettingsIO.manualSync();
          return { success: result.success, reason: 'manualSync' };
        }
        
      } catch (error) {
        LogUtils.error('處理啟動同步請求失敗:', error);
        return { success: false, error: error.message };
      }
    };
    
    handleStartupSyncRequest()
      .then(result => {
        LogUtils.log('啟動同步請求處理完成:', result);
        sendResponse(result);
      })
      .catch(error => {
        LogUtils.error('啟動同步請求處理異常:', error);
        sendResponse({ success: false, error: error.message });
      });
    
    return true; // 保持連接等待異步響應
  }

  // 處理 API 請求（解決 CORS 問題）
  if (request.action === 'apiRequest') {
    const handleApiRequest = async () => {
      try {
        const { endpoint, body, apiKey, isGemini } = request;
        
        LogUtils.log('🌐 [Background] 處理 API 請求:', { 
          endpoint: endpoint.substring(0, 50) + '...', 
          isGemini,
          bodySize: JSON.stringify(body).length 
        });
        
        const fetchUrl = isGemini ? `${endpoint}?key=${apiKey}` : endpoint;
        const headers = {
          'Content-Type': 'application/json'
        };
        
        if (!isGemini) {
          headers['Authorization'] = `Bearer ${apiKey}`;
        }
        
        const response = await fetch(fetchUrl, {
          method: 'POST',
          headers: headers,
          body: JSON.stringify(body)
        });
        
        LogUtils.log('📡 [Background] 收到 API 響應:', { status: response.status, ok: response.ok });
        
        if (!response.ok) {
          const errorData = await response.json();
          LogUtils.error('❌ [Background] API 錯誤響應:', errorData);
          sendResponse({ 
            success: false, 
            error: `HTTP error! status: ${response.status}`, 
            errorData 
          });
          return;
        }
        
        const data = await response.json();
        LogUtils.log('✅ [Background] API 請求成功');
        sendResponse({ success: true, data });
        
      } catch (error) {
        LogUtils.error('❌ [Background] API 請求失敗:', error);
        sendResponse({ success: false, error: error.message });
      }
    };
    
    handleApiRequest();
    return true; // 保持連接等待異步響應
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

// 🐛 簡化調試：處理來自 content script 的重要訊息
function handleDebugMessage(message, sender) {
  // 只記錄警告和錯誤級別的重要訊息
  if (message.message && (message.message.includes('⚠️') || message.message.includes('🚨') || message.message.includes('❌'))) {
    const tabId = sender.tab ? sender.tab.id : 'unknown';
    LogUtils.log(`🐛 [Debug][Tab-${tabId}] ${message.message}`);
  }
}
