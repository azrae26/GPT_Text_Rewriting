/**
 * 自動替換管理模組
 * 
 * 依賴模組：
 * 1. text_replace/replace-manager.js
 *    - ReplaceManager.initializeReplaceGroups：用於初始化替換組
 *    - ReplaceManager.setupGroupEvents：設置組事件處理
 * 
 * 2. regex_helper/regex-helper.js
 *    - RegexHelper.createRegex：用於創建替換用的正則表達式
 * 
 * 3. Chrome Storage API
 *    - chrome.storage.local：用於存儲和讀取自動替換規則
 * 
 * 4. Chrome Tabs API
 *    - chrome.tabs：用於與 content script 通信
 * 
 * 主要功能：
 * - 管理自動替換規則
 * - 處理自動替換的執行
 * - 提供拖曳排序功能
 * - 管理輸入框的展開/收縮
 * - 支援動態年份替換（YYYY, YY, YYYY±n, YY±n 格式）
 */
const AutoReplaceManager = {
  CONFIG: {
    AUTO_REPLACE_KEY: 'autoReplaceRules',
    FROM_INPUT_WIDTH: 367,    // 替換目標框寬度 (285 + 82)
    TO_INPUT_WIDTH: 115,      // 替換結果框寬度
    INPUT_HEIGHT: 32,         // 輸入框高度
    YEAR_FETCH_DELAY: 10     // 獲取年份時的延遲毫秒數
  },

  // 添加一個屬性來存儲當前的規則
  _activeRules: [],

  // 自動替換暫停狀態（true = 暫停中，不執行替換）
  _paused: false,

  // 工具函數 - 節流函數，減少函數執行頻率
  throttle: function(fn, delay) {
    let lastCall = 0;
    return function(...args) {
      const now = new Date().getTime();
      if (now - lastCall < delay) {
        return;
      }
      lastCall = now;
      return fn(...args);
    };
  },

  /** UI 創建相關方法 */
  UI: {
    /** 創建拖曳把手 */
    createDragHandle() {
      const handle = document.createElement('div');
      handle.className = 'replace-drag-handle';
      return handle;
    },

    /** 創建輸入框 */
    createInput(placeholder, isFromInput) {
      // 創建容器
      const container = document.createElement('div');
      container.className = 'replace-input-container';
      const width = isFromInput ? 
        AutoReplaceManager.CONFIG.FROM_INPUT_WIDTH : 
        AutoReplaceManager.CONFIG.TO_INPUT_WIDTH;
      container.style.width = `${width}px`;
      
      // 創建輸入框
      const input = document.createElement('textarea');
      input.placeholder = placeholder;
      input.className = 'replace-input';
      input.rows = 1;
      
      // 創建共用的測量用div
      const measureDiv = document.createElement('div');
      measureDiv.style.cssText = `
        position: fixed;
        visibility: hidden;
        white-space: pre-wrap;
        word-wrap: break-word;
        padding: 6px 8px;
      `;
      document.body.appendChild(measureDiv);
      
      // 添加輸入事件來自動調整高
      const adjustHeight = (element) => {
        const container = element.parentElement;
        
        if (document.activeElement !== element) {
          container.style.height = '32px';
          element.style.whiteSpace = 'nowrap';
          return;
        }

        // 更新測量元素的樣式
        measureDiv.style.width = `${element.offsetWidth - 16}px`;
        measureDiv.style.font = getComputedStyle(element).font;
        measureDiv.style.lineHeight = getComputedStyle(element).lineHeight;
        
        // 設置內容
        const content = element.value || element.placeholder;
        const hasNewline = content.includes('\n');
        
        measureDiv.textContent = content;
        
        // 計算新高度
        const newHeight = Math.max(32, measureDiv.offsetHeight + (hasNewline ? 20 : 0));
        container.style.height = `${newHeight}px`;
        element.style.whiteSpace = 'pre-wrap';
      };

      // 使用節流函數減少觸發頻率
      const throttledAdjust = AutoReplaceManager.throttle((element) => {
        adjustHeight(element);
      }, 100);

      // 監聽事件
      input.addEventListener('input', function() {
        if (document.activeElement === this) {
          throttledAdjust(this);
        }
      });

      // 監聽 Enter 鍵事件
      input.addEventListener('keydown', function(e) {
        if (e.key === 'Enter' && document.activeElement === this) {
          throttledAdjust(this);
        }
      });

      // 失去焦點時調整高度
      input.addEventListener('blur', function() {
        requestAnimationFrame(() => {
          this.parentElement.style.height = '32px';
          this.style.whiteSpace = 'nowrap';
        });
      });

      // 獲得焦點時調整高度
      input.addEventListener('focus', function() {
        requestAnimationFrame(() => {
          this.style.whiteSpace = 'pre-wrap';
          adjustHeight(this);
        });
      });

      // 將輸入框添加到容器中
      container.appendChild(input);
      
      // 在視窗關閉時清理測量元素
      window.addEventListener('beforeunload', () => {
        measureDiv.remove();
      }, { once: true });
      
      return container;
    },

    /** 創建控制按鈕 */
    createControlButtons(addCallback, removeCallback) {
      const container = document.createElement('div');
      container.className = 'replace-group-controls';

      const addButton = document.createElement('button');
      addButton.textContent = '+';
      addButton.className = 'replace-control-button';
      addButton.id = 'replace-add-button';
      addButton.onclick = addCallback;
      container.appendChild(addButton);

      const removeButton = document.createElement('button');
      removeButton.textContent = '-';
      removeButton.className = 'replace-control-button';
      removeButton.id = 'replace-remove-button';
      
      // 修改為雙擊事件
      let lastClickTime = 0;
      removeButton.addEventListener('click', (e) => {
        const currentTime = new Date().getTime();
        const timeDiff = currentTime - lastClickTime;
        
        if (timeDiff < 300) { // 300毫秒內的雙擊
          removeCallback();
        }
        
        lastClickTime = currentTime;
      });
      
      // 將按鈕添加到容器中
      container.appendChild(removeButton);

      return container;
    }
  },

  /** 組管理相關方法 */
  GroupManager: {
    /** 添加新組 */
    addGroup(referenceGroup, textArea) {
      const container = referenceGroup.parentElement;
      const group = AutoReplaceManager.createAutoReplaceGroup(textArea);
      
      // 在當前組的下一行插入新組，而不是添加到最後
      if (referenceGroup.nextSibling) {
        container.insertBefore(group, referenceGroup.nextSibling);
      } else {
        // 如果當前組是最後一個，則直接添加到最後
        container.appendChild(group);
      }
      
      AutoReplaceManager.saveAutoReplaceRules(container);
    },

    /** 移除組 */
    removeGroup(group) {
      const container = group.parentElement;
      const groups = container.querySelectorAll('.auto-replace-group');
      
      if (groups.length === 1) {
        // 如果是最後一個組，清空輸入框
        const fromInput = group.querySelector('.replace-input-container:first-of-type .replace-input');
        // 如果沒有替換目標框，則不進行清空
        if (fromInput) fromInput.value = '';
        const toInput = group.querySelector('.replace-input-container:last-of-type .replace-input');
        // 如果沒有替換結果框，則不進行清空
        if (toInput) toInput.value = '';
        const checkbox = group.querySelector('.auto-replace-checkbox');
        if (checkbox) checkbox.checked = false;
      } else {
        // 移除組
        group.remove();
      }
      
      // 保存規則
      AutoReplaceManager.saveAutoReplaceRules(container);
    }
  },

  /** 創建自動替換組 */
  createAutoReplaceGroup(textArea, initialData = null) {
    const group = document.createElement('div');
    group.className = 'auto-replace-group';
    
    // 創建控制元素容器
    const controlsContainer = document.createElement('div');
    controlsContainer.className = 'controls-container';
    
    // 添加拖曳把手
    const dragHandle = this.UI.createDragHandle();
    controlsContainer.appendChild(dragHandle);

    // 添加控制按鈕
    const controlButtons = this.UI.createControlButtons(
      () => this.GroupManager.addGroup(group, textArea),
      () => this.GroupManager.removeGroup(group)
    );
    controlsContainer.appendChild(controlButtons);

    // 創建勾選框
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.className = 'auto-replace-checkbox';
    if (initialData?.enabled) {
      checkbox.checked = true;
    }
    controlsContainer.appendChild(checkbox);

    // 將控制元素容器添加到組中
    group.appendChild(controlsContainer);

    // 創建輸入框容器
    const fromInputContainer = this.UI.createInput('自動替換', true);   // 替換目標框
    const toInputContainer = this.UI.createInput('替換為', false);      // 替換結果框

    // 獲取實際的輸入框元素並設置初始值
    const fromInput = fromInputContainer.querySelector('.replace-input');
    const toInput = toInputContainer.querySelector('.replace-input');
    if (initialData) {
      if (initialData.from) fromInput.value = initialData.from;
      if (initialData.to) toInput.value = initialData.to;
    }

    // 設置事件
    this.setupGroupEvents(group, textArea, fromInput, toInput, checkbox);

    // 添加輸入框容器
    group.appendChild(fromInputContainer);
    group.appendChild(toInputContainer);

    // 存儲拖曳把手引用，稍後設置拖曳事件
    group.dragHandle = dragHandle;

    return group;
  },

  /** 設置拖曳事件 */
  setupDragEvents(group, handle) {
    // 獲取容器
    const container = group.parentElement;
    if (!container) {
      LogUtils.error('無法找到自動替換組的父容器');
      return;
    }
    
    // 使用 ReplaceManager.DragManager 提供的統一拖移排序函數
    ReplaceManager.DragManager.setupSortDragEvents(handle, {
      groupSelector: '.auto-replace-group',  // 組選擇器
      container: container,                  // 明確指定容器
      placeholderId: 'drag-placeholder',     // 沿用原有佔位符ID
      onComplete: (container) => {
        // 保存新順序
        this.saveAutoReplaceRules(container);
      }
    });
  },

  /** 設置組事件 */
  setupGroupEvents(group, textArea, fromInput, toInput, checkbox) {
    window.ReplaceManager.setupGroupEvents(group, textArea, fromInput, toInput, checkbox, {
      isManual: false,
      onRulesSave: (container) => {
        this.saveAutoReplaceRules(container);
      }
    });
  },

  /** 發送消息到 content script */
  sendMessageToTab(message) {
    chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
      if (!tabs[0]) {
        LogUtils.log('沒有找到活動的標籤頁');
        return;
      }
      
      try {
        chrome.tabs.sendMessage(tabs[0].id, message, function(response) {
          if (chrome.runtime.lastError) {
            // 這是正常的情況，不需要顯示為錯誤
            LogUtils.log('Content script 正在載入中...');
            return;
          }
        });
      } catch (error) {
        LogUtils.log('發送消息時出錯:', error);
      }
    });
  },

  /** 初始化自動替換組 */
  initializeAutoReplaceGroups(container, textArea) {
    window.ReplaceManager.initializeReplaceGroups({
      otherContainer: container,  // 其他組容器
      textArea,                  // 文本區域
      storageKey: 'replace_autoReplaceRules', // 儲存 key
      createGroupFn: this.createAutoReplaceGroup.bind(this), // 創建組函數
      onInitialized: () => this.handleAutoReplace(textArea), // 初始化完成後的回調
      isManual: false            // 是否為手動替換
    });
  },

  /** 保存自動替換規則 */
  saveAutoReplaceRules(container) {
    LogUtils.log('保存自動替換規則');
    
    // 使用 ReplaceManager.StorageHelper 提取規則
    const rules = window.ReplaceManager.StorageHelper.extractRulesFromDOM({
      container: container,
      groupSelector: '.auto-replace-group',
      hasCheckbox: true
    });
    
    LogUtils.log('所有規則:', rules);
    
    // 更新活動規則緩存
    this._activeRules = rules;
    
    // 使用 StorageHelper 保存
    const storageKey = 'replace_' + this.CONFIG.AUTO_REPLACE_KEY;
    window.ReplaceManager.StorageHelper.saveRules(
      storageKey,
      rules,
      () => LogUtils.log('自動替換規則已保存')
    );
    
    LogUtils.log('保存自動替換規則完成');
  },

  /** 執行自動替換 */
  async handleAutoReplace(textArea) {
    // 暫停狀態下不執行替換
    if (this._paused) return;

    // 如果在 popup 頁面中，發送消息到 content script
    if (window.location.pathname.endsWith('popup.html')) {
      this._sendMessageToContentScript();
      return;
    }

    // 獲取並保存游標位置
    const cursorState = this._saveCursorState(textArea);
    
    // 執行替換
    const result = await this._executeReplacements(textArea);
    
    // 如果有變更，更新文本並恢復游標
    if (result.changed) {
      this._updateTextAreaValue(textArea, result.text, cursorState);
    }
  },

  /** 發送消息到 content script */
  _sendMessageToContentScript() {
    chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
      chrome.tabs.sendMessage(tabs[0].id, {
        action: "triggerAutoReplace"
      });
    });
  },

  /** 保存游標狀態 */
  _saveCursorState(textArea) {
    return {
      start: textArea.selectionStart,
      end: textArea.selectionEnd
    };
  },

  /** 從網頁獲取當前年份（帶緩存） */
  async getCurrentYear(useCache = true) {
    try {
      // 🆕 使用緩存避免重複獲取
      if (useCache && this._cachedYear && this._cacheTime && (Date.now() - this._cacheTime < 30000)) {
        return this._cachedYear;
      }
      
      // 延遲指定毫秒數
      await new Promise(resolve => setTimeout(resolve, this.CONFIG.YEAR_FETCH_DELAY));
      
      // 嘗試從指定的CSS選擇器獲取年份
      const dateInput = document.querySelector('.MuiInputBase-root.MuiOutlinedInput-root.MuiInputBase-colorPrimary.MuiInputBase-formControl.MuiInputBase-adornedEnd.css-1oy18r0 input');
      
      if (dateInput && dateInput.value) {
        const dateValue = dateInput.value;
        // 嘗試從日期值中提取年份
        const yearMatch = dateValue.match(/(\d{4})/);
        if (yearMatch) {
          const year = parseInt(yearMatch[1]);
          
          // 🆕 緩存年份值
          this._cachedYear = year;
          this._cacheTime = Date.now();
          return year;
        }
      }
      
      // 如果無法從網頁獲取，使用當前系統年份作為備份
      const currentYear = new Date().getFullYear();
      
      // 🆕 緩存系統年份
      this._cachedYear = currentYear;
      this._cacheTime = Date.now();
      return currentYear;
    } catch (error) {
      LogUtils.warn('❌ 獲取年份時出錯，使用系統年份:', error);
      const fallbackYear = new Date().getFullYear();
      
      // 🆕 緩存備份年份
      this._cachedYear = fallbackYear;
      this._cacheTime = Date.now();
      return fallbackYear;
    }
  },

  /** 處理替換詞中的年份格式 */
  async processYearFormats(text) {
    if (!text || typeof text !== 'string') {
      return text;
    }

    // 檢查是否包含年份格式
    const hasYearFormat = /YYYY([+-]\d+)?|YY([+-]\d+)?/g.test(text);
    if (!hasYearFormat) {
      return text; // 沒有年份格式，直接返回
    }

    const currentYear = await this.getCurrentYear(); // 使用緩存機制
    let processedText = text;

    // 處理四位年份格式 YYYY±數字
    processedText = processedText.replace(/YYYY([+-]\d+)?/g, (match, offset) => {
      if (offset) {
        const adjustment = parseInt(offset);
        const targetYear = currentYear + adjustment;
        return targetYear.toString();
      } else {
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
      return twoDigitYear;
    });

    return processedText;
  },

  /** 執行所有替換規則 */
  async _executeReplacements(textArea) {
    let text = textArea.value;
    let changed = false;
    let totalChanges = 0;
    let replacementDetails = [];
    let regexCache = new Map(); // 正則表達式緩存

    // 🆕 重置年份緩存，確保在新的替換過程中使用最新年份
    this._cachedYear = null;
    this._cacheTime = null;

    const rules = this._getActiveRules();
    
    for (const rule of rules) {
        try {
            const fromText = rule.from;
            // 處理替換詞中的年份格式
            const processedToText = await this.processYearFormats(rule.to);
            
            // 優先使用緩存中的正則表達式
            let regex = regexCache.get(fromText);
            if (!regex) {
                regex = this.createRegex(fromText);
                regexCache.set(fromText, regex); // 緩存新創建的正則表達式
            }
            
            const matches = text.match(regex);
            
            if (matches) {
                // 記錄每個匹配項被替換的詳情
                matches.forEach(match => {
                    replacementDetails.push({
                        from: match,
                        to: processedToText
                    });
                });
            }
            // 進行替換
            const newText = text.replace(regex, processedToText);
            if (newText !== text) {
                text = newText;
                changed = true;
                totalChanges += matches ? matches.length : 0;
            }
        } catch (error) {
            LogUtils.error('替換錯誤:', error);
        }
    }

    if (changed) {
        // 輸出詳細的替換資訊
        LogUtils.log(`自動替換：完成 ${totalChanges} 處替換`);
        replacementDetails.forEach(detail => {
            LogUtils.log(`將「${detail.from}」替換為「${detail.to}」`);
        });
    }
    return { text, changed };
  },

  /** 獲取所有啟用的替換規則 */
  _getActiveRules() {
    // 如果有新規則，使用新規則
    if (this._activeRules && this._activeRules.length > 0) {
      return this._activeRules.filter(rule => rule.enabled && rule.from);
    }

    // 否則從 DOM 中獲取規則
    const rules = Array.from(document.querySelectorAll('.auto-replace-group'))
      .map(group => {
        const containers = Array.from(group.children)
          .filter(el => el.classList.contains('replace-input-container'));
        const fromInput = containers[0]?.querySelector('.replace-input');
        const toInput = containers[1]?.querySelector('.replace-input');
        const enabled = group.querySelector('.auto-replace-checkbox').checked;
        
        return {
          from: fromInput?.value?.trim() || '',
          to: toInput?.value?.trim() || '',
          enabled
        };
      })
      .filter(rule => rule.enabled && rule.from);

    return rules;
  },

  /** 更新文本區域的值並恢復游標位置 */
  _updateTextAreaValue(textArea, newText, cursorState) {
    textArea.value = newText;
    textArea.dispatchEvent(new Event('input', { bubbles: true }));
    textArea.setSelectionRange(cursorState.start, cursorState.end);
  },

  /** 創建正則表達式 */
  createRegex(text) {
    return RegexHelper.createRegex(text);
  },

  /** 🆕 清理年份緩存 */
  clearYearCache() {
    this._cachedYear = null;
    this._cacheTime = null;
  }
};

window.AutoReplaceManager = AutoReplaceManager; 