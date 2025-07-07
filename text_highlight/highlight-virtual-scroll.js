/**
 * 高亮虛擬滾動系統模組
 * 
 * 功能：
 * 1. 虛擬滾動管理 - 優化大量高亮元素的渲染性能
 * 2. 單組和多組虛擬滾動支援
 * 3. 可見性管理 - 只渲染可見區域的高亮元素
 * 4. 高亮清理和回收機制
 * 
 * 職責：
 * - 管理虛擬滾動視窗
 * - 控制高亮元素的顯示/隱藏
 * - 優化滾動性能
 * - 處理多組高亮的協調
 * 
 * 依賴：
 * - highlight-render.js (HighlightRenderer)
 */

window.TextHighlightVirtualScroll = {
  
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
      visiblePositions.forEach(pos => {
        const top = pos.position ? pos.position.top : pos.top;
        const left = pos.position ? pos.position.left : pos.left;
        const text = pos.position ? pos.position.text : pos.text;
        
        const key = `${top}-${left}-${text}`;
        let highlight = existingHighlights.get(key);

        if (highlight) {
          // 重用現有元素，只更新 transform
          existingHighlights.delete(key);
          highlight.style.transform = `translate3d(0, ${top - scrollTop}px, 0)`;
          highlight.style.display = 'block';
        } else {
          // 創建新元素時已經應用了 GPU 加速
          highlight = createHighlight(pos);
          highlight.className = highlightClass;
          // 直接設置正確的 transform
          highlight.style.transform = `translate3d(0, ${top - scrollTop}px, 0)`;
          container.appendChild(highlight);
        }

        visibleHighlights.set(key, highlight);
      });

      // 隱藏不再可見的元素
      existingHighlights.forEach(highlight => {
        highlight.style.display = 'none';
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
        visiblePositions.forEach(pos => {
          const top = pos.position ? pos.position.top : pos.top;
          const left = pos.position ? pos.position.left : pos.left;
          const text = pos.position ? pos.position.text : pos.text;
          
          const key = `${top}-${left}-${text}`;
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
            highlight.className = highlightClass;
            highlight.style.transform = `translate3d(0, ${top - scrollTop}px, 0)`;
            highlight.dataset.groupIndex = groupIndex;
            
            // 使用文檔片段暫存新元素
            newElements.push(highlight);
          }

          groupHighlightMap.set(key, highlight);
        });

        // 隱藏不再可見的元素
        existingHighlights.forEach(highlight => {
          highlight.style.display = 'none';
        });
      });

      // 批量添加新元素到容器
      if (newElements.length > 0) {
        newElements.forEach(element => fragment.appendChild(element));
        container.appendChild(fragment);
      }
    },

    /**
     * 清理特定組的高亮
     * @param {number} groupIndex 組索引
     * @param {Map} groupHighlights 組高亮 Map
     * @param {IntersectionObserver} observer 觀察器實例
     */
    clearGroupHighlights(groupIndex, groupHighlights, observer = null) {
      if (groupHighlights.has(groupIndex)) {
        const groupHighlightMap = groupHighlights.get(groupIndex);
        
        // 移除所有元素
        groupHighlightMap.forEach(element => {
          if (observer) {
            observer.unobserve(element);
          }
          element.remove();
        });
        
        // 清空該組的 Map
        groupHighlightMap.clear();
        groupHighlights.delete(groupIndex);
        
        console.log(`[VirtualScroll] 清理組 ${groupIndex} 的高亮`);
      }
    },

    /**
     * 清理所有組的高亮
     * @param {Map} groupHighlights 組高亮 Map
     * @param {IntersectionObserver} observer 觀察器實例
     */
    clearAllGroupHighlights(groupHighlights, observer = null) {
      groupHighlights.forEach((groupHighlightMap, groupIndex) => {
        groupHighlightMap.forEach(element => {
          if (observer) {
            observer.unobserve(element);
          }
          element.remove();
        });
        groupHighlightMap.clear();
      });
      
      groupHighlights.clear();
      console.log(`[VirtualScroll] 清理所有組的高亮`);
    }
  },

  /**
   * 虛擬滾動數據管理器
   */
  VirtualScrollData: {
    /**
     * 創建虛擬滾動數據對象
     * @param {number} bufferSize 緩衝區大小（像素）
     * @returns {Object} 虛擬滾動數據對象
     */
    create(bufferSize = 200) {
      return {
        allPositions: [],         // 所有位置的快取
        visibleHighlights: new Map(), // 當前可見的高亮元素
        lastScrollTop: 0,         // 上次滾動位置
        bufferSize: bufferSize,   // 緩衝區大小（像素）
      };
    },

    /**
     * 重置虛擬滾動數據
     * @param {Object} virtualScrollData 虛擬滾動數據對象
     */
    reset(virtualScrollData) {
      virtualScrollData.allPositions = [];
      virtualScrollData.visibleHighlights.clear();
      virtualScrollData.lastScrollTop = 0;
    },

    /**
     * 更新滾動位置
     * @param {Object} virtualScrollData 虛擬滾動數據對象
     * @param {number} scrollTop 新的滾動位置
     * @returns {boolean} 是否有滾動變化
     */
    updateScrollTop(virtualScrollData, scrollTop) {
      const hasChanged = virtualScrollData.lastScrollTop !== scrollTop;
      virtualScrollData.lastScrollTop = scrollTop;
      return hasChanged;
    }
  },

  /**
   * 滾動監聽輔助器
   */
  ScrollHelper: {
    /**
     * 綁定滾動事件
     * @param {HTMLElement} element 要監聽的元素
     * @param {Function} callback 滾動回調函數
     * @returns {Function} 移除監聽的函數
     */
    bindScrollEvent(element, callback) {
      let ticking = false;
      
      const onScroll = () => {
        if (!ticking) {
          requestAnimationFrame(() => {
            callback();
            ticking = false;
          });
          ticking = true;
        }
      };

      element.addEventListener('scroll', onScroll, { passive: true });
      
      // 返回移除監聽的函數
      return () => {
        element.removeEventListener('scroll', onScroll);
      };
    },

    /**
     * 計算可見區域
     * @param {HTMLElement} element 滾動元素
     * @param {number} bufferSize 緩衝區大小
     * @returns {Object} 可見區域信息
     */
    calculateVisibleArea(element, bufferSize = 200) {
      const scrollTop = element.scrollTop;
      const visibleHeight = element.clientHeight;
      const totalHeight = element.scrollHeight;
      
      return {
        scrollTop,
        visibleHeight,
        totalHeight,
        visibleTop: Math.max(0, scrollTop - bufferSize),
        visibleBottom: Math.min(totalHeight, scrollTop + visibleHeight + bufferSize),
        bufferSize
      };
    }
  },

  /**
   * 性能監控工具
   */
  PerformanceMonitor: {
    timers: new Map(),

    /**
     * 開始計時
     * @param {string} name 計時器名稱
     */
    start(name) {
      this.timers.set(name, performance.now());
    },

    /**
     * 結束計時並記錄
     * @param {string} name 計時器名稱
     * @param {boolean} log 是否輸出日誌
     * @returns {number} 耗時（毫秒）
     */
    end(name, log = false) {
      const startTime = this.timers.get(name);
      if (startTime === undefined) {
        console.warn(`[PerformanceMonitor] 找不到計時器: ${name}`);
        return 0;
      }

      const duration = performance.now() - startTime;
      this.timers.delete(name);

      if (log) {
        console.log(`[PerformanceMonitor] ${name}: ${duration.toFixed(2)}ms`);
      }

      return duration;
    },

    /**
     * 清除所有計時器
     */
    clear() {
      this.timers.clear();
    }
  }
};

// 為了向後相容，建立完整的 TextHighlight 命名空間
window.TextHighlight = window.TextHighlight || {};

// 虛擬滾動相關
window.TextHighlight.SharedVirtualScroll = window.TextHighlightVirtualScroll.SharedVirtualScroll;
window.TextHighlight.ScrollHelper = window.TextHighlightVirtualScroll.ScrollHelper;

// 位置計算相關 - 向後兼容映射
if (window.HighlightPositionCalculator) {
  window.TextHighlight.PositionCalculator = window.HighlightPositionCalculator;
}

// 全局位置緩存 - 向後兼容映射
if (window.GlobalPositionCache) {
  window.TextHighlight.GlobalPositionCache = window.GlobalPositionCache;
}

// 渲染器 - 向後兼容映射
if (window.HighlightRenderer) {
  window.TextHighlight.Renderer = window.HighlightRenderer;
}

// 核心配置 - 向後兼容映射
if (window.TextHighlightCore && window.TextHighlightCore.CONFIG) {
  window.TextHighlight.CONFIG = window.TextHighlightCore.CONFIG;
}

// 🔗 建立主要 API 的向後兼容映射
window.TextHighlight = {
  // 保留現有的模組映射
  SharedVirtualScroll: window.TextHighlightVirtualScroll.SharedVirtualScroll,
  ScrollHelper: window.TextHighlightVirtualScroll.ScrollHelper,
  PositionCalculator: window.HighlightPositionCalculator,
  GlobalPositionCache: window.GlobalPositionCache,
  Renderer: window.HighlightRenderer,
  CONFIG: {
    // 合併核心配置和向後兼容配置
    ...(window.TextHighlightCore?.CONFIG || {}),
    FIXED_OFFSET: {
      LEFT: 14,
      TOP: 16
    },
    DEFAULT_COLOR: 'rgba(50, 205, 50, 0.3)',
    CACHE_CLEANUP_INTERVAL: 60000
  },
  
  // 內部狀態（模擬原來的狀態）
  targetWords: [],
  wordColors: {},
  _lastText: null,
  _lastScrollTop: null,
  
  // 模擬 DOMManager 
  DOMManager: {
    elements: {
      highlights: [],
      container: null,
      textArea: null,
      highlightPositions: [],
      virtualScrollData: {
        allPositions: [],
        visibleHighlights: new Map(),
        lastScrollTop: 0,
        bufferSize: 200
      }
    },
    
    initialize() {
      // 延遲初始化，確保 DOM 已載入
      this.initWithRetry();
    },
    
    initWithRetry(maxRetries = 5, currentRetry = 0) {
      const textArea = document.querySelector('textarea[name="content"]');
      if (textArea) {
        this.setupHighlightContainer();
        return true;
      }
      
      if (currentRetry < maxRetries) {
        console.log(`[TextHighlight] DOM 未就緒，${100 * (currentRetry + 1)}ms 後重試 (${currentRetry + 1}/${maxRetries})`);
        setTimeout(() => {
          this.initWithRetry(maxRetries, currentRetry + 1);
        }, 100 * (currentRetry + 1)); // 遞增延遲：100ms, 200ms, 300ms...
      } else {
        console.warn('[TextHighlight] 初始化失敗：找不到 textarea[name="content"] 元素');
      }
      return false;
    },
    
    setupHighlightContainer() {
      // 獲取 textarea 元素
      const textArea = document.querySelector('textarea[name="content"]');
      if (!textArea) return;
      
      // 創建容器
      const container = document.createElement('div');
      container.id = 'text-highlight-container';
      
      // 設置容器樣式 - 使用固定的偏移值
      const FIXED_OFFSET = { LEFT: 14, TOP: 16 };
      container.style.cssText = `
        position: absolute;
        top: ${FIXED_OFFSET.TOP}px;
        left: 0;
        width: ${textArea.offsetWidth}px;
        height: ${textArea.offsetHeight}px;
        pointer-events: none;
        z-index: 1000;
        overflow: hidden;
      `;

      // 添加到父元素
      const textAreaParent = textArea.parentElement;
      if (textAreaParent) {
        textAreaParent.style.position = 'relative';
        textAreaParent.appendChild(container);
        this.elements.container = container;
        this.elements.textArea = textArea;
      }
    },
    
    clearHighlights() {
      // 清理高亮元素
      if (this.elements.container) {
        const highlights = this.elements.container.querySelectorAll('.text-highlight');
        highlights.forEach(h => h.remove());
        this.elements.highlights = [];
      }
    },
    
    /**
     * 更新高亮元素陣列（用於檢測）
     */
    updateHighlightsArray() {
      if (this.elements.container) {
        const highlights = this.elements.container.querySelectorAll('.text-highlight');
        this.elements.highlights = Array.from(highlights);
      }
    }
  },
  
  // 模擬 EventHandler
  EventHandler: {
    initialize() {
      // 如果需要事件處理，可以在這裡添加
      console.log('[TextHighlight] EventHandler 初始化');
    }
  },
  
  // 🔑 主要 API 方法
  initialize() {
    console.log('初始化文字標示功能');
    
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
  
  setTargetWords(words, colors = {}) {
    console.log('設定目標文字:', words);
    this.targetWords = words || [];
    if (colors && Object.keys(colors).length > 0) {
      this.wordColors = { ...this.wordColors, ...colors };
    }
    this.updateHighlights();
  },
  
  forceUpdate() {
    // 清除所有快取
    if (this.PositionCalculator && this.PositionCalculator.clearCache) {
      this.PositionCalculator.clearCache();
    }
    if (this.GlobalPositionCache && this.GlobalPositionCache.clear) {
      this.GlobalPositionCache.clear();
    }
    this._lastText = null;
    this._lastScrollTop = null;
    
    // 直接執行更新
    this.DOMManager.clearHighlights();
    this.updateHighlights();
  },
  
  updateHighlights() {
    console.log('[TextHighlight] 開始更新高亮');
    
    const { textArea, container } = this.DOMManager.elements;
    if (!textArea || !container) {
      console.error('[TextHighlight] 更新高亮失敗：缺少必要元素');
      return;
    }

    const text = textArea.value;
    if (!text || this.targetWords.length === 0) {
      this.DOMManager.clearHighlights();
      return;
    }

    // 使用核心模組進行高亮更新
    if (window.TextHighlightCore) {
      try {
        // 確保 TextHighlightCore 已初始化
        if (!window.TextHighlightCore.isInitialized()) {
          window.TextHighlightCore.initialize();
        }
        
        // 設置目標詞彙和顏色映射
        window.TextHighlightCore.setTargetWords(this.targetWords, this.wordColors);
        
        // 確保文本區域已添加到核心模組
        window.TextHighlightCore.addTextArea(textArea);
        
        // 執行高亮更新
        window.TextHighlightCore.updateHighlights(textArea);
        
      } catch (error) {
        console.error('[TextHighlight] 高亮更新出錯:', error);
        // 如果核心模組出錯，回退到簡單的清理
        this.DOMManager.clearHighlights();
      }
    }
  },
  
  setWordColors(colors) {
    this.wordColors = colors || {};
    // 保存到 storage
    chrome.storage.local.set({ highlightColors: this.wordColors });
    this.updateHighlights();
  },
  
  getColorForWord(word) {
    return this.wordColors[word] || (this.CONFIG && this.CONFIG.DEFAULT_COLOR) || 'rgba(50, 205, 50, 0.3)';
  },
  
  startPeriodicCheck() {
    // 在前幾秒多次檢查
    const checkTimes = [100, 500, 1000, 2000];
    checkTimes.forEach(delay => {
      setTimeout(() => {
        this.checkAndForceUpdate();
      }, delay);
    });
  },
  
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
  }
};

console.log('[TextHighlightVirtualScroll] 虛擬滾動模組和完整向後兼容映射已載入'); 