/**
 * settings-io.js - 設定同步和雲端儲存管理
 * 功能：
 * - OAuth2 認證管理 (TokenManager)
 * - Google Drive 檔案同步
 * - 自動設定上傳和下載
 * - 設定衝突處理
 * - 多分頁協調管理
 * 
 * 職責：
 * - 管理與 Google Drive 的所有互動
 * - 處理設定的雲端同步邏輯
 * - 提供同步狀態和錯誤處理
 * - 實現自動和手動同步功能
 * 
 * 依賴：
 * - Chrome Extensions API: storage, identity, alarms
 * - Google Drive API v3
 * - GlobalSettings: 本地設定管理
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
      SYNC_INTERVAL: 120000,          // 同步間隔 2 分鐘
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
      SettingsIO.CONSTANTS.KEYS.SYNC_ERROR
    ];

    const relevantChanges = Object.keys(changes).filter(key => 
      !ignoredKeys.includes(key) && 
      this.isSettingsKey(key)
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
      
      // 獲取本地設定
      const localSettings = await GlobalSettings.loadSettings();
      
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

  // 比較和合併設定
  async compareAndMergeSettings(localSettings, driveSettings) {
    const localLastModified = localSettings.lastModified || 0;
    const driveLastModified = driveSettings.lastModified || 0;
    
    // 檢查本地是否剛更新過（5秒內）
    const isLocalRecent = (Date.now() - localLastModified) < SettingsIO.CONSTANTS.TIMINGS.LOCAL_RECENT_THRESHOLD;
    
    console.log(`[SettingsIO][${getCurrentTimeString()}] 比較設定時間戳記:`, {
      local: new Date(localLastModified).toISOString(),
      drive: new Date(driveLastModified).toISOString(),
      isLocalRecent
    });

    // 比較實際設定內容是否有差異（排除時間戳記）
    const localContent = { ...localSettings };
    const driveContent = { ...driveSettings };
    delete localContent.lastModified;
    delete driveContent.lastModified;
    
    const hasContentDifference = JSON.stringify(localContent) !== JSON.stringify(driveContent);
    console.log(`[SettingsIO][${getCurrentTimeString()}] 設定內容比較:`, {
      hasContentDifference,
      localSize: JSON.stringify(localContent).length,
      driveSize: JSON.stringify(driveContent).length
    });

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

      // 獲取本地設定
      const settings = await GlobalSettings.loadSettings();
      
      // 更新時間戳記
      settings.lastModified = Date.now();
      
      // 上傳到 Drive
      await this.updateDriveFile(token, fileId, settings);
      
      console.log(`[SettingsIO][${getCurrentTimeString()}] 設定上傳完成`);
      
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
      const settings = await GlobalSettings.loadSettings();
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
      console.log(`[TokenManager][${getCurrentTimeString()}] 開始 OAuth 認證, interactive:`, interactive);
      
      const tokenResult = await chrome.identity.getAuthToken({ 
        interactive: interactive 
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