/* global GlobalSettings, TextProcessor, Notification, UndoManager */
/** 文字替換管理模組 */
const ReplaceManager = {
  // 添加常量配置
  CONFIG: {
    MIN_WIDTH: 75,  // 最小寬度
    MAX_WIDTH: 300, // 最大寬度
    PADDING: 24,    // padding總寬度
    STORAGE_KEY: 'replacePosition', // 添加儲存位置的 key
    AUTO_REPLACE_KEY: 'autoReplaceRules', // 添加自動替換規則的存儲鍵
    MANUAL_REPLACE_KEY: 'manualReplaceValues' // 添加手動替換組的存儲鍵
  },

  /** 自動替換規則 */
  autoReplaceRules: [],

  /** 創建手動替換組 */
  _createManualReplaceGroup(textArea, options = {}) {
    const { enableSelection = false, storageKey = null } = options;
    
    const group = document.createElement('div');
    group.className = 'replace-main-group';

    const fromInput = document.createElement('input');
    fromInput.type = 'text';
    fromInput.placeholder = '替換文字';
    fromInput.className = 'replace-input';
    fromInput.style.cssText = `width: ${this.CONFIG.MIN_WIDTH}px !important;`;

    const toInput = document.createElement('input');
    toInput.type = 'text';
    toInput.placeholder = '替換為';
    toInput.className = 'replace-input';
    toInput.style.cssText = `width: ${this.CONFIG.MIN_WIDTH}px !important;`;

    const replaceButton = document.createElement('button');
    replaceButton.className = 'replace-button disabled';
    this._updateReplaceButton(replaceButton, 0);

    // 添加輸入事件來調整寬度
    const adjustWidth = (input) => {
      const text = input.value;
      if (!text) {
        input.style.cssText = `width: ${this.CONFIG.MIN_WIDTH}px !important;`;
        return;
      }
      
      const span = document.createElement('span');
      span.style.visibility = 'hidden';
      span.style.position = 'absolute';
      span.style.whiteSpace = 'pre';
      span.style.font = window.getComputedStyle(input).font;
      span.textContent = text;
      document.body.appendChild(span);
      
      const textWidth = span.offsetWidth;
      const width = Math.min(
        Math.max(this.CONFIG.MIN_WIDTH, textWidth + this.CONFIG.PADDING),
        this.CONFIG.MAX_WIDTH
      );
      input.style.cssText = `width: ${width}px !important;`;
      
      span.remove();
    };

    // 更新按鈕狀態
    const updateButton = () => {
      const text = textArea.value;
      const searchText = fromInput.value.trim();
      
      if (!searchText) {
        this._updateReplaceButton(replaceButton, 0);
        return;
      }

      let count = 0;
      try {
        if (searchText.startsWith('/') && searchText.match(/\/[gimy]*$/)) {
          const lastSlash = searchText.lastIndexOf('/');
          const pattern = searchText.slice(1, lastSlash);
          const flags = searchText.slice(lastSlash + 1);
          const regex = new RegExp(pattern, flags);
          count = (text.match(regex) || []).length;
        } else {
          count = (text.match(new RegExp(this._escapeRegExp(searchText), 'g')) || []).length;
        }
      } catch (error) {
        console.error('計算匹配數量時出錯:', error);
        count = 0;
      }

      this._updateReplaceButton(replaceButton, count);
    };

    // 綁定事件
    [fromInput, toInput].forEach(input => {
      input.addEventListener('input', () => {
        adjustWidth(input);
        updateButton();
        if (storageKey) {
          this._saveManualReplaceValues(fromInput.value, toInput.value, storageKey);
        }
      });
    });

    // 如果啟用選擇功能，添加選擇文字處理
    if (enableSelection) {
      const handleSelection = () => {
        const selectedText = textArea.value.substring(
          textArea.selectionStart,
          textArea.selectionEnd
        ).trim();
        
        if (selectedText) {
          console.log('選中文字:', selectedText);
          fromInput.value = selectedText;
          fromInput.dispatchEvent(new Event('input'));
        } else {
          fromInput.value = '';
          toInput.value = '';
          fromInput.dispatchEvent(new Event('input'));
        }
      };

      textArea.addEventListener('mouseup', handleSelection);
      textArea.addEventListener('keyup', (e) => {
        if (e.shiftKey || e.key === 'Shift') {
          handleSelection();
        }
      });
    }

    replaceButton.addEventListener('click', () => {
      this._handleReplace(textArea, fromInput.value, toInput.value);
    });

    // 如果有存儲鍵，載入保存的值
    if (storageKey) {
      chrome.storage.sync.get([storageKey], (result) => {
        if (result[storageKey]) {
          const { from, to } = result[storageKey];
          fromInput.value = from || '';
          toInput.value = to || '';
          if (from) {
            adjustWidth(fromInput);
            updateButton();
          }
          if (to) {
            adjustWidth(toInput);
          }
        }
      });
    }

    group.appendChild(fromInput);
    group.appendChild(toInput);
    group.appendChild(replaceButton);

    return group;
  },

  /** 初始化替換介面 */
  initializeReplaceUI() {
    console.log('開始初始化替換介面');
    if (!window.shouldEnableFeatures() || document.getElementById('text-replace-container')) {
      console.log('不符合初始化替換介面條件');
      return;
    }

    const textArea = document.querySelector('textarea[name="content"]');
    if (!textArea) {
      console.log('找不到文本區域');
      return;
    }

    // 創建容器
    const container = document.createElement('div');
    container.id = 'text-replace-container';
    container.className = 'replace-controls';

    // 載入儲存的位置
    chrome.storage.sync.get([this.CONFIG.STORAGE_KEY], (result) => {
      if (result[this.CONFIG.STORAGE_KEY]) {
        const { left, top } = result[this.CONFIG.STORAGE_KEY];
        container.style.left = `${left}px`;
        container.style.top = `${top}px`;
      }
    });

    // 添加拖動圖示
    const dragHandle = document.createElement('div');
    dragHandle.className = 'replace-drag-handle';

    // 實現拖動功能
    let isDragging = false;
    let startX, startY, startLeft, startTop;

    dragHandle.addEventListener('mousedown', (e) => {
      isDragging = true;
      startX = e.clientX;
      startY = e.clientY;
      
      // 獲取當前的 CSS left 和 top 值
      const computedStyle = window.getComputedStyle(container);
      startLeft = parseInt(computedStyle.left) || 0;
      startTop = parseInt(computedStyle.top) || 0;
      
      // 添加臨時的全局事件監聽器
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      
      // 防止文字選擇
      e.preventDefault();
    });

    const handleMouseMove = (e) => {
      if (!isDragging) return;
      
      const deltaX = e.clientX - startX;
      const deltaY = e.clientY - startY;
      
      // 直接使用相對位移
      container.style.left = `${startLeft + deltaX}px`;
      container.style.top = `${startTop + deltaY}px`;
    };

    const handleMouseUp = () => {
      isDragging = false;
      // 儲存新位置
      const position = {
        left: parseInt(container.style.left),
        top: parseInt(container.style.top)
      };
      chrome.storage.sync.set({
        [this.CONFIG.STORAGE_KEY]: position
      });
      
      // 移除臨時事件監聽器
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    // 創建兩個手動替換組
    const mainGroup = this._createManualReplaceGroup(textArea, { 
      enableSelection: true 
    });
    const secondGroup = this._createManualReplaceGroup(textArea, { 
      storageKey: this.CONFIG.MANUAL_REPLACE_KEY 
    });

    // 將拖動圖示和替換組添加到主容器
    container.appendChild(dragHandle);
    container.appendChild(mainGroup);
    container.appendChild(secondGroup);

    // 添加自動替換組
    this._initializeAutoReplaceGroups(container, textArea);

    // 插入到文本區域上方
    const parent = textArea.parentElement;
    parent.insertBefore(container, textArea);
    console.log('替換介面初始化完成');
  },

  /** 更新替換按鈕狀態 */
  _updateReplaceButton(button, count) {
    if (count > 0) {
      button.textContent = `替換 (${count})`;
      button.classList.remove('disabled');
    } else {
      button.textContent = '替換';
      button.classList.add('disabled');
    }
  },

  /** 處理替換操作 */
  _handleReplace(textArea, fromText, toText) {
    fromText = fromText.trim();
    if (!fromText || !textArea.value) {
      console.log('替換條件不符合');
      return;
    }

    console.log(`執行替換操作: "${fromText}" -> "${toText}"`);
    const originalText = textArea.value;
    
    try {
      let regex;
      if (fromText.startsWith('/') && fromText.match(/\/[gimy]*$/)) {
        const lastSlash = fromText.lastIndexOf('/');
        const pattern = fromText.slice(1, lastSlash);
        const flags = fromText.slice(lastSlash + 1);
        regex = new RegExp(pattern, flags);
      } else {
        regex = new RegExp(this._escapeRegExp(fromText), 'g');
      }

      const newText = textArea.value.replace(regex, toText);
      
      if (originalText !== newText) {
        textArea.value = newText;
        textArea.dispatchEvent(new Event('input', { bubbles: true }));
        
        // 觸發所有替換組的按鈕更新
        document.querySelectorAll('.replace-main-group').forEach(group => {
          const fromInput = group.querySelector('input:first-child');
          const button = group.querySelector('.replace-button');
          if (fromInput && button) {
            const searchText = fromInput.value.trim();
            if (searchText) {
              let count = 0;
              try {
                if (searchText.startsWith('/') && searchText.match(/\/[gimy]*$/)) {
                  const lastSlash = searchText.lastIndexOf('/');
                  const pattern = searchText.slice(1, lastSlash);
                  const flags = searchText.slice(lastSlash + 1);
                  const regex = new RegExp(pattern, flags);
                  count = (newText.match(regex) || []).length;
                } else {
                  count = (newText.match(new RegExp(this._escapeRegExp(searchText), 'g')) || []).length;
                }
              } catch (error) {
                console.error('計算匹配數量時出錯:', error);
                count = 0;
              }
              this._updateReplaceButton(button, count);
            }
          }
        });
        
        console.log('替換完成');
      } else {
        console.log('沒有內容被替換');
      }
    } catch (error) {
      console.error('替換錯誤:', error);
      alert('替換錯誤: ' + error.message);
    }
  },

  /** 轉義正則表達式特殊字符 */
  _escapeRegExp(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  },

  /** 移除替換介面 */
  removeReplaceUI() {
    console.log('移除替換介面');
    const container = document.getElementById('text-replace-container');
    if (container) {
      container.remove();
      console.log('替換介面已移除');
    }
  },

  /** 初始化自動替換組 */
  _initializeAutoReplaceGroups(container, textArea) {
    // 創建垂直容器
    const autoContainer = document.createElement('div');
    autoContainer.className = 'auto-replace-container';

    // 載入保存的規則
    chrome.storage.sync.get([this.CONFIG.AUTO_REPLACE_KEY], (result) => {
      this.autoReplaceRules = result[this.CONFIG.AUTO_REPLACE_KEY] || [];
      
      // 創建3組自動替換框
      for (let i = 0; i < 3; i++) {
        const group = this._createAutoReplaceGroup(textArea, i);
        autoContainer.appendChild(group);
        
        // 如果有保存的規則，填入內容並設置狀態
        if (this.autoReplaceRules[i]) {
          const { from, to, enabled } = this.autoReplaceRules[i];
          const inputs = group.querySelectorAll('input[type="text"]');
          inputs[0].value = from;
          inputs[1].value = to;
          group.querySelector('input[type="checkbox"]').checked = enabled;
        }
      }

      // 在初始化完成後立即執行一次自動替換
      this._handleAutoReplace(textArea);
    });

    container.appendChild(autoContainer);

    // 監聽文本變化，執行自動替換
    textArea.addEventListener('input', () => this._handleAutoReplace(textArea));
  },

  /** 創建單個自動替換組 */
  _createAutoReplaceGroup(textArea, index) {
    const group = document.createElement('div');
    group.className = 'auto-replace-group';

    const fromInput = document.createElement('input');
    fromInput.type = 'text';
    fromInput.placeholder = '自動替換';
    fromInput.className = 'replace-input';
    fromInput.style.cssText = `width: ${this.CONFIG.MIN_WIDTH}px !important;`;

    const toInput = document.createElement('input');
    toInput.type = 'text';
    toInput.placeholder = '替換為';
    toInput.className = 'replace-input';
    toInput.style.cssText = `width: ${this.CONFIG.MIN_WIDTH}px !important;`;

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.className = 'auto-replace-checkbox';

    // 添加輸入事件來調整寬度
    const adjustWidth = (input) => {
      const text = input.value;
      if (!text) {
        input.style.cssText = `width: ${this.CONFIG.MIN_WIDTH}px !important;`;
        return;
      }
      
      const span = document.createElement('span');
      span.style.visibility = 'hidden';
      span.style.position = 'absolute';
      span.style.whiteSpace = 'pre';
      span.style.font = window.getComputedStyle(input).font;
      span.textContent = text;
      document.body.appendChild(span);
      
      const textWidth = span.offsetWidth;
      const width = Math.min(
        Math.max(this.CONFIG.MIN_WIDTH, textWidth + this.CONFIG.PADDING),
        this.CONFIG.MAX_WIDTH
      );
      input.style.cssText = `width: ${width}px !important;`;
      
      span.remove();
    };

    // 綁定事件
    [fromInput, toInput].forEach(input => {
      // 輸入時調整寬度和保存
      input.addEventListener('input', () => {
        adjustWidth(input);  // 使用局部的 adjustWidth 函數
        this._saveAutoReplaceRules();
      });

      // 失去焦點時執行替換
      input.addEventListener('blur', () => {
        if (checkbox.checked && fromInput.value.trim() && toInput.value.trim()) {
          this._handleAutoReplace(textArea);
        }
      });
    });

    checkbox.addEventListener('change', () => {
      this._saveAutoReplaceRules();
      if (checkbox.checked && fromInput.value.trim() && toInput.value.trim()) {
        this._handleAutoReplace(textArea);
      }
    });

    group.appendChild(fromInput);
    group.appendChild(toInput);
    group.appendChild(checkbox);

    return group;
  },

  /** 保存自動替換規則 */
  _saveAutoReplaceRules() {
    const rules = Array.from(document.querySelectorAll('.auto-replace-group')).map(group => {
      const inputs = group.querySelectorAll('input[type="text"]');
      return {
        from: inputs[0].value,
        to: inputs[1].value,
        enabled: group.querySelector('input[type="checkbox"]').checked
      };
    });

    this.autoReplaceRules = rules;
    chrome.storage.sync.set({ [this.CONFIG.AUTO_REPLACE_KEY]: rules });
  },

  /** 執行自動替換 */
  _handleAutoReplace(textArea) {
    let text = textArea.value;
    let changed = false;

    this.autoReplaceRules.forEach(rule => {
      if (rule.enabled && rule.from.trim()) {
        const regex = new RegExp(this._escapeRegExp(rule.from), 'g');
        const newText = text.replace(regex, rule.to);
        if (newText !== text) {
          text = newText;
          changed = true;
        }
      }
    });

    if (changed) {
      textArea.value = text;
      textArea.dispatchEvent(new Event('input', { bubbles: true }));
    }
  },

  /** 保存手動替換值 */
  _saveManualReplaceValues(from, to, key) {
    chrome.storage.sync.set({
      [key]: {
        from: from,
        to: to
      }
    });
  }
};

window.ReplaceManager = ReplaceManager; 