/* global GlobalSettings, Notification, TextProcessor */

// 確保在全局範圍內定義 TranslateManager
window.TranslateManager = {
  isTranslating: false,
  currentBatchIndex: 0,
  translationQueue: [],
  pendingTranslations: new Map(),
  completedTranslations: new Set(), // 新增：追踪已完成的翻譯
  shouldCancel: false,
  totalBatches: 0,
  timeoutId: null,
  isLastBatchProcessed: false,
  batchInterval: 5000, // 預設間隔為5秒
  removeHashCheckbox: null,
  removeStarCheckbox: null,

  /**
   * 根據批次數量決定發送間隔
   * @returns {number} 間隔時間（毫秒）
   */
  getBatchInterval() {
    if (this.totalBatches <= 5) {
      return 500; // 5次以下，0.5秒
    } else if (this.totalBatches <= 10) {
      return 1000; // 10次以下，1秒
    } else if (this.totalBatches <= 15) {
      return 3000; // 15次以下，3秒
    } else if (this.totalBatches <= 20) {
      return 4000; // 20次以下，4秒
    } else if (this.totalBatches <= 25) {
      return 5000; // 25次以下，5秒
    }
    return 5000; // 25次以上，5秒
  },

  /**
   * 檢查是否所有批次都已完成
   */
  isAllBatchesCompleted() {
    return this.completedTranslations.size === this.totalBatches;
  },

  /**
   * 初始化翻譯功能
   */
  initialize() {
    console.log('TranslateManager 初始化...');
    const buttonContainer = document.getElementById('gpt-button-container');
    if (!buttonContainer || document.getElementById('gpt-translate-button')) return;

    const translateButton = document.createElement('button');
    translateButton.id = 'gpt-translate-button';
    translateButton.textContent = '翻譯';
    translateButton.addEventListener('click', () => this.handleTranslateClick(translateButton));
    buttonContainer.appendChild(translateButton);

    // 初始化 checkbox 元素
    this.initializeCheckboxes();
  },

  /**
   * 初始化 checkbox 元素
   */
  async initializeCheckboxes() {
    console.log('初始化 checkbox 元素...');
    
    // 檢查是否已經存在
    if (!this.removeHashCheckbox) {
      this.removeHashCheckbox = document.getElementById('removeHash');
      if (!this.removeHashCheckbox) {
        console.log('創建 removeHash checkbox');
        this.removeHashCheckbox = document.createElement('input');
        this.removeHashCheckbox.type = 'checkbox';
        this.removeHashCheckbox.id = 'removeHash';
      }
    }
    
    if (!this.removeStarCheckbox) {
      this.removeStarCheckbox = document.getElementById('removeStar');
      if (!this.removeStarCheckbox) {
        console.log('創建 removeStar checkbox');
        this.removeStarCheckbox = document.createElement('input');
        this.removeStarCheckbox.type = 'checkbox';
        this.removeStarCheckbox.id = 'removeStar';
      }
    }

    // 載入儲存的狀態
    await this.loadCheckboxStates();
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

      // 在開始翻譯前重新檢查 checkbox 狀態
      await this.loadCheckboxStates();

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
    this.completedTranslations.clear(); // 清除已完成的翻譯記錄
    this.isLastBatchProcessed = false;
    this.batchInterval = 5000;
    
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
    this.batchInterval = this.getBatchInterval();
    this.pendingTranslations.clear();
    this.completedTranslations.clear(); // 重置已完成的翻譯記錄
    this.timeoutId = null;

    // 更新按鈕狀態
    button.textContent = '取消';
    button.classList.add('canceling');

    const settings = await window.GlobalSettings.loadSettings();
    const model = settings.translateModel || settings.model;
    const apiKey = settings.apiKeys[model.startsWith('gemini') ? 'gemini-1.5-flash' : 'openai'];

    console.log(`總共分割成 ${this.totalBatches} 個批次，間隔時間：${this.batchInterval/1000}秒`);
    await window.Notification.showNotification(`
      模型: ${TextProcessor.MODEL_NAMES[model] || model}<br>
      API KEY: ${apiKey.substring(0, 5)}...<br>
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
        this.completedTranslations.add(batchIndex); // 記錄已完成的批次

        // 檢查是否所有批次都已完成
        if (this.isAllBatchesCompleted()) {
          console.log('所有批次已完成，顯示完成通知');
          clearTimeout(this.timeoutId);
          await window.Notification.showNotification('翻譯完成', false);
          this.resetTranslation();
        } else if (!this.shouldCancel) {
          // 如果還有未完成的批次，更新進度通知
          await window.Notification.showNotification(`
            模型: ${TextProcessor.MODEL_NAMES[model] || model}<br>
            API KEY: ${apiKey.substring(0, 5)}...<br>
            翻譯中<br>
            批次進度: ${this.completedTranslations.size}/${this.totalBatches}<br>
            發送間隔: ${this.batchInterval/1000}秒
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
    let finalTranslatedText = batchIndex > 0 ? '\n' + translatedText : translatedText;

    // 使用類別中保存的 checkbox 值
    if (this.removeHashCheckbox && this.removeHashCheckbox.checked) {
      finalTranslatedText = finalTranslatedText.replace(/##\s*|\s*##/g, '');
    }
    if (this.removeStarCheckbox && this.removeStarCheckbox.checked) {
      finalTranslatedText = finalTranslatedText.replace(/\*\*\s*|\s*\*\*/g, '');
    }

    textArea.value = textArea.value.replace(originalText, finalTranslatedText);
    textArea.dispatchEvent(new Event('input', { bubbles: true }));
  },
  
  /**
   * 從 storage 載入 checkbox 狀態
   */
  async loadCheckboxStates() {
    console.log('載入 checkbox 狀態...');
    return new Promise((resolve) => {
      chrome.storage.sync.get(['removeHash', 'removeStar'], (result) => {
        console.log('已從 storage 載入 checkbox 狀態:', result);
        
        // 確保 checkbox 已初始化
        if (!this.removeHashCheckbox || !this.removeStarCheckbox) {
          console.log('Checkbox 未初始化，執行初始化');
          this.initializeCheckboxes().then(() => {
            this.setCheckboxStates(result);
            resolve();
          });
        } else {
          this.setCheckboxStates(result);
          resolve();
        }
      });
    });
  },

  /**
   * 設置 checkbox 狀態
   */
  setCheckboxStates(result) {
    if (this.removeHashCheckbox) {
      console.log('設置 removeHash checkbox 狀態:', result.removeHash);
      this.removeHashCheckbox.checked = result.removeHash || false;
    }
    if (this.removeStarCheckbox) {
      console.log('設置 removeStar checkbox 狀態:', result.removeStar);
      this.removeStarCheckbox.checked = result.removeStar || false;
    }
  },
  
  /**
   * 設置 checkbox 元素並載入狀態
   */
  setCheckboxes(removeHashCheckbox, removeStarCheckbox) {
    console.log('設置 checkboxes...');
    console.log('removeHashCheckbox:', removeHashCheckbox ? '已提供' : '未提供');
    console.log('removeStarCheckbox:', removeStarCheckbox ? '已提供' : '未提供');
    
    this.removeHashCheckbox = removeHashCheckbox;
    this.removeStarCheckbox = removeStarCheckbox;
    
    // 立即載入狀態
    this.loadCheckboxStates();
    
    // 監聽 checkbox 變更
    if (removeHashCheckbox) {
      removeHashCheckbox.addEventListener('change', () => {
        console.log('TranslateManager: removeHash 狀態變更:', removeHashCheckbox.checked);
        chrome.storage.sync.set({ removeHash: removeHashCheckbox.checked });
      });
    }
    
    if (removeStarCheckbox) {
      removeStarCheckbox.addEventListener('change', () => {
        console.log('TranslateManager: removeStar 狀態變更:', removeStarCheckbox.checked);
        chrome.storage.sync.set({ removeStar: removeStarCheckbox.checked });
      });
    }
  }
};
