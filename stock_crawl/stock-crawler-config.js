/**
 * stock_crawl/stock-crawler-config.js - 股票爬蟲配置常數
 * 功能：定義股票爬蟲相關的配置參數
 * 職責：
 * - 安全保護閾值設定
 * - 爬蟲時間間隔設定
 * - 進度更新百分比設定
 * - chrome.alarms 定時器名稱
 * 
 * 依賴：無（獨立模組）
 */

const STOCK_CRAWLER_CONFIG = {
  // 安全保護閾值：要刪除的股票數量達到此值時將跳過更新
  SAFETY_DELETE_THRESHOLD: 5,
  
  // 爬蟲間隔時間限制（分鐘）- chrome.alarms 最小值為 1 分鐘
  MIN_CRAWL_INTERVAL: 1,
  
  // 網頁爬取間隔（毫秒）
  CRAWL_DELAY_MS: 300,
  
  // 進度更新百分比
  PROGRESS_CRAWLING_MAX: 90,
  PROGRESS_UPDATING: 95,
  PROGRESS_COMPLETED: 100,
  
  // chrome.alarms 定時器名稱（持久化，不受 Service Worker 休眠影響）
  ALARM_NAME: 'stockCrawlAlarm'
};
