/**
 * settings-io.js - 設定同步和雲端儲存管理
 * 功能：
 * - OAuth2 認證管理 (TokenManager)
 * - Google Drive 檔案同步
 * - 自動設定上傳和下載
 * - 設定衝突處理和時間戳記驗證
 * - 多分頁協調管理
 * - 深度內容比較和無效時間戳記處理
 * 
 * 職責：
 * - 管理與 Google Drive 的所有互動
 * - 處理設定的雲端同步邏輯
 * - 提供同步狀態和錯誤處理
 * - 實現自動和手動同步功能
 * - 處理本地時間戳記異常的特殊情況
 * 
 * 依賴：
 * - Chrome Extensions API: storage, identity, alarms
 * - Google Drive API v3
 * - GlobalSettings: 本地設定管理
 * 
 * 更新日誌：
 * - 2025-06-08: 修復本地時間戳記為 0 時的同步問題，添加深度比較邏輯
 * - 2025-06-08: 排除 UI 狀態鍵值（如 lastMainTab）避免不必要的同步觸發
 * - 2025-06-08: 重新設計自動清理功能，僅在雲端上傳時清理，不影響本地邏輯
 */

class SettingsIO {
  // 常數定義
  static CONSTANTS = {
    // API 端點
    DRIVE_API_BASE: 'https://www.googleapis.com/drive/v3',
    UPLOAD_API_BASE: 'https://www.googleapis.com/upload/drive/v3',
    
    // 檔案設定
    SETTINGS_FILENAME: 'gpt-text-rewriting-settings.json',
    
    // 時間設定 (毫秒)
    TIMINGS: {
      UPLOAD_DEBOUNCE: 10000,        // 上傳延遲 10 秒
      SYNC_INTERVAL: 0.25*60*1000,          // 同步間隔 0.25 分鐘
      TOKEN_REFRESH_MARGIN: 600000,   // Token 提前更新 10 分鐘
      LOCAL_RECENT_THRESHOLD: 5000,   // 本地最近更新閾值 5 秒
      COMPETITION_DELAY: 100,         // 多分頁競爭延遲 100ms
      AUTO_EXPORT_DELAY: 1800000,     // 自動匯出延遲 30 分鐘
      RETRY_DELAY: 1800000           // 重試延遲 30 分鐘
    },
    
    // 儲存鍵值
    KEYS: {
      SYNC_STATUS: 'syncStatus',
      LAST_SYNC: 'lastSyncTime',
      AUTH_TOKEN: 'authToken',
      TOKEN_EXPIRY: 'tokenExpiry',
      DRIVE_FILE_ID: 'driveFileId',
      SYNC_ENABLED: 'syncEnabled',
      SETTINGS_HASH: 'settingsHash',
      EXPORT_TOKEN: 'exportToken',
      LAST_EXPORT: 'lastExportTime',
      SYNC_ERROR: 'syncError'
    }
  };

  constructor() {
    this.syncInProgress = false;
    this.uploadInProgress = false;
    this.tokenManager = new TokenManager();
    this.syncIntervalId = null;
    this.uploadTimeoutId = null;
    this.isInitialized = false;
    
    // 綁定方法以保持 this 上下文
    this.handleStorageChange = this.handleStorageChange.bind(this);
    this.performSync = this.performSync.bind(this);
  }

  // 初始化同步系統
  async init() {
    if (this.isInitialized) {
      return;
    }

    console.log(`[SettingsIO][${getCurrentTimeString()}] 初始化設定同步系統`);
    
    try {
      // 設置儲存變更監聽器
      this.setupStorageListener();
      
      // 檢查同步狀態
      const syncEnabled = await this.isSyncEnabled();
      if (syncEnabled) {
        // 啟動定期同步
        this.startPeriodicSync();
        console.log(`[SettingsIO][${getCurrentTimeString()}] 自動同步已啟用`);
      }
      
      this.isInitialized = true;
              console.log(`[SettingsIO][${getCurrentTimeString()}] 設定同步系統初始化完成`);
      } catch (error) {
        console.error(`[SettingsIO][${getCurrentTimeString()}] 初始化失敗:`, error);
    }
  }

  // 設置儲存變更監聽器
  setupStorageListener() {
    chrome.storage.local.onChanged.addListener(this.handleStorageChange);
    chrome.storage.sync.onChanged.addListener(this.handleStorageChange);
  }

  // 處理儲存變更
  async handleStorageChange(changes, areaName) {
    // 忽略同步相關的變更以避免循環
    const ignoredKeys = [
      SettingsIO.CONSTANTS.KEYS.LAST_SYNC,
      SettingsIO.CONSTANTS.KEYS.SYNC_STATUS,
      SettingsIO.CONSTANTS.KEYS.SETTINGS_HASH,
      SettingsIO.CONSTANTS.KEYS.SYNC_ERROR,
      'syncDebugLogs', // 調試日誌不需要同步
      'stockCrawlerState' // 爬蟲狀態是運行時狀態，不需要同步
    ];

    const relevantChanges = Object.keys(changes).filter(key => 
      !ignoredKeys.includes(key) && 
      this.isSettingsKey(key) &&
      !this.shouldExcludeFromSyncComparison(key) // 排除不應觸發同步的 UI 狀態
    );

    if (relevantChanges.length === 0) {
      return;
    }

            console.log(`[SettingsIO][${getCurrentTimeString()}] 偵測到設定變更:`, relevantChanges);

    // 更新最後修改時間
    await this.updateLastModifiedTime();

    // 延遲上傳以避免頻繁操作
    this.scheduleUpload();
  }

  // 判斷是否為設定相關的鍵值
  isSettingsKey(key) {
    const settingsKeys = [
      'apiKeys', 'instruction', 'shortInstruction', 'autoRewritePatterns',
      'translateInstruction', 'summaryInstruction', 'zhEnMapping',
      'fullRewriteModel', 'shortRewriteModel', 'autoRewriteModel',
      'translateModel', 'summaryModel', 'reflectModel', 'optimizeModel',
      'generateModel', 'reflect1Model', 'generationOptimize_1_Model',
      'reflect2Model', 'generationOptimize_2_Model', 'reflect3Model',
      'generationOptimize_3_Model', 'generateInstruction', 'reflect1Instruction',
      'generationOptimize_1_Instruction', 'reflect2Instruction',
      'generationOptimize_2_Instruction', 'reflect3Instruction',
      'generationOptimize_3_Instruction', 'backgroundKnowledge',
      'reflectInstruction', 'optimizeInstruction', 'stockList',
      'crawlerInterval', 'highlightWords', 'highlightColors',
      'generationSettingsGroups', 'currentGenerationSettings',
      'customModels', 'removeHash', 'removeStar'
    ];
    
    return settingsKeys.includes(key) || key.startsWith('generation_settings_');
  }

  // 更新最後修改時間
  async updateLastModifiedTime() {
    const currentTime = Date.now();
    await chrome.storage.local.set({
      lastModified: currentTime
    });
  }

  // 排程上傳
  scheduleUpload() {
    // 清除之前的計時器
    if (this.uploadTimeoutId) {
      clearTimeout(this.uploadTimeoutId);
    }

    // 設置新的延遲上傳
    this.uploadTimeoutId = setTimeout(async () => {
      if (await this.isSyncEnabled()) {
        await this.uploadSettings();
      }
    }, SettingsIO.CONSTANTS.TIMINGS.UPLOAD_DEBOUNCE);
  }

  // OAuth 認證管理
  async authenticateWithGoogle(interactive = false) {
    return await this.tokenManager.getToken(interactive);
  }

  // 手動同步設定
  async manualSync() {
          console.log(`[SettingsIO][${getCurrentTimeString()}] 開始手動同步`);
    
    try {
      // 先嘗試認證
      const authResult = await this.authenticateWithGoogle(true);
      if (!authResult.success) {
        throw new Error(authResult.error || '認證失敗');
      }

      // 執行同步，傳遞已獲得的 token（提取實際的 token 字符串）
      const actualToken = typeof authResult.token === 'object' ? authResult.token.token : authResult.token;
      await this.performSync(actualToken);
      
      console.log(`[SettingsIO][${getCurrentTimeString()}] 手動同步完成`);
      return { success: true };
    } catch (error) {
      console.error(`[SettingsIO][${getCurrentTimeString()}] 手動同步失敗:`, error);
      await this.setSyncError(error.message);
      return { success: false, error: error.message };
    }
  }

  // 啟用/停用自動同步
  async toggleAutoSync(enabled) {
    console.log(`[SettingsIO][${getCurrentTimeString()}] 切換自動同步:`, enabled);
    
    await chrome.storage.local.set({
      [SettingsIO.CONSTANTS.KEYS.SYNC_ENABLED]: enabled
    });

    if (enabled) {
      // 立即進行一次同步
      const syncResult = await this.manualSync();
      if (syncResult.success) {
        this.startPeriodicSync();
      }
    } else {
      this.stopPeriodicSync();
    }

    return enabled;
  }

  // 開始定期同步
  startPeriodicSync() {
    this.stopPeriodicSync(); // 確保沒有重複的計時器
    
    this.syncIntervalId = setInterval(async () => {
      if (await this.isSyncEnabled()) {
        await this.performSync();
      }
    }, SettingsIO.CONSTANTS.TIMINGS.SYNC_INTERVAL);
    
    console.log(`[SettingsIO][${getCurrentTimeString()}] 定期同步已啟動`);
  }

  // 停止定期同步
  stopPeriodicSync() {
    if (this.syncIntervalId) {
      clearInterval(this.syncIntervalId);
      this.syncIntervalId = null;
      console.log(`[SettingsIO][${getCurrentTimeString()}] 定期同步已停止`);
    }
  }

  // 檢查是否啟用同步
  async isSyncEnabled() {
    const result = await chrome.storage.local.get([SettingsIO.CONSTANTS.KEYS.SYNC_ENABLED]);
    return result[SettingsIO.CONSTANTS.KEYS.SYNC_ENABLED] || false;
  }

  // 執行同步邏輯
  async performSync(token = null) {
    if (this.syncInProgress) {
      console.log(`[SettingsIO][${getCurrentTimeString()}] 同步正在進行中，跳過`);
      return;
    }

    this.syncInProgress = true;
    
    try {
      console.log(`[SettingsIO][${getCurrentTimeString()}] 開始執行同步`);
      
      // 如果沒有提供 token，嘗試非交互式認證
      if (!token) {
        const authResult = await this.authenticateWithGoogle(false);
        if (!authResult.success) {
          console.log(`[SettingsIO][${getCurrentTimeString()}] 認證失敗，跳過同步`);
          return;
        }
        token = authResult.token;
      }

      // 檢查 token 有效性
      if (!token || typeof token !== 'string') {
        throw new Error('無效的認證 token');
      }

      // 獲取 Drive 檔案
      const fileId = await this.getOrCreateDriveFile(token);
      
      // 下載雲端設定
      const driveSettings = await this.downloadSettings(token, fileId);
      
      // 獲取本地設定 - 修復：使用 getAllSettings() 確保與手動匯出一致
      const localSettings = await GlobalSettings.getAllSettings();
      
      // 比較和合併設定
      const { needsReload, needsUpload, mergedSettings } = await this.compareAndMergeSettings(
        localSettings, 
        driveSettings
      );
      
      // 如果需要更新本地設定
      if (needsReload) {
        console.log(`[SettingsIO][${getCurrentTimeString()}] 更新本地設定並重新載入`);
        await this.saveSettings(mergedSettings);
        // 直接重新載入，不顯示確認對話框
        location.reload();
      } else if (needsUpload) {
        // 如果本地設定較新，上傳到雲端
        console.log(`[SettingsIO][${getCurrentTimeString()}] 本地設定較新，上傳到雲端`);
        await this.uploadSettings(token, fileId);
      } else {
        // 設定相同，不需要任何操作
        console.log(`[SettingsIO][${getCurrentTimeString()}] 設定已同步，無需操作`);
      }
      
      // 更新同步狀態
      await this.updateSyncStatus('success');
      
    } catch (error) {
      console.error(`[SettingsIO][${getCurrentTimeString()}] 同步失敗:`, error);
      await this.setSyncError(error.message);
    } finally {
      this.syncInProgress = false;
    }
  }

  // 判斷是否為純 UI 狀態鍵值（位置、大小、選中狀態等）
  isUIStateKey(key) {
    const uiStateKeys = [
      'lastMainTab',           // 最後選中的主分頁
      'lastSubTab',            // 最後選中的子分頁  
      'windowState',           // 窗口狀態（位置、大小）
      'selectedItem',          // 當前選中的項目（非功能性選擇）
      'expandedSections',      // 展開的區塊狀態
      'scrollPosition',        // 滾動位置
      'dialogState',           // 對話框開關狀態
      'panelState',            // 面板展開/收起狀態
      'replacePosition',       // 替換框位置
      'summaryPosition',       // 摘要面板位置
      'summaryExpanded',       // 摘要面板展開狀態
      'isFirstTime',           // 首次使用標記
      'firstRun',              // 首次運行標記
      'autoExport'             // 自動匯出狀態
      // 注意：移除了 sortOrder 和 filterState，這些是功能性設定，不是純 UI 狀態
    ];
    
    return uiStateKeys.includes(key);
  }

  // 判斷是否為不需要同步的鍵值（僅用於同步比較，不影響儲存分類）
  shouldExcludeFromSync(key) {
    // 排除同步相關的內部狀態
    const syncInternalKeys = [
      SettingsIO.CONSTANTS.KEYS.LAST_SYNC,
      SettingsIO.CONSTANTS.KEYS.SYNC_STATUS,
      SettingsIO.CONSTANTS.KEYS.SETTINGS_HASH,
      SettingsIO.CONSTANTS.KEYS.SYNC_ERROR,
      SettingsIO.CONSTANTS.KEYS.DRIVE_FILE_ID,
      'syncDebugLogs',         // 調試日誌
      'stockCrawlerState'      // 爬蟲狀態
    ];
    
    return syncInternalKeys.includes(key) || this.isUIStateKey(key);
  }

  // 清理設定以便雲端上傳（僅移除不需要雲端同步的項目）
  cleanSettingsForCloudUpload(settings) {
    const cleanedSettings = {};
    const excludedKeys = [];
    
    // 只排除明確不需要雲端同步的項目
    Object.entries(settings).forEach(([key, value]) => {
      if (this.shouldExcludeFromCloudSync(key)) {
        excludedKeys.push(key);
      } else {
        cleanedSettings[key] = value;
      }
    });
    
    if (excludedKeys.length > 0) {
      console.log(`[SettingsIO][${getCurrentTimeString()}] 雲端上傳時排除的鍵值:`, excludedKeys);
      // 發送調試訊息
      chrome.runtime.sendMessage({
        action: 'syncDebug',
        type: 'upload_cleanup',
        message: `雲端上傳時自動排除 ${excludedKeys.length} 個項目`,
        data: { excludedKeys }
      }).catch(() => {});
    }
    
    return cleanedSettings;
  }

  // 判斷是否為不需要雲端同步的鍵值（更保守的判斷）
  shouldExcludeFromCloudSync(key) {
    // 只排除明確的雲端同步無關項目
    const cloudExcludeKeys = [
      // 同步系統內部狀態（這些在雲端沒有意義）
      SettingsIO.CONSTANTS.KEYS.LAST_SYNC,
      SettingsIO.CONSTANTS.KEYS.SYNC_STATUS, 
      SettingsIO.CONSTANTS.KEYS.SETTINGS_HASH,
      SettingsIO.CONSTANTS.KEYS.SYNC_ERROR,
      SettingsIO.CONSTANTS.KEYS.DRIVE_FILE_ID,
      SettingsIO.CONSTANTS.KEYS.SYNC_ENABLED,
      // 調試和運行時狀態
      'syncDebugLogs',
      'stockCrawlerState'
    ];
    
    // 也排除所有 UI 狀態鍵值（會頻繁變化，不適合雲端同步）
    return cloudExcludeKeys.includes(key) || this.isUIStateKey(key);
  }

  // 判斷是否為不應影響同步決策的鍵值（僅用於比較）
  shouldExcludeFromSyncComparison(key) {
    // 排除所有 UI 狀態鍵值，這些變化不應觸發同步
    return this.isUIStateKey(key);
  }

  // 比較和合併設定
  async compareAndMergeSettings(localSettings, driveSettings) {
    const localLastModified = localSettings.lastModified || 0;
    const driveLastModified = driveSettings.lastModified || 0;
    
    // 檢查本地是否剛更新過（5秒內）
    const isLocalRecent = (Date.now() - localLastModified) < SettingsIO.CONSTANTS.TIMINGS.LOCAL_RECENT_THRESHOLD;
    
    const timestampData = {
      local: new Date(localLastModified).toISOString(),
      drive: new Date(driveLastModified).toISOString(),
      isLocalRecent,
      localIsEpoch: localLastModified <= 0
    };
    console.log(`[SettingsIO][${getCurrentTimeString()}] 比較設定時間戳記:`, timestampData);
    
    // 發送到 background 保存調試訊息
    chrome.runtime.sendMessage({
      action: 'syncDebug',
      type: 'timestamp',
      message: '比較設定時間戳記',
      data: timestampData
    }).catch(() => {}); // 忽略錯誤

    // 特殊情況：如果本地時間戳記為 0 或無效，且雲端有有效時間戳記，強制使用雲端版本
    if (localLastModified <= 0 && driveLastModified > 0) {
      console.log(`[SettingsIO][${getCurrentTimeString()}] 本地時間戳記無效（${localLastModified}），強制使用雲端版本`);
      return {
        needsReload: true,
        needsUpload: false,
        mergedSettings: {
          ...driveSettings,
          lastModified: driveLastModified
        }
      };
    }

    // 比較實際設定內容是否有差異（排除時間戳記和 UI 狀態鍵值）
    const localContent = { ...localSettings };
    const driveContent = { ...driveSettings };
    delete localContent.lastModified;
    delete driveContent.lastModified;
    
    // 排除不應影響同步決策的鍵值
    Object.keys(localContent).forEach(key => {
      if (this.shouldExcludeFromSyncComparison(key)) {
        delete localContent[key];
      }
    });
    
    Object.keys(driveContent).forEach(key => {
      if (this.shouldExcludeFromSyncComparison(key)) {
        delete driveContent[key];
      }
    });
    
    // 使用更可靠的深度比較
    const hasContentDifference = !this.deepEqual(localContent, driveContent);
    
    // 詳細分析鍵值差異
    const localKeys = Object.keys(localContent);
    const driveKeys = Object.keys(driveContent);
    const onlyInLocal = localKeys.filter(key => !driveKeys.includes(key));
    const onlyInDrive = driveKeys.filter(key => !localKeys.includes(key));
    const differentValues = localKeys.filter(key => 
      driveKeys.includes(key) && !this.deepEqual(localContent[key], driveContent[key])
    );
    
    const contentCompareData = {
      hasContentDifference,
      localSize: JSON.stringify(localContent).length,
      driveSize: JSON.stringify(driveContent).length,
      localKeys: localKeys.length,
      driveKeys: driveKeys.length,
      onlyInLocal: onlyInLocal,
      onlyInDrive: onlyInDrive,
      differentValues: differentValues,
      keySizeDiff: onlyInLocal.length - onlyInDrive.length
    };
    console.log(`[SettingsIO][${getCurrentTimeString()}] 設定內容比較:`, contentCompareData);
    
    // 發送到 background 保存調試訊息
    chrome.runtime.sendMessage({
      action: 'syncDebug',
      type: 'content_compare',
      message: '設定內容比較',
      data: contentCompareData
    }).catch(() => {}); // 忽略錯誤
    
    // 如果有鍵值差異，發送詳細的差異分析
    if (onlyInLocal.length > 0 || onlyInDrive.length > 0 || differentValues.length > 0) {
      chrome.runtime.sendMessage({
        action: 'syncDebug',
        type: 'key_difference',
        message: `鍵值差異詳細分析: 本地多${onlyInLocal.length}個, 雲端多${onlyInDrive.length}個, 值不同${differentValues.length}個`,
        data: {
          onlyInLocal: onlyInLocal, // 顯示完整列表
          onlyInDrive: onlyInDrive,
          differentValues: differentValues,
          totalDiffs: {
            onlyLocalCount: onlyInLocal.length,
            onlyDriveCount: onlyInDrive.length, 
            differentCount: differentValues.length
          }
        }
      }).catch(() => {});
    }

    // 如果內容完全相同，不需要任何操作
    if (!hasContentDifference) {
      console.log(`[SettingsIO][${getCurrentTimeString()}] 設定內容相同，跳過同步`);
      return {
        needsReload: false,
        needsUpload: false,
        mergedSettings: localSettings
      };
    }

    // 決定使用哪個版本（只有在內容有差異時才考慮）
    const useCloudVersion = !isLocalRecent && driveLastModified > localLastModified;
    
    if (useCloudVersion) {
      // 使用雲端版本，且內容確實不同才重啟
      console.log(`[SettingsIO][${getCurrentTimeString()}] 採用雲端版本，需要重新載入`);
      
      // 發送到 background
      chrome.runtime.sendMessage({
        action: 'syncDebug',
        type: 'sync_decision',
        message: '採用雲端版本，需要重新載入',
        data: { decision: 'use_cloud', needsReload: true }
      }).catch(() => {});
      return {
        needsReload: true,
        needsUpload: false,
        mergedSettings: {
          ...driveSettings,
          lastModified: driveLastModified
        }
      };
    } else {
      // 使用本地版本，上傳到雲端
      console.log(`[SettingsIO][${getCurrentTimeString()}] 採用本地版本，將上傳到雲端`);
      
      // 發送到 background
      chrome.runtime.sendMessage({
        action: 'syncDebug',
        type: 'sync_decision',
        message: '採用本地版本，將上傳到雲端',
        data: { decision: 'use_local', needsUpload: true }
      }).catch(() => {});
      return {
        needsReload: false,
        needsUpload: true,
        mergedSettings: localSettings
      };
    }
  }

  // 上傳設定到 Google Drive
  async uploadSettings(token = null, fileId = null) {
    if (this.uploadInProgress) {
      console.log(`[SettingsIO][${getCurrentTimeString()}] 上傳正在進行中，跳過`);
      return;
    }

    this.uploadInProgress = true;
    
    try {
      console.log(`[SettingsIO][${getCurrentTimeString()}] 開始上傳設定`);
      
      // 發送到 background
      chrome.runtime.sendMessage({
        action: 'syncDebug',
        type: 'upload',
        message: '開始上傳設定',
        data: { timestamp: getCurrentTimeString() }
      }).catch(() => {});
      
      // 如果沒有提供 token，獲取新的
      if (!token) {
        const authResult = await this.authenticateWithGoogle(false);
        if (!authResult.success) {
          console.log(`[SettingsIO][${getCurrentTimeString()}] 認證失敗，跳過上傳`);
          return;
        }
        token = authResult.token;
      }

      // 如果沒有提供 fileId，獲取或創建檔案
      if (!fileId) {
        fileId = await this.getOrCreateDriveFile(token);
      }

      // 獲取本地設定 - 修復：使用 getAllSettings() 確保與手動匯出一致
      const allSettings = await GlobalSettings.getAllSettings();
      
      // 清理不需要雲端同步的項目
      const settings = this.cleanSettingsForCloudUpload(allSettings);
      
      // 更新時間戳記
      settings.lastModified = Date.now();
      
      // 上傳到 Drive
      await this.updateDriveFile(token, fileId, settings);
      
      console.log(`[SettingsIO][${getCurrentTimeString()}] 設定上傳完成`);
      
      // 發送到 background
      chrome.runtime.sendMessage({
        action: 'syncDebug',
        type: 'upload',
        message: '設定上傳完成',
        data: { 
          timestamp: getCurrentTimeString(),
          settingsSize: JSON.stringify(settings).length 
        }
      }).catch(() => {});
      
    } catch (error) {
      console.error(`[SettingsIO][${getCurrentTimeString()}] 上傳設定失敗:`, error);
      await this.setSyncError(error.message);
    } finally {
      this.uploadInProgress = false;
    }
  }

  // 獲取或創建 Drive 檔案
  async getOrCreateDriveFile(token) {
    // 先檢查本地是否已儲存檔案 ID
    const localResult = await chrome.storage.local.get([SettingsIO.CONSTANTS.KEYS.DRIVE_FILE_ID]);
    let fileId = localResult[SettingsIO.CONSTANTS.KEYS.DRIVE_FILE_ID];
    
    if (fileId) {
      // 驗證檔案是否仍存在
      try {
        await this.getDriveFileMetadata(token, fileId);
        return fileId;
      } catch (error) {
        console.log(`[SettingsIO][${getCurrentTimeString()}] 儲存的檔案 ID 無效，重新搜尋`);
        fileId = null;
      }
    }

    // 搜尋現有檔案
    try {
      const searchUrl = `${SettingsIO.CONSTANTS.DRIVE_API_BASE}/files?q=name='${SettingsIO.CONSTANTS.SETTINGS_FILENAME}' and trashed=false`;
      const searchResponse = await fetch(searchUrl, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      const searchData = await searchResponse.json();
      
      if (searchData.files && searchData.files.length > 0) {
        fileId = searchData.files[0].id;
        console.log(`[SettingsIO][${getCurrentTimeString()}] 找到現有檔案:`, fileId);
      }
    } catch (error) {
      console.log(`[SettingsIO][${getCurrentTimeString()}] 搜尋檔案失敗:`, error);
    }

    // 如果沒有找到檔案，創建新檔案
    if (!fileId) {
      console.log(`[SettingsIO][${getCurrentTimeString()}] 創建新檔案`);
      const allSettings = await GlobalSettings.getAllSettings();
      const settings = this.cleanSettingsForCloudUpload(allSettings);
      settings.lastModified = Date.now();
      
      fileId = await this.createDriveFile(token, settings);
    }

    // 儲存檔案 ID
    await chrome.storage.local.set({
      [SettingsIO.CONSTANTS.KEYS.DRIVE_FILE_ID]: fileId
    });

    return fileId;
  }

  // 創建 Drive 檔案
  async createDriveFile(token, settings) {
    const metadata = {
      name: SettingsIO.CONSTANTS.SETTINGS_FILENAME,
      parents: ['appDataFolder']
    };

    const form = new FormData();
    form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
    form.append('file', new Blob([JSON.stringify(settings, null, 2)], { type: 'application/json' }));

    const response = await fetch(`${SettingsIO.CONSTANTS.UPLOAD_API_BASE}/files?uploadType=multipart`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`
      },
      body: form
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`創建檔案失敗: ${response.status} - ${error}`);
    }

    const result = await response.json();
          console.log(`[SettingsIO][${getCurrentTimeString()}] 檔案創建成功:`, result.id);
    return result.id;
  }

  // 更新 Drive 檔案
  async updateDriveFile(token, fileId, settings) {
    const response = await fetch(`${SettingsIO.CONSTANTS.UPLOAD_API_BASE}/files/${fileId}?uploadType=media`, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(settings, null, 2)
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`更新檔案失敗: ${response.status} - ${error}`);
    }

          console.log(`[SettingsIO][${getCurrentTimeString()}] 檔案更新成功`);
  }

  // 下載設定
  async downloadSettings(token, fileId) {
    const response = await fetch(`${SettingsIO.CONSTANTS.DRIVE_API_BASE}/files/${fileId}?alt=media`, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    if (!response.ok) {
      throw new Error(`下載設定失敗: ${response.status}`);
    }

    const settings = await response.json();
          console.log(`[SettingsIO][${getCurrentTimeString()}] 設定下載完成`);
    return settings;
  }

  // 獲取檔案資訊
  async getDriveFileMetadata(token, fileId) {
    const response = await fetch(`${SettingsIO.CONSTANTS.DRIVE_API_BASE}/files/${fileId}`, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    if (!response.ok) {
      throw new Error(`獲取檔案資訊失敗: ${response.status}`);
    }

    return await response.json();
  }

  // 儲存設定
  async saveSettings(settings) {
    // 分離同步和本地儲存的設定
    const syncSettings = {};
    const localSettings = {};

    Object.entries(settings).forEach(([key, value]) => {
      if (GlobalSettings.isLocalStorageKey && GlobalSettings.isLocalStorageKey(key)) {
        localSettings[key] = value;
      } else {
        syncSettings[key] = value;
      }
    });

    // 分別儲存
    if (Object.keys(syncSettings).length > 0) {
      await chrome.storage.sync.set(syncSettings);
    }
    
    if (Object.keys(localSettings).length > 0) {
      await chrome.storage.local.set(localSettings);
    }
  }

  // 更新同步狀態
  async updateSyncStatus(status, error = null) {
    const statusData = {
      [SettingsIO.CONSTANTS.KEYS.SYNC_STATUS]: status,
      [SettingsIO.CONSTANTS.KEYS.LAST_SYNC]: Date.now()
    };

    if (error) {
      statusData[SettingsIO.CONSTANTS.KEYS.SYNC_ERROR] = error;
    } else {
      // 清除之前的錯誤
      await chrome.storage.local.remove([SettingsIO.CONSTANTS.KEYS.SYNC_ERROR]);
    }

    await chrome.storage.local.set(statusData);
  }

  // 設置同步錯誤
  async setSyncError(error) {
    await chrome.storage.local.set({
      [SettingsIO.CONSTANTS.KEYS.SYNC_ERROR]: error,
      [SettingsIO.CONSTANTS.KEYS.SYNC_STATUS]: 'error'
    });
  }

  // 深度比較兩個物件是否相等
  deepEqual(obj1, obj2) {
    if (obj1 === obj2) {
      return true;
    }

    if (obj1 == null || obj2 == null) {
      return obj1 === obj2;
    }

    if (typeof obj1 !== typeof obj2) {
      return false;
    }

    if (typeof obj1 !== 'object') {
      return obj1 === obj2;
    }

    if (Array.isArray(obj1) !== Array.isArray(obj2)) {
      return false;
    }

    const keys1 = Object.keys(obj1);
    const keys2 = Object.keys(obj2);

    if (keys1.length !== keys2.length) {
      return false;
    }

    for (let key of keys1) {
      if (!keys2.includes(key)) {
        return false;
      }

      if (!this.deepEqual(obj1[key], obj2[key])) {
        return false;
      }
    }

    return true;
  }

  // 獲取同步狀態
  async getSyncStatus() {
    const result = await chrome.storage.local.get([
      SettingsIO.CONSTANTS.KEYS.SYNC_STATUS,
      SettingsIO.CONSTANTS.KEYS.LAST_SYNC,
      SettingsIO.CONSTANTS.KEYS.SYNC_ERROR,
      SettingsIO.CONSTANTS.KEYS.SYNC_ENABLED
    ]);

    return {
      status: result[SettingsIO.CONSTANTS.KEYS.SYNC_STATUS] || 'idle',
      lastSync: result[SettingsIO.CONSTANTS.KEYS.LAST_SYNC] || null,
      error: result[SettingsIO.CONSTANTS.KEYS.SYNC_ERROR] || null,
      enabled: result[SettingsIO.CONSTANTS.KEYS.SYNC_ENABLED] || false
    };
  }

  // 重置同步狀態
  async resetSyncStatus() {
    await chrome.storage.local.remove([
      SettingsIO.CONSTANTS.KEYS.DRIVE_FILE_ID,
      SettingsIO.CONSTANTS.KEYS.SYNC_STATUS,
      SettingsIO.CONSTANTS.KEYS.SYNC_ERROR,
      SettingsIO.CONSTANTS.KEYS.LAST_SYNC
    ]);

    // 清除 token
    await this.tokenManager.clearToken();
    
    console.log(`[SettingsIO][${getCurrentTimeString()}] 同步狀態已重置`);
  }

  // 登出
  async signOut() {
    await this.toggleAutoSync(false);
    await this.resetSyncStatus();
    console.log(`[SettingsIO][${getCurrentTimeString()}] 已登出`);
  }

  // 強制上傳本地設定到雲端（忽略時間戳比較）
  async forceUploadToCloud() {
    console.log(`[SettingsIO][${getCurrentTimeString()}] 開始強制上傳到雲端`);
    
    try {
      // 認證
      const authResult = await this.authenticateWithGoogle(true);
      if (!authResult.success) {
        throw new Error(authResult.error || '認證失敗');
      }

      const token = typeof authResult.token === 'object' ? authResult.token.token : authResult.token;
      
      // 獲取或創建檔案ID
      const fileId = await this.getOrCreateDriveFile(token);
      
      // 強制上傳本地設定
      await this.uploadSettings(token, fileId);
      
      console.log(`[SettingsIO][${getCurrentTimeString()}] 強制上傳完成`);
      return { success: true };
    } catch (error) {
      console.error(`[SettingsIO][${getCurrentTimeString()}] 強制上傳失敗:`, error);
      return { success: false, error: error.message };
    }
  }
}

// 輔助函數：獲取當前時間字符串
function getCurrentTimeString() {
  return new Date().toISOString();
}

// Token 管理器
class TokenManager {
  constructor() {
    this.cachedToken = null;
    this.tokenExpiry = null;
    this.authInProgress = false;
    this.pendingRequests = [];
    
    // 根據擴展 ID 動態選擇 client ID
    this.clientIdMap = {
      'fcnkggimjeffgcnpdmjgjgnoapfbn': '862665835661-leepued02022ei05bgb4jga850eglj0n.apps.googleusercontent.com', // A 電腦
      'hgelcpdcklajobdjoiplofieilaekgah': '862665835661-i3jvgnjlfhbvlruadp7v7v86si18p57i.apps.googleusercontent.com'  // B 電腦
    };
  }
  
  // 獲取當前擴展對應的 client ID
  getCurrentClientId() {
    const extensionId = chrome.runtime.id;
    const clientId = this.clientIdMap[extensionId];
    
    if (!clientId) {
      console.warn(`[TokenManager][${getCurrentTimeString()}] 未找到擴展 ID ${extensionId} 對應的 client ID，使用預設值`);
      return '862665835661-leepued02022ei05bgb4jga850eglj0n.apps.googleusercontent.com';
    }
    
    console.log(`[TokenManager][${getCurrentTimeString()}] 使用擴展 ${extensionId} 的 client ID: ${clientId}`);
    return clientId;
  }

  // 獲取 Token
  async getToken(interactive = false) {
    // 檢查快取的 token 是否仍然有效
    if (this.isTokenValid()) {
      return { success: true, token: this.cachedToken };
    }

    // 如果正在認證中，加入等待隊列
    if (this.authInProgress) {
      return new Promise((resolve, reject) => {
        this.pendingRequests.push({ resolve, reject });
      });
    }

    this.authInProgress = true;

    try {
      const clientId = this.getCurrentClientId();
      console.log(`[TokenManager][${getCurrentTimeString()}] 開始 OAuth 認證, interactive:`, interactive, 'clientId:', clientId);
      
      // 嘗試使用動態 Web Auth Flow
      if (interactive && clientId !== '862665835661-leepued02022ei05bgb4jga850eglj0n.apps.googleusercontent.com') {
        return await this.performWebAuthFlow(clientId);
      }
      
      // 使用傳統方式（manifest.json 配置）
      const tokenResult = await chrome.identity.getAuthToken({ 
        interactive: interactive,
        scopes: ['https://www.googleapis.com/auth/drive.appdata']
      });

      if (!tokenResult) {
        throw new Error('未獲取到認證 token');
      }

      // 提取實際的 token 字符串（Manifest V3 中可能返回對象）
      const actualToken = typeof tokenResult === 'object' ? tokenResult.token : tokenResult;
      
      if (!actualToken) {
        throw new Error('未獲取到有效的認證 token');
      }

      // 快取 token（設定 50 分鐘過期，Google token 通常 1 小時過期）
      this.cachedToken = actualToken;
      this.tokenExpiry = Date.now() + SettingsIO.CONSTANTS.TIMINGS.TOKEN_REFRESH_MARGIN;
      
      console.log(`[TokenManager][${getCurrentTimeString()}] 認證成功`);
      
      // 處理等待中的請求
      this.pendingRequests.forEach(({ resolve }) => {
        resolve({ success: true, token: actualToken });
      });
      this.pendingRequests = [];

      return { success: true, token: actualToken };

    } catch (error) {
      console.error(`[TokenManager][${getCurrentTimeString()}] 認證失敗:`, error);
      
      // 通知等待中的請求
      this.pendingRequests.forEach(({ reject }) => {
        reject(error);
      });
      this.pendingRequests = [];

      return { success: false, error: error.message };
    } finally {
      this.authInProgress = false;
    }
  }

  // 執行 Web Auth Flow
  async performWebAuthFlow(clientId) {
    try {
      const redirectUri = chrome.identity.getRedirectURL();
      const scopes = 'https://www.googleapis.com/auth/drive.appdata';
      
      const authUrl = `https://accounts.google.com/oauth/authorize?` +
        `client_id=${clientId}&` +
        `response_type=token&` +
        `redirect_uri=${encodeURIComponent(redirectUri)}&` +
        `scope=${encodeURIComponent(scopes)}`;

      console.log(`[TokenManager][${getCurrentTimeString()}] 使用 Web Auth Flow:`, authUrl);

      const responseUrl = await chrome.identity.launchWebAuthFlow({
        url: authUrl,
        interactive: true
      });

      if (!responseUrl) {
        throw new Error('Web Auth Flow 失敗');
      }

      // 從回應 URL 中提取 token
      const urlParams = new URLSearchParams(responseUrl.split('#')[1]);
      const accessToken = urlParams.get('access_token');

      if (!accessToken) {
        throw new Error('未從回應中獲取到 access token');
      }

      // 快取 token
      this.cachedToken = accessToken;
      this.tokenExpiry = Date.now() + SettingsIO.CONSTANTS.TIMINGS.TOKEN_REFRESH_MARGIN;

      console.log(`[TokenManager][${getCurrentTimeString()}] Web Auth Flow 認證成功`);

      // 處理等待中的請求
      this.pendingRequests.forEach(({ resolve }) => {
        resolve({ success: true, token: accessToken });
      });
      this.pendingRequests = [];

      return { success: true, token: accessToken };

    } catch (error) {
      console.error(`[TokenManager][${getCurrentTimeString()}] Web Auth Flow 失敗:`, error);
      
      // 通知等待中的請求
      this.pendingRequests.forEach(({ reject }) => {
        reject(error);
      });
      this.pendingRequests = [];

      return { success: false, error: error.message };
    }
  }

  // 檢查 token 是否有效
  isTokenValid() {
    return this.cachedToken && 
           this.tokenExpiry && 
           Date.now() < this.tokenExpiry;
  }

  // 清除 token
  async clearToken() {
    this.cachedToken = null;
    this.tokenExpiry = null;
    
    try {
      // 撤銷 Chrome 的認證 token
      await chrome.identity.clearAllCachedAuthTokens();
      console.log(`[TokenManager][${getCurrentTimeString()}] Token 已清除`);
    } catch (error) {
              console.warn(`[TokenManager][${getCurrentTimeString()}] 清除 token 失敗:`, error);
    }
  }
}

// 暴露到全局
window.SettingsIO = SettingsIO;
window.TokenManager = TokenManager; 