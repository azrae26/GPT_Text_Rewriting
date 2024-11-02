// 通知系統模組 - 處理所有通知相關的顯示和管理

const Notification = {
  notificationElement: null, // 儲存通知元素的變數
  notificationTimeout: null, // 儲存通知超時計時器的變數
  countdownInterval: null, // 儲存讀秒計時器的變數
  lastModelName: '', // 儲存上次使用的模型名稱
  lastApiKeyPrefix: '', // 儲存上次使用的 API 金鑰前綴

  /**
   * 顯示通知訊息。
   * @param {string} message - 要顯示的訊息，包含模型名稱和 API 金鑰資訊。
   * @param {boolean} isLoading - 是否為加載狀態，true 表示正在加載，false 表示加載完成。
   * @returns {Promise} - 一個 Promise 物件，在通知顯示完成後 resolve。
   */
  showNotification(message, isLoading = true) {
    console.log('顯示通知:', message, '正在加載:', isLoading);
    
    // 從 message 中提取模型名稱和 API KEY
    const modelMatch = message.match(/模型: (.*?)<br>/);
    const apiKeyMatch = message.match(/API KEY: (.*?)<br>/);
    
    const modelName = modelMatch ? modelMatch[1] : (isLoading ? '未知模型' : this.lastModelName);
    const apiKeyPrefix = apiKeyMatch ? apiKeyMatch[1] : (isLoading ? '未知' : this.lastApiKeyPrefix);

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

    if (!this.notificationElement) {
      this.notificationElement = document.createElement('div');
      this.notificationElement.classList.add('notification-element');
      document.body.appendChild(this.notificationElement);
      console.log('通知元素已創建並添加到 DOM');
    }

    this.notificationElement.innerHTML = `
      <div class="notification-title">
        ${isLoading ? '正在改寫' : '改寫完成'}
      </div>
      ${isLoading ? '<div class="spinner-container"><div class="spinner"></div><div id="countdown">0</div></div>' : ''}
      <div class="notification-info">
        模型: ${modelName}<br>
        API KEY: ${apiKeyPrefix}
      </div>
    `;
    
    return new Promise((resolve) => {
      setTimeout(() => {
        this.notificationElement.style.opacity = '1';
        console.log('通知淡入完成');
      }, 10);

      if (isLoading) {
        console.log('開始讀秒');
        if (this.countdownInterval) {
          clearInterval(this.countdownInterval);
        }
        
        let count = 0;
        const countdownElement = document.getElementById('countdown');
        
        if (countdownElement) {
          countdownElement.textContent = count;
        }
        
        this.countdownInterval = setInterval(() => {
          count++;
          if (countdownElement) {
            countdownElement.textContent = count;
          }
          console.log('讀秒:', count);
        }, 1000);
        
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
