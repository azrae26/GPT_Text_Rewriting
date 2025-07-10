/**
 * settings-key.js - 統一鍵值分類器 (2025/01/08)
 * 功能：提供統一的鍵值分類和過濾邏輯
 * 職責：
 * - 將所有設定鍵值按性質進行分類
 * - 提供統一的包含/排除邏輯
 * - 支持靜態鍵值和動態模式匹配
 * - 處理特殊規則和邊緣情況
 * 
 * 目標：簡化同步系統，避免在多個地方重複定義排除邏輯
 * 依賴：無（獨立模組）
 */

class KeyClassifier {
  // 基於鍵值性質的分類系統
  static CATEGORIES = {
    // 核心設定：API 金鑰、模型選擇等基本配置
    CORE_SETTINGS: [
      'apiKeys', 'model', 'fullRewriteModel', 'shortRewriteModel', 
      'autoRewriteModel', 'translateModel', 'reflectModel', 'optimizeModel',
      'generateModel', 'reflect1Model', 'generationOptimize_1_Model',
      'reflect2Model', 'generationOptimize_2_Model', 'reflect3Model',
      'generationOptimize_3_Model', 'summaryModel', 'confirmModel',
      'removeHash', 'removeStar', 'firstRun', 'crawlerInterval'
    ],

    // 界面狀態：分頁、位置、展開狀態等 UI 相關
    UI_STATE: [
      'lastMainTab', 'lastSubTab', 'windowState', 'selectedItem',
      'expandedSections', 'scrollPosition', 'dialogState', 'panelState',
      'replacePosition', 'summaryPosition', 'summaryExpanded',
      'isFirstTime', 'autoExport'
    ],

    // 大型內容：指令、背景知識等大型文本
    LARGE_CONTENT: [
      'instruction', 'shortInstruction', 'autoRewritePatterns',
      'translateInstruction', 'summaryInstruction', 'codeCheckInstruction', 'codeCheckModel', 'zhEnMapping',
      'reflectInstruction', 'optimizeInstruction', 'generateInstruction',
      'reflect1Instruction', 'generationOptimize_1_Instruction',
      'reflect2Instruction', 'generationOptimize_2_Instruction',
      'reflect3Instruction', 'generationOptimize_3_Instruction',
      'backgroundKnowledge', 'stockList'
    ],

    // 內部系統狀態：同步狀態、錯誤信息等系統內部數據
    INTERNAL_SYSTEM: [
      'syncStatus', 'lastSyncTime', 'driveFileId', 'syncError',
      'syncDebugLogs', 'stockCrawlerState', 'settingsHash',
      'authToken', 'tokenExpiry', 'exportToken', 'lastExportTime',
      'syncIntervalMigrated',  // 同步間隔遷移標記
      'cloudUpdateSignal',     // 雲端更新訊號（用於通知其他設備同步）
      'crawlerAutoEnabled',    // 爬蟲自動啟用狀態（sync storage 即時同步）
      'crawlerInterval'        // 爬蟲間隔分鐘數（sync storage 即時同步）
    ],

    // 用戶數據：替換規則、自定義模型、高亮設定等
    USER_DATA: [
      'autoReplaceRules', 'manualReplaceRules', 'customModels',
      'generationSettingsGroups', 'currentGenerationSettings',
      'highlightWords', 'highlightColors', 'autoSyncEnabled',
      'replaceContent', 'confirmContent'
    ],

    // 物件內部屬性：GlobalSettings 的內部屬性，不是實際設定值
    OBJECT_PROPERTIES: [
      'API', 'LOCAL_STORAGE_KEYS', 'SETTINGS_IDENTIFIER',
      'finalOptimizeInstruction', 'finalOptimizeModel'
    ],

    // 測試垃圾：開發測試時產生的無效鍵值，應該被清理
    TEST_GARBAGE: [
      'testSetting', 'testKey', 'syncSignal', 'syncTrigger', 
      'deviceId', 'testData', 'debugInfo', 'uiUpdateTrigger',
      'deviceUniqueId',           // 設備唯一ID（測試時產生的無效鍵值）
      'lastProcessedSignalId',    // 最後處理的訊號ID（測試時產生的無效鍵值）
      'crawlerEnabled'            // 無效的爬蟲鍵值（應使用 crawlerAutoEnabled）
    ]
  };

  // 動態鍵值的模式匹配
  static DYNAMIC_PATTERNS = {
    LARGE_CONTENT: [
      /^replace_/,           // 替換規則 (新格式)
      /^generation_/,        // 生成設定
      /^instructions_/,      // 指令組合
      /^custom_/,           // 自定義內容
      /^template_/,         // 模板內容
      /^background_/        // 背景知識組
    ],
    
    USER_DATA: [
      /^replace_/,                    // 替換規則
      /^manualReplaceValues_/,        // 手動替換值
      /^generation_settings_/,        // 生成設定組合
      /^history_/                     // 歷史記錄
    ],

    INTERNAL_SYSTEM: [
      /^stockNames/,          // 股票相關內部數據
      /^processedStocks/,
      /^failedStocks/,
      /^retryRecords/,
      /^cache_/,             // 緩存數據
      /^temp_/               // 臨時數據
    ]
  };

  // 特殊規則：處理邊緣情況和特殊需求
  static SPECIAL_RULES = {
    // 同步開關：不能雲端同步避免循環，但可以匯出，必須用本地存儲
    syncEnabled: {
      cloudSync: false,
      export: true,
      localStorage: true
    },
    
    // 同步間隔：使用 Chrome sync storage 即時同步，不需雲端同步，但需要匯出供新設備使用
    syncInterval: {
      cloudSync: false,     // 不透過 SettingsIO 雲端同步（Chrome sync storage 已處理）
      export: true,         // 需要匯出（新電腦需要）
      comparison: false,    // 不參與雲端同步比較
      localStorage: false   // 使用 sync storage，不是 local storage
    },
    
    // 時間戳：不雲端同步避免設備間衝突，但需要被 getAllSettings 包含用於本地比較
    lastModified: {
      cloudSync: false,
      comparison: true,    // 新增：允許比較用途
      export: true,        // 修正：允許 getAllSettings 包含（但雲端同步會排除）
      localStorage: true
    },
    
    // 股票列表數據：太大不適合同步，但可以匯出
    stockListData: {
      cloudSync: false,
      export: true,
      localStorage: true
    }
  };

  // 使用策略：定義不同用途應該包含哪些分類
  static USAGE_POLICIES = {
    // 雲端同步：核心設定 + 大型內容 + 用戶數據
    cloudSync: ['CORE_SETTINGS', 'LARGE_CONTENT', 'USER_DATA'],
    
    // 匯出：除了內部系統狀態外都匯出
    export: ['CORE_SETTINGS', 'UI_STATE', 'LARGE_CONTENT', 'USER_DATA'],
    
    // 本地存儲：大型內容 + 內部系統狀態 + 特殊項目
    localStorage: ['LARGE_CONTENT', 'INTERNAL_SYSTEM'],
    
    // 比較過濾：排除界面狀態和內部系統狀態
    comparison: ['CORE_SETTINGS', 'LARGE_CONTENT', 'USER_DATA']
  };

  /**
   * 獲取鍵值的分類
   * @param {string} key - 要分類的鍵值
   * @returns {string} - 分類名稱
   */
  static getKeyCategory(key) {
    // 先檢查特殊規則
    if (this.SPECIAL_RULES[key]) {
      return 'SPECIAL';
    }

    // 再檢查靜態分類
    for (const [category, keys] of Object.entries(this.CATEGORIES)) {
      if (keys.includes(key)) {
        return category;
      }
    }
    
    // 最後檢查動態模式
    for (const [category, patterns] of Object.entries(this.DYNAMIC_PATTERNS)) {
      if (patterns.some(pattern => pattern.test(key))) {
        return category;
      }
    }
    
    return 'UNKNOWN';
  }

  /**
   * 檢查鍵值是否應該包含在指定用途中
   * @param {string} key - 要檢查的鍵值
   * @param {string} purpose - 用途 ('cloudSync', 'export', 'localStorage', 'comparison')
   * @returns {boolean} - 是否應該包含
   */
  static shouldInclude(key, purpose) {
    // 檢查特殊規則
    if (this.SPECIAL_RULES[key]) {
      const rule = this.SPECIAL_RULES[key];
      // 檢查是否有該 purpose 的明確設定
      if (rule.hasOwnProperty(purpose)) {
        return rule[purpose] === true;
      }
      // 對於沒有明確設定的 purpose，檢查是否有相關的設定
      // 例如 'comparison' 用途可以查看是否允許比較
      if (purpose === 'comparison' && rule.comparison === true) {
        return true;
      }
      return false;
    }

    const category = this.getKeyCategory(key);
    
    // 物件內部屬性和測試垃圾永遠排除，不顯示警告
    if (category === 'OBJECT_PROPERTIES' || category === 'TEST_GARBAGE') {
      return false;
    }
    
    if (category === 'UNKNOWN') {
      // 未知鍵值的預設行為
      LogUtils.warn(`未知鍵值: ${key}，將根據預設策略處理`);
      return purpose === 'export'; // 預設只允許匯出
    }

    const allowedCategories = this.USAGE_POLICIES[purpose] || [];
    return allowedCategories.includes(category);
  }

  /**
   * 檢查鍵值是否應該排除
   * @param {string} key - 要檢查的鍵值
   * @param {string} purpose - 用途
   * @returns {boolean} - 是否應該排除
   */
  static shouldExclude(key, purpose) {
    return !this.shouldInclude(key, purpose);
  }

  /**
   * 過濾鍵值列表
   * @param {string[]} keys - 要過濾的鍵值列表
   * @param {string} purpose - 用途
   * @returns {string[]} - 過濾後的鍵值列表
   */
  static filterKeys(keys, purpose) {
    return keys.filter(key => this.shouldInclude(key, purpose));
  }

  /**
   * 過濾設定物件
   * @param {object} settings - 要過濾的設定物件
   * @param {string} purpose - 用途
   * @returns {object} - 過濾後的設定物件
   */
  static filterSettings(settings, purpose) {
    const filtered = {};
    Object.entries(settings).forEach(([key, value]) => {
      if (this.shouldInclude(key, purpose)) {
        filtered[key] = value;
      }
    });
    return filtered;
  }

  /**
   * 獲取鍵值應該使用的存儲類型
   * @param {string} key - 要檢查的鍵值
   * @returns {string} - 存儲類型 ('local' 或 'sync')
   */
  static getStorageType(key) {
    return this.shouldInclude(key, 'localStorage') ? 'local' : 'sync';
  }

  /**
   * 檢查鍵值是否為設定相關的鍵值（用於 storage change 監聽）
   * @param {string} key - 要檢查的鍵值
   * @returns {boolean} - 是否為設定鍵值
   */
  static isSettingsKey(key) {
    const category = this.getKeyCategory(key);
    return category !== 'UNKNOWN' && 
           category !== 'INTERNAL_SYSTEM' && 
           category !== 'OBJECT_PROPERTIES';
  }

  /**
   * 獲取分類的詳細信息（用於調試）
   * @param {string} key - 要檢查的鍵值
   * @returns {object} - 詳細信息
   */
  static getKeyInfo(key) {
    const category = this.getKeyCategory(key);
    const purposes = {};
    
    for (const purpose of Object.keys(this.USAGE_POLICIES)) {
      purposes[purpose] = this.shouldInclude(key, purpose);
    }
    
    return {
      key,
      category,
      storageType: this.getStorageType(key),
      purposes,
      isSpecial: !!this.SPECIAL_RULES[key],
      isSettingsKey: this.isSettingsKey(key)
    };
  }

  /**
   * 驗證分類系統的完整性（開發用）
   * @param {string[]} allKeys - 要驗證的所有鍵值
   * @returns {object} - 驗證結果
   */
  static validateClassification(allKeys) {
    const results = {
      unknown: [],
      categories: {},
      storageDistribution: { local: 0, sync: 0 },
      purposeDistribution: {}
    };

    for (const purpose of Object.keys(this.USAGE_POLICIES)) {
      results.purposeDistribution[purpose] = 0;
    }

    allKeys.forEach(key => {
      const category = this.getKeyCategory(key);
      if (category === 'UNKNOWN') {
        results.unknown.push(key);
      }
      
      if (!results.categories[category]) {
        results.categories[category] = 0;
      }
      results.categories[category]++;
      
      const storageType = this.getStorageType(key);
      results.storageDistribution[storageType]++;
      
      for (const purpose of Object.keys(this.USAGE_POLICIES)) {
        if (this.shouldInclude(key, purpose)) {
          results.purposeDistribution[purpose]++;
        }
      }
    });

    return results;
  }
}

// 全局暴露
if (typeof window !== 'undefined') {
  window.KeyClassifier = KeyClassifier;
} else if (typeof self !== 'undefined') {
  self.KeyClassifier = KeyClassifier;
} else if (typeof global !== 'undefined') {
  global.KeyClassifier = KeyClassifier;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = KeyClassifier;
} 