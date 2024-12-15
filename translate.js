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
  selectionStart: null, // 新增：保存選取開始位置
  selectionEnd: null,   // 新增：保存選取結束位置
  zhEnMappingTextarea: null, // 新增：中英對照文本框

  /**
   * 根據批次數量決定發送間隔
   */
  getBatchInterval() {
    const intervals = [
      [5, 500],   // 5次以下，0.5秒
      [10, 1000], // 10次以下，1秒
      [15, 3000], // 15次以下，3秒
      [20, 4000], // 20次以下，4秒
      [25, 5000]  // 25次以下，5秒
    ];

    return intervals.find(([count]) => this.totalBatches <= count)?.[1] || 5000;
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
  
    // 創建翻譯按鈕
    const translateButton = document.createElement('button');
    translateButton.id = 'gpt-translate-button';
    translateButton.textContent = '翻譯';
    translateButton.addEventListener('click', () => this.handleTranslateClick(translateButton));
    buttonContainer.appendChild(translateButton);

    // 初始化 checkbox 元素
    this.checkboxManager.init();
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
      if (!settings.apiKeys['gemini-2.0-flash-exp'] && !settings.apiKeys['openai']) {
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
    this.isTranslating = false; // 重置翻譯狀態
    this.shouldCancel = false; // 重置取消標誌
    this.currentBatchIndex = 0; // 重置批次索引
    this.translationQueue = []; // 重置翻譯隊列
    this.pendingTranslations.clear(); // 清除待翻譯的文本
    this.completedTranslations.clear(); // 清除已完成的翻譯記錄
    this.isLastBatchProcessed = false; // 重置最後一個批次處理標誌
    this.batchInterval = 5000; // 重置批次間隔
    this.selectionStart = null; // 重置選取位置
    this.selectionEnd = null; // 重置選取位置

    if (this.timeoutId) { 
      clearTimeout(this.timeoutId); // 清除定時器
      this.timeoutId = null; // 重置定時器
    }

    // 重置按鈕文本
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
    
    // 添加到段落
    const addToParagraphs = (text) => {
      if (text.trim()) paragraphs.push(text);
    };

    // 處理長行
    const processLongLine = (line) => {
      const segments = line.match(/[^.。]+[.。]/g) || [];
      segments.forEach(segment => addToParagraphs(segment));
      return line.replace(/.*[.。]/, ''); // 返回剩餘文本
    };

    // 按換行分割文本
    text.split('\n').forEach(line => {
      if (line.length > 2000) { // 如果行長度超過2000字
        const remainder = processLongLine(line);
        currentBatch = remainder;
        return;
      }

      // 組合新批次
      const newBatch = currentBatch ? `${currentBatch}\n${line}` : line;
      const hasPeriod = /[.。]$/.test(line.trim());

      // 如果新批次包含句號，且長度超過1500字，則添加到段落
      if (hasPeriod && newBatch.length > 1500) {
        addToParagraphs(newBatch);
        currentBatch = '';
      } else { // 否則，將新批次設置為當前批次
        currentBatch = newBatch;
      }
    });

    addToParagraphs(currentBatch); // 添加剩餘文本
    return paragraphs;
  },

  /**
   * 解析中英對照表
   * @returns {Promise<Object>} 解析後的中英對照物件
   */
  async parseZhEnMapping() {
    try {
      if (!this.zhEnMappingTextarea) {
        // 嘗試從 popup 頁面獲取
        this.zhEnMappingTextarea = document.getElementById('zhEnMapping');
        
        // 如果還是找不到，嘗試從 chrome.storage.local 獲取
        if (!this.zhEnMappingTextarea) {
          const result = await new Promise(resolve => {
            chrome.storage.local.get(['zhEnMapping'], resolve);
          });
          
          if (result.zhEnMapping) {
            const mapping = {};
            const lines = result.zhEnMapping.split('\n');
            
            lines.forEach(line => {
              const trimmedLine = line.trim();
              if (!trimmedLine) return;  // 跳過空行
              
              // 使用 = 分割，但保留所有部分
              const parts = trimmedLine.split('=').map(part => part.trim());
              if (parts.length >= 2) {  // 只要有至少兩個部分就處理
                const zh = parts[0];
                // 將除了第一個部分(中文)以外的所有部分用=連接
                const en = parts.slice(1).join(' = ');
                if (zh && en) {
                  mapping[zh] = en;
                }
              }
            });
            
            console.log('從 storage 解析的中英對照表:', mapping);
            return mapping;
          }
        }
      }
      
      if (!this.zhEnMappingTextarea) {
        console.log('找不到中英對照文本框，且 storage 中也沒有資料');
        return {};
      }

      const mapping = {};
      const lines = this.zhEnMappingTextarea.value.split('\n');
      
      lines.forEach(line => {
        const trimmedLine = line.trim();
        if (!trimmedLine) return;  // 跳過空行
        
        // 使用 = 分割，但保留所有部分
        const parts = trimmedLine.split('=').map(part => part.trim());
        if (parts.length >= 2) {  // 只要有至少兩個部分就處理
          const zh = parts[0];
          // 將除了第一個部分(中文)以外的所有部分用=連接
          const en = parts.slice(1).join(' = ');
          if (zh && en) {
            mapping[zh] = en;
          }
        }
      });

      console.log('解析的中英對照表:', mapping);
      return mapping;
    } catch (error) {
      console.error('解析中英對照表時發生錯誤:', error);
      return {};
    }
  },

  /**
   * 獲取翻譯上下文
   * @returns {Promise<Array>} 包含中英對照表的上下文陣列
   */
  async getTranslationContext() {
    const mapping = await this.parseZhEnMapping();
    if (Object.keys(mapping).length === 0) {
      return [];
    }

    // 將對照表格式化為易讀的文本
    const mappingText = Object.entries(mapping)
      .map(([zh, en]) => `${zh} = ${en}`)
      .join('\n');

    return [{
      role: "system",
      content: `請在翻譯時使用以下對照表：\n${mappingText}`
    }];
  },

  /**
   * 開始翻譯流程
   */
  async startTranslation(button) {
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
    this.translationQueue = this.splitTextIntoParagraphs(textToTranslate);
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
    const apiKey = settings.apiKeys[model.startsWith('gemini') ? 'gemini-2.0-flash-exp' : 'openai'];

    console.log(`總共分割成 ${this.totalBatches} 個批次，間隔時間：${this.batchInterval/1000}秒`);
    await window.Notification.showNotification(`
      模型: ${window.GlobalSettings.API.models[model] || model}<br>
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

    const originalText = this.translationQueue[this.currentBatchIndex]; // 獲取當前批次的原始文本
    const batchIndex = this.currentBatchIndex; // 獲取當前批次索引

    // 設置當前批次的原始文本
    this.pendingTranslations.set(batchIndex, originalText); // 設置待翻譯的文本
    this.currentBatchIndex++; // 遞增批次索引

    try {
      const settings = await window.GlobalSettings.loadSettings(); // 加載設置
      const model = settings.translateModel || settings.model; // 獲取翻譯模型
      const isGemini = model.startsWith('gemini'); // 檢查是否使用 Gemini 模型
      const apiKey = settings.apiKeys[isGemini ? 'gemini-2.0-flash-exp' : 'openai']; // 獲取 API 金鑰

      // 獲取翻譯上下文
      const context = await this.getTranslationContext();

      const { endpoint, body } = TextProcessor._prepareApiConfig( // 準備 API 請求配置
        model,
        originalText,
        settings.translateInstruction,
        context  // 添加上下文
      );

      console.log(`正在翻譯第 ${batchIndex + 1}/${this.totalBatches} 批次`);
      const translatedText = await TextProcessor._sendRequest(endpoint, body, apiKey, isGemini); // 發送 API 請求

      if (this.shouldCancel) {
        console.log('翻譯已取消，忽略結果');
        return;
      }

      // 更新已翻譯的文本，刪除待翻譯的文本，記錄已完成的批次
      if (this.pendingTranslations.has(batchIndex)) { // 檢查是否存在待翻譯的文本
        this.updateTranslatedText(batchIndex, translatedText.trim(), settings); // 更新已翻譯的文本
        this.pendingTranslations.delete(batchIndex); // 刪除待翻譯的文本
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
            模型: ${window.GlobalSettings.API.models[model] || model}<br>
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
   * 更新已翻譯的文本，顯示批次更新日誌，並直接替換整個文本
   */
  updateTranslatedText(batchIndex, translatedText, settings) {
    const textArea = document.querySelector('textarea[name="content"]'); // 獲取文本區域
    if (!textArea) return; // 如果文本區域不存在，返回

    const originalText = this.translationQueue[batchIndex]; // 獲取當前批次的原始文本
    // 如果不是第一批次，在翻譯文本前添加換行符
    let finalTranslatedText = batchIndex > 0 ? '\n' + translatedText : translatedText;

    // 使用類別中保存的 checkbox 值
    if (settings.removeHash) {
      finalTranslatedText = finalTranslatedText.replace(/##\s*|\s*##/g, '');
    }
    if (settings.removeStar) {
      finalTranslatedText = finalTranslatedText.replace(/\*\*\s*|\s*\*\*/g, '');
    }

    // 顯示批次更新日誌
    console.log(`\n=== 批次 ${batchIndex + 1}/${this.totalBatches} 翻譯更新 ===`);
    console.log('原始文本：\n' + (originalText.length > 500 ? originalText.substring(0, 500) + '...' : originalText));
    console.log('翻譯結果：\n' + (finalTranslatedText.length > 500 ? finalTranslatedText.substring(0, 500) + '...' : finalTranslatedText));
    console.log(`原始長度：${originalText.length}，翻譯後長度：${finalTranslatedText.length}`);
    console.log('=====================================\n');

    // 直接替換整個文本
    textArea.value = textArea.value.replace(originalText, finalTranslatedText);


    textArea.dispatchEvent(new Event('input', { bubbles: true }));
  },

  /**
   * 設置 checkbox 元素並載入狀態 (移除監聽器)
   */
  setCheckboxes(removeHashCheckbox, removeStarCheckbox) {
    console.log('設置 checkboxes...');
    console.log('removeHashCheckbox:', removeHashCheckbox ? '已提供' : '未提供');
    console.log('removeStarCheckbox:', removeStarCheckbox ? '已提供' : '未提供');

    this.removeHashCheckbox = removeHashCheckbox;
    this.removeStarCheckbox = removeStarCheckbox;
  },

  // checkbox 相關配置和方法
  checkboxManager: {
    configs: [
      { id: 'removeHash', ref: 'removeHashCheckbox' },
      { id: 'removeStar', ref: 'removeStarCheckbox' }
    ],

    init() {
      this.configs.forEach(({ id, ref }) => {
        if (!TranslateManager[ref]) {
          TranslateManager[ref] = document.getElementById(id) || this._createCheckbox(id);
        }
      });
    },

    _createCheckbox(id) {
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.id = id;
      return checkbox;
    },

    set(hashCheckbox, starCheckbox) {
      TranslateManager.removeHashCheckbox = hashCheckbox;
      TranslateManager.removeStarCheckbox = starCheckbox;
    }
  },

  /**
   * 處理翻譯請求
   */
  async processTranslation(text, settings) {
    try {
      const model = settings.translateModel || settings.model;
      const isGemini = model.startsWith('gemini');
      const apiKey = settings.apiKeys[isGemini ? 'gemini-2.0-flash-exp' : 'openai'];

      // 獲取翻譯上下文
      const context = await this.getTranslationContext();

      // 準備 API 請求配置
      const config = {
        model,
        apiKey,
        instruction: settings.translateInstruction,
        context
      };

      // 發送翻譯請求
      return await window.TextProcessor.processText(text, config);
    } catch (error) {
      console.error('翻譯處理失敗:', error);
      throw error;
    }
  }
};
