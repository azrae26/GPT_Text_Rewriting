/**
 * 文字上色模組
 * 實現多種方法來改變輸入框中特定文字的顏色
 */
const TextColor = {
  // 目標關鍵字
  TARGET_WORDS: ['法人', '我們', '研華'],
  TARGET_COLOR: '#FFE4E1', // 淡粉色背景色

  // 方法開關配置
  METHOD_SWITCHES: {
    CSS_STYLE: false,         // 方法1：CSS樣式
    CONTENT_EDITABLE: true,  // 方法2：contentEditable
    TEXT_HIGHLIGHT: false,    // 方法3：TextHighlight（推薦）
    MUTATION_OBSERVER: false, // 方法4：MutationObserver
    OVERLAY_DIV: false,      // 方法5：覆蓋層
    SHADOW_DOM: false,       // 方法6：Shadow DOM
    CANVAS: false            // 方法7：Canvas繪製
  },

  // 初始化
  initialize() {
    console.log('[TextColor] 開始初始化文字上色功能');
    console.log('[TextColor] 當前啟用的方法：', 
      Object.entries(this.METHOD_SWITCHES)
        .filter(([_, enabled]) => enabled)
        .map(([name]) => name)
        .join(', ')
    );
    
    // 確保 DOM 已完全載入
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => {
        console.log('[TextColor] DOM已載入，開始應用方法');
        this.applyAllMethods();
      });
    } else {
      console.log('[TextColor] DOM已經載入，直接應用方法');
      this.applyAllMethods();
    }

    // 添加 MutationObserver 來監聽動態加載的元素
    if (this.METHOD_SWITCHES.MUTATION_OBSERVER) {
      const observer = new MutationObserver((mutations, obs) => {
        const textarea = document.querySelector('textarea[name="content"]');
        if (textarea) {
          console.log('[TextColor] 找到textarea元素，重新應用方法');
          this.applyAllMethods();
          obs.disconnect();
        }
      });

      observer.observe(document.body, {
        childList: true,
        subtree: true
      });
    }
  },

  // 方法1：使用 CSS 樣式
  methodCSSStyle() {
    if (!this.METHOD_SWITCHES.CSS_STYLE) return;

    try {
      const textarea = document.querySelector('textarea[name="content"]');
      if (!textarea) {
        console.log('[TextColor] 方法1失敗：找不到textarea元素');
        return;
      }

      const style = document.createElement('style');
      style.textContent = `
        textarea[name="content"] {
          color: inherit;
        }
        textarea[name="content"]::selection {
          background-color: ${this.TARGET_COLOR};
          color: inherit;
        }
      `;
      document.head.appendChild(style);
      console.log('[TextColor] 方法1：CSS樣式已應用');
    } catch (error) {
      console.error('[TextColor] 方法1執行錯誤：', error);
    }
  },

  // 方法2：使用 contentEditable div
  methodContentEditable() {
    if (!this.METHOD_SWITCHES.CONTENT_EDITABLE) return;

    try {
      const textarea = document.querySelector('textarea[name="content"]');
      if (!textarea) {
        console.log('[TextColor] 方法2失敗：找不到textarea元素');
        return;
      }

      console.log('[TextColor] 方法2：找到textarea，值為:', textarea.value);

      // 創建可編輯 div
      const div = document.createElement('div');
      div.contentEditable = true;
      div.className = 'editable-content';
      
      // 複製 textarea 的樣式
      const computedStyle = window.getComputedStyle(textarea);
      div.style.cssText = textarea.style.cssText;
      div.style.height = computedStyle.height;
      div.style.width = computedStyle.width;
      div.style.padding = computedStyle.padding;
      div.style.margin = computedStyle.margin;
      div.style.border = computedStyle.border;
      div.style.fontFamily = computedStyle.fontFamily;
      div.style.fontSize = computedStyle.fontSize;
      div.style.lineHeight = computedStyle.lineHeight;
      div.style.whiteSpace = 'pre-wrap';
      div.style.overflowY = 'auto';
      div.style.backgroundColor = computedStyle.backgroundColor;

      // 更新文字顏色的函數
      const updateColors = () => {
        let content = div.innerHTML;
        this.TARGET_WORDS.forEach(word => {
          const regex = new RegExp(`(${word})(?![^<]*>)`, 'g');
          content = content.replace(regex, `<span style="color: red;">${word}</span>`);
        });

        // 保存當前的選擇範圍
        let startOffset = 0;
        let endOffset = 0;
        try {
          const selection = window.getSelection();
          if (selection.rangeCount > 0) {
            const range = selection.getRangeAt(0);
            startOffset = range.startOffset;
            endOffset = range.endOffset;
          }
        } catch (e) {
          console.log('[TextColor] 無法獲取選擇範圍，這是正常的');
        }
        
        div.innerHTML = content;
        
        // 恢復選擇範圍
        try {
          if (startOffset !== endOffset) {
            const selection = window.getSelection();
            const newRange = document.createRange();
            newRange.setStart(div.firstChild || div, Math.min(startOffset, div.textContent.length));
            newRange.setEnd(div.firstChild || div, Math.min(endOffset, div.textContent.length));
            selection.removeAllRanges();
            selection.addRange(newRange);
          }
        } catch (e) {
          console.log('[TextColor] 恢復選擇範圍失敗，這是正常的');
        }
      };

      // 初始化內容
      div.innerText = textarea.value;
      
      // 延遲執行第一次更新，確保 DOM 已經準備好
      setTimeout(() => {
        updateColors();
      }, 0);

      // 監聽輸入事件
      div.addEventListener('input', () => {
        updateColors();
        // 同步回 textarea
        textarea.value = div.innerText;
        // 觸發 textarea 的 change 事件
        const event = new Event('change', { bubbles: true });
        textarea.dispatchEvent(event);
      });

      // 監聽貼上事件，確保貼上的是純文本
      div.addEventListener('paste', (e) => {
        e.preventDefault();
        const text = e.clipboardData.getData('text/plain');
        document.execCommand('insertText', false, text);
      });

      // 監聽按鍵事件，處理特殊按鍵
      div.addEventListener('keydown', (e) => {
        if (e.key === 'Tab') {
          e.preventDefault();
          document.execCommand('insertText', false, '\t');
        }
      });

      // 替換 textarea
      textarea.style.display = 'none';
      textarea.parentNode.insertBefore(div, textarea);

      console.log('[TextColor] 方法2：contentEditable div已應用');
    } catch (error) {
      console.error('[TextColor] 方法2執行錯誤：', error);
    }
  },

  // 方法3：使用 TextHighlight 模組
  methodTextHighlight() {
    if (!this.METHOD_SWITCHES.TEXT_HIGHLIGHT) return;

    try {
      if (!window.TextHighlight) {
        console.log('[TextColor] 方法3失敗：TextHighlight模組未載入');
        return;
      }

      console.log('[TextColor] 方法3：TextHighlight模組已找到，開始設置目標文字');
      const colorMap = {};
      this.TARGET_WORDS.forEach(word => {
        colorMap[word] = this.TARGET_COLOR;
      });
      TextHighlight.setTargetWords(this.TARGET_WORDS, colorMap);
      console.log('[TextColor] 方法3：TextHighlight已應用');
    } catch (error) {
      console.error('[TextColor] 方法3執行錯誤：', error);
    }
  },

  // 方法4：使用 MutationObserver
  methodMutationObserver() {
    if (!this.METHOD_SWITCHES.MUTATION_OBSERVER) return;

    try {
      const textarea = document.querySelector('textarea[name="content"]');
      if (!textarea) {
        console.log('[TextColor] 方法4失敗：找不到textarea元素');
        return;
      }

      console.log('[TextColor] 方法4：開始設置MutationObserver');
      const observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
          if (mutation.type === 'characterData' || mutation.type === 'childList') {
            const text = textarea.value;
            if (text.includes(this.TARGET_WORDS.join('|'))) {
              console.log('[TextColor] 方法4：檢測到目標文字變更');
              this.methodTextHighlight();
            }
          }
        });
      });

      observer.observe(textarea, {
        characterData: true,
        childList: true,
        subtree: true
      });
      console.log('[TextColor] 方法4：MutationObserver已設置');
    } catch (error) {
      console.error('[TextColor] 方法4執行錯誤：', error);
    }
  },

  // 方法5：使用覆蓋層
  methodOverlayDiv() {
    if (!this.METHOD_SWITCHES.OVERLAY_DIV) return;

    try {
      const textarea = document.querySelector('textarea[name="content"]');
      if (!textarea) {
        console.log('[TextColor] 方法5失敗：找不到textarea元素');
        return;
      }

      // 創建覆蓋層
      const overlay = document.createElement('div');
      overlay.style.cssText = `
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        pointer-events: none;
        z-index: 1000;
        white-space: pre-wrap;
        word-wrap: break-word;
        font: ${getComputedStyle(textarea).font};
      `;

      // 計算並標記關鍵字位置
      const text = textarea.value;
      let html = text;
      this.TARGET_WORDS.forEach(word => {
        const regex = new RegExp(word, 'g');
        html = html.replace(regex, `<mark style="background-color: ${this.TARGET_COLOR}; color: inherit;">${word}</mark>`);
      });

      overlay.innerHTML = html;
      textarea.parentNode.appendChild(overlay);
      console.log('[TextColor] 方法5：覆蓋層已應用');
    } catch (error) {
      console.error('[TextColor] 方法5執行錯誤：', error);
    }
  },

  // 方法6：使用Shadow DOM
  methodShadowDOM() {
    if (!this.METHOD_SWITCHES.SHADOW_DOM) return;

    try {
      const textarea = document.querySelector('textarea[name="content"]');
      if (!textarea) {
        console.log('[TextColor] 方法6失敗：找不到textarea元素');
        return;
      }

      // 創建Shadow Host
      const host = document.createElement('div');
      host.style.cssText = textarea.style.cssText;
      textarea.parentNode.insertBefore(host, textarea);

      // 創建Shadow DOM
      const shadow = host.attachShadow({mode: 'open'});
      
      // 添加樣式
      const style = document.createElement('style');
      style.textContent = `
        :host {
          display: block;
          position: relative;
        }
        .highlight {
          background-color: ${this.TARGET_COLOR};
          color: inherit;
        }
      `;
      
      // 創建內容
      const content = document.createElement('div');
      content.contentEditable = true;
      content.style.cssText = textarea.style.cssText;
      
      // 處理文字
      const text = textarea.value;
      let html = text;
      this.TARGET_WORDS.forEach(word => {
        const regex = new RegExp(word, 'g');
        html = html.replace(regex, `<span class="highlight">${word}</span>`);
      });
      content.innerHTML = html;

      shadow.appendChild(style);
      shadow.appendChild(content);
      textarea.style.display = 'none';
      
      console.log('[TextColor] 方法6：Shadow DOM已應用');
    } catch (error) {
      console.error('[TextColor] 方法6執行錯誤：', error);
    }
  },

  // 方法7：使用Canvas繪製
  methodCanvas() {
    if (!this.METHOD_SWITCHES.CANVAS) return;

    try {
      const textarea = document.querySelector('textarea[name="content"]');
      if (!textarea) {
        console.log('[TextColor] 方法7失敗：找不到textarea元素');
        return;
      }

      // 創建Canvas
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      
      // 設置Canvas尺寸
      canvas.width = textarea.offsetWidth;
      canvas.height = textarea.offsetHeight;
      
      // 設置文字樣式
      const computedStyle = getComputedStyle(textarea);
      ctx.font = computedStyle.font;
      ctx.fillStyle = computedStyle.color;
      
      // 獲取文字內容
      const text = textarea.value;
      const lines = text.split('\n');
      
      // 計算行高
      const lineHeight = parseInt(computedStyle.lineHeight);
      
      // 繪製文字和高亮
      lines.forEach((line, index) => {
        let x = parseInt(computedStyle.paddingLeft);
        const y = lineHeight * (index + 1);
        
        // 尋找並高亮關鍵字
        this.TARGET_WORDS.forEach(word => {
          const regex = new RegExp(word, 'g');
          let match;
          while ((match = regex.exec(line)) !== null) {
            const beforeText = line.substring(0, match.index);
            const beforeWidth = ctx.measureText(beforeText).width;
            const wordWidth = ctx.measureText(word).width;
            
            // 繪製高亮背景
            ctx.fillStyle = this.TARGET_COLOR;
            ctx.fillRect(x + beforeWidth, y - lineHeight + 2, wordWidth, lineHeight - 4);
            
            // 繪製文字
            ctx.fillStyle = computedStyle.color;
            ctx.fillText(word, x + beforeWidth, y);
          }
        });
        
        // 繪製整行文字
        ctx.fillStyle = computedStyle.color;
        ctx.fillText(line, x, y);
      });
      
      // 插入Canvas
      canvas.style.position = 'absolute';
      canvas.style.top = '0';
      canvas.style.left = '0';
      canvas.style.pointerEvents = 'none';
      textarea.parentNode.insertBefore(canvas, textarea.nextSibling);
      
      console.log('[TextColor] 方法7：Canvas已應用');
    } catch (error) {
      console.error('[TextColor] 方法7執行錯誤：', error);
    }
  },

  // 應用所有方法
  applyAllMethods() {
    console.log('[TextColor] 開始應用所有方法');
    this.methodCSSStyle();
    this.methodContentEditable();
    this.methodTextHighlight();
    this.methodMutationObserver();
    this.methodOverlayDiv();
    this.methodShadowDOM();
    this.methodCanvas();
    console.log('[TextColor] 所有方法應用完成');
  }
};

// 將模組暴露給全局作用域
window.TextColor = TextColor;

// 立即初始化
console.log('[TextColor] 腳本載入，準備初始化');
TextColor.initialize(); 