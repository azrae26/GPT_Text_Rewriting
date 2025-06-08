/**
 * settings-io.js - 設定同步和雲端儲存管理
 * 功能：OAuth2 認證、Google Drive 同步、設定衝突處理、多分頁協調
 * 職責：管理雲端同步邏輯、處理本地時間戳記異常
 * 依賴：Chrome Extensions API、Google Drive API v3、GlobalSettings
 * 更新：2025-06-08 修復時間戳同步問題、排除UI狀態避免不必要同步
 */

class SettingsIO {
  static CONSTANTS = {
    DRIVE_API_BASE: 'https://www.googleapis.com/drive/v3',
    UPLOAD_API_BASE: 'https://www.googleapis.com/upload/drive/v3',
    SETTINGS_FILENAME: 'gpt-text-rewriting-settings.json',
    
    TIMINGS: {
      UPLOAD_DEBOUNCE: 10000,
      SYNC_INTERVAL: 0.25*60*1000,
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

  constructor() {
    this.syncInProgress = false;
    this.uploadInProgress = false;
    this.tokenManager = new TokenManager();
    this.syncIntervalId = null;
    this.uploadTimeoutId = null;
    this.isInitialized = false;
    
    this.handleStorageChange = this.handleStorageChange.bind(this);
    this.performSync = this.performSync.bind(this);
  }

  async init() {
    if (this.isInitialized) return;

    console.log(`[SettingsIO][${getCurrentTimeString()}] 初始化設定同步系統`);
    
    try {
      this.setupStorageListener();
      
      const syncEnabled = await this.isSyncEnabled();
      if (syncEnabled) {
        this.startPeriodicSync();
        console.log(`[SettingsIO][${getCurrentTimeString()}] 自動同步已啟用`);
      }
      
      this.isInitialized = true;
      console.log(`[SettingsIO][${getCurrentTimeString()}] 設定同步系統初始化完成`);
    } catch (error) {
      console.error(`[SettingsIO][${getCurrentTimeString()}] 初始化失敗:`, error);
    }
  }

  setupStorageListener() {
    chrome.storage.local.onChanged.addListener(this.handleStorageChange);
    chrome.storage.sync.onChanged.addListener(this.handleStorageChange);
  }

  async handleStorageChange(changes, areaName) {
    const ignoredKeys = [
      SettingsIO.CONSTANTS.KEYS.LAST_SYNC,
      SettingsIO.CONSTANTS.KEYS.SYNC_STATUS,
      SettingsIO.CONSTANTS.KEYS.SETTINGS_HASH,
      SettingsIO.CONSTANTS.KEYS.SYNC_ERROR,
      'syncDebugLogs',
      'stockCrawlerState'
    ];

    const relevantChanges = Object.keys(changes).filter(key => 
      !ignoredKeys.includes(key) && 
      this.isSettingsKey(key) &&
      !this.shouldExcludeFromSync(key)
    );

    if (relevantChanges.length === 0) return;

    console.log(`[SettingsIO][${getCurrentTimeString()}] 偵測到設定變更:`, relevantChanges);

    await this.updateLastModifiedTime();
    this.scheduleUpload();
  }

  // 統一的排除邏輯判斷
  shouldExcludeFromSync(key, context = 'comparison') {
    // UI 狀態鍵值
    const uiStateKeys = [
      'lastMainTab', 'lastSubTab', 'windowState', 'selectedItem', 
      'expandedSections', 'scrollPosition', 'dialogState', 'panelState',
      'replacePosition', 'summaryPosition', 'summaryExpanded',
      'isFirstTime', 'firstRun', 'autoExport'
    ];
    
    // 同步系統內部狀態
    const syncInternalKeys = [
      SettingsIO.CONSTANTS.KEYS.LAST_SYNC,
      SettingsIO.CONSTANTS.KEYS.SYNC_STATUS,
      SettingsIO.CONSTANTS.KEYS.SETTINGS_HASH,
      SettingsIO.CONSTANTS.KEYS.SYNC_ERROR,
      SettingsIO.CONSTANTS.KEYS.DRIVE_FILE_ID,
      'syncDebugLogs', 'stockCrawlerState'
    ];

    // 雲端同步排除（更保守）
    const cloudExcludeKeys = [
      ...syncInternalKeys,
      SettingsIO.CONSTANTS.KEYS.SYNC_ENABLED
    ];

    switch (context) {
      case 'cloud':
        return cloudExcludeKeys.includes(key) || uiStateKeys.includes(key);
      case 'comparison':
        return uiStateKeys.includes(key);
      default:
        return syncInternalKeys.includes(key) || uiStateKeys.includes(key);
    }
  }

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

  async updateLastModifiedTime() {
    await chrome.storage.local.set({ lastModified: Date.now() });
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
    return await this.tokenManager.getToken(interactive);
  }

  async manualSync() {
    console.log(`[SettingsIO][${getCurrentTimeString()}] 開始手動同步`);
    
    try {
      const authResult = await this.authenticateWithGoogle(true);
      if (!authResult.success) {
        throw new Error(authResult.error || '認證失敗');
      }

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

  async toggleAutoSync(enabled) {
    console.log(`[SettingsIO][${getCurrentTimeString()}] 切換自動同步:`, enabled);
    
    await chrome.storage.local.set({
      [SettingsIO.CONSTANTS.KEYS.SYNC_ENABLED]: enabled
    });

    if (enabled) {
      const syncResult = await this.manualSync();
      if (syncResult.success) {
        this.startPeriodicSync();
      }
    } else {
      this.stopPeriodicSync();
    }

    return enabled;
  }

  startPeriodicSync() {
    this.stopPeriodicSync();
    
    this.syncIntervalId = setInterval(async () => {
      if (await this.isSyncEnabled()) {
        await this.performSync();
      }
    }, SettingsIO.CONSTANTS.TIMINGS.SYNC_INTERVAL);
    
    console.log(`[SettingsIO][${getCurrentTimeString()}] 定期同步已啟動`);
  }

  stopPeriodicSync() {
    if (this.syncIntervalId) {
      clearInterval(this.syncIntervalId);
      this.syncIntervalId = null;
      console.log(`[SettingsIO][${getCurrentTimeString()}] 定期同步已停止`);
    }
  }

  async isSyncEnabled() {
    const result = await chrome.storage.local.get([SettingsIO.CONSTANTS.KEYS.SYNC_ENABLED]);
    return result[SettingsIO.CONSTANTS.KEYS.SYNC_ENABLED] || false;
  }

  async performSync(token = null) {
    if (this.syncInProgress) {
      console.log(`[SettingsIO][${getCurrentTimeString()}] 同步正在進行中，跳過`);
      return;
    }

    this.syncInProgress = true;
    
    try {
      console.log(`[SettingsIO][${getCurrentTimeString()}] 開始執行同步`);
      
      if (!token) {
        const authResult = await this.authenticateWithGoogle(false);
        if (!authResult.success) {
          console.log(`[SettingsIO][${getCurrentTimeString()}] 認證失敗，跳過同步`);
          return;
        }
        token = authResult.token;
      }

      if (!token || typeof token !== 'string') {
        throw new Error('無效的認證 token');
      }

      const fileId = await this.getOrCreateDriveFile(token);
      const driveSettings = await this.downloadSettings(token, fileId);
      const localSettings = await GlobalSettings.getAllSettings();
      
      const { needsReload, needsUpload, mergedSettings } = await this.compareAndMergeSettings(
        localSettings, 
        driveSettings
      );
      
      if (needsReload) {
        console.log(`[SettingsIO][${getCurrentTimeString()}] 更新本地設定並重新載入`);
        await this.saveSettings(mergedSettings);
        
        if (typeof location !== 'undefined' && location.reload) {
          location.reload();
        } else {
          console.log(`[SettingsIO][${getCurrentTimeString()}] Service Worker 環境：設定已更新`);
          
          try {
            chrome.runtime.sendMessage({
              action: 'settingsUpdated',
              data: { reason: 'cloudSync', timestamp: Date.now() }
            }).catch(() => {});
          } catch (e) {}
        }
      } else if (needsUpload) {
        console.log(`[SettingsIO][${getCurrentTimeString()}] 本地設定較新，上傳到雲端`);
        await this.uploadSettings(token, fileId);
      } else {
        console.log(`[SettingsIO][${getCurrentTimeString()}] 設定已同步，無需操作`);
      }
      
      await this.updateSyncStatus('success');
      
    } catch (error) {
      console.error(`[SettingsIO][${getCurrentTimeString()}] 同步失敗:`, error);
      await this.setSyncError(error.message);
    } finally {
      this.syncInProgress = false;
    }
  }

  async compareAndMergeSettings(localSettings, driveSettings) {
    const localLastModified = localSettings.lastModified || 0;
    const driveLastModified = driveSettings.lastModified || 0;
    const isLocalRecent = (Date.now() - localLastModified) < SettingsIO.CONSTANTS.TIMINGS.LOCAL_RECENT_THRESHOLD;
    
    console.log(`[SettingsIO][${getCurrentTimeString()}] 比較時間戳記: 本地=${new Date(localLastModified).toISOString()}, 雲端=${new Date(driveLastModified).toISOString()}, 本地最近=${isLocalRecent}`);
    
    // 特殊情況：本地時間戳無效
    if (localLastModified <= 0 && driveLastModified > 0) {
      console.log(`[SettingsIO][${getCurrentTimeString()}] 本地時間戳無效，強制使用雲端版本`);
      this.sendSyncDebug('時間戳無效，強制下載雲端版本', 'download', 'invalid_timestamp');
      
      return {
        needsReload: true,
        needsUpload: false,
        mergedSettings: { ...driveSettings, lastModified: driveLastModified }
      };
    }

    // 比較實際內容
    const localContent = this.filterSettingsForComparison(localSettings);
    const driveContent = this.filterSettingsForComparison(driveSettings);
    const hasContentDifference = !this.deepEqual(localContent, driveContent);
    
    if (!hasContentDifference) {
      console.log(`[SettingsIO][${getCurrentTimeString()}] 設定內容相同，跳過同步`);
      this.sendSyncDebug('設定相同，無需同步', 'none', 'no_difference');
      return { needsReload: false, needsUpload: false, mergedSettings: localSettings };
    }

    const useCloudVersion = !isLocalRecent && driveLastModified > localLastModified;
    const action = useCloudVersion ? 'download' : 'upload';
    const reason = useCloudVersion ? 'cloud_newer' : 'local_newer';
    
    console.log(`[SettingsIO][${getCurrentTimeString()}] 採用${useCloudVersion ? '雲端' : '本地'}版本`);
    this.sendSyncDebug(`${useCloudVersion ? '下載雲端' : '上傳本地'}版本`, action, reason);
    
    if (useCloudVersion) {
      return {
        needsReload: true,
        needsUpload: false,
        mergedSettings: { ...driveSettings, lastModified: driveLastModified }
      };
    } else {
      return {
        needsReload: false,
        needsUpload: true,
        mergedSettings: localSettings
      };
    }
  }

  // 過濾設定用於比較（移除時間戳和UI狀態）
  filterSettingsForComparison(settings) {
    const filtered = { ...settings };
    delete filtered.lastModified;
    
    Object.keys(filtered).forEach(key => {
      if (this.shouldExcludeFromSync(key, 'comparison')) {
        delete filtered[key];
      }
    });
    
    return filtered;
  }

  // 簡化的調試信息發送
  sendSyncDebug(message, action, reason) {
    try {
      chrome.runtime.sendMessage({
        action: 'syncDebug',
        type: 'sync_result',
        message,
        data: { action, reason }
      }).catch(() => {});
    } catch (e) {}
  }

  async uploadSettings(token = null, fileId = null) {
    if (this.uploadInProgress) {
      console.log(`[SettingsIO][${getCurrentTimeString()}] 上傳正在進行中，跳過`);
      return;
    }

    this.uploadInProgress = true;
    
    try {
      console.log(`[SettingsIO][${getCurrentTimeString()}] 開始上傳設定`);
      
      if (!token) {
        const authResult = await this.authenticateWithGoogle(false);
        if (!authResult.success) {
          console.log(`[SettingsIO][${getCurrentTimeString()}] 認證失敗，跳過上傳`);
          return;
        }
        token = authResult.token;
      }

      if (!fileId) {
        fileId = await this.getOrCreateDriveFile(token);
      }

      const allSettings = await GlobalSettings.getAllSettings();
      const settings = this.cleanSettingsForUpload(allSettings);
      settings.lastModified = Date.now();
      
      await this.updateDriveFile(token, fileId, settings);
      
      console.log(`[SettingsIO][${getCurrentTimeString()}] 設定上傳完成`);
      
    } catch (error) {
      console.error(`[SettingsIO][${getCurrentTimeString()}] 上傳設定失敗:`, error);
      await this.setSyncError(error.message);
    } finally {
      this.uploadInProgress = false;
    }
  }

  // 清理設定用於雲端上傳
  cleanSettingsForUpload(settings) {
    const cleaned = {};
    
    Object.entries(settings).forEach(([key, value]) => {
      if (!this.shouldExcludeFromSync(key, 'cloud')) {
        cleaned[key] = value;
      }
    });
    
    return cleaned;
  }

  async getOrCreateDriveFile(token) {
    const localResult = await chrome.storage.local.get([SettingsIO.CONSTANTS.KEYS.DRIVE_FILE_ID]);
    let fileId = localResult[SettingsIO.CONSTANTS.KEYS.DRIVE_FILE_ID];
    
    if (fileId) {
      try {
        await this.getDriveFileMetadata(token, fileId);
        return fileId;
      } catch (error) {
        console.log(`[SettingsIO][${getCurrentTimeString()}] 儲存的檔案 ID 無效，重新搜尋`);
        fileId = null;
      }
    }

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

    if (!fileId) {
      console.log(`[SettingsIO][${getCurrentTimeString()}] 創建新檔案`);
      const allSettings = await GlobalSettings.getAllSettings();
      const settings = this.cleanSettingsForUpload(allSettings);
      settings.lastModified = Date.now();
      
      fileId = await this.createDriveFile(token, settings);
    }

    await chrome.storage.local.set({
      [SettingsIO.CONSTANTS.KEYS.DRIVE_FILE_ID]: fileId
    });

    return fileId;
  }

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
      headers: { 'Authorization': `Bearer ${token}` },
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

  async downloadSettings(token, fileId) {
    const response = await fetch(`${SettingsIO.CONSTANTS.DRIVE_API_BASE}/files/${fileId}?alt=media`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    if (!response.ok) {
      throw new Error(`下載設定失敗: ${response.status}`);
    }

    const settings = await response.json();
    console.log(`[SettingsIO][${getCurrentTimeString()}] 設定下載完成`);
    return settings;
  }

  async getDriveFileMetadata(token, fileId) {
    const response = await fetch(`${SettingsIO.CONSTANTS.DRIVE_API_BASE}/files/${fileId}`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    if (!response.ok) {
      throw new Error(`獲取檔案資訊失敗: ${response.status}`);
    }

    return await response.json();
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

    if (error) {
      statusData[SettingsIO.CONSTANTS.KEYS.SYNC_ERROR] = error;
    } else {
      await chrome.storage.local.remove([SettingsIO.CONSTANTS.KEYS.SYNC_ERROR]);
    }

    await chrome.storage.local.set(statusData);
  }

  async setSyncError(error) {
    await chrome.storage.local.set({
      [SettingsIO.CONSTANTS.KEYS.SYNC_ERROR]: error,
      [SettingsIO.CONSTANTS.KEYS.SYNC_STATUS]: 'error'
    });
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
      SettingsIO.CONSTANTS.KEYS.LAST_SYNC
    ]);

    await this.tokenManager.clearToken();
    console.log(`[SettingsIO][${getCurrentTimeString()}] 同步狀態已重置`);
  }

  async signOut() {
    await this.toggleAutoSync(false);
    await this.resetSyncStatus();
    console.log(`[SettingsIO][${getCurrentTimeString()}] 已登出`);
  }

  async forceUploadToCloud() {
    console.log(`[SettingsIO][${getCurrentTimeString()}] 開始強制上傳到雲端`);
    
    try {
      const authResult = await this.authenticateWithGoogle(true);
      if (!authResult.success) {
        throw new Error(authResult.error || '認證失敗');
      }

      const token = typeof authResult.token === 'object' ? authResult.token.token : authResult.token;
      const fileId = await this.getOrCreateDriveFile(token);
      await this.uploadSettings(token, fileId);
      
      console.log(`[SettingsIO][${getCurrentTimeString()}] 強制上傳完成`);
      return { success: true };
    } catch (error) {
      console.error(`[SettingsIO][${getCurrentTimeString()}] 強制上傳失敗:`, error);
      return { success: false, error: error.message };
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
      console.log(`[TokenManager][${getCurrentTimeString()}] 開始認證, interactive:`, interactive);
      
      if (interactive && clientId !== '862665835661-leepued02022ei05bgb4jga850eglj0n.apps.googleusercontent.com') {
        return await this.performWebAuthFlow(clientId);
      }
      
      const tokenResult = await chrome.identity.getAuthToken({ 
        interactive: interactive,
        scopes: ['https://www.googleapis.com/auth/drive.appdata']
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
      
      console.log(`[TokenManager][${getCurrentTimeString()}] 認證成功`);
      
      this.pendingRequests.forEach(({ resolve }) => {
        resolve({ success: true, token: actualToken });
      });
      this.pendingRequests = [];

      return { success: true, token: actualToken };

    } catch (error) {
      console.error(`[TokenManager][${getCurrentTimeString()}] 認證失敗:`, error);
      
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
      const scopes = 'https://www.googleapis.com/auth/drive.appdata';
      
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
      console.log(`[TokenManager][${getCurrentTimeString()}] Token 已清除`);
    } catch (error) {
      console.warn(`[TokenManager][${getCurrentTimeString()}] 清除 token 失敗:`, error);
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