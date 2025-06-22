/* global GlobalSettings, Notification, TextProcessor */
/**
 * translate.js - AI 翻譯管理模組
 * 功能：提供完整的 AI 翻譯功能，支援批次處理、多階段優化和錯誤處理
 * 職責：
 * - 批次翻譯處理：將長文本拆分為批次，支援並行處理
 * - 多階段翻譯：初步翻譯 → 反思檢查 → 優化改進的三階段流程
 * - 上下文管理：維護前文語境，確保翻譯一致性
 * - 中英對照處理：支援專業術語的對照表功能
 * - 取消機制：支援翻譯過程中的即時取消
 * - 錯誤重試：智能重試機制和失敗批次處理
 * - 格式處理：支援移除特殊字符和格式清理
 * 
 * 依賴：
 * - GlobalSettings：全局設定和 API 配置
 * - TextProcessor：文本處理和 API 請求
 * - Notification：進度通知和狀態提示
 */

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
    INITIAL: '初步翻譯中',
    REFLECT: '反思翻譯中',
    OPTIMIZE: '優化翻譯中',
    COMPLETED: '翻譯完成',
    CANCELLED: '翻譯已取消'
  }
};

/**
 * 翻譯狀態管理器
 * 統一管理翻譯流程的狀態和取消機制
 */
class TranslationController {
  constructor() {
    this.abortController = new AbortController();
    this.state = 'idle'; // idle, translating, reflecting, optimizing, completed, cancelled
    this.currentPhase = '';
    this.observers = new Set(); // 狀態觀察者
  }

  // 狀態管理
  setState(newState, phase = '') {
    // 安全檢查：如果當前狀態是 cancelled，不允許設置為 completed
    if (this.state === 'cancelled' && newState === 'completed') {
      console.log(`[TranslationController] 拒絕狀態變更: ${this.state} → ${newState} (已取消的流程不能變為完成)`);
      return;
    }
    
    console.log(`[TranslationController] 狀態變更: ${this.state} → ${newState}${phase ? ` (${phase})` : ''}`);
    this.state = newState;
    this.currentPhase = phase;
    this._notifyObservers();
  }

  isActive() {
    return ['translating', 'reflecting', 'optimizing'].includes(this.state);
  }

  isCancelled() {
    return this.state === 'cancelled' || this.abortController.signal.aborted;
  }

  // 取消機制
  cancel() {
    console.log('[TranslationController] 執行取消操作');
    this.setState('cancelled');
    this.abortController.abort();
    // 清理通知
    if (window.Notification && window.Notification.clearAllTimers) {
      window.Notification.clearAllTimers();
    }
  }

  // 重置控制器
  reset() {
    console.log('[TranslationController] 重置控制器');
    if (this.abortController) {
      this.abortController.abort();
    }
    this.abortController = new AbortController();
    this.setState('idle');
    this.observers.clear();
  }

  // 檢查取消狀態，如果已取消則拋出錯誤
  checkCancellation() {
    if (this.isCancelled()) {
      throw new Error('翻譯請求已取消');
    }
  }

  // 訂閱狀態變更
  subscribe(observer) {
    this.observers.add(observer);
    return () => this.observers.delete(observer); // 返回取消訂閱函數
  }

  _notifyObservers() {
    this.observers.forEach(observer => {
      try {
        observer(this.state, this.currentPhase);
      } catch (error) {
        console.error('[TranslationController] 通知觀察者時出錯:', error);
      }
    });
  }

  // 獲取 AbortSignal
  get signal() {
    return this.abortController.signal;
  }
}

// 確保在全局範圍內定義 TranslateManager
window.TranslateManager = {
  // 使用新的控制器
  controller: new TranslationController(),
  
  // 原有屬性
  currentBatchIndex: 0,
  translationQueue: [],
  completedTranslations: new Set(),
  failedTranslations: new Set(),
  translationResults: {
    initial: new Map(),
    reflection: new Map(),
    optimize: new Map()
  },
  completedStepsCount: 0,
  totalBatches: 0,
  timeoutId: null,
  isLastBatchProcessed: false,
  batchInterval: 5000,
  finalRetryAttempts: 0,
  maxFinalRetries: 3,
  removeHashCheckbox: null,
  removeStarCheckbox: null,
  selectionStart: null,
  selectionEnd: null,
  zhEnMappingTextarea: null,

  // 相容性屬性（向後兼容）
  get isTranslating() {
    return this.controller.isActive();
  },

  get shouldCancel() {
    return this.controller.isCancelled();
  },

  set shouldCancel(value) {
    if (value) {
      this.controller.cancel();
    }
  },

  // 活動請求管理（統一使用現有機制）
  get activeRequests() {
    // 使用 TextProcessor 的活動請求集合，如果不存在則創建本地集合
    if (!this._activeRequests) {
      this._activeRequests = new Set();
    }
    return this._activeRequests;
  },

  /**
   * 根據批次數量決定發送間隔
   */
  getBatchInterval() {
    return TranslateConfig.BATCH.INTERVALS.find(
      ([count]) => this.totalBatches <= count
    )?.[1] || TranslateConfig.BATCH.DEFAULT_INTERVAL;
  },

  /**
   * 檢查是否所有批次都已處理完成（包括失敗的）
   */
  isAllBatchesProcessed() {
    return (this.completedTranslations.size + this.failedTranslations.size) === this.totalBatches;
  },

  /**
   * 檢查是否所有批次都已成功完成
   */
  isAllBatchesCompleted() {
    return this.completedTranslations.size === this.totalBatches;
  },

  /**
   * 初始化翻譯功能
   */
  initialize() {
    console.log('TranslateManager 初始化...');
    
    // 訂閱控制器狀態變更
    this.controller.subscribe((state, phase) => {
      console.log(`[TranslateManager] 收到狀態變更通知: ${state} (${phase})`);
      
      // 根據狀態更新 UI
      const button = document.getElementById('ai-translate-button');
      if (button) {
        if (state === 'cancelled' || state === 'completed' || state === 'idle') {
          button.textContent = 'AI翻譯';
          button.classList.remove('canceling');
          button.disabled = false;
        } else {
          button.textContent = '取消';
          button.classList.add('canceling');
        }
      }
    });

    // 按鈕由 UIManager 統一創建，這裡只初始化 checkbox 元素
    this.checkboxManager.init();
  },

  /**
   * 處理翻譯按鈕點擊
   */
  async handleTranslateClick(button) {
    try {
      // 如果正在翻譯，執行取消
      if (this.controller.isActive()) {
        console.log('取消翻譯');
        await this.cancelTranslation();
        return;
      }

      const settings = await window.GlobalSettings.loadSettings();
      
      // 檢查是否有任何可用的 API 金鑰
      const hasAnyApiKey = Object.values(settings.apiKeys || {}).some(key => key && key.trim());
      if (!hasAnyApiKey) {
        throw new Error('請先設置 API 金鑰');
      }

      const textArea = document.querySelector('textarea[name="content"]');
      if (!textArea || !textArea.value.trim()) {
        throw new Error('請先輸入要翻譯的內容');
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
    
    // 重置控制器
    this.controller.reset();
    
    // 清空活動請求集合
    if (this._activeRequests) {
      this._activeRequests.clear();
      console.log('[resetTranslation] 清空活動請求集合');
    }
    
    // 重置其他狀態
    this.currentBatchIndex = 0;
    this.translationQueue = [];
    this.completedTranslations.clear();
    this.failedTranslations.clear();
    this.finalRetryAttempts = 0;
    this.completedStepsCount = 0;
    this.translationResults.initial.clear();
    this.translationResults.reflection.clear();
    this.translationResults.optimize.clear();
    this.isLastBatchProcessed = false;
    this.batchInterval = 5000;
    this.selectionStart = null;
    this.selectionEnd = null;

    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
      this.timeoutId = null;
    }

    console.log('[resetTranslation] 重置完成');
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
   * 獲取原始中英對照表內容
   * @returns {Promise<string>} 原始的中英對照表文本內容
   */
  async getRawZhEnMapping() {
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
            console.log('[getRawZhEnMapping] 從 storage 載入中英對照表');
            return result.zhEnMapping;
          }
        }
      }
      
      if (!this.zhEnMappingTextarea) {
        console.log('[getRawZhEnMapping] 找不到中英對照表資料');
        return '';
      }

      console.log('[getRawZhEnMapping] 從設定頁面載入中英對照表');
      return this.zhEnMappingTextarea.value || '';
    } catch (error) {
      console.error('[getRawZhEnMapping] 獲取中英對照表時發生錯誤:', error);
      return '';
    }
  },

  /**
   * 獲取翻譯上下文
   * @returns {Promise<Array>} 包含中英對照表的上下文陣列
   */
  async getTranslationContext() {
    const rawMappingText = await this.getRawZhEnMapping();
    console.log('[getTranslationContext] 原始對照表長度:', rawMappingText.length);
    
    if (!rawMappingText.trim()) {
      console.log('[getTranslationContext] 對照表為空，返回空陣列');
      return [];
    }

    console.log('[getTranslationContext] 成功載入中英對照表');
    return [{
      role: "system",
      content: rawMappingText
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

    this.controller.setState('translating');
    this.currentBatchIndex = 0;
    this.isLastBatchProcessed = false;
    this.translationQueue = this.splitTextIntoParagraphs(textToTranslate);
    this.totalBatches = this.translationQueue.length;
    this.batchInterval = this.getBatchInterval();
    this.completedTranslations.clear();
    this.failedTranslations.clear();
    this.timeoutId = null;

    // 更新按鈕狀態
    button.textContent = '取消';
    button.classList.add('canceling');

    const settings = await window.GlobalSettings.loadSettings();
    const model = settings.translateModel;
    
    // 如果沒有選擇模型，使用預設模型
    const finalModel = model || window.GlobalSettings.getDefaultModel();
    if (!finalModel) {
      throw new Error('沒有可用的翻譯模型，請先添加自定義模型');
    }
    
    const isGemini = finalModel.startsWith('gemini');
    
    // 使用動態 API 金鑰獲取
    const apiType = window.GlobalSettings.getModelApiType(finalModel);
    const apiKeyName = window.GlobalSettings.getApiKeyNameForModel(finalModel);
    const apiKey = settings.apiKeys[apiKeyName];
    if (!apiKey) {
      throw new Error(`請先設置 ${apiType.toUpperCase()} API 金鑰`);
    }

    console.log(`總共分割成 ${this.totalBatches} 個批次，間隔時間：${this.batchInterval/1000}秒`);
    await window.Notification.showNotification(`
      模型: ${window.GlobalSettings.getModelDisplayName(finalModel)}<br>
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
    if (!this.controller.isCancelled() && this.currentBatchIndex < this.translationQueue.length) {
      this.timeoutId = setTimeout(() => {
        // 在執行前再次檢查取消狀態
        if (!this.controller.isCancelled()) {
          this.processNextBatch();
          this.scheduleNextBatch();
        }
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
    // 使用統一的取消檢查
    this.controller.checkCancellation();

    // 記錄開始時的狀態，用於後續檢查
    const startState = this.controller.state;
    const startTime = Date.now();

    try {
      const settings = await window.GlobalSettings.loadSettings();
      const model = settings.reflectModel;
      
      // 如果沒有選擇模型，使用預設模型
      const finalModel = model || window.GlobalSettings.getDefaultModel();
      if (!finalModel) {
        console.warn('沒有可用的反思模型，跳過反思階段');
        return null;
      }
      
      const isGemini = finalModel.startsWith('gemini');
      
      // 使用動態 API 金鑰獲取
      const apiType = window.GlobalSettings.getModelApiType(finalModel);
      const apiKeyName = window.GlobalSettings.getApiKeyNameForModel(finalModel);
      const apiKey = settings.apiKeys[apiKeyName];

      // 設置階段狀態
      this.controller.setState('reflecting', `批次 ${blockIndex + 1}/${this.totalBatches}`);

      // 顯示反思階段的通知
      const reflectionNotification = await window.Notification.showNotification(`
        模型: ${window.GlobalSettings.getModelDisplayName(finalModel)}<br>
        API KEY: ${apiKey.substring(0, 5)}...<br>
        ${TranslateConfig.STAGES.REFLECT}<br>
        批次進度: ${blockIndex + 1}/${this.totalBatches}
      `, true);
      
      // 準備替換用的參數
      const replaceParams = {
        chunk_to_translate: sourceText,
        translation_1_chunk: translatedText
      };

      // 修復：正確解構 _prepareApiConfig 的返回值
      const { endpoint, body } = TextProcessor._prepareApiConfig(finalModel, replaceParams, settings.reflectInstruction, []);
      
      // 使用改進的請求方法，整合 AbortController
      const reflectionResult = await this.sendRequestWithRetry(
        endpoint, 
        body, 
        apiKey, 
        isGemini, 
        reflectionNotification,
        'reflect'
      );
      
      // 強化的取消檢查：檢查當前狀態和開始時狀態
      if (this.controller.isCancelled() || 
          (startState !== 'idle' && this.controller.state === 'idle' && Date.now() - startTime > 1000)) {
        console.log('[processReflection] 檢測到取消狀態或異常狀態重置，停止處理反思結果');
        return null;
      }
      
      console.log(`段落 ${blockIndex + 1} 反思完成:`, reflectionResult?.substring(0, 100) + '...');
      
      return reflectionResult;
    } catch (error) {
      console.error('反思階段處理失敗:', error);
      // 如果是取消錯誤，重新拋出
      if (error.message === '翻譯請求已取消') {
        throw error;
      }
      return null;
    }
  },

  /**
   * 處理優化階段
   */
  async processOptimization(translatedText, sourceText, reflectionResult, blockIndex) {
    // 使用統一的取消檢查
    this.controller.checkCancellation();

    // 記錄開始時的狀態，用於後續檢查
    const startState = this.controller.state;
    const startTime = Date.now();

    try {
      const settings = await window.GlobalSettings.loadSettings();
      const model = settings.optimizeModel;
      
      // 如果沒有選擇模型，使用預設模型
      const finalModel = model || window.GlobalSettings.getDefaultModel();
      if (!finalModel) {
        console.warn('沒有可用的優化模型，跳過優化階段');
        return translatedText; // 返回原始翻譯文本
      }
      
      const isGemini = finalModel.startsWith('gemini');
      
      // 使用動態 API 金鑰獲取
      const apiType = window.GlobalSettings.getModelApiType(finalModel);
      const apiKeyName = window.GlobalSettings.getApiKeyNameForModel(finalModel);
      const apiKey = settings.apiKeys[apiKeyName];

      // 設置階段狀態
      this.controller.setState('optimizing', `批次 ${blockIndex + 1}/${this.totalBatches}`);

      // 顯示優化階段的通知
      await window.Notification.showNotification(`
        模型: ${window.GlobalSettings.getModelDisplayName(finalModel)}<br>
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
        finalModel,
        replaceParams,  // 傳入替換參數而不是文本
        settings.optimizeInstruction,
        context  // 加入中英對照表
      );

      const optimizedResult = await this.sendRequestWithRetry(endpoint, body, apiKey, isGemini, true, 'optimize');
      
      // 強化的取消檢查：檢查當前狀態和開始時狀態
      if (this.controller.isCancelled() || 
          (startState !== 'idle' && this.controller.state === 'idle' && Date.now() - startTime > 1000)) {
        console.log('[processOptimization] 檢測到取消狀態或異常狀態重置，停止處理優化結果');
        return translatedText; // 返回原始翻譯文本
      }
      
      // 保存優化結果
      this.translationResults.optimize.set(blockIndex, optimizedResult);
      
      // 增加完成步驟計數
      this.completedStepsCount++;
      
      return optimizedResult;
    } catch (error) {
      console.error('優化階段處理失敗:', error);
      // 如果是取消錯誤，重新拋出
      if (error.message === '翻譯請求已取消') {
        throw error;
      }
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

    // 使用統一的取消檢查
    this.controller.checkCancellation();

    const originalText = this.translationQueue[this.currentBatchIndex];
    const batchIndex = this.currentBatchIndex;

    this.currentBatchIndex++;

    try {
      const settings = await window.GlobalSettings.loadSettings();
      const model = settings.translateModel;
      
      // 如果沒有選擇模型，使用預設模型
      const finalModel = model || window.GlobalSettings.getDefaultModel();
      if (!finalModel) {
        throw new Error('沒有可用的翻譯模型，請先添加自定義模型');
      }
      
      const isGemini = finalModel.startsWith('gemini');
      
      // 使用動態 API 金鑰獲取
      const apiType = window.GlobalSettings.getModelApiType(finalModel);
      const apiKeyName = window.GlobalSettings.getApiKeyNameForModel(finalModel);
      const apiKey = settings.apiKeys[apiKeyName];

      // 獲取翻譯上下文
      const context = await this.getTranslationContext();

      const { endpoint, body } = TextProcessor._prepareApiConfig(
        finalModel,
        originalText,
        settings.translateInstruction,
        context  // 添加上下文
      );

      console.log(`正在翻譯第 ${batchIndex + 1}/${this.totalBatches} 批次`);
      const translatedText = await this.sendRequestWithRetry(endpoint, body, apiKey, isGemini, true);

      this.updateTranslatedText(batchIndex, translatedText.trim(), settings);
      this.completedTranslations.add(batchIndex);

      // 檢查是否需要處理完成邏輯
      await this.checkAndHandleCompletion(finalModel, apiKey, settings);
    } catch (error) {
      if (error.message === '翻譯請求已取消') {
        return;
      }
      console.error(`批次 ${batchIndex + 1} 翻譯錯誤:`, error);
      this.failedTranslations.add(batchIndex);
      
      // 檢查是否需要處理完成邏輯
      try {
        const settings = await window.GlobalSettings.loadSettings();
        const model = settings.translateModel || window.GlobalSettings.getDefaultModel();
        const apiType = window.GlobalSettings.getModelApiType(model);
        const apiKeyName = window.GlobalSettings.getApiKeyNameForModel(model);
        const apiKey = settings.apiKeys[apiKeyName];
        await this.checkAndHandleCompletion(model, apiKey, settings);
      } catch (settingsError) {
        console.error('獲取設定時發生錯誤:', settingsError);
      }
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
    // 檢查取消狀態，防止已取消的翻譯更新文本
    if (this.controller.isCancelled()) {
      console.log('[updateTranslatedText] 翻譯已取消，停止文本更新');
      return;
    }

    const textArea = document.querySelector('textarea[name="content"]');
    if (!textArea) {
      console.log('[updateTranslatedText] 找不到文本區域');
      return;
    }

    // 防護：檢查 batchIndex 有效性
    if (batchIndex < 0 || batchIndex >= this.translationQueue.length) {
      console.log(`[updateTranslatedText] 無效的批次索引: ${batchIndex}，隊列長度: ${this.translationQueue.length}`);
      return;
    }

    const originalText = this.translationQueue[batchIndex];
    // 防護：檢查 originalText 是否存在
    if (!originalText) {
      console.log(`[updateTranslatedText] 找不到批次 ${batchIndex} 的原始文本`);
      return;
    }

    // 防護：檢查 translatedText 是否存在
    if (!translatedText) {
      console.log(`[updateTranslatedText] 批次 ${batchIndex} 的翻譯文本為空`);
      return;
    }

    let finalTranslatedText = batchIndex > 0 ? '\n' + translatedText : translatedText;

    if (settings && settings.removeHash) {
      finalTranslatedText = finalTranslatedText.replace(/##\s*|\s*##/g, '');
    }
    if (settings && settings.removeStar) {
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

    // 最終檢查：確保還沒有被取消
    if (this.controller.isCancelled()) {
      console.log('[updateTranslatedText] 翻譯在更新過程中被取消，停止 DOM 更新');
      return;
    }

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
   * 處理 API 請求並支援重試機制（改進版）
   */
  async sendRequestWithRetry(endpoint, body, apiKey, isGemini, showProgress, requestType = 'translate') {
    const maxRetries = 3;
    let attempt = 0;
    let lastError;
    let requestController;

    // 如果 apiKey 為空，嘗試從設定中獲取
    if (!apiKey) {
      const settings = await window.GlobalSettings.loadSettings();
      const model = body.model; // 從 body 中獲取模型名稱，不使用預設值
      
      if (model) {
        // 使用動態 API 金鑰獲取
        const apiType = window.GlobalSettings.getModelApiType(model);
        const apiKeyName = window.GlobalSettings.getApiKeyNameForModel(model);
        apiKey = settings.apiKeys[apiKeyName];
      }
    }

    while (attempt < maxRetries) {
      try {
        // 在每次重試前檢查取消狀態
        this.controller.checkCancellation();

        const startTime = Date.now();  // 記錄開始時間

        // 創建新的請求控制器並添加到活動請求集合
        requestController = new AbortController();
        this.activeRequests.add(requestController);
        console.log(`[sendRequestWithRetry] 添加請求到活動集合，當前數量: ${this.activeRequests.size}`);

        // 建立一個帶有超時的 Promise
        const timeoutPromise = new Promise((_, reject) => {
          setTimeout(() => {
            reject(new Error('請求超時'));
          }, TranslateConfig.API.RETRY.TIMEOUT[requestType.toUpperCase()]);
        });

        // 使用統一的 AbortController 和 text-processor.js 的請求機制
        const requestPromise = TextProcessor._sendRequest(
          endpoint, 
          body, 
          apiKey, 
          isGemini, 
          showProgress, 
          requestType
        );

        // 使用 Promise.race 來競爭，誰先完成就用誰的結果
        const response = await Promise.race([
          requestPromise,
          timeoutPromise
        ]);

        // 如果請求成功但已經超時，則忽略這個回應
        if (Date.now() - startTime > TranslateConfig.API.RETRY.TIMEOUT[requestType.toUpperCase()]) {
          console.log(`收到回應但已超時 (${requestType})，忽略此回應`);
          attempt++;
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
        if (attempt < maxRetries - 1) {
          attempt++;
          const errorMessage = error.status ? `狀態碼 ${error.status}` : error.message;
          console.log(`收到錯誤 (${errorMessage})，等待 ${TranslateConfig.API.RETRY.DELAY/1000} 秒後進行第 ${attempt} 次重試...`);
          await new Promise(resolve => setTimeout(resolve, TranslateConfig.API.RETRY.DELAY));
          continue;
        }
        throw error;
      } finally {
        // 從活動請求集合中移除
        if (requestController) {
          this.activeRequests.delete(requestController);
          console.log(`[sendRequestWithRetry] 從活動集合移除請求，剩餘數量: ${this.activeRequests.size}`);
        }
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
      
      // 使用動態 API 金鑰獲取
      const apiKeyName = window.GlobalSettings.getApiKeyNameForModel(model);
      const apiKey = settings.apiKeys[apiKeyName];

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
    // 檢查取消狀態，防止已取消的翻譯覆蓋用戶數據
    if (this.controller.isCancelled()) {
      console.log('[updateFinalText] 翻譯已取消，停止文本更新');
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
   * 檢查是否需要處理完成邏輯
   */
  async checkAndHandleCompletion(model, apiKey, settings) {
    // 檢查是否所有批次都已處理完成（包括失敗的）
    if (this.isAllBatchesProcessed()) {
      clearTimeout(this.timeoutId);
      
      // 如果有失敗的批次且還沒達到重試上限，嘗試重試
      if (this.failedTranslations.size > 0 && this.finalRetryAttempts < this.maxFinalRetries) {
        console.log(`檢測到 ${this.failedTranslations.size} 個失敗批次，開始第 ${this.finalRetryAttempts + 1} 次最終重試`);
        await window.Notification.showNotification(`
          檢測到 ${this.failedTranslations.size} 個失敗批次<br>
          開始第 ${this.finalRetryAttempts + 1}/${this.maxFinalRetries} 次重試<br>
          等待 15 秒後開始...
        `, true);
        
        // 等待 15 秒再開始重試
        setTimeout(() => {
          this.retryFailedBatches(model, apiKey, settings);
        }, 15000);
      } else if (this.isAllBatchesCompleted()) {
        // 所有批次都成功完成，開始反思和優化
        console.log('所有翻譯批次已完成，開始分區塊反思和優化流程');
        try {
          const finalText = await this.processAllBlocks();
          // 移除立即重置，讓 processAllBlocks 負責延遲重置
          await window.Notification.showNotification(TranslateConfig.STAGES.COMPLETED, false);
        } catch (error) {
          console.error('反思優化處理失敗:', error);
          this.resetTranslation();
          await window.Notification.showNotification('反思優化處理失敗: ' + error.message, false);
        }
      } else {
        // 有些批次最終失敗了，結束流程
        console.log(`翻譯完成，但有 ${this.failedTranslations.size} 個批次失敗`);
        this.resetTranslation();
        await window.Notification.showNotification(`
          翻譯完成，但有 ${this.failedTranslations.size} 個批次失敗<br>
          已達最大重試次數 (${this.maxFinalRetries})
        `, false);
      }
    } else if (!this.isAllBatchesCompleted()) {
      // 如果還有未完成的批次，更新進度通知
      await window.Notification.showNotification(`
        模型: ${window.GlobalSettings.getModelDisplayName(model)}<br>
        API KEY: ${apiKey.substring(0, 5)}...<br>
        ${TranslateConfig.STAGES.INITIAL}<br>
        批次進度: ${this.completedTranslations.size}/${this.totalBatches}<br>
        失敗: ${this.failedTranslations.size}<br>
        發送間隔: ${this.batchInterval/1000}秒
      `, true);
    }
  },

  /**
   * 重試失敗的批次
   */
  async retryFailedBatches(model, apiKey, settings) {
    if (this.shouldCancel) {
      console.log('翻譯已取消，停止重試');
      return;
    }

    this.finalRetryAttempts++;
    const failedIndexes = Array.from(this.failedTranslations);
    console.log(`開始重試失敗的批次: [${failedIndexes.join(', ')}]`);

    for (const batchIndex of failedIndexes) {
      if (this.shouldCancel) {
        console.log('翻譯已取消，停止重試');
        break;
      }

      try {
        const originalText = this.translationQueue[batchIndex];
        console.log(`重試批次 ${batchIndex + 1}/${this.totalBatches}`);

        await window.Notification.showNotification(`
          重試失敗批次 ${batchIndex + 1}/${this.totalBatches}<br>
          第 ${this.finalRetryAttempts}/${this.maxFinalRetries} 次重試
        `, true);

        // 獲取翻譯上下文
        const context = await this.getTranslationContext();

        const { endpoint, body } = TextProcessor._prepareApiConfig(
          model,
          originalText,
          settings.translateInstruction,
          context
        );

        const isGemini = model.startsWith('gemini');
        const translatedText = await this.sendRequestWithRetry(endpoint, body, apiKey, isGemini, true);

        // 重試成功，更新狀態
        this.updateTranslatedText(batchIndex, translatedText.trim(), settings);
        this.failedTranslations.delete(batchIndex);
        this.completedTranslations.add(batchIndex);

        console.log(`批次 ${batchIndex + 1} 重試成功`);

        // 重試間隔20秒（除了最後一個）
        if (batchIndex !== failedIndexes[failedIndexes.length - 1]) {
          await new Promise(resolve => setTimeout(resolve, 20000));
        }

      } catch (error) {
        console.error(`批次 ${batchIndex + 1} 重試失敗:`, error);
        // 保持在失敗列表中
      }
    }

    // 重試完成後，再次檢查完成狀態
    await this.checkAndHandleCompletion(model, apiKey, settings);
  },

  /**
   * 處理所有區塊的反思和優化
   */
  async processAllBlocks() {
    // 使用 Map 來存儲結果，保留區塊編號
    const resultsMap = new Map();
    
    for (let i = 0; i < this.translationQueue.length; i++) {
      // 在每個循環開始時檢查取消狀態
      this.controller.checkCancellation();

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

        // 在優化階段前再次檢查取消狀態
        this.controller.checkCancellation();

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
          console.log('反思優化流程已取消');
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

    // 修復文本組合邏輯：確保所有區塊都有結果
    const finalTexts = [];
    
    // 在文本組合前檢查取消狀態
    this.controller.checkCancellation();
    
    for (let i = 0; i < this.translationQueue.length; i++) {
      let blockText = resultsMap.get(i);
      
      // 如果沒有優化結果，使用初始翻譯結果
      if (!blockText) {
        const initialResult = this.translationResults.initial.get(i);
        blockText = initialResult?.translated || this.translationQueue[i]; // 最後備選：原文
      }
      
      finalTexts.push(blockText);
    }

    // 按照原始順序組合結果
    const finalText = finalTexts.join('\n');
      
    // 最後檢查取消狀態，防止更新已取消的翻譯
    this.controller.checkCancellation();

    // 使用統一入口更新最終文本
    this.controller.setState('completed');
    await this.updateText(finalText, 'final');
    
    // 延遲重置，確保文本更新完成
    setTimeout(() => {
      // 只有在仍然是完成狀態時才重置（防止被取消操作覆蓋）
      if (this.controller.state === 'completed') {
        this.resetTranslation();
      }
    }, 100);
    
    return finalText;
  },

  // 取消翻譯（改進版）
  async cancelTranslation() {
    console.log('[cancelTranslation] 開始取消翻譯流程');
    console.log('[cancelTranslation] 當前狀態:', {
      isTranslating: this.controller.isActive(),
      state: this.controller.state,
      completedTranslations: this.completedTranslations.size
    });

    // 使用控制器的統一取消機制
    this.controller.cancel();

    // 清除計時器
    if (this.timeoutId) {
      console.log('[cancelTranslation] 清除計時器');
      clearTimeout(this.timeoutId);
      this.timeoutId = null;
    }

    // 等待所有活動請求完成
    console.log('[cancelTranslation] 等待活動請求完成...');
    const waitForRequests = async () => {
      let attempts = 0;
      while (this.activeRequests.size > 0 && attempts < 50) { // 最多等待5秒
        await new Promise(resolve => setTimeout(resolve, 100));
        attempts++;
        console.log(`[cancelTranslation] 等待中... 剩餘請求: ${this.activeRequests.size}`);
      }
      
      // 額外等待一點時間，確保請求處理完成
      await new Promise(resolve => setTimeout(resolve, 200));
      
      // 只有在仍然是取消狀態時才重置
      if (this.controller.isCancelled()) {
        console.log('[cancelTranslation] 開始智能重置翻譯狀態');
        this.resetTranslation();
      }
    };

    // 異步等待，不阻塞UI
    waitForRequests();

    await window.Notification.showNotification(TranslateConfig.STAGES.CANCELLED, false);
    console.log('[cancelTranslation] 翻譯取消流程完成');
  },

  // 更新文本的統一入口（改進版）
  async updateText(text, type) {
    // 檢查取消狀態，防止已取消的翻譯更新文本
    if (this.controller.isCancelled() && type === 'final') {
      console.log('[updateText] 翻譯已取消，停止文本更新');
      return;
    }

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
  },
};
