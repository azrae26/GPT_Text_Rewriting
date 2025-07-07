/**
 * 替換功能UI工廠模組
 * 
 * 職責：
 * - 統一創建所有UI元件
 * - 管理輸入框的展開/收縮邏輯
 * - 處理UI元件的樣式和行為
 * - 提供一致的UI創建介面
 * 
 * 依賴：
 * - replace-core.js (ReplaceCore)
 */

const ReplaceUIFactory = {
  /**
   * 創建輸入框元件
   * @param {Object} options - 配置選項
   * @param {string} options.placeholder - 佔位符文字
   * @param {number} options.width - 初始寬度
   * @param {boolean} options.isFromInput - 是否為"從"輸入框
   * @param {boolean} options.isMainGroup - 是否為主組
   * @param {boolean} options.autoResize - 是否自動調整高度
   * @returns {HTMLElement} 輸入框元素或容器
   */
  createInput(options = {}) {
    const {
      placeholder = '',
      width = ReplaceCore.CONFIG.MIN_WIDTH,
      isFromInput = false,
      isMainGroup = false,
      autoResize = false
    } = options;

    if (autoResize) {
      return this._createAutoResizeInput(placeholder, isFromInput);
    } else {
      return this._createStandardInput(placeholder, width, isMainGroup);
    }
  },

  /**
   * 創建標準輸入框（手動替換用）
   * @param {string} placeholder - 佔位符
   * @param {number} width - 寬度
   * @param {boolean} isMainGroup - 是否為主組
   * @returns {HTMLInputElement} 輸入框元素
   */
  _createStandardInput(placeholder, width, isMainGroup) {
    const input = document.createElement('input');
    input.type = 'text';
    input.placeholder = placeholder;
    input.className = ReplaceCore.CSS_CLASSES.INPUT;
    input.style.cssText = `width: ${width}px !important;`;
    
    // 設置輸入框展開/收縮邏輯
    this._setupInputExpansion(input, isMainGroup);
    
    return input;
  },

  /**
   * 創建自動調整高度的輸入框（自動替換用）
   * @param {string} placeholder - 佔位符
   * @param {boolean} isFromInput - 是否為"從"輸入框
   * @returns {HTMLElement} 輸入框容器
   */
  _createAutoResizeInput(placeholder, isFromInput) {
    // 創建容器
    const container = document.createElement('div');
    container.className = ReplaceCore.CSS_CLASSES.INPUT_CONTAINER;
    const width = isFromInput ? 
      ReplaceCore.CONFIG.FROM_INPUT_WIDTH : 
      ReplaceCore.CONFIG.TO_INPUT_WIDTH;
    container.style.width = `${width}px`;
    
    // 創建輸入框
    const input = document.createElement('textarea');
    input.placeholder = placeholder;
    input.className = ReplaceCore.CSS_CLASSES.INPUT;
    input.rows = 1;
    
    // 設置自動高度調整
    this._setupAutoHeightAdjustment(input, container);
    
    container.appendChild(input);
    return container;
  },

  /**
   * 設置輸入框展開/收縮邏輯
   * @param {HTMLInputElement} input - 輸入框元素
   * @param {boolean} isMainGroup - 是否為主組
   */
  _setupInputExpansion(input, isMainGroup) {
    // 檢查文字是否過長的函數
    const isTextTooLong = (element) => {
      const text = element.value;
      if (!text) return false;
      
      const span = document.createElement('span');
      span.style.cssText = `
        visibility: hidden;
        position: absolute;
        white-space: pre;
        font: ${window.getComputedStyle(element).font};
      `;
      span.textContent = text;
      document.body.appendChild(span);
      
      const textWidth = span.offsetWidth;
      span.remove();
      
      // 如果寬度接近最大值，返回 true
      const paddedWidth = textWidth + ReplaceCore.CONFIG.PADDING;
      return paddedWidth >= ReplaceCore.CONFIG.MAX_WIDTH * 0.8;
    };
    
    // 焦點事件處理
    input.addEventListener('focus', (e) => {
      // 如果主組輸入框，一律不擴展
      if (isMainGroup) {
        return;
      }
      
      // 攔截原始焦點事件，暫停輸入框擴展
      e.preventDefault();
      
      // 標記輸入框，防止其他處理器再次擴展
      input.dataset.skipExpand = 'true';
      
      // 立即檢查文本長度
      if (isTextTooLong(input)) {
        // 阻止擴展，僅將焦點設置回原輸入框
        input.focus();
        // 確保不擴展
        setTimeout(() => {
          if (input.dataset.skipExpand === 'true') {
            // 維持原始寬度
            input.style.cssText = `width: ${ReplaceCore.CONFIG.MIN_WIDTH}px !important;`;
          }
        }, 0);
        return;
      }
      
      // 正常擴展輸入框
      delete input.dataset.skipExpand;
      this._adjustInputWidth(input);
    }, true);
    
    // 失焦事件處理
    input.addEventListener('blur', () => {
      if (!isMainGroup) {
        input.style.cssText = `width: ${ReplaceCore.CONFIG.MIN_WIDTH}px !important;`;
        delete input.dataset.skipExpand;
      }
    });
  },

  /**
   * 設置自動高度調整
   * @param {HTMLTextAreaElement} input - 文本框元素
   * @param {HTMLElement} container - 容器元素
   */
  _setupAutoHeightAdjustment(input, container) {
    // 創建測量用div
    const measureDiv = document.createElement('div');
    measureDiv.style.cssText = `
      position: fixed;
      visibility: hidden;
      white-space: pre-wrap;
      word-wrap: break-word;
      padding: 6px 8px;
    `;
    document.body.appendChild(measureDiv);
    
    // 調整高度函數
    const adjustHeight = (element) => {
      const container = element.parentElement;
      
      if (document.activeElement !== element) {
        container.style.height = `${ReplaceCore.CONFIG.INPUT_HEIGHT}px`;
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
      const newHeight = Math.max(ReplaceCore.CONFIG.INPUT_HEIGHT, measureDiv.offsetHeight + (hasNewline ? 20 : 0));
      container.style.height = `${newHeight}px`;
      element.style.whiteSpace = 'pre-wrap';
    };

    // 使用節流函數減少觸發頻率
    const throttledAdjust = ReplaceCore.Utils.throttle((element) => {
      adjustHeight(element);
    }, ReplaceCore.CONFIG.THROTTLE_DELAY);

    // 事件監聽
    input.addEventListener('input', function() {
      if (document.activeElement === this) {
        throttledAdjust(this);
      }
    });

    input.addEventListener('keydown', function(e) {
      if (e.key === 'Enter' && document.activeElement === this) {
        throttledAdjust(this);
      }
    });

    input.addEventListener('blur', function() {
      requestAnimationFrame(() => {
        this.parentElement.style.height = `${ReplaceCore.CONFIG.INPUT_HEIGHT}px`;
        this.style.whiteSpace = 'nowrap';
      });
    });

    input.addEventListener('focus', function() {
      requestAnimationFrame(() => {
        this.style.whiteSpace = 'pre-wrap';
        adjustHeight(this);
      });
    });

    // 清理函數
    window.addEventListener('beforeunload', () => {
      measureDiv.remove();
    }, { once: true });
  },

  /**
   * 調整輸入框寬度
   * @param {HTMLInputElement} input - 輸入框元素
   */
  _adjustInputWidth(input) {
    const text = input.value;
    if (!text) {
      input.style.cssText = `width: ${ReplaceCore.CONFIG.MIN_WIDTH}px !important;`;
      return;
    }

    const span = document.createElement('span');
    span.style.cssText = `
      visibility: hidden;
      position: absolute;
      white-space: pre;
      font: ${window.getComputedStyle(input).font};
    `;
    span.textContent = text;
    document.body.appendChild(span);

    // 為主組輸入框設定較小的最大寬度
    const isMainGroup = input.closest(`.${ReplaceCore.CSS_CLASSES.MAIN_GROUP}`);
    const maxWidth = isMainGroup ? ReplaceCore.CONFIG.MAIN_GROUP_MAX_WIDTH : ReplaceCore.CONFIG.MAX_WIDTH;

    const width = Math.min(
      Math.max(ReplaceCore.CONFIG.MIN_WIDTH, span.offsetWidth + ReplaceCore.CONFIG.PADDING),
      maxWidth
    );
    input.style.cssText = `width: ${width}px !important;`;

    span.remove();
  },

  /**
   * 創建替換按鈕
   * @param {Object} options - 配置選項
   * @param {string} options.text - 按鈕文字
   * @param {boolean} options.disabled - 是否禁用
   * @returns {HTMLButtonElement} 按鈕元素
   */
  createReplaceButton(options = {}) {
    const { text = '替換', disabled = true } = options;
    
    const button = document.createElement('button');
    button.className = `${ReplaceCore.CSS_CLASSES.BUTTON} ${disabled ? ReplaceCore.CSS_CLASSES.DISABLED : ''}`;
    button.textContent = text;
    
    return button;
  },

  /**
   * 創建控制按鈕組
   * @param {Object} options - 配置選項
   * @param {Function} options.onAdd - 添加回調
   * @param {Function} options.onRemove - 移除回調
   * @param {number} options.groupIndex - 組索引
   * @param {boolean} options.includeSortButton - 是否包含排序按鈕
   * @returns {HTMLElement} 控制按鈕容器
   */
  createControlButtons(options = {}) {
    const { onAdd, onRemove, groupIndex = null, includeSortButton = false } = options;
    
    const container = document.createElement('div');
    container.className = ReplaceCore.CSS_CLASSES.GROUP_CONTROLS;

    // 排序拖移按鈕
    if (includeSortButton) {
      const sortButton = this.createSortButton();
      container.appendChild(sortButton);
      container.sortButton = sortButton; // 存儲引用
    }

    // 添加按鈕
    const addButton = document.createElement('button');
    addButton.textContent = '+';
    addButton.className = ReplaceCore.CSS_CLASSES.CONTROL_BUTTON;
    addButton.id = 'replace-add-button';
    if (onAdd) {
      addButton.onclick = () => onAdd(groupIndex);
    }
    container.appendChild(addButton);

    // 移除按鈕
    const removeButton = document.createElement('button');
    removeButton.textContent = '-';
    removeButton.className = ReplaceCore.CSS_CLASSES.CONTROL_BUTTON;
    removeButton.id = 'replace-remove-button';
    
    if (onRemove) {
      this._setupDoubleClickRemove(removeButton, onRemove);
    }
    
    container.appendChild(removeButton);

    return container;
  },

  /**
   * 創建排序按鈕
   * @returns {HTMLButtonElement} 排序按鈕
   */
  createSortButton() {
    const sortButton = document.createElement('button');
    sortButton.innerHTML = '<span>⋮⋮</span>';
    // 同時設置排序按鈕和拖移把手的CSS類名
    sortButton.className = `${ReplaceCore.CSS_CLASSES.SORT_BUTTON} ${ReplaceCore.CSS_CLASSES.DRAG_HANDLE}`;
    sortButton.draggable = true;
    sortButton.title = '拖移排序';
    
    return sortButton;
  },

  /**
   * 創建拖移把手
   * @returns {HTMLElement} 拖移把手元素
   */
  createDragHandle() {
    const handle = document.createElement('div');
    handle.className = ReplaceCore.CSS_CLASSES.DRAG_HANDLE;
    return handle;
  },

  /**
   * 創建複選框
   * @param {Object} options - 配置選項
   * @param {boolean} options.checked - 是否選中
   * @param {string} options.id - ID屬性
   * @returns {HTMLInputElement} 複選框元素
   */
  createCheckbox(options = {}) {
    const { checked = true, id = '' } = options;
    
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = checked;
    if (id) {
      checkbox.id = id;
    }
    
    return checkbox;
  },

  /**
   * 設置雙擊移除功能
   * @param {HTMLButtonElement} button - 移除按鈕
   * @param {Function} onRemove - 移除回調
   */
  _setupDoubleClickRemove(button, onRemove) {
    let lastClickTime = 0;
    
    button.addEventListener('click', (e) => {
      const currentTime = new Date().getTime();
      const timeDiff = currentTime - lastClickTime;
      
      if (timeDiff < ReplaceCore.CONFIG.DOUBLE_CLICK_DELAY) {
        onRemove();
      }
      
      lastClickTime = currentTime;
    });
  },

  /**
   * 創建容器元素
   * @param {Object} options - 配置選項
   * @param {string} options.className - CSS類名
   * @param {string} options.id - ID屬性
   * @param {Object} options.styles - 內聯樣式
   * @returns {HTMLElement} 容器元素
   */
  createContainer(options = {}) {
    const { className = '', id = '', styles = {} } = options;
    
    const container = document.createElement('div');
    
    if (className) {
      container.className = className;
    }
    
    if (id) {
      container.id = id;
    }
    
    // 應用樣式
    Object.entries(styles).forEach(([property, value]) => {
      container.style[property] = value;
    });
    
    return container;
  },

  /**
   * 輔助方法：獲取輸入框元素（處理容器包裝）
   * @param {HTMLElement} element - 元素
   * @returns {HTMLInputElement|HTMLTextAreaElement} 輸入框元素
   */
  getInputElement(element) {
    if (element.tagName === 'INPUT' || element.tagName === 'TEXTAREA') {
      return element;
    }
    
    // 查找容器內的輸入框
    const input = element.querySelector('input, textarea');
    return input;
  },

  /**
   * 輔助方法：設置元素焦點
   * @param {HTMLElement} element - 要設置焦點的元素
   */
  setFocus(element) {
    const input = this.getInputElement(element);
    if (input) {
      input.focus();
    }
  },

  /**
   * 輔助方法：獲取元素值
   * @param {HTMLElement} element - 元素
   * @returns {string} 元素值
   */
  getValue(element) {
    const input = this.getInputElement(element);
    return input ? input.value : '';
  },

  /**
   * 輔助方法：設置元素值
   * @param {HTMLElement} element - 元素
   * @param {string} value - 要設置的值
   */
  setValue(element, value) {
    const input = this.getInputElement(element);
    if (input) {
      input.value = value;
      
      // 觸發值同步事件
      input.dispatchEvent(new Event('value-sync'));
    }
  },

  /**
   * 創建手動替換組（向後兼容方法）
   * @param {HTMLTextAreaElement} textArea - 文本區域
   * @param {boolean} isMainGroup - 是否為主組
   * @param {Object} initialData - 初始資料
   * @param {number} groupIndex - 組索引
   * @returns {HTMLElement} 組元素
   */
  createManualReplaceGroup(textArea, isMainGroup = false, initialData = null, groupIndex = null) {
    const group = document.createElement('div');
    group.className = isMainGroup ? 'replace-main-group' : 'replace-extra-group';

    // 非主組需要控制按鈕
    if (!isMainGroup) {
      const controlButtons = this.createControlButtons({
        onAdd: (index) => {
          // 通知添加規則
          if (window.ManualReplaceCore?.RuleManager?.addRule) {
            window.ManualReplaceCore.RuleManager.addRule(index);
          }
        },
        onRemove: () => {
          // 通知移除規則
          const container = group.parentElement;
          if (container) {
            const groups = Array.from(container.querySelectorAll('.replace-extra-group'));
            const index = groups.indexOf(group);
            if (index !== -1 && window.ManualReplaceCore?.RuleManager?.removeRule) {
              window.ManualReplaceCore.RuleManager.removeRule(index);
            }
          }
        },
        groupIndex: groupIndex,
        includeSortButton: true
      });
      group.appendChild(controlButtons);
    }

    // 創建輸入框
    const fromInput = this.createInput({
      placeholder: '替換文字',
      width: ReplaceCore.CONFIG.MIN_WIDTH,
      isMainGroup: isMainGroup
    });
    
    const toInput = this.createInput({
      placeholder: '替換為',
      width: ReplaceCore.CONFIG.MIN_WIDTH,
      isMainGroup: isMainGroup
    });

    // 創建替換按鈕
    const replaceButton = this.createReplaceButton({
      text: '替換',
      disabled: true
    });

    // 設置初始值
    if (initialData) {
      this.setValue(fromInput, initialData.from || '');
      this.setValue(toInput, initialData.to || '');
      this._updateButtonState(fromInput, textArea, replaceButton);
    }

    // 設置事件處理
    this._setupManualGroupEvents(group, textArea, fromInput, toInput, replaceButton, isMainGroup);

    // 添加元素到組
    group.appendChild(fromInput);
    group.appendChild(toInput);
    group.appendChild(replaceButton);

    return group;
  },

  /**
   * 設置手動替換組事件
   * @param {HTMLElement} group - 組元素
   * @param {HTMLTextAreaElement} textArea - 文本區域
   * @param {HTMLElement} fromInput - 源輸入框
   * @param {HTMLElement} toInput - 目標輸入框
   * @param {HTMLElement} replaceButton - 替換按鈕
   * @param {boolean} isMainGroup - 是否為主組
   */
  _setupManualGroupEvents(group, textArea, fromInput, toInput, replaceButton, isMainGroup) {
    // 獲取實際的輸入元素
    const fromInputElement = this.getInputElement(fromInput);
    const toInputElement = this.getInputElement(toInput);

    // 創建統一的更新處理器
    const updateButton = () => {
      this._updateButtonState(fromInputElement, textArea, replaceButton);
    };

    const handleInput = () => {
      const rule = {
        from: this.getValue(fromInput),
        to: this.getValue(toInput)
      };

      // 更新規則
      if (window.ManualReplaceCore?.RuleManager) {
        const index = isMainGroup ? 0 : Array.from(group.parentElement.children).indexOf(group);
        window.ManualReplaceCore.RuleManager.updateRule(rule, index, isMainGroup);
      }

      updateButton();
      
      // 調整輸入框寬度
      this._adjustInputWidthForGroup(fromInput, toInput, isMainGroup);
    };

    // 為輸入框添加事件監聽器
    [fromInputElement, toInputElement].forEach(input => {
      input.addEventListener('input', handleInput);
      input.addEventListener('blur', handleInput);
      input.addEventListener('focus', () => {
        if (!input.dataset.skipExpand) {
          this._adjustInputWidth(input);
        }
      });
      input.addEventListener('value-sync', handleInput);
    });

    // 監聽文本區域的變化以更新按鈕狀態
    textArea.addEventListener('input', updateButton);

    // 替換按鈕點擊事件
    replaceButton.addEventListener('click', () => {
      const fromText = this.getValue(fromInput);
      const toText = this.getValue(toInput);
      this._executeManualReplace(textArea, fromText, toText);
    });

    // 主組需要設置文本選擇功能
    if (isMainGroup) {
      this._setupTextSelection(textArea, fromInputElement, toInputElement, updateButton);
    }
  },

  /**
   * 調整組內輸入框寬度
   * @param {HTMLElement} fromInput - 源輸入框
   * @param {HTMLElement} toInput - 目標輸入框
   * @param {boolean} isMainGroup - 是否為主組
   */
  _adjustInputWidthForGroup(fromInput, toInput, isMainGroup) {
    const fromElement = this.getInputElement(fromInput);
    const toElement = this.getInputElement(toInput);

    if (isMainGroup) {
      // 主組在有文字時調整寬度
      if (fromElement.value) {
        this._adjustInputWidth(fromElement);
      }
      if (toElement.value) {
        this._adjustInputWidth(toElement);
      }
    } else {
      // 其他組根據焦點狀態調整
      if (document.activeElement === fromElement) {
        this._adjustInputWidth(fromElement);
      }
      if (document.activeElement === toElement) {
        this._adjustInputWidth(toElement);
      }
    }
  },

  /**
   * 設置文本選擇功能（主組專用）
   * @param {HTMLTextAreaElement} textArea - 文本區域
   * @param {HTMLInputElement} fromInput - 源輸入框
   * @param {HTMLInputElement} toInput - 目標輸入框
   * @param {Function} updateButton - 更新按鈕回調
   */
  _setupTextSelection(textArea, fromInput, toInput, updateButton) {
    let lastSelectedText = '';
    
    const handleSelection = () => {
      try {
        const selectedText = textArea.value.substring(
          textArea.selectionStart,
          textArea.selectionEnd
        ).trim();

        if (selectedText === lastSelectedText) {
          return;
        }

        lastSelectedText = selectedText;

        if (selectedText) {
          fromInput.value = selectedText;
          toInput.value = '';
          
          // 更新規則
          if (window.ManualReplaceCore?.RuleManager) {
            window.ManualReplaceCore.RuleManager.updateRule({ from: selectedText, to: '' }, 0, true);
          }
          
          this._adjustInputWidth(fromInput);
          updateButton();
          
          // 觸發預覽更新
          if (window.ReplacePreview?.updateAllPreviews) {
            window.ReplacePreview.updateAllPreviews();
          }
        } else if (!selectedText && fromInput.value) {
          fromInput.value = '';
          toInput.value = '';
          lastSelectedText = '';
          
          // 更新規則
          if (window.ManualReplaceCore?.RuleManager) {
            window.ManualReplaceCore.RuleManager.updateRule({ from: '', to: '' }, 0, true);
          }
          
          fromInput.style.cssText = `width: ${ReplaceCore.CONFIG.MIN_WIDTH}px !important;`;
          toInput.style.cssText = `width: ${ReplaceCore.CONFIG.MIN_WIDTH}px !important;`;
          
          updateButton();
        }
      } catch (error) {
        console.error('[ReplaceUIFactory] 處理文本選取時出錯:', error);
      }
    };

    // 設置選擇事件監聽器
    document.addEventListener('selectionchange', () => {
      if (document.activeElement === textArea) {
        handleSelection();
      }
    });
    
    textArea.addEventListener('mouseup', () => {
      setTimeout(handleSelection, 10);
    });
    
    textArea.addEventListener('click', () => {
      setTimeout(handleSelection, 20);
    });
  },

  /**
   * 更新替換按鈕狀態
   * @param {HTMLInputElement} fromInput - 源輸入框
   * @param {HTMLTextAreaElement} textArea - 文本區域
   * @param {HTMLButtonElement} button - 按鈕元素
   */
  _updateButtonState(fromInput, textArea, button) {
    const searchText = fromInput.value.trim();
    if (!searchText) {
      button.textContent = '替換';
      button.classList.add(ReplaceCore.CSS_CLASSES.DISABLED);
      return;
    }

    try {
      if (window.RegexHelper?.createRegex) {
        const regex = window.RegexHelper.createRegex(searchText);
        const count = (textArea.value.match(regex) || []).length;
        button.textContent = count > 0 ? `替換 (${count})` : '替換';
        button.classList.toggle(ReplaceCore.CSS_CLASSES.DISABLED, count === 0);
      } else {
        button.textContent = '替換';
        button.classList.add(ReplaceCore.CSS_CLASSES.DISABLED);
      }
    } catch (error) {
      button.textContent = '替換';
      button.classList.add(ReplaceCore.CSS_CLASSES.DISABLED);
    }
  },

  /**
   * 執行手動替換
   * @param {HTMLTextAreaElement} textArea - 文本區域
   * @param {string} fromText - 源文字
   * @param {string} toText - 目標文字
   */
  _executeManualReplace(textArea, fromText, toText) {
    fromText = fromText.trim();
    if (!fromText || !textArea.value) return;

    try {
      const selectionStart = textArea.selectionStart;
      const selectionEnd = textArea.selectionEnd;
      
      if (window.RegexHelper?.createRegex) {
        const regex = window.RegexHelper.createRegex(fromText);
        const newText = textArea.value.replace(regex, toText);

        if (newText !== textArea.value) {
          textArea.value = newText;
          textArea.dispatchEvent(new Event('input', { bubbles: true }));
          textArea.setSelectionRange(selectionStart, selectionEnd);
          
          // 更新預覽
          if (window.ReplacePreview?.updateAllPreviews) {
            window.ReplacePreview.updateAllPreviews();
          }
        }
      }
         } catch (error) {
       console.error('[ReplaceUIFactory] 替換錯誤:', error);
     }
   },

   /**
    * 創建自動替換組（向後兼容方法）
    * @param {HTMLTextAreaElement} textArea - 文本區域
    * @param {boolean} isMain - 是否為主組
    * @param {Object} initialData - 初始資料
    * @param {number} index - 組索引
    * @returns {HTMLElement} 組元素
    */
   createAutoReplaceGroup(textArea, isMain = false, initialData = null, index = 0) {
     const group = document.createElement('div');
     group.className = 'auto-replace-group';

     // 創建控制按鈕（包含排序和移除功能）
     const controlButtons = this.createControlButtons({
       onAdd: () => {
         // 通知添加自動替換規則
         const container = group.parentElement;
         if (container && window.AutoReplaceCore?.StorageManager) {
           // 觸發添加新規則邏輯
           this._addNewAutoReplaceGroup(container, textArea);
         }
       },
       onRemove: () => {
         // 移除規則
         const container = group.parentElement;
         if (container) {
           group.remove();
           // 保存變更
           if (window.AutoReplaceCore?.StorageManager) {
             window.AutoReplaceCore.StorageManager.saveAutoReplaceRules(container);
           }
         }
       },
       groupIndex: index,
       includeSortButton: true
     });
     group.appendChild(controlButtons);

     // 創建啟用/禁用複選框
     const checkbox = this.createCheckbox({
       checked: initialData?.enabled !== false,
       id: `auto-replace-checkbox-${index}`
     });
     group.appendChild(checkbox);

     // 創建輸入框（自動調整高度）
     const fromInput = this.createInput({
       placeholder: '原始文字',
       autoResize: true,
       isFromInput: true
     });
     
     const toInput = this.createInput({
       placeholder: '替換為',
       autoResize: true,
       isFromInput: false
     });

     // 設置初始值
     if (initialData) {
       this.setValue(fromInput, initialData.from || '');
       this.setValue(toInput, initialData.to || '');
       checkbox.checked = initialData.enabled !== false;
     }

     // 設置事件處理
     this._setupAutoGroupEvents(group, textArea, fromInput, toInput, checkbox);

     // 添加元素到組
     group.appendChild(fromInput);
     group.appendChild(toInput);

     return group;
   },

   /**
    * 添加新的自動替換組
    * @param {HTMLElement} container - 容器元素
    * @param {HTMLTextAreaElement} textArea - 文本區域
    */
   _addNewAutoReplaceGroup(container, textArea) {
     const existingGroups = container.querySelectorAll('.auto-replace-group');
     const newIndex = existingGroups.length;
     
     const newGroup = this.createAutoReplaceGroup(textArea, false, null, newIndex);
     container.appendChild(newGroup);
     
     // 設置拖曳功能
     if (window.ReplaceDrag) {
       window.ReplaceDrag.setupGroupDragEvents(container, {
         groupSelector: '.auto-replace-group',
         lockHorizontal: true,
         placeholderId: 'auto-drag-placeholder'
       });
     }
     
     // 保存變更
     if (window.AutoReplaceCore?.StorageManager) {
       window.AutoReplaceCore.StorageManager.saveAutoReplaceRules(container);
     }
   },

   /**
    * 設置自動替換組事件
    * @param {HTMLElement} group - 組元素
    * @param {HTMLTextAreaElement} textArea - 文本區域
    * @param {HTMLElement} fromInput - 源輸入框
    * @param {HTMLElement} toInput - 目標輸入框
    * @param {HTMLInputElement} checkbox - 啟用複選框
    */
   _setupAutoGroupEvents(group, textArea, fromInput, toInput, checkbox) {
     // 獲取實際的輸入元素
     const fromInputElement = this.getInputElement(fromInput);
     const toInputElement = this.getInputElement(toInput);

     // 創建統一的保存處理器
     const saveRules = () => {
       const container = group.parentElement;
       if (container && window.AutoReplaceCore?.StorageManager) {
         window.AutoReplaceCore.StorageManager.saveAutoReplaceRules(container);
       }
     };

     // 處理輸入變化
     const handleInput = () => {
       // 自動觸發保存（防抖）
       if (this._autoSaveTimeout) {
         clearTimeout(this._autoSaveTimeout);
       }
       this._autoSaveTimeout = setTimeout(saveRules, 500);
     };

     // 為所有輸入元素添加事件監聽器
     [fromInputElement, toInputElement].forEach(input => {
       input.addEventListener('input', handleInput);
       input.addEventListener('blur', handleInput);
       input.addEventListener('value-sync', handleInput);
     });

     // 複選框變化事件
     checkbox.addEventListener('change', () => {
       // 立即保存啟用狀態變化
       saveRules();
       
       // 更新組的視覺狀態
       group.classList.toggle('disabled', !checkbox.checked);
     });

     // 設置初始視覺狀態
     group.classList.toggle('disabled', !checkbox.checked);

     // 監聽文本區域變化以觸發自動替換
     const handleTextAreaChange = () => {
       if (window.AutoReplaceCore?.handleAutoReplace) {
         // 防抖的自動替換觸發
         if (this._autoReplaceTimeout) {
           clearTimeout(this._autoReplaceTimeout);
         }
         this._autoReplaceTimeout = setTimeout(() => {
           window.AutoReplaceCore.handleAutoReplace(textArea);
         }, 300);
       }
     };

     textArea.addEventListener('input', handleTextAreaChange);
   }
 };
 
 // 暴露到全局
 window.ReplaceUIFactory = ReplaceUIFactory; 