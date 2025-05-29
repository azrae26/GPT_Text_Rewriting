/* global GlobalSettings, Notification, TextProcessor */

// 常數配置
window.TranslateConfig = {
  // API 相關
  API: {
    RETRY: {
      MAX_RETRIES: 3,      // 最大重試次數
      DELAY: 8000,        // 重試延遲時間（毫秒）
      TIMEOUT: {
        TRANSLATE: 20000,  // 翻譯超時時間（毫秒）
        REFLECT: 40000,    // 反思超時時間（毫秒）
        OPTIMIZE: 20000    // 優化超時時間（毫秒）
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
      LINE: 1700,           // 單行最大字數
      BATCH: 1200          // 批次最大字數
    },
    MAX_PREVIOUS_BLOCKS: 3  // 最大前文區塊數
  },
  
  // 階段標識符
  STAGES: {
    INITIAL: 'TRANS_INITIAL',
    REFLECT: 'TRANS_REFLECT',
    OPTIMIZE: 'TRANS_OPTIMIZE',
    COMPLETED: 'TRANS_COMPLETED',
    CANCELLED: 'TRANS_CANCELLED'
  }
};

// 確保在全局範圍內定義 TranslateManager
window.TranslateManager = {
  isTranslating: false,
  currentBatchIndex: 0,
  translationQueue: [],
  pendingTranslations: new Map(),
  completedTranslations: new Set(),
  translationResults: {
    initial: new Map(),    // 初始翻譯結果
    reflection: new Map(),  // 反思結果
    optimize: new Map()     // 優化結果
  },
  completedStepsCount: 0,  // 新增：追踪完成的步驟數
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
  activeRequests: new Set(), // 追踪活動的請求

  /**
   * 根據批次數量決定發送間隔
   */
  getBatchInterval() {
    return TranslateConfig.BATCH.INTERVALS.find(
      ([count]) => this.totalBatches <= count
    )?.[1] || TranslateConfig.BATCH.DEFAULT_INTERVAL;
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
    // 按鈕由 UIManager 統一創建，這裡只初始化 checkbox 元素
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
    console.log('[resetTranslation] 開始重置翻譯狀態');
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
    // 清除所有階段的翻譯結果
    this.translationResults.initial.clear();
    this.translationResults.reflection.clear();
    this.translationResults.optimize.clear();
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
    const button = document.getElementById('gpt-translate-button'); 
    if (button) { 
      console.log('[resetTranslation] 重置按鈕狀態');
      button.textContent = 'GPT翻譯'; 
      button.classList.remove('canceling'); 
      button.disabled = false;
    }

    this.activeRequests.clear();
    console.log('[resetTranslation] 重置完成，當前狀態:', {
      isTranslating: this.isTranslating,
      shouldCancel: this.shouldCancel,
      currentBatchIndex: this.currentBatchIndex,
      queueLength: this.translationQueue.length,
      pendingCount: this.pendingTranslations.size,
      completedCount: this.completedTranslations.size,
      activeRequests: this.activeRequests.size
    });
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
      const maxLength = TranslateConfig.BATCH.TEXT_LIMIT.LINE;  // 1700
      const segments = line.match(/[^.。]+[.。]/g) || []; // 使用正則表達式匹配句號
      let currentBatch = '';
      
      for (const segment of segments) {
        if ((currentBatch + segment).length <= maxLength) {
          currentBatch += segment;
        } else {
          // 當前批次已經接近限制，加入段落
          if (currentBatch) {
            addToParagraphs(currentBatch);
          }
          currentBatch = segment;
        }
      }
      
      // 處理最後一個批次
      if (currentBatch) {
        addToParagraphs(currentBatch);
      }
      
      // 返回最後一個句號之後的剩餘文本
      return line.replace(/.*[.。]/, '');
    };

    // 按換行分割文本
    text.split('\n').forEach(line => {
      if (line.length > TranslateConfig.BATCH.TEXT_LIMIT.LINE) {
        const remainder = processLongLine(line);
        currentBatch = remainder;
        return;
      }

      // 組合新批次
      const newBatch = currentBatch ? `${currentBatch}\n${line}` : line;

      // 檢查標點符號，按優先順序
      const hasPeriodAtEnd = /[.。]$/.test(line.trim());
      const hasCommaSpace = /[,，][ \t]/.test(line);
      const hasPeriodSpace = /[.。][ \t]/.test(line);
      const hasDashSpace = /-[ \t]/.test(line);
      const hasClosingParenthesis = /\)/.test(line);
      const hasSpace = / /.test(line);

      // 標點符號檢查結果
      const hasPunctuation = hasPeriodAtEnd || hasCommaSpace || hasPeriodSpace || hasDashSpace || hasClosingParenthesis || hasSpace;

      // 如果有標點符號，且長度超過限制，則添加到段落
      if (hasPunctuation && newBatch.length > TranslateConfig.BATCH.TEXT_LIMIT.BATCH) {
        addToParagraphs(newBatch);
        currentBatch = '';
      } else {
        currentBatch = newBatch;
      }
    });

    addToParagraphs(currentBatch);
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
    this.completedTranslations.clear();
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
   * 獲取前文上下文
   */
  getPreviousContext(currentIndex) {
    const previousBlocks = [];
    const maxBlocks = TranslateConfig.BATCH.MAX_PREVIOUS_BLOCKS;
    
    console.log(`開始收集前文上下文，當前區塊索引: ${currentIndex}, 最大區塊數: ${maxBlocks}`);
    
    // 從當前區塊往前收集
    for (let i = currentIndex - 1; i >= 0 && i > currentIndex - maxBlocks; i--) {
      // 獲取原文和優化後的譯文
      const initialResult = this.translationResults.initial.get(i);
      const optimizeResult = this.translationResults.optimize.get(i);

      if (!initialResult || !optimizeResult) {
        console.log(`警告：找不到區塊 ${i} 的完整翻譯結果`);
        continue;
      }

      previousBlocks.unshift({
        original: initialResult.original,
        optimized: optimizeResult
      });
    }

    if (previousBlocks.length === 0) {
      console.log('沒有找到任何前文上下文');
      return [];
    }

    console.log(`成功收集到 ${previousBlocks.length} 個區塊的上下文`);
    return [{
      role: "system",
      content: `請參考前文的翻譯：\n${previousBlocks.map(block => 
        `原文：\n${block.original}\n\n譯文：\n${block.optimized}\n---`
      ).join('\n')}`
    }];
  },

  /**
   * 處理反思階段
   */
  async processReflection(translatedText, sourceText, blockIndex) {
    try {
      const settings = await window.GlobalSettings.loadSettings();
      const model = settings.reflectModel || settings.model;
      const isGemini = model.startsWith('gemini');
      const apiKey = settings.apiKeys[isGemini ? 'gemini-2.0-flash-exp' : 'openai'];

      // 顯示反思階段的通知
      await window.Notification.showNotification(`
        模型: ${window.GlobalSettings.API.models[model] || model}<br>
        API KEY: ${apiKey.substring(0, 5)}...<br>
        ${TranslateConfig.STAGES.REFLECT}<br>
        批次進度: ${blockIndex + 1}/${this.totalBatches}
      `, true);

      // 獲取前文6個區塊的原文和初始譯文
      const prevBlocksStart = Math.max(0, blockIndex - 6);
      const prevBlocks = this.translationQueue.slice(prevBlocksStart, blockIndex);
      const prevTranslatedBlocks = Array.from({ length: blockIndex - prevBlocksStart }, (_, i) => {
        const initialResult = this.translationResults.initial.get(prevBlocksStart + i);
        return initialResult?.translated || '';
      });

      // 獲取後文6個區塊的原文
      const nextBlocksEnd = Math.min(this.translationQueue.length, blockIndex + 7);
      const nextBlocks = this.translationQueue.slice(blockIndex + 1, nextBlocksEnd);

      // 組織帶有 XML 標記的文本
      const taggedText = [
        // 前文原文和譯文
        ...prevBlocks.map((text, i) => 
          `<PREVIOUS_SOURCE>
            ${text}
          </PREVIOUS_SOURCE>
          <PREVIOUS_TRANSLATION>
            ${prevTranslatedBlocks[i]}
          </PREVIOUS_TRANSLATION>`
        ),
        // 當前要翻譯的區塊
        `<TRANSLATE_THIS>
          ${sourceText}
        </TRANSLATE_THIS>`,
        // 後文原文
        ...nextBlocks.map(text => 
          `<NEXT_SOURCE>
            ${text}
          </NEXT_SOURCE>`
        )
      ].join('\n');

      // 準備替換用的參數
      const replaceParams = {
        tagged_text: taggedText,
        chunk_to_translate: sourceText,
        translation_1_chunk: translatedText
      };

      // 獲取中英對照表上下文
      const context = await this.getTranslationContext();

      const { endpoint, body } = TextProcessor._prepareApiConfig(
        model,
        replaceParams,  // 傳入替換參數而不是文本
        settings.reflectInstruction,
        context  // 加入中英對照表
      );

      const reflectionResult = await this.sendRequestWithRetry(endpoint, body, apiKey, isGemini, true, 'reflect');
      
      // 保存反思結果
      this.translationResults.reflection.set(blockIndex, reflectionResult);
      
      // 增加完成步驟計數
      this.completedStepsCount++;
      
      return reflectionResult;
    } catch (error) {
      console.error('反思階段處理失敗:', error);
      return null;
    }
  },

  /**
   * 處理優化階段
   */
  async processOptimization(translatedText, sourceText, reflectionResult, blockIndex) {
    try {
      const settings = await window.GlobalSettings.loadSettings();
      const model = settings.optimizeModel || settings.model;
      const isGemini = model.startsWith('gemini');
      const apiKey = settings.apiKeys[isGemini ? 'gemini-2.0-flash-exp' : 'openai'];

      // 顯示優化階段的通知
      await window.Notification.showNotification(`
        模型: ${window.GlobalSettings.API.models[model] || model}<br>
        API KEY: ${apiKey.substring(0, 5)}...<br>
        ${TranslateConfig.STAGES.OPTIMIZE}<br>
        批次進度: ${blockIndex + 1}/${this.totalBatches}
      `, true);

      // 獲取前文6個區塊的原文和優化後譯文
      const prevBlocksStart = Math.max(0, blockIndex - 6);
      const prevBlocks = this.translationQueue.slice(prevBlocksStart, blockIndex);
      const prevOptimizedBlocks = Array.from({ length: blockIndex - prevBlocksStart }, (_, i) => {
        const optimizedText = this.translationResults.optimize.get(prevBlocksStart + i);
        return optimizedText || this.translationResults.initial.get(prevBlocksStart + i)?.translated || '';
      });

      // 獲取後文6個區塊的原文
      const nextBlocksEnd = Math.min(this.translationQueue.length, blockIndex + 7);
      const nextBlocks = this.translationQueue.slice(blockIndex + 1, nextBlocksEnd);

      // 組織帶有 XML 標記的文本
      const taggedText = [
        // 前文原文和譯文
        ...prevBlocks.map((text, i) => 
          `<PREVIOUS_SOURCE>
            ${text}
          </PREVIOUS_SOURCE>
          <PREVIOUS_TRANSLATION>
            ${prevOptimizedBlocks[i]}
          </PREVIOUS_TRANSLATION>`
        ),
        // 當前要翻譯的區塊
        `<TRANSLATE_THIS>
          ${sourceText}
        </TRANSLATE_THIS>`,
        // 後文原文
        ...nextBlocks.map(text => 
          `<NEXT_SOURCE>
            ${text}
          </NEXT_SOURCE>`
        )
      ].join('\n');

      // 準備替換用的參數
      const replaceParams = {
        tagged_text: taggedText,
        chunk_to_translate: sourceText,
        translation_1_chunk: translatedText,
        reflection_chunk: reflectionResult
      };

      // 獲取中英對照表上下文
      const context = await this.getTranslationContext();

      const { endpoint, body } = TextProcessor._prepareApiConfig(
        model,
        replaceParams,  // 傳入替換參數而不是文本
        settings.optimizeInstruction,
        context  // 加入中英對照表
      );

      const optimizedResult = await this.sendRequestWithRetry(endpoint, body, apiKey, isGemini, true, 'optimize');
      
      // 保存優化結果
      this.translationResults.optimize.set(blockIndex, optimizedResult);
      
      // 增加完成步驟計數
      this.completedStepsCount++;
      
      return optimizedResult;
    } catch (error) {
      console.error('優化階段處理失敗:', error);
      return null;
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
      const settings = await window.GlobalSettings.loadSettings();
      const model = settings.translateModel || settings.model;
      const isGemini = model.startsWith('gemini');
      const apiKey = settings.apiKeys[isGemini ? 'gemini-2.0-flash-exp' : 'openai'];

      // 獲取翻譯上下文
      const context = await this.getTranslationContext();

      const { endpoint, body } = TextProcessor._prepareApiConfig(
        model,
        originalText,
        settings.translateInstruction,
        context  // 添加上下文
      );

      console.log(`正在翻譯第 ${batchIndex + 1}/${this.totalBatches} 批次`);
      const translatedText = await this.sendRequestWithRetry(endpoint, body, apiKey, isGemini, true);

      if (this.pendingTranslations.has(batchIndex)) {
        this.updateTranslatedText(batchIndex, translatedText.trim(), settings);
        this.pendingTranslations.delete(batchIndex);
        this.completedTranslations.add(batchIndex);

        if (this.isAllBatchesCompleted()) {
          console.log('所有翻譯批次已完成，開始分區塊反思和優化流程');
          clearTimeout(this.timeoutId);

          try {
            const finalText = await this.processAllBlocks();
            
            // 立即重置按鈕狀態，不等通知
            this.resetTranslation();
            
            // 最後顯示完成通知
            await window.Notification.showNotification(TranslateConfig.STAGES.COMPLETED, false);
          } catch (error) {
            console.error('反思優化處理失敗:', error);
            
            // 即使出錯也要重置按鈕狀態
            this.resetTranslation();
            
            await window.Notification.showNotification('反思優化處理失敗: ' + error.message, false);
          }
        } else {
          // 如果還有未完成的批次，更新進度通知
          await window.Notification.showNotification(`
            模型: ${window.GlobalSettings.API.models[model] || model}<br>
            API KEY: ${apiKey.substring(0, 5)}...<br>
            ${TranslateConfig.STAGES.INITIAL}<br>
            批次進度: ${this.completedTranslations.size}/${this.totalBatches}<br>
            發送間隔: ${this.batchInterval/1000}秒
          `, true);
        }
      }
    } catch (error) {
      if (error.message === '翻譯請求已取消') {
        return;
      }
      console.error(`批次 ${batchIndex + 1} 翻譯錯誤:`, error);
      this.pendingTranslations.delete(batchIndex);
    }
  },

  /**
   * 獲取特定區塊的翻譯文本
   */
  getTranslatedTextForBlock(blockIndex) {
    // 從 translationResults 中獲取初始翻譯結果
    const result = this.translationResults.initial.get(blockIndex);
    if (!result) {
      console.log(`警告：找不到區塊 ${blockIndex} 的譯文`);
      return '';
    }
    return result.translated;
  },

  /**
   * 更新已翻譯的文本
   */
  updateTranslatedText(batchIndex, translatedText, settings) {
    const textArea = document.querySelector('textarea[name="content"]');
    if (!textArea) return;

    const originalText = this.translationQueue[batchIndex];
    let finalTranslatedText = batchIndex > 0 ? '\n' + translatedText : translatedText;

    if (settings.removeHash) {
      finalTranslatedText = finalTranslatedText.replace(/##\s*|\s*##/g, '');
    }
    if (settings.removeStar) {
      finalTranslatedText = finalTranslatedText.replace(/\*\*\s*|\s*\*\*/g, '');
    }

    // 保存初始翻譯結果
    this.translationResults.initial.set(batchIndex, {
      original: originalText,
      translated: finalTranslatedText
    });
    
    // 增加完成步驟計數
    this.completedStepsCount++;
    
    console.log(`\n=== 批次 ${batchIndex + 1}/${this.totalBatches} 翻譯更新 ===`);
    console.log('原始文本：\n' + (originalText.length > 500 ? originalText.substring(0, 500) + '...' : originalText));
    console.log('翻譯結果：\n' + (finalTranslatedText.length > 500 ? finalTranslatedText.substring(0, 500) + '...' : finalTranslatedText));
    console.log(`原始長度：${originalText.length}，翻譯後長度：${finalTranslatedText.length}`);
    console.log('=====================================\n');

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
   * 處理 API 請求並支援重試機制
   */
  async sendRequestWithRetry(endpoint, body, apiKey, isGemini, showProgress, requestType = 'translate') {
    let retryCount = 0;
    const { MAX_RETRIES, DELAY, TIMEOUT } = TranslateConfig.API.RETRY;
    const timeoutDuration = TIMEOUT[requestType.toUpperCase()];

    while (retryCount < MAX_RETRIES) {
      try {
        const startTime = Date.now();  // 記錄開始時間

        // 建立一個帶有超時的 Promise
        const timeoutPromise = new Promise((_, reject) => {
          setTimeout(() => {
            reject(new Error('請求超時'));
          }, timeoutDuration);
        });

        // 建立實際的請求 Promise
        const requestPromise = TextProcessor._sendRequest(endpoint, body, apiKey, isGemini, showProgress, requestType);

        // 使用 Promise.race 來競爭，誰先完成就用誰的結果
        const response = await Promise.race([
          requestPromise,
          timeoutPromise
        ]);

        // 如果請求成功但已經超時，則忽略這個回應
        if (Date.now() - startTime > timeoutDuration) {
          console.log(`收到回應但已超時 (${requestType})，忽略此回應`);
          continue;
        }

        return response;
      } catch (error) {
        // 如果是取消錯誤，直接拋出不重試
        if (error.message === '翻譯請求已取消' || error.name === 'AbortError') {
          console.log('檢測到取消請求，停止重試');
          throw error;
        }

        // 其他錯誤進行重試
        if (retryCount < MAX_RETRIES - 1) {
          retryCount++;
          const errorMessage = error.status ? `狀態碼 ${error.status}` : error.message;
          console.log(`收到錯誤 (${errorMessage})，等待 ${DELAY/1000} 秒後進行第 ${retryCount} 次重試...`);
          await new Promise(resolve => setTimeout(resolve, DELAY));
          continue;
        }
        throw error;
      }
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

      // 獲取完整的上下文文本
      const fullText = this.translationQueue.join('\n');
      const currentIndex = this.translationQueue.indexOf(text);
      
      // 組織帶有 XML 標記的文本
      const taggedText = `<SOURCE_TEXT>${fullText}</SOURCE_TEXT>\n` + 
        this.translationQueue.slice(0, currentIndex).join('\n') +
        `<TRANSLATE_THIS>${text}</TRANSLATE_THIS>\n` +
        this.translationQueue.slice(currentIndex + 1).join('\n');

      // 獲取中英對照表上下文
      const context = await this.getTranslationContext();

      // 準備 API 請求配置
      const { endpoint, body } = TextProcessor._prepareApiConfig(
        model,
        taggedText,
        settings.translateInstruction,
        context  // 加入中英對照表
      );

      return await this.sendRequestWithRetry(endpoint, body, apiKey, isGemini, true, 'translate');
    } catch (error) {
      console.error('翻譯處理失敗:', error);
      throw error;
    }
  },

  /**
   * 獲取當前翻譯後的文本
   */
  getTranslatedText() {
    const textArea = document.querySelector('textarea[name="content"]');
    if (!textArea) return '';
    
    // 如果有選取範圍，只返回選取的部分
    if (this.selectionStart !== null && this.selectionEnd !== null) {
      return textArea.value.substring(this.selectionStart, this.selectionEnd);
    }
    return textArea.value;
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
   * 處理所有區塊的反思和優化
   */
  async processAllBlocks() {
    // 使用 Map 來存儲結果，保留區塊編號
    const resultsMap = new Map();
    
    for (let i = 0; i < this.translationQueue.length; i++) {
      const originalBlock = this.translationQueue[i];
      const translatedBlock = this.getTranslatedTextForBlock(i);

      try {
        // 反思階段...
        const reflectionResult = await this.processReflection(translatedBlock, originalBlock, i);
        
        // 根據總區塊數決定等待時間
        let waitTime;
        if (this.translationQueue.length <= 4) {
          waitTime = TranslateConfig.API.INTERVAL.WAIT.NONE;
        } else if (this.translationQueue.length < 7) {
          waitTime = TranslateConfig.API.INTERVAL.WAIT.SHORT;
        } else {
          waitTime = TranslateConfig.API.INTERVAL.WAIT.LONG;
        }
        await new Promise(resolve => setTimeout(resolve, waitTime));

        // 優化階段...
        const optimizedResult = await this.processOptimization(translatedBlock, originalBlock, reflectionResult, i);
        
        // 使用統一入口更新優化結果
        await this.updateText(optimizedResult, 'optimize');
        
        // 使用 Map 存儲結果，key 為原始索引
        resultsMap.set(i, optimizedResult);

        if (i < this.translationQueue.length - 1) {
          await new Promise(resolve => setTimeout(resolve, waitTime));
        }
      } catch (error) {
        if (error.message === '翻譯請求已取消') {
          return;
        }
        console.error(`區塊 ${i} 處理失敗:`, error);
        // 使用初始翻譯作為備選
        const fallbackText = this.getTranslatedTextForBlock(i);
        if (fallbackText) {
          resultsMap.set(i, fallbackText);
        }
      }
    }

    // 按照原始順序組合結果
    const finalText = Array.from(resultsMap.entries())
      .sort(([a], [b]) => a - b)  // 確保按照索引順序排序
      .map(([_, text]) => text)
      .join('\n');
      
    // 使用統一入口更新最終文本
    await this.updateText(finalText, 'final');
    return finalText;
  },

  // 取消翻譯
  async cancelTranslation() {
    console.log('[cancelTranslation] 開始取消翻譯流程');
    console.log('[cancelTranslation] 當前狀態:', {
      isTranslating: this.isTranslating,
      shouldCancel: this.shouldCancel,
      activeRequests: this.activeRequests?.size || 0,
      pendingTranslations: this.pendingTranslations.size,
      completedTranslations: this.completedTranslations.size
    });

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
      console.log('[cancelTranslation] 已清空活動請求集合');
    }

    // 清除所有計時器
    if (this.timeoutId) {
      console.log('[cancelTranslation] 清除計時器');
      clearTimeout(this.timeoutId);
      this.timeoutId = null;
    }

    // 重置所有翻譯相關的狀態
    console.log('[cancelTranslation] 開始重置翻譯狀態');
    this.resetTranslation();
    await window.Notification.showNotification(TranslateConfig.STAGES.CANCELLED, false);
    console.log('[cancelTranslation] 翻譯取消流程完成');
  },

  // 更新文本的統一入口
  async updateText(text, type) {
    switch(type) {
      case 'initial':
        this.translationResults.initial.set(this.currentBatchIndex, text);
        break;
      case 'reflection':
        this.translationResults.reflection.set(this.currentBatchIndex, text);
        break;
      case 'optimize':
        this.translationResults.optimize.set(this.currentBatchIndex, text);
        break;
      case 'final':
        this.updateFinalText(text);
        break;
    }
  }
};
