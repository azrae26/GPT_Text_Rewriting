/**
 * settings/settings-manager.js - 設定檔案管理器模組 (2025/06/08 更新)
 * 功能：提供設定的匯入匯出和檔案管理功能
 * 職責：
 * - 設定匯出：將所有設定打包為 JSON 檔案供備份
 * - 設定匯入：支援設定檔案的驗證和載入
 * - 分級降級策略：處理大型設定檔案的智能匯入
 * - 容量優化：自動排除過大內容以符合儲存限制
 * - 錯誤處理：提供完整的匯入失敗處理和重試機制
 * - 殭屍設定清理：清理無效和過時的設定項目
 * - UI 整合：管理匯入匯出操作的使用者介面
 * 
 * 注意：
 * - 2025/06/08 修復了 popup 關閉後同步停止的問題 ✅ 已修復
 * - 雲端同步功能現在由 background.js 管理，確保持續運行
 * - 設定匯出匯入功能不受影響，仍在 popup 環境中正常運行
 * - 修復方法：將必要檔案添加到 manifest.json 背景腳本列表中
 * 
 * 依賴：
 * - GlobalSettings：全局設定管理和操作
 * - Chrome File API：檔案讀寫和下載功能
 * - Chrome Storage API：設定的儲存和讀取
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
    this.ui.bindCleanupButton(() => this.cleanupZombieSettings());
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
      
      // 使用分級降級策略嘗試匯入
      const importResult = await this.tryImportWithFallback(importedData.settings);
      
      if (importResult.success) {
        const shouldReload = this.ui.showSuccess(importResult.message);
        if (shouldReload) {
          sendLog('success', '設定匯入完成，準備重新載入頁面');
          location.reload();
        }
      } else {
        this.ui.showError(importResult.error);
        throw new Error(importResult.error);
      }
    } catch (error) {
      sendLog('error', '匯入設定時發生錯誤', error);
      ErrorHandler.handle(error);
    }
  }

  // 分級降級匯入策略
  async tryImportWithFallback(settings) {
    const totalAttempts = 5;
    const attempts = [
      {
        name: '完整匯入',
        data: settings,
        excludeKeys: []
      },
      {
        name: '排除大型文本內容匯入',
        data: settings,
        excludeKeys: this.getLargeTextKeys()
      },
      {
        name: '排除所有指令內容匯入',
        data: settings,
        excludeKeys: this.getAllInstructionKeys()
      },
      {
        name: '僅匯入基本設定',
        data: settings,
        excludeKeys: this.getComplexContentKeys()
      },
      {
        name: '僅匯入核心設定',
        data: settings,
        excludeKeys: this.getCoreOnlyKeys()
      }
    ];

    sendLog('info', `開始分級降級匯入策略，共 ${totalAttempts} 種方案`);

    for (let i = 0; i < attempts.length; i++) {
      const attempt = attempts[i];
      try {
        sendLog('info', `[${i + 1}/${totalAttempts}] 嘗試${attempt.name}...`);
        
        // 準備要匯入的設定資料
        const filteredSettings = this.filterSettings(attempt.data, attempt.excludeKeys);
        
        // 檢查設定大小和項目數量
        const settingsSize = new TextEncoder().encode(JSON.stringify(filteredSettings)).length;
        const itemCount = Object.keys(filteredSettings).length;
        sendLog('info', `${attempt.name}資料大小: ${settingsSize} bytes，項目數量: ${itemCount}`);
        
        if (attempt.excludeKeys.length > 0) {
          sendLog('info', `排除了 ${attempt.excludeKeys.length} 個項目: ${attempt.excludeKeys.slice(0, 3).join(', ')}${attempt.excludeKeys.length > 3 ? '...' : ''}`);
        }
        
        // 嘗試套用設定
        await this.settings.applySettings(filteredSettings);
        
        // 成功時的訊息
        let message = '設定匯入成功！';
        if (attempt.excludeKeys.length > 0) {
          const excludedItems = this.getExcludedItemNames(attempt.excludeKeys);
          message = `設定匯入成功！\n\n注意：由於資料過大，以下內容已被排除：\n${excludedItems.join('\n')}`;
        }
        
        sendLog('success', `${attempt.name}成功完成`);
        return {
          success: true,
          message: message,
          excludedKeys: attempt.excludeKeys,
          attemptUsed: i + 1
        };
        
      } catch (error) {
        sendLog('warn', `[${i + 1}/${totalAttempts}] ${attempt.name}失敗: ${error.message}`);
        
        // 如果這是最後一次嘗試，返回失敗
        if (i === attempts.length - 1) {
          sendLog('error', '所有匯入策略都失敗了');
          return {
            success: false,
            error: `所有匯入策略都失敗了。最後錯誤: ${error.message}`
          };
        }
        
        // 否則繼續下一個策略
        continue;
      }
    }
  }

  // 過濾設定，排除指定的鍵值
  filterSettings(settings, excludeKeys) {
    if (excludeKeys.length === 0) {
      return settings;
    }
    
    const filtered = { ...settings };
    
    // 處理明確指定的鍵值
    excludeKeys.forEach(key => {
      if (key in filtered) {
        delete filtered[key];
      }
    });
    
    // 檢查是否為基本設定或核心設定模式
    const isAdvancedMode = excludeKeys.includes('generationSettingsGroups') || 
                          excludeKeys.includes('stockListData') ||
                          excludeKeys.includes('lastMainTab');
    
    if (isAdvancedMode) {
      const dynamicKeys = this.getDynamicContentKeys(filtered);
      dynamicKeys.forEach(key => {
        delete filtered[key];
      });
      
      console.log(`進階過濾模式：額外排除了 ${dynamicKeys.length} 個動態鍵值:`, dynamicKeys.slice(0, 5));
    }
    
    // 如果排除複雜內容，也要排除所有 replace_ 開頭的鍵值
    if (excludeKeys.includes('autoReplaceRules') || excludeKeys.includes('manualReplaceRules')) {
      Object.keys(filtered).forEach(key => {
        if (key.startsWith('replace_')) {
          delete filtered[key];
        }
      });
    }
    
    return filtered;
  }

  // 獲取大型文本框的鍵值列表
  getLargeTextKeys() {
    return [
      'instruction',
      'shortInstruction',
      'autoRewritePatterns',
      'translateInstruction',
      'summaryInstruction',
      'zhEnMapping',
      'reflectInstruction',
      'optimizeInstruction',
      'generateInstruction',
      'reflect1Instruction',
      'generationOptimize_1_Instruction',
      'reflect2Instruction',
      'generationOptimize_2_Instruction',
      'reflect3Instruction',
      'generationOptimize_3_Instruction',
      'backgroundKnowledge',
      'stockList'
    ];
  }

  // 獲取所有指令相關的鍵值列表
  getAllInstructionKeys() {
    return [
      ...this.getLargeTextKeys()
      // 其他可能的大型內容已移除，因為它們不再被使用
    ];
  }

  // 獲取複雜內容的鍵值列表（保留最基本的設定）
  getComplexContentKeys() {
    return [
      ...this.getAllInstructionKeys(),
      // 排除替換規則和其他複雜設定
      'autoReplaceRules',
      'manualReplaceRules',
      'generationSettingsGroups',
      'customModels',
      'highlightWords',
      'highlightColors',
      // 排除股票相關的大型數據
      'stockListData',
      'stockCrawlerState',
      'stockNames',
      'processedStocks',
      'failedStocks',
      'retryRecords',
      // 排除手動替換值
      'manualReplaceValues_0',
      'manualReplaceValues_1', 
      'manualReplaceValues_2',
      'replaceContent',
      'confirmContent'
    ];
  }

  // 新增：獲取以特定前綴開頭的動態鍵值
  getDynamicContentKeys(settings) {
    const dynamicKeys = [];
    Object.keys(settings).forEach(key => {
      // 排除以 generation_ 開頭的項目（通常是大型設定組合）
      if (key.startsWith('generation_')) {
        dynamicKeys.push(key);
      }
      // 排除以 instructions_ 開頭的項目（通常是大型指令內容）
      else if (key.startsWith('instructions_')) {
        dynamicKeys.push(key);
      }
      // 排除其他可能的大型動態鍵值
      else if (key.startsWith('replace_') || 
               key.startsWith('history_') || 
               key.startsWith('cache_') ||
               key.startsWith('temp_')) {
        dynamicKeys.push(key);
      }
    });
    return dynamicKeys;
  }

  // 獲取被排除項目的友好名稱
  getExcludedItemNames(excludeKeys) {
    const nameMap = {
      'instruction': '• 全文改寫指令',
      'shortInstruction': '• 短文本改寫指令',
      'autoRewritePatterns': '• 雙擊改寫匹配模式',
      'translateInstruction': '• 翻譯指令',
      'summaryInstruction': '• 關鍵要點指令',
      'zhEnMapping': '• 中英對照表',
      'reflectInstruction': '• 反思指令',
      'optimizeInstruction': '• 優化指令',
      'generateInstruction': '• 生成指令',
      'reflect1Instruction': '• 反思一指令',
      'generationOptimize_1_Instruction': '• 生成優化一指令',
      'reflect2Instruction': '• 反思二指令',
      'generationOptimize_2_Instruction': '• 生成優化二指令',
      'reflect3Instruction': '• 反思三指令',
      'generationOptimize_3_Instruction': '• 生成優化三指令',
      'backgroundKnowledge': '• 背景知識',
      'stockList': '• 股票清單',
      'autoReplaceRules': '• 自動替換規則',
      'manualReplaceRules': '• 手動替換規則',
      'generationSettingsGroups': '• 生成設定組合',
      'customModels': '• 自定義模型',
      'highlightWords': '• 高亮詞彙',
      'highlightColors': '• 高亮顏色',
      'stockListData': '• 股票數據',
      'stockCrawlerState': '• 股票爬蟲狀態',
      'stockNames': '• 股票名稱',
      'processedStocks': '• 處理的股票',
      'failedStocks': '• 失敗的股票',
      'retryRecords': '• 重試記錄',
      'manualReplaceValues_0': '• 手動替換值0',
      'manualReplaceValues_1': '• 手動替換值1',
      'manualReplaceValues_2': '• 手動替換值2',
      'replaceContent': '• 替換內容',
      'confirmContent': '• 確認內容',
      'lastMainTab': '• 上次主分頁',
      'lastSubTab': '• 上次子分頁',
      'crawlerInterval': '• 爬蟲間隔',
      'currentGenerationSettings': '• 當前生成設定',
      'isFirstTime': '• 首次使用標記',
      'replacePosition': '• 替換位置',
      'autoExport': '• 自動匯出',
      'finalOptimizeInstruction': '• 最終優化指令',
      'finalOptimizeModel': '• 最終優化模型'
    };

    return excludeKeys
      .map(key => {
        // 處理動態鍵值
        if (key.startsWith('generation_')) {
          return '• 生成設定數據';
        } else if (key.startsWith('instructions_')) {
          return '• 指令組合數據';
        } else {
          return nameMap[key] || `• ${key}`;
        }
      })
      .filter(name => name !== undefined);
  }

  // 驗證設定檔
  validateSettingsFile(importedData) {
    return (
      importedData &&
      importedData.appName === this.settings.SETTINGS_IDENTIFIER.appName &&
      importedData.version === this.settings.SETTINGS_IDENTIFIER.version
    );
  }

  // 獲取核心設定的排除列表（只保留最基本的 API 金鑰和模型設定）
  getCoreOnlyKeys() {
    // 獲取所有設定鍵值，然後只保留核心的
    const coreKeys = [
      'apiKeys',
      'model',
      'fullRewriteModel',
      'shortRewriteModel',
      'autoRewriteModel',
      'translateModel',
      'reflectModel',
      'optimizeModel',
      'generateModel',
      'reflect1Model',
      'generationOptimize_1_Model',
      'reflect2Model',
      'generationOptimize_2_Model',
      'reflect3Model',
      'generationOptimize_3_Model',
      'summaryModel',
      'removeHash',
      'removeStar',
      'confirmModel',
      'firstRun'
    ];
    
    // 返回所有其他鍵值作為排除列表
    return [
      ...this.getComplexContentKeys(),
      // 額外排除更多非核心設定
      'lastMainTab',
      'lastSubTab',
      'crawlerInterval',
      'currentGenerationSettings',
      'isFirstTime',
      'replacePosition',
      'autoExport',
      'finalOptimizeInstruction',
      'finalOptimizeModel'
    ];
  }

  // 清理殭屍項目
  async cleanupZombieSettings() {
    try {
      if (!confirm('確定要清理過時的設定項目嗎？\n\n這將移除：\n• cleaningRules\n• scraperConfigs\n• siteConfigs\n• backgroundKnowledgeGroups\n• instructionGroups\n等過時項目')) {
        return;
      }
      
      sendLog('info', '開始清理殭屍項目...');
      const result = await this.settings.cleanupZombieSettings();
      
      if (result) {
        this.ui.showSuccess('殭屍項目清理完成！建議重新載入頁面。');
        sendLog('success', '殭屍項目清理成功');
      } else {
        this.ui.showError('清理過程中發生錯誤');
        sendLog('error', '殭屍項目清理失敗');
      }
    } catch (error) {
      sendLog('error', '清理殭屍項目時發生錯誤', error);
      ErrorHandler.handle(error);
    }
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

  bindCleanupButton(callback) {
    this.#getElement('cleanup-settings')?.addEventListener('click', callback);
  }

  openImportDialog() {
    this.#getElement('import-file')?.click();
  }

  showSuccess(message) {
    // 使用 confirm 對話框來更好地顯示多行訊息
    if (message.includes('\n')) {
      // 對於包含換行的訊息，使用 confirm 對話框
      if (confirm(message + '\n\n點擊「確定」重新載入頁面')) {
        // 用戶點擊確定後會在調用處處理重新載入
        return true;
      }
      return false;
    } else {
      // 對於簡單訊息，使用 alert
      alert(message);
      return true;
    }
  }

  showError(message) {
    alert(`錯誤：${message}`);
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
            (key.includes('ReplaceRules') || key.includes('replace_')) && 
            value.some(item => typeof item === 'object')) {
          // 過濾掉無效的替換規則項
          return value.filter(item => {
            // 移除空值或完全空的物件
            if (!item || typeof item !== 'object') return false;
            
            // 檢查自動替換規則（有 enabled 屬性的情況）
            if ('enabled' in item) {
              // 啟用的規則必須有效，未啟用的規則可以保留
              if (item.enabled) {
                return item.from?.trim() || item.to?.trim();
              }
              return true; // 保留未啟用的規則
            }
            
            // 檢查手動替換規則（沒有 enabled 屬性的情況）
            return item.from?.trim() || item.to?.trim();
          });
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
    ['無效的設定檔', '這不是本插件的設定檔，請確認您選擇的檔案是否正確'],
    ['所有匯入策略都失敗了', '設定檔案過大或格式錯誤，無法匯入'],
    ['儲存資料到', '儲存設定時發生錯誤，可能是資料過大導致'],
    ['超過限制', '設定資料超過儲存空間限制，請減少大型文本內容'],
    ['QUOTA_BYTES_PER_ITEM quota exceeded', '單一設定項目過大，已自動排除大型文本內容重新嘗試'],
    ['QUOTA_BYTES quota exceeded', '總設定大小超過限制，已自動排除部分內容重新嘗試']
  ]);

  static handle(error) {
    console.error('發生錯誤:', error);
    
    // 特殊處理配額錯誤
    if (error.message.includes('QUOTA_BYTES')) {
      alert('儲存空間不足，建議手動減少大型文本內容後重新嘗試匯入。');
      return;
    }
    
    const message = Array.from(this.#errorMessages.entries())
      .find(([key]) => error.message.includes(key))?.[1] 
      || `發生未知錯誤：${error.message}`;
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