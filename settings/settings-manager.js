/**
 * 設定檔案管理器模組
 * 
 * 主要功能：
 * - 支援設定的匯入和匯出
 * - 處理設定檔案格式
 * - 管理檔案操作介面
 */

// 設定檔案管理器的核心類別
class SettingsFileManager {
  constructor() {
    this.settings = window.GlobalSettings;
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
      const settings = await this.settings.getAllSettings();
      
      if (!settings || Object.keys(settings).length === 0) {
        throw new Error('沒有找到可匯出的設定');
      }
      
      const exportData = {
        ...this.settings.SETTINGS_IDENTIFIER,
        settings: settings
      };
      
      await FileManager.downloadJSON(exportData, 'gpt-rewriter-settings.json');
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

      const importedData = await FileManager.readJSONFile(file);
      
      if (!this.validateSettingsFile(importedData)) {
        throw new Error('無效的設定檔：不是本插件的設定檔');
      }
      
      await this.settings.applySettings(importedData.settings);
      
      this.ui.showSuccess('設定匯入成功！');
      sendLog('success', '設定匯入完成，準備重新載入頁面');
      location.reload();
    } catch (error) {
      sendLog('error', '匯入設定時發生錯誤', error);
      ErrorHandler.handle(error);
    }
  }

  // 驗證設定檔
  validateSettingsFile(importedData) {
    return (
      importedData &&
      importedData.appName === this.settings.SETTINGS_IDENTIFIER.appName &&
      importedData.version === this.settings.SETTINGS_IDENTIFIER.version
    );
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
      
      // 過濾掉 undefined 和 null 值，這對於 text_replace 模組特別重要
      const replacer = (key, value) => {
        // 如果是替換規則，確保它是完整的結構化數據
        if (Array.isArray(value) && 
            key.includes('ReplaceRules') && 
            value.some(item => typeof item === 'object')) {
          return value.filter(item => item && typeof item === 'object');
        }
        return value;
      };
      
      const blob = new Blob([JSON.stringify(data, replacer, 2)], { type: 'application/json' });
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
    ['沒有找到可匯出的設定', '目前沒有任何可匯出的設定'],
    ['無效的設定檔', '這不是本插件的設定檔，請確認您選擇的檔案是否正確']
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

// 初始化設定檔案管理器
document.addEventListener('DOMContentLoaded', () => {
  try {
    new SettingsFileManager();
    console.log('設定檔案管理器初始化成功');
  } catch (error) {
    console.error('設定檔案管理器初始化失敗:', error);
  }
}); 