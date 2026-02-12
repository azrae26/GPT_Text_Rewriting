/**
 * SettingsIO/settings-io-background-sync.js - 背景同步管理器 (2026/02/13)
 * 功能：在 Service Worker 中管理 SettingsIO 雲端同步
 * 職責：
 * - 初始化並持有 SettingsIO 實例
 * - 提供手動同步、自動同步切換、狀態查詢等操作
 * - 當 SettingsIO 未載入時提供備用實現（功能受限）
 * - 處理同步狀態持久化（local storage）
 * 
 * 依賴：
 * - LogUtils（來自 default.js）
 * - BACKGROUND_CONSTANTS（來自 background.js，執行時引用）
 * - SettingsIO（來自 settings-io.js，可選，未載入時使用備用實現）
 * - Chrome Storage API
 */

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
