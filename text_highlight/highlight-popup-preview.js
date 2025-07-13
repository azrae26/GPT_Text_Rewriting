/**
 * text_highlight/highlight-popup-preview.js - 高亮預覽功能模組
 * 功能：為 popup 環境提供高亮文字預覽和顏色管理
 * 職責：
 * - 高亮文字輸入管理：處理高亮關鍵字的輸入和編輯
 * - 顏色選擇控制：管理顏色選擇器和顏色分配邏輯
 * - 預覽渲染：在 popup 環境中渲染高亮預覽效果
 * - 位置同步：處理滾動時的預覽位置更新
 * - 數據持久化：保存高亮設置到 Chrome Storage
 * - 通訊橋接：與 content script 同步高亮設置
 * 
 * 重構說明：
 * - 從 popup.js 中提取的高亮相關功能（2025年1月重構）
 * - 採用依賴注入模式，避免硬編碼 DOM 元素
 * - 維持與主程式的接口兼容性和功能完整性
 * 
 * 依賴：
 * - TextHighlight.Renderer：復用高亮元素創建方法（如果需要）
 * - Chrome Storage API：持久化顏色和文字設置
 * - sendMessageToTab：與 content script 通訊
 */

// 高亮預覽管理器
const HighlightPreviewManager = {
  // DOM 元素引用（依賴注入）
  highlightWordsInput: null,
  colorBoxes: null,
  overlay: null,
  sendMessageToTab: null,
  
  // 狀態管理
  selectedLine: -1,
  wordColors: {},
  
  /**
   * 初始化高亮預覽管理器
   * @param {HTMLElement} highlightWordsInput - 高亮文字輸入框
   * @param {NodeList} colorBoxes - 顏色選擇器集合
   * @param {HTMLElement} overlay - 預覽覆蓋層
   * @param {Function} sendMessageToTabFunction - 發送訊息到標籤頁的函數
   */
  init(highlightWordsInput, colorBoxes, overlay, sendMessageToTabFunction) {
    LogUtils.log('初始化高亮預覽管理器');
    
    this.highlightWordsInput = highlightWordsInput;
    this.colorBoxes = colorBoxes;
    this.overlay = overlay;
    this.sendMessageToTab = sendMessageToTabFunction;
    
    // 載入已保存的設置
    this.loadSavedSettings();
    
    // 綁定事件
    this.bindEvents();
    
    LogUtils.log('高亮預覽管理器初始化完成');
  },

  /**
   * 載入已保存的高亮設置
   */
  loadSavedSettings() {
    // 載入已保存的顏色設置
    chrome.storage.local.get(['highlightColors'], (data) => {
      if (data.highlightColors) {
        this.wordColors = data.highlightColors;
        LogUtils.log('已載入顏色設置:', this.wordColors);
      }
    });

    // 載入已保存的高亮文字
    chrome.storage.local.get(['highlightWords'], (data) => {
      if (data.highlightWords && this.highlightWordsInput) {
        this.highlightWordsInput.value = data.highlightWords;
        this.highlightWordsInput._previousValue = data.highlightWords;
        
        // 延遲更新預覽
        setTimeout(() => {
          this.updatePreview();
          requestAnimationFrame(() => {
            this.updatePreviewsPosition();
          });
        }, 0);
      }
    });
  },

  /**
   * 綁定事件處理器
   */
  bindEvents() {
    if (!this.highlightWordsInput) return;

    // 綁定輸入框事件
    this.highlightWordsInput.addEventListener('input', (e) => {
      this.handleInputChange(e);
    });

    this.highlightWordsInput.addEventListener('click', (e) => {
      this.handleInputClick(e);
    });

    this.highlightWordsInput.addEventListener('scroll', () => {
      requestAnimationFrame(() => {
        this.updatePreviewsPosition();
      });
    });

    // 綁定顏色選擇器事件
    this.bindColorBoxEvents();
  },

  /**
   * 綁定顏色選擇器事件
   */
  bindColorBoxEvents() {
    if (!this.colorBoxes) return;

    // 設置顏色方塊的初始顯示樣式
    this.colorBoxes.forEach(box => {
      const color = box.dataset.color;
      const style = box.dataset.style;
      
      if (style === 'border') {
        // 外框式：設置文字顏色，通過currentColor讓偽元素繼承
        box.classList.add('border-box');
        box.style.color = color;
      } else {
        // 背景式：設置背景顏色
        box.style.backgroundColor = color;
      }
    });

    // 初始化高亮顏色選擇器
    if (typeof HighlightColorPicker !== 'undefined') {
      HighlightColorPicker.init(this.colorBoxes, (color, style, box) => {
        this.handleColorBoxClick(color, style, box);
      });
      
      // 載入保存的自定義顏色
      HighlightColorPicker.loadCustomColors(this.colorBoxes);
      
      LogUtils.log('高亮顏色選擇器已整合');
    } else {
      LogUtils.warn('HighlightColorPicker 未載入，將使用基本的顏色選擇功能');
      
      // 降級處理：使用原始的單擊事件
      this.colorBoxes.forEach(box => {
        const color = box.dataset.color;
        const style = box.dataset.style;
        
        box.addEventListener('click', () => {
          this.handleColorBoxClick(color, style, box);
        });
      });
    }
  },

  /**
   * 處理輸入框內容變更
   */
  handleInputChange(e) {
    const newText = e.target.value;
    const oldText = e.target._previousValue || '';

    const newLines = newText.split('\n');
    const oldLines = oldText.split('\n');
    const newEffectiveWordColors = {};

    // 顏色繼承邏輯
    for (let i = 0; i < newLines.length; i++) {
      const newLine = newLines[i];

      if (i < oldLines.length) {
        const oldLineAtIndex = oldLines[i];
        if (newLine === oldLineAtIndex) {
          // 行文字內容相同，保留顏色
          if (this.wordColors[oldLineAtIndex] !== undefined) {
            newEffectiveWordColors[newLine] = this.wordColors[oldLineAtIndex];
          }
        } else {
          // 行文字內容已改變
          if (this.wordColors[newLine] !== undefined) {
            newEffectiveWordColors[newLine] = this.wordColors[newLine];
          } else if (this.wordColors[oldLineAtIndex] !== undefined && newLine.trim() !== "") {
            // 繼承顏色（用於就地編輯）
            newEffectiveWordColors[newLine] = this.wordColors[oldLineAtIndex];
          }
        }
      } else {
        // 新增加的行
        if (this.wordColors[newLine] !== undefined) {
          newEffectiveWordColors[newLine] = this.wordColors[newLine];
        }
      }
    }

    this.wordColors = newEffectiveWordColors;
    e.target._previousValue = newText;
    
    this.updatePreview();
    this.updateHighlightWords(newText);
  },

  /**
   * 處理輸入框點擊事件
   */
  handleInputClick(e) {
    const text = e.target.value;
    const start = e.target.selectionStart;
    const lines = text.substr(0, start).split('\n');
    this.selectedLine = lines.length - 1;
    
    // 更新顏色選擇器的選中狀態
    this.updateColorBoxSelection();
  },

  /**
   * 處理顏色方塊點擊事件
   */
  handleColorBoxClick(color, style, box, oldColor = null, oldStyle = null) {
    const words = this.highlightWordsInput.value.split('\n');
    
    // 如果傳入了舊顏色參數，使用傳入的值；否則從按鈕獲取
    let currentColor, currentStyle;
    if (oldColor && oldStyle) {
      currentColor = oldColor;
      currentStyle = oldStyle;
    } else {
      const originalColor = box.dataset.originalColor;
      const originalStyle = box.dataset.originalStyle;
      currentColor = box.dataset.currentColor || originalColor;
      currentStyle = box.dataset.currentStyle || originalStyle;
    }
    
    // 構建當前使用的顏色格式（用於比對）
    let oldColorFormat;
    if (currentStyle === 'border') {
      oldColorFormat = `border:${currentColor}`;
    } else {
      oldColorFormat = currentColor;
    }
    
    // 構建新的顏色格式
    let newColorFormat;
    if (style === 'border') {
      newColorFormat = `border:${color}`;
    } else {
      newColorFormat = color;
    }
    
    LogUtils.log('🎨 顏色變更:', {
      from: oldColorFormat,
      to: newColorFormat,
      affectedWords: []
    });
    
    // 更新所有使用該顏色的關鍵字
    let updatedCount = 0;
    const affectedWords = [];
    
    Object.keys(this.wordColors).forEach(word => {
      if (this.wordColors[word] === oldColorFormat) {
        this.wordColors[word] = newColorFormat;
        updatedCount++;
        affectedWords.push(word);
      }
    });
    
    // 如果有選中的行但該行沒有被自動更新，則為其設置新顏色
    if (this.selectedLine >= 0) {
      const selectedWord = words[this.selectedLine];
      if (selectedWord && !affectedWords.includes(selectedWord)) {
        this.wordColors[selectedWord] = newColorFormat;
        affectedWords.push(selectedWord);
        updatedCount++;
      }
    }
    
    LogUtils.log(`✅ 已更新 ${updatedCount} 個關鍵字的顏色:`, affectedWords);
    
    // 清除所有顏色方塊的選中狀態
    this.colorBoxes.forEach(cb => {
      cb.classList.remove('selected');
    });
    
    // 為當前點擊的方塊添加選中狀態
    box.classList.add('selected');
    
    // 保存顏色設置
    chrome.storage.local.set({ highlightColors: this.wordColors });
    
    // 更新預覽（這會重新渲染所有高亮文字）
    this.updatePreview();
    
    // 同步到 content script（這會更新頁面上的高亮效果）
    this.syncToContentScript(words);
  },

  /**
   * 更新顏色選擇器選中狀態
   */
  updateColorBoxSelection() {
    // 清除所有選中狀態
    this.colorBoxes.forEach(cb => {
      cb.classList.remove('selected');
    });
    
    if (this.selectedLine >= 0) {
      const words = this.highlightWordsInput.value.split('\n');
      const word = words[this.selectedLine];
      
      if (word && this.wordColors[word]) {
        const currentColor = this.wordColors[word];
        
        // 找到匹配的顏色方塊並標記為選中
        this.colorBoxes.forEach(box => {
          // 優先使用自訂顏色，否則使用原始顏色
          const boxColor = box.dataset.currentColor || box.dataset.color;
          const boxStyle = box.dataset.currentStyle || box.dataset.style;
          
          let matches = false;
          if (currentColor.startsWith('border:')) {
            // 外框式顏色
            const colorValue = currentColor.substring(7);
            matches = (boxStyle === 'border' && boxColor === colorValue);
          } else {
            // 背景式顏色
            matches = (boxStyle === 'background' && boxColor === currentColor);
          }
          
          if (matches) {
            box.classList.add('selected');
            LogUtils.log('🎯 找到匹配的顏色按鈕:', {
              word: word,
              color: boxColor,
              style: boxStyle,
              isCustom: !!(box.dataset.currentColor)
            });
          }
        });
      }
    }
  },

  /**
   * 更新高亮文字
   */
  updateHighlightWords(text) {
    const words = text.split('\n').filter(word => word.trim());
    
    chrome.storage.local.set({
      highlightWords: text,
      highlightColors: this.wordColors
    }, () => {
      this.syncToContentScript(words);
    });
  },

  /**
   * 同步設置到 content script
   */
  syncToContentScript(words) {
    if (!this.sendMessageToTab) return;

    this.sendMessageToTab({
      action: "updateHighlightWords",
      words: words,
      colors: this.wordColors
    }, (response) => {
      if (response && response.error) {
        LogUtils.log('高亮設置已保存，將在頁面重新載入時應用');
      } else {
        LogUtils.log('高亮設置已更新');
        this.sendMessageToTab({
          action: "forceUpdateHighlights"
        });
      }
    });
  },

  /**
   * 更新預覽效果
   */
  updatePreview() {
    if (!this.highlightWordsInput || !this.highlightWordsInput.clientWidth) {
      setTimeout(() => this.updatePreview(), 10);
      return;
    }
    
    // 清除所有類型的預覽元素
    const oldPreviews = document.querySelectorAll('.highlight-preview, .highlight-preview-border');
    oldPreviews.forEach(p => p.remove());

    const textarea = this.highlightWordsInput;
    const overlay = this.overlay;
    const text = textarea.value;
    const lines = text.split('\n');

    const textareaStyle = getComputedStyle(textarea);
    const font = textareaStyle.font;
    const lineHeight = parseFloat(textareaStyle.lineHeight);
    const paddingLeft = parseFloat(textareaStyle.paddingLeft);
    const paddingTop = parseFloat(textareaStyle.paddingTop);
    const innerWidth = textarea.clientWidth - paddingLeft - parseFloat(textareaStyle.paddingRight);
    
    const div = document.createElement('div');
    div.style.cssText = `
      position: absolute;
      visibility: hidden;
      white-space: pre-wrap;
      word-wrap: break-word;
      width: ${innerWidth}px;
      font: ${font};
      line-height: ${lineHeight}px;
      padding: 0;
      border: none;
    `;
    textarea.parentElement.appendChild(div);

    div.textContent = text;
    const range = document.createRange();
    const divRectBase = div.getBoundingClientRect(); 

    lines.forEach((line, index) => {
      if (!line.trim()) return;

      let lineStart = 0;
      for (let i = 0; i < index; i++) {
        lineStart += lines[i].length + 1;
      }

      if (div.firstChild && div.firstChild.nodeType === Node.TEXT_NODE) {
        const textNode = div.firstChild;
        const lineEnd = Math.min(lineStart + line.length, textNode.length);
        if (lineStart >= lineEnd) return;

        range.setStart(textNode, lineStart);
        range.setEnd(textNode, lineEnd);
        
        const rects = range.getClientRects();

        for (let i = 0; i < rects.length; i++) {
          const rect = rects[i];
          const preview = document.createElement('div');
          
          // 解析顏色和樣式
          const colorValue = this.wordColors[line] || 'rgba(50, 205, 50, 0.3)';
          let color, isBorder = false;
          
          if (colorValue.startsWith('border:')) {
            isBorder = true;
            color = colorValue.substring(7); // 移除 'border:' 前綴
            preview.className = 'highlight-preview-border';
          } else {
            color = colorValue;
            preview.className = 'highlight-preview';
          }
          
          preview.style.top = `${rect.top - divRectBase.top + paddingTop}px`;
          preview.style.left = `${rect.left - divRectBase.left + paddingLeft}px`;
          preview.style.width = `${rect.width}px`;
          preview.style.height = `${lineHeight > rect.height ? lineHeight : rect.height}px`; 
          
          if (isBorder) {
            preview.style.color = color; // 設置 color 屬性讓 currentColor 生效
          } else {
            preview.style.backgroundColor = color;
          }
          
          preview.dataset.originalTop = rect.top - divRectBase.top + paddingTop;
          overlay.appendChild(preview);
        }
      }
    });

    range.detach();
    div.remove();
    this.updatePreviewsPosition();
  },

  /**
   * 更新預覽位置
   */
  updatePreviewsPosition() {
    if (!this.highlightWordsInput) return;

    const textarea = this.highlightWordsInput;
    const scrollTop = textarea.scrollTop;

    // 處理底色式和外框式高亮預覽
    const previews = document.querySelectorAll('.highlight-preview, .highlight-preview-border');
    previews.forEach(preview => {
      const originalTop = parseFloat(preview.dataset.originalTop);
      preview.style.display = 'block';
      preview.style.transform = `translateY(${-scrollTop}px)`;
    });
  },

  /**
   * 獲取事件處理配置（供主程式整合使用）
   */
  getEventHandlerConfig() {
    return {
      // 此模組自行管理所有事件，不需要在主程式中重複綁定
      // 如果需要與主程式設定系統整合，可以在這裡返回相關配置
    };
  },

  /**
   * 強制更新預覽（供外部調用）
   */
  forceUpdatePreview() {
    this.updatePreview();
  },

  /**
   * 清理資源
   */
  cleanup() {
    this.selectedLine = -1;
    this.wordColors = {};
    
    // 清除預覽元素
    const previews = document.querySelectorAll('.highlight-preview, .highlight-preview-border');
    previews.forEach(p => p.remove());
    
    // 清理顏色選擇器
    if (typeof HighlightColorPicker !== 'undefined') {
      HighlightColorPicker.cleanup();
    }
  }
};

// 暴露到全局作用域
window.HighlightPreviewManager = HighlightPreviewManager; 