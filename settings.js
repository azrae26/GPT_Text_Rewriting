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
      'gemini-1.5-flash': 'Gemini 1.5 Flash'
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

  /**
   * 從 Chrome 儲存空間載入設定。
   * @returns {Promise<object>} - 一個 Promise 物件，resolve 後返回載入的設定物件。
   */
  async loadSettings() {
    try {
      // 使用 Promise 包裝 chrome.storage.sync.get
      const result = await new Promise((resolve) => {
        chrome.storage.sync.get(null, (items) => {
          resolve(items);
        });
      });

      // 設置值，優先使用已保存的值，如果沒有則使用預設值
      this.apiKeys = result.apiKeys || {};
      this.model = result.model || 'gemini-1.5-flash';
      this.instruction = result.instruction || (window.DefaultSettings?.fullRewriteInstruction || '');
      this.shortInstruction = result.shortInstruction || (window.DefaultSettings?.shortRewriteInstruction || '');
      this.fullRewriteModel = result.fullRewriteModel || this.model;
      this.shortRewriteModel = result.shortRewriteModel || this.model;
      this.autoRewriteModel = result.autoRewriteModel || this.model;
      this.translateModel = result.translateModel || this.model;
      this.translateInstruction = result.translateInstruction || (window.DefaultSettings?.translateInstruction || '');
      
      // 使用 DefaultSettings 中的預設值
      this.confirmModel = result.confirmModel === undefined ? window.DefaultSettings?.confirmModel : result.confirmModel;
      this.confirmContent = result.confirmContent === undefined ? window.DefaultSettings?.confirmContent : result.confirmContent;
      this.removeHash = result.removeHash === undefined ? window.DefaultSettings?.removeHash : result.removeHash;
      this.removeStar = result.removeStar === undefined ? window.DefaultSettings?.removeStar : result.removeStar;

      // 更新自動改寫模式
      if (result.autoRewritePatterns) {
        this.updateAutoRewritePatterns(result.autoRewritePatterns);
      } else if (window.DefaultSettings?.autoRewritePatterns) {
        this.updateAutoRewritePatterns(window.DefaultSettings.autoRewritePatterns);
      }

      // 如果是首次運行，設置預設值
      if (result.firstRun === undefined) {
        await this.saveSettings();
        chrome.storage.sync.set({ firstRun: false });
      }

      return this;
    } catch (error) {
      console.warn('載入設置時出錯，使用預設值:', error);
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
      await new Promise((resolve) => {
        chrome.storage.sync.set({
          apiKeys: this.apiKeys,
          model: this.model,
          instruction: this.instruction,
          shortInstruction: this.shortInstruction,
          autoRewritePatterns: this.autoRewritePatterns.map(pattern => pattern.source),
          fullRewriteModel: this.fullRewriteModel,
          shortRewriteModel: this.shortRewriteModel,
          autoRewriteModel: this.autoRewriteModel,
          translateModel: this.translateModel,
          translateInstruction: this.translateInstruction,
          confirmModel: this.confirmModel,
          confirmContent: this.confirmContent,
          removeHash: this.removeHash,
          removeStar: this.removeStar
        }, resolve);
      });
    } catch (error) {
      console.warn('保存設置時出錯:', error);
    }
  },

  /**
   *儲存單一設定
   * @param {string} key - 設定的鍵
   * @param {any} value - 設定的值
   * @returns {Promise<void>}
   */
  async saveSingleSetting(key, value) {
    try {
      await new Promise((resolve) => {
        const settings = {};
        settings[key] = value;
        chrome.storage.sync.set(settings, resolve);
      });
      // 同時更新本地值
      this[key] = value;
    } catch (error) {
      console.warn('儲存單一設定時出錯:', error);
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
  }
};

// 確保 GlobalSettings 可以被其他檔案訪問
window.GlobalSettings = GlobalSettings;
