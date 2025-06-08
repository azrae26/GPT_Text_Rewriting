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
  /** 中英對照表。 */
  zhEnMapping: '',
  /** 股票清單。 */
  stockList: '',

  /** 爬蟲間隔時間（分鐘）。 */
  crawlerInterval: 30,

  /** 同步功能設定 */
  autoSyncEnabled: false,
  /** 同步間隔（秒）。 */
  syncInterval: 15,

  /** 生成設定組合 */
  generationSettingsGroups: {},
  /** 當前選中的生成設定組合名稱 */
  currentGenerationSettings: '',

  /**
   * 從 Chrome 儲存空間載入設定。
   * @returns {Promise<object>} - 一個 Promise 物件，resolve 後返回載入的設定物件。
   */
  async loadSettings() {
    try {
      // 首次執行清理殭屍項目
      await this.cleanupZombieSettings();
      
      // 改用 chrome.storage.local 來儲存大型文本
      const [syncResult, localResult] = await Promise.all([
        new Promise((resolve) => {
          chrome.storage.sync.get(null, (items) => resolve(items));
        }),
        new Promise((resolve) => {
          chrome.storage.local.get([
            'instruction',          // 新增：全文改寫指令
            'shortInstruction',     // 新增：10字內改寫指令
            'autoRewritePatterns',  // 新增：雙擊改寫匹配模式
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
            'backgroundKnowledge',
            'stockList'
          ], (items) => resolve(items));
        })
      ]);

      // 確保 apiKeys 物件有正確的結構，但不強制添加特定的金鑰
      this.apiKeys = {
        ...(syncResult.apiKeys || {})  // 只載入已保存的金鑰
      };

      // 清理未實際設置的舊 API 金鑰（顯示為 "已設置" 但實際上是空值或預設值）
      console.log('清理未實際設置的 API 金鑰...');
      const keysToRemove = [];
      Object.entries(this.apiKeys).forEach(([key, value]) => {
        // 如果值為空、undefined、null 或者是一些預設的無效值
        if (!value || value === '' || value === 'undefined' || value === 'null' || 
            (typeof value === 'string' && (value === '已設置' || value === '未設置'))) {
          keysToRemove.push(key);
        }
        // 額外清理：移除硬編碼的舊版本模型金鑰，除非是通用金鑰
        else if (key.includes('-1.5-') || key.includes('-2.0-') || key.includes('-exp') || key.includes('-latest')) {
          // 檢查是否有對應的自定義模型正在使用
          const hasMatchingCustomModel = Object.keys(this.customModels).some(modelName => {
            const modelApiType = this.getModelApiType(modelName);
            return modelApiType === 'gemini' && modelName === key;
          });
          
          if (!hasMatchingCustomModel) {
            console.log(`發現舊版本硬編碼金鑰: ${key}，準備移除`);
            keysToRemove.push(key);
          }
        }
      });
      
      if (keysToRemove.length > 0) {
        console.log('移除無效的 API 金鑰:', keysToRemove);
        keysToRemove.forEach(key => delete this.apiKeys[key]);
        // 立即保存更新後的金鑰列表
        chrome.storage.sync.set({ apiKeys: this.apiKeys });
      }

      // 檢查並輸出 API 金鑰狀態
      const apiKeyStatus = {};
      Object.keys(this.apiKeys).forEach(key => {
        apiKeyStatus[key] = this.apiKeys[key] ? '已設置' : '未設置';
      });
      console.log('載入的 API 金鑰:', apiKeyStatus);

      // 一般設定使用 sync
      this.model = syncResult.model || '';
      this.instruction = localResult.instruction || '';           // 修改：從 local storage 載入
      this.shortInstruction = localResult.shortInstruction || ''; // 修改：從 local storage 載入
      this.fullRewriteModel = syncResult.fullRewriteModel || '';
      this.shortRewriteModel = syncResult.shortRewriteModel || '';
      this.autoRewriteModel = syncResult.autoRewriteModel || '';
      this.translateModel = syncResult.translateModel || '';
      this.reflectModel = syncResult.reflectModel || '';
      this.optimizeModel = syncResult.optimizeModel || '';
      this.generateModel = syncResult.generateModel || '';
      this.reflect1Model = syncResult.reflect1Model || '';
      this.generationOptimize_1_Model = syncResult.generationOptimize_1_Model || '';
      this.reflect2Model = syncResult.reflect2Model || '';
      this.generationOptimize_2_Model = syncResult.generationOptimize_2_Model || '';
      this.reflect3Model = syncResult.reflect3Model || '';
      this.generationOptimize_3_Model = syncResult.generationOptimize_3_Model || '';
      this.translateInstruction = localResult.translateInstruction || '';
      this.reflectInstruction = localResult.reflectInstruction || '';
      this.optimizeInstruction = localResult.optimizeInstruction || '';
      this.generateInstruction = localResult.generateInstruction || '';
      this.reflect1Instruction = localResult.reflect1Instruction || '';
      this.generationOptimize_1_Instruction = localResult.generationOptimize_1_Instruction || '';
      this.reflect2Instruction = localResult.reflect2Instruction || '';
      this.generationOptimize_2_Instruction = localResult.generationOptimize_2_Instruction || '';
      this.reflect3Instruction = localResult.reflect3Instruction || '';
      this.generationOptimize_3_Instruction = localResult.generationOptimize_3_Instruction || '';
      this.backgroundKnowledge = localResult.backgroundKnowledge || '';
      this.summaryModel = syncResult.summaryModel || '';
      this.summaryInstruction = localResult.summaryInstruction || '';
      this.zhEnMapping = localResult.zhEnMapping || ''; // 載入中英對照表
      this.stockList = localResult.stockList || ''; // 載入股票清單
      this.crawlerInterval = syncResult.crawlerInterval || 30; // 載入爬蟲間隔
      
      // 載入同步設定
      this.autoSyncEnabled = syncResult.autoSyncEnabled || false;
      this.syncInterval = syncResult.syncInterval || 15;
      
      // 使用 DefaultSettings 中的預設值
          // 取得適當的全域 DefaultSettings
    const defaultSettings = this.getGlobalDefaultSettings();
    this.confirmModel = syncResult.confirmModel === undefined ? defaultSettings?.confirmModel : syncResult.confirmModel;
    this.confirmContent = syncResult.confirmContent === undefined ? defaultSettings?.confirmContent : syncResult.confirmContent;
    this.removeHash = syncResult.removeHash === undefined ? defaultSettings?.removeHash : syncResult.removeHash;
    this.removeStar = syncResult.removeStar === undefined ? defaultSettings?.removeStar : syncResult.removeStar;

      // 更新自動改寫模式 - 修改：從 local storage 載入
      if (localResult.autoRewritePatterns) {
        this.updateAutoRewritePatterns(localResult.autoRewritePatterns);
      } else if (syncResult.autoRewritePatterns) {
        // 向後兼容：如果 local storage 沒有，檢查 sync storage
        this.updateAutoRewritePatterns(syncResult.autoRewritePatterns);
      } else if (defaultSettings?.autoRewritePatterns) {
        this.updateAutoRewritePatterns(defaultSettings.autoRewritePatterns);
      }

      // 如果是首次運行，設置預設值
      if (syncResult.firstRun === undefined) {
        await this.saveSettings();
        chrome.storage.sync.set({ firstRun: false });
      }

      // 載入生成設定組合
      this.generationSettingsGroups = syncResult.generationSettingsGroups || {};
      this.currentGenerationSettings = syncResult.currentGenerationSettings || '';

      // 載入自定義模型
      this.customModels = syncResult.customModels || {};
      
      // 將自定義模型合併到 API.models 中
      // 先清空 API.models，確保只有自定義模型
      this.API.models = {};
      Object.entries(this.customModels).forEach(([key, model]) => {
        this.API.models[key] = model.displayName;
      });

      // 清理舊版本或無效的模型選擇
      console.log('清理舊版本或無效的模型選擇...');
      const modelSettingKeys = [
        'model', 'fullRewriteModel', 'shortRewriteModel', 'autoRewriteModel',
        'translateModel', 'reflectModel', 'optimizeModel', 'generateModel',
        'reflect1Model', 'generationOptimize_1_Model', 'reflect2Model', 
        'generationOptimize_2_Model', 'reflect3Model', 'generationOptimize_3_Model', 
        'summaryModel'
      ];

      let settingsUpdated = false;
      modelSettingKeys.forEach(key => {
        const currentModel = this[key];
        if (currentModel && !this.customModels[currentModel] && !this.API.models[currentModel]) {
          console.log(`發現無效的模型設定 ${key}: ${currentModel}，將其重置為空`);
          this[key] = ''; // 重置為空字串，讓getDefaultModel()選擇第一個可用模型
          settingsUpdated = true;
        } else if (currentModel && (currentModel.includes('-1.5-') || currentModel.includes('-2.0-') || currentModel.includes('-exp'))) {
          // 如果是舊格式的模型名稱，且不在自定義模型列表中，也重置
          if (!this.customModels[currentModel]) {
            console.log(`發現舊格式模型設定 ${key}: ${currentModel}，將其重置為空`);
            this[key] = '';
            settingsUpdated = true;
          }
        }
      });

      if (settingsUpdated) {
        console.log('模型設定已更新，正在保存...');
        // 只保存被修改的模型設定
        const updatedSettingsToSave = {};
        modelSettingKeys.forEach(key => {
          if (this[key] === '') { // 只保存被重置為空的設定
            updatedSettingsToSave[key] = '';
          }
        });
        chrome.storage.sync.set(updatedSettingsToSave);
      }

      console.log('設置載入完成:', {
        model: this.model,
        apiKeysStatus: Object.keys(this.apiKeys).map(key => ({ 
          [key]: this.apiKeys[key] ? '已設置' : '未設置' 
        })),
        customModelsCount: Object.keys(this.customModels).length,
        availableModels: Object.keys(this.API.models)
      });

      return this;
    } catch (error) {
      console.error('載入設置時出錯:', error);
      return this.getGlobalDefaultSettings() || {};
    }
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
      console.warn('轉換匹配模式時出錯:', error);
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
            autoSyncEnabled: this.autoSyncEnabled,
            syncInterval: this.syncInterval
          };
          chrome.storage.sync.set(syncSettings, resolve);
        }),
        // 長文本使用 local
        new Promise((resolve) => {
          chrome.storage.local.set({
            instruction: this.instruction,                          // 新增：全文改寫指令
            shortInstruction: this.shortInstruction,              // 新增：10字內改寫指令
            autoRewritePatterns: this.autoRewritePatterns,        // 新增：雙擊改寫匹配模式
            translateInstruction: this.translateInstruction,
            reflectInstruction: this.reflectInstruction,
            optimizeInstruction: this.optimizeInstruction,
            summaryInstruction: this.summaryInstruction,
            zhEnMapping: this.zhEnMapping,  // 加入中英對照表到本地儲存
            stockList: this.stockList,  // 加入股票清單到本地儲存
            generateInstruction: this.generateInstruction,
            reflect1Instruction: this.reflect1Instruction,
            generationOptimize_1_Instruction: this.generationOptimize_1_Instruction,
            reflect2Instruction: this.reflect2Instruction,
            generationOptimize_2_Instruction: this.generationOptimize_2_Instruction,
            reflect3Instruction: this.reflect3Instruction,
            generationOptimize_3_Instruction: this.generationOptimize_3_Instruction,
            backgroundKnowledge: this.backgroundKnowledge
          }, resolve);
        })
      ]);
    } catch (error) {
      console.warn('保存設置時出錯:', error);
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
      console.group('儲存設定:', key);
      console.log('設定值大小:', new TextEncoder().encode(JSON.stringify(value)).length, 'bytes');
      
      const isLocal = this.isLocalStorageKey(key);
      console.log('是否使用 local storage:', isLocal);

      const storageType = isLocal ? chrome.storage.local : chrome.storage.sync;
      console.log(`使用 ${isLocal ? 'local' : 'sync'} storage 儲存`);

      await new Promise((resolve, reject) => {
        storageType.set({ [key]: value }, () => {
          if (chrome.runtime.lastError) {
            console.error(`儲存到 ${isLocal ? 'local' : 'sync'} storage 失敗:`, chrome.runtime.lastError);
            reject(new Error(`儲存到 ${isLocal ? 'local' : 'sync'} storage 失敗: ${chrome.runtime.lastError.message}`));
          } else {
            console.log(`成功儲存到 ${isLocal ? 'local' : 'sync'} storage`);
            resolve();
          }
        });
      });
      
      this[key] = value;
      console.log('設定值已更新到實例');
      console.groupEnd();
    } catch (error) {
      console.error(`儲存設定 ${key} 失敗:`, error);
      console.groupEnd();
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
      console.warn('儲存模型選擇時出錯:', error);
    }
  },

  // 添加一個輔助方法來檢查 API 金鑰
  hasApiKey(model) {
    if (!model) return false;
    
    const apiType = this.getModelApiType(model);
    const apiKeyName = this.getApiKeyNameForModel(model);
    
    const key = this.apiKeys[apiKeyName];
    return Boolean(key && key.trim());
  },

  /**
   * 儲存生成設定組合
   * @param {string} name - 設定組合名稱
   * @param {object} settings - 設定值
   */
  async saveGenerationSettingsGroup(name, settings) {
    try {
      // 取得當前所有設定組合
      const { generationSettingsGroups = {} } = await new Promise((resolve) => {
        chrome.storage.sync.get(['generationSettingsGroups'], (result) => {
          resolve(result);
        });
      });

      // 準備要儲存的設定
      const settingsToSave = {
        // 模型設定直接存在 sync storage
        models: {
          generateModel: settings.generateModel !== undefined ? settings.generateModel : this.generateModel,
          reflect1Model: settings.reflect1Model !== undefined ? settings.reflect1Model : this.reflect1Model,
          generationOptimize_1_Model: settings.generationOptimize_1_Model !== undefined ? settings.generationOptimize_1_Model : this.generationOptimize_1_Model,
          reflect2Model: settings.reflect2Model !== undefined ? settings.reflect2Model : this.reflect2Model,
          generationOptimize_2_Model: settings.generationOptimize_2_Model !== undefined ? settings.generationOptimize_2_Model : this.generationOptimize_2_Model,
          reflect3Model: settings.reflect3Model !== undefined ? settings.reflect3Model : this.reflect3Model,
          generationOptimize_3_Model: settings.generationOptimize_3_Model !== undefined ? settings.generationOptimize_3_Model : this.generationOptimize_3_Model
        }
      };

      // 更新 sync storage
      generationSettingsGroups[name] = settingsToSave;
      await new Promise((resolve) => {
        chrome.storage.sync.set({
          generationSettingsGroups,
          currentGenerationSettings: name
        }, resolve);
      });

      // 更新本地變數
      this.generationSettingsGroups = generationSettingsGroups;
      this.currentGenerationSettings = name;

      // 儲存指令設定到 local storage
      const instructionSettings = {
        generateInstruction: settings.generateInstruction !== undefined ? settings.generateInstruction : this.generateInstruction,
        reflect1Instruction: settings.reflect1Instruction !== undefined ? settings.reflect1Instruction : this.reflect1Instruction,
        generationOptimize_1_Instruction: settings.generationOptimize_1_Instruction !== undefined ? settings.generationOptimize_1_Instruction : this.generationOptimize_1_Instruction,
        reflect2Instruction: settings.reflect2Instruction !== undefined ? settings.reflect2Instruction : this.reflect2Instruction,
        generationOptimize_2_Instruction: settings.generationOptimize_2_Instruction !== undefined ? settings.generationOptimize_2_Instruction : this.generationOptimize_2_Instruction,
        reflect3Instruction: settings.reflect3Instruction !== undefined ? settings.reflect3Instruction : this.reflect3Instruction,
        generationOptimize_3_Instruction: settings.generationOptimize_3_Instruction !== undefined ? settings.generationOptimize_3_Instruction : this.generationOptimize_3_Instruction,
        backgroundKnowledge: settings.backgroundKnowledge !== undefined ? settings.backgroundKnowledge : this.backgroundKnowledge
      };

      // 使用設定組合名稱作為 key 儲存所有指令設定
      await new Promise((resolve) => {
        chrome.storage.local.set({
          [`instructions_${name}`]: instructionSettings
        }, resolve);
      });

      console.log('設定組合儲存完成');
    } catch (error) {
      console.error('儲存設定組合失敗:', error);
      throw error;
    }
  },

  /**
   * 載入生成設定組合
   * @param {string} name - 設定組合名稱
   */
  async loadGenerationSettingsGroup(name) {
    try {
      if (!name) {
        throw new Error('設定組合名稱為空');
      }

      // 從 sync storage 讀取設定
      const { generationSettingsGroups = {} } = await new Promise((resolve) => {
        chrome.storage.sync.get(['generationSettingsGroups'], (result) => {
          resolve(result);
        });
      });

      const syncSettings = generationSettingsGroups[name];
      if (!syncSettings) {
        throw new Error(`找不到設定組合: ${name}`);
      }

      // 從 local storage 讀取指令設定
      const { [`instructions_${name}`]: instructionSettings = {} } = await new Promise((resolve) => {
        chrome.storage.local.get([`instructions_${name}`], (result) => {
          resolve(result);
        });
      });

      // 更新模型設定
      if (syncSettings.models) {
        Object.entries(syncSettings.models).forEach(([key, value]) => {
          // 只在值不是 undefined 時更新
          if (value !== undefined) this[key] = value;
        });
      }

      // 更新指令設定
      Object.entries(instructionSettings).forEach(([key, value]) => {
        // 只在值不是 undefined 時更新，允許空字串
        if (value !== undefined) this[key] = value;
      });

      // 更新當前設定組合名稱
      await this.saveSingleSetting('currentGenerationSettings', name);

      console.log('設定更新完成');
    } catch (error) {
      console.error('載入設定組合失敗:', error);
      throw error;
    }
  },

  /**
   * 刪除生成設定組合
   * @param {string} name - 設定組合名稱
   */
  async deleteGenerationSettingsGroup(name) {
    try {
      // 刪除本地儲存的指令設定
      await new Promise((resolve) => {
        chrome.storage.local.remove([`instructions_${name}`], resolve);
      });

      // 從 sync storage 中刪除設定組合
      const { generationSettingsGroups = {} } = await new Promise((resolve) => {
        chrome.storage.sync.get(['generationSettingsGroups'], (result) => {
          resolve(result);
        });
      });

      delete generationSettingsGroups[name];
      
      await new Promise((resolve) => {
        chrome.storage.sync.set({ generationSettingsGroups }, resolve);
      });

      // 如果刪除的是當前使用的設定組合，清空當前設定
      if (this.currentGenerationSettings === name) {
        await this.saveSingleSetting('currentGenerationSettings', '');
      }

      // 更新本地變數
      this.generationSettingsGroups = generationSettingsGroups;
      
      console.log('設定組合刪除完成');
    } catch (error) {
      console.error('刪除設定組合失敗:', error);
      throw error;
    }
  },

  /**
   * 獲取當前所有設定值
   * @returns {object} 當前設定值
   */
  getCurrentGenerationSettings() {
    return {
      generateModel: this.generateModel,
      generateInstruction: this.generateInstruction,
      reflect1Model: this.reflect1Model,
      reflect1Instruction: this.reflect1Instruction,
      generationOptimize_1_Model: this.generationOptimize_1_Model,
      generationOptimize_1_Instruction: this.generationOptimize_1_Instruction,
      reflect2Model: this.reflect2Model,
      reflect2Instruction: this.reflect2Instruction,
      generationOptimize_2_Model: this.generationOptimize_2_Model,
      generationOptimize_2_Instruction: this.generationOptimize_2_Instruction,
      reflect3Model: this.reflect3Model,
      reflect3Instruction: this.reflect3Instruction,
      generationOptimize_3_Model: this.generationOptimize_3_Model,
      generationOptimize_3_Instruction: this.generationOptimize_3_Instruction,
      backgroundKnowledge: this.backgroundKnowledge
    };
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

  // 檢查是否為需要使用 local storage 的設定
  isLocalStorageKey(key) {
    // 明確列出需要使用 local storage 的鍵值
    const localStorageKeys = [
      'instruction',          // 新增：全文改寫指令
      'shortInstruction',     // 新增：10字內改寫指令
      'autoRewritePatterns',  // 新增：雙擊改寫匹配模式
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
      'backgroundKnowledge',
      'stockList',
      // 新增：股票相關的大型數據
      'stockListData',
      'stockCrawlerState',
      'stockNames',
      'processedStocks',
      'failedStocks',
      'retryRecords',
      // 新增：替換和確認相關的大型內容
      'replaceContent',
      'confirmContent',
      // 新增：手動替換值
      'manualReplaceValues_0',
      'manualReplaceValues_1',
      'manualReplaceValues_2',
      // 修正：同步開關狀態必須使用 local storage
      'syncEnabled',
      // 修正：時間戳必須使用 local storage（避免設備間時間戳污染）
      'lastModified'
    ];
    
    // 檢查是否為需要使用 local storage 的大型設定
    return (
      localStorageKeys.includes(key) ||
      // 檢查所有替換規則相關的鍵
      key.startsWith('replace_') ||
      key === 'autoReplaceRules' ||
      key === 'manualReplaceRules' ||
      
      // 新增：檢查動態生成的大型設定
      key.startsWith('generation_') ||
      key.startsWith('instructions_') ||
      
      // 檢查其他大型文字內容
      key.startsWith('instruction_') ||
      key.startsWith('background_') ||
      key.startsWith('custom_') ||
      key.startsWith('template_') ||
      key.startsWith('history_') ||
      // 檢查是否包含大型文字的關鍵詞
      key.includes('Content') ||
      key.includes('Templates') ||
      key.includes('Texts')
    );
  },

  // 分類設定到不同的儲存類型
  _categorizeSettings(settings) {
    const syncSettings = {};
    const localSettings = {};
    const replaceSettings = {};

    Object.entries(settings).forEach(([key, value]) => {
      // 跳過分塊資料
      if (key.includes('_chunk_') || key.includes('_chunks')) {
        console.log('跳過分塊資料:', key);
        return;
      }
      
      // 檢查是否為替換規則
      if (key.startsWith('replace_') || key === 'autoReplaceRules' || key === 'manualReplaceRules') {
        // 確保替換規則有統一的前綴 replace_
        const formattedKey = key.startsWith('replace_') ? key : `replace_${key}`;
        
        // 檢查替換規則的格式並處理
        if (Array.isArray(value)) {
          // 過濾無效的替換規則項
          const filteredValue = value.filter(item => {
            if (!item || typeof item !== 'object') return false;
            
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
          
          replaceSettings[formattedKey] = filteredValue;
        } else {
          // 如果不是陣列，保持原值
          replaceSettings[formattedKey] = value;
        }
      }
      // 檢查是否為需要使用 local storage 的大型文字
      else if (this.isLocalStorageKey(key)) {
        localSettings[key] = value;
      }
      // 其他設定使用 sync storage
      else {
        syncSettings[key] = value;
      }
    });

    return { replaceSettings, localSettings, syncSettings };
  },

  // 過濾有效的設定
  _filterValidSettings(result) {
    return Object.fromEntries(
      Object.entries(result).filter(([_, value]) => 
        value !== undefined && value !== null && value !== ''
      )
    );
  },

  // 清理殭屍項目
  async cleanupZombieSettings() {
    try {
      console.log('開始清理殭屍項目...');
      
      // 定義所有殭屍項目
      const zombieKeys = [
        // 完全過時的功能
        'backgroundKnowledgeGroups',
        'instructionGroups',
        'cleaningRules',
        'scraperConfigs', 
        'siteConfigs',
        // 未使用的歷史項目
        'chatHistory',
        'defaultInstructions',
        'allInstructions', 
        'recentInstructions',
        'defaultBackground',
        'allBackgrounds',
        'recentBackgrounds',
        'customInstructionGroups',
        // 代碼變數名（非設定項目）
        'currentRetries',
        'extraManualGroups',
        'manualGroups',
        'replaceGroups'
      ];
      
      // 從 sync storage 清理
      await new Promise((resolve) => {
        chrome.storage.sync.remove(zombieKeys, () => {
          console.log('已從 sync storage 清理殭屍項目');
          resolve();
        });
      });
      
      // 從 local storage 清理
      await new Promise((resolve) => {
        chrome.storage.local.remove(zombieKeys, () => {
          console.log('已從 local storage 清理殭屍項目');
          resolve();
        });
      });
      
      console.log('殭屍項目清理完成');
      return true;
    } catch (error) {
      console.error('清理殭屍項目失敗:', error);
      return false;
    }
  },

  // 取得所有設定
  async getAllSettings() {
    try {
      const [syncData, localData] = await Promise.all([
        this._getChromeStorage('sync'),
        this._getChromeStorage('local')
      ]);
      
      // 排除同步系統內部狀態（這些不應該匯出）
      const internalStateKeys = [
        'syncStatus', 'syncError', 'syncDebugLogs', 'stockCrawlerState',
        'lastSyncTime', 'driveFileId'
        // 注意：移除 'syncEnabled'，允許它被匯出（但不被雲端同步）
      ];
      
      // 從 localData 中移除內部狀態
      internalStateKeys.forEach(key => {
        if (key in localData) {
          delete localData[key];
        }
        if (key in syncData) {
          delete syncData[key];
        }
      });
      
      // 特別處理替換規則，移除前綴
      const replaceSettings = {};
      Object.entries(localData).forEach(([key, value]) => {
        if (key.startsWith('replace_')) {
          replaceSettings[key.replace('replace_', '')] = value;
          delete localData[key];
        }
      });
      
      // 確保重要的設定被包含
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
      
      // 合併所有資料，但確保關鍵設定不被 local storage 覆蓋
      const allData = { 
        ...syncData, 
        ...localData,
        ...replaceSettings,
        ...importantSettings
      };
      
      // 優先使用 sync storage 的關鍵設定（排除時間戳，避免時間戳混亂）
      const syncPriorityKeys = ['apiKeys', 'autoSyncEnabled'];
      
      syncPriorityKeys.forEach(key => {
        if (syncData[key] !== undefined) {
          const beforeValue = allData[key];
          allData[key] = syncData[key];
          
          // 如果值被覆蓋了，記錄日誌
          if (beforeValue !== undefined && beforeValue !== syncData[key]) {
            console.log(`[Settings] 🔄 ${key} 優先使用 sync storage 值: ${beforeValue} -> ${syncData[key]}`);
          }
        }
      });
      
      return this._filterValidSettings(allData);
    } catch (error) {
      console.error('讀取設定失敗:', error);
      throw error;
    }
  },

  // 套用設定
  async applySettings(settings) {
    try {
      console.group('儲存匯入的設定');
      
      if (!settings || Object.keys(settings).length === 0) {
        throw new Error('無效的設定資料');
      }

      // 向後兼容性處理：遷移舊版本的 API 金鑰格式
      if (settings.apiKeys) {
        console.log('檢查並遷移舊版本的 API 金鑰格式...');
        
        // 如果存在舊的 gemini-2.0-flash-exp 金鑰，遷移到新的 gemini 格式
        if (settings.apiKeys['gemini-2.0-flash-exp'] && !settings.apiKeys['gemini']) {
          console.log('發現舊版本 Gemini API 金鑰，正在遷移...');
          settings.apiKeys['gemini'] = settings.apiKeys['gemini-2.0-flash-exp'];
          delete settings.apiKeys['gemini-2.0-flash-exp'];
          console.log('Gemini API 金鑰遷移完成');
        }
        
        // 清理其他可能的舊版本硬編碼金鑰
        const oldKeys = Object.keys(settings.apiKeys).filter(key => 
          key.includes('2.0-flash-exp') || key.includes('1.5-pro') || 
          key.includes('-1.5-') || key.includes('-2.0-') || key.includes('-latest')
        );
        
        if (oldKeys.length > 0) {
          console.log('清理舊版本硬編碼金鑰:', oldKeys);
          oldKeys.forEach(oldKey => {
            // 只有當沒有通用金鑰時，才將舊金鑰值遷移到通用金鑰
            if (oldKey.startsWith('gemini') && !settings.apiKeys['gemini'] && settings.apiKeys[oldKey]) {
              settings.apiKeys['gemini'] = settings.apiKeys[oldKey];
              console.log(`將 ${oldKey} 的值遷移到 gemini`);
            }
            delete settings.apiKeys[oldKey];
          });
        }
        
        // 最後清理空值或無效值
        Object.keys(settings.apiKeys).forEach(key => {
          const value = settings.apiKeys[key];
          if (!value || value === '' || value === 'undefined' || value === 'null' || 
              (typeof value === 'string' && (value === '已設置' || value === '未設置'))) {
            console.log(`清理無效金鑰: ${key}`);
            delete settings.apiKeys[key];
          }
        });
      }

      // 先清空所有儲存空間
      console.log('清空所有儲存空間...');
      await Promise.all([
        new Promise((resolve) => chrome.storage.sync.clear(resolve)),
        new Promise((resolve) => chrome.storage.local.clear(resolve))
      ]);
      console.log('儲存空間已清空');

      // 分類設定
      const { replaceSettings, localSettings, syncSettings } = this._categorizeSettings(settings);
      
      console.log('分類後的設定：');
      console.log('- sync 設定:', Object.keys(syncSettings));
      console.log('- local 設定:', Object.keys(localSettings));
      console.log('- 替換規則:', Object.keys(replaceSettings));

      // 檢查 sync settings 的大小
      const syncSettingsSize = new TextEncoder().encode(JSON.stringify(syncSettings)).length;
      console.log('sync settings 大小:', syncSettingsSize, 'bytes');
      if (syncSettingsSize > 100000) {
        throw new Error('同步設定總大小超過限制 (100KB)');
      }

      // 移除舊的替換規則
      if (Object.keys(replaceSettings).length > 0) {
        console.log('移除舊的替換規則...');
        await chrome.storage.local.remove(Object.keys(replaceSettings));
      }

      // 儲存設定
      console.log('開始儲存設定...');
      await Promise.all([
        Object.keys(syncSettings).length > 0 ? this._setChromeStorage(syncSettings, 'sync') : Promise.resolve(),
        Object.keys(localSettings).length > 0 ? this._setChromeStorage(localSettings, 'local') : Promise.resolve(),
        Object.keys(replaceSettings).length > 0 ? this._setChromeStorage(replaceSettings, 'local') : Promise.resolve()
      ]);

      // 特別處理自定義模型的還原
      if (settings.customModels) {
        console.log('還原自定義模型...');
        this.customModels = settings.customModels;
        
        // 將自定義模型重新載入到 API.models 中
        Object.entries(this.customModels).forEach(([key, model]) => {
          this.API.models[key] = model.displayName;
          console.log(`已還原自定義模型: ${key} -> ${model.displayName}`);
        });
        
        console.log(`共還原 ${Object.keys(this.customModels).length} 個自定義模型`);
      }

      console.log('設定儲存完成');
      console.groupEnd();
    } catch (error) {
      console.error('儲存設定時出錯:', error);
      console.groupEnd();
      throw error;
    }
  },

  // 非阻塞式套用設定（防止 popup 卡死）
  async applySettingsNonBlocking(settings, progressCallback) {
    try {
      console.group('非阻塞式儲存匯入的設定');
      
      if (!settings || Object.keys(settings).length === 0) {
        throw new Error('無效的設定資料');
      }

      // 進度回調
      const updateProgress = (message) => {
        if (progressCallback) progressCallback(message);
      };

      updateProgress('正在處理 API 金鑰...');
      
      // 向後兼容性處理：遷移舊版本的 API 金鑰格式
      if (settings.apiKeys) {
        console.log('檢查並遷移舊版本的 API 金鑰格式...');
        
        // 如果存在舊的 gemini-2.0-flash-exp 金鑰，遷移到新的 gemini 格式
        if (settings.apiKeys['gemini-2.0-flash-exp'] && !settings.apiKeys['gemini']) {
          console.log('發現舊版本 Gemini API 金鑰，正在遷移...');
          settings.apiKeys['gemini'] = settings.apiKeys['gemini-2.0-flash-exp'];
          delete settings.apiKeys['gemini-2.0-flash-exp'];
          console.log('Gemini API 金鑰遷移完成');
        }
        
        // 清理其他可能的舊版本硬編碼金鑰
        const oldKeys = Object.keys(settings.apiKeys).filter(key => 
          key.includes('2.0-flash-exp') || key.includes('1.5-pro') || 
          key.includes('-1.5-') || key.includes('-2.0-') || key.includes('-latest')
        );
        
        if (oldKeys.length > 0) {
          console.log('清理舊版本硬編碼金鑰:', oldKeys);
          oldKeys.forEach(oldKey => {
            // 只有當沒有通用金鑰時，才將舊金鑰值遷移到通用金鑰
            if (oldKey.startsWith('gemini') && !settings.apiKeys['gemini'] && settings.apiKeys[oldKey]) {
              settings.apiKeys['gemini'] = settings.apiKeys[oldKey];
              console.log(`將 ${oldKey} 的值遷移到 gemini`);
            }
            delete settings.apiKeys[oldKey];
          });
        }
        
        // 最後清理空值或無效值
        Object.keys(settings.apiKeys).forEach(key => {
          const value = settings.apiKeys[key];
          if (!value || value === '' || value === 'undefined' || value === 'null' || 
              (typeof value === 'string' && (value === '已設置' || value === '未設置'))) {
            console.log(`清理無效金鑰: ${key}`);
            delete settings.apiKeys[key];
          }
        });
      }

      // 讓出控制權
      await new Promise(resolve => setTimeout(resolve, 50));

      updateProgress('正在清空舊設定...');

      // 非阻塞式清空儲存空間
      console.log('清空同步儲存空間...');
      await new Promise((resolve) => chrome.storage.sync.clear(resolve));
      
      // 讓出控制權
      await new Promise(resolve => setTimeout(resolve, 50));
      
      console.log('清空本地儲存空間...');
      await new Promise((resolve) => chrome.storage.local.clear(resolve));
      
      // 讓出控制權
      await new Promise(resolve => setTimeout(resolve, 50));
      
      console.log('儲存空間已清空');

      updateProgress('正在分類設定資料...');

      // 分類設定
      const { replaceSettings, localSettings, syncSettings } = this._categorizeSettings(settings);
      
      console.log('分類後的設定：');
      console.log('- sync 設定:', Object.keys(syncSettings));
      console.log('- local 設定:', Object.keys(localSettings));
      console.log('- 替換規則:', Object.keys(replaceSettings));

      // 檢查 sync settings 的大小
      const syncSettingsSize = new TextEncoder().encode(JSON.stringify(syncSettings)).length;
      console.log('sync settings 大小:', syncSettingsSize, 'bytes');
      if (syncSettingsSize > 100000) {
        throw new Error('同步設定總大小超過限制 (100KB)');
      }

      // 讓出控制權
      await new Promise(resolve => setTimeout(resolve, 50));

      updateProgress('正在儲存同步設定...');

      // 分批儲存設定
      if (Object.keys(syncSettings).length > 0) {
        console.log('開始儲存同步設定...');
        await this._setChromeStorage(syncSettings, 'sync');
        // 讓出控制權
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      updateProgress('正在儲存本地設定...');

      if (Object.keys(localSettings).length > 0) {
        console.log('開始儲存本地設定...');
        await this._setChromeStorageInBatches(localSettings, 'local', updateProgress);
        // 讓出控制權
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      updateProgress('正在儲存替換規則...');

      if (Object.keys(replaceSettings).length > 0) {
        console.log('開始儲存替換規則...');
        await this._setChromeStorageInBatches(replaceSettings, 'local', updateProgress);
        // 讓出控制權
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      updateProgress('正在還原自定義模型...');

      // 特別處理自定義模型的還原
      if (settings.customModels) {
        console.log('還原自定義模型...');
        this.customModels = settings.customModels;
        
        // 將自定義模型重新載入到 API.models 中
        Object.entries(this.customModels).forEach(([key, model]) => {
          this.API.models[key] = model.displayName;
          console.log(`已還原自定義模型: ${key} -> ${model.displayName}`);
        });
        
        console.log(`共還原 ${Object.keys(this.customModels).length} 個自定義模型`);
        
        // 讓出控制權
        await new Promise(resolve => setTimeout(resolve, 50));
      }

      updateProgress('設定匯入完成');

      console.log('設定儲存完成');
      console.groupEnd();
    } catch (error) {
      console.error('儲存設定時出錯:', error);
      console.groupEnd();
      throw error;
    }
  },

  // 分批儲存到 Chrome storage，避免阻塞
  async _setChromeStorageInBatches(data, type = 'local', progressCallback, batchSize = 5) {
    const entries = Object.entries(data);
    const totalBatches = Math.ceil(entries.length / batchSize);
    
    for (let i = 0; i < entries.length; i += batchSize) {
      const batchNumber = Math.floor(i / batchSize) + 1;
      const batch = Object.fromEntries(entries.slice(i, i + batchSize));
      
      if (progressCallback) {
        progressCallback(`儲存批次 ${batchNumber}/${totalBatches}...`);
      }
      
      await this._setChromeStorage(batch, type);
      
      // 每批次之間讓出控制權
      if (i + batchSize < entries.length) {
        await new Promise(resolve => setTimeout(resolve, 50));
      }
    }
  },

  // Chrome storage 操作的包裝方法，處理 Promise 化
  _getChromeStorage(type = 'sync') {
    return new Promise((resolve, reject) => {
      try {
        chrome.storage[type].get(null, (result) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
          } else {
            resolve(result);
          }
        });
      } catch (error) {
        reject(error);
      }
    });
  },

  // 儲存資料到 Chrome storage，支援前綴功能
  _setChromeStorage(data, type = 'sync', prefix = '') {
    return new Promise((resolve, reject) => {
      const storage = type === 'local' ? chrome.storage.local : chrome.storage.sync;
      
      // 如果有前綴，則為每個 key 添加前綴
      const prefixedData = prefix ? 
        Object.fromEntries(Object.entries(data).map(([key, value]) => [`${prefix}${key}`, value])) :
        data;
      
      // 計算資料大小
      const dataSize = new TextEncoder().encode(JSON.stringify(prefixedData)).length;
      console.log(`嘗試儲存到 ${type} storage，資料大小: ${dataSize} bytes`);
      
      storage.set(prefixedData, () => {
        if (chrome.runtime.lastError) {
          const errorMessage = chrome.runtime.lastError.message;
          console.error(`儲存資料到 ${type} storage 時發生錯誤:`, chrome.runtime.lastError);
          
          // 提供更詳細的錯誤信息
          if (errorMessage.includes('QUOTA_BYTES_PER_ITEM')) {
            reject(new Error(`單一項目大小超過限制 (${type === 'sync' ? '8KB' : '10MB'})。資料大小: ${dataSize} bytes`));
          } else if (errorMessage.includes('QUOTA_BYTES')) {
            reject(new Error(`總儲存空間超過限制 (${type === 'sync' ? '100KB' : '10MB'})。當前資料大小: ${dataSize} bytes`));
          } else {
            reject(new Error(`儲存到 ${type} storage 失敗: ${errorMessage}`));
          }
        } else {
          console.log(`成功儲存資料到 ${type} storage，大小: ${dataSize} bytes`);
          resolve();
        }
      });
    });
  },

  // 自定義模型管理
  async addCustomModel(modelName, displayName, apiType) {
    try {
      if (!modelName || !displayName || !apiType) {
        throw new Error('模型名稱、顯示名稱和API類型都是必填的');
      }

      // 檢查是否已存在
      if (this.customModels[modelName]) {
        throw new Error('模型名稱已存在');
      }

      // 新增自定義模型
      this.customModels[modelName] = {
        displayName: displayName,
        apiType: apiType,
        isCustom: true
      };

      // 也將模型新增到 API.models 中
      this.API.models[modelName] = displayName;

      // 儲存到 storage
      await this.saveSingleSetting('customModels', this.customModels);
      
      console.log(`成功新增自定義模型: ${modelName}`);
      return true;
    } catch (error) {
      console.error('新增自定義模型失敗:', error);
      throw error;
    }
  },

  async removeCustomModel(modelName) {
    try {
      if (!this.customModels[modelName]) {
        throw new Error('找不到指定的自定義模型');
      }

      // 從自定義模型列表中移除
      delete this.customModels[modelName];
      
      // 從 API.models 中移除
      delete this.API.models[modelName];

      // 注意：不要刪除 API 金鑰，因為自定義模型使用對應服務提供商的金鑰
      // 例如自定義的 Gemini 模型使用 'gemini' API 金鑰
      // 例如自定義的 OpenAI 模型使用 'openai' 的金鑰

      // 儲存更新後的自定義模型列表
      await this.saveSingleSetting('customModels', this.customModels);
      
      console.log(`成功移除自定義模型: ${modelName}`);
      return true;
    } catch (error) {
      console.error('移除自定義模型失敗:', error);
      throw error;
    }
  },

  getCustomModels() {
    return this.customModels;
  },

  getAllAvailableModels() {
    // 合併內建模型和自定義模型
    const allModels = { ...this.API.models };
    
    // 確保自定義模型也包含在內
    Object.entries(this.customModels).forEach(([key, model]) => {
      allModels[key] = model.displayName;
    });
    
    return allModels;
  },

  isCustomModel(modelName) {
    return this.customModels[modelName] && this.customModels[modelName].isCustom;
  },

  getModelApiType(modelName) {
    // 檢查是否為自定義模型
    if (this.customModels[modelName]) {
      return this.customModels[modelName].apiType;
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

  // 新增：獲取模型對應的 API 金鑰名稱
  getApiKeyNameForModel(modelName) {
    console.log('[getApiKeyNameForModel] 開始處理模型:', modelName);
    const apiType = this.getModelApiType(modelName);
    console.log('[getApiKeyNameForModel] 模型 API 類型:', apiType);
    console.log('[getApiKeyNameForModel] 當前可用的 API 金鑰:', Object.keys(this.apiKeys));
    
    switch (apiType) {
      case 'gemini':
        // 對於 Gemini 模型，查找可用的 Gemini API 金鑰
        const geminiKeys = Object.keys(this.apiKeys).filter(key => 
          key === 'gemini' && this.apiKeys[key]  // 只查找 'gemini' 金鑰
        );
        console.log('[getApiKeyNameForModel] 找到的 Gemini 金鑰:', geminiKeys);
        if (geminiKeys.length > 0) {
          console.log('[getApiKeyNameForModel] 使用 Gemini 金鑰:', geminiKeys[0]);
          return geminiKeys[0];
        }
        console.log('[getApiKeyNameForModel] 未找到可用的 Gemini 金鑰');
        return null;
        
      case 'openai':
        console.log('[getApiKeyNameForModel] 檢查 OpenAI 金鑰');
        if (this.apiKeys['openai'] && this.apiKeys['openai'].trim()) {
          console.log('[getApiKeyNameForModel] 找到 OpenAI 金鑰');
          return 'openai';
        } else {
          console.log('[getApiKeyNameForModel] 未找到可用的 OpenAI 金鑰');
          console.log('[getApiKeyNameForModel] 當前 OpenAI 金鑰值:', this.apiKeys['openai'] || 'undefined');
          return null;
        }
        
      case 'google-translate':
        console.log('[getApiKeyNameForModel] 使用 Google Translate 金鑰');
        return 'google-translate';
        
      default:
        console.error('[getApiKeyNameForModel] 未知 API 類型:', apiType, '模型:', modelName);
        return null;
    }
  },

  // 新增：獲取模型的顯示名稱
  getModelDisplayName(modelName) {
    console.log('[getModelDisplayName] 開始處理模型名稱:', modelName);
    
    if (!modelName) {
      console.log('[getModelDisplayName] 模型名稱為空，返回未知模型');
      return '未知模型';
    }
    
    // 優先檢查 API.models 中是否有對應的顯示名稱
    if (this.API.models[modelName]) {
      console.log('[getModelDisplayName] 找到 API 模型:', this.API.models[modelName]);
      return this.API.models[modelName];
    }
    
    // 檢查是否為自定義模型
    if (this.customModels[modelName]) {
      console.log('[getModelDisplayName] 找到自定義模型:', this.customModels[modelName].displayName);
      return this.customModels[modelName].displayName;
    }
    
    // 如果都沒有，直接返回模型名稱
    console.log('[getModelDisplayName] 沒有找到顯示名稱，返回原始模型名稱:', modelName);
    console.log('[getModelDisplayName] 當前自定義模型列表:', Object.keys(this.customModels));
    console.log('[getModelDisplayName] 當前 API 模型列表:', Object.keys(this.API.models));
    return modelName;
  },

  // 新增：獲取預設模型，如果沒有則返回第一個可用模型
  getDefaultModel() {
    // 如果有設定模型，優先使用
    if (this.model && (this.customModels[this.model] || this.API.models[this.model])) {
      return this.model;
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
