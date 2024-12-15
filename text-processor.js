/* global GlobalSettings, Notification, UndoManager */
/**
 * 文本處理模組，負責處理文字改寫的邏輯。
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
   * 準備 API 請求配置
   * @param {string} model - 使用的模型名稱
   * @param {string} text - 主要文本內容
   * @param {string} instruction - 指令內容
   * @param {Object} context - 上下文內容，格式為 { role: string, content: string }[]
   */
  _prepareApiConfig(model, text, instruction, context = []) {
    const isGemini = model.startsWith('gemini');
    const endpoint = isGemini 
      ? window.GlobalSettings.API.endpoints.gemini.replace(':model', model)
      : window.GlobalSettings.API.endpoints.openai;

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
          parts: [{ text: `${instruction}\n\n${text}` }]  // 將指令和文本合併
        },
        ...systemMessages,
        ...userMessages
      ],
      safetySettings: window.GlobalSettings.API.safetySettings
    } : {
      model,
      messages: [
        { role: "system", content: instruction },
        ...systemMessages,
        ...userMessages,
        { role: "user", content: text }
      ]
    };

    console.log('API 請求配置:', {
      endpoint,
      requestBody: {
        model,
        systemMessage: instruction,
        systemContext: systemMessages,
        userContext: userMessages,
        userMessage: text
      }
    });

    return { endpoint, body };
  },

  /**
   * 發送 API 請求
   */
  async _sendRequest(endpoint, body, apiKey, isGemini, isTranslation = false) {
    console.log('準備發送 API 請求');
    // 限制日誌輸出的文本長度為500字
    console.log('請求體:', JSON.stringify(body).substring(0, 1500) + (JSON.stringify(body).length > 1500 ? '...' : '')); 

    const controller = new AbortController();
    const signal = controller.signal;

    // 只在翻譯模式下檢查 shouldCancel
    if (isTranslation && window.TranslateManager?.shouldCancel) {
      controller.abort();
      console.log('翻譯請求已取消');
      throw new Error('翻譯請求已取消');
    }

    // 發送API請求
    try {
      const response = await fetch(
        isGemini ? `${endpoint}?key=${apiKey}` : endpoint,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(!isGemini ? {'Authorization': `Bearer ${apiKey}`} : {})
          },
          body: JSON.stringify(body),
          signal: signal
        }
      );

      // 檢查API響應
      console.log('收到 API 響應');
      if (!response.ok) {
        const errorData = await response.json();
        console.error('API 錯誤響應:', errorData);
        throw new Error(`HTTP error! status: ${response.status}, message: ${JSON.stringify(errorData)}`);
      }

      // 只在翻譯模式下檢查是否已取消
      if (isTranslation && window.TranslateManager?.shouldCancel) {
        console.log('翻譯已取消，忽略 API 響應');
        throw new Error('翻譯請求已取消');
      }

      const data = await response.json();
      console.log('API Response:', data);

      // 最後一次檢查是否已取消
      if (isTranslation && window.TranslateManager?.shouldCancel) {
        console.log('翻譯已取消，忽略 API 響應');
        throw new Error('翻譯請求已取消');
      }

      // 處理 Gemini API 的安全限制回應
      if (isGemini && data.candidates && data.candidates[0].finishReason === "SAFETY") {
        throw new Error('內容被 Gemini API 的安全限制阻擋，請嘗試修改文本或使用其他模型');
      }

      // 檢查回應格式是否正確
      if (isGemini) {
        if (!data.candidates?.[0]?.content?.parts?.[0]?.text) {
          throw new Error('Gemini API 回應格式無效');
        }
        return data.candidates[0].content.parts[0].text;
      } else {
        if (!data.choices?.[0]?.message?.content) {
          throw new Error('OpenAI API 回應格式無效');
        }
        return data.choices[0].message.content;
      }

    } catch (error) {
      if (error.name === 'AbortError' || error.message === '翻譯請求已取消') {
        console.log('請求已被取消');
        throw new Error('翻譯請求已取消');
      }
      throw error;
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
  async rewriteText(textToRewrite, isAutoRewrite = false, context = []) {
    try {
      console.log('開始 rewriteText 函數');
      const settings = await window.GlobalSettings.loadSettings();
      console.log('載入的設置:', settings);

      const textArea = document.querySelector('textarea[name="content"]');
      if (!textArea) throw new Error('找不到文本區域');

      const originalTextToRewrite = this._getTextToRewrite(textArea, isAutoRewrite, textToRewrite);
      if (!originalTextToRewrite) {
        throw new Error('找不到要改寫的文字');
      }

      // 檢查改寫類型
      const isPartialRewrite = isAutoRewrite || (textArea.selectionStart !== textArea.selectionEnd);
      const useShortInstruction = isAutoRewrite || (isPartialRewrite && textArea.selectionEnd - textArea.selectionStart <= 15);

      console.log('改寫類型:', isPartialRewrite ? '部分改寫' : '全文改寫');
      console.log('使用短指令:', useShortInstruction);
      console.log('選中文本長度:', textArea.selectionEnd - textArea.selectionStart);

      // 檢查改寫指令
      const instruction = useShortInstruction ? settings.shortInstruction : settings.instruction;
      if (!instruction.trim()) throw new Error(useShortInstruction ? '短文本改寫指令不能為空' : '改寫指令不能為空');

      const model = isAutoRewrite ? settings.autoRewriteModel :
                   isPartialRewrite && useShortInstruction ? settings.shortRewriteModel :
                   settings.fullRewriteModel || settings.model;

      // 檢查API金鑰
      const isGemini = model.startsWith('gemini');
      const apiKey = settings.apiKeys[isGemini ? 'gemini-2.0-flash-exp' : 'openai'];
      if (!apiKey) throw new Error(`未找到 ${isGemini ? 'Gemini' : 'OpenAI'} 的 API 金鑰`);

      console.log('選擇的模型:', model);
      console.log('使用的 API 金鑰:', apiKey.substring(0, 5) + '...');

      // 顯示通知
      await window.Notification.showNotification(`
        模型: ${window.GlobalSettings.API.models[model] || model}<br>
        API KEY: ${apiKey.substring(0, 5)}...<br>
        ${isPartialRewrite ? (useShortInstruction ? '正在改寫選中的短文本' : '正在改寫選中文本') : '正在改寫全文'}
      `, true);

      // 準備API請求
      const { endpoint, body } = this._prepareApiConfig(
        model, 
        originalTextToRewrite, 
        instruction,
        context
      );
      const rewrittenText = await this._sendRequest(endpoint, body, apiKey, isGemini, false);

      console.log('改寫前文本:', originalTextToRewrite);
      console.log('改寫後的文本:', rewrittenText);

      // 添加到歷史紀錄
      window.UndoManager.addToHistory(textArea.value, textArea);

      if (isAutoRewrite) {
        console.log('自動改寫完成');
        return rewrittenText.trim();
      }

      // 更新文本區域
      const index = textArea.value.indexOf(originalTextToRewrite);
      if (index === -1) {
        throw new Error('找不到原始文字');
      }

      const newText = textArea.value.substring(0, index) + rewrittenText.trim() + textArea.value.substring(index + originalTextToRewrite.length);

      console.log('更新前的文本區域值:', textArea.value);
      textArea.value = newText;
      console.log('更新後的文本區值:', textArea.value);
      textArea.dispatchEvent(new Event('input', { bubbles: true }));
      console.log('已觸發輸入事件');

      // 移除通知
      window.Notification.removeNotification();
      await window.Notification.showNotification('改寫已完成', false);
      console.log('改寫完成');

    } catch (error) {
      window.Notification.removeNotification();
      console.error('rewriteText 函數出錯:', error);
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
      const isGemini = model.startsWith('gemini');
      const apiKey = settings.apiKeys[isGemini ? 'gemini-2.0-flash-exp' : 'openai'];
      
      if (!apiKey) {
        throw new Error(`未找到 ${isGemini ? 'Gemini' : 'OpenAI'} 的 API 金鑰`);
      }

      // 顯示通知
      await window.Notification.showNotification(`
        模型: ${window.GlobalSettings.API.models[model] || model}<br>
        API KEY: ${apiKey.substring(0, 5)}...<br>
        正在生成關鍵要點總結
      `, true);

      // 準備 API 請求
      const { endpoint, body } = this._prepareApiConfig(
        model,
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
      console.error('generateSummary 函數出錯:', error);
      alert(`生成關鍵要點總結時發生錯誤: ${error.message}\n請檢查您的設置並重試。`);
      throw error;
    }
  }
};

window.TextProcessor = TextProcessor;
