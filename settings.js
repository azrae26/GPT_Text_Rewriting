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
  instruction: '使用更正式的語言',
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
  /** 改寫歷史記錄陣列，儲存每次改寫前的文本內容。 */
  rewriteHistory: [],

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
          'fullRewriteModel', 'shortRewriteModel', 'autoRewriteModel'
        ], resolve);
      });

      console.log('成功載入設置:', result);

      this.apiKeys = result.apiKeys || {}; // 確保 apiKeys 是一個對象
      this.model = result.model || 'gemini-1.5-flash';
      this.instruction = result.instruction || '使用更正式的語言';
      this.shortInstruction = result.shortInstruction || '';
      this.fullRewriteModel = result.fullRewriteModel || result.model || '';
      this.shortRewriteModel = result.shortRewriteModel || result.model || '';
      this.autoRewriteModel = result.autoRewriteModel || result.model || '';

      if (result.autoRewritePatterns) {
        this.updateAutoRewritePatterns(result.autoRewritePatterns);
      }

      // 修改這裡的檢查邏輯
      // 如果沒有設置 gemini-1.5-flash 或 openai 的 API 金鑰，則拋出錯誤
      if (!this.apiKeys['gemini-1.5-flash'] && !this.apiKeys['openai']) {
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
   * 返回 chrome.storage.sync 物件。
   * @returns {object} - chrome.storage.sync 物件。
   */
  getChromeStorage() {
    return chrome.storage.sync;
  }
};

// 確保 GlobalSettings 可以被其他檔案訪問
window.GlobalSettings = GlobalSettings;
