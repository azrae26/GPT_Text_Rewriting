/* global chrome */

/**
 * 全局變量和設置模組，管理擴充程式的全局設定。
 */
const GlobalSettings = {
  /** API 相關配置 */
  API: {
    endpoints: {
      gemini: 'https://generativelanguage.googleapis.com/v1beta/models/:model:generateContent',
      openai: 'https://api.openai.com/v1/chat/completions'
    },
    models: {
      'gpt-4': 'GPT-4',
      'gpt-4o-mini': 'GPT-4o mini',
      'gemini-2.0-flash-exp': 'Gemini 2.0 Flash'
    },
    safetySettings: [
      { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
      { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
      { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
      { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" }
    ]
  },

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
  /** 中英對照表。 */
  zhEnMapping: '',

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
      // 改用 chrome.storage.local 來儲存大型文本
      const [syncResult, localResult] = await Promise.all([
        new Promise((resolve) => {
          chrome.storage.sync.get(null, (items) => resolve(items));
        }),
        new Promise((resolve) => {
          chrome.storage.local.get([
            'translateInstruction', 
            'summaryInstruction', 
            'zhEnMapping',
            'reflectInstruction',
            'optimizeInstruction',
            'generateInstruction',
            'reflect1Instruction',
            'generationOptimize_1_Instruction',
            'backgroundKnowledge'
          ], (items) => resolve(items));
        })
      ]);

      // 確保 apiKeys 物件有正確的結構
      this.apiKeys = {
        'openai': '',
        'gemini-2.0-flash-exp': '',
        ...(syncResult.apiKeys || {})  // 合併已保存的金鑰
      };

      // 檢查並輸出 API 金鑰狀態
      console.log('載入的 API 金鑰:', {
        openai: this.apiKeys.openai ? '已設置' : '未設置',
        gemini: this.apiKeys['gemini-2.0-flash-exp'] ? '已設置' : '未設置'
      });

      // 一般設定使用 sync
      this.model = syncResult.model || 'gemini-2.0-flash-exp';
      this.instruction = syncResult.instruction || (window.DefaultSettings?.fullRewriteInstruction || '');
      this.shortInstruction = syncResult.shortInstruction || (window.DefaultSettings?.shortRewriteInstruction || '');
      this.fullRewriteModel = syncResult.fullRewriteModel || this.model;
      this.shortRewriteModel = syncResult.shortRewriteModel || this.model;
      this.autoRewriteModel = syncResult.autoRewriteModel || this.model;
      this.translateModel = syncResult.translateModel || this.model;
      this.reflectModel = syncResult.reflectModel || this.model;
      this.optimizeModel = syncResult.optimizeModel || this.model;
      this.generateModel = syncResult.generateModel || this.model;
      this.reflect1Model = syncResult.reflect1Model || this.model;
      this.generationOptimize_1_Model = syncResult.generationOptimize_1_Model || this.model;
      this.reflect2Model = syncResult.reflect2Model || this.model;
      this.generationOptimize_2_Model = syncResult.generationOptimize_2_Model || this.model;
      this.reflect3Model = syncResult.reflect3Model || this.model;
      this.generationOptimize_3_Model = syncResult.generationOptimize_3_Model || this.model;
      this.translateInstruction = localResult.translateInstruction || 
                                syncResult.translateInstruction || 
                                (window.DefaultSettings?.translateInstruction || '');
      this.reflectInstruction = localResult.reflectInstruction || 
                               syncResult.reflectInstruction || 
                               (window.DefaultSettings?.reflectInstruction || '');
      this.optimizeInstruction = localResult.optimizeInstruction || 
                                syncResult.optimizeInstruction || 
                                (window.DefaultSettings?.optimizeInstruction || '');
      this.generateInstruction = localResult.generateInstruction || 
                                syncResult.generateInstruction || 
                                (window.DefaultSettings?.generateInstruction || '');
      this.reflect1Instruction = localResult.reflect1Instruction || 
                                syncResult.reflect1Instruction || 
                                (window.DefaultSettings?.reflect1Instruction || '');
      this.generationOptimize_1_Instruction = localResult.generationOptimize_1_Instruction || 
                                     syncResult.generationOptimize_1_Instruction || 
                                     (window.DefaultSettings?.generationOptimize_1_Instruction || '');
      this.reflect2Instruction = localResult.reflect2Instruction || 
                                syncResult.reflect2Instruction || 
                                (window.DefaultSettings?.reflect2Instruction || '');
      this.generationOptimize_2_Instruction = localResult.generationOptimize_2_Instruction || 
                                     syncResult.generationOptimize_2_Instruction || 
                                     (window.DefaultSettings?.generationOptimize_2_Instruction || '');
      this.reflect3Instruction = localResult.reflect3Instruction || 
                                syncResult.reflect3Instruction || 
                                (window.DefaultSettings?.reflect3Instruction || '');
      this.generationOptimize_3_Instruction = localResult.generationOptimize_3_Instruction || 
                                     syncResult.generationOptimize_3_Instruction || 
                                     (window.DefaultSettings?.generationOptimize_3_Instruction || '');
      this.backgroundKnowledge = localResult.backgroundKnowledge || 
                                syncResult.backgroundKnowledge || 
                                (window.DefaultSettings?.backgroundKnowledge || '');
      this.summaryModel = syncResult.summaryModel || this.model;
      this.summaryInstruction = localResult.summaryInstruction || 
                               syncResult.summaryInstruction || 
                               (window.DefaultSettings?.summaryInstruction || '');
      this.zhEnMapping = localResult.zhEnMapping || ''; // 載入中英對照表
      
      // 使用 DefaultSettings 中的預設值
      this.confirmModel = syncResult.confirmModel === undefined ? window.DefaultSettings?.confirmModel : syncResult.confirmModel;
      this.confirmContent = syncResult.confirmContent === undefined ? window.DefaultSettings?.confirmContent : syncResult.confirmContent;
      this.removeHash = syncResult.removeHash === undefined ? window.DefaultSettings?.removeHash : syncResult.removeHash;
      this.removeStar = syncResult.removeStar === undefined ? window.DefaultSettings?.removeStar : syncResult.removeStar;

      // 更新自動改寫模式
      if (syncResult.autoRewritePatterns) {
        this.updateAutoRewritePatterns(syncResult.autoRewritePatterns);
      } else if (window.DefaultSettings?.autoRewritePatterns) {
        this.updateAutoRewritePatterns(window.DefaultSettings.autoRewritePatterns);
      }

      // 如果是首次運行，設置預設值
      if (syncResult.firstRun === undefined) {
        await this.saveSettings();
        chrome.storage.sync.set({ firstRun: false });
      }

      // 載入生成設定組合
      this.generationSettingsGroups = syncResult.generationSettingsGroups || {};
      this.currentGenerationSettings = syncResult.currentGenerationSettings || '';

      return this;
    } catch (error) {
      console.error('載入設置時出錯:', error);
      return window.DefaultSettings || {};
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
            instruction: this.instruction,
            shortInstruction: this.shortInstruction,
            autoRewritePatterns: this.autoRewritePatterns.map(pattern => pattern.source),
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
            currentGenerationSettings: this.currentGenerationSettings
          };
          // 移除 translateInstruction，因為它會存在 local storage
          chrome.storage.sync.set(syncSettings, resolve);
        }),
        // 長文本使用 local
        new Promise((resolve) => {
          chrome.storage.local.set({
            translateInstruction: this.translateInstruction,
            reflectInstruction: this.reflectInstruction,
            optimizeInstruction: this.optimizeInstruction,
            summaryInstruction: this.summaryInstruction,
            zhEnMapping: this.zhEnMapping,  // 加入中英對照表到本地儲存
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
      console.group('儲存單一設定');
      console.log('設定鍵:', key);
      // 如果是指令相關的設定，只顯示前 100 個字元
      if (key.toLowerCase().includes('instruction') || key === 'backgroundKnowledge') {
        console.log('設定值:', value?.substring(0, 100) + (value?.length > 100 ? '...' : ''));
      } else {
        console.log('設定值:', value);
      }
      
      // 檢查是否為需要使用 local storage 的大型文本
      const isLocalStorageKey = [
        'translateInstruction', 'summaryInstruction', 'zhEnMapping', 
        'reflectInstruction', 'optimizeInstruction', 'generateInstruction', 
        'reflect1Instruction', 'generationOptimize_1_Instruction', 
        'reflect2Instruction', 'generationOptimize_2_Instruction',
        'reflect3Instruction', 'generationOptimize_3_Instruction',
        'backgroundKnowledge'
      ].includes(key);
      
      console.log('是否使用 local storage:', isLocalStorageKey);

      if (isLocalStorageKey) {
        await new Promise((resolve) => {
          chrome.storage.local.set({ [key]: value }, () => {
            console.log('已儲存到 local storage');
            resolve();
          });
        });
      } else {
        await new Promise((resolve) => {
          chrome.storage.sync.set({ [key]: value }, () => {
            console.log('已儲存到 sync storage');
            resolve();
          });
        });
      }
      
      // 同時更新本地值
      this[key] = value;
      console.log('本地值已更新');
      
      console.groupEnd();
    } catch (error) {
      console.error('儲存單一設定時出錯:', error);
      console.groupEnd();
      throw error;
    }
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
    const isGemini = model.startsWith('gemini');
    const key = this.apiKeys[isGemini ? 'gemini-2.0-flash-exp' : 'openai'];
    return Boolean(key && key.trim());
  },

  /**
   * 保存生成設定組合
   * @param {string} name - 設定組合名稱
   * @param {object} settings - 設定內容
   */
  async saveGenerationSettingsGroup(name, settings) {
    try {
      // 分離大型文本內容和一般設定
      const localSettings = {
        generateInstruction: settings.generateInstruction,
        reflect1Instruction: settings.reflect1Instruction,
        generationOptimize_1_Instruction: settings.generationOptimize_1_Instruction,
        reflect2Instruction: settings.reflect2Instruction,
        generationOptimize_2_Instruction: settings.generationOptimize_2_Instruction,
        reflect3Instruction: settings.reflect3Instruction,
        generationOptimize_3_Instruction: settings.generationOptimize_3_Instruction,
        backgroundKnowledge: settings.backgroundKnowledge
      };

      const syncSettings = {
        generateModel: settings.generateModel,
        reflect1Model: settings.reflect1Model,
        generationOptimize_1_Model: settings.generationOptimize_1_Model,
        reflect2Model: settings.reflect2Model,
        generationOptimize_2_Model: settings.generationOptimize_2_Model,
        reflect3Model: settings.reflect3Model,
        generationOptimize_3_Model: settings.generationOptimize_3_Model
      };

      // 更新本地儲存的設定組合
      const localStorageKey = `generation_settings_${name}`;
      await new Promise((resolve) => {
        chrome.storage.local.set({ [localStorageKey]: localSettings }, resolve);
      });

      // 更新同步儲存的設定組合
      this.generationSettingsGroups[name] = syncSettings;
      await this.saveSingleSetting('generationSettingsGroups', this.generationSettingsGroups);
      await this.saveSingleSetting('currentGenerationSettings', name);
    } catch (error) {
      console.error('保存生成設定組合時出錯:', error);
      throw error;
    }
  },

  /**
   * 載入生成設定組合
   * @param {string} name - 設定組合名稱
   */
  async loadGenerationSettingsGroup(name) {
    try {
      console.group('載入生成設定組合');
      console.log('要載入的設定組合名稱:', name);
      
      const syncSettings = this.generationSettingsGroups[name];
      console.log('從 sync storage 讀取的設定:', syncSettings);
      
      if (!syncSettings) {
        throw new Error(`找不到設定組合: ${name}`);
      }

      // 從本地儲存載入大型文本內容
      const localStorageKey = `generation_settings_${name}`;
      console.log('準備從 local storage 讀取，鍵名:', localStorageKey);
      
      const localSettings = await new Promise((resolve) => {
        chrome.storage.local.get([localStorageKey], (result) => {
          console.log('從 local storage 讀取的結果:', result);
          resolve(result[localStorageKey] || {});
        });
      });

      // 只顯示指令的前 100 個字元
      const truncatedLocalSettings = {};
      Object.entries(localSettings).forEach(([key, value]) => {
        truncatedLocalSettings[key] = value?.substring(0, 100) + (value?.length > 100 ? '...' : '');
      });
      console.log('從 local storage 讀取的設定:', truncatedLocalSettings);

      // 更新所有相關設定
      console.log('開始更新所有設定...');
      
      // 更新本地變數
      this.generateModel = syncSettings.generateModel;
      this.reflect1Model = syncSettings.reflect1Model;
      this.generationOptimize_1_Model = syncSettings.generationOptimize_1_Model;
      this.reflect2Model = syncSettings.reflect2Model;
      this.generationOptimize_2_Model = syncSettings.generationOptimize_2_Model;
      this.reflect3Model = syncSettings.reflect3Model;
      this.generationOptimize_3_Model = syncSettings.generationOptimize_3_Model;
      
      this.generateInstruction = localSettings.generateInstruction;
      this.reflect1Instruction = localSettings.reflect1Instruction;
      this.generationOptimize_1_Instruction = localSettings.generationOptimize_1_Instruction;
      this.reflect2Instruction = localSettings.reflect2Instruction;
      this.generationOptimize_2_Instruction = localSettings.generationOptimize_2_Instruction;
      this.reflect3Instruction = localSettings.reflect3Instruction;
      this.generationOptimize_3_Instruction = localSettings.generationOptimize_3_Instruction;
      this.backgroundKnowledge = localSettings.backgroundKnowledge;
      
      console.log('本地變數已更新');

      // 更新儲存
      await Promise.all([
        // 同步儲存的設定
        this.saveSingleSetting('generateModel', syncSettings.generateModel),
        this.saveSingleSetting('reflect1Model', syncSettings.reflect1Model),
        this.saveSingleSetting('generationOptimize_1_Model', syncSettings.generationOptimize_1_Model),
        this.saveSingleSetting('reflect2Model', syncSettings.reflect2Model),
        this.saveSingleSetting('generationOptimize_2_Model', syncSettings.generationOptimize_2_Model),
        this.saveSingleSetting('reflect3Model', syncSettings.reflect3Model),
        this.saveSingleSetting('generationOptimize_3_Model', syncSettings.generationOptimize_3_Model),

        // 本地儲存的設定
        this.saveSingleSetting('generateInstruction', localSettings.generateInstruction),
        this.saveSingleSetting('reflect1Instruction', localSettings.reflect1Instruction),
        this.saveSingleSetting('generationOptimize_1_Instruction', localSettings.generationOptimize_1_Instruction),
        this.saveSingleSetting('reflect2Instruction', localSettings.reflect2Instruction),
        this.saveSingleSetting('generationOptimize_2_Instruction', localSettings.generationOptimize_2_Instruction),
        this.saveSingleSetting('reflect3Instruction', localSettings.reflect3Instruction),
        this.saveSingleSetting('generationOptimize_3_Instruction', localSettings.generationOptimize_3_Instruction),
        this.saveSingleSetting('backgroundKnowledge', localSettings.backgroundKnowledge),

        this.saveSingleSetting('currentGenerationSettings', name)
      ]);
      
      console.log('所有設定已儲存');
      console.groupEnd();
    } catch (error) {
      console.error('載入生成設定組合時出錯:', error);
      console.groupEnd();
      throw error;
    }
  },

  /**
   * 刪除生成設定組合
   * @param {string} name - 設定組合名稱
   */
  async deleteGenerationSettingsGroup(name) {
    try {
      // 刪除本地儲存的設定
      const localStorageKey = `generation_settings_${name}`;
      await new Promise((resolve) => {
        chrome.storage.local.remove([localStorageKey], resolve);
      });

      // 刪除同步儲存的設定
      delete this.generationSettingsGroups[name];
      await this.saveSingleSetting('generationSettingsGroups', this.generationSettingsGroups);
      if (this.currentGenerationSettings === name) {
        await this.saveSingleSetting('currentGenerationSettings', '');
      }
    } catch (error) {
      console.error('刪除生成設定組合時出錯:', error);
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
  }
};

// 確保 GlobalSettings 可以被其他檔案訪問
window.GlobalSettings = GlobalSettings;
