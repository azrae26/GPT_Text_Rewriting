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
    const { BATCH, HARD, FORCE, LINE, LONG_LINE_MAX } = TranslateConfig.BATCH.TEXT_LIMIT;
    const paragraphs = [];
    let currentBatch = '';
    let lastCutPoint = null; // { paragraphsLength, batchSnapshot } 記錄最近合法切點

    const addToParagraphs = (t) => {
      if (t.trim()) paragraphs.push(t);
    };

    // 在當前位置切塊
    const flush = (batch) => {
      addToParagraphs(batch);
      lastCutPoint = null;
    };

    // 判斷是否有合法句號（排除小數點、數字編號）
    const isSentencePeriod = (line) => {
      // 排除：數字.數字（小數）、行首數字. （編號列表）、省略號（連續多點）
      return /(?<![.\d])[.。](?![.\d])/.test(line) && !/^\s*\d+\.\s/.test(line);
    };

    // 判斷是否有備選標點（排除千分位逗號）
    const isOtherPunctuation = (line) => {
      const hasCommaSpace = /(?<!\d),(?!\d)\s/.test(line) || /[，]\s/.test(line);
      const hasDashSpace = /-\s/.test(line);
      const hasClosingBracket = /[）\]】」』〉》]/.test(line);
      return hasCommaSpace || hasDashSpace || hasClosingBracket;
    };

    // 語義切點：在此行之前切（完全無標點時的最後備選）
    const SEMANTIC_STARTS = /^(但|然而|因此|所以|此外|另外|首先|其次|最後|然後|接著|總之|雖然|如果|However|But|Therefore|Thus|Furthermore|Moreover|Additionally|Meanwhile|Finally|Although|Though)\b/;
    const isSemanticBoundary = (line) => SEMANTIC_STARTS.test(line.trim());

    // 超長單行處理：按句號切，每塊上限 LONG_LINE_MAX
    const processLongLine = (line) => {
      const segments = line.match(/(?:[^.。]|(?<=\d)\.(?=\d))+[.。]/g) || [];
      let buf = '';
      for (const seg of segments) {
        if ((buf + seg).length <= LONG_LINE_MAX) {
          buf += seg;
        } else {
          if (buf) addToParagraphs(buf);
          buf = seg;
        }
      }
      if (buf) addToParagraphs(buf);
      // 返回最後句號後的剩餘（貪婪匹配到最後一個句號）
      return line.replace(/^[\s\S]*[.。](?!\d)/, '');
    };

    // 不可分割區塊狀態
    let inBlock = null; // null | 'table' | 'code' | 'quote'
    let blockBuffer = '';

    const lines = text.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();

      // ── Code block 偵測 ──
      if (trimmed.startsWith('```')) {
        if (inBlock === 'code') {
          // 結束 code block
          blockBuffer += '\n' + line;
          flush(currentBatch);
          currentBatch = blockBuffer;
          blockBuffer = '';
          inBlock = null;
          continue;
        } else if (inBlock === null) {
          // 開始 code block：先切掉目前 batch
          if (currentBatch) { flush(currentBatch); currentBatch = ''; }
          inBlock = 'code';
          blockBuffer = line;
          continue;
        }
      }

      if (inBlock === 'code') {
        blockBuffer += '\n' + line;
        continue;
      }

      // ── 引用區塊 ──
      if (trimmed.startsWith('>')) {
        if (inBlock === null) {
          if (currentBatch) { flush(currentBatch); currentBatch = ''; }
          inBlock = 'quote';
          blockBuffer = line;
        } else if (inBlock === 'quote') {
          blockBuffer += '\n' + line;
        }
        continue;
      } else if (inBlock === 'quote') {
        // 引用結束
        flush(blockBuffer);
        blockBuffer = '';
        inBlock = null;
        // 繼續處理當前行（不 continue）
      }

      // ── Markdown 表格 ──
      if (trimmed.startsWith('|')) {
        if (inBlock === null) {
          if (currentBatch) { flush(currentBatch); currentBatch = ''; }
          inBlock = 'table';
          blockBuffer = line;
        } else if (inBlock === 'table') {
          blockBuffer += '\n' + line;
        }
        continue;
      } else if (inBlock === 'table') {
        // 表格結束
        flush(blockBuffer);
        blockBuffer = '';
        inBlock = null;
        // 繼續處理當前行
      }

      // ── 空行 → 立即切 ──
      if (!trimmed) {
        if (currentBatch) { flush(currentBatch); currentBatch = ''; }
        continue;
      }

      // ── 標題行 → 切在標題之前，標題留給下一塊 ──
      if (/^#{1,6}\s/.test(trimmed)) {
        if (currentBatch) { flush(currentBatch); currentBatch = ''; }
        currentBatch = line;
        continue;
      }

      // ── 超長單行 ──
      if (line.length > LINE) {
        if (currentBatch) { flush(currentBatch); currentBatch = ''; }
        const remainder = processLongLine(line);
        currentBatch = remainder;
        continue;
      }

      // ── 正常行：累積並判斷切點 ──
      const newBatch = currentBatch ? `${currentBatch}\n${line}` : line;

      // 語義切點：在這行之前切（僅當 batch 已有內容）
      if (currentBatch && isSemanticBoundary(line) && newBatch.length > BATCH) {
        flush(currentBatch);
        currentBatch = line;
        continue;
      }

      // 主切點：> BATCH 且有句號
      if (newBatch.length > BATCH && isSentencePeriod(line)) {
        flush(newBatch);
        currentBatch = '';
        continue;
      }

      // 記錄合法切點（> BATCH 時，有句號或語義詞都可作為回退點）
      if (newBatch.length > BATCH && (isSentencePeriod(line) || isSemanticBoundary(line))) {
        lastCutPoint = { batch: newBatch };
      }

      // 備選切點：> HARD 且有其他標點
      if (newBatch.length > HARD && isOtherPunctuation(line)) {
        flush(newBatch);
        currentBatch = '';
        continue;
      }

      // 強制回退：> FORCE
      if (newBatch.length > FORCE) {
        if (lastCutPoint) {
          // 回退到最近合法切點
          flush(lastCutPoint.batch);
          // 把超出部分重新放回 currentBatch
          const overflowStart = lastCutPoint.batch.length;
          currentBatch = newBatch.slice(overflowStart).replace(/^\n/, '');
        } else {
          // 無合法切點，強制在此切
          flush(newBatch);
          currentBatch = '';
        }
        lastCutPoint = null;
        continue;
      }

      currentBatch = newBatch;

      // 更新合法切點記錄（超過 BATCH 後開始記錄）
      if (newBatch.length > BATCH && (isSentencePeriod(line) || isOtherPunctuation(line) || isSemanticBoundary(line))) {
        lastCutPoint = { batch: newBatch };
      }
    }

    // 處理剩餘的不可分割區塊
    if (blockBuffer) addToParagraphs(blockBuffer);
    // 處理剩餘 batch
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
      const reflectionResult = await this.sendRequestWithHedging(
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

      const optimizedResult = await this.sendRequestWithHedging(endpoint, body, apiKey, isGemini, true, 'optimize', controller);
      
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
      const translatedText = await this.sendRequestWithHedging(endpoint, body, apiKey, isGemini, true, 'translate', controller);

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
   * 對沖請求：立即發 A，40秒無回應發 B，再40秒發 C，誰先回用誰
   * 全局死線由 TranslateAdapter 外部管理（所有批次送出後90秒）
   * @param {string} endpoint - API 端點
   * @param {Object} body - 請求體
   * @param {string} apiKey - API 金鑰
   * @param {boolean} isGemini - 是否為 Gemini API
   * @param {boolean} showProgress - 是否顯示進度
   * @param {string} requestType - 請求類型
   * @param {TranslationController} controller - 翻譯控制器
   * @returns {Promise<string>} API 回應
   */
  sendRequestWithHedging(endpoint, body, apiKey, isGemini, showProgress, requestType = 'translate', controller) {
    return new Promise((resolve, reject) => {
      let resolved = false;
      let pendingCount = 0;
      let allLaunched = false;
      let bestResult = null; // { text, ratio } — 當全部低於門檻時取最高
      let timerB = null;
      let timerC = null;

      const checkRatio = requestType === 'translate';
      const threshold = TranslateConfig.CHINESE_RATIO_THRESHOLD;

      const clearHedgeTimers = () => {
        clearTimeout(timerB);
        clearTimeout(timerC);
      };

      // 所有已送出的請求都回來了，且沒有任何一個通過門檻
      const checkAllDone = () => {
        if (resolved || !allLaunched || pendingCount > 0) return;
        resolved = true;
        if (bestResult) {
          LogUtils.warn(`所有對沖請求中文比例均低於門檻，取最高者 (${(bestResult.ratio * 100).toFixed(1)}%)`);
          resolve(bestResult.text);
        } else {
          reject(new Error('所有對沖請求均失敗'));
        }
      };

      const attempt = (label) => {
        if (resolved) return;
        if (controller.isCancelled()) {
          if (!resolved) { resolved = true; clearHedgeTimers(); reject(new Error('翻譯請求已取消')); }
          return;
        }

        pendingCount++;
        const ctrl = new AbortController();
        this._activeRequests.add(ctrl);
        LogUtils.log(`添加請求到活動集合 [${label}]，當前數量: ${this._activeRequests.size}`);

        TextProcessor._sendRequest(endpoint, body, apiKey, isGemini, showProgress, requestType)
          .then(result => {
            if (resolved) return;

            if (checkRatio) {
              const ratio = this._calculateChineseRatio(result);
              LogUtils.log(`對沖請求 [${label}] 中文比例: ${(ratio * 100).toFixed(1)}%`);
              if (ratio >= threshold) {
                resolved = true;
                clearHedgeTimers();
                LogUtils.log(`[${label}] 通過門檻，採用結果`);
                resolve(result);
              } else {
                LogUtils.warn(`[${label}] 中文比例低於門檻 (${(threshold * 100)}%)，繼續等待其他對沖請求`);
                if (!bestResult || ratio > bestResult.ratio) {
                  bestResult = { text: result, ratio };
                }
              }
            } else {
              // reflect / optimize 不檢查比例，直接採用
              resolved = true;
              clearHedgeTimers();
              LogUtils.log(`對沖請求 [${label}] 最先回應，採用結果`);
              resolve(result);
            }
          })
          .catch(err => {
            if (err.message === '翻譯請求已取消' || err.name === 'AbortError') {
              if (!resolved) { resolved = true; clearHedgeTimers(); reject(err); }
            }
            // 其他錯誤：等後續對沖請求或全局死線
          })
          .finally(() => {
            this._activeRequests.delete(ctrl);
            LogUtils.log(`從活動集合移除請求 [${label}]，剩餘數量: ${this._activeRequests.size}`);
            pendingCount--;
            checkAllDone();
          });
      };

      attempt('A');
      timerB = setTimeout(() => attempt('B'), TranslateConfig.API.HEDGE_INTERVAL);
      timerC = setTimeout(() => {
        allLaunched = true;
        attempt('C');
      }, TranslateConfig.API.HEDGE_INTERVAL * 2);
    });
  }

  /**
   * 計算文字中的中文比例（先去除數字再計算）
   * @param {string} text
   * @returns {number} 0~1 的比例
   */
  _calculateChineseRatio(text) {
    if (!text || !text.trim()) return 0;
    const withoutNumbers = text.replace(/[0-9０-９]/g, '');
    const nonSpace = withoutNumbers.replace(/\s/g, '');
    if (!nonSpace) return 0;
    const chineseChars = (nonSpace.match(/[一-鿿㐀-䶿]/g) || []).length;
    return chineseChars / nonSpace.length;
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