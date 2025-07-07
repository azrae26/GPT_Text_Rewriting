/**
 * 高亮渲染和UI管理系統
 * 
 * 職責：
 * - 創建和管理高亮元素
 * - 處理高亮樣式和動畫
 * - 管理高亮元素的生命週期
 * - 提供高效的DOM操作
 * 
 * 依賴：
 * - highlight-core.js (TextHighlightCore)
 * - highlight-position.js (HighlightPositionCalculator)
 */

const HighlightRenderer = {
  /**
   * 活躍的高亮容器映射
   */
  _activeContainers: new Map(),

  /**
   * 高亮元素池（重用機制）
   */
  _elementPool: [],

  /**
   * 渲染統計
   */
  _renderStats: {
    totalElements: 0,
    poolHits: 0,
    poolMisses: 0,
    lastRenderTime: 0
  },

  /**
   * 渲染高亮
   * @param {HTMLElement} textArea - 文本區域元素
   * @param {Array} matches - 匹配項數組
   * @param {Map} colorMap - 顏色映射
   */
  renderHighlights(textArea, matches, colorMap) {
    if (!textArea || !Array.isArray(matches)) {
      return;
    }

    try {
      const startTime = performance.now();

      // 獲取或創建高亮容器
      const container = this._getOrCreateContainer(textArea);
      
      // 清理現有高亮
      this._clearContainerHighlights(container);

      // 計算位置
      const positions = window.HighlightPositionCalculator 
        ? window.HighlightPositionCalculator.calculateMultiplePositions(textArea, matches)
        : [];

      // 創建高亮元素
      const elements = this._createHighlightElements(positions, colorMap);

      // 添加到容器
      elements.forEach(element => {
        container.appendChild(element);
      });

      // 更新統計
      this._renderStats.totalElements = elements.length;
      this._renderStats.lastRenderTime = performance.now() - startTime;

      this._log(`渲染完成: ${elements.length} 個高亮，耗時 ${this._renderStats.lastRenderTime.toFixed(2)}ms`, 'HighlightRenderer');

    } catch (error) {
      this._logError('渲染高亮失敗', error, 'HighlightRenderer');
    }
  },

  /**
   * 清理指定文本區域的高亮
   * @param {HTMLElement} textArea - 文本區域元素
   */
  clearHighlights(textArea) {
    if (!textArea) return;

    try {
      const container = this._activeContainers.get(textArea);
      if (container) {
        this._clearContainerHighlights(container);
        this._log('清理高亮完成', 'HighlightRenderer');
      }
    } catch (error) {
      this._logError('清理高亮失敗', error, 'HighlightRenderer');
    }
  },

  /**
   * 獲取或創建高亮容器
   * @param {HTMLElement} textArea - 文本區域元素
   * @returns {HTMLElement} 高亮容器
   */
  _getOrCreateContainer(textArea) {
    let container = this._activeContainers.get(textArea);
    
    if (!container) {
      container = this._createContainer(textArea);
      this._activeContainers.set(textArea, container);
      this._setupContainerEvents(textArea, container);
    }

    return container;
  },

  /**
   * 創建高亮容器
   * @param {HTMLElement} textArea - 文本區域元素
   * @returns {HTMLElement} 高亮容器
   */
  _createContainer(textArea) {
    const container = document.createElement('div');
    const config = window.TextHighlightCore?.CONFIG;
    
    container.className = config?.CSS_CLASSES.CONTAINER || 'highlight-container';
    container.style.cssText = this._getContainerStyles(textArea);

    // 插入到文本區域的父元素中
    textArea.parentNode.insertBefore(container, textArea);

    this._log('創建高亮容器', 'HighlightRenderer');
    return container;
  },

  /**
   * 獲取容器樣式
   * @param {HTMLElement} textArea - 文本區域元素
   * @returns {string} CSS樣式字符串
   */
  _getContainerStyles(textArea) {
    const rect = textArea.getBoundingClientRect();
    const computedStyle = window.getComputedStyle(textArea);
    
    return `
      position: absolute;
      top: ${textArea.offsetTop}px;
      left: ${textArea.offsetLeft}px;
      width: ${textArea.offsetWidth}px;
      height: ${textArea.offsetHeight}px;
      pointer-events: none;
      overflow: hidden;
      z-index: ${window.TextHighlightCore?.CONFIG.HIGHLIGHT_Z_INDEX || 10};
      border: ${computedStyle.border};
      border-radius: ${computedStyle.borderRadius};
    `;
  },

  /**
   * 設置容器事件
   * @param {HTMLElement} textArea - 文本區域元素
   * @param {HTMLElement} container - 高亮容器
   */
  _setupContainerEvents(textArea, container) {
    // 監聽文本區域的滾動事件
    const updatePosition = () => {
      this._updateContainerPosition(textArea, container);
    };

    textArea.addEventListener('scroll', updatePosition);
    window.addEventListener('resize', updatePosition);

    // 存儲清理函數
    container._cleanup = () => {
      textArea.removeEventListener('scroll', updatePosition);
      window.removeEventListener('resize', updatePosition);
    };
  },

  /**
   * 更新容器位置
   * @param {HTMLElement} textArea - 文本區域元素
   * @param {HTMLElement} container - 高亮容器
   */
  _updateContainerPosition(textArea, container) {
    const style = this._getContainerStyles(textArea);
    container.style.cssText = style;

    // 更新所有高亮元素的位置
    const highlights = container.children;
    for (let i = 0; i < highlights.length; i++) {
      const highlight = highlights[i];
      const scrollLeft = textArea.scrollLeft || 0;
      const scrollTop = textArea.scrollTop || 0;
      
      if (highlight._originalX !== undefined && highlight._originalY !== undefined) {
        highlight.style.left = `${highlight._originalX - scrollLeft}px`;
        highlight.style.top = `${highlight._originalY - scrollTop}px`;
      }
    }
  },

  /**
   * 清理容器中的高亮元素
   * @param {HTMLElement} container - 高亮容器
   */
  _clearContainerHighlights(container) {
    if (!container) return;

    // 將元素回收到池中
    while (container.firstChild) {
      const element = container.firstChild;
      container.removeChild(element);
      this._recycleElement(element);
    }
  },

  /**
   * 創建高亮元素數組
   * @param {Array} positions - 位置信息數組
   * @param {Map} colorMap - 顏色映射
   * @returns {Array} 高亮元素數組
   */
  _createHighlightElements(positions, colorMap) {
    return positions.map(positionInfo => {
      const { match } = positionInfo;
      const color = colorMap.get(match.word) || window.TextHighlightCore?.CONFIG.COLORS[0];
      return this._createSingleHighlight(positionInfo, color);
    });
  },

  /**
   * 創建單個高亮元素
   * @param {Object} positionInfo - 位置信息
   * @param {string} color - 高亮顏色
   * @returns {HTMLElement} 高亮元素
   */
  _createSingleHighlight(positionInfo, color) {
    const element = this._getElementFromPool();
    const config = window.TextHighlightCore?.CONFIG;

    // 設置基本屬性
    element.className = config?.CSS_CLASSES.HIGHLIGHT || 'text-highlight';
    
    // 設置樣式
    const styles = this._getHighlightStyles(positionInfo, color);
    element.style.cssText = styles;

    // 存儲原始位置（用於滾動更新）
    element._originalX = positionInfo.x;
    element._originalY = positionInfo.y;
    element._matchInfo = positionInfo.match;

    // 設置數據屬性
    element.setAttribute('data-word', positionInfo.match.word);
    element.setAttribute('data-index', positionInfo.match.index);

    return element;
  },

  /**
   * 獲取高亮樣式
   * @param {Object} positionInfo - 位置信息
   * @param {string} color - 高亮顏色
   * @returns {string} CSS樣式字符串
   */
  _getHighlightStyles(positionInfo, color) {
    const config = window.TextHighlightCore?.CONFIG;
    
    return `
      position: absolute;
      left: ${positionInfo.x}px;
      top: ${positionInfo.y}px;
      width: ${positionInfo.width}px;
      height: ${positionInfo.height}px;
      background-color: ${color};
      opacity: ${config?.HIGHLIGHT_OPACITY || '0.3'};
      border-radius: ${config?.HIGHLIGHT_BORDER_RADIUS || '2px'};
      pointer-events: none;
      z-index: 1;
      transition: opacity 0.2s ease;
    `;
  },

  /**
   * 從元素池獲取元素
   * @returns {HTMLElement} 高亮元素
   */
  _getElementFromPool() {
    if (this._elementPool.length > 0) {
      this._renderStats.poolHits++;
      return this._elementPool.pop();
    } else {
      this._renderStats.poolMisses++;
      return document.createElement('div');
    }
  },

  /**
   * 回收元素到池中
   * @param {HTMLElement} element - 要回收的元素
   */
  _recycleElement(element) {
    if (!element) return;

    // 清理元素狀態
    element.style.cssText = '';
    element.className = '';
    element.removeAttribute('data-word');
    element.removeAttribute('data-index');
    element._originalX = undefined;
    element._originalY = undefined;
    element._matchInfo = undefined;

    // 限制池大小
    if (this._elementPool.length < 100) {
      this._elementPool.push(element);
    }
  },

  /**
   * 移除文本區域的容器
   * @param {HTMLElement} textArea - 文本區域元素
   */
  removeContainer(textArea) {
    const container = this._activeContainers.get(textArea);
    if (container) {
      // 清理高亮
      this._clearContainerHighlights(container);
      
      // 清理事件
      if (container._cleanup) {
        container._cleanup();
      }
      
      // 移除DOM元素
      if (container.parentNode) {
        container.parentNode.removeChild(container);
      }
      
      // 從映射中移除
      this._activeContainers.delete(textArea);
      
      this._log('移除高亮容器', 'HighlightRenderer');
    }
  },

  /**
   * 獲取渲染統計
   * @returns {Object} 渲染統計信息
   */
  getRenderStats() {
    const poolEfficiency = this._renderStats.poolHits + this._renderStats.poolMisses > 0
      ? (this._renderStats.poolHits / (this._renderStats.poolHits + this._renderStats.poolMisses) * 100).toFixed(2)
      : 0;

    return {
      ...this._renderStats,
      poolSize: this._elementPool.length,
      poolEfficiency: `${poolEfficiency}%`,
      activeContainers: this._activeContainers.size
    };
  },

  /**
   * 清理所有資源
   */
  cleanup() {
    // 清理所有容器
    this._activeContainers.forEach((container, textArea) => {
      this.removeContainer(textArea);
    });

    // 清空元素池
    this._elementPool = [];

    // 重置統計
    this._renderStats = {
      totalElements: 0,
      poolHits: 0,
      poolMisses: 0,
      lastRenderTime: 0
    };

    this._log('清理渲染器資源完成', 'HighlightRenderer');
  },

  /**
   * 記錄日誌
   * @param {string} message - 日誌訊息
   * @param {string} source - 來源標識
   */
  _log(message, source) {
    if (window.TextHighlightCore) {
      window.TextHighlightCore._log(message, source);
    } else {
      console.log(`[${source}] ${message}`);
    }
  },

  /**
   * 記錄錯誤日誌
   * @param {string} message - 錯誤訊息
   * @param {Error} error - 錯誤對象
   * @param {string} source - 來源標識
   */
  _logError(message, error, source) {
    if (window.TextHighlightCore) {
      window.TextHighlightCore._logError(message, error, source);
    } else {
      console.error(`[${source}] ❌ ${message}`, error);
    }
  }
};

/**
 * 高亮UI管理器
 * 
 * 職責：
 * - 管理高亮的視覺效果和動畫
 * - 處理用戶交互
 * - 提供高亮的高級UI功能
 */
const HighlightUIManager = {
  /**
   * 動畫配置
   */
  _animationConfig: {
    fadeIn: {
      duration: 200,
      easing: 'ease-out'
    },
    fadeOut: {
      duration: 150,
      easing: 'ease-in'
    },
    pulse: {
      duration: 600,
      iterations: 2
    }
  },

  /**
   * 活躍動畫映射
   */
  _activeAnimations: new Map(),

  /**
   * 添加高亮動畫效果
   * @param {HTMLElement} element - 高亮元素
   * @param {string} animationType - 動畫類型
   */
  addAnimation(element, animationType = 'fadeIn') {
    if (!element || !this._animationConfig[animationType]) {
      return;
    }

    try {
      const config = this._animationConfig[animationType];
      let animation;

      switch (animationType) {
        case 'fadeIn':
          element.style.opacity = '0';
          animation = element.animate([
            { opacity: 0, transform: 'scale(0.9)' },
            { opacity: window.TextHighlightCore?.CONFIG.HIGHLIGHT_OPACITY || '0.3', transform: 'scale(1)' }
          ], config);
          break;

        case 'fadeOut':
          animation = element.animate([
            { opacity: window.TextHighlightCore?.CONFIG.HIGHLIGHT_OPACITY || '0.3' },
            { opacity: 0, transform: 'scale(0.9)' }
          ], config);
          break;

        case 'pulse':
          animation = element.animate([
            { transform: 'scale(1)', opacity: window.TextHighlightCore?.CONFIG.HIGHLIGHT_OPACITY || '0.3' },
            { transform: 'scale(1.1)', opacity: '0.5' },
            { transform: 'scale(1)', opacity: window.TextHighlightCore?.CONFIG.HIGHLIGHT_OPACITY || '0.3' }
          ], config);
          break;
      }

      if (animation) {
        this._activeAnimations.set(element, animation);
        
        animation.addEventListener('finish', () => {
          this._activeAnimations.delete(element);
          if (animationType === 'fadeOut') {
            element.style.opacity = '0';
          }
        });
      }

    } catch (error) {
      this._logError('添加動畫失敗', error, 'HighlightUIManager');
    }
  },

  /**
   * 設置高亮交互效果
   * @param {HTMLElement} container - 高亮容器
   */
  setupInteractionEffects(container) {
    if (!container) return;

    try {
      // 鼠標懸停效果
      container.addEventListener('mouseover', this._handleMouseOver.bind(this));
      container.addEventListener('mouseout', this._handleMouseOut.bind(this));
      
      // 點擊效果
      container.addEventListener('click', this._handleClick.bind(this));

    } catch (error) {
      this._logError('設置交互效果失敗', error, 'HighlightUIManager');
    }
  },

  /**
   * 處理鼠標懸停
   * @param {Event} e - 事件對象
   */
  _handleMouseOver(e) {
    const highlight = e.target.closest('.text-highlight');
    if (highlight) {
      highlight.style.opacity = '0.6';
      highlight.style.transform = 'scale(1.05)';
      highlight.style.zIndex = '2';
      
      // 顯示提示信息
      this._showTooltip(highlight, e);
    }
  },

  /**
   * 處理鼠標離開
   * @param {Event} e - 事件對象
   */
  _handleMouseOut(e) {
    const highlight = e.target.closest('.text-highlight');
    if (highlight) {
      const config = window.TextHighlightCore?.CONFIG;
      highlight.style.opacity = config?.HIGHLIGHT_OPACITY || '0.3';
      highlight.style.transform = 'scale(1)';
      highlight.style.zIndex = '1';
      
      // 隱藏提示信息
      this._hideTooltip();
    }
  },

  /**
   * 處理點擊事件
   * @param {Event} e - 事件對象
   */
  _handleClick(e) {
    const highlight = e.target.closest('.text-highlight');
    if (highlight) {
      // 添加點擊動畫
      this.addAnimation(highlight, 'pulse');
      
      // 觸發自定義事件
      const word = highlight.getAttribute('data-word');
      const index = highlight.getAttribute('data-index');
      
      window.dispatchEvent(new CustomEvent('highlight-clicked', {
        detail: { word, index, element: highlight }
      }));
    }
  },

  /**
   * 顯示提示信息
   * @param {HTMLElement} highlight - 高亮元素
   * @param {Event} e - 事件對象
   */
  _showTooltip(highlight, e) {
    const word = highlight.getAttribute('data-word');
    const index = highlight.getAttribute('data-index');
    
    if (!word) return;

    const tooltip = this._getOrCreateTooltip();
    tooltip.textContent = `詞彙: ${word} (位置: ${index})`;
    tooltip.style.left = `${e.pageX + 10}px`;
    tooltip.style.top = `${e.pageY - 30}px`;
    tooltip.style.display = 'block';
  },

  /**
   * 隱藏提示信息
   */
  _hideTooltip() {
    const tooltip = document.getElementById('highlight-tooltip');
    if (tooltip) {
      tooltip.style.display = 'none';
    }
  },

  /**
   * 獲取或創建提示框
   * @returns {HTMLElement} 提示框元素
   */
  _getOrCreateTooltip() {
    let tooltip = document.getElementById('highlight-tooltip');
    
    if (!tooltip) {
      tooltip = document.createElement('div');
      tooltip.id = 'highlight-tooltip';
      tooltip.style.cssText = `
        position: absolute;
        background: rgba(0, 0, 0, 0.8);
        color: white;
        padding: 4px 8px;
        border-radius: 4px;
        font-size: 12px;
        white-space: nowrap;
        z-index: 10000;
        display: none;
        pointer-events: none;
      `;
      document.body.appendChild(tooltip);
    }
    
    return tooltip;
  },

  /**
   * 停止所有動畫
   */
  stopAllAnimations() {
    this._activeAnimations.forEach(animation => {
      animation.cancel();
    });
    this._activeAnimations.clear();
  },

  /**
   * 清理UI資源
   */
  cleanup() {
    // 停止所有動畫
    this.stopAllAnimations();
    
    // 移除提示框
    const tooltip = document.getElementById('highlight-tooltip');
    if (tooltip) {
      tooltip.remove();
    }

    this._log('清理UI管理器資源完成', 'HighlightUIManager');
  },

  /**
   * 記錄日誌
   * @param {string} message - 日誌訊息
   * @param {string} source - 來源標識
   */
  _log(message, source) {
    if (window.TextHighlightCore) {
      window.TextHighlightCore._log(message, source);
    } else {
      console.log(`[${source}] ${message}`);
    }
  },

  /**
   * 記錄錯誤日誌
   * @param {string} message - 錯誤訊息
   * @param {Error} error - 錯誤對象
   * @param {string} source - 來源標識
   */
  _logError(message, error, source) {
    if (window.TextHighlightCore) {
      window.TextHighlightCore._logError(message, error, source);
    } else {
      console.error(`[${source}] ❌ ${message}`, error);
    }
  }
};

// 暴露到全局
window.HighlightRenderer = HighlightRenderer;
window.HighlightUIManager = HighlightUIManager; 