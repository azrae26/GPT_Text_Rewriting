/** 正則表達式輔助模組 */
const RegexHelper = {
  /**
   * 創建正則表達式
   * @param {string} text - 要轉換成正則的文字
   * @returns {RegExp} - 生成的正則表達式
   */
  createRegex(text) {
    try {
      if (this._isRegexPattern(text)) {
        return this._createRegexFromPattern(text);
      }
      return this._createRegexFromText(text);
    } catch (error) {
      console.error('正則表達式創建失敗:', error);
      // 返回一個永遠不會匹配的正則表達式
      return new RegExp('(?!)', 'g');
    }
  },

  /**
   * 檢查是否為正則表達式模式
   */
  _isRegexPattern(text) {
    return text.startsWith('(') || 
           text.startsWith('[') || 
           text.startsWith('/') && text.match(/\/[gim]*$/);
  },

  /**
   * 從正則表達式模式創建正則表達式
   */
  _createRegexFromPattern(text) {
    try {
      if (text.startsWith('/') && text.match(/\/[gim]*$/)) {
        // 處理 /pattern/flags 格式
        const lastSlash = text.lastIndexOf('/');
        const pattern = text.slice(1, lastSlash);
        const flags = text.slice(lastSlash + 1);
        // 確保包含 m 標誌
        return new RegExp(pattern, (flags || 'gim')); 
      } else {
        // 直接作為正則表達式模式使用
        return new RegExp(text, 'gim');
      }
    } catch (error) {
      console.error('正則表達式解析失敗:', error);
      return new RegExp('(?!)', 'g');
    }
  },

  /**
   * 從普通文字創建正則表達式
   */
  _createRegexFromText(text) {
    try {
      // 特殊處理 ** 的情況
      if (text === '**') {
        return /\*\*/g;
      }
      
      // 空字串或無效輸入的處理
      if (!text || typeof text !== 'string' || text.length === 0) {
        console.warn('無效的替換文字:', text);
        return new RegExp('(?!)', 'g');
      }
      
      const escapedText = this.escapeRegExp(text);
      
      // 如果是單個字符，直接返回轉義後的正則
      if (text.length === 1) {
        return new RegExp(escapedText, 'gi');
      }
      
      const firstChar = text.charAt(0);
      const reChar = `[${firstChar.toLowerCase()}${firstChar.toUpperCase()}]`;
      const pattern = firstChar + escapedText.slice(1);
      return new RegExp(pattern.replace(reChar, firstChar), 'gi');
    } catch (error) {
      console.error('文轉則表達式失敗:', error);
      console.error('問題文字:', text);
      return new RegExp('(?!)', 'g');
    }
  },

  /**
   * 轉義正則表達式特殊字符
   */
  escapeRegExp(string) {
    // 確保 string 是字串類型
    if (typeof string !== 'string') {
      console.warn('轉義輸入不是字串:', string);
      return '';
    }
    
    // 特殊處理星號相關的情況
    if (string === '*') return '\\*';
    if (string === '**') return '\\*\\*';
    
    // 一般情況的轉義
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
};

window.RegexHelper = RegexHelper; 