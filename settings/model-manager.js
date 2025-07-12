/**
 * model-manager.js - 自定義模型管理器
 * 功能：專門負責自定義模型的管理，包含新增、刪除、查詢等功能
 * 職責：
 * - 管理自定義模型的增刪改查
 * - 模型 API 類型判斷
 * - 模型顯示名稱處理
 * - API 金鑰名稱匹配
 * - 預設模型選擇邏輯
 * 
 * 依賴：
 * - Chrome Extensions API (storage)
 * - GlobalSettings (透過 window.GlobalSettings)
 */

const ModelManager = {
  /**
   * 新增自定義模型
   * @param {string} modelName - 模型名稱
   * @param {string} displayName - 顯示名稱
   * @param {string} apiType - API類型 (gemini/openai)
   * @returns {Promise<boolean>} - 成功與否
   */
  async addCustomModel(modelName, displayName, apiType) {
    try {
      if (!modelName || !displayName || !apiType) {
        throw new Error('模型名稱、顯示名稱和API類型都是必填的');
      }

      // 檢查是否已存在
      if (window.GlobalSettings.customModels[modelName]) {
        throw new Error('模型名稱已存在');
      }

      // 新增自定義模型
      window.GlobalSettings.customModels[modelName] = {
        displayName: displayName,
        apiType: apiType,
        isCustom: true
      };

      // 也將模型新增到 API.models 中
      window.GlobalSettings.API.models[modelName] = displayName;

      // 儲存到 storage
      await window.GlobalSettings.saveSingleSetting('customModels', window.GlobalSettings.customModels);
      
      LogUtils.log(`成功新增自定義模型: ${modelName}`);
      return true;
    } catch (error) {
      LogUtils.error('新增自定義模型失敗:', error);
      throw error;
    }
  },

  /**
   * 移除自定義模型
   * @param {string} modelName - 模型名稱
   * @returns {Promise<boolean>} - 成功與否
   */
  async removeCustomModel(modelName) {
    try {
      if (!window.GlobalSettings.customModels[modelName]) {
        throw new Error('找不到指定的自定義模型');
      }

      // 從自定義模型列表中移除
      delete window.GlobalSettings.customModels[modelName];
      
      // 從 API.models 中移除
      delete window.GlobalSettings.API.models[modelName];

      // 注意：不要刪除 API 金鑰，因為自定義模型使用對應服務提供商的金鑰
      // 例如自定義的 Gemini 模型使用 'gemini' API 金鑰
      // 例如自定義的 OpenAI 模型使用 'openai' 的金鑰

      // 儲存更新後的自定義模型列表
      await window.GlobalSettings.saveSingleSetting('customModels', window.GlobalSettings.customModels);
      
      LogUtils.log(`成功移除自定義模型: ${modelName}`);
      return true;
    } catch (error) {
      LogUtils.error('移除自定義模型失敗:', error);
      throw error;
    }
  },

  /**
   * 獲取所有自定義模型
   * @returns {object} - 自定義模型列表
   */
  getCustomModels() {
    return window.GlobalSettings.customModels;
  },

  /**
   * 獲取所有可用模型（內建+自定義）
   * @returns {object} - 所有可用模型
   */
  getAllAvailableModels() {
    // 合併內建模型和自定義模型
    const allModels = { ...window.GlobalSettings.API.models };
    
    // 確保自定義模型也包含在內
    Object.entries(window.GlobalSettings.customModels).forEach(([key, model]) => {
      allModels[key] = model.displayName;
    });
    
    return allModels;
  },

  /**
   * 檢查是否為自定義模型
   * @param {string} modelName - 模型名稱
   * @returns {boolean} - 是否為自定義模型
   */
  isCustomModel(modelName) {
    return window.GlobalSettings.customModels[modelName] && window.GlobalSettings.customModels[modelName].isCustom;
  },

  /**
   * 獲取模型的 API 類型
   * @param {string} modelName - 模型名稱
   * @returns {string} - API類型 (gemini/openai/google-translate/unknown)
   */
  getModelApiType(modelName) {
    // 檢查是否為自定義模型
    if (window.GlobalSettings.customModels[modelName]) {
      return window.GlobalSettings.customModels[modelName].apiType;
    }
    
    // 內建模型的 API 類型判斷
    if (modelName.startsWith('gemini')) {
      return 'gemini';
    } else if (modelName.startsWith('gpt') || modelName === 'openai') {
      return 'openai';
    } else if (modelName === 'google-translate') {
      return 'google-translate';
    }
    
    return 'unknown';
  },

  /**
   * 獲取模型對應的 API 金鑰名稱
   * @param {string} modelName - 模型名稱
   * @returns {string|null} - API金鑰名稱或null
   */
  getApiKeyNameForModel(modelName) {
    LogUtils.log('開始處理模型:', modelName);
    const apiType = this.getModelApiType(modelName);
    LogUtils.log('模型 API 類型:', apiType);
    LogUtils.log('當前可用的 API 金鑰:', Object.keys(window.GlobalSettings.apiKeys));
    
    switch (apiType) {
      case 'gemini':
        // 對於 Gemini 模型，查找可用的 Gemini API 金鑰
        const geminiKeys = Object.keys(window.GlobalSettings.apiKeys).filter(key => 
          key === 'gemini' && window.GlobalSettings.apiKeys[key]  // 只查找 'gemini' 金鑰
        );
        LogUtils.log('找到的 Gemini 金鑰:', geminiKeys);
        if (geminiKeys.length > 0) {
          LogUtils.log('使用 Gemini 金鑰:', geminiKeys[0]);
          return geminiKeys[0];
        }
        LogUtils.log('未找到可用的 Gemini 金鑰');
        return null;
        
      case 'openai':
        LogUtils.log('檢查 OpenAI 金鑰');
        if (window.GlobalSettings.apiKeys['openai'] && window.GlobalSettings.apiKeys['openai'].trim()) {
          LogUtils.log('找到 OpenAI 金鑰');
          return 'openai';
        } else {
          LogUtils.log('未找到可用的 OpenAI 金鑰');
          LogUtils.log('當前 OpenAI 金鑰值:', window.GlobalSettings.apiKeys['openai'] || 'undefined');
          return null;
        }
        
      case 'google-translate':
        LogUtils.log('使用 Google Translate 金鑰');
        return 'google-translate';
        
      default:
        LogUtils.error('未知 API 類型:', apiType, '模型:', modelName);
        return null;
    }
  },

  /**
   * 獲取模型的顯示名稱
   * @param {string} modelName - 模型名稱
   * @returns {string} - 顯示名稱
   */
  getModelDisplayName(modelName) {
    LogUtils.log('開始處理模型名稱:', modelName);
    
    if (!modelName) {
      LogUtils.log('模型名稱為空，返回未知模型');
      return '未知模型';
    }
    
    // 優先檢查 API.models 中是否有對應的顯示名稱
    if (window.GlobalSettings.API.models[modelName]) {
      LogUtils.log('找到 API 模型:', window.GlobalSettings.API.models[modelName]);
      return window.GlobalSettings.API.models[modelName];
    }
    
    // 檢查是否為自定義模型
    if (window.GlobalSettings.customModels[modelName]) {
      LogUtils.log('找到自定義模型:', window.GlobalSettings.customModels[modelName].displayName);
      return window.GlobalSettings.customModels[modelName].displayName;
    }
    
    // 如果都沒有，直接返回模型名稱
    LogUtils.log('沒有找到顯示名稱，返回原始模型名稱:', modelName);
    LogUtils.log('當前自定義模型列表:', Object.keys(window.GlobalSettings.customModels));
    LogUtils.log('當前 API 模型列表:', Object.keys(window.GlobalSettings.API.models));
    return modelName;
  },

  /**
   * 獲取預設模型，如果沒有則返回第一個可用模型
   * @returns {string|null} - 預設模型名稱或null
   */
  getDefaultModel() {
    // 如果有設定模型，優先使用
    if (window.GlobalSettings.model && (window.GlobalSettings.customModels[window.GlobalSettings.model] || window.GlobalSettings.API.models[window.GlobalSettings.model])) {
      return window.GlobalSettings.model;
    }
    
    // 獲取所有可用模型
    const allModels = this.getAllAvailableModels();
    const modelKeys = Object.keys(allModels);
    
    // 如果沒有可用模型，返回 null
    if (modelKeys.length === 0) {
      return null;
    }
    
    // 返回第一個可用模型
    return modelKeys[0];
  }
};

// 暴露到全局 - 兼容不同環境
if (typeof window !== 'undefined') {
  window.ModelManager = ModelManager;
} else if (typeof self !== 'undefined') {
  // Service Worker 環境
  self.ModelManager = ModelManager;
} else if (typeof global !== 'undefined') {
  // Node.js 環境
  global.ModelManager = ModelManager;
}