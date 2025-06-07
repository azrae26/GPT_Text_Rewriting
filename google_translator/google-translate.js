/* global GlobalSettings, Notification, TextProcessor */
/**
 * google_translator/google-translate.js - Google 翻譯管理模組
 * 功能：提供 Google Cloud Translation API 的完整翻譯功能
 * 職責：
 * - Google API 整合：處理 Google Cloud Translation API 認證和請求
 * - 批次翻譯處理：支援大型文本的分批翻譯處理
 * - OAuth 2.0 認證：自動處理 JWT 令牌生成和 API 認證
 * - 多語言支援：支援繁中、簡中、英文、日文等多種語言
 * - 錯誤重試機制：智能處理 API 失敗和網路錯誤
 * - 取消機制：支援翻譯過程中的即時取消
 * - 憑證管理：支援彈出視窗設定和預設檔案兩種憑證來源
 * 
 * 依賴：
 * - Chrome Storage API：儲存和讀取 API 憑證
 * - JWT Helper：生成 OAuth 2.0 認證令牌
 * - Notification：進度通知和狀態顯示
 */

// 常數配置
window.GoogleTranslateConfig = {
  // API 相關
  API: {
    RETRY: {
      MAX_RETRIES: 3,      // 最大重試次數
      DELAY: 8000,        // 重試延遲時間（毫秒）
      TIMEOUT: {
        TRANSLATE: 30000   // 翻譯超時時間（毫秒）
      }
    },
    INTERVAL: {
      WAIT: {
        NONE: 0,           // 無等待
        SHORT: 2000,       // 短等待（2秒）
        LONG: 2000         // 長等待（2秒）
      }
    }
  },
  
  // 批次處理相關
  BATCH: {
    INTERVALS: [
      [5, 500],    // 5次以下，0.5秒
      [10, 2000],  // 10次以下，2秒
      [15, 5000],  // 15次以下，5秒
      [20, 6000],  // 20次以下，6秒
      [25, 7000]   // 25次以下，7秒
    ],
    DEFAULT_INTERVAL: 5000,  // 預設間隔
    TEXT_LIMIT: {
      BATCH: 29000          // 批次最大字數
    }
  },
  
  // 階段標識符
  STAGES: {
    TRANSLATING: 'GOOGLE_TRANSLATING',
    COMPLETED: 'GOOGLE_COMPLETED',
    CANCELLED: 'GOOGLE_CANCELLED'
  },

  // Google Cloud API 相關
  GOOGLE_API: {
    PROJECT_ID: 'gen-lang-client-0507957210',
    LOCATION: 'global',
    ENDPOINT: 'https://translation.googleapis.com/v3/projects/{project-id}/locations/{location}:translateText'
  }
};

// 確保在全局範圍內定義 GoogleTranslateManager
window.GoogleTranslateManager = {
  isTranslating: false,
  currentBatchIndex: 0,
  translationQueue: [],
  pendingTranslations: new Map(),
  completedTranslations: new Set(),
  translationResults: new Map(),
  completedStepsCount: 0,
  shouldCancel: false,
  totalBatches: 0,
  timeoutId: null,
  isLastBatchProcessed: false,
  batchInterval: 5000,
  selectionStart: null,
  selectionEnd: null,
  activeRequests: new Set(),
  targetLanguage: 'zh-TW',
  sourceLanguage: 'auto',

  /**
   * 根據批次數量決定發送間隔
   */
  getBatchInterval() {
    return GoogleTranslateConfig.BATCH.INTERVALS.find(
      ([count]) => this.totalBatches <= count
    )?.[1] || GoogleTranslateConfig.BATCH.DEFAULT_INTERVAL;
  },

  /**
   * 檢查是否所有批次都已完成
   */
  isAllBatchesCompleted() {
    return this.completedTranslations.size === this.totalBatches;
  },

  /**
   * 初始化 Google 翻譯功能
   */
  initialize() {
    console.log('GoogleTranslateManager 初始化...');
    // 按鈕由 UIManager 統一創建，這裡確保按鈕文字與預設語言一致
    const button = document.getElementById('google-translate-button');
    if (button && this.targetLanguage) {
      const languageNames = {
        'zh-TW': '繁中',
        'zh-CN': '簡中',
        'en': '英文',
        'ja': '日文'
      };
      const langName = languageNames[this.targetLanguage] || this.targetLanguage;
      const span = button.querySelector('span');
      if (span) {
        span.textContent = `Google翻譯(${langName})`;
      }
    }
  },

  /**
   * 處理 Google 翻譯按鈕點擊
   */
  async handleGoogleTranslateClick(button) {
    try {
      // 檢查是否有內容要翻譯
      const textArea = document.querySelector('textarea[name="content"]');
      if (!textArea || !textArea.value.trim()) {
        alert('請先輸入要翻譯的內容');
        return;
      }

      if (this.isTranslating) {
        console.log('取消 Google 翻譯');
        this.shouldCancel = true;
        button.disabled = true;
        button.classList.remove('canceling');
        clearTimeout(this.timeoutId);
        await window.Notification.showNotification('已取消 Google 翻譯', false);
        this.resetTranslation();
        return;
      }

      // 檢查是否已設置目標語言
      if (!this.targetLanguage) {
        alert('請先選擇目標語言');
        return;
      }

      // 檢查是否有 Google 翻譯金鑰配置
      const googleCredentials = await this.loadGoogleCredentials();
      if (!googleCredentials) {
        alert('找不到 Google 翻譯 API 金鑰配置\n\n請在擴充功能彈出視窗中：\n1. 選擇「Google 翻譯」\n2. 貼上您的 Google Cloud 服務帳戶 JSON 憑證');
        return;
      }

      await this.startGoogleTranslation(button);
    } catch (error) {
      console.error('Google 翻譯錯誤:', error);
      alert('Google 翻譯錯誤: ' + error.message);
      this.resetTranslation();
    }
  },

  /**
   * 載入 Google 認證資訊
   */
  async loadGoogleCredentials() {
    try {
      // 先嘗試從 popup 設定的 API 金鑰讀取
      const settings = await chrome.storage.sync.get(['apiKeys']);
      const googleCredentials = settings.apiKeys?.['google-translate'];
      
      if (googleCredentials && googleCredentials.trim()) {
        try {
          // 解析 JSON 憑證
          const credentials = JSON.parse(googleCredentials);
          console.log('從 popup 設定載入 Google 憑證成功');
          return credentials;
        } catch (parseError) {
          console.error('解析 Google 憑證 JSON 失敗:', parseError);
          alert('Google 憑證格式錯誤，請檢查 JSON 格式是否正確');
          return null;
        }
      }
      
      // 如果 popup 沒有設定，則嘗試從預設檔案讀取（向後兼容）
      try {
        const response = await fetch(chrome.runtime.getURL('google_translator/gen-lang-client-0507957210-3b8a690087e2.json'));
        const credentials = await response.json();
        console.log('從預設檔案載入 Google 憑證成功');
        return credentials;
      } catch (fileError) {
        console.log('預設憑證檔案不存在或無法讀取');
        return null;
      }
    } catch (error) {
      console.error('載入 Google 認證資訊失敗:', error);
      return null;
    }
  },

  /**
   * 獲取 Google Cloud OAuth 2.0 訪問令牌
   */
  async getAccessToken(credentials) {
    try {
      console.log('開始獲取 Google API 訪問令牌...');
      
      // 創建 JWT
      const header = {
        alg: 'RS256',
        typ: 'JWT'
      };

      const now = Math.floor(Date.now() / 1000);
      const payload = {
        iss: credentials.client_email,
        scope: 'https://www.googleapis.com/auth/cloud-translation',
        aud: 'https://oauth2.googleapis.com/token',
        exp: now + 3600,
        iat: now
      };

      // 使用 JWT Helper 進行簽名
      const jwt = await window.JWTHelper.createSignedJWT(header, payload, credentials.private_key);
      
      // 向 Google OAuth 2.0 端點請求訪問令牌
      const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: new URLSearchParams({
          grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
          assertion: jwt
        })
      });

      if (!tokenResponse.ok) {
        const errorData = await tokenResponse.json();
        throw new Error(`OAuth 錯誤: ${tokenResponse.status} - ${JSON.stringify(errorData)}`);
      }

      const tokenData = await tokenResponse.json();
      console.log('成功獲取訪問令牌');
      return tokenData.access_token;
    } catch (error) {
      console.error('獲取訪問令牌失敗:', error);
      throw new Error('無法獲取 Google 翻譯 API 訪問令牌: ' + error.message);
    }
  },

  /**
   * 重置翻譯狀態
   */
  resetTranslation() {
    console.log('[resetTranslation] 開始重置 Google 翻譯狀態');
    console.log('[resetTranslation] 重置前狀態:', {
      isTranslating: this.isTranslating,
      shouldCancel: this.shouldCancel,
      currentBatchIndex: this.currentBatchIndex,
      queueLength: this.translationQueue.length,
      pendingCount: this.pendingTranslations.size,
      completedCount: this.completedTranslations.size,
      activeRequests: this.activeRequests?.size || 0,
      completedStepsCount: this.completedStepsCount
    });

    this.isTranslating = false;
    this.shouldCancel = false;
    this.currentBatchIndex = 0;
    this.translationQueue = [];
    this.pendingTranslations.clear();
    this.completedTranslations.clear();
    this.completedStepsCount = 0;
    this.translationResults.clear();
    this.isLastBatchProcessed = false;
    this.batchInterval = 5000;
    this.selectionStart = null;
    this.selectionEnd = null;

    if (this.timeoutId) { 
      console.log('[resetTranslation] 清除計時器');
      clearTimeout(this.timeoutId);
      this.timeoutId = null;
    }

    // 重置按鈕文本
    const button = document.getElementById('google-translate-button'); 
    if (button) { 
      console.log('[resetTranslation] 重置按鈕狀態');
      // 如果有選中的語言，保留語言資訊
      if (this.targetLanguage) {
        const languageNames = {
          'zh-TW': '繁中',
          'zh-CN': '簡中',
          'en': '英文',
          'ja': '日文'
        };
        const langName = languageNames[this.targetLanguage] || this.targetLanguage;
        
        // 恢復完整的HTML結構
        button.innerHTML = `
          <span>Google翻譯(${langName})</span>
          <span class="dropdown-arrow"></span>
        `;
      } else {
        // 沒有選中語言時，重置為原始結構
        button.innerHTML = `
          <span>Google翻譯</span>
          <span class="dropdown-arrow"></span>
        `;
      }
      button.classList.remove('canceling'); 
      button.disabled = false;
    }

    this.activeRequests.clear();
    console.log('[resetTranslation] 重置完成');
  },

  /**
   * 將文本分割成批次
   */
  splitTextIntoBatches(text) {
    const batches = [];
    const maxLength = GoogleTranslateConfig.BATCH.TEXT_LIMIT.BATCH;
    
    // 按段落分割
    const paragraphs = text.split('\n');
    let currentBatch = '';
    
    for (const paragraph of paragraphs) {
      // 如果單個段落就超過限制，需要進一步分割
      if (paragraph.length > maxLength) {
        // 先添加當前批次（如果有內容）
        if (currentBatch.trim()) {
          batches.push(currentBatch.trim());
          currentBatch = '';
        }
        
        // 按句子分割長段落
        const sentences = paragraph.split(/[.。!！?？]+/);
        let sentenceBatch = '';
        
        for (const sentence of sentences) {
          if ((sentenceBatch + sentence).length <= maxLength) {
            sentenceBatch += sentence;
          } else {
            if (sentenceBatch.trim()) {
              batches.push(sentenceBatch.trim());
            }
            sentenceBatch = sentence;
          }
        }
        
        if (sentenceBatch.trim()) {
          currentBatch = sentenceBatch;
        }
      } else {
        // 檢查添加這個段落是否會超過限制
        const newBatch = currentBatch ? `${currentBatch}\n${paragraph}` : paragraph;
        
        if (newBatch.length <= maxLength) {
          currentBatch = newBatch;
        } else {
          // 添加當前批次並開始新的批次
          if (currentBatch.trim()) {
            batches.push(currentBatch.trim());
          }
          currentBatch = paragraph;
        }
      }
    }
    
    // 添加最後一個批次
    if (currentBatch.trim()) {
      batches.push(currentBatch.trim());
    }
    
    return batches;
  },

  /**
   * 開始 Google 翻譯流程
   */
  async startGoogleTranslation(button) {
    const textArea = document.querySelector('textarea[name="content"]');
    if (!textArea) throw new Error('找不到文本區域');

    // 檢查是否有選取文字
    const hasSelection = textArea.selectionStart !== textArea.selectionEnd;
    const textToTranslate = hasSelection 
      ? textArea.value.substring(textArea.selectionStart, textArea.selectionEnd)
      : textArea.value;

    // 保存選取位置
    if (hasSelection) {
      this.selectionStart = textArea.selectionStart;
      this.selectionEnd = textArea.selectionEnd;
    }

    this.isTranslating = true;
    this.shouldCancel = false;
    this.currentBatchIndex = 0;
    this.isLastBatchProcessed = false;
    this.translationQueue = this.splitTextIntoBatches(textToTranslate);
    this.totalBatches = this.translationQueue.length;
    this.batchInterval = this.getBatchInterval();
    this.pendingTranslations.clear();
    this.completedTranslations.clear();
    this.timeoutId = null;

    // 更新按鈕狀態
    const buttonSpan = button.querySelector('span');
    if (buttonSpan) {
      buttonSpan.textContent = '取消';
    } else {
      button.textContent = '取消';
    }
    button.classList.add('canceling');

    console.log(`總共分割成 ${this.totalBatches} 個批次，間隔時間：${this.batchInterval/1000}秒`);
    await window.Notification.showNotification(`
      Google 翻譯<br>
      翻譯中<br>
      批次進度: 0/${this.totalBatches}<br>
      發送間隔: ${this.batchInterval/1000}秒
    `, true);

    // 開始第一個批次並設置定時器
    this.processNextBatch();
    this.scheduleNextBatch();
  },

  /**
   * 安排下一個批次
   */
  scheduleNextBatch() {
    if (!this.shouldCancel && this.currentBatchIndex < this.translationQueue.length) {
      this.timeoutId = setTimeout(() => {
        this.processNextBatch();
        this.scheduleNextBatch();
      }, this.batchInterval);
    }
  },

  /**
   * 處理下一個批次
   */
  async processNextBatch() {
    console.log('processNextBatch called. currentBatchIndex:', this.currentBatchIndex, ', totalBatches:', this.totalBatches);

    // 如果已經處理完所有批次，直接返回
    if (this.currentBatchIndex >= this.translationQueue.length) {
      return;
    }

    const originalText = this.translationQueue[this.currentBatchIndex];
    const batchIndex = this.currentBatchIndex;

    this.pendingTranslations.set(batchIndex, originalText);
    this.currentBatchIndex++;

    try {
      console.log(`正在翻譯第 ${batchIndex + 1}/${this.totalBatches} 批次`);
      
      // 使用簡化的翻譯方式（暫時使用免費的翻譯服務或備用方案）
      const translatedText = await this.translateText(originalText);

      if (this.pendingTranslations.has(batchIndex)) {
        this.updateTranslatedText(batchIndex, translatedText.trim());
        this.pendingTranslations.delete(batchIndex);
        this.completedTranslations.add(batchIndex);

        if (this.isAllBatchesCompleted()) {
          console.log('所有 Google 翻譯批次已完成');
          clearTimeout(this.timeoutId);
          
          const finalText = this.getFinalTranslatedText();
          this.updateFinalText(finalText);
          
          // 立即重置按鈕狀態，不等通知
          this.resetTranslation();
          
          // 最後顯示完成通知
          await window.Notification.showNotification(GoogleTranslateConfig.STAGES.COMPLETED, false);
        } else {
          // 更新進度通知
          await window.Notification.showNotification(`
            Google 翻譯<br>
            ${GoogleTranslateConfig.STAGES.TRANSLATING}<br>
            批次進度: ${this.completedTranslations.size}/${this.totalBatches}<br>
            發送間隔: ${this.batchInterval/1000}秒
          `, true);
        }
      }
    } catch (error) {
      if (error.message === 'Google 翻譯請求已取消') {
        return;
      }
      console.error(`批次 ${batchIndex + 1} Google 翻譯錯誤:`, error);
      this.pendingTranslations.delete(batchIndex);
    }
  },

  /**
   * 翻譯文本（使用 Google Translation API v3）
   */
  async translateText(text) {
    try {
      // 載入認證資訊
      const credentials = await this.loadGoogleCredentials();
      if (!credentials) {
        throw new Error('無法載入 Google 認證資訊');
      }

      // 由於瀏覽器環境的限制，我們提供兩種實現方案：

      // 方案一：使用演示模式（當前實現）
      if (false) { // 設為 false 啟用實際 API，true 使用演示模式
        console.log('使用演示模式翻譯...');
        await new Promise(resolve => setTimeout(resolve, 1000 + Math.random() * 2000));
        return `[Google翻譯演示] ${text}`;
      }

      // 方案二：實際 API 調用（需要後端支持）
      const accessToken = await this.getAccessToken(credentials);
      
      const endpoint = GoogleTranslateConfig.GOOGLE_API.ENDPOINT
        .replace('{project-id}', GoogleTranslateConfig.GOOGLE_API.PROJECT_ID)
        .replace('{location}', GoogleTranslateConfig.GOOGLE_API.LOCATION);

      const requestBody = {
        contents: [text],
        targetLanguageCode: this.targetLanguage
      };
      
      // 只有當源語言不是 'auto' 時才添加 sourceLanguageCode
      if (this.sourceLanguage && this.sourceLanguage !== 'auto') {
        requestBody.sourceLanguageCode = this.sourceLanguage;
      }

      console.log('發送 Google Translation API 請求:', {
        endpoint,
        body: requestBody
      });

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestBody)
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(`Google Translation API 錯誤: ${response.status} - ${JSON.stringify(errorData)}`);
      }

      const data = await response.json();
      
      if (data.translations && data.translations[0]) {
        return data.translations[0].translatedText;
      } else {
        throw new Error('Google Translation API 回應格式無效');
      }

    } catch (error) {
      console.error('Google 翻譯處理失敗:', error);
      
      // 如果是演示模式或 API 調用失敗，返回標記過的文本
      if (error.message.includes('演示') || error.message.includes('DEMO')) {
        return `[Google翻譯] ${text}`;
      }
      
      throw error;
    }
  },

  /**
   * 更新已翻譯的文本
   */
  updateTranslatedText(batchIndex, translatedText) {
    const textArea = document.querySelector('textarea[name="content"]');
    if (!textArea) return;

    const originalText = this.translationQueue[batchIndex];
    let finalTranslatedText = batchIndex > 0 ? '\n' + translatedText : translatedText;

    // 保存翻譯結果
    this.translationResults.set(batchIndex, {
      original: originalText,
      translated: finalTranslatedText
    });
    
    // 增加完成步驟計數
    this.completedStepsCount++;
    
    console.log(`\n=== 批次 ${batchIndex + 1}/${this.totalBatches} Google 翻譯更新 ===`);
    console.log('原始文本：\n' + (originalText.length > 500 ? originalText.substring(0, 500) + '...' : originalText));
    console.log('翻譯結果：\n' + (finalTranslatedText.length > 500 ? finalTranslatedText.substring(0, 500) + '...' : finalTranslatedText));
    console.log(`原始長度：${originalText.length}，翻譯後長度：${finalTranslatedText.length}`);
    console.log('=====================================\n');

    textArea.value = textArea.value.replace(originalText, finalTranslatedText);
    textArea.dispatchEvent(new Event('input', { bubbles: true }));
  },

  /**
   * 獲取最終翻譯文本
   */
  getFinalTranslatedText() {
    const sortedResults = Array.from(this.translationResults.entries())
      .sort(([a], [b]) => a - b)
      .map(([_, result]) => result.translated);
    
    return sortedResults.join('\n');
  },

  /**
   * 更新最終文本
   */
  updateFinalText(finalText) {
    if (this.shouldCancel) {
      console.log('流程已取消，停止文本更新');
      return;
    }

    const textArea = document.querySelector('textarea[name="content"]');
    if (!textArea) return;

    if (this.selectionStart !== null && this.selectionEnd !== null) {
      const beforeSelection = textArea.value.substring(0, this.selectionStart);
      const afterSelection = textArea.value.substring(this.selectionEnd);
      textArea.value = beforeSelection + finalText + afterSelection;
    } else {
      textArea.value = finalText;
    }

    textArea.dispatchEvent(new Event('input', { bubbles: true }));
  },

  /**
   * 取消 Google 翻譯
   */
  async cancelTranslation() {
    console.log('[cancelTranslation] 開始取消 Google 翻譯流程');
    
    this.shouldCancel = true;

    // 取消所有進行中的請求
    if (this.activeRequests) {
      console.log(`[cancelTranslation] 準備取消 ${this.activeRequests.size} 個進行中的請求`);
      this.activeRequests.forEach((controller, index) => {
        try {
          console.log(`[cancelTranslation] 取消第 ${index + 1} 個請求`);
          controller.abort();
        } catch (error) {
          console.error('[cancelTranslation] 取消請求時發生錯誤:', error);
        }
      });
      this.activeRequests.clear();
    }

    // 清除所有計時器
    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
      this.timeoutId = null;
    }

    // 重置所有翻譯相關的狀態
    this.resetTranslation();
    await window.Notification.showNotification(GoogleTranslateConfig.STAGES.CANCELLED, false);
    console.log('[cancelTranslation] Google 翻譯取消流程完成');
  },

  /**
   * 設置目標語言
   * @param {string} languageCode - 語言代碼 (zh-TW, zh-CN, en, ja)
   */
  setTargetLanguage(languageCode) {
    this.targetLanguage = languageCode;
    console.log('設置目標語言為:', languageCode);
  },

  /**
   * 設置源語言
   * @param {string} languageCode - 語言代碼，'auto' 表示自動檢測
   */
  setSourceLanguage(languageCode) {
    this.sourceLanguage = languageCode;
    console.log('設置源語言為:', languageCode);
  },
}; 