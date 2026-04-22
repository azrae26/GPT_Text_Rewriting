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
 * - 動態容器定位，精確對齊文字
 * 
 * 🔢 關鍵計算公式：
 * - 原始位置 = rect.top - divRect.top
 * - 修正位置 = 原始位置 - 文字自然偏移 (精確對齊文字)
 * - 最終位置 = 修正位置 - textArea.scrollTop
 * - 容器偏移 = 動態計算（與 textarea 完全對齊）
 */
const TextHighlight = {
  /**
   * 配置常數
   */
  CONFIG: {
    FIXED_OFFSET: {
      LEFT: 0,  // 固定左偏移量
      TOP: 0     // 固定上偏移量，調整為減少垂直偏移
    },
    DEFAULT_COLOR: 'rgba(50, 205, 50, 0.3)', // 預設顏色
    CACHE_CLEANUP_INTERVAL: 60000 // 快取清理間隔（毫秒）
  },

  /**
   * 滾動處理工具 - 用於處理滾動相關的邏輯
   */
  ScrollHelper: {
    /**
     * 創建高性能滾動處理器（移除節流限制）
     * @param {Function} callback - 滾動時要執行的回調函數
     * @param {Object} options - 配置選項
     * @param {boolean} [options.passive=true] - 是否使用 passive 事件
     * @returns {Function} 處理滾動的函數
     */
    createScrollHandler(callback, options = { passive: true }) {
      // 🚀 移除ticking節流機制，直接執行callback，提升跟隨響應速度
      return function scrollHandler(event) {
        callback(event);
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
      
      // 獲取 textarea 的計算樣式，動態抓取所有邊距值
      const textAreaStyles = window.getComputedStyle(textArea);
      const textAreaRect = textArea.getBoundingClientRect();
      const parentRect = textArea.parentElement.getBoundingClientRect();
      
      // 計算 textarea 相對於父元素的精確位置（包含所有邊距）
      const marginTop = parseFloat(textAreaStyles.marginTop) || 0;
      const marginLeft = parseFloat(textAreaStyles.marginLeft) || 0;
      const borderTop = parseFloat(textAreaStyles.borderTopWidth) || 0;
      const borderLeft = parseFloat(textAreaStyles.borderLeftWidth) || 0;
      const paddingTop = parseFloat(textAreaStyles.paddingTop) || 0;
      const paddingLeft = parseFloat(textAreaStyles.paddingLeft) || 0;
      
      // 計算容器應該的精確位置（與 textarea 的內容區域對齊）
      const containerTop = textAreaRect.top - parentRect.top;
      const containerLeft = textAreaRect.left - parentRect.left;
      
      // 設置外層容器樣式，使用動態計算的位置
      outerContainer.style.cssText = `
        position: absolute;
        top: ${containerTop}px;
        left: ${containerLeft - 4}px;
        width: ${textArea.offsetWidth + 4}px;
        height: ${textArea.offsetHeight}px;
        pointer-events: none;
        z-index: 1;
        overflow: hidden;
      `;

      // 設置內層容器樣式
      container.style.cssText = `
        position: absolute;
        top: 0;
        left: 4px;
        width: 100%;
        height: 100%;
        max-height: ${textArea.offsetHeight}px;
        pointer-events: none;
        overflow: hidden;
      `;

      // 將內層容器添加到外層容器
      outerContainer.appendChild(container);

      // 將外層容器插入到 textarea 父元素的上一層
      const textAreaParent = textArea.parentElement;
      const textAreaGrandParent = textAreaParent?.parentElement;
      if (textAreaGrandParent) {
        textAreaGrandParent.style.position = 'relative';
        textAreaGrandParent.insertBefore(outerContainer, textAreaParent);
        
        // 設置 textarea 的 z-index 為較高值，確保文字在高亮之上
        textArea.style.position = 'relative';
        textArea.style.zIndex = '10';
        textArea.style.background = 'transparent';
        
        this.elements.container = container;
        this.elements.textArea = textArea;
      }
    },

    /**
     * 清除所有標示
     */
    clearHighlights() {
      // 🔧 加強清理機制：直接清理容器中的所有高亮元素
      if (this.elements.container) {
        // 清理所有類型的高亮元素
        const allHighlights = this.elements.container.querySelectorAll('.text-highlight, .text-highlight-border');
        allHighlights.forEach(element => element.remove());
      }
      
      // 清理數組中記錄的元素（保險起見）
      this.elements.highlights.forEach(element => {
        if (element.parentNode) {
          element.remove();
        }
      });
      this.elements.highlights = [];
      
      // 清理虛擬滾動數據
      if (this.elements.virtualScrollData) {
        this.elements.virtualScrollData.allPositions = [];
        this.elements.virtualScrollData.visibleHighlights.clear();
      }
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
        createHighlight: (pos) => {
          // 根據樣式類型選擇不同的創建方法
          if (pos.style === 'border') {
            return TextHighlight.Renderer.createBorderHighlight(
              pos.position,
              pos.position.width,
              pos.lineHeight || this.getTextAreaStyles(textArea).lineHeight,
              pos.color
            );
          } else {
            return TextHighlight.Renderer.createHighlight(
              pos.position,
              pos.position.width,
              pos.lineHeight || this.getTextAreaStyles(textArea).lineHeight,
              pos.color
            );
          }
        },
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
      textNaturalOffset: null, // 新增：文字自然偏移緩存
      scrollHeightRatio: 1,    // textarea.scrollHeight / div.scrollHeight 縮放比（修正底部偏移）
      lineInfo: {
        lastLineCount: 0,
        lastLinePositions: [], // 儲存每行的起始位置
        modifiedLineIndex: -1  // 最後修改的行號
      }
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
     * 分析文本變化
     * @param {string} oldText 舊文本
     * @param {string} newText 新文本
     * @returns {Object} 變化信息
     */
    analyzeTextChange(oldText, newText) {
      const oldLines = oldText.split('\n');
      const newLines = newText.split('\n');
      
      // 找出第一個不同的行
      let firstDiffIndex = 0;
      while (firstDiffIndex < oldLines.length && 
             firstDiffIndex < newLines.length && 
             oldLines[firstDiffIndex] === newLines[firstDiffIndex]) {
        firstDiffIndex++;
      }

      // 計算行數變化
      const lineDiff = newLines.length - oldLines.length;

      return {
        modifiedLineIndex: firstDiffIndex,
        lineDiff,
        isMultiLineChange: lineDiff !== 0,
        affectedLines: {
          start: firstDiffIndex,
          end: Math.max(oldLines.length, newLines.length)
        }
      };
    },

    /**
     * 更新位置信息
     * @param {Object} change 變化信息
     * @param {Array} positions 位置信息數組
     */
    updatePositionsAfterChange(change, positions, newText) {
      const { modifiedLineIndex, lineDiff, isMultiLineChange } = change;
      
      // 預先計算位移量（對於多行變化）
      let offsetY = 0;
      if (isMultiLineChange && lineDiff !== 0) {
        offsetY = lineDiff * this.baseLineHeight;
      }
      
      const updatedPositions = positions.map(pos => {
        const posLineIndex = this.getLineNumber(newText, pos.index);
        
        if (posLineIndex < modifiedLineIndex) {
          return pos;
        } 
        else if (posLineIndex === modifiedLineIndex) {
          return {
            ...pos,
            needsRecalculation: true
          };
        } 
        else {
          if (isMultiLineChange && offsetY !== 0) {
            return {
              ...pos,
              top: pos.top + offsetY,
              originalTop: pos.originalTop + offsetY
            };
          } else {
            return pos;
          }
        }
      });

      return updatedPositions;
    },

    // 新增：計算特定位置的行高
    getLineHeight(index, text) {
      const lineStart = text.lastIndexOf('\n', index) + 1;
      const lineEnd = text.indexOf('\n', index);
      const line = text.slice(lineStart, lineEnd === -1 ? text.length : lineEnd);
      
      // 考慮文字換行
      const wrappedLines = Math.ceil(line.length / this.averageCharsPerLine);
      return this.baseLineHeight * wrappedLines;
    },

    /**
     * 計算位置（優化版本）
     */
    calculatePosition(textArea, index, text, matchedText, styles) {
      // 檢查快取
      const cachedPosition = TextHighlight.GlobalPositionCache.get(text, index, matchedText);
      if (cachedPosition && !cachedPosition.needsRecalculation) {
        return cachedPosition;
      }

      // 確保 div 存在
      if (!this.cache.div) {
        this.cache.div = document.createElement('div');
        
        // 獲取 textarea 的計算樣式和位置，使用和容器相同的定位邏輯
        const textAreaStyles = window.getComputedStyle(textArea);
        const textAreaRect = textArea.getBoundingClientRect();
        const parentRect = textArea.parentElement.getBoundingClientRect();
        
        // 計算測量div應該的精確位置（與 textarea 完全對齊）
        const divTop = textAreaRect.top - parentRect.top;
        const divLeft = textAreaRect.left - parentRect.left;
        
        this.cache.div.style.cssText = `
          position: absolute;
          visibility: hidden;
          white-space: pre-wrap;
          width: ${textArea.offsetWidth}px;
          font: ${styles.font};
          line-height: ${styles.lineHeight}px;
          border: ${styles.border}px solid transparent;
          box-sizing: border-box;
          margin: 0;
          padding: 0;
          overflow: hidden;
          background: none;
          pointer-events: none;
          top: ${divTop}px;
          left: ${divLeft}px;
          transform: none;
          max-height: ${textArea.offsetHeight}px;
          height: ${textArea.offsetHeight}px;
        `;
        textArea.parentElement.appendChild(this.cache.div);
        
        const actualWidth = window.getComputedStyle(textArea).width;
        this.cache.div.style.width = actualWidth;

        // 計算平均字符寬度
        this.averageCharsPerLine = Math.floor(textArea.clientWidth / (parseFloat(styles.font) * 1.2));
        this.baseLineHeight = parseFloat(styles.lineHeight);
      }

      // 強制更新內容並驗證同步
      let needsUpdate = false;
      
      if (this.cache.lastText !== text) {
        needsUpdate = true;
      } else {
        // 即使 lastText 相同，也要驗證 DOM 節點的實際內容
        const actualText = this.cache.div.textContent || '';
        if (actualText !== text) {
          needsUpdate = true;
        }
      }
      
      if (needsUpdate) {
        // Chrome 在 div(white-space:pre-wrap) 結尾有 \n 時不計入 scrollHeight，
        // 但 textarea 會增加；補 zero-width space 讓兩者一致
        const divContent = text.endsWith('\n') ? text + '\u200b' : text;

        // 強制清空並重新設置，確保同步
        this.cache.div.textContent = '';
        // 強制 DOM 同步
        this.cache.div.offsetHeight; // 觸發重排
        this.cache.div.textContent = divContent;
        
        // 立即驗證更新結果（與 divContent 比對，而非 text）
        const verifyText = this.cache.div.textContent || '';
        if (verifyText.length !== divContent.length) {
          // 重新創建 div 作為最後手段
          this.cache.div.remove();
          this.cache.div = document.createElement('div');
          
          // 重新計算精確位置（與上面邏輯保持一致）
          const textAreaStyles = window.getComputedStyle(textArea);
          const textAreaRect = textArea.getBoundingClientRect();
          const parentRect = textArea.parentElement.getBoundingClientRect();
          const divTop = textAreaRect.top - parentRect.top;
          const divLeft = textAreaRect.left - parentRect.left;
          
          this.cache.div.style.cssText = `
            position: absolute;
            visibility: hidden;
            white-space: pre-wrap;
            width: ${textArea.offsetWidth}px;
            font: ${styles.font};
            line-height: ${styles.lineHeight}px;
            border: ${styles.border}px solid transparent;
            box-sizing: border-box;
            margin: 0;
            padding: 0;
            overflow: hidden;
            background: none;
            pointer-events: none;
            top: ${divTop}px;
            left: ${divLeft}px;
            transform: none;
            max-height: ${textArea.offsetHeight}px;
            height: ${textArea.offsetHeight}px;
          `;
          textArea.parentElement.appendChild(this.cache.div);
          this.cache.div.textContent = divContent;
        }
        
        this.cache.lastText = text;
        this.cache.positions.clear();

        // 計算 div 與 textarea 的 scrollHeight 縮放比，修正底部位置偏移
        const divScrollH = this.cache.div.scrollHeight;
        const taScrollH = textArea.scrollHeight;
        this.cache.scrollHeightRatio = (divScrollH > 0 && taScrollH > 0) ? taScrollH / divScrollH : 1;
        
        // 🎯 計算文字的自然偏移量（只需計算一次）
        if (this.cache.textNaturalOffset === null && text.length > 0) {
          try {
            const range = document.createRange();
            const textNode = this.cache.div.firstChild;
            if (textNode && textNode.textContent.length > 0) {
              range.setStart(textNode, 0);
              range.setEnd(textNode, 1);
              
              const firstCharRect = range.getBoundingClientRect();
              const divRect = this.cache.div.getBoundingClientRect();
              this.cache.textNaturalOffset = firstCharRect.top - divRect.top;
            }
          } catch (offsetError) {
            LogUtils.warn('計算文字自然偏移失敗，使用0:', offsetError);
            this.cache.textNaturalOffset = 0;
          }
        }
      }

      try {
        const range = document.createRange();
        const textNode = this.cache.div.firstChild;
        if (!textNode) {
          return null;
        }

        // 邊界檢查：確保索引不超過文本節點的長度
        const nodeLength = textNode.textContent ? textNode.textContent.length : 0;
        if (index < 0 || index >= nodeLength) {
          return null;
        }
        
        // 檢查結束位置
        const endIndex = index + matchedText.length;
        if (endIndex > nodeLength) {
          return null;
        }

        range.setStart(textNode, index);
        range.setEnd(textNode, endIndex);

        const rects = range.getClientRects();
        if (rects.length === 0) {
          return null;
        }

        const positions = [];
        
        // 合併相鄰的矩形
        let currentRect = null;
        
        for (let i = 0; i < rects.length; i++) {
          const rect = rects[i];
          
          if (!currentRect) {
            // 第一個矩形
            currentRect = {
              top: rect.top,
              left: rect.left,
              width: rect.width,
              height: rect.height,
              bottom: rect.bottom
            };
          } else if (Math.abs(rect.top - currentRect.top) < 1) {
            // 如果在同一行，合併矩形
            currentRect.width = (rect.left + rect.width) - currentRect.left;
          } else {
            // 不在同一行，保存當前矩形並開始新的矩形
            const rawTop = currentRect.top - this.cache.div.getBoundingClientRect().top;
            const calculatedTop = (rawTop - (this.cache.textNaturalOffset || 0)) * (this.cache.scrollHeightRatio || 1);
            const calculatedLeft = currentRect.left - this.cache.div.getBoundingClientRect().left;
            
            positions.push({
              top: calculatedTop,
              left: calculatedLeft,
              width: currentRect.width,
              originalTop: calculatedTop,
              index,
              text: matchedText,
              needsRecalculation: false,
              isMultiLine: rects.length > 1,
              lineIndex: positions.length
            });
            
            currentRect = {
              top: rect.top,
              left: rect.left,
              width: rect.width,
              height: rect.height,
              bottom: rect.bottom
            };
          }
        }
        
        // 添加最後一個矩形
        if (currentRect) {
          const _divRect = this.cache.div.getBoundingClientRect();
          const rawTop = currentRect.top - _divRect.top;
          const calculatedTop = (rawTop - (this.cache.textNaturalOffset || 0)) * (this.cache.scrollHeightRatio || 1);
          const calculatedLeft = currentRect.left - _divRect.left;

          positions.push({
            top: calculatedTop,
            left: calculatedLeft,
            width: currentRect.width,
            originalTop: calculatedTop,
            index,
            text: matchedText,
            needsRecalculation: false,
            isMultiLine: rects.length > 1,
            lineIndex: positions.length
          });
        }

        // 存入快取
        this.cache.positions.set(`${index}-${matchedText}`, positions);
        TextHighlight.GlobalPositionCache.set(text, index, matchedText, positions);

        return positions;

      } catch (error) {
        return null;
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
      this.cache.textNaturalOffset = null; // 重置文字自然偏移
      this.cache.scrollHeightRatio = 1;    // 重置縮放比
      
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

      // 清理函數（在需要時調用）
      this.cleanup = () => {
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
          LogUtils.error('找不到必要元素');
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
          // 重新計算容器的精確位置（與resize後的textarea對齊）
          const textAreaRect = textArea.getBoundingClientRect();
          const parentRect = textArea.parentElement.getBoundingClientRect();
          const containerTop = textAreaRect.top - parentRect.top;
          const containerLeft = textAreaRect.left - parentRect.left;
          
          // 更新位置和尺寸
          outerContainer.style.top = `${containerTop}px`;
          outerContainer.style.left = `${containerLeft - 4}px`;
          outerContainer.style.width = `${offsetWidth + 4}px`;
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

        // 確保 DOM 完全更新後再開始嘗試更新
        let retryCount = 0;
        const maxRetries = 3;
        
        const tryUpdate = () => {
          if (retryCount >= maxRetries) {
            LogUtils.log('達到最大重試次數，停止更新');
            return;
          }
          
          retryCount++;
          const textArea = TextHighlight.DOMManager.elements.textArea;
          if (!textArea || !textArea.offsetParent) {
            LogUtils.log('文本區域未就緒，等待下次更新');
            return;
          }

          TextHighlight.forceUpdate();
        };

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
      
      let updateScheduled = false;
      
      const scheduleUpdate = () => {
        if (!updateScheduled) {
          updateScheduled = true;
          requestAnimationFrame(() => {
            TextHighlight.updateHighlights();
            updateScheduled = false;
          });
        }
      };

      // 監聽輸入事件
      textArea.addEventListener('input', scheduleUpdate);

      // 監聽 compositionend 事件
      textArea.addEventListener('compositionend', scheduleUpdate);
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

              chrome.storage.local.set({ highlightColors: colors });
    }

    // 清除位置計算的快取，確保新的關鍵字能正確計算位置
    this.PositionCalculator.clearCache();
    
    // 強制更新高亮
    this.forceUpdate();
  },

  // 初始化時載入顏色設置
  initialize() {
    LogUtils.log('初始化文字標示功能');
    
    // 使用 Promise 確保初始化順序
    return new Promise((resolve) => {
      this.DOMManager.initialize();
      this.EventHandler.initialize();
      
      // 從 storage 載入顏色設置
      chrome.storage.local.get(['highlightColors'], (result) => {
        if (result.highlightColors) {
          this.wordColors = result.highlightColors;
          LogUtils.log('已載入顏色設置:', this.wordColors);
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
      LogUtils.log('未檢測到有效高亮，強制更新');
      this.forceUpdate();
    }
  },

  // 修改 forceUpdate 方法
  forceUpdate() {
    // 清除所有快取
    this.PositionCalculator.clearCache();
    this.GlobalPositionCache.clear();
    this._lastText = null;
    this._lastScrollTop = null;
    
    // 直接執行更新
    this.DOMManager.clearHighlights();
    this.updateHighlights();
  },

  // 修改取得顏色和樣式的方法
  getColorForWord(word) {
    const colorValue = this.wordColors[word] || this.CONFIG.DEFAULT_COLOR;
    

    
    // 解析顏色值，支援外框式樣式
    if (typeof colorValue === 'string' && colorValue.startsWith('border:')) {
      return {
        color: colorValue.substring(7), // 移除 'border:' 前綴
        style: 'border'
      };
    } else {
      return {
        color: colorValue,
        style: 'background'
      };
    }
  },

  /**
   * 標示渲染子模組 - 處理標示的視覺呈現
   */
  Renderer: {
    /**
     * 獲取預設樣式
     */
    getDefaultStyles(position, width, lineHeight, color) {
      return {
        position: 'absolute',
        backgroundColor: color,
        height: `${lineHeight - 1}px`, // 統一高度為 lineHeight - 1
        width: `${width}px`,
        left: `${position.left}px`,
        top: '0',
        transform: `translate3d(0, ${position.top}px, 0)`,
        pointerEvents: 'none',
        willChange: 'transform',
        backfaceVisibility: 'hidden',
        WebkitFontSmoothing: 'antialiased'
      };
    },

    /**
     * 將樣式對象轉換為 CSS 字串
     */
    stylesToCss(styles) {
      return Object.entries(styles)
        .map(([key, value]) => {
          // 處理 camelCase 轉 kebab-case
          const cssKey = key.replace(/([A-Z])/g, '-$1').toLowerCase();
          return `${cssKey}: ${value}`;
        })
        .join('; ') + ';';
    },

    /**
     * 創建標示元素（擴展版本）
     * @param {Object} position 位置信息
     * @param {number} width 寬度
     * @param {number} lineHeight 行高
     * @param {string} color 顏色
     * @param {string} [customClass='text-highlight'] 自定義類名
     * @param {Object} [customStyles={}] 自定義樣式
     * @returns {HTMLElement} 高亮元素
     */
    createHighlight(position, width, lineHeight, color, customClass = 'text-highlight', customStyles = {}) {
      const highlight = document.createElement('div');
      highlight.className = customClass;
      
      // 合併預設樣式和自定義樣式
      const defaultStyles = this.getDefaultStyles(position, width, lineHeight, color);
      const mergedStyles = { ...defaultStyles, ...customStyles };
      
      highlight.style.cssText = this.stylesToCss(mergedStyles);
      highlight.dataset.originalTop = position.top;
      
      return highlight;
    },

    /**
     * 創建帶邊框的預覽高亮元素（專為 manual-replace 設計）
     * @param {Object} position 位置信息
     * @param {number} width 寬度
     * @param {number} lineHeight 行高
     * @param {string} color 邊框顏色
     * @returns {HTMLElement} 預覽高亮元素
     */
    createPreviewHighlight(position, width, lineHeight, color) {
      // 創建帶左偏移的位置對象
      const adjustedPosition = {
        ...position,
        left: position.left + 2.5, // 補償容器4px左移：-1.5 + 4 = +2.5px
        top: 0 // top 設為 0，完全由 transform 控制
      };
      
      const customStyles = {
        color: color, // 設置 color 屬性，讓 currentColor 和 color-mix 生效
        zIndex: '1001',
        // 修復高亮偏上問題：減少垂直偏移
        transform: `translate3d(0, ${position.top}px, 0)`
      };
      
      return this.createHighlight(
        adjustedPosition,
        width + 3, 
        lineHeight, // 高度已經在 getDefaultStyles 中統一為 lineHeight - 1
        'transparent', 
        'replace-preview-highlight', 
        customStyles
      );
    },

    /**
     * 創建外框式高亮元素（用於外框式文字高亮）
     * @param {Object} position 位置信息
     * @param {number} width 寬度
     * @param {number} lineHeight 行高
     * @param {string} color 邊框顏色
     * @returns {HTMLElement} 外框式高亮元素
     */
    createBorderHighlight(position, width, lineHeight, color) {
      const customStyles = {
        color: color, // 設置 color 屬性，讓 currentColor 和 color-mix 生效
        zIndex: '1000',
        transform: `translate3d(0, ${position.top}px, 0)`
      };
      
      return this.createHighlight(
        position,
        width, 
        lineHeight,
        'transparent', 
        'text-highlight-border', 
        customStyles
      );
    }
  },

  /**
   * 更新所有標示
   */
  updateHighlights() {
    const { textArea, container } = this.DOMManager.elements;
    if (!textArea || !container) {
              LogUtils.error('更新高亮失敗：缺少必要元素');
      return;
    }

    const text = textArea.value;
    const styles = this.PositionCalculator.getTextAreaStyles(textArea);
    
    // 如果文本和滾動位置都沒有變化，則跳過更新
    if (this._lastText === text && this._lastScrollTop === textArea.scrollTop) {
      return;
    }

    // 🔧 修復殘留問題：當文字內容改變時，先完全清理所有高亮元素
    if (this._lastText && this._lastText !== text) {
      LogUtils.log('文字內容已改變，清理舊的高亮元素');
      this.DOMManager.clearHighlights();
      
      // 清理位置計算快取，確保重新計算
      this.PositionCalculator.clearCache();
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
          const regex = RegexHelper.createRegex(targetWord);
          
          const matches = Array.from(text.matchAll(regex));

          for (const match of matches) {
            if (match[0]) {
              const positions = this.PositionCalculator.calculatePosition(
                textArea, 
                match.index, 
                text, 
                match[0], 
                styles
              );
              
              if (positions) {
                positions.forEach(position => {
                  const colorInfo = this.getColorForWord(targetWord);
                  allPositions.push({
                    position,
                    color: colorInfo.color,
                    style: colorInfo.style,
                    targetWord,
                    lineHeight: styles.lineHeight
                  });
                });
              }
            }
          }
        } else {
          // 普通文字匹配
          const regex = RegexHelper.createRegex(targetWord);
          const matches = Array.from(text.matchAll(regex));

          matches.forEach(match => {
            const positions = this.PositionCalculator.calculatePosition(
              textArea, 
              match.index, 
              text, 
              match[0], 
              styles
            );
            
            if (positions) {
              positions.forEach(position => {
                const colorInfo = this.getColorForWord(targetWord);
                allPositions.push({
                  position,
                  color: colorInfo.color,
                  style: colorInfo.style,
                  targetWord,
                  lineHeight: styles.lineHeight
                });
              });
            }
          });
        }
      } catch (error) {
        LogUtils.error(`處理文字 "${targetWord}" 時發生錯誤:`, error);
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
      const startTime = new Date();
      
      // 記錄現有的高亮元素
      const existingHighlights = new Map(visibleHighlights);
      visibleHighlights.clear();

      // 找出需要顯示的位置
      const visiblePositions = allPositions.filter(pos => {
        const top = pos.position ? pos.position.top : pos.top;
        return top >= visibleTop && top <= visibleBottom;
      });

      // 更新或創建可見範圍內的高亮
      visiblePositions.forEach((pos, index) => {
        const top = pos.position ? pos.position.top : pos.top;
        const left = pos.position ? pos.position.left : pos.left;
        const text = pos.position ? pos.position.text : pos.text;
        const color = pos.color || 'rgba(50, 205, 50, 0.3)';
        const style = pos.style || 'background';
        
        // 🔧 修復：在 key 中包含樣式信息和唯一標識符，避免相同位置不同樣式的元素衝突
        const targetWord = pos.targetWord || '';
        const key = `${top}-${left}-${text}-${style}-${targetWord}-${index}`;
        let highlight = existingHighlights.get(key);

        // 計算最終渲染位置（滾動補償）
        const finalTop = top - scrollTop;

        if (highlight) {
          // 重用現有元素，只更新位置和顏色（不再進行複雜的樣式切換）
          existingHighlights.delete(key);
          highlight.style.transform = `translate3d(0, ${finalTop}px, 0)`;
          highlight.style.display = 'block';
          
          // 簡化顏色更新邏輯
          const currentColor = color || 'rgba(50, 205, 50, 0.3)';
          if (style === 'border') {
            highlight.style.color = currentColor;
          } else {
            highlight.style.backgroundColor = currentColor;
          }
        } else {
          // 創建新元素（樣式在創建時就確定，避免後續切換）
          highlight = createHighlight(pos);
          // 只有在元素沒有className時才設置默認class，避免覆蓋邊框式高亮的class
          if (!highlight.className) {
            highlight.className = highlightClass;
          }
          // 直接設置正確的 transform
          highlight.style.transform = `translate3d(0, ${finalTop}px, 0)`;
          container.appendChild(highlight);
        }

        visibleHighlights.set(key, highlight);
      });

      // 🔧 修復殘留問題：完全移除不再需要的元素，而不只是隱藏
      const hiddenCount = existingHighlights.size;
      existingHighlights.forEach((highlight, key) => {
        if (highlight.parentNode) {
          highlight.parentNode.removeChild(highlight);
        }
      });

      const endTime = new Date();
      
      return visibleHighlights;
    },

    /**
     * 更新多組虛擬滾動視圖
     * @param {Object} params 參數對象
     * @param {Map} params.groupedPositions Map<groupIndex, positions[]>
     * @param {Map} params.groupHighlights Map<groupIndex, Map<key, element>>
     * @param {number} params.visibleTop 可見區域頂部
     * @param {number} params.visibleBottom 可見區域底部
     * @param {number} params.scrollTop 滾動位置
     * @param {Function} params.createHighlight 創建高亮元素的函數
     * @param {HTMLElement} params.container 容器元素
     * @param {string} [params.highlightClass='text-highlight'] 高亮元素的 class
     */
    updateMultiGroupVirtualView({
      groupedPositions,
      groupHighlights,
      visibleTop,
      visibleBottom,
      scrollTop,
      createHighlight,
      container,
      highlightClass = 'text-highlight'
    }) {
      // 創建文檔片段，減少DOM操作
      const fragment = document.createDocumentFragment();
      const newElements = [];
      
      // 更新每個組的可見性
      groupedPositions.forEach((positions, groupIndex) => {
        // 獲取或創建該組的可見高亮 Map
        if (!groupHighlights.has(groupIndex)) {
          groupHighlights.set(groupIndex, new Map());
        }
        const groupHighlightMap = groupHighlights.get(groupIndex);
        
        // 記錄現有的高亮元素
        const existingHighlights = new Map(groupHighlightMap);
        groupHighlightMap.clear();

        // 找出需要顯示的位置
        const visiblePositions = positions.filter(pos => {
          const top = pos.position ? pos.position.top : pos.top;
          return top >= visibleTop && top <= visibleBottom;
        });

        // 更新或創建可見範圍內的高亮
        visiblePositions.forEach((pos, posIndex) => {
          const top = pos.position ? pos.position.top : pos.top;
          const left = pos.position ? pos.position.left : pos.left;
          const text = pos.position ? pos.position.text : pos.text;
          const style = pos.style || 'background';
          
          // 🔧 修復：在 key 中包含樣式信息和唯一標識符，避免相同位置不同樣式的元素衝突
          const targetWord = pos.targetWord || '';
          const key = `${top}-${left}-${text}-${style}-${targetWord}-${groupIndex}-${posIndex}`;
          let highlight = existingHighlights.get(key);

          if (highlight) {
            // 重用現有元素，只更新 transform
            existingHighlights.delete(key);
            highlight.style.transform = `translate3d(0, ${top - scrollTop}px, 0)`;
            highlight.style.display = 'block';
            highlight.dataset.groupIndex = groupIndex;
          } else {
            // 創建新元素
            highlight = createHighlight(pos);
            // 只有在元素沒有className時才設置默認class，避免覆蓋邊框式高亮的class
            if (!highlight.className) {
              highlight.className = highlightClass;
            }
            highlight.style.transform = `translate3d(0, ${top - scrollTop}px, 0)`;
            highlight.dataset.groupIndex = groupIndex;
            newElements.push(highlight);
          }

          groupHighlightMap.set(key, highlight);
        });

        // 🔧 修復殘留問題：完全移除不再需要的元素，而不只是隱藏
        existingHighlights.forEach(highlight => {
          if (highlight.parentNode) {
            highlight.parentNode.removeChild(highlight);
          }
        });
      });
      
      // 一次性將所有新元素添加到DOM
      newElements.forEach(element => {
        container.appendChild(element);
      });
    },

    /**
     * 清理特定組的高亮元素
     * @param {number} groupIndex 組索引
     * @param {Map} groupHighlights 組高亮映射
     * @param {IntersectionObserver} observer 觀察器實例
     */
    clearGroupHighlights(groupIndex, groupHighlights, observer = null) {
      const groupHighlightMap = groupHighlights.get(groupIndex);
      if (groupHighlightMap) {
        groupHighlightMap.forEach(highlight => {
          // 停止觀察此元素
          if (observer) {
            observer.unobserve(highlight);
          }
          // 從DOM中移除
          if (highlight.parentNode) {
            highlight.parentNode.removeChild(highlight);
          }
        });
        groupHighlightMap.clear();
      }
    },

    /**
     * 清理所有組的高亮元素
     * @param {Map} groupHighlights 所有組的高亮映射
     * @param {IntersectionObserver} observer 觀察器實例
     */
    clearAllGroupHighlights(groupHighlights, observer = null) {
      groupHighlights.forEach((groupHighlightMap, groupIndex) => {
        if (groupHighlightMap) {
          groupHighlightMap.forEach(highlight => {
            // 停止觀察此元素
            if (observer) {
              observer.unobserve(highlight);
            }
            // 從DOM中移除
            if (highlight.parentNode) {
              highlight.parentNode.removeChild(highlight);
            }
          });
          groupHighlightMap.clear();
        }
      });
      groupHighlights.clear();
    }
  }
};

// 將模組暴露給全局作用域
window.TextHighlight = TextHighlight; 