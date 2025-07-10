/**
 * settings-loader.js - 設定載入管理模組
 * 功能：負責設定的載入、清理、驗證和初始化
 * 職責：
 * - 從不同儲存空間載入設定資料
 * - API 金鑰清理和向後兼容處理
 * - 自定義模型載入和 API.models 重建
 * - 模型設定驗證和清理
 * - 首次運行處理和預設值設定
 * 
 * 依賴：
 * - SettingsCleanup.cleanupZombieSettings
 * - Chrome Extensions API (storage.sync, storage.local)
 * - GlobalSettings 預設值和方法
 */

window.SettingsLoader = {
  /**
   * 載入所有設定
   * @param {Object} settingsInstance - GlobalSettings 實例
   * @returns {Promise<Object>} - 載入後的設定實例
   */
  async loadSettings(settingsInstance) {
    try {
      LogUtils.log('開始載入設定...');
      
      // 驗證 settingsInstance 參數
      if (!settingsInstance || typeof settingsInstance !== 'object') {
        throw new Error('settingsInstance 參數無效或未提供');
      }
      
      // 確保 settingsInstance 有必要的屬性結構
      if (typeof settingsInstance.apiKeys === 'undefined') {
        settingsInstance.apiKeys = {};
      }
      if (typeof settingsInstance.customModels === 'undefined') {
        settingsInstance.customModels = {};
      }
      
      // 首次執行清理殭屍項目
      await this._cleanupZombieSettings(settingsInstance);
      
      // 讀取儲存資料
      const { syncResult, localResult } = await this._loadStorageData();
      
      // 處理 API 金鑰
      this._processApiKeys(settingsInstance, syncResult);
      
      // 載入基本設定
      this._loadBasicSettings(settingsInstance, syncResult, localResult);
      
      // 載入預設值設定
      this._loadDefaultValueSettings(settingsInstance, syncResult);
      
      // 處理自動改寫模式
      await this._processAutoRewritePatterns(settingsInstance, syncResult, localResult);
      
      // 處理首次運行
      await this._handleFirstRun(settingsInstance, syncResult);
      
      // 載入生成設定組合
      this._loadGenerationSettings(settingsInstance, syncResult);
      
      // 載入和處理自定義模型
      this._loadCustomModels(settingsInstance, syncResult);
      
      // 清理無效的模型設定
      await this._cleanupInvalidModelSettings(settingsInstance);
      
      // 記錄載入結果
      this._logLoadingResults(settingsInstance);

      LogUtils.log('設定載入完成');
      return settingsInstance;
    } catch (error) {
      LogUtils.error('載入設置時出錯:', error);
      // 確保 settingsInstance 存在且有效
      if (settingsInstance && typeof settingsInstance.getGlobalDefaultSettings === 'function') {
        return settingsInstance.getGlobalDefaultSettings();
      } else {
        // 如果 settingsInstance 無效，返回基本的預設設定
        return {
          apiKeys: {},
          model: '',
          instruction: '',
          translateInstruction: '',
          customModels: {}
        };
      }
    }
  },

  /**
   * 清理殭屍項目
   * @private
   * @param {Object} settingsInstance - GlobalSettings 實例
   */
  async _cleanupZombieSettings(settingsInstance) {
    if (window.SettingsCleanup) {
      await window.SettingsCleanup.cleanupZombieSettings();
    } else {
      LogUtils.warn('SettingsCleanup 未載入，使用後備清理方法');
      await settingsInstance.cleanupZombieSettings();
    }
  },

  /**
   * 載入儲存資料
   * @private
   * @returns {Promise<Object>} - {syncResult, localResult}
   */
  async _loadStorageData() {
    const [syncResult, localResult] = await Promise.all([
      // 載入所有同步資料
      new Promise((resolve) => {
        chrome.storage.sync.get(null, (items) => {
          if (chrome.runtime.lastError) {
            LogUtils.warn('同步儲存載入警告:', chrome.runtime.lastError);
            resolve({});
          } else {
            resolve(items);
          }
        });
      }),
      // 載入特定的本地資料
      new Promise((resolve) => {
        const localKeys = [
          'instruction',          // 全文改寫指令
          'shortInstruction',     // 10字內改寫指令
          'autoRewritePatterns',  // 雙擊改寫匹配模式
          'translateInstruction', 
          'summaryInstruction',
          'codeCheckInstruction', // 代號檢查指令
          'codeCheckModel',       // 代號檢查模型
          'zhEnMapping',
          'reflectInstruction',
          'optimizeInstruction',
          'generateInstruction',
          'reflect1Instruction',
          'generationOptimize_1_Instruction',
          'reflect2Instruction',
          'generationOptimize_2_Instruction',
          'reflect3Instruction',
          'generationOptimize_3_Instruction',
          'backgroundKnowledge',
          'stockList'
        ];
        
        chrome.storage.local.get(localKeys, (items) => {
          if (chrome.runtime.lastError) {
            LogUtils.warn('本地儲存載入警告:', chrome.runtime.lastError);
            resolve({});
          } else {
            resolve(items);
          }
        });
      })
    ]);

    LogUtils.log('儲存資料載入完成:', {
      syncCount: Object.keys(syncResult).length,
      localCount: Object.keys(localResult).length
    });

    return { syncResult, localResult };
  },

  /**
   * 處理 API 金鑰
   * @private
   * @param {Object} settingsInstance - GlobalSettings 實例
   * @param {Object} syncResult - 同步儲存結果
   */
  _processApiKeys(settingsInstance, syncResult) {
    // 確保 apiKeys 物件有正確的結構，但不強制添加特定的金鑰
    settingsInstance.apiKeys = {
      ...(syncResult.apiKeys || {})  // 只載入已保存的金鑰
    };

    // 清理未實際設置的舊 API 金鑰
    LogUtils.log('清理未實際設置的 API 金鑰...');
    const keysToRemove = [];
    
    Object.entries(settingsInstance.apiKeys).forEach(([key, value]) => {
      // 如果值為空、undefined、null 或者是一些預設的無效值
      if (!value || value === '' || value === 'undefined' || value === 'null' || 
          (typeof value === 'string' && (value === '已設置' || value === '未設置'))) {
        keysToRemove.push(key);
      }
      // 額外清理：移除硬編碼的舊版本模型金鑰，除非是通用金鑰
      else if (key.includes('-1.5-') || key.includes('-2.0-') || key.includes('-exp') || key.includes('-latest')) {
        // 檢查是否有對應的自定義模型正在使用
        const hasMatchingCustomModel = Object.keys(settingsInstance.customModels || {}).some(modelName => {
          const modelApiType = settingsInstance.getModelApiType && settingsInstance.getModelApiType(modelName);
          return modelApiType === 'gemini' && modelName === key;
        });
        
        if (!hasMatchingCustomModel) {
          LogUtils.log(`發現舊版本硬編碼金鑰: ${key}，準備移除`);
          keysToRemove.push(key);
        }
      }
    });
    
    if (keysToRemove.length > 0) {
      LogUtils.log('移除無效的 API 金鑰:', keysToRemove);
      keysToRemove.forEach(key => delete settingsInstance.apiKeys[key]);
      
      // 立即保存更新後的金鑰列表
      chrome.storage.sync.set({ apiKeys: settingsInstance.apiKeys }, () => {
        if (chrome.runtime.lastError) {
          LogUtils.warn('保存清理後的 API 金鑰時出現警告:', chrome.runtime.lastError);
        }
      });
    }

    // 檢查並輸出 API 金鑰狀態
    const apiKeyStatus = {};
    Object.keys(settingsInstance.apiKeys).forEach(key => {
      apiKeyStatus[key] = settingsInstance.apiKeys[key] ? '已設置' : '未設置';
    });
    LogUtils.log('載入的 API 金鑰:', apiKeyStatus);
  },

  /**
   * 載入基本設定
   * @private
   * @param {Object} settingsInstance - GlobalSettings 實例
   * @param {Object} syncResult - 同步儲存結果
   * @param {Object} localResult - 本地儲存結果
   */
  _loadBasicSettings(settingsInstance, syncResult, localResult) {
    // 模型設定（同步儲存）
    const syncModelKeys = [
      'model', 'fullRewriteModel', 'shortRewriteModel', 'autoRewriteModel',
      'translateModel', 'reflectModel', 'optimizeModel', 'generateModel',
      'reflect1Model', 'generationOptimize_1_Model', 'reflect2Model', 
      'generationOptimize_2_Model', 'reflect3Model', 'generationOptimize_3_Model', 
      'summaryModel'
    ];
    
    syncModelKeys.forEach(key => {
      settingsInstance[key] = syncResult[key] || '';
    });

    // 指令設定（本地儲存）
    const localInstructionKeys = [
      'instruction', 'shortInstruction', 'translateInstruction', 'reflectInstruction',
      'optimizeInstruction', 'generateInstruction', 'reflect1Instruction',
      'generationOptimize_1_Instruction', 'reflect2Instruction', 'generationOptimize_2_Instruction',
      'reflect3Instruction', 'generationOptimize_3_Instruction', 'backgroundKnowledge',
      'summaryInstruction', 'codeCheckInstruction', 'zhEnMapping', 'stockList'
    ];
    
    localInstructionKeys.forEach(key => {
      settingsInstance[key] = localResult[key] || '';
    });

    // 特殊處理：codeCheckModel 從本地儲存載入
    settingsInstance.codeCheckModel = localResult.codeCheckModel || '';

    // 其他設定
    settingsInstance.crawlerInterval = syncResult.crawlerInterval || 30;
    settingsInstance.autoSyncEnabled = syncResult.autoSyncEnabled || false;

    LogUtils.log('基本設定載入完成');
  },

  /**
   * 載入預設值設定
   * @private
   * @param {Object} settingsInstance - GlobalSettings 實例
   * @param {Object} syncResult - 同步儲存結果
   */
  _loadDefaultValueSettings(settingsInstance, syncResult) {
    // 取得適當的全域 DefaultSettings
    const defaultSettings = settingsInstance.getGlobalDefaultSettings();
    
    // 使用三元運算符處理可能為 false 的布林值
    settingsInstance.confirmModel = syncResult.confirmModel === undefined ? 
      defaultSettings?.confirmModel : syncResult.confirmModel;
    settingsInstance.confirmContent = syncResult.confirmContent === undefined ? 
      defaultSettings?.confirmContent : syncResult.confirmContent;
    settingsInstance.removeHash = syncResult.removeHash === undefined ? 
      defaultSettings?.removeHash : syncResult.removeHash;
    settingsInstance.removeStar = syncResult.removeStar === undefined ? 
      defaultSettings?.removeStar : syncResult.removeStar;

    LogUtils.log('預設值設定載入完成');
  },

  /**
   * 處理自動改寫匹配模式
   * @private
   * @param {Object} settingsInstance - GlobalSettings 實例
   * @param {Object} syncResult - 同步儲存結果
   * @param {Object} localResult - 本地儲存結果
   */
  async _processAutoRewritePatterns(settingsInstance, syncResult, localResult) {
    const defaultSettings = settingsInstance.getGlobalDefaultSettings();
    
    // 優先從 local storage 載入，然後是 sync storage，最後是預設值
    if (localResult.autoRewritePatterns) {
      settingsInstance.updateAutoRewritePatterns(localResult.autoRewritePatterns);
    } else if (syncResult.autoRewritePatterns) {
      // 向後兼容：如果 local storage 沒有，檢查 sync storage
      settingsInstance.updateAutoRewritePatterns(syncResult.autoRewritePatterns);
    } else if (defaultSettings?.autoRewritePatterns) {
      settingsInstance.updateAutoRewritePatterns(defaultSettings.autoRewritePatterns);
    }

    LogUtils.log('自動改寫匹配模式處理完成');
  },

  /**
   * 處理首次運行
   * @private
   * @param {Object} settingsInstance - GlobalSettings 實例
   * @param {Object} syncResult - 同步儲存結果
   */
  async _handleFirstRun(settingsInstance, syncResult) {
    if (syncResult.firstRun === undefined) {
      LogUtils.log('檢測到首次運行，設置預設值...');
      
      try {
        await settingsInstance.saveSettings();
        
        await new Promise((resolve, reject) => {
          chrome.storage.sync.set({ firstRun: false }, () => {
            if (chrome.runtime.lastError) {
              LogUtils.warn('設置首次運行標記時出現警告:', chrome.runtime.lastError);
              reject(chrome.runtime.lastError);
            } else {
              LogUtils.log('首次運行處理完成');
              resolve();
            }
          });
        });
      } catch (error) {
        LogUtils.warn('首次運行處理時出現錯誤:', error);
      }
    }
  },

  /**
   * 載入生成設定組合
   * @private
   * @param {Object} settingsInstance - GlobalSettings 實例
   * @param {Object} syncResult - 同步儲存結果
   */
  _loadGenerationSettings(settingsInstance, syncResult) {
    settingsInstance.generationSettingsGroups = syncResult.generationSettingsGroups || {};
    settingsInstance.currentGenerationSettings = syncResult.currentGenerationSettings || '';

    LogUtils.log('生成設定組合載入完成:', {
      群組數量: Object.keys(settingsInstance.generationSettingsGroups).length,
      當前選擇: settingsInstance.currentGenerationSettings
    });
  },

  /**
   * 載入和處理自定義模型
   * @private
   * @param {Object} settingsInstance - GlobalSettings 實例
   * @param {Object} syncResult - 同步儲存結果
   */
  _loadCustomModels(settingsInstance, syncResult) {
    // 載入自定義模型
    settingsInstance.customModels = syncResult.customModels || {};
    
    // 將自定義模型合併到 API.models 中
    // 先清空 API.models，確保只有自定義模型
    settingsInstance.API.models = {};
    Object.entries(settingsInstance.customModels).forEach(([key, model]) => {
      settingsInstance.API.models[key] = model.displayName;
    });

    LogUtils.log('自定義模型載入完成:', {
      自定義模型數量: Object.keys(settingsInstance.customModels).length,
      可用模型: Object.keys(settingsInstance.API.models)
    });
  },

  /**
   * 清理無效的模型設定
   * @private
   * @param {Object} settingsInstance - GlobalSettings 實例
   */
  async _cleanupInvalidModelSettings(settingsInstance) {
    LogUtils.log('清理舊版本或無效的模型選擇...');
    
    const modelSettingKeys = [
      'model', 'fullRewriteModel', 'shortRewriteModel', 'autoRewriteModel',
      'translateModel', 'reflectModel', 'optimizeModel', 'generateModel',
      'reflect1Model', 'generationOptimize_1_Model', 'reflect2Model', 
      'generationOptimize_2_Model', 'reflect3Model', 'generationOptimize_3_Model', 
      'summaryModel', 'codeCheckModel'
    ];

    let settingsUpdated = false;
    const updatedSettingsToSave = {};
    
    modelSettingKeys.forEach(key => {
      const currentModel = settingsInstance[key];
      
      if (currentModel && !settingsInstance.customModels[currentModel] && !settingsInstance.API.models[currentModel]) {
        LogUtils.log(`發現無效的模型設定 ${key}: ${currentModel}，將其重置為空`);
        settingsInstance[key] = '';
        updatedSettingsToSave[key] = '';
        settingsUpdated = true;
      } else if (currentModel && (currentModel.includes('-1.5-') || currentModel.includes('-2.0-') || currentModel.includes('-exp'))) {
        // 如果是舊格式的模型名稱，且不在自定義模型列表中，也重置
        if (!settingsInstance.customModels[currentModel]) {
          LogUtils.log(`發現舊格式模型設定 ${key}: ${currentModel}，將其重置為空`);
          settingsInstance[key] = '';
          updatedSettingsToSave[key] = '';
          settingsUpdated = true;
        }
      }
    });

    if (settingsUpdated) {
      LogUtils.log('模型設定已更新，正在保存...', updatedSettingsToSave);
      
      try {
        await new Promise((resolve, reject) => {
          chrome.storage.sync.set(updatedSettingsToSave, () => {
            if (chrome.runtime.lastError) {
              LogUtils.warn('保存更新的模型設定時出現警告:', chrome.runtime.lastError);
              reject(chrome.runtime.lastError);
            } else {
              LogUtils.log('模型設定更新完成');
              resolve();
            }
          });
        });
      } catch (error) {
        LogUtils.warn('保存模型設定時出現錯誤:', error);
      }
    }
  },

  /**
   * 記錄載入結果
   * @private
   * @param {Object} settingsInstance - GlobalSettings 實例
   */
  _logLoadingResults(settingsInstance) {
    LogUtils.log('設置載入完成:', {
      model: settingsInstance.model,
      apiKeysStatus: Object.keys(settingsInstance.apiKeys).map(key => ({ 
        [key]: settingsInstance.apiKeys[key] ? '已設置' : '未設置' 
      })),
      customModelsCount: Object.keys(settingsInstance.customModels).length,
      availableModels: Object.keys(settingsInstance.API.models),
      generationGroupsCount: Object.keys(settingsInstance.generationSettingsGroups).length
    });
  },

  /**
   * 驗證載入的設定
   * @param {Object} settingsInstance - 載入後的設定實例
   * @returns {Object} - 驗證結果 {isValid, warnings, statistics}
   */
  validateLoadedSettings(settingsInstance) {
    const warnings = [];
    const statistics = {};

    // 統計資料
    statistics.apiKeysCount = Object.keys(settingsInstance.apiKeys || {}).length;
    statistics.customModelsCount = Object.keys(settingsInstance.customModels || {}).length;
    statistics.hasValidModel = !!settingsInstance.model;
    statistics.generationGroupsCount = Object.keys(settingsInstance.generationSettingsGroups || {}).length;

    // 檢查警告情況
    if (statistics.apiKeysCount === 0) {
      warnings.push('未設置任何 API 金鑰');
    }

    if (statistics.customModelsCount === 0) {
      warnings.push('未配置任何自定義模型');
    }

    if (!statistics.hasValidModel) {
      warnings.push('未選擇預設模型');
    }

    const isValid = warnings.length === 0;

    LogUtils.log('載入設定驗證:', { isValid, warnings, statistics });

    return { isValid, warnings, statistics };
  }
};

// 確保全域可訪問
if (typeof window !== 'undefined') {
  window.SettingsLoader = window.SettingsLoader;
}

LogUtils.log('設定載入管理器已載入'); 