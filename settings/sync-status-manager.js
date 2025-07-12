/**
 * sync-status-manager.js - 同步狀態管理器
 * 功能：專門負責同步狀態的檢測和顯示，在目標網站右下角顯示同步狀態
 * 職責：
 * - 定期檢測同步功能狀態
 * - 在右下角顯示同步狀態指示器
 * - 處理狀態變化和錯誤提示
 * - 只在目標網站啟用功能
 * 
 * 依賴：
 * - Chrome Extensions API (runtime, storage)
 * - LogUtils (日誌記錄)
 * - Background Script (同步狀態檢測)
 */

const SyncStatusManager = {
  
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
      LogUtils.log('非目標網站，跳過同步狀態顯示功能');
      return;
    }

    LogUtils.log('初始化同步狀態管理器');
    
    try {
      this.createStatusIndicator();
      this.startStatusCheck();
      
      // 頁面可見性變化時重新檢查
      document.addEventListener('visibilitychange', () => {
        if (!document.hidden) {
          this.checkSyncStatus();
        }
      });
      
      LogUtils.log('同步狀態管理器初始化完成');
    } catch (error) {
      LogUtils.error('初始化同步狀態管理器失敗:', error);
    }
  },

  /**
   * 檢查是否為目標網站
   * @returns {boolean} - 是否為目標網站
   */
  isTargetWebsite() {
    const currentUrl = window.location.href;
    return currentUrl.startsWith('https://data.uanalyze.twobitto.com/');
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
    LogUtils.log('同步狀態指示器已創建');
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
        this.updateStatusDisplay(request.status);
        sendResponse({success: true});
      }
    };
    
    // 監聽背景腳本的同步狀態變化通知
    chrome.runtime.onMessage.addListener(this.messageListener);
    
    LogUtils.log('開始監聽同步狀態變化事件');
  },

  /**
   * 停止狀態監聽
   */
  stopStatusCheck() {
    // 事件監聽器會在頁面銷毀時自動清理
    LogUtils.log('同步狀態監聽已停止');
  },

  /**
   * 檢查同步狀態
   */
  async checkSyncStatus() {
    try {
      const response = await new Promise((resolve, reject) => {
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
      });

      if (response && response.success) {
        this.updateStatusDisplay(response);
      } else {
        LogUtils.warn('獲取同步狀態失敗:', response);
        this.showError('無法獲取同步狀態');
      }
    } catch (error) {
      LogUtils.error('檢查同步狀態失敗:', error);
      this.showError('同步狀態檢查錯誤');
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
    const { enabled, status, error, lastSync } = data;
    
    // 未啟用
    if (!enabled) {
      return {
        shouldShow: true,
        type: 'disabled',
        message: '😢 同步未啟用'
      };
    }
    
    // 有錯誤
    if (error) {
      return {
        shouldShow: true,
        type: 'error',
        message: '⚠️ 同步錯誤'
      };
    }
    
    // 狀態為錯誤
    if (status === 'error') {
      return {
        shouldShow: true,
        type: 'error',
        message: '⚠️ 同步失敗'
      };
    }
    
    // 長時間未同步（超過1小時）
    if (lastSync && (Date.now() - lastSync) > 60 * 60 * 1000) {
      return {
        shouldShow: true,
        type: 'warning',
        message: '⚠️ 同步過時'
      };
    }
    
    // 正常狀態 - 不顯示
    return {
      shouldShow: false,
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
    
    LogUtils.log(`顯示同步狀態: ${statusInfo.type} - ${statusInfo.message}`);
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
    LogUtils.log('同步狀態管理器已銷毀');
  }
};

// 將管理器暴露到全域
window.SyncStatusManager = SyncStatusManager; 