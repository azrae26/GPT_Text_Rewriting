/**
 * status_monitor.js - 狀態監控器
 * 功能：負責各種異常狀態的檢測和顯示，在目標網站右下角顯示狀態指示器
 * 職責：
 * - 定期檢測系統功能狀態（同步功能、自動爬取功能）
 * - 在右下角顯示狀態指示器
 * - 處理狀態變化和異常提示
 * - 只在目標網站啟用功能
 * 
 * 監控功能：
 * - 雲端同步狀態：檢測同步是否啟用、是否有錯誤
 * - 自動爬取狀態：檢測自動爬取是否啟用、間隔是否正常、是否有異常
 * 
 * 依賴：
 * - Chrome Extensions API (runtime, storage)
 * - LogUtils (日誌記錄)
 * - Background Script (狀態檢測)
 * - BackgroundStockCrawlerManager (自動爬取狀態)
 * - BackgroundSyncManager (同步狀態)
 */

const StatusMonitor = {
  
  // 狀態指示器 DOM 元素
  indicator: null,
  
  // 消息監聽器（用於清理）
  messageListener: null,
  
  // 上次狀態（避免重複更新）
  lastStatus: null,

  /**
   * 初始化同步狀態管理器
   */
  init() {
    // 檢查是否在目標網站
    if (!this.isTargetWebsite()) {
      LogUtils.log('非目標網站，跳過狀態監控功能');
      return;
    }

    LogUtils.log('初始化狀態監控器');
    
    try {
      this.createStatusIndicator();
      this.startStatusCheck();
      
      // 頁面可見性變化時重新檢查
      document.addEventListener('visibilitychange', () => {
        if (!document.hidden) {
          this.checkSyncStatus();
        }
      });
      
      LogUtils.log('狀態監控器初始化完成');
    } catch (error) {
              LogUtils.error('初始化狀態監控器失敗:', error);
    }
  },

  /**
   * 檢查是否為目標網站
   * @returns {boolean} - 是否為目標網站
   */
  isTargetWebsite() {
    const currentUrl = window.location.href;
    return currentUrl.startsWith('https://data.uanalyze.com.tw/');
  },

  /**
   * 創建狀態指示器 DOM 元素
   */
  createStatusIndicator() {
    if (this.indicator) {
      return; // 已存在，不重複創建
    }

    this.indicator = document.createElement('div');
    this.indicator.id = 'sync-status-indicator';
    this.indicator.className = 'sync-status-hidden'; // 默認隱藏
    
    document.body.appendChild(this.indicator);
    LogUtils.log('狀態指示器已創建');
  },

  /**
   * 開始狀態監聽
   */
  startStatusCheck() {
    // 初始化時檢查一次當前狀態
    this.checkSyncStatus();
    
    // 創建消息監聽器並保存引用
    this.messageListener = (request, sender, sendResponse) => {
      if (request.action === 'syncStatusChanged') {
        LogUtils.log('收到同步狀態變化通知:', request.status);
        // 重新檢查所有狀態
        this.checkSyncStatus();
        sendResponse({success: true});
      } else if (request.type === 'stockCrawlerStatus') {
        LogUtils.log('收到自動爬取狀態變化通知:', request.status);
        // 重新檢查所有狀態
        this.checkSyncStatus();
        sendResponse({success: true});
      }
    };
    
    // 監聽背景腳本的狀態變化通知
    chrome.runtime.onMessage.addListener(this.messageListener);
    
    LogUtils.log('開始監聽狀態變化事件');
  },

  /**
   * 停止狀態監聽
   */
  stopStatusCheck() {
    // 事件監聽器會在頁面銷毀時自動清理
    LogUtils.log('狀態監聽已停止');
  },

  /**
   * 檢查同步狀態
   */
  async checkSyncStatus() {
    try {
      // 同時檢查同步狀態和自動爬取狀態
      const [syncResponse, crawlerResponse] = await Promise.all([
        new Promise((resolve, reject) => {
          chrome.runtime.sendMessage({
            action: 'settingsSync',
            command: 'getSyncStatus'
          }, (result) => {
            if (chrome.runtime.lastError) {
              reject(new Error(chrome.runtime.lastError.message));
            } else {
              resolve(result);
            }
          });
        }),
        new Promise((resolve, reject) => {
          chrome.runtime.sendMessage({
            action: 'stockCrawler',
            command: 'getStatus'
          }, (result) => {
            if (chrome.runtime.lastError) {
              reject(new Error(chrome.runtime.lastError.message));
            } else {
              resolve(result);
            }
          });
        })
      ]);

      // 合併兩個狀態
      const combinedStatus = {
        sync: syncResponse && syncResponse.success ? syncResponse : null,
        crawler: crawlerResponse && crawlerResponse.success ? crawlerResponse.status : null
      };

      this.updateStatusDisplay(combinedStatus);
    } catch (error) {
      LogUtils.error('檢查狀態失敗:', error);
      this.showError('狀態檢查錯誤');
    }
  },

  /**
   * 更新狀態顯示
   * @param {object} statusData - 同步狀態資料
   */
  updateStatusDisplay(statusData) {
    const currentStatus = this.analyzeStatus(statusData);
    
    // 避免重複更新相同狀態
    if (JSON.stringify(currentStatus) === JSON.stringify(this.lastStatus)) {
      return;
    }
    
    this.lastStatus = currentStatus;
    
    if (currentStatus.shouldShow) {
      this.showStatus(currentStatus);
    } else {
      this.hideStatus();
    }
  },

  /**
   * 分析同步狀態
   * @param {object} data - 原始狀態資料
   * @returns {object} - 分析後的狀態
   */
  analyzeStatus(data) {
    const syncData = data.sync || {};
    const crawlerData = data.crawler || {};
    
    // 分析同步狀態
    const syncStatus = this.analyzeSyncStatus(syncData);
    
    // 分析自動爬取狀態
    const crawlerStatus = this.analyzeCrawlerStatus(crawlerData);
    
    // 收集有問題的狀態訊息
    const errorMessages = [];
    const warningMessages = [];
    const disabledMessages = [];
    
    // 收集同步狀態訊息
    if (syncStatus.type === 'error') {
      errorMessages.push(syncStatus.message);
    } else if (syncStatus.type === 'warning') {
      warningMessages.push(syncStatus.message);
    } else if (syncStatus.type === 'disabled') {
      disabledMessages.push(syncStatus.message);
    }
    
    // 收集自動爬取狀態訊息
    if (crawlerStatus.type === 'error') {
      errorMessages.push(crawlerStatus.message);
    } else if (crawlerStatus.type === 'warning') {
      warningMessages.push(crawlerStatus.message);
    } else if (crawlerStatus.type === 'disabled') {
      disabledMessages.push(crawlerStatus.message);
    }
    
    // 按優先級返回狀態
    if (errorMessages.length > 0) {
      return {
        shouldShow: true,
        type: 'error',
        message: errorMessages.join(' | ')
      };
    }
    
    if (warningMessages.length > 0) {
      return {
        shouldShow: true,
        type: 'warning',
        message: warningMessages.join(' | ')
      };
    }
    
    if (disabledMessages.length > 0) {
      return {
        shouldShow: true,
        type: 'disabled',
        message: disabledMessages.join(' | ')
      };
    }
    
    // 所有狀態都正常
    return {
      shouldShow: false,
      type: 'normal'
    };
  },

  /**
   * 分析同步狀態
   * @param {object} syncData - 同步狀態資料
   * @returns {object} - 分析後的同步狀態
   */
  analyzeSyncStatus(syncData) {
    const { enabled, status, error, lastSync } = syncData;
    
    // 未啟用
    if (!enabled) {
      return {
        type: 'disabled',
        message: '😢 同步未啟用'
      };
    }
    
    // 有錯誤
    if (error) {
      return {
        type: 'error',
        message: '⚠️ 同步錯誤'
      };
    }
    
    // 狀態為錯誤
    if (status === 'error') {
      return {
        type: 'error',
        message: '⚠️ 同步失敗'
      };
    }
    
    // 正常狀態（移除同步過時檢查，因為現在是訊號驅動）
    return {
      type: 'normal'
    };
  },

  /**
   * 分析自動爬取狀態
   * @param {object} crawlerData - 自動爬取狀態資料
   * @returns {object} - 分析後的自動爬取狀態
   */
  analyzeCrawlerStatus(crawlerData) {
    const { isRunning, isScheduled, intervalMinutes } = crawlerData;
    
    // 如果沒有狀態資料，可能是通信錯誤
    if (!crawlerData || Object.keys(crawlerData).length === 0) {
      return {
        type: 'error',
        message: '⚠️ 爬取狀態未知'
      };
    }
    
    // 自動爬取未啟用
    if (!isScheduled) {
      return {
        type: 'disabled',
        message: '😢 自動爬取未啟用'
      };
    }
    
    // 檢查間隔時間是否異常
    if (intervalMinutes && (intervalMinutes < 0.1 || intervalMinutes > 9999)) {
      return {
        type: 'error',
        message: '⚠️ 爬取間隔異常'
      };
    }
    
    // 正常狀態
    return {
      type: 'normal'
    };
  },

  /**
   * 顯示狀態
   * @param {object} statusInfo - 狀態信息
   */
  showStatus(statusInfo) {
    if (!this.indicator) return;
    
    this.indicator.className = `sync-status-show sync-status-${statusInfo.type}`;
    this.indicator.innerHTML = `
      <div class="sync-status-message">${statusInfo.message}</div>
    `;
    
    LogUtils.log(`顯示狀態: ${statusInfo.type} - ${statusInfo.message}`);
  },

  /**
   * 隱藏狀態指示器
   */
  hideStatus() {
    if (!this.indicator) return;
    
    this.indicator.className = 'sync-status-hidden';
  },

  /**
   * 顯示錯誤狀態
   * @param {string} message - 錯誤訊息
   */
  showError(message) {
    this.showStatus({
      type: 'error',
      message: '⚠️ 同步失敗'
    });
  },

  /**
   * 銷毀管理器（清理資源）
   */
  destroy() {
    this.stopStatusCheck();
    
    // 清理消息監聽器
    if (this.messageListener) {
      chrome.runtime.onMessage.removeListener(this.messageListener);
      this.messageListener = null;
    }
    
    if (this.indicator && this.indicator.parentNode) {
      this.indicator.parentNode.removeChild(this.indicator);
      this.indicator = null;
    }
    
    this.lastStatus = null;
    LogUtils.log('狀態監控器已銷毀');
  }
};

// 將監控器暴露到全域
window.StatusMonitor = StatusMonitor; 