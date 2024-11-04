/* global GlobalSettings, Notification, UndoManager */
/**
 * 文本處理模組，負責處理文字改寫的邏輯。
 */
const TextProcessor = {
  API_ENDPOINTS: {
    gemini: 'https://generativelanguage.googleapis.com/v1beta/models/:model:generateContent',
    openai: 'https://api.openai.com/v1/chat/completions'
  },

  MODEL_NAMES: {
    'gpt-4': 'GPT-4',
    'gpt-4o-mini': 'GPT-4o mini',
    'gemini-1.5-flash': 'Gemini 1.5 Flash'
  },

  // Gemini API 安全設置級別
  SAFETY_SETTINGS: [
    {
      category: "HARM_CATEGORY_HARASSMENT",
      threshold: "BLOCK_NONE"
    },
    {
      category: "HARM_CATEGORY_HATE_SPEECH",
      threshold: "BLOCK_NONE"
    },
    {
      category: "HARM_CATEGORY_SEXUALLY_EXPLICIT",
      threshold: "BLOCK_NONE"
    },
    {
      category: "HARM_CATEGORY_DANGEROUS_CONTENT",
      threshold: "BLOCK_NONE"
    }
  ],

  /**
   * 在給定的文本中查找符合自動改寫模式的特殊文本。
   */
  findSpecialText(text) {
    console.log('正在查找特殊文本，檢查的文本:', text);
    for (let pattern of window.GlobalSettings.autoRewritePatterns) {
      pattern.lastIndex = 0;
      let match = pattern.exec(text);
      if (match) {
        console.log('找到匹配:', pattern, match[0]);
        return {
          matchedText: match[0],
          startIndex: match.index,
          endIndex: match.index + match[0].length
        };
      }
    }
    console.log('未找到匹配');
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
   */
  _prepareApiConfig(model, text, instruction) {
    const isGemini = model.startsWith('gemini');
    const endpoint = isGemini 
      ? this.API_ENDPOINTS.gemini.replace(':model', model)
      : this.API_ENDPOINTS.openai;

    const body = isGemini ? {
      contents: [{
        parts: [{
          text: `要替換的文本：${text}。\n\n\n替換指令：${instruction}`
        }]
      }],
      // 添加安全設置，降低內容過濾的嚴格程度
      safetySettings: this.SAFETY_SETTINGS
    } : {
      model,
      messages: [
        {role: "system", content: "你是一個專業的文字改寫助手。"},
        {role: "user", content: `要替換的文本：${text}。\n\n\n指令：${instruction}`}
      ]
    };

    return { endpoint, body };
  },

  /**
   * 發送 API 請求
   */
  async _sendRequest(endpoint, body, apiKey, isGemini) {
    console.log('準備發送 API 請求', 'shouldCancel:', window.TranslateManager.shouldCancel);
    console.log('請求體:', JSON.stringify(body, null, 2));

    const controller = new AbortController();
    const signal = controller.signal;

    // 在 TranslateManager.shouldCancel 為 true 時取消請求
    if (window.TranslateManager.shouldCancel) {
      controller.abort();
      console.log('翻譯請求已取消');
      throw new Error('翻譯請求已取消');
    }

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

      console.log('收到 API 響應');
      if (!response.ok) {
        const errorData = await response.json();
        console.error('API 錯誤響應:', errorData);
        throw new Error(`HTTP error! status: ${response.status}, message: ${JSON.stringify(errorData)}`);
      }

      // 再次檢查是否已取消
      if (window.TranslateManager.shouldCancel) {
        console.log('翻譯已取消，忽略 API 響應');
        throw new Error('翻譯請求已取消');
      }

      const data = await response.json();
      console.log('API Response:', data);

      // 最後一次檢查是否已取消
      if (window.TranslateManager.shouldCancel) {
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
    
    const isPartialRewrite = isAutoRewrite || (textArea.selectionStart !== textArea.selectionEnd);
    if (!isPartialRewrite) return textArea.value;

    if (!isAutoRewrite) {
      return textArea.value.substring(textArea.selectionStart, textArea.selectionEnd);
    }

    const start = Math.max(0, textArea.selectionStart - 3);
    const end = Math.min(textArea.value.length, textArea.selectionEnd + 3);
    const extendedText = textArea.value.substring(start, end);
    const matchResult = this.findSpecialText(extendedText);
    return matchResult ? matchResult.matchedText : null;
  },

  /**
   * 確認改寫操作
   */
  async _confirmRewrite(model, text, instruction) {
    if (window.GlobalSettings.confirmModel) {
      console.log('確認模型:', model);
      if (!confirm(`您確定要使用 ${this.MODEL_NAMES[model] || model} 模型進行改寫嗎？`)) {
        console.log('用戶取消了模型確認');
        return false;
      }
    }

    if (window.GlobalSettings.confirmContent) {
      const preview = text.length > 100 ? text.substring(0, 100) + '...' : text;
      if (!confirm(`您確定要改寫以下內容嗎？\n\n文本${preview}\n\n指令：${instruction}`)) {
        console.log('用戶取消了內容確認');
        return false;
      }
    }

    return true;
  },

  /**
   * 執行文字改寫 (修改後的版本)
   */
  async rewriteText(textToRewrite, isAutoRewrite = false) {
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

      const isPartialRewrite = isAutoRewrite || (textArea.selectionStart !== textArea.selectionEnd);
      const useShortInstruction = isAutoRewrite || (isPartialRewrite && textArea.selectionEnd - textArea.selectionStart <= 15);

      console.log('改寫類型:', isPartialRewrite ? '部分改寫' : '全文改寫');
      console.log('使用短指令:', useShortInstruction);
      console.log('選中文本長度:', textArea.selectionEnd - textArea.selectionStart);

      const instruction = useShortInstruction ? settings.shortInstruction : settings.instruction;
      if (!instruction.trim()) throw new Error(useShortInstruction ? '短文本改寫指令不能為空' : '改寫令不能為空');

      const model = isAutoRewrite ? settings.autoRewriteModel :
                   isPartialRewrite && useShortInstruction ? settings.shortRewriteModel :
                   settings.fullRewriteModel || settings.model;

      const isGemini = model.startsWith('gemini');
      const apiKey = settings.apiKeys[isGemini ? 'gemini-1.5-flash' : 'openai'];
      if (!apiKey) throw new Error(`未找到 ${isGemini ? 'Gemini' : 'OpenAI'} 的 API 金鑰`);

      console.log('選擇的模型:', model);
      console.log('使用的 API 金鑰:', apiKey.substring(0, 5) + '...');

      if (!isAutoRewrite && !await this._confirmRewrite(model, originalTextToRewrite, instruction)) {
        return;
      }

      await window.Notification.showNotification(`
        模型: ${this.MODEL_NAMES[model] || model}<br>
        API KEY: ${apiKey.substring(0, 5)}...<br>
        ${isPartialRewrite ? (useShortInstruction ? '正在改寫選中的短文本' : '正在改寫選中文本') : '正在改寫全文'}
      `, true);

      const { endpoint, body } = this._prepareApiConfig(model, originalTextToRewrite, instruction);
      const rewrittenText = await this._sendRequest(endpoint, body, apiKey, isGemini);

      console.log('改寫前文本:', originalTextToRewrite);
      console.log('改寫後的文本:', rewrittenText);

      window.UndoManager.addToHistory(textArea.value, textArea);

      if (isAutoRewrite) {
        console.log('自動改寫完成');
        return rewrittenText.trim();
      }


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

      const undoButton = document.getElementById('gpt-undo-button');
      if (undoButton) {
        undoButton.style.display = 'inline-block';
        console.log('復原按鈕已顯示');
      }

      window.Notification.removeNotification();
      await window.Notification.showNotification('改寫已完成', false);
      console.log('改寫完成');

    } catch (error) {
      window.Notification.removeNotification();
      console.error('rewriteText 函數出錯:', error);
      alert(`改寫過程中發生錯誤: ${error.message}\n請檢查您的設置並重試。`);
      window.Notification.showNotification(`改寫過程中發生錯誤: ${error.message}`, false);
    }
  }
};

window.TextProcessor = TextProcessor;
