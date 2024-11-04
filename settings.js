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
   * @throws {Error} - 如果載入設定時發生錯誤，則拋出錯誤。
   */
  async loadSettings() {
    try {
      const result = await new Promise((resolve) => {
        chrome.storage.sync.get([
          'apiKeys', 'model', 'instruction', 'shortInstruction', 
          'autoRewritePatterns', 'confirmModel', 'confirmContent',
          'fullRewriteModel', 'shortRewriteModel', 'autoRewriteModel',
          'translateModel', 'translateInstruction', 'firstRun'
        ], resolve);
      });

      console.log('成功載入設置:', result);

      this.apiKeys = result.apiKeys || {}; // 確保 apiKeys 是一個對象
      this.model = result.model || 'gemini-1.5-flash';
      this.instruction = result.instruction || '';
      this.shortInstruction = result.shortInstruction || '';
      this.fullRewriteModel = result.fullRewriteModel || result.model || '';
      this.shortRewriteModel = result.shortRewriteModel || result.model || '';
      this.autoRewriteModel = result.autoRewriteModel || result.model || '';
      this.translateModel = result.translateModel || result.model || '';
      this.translateInstruction = result.translateInstruction || '';

      if (result.autoRewritePatterns) {
        this.updateAutoRewritePatterns(result.autoRewritePatterns);
      }

      // 檢查是否為第一次運行，並根據情況載入預設設定
      const isFirstRun = result.firstRun === undefined;
      if (isFirstRun) {
        console.log('第一次運行，載入預設設定');
        await this.saveSettings(); // 儲存預設設定到 chrome.storage.sync
        chrome.storage.sync.set({ firstRun: false }); // 標記為非第一次運行
      } else if (!this.apiKeys['gemini-1.5-flash'] && !this.apiKeys['openai']) {
        console.error('未設置任何 API 金鑰');
        throw new Error('未設置任何 API 金鑰，請在擴展設置中輸入至少一個 API 金鑰。');
      }

      return result;
    } catch (error) {
      console.error('載入設置時出錯:', error);
      throw error;
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
      console.log('成功更新自動改寫匹配模式:', this.autoRewritePatterns);
    } catch (error) {
      console.error('更新匹配模式時出錯:', error);
    }
  },

  /**
   * 儲存設定到 Chrome 儲存空間。
   * @returns {Promise<void>} - 一個 Promise 物件，resolve 後表示設定已儲存。
   */
  async saveSettings() {
    return new Promise((resolve) => {
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
      }, resolve);
    });
  },

  /**
   * 返回 chrome.storage.sync 物件。
   * @returns {object} - chrome.storage.sync 物件。
   */
  getChromeStorage() {
    return chrome.storage.sync;
  }
};

// 確保 GlobalSettings 可以被其他檔案訪問
window.GlobalSettings = GlobalSettings;
