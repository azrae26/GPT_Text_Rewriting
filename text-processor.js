/* global GlobalSettings, Notification, UndoManager */
/**
 * text-processor.js - 文本處理核心模組
 * 功能：處理所有文字改寫、翻譯、生成和摘要的核心邏輯
 * 職責：
 * - 文本改寫：支援全文改寫、短文本改寫、自動改寫等模式
 * - 特殊文本識別：識別股票代碼、日期等特殊格式文本
 * - API 請求管理：統一處理 Gemini 和 OpenAI API 請求
 * - 上下文處理：處理多輪對話和背景知識整合
 * - 指令模板處理：支援動態佔位符替換（如日期）
 * - 請求取消機制：支援翻譯和生成任務的中途取消
 * 
 * 依賴：
 * - GlobalSettings：全局設定和 API 配置
 * - Notification：通知系統
 * - UndoManager：復原功能管理
 * - TranslateManager, GenerationManager：任務管理器
 */
const TextProcessor = {
  /**
   * 在給定的文本中查找符合自動改寫模式的特殊文本。
   */
  findSpecialText(text) {
    const patterns = window.GlobalSettings.getAutoRewritePatterns();
    for (const pattern of patterns) {
      pattern.lastIndex = 0;  // 重置 lastIndex
      const match = pattern.exec(text);
      if (match) {
        return {
          matchedText: match[0],
          startIndex: match.index,
          endIndex: match.index + match[0].length
        };
      }
    }
    return null;
  },

  /**
   * 檢查給定的文本是否包含符合自動改寫模式的特殊文本。
   */
  isSpecialText(text) {
    return window.GlobalSettings.autoRewritePatterns.some(pattern => pattern.test(text));
  },

  /**
   * 從網頁獲取日期
   * @returns {string} 日期字串，如果找不到則返回空字串
   */
  _getDateFromPage() {
    try {
      // 找到日期輸入框
      const dateInput = document.querySelector('input[placeholder="YYYY/MM/DD"]');
      if (!dateInput || !dateInput.value) {
        return '';
      }

      // 將 YYYY/MM/DD 格式轉換為 YYYY年MM月DD日
      const [year, month, day] = dateInput.value.split('/');
      if (!year || !month || !day) {
        return dateInput.value;
      }
      
      return `${year}年${month}月${day}日`;
    } catch (error) {
      LogUtils.warn('獲取日期時發生錯誤:', error);
      return '';
    }
  },

  /**
   * 處理指令中的日期佔位符
   * @param {string} instruction - 原始指令
   * @returns {string} - 處理後的指令
   */
  _processInstructionWithDate(instruction) {
    if (!instruction || !instruction.includes('{date}')) {
      return instruction;
    }

    const date = this._getDateFromPage();
    return instruction.replace(/\{date\}/g, date || '未知日期');
  },

  /**
   * 準備 API 請求配置
   * @param {string} model - 使用的模型名稱
   * @param {Object|string} replaceParams - 替換參數或文本內容
   * @param {string} instruction - 指令內容
   * @param {Array} context - 上下文內容
   */
  _prepareApiConfig(model, replaceParams, instruction, context = []) {
    const processedInstruction = this._processInstructionWithDate(instruction);
    const isGemini = model.startsWith('gemini');
    const endpoint = isGemini 
      ? window.GlobalSettings.API.endpoints.gemini.replace(':model', model)
      : window.GlobalSettings.API.endpoints.openai;

    // 處理指令中的佔位符替換
    let finalPrompt = processedInstruction;
    if (typeof replaceParams === 'object') {
      for (const [key, value] of Object.entries(replaceParams)) {
        const placeholder = `{${key}}`;
        finalPrompt = finalPrompt.replace(new RegExp(placeholder, 'g'), value);
      }
    } else {
      // 向後兼容：如果 replaceParams 是字符串，則視為文本內容
      finalPrompt = `${processedInstruction}\n\n${replaceParams}`;
    }

    // 確保 context 是一個陣列
    const contextArray = Array.isArray(context) ? context : [];

    // 將上下文訊息分類
    const systemMessages = contextArray
      .filter(ctx => ctx && ctx.role === 'system')
      .map(ctx => ({
        role: isGemini ? "user" : "system",  // 對 Gemini API 使用 user role
        ...(isGemini 
          ? { parts: [{ text: ctx.content }] }
          : { content: ctx.content }
        )
      }));

    const userMessages = contextArray
      .filter(ctx => ctx && ctx.role !== 'system')
      .map(ctx => ({
        role: "user",  // 統一使用 user role
        ...(isGemini 
          ? { parts: [{ text: ctx.content }] }
          : { content: ctx.content }
        )
      }));

    // 組織請求內容
    const body = isGemini ? {
      contents: [
        {
          role: "user",
          parts: [{ text: finalPrompt }]
        },
        ...systemMessages,
        ...userMessages
      ],
      safetySettings: window.GlobalSettings.API.safetySettings
    } : {
      model,
      messages: [
        { role: "system", content: finalPrompt },
        ...systemMessages,
        ...userMessages
      ]
    };

    LogUtils.log('API 請求配置:', {
      endpoint,
      requestBody: {
        model,
        finalPrompt,
        systemContext: systemMessages,
        userContext: userMessages
      }
    });

    return { endpoint, body };
  },

  /**
   * 發送 API 請求（通過 Background Script 避免 CORS）
   * @param {string} endpoint - API 端點
   * @param {Object} body - 請求體
   * @param {string} apiKey - API 金鑰
   * @param {boolean} isGemini - 是否為 Gemini API
   * @param {boolean} isTranslation - 是否為翻譯請求
   * @param {string} requestType - 請求類型：'translate' | 'reflect' | 'optimize' | 'generate' | 'reflect1' | 'generationOptimize_1'
   */
  async _sendRequest(endpoint, body, apiKey, isGemini, isTranslation = false, requestType = 'translate') {
    LogUtils.log('開始處理請求');
    
    // 根據請求類型輸出不同格式的日誌
    if (requestType === 'reflect' || requestType === 'reflect1') {
      LogUtils.log('反思階段請求體:', JSON.stringify(body, null, 2));
    } else if (requestType === 'optimize' || requestType === 'generationOptimize_1') {
      LogUtils.log('優化階段請求體:', JSON.stringify(body, null, 2));
    } else if (requestType === 'generate') {
      LogUtils.log('生成階段請求體:', JSON.stringify(body, null, 2));
    } else {
      LogUtils.log('請求體:', JSON.stringify(body).substring(0, 2500) + (JSON.stringify(body).length > 2500 ? '...' : '')); 
    }

    const controller = new AbortController();

    // 註冊到活動請求集合
    if ((isTranslation && window.TranslateManager?.activeRequests) || 
        (requestType === 'generate' && window.GenerationManager?.activeRequests)) {
      LogUtils.log('將請求添加到活動請求集合');
      const manager = isTranslation ? window.TranslateManager : window.GenerationManager;
      manager.activeRequests.add(controller);
      LogUtils.log('當前活動請求數:', manager.activeRequests.size);

      // 監聽取消狀態
      const checkCancel = () => {
        if (manager?.shouldCancel) {
          LogUtils.log('檢測到取消狀態，中止請求');
          controller.abort();
          return true;
        }
        return false;
      };

      // 如果已經是取消狀態，直接中止
      if (checkCancel()) {
        throw new Error(isTranslation ? '翻譯請求已取消' : '生成請求已取消');
      }

      // 設置定期檢查
      const intervalId = setInterval(checkCancel, 100);
    }

    try {
      LogUtils.log('🌐 透過 Background Script 發送 API 請求');
      
      // 🆕 通過 Background Script 發送請求（避免 CORS）
      const response = await chrome.runtime.sendMessage({
        action: 'apiRequest',
        endpoint,
        body,
        apiKey,
        isGemini
      });

      // 檢查 Background Script 的響應
      if (!response) {
        throw new Error('Background Script 無響應');
      }

      if (!response.success) {
        LogUtils.error('API 錯誤響應:', response.errorData || response.error);
        throw new Error(response.error || 'API 請求失敗');
      }

      const data = response.data;
      LogUtils.log('成功解析 API 響應:', data);

      // 處理 Gemini API 的安全限制回應
      if (isGemini && data.candidates && data.candidates[0].finishReason === "SAFETY") {
        LogUtils.log('檢測到 Gemini API 安全限制');
        throw new Error('內容被 Gemini API 的安全限制阻擋，請嘗試修改文本或使用其他模型');
      }

      // 檢查回應格式是否正確
      let result;
      if (isGemini) {
        if (!data.candidates?.[0]?.content?.parts?.[0]?.text) {
          LogUtils.error('Gemini API 回應格式無效');
          throw new Error('Gemini API 回應格式無效');
        }
        result = data.candidates[0].content.parts[0].text;
      } else {
        if (!data.choices?.[0]?.message?.content) {
          LogUtils.error('OpenAI API 回應格式無效');
          throw new Error('OpenAI API 回應格式無效');
        }
        result = data.choices[0].message.content;
      }

      LogUtils.log('請求成功完成');
      return result;

    } catch (error) {
      if (error.name === 'AbortError' || error.message === '翻譯請求已取消' || error.message === '生成請求已取消') {
        LogUtils.log('請求已被取消');
        throw new Error(isTranslation ? '翻譯請求已取消' : '生成請求已取消');
      }
      LogUtils.error('請求失敗:', error);
      throw error;
    } finally {
      // 清除定期檢查
      if (typeof intervalId !== 'undefined') {
        clearInterval(intervalId);
      }
      
      // 從活動請求集合中移除
      if ((isTranslation && window.TranslateManager?.activeRequests) || 
          (requestType === 'generate' && window.GenerationManager?.activeRequests)) {
        const manager = isTranslation ? window.TranslateManager : window.GenerationManager;
        LogUtils.log('從活動請求集合中移除請求');
        manager.activeRequests.delete(controller);
        LogUtils.log('剩餘活動請求數:', manager.activeRequests.size);
      }
    }
  },

  /**
   * 獲取要改寫的文本內容
   */
  _getTextToRewrite(textArea, isAutoRewrite, textToRewrite) {
    if (textToRewrite) return textToRewrite;
    
    // 檢查改寫類型
    const isPartialRewrite = isAutoRewrite || (textArea.selectionStart !== textArea.selectionEnd); // 檢查是否為部分改寫
    if (!isPartialRewrite) return textArea.value; // 如果非部分改寫，返回全文

    if (!isAutoRewrite) {
      return textArea.value.substring(textArea.selectionStart, textArea.selectionEnd); // 如果非自動改寫，返回選中的文本
    }

    // 檢查是否包含特殊文本
    const matchResult = this.findSpecialText(textArea.value);
    return matchResult ? matchResult.matchedText : null;
  },

  /**
   * 執行文字改寫 (修改後的版本)
   */
  /**
   * 重述文字（使用重述指令和模型）
   * @param {string} textToRephrase - 要重述的文字（可選，預設使用textArea內容）
   */
  async rephraseText(textToRephrase) {
    try {
      LogUtils.log('開始 rephraseText 函數');
      const settings = await window.GlobalSettings.loadSettings();
      LogUtils.log('載入的設置:', settings);

      const textArea = document.querySelector('textarea[name="content"]');
      if (!textArea) throw new Error('找不到文本區域');

      const originalTextToRephrase = textToRephrase || textArea.value;
      if (!originalTextToRephrase || !originalTextToRephrase.trim()) {
        throw new Error('找不到要重述的文字');
      }

      // 檢查重述指令
      if (!settings.rephraseInstruction || !settings.rephraseInstruction.trim()) {
        throw new Error('重述指令不能為空');
      }

      // 選擇模型
      const model = settings.rephraseModel || window.GlobalSettings.getDefaultModel();
      LogUtils.log('選擇的原始模型:', model);
      
      if (!model) {
        throw new Error('沒有可用的模型，請先添加自定義模型或選擇重述模型');
      }

      // 檢查API金鑰
      const isGemini = model.startsWith('gemini');
      const apiType = window.GlobalSettings.getModelApiType(model);
      LogUtils.log('API 類型:', apiType);
      
      const apiKeyName = window.GlobalSettings.getApiKeyNameForModel(model);
      LogUtils.log('API 金鑰名稱:', apiKeyName);
      
      if (!apiKeyName) {
        throw new Error(`無法為模型 ${model} 找到對應的 API 金鑰類型`);
      }
      
      const apiKey = settings.apiKeys[apiKeyName];
      LogUtils.log('找到的 API 金鑰:', apiKey ? `${apiKey.substring(0, 5)}...` : 'undefined');
      
      if (!apiKey || !apiKey.trim()) {
        throw new Error(`未找到 ${apiType === 'gemini' ? 'Gemini' : apiType === 'openai' ? 'OpenAI' : apiType} 的 API 金鑰，請先設置對應的 API 金鑰`);
      }

      LogUtils.log('使用的 API 金鑰:', apiKey.substring(0, 5) + '...');

      // 顯示通知
      await window.Notification.showNotification(`
        模型: ${window.GlobalSettings.getModelDisplayName(model)}<br>
        API KEY: ${apiKey.substring(0, 5)}...<br>
        正在重述文字
      `, true);

      // 準備API請求
      const { endpoint, body } = this._prepareApiConfig(
        model, 
        originalTextToRephrase, 
        settings.rephraseInstruction,
        []
      );
      const rephrasedText = await this._sendRequest(endpoint, body, apiKey, isGemini, false, 'rephrase');

      LogUtils.log('重述前文本:', originalTextToRephrase);
      LogUtils.log('重述後的文本:', rephrasedText);

      // 添加到歷史紀錄
      window.UndoManager.addToHistory(textArea.value, textArea);

      // 更新文本區域
      LogUtils.log('更新前的文本區域值:', textArea.value);
      textArea.value = rephrasedText.trim();
      LogUtils.log('更新後的文本區域值:', textArea.value);
      textArea.dispatchEvent(new Event('input', { bubbles: true }));
      LogUtils.log('已觸發輸入事件');

      // 更新通知
      await window.Notification.showNotification(`
        模型: ${window.GlobalSettings.getModelDisplayName(model)}<br>
        API KEY: ${apiKey.substring(0, 5)}...<br>
        重述完成
      `, false);

      return rephrasedText.trim();
    } catch (error) {
      LogUtils.error('rephraseText 函數出錯:', error);
      await window.Notification.showNotification(`重述錯誤: ${error.message}`, false);
      throw error;
    }
  },

  async rewriteText(textToRewrite, isAutoRewrite = false, context = []) {
    try {
      LogUtils.log('開始 rewriteText 函數');
      const settings = await window.GlobalSettings.loadSettings();
      LogUtils.log('載入的設置:', settings);

      const textArea = document.querySelector('textarea[name="content"]');
      if (!textArea) throw new Error('找不到文本區域');

      const originalTextToRewrite = this._getTextToRewrite(textArea, isAutoRewrite, textToRewrite);
      if (!originalTextToRewrite) {
        throw new Error('找不到要改寫的文字');
      }

      // 檢查改寫類型
      const isPartialRewrite = isAutoRewrite || (textArea.selectionStart !== textArea.selectionEnd);
      const useShortInstruction = isAutoRewrite || (isPartialRewrite && textArea.selectionEnd - textArea.selectionStart <= 15);

      LogUtils.log('改寫類型:', isPartialRewrite ? '部分改寫' : '全文改寫');
      LogUtils.log('使用短指令:', useShortInstruction);
      LogUtils.log('選中文本長度:', textArea.selectionEnd - textArea.selectionStart);

      // 檢查改寫指令
      const instruction = useShortInstruction ? settings.shortInstruction : settings.instruction;
      if (!instruction.trim()) throw new Error(useShortInstruction ? '短文本改寫指令不能為空' : '改寫指令不能為空');

      // 添加詳細的模型選擇調試日誌
      LogUtils.log('模型選擇調試:');
      LogUtils.log('- isAutoRewrite:', isAutoRewrite);
      LogUtils.log('- isPartialRewrite:', isPartialRewrite);
      LogUtils.log('- useShortInstruction:', useShortInstruction);
      LogUtils.log('- settings.autoRewriteModel:', settings.autoRewriteModel);
      LogUtils.log('- settings.shortRewriteModel:', settings.shortRewriteModel);
      LogUtils.log('- settings.fullRewriteModel:', settings.fullRewriteModel);
      LogUtils.log('- settings.model:', settings.model);

      const model = isAutoRewrite ? settings.autoRewriteModel :
                   isPartialRewrite && useShortInstruction ? settings.shortRewriteModel :
                   settings.fullRewriteModel || settings.model;
      
      LogUtils.log('- 選擇的原始模型:', model);

      // 如果沒有選擇模型，使用預設模型
      const finalModel = model || window.GlobalSettings.getDefaultModel();
      LogUtils.log('- 最終模型:', finalModel);
      
      if (!finalModel) {
        throw new Error('沒有可用的模型，請先添加自定義模型');
      }

      // 檢查API金鑰
      const isGemini = finalModel.startsWith('gemini');
      const apiType = window.GlobalSettings.getModelApiType(finalModel);
      LogUtils.log('API 類型:', apiType);
      
      // 統一使用 getApiKeyNameForModel 方法獲取金鑰名稱
      const apiKeyName = window.GlobalSettings.getApiKeyNameForModel(finalModel);
      LogUtils.log('API 金鑰名稱:', apiKeyName);
      
      if (!apiKeyName) {
        throw new Error(`無法為模型 ${finalModel} 找到對應的 API 金鑰類型`);
      }
      
      const apiKey = settings.apiKeys[apiKeyName];
      LogUtils.log('找到的 API 金鑰:', apiKey ? `${apiKey.substring(0, 5)}...` : 'undefined');
      
      if (!apiKey || !apiKey.trim()) {
        throw new Error(`未找到 ${apiType === 'gemini' ? 'Gemini' : apiType === 'openai' ? 'OpenAI' : apiType} 的 API 金鑰，請先設置對應的 API 金鑰`);
      }

      LogUtils.log('選擇的模型:', finalModel);
      LogUtils.log('使用的 API 金鑰:', apiKey.substring(0, 5) + '...');

      // 顯示通知
      await window.Notification.showNotification(`
        模型: ${window.GlobalSettings.getModelDisplayName(finalModel)}<br>
        API KEY: ${apiKey.substring(0, 5)}...<br>
        ${isPartialRewrite ? (useShortInstruction ? '正在改寫選中的短文本' : '正在改寫選中文本') : '正在改寫全文'}
      `, true);

      // 準備API請求
      const { endpoint, body } = this._prepareApiConfig(
        finalModel, 
        originalTextToRewrite, 
        instruction,
        context
      );
      const rewrittenText = await this._sendRequest(endpoint, body, apiKey, isGemini, false);

      LogUtils.log('改寫前文本:', originalTextToRewrite);
      LogUtils.log('改寫後的文本:', rewrittenText);

      // 添加到歷史紀錄
      window.UndoManager.addToHistory(textArea.value, textArea);

      if (isAutoRewrite) {
        LogUtils.log('自動改寫完成');
        return rewrittenText.trim();
      }

      // 更新文本區域
      const index = textArea.value.indexOf(originalTextToRewrite);
      if (index === -1) {
        throw new Error('找不到原始文字');
      }

      const newText = textArea.value.substring(0, index) + rewrittenText.trim() + textArea.value.substring(index + originalTextToRewrite.length);

      LogUtils.log('更新前的文本區域值:', textArea.value);
      textArea.value = newText;
      LogUtils.log('更新後的文本區值:', textArea.value);
      textArea.dispatchEvent(new Event('input', { bubbles: true }));
      LogUtils.log('已觸發輸入事件');

      // 移除通知
      window.Notification.removeNotification();
      await window.Notification.showNotification('改寫已完成', false);
      LogUtils.log('改寫完成');

    } catch (error) {
      window.Notification.removeNotification();
      LogUtils.error('rewriteText 函數出錯:', error);
      alert(`改寫過程中發生錯誤: ${error.message}\n請檢查您的設置並重試。`);
      window.Notification.showNotification(`改寫過程中發生錯誤: ${error.message}`, false);
    }
  },

  /**
   * 執行關鍵要點總結
   */
  async generateSummary(text, context = []) {
    try {
      const settings = await window.GlobalSettings.loadSettings();
      
      // 檢查 API 金鑰
      const model = settings.summaryModel;
      
      // 如果沒有選擇模型，使用預設模型
      const finalModel = model || window.GlobalSettings.getDefaultModel();
      if (!finalModel) {
        throw new Error('沒有可用的模型，請先添加自定義模型');
      }
      
      const isGemini = finalModel.startsWith('gemini');
      const apiType = window.GlobalSettings.getModelApiType(finalModel);
      LogUtils.log('API 類型:', apiType);
      
      // 統一使用 getApiKeyNameForModel 方法獲取金鑰名稱
      const apiKeyName = window.GlobalSettings.getApiKeyNameForModel(finalModel);
      LogUtils.log('API 金鑰名稱:', apiKeyName);
      
      if (!apiKeyName) {
        throw new Error(`無法為模型 ${finalModel} 找到對應的 API 金鑰類型`);
      }
      
      const apiKey = settings.apiKeys[apiKeyName];
      LogUtils.log('找到的 API 金鑰:', apiKey ? `${apiKey.substring(0, 5)}...` : 'undefined');
      
      if (!apiKey || !apiKey.trim()) {
        throw new Error(`未找到 ${apiType === 'gemini' ? 'Gemini' : 'OpenAI'} 的 API 金鑰，請先設置對應的 API 金鑰`);
      }

      // 顯示通知
      await window.Notification.showNotification(`
        模型: ${window.GlobalSettings.getModelDisplayName(finalModel)}<br>
        API KEY: ${apiKey.substring(0, 5)}...<br>
        正在生成關鍵要點總結
      `, true);

      // 準備 API 請求
      const { endpoint, body } = this._prepareApiConfig(
        finalModel,
        text,
        settings.summaryInstruction,
        context
      );

      // 發送請求並獲取回應
      const summary = await this._sendRequest(endpoint, body, apiKey, isGemini);

      // 移除通知
      window.Notification.removeNotification();
      await window.Notification.showNotification('關鍵要點總結已完成', false);

      return summary.trim();

    } catch (error) {
      window.Notification.removeNotification();
      LogUtils.error('generateSummary 函數出錯:', error);
      alert(`生成關鍵要點總結時發生錯誤: ${error.message}\n請檢查您的設置並重試。`);
      throw error;
    }
  }
};

window.TextProcessor = TextProcessor;
