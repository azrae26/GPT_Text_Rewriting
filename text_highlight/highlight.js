/* global UIManager */

/**
 * 文字標示模組 - 負責在文本區域中標示特定文字
 */
const TextHighlight = {
  /**
   * DOM 元素管理子模組 - 處理所有 DOM 相關操作
   */
  DOMManager: {
    // 存儲所有需要的 DOM 元素引用
    elements: {
      highlights: [],        // 所有標示元素的集合
      container: null,       // 標示容器
      textArea: null,        // 文本區域
      measureCanvas: null,   // 測量文字寬度的 canvas
      measureContext: null   // canvas 的 2d context
    },

    initialize() {
      this.setupMeasureCanvas();
      this.setupHighlightContainer();
    },

    /**
     * 設置用於測量文字寬度的 canvas
     */
    setupMeasureCanvas() {
      this.elements.measureCanvas = document.createElement('canvas');
      this.elements.measureContext = this.elements.measureCanvas.getContext('2d');
    },

    /**
     * 設置標示容器
     */
    setupHighlightContainer() {
      const container = document.createElement('div');
      container.id = 'text-highlight-container';
      
      // 獲取 textarea 元素
      const textArea = document.querySelector('textarea[name="content"]');
      if (!textArea) return;
      
      // 設置容器樣式，使用 textarea 的尺寸
      container.style.cssText = `
        position: absolute;
        top: 0;
        left: 0;
        width: ${textArea.offsetWidth}px;
        height: ${textArea.offsetHeight}px;
        pointer-events: none;
        z-index: 1000;
        overflow: hidden;
      `;

      this.elements.textArea = textArea;
      if (textArea.parentElement) {
        textArea.parentElement.style.position = 'relative';
        textArea.parentElement.appendChild(container);
        this.elements.container = container;
      }
    },

    /**
     * 清除所有標示
     */
    clearHighlights() {
      this.elements.highlights.forEach(element => element.remove());
      this.elements.highlights = [];
    },

    /**
     * 檢查位置是否在文本區域可視範圍內
     * @param {Object} position - 位置信息
     * @param {number} width - 標示寬度
     * @param {number} height - 標示高度
     * @returns {boolean} - 是否在可視範圍內
     */
    isPositionVisible(position, width, height) {
      const textArea = this.elements.textArea;
      return (
        position.top >= 0 &&
        position.left >= 0 &&
        position.top + height <= textArea.offsetHeight &&
        position.left + width <= textArea.offsetWidth
      );
    }
  },

  /**
   * 位置計算子模組 - 處理文字位置的計算
   */
  PositionCalculator: {
    /**
     * 獲取文字寬度
     */
    getTextWidth(text, font) {
      TextHighlight.DOMManager.elements.measureContext.font = font;
      return TextHighlight.DOMManager.elements.measureContext.measureText(text).width;
    },

    /**
     * 獲取文本區域的樣式信息
     */
    getTextAreaStyles(textArea) {
      const computedStyle = window.getComputedStyle(textArea);
      return {
        font: `${computedStyle.fontSize} ${computedStyle.fontFamily}`,
        lineHeight: parseFloat(computedStyle.lineHeight),
        paddingLeft: parseFloat(computedStyle.paddingLeft),
        paddingTop: parseFloat(computedStyle.paddingTop),
        letterSpacing: parseFloat(computedStyle.letterSpacing) || 0,
        border: parseFloat(computedStyle.borderWidth) || 0
      };
    },

    /**
     * 計算標示位置
     */
    calculatePosition(textArea, index, text, styles) {
      const textBeforeTarget = text.substring(0, index);
      const lines = textBeforeTarget.split('\n');
      const currentLine = lines[lines.length - 1];
      
      const lineNumber = lines.length - 1;
      const verticalPosition = (lineNumber * styles.lineHeight) + 
                             styles.paddingTop + 
                             styles.border;

      const horizontalPosition = this.getTextWidth(currentLine, styles.font) + 
                               styles.paddingLeft + 
                               styles.border + 
                               (currentLine.length * styles.letterSpacing);

      return {
        top: verticalPosition - textArea.scrollTop + 16,
        left: horizontalPosition + 14
      };
    }
  },

  /**
   * 事件處理子模組 - 處理所有事件監聽
   */
  EventHandler: {
    initialize() {
      this.setupTextAreaEvents();
      this.setupResizeObserver();
      this.setupFontLoader();
    },

    /**
     * 設置文本區域事件
     */
    setupTextAreaEvents() {
      const textArea = TextHighlight.DOMManager.elements.textArea;
      if (!textArea) return;

      textArea.addEventListener('input', () => TextHighlight.updateHighlights());
      textArea.addEventListener('scroll', () => TextHighlight.updateHighlights());
    },

    /**
     * 設置大小變化觀察器
     */
    setupResizeObserver() {
      const resizeObserver = new ResizeObserver(() => {
        TextHighlight.updateHighlights();
      });
      
      const textArea = TextHighlight.DOMManager.elements.textArea;
      if (textArea) {
        resizeObserver.observe(textArea);
      }
    },

    /**
     * 設置字體載入監聽
     */
    setupFontLoader() {
      document.fonts.ready.then(() => {
        TextHighlight.updateHighlights();
      });
    }
  },

  /**
   * 高亮顏色配置 - 循環使用的顏色陣列
   */
  highlightColors: [
    'rgba(255, 165, 0, 0.3)',  // 橙色
    'rgba(255, 105, 180, 0.3)', // 粉紅
    'rgba(50, 205, 50, 0.3)',   // 綠色
    'rgba(30, 144, 255, 0.3)',  // 藍色
    'rgba(238, 130, 238, 0.3)', // 紫色
    'rgba(255, 215, 0, 0.3)',   // 金色
    'rgba(64, 224, 208, 0.3)',  // 綠松石色
    'rgba(255, 99, 71, 0.3)',   // 蕃茄紅
    'rgba(135, 206, 235, 0.3)', // 天藍色
    'rgba(218, 112, 214, 0.3)'  // 蘭花紫
  ],

  // 要高亮的文字陣列
  targetWords: [],

  // 設置要高亮的文字
  setTargetWords(words) {
    this.targetWords = words.filter(word => word.trim()); // 過濾空白文字
    this.updateHighlights();
  },

  // 獲取循環的顏色
  getColorForIndex(index) {
    return this.highlightColors[index % this.highlightColors.length];
  },

  /**
   * 標示渲染子模組 - 處理標示的視覺呈現
   */
  Renderer: {
    /**
     * 創建標示元素
     */
    createHighlight(position, width, lineHeight, colorIndex) {
      if (!TextHighlight.DOMManager.isPositionVisible(
        position, 
        width, 
        lineHeight
      )) {
        return null;
      }

      const highlight = document.createElement('div');
      highlight.className = 'text-highlight';
      
      highlight.style.cssText = `
        position: absolute;
        background-color: ${TextHighlight.getColorForIndex(colorIndex)};
        height: ${lineHeight}px;
        width: ${width}px;
        left: ${position.left}px;
        top: ${position.top}px;
        pointer-events: none;
      `;

      return highlight;
    }
  },

  /**
   * 初始化模組
   */
  initialize() {
    console.log('初始化文字標示功能');
    this.DOMManager.initialize();
    this.EventHandler.initialize();
  },

  /**
   * 更新所有標示
   */
  updateHighlights() {
    const { textArea, container } = this.DOMManager.elements;
    if (!textArea || !container) return;

    // 使用 requestAnimationFrame 來優化渲染性能
    if (this._rafId) {
      cancelAnimationFrame(this._rafId);
    }

    this._rafId = requestAnimationFrame(() => {
      this.DOMManager.clearHighlights();

      const text = textArea.value;
      const styles = this.PositionCalculator.getTextAreaStyles(textArea);

      // 更新容器尺���以匹配 textarea
      container.style.width = `${textArea.offsetWidth}px`;
      container.style.height = `${textArea.offsetHeight}px`;

      // 使用 DocumentFragment 來減少 DOM 操作
      const fragment = document.createDocumentFragment();

      // 為每個目標文字創建高亮
      this.targetWords.forEach((targetWord, wordIndex) => {
        if (!targetWord.trim()) return;

        try {
          // 檢查是否為正則表達式
          if (targetWord.startsWith('/') && targetWord.endsWith('/')) {
            // 移除開頭和結尾的斜線，創建正則表達式
            const regexStr = targetWord.slice(1, -1);
            const regex = new RegExp(regexStr, 'gm');
            let match;
            let matchCount = 0;
            const maxMatches = 1000;

            const matches = text.matchAll(regex);
            for (const match of matches) {
              if (matchCount >= maxMatches) break;

              if (match[0]) {
                const position = this.PositionCalculator.calculatePosition(
                  textArea, 
                  match.index, 
                  text, 
                  styles
                );
                
                const wordWidth = this.PositionCalculator.getTextWidth(match[0], styles.font);
                const highlight = this.Renderer.createHighlight(
                  position, 
                  wordWidth, 
                  styles.lineHeight,
                  wordIndex
                );
                
                if (highlight) {
                  fragment.appendChild(highlight);
                  this.DOMManager.elements.highlights.push(highlight);
                }

                matchCount++;
              }
            }
          } else {
            // 一般文字搜尋
            let index = 0;
            let matchCount = 0;
            const maxMatches = 200; // 設置最大匹配次數

            while ((index = text.indexOf(targetWord, index)) !== -1 && matchCount < maxMatches) {
              const position = this.PositionCalculator.calculatePosition(
                textArea, 
                index, 
                text, 
                styles
              );
              
              const wordWidth = this.PositionCalculator.getTextWidth(targetWord, styles.font);
              const highlight = this.Renderer.createHighlight(
                position, 
                wordWidth, 
                styles.lineHeight,
                wordIndex
              );
              
              if (highlight) {
                fragment.appendChild(highlight);
                this.DOMManager.elements.highlights.push(highlight);
              }
              
              index += targetWord.length;
              matchCount++;
            }
          }
        } catch (error) {
          console.error('高亮處理錯誤:', error, '正則表達式:', targetWord);
        }
      });

      container.appendChild(fragment);
    });
  }
};

// 將模組暴露給全局作用域
window.TextHighlight = TextHighlight; 