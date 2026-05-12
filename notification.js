/**
 * notification.js - 通知系統模組
 * 功能：統一管理所有通知訊息的顯示、更新和狀態管理
 * 職責：
 * - 動態通知創建：根據任務類型創建相應的通知界面
 * - 進度追蹤：顯示翻譯、生成等任務的實時進度
 * - 階段識別：自動識別並顯示不同任務階段（翻譯、反思、優化等）
 * - 批次進度管理：支援批次任務的進度條和計數顯示
 * - 計時器管理：提供自動隱藏和倒數計時功能
 * - 模型信息顯示：智能顯示當前使用的 AI 模型和 API 狀態
 * - 狀態同步：與 TranslateManager、GenerationManager 等同步狀態
 * 
 * 依賴：
 * - GlobalSettings：獲取模型顯示名稱和配置
 * - TranslateConfig、GenerationConfig：階段標識和配置
 * - TranslateManager、GenerationManager：任務狀態同步
 */

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
    LogUtils.log('顯示通知:', message, '正在加載:', isLoading);
    
    // 檢查翻譯控制器狀態，如果已取消則不顯示新通知
    if (window.TranslateManager?.controller?.isCancelled() && isLoading) {
      LogUtils.log('翻譯已取消，跳過通知顯示');
      return;
    }
    
    // 如果不是加載狀態，立即清除所有計時器
    if (!isLoading) {
      this.clearAllTimers();
    }
    
    // 從 message 中提取模型名稱和 API KEY
    const modelMatch = message.match(/模型: (.*?)<br>/);
    const apiKeyMatch = message.match(/API KEY: (.*?)<br>/);
    const batchMatch = message.match(/批次進度: (\d+)\/(\d+)/);
    
    // 修改：使用新的方法來獲取模型顯示名稱
    let modelName = '未知模型';
    if (modelMatch) {
      const modelKey = modelMatch[1];
      LogUtils.log('通知解析到的模型鍵值:', modelKey);
      // 使用 GlobalSettings 的新方法獲取正確的顯示名稱
      if (window.GlobalSettings && window.GlobalSettings.getModelDisplayName) {
        modelName = window.GlobalSettings.getModelDisplayName(modelKey);
        LogUtils.log('獲取到的模型顯示名稱:', modelName);
      } else {
        LogUtils.error('GlobalSettings 或 getModelDisplayName 方法不存在');
        modelName = modelKey; // 至少顯示原始的模型鍵值
      }
    } else if (isLoading) {
      LogUtils.log('沒有匹配到模型訊息，使用預設值');
      modelName = '未知模型';
    } else {
      modelName = this.lastModelName;
    }
    
    const apiKeyPrefix = apiKeyMatch ? apiKeyMatch[1] : (isLoading ? '未知' : this.lastApiKeyPrefix);
    const currentBatch = batchMatch ? batchMatch[1] : null;
    const totalBatches = batchMatch ? batchMatch[2] : null;

    // 判斷是否為取消翻譯的通知
    const isCancelTranslation = message === TranslateConfig.STAGES.CANCELLED;
    // 判斷是否為取消生成的通知
    const isCancelGeneration = message === GenerationConfig.STAGES.CANCELLED;
    
    // 如果是取消通知，立即清理並顯示
    if (isCancelTranslation || isCancelGeneration) {
      this.clearAllTimers();
      this.removeNotification();
      // 顯示簡單的取消通知
      this.showSimpleCancelNotification(message);
      return;
    }
    
    // 判斷是否為生成相關的通知（優先判斷，因為更具體）
    const isGeneration = message.includes(GenerationConfig.STAGES.INITIAL) || 
                        message.includes(GenerationConfig.STAGES.REFLECT_1) || 
                        message.includes(GenerationConfig.STAGES.OPTIMIZE_1) || 
                        message.includes(GenerationConfig.STAGES.REFLECT_2) || 
                        message.includes(GenerationConfig.STAGES.OPTIMIZE_2) || 
                        message.includes(GenerationConfig.STAGES.REFLECT_3) || 
                        message.includes(GenerationConfig.STAGES.OPTIMIZE_3) || 
                        message === GenerationConfig.STAGES.COMPLETED;
    
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
    } else if (message.includes(GenerationConfig.STAGES.REFLECT_3)) {
      generationPhase = '反思三中';
    } else if (message.includes(GenerationConfig.STAGES.OPTIMIZE_3)) {
      generationPhase = '生成優化三中';
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
      LogUtils.log('通知元素已創建並添加到 DOM');
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
          titleElement.textContent = isTranslation ? translationPhase : isGeneration ? generationPhase : '正在改寫';
        }
        
        // 更新進度條
        const progressBar = this.notificationElement.querySelector('.progress-bar');
        if (progressBar) {
          LogUtils.log('更新進度條 - 當前批次:', currentBatch, '總批次:', totalBatches);
          // 設定 data-segments 屬性
          const totalBatchesNum = parseInt(totalBatches);
          const stepsPerBatch = isTranslation ? (window.TranslateManager?.isSingleStepMode ? 1 : 3) : 7; // 翻譯有3個步驟，生成有7個步驟
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

    // 如果通知元素已存在且是翻譯/生成相關的更新，只更新標題和信息區域
    if (this.notificationElement && isLoading && (isTranslation || isGeneration)) {
      const titleElement = this.notificationElement.querySelector('.notification-title');
      const infoElement = this.notificationElement.querySelector('.notification-info');
      
      if (titleElement) {
        titleElement.textContent = isTranslation ? translationPhase : generationPhase;
      }
      
      if (infoElement) {
        infoElement.innerHTML = `
          模型: ${modelName}<br>
          API KEY: ${apiKeyPrefix}
        `;
      }
      
      // 如果有批次進度，也要更新
      if (currentBatch) {
        const batchElement = this.notificationElement.querySelector('.current-batch');
        if (batchElement) {
          batchElement.textContent = currentBatch;
        }
        
        // 更新進度條
        const progressBar = this.notificationElement.querySelector('.progress-bar');
        if (progressBar) {
          const totalBatchesNum = parseInt(totalBatches);
          const stepsPerBatch = isTranslation ? (window.TranslateManager?.isSingleStepMode ? 1 : 3) : 7;
          const totalSegments = totalBatchesNum * stepsPerBatch;
          progressBar.innerHTML = Array.from({ length: totalSegments }, (_, i) => {
            const isCompleted = i < (isTranslation ? window.TranslateManager.completedStepsCount : window.GenerationManager.completedStepsCount);
            return `<div class="progress-segment ${isCompleted ? 'completed' : ''}"></div>`;
          }).join('');
        }
      }
      
      return new Promise((resolve) => {
        // 更新當前讀秒顯示
        const countdownElement = document.getElementById('countdown');
        if (countdownElement) {
          countdownElement.textContent = this.currentCount;
        }
        resolve();
      });
    }

    // 重建完整的通知內容
    LogUtils.log('當前批次:', currentBatch, '總批次:', totalBatches);

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
            const stepsPerBatch = isTranslation ? (window.TranslateManager?.isSingleStepMode ? 1 : 3) : 7;
            const totalSegments = parseInt(totalBatches) * stepsPerBatch;
            if (totalSegments > 60) return 'data-segments="most"';
            if (totalSegments > 40) return 'data-segments="more"';
            if (totalSegments > 25) return 'data-segments="many"';
            return '';
          })()
        }>
          ${Array.from({ length: parseInt(totalBatches) * (isTranslation ? (window.TranslateManager?.isSingleStepMode ? 1 : 3) : 7) }, (_, i) => {
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
        LogUtils.log('設置完成狀態的通知');
        // 確保清除所有計時器
        this.clearAllTimers();
        
        // 設置通知自動消失
        this.notificationTimeout = setTimeout(() => {
          LogUtils.log('開始淡出通知');
          if (this.notificationElement) {
            this.notificationElement.style.transition = 'opacity 0.25s ease-out';
            this.notificationElement.style.opacity = '0';
            
            setTimeout(() => {
              LogUtils.log('通知淡出完成，準備移除通知');
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
      LogUtils.log('讀秒:', this.currentCount);
    }, 1000);
  },

  /**
   * 移除通知訊息。
   */
  removeNotification() {
    LogUtils.log('嘗試移除通知');
    this.clearAllTimers(); // 確保在移除通知前清除所有計時器
    
    if (this.notificationElement) {
      if (this.notificationElement.parentNode) {
        this.notificationElement.parentNode.removeChild(this.notificationElement);
        LogUtils.log('通知元素已從 DOM 中移除');
      } else {
        LogUtils.log('通知元素不在 DOM 中');
      }
      this.notificationElement = null;
    } else {
      LogUtils.log('沒有找到通知元素，無需移除');
    }
  },

  /**
   * 清除所有計時器。
   */
  clearAllTimers() {
    LogUtils.log('清除所有計時器');
    if (this.countdownInterval) {
      clearInterval(this.countdownInterval);
      this.countdownInterval = null;
      this.currentCount = 0;
      LogUtils.log('讀秒計時器已清除');
    }
    if (this.notificationTimeout) {
      clearTimeout(this.notificationTimeout);
      this.notificationTimeout = null;
      LogUtils.log('通知超時已清除');
    }
  },

  /**
   * 顯示簡單的取消通知。
   * @param {string} message - 取消通知的訊息。
   */
  showSimpleCancelNotification(message) {
    LogUtils.log('顯示簡單的取消通知:', message);
    
    // 如果沒有通知元素，創建一個
    if (!this.notificationElement) {
      this.notificationElement = document.createElement('div');
      this.notificationElement.classList.add('notification-element');
      document.body.appendChild(this.notificationElement);
    }
    
    this.notificationElement.innerHTML = `
      <div class="notification-title">
        ${message}
      </div>
    `;
    this.notificationElement.classList.add('simple-cancel-notification');
    
    // 3秒後自動移除取消通知
    setTimeout(() => {
      this.removeNotification();
    }, 3000);
  }
};

// 確保 Notification 可以被其他檔案訪問
window.Notification = Notification;
