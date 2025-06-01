/**
 * 股票爬蟲網址配置
 * 功能：定義所有需要爬取的 goodinfo.tw 股票清單網址
 * 依賴：無
 */

const StockCrawlerUrls = {
  // 所有產業的股票清單網址
  industryUrls: [
    {
      name: '水泥工業',
      url: 'https://goodinfo.tw/tw/StockList.asp?MARKET_CAT=%E5%85%A8%E9%83%A8&INDUSTRY_CAT=%E6%B0%B4%E6%B3%A5%E5%B7%A5%E6%A5%AD&SHEET=%E4%BA%A4%E6%98%93%E7%8B%80%E6%B3%81&SHEET2=%E6%97%A5&RPT_TIME=%E6%9C%80%E6%96%B0%E8%B3%87%E6%96%99'
    },
    {
      name: '食品工業',
      url: 'https://goodinfo.tw/tw/StockList.asp?MARKET_CAT=%E5%85%A8%E9%83%A8&INDUSTRY_CAT=%E9%A3%9F%E5%93%81%E5%B7%A5%E6%A5%AD&SHEET=%E4%BA%A4%E6%98%93%E7%8B%80%E6%B3%81&SHEET2=%E6%97%A5&RPT_TIME=%E6%9C%80%E6%96%B0%E8%B3%87%E6%96%99'
    },
    {
      name: '塑膠工業',
      url: 'https://goodinfo.tw/tw/StockList.asp?MARKET_CAT=%E5%85%A8%E9%83%A8&INDUSTRY_CAT=%E5%A1%91%E8%86%A0%E5%B7%A5%E6%A5%AD&SHEET=%E4%BA%A4%E6%98%93%E7%8B%80%E6%B3%81&SHEET2=%E6%97%A5&RPT_TIME=%E6%9C%80%E6%96%B0%E8%B3%87%E6%96%99'
    },
    {
      name: '紡織纖維',
      url: 'https://goodinfo.tw/tw/StockList.asp?MARKET_CAT=%E5%85%A8%E9%83%A8&INDUSTRY_CAT=%E7%B4%A1%E7%B9%94%E7%BA%96%E7%B6%AD&SHEET=%E4%BA%A4%E6%98%93%E7%8B%80%E6%B3%81&SHEET2=%E6%97%A5&RPT_TIME=%E6%9C%80%E6%96%B0%E8%B3%87%E6%96%99'
    },
    {
      name: '電機機械',
      url: 'https://goodinfo.tw/tw/StockList.asp?MARKET_CAT=%E5%85%A8%E9%83%A8&INDUSTRY_CAT=%E9%9B%BB%E6%A9%9F%E6%A9%9F%E6%A2%B0&SHEET=%E4%BA%A4%E6%98%93%E7%8B%80%E6%B3%81&SHEET2=%E6%97%A5&RPT_TIME=%E6%9C%80%E6%96%B0%E8%B3%87%E6%96%99'
    },
    {
      name: '電器電纜',
      url: 'https://goodinfo.tw/tw/StockList.asp?MARKET_CAT=%E5%85%A8%E9%83%A8&INDUSTRY_CAT=%E9%9B%BB%E5%99%A8%E9%9B%BB%E8%BC%AF&SHEET=%E4%BA%A4%E6%98%93%E7%8B%80%E6%B3%81&SHEET2=%E6%97%A5&RPT_TIME=%E6%9C%80%E6%96%B0%E8%B3%87%E6%96%99'
    },
    {
      name: '生技醫療業',
      url: 'https://goodinfo.tw/tw/StockList.asp?MARKET_CAT=%E5%85%A8%E9%83%A8&INDUSTRY_CAT=%E7%94%9F%E6%8A%80%E9%86%AB%E7%99%82%E6%A5%AD&SHEET=%E4%BA%A4%E6%98%93%E7%8B%80%E6%B3%81&SHEET2=%E6%97%A5&RPT_TIME=%E6%9C%80%E6%96%B0%E8%B3%87%E6%96%99'
    },
    {
      name: '化學工業',
      url: 'https://goodinfo.tw/tw/StockList.asp?MARKET_CAT=%E5%85%A8%E9%83%A8&INDUSTRY_CAT=%E5%8C%96%E5%AD%B8%E5%B7%A5%E6%A5%AD&SHEET=%E4%BA%A4%E6%98%93%E7%8B%80%E6%B3%81&SHEET2=%E6%97%A5&RPT_TIME=%E6%9C%80%E6%96%B0%E8%B3%87%E6%96%99'
    },
    {
      name: '玻璃陶瓷',
      url: 'https://goodinfo.tw/tw/StockList.asp?MARKET_CAT=%E5%85%A8%E9%83%A8&INDUSTRY_CAT=%E7%8E%BB%E7%92%83%E9%99%B6%E7%93%93&SHEET=%E4%BA%A4%E6%98%93%E7%8B%80%E6%B3%81&SHEET2=%E6%97%A5&RPT_TIME=%E6%9C%80%E6%96%B0%E8%B3%87%E6%96%99'
    },
    {
      name: '造紙工業',
      url: 'https://goodinfo.tw/tw/StockList.asp?MARKET_CAT=%E5%85%A8%E9%83%A8&INDUSTRY_CAT=%E9%80%A0%E7%B4%99%E5%B7%A5%E6%A5%AD&SHEET=%E4%BA%A4%E6%98%93%E7%8B%80%E6%B3%81&SHEET2=%E6%97%A5&RPT_TIME=%E6%9C%80%E6%96%B0%E8%B3%87%E6%96%99'
    },
    {
      name: '鋼鐵工業',
      url: 'https://goodinfo.tw/tw/StockList.asp?MARKET_CAT=%E5%85%A8%E9%83%A8&INDUSTRY_CAT=%E9%8B%BC%E9%90%B5%E5%B7%A5%E6%A5%AD&SHEET=%E4%BA%A4%E6%98%93%E7%8B%80%E6%B3%81&SHEET2=%E6%97%A5&RPT_TIME=%E6%9C%80%E6%96%B0%E8%B3%87%E6%96%99'
    },
    {
      name: '橡膠工業',
      url: 'https://goodinfo.tw/tw/StockList.asp?MARKET_CAT=%E5%85%A8%E9%83%A8&INDUSTRY_CAT=%E6%A9%A1%E8%86%A0%E5%B7%A5%E6%A5%AD&SHEET=%E4%BA%A4%E6%98%93%E7%8B%80%E6%B3%81&SHEET2=%E6%97%A5&RPT_TIME=%E6%9C%80%E6%96%B0%E8%B3%87%E6%96%99'
    },
    {
      name: '汽車工業',
      url: 'https://goodinfo.tw/tw/StockList.asp?MARKET_CAT=%E5%85%A8%E9%83%A8&INDUSTRY_CAT=%E6%B1%BD%E8%BB%8A%E5%B7%A5%E6%A5%AD&SHEET=%E4%BA%A4%E6%98%93%E7%8B%80%E6%B3%81&SHEET2=%E6%97%A5&RPT_TIME=%E6%9C%80%E6%96%B0%E8%B3%87%E6%96%99'
    },
    {
      name: '電腦及週邊設備業',
      url: 'https://goodinfo.tw/tw/StockList.asp?MARKET_CAT=%E5%85%A8%E9%83%A8&INDUSTRY_CAT=%E9%9B%BB%E8%85%A6%E5%8F%8A%E9%80%B1%E9%96%92%E8%A8%AD%E5%82%99%E6%A5%AD&SHEET=%E4%BA%A4%E6%98%93%E7%8B%80%E6%B3%81&SHEET2=%E6%97%A5&RPT_TIME=%E6%9C%80%E6%96%B0%E8%B3%87%E6%96%99'
    },
    {
      name: '半導體業',
      url: 'https://goodinfo.tw/tw/StockList.asp?MARKET_CAT=%E5%85%A8%E9%83%A8&INDUSTRY_CAT=%E5%8D%8A%E5%AF%BC%E9%AB%94%E6%A5%AD&SHEET=%E4%BA%A4%E6%98%93%E7%8B%80%E6%B3%81&SHEET2=%E6%97%A5&RPT_TIME=%E6%9C%80%E6%96%B0%E8%B3%87%E6%96%99'
    },
    {
      name: '電子零組件業',
      url: 'https://goodinfo.tw/tw/StockList.asp?MARKET_CAT=%E5%85%A8%E9%83%A8&INDUSTRY_CAT=%E9%9B%BB%E5%AD%90%E9%9B%B6%E7%B5%84%E4%BB%B6%E6%A5%AD&SHEET=%E4%BA%A4%E6%98%93%E7%8B%80%E6%B3%81&SHEET2=%E6%97%A5&RPT_TIME=%E6%9C%80%E6%96%B0%E8%B3%87%E6%96%99'
    },
    {
      name: '其他電子業',
      url: 'https://goodinfo.tw/tw/StockList.asp?MARKET_CAT=%E5%85%A8%E9%83%A8&INDUSTRY_CAT=%E5%85%B6%E4%BB%96%E9%9B%BB%E5%AD%90%E6%A5%AD&SHEET=%E4%BA%A4%E6%98%93%E7%8B%80%E6%B3%81&SHEET2=%E6%97%A5&RPT_TIME=%E6%9C%80%E6%96%B0%E8%B3%87%E6%96%99'
    },
    {
      name: '通信網路業',
      url: 'https://goodinfo.tw/tw/StockList.asp?MARKET_CAT=%E5%85%A8%E9%83%A8&INDUSTRY_CAT=%E9%80%9A%E4%BF%A1%E7%B6%B2%E8%B7%AF%E6%A5%AD&SHEET=%E4%BA%A4%E6%98%93%E7%8B%80%E6%B3%81&SHEET2=%E6%97%A5&RPT_TIME=%E6%9C%80%E6%96%B0%E8%B3%87%E6%96%99'
    },
    {
      name: '資訊服務業',
      url: 'https://goodinfo.tw/tw/StockList.asp?MARKET_CAT=%E5%85%A8%E9%83%A8&INDUSTRY_CAT=%E8%B3%87%E8%A8%8A%E6%9C%8D%E5%8B%99%E6%A5%AD&SHEET=%E4%BA%A4%E6%98%93%E7%8B%80%E6%B3%81&SHEET2=%E6%97%A5&RPT_TIME=%E6%9C%80%E6%96%B0%E8%B3%87%E6%96%99'
    },
    {
      name: '建材營造業',
      url: 'https://goodinfo.tw/tw/StockList.asp?MARKET_CAT=%E5%85%A8%E9%83%A8&INDUSTRY_CAT=%E5%BB%BA%E6%9D%90%E7%87%9F%E9%80%A0%E6%A5%AD&SHEET=%E4%BA%A4%E6%98%93%E7%8B%80%E6%B3%81&SHEET2=%E6%97%A5&RPT_TIME=%E6%9C%80%E6%96%B0%E8%B3%87%E6%96%99'
    },
    {
      name: '航運業',
      url: 'https://goodinfo.tw/tw/StockList.asp?MARKET_CAT=%E5%85%A8%E9%83%A8&INDUSTRY_CAT=%E8%88%AA%E9%81%8B%E6%A5%AD&SHEET=%E4%BA%A4%E6%98%93%E7%8B%80%E6%B3%81&SHEET2=%E6%97%A5&RPT_TIME=%E6%9C%80%E6%96%B0%E8%B3%87%E6%96%99'
    },
    {
      name: '觀光餐旅',
      url: 'https://goodinfo.tw/tw/StockList.asp?MARKET_CAT=%E5%85%A8%E9%83%A8&INDUSTRY_CAT=%E8%A7%80%E5%85%89%E9%A4%90%E6%97%85&SHEET=%E4%BA%A4%E6%98%93%E7%8B%80%E6%B3%81&SHEET2=%E6%97%A5&RPT_TIME=%E6%9C%80%E6%96%B0%E8%B3%87%E6%96%99'
    },
    {
      name: '銀行業',
      url: 'https://goodinfo.tw/tw/StockList.asp?MARKET_CAT=%E5%85%A8%E9%83%A8&INDUSTRY_CAT=%E9%8A%80%E8%A1%8C%E6%A5%AD&SHEET=%E4%BA%A4%E6%98%93%E7%8B%80%E6%B3%81&SHEET2=%E6%97%A5&RPT_TIME=%E6%9C%80%E6%96%B0%E8%B3%87%E6%96%99'
    },
    {
      name: '保險業',
      url: 'https://goodinfo.tw/tw/StockList.asp?MARKET_CAT=%E5%85%A8%E9%83%A8&INDUSTRY_CAT=%E4%BF%9D%E9%9A%AA%E6%A5%AD&SHEET=%E4%BA%A4%E6%98%93%E7%8B%80%E6%B3%81&SHEET2=%E6%97%A5&RPT_TIME=%E6%9C%80%E6%96%B0%E8%B3%87%E6%96%99'
    },
    {
      name: '金控業',
      url: 'https://goodinfo.tw/tw/StockList.asp?MARKET_CAT=%E5%85%A8%E9%83%A8&INDUSTRY_CAT=%E9%87%91%E6%8E%A7%E6%A5%AD&SHEET=%E4%BA%A4%E6%98%93%E7%8B%80%E6%B3%81&SHEET2=%E6%97%A5&RPT_TIME=%E6%9C%80%E6%96%B0%E8%B3%87%E6%96%99'
    },
    {
      name: '貿易百貨業',
      url: 'https://goodinfo.tw/tw/StockList.asp?MARKET_CAT=%E5%85%A8%E9%83%A8&INDUSTRY_CAT=%E8%B2%BF%E6%98%93%E7%99%BE%E8%B2%A8%E6%A5%AD&SHEET=%E4%BA%A4%E6%98%93%E7%8B%80%E6%B3%81&SHEET2=%E6%97%A5&RPT_TIME=%E6%9C%80%E6%96%B0%E8%B3%87%E6%96%99'
    },
    {
      name: '光電業',
      url: 'https://goodinfo.tw/tw/StockList.asp?MARKET_CAT=%E5%85%A8%E9%83%A8&INDUSTRY_CAT=%E5%85%89%E9%9B%BB%E6%A5%AD&SHEET=%E4%BA%A4%E6%98%93%E7%8B%80%E6%B3%81&SHEET2=%E6%97%A5&RPT_TIME=%E6%9C%80%E6%96%B0%E8%B3%87%E6%96%99'
    },
    {
      name: '電子通路業',
      url: 'https://goodinfo.tw/tw/StockList.asp?MARKET_CAT=%E5%85%A8%E9%83%A8&INDUSTRY_CAT=%E9%9B%BB%E5%AD%90%E9%80%9A%E8%B7%AF%E6%A5%AD&SHEET=%E4%BA%A4%E6%98%93%E7%8B%80%E6%B3%81&SHEET2=%E6%97%A5&RPT_TIME=%E6%9C%80%E6%96%B0%E8%B3%87%E6%96%99'
    },
    {
      name: '證券業',
      url: 'https://goodinfo.tw/tw/StockList.asp?MARKET_CAT=%E5%85%A8%E9%83%A8&INDUSTRY_CAT=%E8%AD%89%E5%88%B8%E6%A5%AD&SHEET=%E4%BA%A4%E6%98%93%E7%8B%80%E6%B3%81&SHEET2=%E6%97%A5&RPT_TIME=%E6%9C%80%E6%96%B0%E8%B3%87%E6%96%99'
    },
    {
      name: '數位雲端',
      url: 'https://goodinfo.tw/tw/StockList.asp?MARKET_CAT=%E5%85%A8%E9%83%A8&INDUSTRY_CAT=%E6%95%B8%E4%BD%8D%E9%9B%B2%E7%AB%AF&SHEET=%E4%BA%A4%E6%98%93%E7%8B%80%E6%B3%81&SHEET2=%E6%97%A5&RPT_TIME=%E6%9C%80%E6%96%B0%E8%B3%87%E6%96%99'
    },
    {
      name: '綠能環保',
      url: 'https://goodinfo.tw/tw/StockList.asp?MARKET_CAT=%E5%85%A8%E9%83%A8&INDUSTRY_CAT=%E7%B6%A0%E8%83%BD%E7%92%B0%E4%BF%9D&SHEET=%E4%BA%A4%E6%98%93%E7%8B%80%E6%B3%81&SHEET2=%E6%97%A5&RPT_TIME=%E6%9C%80%E6%96%B0%E8%B3%87%E6%96%99'
    },
    {
      name: '其他業',
      url: 'https://goodinfo.tw/tw/StockList.asp?MARKET_CAT=%E5%85%A8%E9%83%A8&INDUSTRY_CAT=%E5%85%B6%E4%BB%96%E6%A5%AD&SHEET=%E4%BA%A4%E6%98%93%E7%8B%80%E6%B3%81&SHEET2=%E6%97%A5&RPT_TIME=%E6%9C%80%E6%96%B0%E8%B3%87%E6%96%99'
    },
    {
      name: '運動休閒',
      url: 'https://goodinfo.tw/tw/StockList.asp?MARKET_CAT=%E5%85%A8%E9%83%A8&INDUSTRY_CAT=%E9%81%8B%E5%8B%95%E4%BC%91%E9%96%92&SHEET=%E4%BA%A4%E6%98%93%E7%8B%80%E6%B3%81&SHEET2=%E6%97%A5&RPT_TIME=%E6%9C%80%E6%96%B0%E8%B3%87%E6%96%99'
    },
    {
      name: '油電燃氣業',
      url: 'https://goodinfo.tw/tw/StockList.asp?MARKET_CAT=%E5%85%A8%E9%83%A8&INDUSTRY_CAT=%E6%B2%B9%E9%9B%BB%E7%87%83%E6%B0%A3%E6%A5%AD&SHEET=%E4%BA%A4%E6%98%93%E7%8B%80%E6%B3%81&SHEET2=%E6%97%A5&RPT_TIME=%E6%9C%80%E6%96%B0%E8%B3%87%E6%96%99'
    },
    {
      name: '居家生活',
      url: 'https://goodinfo.tw/tw/StockList.asp?MARKET_CAT=%E5%85%A8%E9%83%A8&INDUSTRY_CAT=%E5%B1%85%E5%AE%B6%E7%94%9F%E6%B4%BB&SHEET=%E4%BA%A4%E6%98%93%E7%8B%80%E6%B3%81&SHEET2=%E6%97%A5&RPT_TIME=%E6%9C%80%E6%96%B0%E8%B3%87%E6%96%99'
    },
    {
      name: '文化創意業',
      url: 'https://goodinfo.tw/tw/StockList.asp?MARKET_CAT=%E5%85%A8%E9%83%A8&INDUSTRY_CAT=%E6%96%87%E5%8C%96%E5%89%B5%E6%84%8F%E6%A5%AD&SHEET=%E4%BA%A4%E6%98%93%E7%8B%80%E6%B3%81&SHEET2=%E6%97%A5&RPT_TIME=%E6%9C%80%E6%96%B0%E8%B3%87%E6%96%99'
    },
    {
      name: '農業科技業',
      url: 'https://goodinfo.tw/tw/StockList.asp?MARKET_CAT=%E5%85%A8%E9%83%A8&INDUSTRY_CAT=%E8%BE%B2%E6%A5%AD%E7%A7%91%E6%8A%80%E6%A5%AD&SHEET=%E4%BA%A4%E6%98%93%E7%8B%80%E6%B3%81&SHEET2=%E6%97%A5&RPT_TIME=%E6%9C%80%E6%96%B0%E8%B3%87%E6%96%99'
    }
  ],

  /**
   * 獲取所有爬蟲網址
   * @returns {Array} 包含所有網址的陣列
   */
  getAllUrls() {
    return this.industryUrls.map(item => item.url);
  },

  /**
   * 獲取網址對應的產業名稱
   * @param {string} url - 網址
   * @returns {string} 產業名稱
   */
  getIndustryName(url) {
    const industry = this.industryUrls.find(item => item.url === url);
    return industry ? industry.name : '未知產業';
  },

  /**
   * 獲取總網址數量
   * @returns {number} 網址總數
   */
  getTotalCount() {
    return this.industryUrls.length;
  }
};

// 導出到全域
window.StockCrawlerUrls = StockCrawlerUrls; 