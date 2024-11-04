/* global chrome */

/**
 * 全局變量和設置模組，管理擴充程式的全局設定。
 */
const GlobalSettings = {
  /** API 金鑰物件，儲存不同模型的 API 金鑰。 */
  apiKeys: {},
  /** 預設模型名稱。 */
  model: 'gemini-1.5-flash',
  /** 預設改寫指令。 */
  instruction: '',
  /** 預設短改寫指令。 */
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
        try {
          chrome.storage.sync.get(null, (items) => {
            if (chrome.runtime.lastError) {
              // 如果有錯誤，使用預設值
              resolve(window.DefaultSettings || {});
            } else {
              resolve(items);
            }
          });
        } catch (error) {
          // 如果出現異常，使用預設值
          resolve(window.DefaultSettings || {});
        }
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

      // 更新自動改寫模式
      if (result.autoRewritePatterns) {
        this.updateAutoRewritePatterns(result.autoRewritePatterns);
      } else if (window.DefaultSettings?.autoRewritePatterns) {
        this.updateAutoRewritePatterns(window.DefaultSettings.autoRewritePatterns);
      }

      // 如果是首次運行，設置預設值
      if (result.firstRun === undefined) {
        await this.saveSettings();
        chrome.storage.sync.set({ 
          firstRun: false,
          confirmModel: window.DefaultSettings?.confirmModel || false,
          confirmContent: window.DefaultSettings?.confirmContent || false,
          removeHash: window.DefaultSettings?.removeHash || true,
          removeStar: window.DefaultSettings?.removeStar || true
        });
      }

      return result;
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
    try {
      this.autoRewritePatterns = patternsString.split('\n')
        .map(line => line.trim())
        .filter(line => line && !line.startsWith('//'))
        .map(pattern => new RegExp(pattern.replace(/^\/|\/$/g, ''), 'g'));
    } catch (error) {
      console.warn('更新匹配模式時出錯:', error);
      this.autoRewritePatterns = [];
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
          translateInstruction: this.translateInstruction
        }, resolve);
      });
    } catch (error) {
      console.warn('保存設置時出錯:', error);
    }
  }
};

// 確保 GlobalSettings 可以被其他檔案訪問
window.GlobalSettings = GlobalSettings;
