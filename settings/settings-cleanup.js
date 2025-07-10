/**
 * settings-cleanup.js - 設定清理管理模組
 * 功能：負責清理過時和無效的設定項目
 * 職責：
 * - 定義殭屍設定項目清單
 * - 執行同步和本地儲存的清理操作
 * - 提供清理狀態回報
 * 
 * 依賴：
 * - Chrome Extensions API (storage.sync, storage.local)
 */

window.SettingsCleanup = {
  /**
   * 定義所有需要清理的殭屍項目
   */
  ZOMBIE_KEYS: [
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
    'replaceGroups',
    
    // 測試垃圾鍵值
    'testSetting', 
    'testKey', 
    'syncSignal', 
    'syncTrigger', 
    'deviceId', 
    'testData', 
    'debugInfo', 
    'uiUpdateTrigger',
    'deviceUniqueId',           // 設備唯一ID（測試時產生的無效鍵值）
    'lastProcessedSignalId',     // 最後處理的訊號ID（測試時產生的無效鍵值）
    'crawlerEnabled'            // 無效的爬蟲鍵值（應使用 crawlerAutoEnabled）
  ],

  /**
   * 清理殭屍項目
   * @returns {Promise<boolean>} - 清理是否成功
   */
  async cleanupZombieSettings() {
    try {
      LogUtils.log('🧹 開始清理殭屍項目...');
      
      // 從 sync storage 清理
      await new Promise((resolve) => {
        chrome.storage.sync.remove(this.ZOMBIE_KEYS, () => {
          if (chrome.runtime.lastError) {
            LogUtils.warn('Sync storage 清理警告:', chrome.runtime.lastError);
          } else {
            LogUtils.log('已從 sync storage 清理殭屍項目');
          }
          resolve();
        });
      });
      
      // 從 local storage 清理
      await new Promise((resolve) => {
        chrome.storage.local.remove(this.ZOMBIE_KEYS, () => {
          if (chrome.runtime.lastError) {
            LogUtils.warn('Local storage 清理警告:', chrome.runtime.lastError);
          } else {
            LogUtils.log('已從 local storage 清理殭屍項目');
          }
          resolve();
        });
      });
      
      LogUtils.important(`殭屍項目清理完成，共清理 ${this.ZOMBIE_KEYS.length} 個項目`);
      return true;
    } catch (error) {
      LogUtils.error('清理殭屍項目失敗:', error);
      return false;
    }
  },

  /**
   * 檢查是否為殭屍項目
   * @param {string} key - 設定鍵值
   * @returns {boolean} - 是否為殭屍項目
   */
  isZombieKey(key) {
    return this.ZOMBIE_KEYS.includes(key);
  },

  /**
   * 獲取殭屍項目清單
   * @returns {Array<string>} - 殭屍項目清單
   */
  getZombieKeys() {
    return [...this.ZOMBIE_KEYS];
  },

  /**
   * 添加新的殭屍項目
   * @param {string|Array<string>} keys - 要添加的鍵值
   */
  addZombieKeys(keys) {
    const keysArray = Array.isArray(keys) ? keys : [keys];
    keysArray.forEach(key => {
      if (!this.ZOMBIE_KEYS.includes(key)) {
        this.ZOMBIE_KEYS.push(key);
        LogUtils.log(`已添加新的殭屍項目: ${key}`);
      }
    });
  }
};

// 確保全域可訪問
if (typeof window !== 'undefined') {
  window.SettingsCleanup = window.SettingsCleanup;
}

LogUtils.log('設定清理管理器已載入'); 