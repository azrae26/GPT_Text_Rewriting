/**
 * settings-io.js - 設定同步和雲端儲存管理
 * 功能：OAuth2 認證、Google Drive 同步、設定衝突處理、多分頁協調
 * 職責：管理雲端同步邏輯、處理本地時間戳記異常、固定檔名檔案發現
 * 依賴：Chrome Extensions API、Google Drive API v3、GlobalSettings
 * 更新：2025-06-08 修復時間戳同步問題、排除UI狀態避免不必要同步、移除過時的檔案ID共享機制
 *       修復內部更新檢測邏輯缺陷、修正時間戳優先級邏輯、解決同步循環問題
 *       2025-06-09 修復時序同步問題：上傳成功後同步本地時間戳至雲端檔案時間，避免誤判為雲端更新
 *       修復上傳內容時間戳不一致問題：確保上傳的設定內容包含正確的時間戳，避免下載時發現差異
 *       修復雙重時間戳問題：統一使用檔案元數據時間戳進行比較，避免內容時間戳與檔案時間戳不一致
 *       2025-07-14 🔧 重大修復：實現真正的單例模式，解決多實例重複執行問題
 *       修復多個環境創建重複實例導致的4倍重複執行、重複上傳、重複訊號處理問題
 */

class SettingsIO {
  // 靜態屬性用於單例模式
  static _instance = null;
  static _isCreating = false;

  static CONSTANTS = {
    DRIVE_API_BASE: 'https://www.googleapis.com/drive/v3',
    UPLOAD_API_BASE: 'https://www.googleapis.com/upload/drive/v3',
    SETTINGS_FILENAME: 'gpt-text-rewriting-settings.json',
    
    TIMINGS: {
      UPLOAD_DEBOUNCE: 10000,
      DEFAULT_SYNC_INTERVAL: 2*60*1000, // 預設每2分鐘同步一次
      TOKEN_REFRESH_MARGIN: 600000,
      LOCAL_RECENT_THRESHOLD: 5000,
      COMPETITION_DELAY: 100,
      AUTO_EXPORT_DELAY: 1800000,
      RETRY_DELAY: 1800000
    },
    
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

  /**
   * 單例模式：獲取或創建 SettingsIO 實例
   * @returns {SettingsIO} 唯一的 SettingsIO 實例
   */
  static getInstance() {
    if (SettingsIO._instance) {
      return SettingsIO._instance;
    }
    
    // 防止重複創建
    if (SettingsIO._isCreating) {
      LogUtils.warn('⚠️ 檢測到重複創建實例的嘗試，返回現有實例');
      return SettingsIO._instance;
    }
    
    SettingsIO._isCreating = true;
    SettingsIO._instance = new SettingsIO();
    SettingsIO._isCreating = false;
    
    LogUtils.important('✅ 創建唯一的 SettingsIO 實例');
    return SettingsIO._instance;
  }

  /**
   * 檢查是否已有實例存在
   * @returns {boolean}
   */
  static hasInstance() {
    return SettingsIO._instance !== null;
  }

  /**
   * 重置實例（主要用於測試）
   */
  static resetInstance() {
    if (SettingsIO._instance) {
      LogUtils.warn('🔄 重置 SettingsIO 實例');
      SettingsIO._instance = null;
    }
  }

  constructor() {
    // 單例模式：防止直接實例化
    if (SettingsIO._instance && !SettingsIO._isCreating) {
      LogUtils.warn('⚠️ 嘗試直接創建 SettingsIO 實例，返回現有單例實例');
      return SettingsIO._instance;
    }
    
    // 首次創建或通過 getInstance 創建
    this.syncInProgress = false;
    this.uploadInProgress = false;
    this.tokenManager = new TokenManager();
    this.syncIntervalId = null;
    this.uploadTimeoutId = null;
    this.lastModifiedTimeoutId = null; // 時間戳更新防抖動計時器
    this.signalSyncTimeoutId = null; // 訊號驅動同步計時器
    this.isInitialized = false;
    this.localChangeDetected = false; // 本地修改保護標記
    this.isInternalSyncUpdate = false; // 同步系統內部更新標記
    this.lastSentSignalTimestamp = null; // 記住自己發送的訊號時間戳
    
    this.handleStorageChange = this.handleStorageChange.bind(this);
    this.performSync = this.performSync.bind(this);
    this.updateLastModifiedDebounced = this.updateLastModifiedDebounced.bind(this);

    // 記錄實例環境信息
    const environment = this._detectEnvironment();
    LogUtils.important(`🏗️ SettingsIO 實例初始化 (環境: ${environment})`);
  }

  /**
   * 檢測當前運行環境
   * @private
   */
  _detectEnvironment() {
    if (typeof window !== 'undefined') {
      if (window.location && window.location.href.includes('popup.html')) {
        return 'popup';
      } else if (window.location && window.location.href.includes('chrome-extension://')) {
        return 'extension-page';
      } else {
        return 'content-script';
      }
    } else if (typeof self !== 'undefined') {
      return 'service-worker';
    } else {
      return 'unknown';
    }
  }

  async init() {
    if (this.isInitialized) return;

    LogUtils.log('初始化設定同步系統');
    
    try {
      // 一次性遷移：將 local storage 中的 syncInterval 遷移到 sync storage
      await this.migrateSyncIntervalToSyncStorage();
      
      this.setupStorageListener();
      
      const syncEnabled = await this.isSyncEnabled();
      if (syncEnabled) {
        // 改為訊號驅動，不再啟動定期同步
        LogUtils.log('自動同步已啟用，使用訊號驅動模式');
        // 不再啟動定期同步：
        // if (typeof window === 'undefined' && typeof self !== 'undefined') {
        //   LogUtils.log('Service Worker 環境：定期同步由 BackgroundSync 管理');
        // } else {
        //   this.startPeriodicSync();
        //   LogUtils.log('Popup 環境：啟動定期同步');
        // }
      }
      
      this.isInitialized = true;
      LogUtils.log('設定同步系統初始化完成');
    } catch (error) {
      LogUtils.error('初始化失敗:', error);
    }
  }

  async migrateSyncIntervalToSyncStorage() {
    try {
      // 檢查是否已經完成遷移
      const migrationFlag = await chrome.storage.local.get(['syncIntervalMigrated']);
      if (migrationFlag.syncIntervalMigrated) {
        return; // 已經遷移過，跳過
      }

      // 從 local storage 讀取現有的 syncInterval
      const localResult = await chrome.storage.local.get(['syncInterval']);
      if (localResult.syncInterval !== undefined) {
        LogUtils.log(`遷移同步間隔設定：${localResult.syncInterval} 分鐘 (local → sync)`);
        
        // 檢查 sync storage 是否已有值
        const syncResult = await chrome.storage.sync.get(['syncInterval']);
        if (syncResult.syncInterval === undefined) {
          // 只有在 sync storage 沒有值時才遷移
          await chrome.storage.sync.set({ syncInterval: localResult.syncInterval });
          LogUtils.log('同步間隔已遷移到 sync storage');
        } else {
          LogUtils.warn('sync storage 已有同步間隔設定，保持現有值');
        }
        
        // 清除 local storage 中的舊值
        await chrome.storage.local.remove(['syncInterval']);
        LogUtils.log('已清除 local storage 中的舊同步間隔設定');
      }
      
      // 設置遷移標記
      await chrome.storage.local.set({ syncIntervalMigrated: true });
      
    } catch (error) {
      LogUtils.error('同步間隔遷移失敗:', error);
    }
  }

  setupStorageListener() {
    chrome.storage.local.onChanged.addListener(this.handleStorageChange);
    chrome.storage.sync.onChanged.addListener(this.handleStorageChange);
    
    chrome.storage.sync.onChanged.addListener(this.handleCloudUpdateSignal.bind(this));
  }

  async handleStorageChange(changes, areaName) {
    const ignoredKeys = [
      SettingsIO.CONSTANTS.KEYS.LAST_SYNC,
      SettingsIO.CONSTANTS.KEYS.SYNC_STATUS,
      SettingsIO.CONSTANTS.KEYS.SETTINGS_HASH,
      SettingsIO.CONSTANTS.KEYS.SYNC_ERROR,
      'syncDebugLogs',
      'stockCrawlerState',
      'lastModified',  // 避免時間戳更新造成的連鎖反應
      'cloudUpdateSignal'  // 排除雲端更新訊號，避免觸發新的上傳
    ];

    const relevantChanges = Object.keys(changes).filter(key => 
      !ignoredKeys.includes(key) && 
      this.isSettingsKey(key) &&
      !this.shouldExcludeFromSync(key)
    );

    if (relevantChanges.length === 0) return;

    LogUtils.log('偵測到設定變更:', relevantChanges);

    // 檢查是否是由同步系統自己觸發的變更（比如從雲端下載後的設定更新）
    if (this.isInternalSyncUpdate) {
      LogUtils.log(`✅ 忽略同步系統內部更新 (變更: ${relevantChanges.join(', ')})`);
      return;
    }

    // 使用防抖動機制更新時間戳，避免頻繁更新
    this.updateLastModifiedDebounced();
    

    
    // 立即設置本地修改保護標記
    this.localChangeDetected = true;
    
    // 如果有同步正在進行，記錄警告
    if (this.syncInProgress) {
      LogUtils.important('🚨 檢測到本地修改，已設置保護標記');
    }
    
    this.scheduleUpload();
  }

  // 統一的排除邏輯判斷（使用 KeyClassifier）
  shouldExcludeFromSync(key, context = 'comparison') {
    const purposeMap = {
      'cloud': 'cloudSync',
      'comparison': 'comparison',
      'export': 'export'
    };
    
    const purpose = purposeMap[context] || 'comparison';
    return KeyClassifier.shouldExclude(key, purpose);
  }

  isSettingsKey(key) {
    return KeyClassifier.isSettingsKey(key);
  }

  async updateLastModifiedTime() {
    await chrome.storage.local.set({ lastModified: Date.now() });
  }

  // 防抖動更新時間戳，避免頻繁更新造成連鎖反應
  updateLastModifiedDebounced() {
    if (this.lastModifiedTimeoutId) {
      clearTimeout(this.lastModifiedTimeoutId);
    }
    
    this.lastModifiedTimeoutId = setTimeout(async () => {
      const newTimestamp = Date.now();
      await chrome.storage.local.set({ lastModified: newTimestamp });
      LogUtils.log(`🕐 防抖動更新時間戳: ${new Date(newTimestamp).toISOString()}`);
    }, 500); // 500ms 防抖動
  }

  scheduleUpload() {
    if (this.uploadTimeoutId) clearTimeout(this.uploadTimeoutId);

    this.uploadTimeoutId = setTimeout(async () => {
      if (await this.isSyncEnabled()) {
        await this.uploadSettings();
      }
    }, SettingsIO.CONSTANTS.TIMINGS.UPLOAD_DEBOUNCE);
  }

  async authenticateWithGoogle(interactive = false) {
    const authResult = await this.tokenManager.getToken(interactive);
    
    // 🔧 修復：如果是互動式認證且成功，觸發狀態變化通知
    if (interactive && authResult.success) {
      LogUtils.log('✅ 互動式認證成功，通知狀態管理器');
      await this._notifySyncStatusChange();
    }
    
    return authResult;
  }

  async manualSync() {
    LogUtils.log('開始手動同步');
    
    try {
      const authResult = await this.authenticateWithGoogle(true);
      if (!authResult.success) {
        throw new Error(authResult.error || '認證失敗');
      }

      const actualToken = typeof authResult.token === 'object' ? authResult.token.token : authResult.token;
      
      // 先獲取檔案ID並顯示
      const fileId = await this.getOrCreateDriveFile(actualToken);
      LogUtils.log(`🆔 手動同步使用檔案ID: ${fileId}`);
      
      await this.performSync(actualToken);
      
      LogUtils.log(`手動同步完成 (檔案ID: ${fileId})`);
      return { success: true };
    } catch (error) {
      LogUtils.error('手動同步失敗:', error);
      await this.setSyncError(error.message);
      return { success: false, error: error.message };
    }
  }

  async toggleAutoSync(enabled) {
    LogUtils.log('切換自動同步:', enabled);
    
    await chrome.storage.local.set({
      [SettingsIO.CONSTANTS.KEYS.SYNC_ENABLED]: enabled
    });

    if (enabled) {
      // 聊明解法：第一次開啟同步，直接強制下載雲端設定
      LogUtils.log('🔽 首次開啟同步，強制下載雲端設定');
      const syncResult = await this.forceDownloadFromCloud();
      if (syncResult.success) {
        // 改為訊號驅動，不再啟動定期同步
        LogUtils.log('自動同步已啟用，使用訊號驅動模式');
        // 不再啟動定期同步：
        // if (typeof window === 'undefined' && typeof self !== 'undefined') {
        //   LogUtils.log('Service Worker 環境：定期同步由 BackgroundSync 管理');
        // } else {
        //   await this.startPeriodicSync();
        // }
      }
    } else {
      this.stopPeriodicSync();
    }

    // 通知同步狀態管理器啟用/禁用狀態變化
    await this._notifySyncStatusChange();

    return enabled;
  }

  async startPeriodicSync() {
    this.stopPeriodicSync();
    
    const intervalMinutes = await this.getSyncInterval();
    const intervalMs = intervalMinutes * 60 * 1000;
    
    this.syncIntervalId = setInterval(async () => {
      if (await this.isSyncEnabled()) {
        await this.performSync();
      }
    }, intervalMs);
    
    LogUtils.log(`定期同步已啟動，間隔 ${intervalMinutes} 分鐘`);
  }

  stopPeriodicSync() {
    if (this.syncIntervalId) {
      clearInterval(this.syncIntervalId);
      this.syncIntervalId = null;
      LogUtils.log('定期同步已停止');
    }
  }

  async isSyncEnabled() {
    const result = await chrome.storage.local.get([SettingsIO.CONSTANTS.KEYS.SYNC_ENABLED]);
    return result[SettingsIO.CONSTANTS.KEYS.SYNC_ENABLED] || false;
  }

  async getSyncInterval() {
    const result = await chrome.storage.sync.get(['syncInterval']);
    return result.syncInterval || 2; // 預設2分鐘
  }

  async setSyncInterval(intervalMinutes) {
    await chrome.storage.sync.set({ syncInterval: intervalMinutes });
    
    // 修復：在訊號驅動模式下，不再自動啟動定期同步
    // 同步間隔只用於訊號驅動的延遲時間，不啟動定期計時器
    LogUtils.log(`同步間隔已更新為 ${intervalMinutes} 分鐘 (訊號驅動模式)`);
    
    // 移除舊邏輯：不再自動啟動定期同步
    // if (await this.isSyncEnabled()) {
    //   this.startPeriodicSync();
    // }
  }

  async performSync(token = null) {
    if (this.syncInProgress) {
      LogUtils.log('同步正在進行中，跳過');
      return;
    }

    this.syncInProgress = true;
    
    try {
      LogUtils.log('開始執行同步');
      
      // 優先檢查是否有本地修改保護標記
      if (this.localChangeDetected) {
        LogUtils.log('🛡️ 檢測到本地修改保護，直接上傳到雲端');
        
        if (!token) {
          const authResult = await this.authenticateWithGoogle(false);
          if (!authResult.success) {
            LogUtils.log('認證失敗，跳過同步');
            return;
          }
          token = authResult.token;
        }

        if (!token || typeof token !== 'string') {
          throw new Error('無效的認證 token');
        }

        const fileId = await this.getOrCreateDriveFile(token);
        LogUtils.log(`🆔 使用檔案ID進行上傳: ${fileId}`);
        await this.uploadSettings(token, fileId);
        this.localChangeDetected = false; // 重置標記
        await this.updateSyncStatus('success');
        return;
      }
      
      if (!token) {
        const authResult = await this.authenticateWithGoogle(false);
        if (!authResult.success) {
          LogUtils.log('認證失敗，跳過同步');
          return;
        }
        token = authResult.token;
      }

      if (!token || typeof token !== 'string') {
        throw new Error('無效的認證 token');
      }

      const fileId = await this.getOrCreateDriveFile(token);
      LogUtils.log(`🆔 使用檔案ID進行同步: ${fileId}`);
      
      // 修復雙重時間戳問題：先獲取檔案元數據，使用檔案時間戳作為標準
      const fileMetadata = await this.getDriveFileMetadata(token, fileId);
      const driveFileModifiedTime = new Date(fileMetadata.modifiedTime).getTime();
      LogUtils.log(`📊 雲端檔案時間戳: ${fileMetadata.modifiedTime} (${driveFileModifiedTime})`);
      
      const driveSettings = await this.downloadSettings(token, fileId);
      const localSettings = await GlobalSettings.getAllSettings();
      
      const { needsReload, needsUpload, mergedSettings, changedKeys } = await this.compareAndMergeSettings(
        localSettings, 
        driveSettings,
        driveFileModifiedTime  // 傳遞檔案時間戳
      );
      
      if (needsReload) {
        LogUtils.log('更新本地設定並重新載入');
        LogUtils.log(`🔄 準備保存設定，時間戳: ${mergedSettings.lastModified}`);
        
        this.isInternalSyncUpdate = true; // 標記為內部更新
        await this.saveSettings(mergedSettings);
        
        if (typeof location !== 'undefined' && location.reload) {
          location.reload();
        } else {
          LogUtils.log('Service Worker 環境：設定已更新');
          
          // 先重置內部更新標記，再發送消息
          setTimeout(async () => {
            this.isInternalSyncUpdate = false;
            LogUtils.log('🔓 內部更新標記已重置');
            
            // 發送消息到 content scripts，確保標記已重置
            await this._sendMessage({
              action: 'settingsUpdated',
              data: { reason: 'cloudSync', timestamp: Date.now(), changedKeys: changedKeys }
            });
          }, 100); // 縮短延遲時間到 100ms，確保快速響應
        }
      } else if (needsUpload) {
        LogUtils.log('本地設定較新，上傳到雲端');
        LogUtils.log(`🆔 使用檔案ID進行上傳: ${fileId}`);
        await this.uploadSettings(token, fileId);
      } else {
        LogUtils.log('設定已同步，無需操作');
      }
      
      await this.updateSyncStatus('success');
      
      // UI一致性檢查：確保UI內容與存儲內容一致
      await this.performUIConsistencyCheck();
      
    } catch (error) {
      LogUtils.error('同步失敗:', error);
      await this.setSyncError(error.message);
    } finally {
      this.syncInProgress = false;
    }
  }

  /**
   * 執行UI一致性檢查
   * 檢查UI顯示的內容是否與存儲中的內容一致，如果不一致則觸發更新
   */
  async performUIConsistencyCheck() {
    try {
      LogUtils.log('🔍 開始UI一致性檢查...');
      
      // 延遲一點時間確保之前的UI更新已完成
      await new Promise(resolve => setTimeout(resolve, 200));
      
      // 發送檢查消息到content scripts
      await this._sendMessage({
        action: 'checkUIConsistency',
        data: { 
          reason: 'syncComplete', 
          timestamp: Date.now(),
          description: '同步完成後的UI一致性檢查'
        }
      });
      
    } catch (error) {
      LogUtils.warn('⚠️ UI一致性檢查失敗:', error.message);
    }
  }

  async compareAndMergeSettings(localSettings, driveSettings, driveFileModifiedTime = null) {
    const localLastModified = localSettings.lastModified || 0;
    
    // 修復雙重時間戳問題：優先使用檔案元數據時間戳，而不是內容中的時間戳
    const actualDriveModifiedTime = driveFileModifiedTime || driveSettings.lastModified || 0;
    const isLocalRecent = (Date.now() - localLastModified) < SettingsIO.CONSTANTS.TIMINGS.LOCAL_RECENT_THRESHOLD;
    
    LogUtils.log(`比較時間戳記: 本地=${new Date(localLastModified).toISOString()}, 雲端檔案=${new Date(actualDriveModifiedTime).toISOString()}, 本地最近=${isLocalRecent}`);
    
    // 特殊情況：本地時間戳無效
    if (localLastModified <= 0 && actualDriveModifiedTime > 0) {
      LogUtils.log('本地時間戳無效，強制使用雲端版本');
      
      return {
        needsReload: true,
        needsUpload: false,
        mergedSettings: { ...driveSettings, lastModified: actualDriveModifiedTime },
        changedKeys: Object.keys(driveSettings).filter(key => key !== 'lastModified')
      };
    }

    // 比較實際內容 - 詳細差異分析
    const localContent = this.filterSettingsForComparison(localSettings);
    const driveContent = this.filterSettingsForComparison(driveSettings);
    
    // 記錄變化的鍵值
    const changedKeys = new Set();
    
    // 詳細差異分析
    const localKeys = Object.keys(localContent).sort();
    const driveKeys = Object.keys(driveContent).sort();
    
    // 找出具體的差異並組合成一條詳細的調試信息
    const differences = [];
    
    // 1. 鍵值差異
    const missingInDrive = localKeys.filter(key => !driveKeys.includes(key));
    const missingInLocal = driveKeys.filter(key => !localKeys.includes(key));
    
    if (missingInDrive.length > 0) {
      differences.push(`本地多出: [${missingInDrive.join(', ')}]`);
      missingInDrive.forEach(key => changedKeys.add(key));
    }
    if (missingInLocal.length > 0) {
      differences.push(`雲端多出: [${missingInLocal.join(', ')}]`);
      missingInLocal.forEach(key => changedKeys.add(key));
    }
    
    // 2. 值差異（只列出實際不同的）
    const commonKeys = localKeys.filter(key => driveKeys.includes(key));
    const valueDetails = [];
    
    for (const key of commonKeys) {
      if (!this.deepEqual(localContent[key], driveContent[key])) {
        changedKeys.add(key);
        const localValue = localContent[key];
        const driveValue = driveContent[key];
        
        // 特別關注替換規則的差異
        if (key.includes('replace') || key.includes('Replace')) {
          const localArray = Array.isArray(localValue) ? localValue : [];
          const driveArray = Array.isArray(driveValue) ? driveValue : [];
          valueDetails.push(`${key}: 本地${localArray.length}條vs雲端${driveArray.length}條`);
        } else if (Array.isArray(localValue) && Array.isArray(driveValue)) {
          valueDetails.push(`${key}: 本地${localValue.length}項vs雲端${driveValue.length}項`);
        } else {
          const localStr = typeof localValue === 'string' ? `"${localValue.substring(0, 50)}${localValue.length > 50 ? '...' : ''}"` : localValue;
          const driveStr = typeof driveValue === 'string' ? `"${driveValue.substring(0, 50)}${driveValue.length > 50 ? '...' : ''}"` : driveValue;
          valueDetails.push(`${key}: 本地=${localStr} vs 雲端=${driveStr}`);
        }
      }
    }
    
    if (valueDetails.length > 0) {
      differences.push(`值差異: ${valueDetails.join('; ')}`);
    }
    
    // 組合成一條完整的差異調試信息
    if (differences.length > 0) {
      const fullDiffMessage = `🔍 設定差異詳情: ${differences.join(' | ')}`;
      LogUtils.log(fullDiffMessage);
    } else {
      LogUtils.log('✅ 設定內容完全相同');
    }
    
    const hasContentDifference = !this.deepEqual(localContent, driveContent);
    
    if (!hasContentDifference) {
      LogUtils.log('✅ 設定內容相同（修復成功），跳過同步');
      return { needsReload: false, needsUpload: false, mergedSettings: localSettings, changedKeys: [] };
    }

    // 修正：時間戳相同時的處理邏輯
    if (actualDriveModifiedTime === localLastModified) {
      LogUtils.warn('⚠️ 時間戳相同但內容有差異，這可能是過濾邏輯問題');
      
      // 修復：時間戳相同時不應該有內容差異，直接跳過避免循環
      // 如果真的有差異，可能是過濾邏輯的問題，需要進一步調試
      LogUtils.log('🔧 為避免同步循環，跳過此次操作');
      
      return {
        needsReload: false,
        needsUpload: false,
        mergedSettings: localSettings,
        changedKeys: []
      };
    }

    const useCloudVersion = !isLocalRecent && actualDriveModifiedTime > localLastModified;
    
    LogUtils.log(`採用${useCloudVersion ? '雲端' : '本地'}版本`);
    
    if (useCloudVersion) {
      return {
        needsReload: true,
        needsUpload: false,
        mergedSettings: { ...driveSettings, lastModified: actualDriveModifiedTime },
        changedKeys: Array.from(changedKeys)
      };
    } else {
      return {
        needsReload: false,
        needsUpload: true,
        mergedSettings: localSettings,
        changedKeys: Array.from(changedKeys)
      };
    }
  }

  // 過濾設定用於比較（移除時間戳和不會被同步的內容）
  filterSettingsForComparison(settings) {
    return KeyClassifier.filterSettings(settings, 'comparison');
  }

  // 簡化的調試信息發送（已停用）
  // sendSyncDebug(message, action, reason) {
  //   try {
  //     chrome.runtime.sendMessage({
  //       action: 'syncDebug',
  //       type: 'sync_result',
  //       message,
  //       data: { action, reason }
  //     }).catch(() => {});
  //   } catch (e) {}
  // }

  async uploadSettings(token = null, fileId = null) {
    if (this.uploadInProgress) {
      LogUtils.log('上傳正在進行中，跳過');
      return;
    }

    this.uploadInProgress = true;
    
    try {
      LogUtils.log('開始上傳設定');
      
      if (!token) {
        const authResult = await this.authenticateWithGoogle(false);
        if (!authResult.success) {
          LogUtils.log('認證失敗，跳過上傳');
          return;
        }
        token = authResult.token;
      }

      if (!fileId) {
        fileId = await this.getOrCreateDriveFile(token);
      }

      LogUtils.log(`正在上傳到檔案ID: ${fileId}`);

      const allSettings = await GlobalSettings.getAllSettings();
      const settings = this.cleanSettingsForUpload(allSettings);
      
      // 修復時序同步問題：使用當前時間作為上傳時間戳，確保與雲端檔案修改時間一致
      const uploadTimestamp = Date.now();
      settings.lastModified = uploadTimestamp;
      LogUtils.log(`設置上傳時間戳: ${new Date(uploadTimestamp).toISOString()}`);
      
      const { cloudModifiedTime } = await this.updateDriveFile(token, fileId, settings);
      
      // 將雲端檔案的修改時間同步到本地（通常與上傳時間戳接近）
      if (cloudModifiedTime && !isNaN(cloudModifiedTime)) {
        LogUtils.log(`同步雲端時間戳：${cloudModifiedTime} (${new Date(cloudModifiedTime).toISOString()})`);
        await chrome.storage.local.set({ lastModified: cloudModifiedTime });
        LogUtils.log('本地時間戳已同步至雲端檔案時間');
        
        // 關鍵修復：如果雲端時間戳與上傳時間戳不同，需要重新上傳確保檔案內容一致
        if (Math.abs(cloudModifiedTime - uploadTimestamp) > 1000) { // 差異超過1秒
          LogUtils.important('🔄 檢測到時間戳差異，重新上傳確保一致性');
          LogUtils.log(`上傳時間戳: ${uploadTimestamp}, 雲端時間戳: ${cloudModifiedTime}`);
          
          // 更新設定內容的時間戳並重新上傳
          settings.lastModified = cloudModifiedTime;
          await this.updateDriveFile(token, fileId, settings);
          LogUtils.log('檔案內容時間戳已更新為雲端時間');
        }
      } else {
        // 如果無法獲取雲端時間戳，至少確保本地使用上傳時間戳
        LogUtils.warn('無法獲取雲端時間戳，使用上傳時間戳');
        await chrome.storage.local.set({ lastModified: uploadTimestamp });
      }
      
      LogUtils.log(`設定上傳完成 (檔案ID: ${fileId})`);
      
      // 發送雲端更新訊號給其他設備
      await this.sendCloudUpdateSignal();
      
    } catch (error) {
      LogUtils.error('上傳設定失敗:', error);
      await this.setSyncError(error.message);
    } finally {
      this.uploadInProgress = false;
      this.localChangeDetected = false; // 修復：重置本地修改保護標記，避免重複上傳
    }
  }

  // 清理設定用於雲端上傳
  cleanSettingsForUpload(settings) {
    return KeyClassifier.filterSettings(settings, 'cloudSync');
  }

  async getOrCreateDriveFile(token) {
    const localResult = await chrome.storage.local.get([SettingsIO.CONSTANTS.KEYS.DRIVE_FILE_ID]);
    let fileId = localResult[SettingsIO.CONSTANTS.KEYS.DRIVE_FILE_ID];
    
    if (fileId) {
      try {
        await this.getDriveFileMetadata(token, fileId);
        return fileId;
      } catch (error) {
        LogUtils.log('儲存的檔案 ID 無效，重新搜尋');
        fileId = null;
      }
    }

    // 如果本地沒有檔案ID，直接搜尋現有檔案
    // 如果還是沒有檔案ID，搜尋現有檔案
    try {
      LogUtils.log('開始搜尋現有雲端檔案...');
      fileId = await this.searchExistingDriveFile(token);
      
      if (fileId) {
        LogUtils.log(`搜尋成功，找到檔案ID: ${fileId}`);
      } else {
        LogUtils.log('搜尋失敗，未找到現有檔案');
      }
    } catch (error) {
      LogUtils.error('搜尋檔案時發生錯誤:', error);
    }

    if (!fileId) {
      LogUtils.log('創建新檔案');
      const allSettings = await GlobalSettings.getAllSettings();
      const settings = this.cleanSettingsForUpload(allSettings);
      
      // 修復時序同步問題：使用當前時間作為創建時間戳
      const createTimestamp = Date.now();
      settings.lastModified = createTimestamp;
      LogUtils.log(`設置新檔案時間戳: ${new Date(createTimestamp).toISOString()}`);
      
      const { fileId: newFileId, cloudModifiedTime } = await this.createDriveFile(token, settings);
      fileId = newFileId;
      
      // 同步新創建檔案的時間戳
      if (cloudModifiedTime && !isNaN(cloudModifiedTime)) {
        LogUtils.log(`同步新檔案雲端時間戳：${cloudModifiedTime} (${new Date(cloudModifiedTime).toISOString()})`);
        await chrome.storage.local.set({ lastModified: cloudModifiedTime });
        LogUtils.log('新檔案時間戳已同步');
        
        // 關鍵修復：如果雲端時間戳與創建時間戳不同，需要重新上傳確保檔案內容一致
        if (Math.abs(cloudModifiedTime - createTimestamp) > 1000) { // 差異超過1秒
          LogUtils.important('🔄 新檔案檢測到時間戳差異，重新上傳確保一致性');
          LogUtils.log(`創建時間戳: ${createTimestamp}, 雲端時間戳: ${cloudModifiedTime}`);
          
          // 更新設定內容的時間戳並重新上傳
          settings.lastModified = cloudModifiedTime;
          await this.updateDriveFile(token, fileId, settings);
          LogUtils.log('新檔案內容時間戳已更新為雲端時間');
        }
      } else {
        LogUtils.warn('無法獲取新檔案雲端時間戳，使用創建時間戳');
        await chrome.storage.local.set({ lastModified: createTimestamp });
      }
    }

    // 保存檔案ID到本地緩存
    await chrome.storage.local.set({
      [SettingsIO.CONSTANTS.KEYS.DRIVE_FILE_ID]: fileId
    });
    
    LogUtils.log(`檔案ID已保存到本地緩存: ${fileId}`);

    return fileId;
  }

  async createDriveFile(token, settings) {
    LogUtils.log('正在創建新的雲端檔案...');
    
    // 使用固定檔名創建在根目錄中
    const metadata = {
      name: SettingsIO.CONSTANTS.SETTINGS_FILENAME
    };

    const form = new FormData();
    form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
    form.append('file', new Blob([JSON.stringify(settings, null, 2)], { type: 'application/json' }));

    const response = await fetch(`${SettingsIO.CONSTANTS.UPLOAD_API_BASE}/files?uploadType=multipart`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` },
      body: form
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`創建檔案失敗: ${response.status} - ${error}`);
    }

    const result = await response.json();
    let cloudModifiedTime = null;
    
    try {
      if (result.modifiedTime) {
        cloudModifiedTime = new Date(result.modifiedTime).getTime();
        LogUtils.log(`新檔案修改時間: ${result.modifiedTime}`);
      } else {
        LogUtils.warn('新檔案沒有修改時間，使用當前時間');
        cloudModifiedTime = Date.now();
      }
    } catch (timeError) {
      LogUtils.warn('解析新檔案修改時間失敗:', timeError.message);
      cloudModifiedTime = Date.now();
    }
    
    LogUtils.log(`新檔案創建成功: ${result.id}`);
    LogUtils.log(`設定檔案已保存到您的Google Drive根目錄，檔案名稱: ${SettingsIO.CONSTANTS.SETTINGS_FILENAME}`);
    
    return { fileId: result.id, cloudModifiedTime };
  }

  async updateDriveFile(token, fileId, settings) {
    LogUtils.log(`正在更新檔案ID: ${fileId}`);
    
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

    // 獲取更新後的檔案元數據以取得精確的修改時間
    const fileMetadata = await this.getDriveFileMetadata(token, fileId);
    let cloudModifiedTime = null;
    
    try {
      if (fileMetadata.modifiedTime) {
        cloudModifiedTime = new Date(fileMetadata.modifiedTime).getTime();
        LogUtils.log(`雲端檔案修改時間: ${fileMetadata.modifiedTime}`);
      } else {
        LogUtils.warn('無法獲取雲端檔案修改時間，使用當前時間');
        cloudModifiedTime = Date.now();
      }
    } catch (timeError) {
      LogUtils.warn('解析雲端修改時間失敗:', timeError.message);
      cloudModifiedTime = Date.now();
    }
    
    LogUtils.log(`檔案更新成功: ${fileId}`);
    
    return { cloudModifiedTime };
  }

  async downloadSettings(token, fileId) {
    LogUtils.log(`正在從檔案ID下載設定: ${fileId}`);
    
    const response = await fetch(`${SettingsIO.CONSTANTS.DRIVE_API_BASE}/files/${fileId}?alt=media`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    if (!response.ok) {
      throw new Error(`下載設定失敗: ${response.status}`);
    }

    const settings = await response.json();
    LogUtils.log(`設定下載完成 (檔案ID: ${fileId})`);
    return settings;
  }

  async getDriveFileMetadata(token, fileId) {
    // 明確指定要返回的字段，包括 modifiedTime
    const response = await fetch(`${SettingsIO.CONSTANTS.DRIVE_API_BASE}/files/${fileId}?fields=id,name,modifiedTime,size`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    if (!response.ok) {
      throw new Error(`獲取檔案資訊失敗: ${response.status}`);
    }

    const metadata = await response.json();
    LogUtils.log('檔案元數據:', {
      id: metadata.id,
      name: metadata.name,
      modifiedTime: metadata.modifiedTime,
      size: metadata.size
    });
    
    return metadata;
  }

  async saveSettings(settings) {
    const syncSettings = {};
    const localSettings = {};

    Object.entries(settings).forEach(([key, value]) => {
      if (GlobalSettings.isLocalStorageKey && GlobalSettings.isLocalStorageKey(key)) {
        localSettings[key] = value;
      } else {
        syncSettings[key] = value;
      }
    });

    // 特殊處理：如果 lastModified 被分配到 local storage，要清理 sync storage 中的舊值
    if ('lastModified' in localSettings) {
      try {
        await chrome.storage.sync.remove(['lastModified']);
        LogUtils.log('已清理 sync storage 中的舊時間戳');
      } catch (error) {
        LogUtils.warn('清理 sync storage 時間戳失敗:', error);
      }
    }

    if (Object.keys(syncSettings).length > 0) {
      await chrome.storage.sync.set(syncSettings);
    }
    
    if (Object.keys(localSettings).length > 0) {
      await chrome.storage.local.set(localSettings);
    }
  }

  async updateSyncStatus(status, error = null) {
    const statusData = {
      [SettingsIO.CONSTANTS.KEYS.SYNC_STATUS]: status,
      [SettingsIO.CONSTANTS.KEYS.LAST_SYNC]: Date.now()
    };

    // 🔧 修復：如果同步成功，確保 SYNC_ENABLED 狀態正確
    // 因為能夠成功同步說明同步功能是啟用的
    if (status === 'success') {
      statusData[SettingsIO.CONSTANTS.KEYS.SYNC_ENABLED] = true;
      LogUtils.log('✅ 同步成功，確保 SYNC_ENABLED 狀態為 true');
    }

    if (error) {
      statusData[SettingsIO.CONSTANTS.KEYS.SYNC_ERROR] = error;
    } else {
      await chrome.storage.local.remove([SettingsIO.CONSTANTS.KEYS.SYNC_ERROR]);
    }

    await chrome.storage.local.set(statusData);
    
    // 通知同步狀態管理器狀態變化
    await this._notifySyncStatusChange();
  }

  async setSyncError(error) {
    await chrome.storage.local.set({
      [SettingsIO.CONSTANTS.KEYS.SYNC_ERROR]: error,
      [SettingsIO.CONSTANTS.KEYS.SYNC_STATUS]: 'error'
    });
    
    // 通知同步狀態管理器錯誤狀態
    await this._notifySyncStatusChange();
  }

  /**
   * 通知同步狀態管理器狀態變化
   * @private
   */
  async _notifySyncStatusChange() {
    try {
      const currentStatus = await this.getSyncStatus();
      
      LogUtils.log('通知同步狀態變化:', currentStatus);
      
      // 發送消息到所有匹配的 content scripts
      const message = {
        action: 'syncStatusChanged',
        status: currentStatus
      };
      
      // 嘗試發送到所有 tabs
      try {
        const tabs = await chrome.tabs.query({url: 'https://data.uanalyze.twobitto.com/*'});
        
        for (const tab of tabs) {
          try {
            await chrome.tabs.sendMessage(tab.id, message);
          } catch (error) {
            // 忽略無法發送的 tab（可能尚未載入 content script）
            LogUtils.log(`無法發送消息到 tab ${tab.id}:`, error.message);
          }
        }
        
        LogUtils.log(`已發送同步狀態通知到 ${tabs.length} 個匹配的分頁`);
      } catch (error) {
        LogUtils.warn('發送同步狀態通知失敗:', error);
      }
    } catch (error) {
      LogUtils.error('通知同步狀態變化失敗:', error);
    }
  }

  // 統一的消息發送方法，自動處理不同環境
  async _sendMessage(message) {
    // 檢查是否在 Service Worker 環境中
    const isServiceWorker = typeof window === 'undefined' && typeof self !== 'undefined';
    
    if (isServiceWorker) {
      // Service Worker 環境：同時發送到 content scripts 和 popup
      
      // 1. 發送到 content scripts（原有邏輯）
      try {
        // 先嘗試查詢活動標籤頁，如果沒有則查詢所有標籤頁
        let tabs = await chrome.tabs.query({ active: true });
        
        if (tabs.length === 0) {
          LogUtils.log('未找到活動標籤頁，查詢所有標籤頁');
          tabs = await chrome.tabs.query({});
        }
        
            const promises = tabs.map(async (tab) => {
          try {
            await chrome.tabs.sendMessage(tab.id, message);
          } catch (error) {
            // 忽略無法發送的標籤頁（可能沒有 content script）
          }
        });
        
        await Promise.all(promises);
      } catch (error) {
        LogUtils.error('發送消息到標籤頁失敗:', error);
      }
      
      // 發送到 popup（如果開著的話）
      try {
        await chrome.runtime.sendMessage(message);
      } catch (error) {
        // popup 可能沒有打開，這是正常的
      }
      

      
    } else {
      // Popup 環境：使用 runtime message
      try {
        chrome.runtime.sendMessage(message).catch(() => {});
      } catch (e) {
        // 忽略錯誤
      }
      

    }
  }



  /**
   * 發送雲端更新訊號給其他設備
   * 透過 Chrome sync storage 通知其他設備有雲端更新
   */
  async sendCloudUpdateSignal() {
    try {
      const signalTimestamp = Date.now();
      const signal = {
        timestamp: signalTimestamp,
        action: 'cloudUpdated'
      };
      
      // 記住自己發送的訊號時間戳
      this.lastSentSignalTimestamp = signalTimestamp;
      
      LogUtils.log('發送雲端更新訊號:', signal);
      
      // 發送調試信息到 background
      this._sendDebugToBackground('發送雲端更新訊號', {
        signal,
        action: 'sendSignal'
      });
      
      await chrome.storage.sync.set({
        cloudUpdateSignal: signal
      });
      
      LogUtils.log('雲端更新訊號已發送');
      this._sendDebugToBackground('雲端更新訊號發送成功', {
        signal,
        action: 'sendSuccess'
      });
      
    } catch (error) {
      LogUtils.warn('發送雲端更新訊號失敗:', error);
      this._sendDebugToBackground('發送雲端更新訊號失敗', {
        error: error.message,
        action: 'sendError'
      });
    }
  }

  /**
   * 處理雲端更新訊號
   * 當收到其他設備的雲端更新訊號時，根據設定間隔延遲執行同步
   */
    async handleCloudUpdateSignal(changes, areaName) {
    // 詳細的調試日誌
    LogUtils.log('handleCloudUpdateSignal 被調用:', {
      areaName,
      hasCloudUpdateSignal: !!changes.cloudUpdateSignal,
      allChangeKeys: Object.keys(changes)
    });
    
    // 發送調試信息到 background
    this._sendDebugToBackground('收到 storage 變更', {
      areaName,
      changeKeys: Object.keys(changes),
      hasCloudUpdateSignal: !!changes.cloudUpdateSignal,
      action: 'storageChange'
    });
    
    // 只處理包含 cloudUpdateSignal 的變更
    if (!changes.cloudUpdateSignal) {
      LogUtils.log('跳過非相關變更 (no cloudUpdateSignal)');
      return;
    }

    // 如果 areaName 存在且不是 'sync'，則跳過
    if (areaName && areaName !== 'sync') {
      LogUtils.log(`跳過非 sync storage 變更 (areaName: ${areaName})`);
      return;
    }

    const signal = changes.cloudUpdateSignal.newValue;
    const oldSignal = changes.cloudUpdateSignal.oldValue;
    
    LogUtils.log('雲端更新訊號變更詳情:', {
      newValue: signal,
      oldValue: oldSignal
    });
    
    if (!signal || typeof signal !== 'object') {
      LogUtils.warn('無效的訊號格式:', signal);
      this._sendDebugToBackground('無效的訊號格式', {
        signal,
        action: 'invalidSignal'
      });
      return;
    }

    LogUtils.log('收到雲端更新訊號:', signal);

    // 聰明跳過：檢查是否是自己發送的訊號
    if (this.lastSentSignalTimestamp && signal.timestamp === this.lastSentSignalTimestamp) {
      LogUtils.log(`跳過自己發送的訊號 (時間戳: ${signal.timestamp})`);
      this._sendDebugToBackground('跳過自己的訊號', {
        signal,
        lastSentTimestamp: this.lastSentSignalTimestamp,
        action: 'skipOwnSignal'
      });
      return;
    }

    this._sendDebugToBackground('收到其他設備訊號', {
        signal,
        action: 'receiveSignal'
      });

    // 檢查是否啟用自動同步
    const syncEnabled = await this.isSyncEnabled();
    
    if (!syncEnabled) {
      LogUtils.log('自動同步已停用，忽略雲端更新訊號');
      this._sendDebugToBackground('同步已停用，忽略訊號', {
        signal,
        syncEnabled,
        action: 'syncDisabled'
      });
      return;
    }

    // 取得同步間隔設定
    const intervalMinutes = await this.getSyncInterval();
    const delayMs = intervalMinutes * 60 * 1000;

    LogUtils.log(`將在 ${intervalMinutes} 分鐘後執行訊號驅動同步 (延遲: ${delayMs}ms)`);
    
    this._sendDebugToBackground('準備延遲同步', {
      signal,
      intervalMinutes,
      delayMs,
      action: 'scheduleSync'
    });

    // 清除之前的延遲同步（如果有的話）
    if (this.signalSyncTimeoutId) {
      clearTimeout(this.signalSyncTimeoutId);
    }

    // 設定延遲同步
    this.signalSyncTimeoutId = setTimeout(async () => {
      LogUtils.important('🚀 執行訊號驅動同步');
      this._sendDebugToBackground('開始執行訊號驅動同步', {
        signal,
        action: 'startSync'
      });
      
      try {
        await this.performSync();
        LogUtils.log('訊號驅動同步完成');
        this._sendDebugToBackground('訊號驅動同步完成', {
          signal,
          action: 'syncSuccess'
        });
      } catch (error) {
        LogUtils.error('訊號驅動同步失敗:', error);
        this._sendDebugToBackground('訊號驅動同步失敗', {
          signal,
          error: error.message,
          action: 'syncError'
        });
      }
    }, delayMs);
    
  }

  /**
   * 發送調試信息到 background.js
   */
  _sendDebugToBackground(message, data = {}) {
    try {
      const debugMessage = {
        action: 'cloudSignalDebug',
        timestamp: Date.now(),
        message,
        data: {
          ...data,
          currentTime: getCurrentTimeString()
        }
      };
      
      // 在 Service Worker 環境中，直接記錄到 console
      // 在其他環境中，嘗試發送到 background
      if (typeof window === 'undefined' && typeof self !== 'undefined') {
        // Service Worker 環境 - 直接記錄
        LogUtils.log(`[SettingsIO-Debug] ${message}:`, data);
      } else {
        // 其他環境 - 發送到 background
        chrome.runtime.sendMessage(debugMessage).catch(() => {
          // 如果發送失敗，至少記錄到本地 console
          LogUtils.log(`[SettingsIO-Debug] ${message}:`, data);
        });
      }
    } catch (error) {
      LogUtils.warn('發送調試信息失敗:', error);
    }
  }

  deepEqual(obj1, obj2) {
    if (obj1 === obj2) return true;
    if (obj1 == null || obj2 == null) return obj1 === obj2;
    if (typeof obj1 !== typeof obj2) return false;
    if (typeof obj1 !== 'object') return obj1 === obj2;
    if (Array.isArray(obj1) !== Array.isArray(obj2)) return false;

    const keys1 = Object.keys(obj1);
    const keys2 = Object.keys(obj2);

    if (keys1.length !== keys2.length) return false;

    for (let key of keys1) {
      if (!keys2.includes(key)) return false;
      if (!this.deepEqual(obj1[key], obj2[key])) return false;
    }

    return true;
  }

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

  async resetSyncStatus() {
    await chrome.storage.local.remove([
      SettingsIO.CONSTANTS.KEYS.DRIVE_FILE_ID,
      SettingsIO.CONSTANTS.KEYS.SYNC_STATUS,
      SettingsIO.CONSTANTS.KEYS.SYNC_ERROR,
      SettingsIO.CONSTANTS.KEYS.LAST_SYNC,
      SettingsIO.CONSTANTS.KEYS.SYNC_ENABLED
    ]);

    await this.tokenManager.clearToken();
    LogUtils.log('同步狀態已重置');
  }

  async signOut() {
    await this.toggleAutoSync(false);
    await this.resetSyncStatus();
    LogUtils.log('已登出');
  }

  async forceUploadToCloud() {
    LogUtils.log('開始強制上傳到雲端');
    
    try {
      const authResult = await this.authenticateWithGoogle(true);
      if (!authResult.success) {
        throw new Error(authResult.error || '認證失敗');
      }

      const token = typeof authResult.token === 'object' ? authResult.token.token : authResult.token;
      const fileId = await this.getOrCreateDriveFile(token);
      LogUtils.log(`強制上傳使用檔案ID: ${fileId}`);
      await this.uploadSettings(token, fileId);
      
      LogUtils.log(`強制上傳完成 (檔案ID: ${fileId})`);
      return { success: true };
    } catch (error) {
      LogUtils.error('強制上傳失敗:', error);
      return { success: false, error: error.message };
    }
  }

  // 聊明解法：強制下載雲端設定（開啟同步時使用）
  async forceDownloadFromCloud() {
    LogUtils.important('🔽 開始強制下載雲端設定');
    
    try {
      const authResult = await this.authenticateWithGoogle(true);
      if (!authResult.success) {
        throw new Error(authResult.error || '認證失敗');
      }

      const token = typeof authResult.token === 'object' ? authResult.token.token : authResult.token;
      
      // 先嘗試搜尋現有檔案，不創建新檔案
      let fileId = await this.searchExistingDriveFile(token);
      
      if (!fileId) {
        LogUtils.warn('未找到現有雲端檔案，可能是首次使用');
        // 如果真的沒有檔案，才創建一個新檔案
        fileId = await this.getOrCreateDriveFile(token);
        LogUtils.log(`創建新檔案ID: ${fileId}`);
      } else {
        LogUtils.log(`找到現有雲端檔案，檔案ID: ${fileId}`);
        // 儲存找到的檔案ID到本地緩存
        await chrome.storage.local.set({
          [SettingsIO.CONSTANTS.KEYS.DRIVE_FILE_ID]: fileId
        });
      }
      
      LogUtils.log(`正在從檔案ID下載: ${fileId}`);
      const driveSettings = await this.downloadSettings(token, fileId);
      
      // 檢查雲端是否有內容，如果有就直接套用
      if (driveSettings && Object.keys(driveSettings).length > 2) {  // 不只是lastModified
        LogUtils.important(`🎉 發現雲端設定，直接套用 (檔案ID: ${fileId})`);
        
        this.isInternalSyncUpdate = true;
        await this.saveSettings(driveSettings);
        
        // 延遲重置標記並發送消息，確保所有 storage change 事件都已處理
        setTimeout(async () => {
          this.isInternalSyncUpdate = false;
          LogUtils.log('強制下載內部更新標記已重置');
          
          // 發送消息，確保標記已重置
          await this._sendMessage({
            action: 'settingsUpdated',
            data: { 
              reason: 'forceDownload', 
              timestamp: Date.now(),
              changedKeys: Object.keys(driveSettings).filter(key => key !== 'lastModified')
            }
          });
        }, 100); // 縮短延遲時間到 100ms，確保快速響應
        
        LogUtils.log(`雲端設定下載完成 (檔案ID: ${fileId})`);
      } else {
        LogUtils.log(`雲端設定為空，保持本地設定 (檔案ID: ${fileId})`);
      }
      
      await this.updateSyncStatus('success');
      return { success: true };
      
    } catch (error) {
      LogUtils.error('強制下載失敗:', error);
      await this.setSyncError(error.message);
      return { success: false, error: error.message };
    }
  }

  // 專門搜尋現有檔案的方法（使用固定檔名）
  async searchExistingDriveFile(token) {
    try {
      LogUtils.log('搜尋現有雲端檔案...');
      
      // 嘗試多種搜尋策略
      const searchStrategies = [
        // 策略1：搜尋檔案名稱（根目錄）
        `name='${SettingsIO.CONSTANTS.SETTINGS_FILENAME}' and trashed=false`,
        // 策略2：模糊搜尋
        `name contains 'gpt-text-rewriting-settings' and trashed=false`
      ];
      
      for (let i = 0; i < searchStrategies.length; i++) {
        const query = searchStrategies[i];
        LogUtils.log(`嘗試搜尋策略${i + 1}: ${query}`);
        
        const searchUrl = `${SettingsIO.CONSTANTS.DRIVE_API_BASE}/files?q=${encodeURIComponent(query)}`;
        LogUtils.log(`搜尋URL: ${searchUrl}`);
        
        const searchResponse = await fetch(searchUrl, {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        });

        LogUtils.log(`搜尋回應狀態: ${searchResponse.status}`);
        
        if (!searchResponse.ok) {
          const errorText = await searchResponse.text();
          LogUtils.error(`搜尋請求失敗: ${searchResponse.status} - ${errorText}`);
          continue;
        }

        const searchData = await searchResponse.json();
        LogUtils.log('搜尋結果:', searchData);
        
        if (searchData.files && searchData.files.length > 0) {
          const fileId = searchData.files[0].id;
          const modifiedTime = searchData.files[0].modifiedTime;
          const parents = searchData.files[0].parents;
          LogUtils.log(`找到現有檔案ID: ${fileId}, 修改時間: ${modifiedTime}, 父資料夾: ${parents?.join(', ') || '根目錄'}`);
          
          if (searchData.files.length > 1) {
            LogUtils.warn(`發現多個同名檔案 (${searchData.files.length}個)，使用第一個`);
          }
          
          return fileId;
        } else {
          LogUtils.log(`策略${i + 1}未找到檔案`);
        }
      }
      
      LogUtils.log('所有搜尋策略都未找到現有檔案');
      return null;
      
    } catch (error) {
      LogUtils.error('搜尋檔案失敗:', error);
      return null;
    }
  }
}

function getCurrentTimeString() {
  return new Date().toISOString();
}

class TokenManager {
  constructor() {
    this.cachedToken = null;
    this.tokenExpiry = null;
    this.authInProgress = false;
    this.pendingRequests = [];
    
    this.clientIdMap = {
      'fcnkggimjeffgcnpdmjgjgnoapfbn': '862665835661-leepued02022ei05bgb4jga850eglj0n.apps.googleusercontent.com',
      'hgelcpdcklajobdjoiplofieilaekgah': '862665835661-i3jvgnjlfhbvlruadp7v7v86si18p57i.apps.googleusercontent.com'
    };
  }
  
  getCurrentClientId() {
    const extensionId = chrome.runtime.id;
    return this.clientIdMap[extensionId] || '862665835661-leepued02022ei05bgb4jga850eglj0n.apps.googleusercontent.com';
  }

  async getToken(interactive = false) {
    if (this.isTokenValid()) {
      // 即使 token 有效，在互動式認證時也要確保設置同步狀態
      if (interactive) {
        await chrome.storage.local.set({
          [SettingsIO.CONSTANTS.KEYS.SYNC_ENABLED]: true
        });
        LogUtils.log('TokenManager 同步狀態已啟用 (緩存token)');
      }
      return { success: true, token: this.cachedToken };
    }

    if (this.authInProgress) {
      return new Promise((resolve, reject) => {
        this.pendingRequests.push({ resolve, reject });
      });
    }

    this.authInProgress = true;

    try {
      const clientId = this.getCurrentClientId();
      LogUtils.log('TokenManager 開始認證, interactive:', interactive);
      
      // 如果是互動式認證，先清除舊的token以使用新權限
      if (interactive) {
        LogUtils.log('TokenManager 清除舊認證token以使用新權限...');
        await chrome.identity.clearAllCachedAuthTokens();
      }
      
      if (interactive && clientId !== '862665835661-leepued02022ei05bgb4jga850eglj0n.apps.googleusercontent.com') {
        return await this.performWebAuthFlow(clientId);
      }
      
      const tokenResult = await chrome.identity.getAuthToken({ 
        interactive: interactive,
        scopes: ['https://www.googleapis.com/auth/drive.file']
      });

      if (!tokenResult) {
        throw new Error('未獲取到認證 token');
      }

      const actualToken = typeof tokenResult === 'object' ? tokenResult.token : tokenResult;
      
      if (!actualToken) {
        throw new Error('未獲取到有效的認證 token');
      }

      this.cachedToken = actualToken;
      this.tokenExpiry = Date.now() + SettingsIO.CONSTANTS.TIMINGS.TOKEN_REFRESH_MARGIN;
      
      LogUtils.log('TokenManager 認證成功');
      
      // 認證成功後設置同步啟用狀態
      await chrome.storage.local.set({
        [SettingsIO.CONSTANTS.KEYS.SYNC_ENABLED]: true
      });
      LogUtils.log('TokenManager 同步狀態已啟用');
      
      this.pendingRequests.forEach(({ resolve }) => {
        resolve({ success: true, token: actualToken });
      });
      this.pendingRequests = [];

      return { success: true, token: actualToken };

    } catch (error) {
      LogUtils.error('TokenManager 認證失敗:', error);
      
      this.pendingRequests.forEach(({ reject }) => {
        reject(error);
      });
      this.pendingRequests = [];

      return { success: false, error: error.message };
    } finally {
      this.authInProgress = false;
    }
  }

  async performWebAuthFlow(clientId) {
    try {
      const redirectUri = chrome.identity.getRedirectURL();
      const scopes = 'https://www.googleapis.com/auth/drive.file';
      
      const authUrl = `https://accounts.google.com/oauth/authorize?` +
        `client_id=${clientId}&` +
        `response_type=token&` +
        `redirect_uri=${encodeURIComponent(redirectUri)}&` +
        `scope=${encodeURIComponent(scopes)}`;

      const responseUrl = await chrome.identity.launchWebAuthFlow({
        url: authUrl,
        interactive: true
      });

      if (!responseUrl) {
        throw new Error('Web Auth Flow 失敗');
      }

      const urlParams = new URLSearchParams(responseUrl.split('#')[1]);
      const accessToken = urlParams.get('access_token');

      if (!accessToken) {
        throw new Error('未從回應中獲取到 access token');
      }

      this.cachedToken = accessToken;
      this.tokenExpiry = Date.now() + SettingsIO.CONSTANTS.TIMINGS.TOKEN_REFRESH_MARGIN;

      // 認證成功後設置同步啟用狀態
      await chrome.storage.local.set({
        [SettingsIO.CONSTANTS.KEYS.SYNC_ENABLED]: true
      });
      LogUtils.log('TokenManager 同步狀態已啟用 (WebAuthFlow)');

      this.pendingRequests.forEach(({ resolve }) => {
        resolve({ success: true, token: accessToken });
      });
      this.pendingRequests = [];

      return { success: true, token: accessToken };

    } catch (error) {
      this.pendingRequests.forEach(({ reject }) => {
        reject(error);
      });
      this.pendingRequests = [];

      return { success: false, error: error.message };
    }
  }

  isTokenValid() {
    return this.cachedToken && 
           this.tokenExpiry && 
           Date.now() < this.tokenExpiry;
  }

  async clearToken() {
    this.cachedToken = null;
    this.tokenExpiry = null;
    
    try {
      await chrome.identity.clearAllCachedAuthTokens();
      LogUtils.log('TokenManager Token 已清除');
    } catch (error) {
      LogUtils.warn('TokenManager 清除 token 失敗:', error);
    }
  }
}

// 全局暴露（簡化版）
const globalScope = (function() {
  if (typeof window !== 'undefined') return window;
  if (typeof self !== 'undefined') return self;
  if (typeof global !== 'undefined') return global;
  return {};
})();

globalScope.SettingsIO = SettingsIO;
globalScope.TokenManager = TokenManager;

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { SettingsIO, TokenManager };
}