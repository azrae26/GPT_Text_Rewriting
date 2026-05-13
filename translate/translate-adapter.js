/* global TranslateConfig, TranslateConfigUtils, TranslationController, TranslationService, GlobalSettings, Notification */
/**
 * translate-adapter.js - 翻譯UI適配器模組
 * 功能：處理UI交互、事件處理和系統整合
 * 職責：
 * - UI操作：按鈕狀態、文本更新、進度顯示
 * - 事件處理：翻譯按鈕點擊、取消操作
 * - 流程協調：整合控制器和服務，管理完整翻譯流程
 * - 錯誤處理：用戶友好的錯誤提示和狀態恢復
 * - 格式處理：文本格式化、特殊字符處理
 * 
 * 依賴：
 * - TranslationController：狀態控制
 * - TranslationService：業務邏輯
 * - GlobalSettings：設定管理
 * - Notification：通知系統
 */

/**
 * 翻譯適配器類
 * 協調控制器和服務，處理與外界的交互
 */
class TranslateAdapter {
  constructor() {
    // 創建核心組件
    this.controller = new TranslationController();
    this.service = new TranslationService();
    
    // 翻譯狀態
    this.currentBatchIndex = 0;
    this.translationQueue = [];
    this.completedTranslations = new Set();
    this.failedTranslations = new Set();
    this.completedStepsCount = 0;
    this.totalBatches = 0;
    this.timeoutId = null;
    this.batchInterval = 5000;
    this.finalRetryAttempts = 0;
    this.globalDeadlineId = null;
    this.pendingBatches = new Set();
    this.selectionStart = null;
    this.selectionEnd = null;
    this.isSingleStepMode = false;

    // checkbox 管理
    this.removeHashCheckbox = null;
    this.removeStarCheckbox = null;
    
    // checkbox 相關配置和方法
    this.checkboxManager = {
      configs: [
        { id: 'removeHash', ref: 'removeHashCheckbox' },
        { id: 'removeStar', ref: 'removeStarCheckbox' }
      ],

      init() {
        this.configs.forEach(({ id, ref }) => {
          if (!window.TranslateManager[ref]) {
            window.TranslateManager[ref] = document.getElementById(id) || this._createCheckbox(id);
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
        window.TranslateManager.removeHashCheckbox = hashCheckbox;
        window.TranslateManager.removeStarCheckbox = starCheckbox;
      }
    };
  }

  /**
   * 初始化翻譯功能
   */
  initialize() {
    LogUtils.log('🚀 TranslateAdapter 初始化...');
    
    // 訂閱控制器狀態變更
    this.controller.subscribe((state, phase) => {
      LogUtils.log(`收到狀態變更通知: ${state} (${phase})`);
      
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
  }

  /**
   * 處理翻譯按鈕點擊
   * @param {HTMLElement} button - 翻譯按鈕元素
   */
  async handleTranslateClick(button) {
    try {
      // 如果正在翻譯，執行取消
      if (this.controller.isActive()) {
        LogUtils.log('🛑 取消翻譯');
        await this.cancelTranslation();
        return;
      }

      const settings = await GlobalSettings.loadSettings();
      
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
      LogUtils.error('翻譯錯誤:', error);
      alert('翻譯錯誤: ' + error.message);
      this.resetTranslation();
    }
  }

  /**
   * 開始翻譯流程
   * @param {HTMLElement} button - 翻譯按鈕元素
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
    LogUtils.warn(`🔍 點擊翻譯時 textarea 含 "..." 的位置: ${[...textToTranslate.matchAll(/\.{2,}/g)].map(m => `pos=${m.index} "${textToTranslate.substring(Math.max(0,m.index-10), m.index+m[0].length+10)}"`).join(' | ') || '（無連續點）'}`);
    this.translationQueue = this.service.splitTextIntoParagraphs(textToTranslate);
    this.totalBatches = this.translationQueue.length;
    this.batchInterval = TranslateConfigUtils.getBatchInterval(this.totalBatches);
    this.completedTranslations.clear();
    this.failedTranslations.clear();
    this.pendingBatches.clear();
    this.finalRetryAttempts = 0;
    this.timeoutId = null;
    this.globalDeadlineId = null;

    // 更新按鈕狀態
    button.textContent = '取消';
    button.classList.add('canceling');

    const settings = await GlobalSettings.loadSettings();
    this.isSingleStepMode = settings.singleStepMode || false;
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
    if (!apiKey) {
      throw new Error(`請先設置 ${apiType.toUpperCase()} API 金鑰`);
    }

    LogUtils.important(`📋 總共分割成 ${this.totalBatches} 個批次，間隔時間：${this.batchInterval/1000}秒`);
    await Notification.showNotification(`
      模型: ${GlobalSettings.getModelDisplayName(finalModel)}<br>
      API KEY: ${apiKey.substring(0, 5)}...<br>
      翻譯中<br>
      批次進度: 0/${this.totalBatches}<br>
      發送間隔: ${this.batchInterval/1000}秒
    `, true);

    // 開始第一個批次並設置定時器
    this.processNextBatch();
    this.scheduleNextBatch();
  }

  /**
   * 處理下一個批次
   */
  async processNextBatch() {
    LogUtils.log('processNextBatch called. currentBatchIndex:', this.currentBatchIndex, ', totalBatches:', this.totalBatches);

    // 如果已經處理完所有批次，直接返回
    if (this.currentBatchIndex >= this.translationQueue.length) {
      return;
    }

    // 使用統一的取消檢查
    this.controller.checkCancellation();

    const originalText = this.translationQueue[this.currentBatchIndex];
    const batchIndex = this.currentBatchIndex;

    this.currentBatchIndex++;
    this.pendingBatches.add(batchIndex);

    try {
      const translatedText = await this.service.translateBatch(originalText, batchIndex, this.controller);

      const settings = await GlobalSettings.loadSettings();
      this.updateTranslatedText(batchIndex, translatedText, settings);
      this.completedTranslations.add(batchIndex);
      this.pendingBatches.delete(batchIndex);

      // 檢查是否需要處理完成邏輯
      await this.checkAndHandleCompletion();
    } catch (error) {
      if (error.message === '翻譯請求已取消') {
        this.pendingBatches.delete(batchIndex);
        return;
      }
      LogUtils.error(`批次 ${batchIndex + 1} 翻譯錯誤:`, error);
      this.failedTranslations.add(batchIndex);
      this.pendingBatches.delete(batchIndex);

      // 檢查是否需要處理完成邏輯
      await this.checkAndHandleCompletion();
    }
  }

  /**
   * 安排下一個批次
   */
  scheduleNextBatch() {
    if (!this.controller.isCancelled() && this.currentBatchIndex < this.translationQueue.length) {
      this.timeoutId = setTimeout(() => {
        if (!this.controller.isCancelled()) {
          this.processNextBatch();
          this.scheduleNextBatch();
        }
      }, this.batchInterval);
    } else if (!this.controller.isCancelled()) {
      // 所有批次已送出，啟動全局死線
      this.startGlobalDeadline();
    }
  }

  /**
   * 啟動全局死線計時器（所有批次送出後90秒）
   */
  startGlobalDeadline() {
    if (this.globalDeadlineId) return;
    LogUtils.log(`全局死線計時器啟動，${TranslateConfig.API.GLOBAL_DEADLINE / 1000} 秒後到期`);
    this.globalDeadlineId = setTimeout(() => {
      this.handleGlobalDeadline();
    }, TranslateConfig.API.GLOBAL_DEADLINE);
  }

  /**
   * 全局死線到期：把所有仍在等待的批次標記為失敗
   */
  handleGlobalDeadline() {
    if (this.pendingBatches.size === 0) return;
    LogUtils.warn(`⏰ 全局死線到期，${this.pendingBatches.size} 個批次仍未回應，標記為失敗`);
    for (const idx of this.pendingBatches) {
      this.failedTranslations.add(idx);
    }
    this.pendingBatches.clear();
    this.checkAndHandleCompletion();
  }

  /**
   * 更新已翻譯的文本
   * @param {number} batchIndex - 批次索引
   * @param {string} translatedText - 翻譯文本
   * @param {Object} settings - 設定對象
   */
  updateTranslatedText(batchIndex, translatedText, settings) {
    // 檢查取消狀態，防止已取消的翻譯更新文本
    if (this.controller.isCancelled()) {
      LogUtils.log('翻譯已取消，停止文本更新');
      return;
    }

    const textArea = document.querySelector('textarea[name="content"]');
    if (!textArea) {
      LogUtils.log('找不到文本區域');
      return;
    }

    // 防護：檢查 batchIndex 有效性
    if (batchIndex < 0 || batchIndex >= this.translationQueue.length) {
      LogUtils.log(`無效的批次索引: ${batchIndex}，隊列長度: ${this.translationQueue.length}`);
      return;
    }

    const originalText = this.translationQueue[batchIndex];
    // 防護：檢查 originalText 是否存在
    if (!originalText) {
      LogUtils.log(`找不到批次 ${batchIndex} 的原始文本`);
      return;
    }

    // 防護：檢查 translatedText 是否存在
    if (!translatedText) {
      LogUtils.log(`批次 ${batchIndex} 的翻譯文本為空`);
      return;
    }

    let finalTranslatedText = batchIndex > 0 ? '\n\n' + translatedText : translatedText;

    if (settings && settings.removeHash) {
      finalTranslatedText = finalTranslatedText.replace(/##\s*|\s*##/g, '');
    }
    if (settings && settings.removeStar) {
      finalTranslatedText = finalTranslatedText.replace(/\*\*\s*|\s*\*\*/g, '');
    }

    // 保存初始翻譯結果
    this.service.translationResults.initial.set(batchIndex, {
      original: originalText,
      translated: finalTranslatedText
    });
    
    // 增加完成步驟計數
    this.completedStepsCount++;
    
    LogUtils.important(`📄 批次 ${batchIndex + 1}/${this.totalBatches} 翻譯更新完成`);
    LogUtils.log('原始文本：\n' + (originalText.length > 500 ? originalText.substring(0, 500) + '...' : originalText));
    LogUtils.log('翻譯結果：\n' + (finalTranslatedText.length > 500 ? finalTranslatedText.substring(0, 500) + '...' : finalTranslatedText));
    LogUtils.log(`原始長度：${originalText.length}，翻譯後長度：${finalTranslatedText.length}`);

    // 最終檢查：確保還沒有被取消
    if (this.controller.isCancelled()) {
      LogUtils.log('翻譯在更新過程中被取消，停止 DOM 更新');
      return;
    }

    const beforeReplace = textArea.value;
    textArea.value = textArea.value.replace(originalText, finalTranslatedText);
    if (textArea.value === beforeReplace) {
      LogUtils.warn(`⚠️ 批次 ${batchIndex + 1} 替換失敗！原始文本在 textarea 中找不到`);
      const idx = beforeReplace.indexOf(originalText.substring(0, 50));
      if (idx !== -1) {
        const taSlice = beforeReplace.substring(idx, idx + originalText.length);
        let diffPos = -1;
        for (let i = 0; i < Math.min(originalText.length, taSlice.length); i++) {
          if (originalText[i] !== taSlice[i]) { diffPos = i; break; }
        }
        if (diffPos !== -1) {
          const ctxStart = Math.max(0, diffPos - 20);
          const ctxEnd = diffPos + 60;
          LogUtils.warn(`第一個差異位置: ${diffPos}`);
          LogUtils.warn(`originalText[${ctxStart}-${ctxEnd}]: "${originalText.substring(ctxStart, ctxEnd)}"`);
          LogUtils.warn(`textarea   [${ctxStart}-${ctxEnd}]: "${taSlice.substring(ctxStart, ctxEnd)}"`);
        } else if (taSlice.length !== originalText.length) {
          LogUtils.warn(`長度不同: original=${originalText.length}, textarea段=${taSlice.length}`);
        }
      }
    }
    textArea.dispatchEvent(new Event('input', { bubbles: true }));
  }

  /**
   * 檢查是否需要處理完成邏輯
   */
  async checkAndHandleCompletion() {
    // 檢查是否所有批次都已處理完成（包括失敗的）
    if (this.isAllBatchesProcessed()) {
      clearTimeout(this.timeoutId);
      
      // 如果有失敗的批次且尚未進行過批次重試，觸發一輪重試
      if (this.failedTranslations.size > 0 && this.finalRetryAttempts === 0) {
        LogUtils.important(`🔄 檢測到 ${this.failedTranslations.size} 個失敗批次，等待 ${TranslateConfig.API.RETRY_WAIT / 1000} 秒後重試`);
        await Notification.showNotification(`
          檢測到 ${this.failedTranslations.size} 個失敗批次<br>
          等待 ${TranslateConfig.API.RETRY_WAIT / 1000} 秒後重試...
        `, true);

        setTimeout(() => {
          this.retryFailedBatches();
        }, TranslateConfig.API.RETRY_WAIT);
      } else if (this.isAllBatchesCompleted()) {
        if (this.isSingleStepMode) {
          // 單步模式：跳過反思和優化，直接完成
          LogUtils.important('✅ 單步模式：跳過反思和優化，直接完成');
          this.controller.setState('completed');
          setTimeout(() => {
            if (this.controller.state === 'completed') {
              this.resetTranslation();
            }
          }, 100);
          await Notification.showNotification(TranslateConfig.STAGES.COMPLETED, false);
        } else {
          // 多步驟模式：開始反思和優化
          LogUtils.important('✅ 所有翻譯批次已完成，開始分區塊反思和優化流程');
          try {
            await this.processAllBlocks();
            await Notification.showNotification(TranslateConfig.STAGES.COMPLETED, false);
          } catch (error) {
            LogUtils.error('反思優化處理失敗:', error);
            this.resetTranslation();
            await Notification.showNotification('反思優化處理失敗: ' + error.message, false);
          }
        }
      } else {
        // 有些批次最終失敗了，結束流程
        LogUtils.warn(`⚠️ 翻譯完成，但有 ${this.failedTranslations.size} 個批次失敗`);
        this.resetTranslation();
        await Notification.showNotification(`
          翻譯完成，但有 ${this.failedTranslations.size} 個批次失敗<br>
          已達最大重試次數 (${this.maxFinalRetries})
        `, false);
      }
    } else if (!this.isAllBatchesCompleted()) {
      // 如果還有未完成的批次，更新進度通知
      const settings = await GlobalSettings.loadSettings();
      const model = settings.translateModel || GlobalSettings.getDefaultModel();
      const apiType = GlobalSettings.getModelApiType(model);
      const apiKeyName = GlobalSettings.getApiKeyNameForModel(model);
      const apiKey = settings.apiKeys[apiKeyName];
      
      await Notification.showNotification(`
        模型: ${GlobalSettings.getModelDisplayName(model)}<br>
        API KEY: ${apiKey.substring(0, 5)}...<br>
        ${TranslateConfig.STAGES.INITIAL}<br>
        批次進度: ${this.completedTranslations.size}/${this.totalBatches}<br>
        失敗: ${this.failedTranslations.size}<br>
        發送間隔: ${this.batchInterval/1000}秒
      `, true);
    }
  }

  /**
   * 處理所有區塊的反思和優化
   * @returns {Promise<string>} 最終文本
   */
  async processAllBlocks() {
    // 使用 Map 來存儲結果，保留區塊編號
    const resultsMap = new Map();
    
    for (let i = 0; i < this.translationQueue.length; i++) {
      // 在每個循環開始時檢查取消狀態
      this.controller.checkCancellation();

      const originalBlock = this.translationQueue[i];
      const translatedBlock = this.service.getTranslatedTextForBlock(i);

      try {
        // 設置反思階段狀態
        this.controller.setState('reflecting', `批次 ${i + 1}/${this.totalBatches}`);
        
        // 顯示反思階段的通知
        const settings = await GlobalSettings.loadSettings();
        const model = settings.reflectModel || GlobalSettings.getDefaultModel();
        const apiKeyName = GlobalSettings.getApiKeyNameForModel(model);
        const apiKey = settings.apiKeys[apiKeyName];
        
        await Notification.showNotification(`
          模型: ${GlobalSettings.getModelDisplayName(model)}<br>
          API KEY: ${apiKey.substring(0, 5)}...<br>
          ${TranslateConfig.STAGES.REFLECT}<br>
          批次進度: ${i + 1}/${this.totalBatches}
        `, true);

        // 反思階段...
        const reflectionResult = await this.service.processReflection(translatedBlock, originalBlock, i, this.controller);
        
        // 根據總區塊數決定等待時間
        const waitTime = TranslateConfigUtils.getWaitTime(this.translationQueue.length);
        await new Promise(resolve => setTimeout(resolve, waitTime));

        // 在優化階段前再次檢查取消狀態
        this.controller.checkCancellation();

        // 設置優化階段狀態
        this.controller.setState('optimizing', `批次 ${i + 1}/${this.totalBatches}`);
        
        // 顯示優化階段的通知
        const optimizeModel = settings.optimizeModel || GlobalSettings.getDefaultModel();
        const optimizeApiKeyName = GlobalSettings.getApiKeyNameForModel(optimizeModel);
        const optimizeApiKey = settings.apiKeys[optimizeApiKeyName];
        
        await Notification.showNotification(`
          模型: ${GlobalSettings.getModelDisplayName(optimizeModel)}<br>
          API KEY: ${optimizeApiKey.substring(0, 5)}...<br>
          ${TranslateConfig.STAGES.OPTIMIZE}<br>
          批次進度: ${i + 1}/${this.totalBatches}
        `, true);

        // 優化階段...
        const optimizedResult = await this.service.processOptimization(translatedBlock, originalBlock, reflectionResult, i, this.translationQueue, this.controller);
        
        // 增加完成步驟計數
        this.completedStepsCount++;
        
        // 使用 Map 存儲結果，key 為原始索引
        resultsMap.set(i, optimizedResult);

        if (i < this.translationQueue.length - 1) {
          await new Promise(resolve => setTimeout(resolve, waitTime));
        }
      } catch (error) {
        if (error.message === '翻譯請求已取消') {
          LogUtils.log('反思優化流程已取消');
          return;
        }
        LogUtils.error(`區塊 ${i} 處理失敗:`, error);
        // 使用初始翻譯作為備選
        const fallbackText = this.service.getTranslatedTextForBlock(i);
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
        const initialResult = this.service.translationResults.initial.get(i);
        blockText = initialResult?.translated || this.translationQueue[i]; // 最後備選：原文
      }
      
      finalTexts.push(blockText);
    }

    // 按照原始順序組合結果
    const finalText = finalTexts.map(t => t.trim()).join('\n\n');
      
    // 最後檢查取消狀態，防止更新已取消的翻譯
    this.controller.checkCancellation();

    // 使用統一入口更新最終文本
    this.controller.setState('completed');
    this.updateFinalText(finalText);
    
    // 延遲重置，確保文本更新完成
    setTimeout(() => {
      // 只有在仍然是完成狀態時才重置（防止被取消操作覆蓋）
      if (this.controller.state === 'completed') {
        this.resetTranslation();
      }
    }, 100);
    
    return finalText;
  }

  /**
   * 重試失敗的批次
   */
  async retryFailedBatches() {
    if (this.controller.isCancelled()) {
      LogUtils.log('翻譯已取消，停止重試');
      return;
    }

    this.finalRetryAttempts++;
    const failedIndexes = Array.from(this.failedTranslations);
    LogUtils.important(`🔄 開始重試失敗的批次: [${failedIndexes.join(', ')}]`);

    // 清空失敗列表，讓每個批次重新跑 A→B→C
    this.failedTranslations.clear();

    // 按照與主流程相同的 batchInterval 間隔逐一送出失敗批次
    // 每個批次送出後不等它回應，各自非同步走 A→B→C
    const dispatchRetryBatch = (batchIndex) => {
      if (this.controller.isCancelled()) return;

      const originalText = this.translationQueue[batchIndex];
      this.pendingBatches.add(batchIndex);
      LogUtils.log(`重試批次 ${batchIndex + 1}/${this.totalBatches}`);

      this.service.translateBatch(originalText, batchIndex, this.controller)
        .then(async (translatedText) => {
          const settings = await GlobalSettings.loadSettings();
          this.updateTranslatedText(batchIndex, translatedText, settings);
          this.completedTranslations.add(batchIndex);
          this.pendingBatches.delete(batchIndex);
          LogUtils.important(`✅ 批次 ${batchIndex + 1} 重試成功`);
          await this.checkAndHandleCompletion();
        })
        .catch((error) => {
          if (error.message !== '翻譯請求已取消') {
            LogUtils.error(`批次 ${batchIndex + 1} 重試失敗:`, error);
            this.failedTranslations.add(batchIndex);
          }
          this.pendingBatches.delete(batchIndex);
          this.checkAndHandleCompletion();
        });
    };

    // 按 batchInterval 間隔逐一送出
    for (let i = 0; i < failedIndexes.length; i++) {
      if (i === 0) {
        dispatchRetryBatch(failedIndexes[i]);
      } else {
        await new Promise(resolve => setTimeout(resolve, this.batchInterval));
        if (this.controller.isCancelled()) break;
        dispatchRetryBatch(failedIndexes[i]);
      }
    }

    // 最後一個批次送出後，啟動全局死線（再等90秒）
    if (!this.controller.isCancelled()) {
      this.globalDeadlineId = null;
      this.startGlobalDeadline();
    }
  }

  /**
   * 更新最終文本
   * @param {string} finalText - 最終文本
   */
  updateFinalText(finalText) {
    // 檢查取消狀態，防止已取消的翻譯覆蓋用戶數據
    if (this.controller.isCancelled()) {
      LogUtils.log('翻譯已取消，停止文本更新');
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
  }

  /**
   * 取消翻譯
   */
  async cancelTranslation() {
    LogUtils.important('🛑 開始取消翻譯流程');
    LogUtils.log('當前狀態:', {
      isTranslating: this.controller.isActive(),
      state: this.controller.state,
      completedTranslations: this.completedTranslations.size
    });

    // 使用控制器的統一取消機制
    this.controller.cancel();

    // 清除計時器
    if (this.timeoutId) {
      LogUtils.log('清除計時器');
      clearTimeout(this.timeoutId);
      this.timeoutId = null;
    }

    if (this.globalDeadlineId) {
      LogUtils.log('清除全局死線計時器');
      clearTimeout(this.globalDeadlineId);
      this.globalDeadlineId = null;
    }
    this.pendingBatches.clear();

    // 等待所有活動請求完成
    LogUtils.log('等待活動請求完成...');
    const waitForRequests = async () => {
      let attempts = 0;
      while (this.service.activeRequests.size > 0 && attempts < 50) { // 最多等待5秒
        await new Promise(resolve => setTimeout(resolve, 100));
        attempts++;
        LogUtils.log(`等待中... 剩餘請求: ${this.service.activeRequests.size}`);
      }
      
      // 額外等待一點時間，確保請求處理完成
      await new Promise(resolve => setTimeout(resolve, 200));
      
      // 只有在仍然是取消狀態時才重置
      if (this.controller.isCancelled()) {
        LogUtils.log('開始智能重置翻譯狀態');
        this.resetTranslation();
      }
    };

    // 異步等待，不阻塞UI
    waitForRequests();

    await Notification.showNotification(TranslateConfig.STAGES.CANCELLED, false);
    LogUtils.important('✅ 翻譯取消流程完成');
  }

  /**
   * 重置翻譯狀態
   */
  resetTranslation() {
    LogUtils.important('🔄 開始重置翻譯狀態');
    
    // 重置控制器
    this.controller.reset();
    
    // 清理服務狀態
    this.service.cleanup();
    
    // 重置其他狀態
    this.currentBatchIndex = 0;
    this.translationQueue = [];
    this.completedTranslations.clear();
    this.failedTranslations.clear();
    this.pendingBatches.clear();
    this.finalRetryAttempts = 0;
    this.completedStepsCount = 0;
    this.batchInterval = 5000;
    this.selectionStart = null;
    this.selectionEnd = null;
    this.isSingleStepMode = false;

    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
      this.timeoutId = null;
    }

    if (this.globalDeadlineId) {
      clearTimeout(this.globalDeadlineId);
      this.globalDeadlineId = null;
    }

    LogUtils.important('✅ 重置完成');
  }

  /**
   * 設置 checkbox 元素並載入狀態
   * @param {HTMLElement} removeHashCheckbox - 移除井號checkbox
   * @param {HTMLElement} removeStarCheckbox - 移除星號checkbox
   */
  setCheckboxes(removeHashCheckbox, removeStarCheckbox) {
    LogUtils.log('設置 checkboxes...');
    LogUtils.log('removeHashCheckbox:', removeHashCheckbox ? '已提供' : '未提供');
    LogUtils.log('removeStarCheckbox:', removeStarCheckbox ? '已提供' : '未提供');

    this.removeHashCheckbox = removeHashCheckbox;
    this.removeStarCheckbox = removeStarCheckbox;
  }

  /**
   * 檢查是否所有批次都已處理完成（包括失敗的）
   * @returns {boolean} 是否完成
   */
  isAllBatchesProcessed() {
    return (this.completedTranslations.size + this.failedTranslations.size) === this.totalBatches;
  }

  /**
   * 檢查是否所有批次都已成功完成
   * @returns {boolean} 是否成功完成
   */
  isAllBatchesCompleted() {
    return this.completedTranslations.size === this.totalBatches;
  }

  /**
   * 獲取當前翻譯後的文本
   * @returns {string} 翻譯後的文本
   */
  getTranslatedText() {
    const textArea = document.querySelector('textarea[name="content"]');
    if (!textArea) return '';
    
    // 如果有選取範圍，只返回選取的部分
    if (this.selectionStart !== null && this.selectionEnd !== null) {
      return textArea.value.substring(this.selectionStart, this.selectionEnd);
    }
    return textArea.value;
  }

  // 向後兼容的屬性
  get isTranslating() {
    return this.controller.isActive();
  }

  get shouldCancel() {
    return this.controller.isCancelled();
  }

  set shouldCancel(value) {
    if (value) {
      this.controller.cancel();
    }
  }

  get activeRequests() {
    return this.service.activeRequests;
  }

  get translationResults() {
    return this.service.translationResults;
  }
}

// 創建全局實例，保持向後兼容
window.TranslateManager = new TranslateAdapter();

LogUtils.important('📚 翻譯適配器模組已載入'); 