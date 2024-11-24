// 設定管理器的核心類別
class SettingsManager {
  constructor() {
    this.storage = new StorageManager();
    this.ui = new SettingsUI();
    this.initializeListeners();
  }

  initializeListeners() {
    this.ui.bindExportButton(() => this.exportSettings());
    this.ui.bindImportButton(() => this.triggerImportDialog());
    this.ui.bindImportFileInput((event) => this.handleImport(event));
  }

  async exportSettings() {
    try {
      console.log('開始匯出設定...');
      const settings = await this.storage.getAllSettings();
      console.log('獲取到的設定:', settings);
      
      if (!settings || Object.keys(settings).length === 0) {
        throw new Error('沒有找到可匯出的設定');
      }
      
      await FileManager.downloadJSON(settings, 'gpt-rewriter-settings.json');
      console.log('設定匯出成功');
    } catch (error) {
      console.error('匯出設定時發生錯誤:', error);
      ErrorHandler.handle(error);
    }
  }

  triggerImportDialog() {
    this.ui.openImportDialog();
  }

  async handleImport(event) {
    try {
      const file = event.target.files[0];
      if (!file) return;

      const settings = await FileManager.readJSONFile(file);
      await this.storage.saveSettings(settings);
      
      this.ui.showSuccess('設定匯入成功！');
      location.reload();
    } catch (error) {
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

  async getAllSettings() {
    try {
      console.log('正在讀取設定...');
      
      // 從 sync 和 local 儲存空間讀取所有設定
      const [syncData, localData] = await Promise.all([
        this.getChromeStorage('sync'),
        this.getChromeStorage('local')
      ]);
      
      console.log('從 storage 讀取到的資料:', { syncData, localData });
      
      // 合併所有設定
      const allData = { ...syncData, ...localData };
      
      // 過濾有效的設定
      const settings = this.filterValidSettings(allData);
      console.log('過濾後的有效設定:', settings);
      
      if (Object.keys(settings).length === 0) {
        throw new Error('沒有找到可匯出的設定');
      }
      
      return settings;
    } catch (error) {
      console.error('讀取設定失敗:', error);
      throw error;
    }
  }

  filterValidSettings(result) {
    const settings = {};
    // 遍歷所有設定鍵值
    for (const key in result) {
      if (result[key] !== undefined && 
          result[key] !== null && 
          result[key] !== '') {
        settings[key] = result[key];
      }
    }
    return settings;
  }

  async saveSettings(settings) {
    if (!settings || Object.keys(settings).length === 0) {
      throw new Error('無效的設定資料');
    }
    
    // 分離需要存到 local 的大型設定
    const localSettings = {
      translateInstruction: settings.translateInstruction,
      summaryInstruction: settings.summaryInstruction,
      highlightPatterns: settings.highlightPatterns,
      autoReplaceRules: settings.autoReplaceRules
    };
    
    // 其他設定存到 sync
    const syncSettings = { ...settings };
    Object.keys(localSettings).forEach(key => delete syncSettings[key]);
    
    // 分別儲存
    await Promise.all([
      this.setChromeStorage(syncSettings, 'sync'),
      this.setChromeStorage(localSettings, 'local')
    ]);
  }

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

  setChromeStorage(data, type = 'sync') {
    return new Promise((resolve, reject) => {
      try {
        chrome.storage[type].set(data, () => {
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
  bindExportButton(callback) {
    const button = document.getElementById('export-settings');
    if (button) {
      button.addEventListener('click', callback);
    } else {
      console.error('找不到匯出按鈕元素');
    }
  }

  bindImportButton(callback) {
    const button = document.getElementById('import-settings');
    if (button) {
      button.addEventListener('click', callback);
    } else {
      console.error('找不到匯入按鈕元素');
    }
  }

  bindImportFileInput(callback) {
    const input = document.getElementById('import-file');
    if (input) {
      input.addEventListener('change', callback);
    } else {
      console.error('找不到檔案輸入元素');
    }
  }

  openImportDialog() {
    const input = document.getElementById('import-file');
    if (input) {
      input.click();
    } else {
      console.error('找不到檔案輸入元素');
    }
  }

  showSuccess(message) {
    alert(message);
  }
}

// 檔案管理器
class FileManager {
  static async downloadJSON(data, filename) {
    try {
      const blob = new Blob([JSON.stringify(data, null, 2)], { 
        type: 'application/json' 
      });
      const url = URL.createObjectURL(blob);
      
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error) {
      throw new Error('建立下載失敗: ' + error.message);
    }
  }

  static async readJSONFile(file) {
    try {
      const text = await file.text();
      return JSON.parse(text);
    } catch (error) {
      throw new Error('讀取檔案失敗: ' + error.message);
    }
  }
}

// 錯誤處理器
class ErrorHandler {
  static handle(error) {
    console.error('發生錯誤:', error);
    
    // 根據錯誤類型顯示適當的訊息
    let message = '發生未知錯誤';
    if (error.message.includes('讀取設定失敗')) {
      message = '無法讀取設定，請確認擴充功能權限';
    } else if (error.message.includes('無效的設定資料')) {
      message = '設定資料格式不正確';
    } else if (error.message.includes('建立下載失敗')) {
      message = '無法建立下載，請檢查瀏覽器設定';
    } else if (error.message.includes('沒有找到可匯出的設定')) {
      message = '目前沒有任何可匯出的設定';
    }
    
    alert(message);
  }
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