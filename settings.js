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
      'gpt-4o': 'gpt-4o',
      'gpt-4o-mini': 'gpt-4o-mini',
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
            'reflect2Instruction',
            'generationOptimize_2_Instruction',
            'reflect3Instruction',
            'generationOptimize_3_Instruction',
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
      this.instruction = syncResult.instruction || '';
      this.shortInstruction = syncResult.shortInstruction || '';
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
      this.summaryModel = syncResult.summaryModel || this.model;
      this.summaryInstruction = localResult.summaryInstruction || '';
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
      // 如果是指令相關的設定，檢查是否需要分塊儲存
      if (key.toLowerCase().includes('instruction') || key === 'backgroundKnowledge') {
        const settingSize = new TextEncoder().encode(JSON.stringify(value)).length;
        
        if (settingSize > 8000) {
          // 將文本分成多個塊，每塊不超過 7000 bytes
          const chunks = [];
          let currentChunk = '';
          let currentSize = 0;
          const lines = value.split('\n');
          
          for (const line of lines) {
            const lineSize = new TextEncoder().encode(JSON.stringify(line)).length;
            if (currentSize + lineSize > 7000) {
              chunks.push(currentChunk);
              currentChunk = line;
              currentSize = lineSize;
            } else {
              currentChunk += (currentChunk ? '\n' : '') + line;
              currentSize += lineSize;
            }
          }
          if (currentChunk) {
            chunks.push(currentChunk);
          }
          
          // 儲存分塊信息
          const chunkKeys = chunks.map((_, index) => `${key}_chunk_${index}`);
          await Promise.all([
            new Promise((resolve) => {
              chrome.storage.local.set({ 
                [`${key}_chunks`]: chunkKeys.length,
                ...Object.fromEntries(chunks.map((chunk, index) => [chunkKeys[index], chunk]))
              }, resolve);
            })
          ]);
          
          console.log(`已將 ${key} 分成 ${chunks.length} 個塊儲存`);
          this[key] = value;
          return;
        }
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

      if (isLocalStorageKey) {
        await new Promise((resolve, reject) => {
          chrome.storage.local.set({ [key]: value }, () => {
            if (chrome.runtime.lastError) {
              reject(new Error(`儲存到 local storage 失敗: ${chrome.runtime.lastError.message}`));
            }
            resolve();
          });
        });
      } else {
        await new Promise((resolve, reject) => {
          chrome.storage.sync.set({ [key]: value }, () => {
            if (chrome.runtime.lastError) {
              reject(new Error(`儲存到 sync storage 失敗: ${chrome.runtime.lastError.message}`));
            }
            resolve();
          });
        });
      }
      
      this[key] = value;
    } catch (error) {
      console.error(`儲存設定 ${key} 失敗:`, error);
      throw error;
    }
  },

  /**
   * 從儲存空間讀取設定值，支援分塊讀取
   * @param {string} key - 設定鍵值
   * @returns {Promise<string>} - 完整的設定值
   */
  async loadSettingValue(key) {
    const result = await new Promise((resolve) => {
      chrome.storage.local.get([`${key}_chunks`, key], (items) => {
        resolve(items);
      });
    });

    // 檢查是否有分塊
    if (result[`${key}_chunks`]) {
      const numChunks = result[`${key}_chunks`];
      const chunkKeys = Array.from({length: numChunks}, (_, i) => `${key}_chunk_${i}`);
      
      const chunks = await new Promise((resolve) => {
        chrome.storage.local.get(chunkKeys, (items) => {
          resolve(chunkKeys.map(k => items[k]));
        });
      });
      
      return chunks.join('');
    }

    return result[key];
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
          generateModel: settings.generateModel || this.generateModel,
          reflect1Model: settings.reflect1Model || this.reflect1Model,
          generationOptimize_1_Model: settings.generationOptimize_1_Model || this.generationOptimize_1_Model,
          reflect2Model: settings.reflect2Model || this.reflect2Model,
          generationOptimize_2_Model: settings.generationOptimize_2_Model || this.generationOptimize_2_Model,
          reflect3Model: settings.reflect3Model || this.reflect3Model,
          generationOptimize_3_Model: settings.generationOptimize_3_Model || this.generationOptimize_3_Model
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
        generateInstruction: settings.generateInstruction || this.generateInstruction,
        reflect1Instruction: settings.reflect1Instruction || this.reflect1Instruction,
        generationOptimize_1_Instruction: settings.generationOptimize_1_Instruction || this.generationOptimize_1_Instruction,
        reflect2Instruction: settings.reflect2Instruction || this.reflect2Instruction,
        generationOptimize_2_Instruction: settings.generationOptimize_2_Instruction || this.generationOptimize_2_Instruction,
        reflect3Instruction: settings.reflect3Instruction || this.reflect3Instruction,
        generationOptimize_3_Instruction: settings.generationOptimize_3_Instruction || this.generationOptimize_3_Instruction,
        backgroundKnowledge: settings.backgroundKnowledge || this.backgroundKnowledge
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
          if (value) this[key] = value;
        });
      }

      // 更新指令設定
      Object.entries(instructionSettings).forEach(([key, value]) => {
        if (value) this[key] = value;
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
  }
};

// 確保 GlobalSettings 可以被其他檔案訪問
window.GlobalSettings = GlobalSettings;
