/* global GlobalSettings, TextProcessor, Notification, UndoManager */
/** 文字替換管理模組 */
const ReplaceManager = {
  // 添加常量配置
  CONFIG: {
    MIN_WIDTH: 75,  // 最小寬度
    MAX_WIDTH: 300, // 最大寬度
    PADDING: 24,    // padding總寬度
    STORAGE_KEY: 'replacePosition' // 添加儲存位置的 key
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

    // 創建輸入框和按鈕
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
    replaceButton.id = 'replace-button';
    replaceButton.className = 'replace-button disabled';
    this._updateReplaceButton(replaceButton, 0);
    
    // 綁定事件
    const updateButton = () => {
      const text = textArea.value;
      const searchText = fromInput.value.trim();
      
      if (!searchText) {
        this._updateReplaceButton(replaceButton, 0);
        return;
      }

      let count = 0;
      try {
        // 檢查是否為正則表達式格式
        if (searchText.startsWith('/') && searchText.match(/\/[gimy]*$/)) {
          const lastSlash = searchText.lastIndexOf('/');
          const pattern = searchText.slice(1, lastSlash);
          const flags = searchText.slice(lastSlash + 1);
          const regex = new RegExp(pattern, flags);
          count = (text.match(regex) || []).length;
          console.log('使用正則表達式計數:', regex, count);
        } else {
          // 普通文字匹配
          count = (text.match(new RegExp(this._escapeRegExp(searchText), 'g')) || []).length;
          console.log('使用普通文字計數:', count);
        }
      } catch (error) {
        console.error('計算匹配數量時出錯:', error);
        count = 0;
      }

      this._updateReplaceButton(replaceButton, count);
    };

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

    // 處理選中文字
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

    // 綁定事件監聽器
    [fromInput, toInput].forEach(input => {
      input.addEventListener('input', () => {
        adjustWidth(input);
        updateButton();
      });
    });

    textArea.addEventListener('input', updateButton);
    textArea.addEventListener('mouseup', handleSelection);
    textArea.addEventListener('keyup', (e) => {
      if (e.shiftKey || e.key === 'Shift') {
        handleSelection();
      }
    });

    replaceButton.addEventListener('click', () => {
      this._handleReplace(textArea, fromInput.value, toInput.value);
    });

    // 添加元素
    container.appendChild(dragHandle);
    container.appendChild(fromInput);
    container.appendChild(toInput);
    container.appendChild(replaceButton);

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
      // 檢查是否為正則表達式格式 (以 / 開始和結束)
      let regex;
      if (fromText.startsWith('/') && fromText.match(/\/[gimy]*$/)) {
        // 從字符串創建正則表達式，例如 "/pattern/gi"
        const lastSlash = fromText.lastIndexOf('/');
        const pattern = fromText.slice(1, lastSlash);
        const flags = fromText.slice(lastSlash + 1);
        regex = new RegExp(pattern, flags);
        console.log('使用正則表達式替換:', regex);
      } else {
        // 使用普通文字替換
        regex = new RegExp(this._escapeRegExp(fromText), 'g');
        console.log('使用普通文字替換');
      }

      const newText = textArea.value.replace(regex, toText);
      
      if (originalText !== newText) {
        textArea.value = newText;
        textArea.dispatchEvent(new Event('input', { bubbles: true }));
        window.UndoManager.saveState(textArea);
        console.log('替換完成');
      } else {
        console.log('沒有內容被替換');
      }
    } catch (error) {
      console.error('替換錯誤:', error);
      alert('正則表達式格式錯誤: ' + error.message);
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
  }
};

window.ReplaceManager = ReplaceManager; 