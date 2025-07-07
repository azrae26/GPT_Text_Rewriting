/**
 * 替換功能事件處理系統
 * 
 * 職責：
 * - 統一管理所有事件處理邏輯
 * - 提供防抖和節流機制
 * - 管理事件生命週期
 * - 處理組事件設置
 * 
 * 依賴：
 * - replace-core.js (ReplaceCore)
 * - replace-ui-factory.js (ReplaceUIFactory)
 */

const ReplaceEventSystem = {
  /**
   * 活躍的事件處理器映射
   */
  _activeHandlers: new Map(),

  /**
   * 防抖計時器映射
   */
  _debounceTimers: new Map(),

  /**
   * 設置組事件處理
   * @param {Object} options - 配置選項
   * @param {HTMLElement} options.group - 組元素
   * @param {HTMLElement} options.textArea - 文本區域
   * @param {HTMLElement} options.fromInput - "從"輸入框
   * @param {HTMLElement} options.toInput - "到"輸入框
   * @param {HTMLElement} options.actionElement - 動作元素（按鈕或複選框）
   * @param {boolean} options.isMainGroup - 是否為主組
   * @param {Function} options.onRuleUpdate - 規則更新回調
   * @param {Function} options.onButtonUpdate - 按鈕更新回調
   */
  setupGroupEvents(options) {
    const {
      group,
      textArea,
      fromInput,
      toInput,
      actionElement,
      isMainGroup = false,
      onRuleUpdate,
      onButtonUpdate
    } = options;

    // 獲取實際的輸入框元素
    const fromInputElement = ReplaceUIFactory.getInputElement(fromInput);
    const toInputElement = ReplaceUIFactory.getInputElement(toInput);

    if (!fromInputElement || !toInputElement) {
      ReplaceCore.Logger.error('無法找到輸入框元素', null, 'ReplaceEventSystem');
      return;
    }

    // 創建統一的處理函數
    const updateHandlers = this._createUpdateHandlers({
      group,
      fromInputElement,
      toInputElement,
      isMainGroup,
      onRuleUpdate,
      onButtonUpdate
    });

    // 設置輸入事件
    this._setupInputEvents(fromInputElement, toInputElement, updateHandlers, isMainGroup);

    // 設置動作元素事件（按鈕或複選框）
    this._setupActionElementEvents(actionElement, textArea, fromInputElement, toInputElement);

    // 如果是主組，設置文本選擇功能
    if (isMainGroup) {
      this._setupTextSelection(textArea, fromInputElement, toInputElement, updateHandlers.updateButton);
    }

    // 存儲事件處理器以便後續清理
    const groupId = this._getGroupId(group);
    this._activeHandlers.set(groupId, {
      group,
      handlers: updateHandlers
    });
  },

  /**
   * 創建更新處理函數
   * @param {Object} options - 配置選項
   * @returns {Object} 處理函數對象
   */
  _createUpdateHandlers(options) {
    const {
      group,
      fromInputElement,
      toInputElement,
      isMainGroup,
      onRuleUpdate,
      onButtonUpdate
    } = options;

    // 創建防抖的規則更新函數
    const debouncedRuleUpdate = this.createDebouncedFunction((rule, index) => {
      if (onRuleUpdate) {
        onRuleUpdate(rule, index, isMainGroup);
      }
    }, ReplaceCore.CONFIG.DEBOUNCE_DELAY);

    // 按鈕更新處理
    const updateButton = () => {
      if (onButtonUpdate) {
        onButtonUpdate();
      }
    };

    // 輸入處理
    const handleInput = () => {
      const rule = {
        from: fromInputElement.value,
        to: toInputElement.value
      };

      const index = isMainGroup ? 0 : 
        this._getGroupIndex(group);
      
      debouncedRuleUpdate(rule, index);
      updateButton();
      
      // 處理主組的輸入框擴展
      if (isMainGroup) {
        this._handleMainGroupExpansion(fromInputElement, toInputElement);
      }
    };

    return {
      handleInput,
      updateButton,
      debouncedRuleUpdate
    };
  },

  /**
   * 設置輸入事件
   * @param {HTMLElement} fromInput - "從"輸入框
   * @param {HTMLElement} toInput - "到"輸入框
   * @param {Object} handlers - 處理函數對象
   * @param {boolean} isMainGroup - 是否為主組
   */
  _setupInputEvents(fromInput, toInput, handlers, isMainGroup) {
    [fromInput, toInput].forEach(input => {
      // 輸入事件
      input.addEventListener('input', () => {
        handlers.handleInput();
        handlers.updateButton();
      });

      // 失焦事件
      input.addEventListener('blur', () => {
        handlers.handleInput();
        handlers.updateButton();
        
        // 主組在有文字時不收合
        if (!isMainGroup || !input.value) {
          input.style.cssText = `width: ${ReplaceCore.CONFIG.MIN_WIDTH}px !important;`;
        }
      });
      
      // 焦點事件
      input.addEventListener('focus', () => {
        // 檢查是否應該跳過擴展
        if (!input.dataset.skipExpand) {
          ReplaceUIFactory._adjustInputWidth(input);
        }
      });
      
      // 監聽自定義的值同步事件
      input.addEventListener('value-sync', () => {
        handlers.handleInput();
        handlers.updateButton();
      });
    });
  },

  /**
   * 設置動作元素事件（按鈕或複選框）
   * @param {HTMLElement} actionElement - 動作元素
   * @param {HTMLElement} textArea - 文本區域
   * @param {HTMLElement} fromInput - "從"輸入框
   * @param {HTMLElement} toInput - "到"輸入框
   */
  _setupActionElementEvents(actionElement, textArea, fromInput, toInput) {
    if (!actionElement) return;

    if (actionElement.tagName === 'BUTTON') {
      // 替換按鈕點擊事件
      actionElement.addEventListener('click', () => {
        this._executeReplace(textArea, fromInput.value, toInput.value);
      });
    } else if (actionElement.type === 'checkbox') {
      // 複選框狀態不需要特殊處理，狀態由外部管理
    }

    // 監聽文本區域變化以更新按鈕狀態
    textArea.addEventListener('input', () => {
      this._updateButtonState(fromInput.value, textArea.value, actionElement);
    });
  },

  /**
   * 設置文本選擇功能（主組專用）
   * @param {HTMLElement} textArea - 文本區域
   * @param {HTMLElement} fromInput - "從"輸入框
   * @param {HTMLElement} toInput - "到"輸入框
   * @param {Function} updateButton - 按鈕更新函數
   */
  _setupTextSelection(textArea, fromInput, toInput, updateButton) {
    let lastSelectedText = '';
    
    const handleSelection = () => {
      try {
        const selectedText = textArea.value.substring(
          textArea.selectionStart,
          textArea.selectionEnd
        ).trim();

        // 防止重複處理相同的選中文字
        if (selectedText === lastSelectedText) {
          return;
        }
        
        ReplaceCore.Logger.info(`文本選取事件: 選取長度=${selectedText.length}, 內容="${selectedText}"`, 'TextSelection');
        lastSelectedText = selectedText;

        if (selectedText) {
          ReplaceCore.Logger.info(`設定主組文字: "${selectedText}"`, 'TextSelection');
          fromInput.value = selectedText;
          toInput.value = '';
          
          // 觸發規則更新（通過value-sync事件）
          fromInput.dispatchEvent(new Event('value-sync'));
          
          // 有選取文字時展開輸入框
          ReplaceUIFactory._adjustInputWidth(fromInput);
          
          // 更新按鈕狀態
          updateButton();
          
        } else if (!selectedText && fromInput.value) {
          ReplaceCore.Logger.info('清空主組內容', 'TextSelection');
          fromInput.value = '';
          toInput.value = '';
          lastSelectedText = '';
          
          // 觸發規則更新
          fromInput.dispatchEvent(new Event('value-sync'));
          
          // 清空時收合輸入框
          fromInput.style.cssText = `width: ${ReplaceCore.CONFIG.MIN_WIDTH}px !important;`;
          toInput.style.cssText = `width: ${ReplaceCore.CONFIG.MIN_WIDTH}px !important;`;
          
          // 更新按鈕狀態
          updateButton();
        }
      } catch (error) {
        ReplaceCore.Logger.error('處理文本選取時出錯', error, 'TextSelection');
      }
    };

    // 簡化事件綁定，主要使用 selectionchange 事件
    document.addEventListener('selectionchange', () => {
      if (document.activeElement === textArea) {
        handleSelection();
      }
    });
    
    // 補充事件處理
    textArea.addEventListener('mouseup', () => {
      setTimeout(handleSelection, 10);
    });
    
    textArea.addEventListener('click', () => {
      setTimeout(handleSelection, 20);
    });
  },

  /**
   * 處理主組輸入框擴展
   * @param {HTMLElement} fromInput - "從"輸入框
   * @param {HTMLElement} toInput - "到"輸入框
   */
  _handleMainGroupExpansion(fromInput, toInput) {
    // 根據是否有文字來調整寬度
    if (fromInput.value) {
      ReplaceUIFactory._adjustInputWidth(fromInput);
    }
    if (toInput.value) {
      ReplaceUIFactory._adjustInputWidth(toInput);
    }
  },

  /**
   * 執行替換
   * @param {HTMLElement} textArea - 文本區域
   * @param {string} fromText - 替換目標
   * @param {string} toText - 替換結果
   */
  _executeReplace(textArea, fromText, toText) {
    fromText = fromText.trim();
    if (!fromText || !textArea.value) return;

    try {
      const selectionStart = textArea.selectionStart;
      const selectionEnd = textArea.selectionEnd;
      const regex = RegexHelper.createRegex(fromText);
      const newText = textArea.value.replace(regex, toText);

      if (newText !== textArea.value) {
        textArea.value = newText;
        textArea.dispatchEvent(new Event('input', { bubbles: true }));
        textArea.setSelectionRange(selectionStart, selectionEnd);
        
        // 觸發預覽更新事件
        window.dispatchEvent(new CustomEvent(ReplaceCore.EVENTS.PREVIEW_UPDATED));
      }
    } catch (error) {
      ReplaceCore.Logger.error('替換錯誤', error, 'ReplaceEventSystem');
    }
  },

  /**
   * 更新按鈕狀態
   * @param {string} searchText - 搜索文字
   * @param {string} text - 文本內容
   * @param {HTMLElement} button - 按鈕元素
   */
  _updateButtonState(searchText, text, button) {
    if (button.tagName !== 'BUTTON') return;

    searchText = searchText.trim();
    if (!searchText) {
      button.textContent = '替換';
      button.classList.add(ReplaceCore.CSS_CLASSES.DISABLED);
      return;
    }

    try {
      const regex = RegexHelper.createRegex(searchText);
      const count = (text.match(regex) || []).length;
      button.textContent = count > 0 ? `替換 (${count})` : '替換';
      button.classList.toggle(ReplaceCore.CSS_CLASSES.DISABLED, count === 0);
    } catch (error) {
      button.textContent = '替換';
      button.classList.add(ReplaceCore.CSS_CLASSES.DISABLED);
    }
  },

  /**
   * 創建防抖函數
   * @param {Function} fn - 要防抖的函數
   * @param {number} delay - 延遲時間
   * @param {string} key - 防抖鍵（可選）
   * @returns {Function} 防抖後的函數
   */
  createDebouncedFunction(fn, delay, key = null) {
    const timerId = key || fn.toString();
    
    return (...args) => {
      // 清除之前的計時器
      if (this._debounceTimers.has(timerId)) {
        clearTimeout(this._debounceTimers.get(timerId));
      }
      
      // 設置新的計時器
      const timeoutId = setTimeout(() => {
        fn.apply(this, args);
        this._debounceTimers.delete(timerId);
      }, delay);
      
      this._debounceTimers.set(timerId, timeoutId);
    };
  },

  /**
   * 清理組事件
   * @param {HTMLElement} group - 組元素
   */
  cleanupGroupEvents(group) {
    const groupId = this._getGroupId(group);
    
    if (this._activeHandlers.has(groupId)) {
      const handlerData = this._activeHandlers.get(groupId);
      
      // 清理防抖計時器
      Object.values(handlerData.handlers).forEach(handler => {
        if (typeof handler === 'function' && handler._timerId) {
          clearTimeout(handler._timerId);
        }
      });
      
      this._activeHandlers.delete(groupId);
      ReplaceCore.Logger.info(`清理組事件: ${groupId}`, 'ReplaceEventSystem');
    }
  },

  /**
   * 清理所有事件
   */
  cleanupAllEvents() {
    // 清理所有防抖計時器
    this._debounceTimers.forEach(timerId => {
      clearTimeout(timerId);
    });
    this._debounceTimers.clear();
    
    // 清理所有活躍處理器
    this._activeHandlers.clear();
    
    ReplaceCore.Logger.info('清理所有事件處理器', 'ReplaceEventSystem');
  },

  /**
   * 獲取組ID
   * @param {HTMLElement} group - 組元素
   * @returns {string} 組ID
   */
  _getGroupId(group) {
    return group.id || `group_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  },

  /**
   * 獲取組索引
   * @param {HTMLElement} group - 組元素
   * @returns {number} 組索引
   */
  _getGroupIndex(group) {
    const container = group.parentElement;
    if (!container) return 0;
    
    const groups = Array.from(container.children);
    return groups.indexOf(group);
  },

  /**
   * 批量設置事件
   * @param {Array} groupConfigs - 組配置數組
   */
  batchSetupEvents(groupConfigs) {
    groupConfigs.forEach(config => {
      this.setupGroupEvents(config);
    });
  },

  /**
   * 檢查事件處理器是否活躍
   * @param {HTMLElement} group - 組元素
   * @returns {boolean} 是否活躍
   */
  isHandlerActive(group) {
    const groupId = this._getGroupId(group);
    return this._activeHandlers.has(groupId);
  }
};

// 暴露到全局
window.ReplaceEventSystem = ReplaceEventSystem; 