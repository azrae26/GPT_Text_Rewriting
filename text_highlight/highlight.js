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
      measureContext: null,   // canvas 的 2d context
      highlightPositions: []  // 儲存所有高亮框的絕對位置
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
      // 創建外層容器
      const outerContainer = document.createElement('div');
      outerContainer.id = 'text-highlight-outer-container';
      
      // 創建內層容器
      const container = document.createElement('div');
      container.id = 'text-highlight-container';
      
      // 獲取 textarea 元素
      const textArea = document.querySelector('textarea[name="content"]');
      if (!textArea) return;
      
      // 設置外層容器樣式，使用 textarea 的實際尺寸
      outerContainer.style.cssText = `
        position: absolute;
        top: 12.5px;
        left: 0;
        width: ${textArea.offsetWidth}px;
        height: ${textArea.offsetHeight}px;
        pointer-events: none;
        z-index: 1000;
        overflow: hidden;
      `;

      // 設置內層容器樣式
      container.style.cssText = `
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        pointer-events: none;
      `;

      // 將內層容器添加到外層容器
      outerContainer.appendChild(container);

      // 將外層容器添加到 textarea 的父元素中
      const textAreaParent = textArea.parentElement;
      if (textAreaParent) {
        textAreaParent.style.position = 'relative';
        textAreaParent.appendChild(outerContainer);
        this.elements.container = container;
        this.elements.textArea = textArea;
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
    },

    /**
     * 更新高亮框的可見性和位置
     */
    updateHighlightsVisibility() {
      const { textArea, container } = this.elements;
      if (!textArea || !container) return;

      const scrollTop = textArea.scrollTop;
      const visibleHeight = textArea.clientHeight;
      const totalHeight = textArea.scrollHeight;

      this.elements.highlights.forEach((highlight) => {
        const originalTop = parseFloat(highlight.dataset.originalTop);
        const highlightHeight = parseFloat(highlight.style.height);
        
        // 計算相對於視窗的位置
        const relativeTop = originalTop - scrollTop;
        
        // 判斷是否在可視範圍內（加上一些緩衝空間）
        const buffer = highlightHeight;
        const isVisible = (relativeTop + highlightHeight >= -buffer) && 
                         (relativeTop <= visibleHeight + buffer) &&
                         (originalTop <= totalHeight);

        if (isVisible) {
          highlight.style.display = 'block';
          // 使用 transform 來調整位置
          highlight.style.transform = `translateY(${-scrollTop}px)`;
        } else {
          highlight.style.display = 'none';
        }
      });
    }
  },

  /**
   * 位置計算子模組 - 處理文字位置的計算
   */
  PositionCalculator: {
    // 新增快取對象
    cache: {
      div: null,
      lastText: '',
      positions: new Map(),
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
     * 優化後的位置計算方法
     */
    calculatePosition(textArea, index, text, matchedText, styles) {
      // 如果文字太長，先進行快速檢查是否可能存在匹配
      if (text.length > 1000) {
        const visibleStart = Math.max(0, index - 500);
        const visibleEnd = Math.min(text.length, index + 500);
        const visibleText = text.substring(visibleStart, visibleEnd);
        if (!visibleText.includes(matchedText)) {
          return null;
        }
      }

      // 檢查快取
      const cacheKey = `${index}-${matchedText}`;
      if (this.cache.lastText === text && this.cache.positions.has(cacheKey)) {
        return this.cache.positions.get(cacheKey);
      }

      // 重用或創建 div
      if (!this.cache.div) {
        this.cache.div = document.createElement('div');
        const computedStyle = window.getComputedStyle(textArea);
        this.cache.div.style.cssText = `
          position: absolute;
          visibility: hidden;
          white-space: pre-wrap;
          width: ${textArea.clientWidth}px;
          font: ${computedStyle.font};
          line-height: ${computedStyle.lineHeight};
          padding: ${computedStyle.padding};
          border: ${computedStyle.border};
          box-sizing: border-box;
          margin: 0;
          overflow: hidden;
          background: none;
          pointer-events: none;
        `;
        textArea.parentElement.appendChild(this.cache.div);
      }

      // 只在文字變更時更新內容
      if (this.cache.lastText !== text) {
        this.cache.div.textContent = text;
        this.cache.lastText = text;
        this.cache.positions.clear();
      }

      const range = document.createRange();
      const textNode = this.cache.div.firstChild;
      range.setStart(textNode, index);
      range.setEnd(textNode, index + matchedText.length);

      const rects = range.getClientRects();
      const divRect = this.cache.div.getBoundingClientRect();

      range.detach();

      if (rects.length > 0) {
        const rect = rects[0];
        const top = rect.top - divRect.top;
        const position = {
          top: top,
          left: rect.left - divRect.left + 14,
          width: rect.width,
          originalTop: top
        };

        // 儲存到快取
        this.cache.positions.set(cacheKey, position);
        return position;
      }

      return null;
    },

    // 清理快取的方法
    clearCache() {
      if (this.cache.div) {
        this.cache.div.remove();
        this.cache.div = null;
      }
      this.cache.lastText = '';
      this.cache.positions.clear();
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
      
      // 修改滾動事件處理
      textArea.addEventListener('scroll', () => {
        requestAnimationFrame(() => {
          TextHighlight.DOMManager.updateHighlightsVisibility();
        });
      });
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
    'rgba(50, 205, 50, 0.3)',   // 綠色
    'rgba(255, 105, 180, 0.3)', // 粉紅
    'rgba(30, 144, 255, 0.3)',  // 藍色
    'rgba(255, 165, 0, 0.3)',  // 橙色
    'rgba(238, 130, 238, 0.3)', // 紫色
    'rgba(255, 99, 71, 0.3)',   // 蕃茄紅
    'rgba(218, 112, 214, 0.3)',  // 蘭花紫
    'rgba(255, 215, 0, 0.3)',   // 金色
    'rgba(64, 224, 208, 0.3)',  // 綠松石色
    'rgba(135, 206, 235, 0.3)', // 天藍色
  ],

  // 要高亮的文字陣列
  targetWords: [],

  // 設置要高亮的文字
  setTargetWords(words) {
    this.targetWords = words.filter(word => word.trim()); // 過濾空白文字
    this.updateHighlights();
  },

  // 獲取循環顏色
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
      const highlight = document.createElement('div');
      highlight.className = 'text-highlight';
      
      // 保存原始位置
      const originalTop = position.top;
      
      highlight.style.cssText = `
        position: absolute;
        background-color: ${TextHighlight.getColorForIndex(colorIndex)};
        height: ${lineHeight}px;
        width: ${width}px;
        left: ${position.left}px;
        top: ${originalTop}px;
        pointer-events: none;
        will-change: transform;
      `;

      // 保存原始位置到 dataset
      highlight.dataset.originalTop = originalTop;

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

    if (this._rafId) {
      cancelAnimationFrame(this._rafId);
    }

    this._rafId = requestAnimationFrame(() => {
      const text = textArea.value;
      const styles = this.PositionCalculator.getTextAreaStyles(textArea);
      
      // 如果文字沒有變化且沒有滾動，可以跳過更新
      if (this._lastText === text && this._lastScrollTop === textArea.scrollTop) {
        return;
      }
      
      this._lastText = text;
      this._lastScrollTop = textArea.scrollTop;

      this.DOMManager.clearHighlights();
      const fragment = document.createDocumentFragment();

      // 批次處理所有目標文字
      this.targetWords.forEach((targetWord, wordIndex) => {
        if (!targetWord.trim()) return;

        try {
          if (targetWord.startsWith('/') && targetWord.endsWith('/')) {
            // 正則表達式處理
            const regexStr = targetWord.slice(1, -1);
            console.log(`\n處理正則表達式: "${regexStr}"`);

            const matches = Array.from(text.matchAll(new RegExp(regexStr, 'gm')));
            console.log(`找到 ${matches.length} 個正則匹配`);

            for (const match of matches) {
              if (match[0]) {
                const position = this.PositionCalculator.calculatePosition(
                  textArea, 
                  match.index, 
                  text, 
                  match[0], 
                  styles
                );
                
                if (position) {
                  console.log(`正則匹配: "${match[0]}" 位置:`, {
                    top: position.top,
                    left: position.left,
                    width: position.width
                  });

                  const highlight = this.Renderer.createHighlight(
                    position,
                    position.width,
                    styles.lineHeight,
                    wordIndex
                  );
                  
                  if (highlight) {
                    fragment.appendChild(highlight);
                    this.DOMManager.elements.highlights.push(highlight);
                  }
                }
              }
            }
          } else {
            // 使用 indexOf 快速查找所有匹配位置
            const positions = [];
            let index = 0;
            while ((index = text.indexOf(targetWord, index)) !== -1) {
              positions.push(index);
              index += 1; // 使用較小的步進值以避免遺漏重疊匹配
            }

            // 批次處理所有找到的位置
            positions.forEach(index => {
              const position = this.PositionCalculator.calculatePosition(
                textArea, index, text, targetWord, styles
              );
              if (position) {
                const highlight = this.Renderer.createHighlight(
                  position,
                  position.width,
                  styles.lineHeight,
                  wordIndex
                );
                if (highlight) {
                  fragment.appendChild(highlight);
                  this.DOMManager.elements.highlights.push(highlight);
                }
              }
            });
          }
        } catch (error) {
          console.error('高亮處理錯誤:', error);
        }
      });

      container.appendChild(fragment);
      this.DOMManager.updateHighlightsVisibility();
    });
  }
};

// 將模組暴露給全局作用域
window.TextHighlight = TextHighlight; 