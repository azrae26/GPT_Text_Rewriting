/**
 * 設定管理器模組
 * 
 * 依賴模組：
 * 1. Chrome Storage API
 *    - chrome.storage.sync：存儲同步設定
 *    - chrome.storage.local：存儲本地設定
 * 
 * 2. Chrome Runtime API
 *    - chrome.runtime.sendMessage：發送日誌訊息
 * 
 * 主要功能：
 * - 管理用戶設定的存儲和讀取
 * - 支援設定的匯入和匯出
 * - 分類處理不同類型的設定
 * - 自動同步設定狀態
 * - 錯誤處理和日誌記錄
 */

// 設定管理器的核心類別
class SettingsManager {
  constructor() {
    this.storage = new StorageManager();
    this.ui = new SettingsUI();
    this.initializeListeners();
  }

  // 初始化事件繫結
  initializeListeners() {
    this.ui.bindExportButton(() => this.exportSettings());
    this.ui.bindImportButton(() => this.triggerImportDialog());
    this.ui.bindImportFileInput((event) => this.handleImport(event));
  }

  // 處理匯出設定事件
  async exportSettings() {
    try {
      sendLog('info', '開始匯出設定...');
      const settings = await this.storage.getAllSettings();
      
      if (!settings || Object.keys(settings).length === 0) {
        throw new Error('沒有找到可匯出的設定');
      }
      
      await FileManager.downloadJSON(settings, 'gpt-rewriter-settings.json');
      sendLog('success', '設定匯出成功');
    } catch (error) {
      sendLog('error', '匯出設定時發生錯誤', error);
      ErrorHandler.handle(error);
    }
  }

  // 觸發匯入對話框
  triggerImportDialog() {
    this.ui.openImportDialog();
  }

  // 處理匯入檔案事件
  async handleImport(event) {
    try {
      const file = event.target.files[0];
      if (!file) {
        sendLog('error', '匯入失敗：未選擇檔案');
        return;
      }

      const settings = await FileManager.readJSONFile(file);
      await this.storage.saveSettings(settings);
      
      this.ui.showSuccess('設定匯入成功！');
      sendLog('success', '設定匯入完成，準備重新載入頁面');
      location.reload();
    } catch (error) {
      sendLog('error', '匯入設定時發生錯誤', error);
      ErrorHandler.handle(error);
    }
  }
}

// 儲存管理器
class StorageManager {
  constructor() {
    // 定義所有需要匯出的設定鍵值
    this.settingKeys = {
      // API 和模型相關
      'api-key': '儲存的 API 金鑰',
      'model-select': '選擇的模型',
      'apiKeys': 'API 金鑰設定',
      
      // 改寫相關
      'instruction': '全文改寫指令',
      'shortInstruction': '短文改寫指令',
      'autoRewritePatterns': '自動改寫模式',
      'fullRewriteModel': '全文改寫模型',
      'shortRewriteModel': '短文改寫模型',
      'autoRewriteModel': '自動改寫模型',
      
      // 翻譯相關
      'translateModel': '翻譯模型',
      'translateInstruction': '翻譯指令',
      'removeHash': '移除 # 設定',
      'removeStar': '移除 * 設定',
      'zhEnMapping': '中英對照表',
      
      // 關鍵要點相關
      'summaryModel': '摘要模型',
      'summaryInstruction': '摘要指令',
      
      // 高亮相關
      'highlightWords': '高亮文字',
      'highlightColors': '高亮顏色',
      'highlightPatterns': '高亮模式',
      
      // 替換相關
      'replacePatterns': '替換模式',
      'autoReplaceRules': '自動替換規則',
      'manualReplaceRules': '手動替換規則',
      
      // UI 相關
      'lastMainTab': '最後開啟的主分頁',
      'lastSubTab': '最後開啟的子分頁',
      'summaryPosition': '摘要視窗位置',
      'summaryExpanded': '摘要視窗展開狀態',
      'replacePosition': '替換視窗位置'
    };
  }

  // 讀取所有設定
  async getAllSettings() {
    try {
      const [syncData, localData] = await Promise.all([
        this.getChromeStorage('sync'),
        this.getChromeStorage('local')
      ]);
      
      // 特別處理替換規則，移除前綴
      const replaceSettings = {};
      Object.entries(localData).forEach(([key, value]) => {
        if (key.startsWith('replace_')) {
          replaceSettings[key.replace('replace_', '')] = value;
          delete localData[key];
        }
      });
      
      const allData = { 
        ...syncData, 
        ...localData,
        ...replaceSettings  // 加入處理過的替換規則
      };
      
      const settings = this.filterValidSettings(allData);
      
      if (Object.keys(settings).length === 0) {
        throw new Error('沒有找到可匯出的設定');
      }
      
      return settings;
    } catch (error) {
      sendLog('error', '讀取設定失敗', error);
      throw error;
    }
  }

  // 過濾有效的設定
  filterValidSettings(result) {
    return Object.fromEntries(
      Object.entries(result).filter(([_, value]) => 
        value !== undefined && value !== null && value !== ''
      )
    );
  }

  // 儲存設定
  async saveSettings(settings) {
    try {
      if (!settings || Object.keys(settings).length === 0) {
        throw new Error('無效的設定資料');
      }

      const { replaceSettings, localSettings, syncSettings } = this.#categorizeSettings(settings);
      
      await chrome.storage.local.remove(Object.keys(replaceSettings));
      await Promise.all([
        this.setChromeStorage(syncSettings, 'sync'),
        this.setChromeStorage(localSettings, 'local'),
        this.setChromeStorage(replaceSettings, 'local', 'replace_')
      ]);
      
      sendLog('success', '設定儲存完成');
    } catch (error) {
      sendLog('error', '儲存設定失敗', error);
      throw error;
    }
  }

  // 新增私有方法來分類設定
  #categorizeSettings(settings) {
    const replaceSettings = {
      autoReplaceRules: settings.autoReplaceRules || [],
      manualReplaceRules: settings.manualReplaceRules || [],
      replacePatterns: settings.replacePatterns,
      replaceContent: settings.replaceContent,
      replaceGroups: settings.replaceGroups,
      manualGroups: settings.manualGroups,
      extraManualGroups: settings.extraManualGroups,
      manualReplaceValues_0: settings.manualReplaceValues_0,
      manualReplaceValues_1: settings.manualReplaceValues_1,
      manualReplaceValues_2: settings.manualReplaceValues_2
    };

    Object.keys(replaceSettings).forEach(key => {
      if (!replaceSettings[key]) delete replaceSettings[key];
    });

    const localSettings = {
      translateInstruction: settings.translateInstruction,
      summaryInstruction: settings.summaryInstruction,
      highlightPatterns: settings.highlightPatterns,
      zhEnMapping: settings.zhEnMapping
    };

    const syncSettings = { ...settings };
    [...Object.keys(localSettings), ...Object.keys(replaceSettings)]
      .forEach(key => delete syncSettings[key]);

    return { replaceSettings, localSettings, syncSettings };
  }

  // Chrome storage 操作的包裝方法，處理 Promise 化
  getChromeStorage(type = 'sync') {
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
  }

  // 儲存資料到 Chrome storage，支援前綴功能
  setChromeStorage(data, type = 'sync', prefix = '') {
    return new Promise((resolve, reject) => {
      try {
        // 如果有指定前綴，則為所有 key 加上前綴
        const storageData = prefix ? 
          Object.fromEntries(
            Object.entries(data).map(([key, value]) => [prefix + key, value])
          ) : data;

        chrome.storage[type].set(storageData, () => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
          } else {
            resolve();
          }
        });
      } catch (error) {
        reject(error);
      }
    });
  }
}

// UI 管理器
class SettingsUI {
  #getElement(id) {
    const element = document.getElementById(id);
    if (!element) {
      console.error(`找不到元素: ${id}`);
    }
    return element;
  }

  bindExportButton(callback) {
    this.#getElement('export-settings')?.addEventListener('click', callback);
  }

  bindImportButton(callback) {
    this.#getElement('import-settings')?.addEventListener('click', callback);
  }

  bindImportFileInput(callback) {
    this.#getElement('import-file')?.addEventListener('change', callback);
  }

  openImportDialog() {
    this.#getElement('import-file')?.click();
  }

  showSuccess(message) {
    alert(message);
  }
}

// 檔案管理器
class FileManager {
  // 下載 JSON 檔案
  static async downloadJSON(data, filename) {
    try {
      // 取得目前時間並格式化
      const now = new Date();
      const timestamp = now.getFullYear().toString().slice(-2) + 
        String(now.getMonth() + 1).padStart(2, '0') + 
        String(now.getDate()).padStart(2, '0') + '-' +
        String(now.getHours()).padStart(2, '0') + 
        String(now.getMinutes()).padStart(2, '0');
      
      // 在檔名加入時間戳記
      const filenameWithTimestamp = filename.replace('.json', `_${timestamp}.json`);
      
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      
      const a = document.createElement('a');
      a.href = url;
      a.download = filenameWithTimestamp;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error) {
      throw new Error('建立下載失敗');
    }
  }

  static readJSONFile(file) {
    return file.text().then(JSON.parse);
  }
}

// 錯誤處理器
class ErrorHandler {
  static #errorMessages = new Map([
    ['讀取設定失敗', '無法讀取設定，請確認擴充功能權限'],
    ['無效的設定資料', '設定資料格式不正確'],
    ['建立下載失敗', '無法建立下載，請檢查瀏覽器設定'],
    ['沒有找到可匯出的設定', '目前沒有任何可匯出的設定']
  ]);

  static handle(error) {
    console.error('發生錯誤:', error);
    const message = Array.from(this.#errorMessages.entries())
      .find(([key]) => error.message.includes(key))?.[1] 
      || '發生未知錯誤';
    alert(message);
  }
}

// 新增一個日誌輔助函數
function sendLog(type, message, data = null) {
    chrome.runtime.sendMessage({
        action: 'settingsLog',
        logType: type,
        message: message,
        data: data,
        timestamp: new Date().toISOString()
    });
}

// 初始化設定管理器
document.addEventListener('DOMContentLoaded', () => {
  try {
    new SettingsManager();
    console.log('設定管理器初始化成功');
  } catch (error) {
    console.error('設定管理器初始化失敗:', error);
  }
}); 