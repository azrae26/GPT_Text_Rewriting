// background.js - 背景服務工作器
// 2025/01/02 更新：集成 SettingsIO 雲端同步功能
// 2025/06/08 修復：解決 SettingsIO.toggleAutoSync 返回值格式問題
// 2025/01/23 清理：移除過時代碼，簡化日誌輸出
// 2026/02/13 重構：將股票爬蟲代碼拆分至 stock_crawl/ 資料夾
// 2026/02/13 重構：將 BackgroundSyncManager 拆分至 SettingsIO/settings-io-background-sync.js
// 2026/02/14 新增：自動匯出設定功能（設定變更後 30 分鐘自動下載 JSON 備份）
// 
// 功能：
// - 股票爬蟲管理：背景運行股票清單爬取（代碼已移至 stock_crawl/）
// - 雲端同步管理：整合 SettingsIO 的 Google Drive 同步（代碼已移至 SettingsIO/）
// - 自動匯出管理：設定變更後延遲自動匯出為本地 JSON 檔案（chrome.downloads）
// - 消息路由：處理來自 popup 和 content scripts 的消息
// - 狀態持久化：維護爬蟲和同步狀態
// 
// 職責：
// - 管理 BackgroundStockCrawlerManager 的定時和單次爬取
// - 管理 BackgroundSyncManager 的雲端同步（類別已移至 SettingsIO/settings-io-background-sync.js）
// - 處理 chrome.storage 數據持久化
// - 維護與 popup 的雙向通信
// 
// 依賴：
// - Chrome Extensions API (runtime, storage, tabs)
// - settings.js：全域設定管理
// - SettingsIO/settings-io.js：雲端同步功能
// - SettingsIO/settings-io-background-sync.js：背景同步管理器
// - stock_crawl/：股票爬蟲模組（config, urls, log, manager）

// 載入必要的依賴 - LogUtils 工具函數
importScripts('default.js');

// 載入 SettingsIO 相關依賴（必須在頂層呼叫，MV3 service worker 限制）
importScripts('settings/settings-key.js');
importScripts('settings/settings-classifier.js');
importScripts('settings/settings-exporter.js');
importScripts('settings/settings-importer.js');
importScripts('settings/storage-manager.js');
importScripts('settings/model-manager.js');
importScripts('settings.js');
importScripts('SettingsIO/settings-io.js');
importScripts('SettingsIO/settings-io-startup.js');

// 背景同步功能相關變數
let backgroundSettingsIO = null;
let backgroundSyncInitialized = false;

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

// 載入背景同步管理器模組
importScripts('SettingsIO/settings-io-background-sync.js');

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

// 載入必要的依賴項（所有 importScripts 已移至頂層）
function loadDependencies() {
  if (typeof SettingsIO === 'undefined') {
    LogUtils.error('❌ SettingsIO 未定義，頂層 importScripts 可能失敗');
  }
}

// 初始化背景服務
async function initializeBackgroundServices() {
  try {
    LogUtils.important('🚀 初始化背景服務...');

    // 開發模式：重啟後自動重開 popup
    const result = await chrome.storage.local.get('devReopenPopup');
    const { devReopenPopup } = result;
    if (devReopenPopup) {
      LogUtils.important('🔄 [DevReload] 重啟完成，準備重開 popup...');
      await chrome.storage.local.remove('devReopenPopup');
      setTimeout(async () => {
        try {
          const wins = await chrome.windows.getAll({ windowTypes: ['normal'] });
          const win = wins[0];
          if (win) {
            await chrome.windows.update(win.id, { focused: true });
            await new Promise(r => setTimeout(r, 300));
            await chrome.action.openPopup({ windowId: win.id });
            LogUtils.important('✅ [DevReload] popup 重開成功');
          }
        } catch (e) {
          LogUtils.warn('⚠️ [DevReload] 無法自動重開 popup:', e.message);
        }
      }, 800);
    } else {
      LogUtils.important('🔄 [DevReload] 重啟完成（popup 原本關著）');
    }

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

// === 開發模式：建立 Offscreen Document 監聽檔案變更 ===
(async () => {
  try {
    const contexts = await chrome.runtime.getContexts({ contextTypes: ['OFFSCREEN_DOCUMENT'] });
    if (contexts.length === 0) {
      await chrome.offscreen.createDocument({
        url: 'dev-offscreen.html',
        reasons: ['DOM_SCRAPING'],
        justification: '監聽擴充套件檔案變更以支援開發時自動重新載入'
      });
    }
  } catch (e) {
    // 不支援 offscreen API 時忽略
  }
})();

// 🔧 chrome.alarms 定時爬取 + 自動匯出監聽器
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
  
  // 📁 自動匯出設定 alarm
  if (alarm.name === 'autoExportSettings') {
    LogUtils.important('📁 自動匯出 alarm 觸發，開始匯出設定檔案');
    autoExportSettings();
  }
});

// 處理來自 popup 的長連接
chrome.runtime.onConnect.addListener((port) => {
  if (port.name === 'popupOpen') {
    chrome.storage.session.set({ devPopupWasOpen: true });
    port.onDisconnect.addListener(() => {
      chrome.storage.session.remove('devPopupWasOpen');
    });
    return;
  }

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
  // 處理 offscreen document 偵測到的檔案變更
  if (request.action === 'fileChanged') {
    LogUtils.important('🔄 [DevReload] 偵測到檔案變更');
    chrome.storage.session.get('devPopupWasOpen').then((result) => {
      const popupWasOpen = !!result.devPopupWasOpen;
      LogUtils.important(`🔄 [DevReload] popup 狀態: ${popupWasOpen ? '開著，重啟後重開' : '關著，不重開'}`);
      if (popupWasOpen) chrome.storage.local.set({ devReopenPopup: true });
      LogUtils.important('🔄 [DevReload] 300ms 後執行 chrome.runtime.reload()...');
      setTimeout(() => chrome.runtime.reload(), 300);
    });
    return false;
  }

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
  
  // 處理自動匯出 alarm 設定/清除請求
  if (request.action === 'setAutoExportAlarm') {
    const delayMinutes = request.delayMinutes || 30;
    chrome.alarms.create('autoExportSettings', { delayInMinutes: delayMinutes });
    LogUtils.log(`⏰ 已設定自動匯出 alarm，${delayMinutes} 分鐘後執行`);
    sendResponse({ success: true });
    return false;
  }
  
  if (request.action === 'clearAutoExportAlarm') {
    chrome.alarms.clear('autoExportSettings');
    LogUtils.log('📁 已清除自動匯出 alarm');
    sendResponse({ success: true });
    return false;
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

  // 處理「複製到新報告」：對每檔股票並行開 create 分頁並推送填表資料
  if (request.action === 'copyReportToCreate') {
    const { fields, selected, stockCodes } = request;
    LogUtils.log(`[ReportCopy] 收到 copyReportToCreate，共 ${stockCodes.length} 檔`, { codes: stockCodes, selected });

    const openAndFill = async (stockCode) => {
      const tab = await chrome.tabs.create({ url: REPORT_COPY_CREATE_URL, active: false });
      LogUtils.log(`[ReportCopy] 建立分頁 ${tab.id}（${stockCode}）`);
      await waitForReportTabLoad(tab.id);
      LogUtils.log(`[ReportCopy] 分頁 ${tab.id} 載入完成（${stockCode}）`);
      await sendFillToTab(tab.id, { fields, selected, stockCode });
      LogUtils.log(`[ReportCopy] 分頁 ${tab.id} 已推送填表（${stockCode}）`);
      return { tabId: tab.id, stockCode };
    };

    Promise.all(stockCodes.map(openAndFill))
      .then(results => {
        LogUtils.log(`[ReportCopy] 全部完成，共 ${results.length} 檔`, results);
        sendResponse({ success: true, results });
      })
      .catch(error => {
        LogUtils.error('[ReportCopy] 流程失敗:', error.message);
        sendResponse({ success: false, error: error.message });
      });
    return true; // 保持連接等待異步響應
  }

  // 處理「複製到新報告」的日誌轉發（集中印在 service worker console）
  if (request.action === 'reportCopyLog') {
    const { message: logMessage, data, timestamp } = request;
    LogUtils.log(`[ReportCopy ${timestamp}] ${logMessage}`, data || '');
    return null;
  }

  return false; // 未處理的消息，不需要保持連接
});

// === 「複製到新報告」背景輔助（移植自 F:\Cursor\Crawler\background.js 的推送式流程）===
const REPORT_COPY_CREATE_URL = 'https://data.uanalyze.com.tw/research-reports/create';

// 等待分頁載入完成（每個 listener 只認自己的 tabId，可並行）
function waitForReportTabLoad(tabId) {
  return new Promise(resolve => {
    chrome.tabs.onUpdated.addListener(function listener(id, info) {
      if (id === tabId && info.status === 'complete') {
        chrome.tabs.onUpdated.removeListener(listener);
        setTimeout(resolve, 100); // 給頁面額外時間初始化 content script
      }
    });
  });
}

// 向分頁推送填表資料，失敗重試 3 次（content script 可能尚未就緒）
async function sendFillToTab(tabId, payload) {
  let retries = 3;
  while (retries > 0) {
    try {
      await chrome.tabs.sendMessage(tabId, { action: 'fillReportCopy', ...payload });
      return;
    } catch (error) {
      retries--;
      LogUtils.warn(`[ReportCopy] 推送分頁 ${tabId} 失敗（剩餘 ${retries} 次）: ${error.message}`);
      if (retries > 0) await new Promise(r => setTimeout(r, 300));
    }
  }
  throw new Error(`推送分頁 ${tabId} 填表資料失敗，已達最大重試次數`);
}

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

// 📁 自動匯出設定為本地 JSON 檔案
// 由 autoExportSettings alarm 觸發，使用 chrome.downloads API 下載
async function autoExportSettings() {
  try {
    LogUtils.important('📁 開始自動匯出設定...');
    
    // 確保依賴已載入
    loadDependencies();
    
    // 讀取所有設定
    const [syncData, localData] = await Promise.all([
      chrome.storage.sync.get(null),
      chrome.storage.local.get(null)
    ]);
    
    // 使用 KeyClassifier 過濾設定（只匯出有效設定，排除內部狀態）
    const allData = { ...syncData, ...localData };
    const filteredSettings = typeof KeyClassifier !== 'undefined' 
      ? KeyClassifier.filterSettings(allData, 'export')
      : allData;
    
    // 組合匯出資料（跟手動匯出格式一致）
    // 單一真相：appName/version 一律取自 SETTINGS_IDENTIFIER，禁止再硬編。
    // gotcha：曾硬編成 'GPT Text Rewriting'（空格）與驗證用的底線版漂移，
    // 導致自動匯出檔無法被「匯入設定」接受（驗證見 settings-manager validateSettingsFile）。
    const exportData = {
      ...GlobalSettings.SETTINGS_IDENTIFIER,
      exportType: 'auto',
      exportTime: new Date().toISOString(),
      settings: filteredSettings
    };
    
    // 生成時間戳記檔名
    const now = new Date();
    const timestamp = now.getFullYear().toString().slice(-2) + 
      String(now.getMonth() + 1).padStart(2, '0') + 
      String(now.getDate()).padStart(2, '0') + '-' +
      String(now.getHours()).padStart(2, '0') + 
      String(now.getMinutes()).padStart(2, '0');
    
    const filename = `gpt-rewriter-settings_auto_${timestamp}.json`;
    
    // 使用 data URL + chrome.downloads 下載
    const jsonString = JSON.stringify(exportData, null, 2);
    const dataUrl = 'data:application/json;charset=utf-8,' + encodeURIComponent(jsonString);
    
    chrome.downloads.download({
      url: dataUrl,
      filename: filename,
      saveAs: false
    }, (downloadId) => {
      if (chrome.runtime.lastError) {
        LogUtils.error('📁 自動匯出下載失敗:', chrome.runtime.lastError.message);
      } else {
        LogUtils.important(`📁 自動匯出完成: ${filename} (downloadId: ${downloadId})`);
      }
    });
    
    // 清除 alarm，避免重複匯出
    chrome.alarms.clear('autoExportSettings');
    
  } catch (error) {
    LogUtils.error('📁 自動匯出失敗:', error);
  }
}

// 🐛 簡化調試：處理來自 content script 的重要訊息
function handleDebugMessage(message, sender) {
  // 只記錄警告和錯誤級別的重要訊息
  if (message.message && (message.message.includes('⚠️') || message.message.includes('🚨') || message.message.includes('❌'))) {
    const tabId = sender.tab ? sender.tab.id : 'unknown';
    LogUtils.log(`🐛 [Debug][Tab-${tabId}] ${message.message}`);
  }
}
