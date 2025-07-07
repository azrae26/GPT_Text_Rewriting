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

console.log('[TextHighlightVirtualScroll] 虛擬滾動模組和向後兼容映射已載入'); 