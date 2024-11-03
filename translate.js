/* global GlobalSettings, Notification, TextProcessor */
const TranslateManager = {
  isTranslating: false,
  currentBatchIndex: 0,
  translationQueue: [],
  pendingTranslations: new Map(),
  shouldCancel: false,
  totalBatches: 0,
  timeoutId: null,
  isLastBatchProcessed: false,

  /**
   * 初始化翻譯功能
   */
  initialize() {
    const buttonContainer = document.getElementById('gpt-button-container');
    if (!buttonContainer || document.getElementById('gpt-translate-button')) return;

    const translateButton = document.createElement('button');
    translateButton.id = 'gpt-translate-button';
    translateButton.textContent = '翻譯';
    translateButton.addEventListener('click', () => this.handleTranslateClick(translateButton));
    buttonContainer.appendChild(translateButton);
  },

  /**
   * 處理翻譯按鈕點擊
   */
  async handleTranslateClick(button) {
    try {
      if (this.isTranslating) {
        console.log('取消翻譯');
        this.shouldCancel = true;
        button.disabled = true;
        button.classList.remove('canceling');
        clearTimeout(this.timeoutId);
        await window.Notification.showNotification('已取消翻譯', false);
        this.resetTranslation();
        return;
      }

      const settings = await window.GlobalSettings.loadSettings();
      if (!settings.apiKeys['gemini-1.5-flash'] && !settings.apiKeys['openai']) {
        alert('請先設置 API 金鑰');
        return;
      }
      if (!settings.translateInstruction.trim()) {
        alert('請設置翻譯要求');
        return;
      }

      await this.startTranslation(button);
    } catch (error) {
      console.error('翻譯錯誤:', error);
      alert('翻譯錯誤: ' + error.message);
      this.resetTranslation();
    }
  },

  /**
   * 重置翻譯狀態
   */
  resetTranslation() {
    console.log('重置翻譯狀態');
    this.isTranslating = false;
    this.shouldCancel = false;
    this.currentBatchIndex = 0;
    this.translationQueue = [];
    this.pendingTranslations.clear();
    this.isLastBatchProcessed = false;
    
    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
      this.timeoutId = null;
    }
    
    const button = document.getElementById('gpt-translate-button');
    if (button) {
      button.textContent = '翻譯';
      button.classList.remove('canceling');
      button.disabled = false;
    }
  },

  /**
   * 將文本分割成段落
   */
  splitTextIntoParagraphs(text) {
    const paragraphs = [];
    let currentBatch = '';
    let currentLength = 0;
    
    // 按換行分割文本
    const lines = text.split('\n');
    
    for (const line of lines) {
      const hasPeriod = line.trim().endsWith('.') || line.trim().endsWith('。');
      
      // 處理超過2000字的行
      if (line.length > 2000) {
        // 如果當前批次有內容，先保存
        if (currentBatch) {
          paragraphs.push(currentBatch);
          currentBatch = '';
          currentLength = 0;
        }
        
        // 在句點處分割當前行
        let lastIndex = 0;
        const periodRegex = /[.。]/g;
        let match;
        
        while ((match = periodRegex.exec(line)) !== null) {
          paragraphs.push(line.substring(lastIndex, match.index + 1));
          lastIndex = match.index + 1;
        }
        
        // 如果還有剩餘的文本，保存到當前批次
        if (lastIndex < line.length) {
          currentBatch = line.substring(lastIndex);
          currentLength = currentBatch.length;
        }
        continue;
      }
      
      // 計算添加這行後的總長度
      const newLength = currentLength + (currentBatch ? 1 : 0) + line.length;
      
      // 如果當前行包含句點且總長度超過1500字，將當前行作為一個段落
      if (hasPeriod && newLength > 1500) {
        paragraphs.push(currentBatch + (currentBatch ? '\n' : '') + line);
        currentBatch = '';
        currentLength = 0;
      } else {
        // 繼續添加到當前批次
        if (currentBatch) currentBatch += '\n';
        currentBatch += line;
        currentLength = newLength;
      }
    }
    
    // 添加最後一個批次
    if (currentBatch) {
      paragraphs.push(currentBatch);
    }
    
    return paragraphs;
  },

  /**
   * 開始翻譯流程
   */
  async startTranslation(button) {
    const textArea = document.querySelector('textarea[name="content"]');
    if (!textArea) throw new Error('找不到文本區域');

    this.isTranslating = true;
    this.shouldCancel = false;
    this.currentBatchIndex = 0;
    this.isLastBatchProcessed = false;
    this.translationQueue = this.splitTextIntoParagraphs(textArea.value);
    this.totalBatches = this.translationQueue.length;
    this.pendingTranslations.clear();
    this.timeoutId = null;

    // 更新按鈕狀態
    button.textContent = '取消';
    button.classList.add('canceling');

    const settings = await window.GlobalSettings.loadSettings();
    const model = settings.translateModel || settings.model;
    const apiKey = settings.apiKeys[model.startsWith('gemini') ? 'gemini-1.5-flash' : 'openai'];

    console.log(`總共分割成 ${this.totalBatches} 個批次`);
    await window.Notification.showNotification(`
      模型: ${TextProcessor.MODEL_NAMES[model] || model}<br>
      API KEY: ${apiKey.substring(0, 5)}...<br>
      翻譯中<br>
      批次進度: 0/${this.totalBatches}
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
      }, 5000);
    }
  },

  /**
   * 用於處理下一個批次，並檢查是否取消或完成
   */
  async processNextBatch() {
    console.log('processNextBatch called. shouldCancel:', this.shouldCancel, ', currentBatchIndex:', this.currentBatchIndex, ', totalBatches:', this.totalBatches);
    
    // 如果已經取消，直接返回
    if (this.shouldCancel) {
      console.log('翻譯已取消，停止處理');
      return;
    }

    // 如果已經處理完所有批次，直接返回
    if (this.currentBatchIndex >= this.translationQueue.length) {
      return;
    }

    const originalText = this.translationQueue[this.currentBatchIndex];
    const batchIndex = this.currentBatchIndex;
    
    // 設置當前批次的原始文本
    this.pendingTranslations.set(batchIndex, originalText);
    this.currentBatchIndex++;
    
    try {
      const settings = await window.GlobalSettings.loadSettings();
      const model = settings.translateModel || settings.model;
      const isGemini = model.startsWith('gemini');
      const apiKey = settings.apiKeys[isGemini ? 'gemini-1.5-flash' : 'openai'];
      
      const { endpoint, body } = TextProcessor._prepareApiConfig(
        model,
        originalText,
        settings.translateInstruction
      );

      console.log(`正在翻譯第 ${batchIndex + 1}/${this.totalBatches} 批次`);
      const translatedText = await TextProcessor._sendRequest(endpoint, body, apiKey, isGemini);
      
      if (this.shouldCancel) {
        console.log('翻譯已取消，忽略結果');
        return;
      }
      
      // 更新已翻譯的文本
      if (this.pendingTranslations.has(batchIndex)) {
        this.updateTranslatedText(batchIndex, translatedText.trim());
        this.pendingTranslations.delete(batchIndex);
        
        // 檢查是否是最後一個批次
        if (batchIndex === this.translationQueue.length - 1) {
          console.log('最後一個批次已完成，顯示完成通知');
          clearTimeout(this.timeoutId);
          await window.Notification.showNotification('翻譯完成', false);
          this.resetTranslation();
        } else if (!this.shouldCancel) {
          // 如果不是最後一個批次，更新進度通知
          await window.Notification.showNotification(`
            模型: ${TextProcessor.MODEL_NAMES[model] || model}<br>
            API KEY: ${apiKey.substring(0, 5)}...<br>
            翻譯中<br>
            批次進度: ${batchIndex + 1}/${this.totalBatches}
          `, true);
        }
      }
    } catch (error) {
      if (error.message === '翻譯請求已取消') {
        console.log('批次已取消，停止處理');
        return;
      }
      
      // 如果不是取消錯誤且未取消，則顯示錯誤
      if (!this.shouldCancel) {
        console.error(`批次 ${batchIndex + 1} 翻譯錯誤:`, error);
      }
      this.pendingTranslations.delete(batchIndex);
    }
  },

  /**
   * 更新已翻譯的文本
   */
  updateTranslatedText(batchIndex, translatedText) {
    const textArea = document.querySelector('textarea[name="content"]');
    if (!textArea) return;

    const originalText = this.translationQueue[batchIndex];
    // 如果不是第一批次，在翻譯文本前添加換行符
    const finalTranslatedText = batchIndex > 0 ? '\n' + translatedText : translatedText;
    textArea.value = textArea.value.replace(originalText, finalTranslatedText);
    textArea.dispatchEvent(new Event('input', { bubbles: true }));
  }
};

window.TranslateManager = TranslateManager;