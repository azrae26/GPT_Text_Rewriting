/**
 * settings-exporter.js - 設定匯出管理模組
 * 功能：負責設定的匯出、資料合併和過濾
 * 職責：
 * - 從不同儲存空間讀取設定資料
 * - 過濾不應該匯出的內部狀態
 * - 合併和優化設定資料
 * - 確保關鍵設定的正確性
 * 
 * 依賴：
 * - StorageManager (透過 GlobalSettings)
 * - KeyClassifier (如果可用)
 * - SettingsClassifier.filterValidSettings
 */

window.SettingsExporter = {
  /**
   * 獲取所有設定用於匯出
   * @param {Object} settingsInstance - GlobalSettings 實例
   * @returns {Promise<Object>} - 所有設定的合併物件
   */
  async getAllSettings(settingsInstance) {
    try {
      LogUtils.log('📤 開始獲取所有設定...');
      
      // 讀取所有儲存資料
      const [syncData, localData] = await Promise.all([
        this._getChromeStorage(settingsInstance, 'sync'),
        this._getChromeStorage(settingsInstance, 'local')
      ]);

      LogUtils.log('原始資料大小:', {
        syncCount: Object.keys(syncData).length,
        localCount: Object.keys(localData).length
      });
      
      // 過濾不應該匯出的項目
      const filteredData = this._filterExportData(syncData, localData);
      
      // 確保重要設定被正確包含
      const importantSettings = this._extractImportantSettings(filteredData.syncData);
      
      // 合併所有資料
      const mergedData = this._mergeAllData(
        filteredData.syncData, 
        filteredData.localData, 
        importantSettings
      );
      
      // 應用同步優先權
      const finalData = this._applySyncPriority(mergedData, filteredData.syncData);
      
      // 過濾有效設定
      const validSettings = window.SettingsClassifier 
        ? window.SettingsClassifier.filterValidSettings(finalData)
        : this._fallbackFilterValidSettings(finalData);

      LogUtils.log('設定匯出完成:', {
        最終設定數量: Object.keys(validSettings).length
      });
      
      return validSettings;
    } catch (error) {
      LogUtils.error('讀取設定失敗:', error);
      throw error;
    }
  },

  /**
   * 過濾匯出資料，移除內部狀態
   * @private
   * @param {Object} syncData - 同步儲存資料
   * @param {Object} localData - 本地儲存資料
   * @returns {Object} - 過濾後的 {syncData, localData}
   */
  _filterExportData(syncData, localData) {
    const filteredSyncData = { ...syncData };
    const filteredLocalData = { ...localData };

    // 使用新的統一分類器來過濾匯出設定
    if (typeof KeyClassifier !== 'undefined') {
      LogUtils.log('使用 KeyClassifier 過濾設定');
      
      // 從 localData 和 syncData 中移除不應該匯出的項目
      Object.keys(filteredLocalData).forEach(key => {
        if (KeyClassifier.shouldExclude(key, 'export')) {
          LogUtils.log(`排除 local 設定: ${key}`);
          delete filteredLocalData[key];
        }
      });
      
      Object.keys(filteredSyncData).forEach(key => {
        if (KeyClassifier.shouldExclude(key, 'export')) {
          LogUtils.log(`排除 sync 設定: ${key}`);
          delete filteredSyncData[key];
        }
      });
    } else {
      LogUtils.log('使用後備過濾邏輯');
      
      // 舊版本的後備邏輯（向後兼容）
      const internalStateKeys = [
        'syncStatus', 'syncError', 'syncDebugLogs', 'stockCrawlerState',
        'lastSyncTime', 'driveFileId'
      ];
      
      internalStateKeys.forEach(key => {
        if (key in filteredLocalData) {
          LogUtils.log(`移除 local 內部狀態: ${key}`);
          delete filteredLocalData[key];
        }
        if (key in filteredSyncData) {
          LogUtils.log(`移除 sync 內部狀態: ${key}`);
          delete filteredSyncData[key];
        }
      });
    }

    return { syncData: filteredSyncData, localData: filteredLocalData };
  },

  /**
   * 提取重要設定
   * @private
   * @param {Object} syncData - 同步儲存資料
   * @returns {Object} - 重要設定物件
   */
  _extractImportantSettings(syncData) {
    const importantSettings = {};
    
    // 高亮功能設定
    if (syncData.highlightWords !== undefined) {
      importantSettings.highlightWords = syncData.highlightWords;
    }
    if (syncData.highlightColors !== undefined) {
      importantSettings.highlightColors = syncData.highlightColors;
    }
    
    // UI 狀態設定
    if (syncData.lastMainTab !== undefined) {
      importantSettings.lastMainTab = syncData.lastMainTab;
    }
    if (syncData.lastSubTab !== undefined) {
      importantSettings.lastSubTab = syncData.lastSubTab;
    }
    
    // 自定義模型設定
    if (syncData.customModels !== undefined) {
      importantSettings.customModels = syncData.customModels;
    }

    LogUtils.log('提取重要設定:', Object.keys(importantSettings));
    return importantSettings;
  },

  /**
   * 合併所有資料
   * @private
   * @param {Object} syncData - 同步資料
   * @param {Object} localData - 本地資料
   * @param {Object} importantSettings - 重要設定
   * @returns {Object} - 合併後的資料
   */
  _mergeAllData(syncData, localData, importantSettings) {
    // 合併所有資料，但確保關鍵設定不被 local storage 覆蓋
    const allData = { 
      ...syncData, 
      ...localData,
      ...importantSettings
    };

    LogUtils.log('資料合併完成:', {
      合併後數量: Object.keys(allData).length
    });

    return allData;
  },

  /**
   * 應用同步優先權
   * @private
   * @param {Object} allData - 所有資料
   * @param {Object} syncData - 同步資料
   * @returns {Object} - 應用優先權後的資料
   */
  _applySyncPriority(allData, syncData) {
    // 優先使用 sync storage 的關鍵設定（排除時間戳，避免時間戳混亂）
    const syncPriorityKeys = ['apiKeys', 'autoSyncEnabled'];
    
    syncPriorityKeys.forEach(key => {
      if (syncData[key] !== undefined) {
        const beforeValue = allData[key];
        allData[key] = syncData[key];
        
        // 如果值被覆蓋了，記錄日誌
        if (beforeValue !== undefined && beforeValue !== syncData[key]) {
          LogUtils.log(`🔄 ${key} 優先使用 sync storage 值`);
        }
      }
    });

    return allData;
  },

  /**
   * 委託給 StorageManager 獲取儲存資料
   * @private
   * @param {Object} settingsInstance - GlobalSettings 實例
   * @param {string} type - 儲存類型 ('sync' 或 'local')
   * @returns {Promise<Object>} - 儲存資料
   */
  async _getChromeStorage(settingsInstance, type = 'sync') {
    if (settingsInstance && settingsInstance._getChromeStorage) {
      return settingsInstance._getChromeStorage(type);
    } else {
      throw new Error('[SettingsExporter] 無法訪問儲存管理器');
    }
  },

  /**
   * 後備的設定過濾方法
   * @private
   * @param {Object} result - 要過濾的設定
   * @returns {Object} - 過濾後的設定
   */
  _fallbackFilterValidSettings(result) {
    LogUtils.log('使用後備過濾方法');
    
    return Object.fromEntries(
      Object.entries(result).filter(([_, value]) => 
        value !== undefined && value !== null && value !== ''
      )
    );
  },

  /**
   * 驗證匯出資料的完整性
   * @param {Object} exportedData - 匯出的資料
   * @returns {Object} - 驗證結果 {isValid, warnings, statistics}
   */
  validateExportData(exportedData) {
    const warnings = [];
    const statistics = {};

    if (!exportedData || typeof exportedData !== 'object') {
      return { 
        isValid: false, 
        warnings: ['匯出資料無效'], 
        statistics: {} 
      };
    }

    // 統計資料
    statistics.totalKeys = Object.keys(exportedData).length;
    statistics.hasApiKeys = 'apiKeys' in exportedData;
    statistics.hasCustomModels = 'customModels' in exportedData;
    statistics.hasInstructions = Object.keys(exportedData).some(key => 
      key.includes('Instruction') || key.includes('instruction')
    );

    // 檢查關鍵設定
    if (!statistics.hasApiKeys) {
      warnings.push('缺少 API 金鑰設定');
    }

    if (statistics.totalKeys === 0) {
      warnings.push('匯出資料為空');
    }

    LogUtils.log('匯出資料驗證:', { statistics, warnings });

    return {
      isValid: warnings.length === 0,
      warnings,
      statistics
    };
  }
};

// 確保全域可訪問
if (typeof window !== 'undefined') {
  window.SettingsExporter = window.SettingsExporter;
}

LogUtils.log('設定匯出管理器已載入'); 