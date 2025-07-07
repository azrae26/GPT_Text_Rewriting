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
    sortButton.className = ReplaceCore.CSS_CLASSES.SORT_BUTTON;
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
  }
};

// 暴露到全局
window.ReplaceUIFactory = ReplaceUIFactory; 