// 通知系統模組 - 處理所有通知相關的顯示和管理

const Notification = {
  notificationElement: null, // 儲存通知元素的變數
  notificationTimeout: null, // 儲存通知超時計時器的變數
  countdownInterval: null, // 儲存讀秒計時器的變數
  lastModelName: '', // 儲存上次使用的模型名稱
  lastApiKeyPrefix: '', // 儲存上次使用的 API 金鑰前綴
  currentCount: 0, // 當前讀秒計數

  /**
   * 顯示通知訊息。
   * @param {string} message - 要顯示的訊息，包含模型名稱和 API 金鑰資訊。
   * @param {boolean} isLoading - 是否為加載狀態，true 表示正在加載，false 表示加載完成。
   * @returns {Promise} - 一個 Promise 物件，在通知顯示完成後 resolve。
   */
  async showNotification(message, isLoading = true) {
    console.log('顯示通知:', message, '正在加載:', isLoading);
    
    // 從 message 中提取模型名稱和 API KEY
    const modelMatch = message.match(/模型: (.*?)<br>/);
    const apiKeyMatch = message.match(/API KEY: (.*?)<br>/);
    const batchMatch = message.match(/批次進度: (\d+)\/(\d+)/);
    
    const modelName = modelMatch ? modelMatch[1] : (isLoading ? '未知模型' : this.lastModelName);
    const apiKeyPrefix = apiKeyMatch ? apiKeyMatch[1] : (isLoading ? '未知' : this.lastApiKeyPrefix);
    const currentBatch = batchMatch ? batchMatch[1] : null;
    const totalBatches = batchMatch ? batchMatch[2] : null;

    if (isLoading) {
      this.lastModelName = modelName; //儲存模型名稱
      this.lastApiKeyPrefix = apiKeyPrefix; //儲存API KEY前綴
    }

    console.log('通知中的模型名:', modelName);
    console.log('通知的 API KEY 前綴:', apiKeyPrefix);

    // 清除之前的超時
    if (this.notificationTimeout) {
      console.log('清除之前的通知超時');
      clearTimeout(this.notificationTimeout);
      this.notificationTimeout = null;
    }

    // 只在第一次顯示通知時創建元素
    if (!this.notificationElement) {
      this.notificationElement = document.createElement('div');
      this.notificationElement.classList.add('notification-element');
      document.body.appendChild(this.notificationElement);
      console.log('通知元素已創建並添加到 DOM');
      this.currentCount = 0;
    }

    // 判斷是否為取消翻譯的通知
    const isCancelTranslation = message === '已取消翻譯';
    // 判斷是否為翻譯相關的通知
    const isTranslation = message.includes('翻譯中') || message.includes('翻譯完成') || isCancelTranslation;

    // 如果是批次進度更新，只更新進度相關的內容
    if (currentBatch && this.notificationElement) {
      const batchElement = this.notificationElement.querySelector('.current-batch');
      if (batchElement) {
        batchElement.textContent = currentBatch;
        return;
      }
    }

    // 只在首次顯示或結束時重建完整的通知內容
    if (!this.notificationElement.innerHTML || !isLoading) {
      this.notificationElement.innerHTML = `
        <div class="notification-title">
          ${isCancelTranslation ? '已取消翻譯' : 
            isTranslation ? 
              (isLoading ? '翻譯中' : '翻譯完成') : 
              (isLoading ? '正在改寫' : '改寫完成')}
        </div>
        ${currentBatch && !isCancelTranslation ? `
          <div class="batch-progress">批次：<span class="current-batch">${currentBatch}</span> / ${totalBatches}</div>
        ` : ''}
        ${isLoading && !isCancelTranslation ? '<div class="spinner-container"><div class="spinner"></div><div id="countdown">0</div></div>' : ''}
        ${!isCancelTranslation ? `
          <div class="notification-info">
            模型: ${modelName}<br>
            API KEY: ${apiKeyPrefix}
          </div>
        ` : ''}
      `;
    }
    
    return new Promise((resolve) => {
      setTimeout(() => {
        this.notificationElement.style.opacity = '1';
      }, 10);

      if (isLoading && !isCancelTranslation) {
        console.log('檢查讀秒狀態');
        const countdownElement = document.getElementById('countdown');
        
        if (countdownElement) {
          countdownElement.textContent = this.currentCount;
        }
        
        // 只在沒有運行中的讀秒器時才創建新的
        if (!this.countdownInterval) {
          console.log('開始新的讀秒');
          this.countdownInterval = setInterval(() => {
            this.currentCount++;
            const element = document.getElementById('countdown');
            if (element) {
              element.textContent = this.currentCount;
            }
            console.log('讀秒:', this.currentCount);
          }, 1000);
        }
        
        resolve();
      } else {
        console.log('設置非加載狀態的通知顯示時間');
        setTimeout(() => {
          console.log('開始淡出通知');
          this.notificationElement.style.transition = 'opacity 0.25s ease-out';
          this.notificationElement.style.opacity = '0';
          
          setTimeout(() => {
            console.log('通知淡出完成，準備移除通知');
            this.removeNotification();
            resolve();
          }, 250);
        }, 1200);
      }
    });
  },

  /**
   * 移除通知訊息。
   */
  removeNotification() {
    console.log('嘗試移除通知');
    if (this.notificationElement) {
      if (this.notificationElement.parentNode) {
        this.notificationElement.parentNode.removeChild(this.notificationElement);
        console.log('通知元素已從 DOM 中移除');
      } else {
        console.log('通知元素不在 DOM 中');
      }
      this.notificationElement = null;
    } else {
      console.log('沒有找到通知元素，無需移除');
    }
    this.clearAllTimers();
  },

  /**
   * 清除所有計時器。
   */
  clearAllTimers() {
    if (this.countdownInterval) {
      clearInterval(this.countdownInterval);
      this.countdownInterval = null;
      this.currentCount = 0;
      console.log('讀秒計時器已清除');
    }
    if (this.notificationTimeout) {
      clearTimeout(this.notificationTimeout);
      this.notificationTimeout = null;
      console.log('通知超時已清除');
    }
  }
};

// 確保 Notification 可以被其他檔案訪問
window.Notification = Notification;
