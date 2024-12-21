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
    DEFAULT_COLOR: 'rgba(50, 205, 50, 0.3)', // 預設顏色
    CACHE_CLEANUP_INTERVAL: 60000 // 快取清理間隔（毫秒）
  },

  /**
   * 滾動處理工具 - 用於處理滾動相關的邏輯
   */
  ScrollHelper: {
    /**
     * 創建防抖的滾動處理器
     * @param {Function} callback - 滾動時要執行的回調函數
     * @param {Object} options - 配置選項
     * @param {boolean} [options.passive=true] - 是否使用 passive 事件
     * @returns {Function} 處理滾動的函數
     */
    createScrollHandler(callback, options = { passive: true }) {
      let ticking = false;
      return function scrollHandler(event) {
        if (!ticking) {
          ticking = true;
          callback(event);
          ticking = false;
        }
      };
    },

    /**
     * 綁定滾動事件到元素
     * @param {HTMLElement} element - 要綁定事件的元素
     * @param {Function} callback - 滾動時要執行的回調函數
     * @param {Object} options - 配置選項
     * @returns {Function} 用於移除事件監聽的函數
     */
    bindScrollEvent(element, callback, options = { passive: true }) {
      const handler = this.createScrollHandler(callback, options);
      element.addEventListener('scroll', handler, options);
      return () => element.removeEventListener('scroll', handler);
    }
  },

  /**
   * 全局位置快取管理器 - 用於共享位置計算結果
   */
  GlobalPositionCache: {
    cache: new Map(),
    textAreaContent: '',
    lastCleanup: Date.now(),

    /**
     * 獲取快取的位置
     * @param {string} text - 完整的文本內容
     * @param {number} index - 匹配的起始位置
     * @param {string} matchedText - 匹配的文字
     * @returns {Object|null} - 快取的位置信息或 null
     */
    get(text, index, matchedText) {
      if (this.textAreaContent !== text) {
        this.clear();
        this.textAreaContent = text;
        return null;
      }

      const key = `${index}-${matchedText}`;
      return this.cache.get(key) || null;
    },

    /**
     * 設置位置快取
     * @param {string} text - 完整的文本內容
     * @param {number} index - 匹配的起始位置
     * @param {string} matchedText - 匹配的文字
     * @param {Object} position - 位置信息
     */
    set(text, index, matchedText, position) {
      const key = `${index}-${matchedText}`;
      this.cache.set(key, position);

      // 定期清理快取
      const now = Date.now();
      if (now - this.lastCleanup > TextHighlight.CONFIG.CACHE_CLEANUP_INTERVAL) {
        this.cleanup();
        this.lastCleanup = now;
      }
    },

    /**
     * 清理快取
     */
    clear() {
      this.cache.clear();
      this.textAreaContent = '';
    },

    /**
     * 清理過期的快取項目
     */
    cleanup() {
      // 如果快取大小超過 1000 項，清理一半
      if (this.cache.size > 1000) {
        const entries = Array.from(this.cache.entries());
        const halfSize = Math.floor(entries.length / 2);
        this.cache = new Map(entries.slice(halfSize));
      }
    }
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
      highlightPositions: [], // 儲存所有高亮框的絕對位置
      virtualScrollData: {    // 新增：虛擬滾動相關數據
        allPositions: [],     // 所有位置的快取
        visibleHighlights: new Map(), // 當前可見的高亮元素
        lastScrollTop: 0,     // 上次滾動位置
        bufferSize: 200,      // 緩衝區大小（像素）
      }
    },

    initialize() {
      this.setupHighlightContainer();
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
     * 更新高亮框的可見性和位置
     */
    updateHighlightsVisibility() {
      const { textArea, container, virtualScrollData } = this.elements;
      if (!textArea || !container) return;

      const scrollTop = textArea.scrollTop;
      const visibleHeight = textArea.clientHeight;
      const totalHeight = textArea.scrollHeight;
      
      // 計算可見區域的範圍（加上上下緩衝區）
      const bufferSize = this.elements.virtualScrollData.bufferSize;
      const visibleTop = Math.max(0, scrollTop - bufferSize);
      const visibleBottom = Math.min(totalHeight, scrollTop + visibleHeight + bufferSize);

      // 使用共享的虛擬滾動管理器
      TextHighlight.SharedVirtualScroll.updateVirtualView({
        allPositions: virtualScrollData.allPositions,
        visibleHighlights: virtualScrollData.visibleHighlights,
        visibleTop,
        visibleBottom,
        scrollTop,
        createHighlight: (pos) => TextHighlight.Renderer.createHighlight(
          pos.position,
          pos.position.width,
          pos.lineHeight || this.getTextAreaStyles(textArea).lineHeight,
          pos.color
        ),
        container,
        highlightClass: 'text-highlight'
      });
    },
  },

  /**
   * 位置計算子模組 - 處理文字位置的計算
   */
  PositionCalculator: {
    cache: {
      div: null,
      lastText: '',
      positions: new Map(),
    },

    /**
     * 快速計算行號
     * @param {string} text 完整文本
     * @param {number} index 位置索引
     * @returns {number} 行號
     */
    getLineNumber(text, index) {
      return (text.slice(0, index).match(/\n/g) || []).length;
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
     * 計算位置（混合策略）
     */
    calculatePosition(textArea, index, text, matchedText, styles) {
      // 檢查快取
      const cachedPosition = TextHighlight.GlobalPositionCache.get(text, index, matchedText);
      if (cachedPosition) {
        return cachedPosition;
      }

      // 確保 div 存在
      if (!this.cache.div) {
        this.cache.div = document.createElement('div');
        this.cache.div.style.cssText = `
          position: absolute;
          visibility: hidden;
          white-space: pre-wrap;
          width: ${textArea.offsetWidth}px;
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
        
        // 確保寬度完全匹配
        const actualWidth = window.getComputedStyle(textArea).width;
        this.cache.div.style.width = actualWidth;
      }

      // 更新內容（如果需要）
      if (this.cache.lastText !== text) {
        this.cache.div.textContent = text;
        this.cache.lastText = text;
        this.cache.positions.clear();
      }

      let position = null;
      try {
        // 創建 range 並計算位置
        const range = document.createRange();
        const textNode = this.cache.div.firstChild;
        if (!textNode) {
          console.error('[PositionCalculator] 找不到文字節點');
          return null;
        }

        range.setStart(textNode, index);
        range.setEnd(textNode, index + matchedText.length);

        const rects = range.getClientRects();
        if (rects.length === 0) {
          console.error('[PositionCalculator] 無法獲取文字範圍的位置信息');
          return null;
        }

        const rect = rects[0];
        const divRect = this.cache.div.getBoundingClientRect();

        position = {
          top: rect.top - divRect.top + styles.paddingTop,
          left: rect.left - divRect.left + styles.paddingLeft + TextHighlight.CONFIG.FIXED_OFFSET.LEFT,
          width: rect.width,
          originalTop: rect.top - divRect.top + styles.paddingTop
        };

        // 存入快取
        TextHighlight.GlobalPositionCache.set(text, index, matchedText, position);

      } catch (error) {
        console.error('[PositionCalculator] 計算位置時發生錯誤:', error);
        return null;
      }

      return position;
    },

    // 清理快取的方法
    clearCache() {
      if (this.cache.div) {
        this.cache.div.remove();
        this.cache.div = null;
      }
      this.cache.lastText = '';
      this.cache.positions.clear();
      
      // 同時清理全局快取
      TextHighlight.GlobalPositionCache.clear();
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
      
      // 使用 ScrollHelper 處理滾動事件
      const removeScrollListener = TextHighlight.ScrollHelper.bindScrollEvent(
        textArea,
        () => TextHighlight.DOMManager.updateHighlightsVisibility()
      );

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
        removeScrollListener();
      };
    },

    /**
     * 設置大小變化觀察器
     */
    setupResizeObserver() {
      let resizeTimeout;
      let retryCount = 0;
      const MAX_RETRIES = 3;

      const updateAfterResize = () => {
        const textArea = TextHighlight.DOMManager.elements.textArea;
        const container = TextHighlight.DOMManager.elements.container;
        
        if (!textArea || !container) {
          console.error('[EventHandler] 找不到必要元素');
          return;
        }
        
        // 獲取新的尺寸
        const actualWidth = window.getComputedStyle(textArea).width;
        const actualHeight = window.getComputedStyle(textArea).height;
        const offsetWidth = textArea.offsetWidth;
        const offsetHeight = textArea.offsetHeight;
        
        // 更新外層容器（text-highlight-outer-container）的尺寸
        const outerContainer = container.parentElement;
        if (outerContainer) {
          outerContainer.style.width = `${offsetWidth}px`;
          outerContainer.style.height = `${offsetHeight}px`;
        }
        
        // 更新內層容器的尺寸
        container.style.width = '100%';
        container.style.height = `${offsetHeight}px`;
        container.style.maxHeight = `${offsetHeight}px`;
        
        // 重新初始化測量用 div
        if (TextHighlight.PositionCalculator.cache.div) {
          TextHighlight.PositionCalculator.cache.div.remove();
          TextHighlight.PositionCalculator.cache.div = null;
          TextHighlight.PositionCalculator.cache.lastText = '';
          TextHighlight.PositionCalculator.cache.positions.clear();
        }
        
        // 清除所有現有的高亮
        TextHighlight.DOMManager.clearHighlights();

        const tryUpdate = () => {
          // 強制更新所有高亮
          TextHighlight.forceUpdate();
          
          // 檢查是否需要重試
          setTimeout(() => {
            const highlights = TextHighlight.DOMManager.elements.highlights;
            if (highlights.length === 0 && TextHighlight.targetWords.length > 0 && retryCount < MAX_RETRIES) {
              console.error('[EventHandler] 高亮更新失敗，準備重試');
              retryCount++;
              tryUpdate();
            } else {
              retryCount = 0;
            }
          }, 100);
        };

        // 確保 DOM 完全更新後再開始嘗試更新
        requestAnimationFrame(() => {
          tryUpdate();
        });
      };

      const resizeObserver = new ResizeObserver(() => {
        // 清除之前的延遲執行
        if (resizeTimeout) {
          clearTimeout(resizeTimeout);
        }
        
        // 延遲執行更新，避免過於頻繁的更新
        resizeTimeout = setTimeout(() => {
          updateAfterResize();
        }, 100);
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
    this.GlobalPositionCache.clear();  // 清理全局快取
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
      console.error('[TextHighlight] 更新高亮失敗：缺少必要元素');
      return;
    }

    const text = textArea.value;
    const styles = this.PositionCalculator.getTextAreaStyles(textArea);
    
    if (this._lastText === text && this._lastScrollTop === textArea.scrollTop) {
      return;
    }
    
    this._lastText = text;
    this._lastScrollTop = textArea.scrollTop;

    // 收集所有位置信息
    const allPositions = [];
    this.targetWords.forEach((targetWord) => {
      if (!targetWord.trim()) return;

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
                allPositions.push({
                  position,
                  color: this.getColorForWord(targetWord),
                  targetWord,
                  lineHeight: styles.lineHeight
                });
              }
            }
          }
        } else {
          // 普通文字匹配
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
              allPositions.push({
                position,
                color: this.getColorForWord(targetWord),
                targetWord,
                lineHeight: styles.lineHeight
              });
            }
          });
        }
      } catch (error) {
        console.error(`[TextHighlight] 處理文字 "${targetWord}" 時發生錯誤:`, error);
      }
    });

    // 更新虛擬滾動數據
    this.DOMManager.elements.virtualScrollData.allPositions = allPositions;
    
    // 觸發可見性更新
    this.DOMManager.updateHighlightsVisibility();
  },

  // 添加新的方法來新顏色射
  setWordColors(colors) {
    this.wordColors = colors;
  },

  /**
   * 共享的虛擬滾動管理器 - 處理所有虛擬滾動相關的邏輯
   */
  SharedVirtualScroll: {
    /**
     * 更新虛擬滾動視圖
     * @param {Object} params 參數對象
     * @param {Array} params.allPositions 所有位置信息
     * @param {Map} params.visibleHighlights 可見的高亮元素 Map
     * @param {number} params.visibleTop 可見區域頂部
     * @param {number} params.visibleBottom 可見區域底部
     * @param {number} params.scrollTop 滾動位置
     * @param {Function} params.createHighlight 創建高亮元素的函數
     * @param {HTMLElement} params.container 容器元素
     * @param {string} [params.highlightClass='text-highlight'] 高亮元素的 class
     * @returns {Map} 更新後的可見高亮元素 Map
     */
    updateVirtualView({
      allPositions,
      visibleHighlights,
      visibleTop,
      visibleBottom,
      scrollTop,
      createHighlight,
      container,
      highlightClass = 'text-highlight'
    }) {
      // 記錄現有的高亮元素
      const existingHighlights = new Map(visibleHighlights);
      visibleHighlights.clear();

      // 找出需要顯示的位置
      const visiblePositions = allPositions.filter(pos => {
        const top = pos.position ? pos.position.top : pos.top;
        return top >= visibleTop && top <= visibleBottom;
      });

      // 更新或創建可見範圍內的高亮
      visiblePositions.forEach(pos => {
        const top = pos.position ? pos.position.top : pos.top;
        const left = pos.position ? pos.position.left : pos.left;
        const text = pos.targetWord || pos.text;
        
        const key = `${top}-${left}-${text}`;
        let highlight = existingHighlights.get(key);

        if (highlight) {
          // 重用現有元素
          existingHighlights.delete(key);
          highlight.style.transform = `translate3d(0, ${-scrollTop}px, 0)`;
          highlight.style.display = 'block';
        } else {
          // 創建新元素
          highlight = createHighlight(pos);
          highlight.className = highlightClass;
          highlight.style.transform = `translate3d(0, ${-scrollTop}px, 0)`;
          container.appendChild(highlight);
        }

        visibleHighlights.set(key, highlight);
      });

      // 隱藏不再可見的元素
      existingHighlights.forEach(highlight => {
        highlight.style.display = 'none';
      });

      return visibleHighlights;
    }
  }
};

// 將模組暴露給全局作用域
window.TextHighlight = TextHighlight; 