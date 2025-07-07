/**
 * generation-manager.js - 生成設定管理器
 * 功能：管理生成設定組合的建立、載入、儲存、刪除功能
 * 職責：
 * - 處理生成設定組合的完整CRUD操作
 * - 分離模型設定（sync storage）和指令設定（local storage）的儲存策略
 * - 管理當前選中的生成設定組合
 * - 提供設定值的統一獲取介面
 * 
 * 依賴：
 * - Chrome Extensions API (storage.sync, storage.local)
 * - GlobalSettings（用於取得當前設定值和委託操作）
 */
window.GenerationManager = {
  /**
   * 儲存生成設定組合
   * @param {string} name - 設定組合名稱
   * @param {object} settings - 設定值
   * @returns {Promise<void>}
   */
  async saveGenerationSettingsGroup(name, settings) {
    try {
      console.log('[GenerationManager] 開始儲存生成設定組合:', name);
      
      if (!name || typeof name !== 'string') {
        throw new Error('設定組合名稱無效');
      }

      // 取得當前所有設定組合
      const { generationSettingsGroups = {} } = await new Promise((resolve) => {
        chrome.storage.sync.get(['generationSettingsGroups'], (result) => {
          if (chrome.runtime.lastError) {
            console.error('[GenerationManager] 讀取設定組合失敗:', chrome.runtime.lastError);
            resolve({});
          } else {
            resolve(result);
          }
        });
      });

      // 準備要儲存到 sync storage 的模型設定
      const modelSettings = {
        generateModel: settings.generateModel !== undefined ? settings.generateModel : window.GlobalSettings.generateModel,
        reflect1Model: settings.reflect1Model !== undefined ? settings.reflect1Model : window.GlobalSettings.reflect1Model,
        generationOptimize_1_Model: settings.generationOptimize_1_Model !== undefined ? settings.generationOptimize_1_Model : window.GlobalSettings.generationOptimize_1_Model,
        reflect2Model: settings.reflect2Model !== undefined ? settings.reflect2Model : window.GlobalSettings.reflect2Model,
        generationOptimize_2_Model: settings.generationOptimize_2_Model !== undefined ? settings.generationOptimize_2_Model : window.GlobalSettings.generationOptimize_2_Model,
        reflect3Model: settings.reflect3Model !== undefined ? settings.reflect3Model : window.GlobalSettings.reflect3Model,
        generationOptimize_3_Model: settings.generationOptimize_3_Model !== undefined ? settings.generationOptimize_3_Model : window.GlobalSettings.generationOptimize_3_Model
      };

      const settingsToSave = {
        models: modelSettings,
        createdAt: new Date().toISOString(),
        lastModified: new Date().toISOString()
      };

      // 更新 sync storage
      generationSettingsGroups[name] = settingsToSave;
      await new Promise((resolve, reject) => {
        chrome.storage.sync.set({
          generationSettingsGroups,
          currentGenerationSettings: name
        }, () => {
          if (chrome.runtime.lastError) {
            console.error('[GenerationManager] 儲存模型設定失敗:', chrome.runtime.lastError);
            reject(chrome.runtime.lastError);
          } else {
            resolve();
          }
        });
      });

      // 準備要儲存到 local storage 的指令設定
      const instructionSettings = {
        generateInstruction: settings.generateInstruction !== undefined ? settings.generateInstruction : window.GlobalSettings.generateInstruction,
        reflect1Instruction: settings.reflect1Instruction !== undefined ? settings.reflect1Instruction : window.GlobalSettings.reflect1Instruction,
        generationOptimize_1_Instruction: settings.generationOptimize_1_Instruction !== undefined ? settings.generationOptimize_1_Instruction : window.GlobalSettings.generationOptimize_1_Instruction,
        reflect2Instruction: settings.reflect2Instruction !== undefined ? settings.reflect2Instruction : window.GlobalSettings.reflect2Instruction,
        generationOptimize_2_Instruction: settings.generationOptimize_2_Instruction !== undefined ? settings.generationOptimize_2_Instruction : window.GlobalSettings.generationOptimize_2_Instruction,
        reflect3Instruction: settings.reflect3Instruction !== undefined ? settings.reflect3Instruction : window.GlobalSettings.reflect3Instruction,
        generationOptimize_3_Instruction: settings.generationOptimize_3_Instruction !== undefined ? settings.generationOptimize_3_Instruction : window.GlobalSettings.generationOptimize_3_Instruction,
        backgroundKnowledge: settings.backgroundKnowledge !== undefined ? settings.backgroundKnowledge : window.GlobalSettings.backgroundKnowledge,
        createdAt: new Date().toISOString(),
        lastModified: new Date().toISOString()
      };

      // 儲存指令設定到 local storage
      await new Promise((resolve, reject) => {
        chrome.storage.local.set({
          [`instructions_${name}`]: instructionSettings
        }, () => {
          if (chrome.runtime.lastError) {
            console.error('[GenerationManager] 儲存指令設定失敗:', chrome.runtime.lastError);
            reject(chrome.runtime.lastError);
          } else {
            resolve();
          }
        });
      });

      // 更新 GlobalSettings 的本地變數
      if (window.GlobalSettings) {
        window.GlobalSettings.generationSettingsGroups = generationSettingsGroups;
        window.GlobalSettings.currentGenerationSettings = name;
      }

      console.log('[GenerationManager] 生成設定組合儲存完成:', name);
    } catch (error) {
      console.error('[GenerationManager] 儲存生成設定組合失敗:', error);
      throw error;
    }
  },

  /**
   * 載入生成設定組合
   * @param {string} name - 設定組合名稱
   * @returns {Promise<object>} 載入的設定物件
   */
  async loadGenerationSettingsGroup(name) {
    try {
      console.log('[GenerationManager] 開始載入生成設定組合:', name);
      
      if (!name || typeof name !== 'string') {
        throw new Error('設定組合名稱無效');
      }

      // 從 sync storage 讀取模型設定
      const { generationSettingsGroups = {} } = await new Promise((resolve) => {
        chrome.storage.sync.get(['generationSettingsGroups'], (result) => {
          if (chrome.runtime.lastError) {
            console.error('[GenerationManager] 讀取模型設定失敗:', chrome.runtime.lastError);
            resolve({});
          } else {
            resolve(result);
          }
        });
      });

      const syncSettings = generationSettingsGroups[name];
      if (!syncSettings) {
        throw new Error(`找不到生成設定組合: ${name}`);
      }

      // 從 local storage 讀取指令設定
      const { [`instructions_${name}`]: instructionSettings = {} } = await new Promise((resolve) => {
        chrome.storage.local.get([`instructions_${name}`], (result) => {
          if (chrome.runtime.lastError) {
            console.error('[GenerationManager] 讀取指令設定失敗:', chrome.runtime.lastError);
            resolve({});
          } else {
            resolve(result);
          }
        });
      });

      const loadedSettings = {
        ...syncSettings.models,
        ...instructionSettings
      };

      // 更新 GlobalSettings 的設定值
      if (window.GlobalSettings) {
        // 更新模型設定
        if (syncSettings.models) {
          Object.entries(syncSettings.models).forEach(([key, value]) => {
            if (value !== undefined) {
              window.GlobalSettings[key] = value;
            }
          });
        }

        // 更新指令設定
        Object.entries(instructionSettings).forEach(([key, value]) => {
          if (value !== undefined) {
            window.GlobalSettings[key] = value;
          }
        });

        // 更新當前設定組合名稱
        await window.GlobalSettings.saveSingleSetting('currentGenerationSettings', name);
      }

      console.log('[GenerationManager] 生成設定組合載入完成:', name);
      return loadedSettings;
    } catch (error) {
      console.error('[GenerationManager] 載入生成設定組合失敗:', error);
      throw error;
    }
  },

  /**
   * 刪除生成設定組合
   * @param {string} name - 設定組合名稱
   * @returns {Promise<void>}
   */
  async deleteGenerationSettingsGroup(name) {
    try {
      console.log('[GenerationManager] 開始刪除生成設定組合:', name);
      
      if (!name || typeof name !== 'string') {
        throw new Error('設定組合名稱無效');
      }

      // 刪除 local storage 中的指令設定
      await new Promise((resolve, reject) => {
        chrome.storage.local.remove([`instructions_${name}`], () => {
          if (chrome.runtime.lastError) {
            console.error('[GenerationManager] 刪除指令設定失敗:', chrome.runtime.lastError);
            reject(chrome.runtime.lastError);
          } else {
            resolve();
          }
        });
      });

      // 從 sync storage 中刪除設定組合
      const { generationSettingsGroups = {} } = await new Promise((resolve) => {
        chrome.storage.sync.get(['generationSettingsGroups'], (result) => {
          if (chrome.runtime.lastError) {
            console.error('[GenerationManager] 讀取設定組合失敗:', chrome.runtime.lastError);
            resolve({});
          } else {
            resolve(result);
          }
        });
      });

      delete generationSettingsGroups[name];
      
      await new Promise((resolve, reject) => {
        chrome.storage.sync.set({ generationSettingsGroups }, () => {
          if (chrome.runtime.lastError) {
            console.error('[GenerationManager] 更新設定組合列表失敗:', chrome.runtime.lastError);
            reject(chrome.runtime.lastError);
          } else {
            resolve();
          }
        });
      });

      // 更新 GlobalSettings 的本地變數
      if (window.GlobalSettings) {
        window.GlobalSettings.generationSettingsGroups = generationSettingsGroups;
        
        // 如果刪除的是當前使用的設定組合，清空當前設定
        if (window.GlobalSettings.currentGenerationSettings === name) {
          await window.GlobalSettings.saveSingleSetting('currentGenerationSettings', '');
          window.GlobalSettings.currentGenerationSettings = '';
        }
      }

      console.log('[GenerationManager] 生成設定組合刪除完成:', name);
    } catch (error) {
      console.error('[GenerationManager] 刪除生成設定組合失敗:', error);
      throw error;
    }
  },

  /**
   * 獲取當前所有生成設定值
   * @returns {object} 當前生成設定值
   */
  getCurrentGenerationSettings() {
    if (!window.GlobalSettings) {
      console.warn('[GenerationManager] GlobalSettings 未初始化');
      return {};
    }

    return {
      generateModel: window.GlobalSettings.generateModel || '',
      generateInstruction: window.GlobalSettings.generateInstruction || '',
      reflect1Model: window.GlobalSettings.reflect1Model || '',
      reflect1Instruction: window.GlobalSettings.reflect1Instruction || '',
      generationOptimize_1_Model: window.GlobalSettings.generationOptimize_1_Model || '',
      generationOptimize_1_Instruction: window.GlobalSettings.generationOptimize_1_Instruction || '',
      reflect2Model: window.GlobalSettings.reflect2Model || '',
      reflect2Instruction: window.GlobalSettings.reflect2Instruction || '',
      generationOptimize_2_Model: window.GlobalSettings.generationOptimize_2_Model || '',
      generationOptimize_2_Instruction: window.GlobalSettings.generationOptimize_2_Instruction || '',
      reflect3Model: window.GlobalSettings.reflect3Model || '',
      reflect3Instruction: window.GlobalSettings.reflect3Instruction || '',
      generationOptimize_3_Model: window.GlobalSettings.generationOptimize_3_Model || '',
      generationOptimize_3_Instruction: window.GlobalSettings.generationOptimize_3_Instruction || '',
      backgroundKnowledge: window.GlobalSettings.backgroundKnowledge || ''
    };
  },

  /**
   * 獲取所有生成設定組合名稱
   * @returns {Promise<string[]>} 設定組合名稱陣列
   */
  async getGenerationSettingsGroupNames() {
    try {
      const { generationSettingsGroups = {} } = await new Promise((resolve) => {
        chrome.storage.sync.get(['generationSettingsGroups'], (result) => {
          if (chrome.runtime.lastError) {
            console.error('[GenerationManager] 讀取設定組合列表失敗:', chrome.runtime.lastError);
            resolve({});
          } else {
            resolve(result);
          }
        });
      });

      return Object.keys(generationSettingsGroups).sort();
    } catch (error) {
      console.error('[GenerationManager] 獲取設定組合名稱失敗:', error);
      return [];
    }
  },

  /**
   * 檢查生成設定組合是否存在
   * @param {string} name - 設定組合名稱
   * @returns {Promise<boolean>} 是否存在
   */
  async hasGenerationSettingsGroup(name) {
    try {
      if (!name || typeof name !== 'string') {
        return false;
      }

      const { generationSettingsGroups = {} } = await new Promise((resolve) => {
        chrome.storage.sync.get(['generationSettingsGroups'], (result) => {
          if (chrome.runtime.lastError) {
            console.error('[GenerationManager] 檢查設定組合存在性失敗:', chrome.runtime.lastError);
            resolve({});
          } else {
            resolve(result);
          }
        });
      });

      return generationSettingsGroups.hasOwnProperty(name);
    } catch (error) {
      console.error('[GenerationManager] 檢查生成設定組合存在性失敗:', error);
      return false;
    }
  },

  /**
   * 重新命名生成設定組合
   * @param {string} oldName - 舊名稱
   * @param {string} newName - 新名稱
   * @returns {Promise<void>}
   */
  async renameGenerationSettingsGroup(oldName, newName) {
    try {
      console.log('[GenerationManager] 開始重新命名生成設定組合:', oldName, '->', newName);
      
      if (!oldName || !newName || typeof oldName !== 'string' || typeof newName !== 'string') {
        throw new Error('設定組合名稱無效');
      }

      if (oldName === newName) {
        console.log('[GenerationManager] 新舊名稱相同，跳過重新命名');
        return;
      }

      // 檢查新名稱是否已存在
      if (await this.hasGenerationSettingsGroup(newName)) {
        throw new Error(`設定組合名稱 "${newName}" 已存在`);
      }

      // 載入舊設定
      const oldSettings = await this.loadGenerationSettingsGroup(oldName);
      
      // 以新名稱儲存設定
      await this.saveGenerationSettingsGroup(newName, oldSettings);
      
      // 刪除舊設定
      await this.deleteGenerationSettingsGroup(oldName);

      // 如果舊設定組合是當前選中的，更新為新名稱
      if (window.GlobalSettings && window.GlobalSettings.currentGenerationSettings === oldName) {
        await window.GlobalSettings.saveSingleSetting('currentGenerationSettings', newName);
        window.GlobalSettings.currentGenerationSettings = newName;
      }

      console.log('[GenerationManager] 生成設定組合重新命名完成:', newName);
    } catch (error) {
      console.error('[GenerationManager] 重新命名生成設定組合失敗:', error);
      throw error;
    }
  }
};

console.log('[GenerationManager] 生成設定管理器已初始化'); 