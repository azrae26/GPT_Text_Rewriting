/* global chrome */

/**
 * settings.js - 全局設定管理模組
 * 功能：統一管理擴充程式的所有設定項目，包含 API 配置、模型管理、指令設定等
 * 職責：
 * - 實現雙存儲策略（Sync Storage + Local Storage）
 * - 管理 API 金鑰和自定義模型
 * - 處理各種改寫、翻譯、生成模式的設定
 * - 提供設定的載入、儲存、驗證和清理功能
 * - 管理生成設定組合和設定匯入匯出
 * - 支援存儲容量優化和殭屍設定清理
 * 
 * 依賴：
 * - Chrome Extensions API (storage.sync, storage.local)
 * - 遵循項目儲存策略規範（新功能使用 Local Storage）
 */
const GlobalSettings = {
  /** API 相關配置 */
  API: {
    endpoints: {
      gemini: 'https://generativelanguage.googleapis.com/v1beta/models/:model:generateContent',
      openai: 'https://api.openai.com/v1/chat/completions'
    },
    models: {
      // 初始為空，所有模型都透過自定義模型功能動態新增
    },
    safetySettings: [
      { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
      { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
      { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
      { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" }
    ]
  },

  // 設定檔識別標記
  SETTINGS_IDENTIFIER: {
    appName: 'GPT_Text_Rewriting',
    version: '1.0'
  },

  /** 自定義模型列表 */
  customModels: {},

  /** API 金鑰物件，儲存不同模型的 API 金鑰。 */
  apiKeys: {},
  /** 模型名稱。 */
  model: '',
  /** 改寫指令。 */
  instruction: '',
  /** 短改寫指令。 */
  shortInstruction: '',
  /** 自動改寫匹配模式陣列。 */
  autoRewritePatterns: [],
  /** 全文改寫模型名稱。 */
  fullRewriteModel: '',
  /** 短文本改寫模型名稱。 */
  shortRewriteModel: '',
  /** 自動改寫模型名稱。 */
  autoRewriteModel: '',
  /** 重述模型名稱。 */
  rephraseModel: '',
  /** 重述指令。 */
  rephraseInstruction: '',
  /** 翻譯模型名稱。 */
  translateModel: '',
  /** 翻譯指令。 */
  translateInstruction: '',
  /** 反思模型名稱。 */
  reflectModel: '',
  /** 反思指令。 */
  reflectInstruction: '',
  /** 優化模型名稱。 */
  optimizeModel: '',
  /** 優化指令。 */
  optimizeInstruction: '',
  /** 生成模型名稱。 */
  generateModel: '',
  /** 生成指令。 */
  generateInstruction: '',
  /** 反思一模型名稱。 */
  reflect1Model: '',
  /** 反思一指令。 */
  reflect1Instruction: '',
  /** 生成優化一模型名稱。 */
  generationOptimize_1_Model: '',
  /** 生成優化一指令。 */
  generationOptimize_1_Instruction: '',
  /** 反思二模型名稱。 */
  reflect2Model: '',
  /** 反思二指令。 */
  reflect2Instruction: '',
  /** 生成優化二模型名稱。 */
  generationOptimize_2_Model: '',
  /** 生成優化二指令。 */
  generationOptimize_2_Instruction: '',
  /** 反思三模型名稱。 */
  reflect3Model: '',
  /** 反思三指令。 */
  reflect3Instruction: '',
  /** 生成優化三模型名稱。 */
  generationOptimize_3_Model: '',
  /** 生成優化三指令。 */
  generationOptimize_3_Instruction: '',
  /** 背景知識。 */
  backgroundKnowledge: '',
  /** 摘要模型名稱。 */
  summaryModel: '',
  /** 關鍵要點指令。 */
  summaryInstruction: '',
  /** 代號檢查模型名稱。 */
  codeCheckModel: '',
  /** 代號檢查指令。 */
  codeCheckInstruction: '',
  /** 中英對照表。 */
  zhEnMapping: '',
  /** 股票清單。 */
  stockList: '',
  /** 股票變更記錄（近30日）。 */
  stockChangeLog: '',
  /** 股票爬取執行記錄（近90日）。 */
  stockCrawlLog: '',

  /** 爬蟲間隔時間（分鐘）。 */
  crawlerInterval: 30,

  /** 同步功能設定 */
  autoSyncEnabled: false,

  /** 生成設定組合 */
  generationSettingsGroups: {},
  /** 當前選中的生成設定組合名稱 */
  currentGenerationSettings: '',

  /**
   * 委託給 SettingsLoader 處理設定載入
   * @returns {Promise<object>} - 一個 Promise 物件，resolve 後返回載入的設定物件。
   */
  async loadSettings() {
    const SettingsLoader = this._getGlobalModule('SettingsLoader');
    if (!SettingsLoader) {
      throw new Error('SettingsLoader 未載入，請檢查載入順序');
    }
    return SettingsLoader.loadSettings(this);
  },

  /**
   * 更新自動改寫匹配模式。
   * @param {string} patternsString - 包含自動改寫匹配模式的字串，每行一個模式。
   */
  updateAutoRewritePatterns(patternsString) {
    // 直接儲存原始字串，不做處理
    this.autoRewritePatterns = patternsString;
  },

  /**
   * 獲取處理後的匹配模式陣列
   * @returns {RegExp[]} - 一個 RegExp 陣列，表示處理後的匹配模式。
   */
  getAutoRewritePatterns() {
    try {
      // 當需要使用時才轉換為 RegExp 陣列
      return this.autoRewritePatterns
        .split('\n')
        .map(line => line.trim())
        .filter(line => line && !line.startsWith('//'))
        .map(pattern => new RegExp(pattern.replace(/^\/|\/$/g, ''), 'g'));
    } catch (error) {
      LogUtils.warn('轉換匹配模式時出錯:', error);
      return [];
    }
  },

  /**
   * 儲存設定到 Chrome 儲存空間。
   * @returns {Promise<void>} - 一個 Promise 物件，resolve 後表示設定已儲存。
   */
  async saveSettings() {
    try {
      // 分開儲存
      await Promise.all([
        // 一般設定使用 sync
        new Promise((resolve) => {
          const syncSettings = {
            apiKeys: this.apiKeys,
            model: this.model,
            fullRewriteModel: this.fullRewriteModel,
            shortRewriteModel: this.shortRewriteModel,
            autoRewriteModel: this.autoRewriteModel,
            rephraseModel: this.rephraseModel,
            translateModel: this.translateModel,
            reflectModel: this.reflectModel,
            optimizeModel: this.optimizeModel,
            generateModel: this.generateModel,
            reflect1Model: this.reflect1Model,
            generationOptimize_1_Model: this.generationOptimize_1_Model,
            reflect2Model: this.reflect2Model,
            generationOptimize_2_Model: this.generationOptimize_2_Model,
            reflect3Model: this.reflect3Model,
            generationOptimize_3_Model: this.generationOptimize_3_Model,
            confirmModel: this.confirmModel,
            confirmContent: this.confirmContent,
            removeHash: this.removeHash,
            removeStar: this.removeStar,
            summaryModel: this.summaryModel,
            generationSettingsGroups: this.generationSettingsGroups,
            currentGenerationSettings: this.currentGenerationSettings,
            crawlerInterval: this.crawlerInterval,
            autoSyncEnabled: this.autoSyncEnabled
          };
          chrome.storage.sync.set(syncSettings, resolve);
        }),
        // 長文本使用 local
        new Promise((resolve) => {
          chrome.storage.local.set({
            instruction: this.instruction,                          // 新增：全文改寫指令
            shortInstruction: this.shortInstruction,              // 新增：10字內改寫指令
            autoRewritePatterns: this.autoRewritePatterns,        // 新增：雙擊改寫匹配模式
            rephraseInstruction: this.rephraseInstruction,        // 新增：重述指令
            translateInstruction: this.translateInstruction,
            reflectInstruction: this.reflectInstruction,
            optimizeInstruction: this.optimizeInstruction,
            summaryInstruction: this.summaryInstruction,
            zhEnMapping: this.zhEnMapping,  // 加入中英對照表到本地儲存
            stockList: this.stockList,  // 加入股票清單到本地儲存
            stockChangeLog: this.stockChangeLog,  // 加入股票變更記錄到本地儲存
            generateInstruction: this.generateInstruction,
            reflect1Instruction: this.reflect1Instruction,
            generationOptimize_1_Instruction: this.generationOptimize_1_Instruction,
            reflect2Instruction: this.reflect2Instruction,
            generationOptimize_2_Instruction: this.generationOptimize_2_Instruction,
            reflect3Instruction: this.reflect3Instruction,
            generationOptimize_3_Instruction: this.generationOptimize_3_Instruction,
            backgroundKnowledge: this.backgroundKnowledge,
            customModels: this.customModels  // 新增：自定義模型資料到本地儲存
          }, resolve);
        })
      ]);
    } catch (error) {
      LogUtils.warn('保存設置時出錯:', error);
    }
  },

  /**
   * 儲存單一設定
   * @param {string} key - 設定的鍵
   * @param {any} value - 設定的值
   * @returns {Promise<void>}
   */
  async saveSingleSetting(key, value) {
    try {
      LogUtils.log('儲存設定:', key);
      LogUtils.log('設定值大小:', new TextEncoder().encode(JSON.stringify(value)).length, 'bytes');
      
      const isLocal = this.isLocalStorageKey(key);
      LogUtils.log('是否使用 local storage:', isLocal);

      const storageType = isLocal ? chrome.storage.local : chrome.storage.sync;
      LogUtils.log(`使用 ${isLocal ? 'local' : 'sync'} storage 儲存`);

      await new Promise((resolve, reject) => {
        storageType.set({ [key]: value }, () => {
          if (chrome.runtime.lastError) {
            LogUtils.error(`儲存到 ${isLocal ? 'local' : 'sync'} storage 失敗:`, chrome.runtime.lastError);
            reject(new Error(`儲存到 ${isLocal ? 'local' : 'sync'} storage 失敗: ${chrome.runtime.lastError.message}`));
          } else {
            LogUtils.log(`成功儲存到 ${isLocal ? 'local' : 'sync'} storage`);
            resolve();
          }
        });
      });
      
      this[key] = value;
      LogUtils.log('設定值已更新到實例');
    } catch (error) {
      LogUtils.error(`儲存設定 ${key} 失敗:`, error);
      throw error;
    }
  },

  /**
   * 從儲存空間讀取設定值
   * @param {string} key - 設定鍵值
   * @returns {Promise<string>} - 完整的設定值
   */
  async loadSettingValue(key) {
    const storageType = this.isLocalStorageKey(key) ? chrome.storage.local : chrome.storage.sync;
    
    const result = await new Promise((resolve) => {
      storageType.get([key], (items) => {
        resolve(items[key]);
      });
    });

    return result;
  },

  async saveModelSelection(modelType, value) {
    try {
      await new Promise((resolve) => {
        const settings = {};
        settings[modelType] = value;
        this.saveSingleSetting(modelType, value).then(resolve);
      });
    } catch (error) {
      LogUtils.warn('儲存模型選擇時出錯:', error);
    }
  },

  // 委託給 ApiKeyManager 來檢查 API 金鑰
  hasApiKey(model) {
    const ApiKeyManager = this._getGlobalModule('ApiKeyManager');
    if (!ApiKeyManager) {
      throw new Error('ApiKeyManager 未載入，請檢查載入順序');
    }
    return ApiKeyManager.hasApiKey(model);
  },

  // 委託給 GenerationManager 來儲存生成設定組合
  async saveGenerationSettingsGroup(name, settings) {
    const GenerationManager = this._getGlobalModule('GenerationManager');
    if (!GenerationManager) {
      throw new Error('GenerationManager 未載入，請檢查載入順序');
    }
    return GenerationManager.saveGenerationSettingsGroup(name, settings);
  },

  // 委託給 GenerationManager 來載入生成設定組合
  async loadGenerationSettingsGroup(name) {
    const GenerationManager = this._getGlobalModule('GenerationManager');
    if (!GenerationManager) {
      throw new Error('GenerationManager 未載入，請檢查載入順序');
    }
    return GenerationManager.loadGenerationSettingsGroup(name);
  },

  // 委託給 GenerationManager 來刪除生成設定組合
  async deleteGenerationSettingsGroup(name) {
    const GenerationManager = this._getGlobalModule('GenerationManager');
    if (!GenerationManager) {
      throw new Error('GenerationManager 未載入，請檢查載入順序');
    }
    return GenerationManager.deleteGenerationSettingsGroup(name);
  },

  // 委託給 GenerationManager 來獲取當前生成設定
  getCurrentGenerationSettings() {
    const GenerationManager = this._getGlobalModule('GenerationManager');
    if (!GenerationManager) {
      throw new Error('GenerationManager 未載入，請檢查載入順序');
    }
    return GenerationManager.getCurrentGenerationSettings();
  },

  // 定義需要使用 local storage 的大型文字設定
  LOCAL_STORAGE_KEYS: [
    'translateInstruction',
    'summaryInstruction',
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
    'backgroundKnowledge'
  ],

  // 檢查是否為需要使用 local storage 的設定（使用新的 KeyClassifier，保持向後兼容）
  isLocalStorageKey(key) {
    // 使用新的統一分類器，兼容不同環境（瀏覽器、Service Worker、Node.js）
    const KeyClassifier = this._getGlobalModule('KeyClassifier');
    if (KeyClassifier) {
      return KeyClassifier.getStorageType(key) === 'local';
    }
    
    // 舊版本的後備邏輯（向後兼容）
    const localStorageKeys = [
      'instruction', 'shortInstruction', 'autoRewritePatterns',
      'translateInstruction', 'summaryInstruction', 'zhEnMapping',
      'reflectInstruction', 'optimizeInstruction', 'generateInstruction',
      'reflect1Instruction', 'generationOptimize_1_Instruction',
      'reflect2Instruction', 'generationOptimize_2_Instruction',
      'reflect3Instruction', 'generationOptimize_3_Instruction',
      'backgroundKnowledge', 'stockList', 'stockListData', 'stockCrawlerState',
      'stockNames', 'processedStocks', 'failedStocks', 'retryRecords',
      'replaceContent', 'confirmContent', 'manualReplaceValues_0',
      'manualReplaceValues_1', 'manualReplaceValues_2', 'syncEnabled', 'lastModified',
      'highlightWords', 'highlightColors', 'customModels'  // 新增：自定義模型使用 Local Storage
    ];
    
    return (
      localStorageKeys.includes(key) ||
      key.startsWith('replace_') ||
      key === 'autoReplaceRules' ||
      key === 'manualReplaceRules' ||
      key.startsWith('generation_') ||
      key.startsWith('instructions_') ||
      key.startsWith('instruction_') ||
      key.startsWith('background_') ||
      key.startsWith('custom_') ||
      key.startsWith('template_') ||
      key.startsWith('history_') ||
      key.includes('Content') ||
      key.includes('Templates') ||
      key.includes('Texts')
    );
  },

  // 委託給 SettingsClassifier 處理設定分類
  _categorizeSettings(settings) {
    const SettingsClassifier = this._getGlobalModule('SettingsClassifier');
    if (!SettingsClassifier) {
      throw new Error('SettingsClassifier 未載入，請檢查載入順序');
    }
    return SettingsClassifier.categorizeSettings(settings, this);
  },

  // 過濾有效的設定
  _filterValidSettings(result) {
    return Object.fromEntries(
      Object.entries(result).filter(([_, value]) => 
        value !== undefined && value !== null && value !== ''
      )
    );
  },

  // 委託給 SettingsCleanup 處理殭屍設定清理
  async cleanupZombieSettings() {
    const SettingsCleanup = this._getGlobalModule('SettingsCleanup');
    if (!SettingsCleanup) {
      throw new Error('SettingsCleanup 未載入，請檢查載入順序');
    }
    return SettingsCleanup.cleanupZombieSettings();
  },

  // 委託給 SettingsExporter 處理設定匯出
  async getAllSettings() {
    const SettingsExporter = this._getGlobalModule('SettingsExporter');
    if (!SettingsExporter) {
      throw new Error('SettingsExporter 未載入，請檢查載入順序');
    }
    return SettingsExporter.getAllSettings(this);
  },

  // 委託給 SettingsImporter 處理設定匯入
  async applySettings(settings) {
    const SettingsImporter = this._getGlobalModule('SettingsImporter');
    if (!SettingsImporter) {
      throw new Error('SettingsImporter 未載入，請檢查載入順序');
    }
    return SettingsImporter.applySettings(settings, this);
  },

  // 委託給 SettingsImporter 處理非阻塞式設定匯入
  async applySettingsNonBlocking(settings, progressCallback) {
    const SettingsImporter = this._getGlobalModule('SettingsImporter');
    if (!SettingsImporter) {
      throw new Error('SettingsImporter 未載入，請檢查載入順序');
    }
    return SettingsImporter.applySettingsNonBlocking(settings, this, progressCallback);
  },

  // 委託給 StorageManager 進行分批儲存
  async _setChromeStorageInBatches(data, type = 'local', progressCallback, batchSize = 5) {
    const StorageManager = this._getGlobalModule('StorageManager');
    if (!StorageManager) {
      throw new Error('StorageManager 未載入，請檢查載入順序');
    }
    return StorageManager.setChromeStorageInBatches(data, type, progressCallback, batchSize);
  },

  // 委託給 StorageManager 處理 Chrome storage 操作
  _getChromeStorage(type = 'sync') {
    const StorageManager = this._getGlobalModule('StorageManager');
    if (!StorageManager) {
      throw new Error('StorageManager 未載入，請檢查載入順序');
    }
    return StorageManager.getAllStorageData(type);
  },

  // 委託給 StorageManager 儲存資料到 Chrome storage
  _setChromeStorage(data, type = 'sync', prefix = '') {
    const StorageManager = this._getGlobalModule('StorageManager');
    if (!StorageManager) {
      throw new Error('StorageManager 未載入，請檢查載入順序');
    }
      
    // 如果有前綴，先處理前綴
      const prefixedData = prefix ? 
        Object.fromEntries(Object.entries(data).map(([key, value]) => [`${prefix}${key}`, value])) :
        data;
      
    return StorageManager.setChromeStorage(prefixedData, type, prefix);
  },

  // 委託給 ModelManager 處理自定義模型管理
  async addCustomModel(modelName, displayName, apiType) {
    const ModelManager = this._getGlobalModule('ModelManager');
    if (!ModelManager) {
      throw new Error('ModelManager 未載入，請檢查載入順序');
    }
    return ModelManager.addCustomModel(modelName, displayName, apiType);
  },

  async removeCustomModel(modelName) {
    const ModelManager = this._getGlobalModule('ModelManager');
    if (!ModelManager) {
      throw new Error('ModelManager 未載入，請檢查載入順序');
    }
    return ModelManager.removeCustomModel(modelName);
  },

  getCustomModels() {
    const ModelManager = this._getGlobalModule('ModelManager');
    if (!ModelManager) {
      throw new Error('ModelManager 未載入，請檢查載入順序');
    }
    return ModelManager.getCustomModels();
  },

  getAllAvailableModels() {
    const ModelManager = this._getGlobalModule('ModelManager');
    if (!ModelManager) {
      throw new Error('ModelManager 未載入，請檢查載入順序');
    }
    return ModelManager.getAllAvailableModels();
  },

  isCustomModel(modelName) {
    const ModelManager = this._getGlobalModule('ModelManager');
    if (!ModelManager) {
      throw new Error('ModelManager 未載入，請檢查載入順序');
    }
    return ModelManager.isCustomModel(modelName);
  },

  getModelApiType(modelName) {
    const ModelManager = this._getGlobalModule('ModelManager');
    if (!ModelManager) {
      throw new Error('ModelManager 未載入，請檢查載入順序');
    }
    return ModelManager.getModelApiType(modelName);
  },

  // 委託給 ModelManager 獲取模型對應的 API 金鑰名稱
  getApiKeyNameForModel(modelName) {
    const ModelManager = this._getGlobalModule('ModelManager');
    if (!ModelManager) {
      throw new Error('ModelManager 未載入，請檢查載入順序');
    }
    return ModelManager.getApiKeyNameForModel(modelName);
  },

  // 委託給 ModelManager 獲取模型的顯示名稱
  getModelDisplayName(modelName) {
    const ModelManager = this._getGlobalModule('ModelManager');
    if (!ModelManager) {
      throw new Error('ModelManager 未載入，請檢查載入順序');
    }
    return ModelManager.getModelDisplayName(modelName);
  },

  // 委託給 ModelManager 獲取預設模型
  getDefaultModel() {
    const ModelManager = this._getGlobalModule('ModelManager');
    if (!ModelManager) {
      throw new Error('ModelManager 未載入，請檢查載入順序');
    }
    return ModelManager.getDefaultModel();
  },

  // 取得適當環境的全域 DefaultSettings
  getGlobalDefaultSettings() {
    if (typeof window !== 'undefined' && window.DefaultSettings) {
      return window.DefaultSettings;
    } else if (typeof self !== 'undefined' && self.DefaultSettings) {
      return self.DefaultSettings;
    } else if (typeof global !== 'undefined' && global.DefaultSettings) {
      return global.DefaultSettings;
    }
    return {};
  },

  // 取得適當環境的全域模組 - 兼容不同環境
  _getGlobalModule(moduleName) {
    if (typeof window !== 'undefined' && window[moduleName]) {
      return window[moduleName];
    } else if (typeof self !== 'undefined' && self[moduleName]) {
      return self[moduleName];
    } else if (typeof global !== 'undefined' && global[moduleName]) {
      return global[moduleName];
    }
    return null;
  }
};

// 確保 GlobalSettings 可以被其他檔案訪問
if (typeof window !== 'undefined') {
  // 瀏覽器環境
  window.GlobalSettings = GlobalSettings;
} else if (typeof self !== 'undefined') {
  // Service Worker 環境
  self.GlobalSettings = GlobalSettings;
} else if (typeof global !== 'undefined') {
  // Node.js 環境
  global.GlobalSettings = GlobalSettings;
}
