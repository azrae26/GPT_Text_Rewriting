/**
 * 替換功能核心模組
 * 
 * 職責：
 * - 定義全系統的基礎配置常數
 * - 提供核心介面和抽象類別
 * - 管理事件常數和類型定義
 * 
 * 依賴：無（基礎層）
 */

const ReplaceCore = {
  /**
   * 全局配置常數
   */
  CONFIG: {
    // 輸入框尺寸配置
    MIN_WIDTH: 80,
    MAX_WIDTH: 600,
    MAIN_GROUP_MAX_WIDTH: 330,
    PADDING: 24,
    INPUT_HEIGHT: 32,
    
    // 自動替換特定配置
    FROM_INPUT_WIDTH: 367,
    TO_INPUT_WIDTH: 115,
    
    // 存儲鍵名配置
    MANUAL_REPLACE_KEY: 'manualReplaceRules',
    AUTO_REPLACE_KEY: 'autoReplaceRules',
    POSITION_STORAGE_KEY: 'replacePosition',
    
    // 預覽配置
    MAX_PREVIEWS: 1000,
    PREVIEW_COLORS: [
      '#FF0000', // 紅色
      '#FF8C00', // 橙色
      '#0095FF', // 藍色
      '#AB00FF', // 紫色
      '#00AF06', // 綠色
      '#9932CC', // 紫色
    ],
    PREVIEW_CONTAINER_ID: 'replace-preview-container',
    
    // 性能配置
    DEBOUNCE_DELAY: 16,
    THROTTLE_DELAY: 100,
    YEAR_FETCH_DELAY: 10,
    
    // 拖移配置
    DRAG_THRESHOLD: 5,
    DOUBLE_CLICK_DELAY: 300
  },

  /**
   * 事件常數定義
   */
  EVENTS: {
    RULE_UPDATED: 'replace:rule:updated',
    RULE_ADDED: 'replace:rule:added',
    RULE_REMOVED: 'replace:rule:removed',
    PREVIEW_UPDATED: 'replace:preview:updated',
    UI_RESIZED: 'replace:ui:resized',
    DRAG_START: 'replace:drag:start',
    DRAG_END: 'replace:drag:end',
    STORAGE_UPDATED: 'replace:storage:updated'
  },

  /**
   * 替換類型常數
   */
  REPLACE_TYPES: {
    MANUAL: 'manual',
    AUTO: 'auto'
  },

  /**
   * 拖移狀態常數
   */
  DRAG_STATES: {
    IDLE: 'idle',
    DRAGGING: 'dragging',
    DROPPING: 'dropping'
  },

  /**
   * CSS 類名常數
   */
  CSS_CLASSES: {
    // 容器類名
    MAIN_CONTAINER: 'replace-controls-main',
    OTHER_CONTAINER: 'replace-controls',
    MANUAL_CONTAINER: 'manual-replace-container',
    
    // 組類名
    MAIN_GROUP: 'replace-main-group',
    EXTRA_GROUP: 'replace-extra-group',
    AUTO_GROUP: 'replace-auto-group',
    
    // 控制元件類名
    INPUT: 'replace-input',
    INPUT_CONTAINER: 'replace-input-container',
    BUTTON: 'replace-button',
    CONTROL_BUTTON: 'replace-control-button',
    GROUP_CONTROLS: 'replace-group-controls',
    
    // 拖移相關類名
    DRAG_HANDLE: 'replace-drag-handle',
    SORT_BUTTON: 'replace-sort-button',
    DRAGGING: 'dragging',
    PLACEHOLDER: 'drag-placeholder',
    
    // 狀態類名
    DISABLED: 'disabled',
    ACTIVE: 'active',
    EXPANDED: 'expanded',
    
    // 預覽類名
    PREVIEW_HIGHLIGHT: 'replace-preview-highlight'
  },

  /**
   * 基礎管理器介面定義
   */
  BaseManager: {
    /**
     * 初始化管理器
     * @param {Object} options - 初始化選項
     */
    initialize(options) {
      throw new Error('子類必須實現 initialize 方法');
    },

    /**
     * 銷毀管理器
     */
    destroy() {
      throw new Error('子類必須實現 destroy 方法');
    },

    /**
     * 更新規則
     * @param {Object} rule - 規則對象
     * @param {number} index - 規則索引
     */
    updateRule(rule, index) {
      throw new Error('子類必須實現 updateRule 方法');
    },

    /**
     * 保存規則
     */
    saveRules() {
      throw new Error('子類必須實現 saveRules 方法');
    }
  },

  /**
   * 工具函數
   */
  Utils: {
    /**
     * 生成時間戳
     * @returns {string} 格式化的時間戳
     */
    getTimeStamp() {
      const now = new Date();
      const hours = now.getHours().toString().padStart(2, '0');
      const minutes = now.getMinutes().toString().padStart(2, '0');
      const seconds = now.getSeconds().toString().padStart(2, '0');
      return `${hours}:${minutes}:${seconds}`;
    },

    /**
     * 防抖函數
     * @param {Function} fn - 要防抖的函數
     * @param {number} delay - 延遲時間
     * @returns {Function} 防抖後的函數
     */
    debounce(fn, delay) {
      let timeoutId;
      return function(...args) {
        clearTimeout(timeoutId);
        timeoutId = setTimeout(() => fn.apply(this, args), delay);
      };
    },

    /**
     * 節流函數
     * @param {Function} fn - 要節流的函數
     * @param {number} delay - 延遲時間
     * @returns {Function} 節流後的函數
     */
    throttle(fn, delay) {
      let lastCall = 0;
      return function(...args) {
        const now = new Date().getTime();
        if (now - lastCall < delay) {
          return;
        }
        lastCall = now;
        return fn.apply(this, args);
      };
    },

    /**
     * 計算文本簡單哈希
     * @param {string} text - 要計算哈希的文本
     * @returns {string} 哈希值
     */
    hashText(text) {
      if (!text) return '';
      let hash = 0;
      for (let i = 0; i < Math.min(text.length, 100); i++) {
        const char = text.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash; // 轉為32位整數
      }
      return hash.toString();
    },

    /**
     * 深度複製對象
     * @param {Object} obj - 要複製的對象
     * @returns {Object} 複製後的對象
     */
    deepClone(obj) {
      if (obj === null || typeof obj !== 'object') {
        return obj;
      }
      if (obj instanceof Date) {
        return new Date(obj.getTime());
      }
      if (obj instanceof Array) {
        return obj.map(item => this.deepClone(item));
      }
      if (typeof obj === 'object') {
        const cloned = {};
        for (const key in obj) {
          if (obj.hasOwnProperty(key)) {
            cloned[key] = this.deepClone(obj[key]);
          }
        }
        return cloned;
      }
    },

    /**
     * 檢查兩個規則是否相等
     * @param {Object} rule1 - 規則1
     * @param {Object} rule2 - 規則2
     * @returns {boolean} 是否相等
     */
    rulesEqual(rule1, rule2) {
      if (!rule1 || !rule2) return false;
      return rule1.from === rule2.from && rule1.to === rule2.to;
    },

    /**
     * 過濾空規則
     * @param {Array} rules - 規則數組
     * @returns {Array} 過濾後的規則數組
     */
    filterEmptyRules(rules) {
      return rules.filter(rule => rule.from?.trim() || rule.to?.trim());
    }
  },

  /**
   * 日誌工具
   */
  Logger: {
    /**
     * 記錄信息
     * @param {string} message - 信息內容
     * @param {string} component - 組件名稱
     */
    info(message, component = 'ReplaceCore') {
      console.log(`[${component}][${ReplaceCore.Utils.getTimeStamp()}] ${message}`);
    },

    /**
     * 記錄警告
     * @param {string} message - 警告內容
     * @param {string} component - 組件名稱
     */
    warn(message, component = 'ReplaceCore') {
      console.warn(`[${component}][${ReplaceCore.Utils.getTimeStamp()}] ⚠️ ${message}`);
    },

    /**
     * 記錄錯誤
     * @param {string} message - 錯誤內容
     * @param {Error} error - 錯誤對象
     * @param {string} component - 組件名稱
     */
    error(message, error, component = 'ReplaceCore') {
      console.error(`[${component}][${ReplaceCore.Utils.getTimeStamp()}] ❌ ${message}`, error);
    },

    /**
     * 記錄成功信息
     * @param {string} message - 成功信息
     * @param {string} component - 組件名稱
     */
    success(message, component = 'ReplaceCore') {
      console.log(`[${component}][${ReplaceCore.Utils.getTimeStamp()}] ✅ ${message}`);
    }
  }
};

// 暴露到全局
window.ReplaceCore = ReplaceCore; 