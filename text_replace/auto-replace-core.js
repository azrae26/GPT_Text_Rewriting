/**
 * 自動替換核心模組
 * 
 * 功能：
 * 1. 替換執行引擎 - 自動批量執行替換規則
 * 2. 年份格式處理 - 支援YYYY、YY等動態年份格式  
 * 3. 規則管理 - 獲取、過濾、驗證啟用的替換規則
 * 4. 游標狀態保護 - 替換後恢復游標位置
 * 5. 消息通訊 - 在popup和content script間協調
 * 
 * 職責：
 * - 提供自動替換的核心API
 * - 處理動態年份格式轉換
 * - 管理替換規則的執行邏輯
 * - 協調不同環境下的替換操作
 * 
 * 依賴：
 * - replace-core.js (基礎配置和工具)
 * - regex_helper/regex-helper.js (正則表達式處理)
 */

window.AutoReplaceCore = {

  /**
   * 配置常數
   */
  CONFIG: {
    AUTO_REPLACE_KEY: 'autoReplaceRules',
    YEAR_FETCH_DELAY: 500, // 獲取年份前的延遲時間（毫秒）
    MAX_REPLACEMENT_CYCLES: 10, // 最大替換輪數，防止無限循環
    DEBUG_MODE: false // 是否開啟調試模式
  },

  /**
   * 內部狀態
   */
  _state: {
    activeRules: [],
    regexCache: new Map(),
    lastExecutionTime: 0,
    isExecuting: false
  },

  /**
   * 動態時間格式化函數
   */
  _getTimeStamp() {
    const now = new Date();
    return now.toISOString();
  },

  /**
   * 消息通訊管理器
   */
  MessageManager: {
    /**
     * 發送消息到活動標籤頁
     * @param {Object} message 要發送的消息
     */
    sendMessageToTab(message) {
      if (typeof chrome === 'undefined' || !chrome.tabs) {
        console.debug('[AutoReplaceCore] Chrome tabs API 不可用');
        return;
      }

      chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
        if (!tabs[0]) {
          console.debug('[AutoReplaceCore] 沒有找到活動的標籤頁');
          return;
        }
        
        try {
          chrome.tabs.sendMessage(tabs[0].id, message, function(response) {
            if (chrome.runtime.lastError) {
              console.debug('[AutoReplaceCore] Content script 正在載入中...');
              return;
            }
          });
        } catch (error) {
          console.debug('[AutoReplaceCore] 發送消息時出錯:', error);
        }
      });
    },

    /**
     * 發送自動替換觸發消息到content script
     */
    sendAutoReplaceTrigger() {
      this.sendMessageToTab({
        action: "triggerAutoReplace"
      });
    }
  },

  /**
   * 年份處理器
   */
  YearProcessor: {
    /**
     * 從網頁獲取當前年份
     * @returns {Promise<number>} 當前年份
     */
    async getCurrentYear() {
      try {
        console.log(`[AutoReplaceCore][${AutoReplaceCore._getTimeStamp()}] 🗓️ 開始獲取當前年份...`);
        
        // 延遲指定毫秒數
        await new Promise(resolve => setTimeout(resolve, AutoReplaceCore.CONFIG.YEAR_FETCH_DELAY));
        
        // 嘗試從指定的CSS選擇器獲取年份
        const dateInput = document.querySelector('.MuiInputBase-root.MuiOutlinedInput-root.MuiInputBase-colorPrimary.MuiInputBase-formControl.MuiInputBase-adornedEnd.css-1oy18r0 input');
        console.log(`[AutoReplaceCore][${AutoReplaceCore._getTimeStamp()}] 🔍 查找日期輸入框: ${dateInput ? '找到' : '未找到'}`);
        
        if (dateInput && dateInput.value) {
          const dateValue = dateInput.value;
          console.log(`[AutoReplaceCore][${AutoReplaceCore._getTimeStamp()}] 📅 日期框值: ${dateValue}`);
          
          // 嘗試從日期值中提取年份
          const yearMatch = dateValue.match(/(\d{4})/);
          if (yearMatch) {
            const year = parseInt(yearMatch[1]);
            console.log(`[AutoReplaceCore][${AutoReplaceCore._getTimeStamp()}] ✅ 從網頁日期框成功獲取年份: ${year}`);
            return year;
          } else {
            console.log(`[AutoReplaceCore][${AutoReplaceCore._getTimeStamp()}] ⚠️ 日期值中未找到四位年份格式`);
          }
        } else {
          console.log(`[AutoReplaceCore][${AutoReplaceCore._getTimeStamp()}] ⚠️ 日期框為空或不存在`);
        }
        
        // 如果無法從網頁獲取，使用當前系統年份作為備份
        const currentYear = new Date().getFullYear();
        console.log(`[AutoReplaceCore][${AutoReplaceCore._getTimeStamp()}] 🔄 使用系統年份作為備份: ${currentYear}`);
        return currentYear;
      } catch (error) {
        console.warn(`[AutoReplaceCore][${AutoReplaceCore._getTimeStamp()}] ❌ 獲取年份時出錯，使用系統年份:`, error);
        const fallbackYear = new Date().getFullYear();
        console.log(`[AutoReplaceCore][${AutoReplaceCore._getTimeStamp()}] 🆘 異常備份年份: ${fallbackYear}`);
        return fallbackYear;
      }
    },

    /**
     * 處理替換詞中的年份格式
     * @param {string} text 包含年份格式的文本
     * @returns {Promise<string>} 處理後的文本
     */
    async processYearFormats(text) {
      if (!text || typeof text !== 'string') {
        return text;
      }

      // 檢查是否包含年份格式
      const hasYearFormat = /YYYY([+-]\d+)?|YY([+-]\d+)?/g.test(text);
      if (!hasYearFormat) {
        return text; // 沒有年份格式，直接返回，不顯示調試訊息
      }

      console.log(`[AutoReplaceCore][${AutoReplaceCore._getTimeStamp()}] 🔄 開始處理年份格式，原始文本: "${text}"`);
      const currentYear = await this.getCurrentYear();
      let processedText = text;

      console.log(`[AutoReplaceCore][${AutoReplaceCore._getTimeStamp()}] 📊 基準年份: ${currentYear}`);

      // 處理四位年份格式 YYYY±數字
      processedText = processedText.replace(/YYYY([+-]\d+)?/g, (match, offset) => {
        if (offset) {
          const adjustment = parseInt(offset);
          const targetYear = currentYear + adjustment;
          console.log(`[AutoReplaceCore][${AutoReplaceCore._getTimeStamp()}] 🔢 四位年份格式替換: ${match} → ${targetYear} (基準${currentYear}${offset}=${targetYear})`);
          return targetYear.toString();
        } else {
          console.log(`[AutoReplaceCore][${AutoReplaceCore._getTimeStamp()}] 🔢 四位年份格式替換: ${match} → ${currentYear}`);
          return currentYear.toString();
        }
      });

      // 處理兩位年份格式 YY±數字
      processedText = processedText.replace(/YY([+-]\d+)?/g, (match, offset) => {
        let targetYear = currentYear;
        if (offset) {
          const adjustment = parseInt(offset);
          targetYear = currentYear + adjustment;
        }
        const twoDigitYear = (targetYear % 100).toString().padStart(2, '0');
        console.log(`[AutoReplaceCore][${AutoReplaceCore._getTimeStamp()}] 🔢 兩位年份格式替換: ${match} → ${twoDigitYear} (來自${targetYear})`);
        return twoDigitYear;
      });

      console.log(`[AutoReplaceCore][${AutoReplaceCore._getTimeStamp()}] ✅ 年份格式處理完成: "${text}" → "${processedText}"`);
      return processedText;
    }
  },

  /**
   * 規則管理器
   */
  RuleManager: {
    /**
     * 獲取所有啟用的替換規則
     * @returns {Array} 啟用的規則陣列
     */
    getActiveRules() {
      // 如果有快取的活躍規則，使用快取
      if (AutoReplaceCore._state.activeRules && AutoReplaceCore._state.activeRules.length > 0) {
        return AutoReplaceCore._state.activeRules.filter(rule => rule.enabled && rule.from);
      }

      // 否則從 DOM 中獲取規則
      const rules = Array.from(document.querySelectorAll('.auto-replace-group'))
        .map(group => {
          const containers = Array.from(group.children)
            .filter(el => el.classList.contains('replace-input-container'));
          const fromInput = containers[0]?.querySelector('.replace-input');
          const toInput = containers[1]?.querySelector('.replace-input');
          const enabled = group.querySelector('.auto-replace-checkbox')?.checked || false;
          
          return {
            from: fromInput?.value?.trim() || '',
            to: toInput?.value?.trim() || '',
            enabled
          };
        })
        .filter(rule => rule.enabled && rule.from);

      return rules;
    },

    /**
     * 設置活躍規則
     * @param {Array} rules 規則陣列
     */
    setActiveRules(rules) {
      AutoReplaceCore._state.activeRules = rules;
    },

    /**
     * 驗證規則有效性
     * @param {Object} rule 規則對象
     * @returns {boolean} 是否有效
     */
    validateRule(rule) {
      return rule && 
             typeof rule.from === 'string' && 
             rule.from.trim() !== '' &&
             typeof rule.to === 'string' &&
             rule.enabled === true;
    },

    /**
     * 過濾有效規則
     * @param {Array} rules 規則陣列
     * @returns {Array} 有效規則陣列
     */
    filterValidRules(rules) {
      return rules.filter(rule => this.validateRule(rule));
    }
  },

  /**
   * 替換執行引擎
   */
  ReplacementEngine: {
    /**
     * 執行所有替換規則
     * @param {HTMLTextAreaElement} textArea 文本區域
     * @returns {Promise<Object>} 替換結果 {text, changed, totalChanges, details}
     */
    async executeReplacements(textArea) {
      if (AutoReplaceCore._state.isExecuting) {
        console.warn('[AutoReplaceCore] 替換正在執行中，跳過此次請求');
        return { text: textArea.value, changed: false, totalChanges: 0, details: [] };
      }

      AutoReplaceCore._state.isExecuting = true;
      
      try {
        let text = textArea.value;
        let changed = false;
        let totalChanges = 0;
        let replacementDetails = [];
        let cycles = 0;
        
        const rules = AutoReplaceCore.RuleManager.getActiveRules();
        
        if (rules.length === 0) {
          console.log('[AutoReplaceCore] 沒有啟用的替換規則');
          return { text, changed, totalChanges, details: replacementDetails };
        }

        // 執行替換循環，處理可能的鏈式替換
        while (cycles < AutoReplaceCore.CONFIG.MAX_REPLACEMENT_CYCLES) {
          let cycleChanged = false;
          cycles++;
          
          for (const rule of rules) {
            try {
              const fromText = rule.from;
              // 處理替換詞中的年份格式
              const processedToText = await AutoReplaceCore.YearProcessor.processYearFormats(rule.to);
              
              // 優先使用快取中的正則表達式
              let regex = AutoReplaceCore._state.regexCache.get(fromText);
              if (!regex) {
                regex = this.createRegex(fromText);
                AutoReplaceCore._state.regexCache.set(fromText, regex);
              }
              
              const matches = text.match(regex);
              
              if (matches) {
                // 記錄每個匹配項被替換的詳情
                matches.forEach(match => {
                  replacementDetails.push({
                    from: match,
                    to: processedToText,
                    rule: fromText
                  });
                });
                
                // 進行替換
                const newText = text.replace(regex, processedToText);
                if (newText !== text) {
                  text = newText;
                  changed = true;
                  cycleChanged = true;
                  totalChanges += matches.length;
                }
              }
            } catch (error) {
              console.error(`[AutoReplaceCore][${AutoReplaceCore._getTimeStamp()}] 替換錯誤:`, error);
            }
          }
          
          // 如果這一輪沒有變化，跳出循環
          if (!cycleChanged) {
            break;
          }
        }

        if (changed) {
          // 輸出詳細的替換資訊
          console.log(`[AutoReplaceCore][${AutoReplaceCore._getTimeStamp()}] 自動替換：完成 ${totalChanges} 處替換，執行 ${cycles} 輪`);
          if (AutoReplaceCore.CONFIG.DEBUG_MODE) {
            replacementDetails.forEach(detail => {
              console.log(`[AutoReplaceCore][${AutoReplaceCore._getTimeStamp()}] 將「${detail.from}」替換為「${detail.to}」 (規則: ${detail.rule})`);
            });
          }
        }
        
        AutoReplaceCore._state.lastExecutionTime = Date.now();
        return { text, changed, totalChanges, details: replacementDetails };
        
      } finally {
        AutoReplaceCore._state.isExecuting = false;
      }
    },

    /**
     * 創建正則表達式
     * @param {string} text 文本
     * @returns {RegExp} 正則表達式
     */
    createRegex(text) {
      return window.RegexHelper ? window.RegexHelper.createRegex(text) : new RegExp(text, 'g');
    }
  },

  /**
   * 游標狀態管理器
   */
  CursorManager: {
    /**
     * 保存游標狀態
     * @param {HTMLTextAreaElement} textArea 文本區域
     * @returns {Object} 游標狀態
     */
    saveCursorState(textArea) {
      return {
        start: textArea.selectionStart,
        end: textArea.selectionEnd,
        focused: document.activeElement === textArea
      };
    },

    /**
     * 恢復游標狀態
     * @param {HTMLTextAreaElement} textArea 文本區域
     * @param {Object} cursorState 游標狀態
     */
    restoreCursorState(textArea, cursorState) {
      if (cursorState.focused) {
        textArea.focus();
      }
      textArea.setSelectionRange(cursorState.start, cursorState.end);
    }
  },

  /**
   * 主要API：處理自動替換
   * @param {HTMLTextAreaElement} textArea 文本區域
   * @returns {Promise<Object>} 執行結果
   */
  async handleAutoReplace(textArea) {
    // 如果在 popup 頁面中，發送消息到 content script
    if (window.location.pathname.endsWith('popup.html')) {
      this.MessageManager.sendAutoReplaceTrigger();
      return { success: true, redirected: true };
    }

    // 獲取並保存游標位置
    const cursorState = this.CursorManager.saveCursorState(textArea);
    
    // 執行替換
    const result = await this.ReplacementEngine.executeReplacements(textArea);
    
    // 如果有變更，更新文本並恢復游標
    if (result.changed) {
      this.updateTextAreaValue(textArea, result.text, cursorState);
    }
    
    return {
      success: true,
      changed: result.changed,
      totalChanges: result.totalChanges,
      details: result.details
    };
  },

  /**
   * 更新文本區域的值並恢復游標位置
   * @param {HTMLTextAreaElement} textArea 文本區域
   * @param {string} newText 新文本
   * @param {Object} cursorState 游標狀態
   */
  updateTextAreaValue(textArea, newText, cursorState) {
    textArea.value = newText;
    textArea.dispatchEvent(new Event('input', { bubbles: true }));
    this.CursorManager.restoreCursorState(textArea, cursorState);
  },

  /**
   * 存儲管理器
   */
  StorageManager: {
    /**
     * 保存自動替換規則
     * @param {HTMLElement} container 容器元素
     */
    saveAutoReplaceRules(container) {
      console.group('[AutoReplaceCore] 保存自動替換規則');
      
      // 使用 ReplaceManager.StorageHelper 提取規則
      if (!window.ReplaceManager?.StorageHelper) {
        console.error('[AutoReplaceCore] ReplaceManager.StorageHelper 不可用');
        console.groupEnd();
        return;
      }
      
      const rules = window.ReplaceManager.StorageHelper.extractRulesFromDOM({
        container: container,
        groupSelector: '.auto-replace-group',
        hasCheckbox: true
      });
      
      console.log('[AutoReplaceCore] 所有規則:', rules);
      
      // 更新活動規則快取
      AutoReplaceCore.RuleManager.setActiveRules(rules);
      
      // 使用 StorageHelper 保存
      const storageKey = 'replace_' + AutoReplaceCore.CONFIG.AUTO_REPLACE_KEY;
      window.ReplaceManager.StorageHelper.saveRules(
        storageKey,
        rules,
        () => console.log('[AutoReplaceCore] 自動替換規則已保存')
      );
      
      console.groupEnd();
    },

    /**
     * 載入自動替換規則
     * @param {Function} callback 載入完成回調
     */
    loadAutoReplaceRules(callback) {
      if (!window.ReplaceManager?.StorageHelper) {
        console.error('[AutoReplaceCore] ReplaceManager.StorageHelper 不可用');
        if (callback) callback([]);
        return;
      }

      const storageKey = 'replace_' + AutoReplaceCore.CONFIG.AUTO_REPLACE_KEY;
      window.ReplaceManager.StorageHelper.loadRules(storageKey, [], (rules) => {
        // 過濾有效規則
        const validRules = AutoReplaceCore.RuleManager.filterValidRules(rules);
        
        // 更新活動規則快取
        AutoReplaceCore.RuleManager.setActiveRules(validRules);
        
        if (callback) {
          callback(validRules);
        }
      });
    }
  },

  /**
   * 工具方法
   */
  Utils: {
    /**
     * 清理快取
     */
    clearCache() {
      AutoReplaceCore._state.regexCache.clear();
      AutoReplaceCore._state.activeRules = [];
      console.log('[AutoReplaceCore] 快取已清理');
    },

    /**
     * 獲取執行統計
     * @returns {Object} 統計信息
     */
    getStats() {
      return {
        cachedRegexCount: AutoReplaceCore._state.regexCache.size,
        activeRulesCount: AutoReplaceCore._state.activeRules.length,
        lastExecutionTime: AutoReplaceCore._state.lastExecutionTime,
        isExecuting: AutoReplaceCore._state.isExecuting
      };
    },

    /**
     * 設置調試模式
     * @param {boolean} enabled 是否啟用
     */
    setDebugMode(enabled) {
      AutoReplaceCore.CONFIG.DEBUG_MODE = enabled;
      console.log(`[AutoReplaceCore] 調試模式: ${enabled ? '開啟' : '關閉'}`);
    }
  },

  /**
   * 初始化核心模組
   */
  initialize() {
    // 清理初始狀態
    this.Utils.clearCache();
    
    console.log(`[AutoReplaceCore][${this._getTimeStamp()}] 自動替換核心模組已初始化`);
  }
};

// 初始化模組
window.AutoReplaceCore.initialize(); 