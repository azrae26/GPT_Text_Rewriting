/* global */
/**
 * translate-config.js - 翻譯配置管理模組
 * 功能：管理所有翻譯相關的配置、常數和設定
 * 職責：
 * - API 配置：重試、超時、間隔等設定
 * - 批次處理配置：文本限制、間隔設定等
 * - 階段標識符：翻譯流程各階段的標識
 * - 無外部依賴，純配置模組
 * 
 * 依賴：無
 */

/**
 * 翻譯系統配置常數
 * 所有翻譯相關的配置都在這裡統一管理
 */
window.TranslateConfig = {
  // API 相關配置
  CHINESE_RATIO_THRESHOLD: 0.5, // 翻譯結果中文比例門檻（去除數字後）

  API: {
    HEDGE_INTERVAL: 40000,   // A→B、B→C 的對沖間隔（毫秒）
    GLOBAL_DEADLINE: 90000,  // 所有批次送出後的全局死線（毫秒）
    RETRY_WAIT: 15000,       // 批次重試層等待時間（毫秒）
    // 間隔配置
    INTERVAL: {
      WAIT: {
        NONE: 0,             // 無等待
        SHORT: 2000,         // 短等待（2秒）
        LONG: 2000           // 長等待（2秒）
      }
    }
  },
  
  // 批次處理相關配置
  BATCH: {
    // 根據批次數量決定發送間隔 [批次數, 間隔毫秒]
    INTERVALS: [
      [5, 500],              // 5次以下，0.5秒
      [10, 3000],            // 10次以下，3秒
      [15, 6000],            // 15次以下，6秒
      [20, 8000],            // 20次以下，8秒
      [25, 10000]            // 25次以下，10秒
    ],
    DEFAULT_INTERVAL: 12000, // 預設間隔（毫秒），25次以上用12秒
    TEXT_LIMIT: {
      LINE: 4100,           // 單行最大字數
      BATCH: 3600           // 批次最大字數
    },
    MAX_PREVIOUS_BLOCKS: 3  // 最大前文區塊數
  },
  
  // 階段標識符
  STAGES: {
    INITIAL: '初步翻譯中',
    REFLECT: '反思翻譯中',
    OPTIMIZE: '優化翻譯中',
    COMPLETED: '翻譯完成',
    CANCELLED: '翻譯已取消'
  }
};

// 配置工具函數
window.TranslateConfigUtils = {
  /**
   * 根據批次數量獲取發送間隔
   * @param {number} totalBatches - 總批次數
   * @returns {number} 間隔時間（毫秒）
   */
  getBatchInterval(totalBatches) {
    const found = window.TranslateConfig.BATCH.INTERVALS.find(
      ([count]) => totalBatches <= count
    );
    return found ? found[1] : window.TranslateConfig.BATCH.DEFAULT_INTERVAL;
  },

  /**
   * 根據區塊數量獲取等待時間
   * @param {number} totalBlocks - 總區塊數
   * @returns {number} 等待時間（毫秒）
   */
  getWaitTime(totalBlocks) {
    const { WAIT } = window.TranslateConfig.API.INTERVAL;
    if (totalBlocks <= 4) {
      return WAIT.NONE;
    } else if (totalBlocks < 7) {
      return WAIT.SHORT;
    } else {
      return WAIT.LONG;
    }
  }
};

  LogUtils.log('翻譯配置模組已載入'); 