/* global TranslateConfig, TranslateConfigUtils, GlobalSettings, TextProcessor, Notification */
/**
 * translate-service.js - 翻譯核心業務邏輯模組
 * 功能：提供純粹的翻譯業務處理，不涉及UI操作
 * 職責：
 * - 文本分割：將長文本分割成適合翻譯的批次
 * - 批次處理：管理翻譯批次的執行順序和狀態
 * - 反思處理：對翻譯結果進行反思和檢查
 * - 優化處理：對翻譯結果進行優化改進
 * - 上下文管理：處理中英對照表和前文語境
 * - API請求：統一的請求重試機制
 * 
 * 依賴：
 * - TranslateConfig：配置常數
 * - GlobalSettings：設定管理
 * - TextProcessor：API請求處理
 */

/**
 * 翻譯核心服務類
 * 處理翻譯的核心業務邏輯，不包含UI操作
 */
class TranslationService {
  constructor() {
    // 翻譯結果存儲
    this.translationResults = {
      initial: new Map(),    // 初步翻譯結果
      reflection: new Map(), // 反思結果
      optimize: new Map()    // 優化結果
    };
    
    // 活動請求管理
    this._activeRequests = new Set();
    
    // 中英對照表快取
    this._zhEnMappingCache = null;
  }

  /**
   * 將文本分割成段落
   * @param {string} text - 要分割的文本
   * @returns {Array<string>} 分割後的段落陣列
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
  }

  /**
   * 獲取原始中英對照表內容
   * @returns {Promise<string>} 原始的中英對照表文本內容
   */
  async getRawZhEnMapping() {
    try {
      // 如果有快取且不為空，直接返回
      if (this._zhEnMappingCache !== null) {
        return this._zhEnMappingCache;
      }

      // 嘗試從 popup 頁面獲取
      const zhEnMappingTextarea = document.getElementById('zhEnMapping');
      
      if (zhEnMappingTextarea && zhEnMappingTextarea.value) {
        LogUtils.log('從設定頁面載入中英對照表');
        this._zhEnMappingCache = zhEnMappingTextarea.value;
        return this._zhEnMappingCache;
      }

      // 如果找不到，嘗試從 chrome.storage.local 獲取
      const result = await new Promise(resolve => {
        chrome.storage.local.get(['zhEnMapping'], resolve);
      });
      
      if (result.zhEnMapping) {
        LogUtils.log('從 storage 載入中英對照表');
        this._zhEnMappingCache = result.zhEnMapping;
        return this._zhEnMappingCache;
      }

      LogUtils.log('找不到中英對照表資料');
      this._zhEnMappingCache = '';
      return '';
    } catch (error) {
      LogUtils.error('獲取中英對照表時發生錯誤:', error);
      this._zhEnMappingCache = '';
      return '';
    }
  }

  /**
   * 獲取翻譯上下文
   * @returns {Promise<Array>} 包含中英對照表的上下文陣列
   */
  async getTranslationContext() {
    const rawMappingText = await this.getRawZhEnMapping();
    LogUtils.log('原始對照表長度:', rawMappingText.length);
    
    if (!rawMappingText.trim()) {
      LogUtils.log('對照表為空，返回空陣列');
      return [];
    }

    LogUtils.log('成功載入中英對照表');
    return [{
      role: "system",
      content: rawMappingText
    }];
  }

  /**
   * 獲取前文上下文
   * @param {number} currentIndex - 當前區塊索引
   * @param {Array<string>} translationQueue - 翻譯隊列
   * @returns {Array} 前文上下文陣列
   */
  getPreviousContext(currentIndex, translationQueue) {
    const previousBlocks = [];
    const maxBlocks = TranslateConfig.BATCH.MAX_PREVIOUS_BLOCKS;
    
    LogUtils.log(`開始收集前文上下文，當前區塊索引: ${currentIndex}, 最大區塊數: ${maxBlocks}`);
    
    // 從當前區塊往前收集
    for (let i = currentIndex - 1; i >= 0 && i > currentIndex - maxBlocks; i--) {
      // 獲取原文和優化後的譯文
      const initialResult = this.translationResults.initial.get(i);
      const optimizeResult = this.translationResults.optimize.get(i);

      if (!initialResult || !optimizeResult) {
        LogUtils.warn(`找不到區塊 ${i} 的完整翻譯結果`);
        continue;
      }

      previousBlocks.unshift({
        original: initialResult.original,
        optimized: optimizeResult
      });
    }

    if (previousBlocks.length === 0) {
      LogUtils.log('沒有找到任何前文上下文');
      return [];
    }

    LogUtils.log(`成功收集到 ${previousBlocks.length} 個區塊的上下文`);
    return [{
      role: "system",
      content: `請參考前文的翻譯：\n${previousBlocks.map(block => 
        `原文：\n${block.original}\n\n譯文：\n${block.optimized}\n---`
      ).join('\n')}`
    }];
  }

  /**
   * 處理反思階段
   * @param {string} translatedText - 翻譯文本
   * @param {string} sourceText - 原始文本
   * @param {number} blockIndex - 區塊索引
   * @param {TranslationController} controller - 翻譯控制器
   * @returns {Promise<string|null>} 反思結果
   */
  async processReflection(translatedText, sourceText, blockIndex, controller) {
    // 使用統一的取消檢查
    controller.checkCancellation();

    // 記錄開始時的狀態，用於後續檢查
    const startState = controller.state;
    const startTime = Date.now();

    try {
      const settings = await GlobalSettings.loadSettings();
      const model = settings.reflectModel;
      
      // 如果沒有選擇模型，使用預設模型
      const finalModel = model || GlobalSettings.getDefaultModel();
      if (!finalModel) {
        LogUtils.warn('沒有可用的反思模型，跳過反思階段');
        return null;
      }
      
      const isGemini = finalModel.startsWith('gemini');
      
      // 使用動態 API 金鑰獲取
      const apiType = GlobalSettings.getModelApiType(finalModel);
      const apiKeyName = GlobalSettings.getApiKeyNameForModel(finalModel);
      const apiKey = settings.apiKeys[apiKeyName];

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
        true,
        'reflect',
        controller
      );
      
      // 強化的取消檢查：檢查當前狀態和開始時狀態
      if (controller.isCancelled() || 
          (startState !== 'idle' && controller.state === 'idle' && Date.now() - startTime > 1000)) {
        LogUtils.log('檢測到取消狀態或異常狀態重置，停止處理反思結果');
        return null;
      }
      
      LogUtils.log(`段落 ${blockIndex + 1} 反思完成:`, reflectionResult?.substring(0, 100) + '...');
      
      return reflectionResult;
    } catch (error) {
      LogUtils.error('反思階段處理失敗:', error);
      // 如果是取消錯誤，重新拋出
      if (error.message === '翻譯請求已取消') {
        throw error;
      }
      return null;
    }
  }

  /**
   * 處理優化階段
   * @param {string} translatedText - 翻譯文本
   * @param {string} sourceText - 原始文本
   * @param {string} reflectionResult - 反思結果
   * @param {number} blockIndex - 區塊索引
   * @param {Array<string>} translationQueue - 翻譯隊列
   * @param {TranslationController} controller - 翻譯控制器
   * @returns {Promise<string>} 優化結果
   */
  async processOptimization(translatedText, sourceText, reflectionResult, blockIndex, translationQueue, controller) {
    // 使用統一的取消檢查
    controller.checkCancellation();

    // 記錄開始時的狀態，用於後續檢查
    const startState = controller.state;
    const startTime = Date.now();

    try {
      const settings = await GlobalSettings.loadSettings();
      const model = settings.optimizeModel;
      
      // 如果沒有選擇模型，使用預設模型
      const finalModel = model || GlobalSettings.getDefaultModel();
      if (!finalModel) {
        LogUtils.warn('沒有可用的優化模型，跳過優化階段');
        return translatedText; // 返回原始翻譯文本
      }
      
      const isGemini = finalModel.startsWith('gemini');
      
      // 使用動態 API 金鑰獲取
      const apiType = GlobalSettings.getModelApiType(finalModel);
      const apiKeyName = GlobalSettings.getApiKeyNameForModel(finalModel);
      const apiKey = settings.apiKeys[apiKeyName];

      // 獲取前文6個區塊的原文和優化後譯文
      const prevBlocksStart = Math.max(0, blockIndex - 6);
      const prevBlocks = translationQueue.slice(prevBlocksStart, blockIndex);
      const prevOptimizedBlocks = Array.from({ length: blockIndex - prevBlocksStart }, (_, i) => {
        const optimizedText = this.translationResults.optimize.get(prevBlocksStart + i);
        return optimizedText || this.translationResults.initial.get(prevBlocksStart + i)?.translated || '';
      });

      // 獲取後文6個區塊的原文
      const nextBlocksEnd = Math.min(translationQueue.length, blockIndex + 7);
      const nextBlocks = translationQueue.slice(blockIndex + 1, nextBlocksEnd);

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

      const optimizedResult = await this.sendRequestWithRetry(endpoint, body, apiKey, isGemini, true, 'optimize', controller);
      
      // 強化的取消檢查：檢查當前狀態和開始時狀態
      if (controller.isCancelled() || 
          (startState !== 'idle' && controller.state === 'idle' && Date.now() - startTime > 1000)) {
        LogUtils.log('檢測到取消狀態或異常狀態重置，停止處理優化結果');
        return translatedText; // 返回原始翻譯文本
      }
      
      // 保存優化結果
      this.translationResults.optimize.set(blockIndex, optimizedResult);
      
      return optimizedResult;
    } catch (error) {
      LogUtils.error('優化階段處理失敗:', error);
      // 如果是取消錯誤，重新拋出
      if (error.message === '翻譯請求已取消') {
        throw error;
      }
      return translatedText; // 返回原始翻譯文本
    }
  }

  /**
   * 處理單批次翻譯
   * @param {string} originalText - 原始文本
   * @param {number} batchIndex - 批次索引
   * @param {TranslationController} controller - 翻譯控制器
   * @returns {Promise<string>} 翻譯結果
   */
  async translateBatch(originalText, batchIndex, controller) {
    try {
      controller.checkCancellation();

      const settings = await GlobalSettings.loadSettings();
      const model = settings.translateModel;
      
      // 如果沒有選擇模型，使用預設模型
      const finalModel = model || GlobalSettings.getDefaultModel();
      if (!finalModel) {
        throw new Error('沒有可用的翻譯模型，請先添加自定義模型');
      }
      
      const isGemini = finalModel.startsWith('gemini');
      
      // 使用動態 API 金鑰獲取
      const apiType = GlobalSettings.getModelApiType(finalModel);
      const apiKeyName = GlobalSettings.getApiKeyNameForModel(finalModel);
      const apiKey = settings.apiKeys[apiKeyName];

      // 獲取翻譯上下文
      const context = await this.getTranslationContext();

      const { endpoint, body } = TextProcessor._prepareApiConfig(
        finalModel,
        originalText,
        settings.translateInstruction,
        context  // 添加上下文
      );

      LogUtils.log(`📝 正在翻譯第 ${batchIndex + 1} 批次`);
      const translatedText = await this.sendRequestWithRetry(endpoint, body, apiKey, isGemini, true, 'translate', controller);

      return translatedText.trim();
    } catch (error) {
      if (error.message === '翻譯請求已取消') {
        throw error;
      }
      LogUtils.error(`批次 ${batchIndex + 1} 翻譯錯誤:`, error);
      throw error;
    }
  }

  /**
   * 處理 API 請求並支援重試機制
   * @param {string} endpoint - API 端點
   * @param {Object} body - 請求體
   * @param {string} apiKey - API 金鑰
   * @param {boolean} isGemini - 是否為 Gemini API
   * @param {boolean} showProgress - 是否顯示進度
   * @param {string} requestType - 請求類型
   * @param {TranslationController} controller - 翻譯控制器
   * @returns {Promise<string>} API 回應
   */
  async sendRequestWithRetry(endpoint, body, apiKey, isGemini, showProgress, requestType = 'translate', controller) {
    const maxRetries = TranslateConfig.API.RETRY.MAX_RETRIES;
    let attempt = 0;
    let requestController;

    // 如果 apiKey 為空，嘗試從設定中獲取
    if (!apiKey) {
      const settings = await GlobalSettings.loadSettings();
      const model = body.model; // 從 body 中獲取模型名稱，不使用預設值
      
      if (model) {
        // 使用動態 API 金鑰獲取
        const apiType = GlobalSettings.getModelApiType(model);
        const apiKeyName = GlobalSettings.getApiKeyNameForModel(model);
        apiKey = settings.apiKeys[apiKeyName];
      }
    }

    while (attempt < maxRetries) {
      try {
        // 在每次重試前檢查取消狀態
        controller.checkCancellation();

        const startTime = Date.now();  // 記錄開始時間

        // 創建新的請求控制器並添加到活動請求集合
        requestController = new AbortController();
        this._activeRequests.add(requestController);
        LogUtils.log(`添加請求到活動集合，當前數量: ${this._activeRequests.size}`);

        // 建立一個帶有超時的 Promise
        const timeoutPromise = new Promise((_, reject) => {
          setTimeout(() => {
            reject(new Error('請求超時'));
          }, TranslateConfigUtils.getTimeout(requestType));
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
        if (Date.now() - startTime > TranslateConfigUtils.getTimeout(requestType)) {
          LogUtils.log(`收到回應但已超時 (${requestType})，忽略此回應`);
          attempt++;
          continue;
        }

        return response;
      } catch (error) {
        // 如果是取消錯誤，直接拋出不重試
        if (error.message === '翻譯請求已取消' || error.name === 'AbortError') {
          LogUtils.log('檢測到取消請求，停止重試');
          throw error;
        }

        // 其他錯誤進行重試
        if (attempt < maxRetries - 1) {
          attempt++;
          const errorMessage = error.status ? `狀態碼 ${error.status}` : error.message;
          LogUtils.log(`收到錯誤 (${errorMessage})，等待 ${TranslateConfig.API.RETRY.DELAY/1000} 秒後進行第 ${attempt} 次重試...`);
          await new Promise(resolve => setTimeout(resolve, TranslateConfig.API.RETRY.DELAY));
          continue;
        }
        throw error;
      } finally {
        // 從活動請求集合中移除
        if (requestController) {
          this._activeRequests.delete(requestController);
          LogUtils.log(`從活動集合移除請求，剩餘數量: ${this._activeRequests.size}`);
        }
      }
    }
  }

  /**
   * 獲取特定區塊的翻譯文本
   * @param {number} blockIndex - 區塊索引
   * @returns {string} 翻譯文本
   */
  getTranslatedTextForBlock(blockIndex) {
    // 從 translationResults 中獲取初始翻譯結果
    const result = this.translationResults.initial.get(blockIndex);
    if (!result) {
      LogUtils.warn(`找不到區塊 ${blockIndex} 的譯文`);
      return '';
    }
    return result.translated;
  }

  /**
   * 清理服務狀態
   */
  cleanup() {
    this.translationResults.initial.clear();
    this.translationResults.reflection.clear();
    this.translationResults.optimize.clear();
    this._activeRequests.clear();
    this._zhEnMappingCache = null;
  }

  /**
   * 獲取活動請求集合
   * @returns {Set} 活動請求集合
   */
  get activeRequests() {
    return this._activeRequests;
  }
}

// 導出到全局
window.TranslationService = TranslationService;

LogUtils.log('翻譯服務模組已載入'); 