/**
 * api-key-manager.js - API 金鑰管理器
 * 功能：專門負責 API 金鑰的管理，包含驗證、清理、儲存等功能
 * 職責：
 * - API 金鑰的設定和獲取
 * - 金鑰有效性驗證
 * - 舊版本金鑰清理
 * - 模型對應金鑰查找
 * 
 * 依賴：
 * - Chrome Extensions API (storage)
 * - GlobalSettings (透過 window.GlobalSettings)
 * - ModelManager (透過 window.ModelManager)
 */

const ApiKeyManager = {

  /**
   * 檢查模型是否有對應的 API 金鑰
   * @param {string} model - 模型名稱
   * @returns {boolean} - 是否有對應的API金鑰
   */
  hasApiKey(model) {
    if (!model) return false;
    
    const apiType = window.ModelManager ? 
      window.ModelManager.getModelApiType(model) : 
      this._fallbackGetModelApiType(model);
    
    switch (apiType) {
      case 'gemini':
        return !!(window.GlobalSettings.apiKeys['gemini'] && window.GlobalSettings.apiKeys['gemini'].trim());
      case 'openai':
        return !!(window.GlobalSettings.apiKeys['openai'] && window.GlobalSettings.apiKeys['openai'].trim());
      case 'google-translate':
        return true; // Google Translate 不需要 API 金鑰
      default:
        return false;
    }
  },

  /**
   * 設定 API 金鑰
   * @param {string} apiType - API 類型 (gemini/openai)
   * @param {string} apiKey - API 金鑰
   * @returns {Promise<void>}
   */
  async setApiKey(apiType, apiKey) {
    try {
      if (!apiType || typeof apiKey !== 'string') {
        throw new Error('API 類型和金鑰都是必填的');
      }

      // 清理空白字符
      const cleanedKey = apiKey.trim();
      
      if (cleanedKey === '') {
        // 如果是空字串，則刪除該金鑰
        delete window.GlobalSettings.apiKeys[apiType];
      } else {
        // 設定新的金鑰
        window.GlobalSettings.apiKeys[apiType] = cleanedKey;
      }

      // 儲存到 storage
      await window.GlobalSettings.saveSingleSetting('apiKeys', window.GlobalSettings.apiKeys);
      
      console.log(`[ApiKeyManager] 成功設定 ${apiType} API 金鑰`);
    } catch (error) {
      console.error('[ApiKeyManager] 設定 API 金鑰失敗:', error);
      throw error;
    }
  },

  /**
   * 獲取 API 金鑰
   * @param {string} apiType - API 類型
   * @returns {string} - API 金鑰
   */
  getApiKey(apiType) {
    return window.GlobalSettings.apiKeys[apiType] || '';
  },

  /**
   * 獲取所有 API 金鑰
   * @returns {object} - 所有API金鑰
   */
  getAllApiKeys() {
    return { ...window.GlobalSettings.apiKeys };
  },

  /**
   * 清理無效的 API 金鑰
   * @returns {Promise<number>} - 清理的金鑰數量
   */
  async cleanupInvalidApiKeys() {
    try {
      const keysToRemove = [];
      
      Object.entries(window.GlobalSettings.apiKeys).forEach(([key, value]) => {
        // 如果值為空、undefined、null 或者是一些預設的無效值
        if (!value || value === '' || value === 'undefined' || value === 'null' || 
            (typeof value === 'string' && (value === '已設置' || value === '未設置'))) {
          keysToRemove.push(key);
        }
        // 額外清理：移除硬編碼的舊版本模型金鑰，除非是通用金鑰
        else if (key.includes('-1.5-') || key.includes('-2.0-') || key.includes('-exp') || key.includes('-latest')) {
          // 檢查是否有對應的自定義模型正在使用
          const hasMatchingCustomModel = Object.keys(window.GlobalSettings.customModels).some(modelName => {
            const modelApiType = window.ModelManager ? 
              window.ModelManager.getModelApiType(modelName) : 
              this._fallbackGetModelApiType(modelName);
            return modelApiType === 'gemini' && modelName === key;
          });
          
          if (!hasMatchingCustomModel) {
            console.log(`[ApiKeyManager] 發現舊版本硬編碼金鑰: ${key}，準備移除`);
            keysToRemove.push(key);
          }
        }
      });
      
      if (keysToRemove.length > 0) {
        console.log('[ApiKeyManager] 移除無效的 API 金鑰:', keysToRemove);
        keysToRemove.forEach(key => delete window.GlobalSettings.apiKeys[key]);
        
        // 立即保存更新後的金鑰列表
        await window.GlobalSettings.saveSingleSetting('apiKeys', window.GlobalSettings.apiKeys);
      }
      
      return keysToRemove.length;
    } catch (error) {
      console.error('[ApiKeyManager] 清理無效 API 金鑰失敗:', error);
      return 0;
    }
  },

  /**
   * 驗證 API 金鑰格式
   * @param {string} apiType - API 類型
   * @param {string} apiKey - API 金鑰
   * @returns {boolean} - 是否有效
   */
  validateApiKeyFormat(apiType, apiKey) {
    if (!apiKey || typeof apiKey !== 'string') {
      return false;
    }

    const cleanedKey = apiKey.trim();
    
    switch (apiType) {
      case 'gemini':
        // Gemini API 金鑰通常以 AIza 開頭
        return cleanedKey.startsWith('AIza') && cleanedKey.length > 20;
      case 'openai':
        // OpenAI API 金鑰通常以 sk- 開頭
        return cleanedKey.startsWith('sk-') && cleanedKey.length > 20;
      default:
        // 對於其他類型，只要不是空字串就認為有效
        return cleanedKey.length > 0;
    }
  },

  /**
   * 獲取 API 金鑰狀態
   * @param {string} apiType - API 類型
   * @returns {object} - 金鑰狀態信息
   */
  getApiKeyStatus(apiType) {
    const apiKey = this.getApiKey(apiType);
    const hasKey = !!apiKey;
    const isValid = hasKey ? this.validateApiKeyFormat(apiType, apiKey) : false;
    
    return {
      hasKey: hasKey,
      isValid: isValid,
      displayText: hasKey ? '已設置' : '未設置',
      keyLength: hasKey ? apiKey.length : 0
    };
  },

  /**
   * 後備的模型 API 類型判斷（當 ModelManager 不可用時）
   * @private
   * @param {string} modelName - 模型名稱
   * @returns {string} - API類型
   */
  _fallbackGetModelApiType(modelName) {
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
  }
};

// 暴露到全局
if (typeof window !== 'undefined') {
  window.ApiKeyManager = ApiKeyManager;
} 