/**
 * 文字標示模組
 * 
 * 依賴模組：
 * 1. regex_helper/regex-helper.js
 *    - RegexHelper.createRegex：用於創建高亮用的正則表達式
 * 
 * 2. Chrome Storage API
 *    - chrome.storage.local：用於存儲高亮顏色設定
 * 
 * 主要功能：
 * - 文本區域中標示特定文字
 * - 支援正則表達式匹配
 * - 自動調整高亮位置
 * - 高亮顏色管理
 * - 性能優化和快取處理
 */
const TextHighlight = {
  /**
   * 配置常數
   */
  CONFIG: {
    FIXED_OFFSET: {
      LEFT: 14,  // 固定左偏移量
      TOP: 13    // 固定上偏移量 
    },
    DEFAULT_COLOR: 'rgba(50, 205, 50, 0.3)' // 預設顏色
  },

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
        top: ${TextHighlight.CONFIG.FIXED_OFFSET.TOP}px; /* 使用配置的固定偏移量 */
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
      if (text.length > 1000) {
        const visibleStart = Math.max(0, index - 500);
        const visibleEnd = Math.min(text.length, index + 500);
        const visibleText = text.substring(visibleStart, visibleEnd);
        if (!visibleText.includes(matchedText)) {
          return null;
        }
      }

      const cacheKey = `${index}-${matchedText}`;
      if (this.cache.lastText === text && this.cache.positions.has(cacheKey)) {
        return this.cache.positions.get(cacheKey);
      }

      if (!this.cache.div) {
        this.cache.div = document.createElement('div');
        this.cache.div.style.cssText = `
          position: absolute;
          visibility: hidden;
          white-space: pre-wrap;
          width: ${textArea.clientWidth}px;
          font: ${styles.font};
          line-height: ${styles.lineHeight}px;
          padding: ${styles.paddingTop}px ${styles.paddingLeft}px;
          border: ${styles.border}px solid transparent;
          box-sizing: border-box;
          margin: 0;
          overflow: hidden;
          background: none;
          pointer-events: none;
          top: 0;
          left: 0;
          transform: none;
          max-height: ${textArea.offsetHeight}px;
          height: ${textArea.offsetHeight}px;
        `;
        textArea.parentElement.appendChild(this.cache.div);
      }

      if (this.cache.lastText !== text) {
        this.cache.div.textContent = text;
        this.cache.lastText = text;
        this.cache.positions.clear();
      }

      let range = null;

      try {
        range = document.createRange();
        const textNode = this.cache.div.firstChild;
        if (!textNode) {
          return null;
        }

        range.setStart(textNode, index);
        range.setEnd(textNode, index + matchedText.length);

        const rects = range.getClientRects();
        if (rects.length === 0) {
          return null;
        }

        const rect = rects[0];
        const divRect = this.cache.div.getBoundingClientRect();
        const textAreaRect = textArea.getBoundingClientRect();

        const position = {
          top: rect.top - divRect.top + styles.paddingTop,
          left: rect.left - divRect.left + styles.paddingLeft + TextHighlight.CONFIG.FIXED_OFFSET.LEFT, // 使用配置的固定偏移量
          width: rect.width,
          originalTop: rect.top - divRect.top + styles.paddingTop
        };

        this.cache.positions.set(cacheKey, position);

        return position;
      } catch (error) {
        console.error('計算位置時發生錯誤:', error);
        return null;
      } finally {
        if (range) {
          range.detach();
        }
      }
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
      this.setupInputEvents();
    },

    /**
     * 設置文本區域事件
     */
    setupTextAreaEvents() {
      const textArea = TextHighlight.DOMManager.elements.textArea;
      if (!textArea) return;
      
      // 保留原有的滾動事件處理
      textArea.addEventListener('scroll', () => {
        requestAnimationFrame(() => {
          TextHighlight.DOMManager.updateHighlightsVisibility();
        });
      });

      // 使用 requestAnimationFrame 來做輪詢
      let lastValue = textArea.value;
      let rafId;

      function checkValue() {
        // 檢查文字是否變化
        if (textArea.value !== lastValue) {
          lastValue = textArea.value;
          TextHighlight.updateHighlights();
        }
        // 請求下一次檢查
        rafId = requestAnimationFrame(checkValue);
      }
      
      checkValue();

      // 清理函數（在需要時調用）
      this.cleanup = () => {
        cancelAnimationFrame(rafId);
      };
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
    },

    /**
     * 設置輸入事件監聽
     */
    setupInputEvents() {
      const textArea = TextHighlight.DOMManager.elements.textArea;
      if (!textArea) return;
      
      // 監聽輸入事件
      textArea.addEventListener('input', () => {
        requestAnimationFrame(() => {
          TextHighlight.updateHighlights();
        });
      });

      // 監聽 compositionend 事件（處理中文輸入）
      textArea.addEventListener('compositionend', () => {
        requestAnimationFrame(() => {
          TextHighlight.updateHighlights();
        });
      });
    }
  },

  // 要高亮的文字陣列
  targetWords: [],

  // 儲存顏色設置
  wordColors: {},

  // 修改 setTargetWords 方法
  setTargetWords(words, colors = {}) {
    // 過濾空白文字
    this.targetWords = words.filter(word => word.trim());
    
    // 保存顏色設置到 storage
    if (Object.keys(colors).length > 0) {
      this.wordColors = colors;
      chrome.storage.local.set({ highlightColors: colors }, () => {
        console.log('顏色設置已保存');
      });
    }

    // 清除位置計算的快取，確保新的關鍵字能正確計算位置
    this.PositionCalculator.clearCache();
    
    // 強制更新高亮
    this.forceUpdate();
  },

  // 初始化時載入顏色設置
  initialize() {
    console.log('初始化文字標示功能');
    
    // 使用 Promise 確保初始化順序
    return new Promise((resolve) => {
      this.DOMManager.initialize();
      this.EventHandler.initialize();
      
      // 從 storage 載入顏色設置
      chrome.storage.local.get(['highlightColors'], (result) => {
        if (result.highlightColors) {
          this.wordColors = result.highlightColors;
          console.log('已載入顏色設置:', this.wordColors);
        }
        
        // 確保 DOM 結構初始化
        if (!this.DOMManager.elements.container) {
          this.DOMManager.setupHighlightContainer();
        }

        // 等待 DOM 完全渲染
        requestAnimationFrame(() => {
          // 強制執行第一次更新
          this.forceUpdate();
          
          // 設置定期檢查
          this.startPeriodicCheck();
          
          resolve();
        });
      });
    });
  },

  // 添加定期檢查機制
  startPeriodicCheck() {
    // 在前幾秒多次檢查
    const checkTimes = [100, 500, 1000, 2000];
    checkTimes.forEach(delay => {
      setTimeout(() => {
        this.checkAndForceUpdate();
      }, delay);
    });
  },

  // 添加檢查和強制更新方法
  checkAndForceUpdate() {
    const { textArea, container } = this.DOMManager.elements;
    if (!textArea || !container) return;

    // 檢查是否有有效的高亮元素
    const highlights = this.DOMManager.elements.highlights;
    const hasValidHighlights = highlights.some(h => 
      h.style.display !== 'none' && 
      parseFloat(h.style.width) > 0
    );

    if (!hasValidHighlights && this.targetWords.length > 0) {
      console.log('未檢測到有效高亮，強制更新');
      this.forceUpdate();
    }
  },

  // 修改 forceUpdate 方法
  forceUpdate() {
    // 清除所有快取
    this.PositionCalculator.clearCache();
    this._lastText = null;
    this._lastScrollTop = null;
    
    // 使用 requestAnimationFrame 確保在下一個繪製幀執行更新
    requestAnimationFrame(() => {
      this.DOMManager.clearHighlights();
      this.updateHighlights();
      
      // 再次檢查高亮是否正確顯示
      setTimeout(() => {
        const highlights = this.DOMManager.elements.highlights;
        if (highlights.length === 0 && this.targetWords.length > 0) {
          console.log('高亮未正確顯示，重試更新');
          this.updateHighlights();
        }
      }, 100);
    });
  },

  // 修改取得顏色的方法
  getColorForWord(word) {
    return this.wordColors[word] || this.CONFIG.DEFAULT_COLOR;
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
   * 更新所有標示
   */
  updateHighlights() {
    const { textArea, container } = this.DOMManager.elements;
    if (!textArea || !container) {
      console.log('更新高亮失敗：缺少必要元素');
      return;
    }

    if (this._rafId) {
      cancelAnimationFrame(this._rafId);
    }

    this._rafId = requestAnimationFrame(() => {
      const text = textArea.value;
      const styles = this.PositionCalculator.getTextAreaStyles(textArea);
      
      if (this._lastText === text && this._lastScrollTop === textArea.scrollTop) {
        return;
      }
      
      this._lastText = text;
      this._lastScrollTop = textArea.scrollTop;

      this.DOMManager.clearHighlights();
      const fragment = document.createDocumentFragment();
      let highlightCount = 0;

      // 批次處理所有目標文字
      this.targetWords.forEach((targetWord, wordIndex) => {
        if (!targetWord.trim()) return;

        // 使用保存的顏色或預設顏色
        const color = this.getColorForWord(targetWord);
        
        try {
          if (targetWord.startsWith('/') && targetWord.endsWith('/')) {
            // 正則表達式處理
            const regexStr = targetWord.slice(1, -1);
            const matches = Array.from(text.matchAll(RegexHelper.createRegex(targetWord)));

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
                  const highlight = this.Renderer.createHighlight(
                    position,
                    position.width,
                    styles.lineHeight,
                    color
                  );
                  
                  if (highlight) {
                    fragment.appendChild(highlight);
                    this.DOMManager.elements.highlights.push(highlight);
                    highlightCount++;
                  }
                }
              }
            }
          } else {
            // 使用普通文字匹配
            const positions = [];
            let index = 0;
            // 改用 RegexHelper 來處理普通文字匹配
            const regex = RegexHelper.createRegex(targetWord);
            const matches = Array.from(text.matchAll(regex));
            matches.forEach(match => {
              const position = this.PositionCalculator.calculatePosition(
                textArea, 
                match.index, 
                text, 
                match[0], 
                styles
              );
              if (position) {
                const highlight = this.Renderer.createHighlight(
                  position,
                  position.width,
                  styles.lineHeight,
                  color
                );
                if (highlight) {
                  fragment.appendChild(highlight);
                  this.DOMManager.elements.highlights.push(highlight);
                  highlightCount++;
                }
              }
            });
          }
        } catch (error) {
          console.error(`處理文字 "${targetWord}" 時發生錯誤:`, error);
        }
      });

      container.appendChild(fragment);
      this.DOMManager.updateHighlightsVisibility();
    });
  },

  // 添加新的方法來新顏色映射
  setWordColors(colors) {
    this.wordColors = colors;
  }
};

// 將模組暴露給全局作用域
window.TextHighlight = TextHighlight; 