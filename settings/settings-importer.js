/**
 * settings-importer.js - 設定匯入管理模組
 * 功能：負責設定的匯入、向後兼容處理和儲存操作
 * 職責：
 * - 處理設定匯入的完整流程
 * - API 金鑰格式的向後兼容遷移
 * - 非阻塞式儲存操作避免 UI 卡死
 * - 自定義模型的還原和重建
 * 
 * 依賴：
 * - SettingsClassifier.categorizeSettings
 * - StorageManager (透過 GlobalSettings)
 * - 進度回調支援
 */

window.SettingsImporter = {
  /**
   * 套用設定（阻塞式）
   * @param {Object} settings - 要匯入的設定
   * @param {Object} settingsInstance - GlobalSettings 實例
   * @returns {Promise<void>}
   */
  async applySettings(settings, settingsInstance) {
    try {
      LogUtils.log('⚙️ 開始儲存匯入的設定');
      
      if (!settings || Object.keys(settings).length === 0) {
        throw new Error('無效的設定資料');
      }

      // 處理向後兼容性
      const migratedSettings = this._migrateApiKeyFormats(settings);
      
      // 清空所有儲存空間
      LogUtils.log('清空所有儲存空間...');
      await this._clearAllStorage();
      LogUtils.log('儲存空間已清空');

      // 分類設定
      const categorizedSettings = this._categorizeSettingsWithInstance(migratedSettings, settingsInstance);
      
      this._logCategorizedSettings(categorizedSettings);

      // 驗證同步設定大小
      this._validateSyncSettingsSize(categorizedSettings.syncSettings);

      // 儲存設定
      await this._saveAllSettings(categorizedSettings, settingsInstance);

      // 還原自定義模型
      await this._restoreCustomModels(migratedSettings, settingsInstance);

      LogUtils.log('設定儲存完成');
    } catch (error) {
      LogUtils.error('儲存設定時出錯:', error);
      throw error;
    }
  },

  /**
   * 套用設定（非阻塞式）
   * @param {Object} settings - 要匯入的設定
   * @param {Object} settingsInstance - GlobalSettings 實例
   * @param {Function} progressCallback - 進度回調函數
   * @returns {Promise<void>}
   */
  async applySettingsNonBlocking(settings, settingsInstance, progressCallback) {
    try {
      LogUtils.log('⚙️ 開始非阻塞式儲存匯入的設定');
      
      if (!settings || Object.keys(settings).length === 0) {
        throw new Error('無效的設定資料');
      }

      // 進度回調包裝器
      const updateProgress = (message) => {
        LogUtils.log(message);
        if (progressCallback) progressCallback(message);
      };

      updateProgress('正在處理 API 金鑰...');
      
      // 處理向後兼容性
      const migratedSettings = this._migrateApiKeyFormats(settings);
      
      // 讓出控制權
      await this._yieldControl(50);

      updateProgress('正在清空舊設定...');
      
      // 非阻塞式清空儲存空間
      await this._clearAllStorageNonBlocking();
      
      updateProgress('正在分類設定資料...');

      // 分類設定
      const categorizedSettings = this._categorizeSettingsWithInstance(migratedSettings, settingsInstance);
      
      this._logCategorizedSettings(categorizedSettings);

      // 驗證同步設定大小
      this._validateSyncSettingsSize(categorizedSettings.syncSettings);

      // 讓出控制權
      await this._yieldControl(50);

      // 非阻塞式儲存設定
      await this._saveAllSettingsNonBlocking(categorizedSettings, settingsInstance, updateProgress);

      updateProgress('正在還原自定義模型...');

      // 還原自定義模型
      await this._restoreCustomModels(migratedSettings, settingsInstance);
      
      // 讓出控制權
      await this._yieldControl(50);

      updateProgress('設定匯入完成');

      LogUtils.log('設定儲存完成');
    } catch (error) {
      LogUtils.error('儲存設定時出錯:', error);
      throw error;
    }
  },

  /**
   * 遷移 API 金鑰格式（向後兼容）
   * @private
   * @param {Object} settings - 原始設定
   * @returns {Object} - 遷移後的設定
   */
  _migrateApiKeyFormats(settings) {
    const migratedSettings = { ...settings };
    
    if (!migratedSettings.apiKeys) {
      return migratedSettings;
    }

    LogUtils.log('檢查並遷移舊版本的 API 金鑰格式...');
    
    // 如果存在舊的 gemini-2.0-flash-exp 金鑰，遷移到新的 gemini 格式
    if (migratedSettings.apiKeys['gemini-2.0-flash-exp'] && !migratedSettings.apiKeys['gemini']) {
      LogUtils.log('發現舊版本 Gemini API 金鑰，正在遷移...');
      migratedSettings.apiKeys['gemini'] = migratedSettings.apiKeys['gemini-2.0-flash-exp'];
      delete migratedSettings.apiKeys['gemini-2.0-flash-exp'];
      LogUtils.log('Gemini API 金鑰遷移完成');
    }
    
    // 清理其他可能的舊版本硬編碼金鑰
    const oldKeys = Object.keys(migratedSettings.apiKeys).filter(key => 
      key.includes('2.0-flash-exp') || key.includes('1.5-pro') || 
      key.includes('-1.5-') || key.includes('-2.0-') || key.includes('-latest')
    );
    
    if (oldKeys.length > 0) {
      LogUtils.log('清理舊版本硬編碼金鑰:', oldKeys);
      oldKeys.forEach(oldKey => {
        // 只有當沒有通用金鑰時，才將舊金鑰值遷移到通用金鑰
        if (oldKey.startsWith('gemini') && !migratedSettings.apiKeys['gemini'] && migratedSettings.apiKeys[oldKey]) {
          migratedSettings.apiKeys['gemini'] = migratedSettings.apiKeys[oldKey];
          LogUtils.log(`將 ${oldKey} 的值遷移到 gemini`);
        }
        delete migratedSettings.apiKeys[oldKey];
      });
    }
    
    // 最後清理空值或無效值
    Object.keys(migratedSettings.apiKeys).forEach(key => {
      const value = migratedSettings.apiKeys[key];
      if (!value || value === '' || value === 'undefined' || value === 'null' || 
          (typeof value === 'string' && (value === '已設置' || value === '未設置'))) {
        LogUtils.log(`清理無效金鑰: ${key}`);
        delete migratedSettings.apiKeys[key];
      }
    });

    return migratedSettings;
  },

  /**
   * 使用實例方法分類設定
   * @private
   * @param {Object} settings - 設定物件
   * @param {Object} settingsInstance - GlobalSettings 實例
   * @returns {Object} - 分類後的設定
   */
  _categorizeSettingsWithInstance(settings, settingsInstance) {
    if (window.SettingsClassifier) {
      return window.SettingsClassifier.categorizeSettings(settings, settingsInstance);
    } else {
      // 後備邏輯
      LogUtils.warn('SettingsClassifier 未載入，使用後備分類邏輯');
      return settingsInstance._categorizeSettings(settings);
    }
  },

  /**
   * 記錄分類後的設定
   * @private
   * @param {Object} categorizedSettings - 分類後的設定
   */
  _logCategorizedSettings(categorizedSettings) {
    const { syncSettings, localSettings, replaceSettings } = categorizedSettings;
    
    LogUtils.log('分類後的設定：');
    LogUtils.log('- sync 設定:', Object.keys(syncSettings));
    LogUtils.log('- local 設定:', Object.keys(localSettings));
    LogUtils.log('- 替換規則:', Object.keys(replaceSettings));
  },

  /**
   * 驗證同步設定大小
   * @private
   * @param {Object} syncSettings - 同步設定
   */
  _validateSyncSettingsSize(syncSettings) {
    const syncSettingsSize = new TextEncoder().encode(JSON.stringify(syncSettings)).length;
    LogUtils.log('sync settings 大小:', syncSettingsSize, 'bytes');
    
    if (syncSettingsSize > 100000) {
      throw new Error('同步設定總大小超過限制 (100KB)');
    }
  },

  /**
   * 清空所有儲存空間
   * @private
   */
  async _clearAllStorage() {
    await Promise.all([
      new Promise((resolve) => chrome.storage.sync.clear(resolve)),
      new Promise((resolve) => chrome.storage.local.clear(resolve))
    ]);
  },

  /**
   * 非阻塞式清空所有儲存空間
   * @private
   */
  async _clearAllStorageNonBlocking() {
    LogUtils.log('清空同步儲存空間...');
    await new Promise((resolve) => chrome.storage.sync.clear(resolve));
    
    await this._yieldControl(50);
    
    LogUtils.log('清空本地儲存空間...');
    await new Promise((resolve) => chrome.storage.local.clear(resolve));
    
    await this._yieldControl(50);
    
    LogUtils.log('儲存空間已清空');
  },

  /**
   * 儲存所有設定
   * @private
   */
  async _saveAllSettings(categorizedSettings, settingsInstance) {
    const { syncSettings, localSettings, replaceSettings } = categorizedSettings;
    
    LogUtils.log('開始儲存設定...');
    
    await Promise.all([
      Object.keys(syncSettings).length > 0 ? 
        settingsInstance._setChromeStorage(syncSettings, 'sync') : Promise.resolve(),
      Object.keys(localSettings).length > 0 ? 
        settingsInstance._setChromeStorage(localSettings, 'local') : Promise.resolve(),
      Object.keys(replaceSettings).length > 0 ? 
        settingsInstance._setChromeStorage(replaceSettings, 'local') : Promise.resolve()
    ]);
  },

  /**
   * 非阻塞式儲存所有設定
   * @private
   */
  async _saveAllSettingsNonBlocking(categorizedSettings, settingsInstance, updateProgress) {
    const { syncSettings, localSettings, replaceSettings } = categorizedSettings;
    
    updateProgress('正在儲存同步設定...');
    
    if (Object.keys(syncSettings).length > 0) {
      LogUtils.log('開始儲存同步設定...');
      await settingsInstance._setChromeStorage(syncSettings, 'sync');
      await this._yieldControl(100);
    }

    updateProgress('正在儲存本地設定...');

    if (Object.keys(localSettings).length > 0) {
      LogUtils.log('開始儲存本地設定...');
      await settingsInstance._setChromeStorageInBatches(localSettings, 'local', updateProgress);
      await this._yieldControl(100);
    }

    updateProgress('正在儲存替換規則...');

    if (Object.keys(replaceSettings).length > 0) {
      LogUtils.log('開始儲存替換規則...');
      await settingsInstance._setChromeStorageInBatches(replaceSettings, 'local', updateProgress);
      await this._yieldControl(100);
    }
  },

  /**
   * 還原自定義模型
   * @private
   */
  async _restoreCustomModels(settings, settingsInstance) {
    if (!settings.customModels) {
      return;
    }

    LogUtils.log('還原自定義模型...');
    settingsInstance.customModels = settings.customModels;
    
    // 將自定義模型重新載入到 API.models 中
    Object.entries(settingsInstance.customModels).forEach(([key, model]) => {
      settingsInstance.API.models[key] = model.displayName;
      LogUtils.log(`已還原自定義模型: ${key} -> ${model.displayName}`);
    });
    
    LogUtils.log(`共還原 ${Object.keys(settingsInstance.customModels).length} 個自定義模型`);
  },

  /**
   * 讓出控制權（防止 UI 阻塞）
   * @private
   * @param {number} delay - 延遲毫秒數
   */
  async _yieldControl(delay = 50) {
    await new Promise(resolve => setTimeout(resolve, delay));
  },

  /**
   * 驗證匯入設定的完整性
   * @param {Object} settings - 要驗證的設定
   * @returns {Object} - 驗證結果 {isValid, errors, warnings}
   */
  validateImportSettings(settings) {
    const errors = [];
    const warnings = [];

    if (!settings || typeof settings !== 'object') {
      errors.push('設定資料必須是一個物件');
      return { isValid: false, errors, warnings };
    }

    // 檢查是否有基本設定
    if (Object.keys(settings).length === 0) {
      errors.push('設定資料不能為空');
    }

    // 檢查 API 金鑰格式
    if (settings.apiKeys && typeof settings.apiKeys !== 'object') {
      errors.push('API 金鑰格式不正確');
    }

    // 檢查自定義模型格式
    if (settings.customModels && typeof settings.customModels !== 'object') {
      errors.push('自定義模型格式不正確');
    }

    // 警告：舊版本金鑰
    if (settings.apiKeys) {
      const oldKeys = Object.keys(settings.apiKeys).filter(key => 
        key.includes('2.0-flash-exp') || key.includes('-1.5-') || key.includes('-latest')
      );
      
      if (oldKeys.length > 0) {
        warnings.push(`發現舊版本 API 金鑰，將自動遷移: ${oldKeys.join(', ')}`);
      }
    }

    const isValid = errors.length === 0;

    LogUtils.log('匯入設定驗證:', { isValid, errors, warnings });

    return { isValid, errors, warnings };
  }
};

// 確保全域可訪問
if (typeof window !== 'undefined') {
  window.SettingsImporter = window.SettingsImporter;
}

LogUtils.log('設定匯入管理器已載入'); 