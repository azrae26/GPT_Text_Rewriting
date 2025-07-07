/**
 * 文本高亮核心系統
 * 
 * 職責：
 * - 提供高亮功能的主要API介面
 * - 管理目標詞彙和顏色配置
 * - 協調各子系統的運作
 * - 處理高亮的生命週期管理
 * 
 * 依賴：無（基礎層）
 */

const TextHighlightCore = {
  /**
   * 高亮系統配置
   */
  CONFIG: {
    // 高亮顏色配置
    COLORS: [
      '#FF6B6B', // 紅色
      '#4ECDC4', // 青色
      '#45B7D1', // 藍色
      '#96CEB4', // 綠色
      '#FFEAA7', // 黃色
      '#DDA0DD', // 紫色
      '#98D8C8', // 薄荷綠
      '#F7DC6F', // 淺黃
      '#BB8FCE', // 淺紫
      '#85C1E9'  // 淺藍
    ],
    
    // 高亮樣式配置
    HIGHLIGHT_OPACITY: '0.3',
    HIGHLIGHT_Z_INDEX: 10,
    HIGHLIGHT_BORDER_RADIUS: '2px',
    
    // 性能配置
    MAX_HIGHLIGHTS: 5000,
    UPDATE_DEBOUNCE: 50,
    SCROLL_THROTTLE: 16,
    
    // 虛擬滾動配置
    VIRTUAL_SCROLL_THRESHOLD: 100,
    BUFFER_SIZE: 50,
    
    // 緩存配置
    CACHE_MAX_SIZE: 1000,
    CACHE_CLEANUP_THRESHOLD: 1200,
    
    // 事件配置
    EVENTS: {
      WORDS_UPDATED: 'highlight-words-updated',
      HIGHLIGHTS_UPDATED: 'highlight-highlights-updated',
      SCROLL_UPDATED: 'highlight-scroll-updated',
      CACHE_CLEARED: 'highlight-cache-cleared'
    },
    
    // CSS類名配置
    CSS_CLASSES: {
      HIGHLIGHT: 'text-highlight',
      CONTAINER: 'highlight-container',
      VIRTUAL_ITEM: 'highlight-virtual-item'
    }
  },

  /**
   * 系統狀態
   */
  _state: {
    initialized: false,
    targetWords: [],
    colorMap: new Map(),
    activeTextAreas: new Set(),
    isUpdating: false,
    lastUpdateTime: 0
  },

  /**
   * 初始化高亮系統
   * @param {Object} options - 初始化選項
   * @param {Array} options.targetWords - 目標詞彙數組
   * @param {Array} options.colors - 自訂顏色數組（可選）
   * @param {Object} options.config - 配置覆寫（可選）
   */
  initialize(options = {}) {
    const {
      targetWords = [],
      colors = null,
      config = {}
    } = options;

    try {
      // 合併配置
      if (config && Object.keys(config).length > 0) {
        this._mergeConfig(config);
      }

      // 設置目標詞彙
      this.setTargetWords(targetWords, colors);

      // 初始化子系統
      this._initializeSubsystems();

      // 設置事件監聽
      this._setupEventListeners();

      // 標記為已初始化
      this._state.initialized = true;

      this._log('高亮系統初始化完成', 'TextHighlightCore');
      
      // 觸發初始化完成事件
      this._dispatchEvent(this.CONFIG.EVENTS.WORDS_UPDATED, {
        words: this._state.targetWords,
        colorMap: this._state.colorMap
      });

    } catch (error) {
      this._logError('初始化高亮系統失敗', error, 'TextHighlightCore');
    }
  },

  /**
   * 設置目標詞彙
   * @param {Array} words - 詞彙數組
   * @param {Array} colors - 顏色數組（可選）
   */
  setTargetWords(words, colors = null) {
    try {
      // 清理和驗證詞彙
      const cleanWords = this._cleanWords(words);
      
      // 使用提供的顏色或預設顏色
      const colorArray = colors || this.CONFIG.COLORS;
      
      // 更新狀態
      this._state.targetWords = cleanWords;
      this._state.colorMap.clear();
      
      // 建立詞彙到顏色的映射
      cleanWords.forEach((word, index) => {
        const color = colorArray[index % colorArray.length];
        this._state.colorMap.set(word, color);
      });

      this._log(`設置目標詞彙: ${cleanWords.length} 個`, 'TextHighlightCore');
      
      // 觸發詞彙更新事件
      this._dispatchEvent(this.CONFIG.EVENTS.WORDS_UPDATED, {
        words: cleanWords,
        colorMap: this._state.colorMap
      });

    } catch (error) {
      this._logError('設置目標詞彙失敗', error, 'TextHighlightCore');
    }
  },

  /**
   * 添加文本區域到高亮系統
   * @param {HTMLElement} textArea - 文本區域元素
   * @param {Object} options - 選項配置
   */
  addTextArea(textArea, options = {}) {
    if (!textArea || this._state.activeTextAreas.has(textArea)) {
      return;
    }

    try {
      // 添加到活躍列表
      this._state.activeTextAreas.add(textArea);

      // 如果系統已初始化且有目標詞彙，立即更新高亮
      if (this._state.initialized && this._state.targetWords.length > 0) {
        this.updateHighlights(textArea);
      }

      this._log('添加文本區域到高亮系統', 'TextHighlightCore');

    } catch (error) {
      this._logError('添加文本區域失敗', error, 'TextHighlightCore');
    }
  },

  /**
   * 從高亮系統移除文本區域
   * @param {HTMLElement} textArea - 文本區域元素
   */
  removeTextArea(textArea) {
    if (!textArea || !this._state.activeTextAreas.has(textArea)) {
      return;
    }

    try {
      // 清理高亮
      this.clearHighlights(textArea);
      
      // 從活躍列表移除
      this._state.activeTextAreas.delete(textArea);

      this._log('從高亮系統移除文本區域', 'TextHighlightCore');

    } catch (error) {
      this._logError('移除文本區域失敗', error, 'TextHighlightCore');
    }
  },

  /**
   * 更新高亮顯示
   * @param {HTMLElement} textArea - 文本區域元素（可選，不提供則更新所有）
   */
  updateHighlights(textArea = null) {
    // 防抖處理
    if (this._state.isUpdating) {
      return;
    }

    this._state.isUpdating = true;
    this._state.lastUpdateTime = Date.now();

    try {
      const targetAreas = textArea ? [textArea] : Array.from(this._state.activeTextAreas);
      
      targetAreas.forEach(area => {
        if (this._state.targetWords.length > 0) {
          this._updateSingleTextArea(area);
        } else {
          this.clearHighlights(area);
        }
      });

      // 觸發高亮更新事件
      this._dispatchEvent(this.CONFIG.EVENTS.HIGHLIGHTS_UPDATED, {
        textAreas: targetAreas,
        timestamp: this._state.lastUpdateTime
      });

    } catch (error) {
      this._logError('更新高亮失敗', error, 'TextHighlightCore');
    } finally {
      // 延遲重置更新狀態
      setTimeout(() => {
        this._state.isUpdating = false;
      }, this.CONFIG.UPDATE_DEBOUNCE);
    }
  },

  /**
   * 清理指定文本區域的高亮
   * @param {HTMLElement} textArea - 文本區域元素
   */
  clearHighlights(textArea) {
    try {
      if (window.HighlightRenderer) {
        window.HighlightRenderer.clearHighlights(textArea);
      }

      // 清理緩存
      if (window.HighlightPositionCalculator) {
        window.HighlightPositionCalculator.clearCache(textArea);
      }

    } catch (error) {
      this._logError('清理高亮失敗', error, 'TextHighlightCore');
    }
  },

  /**
   * 清理所有高亮
   */
  clearAllHighlights() {
    try {
      this._state.activeTextAreas.forEach(textArea => {
        this.clearHighlights(textArea);
      });

      // 清理全局緩存
      if (window.HighlightPositionCalculator) {
        window.HighlightPositionCalculator.clearAllCache();
      }

      this._dispatchEvent(this.CONFIG.EVENTS.CACHE_CLEARED);

    } catch (error) {
      this._logError('清理所有高亮失敗', error, 'TextHighlightCore');
    }
  },

  /**
   * 獲取詞彙對應的顏色
   * @param {string} word - 詞彙
   * @returns {string} 顏色值
   */
  getColorForWord(word) {
    return this._state.colorMap.get(word) || this.CONFIG.COLORS[0];
  },

  /**
   * 獲取當前目標詞彙
   * @returns {Array} 目標詞彙數組
   */
  getTargetWords() {
    return [...this._state.targetWords];
  },

  /**
   * 獲取顏色映射
   * @returns {Map} 詞彙到顏色的映射
   */
  getColorMap() {
    return new Map(this._state.colorMap);
  },

  /**
   * 檢查系統是否已初始化
   * @returns {boolean} 是否已初始化
   */
  isInitialized() {
    return this._state.initialized;
  },

  /**
   * 獲取活躍的文本區域數量
   * @returns {number} 活躍文本區域數量
   */
  getActiveTextAreaCount() {
    return this._state.activeTextAreas.size;
  },

  /**
   * 銷毀高亮系統
   */
  destroy() {
    try {
      // 清理所有高亮
      this.clearAllHighlights();

      // 移除事件監聽
      this._removeEventListeners();

      // 重置狀態
      this._resetState();

      this._log('高亮系統已銷毀', 'TextHighlightCore');

    } catch (error) {
      this._logError('銷毀高亮系統失敗', error, 'TextHighlightCore');
    }
  },

  /**
   * 更新單個文本區域的高亮
   * @param {HTMLElement} textArea - 文本區域元素
   */
  _updateSingleTextArea(textArea) {
    try {
      if (!textArea || !textArea.value) {
        return;
      }

      // 使用位置計算器和渲染器
      if (window.HighlightPositionCalculator && window.HighlightRenderer) {
        const matches = this._findMatches(textArea.value);
        
        if (matches.length > 0) {
          window.HighlightRenderer.renderHighlights(textArea, matches, this._state.colorMap);
        } else {
          this.clearHighlights(textArea);
        }
      }

    } catch (error) {
      this._logError('更新單個文本區域高亮失敗', error, 'TextHighlightCore');
    }
  },

  /**
   * 查找文本中的匹配項
   * @param {string} text - 文本內容
   * @returns {Array} 匹配項數組
   */
  _findMatches(text) {
    const matches = [];
    
    this._state.targetWords.forEach(word => {
      if (!word || word.length === 0) return;
      
      try {
        const regex = new RegExp(this._escapeRegex(word), 'gi');
        let match;
        
        while ((match = regex.exec(text)) !== null) {
          matches.push({
            word: word,
            match: match[0],
            index: match.index,
            length: match[0].length,
            color: this.getColorForWord(word)
          });
          
          // 防止無限循環
          if (regex.lastIndex === match.index) {
            regex.lastIndex++;
          }
        }
      } catch (error) {
        this._logError(`處理詞彙 "${word}" 時出錯`, error, 'TextHighlightCore');
      }
    });

    // 按位置排序
    return matches.sort((a, b) => a.index - b.index);
  },

  /**
   * 轉義正則表達式特殊字符
   * @param {string} string - 要轉義的字符串
   * @returns {string} 轉義後的字符串
   */
  _escapeRegex(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  },

  /**
   * 清理詞彙數組
   * @param {Array} words - 原始詞彙數組
   * @returns {Array} 清理後的詞彙數組
   */
  _cleanWords(words) {
    if (!Array.isArray(words)) {
      return [];
    }

    return words
      .filter(word => typeof word === 'string' && word.trim().length > 0)
      .map(word => word.trim())
      .filter((word, index, array) => array.indexOf(word) === index); // 去重
  },

  /**
   * 合併配置
   * @param {Object} config - 要合併的配置
   */
  _mergeConfig(config) {
    if (config.colors) {
      this.CONFIG.COLORS = [...config.colors];
    }
    
    if (config.maxHighlights) {
      this.CONFIG.MAX_HIGHLIGHTS = config.maxHighlights;
    }
    
    if (config.updateDebounce) {
      this.CONFIG.UPDATE_DEBOUNCE = config.updateDebounce;
    }
  },

  /**
   * 初始化子系統
   */
  _initializeSubsystems() {
    // 子系統將在它們各自的檔案中初始化
    this._log('子系統初始化完成', 'TextHighlightCore');
  },

  /**
   * 設置事件監聽
   */
  _setupEventListeners() {
    // 監聽頁面可見性變化
    document.addEventListener('visibilitychange', this._handleVisibilityChange.bind(this));
  },

  /**
   * 移除事件監聽
   */
  _removeEventListeners() {
    document.removeEventListener('visibilitychange', this._handleVisibilityChange.bind(this));
  },

  /**
   * 處理頁面可見性變化
   */
  _handleVisibilityChange() {
    if (document.visibilityState === 'visible') {
      // 頁面重新可見時，刷新高亮
      this.updateHighlights();
    }
  },

  /**
   * 重置系統狀態
   */
  _resetState() {
    this._state = {
      initialized: false,
      targetWords: [],
      colorMap: new Map(),
      activeTextAreas: new Set(),
      isUpdating: false,
      lastUpdateTime: 0
    };
  },

  /**
   * 觸發自定義事件
   * @param {string} eventType - 事件類型
   * @param {Object} detail - 事件詳情
   */
  _dispatchEvent(eventType, detail = {}) {
    window.dispatchEvent(new CustomEvent(eventType, { detail }));
  },

  /**
   * 記錄日誌
   * @param {string} message - 日誌訊息
   * @param {string} source - 來源標識
   */
  _log(message, source) {
    const timestamp = new Date().toLocaleTimeString();
    console.log(`[${source}][${timestamp}] ${message}`);
  },

  /**
   * 記錄錯誤日誌
   * @param {string} message - 錯誤訊息
   * @param {Error} error - 錯誤對象
   * @param {string} source - 來源標識
   */
  _logError(message, error, source) {
    const timestamp = new Date().toLocaleTimeString();
    console.error(`[${source}][${timestamp}] ❌ ${message}`, error);
  }
};

// 暴露到全局
window.TextHighlightCore = TextHighlightCore; 