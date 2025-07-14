/**
 * settings-io-startup.js - 啟動時同步管理器
 * 功能：處理插件載入和頁面載入時的自動同步觸發
 * 職責：
 * - 在插件初始化時觸發同步檢查
 * - 在頁面載入時觸發同步檢查  
 * - 防止30秒內重複同步（避免多分頁同時觸發）
 * - 檢查同步啟用狀態
 * - 與現有 SettingsIO 系統集成
 * 
 * 依賴：
 * - SettingsIO/settings-io.js：核心同步邏輯
 * - Chrome Extensions API：storage
 * - LogUtils：日誌工具
 * 
 * 更新：2025-01-xx 初始版本 - 實現啟動時自動同步功能
 */

class StartupSyncManager {
  static CONSTANTS = {
    // 防重複同步的時間間隔（30秒）
    SYNC_COOLDOWN: 30 * 1000,
    
    // Storage keys
    KEYS: {
      LAST_STARTUP_SYNC: 'lastStartupSyncTime',
      STARTUP_SYNC_COUNT: 'startupSyncCount'
    },
    
    // 環境標識
    ENVIRONMENT: {
      BACKGROUND: 'background',
      CONTENT: 'content',
      POPUP: 'popup'
    }
  };

  constructor(environment = 'unknown') {
    this.environment = environment;
    this.settingsIO = null;
    this.isInitialized = false;
    
    LogUtils.log(`[StartupSyncManager] 初始化 (環境: ${environment})`);
  }

  /**
   * 初始化啟動同步管理器
   */
  async init() {
    if (this.isInitialized) {
      LogUtils.log('[StartupSyncManager] 已初始化，跳過');
      return;
    }

    try {
      LogUtils.log('[StartupSyncManager] 開始初始化...');
      
      // 嘗試獲取 SettingsIO 實例
      await this._initializeSettingsIO();
      
      this.isInitialized = true;
      LogUtils.log('[StartupSyncManager] 初始化完成');
      
    } catch (error) {
      LogUtils.error('[StartupSyncManager] 初始化失敗:', error);
    }
  }

  /**
   * 初始化 SettingsIO 實例
   * @private
   */
  async _initializeSettingsIO() {
    // 在不同環境中尋找 SettingsIO 實例
    if (typeof SettingsIO !== 'undefined') {
      this.settingsIO = new SettingsIO();
      await this.settingsIO.init();
      LogUtils.log('[StartupSyncManager] 使用全局 SettingsIO 實例');
      return;
    }

    // 在 background 環境中尋找現有實例
    if (this.environment === StartupSyncManager.CONSTANTS.ENVIRONMENT.BACKGROUND && 
        typeof backgroundSettingsIO !== 'undefined' && backgroundSettingsIO?.settingsIO) {
      this.settingsIO = backgroundSettingsIO.settingsIO;
      LogUtils.log('[StartupSyncManager] 使用 background SettingsIO 實例');
      return;
    }

    // 在 popup 環境中尋找 window.settingsIO
    if (this.environment === StartupSyncManager.CONSTANTS.ENVIRONMENT.POPUP && 
        typeof window !== 'undefined' && window.settingsIO) {
      this.settingsIO = window.settingsIO;
      LogUtils.log('[StartupSyncManager] 使用 popup SettingsIO 實例');
      return;
    }

    LogUtils.warn('[StartupSyncManager] 未找到可用的 SettingsIO 實例');
  }

  /**
   * 執行啟動時同步檢查
   * 這是主要的入口點，會檢查條件並決定是否執行同步
   */
  async performStartupSync() {
    try {
      LogUtils.important(`🚀 [StartupSyncManager] 開始啟動同步檢查 (環境: ${this.environment})`);
      
      // 檢查是否已初始化
      if (!this.isInitialized) {
        await this.init();
      }

      // 檢查同步是否啟用
      const isSyncEnabled = await this._checkSyncEnabled();
      if (!isSyncEnabled) {
        LogUtils.log('[StartupSyncManager] 自動同步未啟用，跳過啟動同步');
        return { success: true, reason: 'sync_disabled' };
      }

      // 檢查是否在冷卻期內
      const isInCooldown = await this._checkCooldown();
      if (isInCooldown) {
        const lastSyncTime = await this._getLastSyncTime();
        const cooldownRemaining = Math.ceil((StartupSyncManager.CONSTANTS.SYNC_COOLDOWN - (Date.now() - lastSyncTime)) / 1000);
        LogUtils.log(`[StartupSyncManager] 仍在冷卻期內，剩餘 ${cooldownRemaining} 秒`);
        return { success: true, reason: 'in_cooldown', cooldownRemaining };
      }

      // 檢查是否有其他同步正在進行
      const isSyncInProgress = await this._checkSyncInProgress();
      if (isSyncInProgress) {
        LogUtils.log('[StartupSyncManager] 其他同步正在進行中，跳過啟動同步');
        return { success: true, reason: 'sync_in_progress' };
      }

      // 執行同步
      const syncResult = await this._performSync();
      
      if (syncResult.success) {
        // 更新最後同步時間和計數
        await this._updateSyncRecord();
        LogUtils.important(`✅ [StartupSyncManager] 啟動同步完成 (環境: ${this.environment})`);
      }

      return syncResult;

    } catch (error) {
      LogUtils.error('[StartupSyncManager] 啟動同步失敗:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * 檢查同步是否啟用
   * @private
   */
  async _checkSyncEnabled() {
    try {
      if (this.settingsIO && typeof this.settingsIO.isSyncEnabled === 'function') {
        return await this.settingsIO.isSyncEnabled();
      }

      // 備用檢查方法：直接檢查 storage
      const result = await chrome.storage.local.get(['syncEnabled']);
      return result.syncEnabled || false;
      
    } catch (error) {
      LogUtils.warn('[StartupSyncManager] 檢查同步狀態失敗:', error);
      return false;
    }
  }

  /**
   * 檢查是否在冷卻期內
   * @private
   */
  async _checkCooldown() {
    try {
      const lastSyncTime = await this._getLastSyncTime();
      if (!lastSyncTime) {
        return false; // 沒有記錄，不在冷卻期
      }

      const timeDiff = Date.now() - lastSyncTime;
      return timeDiff < StartupSyncManager.CONSTANTS.SYNC_COOLDOWN;
      
    } catch (error) {
      LogUtils.warn('[StartupSyncManager] 檢查冷卻期失敗:', error);
      return false;
    }
  }

  /**
   * 獲取最後同步時間
   * @private
   */
  async _getLastSyncTime() {
    try {
      const result = await chrome.storage.local.get([StartupSyncManager.CONSTANTS.KEYS.LAST_STARTUP_SYNC]);
      return result[StartupSyncManager.CONSTANTS.KEYS.LAST_STARTUP_SYNC] || null;
    } catch (error) {
      LogUtils.warn('[StartupSyncManager] 獲取最後同步時間失敗:', error);
      return null;
    }
  }

  /**
   * 檢查是否有其他同步正在進行
   * @private
   */
  async _checkSyncInProgress() {
    try {
      // 檢查 SettingsIO 的同步狀態
      if (this.settingsIO && this.settingsIO.syncInProgress) {
        return true;
      }

      // 檢查上傳狀態
      if (this.settingsIO && this.settingsIO.uploadInProgress) {
        return true;
      }

      return false;
      
    } catch (error) {
      LogUtils.warn('[StartupSyncManager] 檢查同步進行狀態失敗:', error);
      return false;
    }
  }

  /**
   * 執行實際的同步操作
   * @private
   */
  async _performSync() {
    try {
      LogUtils.log('[StartupSyncManager] 開始執行同步...');
      
      // 檢查環境類型，決定同步策略
      if (this.environment === StartupSyncManager.CONSTANTS.ENVIRONMENT.CONTENT) {
        // Content Script 環境：通過消息請求 Background Script 執行同步
        LogUtils.log('[StartupSyncManager] Content Script 環境，通過消息請求背景同步');
        return await this._requestBackgroundSync();
      } else if (this.environment === StartupSyncManager.CONSTANTS.ENVIRONMENT.POPUP) {
        // Popup 環境：也通過消息請求 Background Script 執行同步（統一日誌到背景頁）
        LogUtils.log('[StartupSyncManager] Popup 環境，通過消息請求背景同步（統一日誌）');
        return await this._requestBackgroundSync();
      } else {
        // Background 環境：直接執行同步
        if (!this.settingsIO) {
          LogUtils.warn('[StartupSyncManager] SettingsIO 實例不可用，跳過同步');
          return { success: false, error: 'SettingsIO instance not available' };
        }

        if (typeof this.settingsIO.performSync !== 'function') {
          LogUtils.warn('[StartupSyncManager] SettingsIO.performSync 方法不可用');
          return { success: false, error: 'performSync method not available' };
        }
        
        // 呼叫 SettingsIO 的 performSync 方法
        await this.settingsIO.performSync();
        
        LogUtils.log('[StartupSyncManager] 同步執行完成');
        return { success: true };
      }

    } catch (error) {
      LogUtils.error('[StartupSyncManager] 同步執行失敗:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Content Script 環境中請求 Background Script 執行同步
   * @private
   */
  async _requestBackgroundSync() {
    try {
      LogUtils.log('[StartupSyncManager] 發送同步請求到背景腳本...');
      
      return new Promise((resolve) => {
        chrome.runtime.sendMessage(
          {
            action: 'performStartupSync',
            source: 'content',
            timestamp: Date.now()
          },
          (response) => {
            if (chrome.runtime.lastError) {
              LogUtils.warn('[StartupSyncManager] 發送同步請求失敗:', chrome.runtime.lastError.message);
              resolve({ success: false, error: chrome.runtime.lastError.message });
            } else {
              LogUtils.log('[StartupSyncManager] 背景同步請求完成:', response);
              resolve(response || { success: true, reason: 'backgroundSync' });
            }
          }
        );
      });
      
    } catch (error) {
      LogUtils.error('[StartupSyncManager] 請求背景同步失敗:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * 更新同步記錄（時間和計數）
   * @private
   */
  async _updateSyncRecord() {
    try {
      const now = Date.now();
      
      // 獲取當前計數
      const countResult = await chrome.storage.local.get([StartupSyncManager.CONSTANTS.KEYS.STARTUP_SYNC_COUNT]);
      const currentCount = countResult[StartupSyncManager.CONSTANTS.KEYS.STARTUP_SYNC_COUNT] || 0;

      // 更新記錄
      await chrome.storage.local.set({
        [StartupSyncManager.CONSTANTS.KEYS.LAST_STARTUP_SYNC]: now,
        [StartupSyncManager.CONSTANTS.KEYS.STARTUP_SYNC_COUNT]: currentCount + 1
      });

      LogUtils.log(`[StartupSyncManager] 已更新同步記錄 (第 ${currentCount + 1} 次啟動同步)`);
      
    } catch (error) {
      LogUtils.warn('[StartupSyncManager] 更新同步記錄失敗:', error);
    }
  }

  /**
   * 獲取啟動同步統計資訊
   */
  async getStartupSyncStats() {
    try {
      const result = await chrome.storage.local.get([
        StartupSyncManager.CONSTANTS.KEYS.LAST_STARTUP_SYNC,
        StartupSyncManager.CONSTANTS.KEYS.STARTUP_SYNC_COUNT
      ]);

      return {
        lastStartupSync: result[StartupSyncManager.CONSTANTS.KEYS.LAST_STARTUP_SYNC] || null,
        startupSyncCount: result[StartupSyncManager.CONSTANTS.KEYS.STARTUP_SYNC_COUNT] || 0,
        lastStartupSyncFormatted: result[StartupSyncManager.CONSTANTS.KEYS.LAST_STARTUP_SYNC] ? 
          new Date(result[StartupSyncManager.CONSTANTS.KEYS.LAST_STARTUP_SYNC]).toISOString() : 'Never'
      };
    } catch (error) {
      LogUtils.error('[StartupSyncManager] 獲取統計資訊失敗:', error);
      return null;
    }
  }

  /**
   * 重置啟動同步記錄（用於測試或重置）
   */
  async resetStartupSyncRecord() {
    try {
      await chrome.storage.local.remove([
        StartupSyncManager.CONSTANTS.KEYS.LAST_STARTUP_SYNC,
        StartupSyncManager.CONSTANTS.KEYS.STARTUP_SYNC_COUNT
      ]);
      
      LogUtils.log('[StartupSyncManager] 啟動同步記錄已重置');
      return { success: true };
      
    } catch (error) {
      LogUtils.error('[StartupSyncManager] 重置啟動同步記錄失敗:', error);
      return { success: false, error: error.message };
    }
  }
}

/**
 * 便利函數：在背景環境中執行啟動同步
 */
async function performBackgroundStartupSync() {
  const manager = new StartupSyncManager(StartupSyncManager.CONSTANTS.ENVIRONMENT.BACKGROUND);
  return await manager.performStartupSync();
}

/**
 * 便利函數：在內容腳本環境中執行啟動同步
 */
async function performContentStartupSync() {
  const manager = new StartupSyncManager(StartupSyncManager.CONSTANTS.ENVIRONMENT.CONTENT);
  return await manager.performStartupSync();
}

/**
 * 便利函數：在彈出視窗環境中執行啟動同步
 */
async function performPopupStartupSync() {
  const manager = new StartupSyncManager(StartupSyncManager.CONSTANTS.ENVIRONMENT.POPUP);
  return await manager.performStartupSync();
}

// 全局暴露（避免重複宣告 globalScope）
// 直接使用 self 暴露到 Service Worker 全域作用域
if (typeof self !== 'undefined') {
  self.StartupSyncManager = StartupSyncManager;
  self.performBackgroundStartupSync = performBackgroundStartupSync;
  self.performContentStartupSync = performContentStartupSync;
  self.performPopupStartupSync = performPopupStartupSync;
}

// 如果 window 存在（popup環境），也暴露到 window
if (typeof window !== 'undefined') {
  window.StartupSyncManager = StartupSyncManager;
  window.performBackgroundStartupSync = performBackgroundStartupSync;
  window.performContentStartupSync = performContentStartupSync;
  window.performPopupStartupSync = performPopupStartupSync;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { 
    StartupSyncManager, 
    performBackgroundStartupSync, 
    performContentStartupSync, 
    performPopupStartupSync 
  };
} 