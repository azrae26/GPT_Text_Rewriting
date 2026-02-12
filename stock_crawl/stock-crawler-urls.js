/**
 * stock_crawl/stock-crawler-urls.js - 股票爬蟲網址配置
 * 功能：管理台灣證券交易所 MOPS 系統的爬取網址
 * 職責：
 * - 提供上市、上櫃、興櫃股票的爬取 URL
 * - 根據 URL 查詢對應的市場名稱
 * 
 * 依賴：無（獨立模組）
 */

/**
 * 股票爬蟲網址配置
 * 資料來源：台灣證券交易所 MOPS 系統
 */
const StockCrawlerUrls = {
  // MOPS 系統股票清單網址
  urls: [
    {
      name: '上市股票',
      url: 'https://mopsov.twse.com.tw/mops/web/ajax_t51sb01?parameters=32b138d25ee38c00fbf70ec5a53724971d1df89c34d9a0ef54fddd0eca765118e1d5d55f2907af83df59ae82756caca30645f4a87baa01551cc98a6ff0816cbaad9c5c8c6df699b1ac8bf50f27c999868a65d5f5dd71b407c4d61b426833ab8c'
    },
    {
      name: '上櫃股票',
      url: 'https://mopsov.twse.com.tw/mops/web/ajax_t51sb01?parameters=32b138d25ee38c00fbf70ec5a53724971d1df89c34d9a0ef54fddd0eca7651189431092059e57ec5acce2508557bbb820645f4a87baa01551cc98a6ff0816cbaad9c5c8c6df699b1ac8bf50f27c999868a65d5f5dd71b407c4d61b426833ab8c'
    },
    {
      name: '興櫃股票', 
      url: 'https://mopsov.twse.com.tw/mops/web/ajax_t51sb01?parameters=32b138d25ee38c00fbf70ec5a53724971d1df89c34d9a0ef54fddd0eca765118150b1250f6b0d18c5da95b58aafad725152f445b9d55dd4c51df9e26ea7918af4de96261009bdfefb47812fc6ed9b9145701ed44236616fb09e84fed0c84caa6'
    }
  ],

  getAllUrls() {
    return this.urls.map(item => item.url);
  },

  getIndustryName(url) {
    const item = this.urls.find(item => item.url === url);
    return item ? item.name : '未知市場';
  }
};
