/**
 * settings-classifier.js - 設定分類管理模組
 * 功能：負責設定的分類、過濾和驗證
 * 職責：
 * - 將設定分類到不同的儲存類型（sync, local, replace）
 * - 過濾有效的設定項目
 * - 處理替換規則的格式化
 * 
 * 依賴：
 * - GlobalSettings.isLocalStorageKey 方法
 */

window.SettingsClassifier = {
  /**
   * 分類設定到不同的儲存類型
   * @param {Object} settings - 要分類的設定物件
   * @param {Object} settingsInstance - GlobalSettings 實例，用於調用 isLocalStorageKey 方法
   * @returns {Object} - 包含 syncSettings, localSettings, replaceSettings 的物件
   */
  categorizeSettings(settings, settingsInstance) {
    const syncSettings = {};
    const localSettings = {};
    const replaceSettings = {};

    if (!settings || typeof settings !== 'object') {
      LogUtils.warn('無效的設定物件');
      return { syncSettings, localSettings, replaceSettings };
    }

    Object.entries(settings).forEach(([key, value]) => {
      try {
        // 跳過分塊資料
        if (key.includes('_chunk_') || key.includes('_chunks')) {
          LogUtils.log('跳過分塊資料:', key);
          return;
        }
        
        // 檢查是否為替換規則
        if (this._isReplaceRule(key)) {
          const processedReplaceRule = this._processReplaceRule(key, value);
          if (processedReplaceRule) {
            replaceSettings[processedReplaceRule.key] = processedReplaceRule.value;
          }
        }
        // 檢查是否為需要使用 local storage 的大型文字
        else if (settingsInstance && settingsInstance.isLocalStorageKey && settingsInstance.isLocalStorageKey(key)) {
          localSettings[key] = value;
        }
        // 其他設定使用 sync storage
        else {
          syncSettings[key] = value;
        }
      } catch (error) {
        LogUtils.error(`處理設定 ${key} 時出錯:`, error);
        // 出錯時預設放入 sync storage
        syncSettings[key] = value;
      }
    });

    LogUtils.log('設定分類完成:', {
      syncCount: Object.keys(syncSettings).length,
      localCount: Object.keys(localSettings).length,
      replaceCount: Object.keys(replaceSettings).length
    });

    return { syncSettings, localSettings, replaceSettings };
  },

  /**
   * 過濾有效的設定
   * @param {Object} result - 要過濾的設定物件
   * @returns {Object} - 過濾後的設定物件
   */
  filterValidSettings(result) {
    if (!result || typeof result !== 'object') {
      LogUtils.warn('無效的設定物件');
      return {};
    }

    const filtered = Object.fromEntries(
      Object.entries(result).filter(([key, value]) => {
        // 過濾條件：不是 undefined、null 或空字串
        const isValid = value !== undefined && value !== null && value !== '';
        
        if (!isValid) {
          LogUtils.log(`過濾無效設定: ${key} = ${value}`);
        }
        
        return isValid;
      })
    );

    LogUtils.log('設定過濾完成:', {
      原始數量: Object.keys(result).length,
      過濾後數量: Object.keys(filtered).length
    });

    return filtered;
  },

  /**
   * 檢查是否為替換規則
   * @private
   * @param {string} key - 設定鍵值
   * @returns {boolean} - 是否為替換規則
   */
  _isReplaceRule(key) {
    return key.startsWith('replace_') || 
           key === 'autoReplaceRules' || 
           key === 'manualReplaceRules';
  },

  /**
   * 處理替換規則
   * @private
   * @param {string} key - 原始鍵值
   * @param {*} value - 規則值
   * @returns {Object|null} - 處理後的 {key, value} 或 null
   */
  _processReplaceRule(key, value) {
    try {
      // 確保替換規則有統一的前綴 replace_
      const formattedKey = key.startsWith('replace_') ? key : `replace_${key}`;
      
      // 檢查替換規則的格式並處理
      if (Array.isArray(value)) {
        // 過濾無效的替換規則項
        const filteredValue = value.filter(item => {
          if (!item || typeof item !== 'object') {
            return false;
          }
          
          // 處理自動替換規則（有 enabled 屬性）
          if ('enabled' in item) {
            // 啟用的規則必須有效，未啟用的規則可以保留
            if (item.enabled) {
              return item.from?.trim() || item.to?.trim();
            }
            return true; // 保留未啟用的規則
          }
          
          // 處理手動替換規則
          return item.from?.trim() || item.to?.trim();
        });
        
        return { key: formattedKey, value: filteredValue };
      } else {
        // 如果不是陣列，保持原值
        return { key: formattedKey, value: value };
      }
    } catch (error) {
      LogUtils.error(`處理替換規則 ${key} 時出錯:`, error);
      return null;
    }
  },

  /**
   * 驗證設定結構
   * @param {Object} settings - 要驗證的設定
   * @returns {Object} - 驗證結果 {isValid, errors, warnings}
   */
  validateSettings(settings) {
    const errors = [];
    const warnings = [];

    if (!settings || typeof settings !== 'object') {
      errors.push('設定必須是一個物件');
      return { isValid: false, errors, warnings };
    }

    // 檢查是否有基本的必要設定
    const requiredSettings = ['apiKeys'];
    requiredSettings.forEach(key => {
      if (!(key in settings)) {
        warnings.push(`缺少建議的設定項目: ${key}`);
      }
    });

    // 檢查 API 金鑰格式
    if (settings.apiKeys && typeof settings.apiKeys !== 'object') {
      errors.push('apiKeys 必須是一個物件');
    }

    // 檢查自定義模型格式
    if (settings.customModels && typeof settings.customModels !== 'object') {
      errors.push('customModels 必須是一個物件');
    }

    const isValid = errors.length === 0;

    if (warnings.length > 0) {
      LogUtils.warn('設定驗證警告:', warnings);
    }

    if (errors.length > 0) {
      LogUtils.error('設定驗證錯誤:', errors);
    }

    return { isValid, errors, warnings };
  }
};

// 確保全域可訪問
if (typeof window !== 'undefined') {
  window.SettingsClassifier = window.SettingsClassifier;
}

LogUtils.log('設定分類管理器已載入'); 