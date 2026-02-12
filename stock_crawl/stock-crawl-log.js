/**
 * stock_crawl/stock-crawl-log.js - 股票爬取記錄管理器 (2026/02/13)
 * 功能：記錄每次自動爬取的執行結果
 * 職責：
 * - 新增爬取記錄（成功/警告/失敗/中斷）
 * - 自動清理過期記錄（預設 90 天）
 * - 格式化異動明細（新增/刪除的股票）
 * 
 * 記錄格式：日期,時間,觸發方式,狀態,爬取數,新增,刪除,總計,耗時秒,異動明細,備註
 * 異動明細格式：股票名/代號/市場別/操作;股票名/代號/市場別/操作;...
 * 
 * 依賴：
 * - LogUtils（來自 default.js）
 * - Chrome Storage API
 */

const StockCrawlLog = {
  /** Storage 鍵名 */
  STORAGE_KEY: 'stockCrawlLog',

  /** 記錄保留天數 */
  MAX_DAYS: 90,

  /**
   * 新增一筆爬取記錄
   * @param {object} record - 記錄資料
   * @param {string} record.triggerType - 觸發方式：'手動' | '定時'
   * @param {string} record.status - 狀態：'成功' | '警告' | '失敗' | '中斷'
   * @param {number} record.crawledCount - 本次爬到的股票總數
   * @param {number} record.added - 新增股票數
   * @param {number} record.removed - 刪除股票數
   * @param {number} record.total - 更新後股票總數
   * @param {number} record.durationSec - 耗時秒數
   * @param {Array} [record.changes] - 異動明細 [{name, code, market, operation}]
   * @param {string} [record.remark] - 備註（錯誤/警告訊息）
   */
  async addRecord(record) {
    try {
      const now = new Date();
      const dateStr = now.toISOString().split('T')[0];
      const timeStr = now.toTimeString().slice(0, 5);

      // 格式化異動明細：台泥/1101/上市/新增;南亞/1303/上櫃/刪除
      const changesStr = (record.changes || [])
        .map(c => `${c.name}/${c.code}/${c.market}/${c.operation}`)
        .join(';');

      // 組合記錄行
      const line = [
        dateStr,
        timeStr,
        record.triggerType || '未知',
        record.status || '未知',
        record.crawledCount || 0,
        record.added || 0,
        record.removed || 0,
        record.total || 0,
        record.durationSec || 0,
        changesStr,
        record.remark || ''
      ].join(',');

      // 讀取現有記錄
      const result = await chrome.storage.local.get([this.STORAGE_KEY]);
      const existing = result[this.STORAGE_KEY] || '';

      // 清理過期記錄
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - this.MAX_DAYS);
      const cutoffStr = cutoff.toISOString().split('T')[0];

      const oldRecords = existing.split('\n').filter(l => {
        if (!l.trim()) return false;
        const recordDate = l.split(',')[0];
        return recordDate >= cutoffStr;
      });

      // 新記錄放在最前面
      const updated = [line, ...oldRecords].join('\n');
      await chrome.storage.local.set({ [this.STORAGE_KEY]: updated });

      LogUtils.log(`📝 [StockCrawlLog] 爬取記錄已寫入: ${record.status}, 新增=${record.added}, 刪除=${record.removed}`);
    } catch (error) {
      LogUtils.error('[StockCrawlLog] 寫入爬取記錄失敗', error);
    }
  }
};
