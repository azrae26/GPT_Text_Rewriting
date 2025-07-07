/**
 * 高亮位置計算系統
 * 
 * 職責：
 * - 計算文本中各個字符的精確位置
 * - 提供高效的位置緩存機制
 * - 處理文本變化和樣式變化
 * - 支持虛擬滾動的位置計算
 * 
 * 依賴：
 * - highlight-core.js (TextHighlightCore)
 */

const HighlightPositionCalculator = {
  /**
   * 位置計算緩存
   */
  _cache: new Map(),

  /**
   * 緩存統計
   */
  _cacheStats: {
    hits: 0,
    misses: 0,
    size: 0
  },

  /**
   * 計算文本中指定位置的座標
   * @param {HTMLElement} textArea - 文本區域元素
   * @param {number} index - 字符索引
   * @param {string} text - 文本內容
   * @param {string} matchedText - 匹配的文本（可選）
   * @returns {Object} 位置信息
   */
  calculatePosition(textArea, index, text, matchedText = '') {
    if (!textArea || index < 0 || index > text.length) {
      return null;
    }

    try {
      // 檢查緩存
      const cacheKey = this._getCacheKey(textArea, index, text, matchedText);
      const cached = this._cache.get(cacheKey);
      
      if (cached) {
        this._cacheStats.hits++;
        return cached;
      }

      // 計算新位置
      const position = this._computePosition(textArea, index, text, matchedText);
      
      if (position) {
        // 緩存結果
        this._cache.set(cacheKey, position);
        this._cacheStats.misses++;
        this._cacheStats.size = this._cache.size;
        
        // 檢查緩存大小
        this._checkCacheSize();
      }

      return position;

    } catch (error) {
      this._logError('計算位置失敗', error, 'HighlightPositionCalculator');
      return null;
    }
  },

  /**
   * 批量計算多個位置
   * @param {HTMLElement} textArea - 文本區域元素
   * @param {Array} matches - 匹配項數組
   * @returns {Array} 位置信息數組
   */
  calculateMultiplePositions(textArea, matches) {
    if (!textArea || !Array.isArray(matches)) {
      return [];
    }

    const positions = [];
    const text = textArea.value || '';

    for (const match of matches) {
      const position = this.calculatePosition(textArea, match.index, text, match.match);
      if (position) {
        positions.push({
          ...position,
          match: match
        });
      }
    }

    return positions;
  },

  /**
   * 計算單個位置（實際計算邏輯）
   * @param {HTMLElement} textArea - 文本區域元素
   * @param {number} index - 字符索引
   * @param {string} text - 文本內容
   * @param {string} matchedText - 匹配的文本
   * @returns {Object} 位置信息
   */
  _computePosition(textArea, index, text, matchedText) {
    // 獲取文本區域樣式
    const styles = this._getTextAreaStyles(textArea);
    
    // 創建測量元素
    const measureElement = this._createMeasureElement(textArea, styles);
    
    // 分析文本到指定索引的內容
    const beforeText = text.substring(0, index);
    const matchLength = matchedText.length || 1;
    
    // 計算基礎位置
    const basePosition = this._measureTextPosition(measureElement, beforeText, styles);
    
    // 計算匹配文本的寬度
    const matchWidth = this._measureTextWidth(measureElement, matchedText || text.charAt(index), styles);
    
    // 清理測量元素
    document.body.removeChild(measureElement);
    
    // 計算相對於文本區域的位置
    const textAreaRect = textArea.getBoundingClientRect();
    const scrollLeft = textArea.scrollLeft || 0;
    const scrollTop = textArea.scrollTop || 0;
    
    return {
      x: basePosition.x - scrollLeft + styles.paddingLeft,
      y: basePosition.y - scrollTop + styles.paddingTop,
      width: matchWidth,
      height: styles.lineHeight,
      lineHeight: styles.lineHeight,
      fontSize: styles.fontSize,
      absoluteX: textAreaRect.left + basePosition.x - scrollLeft + styles.paddingLeft,
      absoluteY: textAreaRect.top + basePosition.y - scrollTop + styles.paddingTop,
      index: index,
      matchLength: matchLength,
      scrollLeft: scrollLeft,
      scrollTop: scrollTop
    };
  },

  /**
   * 測量文本位置
   * @param {HTMLElement} measureElement - 測量元素
   * @param {string} text - 要測量的文本
   * @param {Object} styles - 樣式信息
   * @returns {Object} 位置信息
   */
  _measureTextPosition(measureElement, text, styles) {
    measureElement.textContent = text;
    
    // 計算行數和當前行的位置
    const lines = text.split('\n');
    const lineNumber = lines.length - 1;
    const currentLineText = lines[lineNumber] || '';
    
    // 測量當前行的寬度
    const tempElement = measureElement.cloneNode();
    tempElement.textContent = currentLineText;
    document.body.appendChild(tempElement);
    
    const width = tempElement.offsetWidth;
    const height = lineNumber * styles.lineHeight;
    
    document.body.removeChild(tempElement);
    
    return {
      x: width,
      y: height
    };
  },

  /**
   * 測量文本寬度
   * @param {HTMLElement} measureElement - 測量元素
   * @param {string} text - 要測量的文本
   * @param {Object} styles - 樣式信息
   * @returns {number} 文本寬度
   */
  _measureTextWidth(measureElement, text, styles) {
    measureElement.textContent = text;
    return measureElement.offsetWidth;
  },

  /**
   * 創建測量元素
   * @param {HTMLElement} textArea - 文本區域元素
   * @param {Object} styles - 樣式信息
   * @returns {HTMLElement} 測量元素
   */
  _createMeasureElement(textArea, styles) {
    const element = document.createElement('div');
    
    element.style.cssText = `
      position: absolute;
      visibility: hidden;
      height: auto;
      width: auto;
      white-space: pre;
      font-family: ${styles.fontFamily};
      font-size: ${styles.fontSize}px;
      font-weight: ${styles.fontWeight};
      line-height: ${styles.lineHeight}px;
      letter-spacing: ${styles.letterSpacing};
      word-spacing: ${styles.wordSpacing};
      top: -9999px;
      left: -9999px;
    `;
    
    document.body.appendChild(element);
    return element;
  },

  /**
   * 獲取文本區域樣式
   * @param {HTMLElement} textArea - 文本區域元素
   * @returns {Object} 樣式信息
   */
  _getTextAreaStyles(textArea) {
    const computedStyle = window.getComputedStyle(textArea);
    
    const fontSize = parseFloat(computedStyle.fontSize) || 16;
    const lineHeight = parseFloat(computedStyle.lineHeight) || fontSize * 1.2;
    
    return {
      fontFamily: computedStyle.fontFamily || 'monospace',
      fontSize: fontSize,
      fontWeight: computedStyle.fontWeight || 'normal',
      lineHeight: lineHeight,
      letterSpacing: computedStyle.letterSpacing || 'normal',
      wordSpacing: computedStyle.wordSpacing || 'normal',
      paddingLeft: parseFloat(computedStyle.paddingLeft) || 0,
      paddingTop: parseFloat(computedStyle.paddingTop) || 0,
      paddingRight: parseFloat(computedStyle.paddingRight) || 0,
      paddingBottom: parseFloat(computedStyle.paddingBottom) || 0,
      borderLeft: parseFloat(computedStyle.borderLeftWidth) || 0,
      borderTop: parseFloat(computedStyle.borderTopWidth) || 0
    };
  },

  /**
   * 分析文本變化
   * @param {string} oldText - 舊文本
   * @param {string} newText - 新文本
   * @returns {Object} 變化分析結果
   */
  analyzeTextChange(oldText, newText) {
    if (oldText === newText) {
      return { hasChange: false };
    }

    // 找到變化的起始位置
    let startIndex = 0;
    const minLength = Math.min(oldText.length, newText.length);
    
    while (startIndex < minLength && oldText[startIndex] === newText[startIndex]) {
      startIndex++;
    }

    // 找到變化的結束位置
    let endIndexOld = oldText.length - 1;
    let endIndexNew = newText.length - 1;
    
    while (endIndexOld >= startIndex && endIndexNew >= startIndex && 
           oldText[endIndexOld] === newText[endIndexNew]) {
      endIndexOld--;
      endIndexNew--;
    }

    return {
      hasChange: true,
      startIndex: startIndex,
      oldEndIndex: endIndexOld,
      newEndIndex: endIndexNew,
      deletedText: oldText.substring(startIndex, endIndexOld + 1),
      insertedText: newText.substring(startIndex, endIndexNew + 1),
      lengthDelta: newText.length - oldText.length
    };
  },

  /**
   * 獲取緩存鍵
   * @param {HTMLElement} textArea - 文本區域元素
   * @param {number} index - 字符索引
   * @param {string} text - 文本內容
   * @param {string} matchedText - 匹配的文本
   * @returns {string} 緩存鍵
   */
  _getCacheKey(textArea, index, text, matchedText) {
    const textAreaId = textArea.id || textArea.className || 'unknown';
    const textHash = this._simpleHash(text);
    return `${textAreaId}_${index}_${textHash}_${matchedText}`;
  },

  /**
   * 簡單字符串哈希
   * @param {string} str - 字符串
   * @returns {number} 哈希值
   */
  _simpleHash(str) {
    let hash = 0;
    if (str.length === 0) return hash;
    
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // 轉為32位整數
    }
    
    return Math.abs(hash);
  },

  /**
   * 檢查緩存大小並清理
   */
  _checkCacheSize() {
    if (window.TextHighlightCore) {
      const maxSize = window.TextHighlightCore.CONFIG.CACHE_MAX_SIZE;
      const cleanupThreshold = window.TextHighlightCore.CONFIG.CACHE_CLEANUP_THRESHOLD;
      
      if (this._cache.size > cleanupThreshold) {
        this._cleanupCache(maxSize);
      }
    }
  },

  /**
   * 清理緩存
   * @param {number} targetSize - 目標大小
   */
  _cleanupCache(targetSize) {
    const entries = Array.from(this._cache.entries());
    entries.sort((a, b) => b[1].lastAccess - a[1].lastAccess); // 按最後訪問時間排序
    
    // 保留最近使用的條目
    this._cache.clear();
    for (let i = 0; i < Math.min(targetSize, entries.length); i++) {
      this._cache.set(entries[i][0], entries[i][1]);
    }
    
    this._cacheStats.size = this._cache.size;
    this._log(`緩存清理完成，當前大小: ${this._cache.size}`, 'HighlightPositionCalculator');
  },

  /**
   * 清理特定文本區域的緩存
   * @param {HTMLElement} textArea - 文本區域元素
   */
  clearCache(textArea) {
    if (!textArea) return;
    
    const textAreaId = textArea.id || textArea.className || 'unknown';
    const keysToDelete = [];
    
    for (const key of this._cache.keys()) {
      if (key.startsWith(textAreaId + '_')) {
        keysToDelete.push(key);
      }
    }
    
    keysToDelete.forEach(key => this._cache.delete(key));
    this._cacheStats.size = this._cache.size;
    
    this._log(`清理文本區域緩存: ${keysToDelete.length} 個條目`, 'HighlightPositionCalculator');
  },

  /**
   * 清理所有緩存
   */
  clearAllCache() {
    this._cache.clear();
    this._cacheStats = {
      hits: 0,
      misses: 0,
      size: 0
    };
    
    this._log('清理所有位置緩存', 'HighlightPositionCalculator');
  },

  /**
   * 獲取緩存統計信息
   * @returns {Object} 緩存統計
   */
  getCacheStats() {
    const hitRate = this._cacheStats.hits + this._cacheStats.misses > 0 
      ? (this._cacheStats.hits / (this._cacheStats.hits + this._cacheStats.misses) * 100).toFixed(2)
      : 0;
      
    return {
      ...this._cacheStats,
      hitRate: `${hitRate}%`
    };
  },

  /**
   * 預計算位置（用於性能優化）
   * @param {HTMLElement} textArea - 文本區域元素
   * @param {Array} indices - 要預計算的索引數組
   * @param {string} text - 文本內容
   */
  preCalculatePositions(textArea, indices, text) {
    if (!textArea || !Array.isArray(indices) || !text) {
      return;
    }

    // 批量計算
    indices.forEach(index => {
      this.calculatePosition(textArea, index, text);
    });

    this._log(`預計算 ${indices.length} 個位置`, 'HighlightPositionCalculator');
  },

  /**
   * 獲取文本區域樣式（向後兼容公開方法）
   * @param {HTMLElement} textArea - 文本區域元素
   * @returns {Object} 樣式信息
   */
  getTextAreaStyles(textArea) {
    return this._getTextAreaStyles(textArea);
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
 * 全域位置緩存管理器
 * 
 * 職責：
 * - 提供更高級的緩存管理功能
 * - 處理跨文本區域的緩存一致性
 * - 提供緩存性能監控
 */
const GlobalPositionCache = {
  /**
   * 緩存存儲
   */
  _storage: new Map(),

  /**
   * 緩存元數據
   */
  _metadata: new Map(),

  /**
   * 性能監控
   */
  _performance: {
    totalRequests: 0,
    cacheHits: 0,
    averageComputeTime: 0,
    lastCleanupTime: 0
  },

  /**
   * 獲取緩存項
   * @param {string} text - 文本內容
   * @param {number} index - 字符索引
   * @param {string} matchedText - 匹配的文本
   * @returns {Object|null} 緩存的位置信息
   */
  get(text, index, matchedText) {
    this._performance.totalRequests++;
    
    const key = this._generateKey(text, index, matchedText);
    const cached = this._storage.get(key);
    
    if (cached) {
      this._performance.cacheHits++;
      
      // 更新訪問時間
      const metadata = this._metadata.get(key);
      if (metadata) {
        metadata.lastAccess = Date.now();
        metadata.accessCount++;
      }
      
      return cached;
    }
    
    return null;
  },

  /**
   * 設置緩存項
   * @param {string} text - 文本內容
   * @param {number} index - 字符索引
   * @param {string} matchedText - 匹配的文本
   * @param {Object} position - 位置信息
   */
  set(text, index, matchedText, position) {
    const key = this._generateKey(text, index, matchedText);
    const now = Date.now();
    
    this._storage.set(key, position);
    this._metadata.set(key, {
      createdAt: now,
      lastAccess: now,
      accessCount: 1,
      textLength: text.length
    });
    
    // 檢查是否需要清理
    this._checkAndCleanup();
  },

  /**
   * 生成緩存鍵
   * @param {string} text - 文本內容
   * @param {number} index - 字符索引
   * @param {string} matchedText - 匹配的文本
   * @returns {string} 緩存鍵
   */
  _generateKey(text, index, matchedText) {
    const textHash = this._fastHash(text);
    return `${textHash}_${index}_${matchedText}`;
  },

  /**
   * 快速哈希函數
   * @param {string} str - 字符串
   * @returns {string} 哈希值
   */
  _fastHash(str) {
    let hash = 0;
    const len = Math.min(str.length, 1000); // 限制哈希計算的字符數
    
    for (let i = 0; i < len; i++) {
      hash = (hash << 5) - hash + str.charCodeAt(i);
      hash = hash & hash; // 轉為32位整數
    }
    
    return hash.toString(36);
  },

  /**
   * 檢查並清理緩存
   */
  _checkAndCleanup() {
    const config = window.TextHighlightCore?.CONFIG;
    if (!config) return;
    
    if (this._storage.size > config.CACHE_CLEANUP_THRESHOLD) {
      this._performCleanup(config.CACHE_MAX_SIZE);
    }
  },

  /**
   * 執行緩存清理
   * @param {number} targetSize - 目標大小
   */
  _performCleanup(targetSize) {
    const now = Date.now();
    const entries = Array.from(this._metadata.entries());
    
    // 按優先級排序（最近訪問時間 + 訪問頻率）
    entries.sort((a, b) => {
      const scoreA = a[1].lastAccess + (a[1].accessCount * 1000);
      const scoreB = b[1].lastAccess + (b[1].accessCount * 1000);
      return scoreB - scoreA;
    });
    
    // 保留高優先級的條目
    const keysToKeep = entries.slice(0, targetSize).map(entry => entry[0]);
    const keysToDelete = Array.from(this._storage.keys()).filter(key => !keysToKeep.includes(key));
    
    // 刪除低優先級條目
    keysToDelete.forEach(key => {
      this._storage.delete(key);
      this._metadata.delete(key);
    });
    
    this._performance.lastCleanupTime = now;
    this._log(`全域緩存清理完成: 刪除 ${keysToDelete.length} 個條目，保留 ${this._storage.size} 個`, 'GlobalPositionCache');
  },

  /**
   * 清理所有緩存
   */
  clear() {
    this._storage.clear();
    this._metadata.clear();
    this._performance = {
      totalRequests: 0,
      cacheHits: 0,
      averageComputeTime: 0,
      lastCleanupTime: Date.now()
    };
    
    this._log('清理所有全域緩存', 'GlobalPositionCache');
  },

  /**
   * 獲取性能統計
   * @returns {Object} 性能統計信息
   */
  getPerformanceStats() {
    const hitRate = this._performance.totalRequests > 0 
      ? (this._performance.cacheHits / this._performance.totalRequests * 100).toFixed(2)
      : 0;
      
    return {
      ...this._performance,
      hitRate: `${hitRate}%`,
      currentSize: this._storage.size,
      memoryUsage: this._estimateMemoryUsage()
    };
  },

  /**
   * 估算記憶體使用量
   * @returns {string} 記憶體使用量描述
   */
  _estimateMemoryUsage() {
    const entrySize = 100; // 估算每個條目的平均大小
    const totalBytes = this._storage.size * entrySize;
    
    if (totalBytes < 1024) {
      return `${totalBytes} bytes`;
    } else if (totalBytes < 1024 * 1024) {
      return `${(totalBytes / 1024).toFixed(1)} KB`;
    } else {
      return `${(totalBytes / (1024 * 1024)).toFixed(1)} MB`;
    }
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
  }
};

// 暴露到全局
window.HighlightPositionCalculator = HighlightPositionCalculator;
window.GlobalPositionCache = GlobalPositionCache; 