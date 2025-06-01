/**
 * stock-controller.js - 股票功能控制器
 * 功能：管理股票清單、股票爬蟲等相關功能
 * 依賴：GlobalSettings, triggerContentScriptUpdate
 */

// 股票功能管理器
const StockManager = {
  // DOM 元素引用
  stockListInput: null,
  
  // 初始化
  init(stockListInputElement, triggerContentScriptUpdateFn) {
    console.log('初始化股票功能管理器');
    this.stockListInput = stockListInputElement;
    this.triggerContentScriptUpdate = triggerContentScriptUpdateFn;
    
    // 初始化股票爬蟲控制器
    StockCrawlerController.init();
    
    console.log('股票功能管理器初始化完成');
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
            console.log('content script 未載入，股票清單將在下次載入時應用');
          } else if (response && response.success) {
            console.log('股票清單已立即更新');
          } else {
            console.error('更新股票清單失敗:', response?.error || '未知錯誤');
          }
        });
      }
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
    console.log('初始化背景股票爬蟲控制器');
    
    // 綁定事件
    this.bindEvents();
    
    // 查詢當前狀態
    this.queryStatus();
    
    // 設置狀態監聽器
    this.setupStatusListener();
    
    // 標記為已初始化
    this.initialized = true;
    console.log('StockCrawlerController 初始化完成');
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
        this.stopScheduledCrawl();
        setTimeout(() => this.startScheduledCrawl(), 100);
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
        console.log('查詢狀態時通信錯誤:', chrome.runtime.lastError.message);
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
      console.log('狀態監聽器連接已斷開');
    });
    
    // 也發送添加監聽器的請求（用於立即狀態同步）
    chrome.runtime.sendMessage({
      action: 'stockCrawler',
      command: 'addListener'
    }, (response) => {
      // 檢查 chrome.runtime.lastError
      if (chrome.runtime.lastError) {
        console.log('設置狀態監聽器時通信錯誤:', chrome.runtime.lastError.message);
        return;
      }
      
      if (response && response.type === 'stockCrawlerStatus') {
        this.handleStatusUpdate(response);
      }
    });
  },
  
  // 處理狀態更新
  handleStatusUpdate(message) {
    console.log('收到爬蟲狀態更新:', message);
    
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
    console.log('請求開始單次股票爬取');
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
    console.log('請求停止當前股票爬取');
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
      console.log('StockCrawlerController 尚未初始化完成，等待...');
      setTimeout(() => this.startScheduledCrawl(), 50);
      return;
    }
    
    const interval = parseFloat(this.intervalInput.value) || 30;
    
    // 驗證間隔時間
    if (interval < 0.1 || interval > 9999) {
      this.updateStatus('無效的間隔時間，請輸入0.1-9999之間的數字', 'error');
      return;
    }
    
    // 開始啟動流程，顯示"啟動中"狀態
    this._attemptStartScheduled(interval, 0);
  },
  
  // 嘗試啟動定時爬取（帶重試）
  _attemptStartScheduled(interval, retryCount = 0) {
    const maxRetries = 6;
    
    console.log(`請求開始定時股票爬取，間隔 ${interval} 分鐘 (嘗試 ${retryCount + 1}/${maxRetries + 1})`);
    
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
        console.log(`嘗試 ${retryCount + 1} 通信錯誤:`, chrome.runtime.lastError.message);
        this._handleStartScheduledFailure(interval, retryCount, maxRetries, `通信錯誤: ${chrome.runtime.lastError.message}`);
        return;
      }
      
      if (response && response.success) {
        // 成功：更新狀態和按鈕
        this.isScheduled = true;
        this.updateStatus(`已啟動自動爬取，每 ${interval} 分鐘執行一次`);
        console.log('定時爬取啟動成功');
        // 延遲更新按鈕狀態以避免閃爍
        setTimeout(() => {
          this.updateAutoToggleButtonState(true); // 設置為已啟動狀態
        }, 300);
      } else {
        const errorMsg = response?.error || '未知錯誤';
        console.log(`嘗試 ${retryCount + 1} 啟動失敗:`, errorMsg);
        this._handleStartScheduledFailure(interval, retryCount, maxRetries, errorMsg);
      }
    });
  },
  
  // 處理啟動失敗
  _handleStartScheduledFailure(interval, retryCount, maxRetries, errorMsg) {
    if (retryCount < maxRetries) {
      // 繼續重試
      console.log(`1秒後進行第 ${retryCount + 2} 次嘗試...`);
      setTimeout(() => {
        this._attemptStartScheduled(interval, retryCount + 1);
      }, 1000);
    } else {
      // 重試次數用盡，恢復原狀態
      console.log('重試次數用盡，啟動失敗');
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
      console.log('StockCrawlerController 尚未初始化完成，等待...');
      setTimeout(() => this.stopScheduledCrawl(), 50);
      return;
    }
    
    console.log('請求停止定時股票爬取');
    this.updateStatus('正在停止自動爬取...', 'info');
    this.updateAutoToggleButtonState('stopping'); // 設置為停止中狀態
    
    chrome.runtime.sendMessage({
      action: 'stockCrawler',
      command: 'stopScheduled'
    }, (response) => {
      // 檢查 chrome.runtime.lastError
      if (chrome.runtime.lastError) {
        console.log('停止定時爬取通信錯誤:', chrome.runtime.lastError.message);
        this.updateStatus('通信錯誤: ' + chrome.runtime.lastError.message, 'error');
        // 延遲恢復按鈕狀態以避免閃爍
        setTimeout(() => {
          this.updateAutoToggleButtonState(true); // 恢復為啟動狀態
        }, 300);
        return;
      }
      
      if (response && response.success) {
        console.log('停止定時爬取請求成功，等待狀態更新...');
        // 不在這裡更新狀態，讓 handleStatusUpdate 處理
        // 這樣避免重複更新導致的閃爍
      } else {
        console.log('停止定時爬取請求失敗:', response?.error || '未知錯誤');
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
    console.log('更新進度:', progress);
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
    console.log('爬取完成', result);
    
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
        console.log('股票清單已更新');
        
        // 觸發內容腳本更新
        StockManager.triggerContentScriptUpdate();
      }
    } catch (error) {
      console.error('重新載入股票清單失敗:', error);
    }
  }
};

// 暴露到全域
window.StockManager = StockManager;
window.StockCrawlerController = StockCrawlerController; 