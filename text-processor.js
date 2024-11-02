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
      }]
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
    console.log('準備發送 API 請求');
    console.log('請求體:', JSON.stringify(body, null, 2));

    const response = await fetch(
      isGemini ? `${endpoint}?key=${apiKey}` : endpoint,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(!isGemini ? {'Authorization': `Bearer ${apiKey}`} : {})
        },
        body: JSON.stringify(body)
      }
    );

    console.log('收到 API 響應');
    if (!response.ok) {
      const errorData = await response.json();
      console.error('API 錯誤響應:', errorData);
      throw new Error(`HTTP error! status: ${response.status}, message: ${JSON.stringify(errorData)}`);
    }

    const data = await response.json();
    console.log('API Response:', data);

    return isGemini
      ? data.candidates[0].content.parts[0].text
      : data.choices[0].message.content;
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
   * 執行文字改寫
   */
  async rewriteText(textToRewrite, isAutoRewrite = false) {
    try {
      console.log('開始 rewriteText 函數');
      const settings = await window.GlobalSettings.loadSettings();
      console.log('載入的設置:', settings);

      const textArea = document.querySelector('textarea[name="content"]');
      if (!textArea) throw new Error('找不到文本區域');

      const isPartialRewrite = isAutoRewrite || (textArea.selectionStart !== textArea.selectionEnd);
      const useShortInstruction = isAutoRewrite || (isPartialRewrite && textArea.selectionEnd - textArea.selectionStart <= 15);

      console.log('改寫類型:', isPartialRewrite ? '部分改寫' : '全文改寫');
      console.log('使用短指令:', useShortInstruction);
      console.log('選中文本長度:', textArea.selectionEnd - textArea.selectionStart);

      const finalTextToRewrite = this._getTextToRewrite(textArea, isAutoRewrite, textToRewrite);
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

      if (!isAutoRewrite && !await this._confirmRewrite(model, finalTextToRewrite, instruction)) {
        return;
      }

      await window.Notification.showNotification(`
        模型: ${this.MODEL_NAMES[model] || model}<br>
        API KEY: ${apiKey.substring(0, 5)}...<br>
        ${isPartialRewrite ? (useShortInstruction ? '正在改寫選中的短文本' : '正在改寫選中文本') : '正在改寫全文'}
      `, true);

      const { endpoint, body } = this._prepareApiConfig(model, finalTextToRewrite, instruction);
      const rewrittenText = await this._sendRequest(endpoint, body, apiKey, isGemini);

      console.log('改寫前文本:', finalTextToRewrite);
      console.log('改寫後的文本:', rewrittenText);

      window.UndoManager.addToHistory(textArea.value, textArea);

      if (isAutoRewrite) {
        console.log('自動改寫完成');
        return rewrittenText.trim();
      }

      const newText = (isPartialRewrite
        ? textArea.value.substring(0, textArea.selectionStart) + rewrittenText.trim() + textArea.value.substring(textArea.selectionEnd)
        : rewrittenText.trim()
      ).replace(/\n{3,}/g, '\n\n');

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
