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
    
    // 如果不是加載狀態，立即清除所有計時器
    if (!isLoading) {
      this.clearAllTimers();
    }
    
    // 從 message 中提取模型名稱和 API KEY
    const modelMatch = message.match(/模型: (.*?)<br>/);
    const apiKeyMatch = message.match(/API KEY: (.*?)<br>/);
    const batchMatch = message.match(/批次進度: (\d+)\/(\d+)/);
    
    const modelName = modelMatch ? modelMatch[1] : (isLoading ? '未知模型' : this.lastModelName);
    const apiKeyPrefix = apiKeyMatch ? apiKeyMatch[1] : (isLoading ? '未知' : this.lastApiKeyPrefix);
    const currentBatch = batchMatch ? batchMatch[1] : null;
    const totalBatches = batchMatch ? batchMatch[2] : null;

    // 判斷是否為取消翻譯的通知
    const isCancelTranslation = message === TranslateConfig.STAGES.CANCELLED;
    // 判斷是否為取消生成的通知
    const isCancelGeneration = message === GenerationConfig.STAGES.CANCELLED;
    
    // 判斷是否為生成相關的通知（優先判斷，因為更具體）
    const isGeneration = message.includes(GenerationConfig.STAGES.INITIAL) || 
                        message.includes(GenerationConfig.STAGES.REFLECT_1) || 
                        message.includes(GenerationConfig.STAGES.OPTIMIZE_1) || 
                        message.includes(GenerationConfig.STAGES.REFLECT_2) || 
                        message.includes(GenerationConfig.STAGES.OPTIMIZE_2) || 
                        isCancelGeneration;
    
    // 判斷是否為翻譯相關的通知
    const isTranslation = !isGeneration && (
      message.includes(TranslateConfig.STAGES.INITIAL) || 
      message.includes(TranslateConfig.STAGES.REFLECT) || 
      message.includes(TranslateConfig.STAGES.OPTIMIZE) || 
      isCancelTranslation
    );

    // 判斷翻譯階段
    let translationPhase = '初步翻譯中';
    if (message.includes(TranslateConfig.STAGES.REFLECT)) {
      translationPhase = '反思翻譯中';
    } else if (message.includes(TranslateConfig.STAGES.OPTIMIZE)) {
      translationPhase = '優化翻譯中';
    }

    // 判斷生成階段
    let generationPhase = '初始生成中';
    if (message.includes(GenerationConfig.STAGES.REFLECT_1)) {
      generationPhase = '反思一中';
    } else if (message.includes(GenerationConfig.STAGES.OPTIMIZE_1)) {
      generationPhase = '生成優化一中';
    } else if (message.includes(GenerationConfig.STAGES.REFLECT_2)) {
      generationPhase = '反思二中';
    } else if (message.includes(GenerationConfig.STAGES.OPTIMIZE_2)) {
      generationPhase = '生成優化二中';
    }

    if (isLoading) {
      this.lastModelName = modelName;
      this.lastApiKeyPrefix = apiKeyPrefix;
    }

    // 只在第一次顯示通知時創建元素和初始化讀秒
    const isFirstNotification = !this.notificationElement;
    if (isFirstNotification) {
      this.notificationElement = document.createElement('div');
      this.notificationElement.classList.add('notification-element');
      document.body.appendChild(this.notificationElement);
      console.log('通知元素已創建並添加到 DOM');
      this.currentCount = 0;
      
      // 只在首次創建時初始化讀秒計時器
      if (isLoading) {
        this.startCountdown();
      }
    }

    // 如果是批次進度更新，只更新進度相關的內容
    if (currentBatch && this.notificationElement && isLoading) {
      const batchElement = this.notificationElement.querySelector('.current-batch');
      if (batchElement) {
        batchElement.textContent = currentBatch;
        const titleElement = this.notificationElement.querySelector('.notification-title');
        if (titleElement) {
          titleElement.textContent = translationPhase;
        }
        
        // 更新進度條
        const progressBar = this.notificationElement.querySelector('.progress-bar');
        if (progressBar) {
          console.log('更新進度條 - 當前批次:', currentBatch, '總批次:', totalBatches);
          // 設定 data-segments 屬性
          const totalBatchesNum = parseInt(totalBatches);
          const stepsPerBatch = isTranslation ? 3 : 5; // 翻譯有3個步驟，生成有5個步驟
          const totalSegments = totalBatchesNum * stepsPerBatch;
          if (totalSegments > 60) {
            progressBar.setAttribute('data-segments', 'most');
          } else if (totalSegments > 40) {
            progressBar.setAttribute('data-segments', 'more');
          } else if (totalSegments > 25) {
            progressBar.setAttribute('data-segments', 'many');
          } else {
            progressBar.removeAttribute('data-segments');
          }
          progressBar.innerHTML = Array.from({ length: totalSegments }, (_, i) => {
            const isCompleted = i < (isTranslation ? window.TranslateManager.completedStepsCount : window.GenerationManager.completedStepsCount);
            return `<div class="progress-segment ${isCompleted ? 'completed' : ''}"></div>`;
          }).join('');
        }
        return;
      }
    }

    // 重建完整的通知內容
    console.log('當前批次:', currentBatch, '總批次:', totalBatches);

    this.notificationElement.innerHTML = `
      <div class="notification-title">
        ${isCancelTranslation ? '已取消翻譯' : 
          isCancelGeneration ? '已取消生成' :
          isTranslation ? 
            (isLoading ? translationPhase : '翻譯完成') : 
          isGeneration ?
            (isLoading ? generationPhase : '生成完成') :
            (isLoading ? '正在改寫' : '改寫完成')}
      </div>
      ${currentBatch && !isCancelTranslation && !isCancelGeneration ? `
        <div class="batch-progress">批次：<span class="current-batch">${currentBatch}</span> / ${totalBatches}</div>
      ` : ''}
      ${currentBatch && totalBatches && !isCancelTranslation && !isCancelGeneration ? `
        <div class="progress-bar" ${
          (() => {
            const stepsPerBatch = isTranslation ? 3 : 5;
            const totalSegments = parseInt(totalBatches) * stepsPerBatch;
            if (totalSegments > 60) return 'data-segments="most"';
            if (totalSegments > 40) return 'data-segments="more"';
            if (totalSegments > 25) return 'data-segments="many"';
            return '';
          })()
        }>
          ${Array.from({ length: parseInt(totalBatches) * (isTranslation ? 3 : 5) }, (_, i) => {
            const isCompleted = i < (isTranslation ? window.TranslateManager.completedStepsCount : window.GenerationManager.completedStepsCount);
            return `<div class="progress-segment ${isCompleted ? 'completed' : ''}"></div>`;
          }).join('')}
        </div>
      ` : ''}
      ${isLoading && !isCancelTranslation && !isCancelGeneration ? '<div class="spinner-container"><div class="spinner"></div><div id="countdown">0</div></div>' : ''}
      ${!isCancelTranslation && !isCancelGeneration ? `
        <div class="notification-info">
          模型: ${modelName}<br>
          API KEY: ${apiKeyPrefix}
        </div>
      ` : ''}
    `;
    
    return new Promise((resolve) => {
      setTimeout(() => {
        this.notificationElement.style.opacity = '1';
      }, 10);

      if (isLoading && !isCancelTranslation) {
        // 更新當前讀秒顯示
        const countdownElement = document.getElementById('countdown');
        if (countdownElement) {
          countdownElement.textContent = this.currentCount;
        }
        resolve();
      } else {
        console.log('設置完成狀態的通知');
        // 確保清除所有計時器
        this.clearAllTimers();
        
        // 設置通知自動消失
        this.notificationTimeout = setTimeout(() => {
          console.log('開始淡出通知');
          if (this.notificationElement) {
            this.notificationElement.style.transition = 'opacity 0.25s ease-out';
            this.notificationElement.style.opacity = '0';
            
            setTimeout(() => {
              console.log('通知淡出完成，準備移除通知');
              this.removeNotification();
              resolve();
            }, 250);
          } else {
            resolve();
          }
        }, 1200);
      }
    });
  },

  /**
   * 開始讀秒計時器
   */
  startCountdown() {
    // 清除現有的計時器（如果有的話）
    if (this.countdownInterval) {
      clearInterval(this.countdownInterval);
    }
    
    // 創建新的讀秒計時器
    this.countdownInterval = setInterval(() => {
      this.currentCount++;
      const element = document.getElementById('countdown');
      if (element) {
        element.textContent = this.currentCount;
      }
      console.log('讀秒:', this.currentCount);
    }, 1000);
  },

  /**
   * 移除通知訊息。
   */
  removeNotification() {
    console.log('嘗試移除通知');
    this.clearAllTimers(); // 確保在移除通知前清除所有計時器
    
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
  },

  /**
   * 清除所有計時器。
   */
  clearAllTimers() {
    console.log('清除所有計時器');
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
