/**
 * search-controller.js - 高性能通用搜尋功能控制器
 * 功能：提供文本區域的關鍵字搜尋和高亮功能
 * 
 * 特色：
 * - 即時搜尋，快速響應
 * - 高性能虛擬滾動
 * - 位置計算快取
 * - 自動高亮匹配結果
 * - 支援多個關鍵字搜尋（空格分隔）
 * - 不區分大小寫
 * - 支援正則表達式搜尋
 * - 顯示匹配結果數量
 * - 清除搜尋功能
 */

const SearchController = {
  // 當前活動的搜尋實例
  activeInstances: new Map(),

  // 性能配置
  CONFIG: {
    DEBOUNCE_DELAY: 30,           // 防抖延遲（毫秒）
    MAX_RESULTS: 1000,            // 最大結果數量
    VIRTUAL_BUFFER: 100,          // 虛擬滾動緩衝區（像素）
    CACHE_CLEANUP_INTERVAL: 60000, // 快取清理間隔
    POSITION_CACHE_LIMIT: 500     // 位置快取限制
  },

  /**
   * 高性能位置快取系統
   */
  PositionCache: {
    cache: new Map(),
    lastText: '',
    lastCleanup: Date.now(),

    get(key) {
      return this.cache.get(key) || null;
    },

    set(key, value) {
      this.cache.set(key, value);
      
      // 定期清理快取
      const now = Date.now();
      if (now - this.lastCleanup > SearchController.CONFIG.CACHE_CLEANUP_INTERVAL) {
        this.cleanup();
        this.lastCleanup = now;
      }
    },

    clear() {
      this.cache.clear();
      this.lastText = '';
    },

    cleanup() {
      if (this.cache.size > SearchController.CONFIG.POSITION_CACHE_LIMIT) {
        const entries = Array.from(this.cache.entries());
        const halfSize = Math.floor(entries.length / 2);
        this.cache = new Map(entries.slice(halfSize));
      }
    },

    invalidateIfTextChanged(currentText) {
      if (this.lastText !== currentText) {
        this.clear();
        this.lastText = currentText;
        return true;
      }
      return false;
    }
  },

  /**
   * 虛擬滾動管理器
   */
  VirtualScrollManager: {
    instances: new Map(),

    createInstance(containerId) {
      const instance = {
        allPositions: [],
        visibleHighlights: new Map(),
        lastScrollTop: 0,
        container: null,
        textArea: null
      };
      this.instances.set(containerId, instance);
      return instance;
    },

    updateVirtualView(instance, scrollTop) {
      const { textArea, container, allPositions } = instance;
      if (!textArea || !container || !allPositions.length) return;

      const bufferSize = SearchController.CONFIG.VIRTUAL_BUFFER;
      const viewportTop = scrollTop - bufferSize;
      const viewportBottom = scrollTop + textArea.clientHeight + bufferSize;

      // 使用文檔片段批量操作
      const fragment = document.createDocumentFragment();
      const newVisibleHighlights = new Map();

      allPositions.forEach((position, index) => {
        const key = `highlight-${index}`;
        const { top, left, width, height } = position;
        
        // 計算元素的絕對位置（相對於文本區域內容）
        const absoluteTop = top;
        const absoluteBottom = top + height;
        
        // 判斷是否在可視區域（考慮滾動位置）
        const isVisible = (absoluteBottom >= viewportTop) && (absoluteTop <= viewportBottom);
        
        if (isVisible) {
          let highlight = instance.visibleHighlights.get(key);
          
          if (!highlight) {
            // 創建新的高亮元素
            highlight = document.createElement('div');
            highlight.className = 'search-highlight';
            highlight.style.cssText = `
              position: absolute;
              background-color: rgba(255, 255, 0, 0.4);
              border-radius: 2px;
              will-change: transform;
              backface-visibility: hidden;
              pointer-events: none;
              z-index: 2;
            `;
            fragment.appendChild(highlight);
          }
          
          // 更新位置（相對於覆蓋層，考慮滾動偏移）
          highlight.style.left = `${left}px`;
          highlight.style.top = `${top - scrollTop}px`;
          highlight.style.width = `${width}px`;
          highlight.style.height = `${height}px`;
          
          newVisibleHighlights.set(key, highlight);
        }
      });

      // 清理不可見的高亮元素
      instance.visibleHighlights.forEach((highlight, key) => {
        if (!newVisibleHighlights.has(key)) {
          highlight.remove();
        }
      });

      // 批量添加新元素
      if (fragment.childNodes.length > 0) {
        container.appendChild(fragment);
      }

      // 更新實例狀態
      instance.visibleHighlights = newVisibleHighlights;
      instance.lastScrollTop = scrollTop;
    },

    destroy(containerId) {
      const instance = this.instances.get(containerId);
      if (instance) {
        instance.visibleHighlights.forEach(highlight => highlight.remove());
        this.instances.delete(containerId);
      }
    }
  },

  /**
   * 高性能位置計算器
   */
  PositionCalculator: {
    getTextAreaStyles(textArea) {
      const computedStyle = getComputedStyle(textArea);
      return {
        font: `${computedStyle.fontSize} ${computedStyle.fontFamily}`,
        lineHeight: parseFloat(computedStyle.lineHeight) || 20,
        paddingLeft: parseFloat(computedStyle.paddingLeft) || 0,
        paddingTop: parseFloat(computedStyle.paddingTop) || 0,
        paddingRight: parseFloat(computedStyle.paddingRight) || 0,
        borderLeft: parseFloat(computedStyle.borderLeftWidth) || 0,
        borderTop: parseFloat(computedStyle.borderTopWidth) || 0,
        border: parseFloat(computedStyle.borderWidth) || 0
      };
    },

    calculatePositions(textArea, matches, styles) {
      const text = textArea.value;
      const positions = [];

      // 創建測量 div，完全模擬 textarea 的樣式和佈局
      let measureDiv = document.getElementById('search-measure-div');
      if (!measureDiv) {
        measureDiv = document.createElement('div');
        measureDiv.id = 'search-measure-div';
        measureDiv.style.cssText = `
          position: absolute;
          visibility: hidden;
          white-space: pre-wrap;
          word-wrap: break-word;
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
          top: -9999px;
          left: -9999px;
          transform: none;
          max-height: ${textArea.offsetHeight}px;
          height: ${textArea.offsetHeight}px;
        `;
        document.body.appendChild(measureDiv);
        
        // 確保寬度與 textarea 一致
        const actualWidth = getComputedStyle(textArea).width;
        measureDiv.style.width = actualWidth;
      }

      // 設置測量 div 的內容
      measureDiv.textContent = text;

      try {
        const range = document.createRange();
        const textNode = measureDiv.firstChild;
        if (!textNode) return [];

        const divRect = measureDiv.getBoundingClientRect();

        matches.forEach((match, index) => {
          const cacheKey = `${match.start}-${match.end}-${match.text}`;
          let cachedPosition = SearchController.PositionCache.get(cacheKey);

          if (!cachedPosition) {
            try {
              // 使用精確的 range API 計算位置
              range.setStart(textNode, match.start);
              range.setEnd(textNode, match.start + match.text.length);

              const rects = range.getClientRects();
              if (rects.length === 0) return;

              // 處理多行匹配，合併相鄰的矩形
              let currentRect = null;
              const matchPositions = [];

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
                  matchPositions.push({
                    top: currentRect.top - divRect.top + styles.paddingTop,
                    left: currentRect.left - divRect.left + styles.paddingLeft,
                    width: currentRect.width,
                    height: currentRect.height,
                    text: match.text,
                    isMultiLine: rects.length > 1,
                    lineIndex: matchPositions.length
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
                matchPositions.push({
                  top: currentRect.top - divRect.top + styles.paddingTop,
                  left: currentRect.left - divRect.left + styles.paddingLeft,
                  width: currentRect.width,
                  height: currentRect.height,
                  text: match.text,
                  isMultiLine: rects.length > 1,
                  lineIndex: matchPositions.length
                });
              }

              cachedPosition = matchPositions;
              SearchController.PositionCache.set(cacheKey, cachedPosition);
            } catch (error) {
              console.error('計算單個匹配位置時發生錯誤:', error);
              return;
            }
          }

          // 將所有匹配的位置添加到結果中
          if (cachedPosition && Array.isArray(cachedPosition)) {
            cachedPosition.forEach((pos, subIndex) => {
              positions.push({
                ...pos,
                index: index,
                subIndex: subIndex,
                matchStart: match.start,
                matchEnd: match.end
              });
            });
          }
        });

        range.detach();
      } catch (error) {
        console.error('計算位置時發生錯誤:', error);
      }

      return positions;
    },

    // 清理測量元素
    cleanup() {
      const measureDiv = document.getElementById('search-measure-div');
      if (measureDiv) {
        measureDiv.remove();
      }
    }
  },

  /**
   * 初始化搜尋功能
   * @param {string} containerId - 搜尋容器的ID
   * @param {string} targetTextareaId - 目標文本區域的ID
   * @param {Object} options - 可選配置
   * @returns {Object} 搜尋實例
   */
  init(containerId, targetTextareaId, options = {}) {
    const container = document.getElementById(containerId);
    const targetTextarea = document.getElementById(targetTextareaId);
    
    if (!container || !targetTextarea) {
      console.error('SearchController: 找不到必要元素', { containerId, targetTextareaId });
      return null;
    }

    // 預設配置
    const config = {
      placeholder: '搜尋...',
      showCounter: true,
      enableRegex: true,
      ...options
    };

    // 創建搜尋介面
    const searchHTML = `
      <div class="search-container">
        <div class="search-input-container">
          <input type="text" class="search-input" placeholder="${config.placeholder}">
          <div class="search-actions">
            <span class="search-counter"></span>
            <button class="search-clear" title="清除搜尋">×</button>
          </div>
        </div>
      </div>
    `;

    // 插入搜尋介面
    container.insertAdjacentHTML('afterbegin', searchHTML);

    // 獲取搜尋元素
    const searchInput = container.querySelector('.search-input');
    const searchCounter = container.querySelector('.search-counter');
    const clearButton = container.querySelector('.search-clear');

    // 創建虛擬滾動實例
    const virtualScrollInstance = this.VirtualScrollManager.createInstance(containerId);
    
    // 創建搜尋實例
    const instance = {
      container,
      targetTextarea,
      searchInput,
      searchCounter,
      clearButton,
      config,
      currentMatches: [],
      originalHeight: targetTextarea.style.height || targetTextarea.offsetHeight + 'px',
      virtualScrollInstance,
      searchTimeout: null
    };

    // 設置高亮容器
    this.setupHighlightContainer(instance);

    // 綁定事件
    this.bindEvents(instance);

    // 調整文本區域高度
    this.adjustTextareaHeight(instance);

    // 儲存實例
    this.activeInstances.set(containerId, instance);

    console.log('SearchController: 高性能搜尋功能已初始化', containerId);
    return instance;
  },

  /**
   * 設置高亮容器
   */
  setupHighlightContainer(instance) {
    const { targetTextarea, virtualScrollInstance } = instance;
    
    // 獲取 textarea 相對於父容器的位置
    const textareaContainer = targetTextarea.parentElement;
    const textareaRect = targetTextarea.getBoundingClientRect();
    const containerRect = textareaContainer.getBoundingClientRect();
    
    // 計算偏移量
    const offsetTop = textareaRect.top - containerRect.top;
    const offsetLeft = textareaRect.left - containerRect.left;
    
    // 創建高亮覆蓋層，精確對應 textarea 的位置和大小
    const overlay = document.createElement('div');
    overlay.className = 'search-highlight-overlay';
    overlay.style.cssText = `
      position: absolute;
      top: ${offsetTop}px;
      left: ${offsetLeft}px;
      width: ${targetTextarea.offsetWidth}px;
      height: ${targetTextarea.offsetHeight}px;
      pointer-events: none;
      z-index: 1;
      overflow: hidden;
      background: transparent;
      border: ${getComputedStyle(targetTextarea).border};
      box-sizing: border-box;
    `;

    // 確保父容器有相對定位
    if (getComputedStyle(textareaContainer).position === 'static') {
      textareaContainer.style.position = 'relative';
    }
    textareaContainer.appendChild(overlay);

    // 設置虛擬滾動實例
    virtualScrollInstance.container = overlay;
    virtualScrollInstance.textArea = targetTextarea;
    
    // 保存偏移量供後續使用
    instance.textareaOffset = {
      top: offsetTop,
      left: offsetLeft
    };
    
    console.log('SearchController: 高亮容器已設置', {
      container: overlay,
      textArea: targetTextarea,
      offset: instance.textareaOffset,
      textareaSize: { width: targetTextarea.offsetWidth, height: targetTextarea.offsetHeight }
    });
  },

  /**
   * 綁定事件處理器
   */
  bindEvents(instance) {
    const { searchInput, clearButton, targetTextarea, virtualScrollInstance } = instance;

    // 搜尋輸入事件 - 使用更短的防抖
    searchInput.addEventListener('input', (e) => {
      if (instance.searchTimeout) {
        clearTimeout(instance.searchTimeout);
      }
      instance.searchTimeout = setTimeout(() => {
        this.performSearch(instance, e.target.value);
      }, this.CONFIG.DEBOUNCE_DELAY);
    });

    // 清除按鈕事件
    clearButton.addEventListener('click', () => {
      this.clearSearch(instance);
    });

    // ESC 鍵清除搜尋
    searchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        this.clearSearch(instance);
      }
    });

    // 目標文本區域內容變更時重新搜尋
    targetTextarea.addEventListener('input', () => {
      if (searchInput.value.trim()) {
        if (instance.searchTimeout) {
          clearTimeout(instance.searchTimeout);
        }
        instance.searchTimeout = setTimeout(() => {
          this.performSearch(instance, searchInput.value);
        }, this.CONFIG.DEBOUNCE_DELAY);
      }
    });

    // 高性能滾動處理
    const scrollHandler = this.createScrollHandler((e) => {
      this.VirtualScrollManager.updateVirtualView(virtualScrollInstance, targetTextarea.scrollTop);
    });
    
    targetTextarea.addEventListener('scroll', scrollHandler, { passive: true });

    // 監聽窗口大小變化和容器變化，動態更新高亮容器位置
    const updateContainerPosition = () => {
      this.updateHighlightContainerPosition(instance);
    };

    // 使用 ResizeObserver 監聽 textarea 大小變化
    if (window.ResizeObserver) {
      const resizeObserver = new ResizeObserver(updateContainerPosition);
      resizeObserver.observe(targetTextarea);
      resizeObserver.observe(targetTextarea.parentElement);
      instance.resizeObserver = resizeObserver;
    }

    // 監聽窗口大小變化
    window.addEventListener('resize', updateContainerPosition);
    instance.windowResizeHandler = updateContainerPosition;
  },

  /**
   * 更新高亮容器位置
   */
  updateHighlightContainerPosition(instance) {
    const { targetTextarea, virtualScrollInstance } = instance;
    const overlay = virtualScrollInstance.container;
    
    if (!overlay) return;

    // 重新計算位置
    const textareaContainer = targetTextarea.parentElement;
    const textareaRect = targetTextarea.getBoundingClientRect();
    const containerRect = textareaContainer.getBoundingClientRect();
    
    const offsetTop = textareaRect.top - containerRect.top;
    const offsetLeft = textareaRect.left - containerRect.left;
    
    // 更新覆蓋層位置和大小
    overlay.style.top = `${offsetTop}px`;
    overlay.style.left = `${offsetLeft}px`;
    overlay.style.width = `${targetTextarea.offsetWidth}px`;
    overlay.style.height = `${targetTextarea.offsetHeight}px`;
    
    // 更新保存的偏移量
    instance.textareaOffset = {
      top: offsetTop,
      left: offsetLeft
    };

    // 重新觸發高亮顯示
    if (instance.currentMatches.length > 0) {
      this.VirtualScrollManager.updateVirtualView(virtualScrollInstance, targetTextarea.scrollTop);
    }
  },

  /**
   * 創建高性能滾動處理器
   */
  createScrollHandler(callback) {
    let ticking = false;
    return function(event) {
      if (!ticking) {
        requestAnimationFrame(() => {
          callback(event);
          ticking = false;
        });
        ticking = true;
      }
    };
  },

  /**
   * 執行搜尋
   */
  performSearch(instance, searchTerm) {
    const { targetTextarea, searchCounter, config, virtualScrollInstance } = instance;
    
    // 清除之前的高亮
    this.clearHighlights(instance);

    if (!searchTerm.trim()) {
      this.updateCounter(instance, 0);
      return;
    }

    const text = targetTextarea.value;
    
    // 檢查文本是否變化，並清理快取
    const textChanged = this.PositionCache.invalidateIfTextChanged(text);
    
    let matches = [];

    try {
      // 檢查是否為正則表達式格式 /pattern/flags
      if (config.enableRegex && searchTerm.startsWith('/') && searchTerm.lastIndexOf('/') > 0) {
        const lastSlashIndex = searchTerm.lastIndexOf('/');
        const pattern = searchTerm.slice(1, lastSlashIndex);
        const flags = searchTerm.slice(lastSlashIndex + 1) + 'g'; // 總是添加全局標記
        
        if (pattern) {
          const regex = new RegExp(pattern, flags);
          matches = this.findRegexMatches(text, regex);
        }
      } else {
        // 一般搜尋：支援多個關鍵字（空格分隔）
        const keywords = searchTerm.split(/\s+/).filter(k => k.length > 0);
        matches = this.findTextMatches(text, keywords);
      }

      // 限制結果數量
      if (matches.length > this.CONFIG.MAX_RESULTS) {
        matches.length = this.CONFIG.MAX_RESULTS;
      }

      // 應用高亮
      if (matches.length > 0) {
        this.applyHighlights(instance, matches);
      }

      // 更新計數器
      this.updateCounter(instance, matches.length);

    } catch (error) {
      console.warn('SearchController: 搜尋錯誤', error);
      this.updateCounter(instance, 0, '搜尋格式錯誤');
    }
  },

  /**
   * 查找文本匹配（支援多關鍵字）
   */
  findTextMatches(text, keywords) {
    const matches = [];
    
    keywords.forEach(keyword => {
      if (!keyword) return;
      
      // 不區分大小寫搜尋
      const lowerText = text.toLowerCase();
      const lowerKeyword = keyword.toLowerCase();
      let startIndex = 0;
      
      while (true) {
        const index = lowerText.indexOf(lowerKeyword, startIndex);
        if (index === -1) break;
        
        matches.push({
          start: index,
          end: index + keyword.length,
          text: text.substring(index, index + keyword.length)
        });
        
        startIndex = index + 1;
      }
    });

    // 按位置排序並合併重疊的匹配
    return this.mergeOverlappingMatches(matches.sort((a, b) => a.start - b.start), text);
  },

  /**
   * 查找正則表達式匹配
   */
  findRegexMatches(text, regex) {
    const matches = [];
    let match;
    
    while ((match = regex.exec(text)) !== null) {
      matches.push({
        start: match.index,
        end: match.index + match[0].length,
        text: match[0]
      });
      
      // 防止無限迴圈
      if (!regex.global) break;
    }
    
    return matches;
  },

  /**
   * 合併重疊的匹配結果
   */
  mergeOverlappingMatches(matches, text) {
    if (matches.length <= 1) return matches;
    
    const merged = [matches[0]];
    
    for (let i = 1; i < matches.length; i++) {
      const current = matches[i];
      const last = merged[merged.length - 1];
      
      if (current.start <= last.end) {
        // 合併重疊部分
        last.end = Math.max(last.end, current.end);
        last.text = text.substring(last.start, last.end);
      } else {
        merged.push(current);
      }
    }
    
    return merged;
  },

  /**
   * 應用高亮效果
   */
  applyHighlights(instance, matches) {
    const { targetTextarea, virtualScrollInstance } = instance;
    
    // 儲存匹配結果
    instance.currentMatches = matches;
    
    // 獲取文本區域樣式
    const styles = this.PositionCalculator.getTextAreaStyles(targetTextarea);
    
    // 計算位置
    const positions = this.PositionCalculator.calculatePositions(targetTextarea, matches, styles);
    
    // 更新虛擬滾動數據
    virtualScrollInstance.allPositions = positions;
    
    // 觸發虛擬滾動更新
    this.VirtualScrollManager.updateVirtualView(virtualScrollInstance, targetTextarea.scrollTop);
  },

  /**
   * 清除高亮效果
   */
  clearHighlights(instance) {
    const { virtualScrollInstance } = instance;
    
    // 清除虛擬滾動數據
    virtualScrollInstance.allPositions = [];
    virtualScrollInstance.visibleHighlights.forEach(highlight => highlight.remove());
    virtualScrollInstance.visibleHighlights.clear();
    
    instance.currentMatches = [];
  },

  /**
   * 更新搜尋計數器
   */
  updateCounter(instance, count, errorMessage = '') {
    const { searchCounter, config } = instance;
    
    if (!config.showCounter) return;
    
    if (errorMessage) {
      searchCounter.textContent = errorMessage;
      searchCounter.className = 'search-counter error';
    } else if (count > 0) {
      const displayCount = count >= this.CONFIG.MAX_RESULTS ? `${this.CONFIG.MAX_RESULTS}+` : count;
      searchCounter.textContent = `${displayCount} 個結果`;
      searchCounter.className = 'search-counter success';
    } else {
      searchCounter.textContent = '';
      searchCounter.className = 'search-counter';
    }
  },

  /**
   * 清除搜尋
   */
  clearSearch(instance) {
    const { searchInput } = instance;
    
    // 清除輸入框
    searchInput.value = '';
    
    // 清除定時器
    if (instance.searchTimeout) {
      clearTimeout(instance.searchTimeout);
      instance.searchTimeout = null;
    }
    
    // 清除高亮
    this.clearHighlights(instance);
    
    // 清除計數器
    this.updateCounter(instance, 0);
    
    // 聚焦到輸入框
    searchInput.focus();
  },

  /**
   * 調整文本區域高度
   */
  adjustTextareaHeight(instance) {
    const { targetTextarea } = instance;
    const searchHeight = 40; // 搜尋框大約高度
    
    // 減少文本區域高度
    if (targetTextarea.style.height) {
      const currentHeight = parseInt(targetTextarea.style.height);
      targetTextarea.style.height = Math.max(100, currentHeight - searchHeight) + 'px';
    } else {
      // 如果沒有明確高度，使用 CSS 調整
      targetTextarea.style.height = 'calc(100% - 50px)';
    }
  },

  /**
   * 移除搜尋功能
   */
  destroy(containerId) {
    const instance = this.activeInstances.get(containerId);
    if (!instance) return;
    
    // 清除定時器
    if (instance.searchTimeout) {
      clearTimeout(instance.searchTimeout);
    }
    
    // 清除高亮
    this.clearHighlights(instance);
    
    // 清除虛擬滾動實例
    this.VirtualScrollManager.destroy(containerId);
    
    // 清除 ResizeObserver
    if (instance.resizeObserver) {
      instance.resizeObserver.disconnect();
    }
    
    // 清除窗口大小變化監聽器
    if (instance.windowResizeHandler) {
      window.removeEventListener('resize', instance.windowResizeHandler);
    }
    
    // 清理位置計算器
    this.PositionCalculator.cleanup();
    
    // 移除搜尋介面
    const searchContainer = instance.container.querySelector('.search-container');
    if (searchContainer) {
      searchContainer.remove();
    }
    
    // 移除高亮覆蓋層
    const overlay = instance.targetTextarea.parentElement.querySelector('.search-highlight-overlay');
    if (overlay) {
      overlay.remove();
    }
    
    // 恢復文本區域高度
    instance.targetTextarea.style.height = instance.originalHeight;
    
    // 移除實例
    this.activeInstances.delete(containerId);
    
    console.log('SearchController: 高性能搜尋功能已移除', containerId);
  }
};

// 暴露到全域
window.SearchController = SearchController;

/**
 * === 使用說明 ===
 * 
 * 基本用法：
 * SearchController.init(containerId, targetTextareaId, options)
 * 
 * 參數說明：
 * - containerId: 搜尋容器的ID（搜尋框會插入到此容器的開頭）
 * - targetTextareaId: 要搜尋的文本區域ID
 * - options: 可選配置物件
 *   - placeholder: 搜尋框的提示文字
 *   - showCounter: 是否顯示結果計數器
 *   - enableRegex: 是否啟用正則表達式搜尋
 * 
 * === 性能特色 ===
 * - 30ms 快速響應防抖
 * - 虛擬滾動技術，處理大量結果
 * - 位置計算快取，避免重複計算
 * - 批量DOM操作，減少重排重繪
 * - 智能快取清理，控制記憶體使用
 * 
 * === 使用示例 ===
 */

// 示例1：為背景知識 textarea 添加搜尋功能
function initBackgroundKnowledgeSearch() {
  if (typeof SearchController !== 'undefined') {
    SearchController.init(
      'background-content', // 背景知識分頁的容器ID
      'backgroundKnowledge', // 背景知識的 textarea ID
      {
        placeholder: '搜尋背景知識...',
        showCounter: true,
        enableRegex: true
      }
    );
    console.log('背景知識搜尋功能已初始化');
  }
}

// 示例2：為指令 textarea 添加搜尋功能
function initInstructionSearch() {
  if (typeof SearchController !== 'undefined') {
    SearchController.init(
      'full-tab', // 全文改寫分頁的容器ID  
      'instruction', // 指令的 textarea ID
      {
        placeholder: '搜尋指令內容...',
        showCounter: true,
        enableRegex: false // 可以針對不同用途禁用正則表達式
      }
    );
    console.log('指令搜尋功能已初始化');
  }
}

// 示例3：為翻譯指令 textarea 添加搜尋功能
function initTranslateInstructionSearch() {
  if (typeof SearchController !== 'undefined') {
    SearchController.init(
      'translate-content', // 翻譯分頁的容器ID
      'translateInstruction', // 翻譯指令的 textarea ID
      {
        placeholder: '搜尋翻譯指令...',
        showCounter: true,
        enableRegex: true
      }
    );
    console.log('翻譯指令搜尋功能已初始化');
  }
}

// 示例4：為中英對照表 textarea 添加搜尋功能
function initZhEnMappingSearch() {
  if (typeof SearchController !== 'undefined') {
    SearchController.init(
      'zh-en-mapping-content', // 中英對照分頁的容器ID
      'zhEnMapping', // 中英對照的 textarea ID
      {
        placeholder: '搜尋中英對照...',
        showCounter: true,
        enableRegex: true
      }
    );
    console.log('中英對照搜尋功能已初始化');
  }
}

// 示例5：為高亮文字 textarea 添加搜尋功能
function initHighlightWordsSearch() {
  if (typeof SearchController !== 'undefined') {
    SearchController.init(
      'highlight-tab', // 高亮分頁的容器ID
      'highlight-words', // 高亮文字的 textarea ID
      {
        placeholder: '搜尋高亮文字...',
        showCounter: true,
        enableRegex: true
      }
    );
    console.log('高亮文字搜尋功能已初始化');
  }
}

/**
 * === 批量初始化函數 ===
 * 如果您想要為多個分頁同時啟用搜尋功能，可以使用以下函數：
 */
function initAllSearchFunctions() {
  // 使用 setTimeout 確保 DOM 元素已準備好
  setTimeout(() => {
    // 取消註解您需要的搜尋功能：
    
    // initBackgroundKnowledgeSearch();
    // initInstructionSearch();
    // initTranslateInstructionSearch();
    // initZhEnMappingSearch();
    // initHighlightWordsSearch();
    
    console.log('批量搜尋功能初始化完成');
  }, 100);
}

/**
 * === 正則表達式搜尋示例 ===
 * 
 * 在搜尋框中輸入以下格式可進行正則表達式搜尋：
 * 
 * /\d+/              - 搜尋所有數字
 * /^\d{4}/           - 搜尋以4位數字開頭的行（股票代碼）
 * /台[^，]*電/        - 搜尋包含"台"和"電"字，中間可有其他字的公司名
 * /(?<!東)南亞/      - 搜尋"南亞"但排除"東南亞"
 * /\b\w+@\w+\.\w+/   - 搜尋電子郵件格式
 * /Q[1-4]/           - 搜尋季度標記（Q1, Q2, Q3, Q4）
 * 
 * === 多關鍵字搜尋示例 ===
 * 
 * 在搜尋框中輸入多個關鍵字（用空格分隔）：
 * 
 * 台積電 營收        - 同時搜尋"台積電"和"營收"
 * 2330 台積         - 同時搜尋"2330"和"台積"
 * API 金鑰 設定      - 同時搜尋"API"、"金鑰"和"設定"
 */

// 暴露示例函數到全域（可選）
window.SearchExamples = {
  initBackgroundKnowledgeSearch,
  initInstructionSearch,
  initTranslateInstructionSearch,
  initZhEnMappingSearch,
  initHighlightWordsSearch,
  initAllSearchFunctions
}; 