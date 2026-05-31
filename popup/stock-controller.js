/**
 * popup/stock-controller.js - 股票功能控制器模組
 * 功能：提供股票相關功能的完整管理，包含股票清單和自動爬蟲
 * 職責：
 * - 股票清單管理：處理股票代碼和公司名稱的儲存、更新和複製
 * - 股票爬蟲控制：管理背景爬蟲的啟動、停止和定時執行
 * - 即時狀態同步：與背景服務同步爬蟲狀態和進度
 * - UI 狀態管理：更新按鈕狀態、進度條和狀態訊息
 * - 錯誤處理和重試：處理爬蟲失敗和網路錯誤
 * - 設定持久化：儲存爬蟲間隔和股票清單設定
 * 
 * 重構說明：
 * - 從 popup.js 中獨立出來的股票功能模組（2024年重構）
 * - 維持與主程式的接口兼容性和功能完整性
 * 
 * 依賴：
 * - GlobalSettings：全局設定管理
 * - Chrome Runtime API：與背景服務通信
 * - triggerContentScriptUpdate：內容腳本更新觸發器
 */

// === 配置常數 ===
const STOCK_CRAWLER_CONFIG = {
  // 爬蟲間隔時間限制（分鐘）
  MIN_CRAWL_INTERVAL: 0.1,
  MAX_CRAWL_INTERVAL: 9999
};

// 股票功能管理器
const StockManager = {
  // DOM 元素引用
  stockListInput: null,
  copyButton: null,
  searchInput: null,
  searchCount: null,
  // 搜尋狀態：matches 為每個匹配在文字中的起始索引，index 為目前停留的匹配序號
  searchMatches: [],
  searchIndex: -1,

  // 初始化
  init(stockListInputElement, triggerContentScriptUpdateFn) {
    LogUtils.log('初始化股票功能管理器');
    this.stockListInput = stockListInputElement;
    this.triggerContentScriptUpdate = triggerContentScriptUpdateFn;
    this.copyButton = document.getElementById('copy-stock-list');

    // 綁定複製按鈕事件
    if (this.copyButton) {
      this.copyButton.addEventListener('click', () => this.copyStockList());
    }

    // 初始化搜尋框
    this.initSearch();

    // 初始化股票爬蟲控制器
    StockCrawlerController.init();

    LogUtils.log('股票功能管理器初始化完成');
  },

  // 初始化股票清單搜尋框
  initSearch() {
    this.searchInput = document.getElementById('stock-search');
    this.searchCount = document.getElementById('stock-search-count');
    const prevBtn = document.getElementById('stock-search-prev');
    const nextBtn = document.getElementById('stock-search-next');
    if (!this.searchInput) return;

    // 輸入即時搜尋並跳到第一個匹配
    this.searchInput.addEventListener('input', () => {
      this.computeMatches();
      this.gotoMatch(this.searchMatches.length ? 0 : -1);
    });

    // Enter：下一個；Shift+Enter：上一個
    this.searchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        this.stepMatch(e.shiftKey ? -1 : 1);
      }
    });

    if (prevBtn) prevBtn.addEventListener('click', () => { this.stepMatch(-1); this.searchInput.focus(); });
    if (nextBtn) nextBtn.addEventListener('click', () => { this.stepMatch(1); this.searchInput.focus(); });
  },

  // 計算所有匹配的起始索引（不分大小寫）
  computeMatches() {
    const term = this.searchInput.value.trim().toLowerCase();
    this.searchMatches = [];
    this.searchIndex = -1;
    if (term) {
      const text = this.stockListInput.value.toLowerCase();
      let from = 0, pos;
      while ((pos = text.indexOf(term, from)) !== -1) {
        this.searchMatches.push(pos);
        from = pos + term.length;
      }
    }
  },

  // 往前/往後跳一個匹配（循環）
  stepMatch(delta) {
    if (!this.searchMatches.length) {
      this.updateSearchCount();
      return;
    }
    const count = this.searchMatches.length;
    const next = this.searchIndex < 0
      ? (delta > 0 ? 0 : count - 1)
      : (this.searchIndex + delta + count) % count;
    this.gotoMatch(next);
  },

  // 跳到指定序號的匹配：選取文字並捲動到可見位置
  gotoMatch(i) {
    this.searchIndex = i;
    this.updateSearchCount();
    if (i < 0) return;

    const ta = this.stockListInput;
    const start = this.searchMatches[i];
    const end = start + this.searchInput.value.trim().length;
    ta.setSelectionRange(start, end);

    // 不搶走搜尋框焦點（避免中文輸入法組字中斷），用鏡像 div 實測匹配的像素高度，
    // 這樣長行自動換行也能精準命中（單純數 \n 會少算換行的視覺行數）
    const offsetTop = this.measureOffsetTop(ta, start);
    const cs = getComputedStyle(ta);
    let lineHeight = parseFloat(cs.lineHeight);
    if (isNaN(lineHeight)) lineHeight = parseFloat(cs.fontSize) * 1.4;
    // 讓匹配行落在可視區中央
    ta.scrollTop = Math.max(0, offsetTop - ta.clientHeight / 2 + lineHeight / 2);
  },

  // 用鏡像 div 量測「文字索引 index 起點」距 textarea 內容頂端的像素高度（含換行）
  measureOffsetTop(ta, index) {
    const cs = getComputedStyle(ta);
    const div = document.createElement('div');
    // 複製所有會影響換行/排版的樣式
    const props = ['fontFamily', 'fontSize', 'fontWeight', 'fontStyle', 'lineHeight',
      'letterSpacing', 'wordSpacing', 'textTransform', 'textIndent',
      'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft', 'tabSize'];
    props.forEach(p => { div.style[p] = cs[p]; });
    div.style.position = 'absolute';
    div.style.visibility = 'hidden';
    div.style.whiteSpace = 'pre-wrap';
    div.style.wordWrap = 'break-word';
    div.style.overflowWrap = 'break-word';
    div.style.boxSizing = 'border-box';
    div.style.border = '0';
    // clientWidth 已扣掉邊框與捲軸，加上 padding 後等於 textarea 實際換行寬度
    div.style.width = ta.clientWidth + 'px';
    div.style.top = '0';
    div.style.left = '-9999px';

    div.textContent = ta.value.substring(0, index);
    const span = document.createElement('span');
    span.textContent = ta.value.substring(index) || '.';
    div.appendChild(span);
    document.body.appendChild(div);
    const offsetTop = span.offsetTop; // 相對 div padding box 頂端，已含 paddingTop
    document.body.removeChild(div);
    return offsetTop;
  },

  // 更新「目前/總數」提示
  updateSearchCount() {
    if (!this.searchCount) return;
    const total = this.searchMatches.length;
    if (!this.searchInput.value.trim()) {
      this.searchCount.textContent = '';
    } else if (!total) {
      this.searchCount.textContent = '0';
    } else {
      this.searchCount.textContent = `${this.searchIndex + 1}/${total}`;
    }
  },

  // 更新股票清單設定
  async updateStockListSettings() {
    await GlobalSettings.saveSingleSetting('stockList', this.stockListInput.value);
    
    // 立即通知 content script 更新股票清單
    chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
      if (tabs[0]) {
        chrome.tabs.sendMessage(tabs[0].id, {
          action: "updateStockList",
          stockList: StockManager.stockListInput.value
        }, function(response) {
          if (chrome.runtime.lastError) {
            LogUtils.log('content script 未載入，股票清單將在下次載入時應用');
          } else if (response && response.success) {
            LogUtils.log('股票清單已立即更新');
          } else {
            LogUtils.error('更新股票清單失敗:', response?.error || '未知錯誤');
          }
        });
      }
    });
  },

  // 複製股票清單
  copyStockList() {
    const stockListText = this.stockListInput.value.trim();
    if (!stockListText) {
      return;
    }
    
    // 處理股票清單：去除特殊規則，代號和公司名用TAB隔開
    const processedList = stockListText
      .split('\n')
      .filter(line => line.trim())
      .map(line => {
        const parts = line.split(',');
        if (parts.length >= 2) {
          // 只取代號和公司名稱，忽略匹配模式
          const code = parts[0].trim();
          const name = parts[1].trim();
          return `${code}\t${name}`;
        }
        return line.trim();
      })
      .join('\n');
    
    // 複製到剪貼簿
    navigator.clipboard.writeText(processedList).then(() => {
      // 綠色動畫和圖示反饋
      const originalIcon = this.copyButton.innerHTML;
      this.copyButton.classList.add('copied');
      this.copyButton.innerHTML = '<i class="fa-solid fa-check"></i>';
      setTimeout(() => {
        this.copyButton.classList.remove('copied');
        this.copyButton.innerHTML = originalIcon;
      }, 1000);
    }).catch(err => {
      LogUtils.error('複製失敗:', err);
    });
  },

  // 獲取事件處理配置
  getEventHandlerConfig() {
    return {
      'stockList': { 
        type: 'input', 
        element: this.stockListInput,
        callback: () => this.updateStockListSettings()
      }
    };
  }
};

// 股票爬蟲控制器
const StockCrawlerController = {
  startButton: document.getElementById('start-crawl'),
  autoToggleButton: document.getElementById('auto-crawl-toggle'),
  intervalInput: document.getElementById('crawler-interval'),
  statusText: document.getElementById('crawler-status'),
  progressContainer: document.getElementById('progress-container'),
  progressFill: document.getElementById('progress-fill'),
  progressText: document.getElementById('progress-text'),
  
  // 狀態追蹤
  isRunning: false,
  isScheduled: false,
  savedStockListValue: '',
  initialized: false, // 添加初始化標誌
  
  // 初始化
  init() {
    LogUtils.log('初始化背景股票爬蟲控制器');
    
    // 防止重複初始化
    if (this.initialized) {
      LogUtils.log('StockCrawlerController 已經初始化過，跳過重複初始化');
      return;
    }
    
    // 綁定事件
    this.bindEvents();
    
    // 查詢當前狀態
    this.queryStatus();
    
    // 設置狀態監聽器
    this.setupStatusListener();
    
    // 標記為已初始化
    this.initialized = true;
    LogUtils.log('StockCrawlerController 初始化完成');
  },
  
  // 綁定事件
  bindEvents() {
    // 立刻爬取按鈕事件
    this.startButton.addEventListener('click', () => {
      if (this.isRunning) {
        this.stopCurrentCrawl();
      } else {
        this.startSingleCrawl();
      }
    });
    
    // 自動爬取切換按鈕事件
    this.autoToggleButton.addEventListener('click', () => {
      if (this.isScheduled) {
        this.stopScheduledCrawl();
      } else {
        this.startScheduledCrawl();
      }
    });
    
    // 間隔時間變化事件
    this.intervalInput.addEventListener('change', () => {
      // 如果當前有定時爬取，重新啟動以應用新間隔
      if (this.isScheduled) {
        LogUtils.log('間隔時間已變更，重新啟動定時爬取...');
        this.stopScheduledCrawl();
        // 增加延遲時間確保停止操作完成
        setTimeout(() => {
          if (!this.isScheduled) { // 確保已成功停止
            this.startScheduledCrawl();
          }
        }, 300);
      }
    });
    
    // 監聽股票清單輸入變化
    if (StockManager.stockListInput) {
      StockManager.stockListInput.addEventListener('input', () => {
        // 保存股票清單時也觸發更新
        StockManager.updateStockListSettings();
      });
    }
  },
  
  // 查詢當前狀態
  queryStatus() {
    chrome.runtime.sendMessage({
      action: 'stockCrawler',
      command: 'getStatus'
    }, (response) => {
      // 檢查 chrome.runtime.lastError
      if (chrome.runtime.lastError) {
        LogUtils.log('查詢狀態時通信錯誤:', chrome.runtime.lastError.message);
        this.updateStatus('無法連接到背景腳本', 'error');
        return;
      }
      
      if (response && response.success) {
        const status = response.status;
        this.isRunning = status.isRunning;
        this.isScheduled = status.isScheduled;
        
        this.updateStartButtonState(this.isRunning);
        this.updateAutoToggleButtonState(this.isScheduled);
        
        if (this.isRunning) {
          this.showProgress();
          this.updateProgress(status.progress || 0);
          this.updateStatus('正在背景爬取中...', 'running');
        } else if (this.isScheduled) {
          this.updateStatus(`自動爬取已啟用，間隔 ${status.intervalMinutes} 分鐘`);
        } else {
          this.updateStatus('點擊按鈕開始爬取股票清單');
        }
      } else {
        this.updateStatus('無法獲取爬蟲狀態', 'error');
      }
    });
  },
  
  // 設置狀態監聽器
  setupStatusListener() {
    // 建立長連接來接收狀態更新
    const port = chrome.runtime.connect({ name: 'stockCrawlerStatus' });
    
    port.onMessage.addListener((message) => {
      if (message.type === 'stockCrawlerStatus') {
        this.handleStatusUpdate(message);
      }
    });
    
    port.onDisconnect.addListener(() => {
      LogUtils.log('狀態監聽器連接已斷開');
    });
    
    // 也發送添加監聽器的請求（用於立即狀態同步）
    chrome.runtime.sendMessage({
      action: 'stockCrawler',
      command: 'addListener'
    }, (response) => {
      // 檢查 chrome.runtime.lastError
      if (chrome.runtime.lastError) {
        LogUtils.log('設置狀態監聽器時通信錯誤:', chrome.runtime.lastError.message);
        return;
      }
      
      if (response && response.type === 'stockCrawlerStatus') {
        this.handleStatusUpdate(response);
      }
    });
  },
  
  // 處理狀態更新
  handleStatusUpdate(message) {
    LogUtils.log('收到爬蟲狀態更新:', message);
    
    this.isRunning = message.isRunning;
    this.isScheduled = message.intervalMinutes > 0;
    
    switch (message.status) {
      case 'running':
        this.updateStatus(message.data.status, 'running');
        // 先顯示進度條，再更新進度值
        if (this.progressContainer.style.display !== 'flex') {
          this.showProgress();
        }
        this.updateProgress(message.data.progress || 0);
        this.updateStartButtonState(true);
        break;
        
      case 'completed':
        // 確保狀態正確設置為非運行中
        this.isRunning = false;
        this.updateStatus(message.data.status, 'success');
        this.updateProgress(100);
        this.updateStartButtonState(false);
        this.hideProgress();
        this.onCrawlComplete(message.data.result);
        break;
        
      case 'warning':
        // 處理安全檢查警告狀態
        this.isRunning = false;
        this.updateStatus(message.data.status, 'warning');
        this.updateProgress(100);
        this.updateStartButtonState(false);
        this.hideProgress();
        // 不調用 onCrawlComplete，因為沒有實際更新股票清單
        break;
        
      case 'error':
        // 確保狀態正確設置為非運行中
        this.isRunning = false;
        this.updateStatus(message.data.status, 'error');
        this.updateProgress(message.data.progress || 0);  // 重置進度條
        this.updateStartButtonState(false);
        this.hideProgress();
        break;
        
      case 'scheduled':
        this.updateStatus(`已啟動自動爬取，每 ${message.data.intervalMinutes} 分鐘執行一次`);
        // 延遲更新按鈕狀態以避免閃爍
        setTimeout(() => {
          this.updateAutoToggleButtonState(true);
        }, 300);
        break;
        
      case 'singleStopped':
        // 只處理單次爬取的停止狀態
        this.isRunning = false;
        this.updateStartButtonState(false);
        this.updateProgress(message.data.progress || 0);
        this.updateStatus(message.data.status || '已停止爬取');
        this.hideProgress();
        break;
        
      case 'scheduledStopped':
        // 只處理自動爬取的停止狀態
        this.isScheduled = false;
        this.updateStatus('已停止自動爬取');
        // 延遲更新按鈕狀態以避免閃爍
        setTimeout(() => {
          this.updateAutoToggleButtonState(false);
        }, 300);
        break;
        
      case 'stopped':
        // 保留原有的通用停止處理（向後兼容）
        this.isRunning = false;
        this.isScheduled = false;
        this.updateAutoToggleButtonState(false);
        this.updateStartButtonState(false);
        this.updateProgress(message.data.progress || 0);
        this.updateStatus('已停止');
        this.hideProgress();
        break;
    }
  },
  
  // 開始單次爬取
  startSingleCrawl() {
    LogUtils.log('請求開始單次股票爬取');
    this.updateStatus('請求開始爬取...', 'running');
    this.updateStartButtonState(true);
    this.showProgress();
    this.updateProgress(0);  // 確保開始時進度為0
    
    // 保存當前股票清單內容
    this.savedStockListValue = StockManager.stockListInput.value;
    
    // 發送開始單次爬取請求到 background script
    chrome.runtime.sendMessage({
      action: 'stockCrawler',
      command: 'startSingle'
    }, (response) => {
      // 檢查 chrome.runtime.lastError
      if (chrome.runtime.lastError) {
        this.updateStatus('通信錯誤: ' + chrome.runtime.lastError.message, 'error');
        this.updateStartButtonState(false);
        this.hideProgress();
        return;
      }
      
      if (!response || !response.success) {
        this.updateStatus('啟動爬取失敗: ' + (response?.error || '未知錯誤'), 'error');
        this.updateStartButtonState(false);
        this.hideProgress();
      }
    });
  },
  
  // 停止當前爬取
  stopCurrentCrawl() {
    LogUtils.log('請求停止當前股票爬取');
    this.updateStatus('正在停止...', 'info');
    
    chrome.runtime.sendMessage({
      action: 'stockCrawler',
      command: 'stopCrawl'
    }, (response) => {
      // 檢查 chrome.runtime.lastError
      if (chrome.runtime.lastError) {
        this.updateStatus('通信錯誤: ' + chrome.runtime.lastError.message, 'error');
        return;
      }
      
      if (response && response.success) {
        this.updateStatus('已停止爬取');
        this.updateStartButtonState(false);
        this.hideProgress();
      } else {
        this.updateStatus('停止失敗: ' + (response?.error || '未知錯誤'), 'error');
      }
    });
  },
  
  // 開始定時爬取
  startScheduledCrawl() {
    // 檢查是否已初始化
    if (!this.initialized) {
      LogUtils.log('StockCrawlerController 尚未初始化完成，等待...');
      setTimeout(() => this.startScheduledCrawl(), 50);
      return;
    }
    
    const interval = parseFloat(this.intervalInput.value) || 30;
    
    // 驗證間隔時間
    if (interval < STOCK_CRAWLER_CONFIG.MIN_CRAWL_INTERVAL || interval > STOCK_CRAWLER_CONFIG.MAX_CRAWL_INTERVAL) {
      this.updateStatus(`無效的間隔時間，請輸入${STOCK_CRAWLER_CONFIG.MIN_CRAWL_INTERVAL}-${STOCK_CRAWLER_CONFIG.MAX_CRAWL_INTERVAL}之間的數字`, 'error');
      return;
    }
    
    // 開始啟動流程，顯示"啟動中"狀態
    this._attemptStartScheduled(interval, 0);
  },
  
  // 嘗試啟動定時爬取（帶重試）
  _attemptStartScheduled(interval, retryCount = 0) {
    const maxRetries = 6;
    
    LogUtils.log(`請求開始定時股票爬取，間隔 ${interval} 分鐘 (嘗試 ${retryCount + 1}/${maxRetries + 1})`);
    
    // 更新狀態為啟動中
    if (retryCount === 0) {
      this.updateStatus('正在啟動自動爬取...', 'info');
      this.updateAutoToggleButtonState('starting'); // 設置為啟動中狀態
    } else {
      this.updateStatus(`啟動中... (重試 ${retryCount}/${maxRetries})`, 'info');
    }
    
    chrome.runtime.sendMessage({
      action: 'stockCrawler',
      command: 'startScheduled',
      intervalMinutes: interval
    }, (response) => {
      // 檢查 chrome.runtime.lastError
      if (chrome.runtime.lastError) {
        LogUtils.log(`嘗試 ${retryCount + 1} 通信錯誤:`, chrome.runtime.lastError.message);
        this._handleStartScheduledFailure(interval, retryCount, maxRetries, `通信錯誤: ${chrome.runtime.lastError.message}`);
        return;
      }
      
      if (response && response.success) {
        // 成功：更新狀態和按鈕
        this.isScheduled = true;
        this.updateStatus(`已啟動自動爬取，每 ${interval} 分鐘執行一次`);
        LogUtils.log('定時爬取啟動成功');
        // 延遲更新按鈕狀態以避免閃爍
        setTimeout(() => {
          this.updateAutoToggleButtonState(true); // 設置為已啟動狀態
        }, 300);
      } else {
        const errorMsg = response?.error || '未知錯誤';
        LogUtils.log(`嘗試 ${retryCount + 1} 啟動失敗:`, errorMsg);
        this._handleStartScheduledFailure(interval, retryCount, maxRetries, errorMsg);
      }
    });
  },
  
  // 處理啟動失敗
  _handleStartScheduledFailure(interval, retryCount, maxRetries, errorMsg) {
    if (retryCount < maxRetries) {
      // 繼續重試
      LogUtils.log(`1秒後進行第 ${retryCount + 2} 次嘗試...`);
      setTimeout(() => {
        this._attemptStartScheduled(interval, retryCount + 1);
      }, 1000);
    } else {
      // 重試次數用盡，恢復原狀態
      LogUtils.log('重試次數用盡，啟動失敗');
      this.updateStatus('啟動自動爬取失敗: ' + errorMsg, 'error');
      // 延遲恢復按鈕狀態以避免閃爍
      setTimeout(() => {
        this.updateAutoToggleButtonState(false); // 恢復為未啟動狀態
      }, 300);
    }
  },
  
  // 停止定時爬取
  stopScheduledCrawl() {
    // 檢查是否已初始化
    if (!this.initialized) {
      LogUtils.log('StockCrawlerController 尚未初始化完成，等待...');
      setTimeout(() => this.stopScheduledCrawl(), 50);
      return;
    }
    
    LogUtils.log('請求停止定時股票爬取');
    this.updateStatus('正在停止自動爬取...', 'info');
    this.updateAutoToggleButtonState('stopping'); // 設置為停止中狀態
    
    chrome.runtime.sendMessage({
      action: 'stockCrawler',
      command: 'stopScheduled'
    }, (response) => {
      // 檢查 chrome.runtime.lastError
      if (chrome.runtime.lastError) {
        LogUtils.log('停止定時爬取通信錯誤:', chrome.runtime.lastError.message);
        this.updateStatus('通信錯誤: ' + chrome.runtime.lastError.message, 'error');
        // 延遲恢復按鈕狀態以避免閃爍
        setTimeout(() => {
          this.updateAutoToggleButtonState(true); // 恢復為啟動狀態
        }, 300);
        return;
      }
      
      if (response && response.success) {
        LogUtils.log('停止定時爬取請求成功，等待狀態更新...');
        // 不在這裡更新狀態，讓 handleStatusUpdate 處理
        // 這樣避免重複更新導致的閃爍
      } else {
        LogUtils.log('停止定時爬取請求失敗:', response?.error || '未知錯誤');
        this.updateStatus('停止自動爬取失敗: ' + (response?.error || '未知錯誤'), 'error');
        // 延遲恢復按鈕狀態以避免閃爍
        setTimeout(() => {
          this.updateAutoToggleButtonState(true); // 恢復為啟動狀態
        }, 300);
      }
    });
  },
  
  // 更新狀態顯示
  updateStatus(message, type = 'info') {
    this.statusText.textContent = message;
    this.statusText.className = `status-text ${type}`;
  },
  
  // 更新進度顯示
  updateProgress(progress) {
    LogUtils.log('更新進度:', progress);
    this.progressFill.style.width = `${progress}%`;
    this.progressText.textContent = `${progress}%`;
  },
  
  // 顯示進度條
  showProgress() {
    this.progressContainer.style.display = 'flex';
    // 移除自動重置進度為0，讓實際進度值顯示
    // this.updateProgress(0);
  },
  
  // 隱藏進度條
  hideProgress() {
    this.progressContainer.style.display = 'none';
  },
  
  // 更新立刻爬取按鈕狀態
  updateStartButtonState(isRunning) {
    if (isRunning) {
      this.startButton.textContent = '停止爬取';
      this.startButton.classList.add('stop');
    } else {
      this.startButton.textContent = '立刻爬取';
      this.startButton.classList.remove('stop');
    }
  },
  
  // 更新自動爬取切換按鈕狀態
  updateAutoToggleButtonState(state) {
    if (state === 'starting') {
      this.autoToggleButton.textContent = '啟動中...';
      this.autoToggleButton.classList.add('processing');
      this.autoToggleButton.classList.remove('running');
      this.autoToggleButton.disabled = true;
    } else if (state === 'stopping') {
      this.autoToggleButton.textContent = '停止中...';
      this.autoToggleButton.classList.add('processing');
      this.autoToggleButton.classList.remove('running');
      this.autoToggleButton.disabled = true;
    } else if (state === true || state === 'running') {
      this.autoToggleButton.textContent = '停止自動爬取';
      this.autoToggleButton.classList.add('running');
      this.autoToggleButton.classList.remove('processing');
      this.autoToggleButton.disabled = false;
    } else {
      this.autoToggleButton.textContent = '啟動自動爬取';
      this.autoToggleButton.classList.remove('running', 'processing');
      this.autoToggleButton.disabled = false;
    }
  },
  
  // 爬取完成回調
  onCrawlComplete(result) {
    LogUtils.log('爬取完成', result);
    
    // 重新載入股票清單到輸入框
    this.reloadStockList();
  },
  
  // 重新載入股票清單
  async reloadStockList() {
    try {
      const settings = await window.GlobalSettings.loadSettings();
      const newStockList = settings.stockList || '';
      
      // 如果內容有變化，更新輸入框
      if (newStockList !== this.savedStockListValue) {
        StockManager.stockListInput.value = newStockList;
        LogUtils.log('股票清單已更新');
        
        // 觸發內容腳本更新
        StockManager.triggerContentScriptUpdate();
      }
    } catch (error) {
      LogUtils.error('重新載入股票清單失敗:', error);
    }
  }
};

// 暴露到全域
window.StockManager = StockManager;
window.StockCrawlerController = StockCrawlerController; 