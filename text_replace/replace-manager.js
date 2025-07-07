/**
 * 替換管理器 - 簡化版協調器
 * 
 * 功能：
 * 1. 協調各個專業模組的工作
 * 2. 提供統一的初始化接口
 * 3. 管理組件生命週期
 * 4. 處理模組間的通信
 * 
 * 職責：
 * - 初始化和協調各個專業模組
 * - 提供向後兼容的API接口
 * - 管理模組間的依賴關係
 * - 處理全局事件和狀態同步
 * 
 * 依賴模組：
 * - replace-core.js (核心配置和介面)
 * - replace-storage.js (存儲管理)
 * - replace-drag.js (拖移排序)
 * - replace-preview.js (預覽功能)
 * - manual-replace-core.js (手動替換核心)
 * - auto-replace-core.js (自動替換核心)
 */

window.ReplaceManager = {

  /**
   * 動態時間格式化函數
   */
  _getTimeStamp() {
    const now = new Date();
    const hours = now.getHours().toString().padStart(2, '0');
    const minutes = now.getMinutes().toString().padStart(2, '0');
    const seconds = now.getSeconds().toString().padStart(2, '0');
    return `${hours}:${minutes}:${seconds}`;
  },

  /**
   * 初始化狀態
   */
  _initialized: false,
  _activeModules: new Set(),
  _textAreaRef: null,

  /**
   * 初始化替換組
   * @param {Object} options 配置選項
   * @param {HTMLElement} options.mainContainer 主組容器
   * @param {HTMLElement} options.otherContainer 其他組容器  
   * @param {HTMLTextAreaElement} options.textArea 文本區域
   * @param {string} options.storageKey 儲存鍵名
   * @param {Function} options.createGroupFn 創建組函數
   * @param {Function} options.onInitialized 初始化完成回調
   * @param {boolean} options.isManual 是否為手動模式
   */
  initializeReplaceGroups(options) {
    const {
      mainContainer,
      otherContainer,
      textArea,
      storageKey,
      createGroupFn,
      onInitialized,
      isManual = false
    } = options;

    console.log(`[ReplaceManager][${this._getTimeStamp()}] 🚀 開始初始化替換組系統 (${isManual ? '手動' : '自動'}模式)`);

    if (!textArea || !otherContainer) {
      console.error(`[ReplaceManager][${this._getTimeStamp()}] ❌ 缺少必要元素`);
      return;
    }

    this._textAreaRef = textArea;

    // 初始化核心模組
    this._initializeModules(textArea, isManual);

    // 創建主組（如果有主容器）
    if (mainContainer && createGroupFn) {
      const mainGroup = createGroupFn(textArea, true);
      mainContainer.appendChild(mainGroup);
      console.log(`[ReplaceManager][${this._getTimeStamp()}] ✅ 主組已創建`);
    }

    // 從存儲載入並創建其他組
    this.StorageHelper.loadRules(storageKey, [{ from: '', to: '' }], (rules) => {
      console.log(`[ReplaceManager][${this._getTimeStamp()}] 📦 從存儲載入 ${rules.length} 個規則`);

      // 過濾空規則，但至少保留一個
      const filteredRules = rules.filter(rule => 
        rule.from?.trim() || rule.to?.trim()
      );
      const finalRules = filteredRules.length > 0 ? filteredRules : [{ from: '', to: '' }];

      // 創建組
      finalRules.forEach((rule, index) => {
        if (createGroupFn) {
          const group = createGroupFn(textArea, false, rule, index);
          otherContainer.appendChild(group);
        }
      });

      console.log(`[ReplaceManager][${this._getTimeStamp()}] ✅ 創建了 ${finalRules.length} 個替換組`);

      // 設置模組間協調
      this._setupModuleCoordination(textArea, isManual);

      // 標記初始化完成
      this._initialized = true;

      // 執行回調
      if (onInitialized) {
        onInitialized();
      }

      console.log(`[ReplaceManager][${this._getTimeStamp()}] 🎉 替換組系統初始化完成`);
    });
  },

  /**
   * 初始化核心模組
   * @param {HTMLTextAreaElement} textArea 文本區域
   * @param {boolean} isManual 是否為手動模式
   * @private
   */
  _initializeModules(textArea, isManual) {
    // 初始化存儲模組
    if (window.ReplaceStorage) {
      window.ReplaceStorage.initialize();
      this._activeModules.add('storage');
      console.log(`[ReplaceManager][${this._getTimeStamp()}] ✅ 存儲模組已初始化`);
    }

    // 初始化拖移模組
    if (window.ReplaceDrag) {
      window.ReplaceDrag.initialize();
      this._activeModules.add('drag');
      console.log(`[ReplaceManager][${this._getTimeStamp()}] ✅ 拖移模組已初始化`);
    }

    // 初始化預覽模組
    if (window.ReplacePreview) {
      window.ReplacePreview.initialize(textArea);
      this._activeModules.add('preview');
      console.log(`[ReplaceManager][${this._getTimeStamp()}] ✅ 預覽模組已初始化`);
    }

    // 根據模式初始化對應的核心模組
    if (isManual && window.ManualReplaceCore) {
      window.ManualReplaceCore.initialize(textArea);
      this._activeModules.add('manual-core');
      console.log(`[ReplaceManager][${this._getTimeStamp()}] ✅ 手動替換核心模組已初始化`);
    } else if (!isManual && window.AutoReplaceCore) {
      window.AutoReplaceCore.initialize(textArea);
      this._activeModules.add('auto-core');
      console.log(`[ReplaceManager][${this._getTimeStamp()}] ✅ 自動替換核心模組已初始化`);
    }
  },

  /**
   * 設置模組間協調
   * @param {HTMLTextAreaElement} textArea 文本區域
   * @param {boolean} isManual 是否為手動模式
   * @private
   */
  _setupModuleCoordination(textArea, isManual) {
    // 設置預覽模組的回調
    if (window.ReplacePreview) {
      // 設置更新回調
      window.ReplacePreview.onUpdate = () => {
        if (isManual && window.ManualReplaceManager) {
          window.ManualReplaceManager._updatePreviews();
        } else if (!isManual && window.AutoReplaceManager) {
          // 自動模式的預覽更新邏輯
          // 這裡可以根據需要添加自動模式的預覽更新
        }
      };

      // 設置規則獲取回調
      window.ReplacePreview.onGetRules = () => {
        if (isManual && window.ManualReplaceManager) {
          return [
            window.ManualReplaceManager._rules.mainGroup,
            ...window.ManualReplaceManager._rules.extraGroups
          ];
        } else if (!isManual && window.AutoReplaceManager) {
          // 自動模式的規則獲取邏輯
          return [];
        }
        return [];
      };
    }

    console.log(`[ReplaceManager][${this._getTimeStamp()}] ✅ 模組間協調已設置`);
  },

  /**
   * 存儲助手 - 委託給 ReplaceStorage 模組
   */
  StorageHelper: {
    /**
     * 載入規則
     * @param {string} storageKey 存儲鍵
     * @param {Array} defaultRules 預設規則
     * @param {Function} callback 回調函數
     */
    loadRules(storageKey, defaultRules, callback) {
      if (window.ReplaceStorage) {
        window.ReplaceStorage.loadRules(storageKey, defaultRules, callback);
      } else {
        console.warn(`[ReplaceManager][${window.ReplaceManager._getTimeStamp()}] ReplaceStorage 模組未載入，使用預設規則`);
        callback(defaultRules);
      }
    },

    /**
     * 保存規則
     * @param {string} storageKey 存儲鍵
     * @param {Array} rules 規則陣列
     * @param {Function} callback 回調函數
     */
    saveRules(storageKey, rules, callback) {
      if (window.ReplaceStorage) {
        window.ReplaceStorage.saveRules(storageKey, rules, callback);
      } else {
        console.warn(`[ReplaceManager][${window.ReplaceManager._getTimeStamp()}] ReplaceStorage 模組未載入，無法保存規則`);
        if (callback) callback();
      }
    },

    /**
     * 從DOM提取規則
     * @param {Object} options 選項
     * @param {HTMLElement} options.container 容器
     * @param {string} options.groupSelector 組選擇器
     * @returns {Array} 規則陣列
     */
    extractRulesFromDOM(options) {
      if (window.ReplaceStorage) {
        return window.ReplaceStorage.extractRulesFromDOM(options);
      } else {
        console.warn(`[ReplaceManager][${window.ReplaceManager._getTimeStamp()}] ReplaceStorage 模組未載入，返回空陣列`);
        return [];
      }
    }
  },

  /**
   * 拖移管理器 - 委託給 ReplaceDrag 模組
   */
  DragManager: {
    /**
     * 設置排序拖移事件
     * @param {HTMLElement} button 拖移按鈕
     * @param {Object} options 配置選項
     */
    setupSortDragEvents(button, options) {
      if (window.ReplaceDrag) {
        window.ReplaceDrag.setupSortDragEvents(button, options);
      } else {
        console.warn(`[ReplaceManager][${window.ReplaceManager._getTimeStamp()}] ReplaceDrag 模組未載入，無法設置拖移功能`);
      }
    },

    /**
     * 設置拖移組合事件
     * @param {HTMLElement} container 容器
     * @param {Object} options 配置選項
     */
    setupGroupDragEvents(container, options) {
      if (window.ReplaceDrag) {
        window.ReplaceDrag.setupGroupDragEvents(container, options);
      } else {
        console.warn(`[ReplaceManager][${window.ReplaceManager._getTimeStamp()}] ReplaceDrag 模組未載入，無法設置組拖移功能`);
      }
    }
  },

  /**
   * 事件管理器 - 委託給 ReplaceEvents 模組
   */
  EventManager: {
    /**
     * 設置組事件
     * @param {HTMLElement} group 組元素
     * @param {HTMLTextAreaElement} textArea 文本區域
     * @param {HTMLInputElement} fromInput 來源輸入框
     * @param {HTMLInputElement} toInput 目標輸入框
     * @param {HTMLElement} checkboxOrButton 複選框或按鈕
     * @param {Object} options 配置選項
     */
    setupGroupEvents(group, textArea, fromInput, toInput, checkboxOrButton, options = {}) {
      if (window.ReplaceEvents) {
        window.ReplaceEvents.setupGroupEvents(group, textArea, fromInput, toInput, checkboxOrButton, options);
      } else {
        console.warn(`[ReplaceManager][${window.ReplaceManager._getTimeStamp()}] ReplaceEvents 模組未載入，無法設置組事件`);
      }
    }
  },

  /**
   * 預覽管理器 - 委託給 ReplacePreview 模組
   */
  PreviewManager: {
    /**
     * 更新所有預覽
     */
    updateAllPreviews() {
      if (window.ReplacePreview) {
        window.ReplacePreview.updateAllPreviews();
      } else {
        console.warn(`[ReplaceManager][${window.ReplaceManager._getTimeStamp()}] ReplacePreview 模組未載入，無法更新預覽`);
      }
    },

    /**
     * 更新組預覽
     * @param {HTMLTextAreaElement} textArea 文本區域
     * @param {string} searchText 搜尋文字
     * @param {number} groupIndex 組索引
     */
    updateGroupPreview(textArea, searchText, groupIndex) {
      if (window.ReplacePreview) {
        window.ReplacePreview.updateGroupPreview(textArea, searchText, groupIndex);
      } else {
        console.warn(`[ReplaceManager][${window.ReplaceManager._getTimeStamp()}] ReplacePreview 模組未載入，無法更新組預覽`);
      }
    },

    /**
     * 清理預覽
     */
    cleanup() {
      if (window.ReplacePreview) {
        window.ReplacePreview.cleanup();
      }
    }
  },

  /**
   * 工具方法
   */
  Utils: {
    /**
     * 檢查模組是否載入
     * @param {string} moduleName 模組名稱
     * @returns {boolean} 是否載入
     */
    isModuleLoaded(moduleName) {
      const moduleMap = {
        'storage': 'ReplaceStorage',
        'drag': 'ReplaceDrag', 
        'events': 'ReplaceEvents',
        'preview': 'ReplacePreview',
        'manual-core': 'ManualReplaceCore',
        'auto-core': 'AutoReplaceCore'
      };
      
      const globalName = moduleMap[moduleName];
      return globalName && !!window[globalName];
    },

    /**
     * 獲取已載入的模組列表
     * @returns {Array} 模組名稱陣列
     */
    getLoadedModules() {
      return Array.from(window.ReplaceManager._activeModules);
    },

    /**
     * 檢查系統狀態
     * @returns {Object} 狀態資訊
     */
    getSystemStatus() {
      return {
        initialized: window.ReplaceManager._initialized,
        activeModules: Array.from(window.ReplaceManager._activeModules),
        textAreaAttached: !!window.ReplaceManager._textAreaRef,
        timestamp: window.ReplaceManager._getTimeStamp()
      };
    }
  },

  /**
   * 生命週期管理
   */
  LifecycleManager: {
    /**
     * 清理系統
     */
    cleanup() {
      console.log(`[ReplaceManager][${window.ReplaceManager._getTimeStamp()}] 🧹 開始清理替換管理系統`);

      // 清理各個模組
      if (window.ReplacePreview) {
        window.ReplacePreview.cleanup();
      }

      if (window.ReplaceDrag) {
        window.ReplaceDrag.cleanup();
      }

      if (window.ReplaceStorage) {
        window.ReplaceStorage.cleanup();
      }

      // 重置狀態
      window.ReplaceManager._initialized = false;
      window.ReplaceManager._activeModules.clear();
      window.ReplaceManager._textAreaRef = null;

      console.log(`[ReplaceManager][${window.ReplaceManager._getTimeStamp()}] ✅ 替換管理系統已清理`);
    },

    /**
     * 重新初始化系統
     * @param {Object} options 初始化選項
     */
    reinitialize(options) {
      this.cleanup();
      setTimeout(() => {
        window.ReplaceManager.initializeReplaceGroups(options);
      }, 100);
    }
  },

  /**
   * 向後兼容的方法 - 維持原有API
   */
  
  /**
   * 檢查手動替換一致性 (向後兼容)
   * @private
   */
  _checkManualReplaceConsistency() {
    if (window.ManualReplaceManager && window.ManualReplaceManager.shouldRefresh) {
      // 委託給手動替換管理器
      console.log(`[ReplaceManager][${this._getTimeStamp()}] 檢查手動替換一致性 - 委託給 ManualReplaceManager`);
    }
  },

  /**
   * 設置組事件 (向後兼容)
   */
  setupGroupEvents(group, textArea, fromInput, toInput, checkboxOrButton, options = {}) {
    this.EventManager.setupGroupEvents(group, textArea, fromInput, toInput, checkboxOrButton, options);
  }
};

// 全局事件處理
document.addEventListener('DOMContentLoaded', () => {
  // 檢查手動替換一致性 (向後兼容)
  if (window.ReplaceManager) {
    window.ReplaceManager._checkManualReplaceConsistency();
  }
});

console.log(`[ReplaceManager] 替換管理器模組已載入 - 協調器模式`); 