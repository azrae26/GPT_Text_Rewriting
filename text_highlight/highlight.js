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

      // 設置內層容器樣式，使用 max-height 限制高度
      container.style.cssText = `
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        max-height: ${textArea.offsetHeight}px;
        pointer-events: none;
        overflow: hidden;
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
          top: 0;
          left: 14px;
          transform: none;
          max-height: ${textArea.offsetHeight}px;
          height: ${textArea.offsetHeight}px;
        `;
        textArea.parentElement.appendChild(this.cache.div);
      }

      // 只在文字變更時更新內容
      if (this.cache.lastText !== text) {
        this.cache.div.textContent = text;
        this.cache.lastText = text;
        this.cache.positions.clear();
      }

      // 添加可用區域的尺寸日誌
      console.log('可用區域尺寸:', {
        文本框: {
          可視寬度: textArea.clientWidth,
          可視高度: textArea.clientHeight,
          實際寬度: textArea.offsetWidth,
          實際高度: textArea.offsetHeight,
          內容寬度: textArea.scrollWidth,
          內容高度: textArea.scrollHeight,
          捲軸位置: textArea.scrollTop,
          水平捲軸: textArea.scrollLeft,
          是否有捲軸: textArea.scrollHeight > textArea.clientHeight
        },
        測量容器: {
          可視寬度: this.cache.div.clientWidth,
          可視高度: this.cache.div.clientHeight,
          內容寬度: this.cache.div.scrollWidth,
          內容高度: this.cache.div.scrollHeight
        }
      });

      // 重新設置 div 的尺寸以匹配當前的 textArea
      if (this.cache.div) {
        this.cache.div.style.width = `${textArea.clientWidth}px`;
        // 清除舊的內容並重新設置
        this.cache.div.textContent = text;
        this.cache.lastText = text;
      }

      // 添加每個字的位置分析
      const range = document.createRange();
      const textNode = this.cache.div.firstChild;

      // 分析每個字的位置
      // console.log('\n=== 文字位置分析 ===');
      // console.log(`字符 "${text[i]}" 位置:`, {...});

      // 重新設置 range 到目標文字
      range.setStart(textNode, index);
      range.setEnd(textNode, index + matchedText.length);

      const rects = range.getClientRects();
      const divRect = this.cache.div.getBoundingClientRect();

      range.detach();

      if (rects.length > 0) {
        const rect = rects[0];
        const textAreaRect = textArea.getBoundingClientRect();
        
        // 直接使用固定的計算公式
        const position = {
          // 只需要減去參考點位置，再加上固定偏移
          top: rect.top - textAreaRect.top + 17,  // 固定的上偏移
          left: rect.left - textAreaRect.left + 14, // 固定的左偏移
          width: rect.width,
          originalTop: rect.top - textAreaRect.top + 17  // 保存相同的位置
        };

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

  // 要高亮的文字陣列
  targetWords: [],

  // 設置要高亮的文字
  setTargetWords(words, colors = {}) {
    this.targetWords = words.filter(word => word.trim());
    this.wordColors = colors;
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
    createHighlight(position, width, lineHeight, color) {
      const highlight = document.createElement('div');
      highlight.className = 'text-highlight';
      
      highlight.style.cssText = `
        position: absolute;
        background-color: ${color};
        height: ${lineHeight}px;
        width: ${width}px;
        left: ${position.left}px;
        top: ${position.top}px;
        pointer-events: none;
        will-change: transform;
      `;

      highlight.dataset.originalTop = position.top;
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
      
      // 保留這個檢查
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

        // 使用自定義顏色或預設顏色
        const color = this.wordColors[targetWord] || 'rgba(50, 205, 50, 0.3)';
        
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
                    color  // 直接傳入顏色而不是索引
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
              index += 1; // 使用較小的步值以避免遺漏重疊匹配
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
                  color  // 直接傳入顏色而不是索引
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
  },

  // 添加新的方法來新顏色映射
  setWordColors(colors) {
    this.wordColors = colors;
  },

  // 在 TextHighlight 模組中添加強制更新方法
  forceUpdate() {
    this._lastText = null;      // 清除文字記錄
    this._lastScrollTop = null; // 清除滾動位置記錄
    this.updateHighlights();
  }
};

// 將模組暴露給全局作用域
window.TextHighlight = TextHighlight; 