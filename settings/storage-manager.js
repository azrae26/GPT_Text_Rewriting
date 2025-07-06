/**
 * storage-manager.js - 存儲管理器
 * 功能：專門負責 Chrome Storage 的操作封裝，包含批次處理、容量管理等
 * 職責：
 * - Chrome Storage API 的封裝
 * - 批次存儲處理
 * - 存儲容量監控
 * - 存儲類型自動選擇
 * - 進度回調處理
 * 
 * 依賴：
 * - Chrome Extensions API (storage.sync, storage.local)
 * - KeyClassifier (透過 window.KeyClassifier)
 */

const StorageManager = {

  /**
   * 獲取 Chrome Storage 實例
   * @param {string} type - 存儲類型 ('sync' | 'local')
   * @returns {object} - Chrome Storage 實例
   */
  getChromeStorage(type = 'sync') {
    if (type === 'local') {
      return chrome.storage.local;
    }
    return chrome.storage.sync;
  },

  /**
   * 設定 Chrome Storage 資料
   * @param {object} data - 要儲存的資料
   * @param {string} type - 存儲類型 ('sync' | 'local')
   * @param {string} prefix - 日誌前綴
   * @returns {Promise<void>}
   */
  setChromeStorage(data, type = 'sync', prefix = '') {
    return new Promise((resolve, reject) => {
      if (!data || typeof data !== 'object') {
        reject(new Error('資料必須是一個物件'));
        return;
      }

      const storageApi = this.getChromeStorage(type);
      const dataSize = JSON.stringify(data).length;
      
      console.log(`[StorageManager]${prefix} 嘗試儲存資料到 ${type} storage，大小: ${dataSize} bytes`);
      
      storageApi.set(data, () => {
        if (chrome.runtime.lastError) {
          console.error(`[StorageManager]${prefix} 儲存到 ${type} storage 失敗:`, chrome.runtime.lastError.message);
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          console.log(`[StorageManager]${prefix} 成功儲存資料到 ${type} storage，大小: ${dataSize} bytes`);
          resolve();
        }
      });
    });
  },

  /**
   * 批次設定 Chrome Storage 資料（避免容量限制）
   * @param {object} data - 要儲存的資料
   * @param {string} type - 存儲類型 ('sync' | 'local')
   * @param {function} progressCallback - 進度回調函數
   * @param {number} batchSize - 批次大小
   * @returns {Promise<void>}
   */
  async setChromeStorageInBatches(data, type = 'local', progressCallback, batchSize = 5) {
    const entries = Object.entries(data);
    const totalBatches = Math.ceil(entries.length / batchSize);
    
    console.log(`[StorageManager] 開始批次儲存 ${entries.length} 個項目到 ${type} storage，分 ${totalBatches} 批次`);
    
    for (let i = 0; i < totalBatches; i++) {
      const start = i * batchSize;
      const end = Math.min(start + batchSize, entries.length);
      const batchEntries = entries.slice(start, end);
      const batchData = Object.fromEntries(batchEntries);
      
      if (progressCallback) {
        progressCallback(`儲存批次 ${i + 1}/${totalBatches}...`);
      }
      
      await this.setChromeStorage(batchData, type, `[批次 ${i + 1}/${totalBatches}]`);
      
      // 在批次之間稍作延遲，避免過載
      if (i < totalBatches - 1) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }
    
    console.log(`[StorageManager] 批次儲存完成`);
  },

  /**
   * 獲取存儲資料
   * @param {string[]} keys - 要獲取的鍵值陣列
   * @param {string} type - 存儲類型 ('sync' | 'local')
   * @returns {Promise<object>} - 獲取的資料
   */
  getStorageData(keys, type = 'sync') {
    return new Promise((resolve) => {
      const storageApi = this.getChromeStorage(type);
      
      if (keys && Array.isArray(keys)) {
        storageApi.get(keys, (items) => resolve(items || {}));
      } else {
        storageApi.get(null, (items) => resolve(items || {}));
      }
    });
  },

  /**
   * 獲取所有存儲資料
   * @param {string} type - 存儲類型 ('sync' | 'local')
   * @returns {Promise<object>} - 所有資料
   */
  getAllStorageData(type = 'sync') {
    return this.getStorageData(null, type);
  },

  /**
   * 刪除存儲資料
   * @param {string|string[]} keys - 要刪除的鍵值
   * @param {string} type - 存儲類型 ('sync' | 'local')
   * @returns {Promise<void>}
   */
  removeStorageData(keys, type = 'sync') {
    return new Promise((resolve, reject) => {
      const storageApi = this.getChromeStorage(type);
      
      storageApi.remove(keys, () => {
        if (chrome.runtime.lastError) {
          console.error(`[StorageManager] 刪除 ${type} storage 資料失敗:`, chrome.runtime.lastError.message);
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          console.log(`[StorageManager] 成功刪除 ${type} storage 資料:`, keys);
          resolve();
        }
      });
    });
  },

  /**
   * 清空存儲資料
   * @param {string} type - 存儲類型 ('sync' | 'local')
   * @returns {Promise<void>}
   */
  clearStorageData(type = 'sync') {
    return new Promise((resolve, reject) => {
      const storageApi = this.getChromeStorage(type);
      
      storageApi.clear(() => {
        if (chrome.runtime.lastError) {
          console.error(`[StorageManager] 清空 ${type} storage 失敗:`, chrome.runtime.lastError.message);
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          console.log(`[StorageManager] 成功清空 ${type} storage`);
          resolve();
        }
      });
    });
  },

  /**
   * 獲取存儲使用情況
   * @param {string} type - 存儲類型 ('sync' | 'local')
   * @returns {Promise<object>} - 使用情況信息
   */
  getStorageUsage(type = 'sync') {
    return new Promise((resolve) => {
      const storageApi = this.getChromeStorage(type);
      
      // 獲取使用量（如果 API 支援）
      if (storageApi.getBytesInUse) {
        storageApi.getBytesInUse(null, (bytesInUse) => {
          const maxBytes = type === 'sync' ? 
            chrome.storage.sync.QUOTA_BYTES : 
            chrome.storage.local.QUOTA_BYTES;
          
          resolve({
            bytesInUse: bytesInUse || 0,
            maxBytes: maxBytes || 0,
            percentage: maxBytes ? Math.round((bytesInUse / maxBytes) * 100) : 0
          });
        });
      } else {
        // 後備方案：計算資料大小
        this.getAllStorageData(type).then(data => {
          const dataSize = JSON.stringify(data).length;
          const maxBytes = type === 'sync' ? 102400 : 10485760; // 100KB / 10MB
          
          resolve({
            bytesInUse: dataSize,
            maxBytes: maxBytes,
            percentage: Math.round((dataSize / maxBytes) * 100)
          });
        });
      }
    });
  },

  /**
   * 根據鍵值決定存儲類型
   * @param {string} key - 設定鍵值
   * @returns {string} - 存儲類型 ('sync' | 'local')
   */
  getStorageTypeForKey(key) {
    // 如果有 KeyClassifier，使用它來判斷
    if (window.KeyClassifier) {
      return window.KeyClassifier.getStorageType(key);
    }
    
    // 後備判斷邏輯
    const localStorageKeys = [
      'instruction', 'shortInstruction', 'autoRewritePatterns',
      'translateInstruction', 'summaryInstruction', 'codeCheckInstruction',
      'zhEnMapping', 'reflectInstruction', 'optimizeInstruction',
      'generateInstruction', 'reflect1Instruction', 'generationOptimize_1_Instruction',
      'reflect2Instruction', 'generationOptimize_2_Instruction',
      'reflect3Instruction', 'generationOptimize_3_Instruction',
      'backgroundKnowledge', 'stockList'
    ];
    
    return localStorageKeys.includes(key) ? 'local' : 'sync';
  },

  /**
   * 智能存儲單一設定
   * @param {string} key - 設定鍵值
   * @param {*} value - 設定值
   * @returns {Promise<void>}
   */
  async saveSettingValue(key, value) {
    const storageType = this.getStorageTypeForKey(key);
    const data = { [key]: value };
    
    console.log(`[StorageManager] 儲存設定 ${key} 到 ${storageType} storage`);
    await this.setChromeStorage(data, storageType);
  },

  /**
   * 智能載入單一設定
   * @param {string} key - 設定鍵值
   * @returns {Promise<*>} - 設定值
   */
  async loadSettingValue(key) {
    const storageType = this.getStorageTypeForKey(key);
    const data = await this.getStorageData([key], storageType);
    
    console.log(`[StorageManager] 從 ${storageType} storage 載入設定 ${key}`);
    return data[key];
  },

  /**
   * 監控存儲容量並警告
   * @param {string} type - 存儲類型
   * @returns {Promise<object>} - 容量狀態
   */
  async monitorStorageCapacity(type = 'sync') {
    const usage = await this.getStorageUsage(type);
    
    if (usage.percentage > 90) {
      console.warn(`[StorageManager] ${type} storage 使用率過高: ${usage.percentage}%`);
    } else if (usage.percentage > 75) {
      console.log(`[StorageManager] ${type} storage 使用率: ${usage.percentage}%`);
    }
    
    return usage;
  }
};

// 暴露到全局
if (typeof window !== 'undefined') {
  window.StorageManager = StorageManager;
} 