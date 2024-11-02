/* global GlobalSettings, Notification */
/**
 * 文本處理模組，負責處理文字改寫的邏輯。
 */
const TextProcessor = {
  /**
   * 在給定的文本中查找符合自動改寫模式的特殊文本。
   * @param {string} text - 要搜尋的文本。
   * @returns {object|null} - 如果找到匹配的特殊文本，則返回一個物件，包含匹配的文本、起始索引和結束索引；否則返回 null。
   */
  findSpecialText(text) {
    console.log('正在查找特殊文本，檢查的文本:', text);
    for (let pattern of window.GlobalSettings.autoRewritePatterns) {
      pattern.lastIndex = 0; // 重置lastIndex，確保每次搜尋從頭開始
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
   * @param {string} text - 要檢查的文本。
   * @returns {boolean} - true 表示包含特殊文本，false 表示不包含。
   */
  isSpecialText(text) {
    return window.GlobalSettings.autoRewritePatterns.some(pattern => pattern.test(text));
  },

  /**
   * 處理復原操作。
   */
  handleUndo() {
    console.log('執行 handleUndo 函數');
    const textArea = document.querySelector('textarea[name="content"]');
    const undoButton = document.getElementById('gpt-undo-button');
    if (textArea && window.GlobalSettings.rewriteHistory.length > 0) {
      const previousContent = window.GlobalSettings.rewriteHistory.pop();
      console.log('從歷史記錄中取出上一次的內容');
      textArea.value = previousContent;
      textArea.dispatchEvent(new Event('input', { bubbles: true }));
      console.log('已復原到上一次改寫前的內容');

      if (window.GlobalSettings.rewriteHistory.length === 0) {
        if (undoButton) {
          undoButton.style.display = 'none';
          console.log('沒有更多歷史記錄，復原按鈕已隱藏');
        }
      }
    } else {
      console.log('無法執行復原操作：找不到文本區域或沒有歷史記錄');
    }
  },

  /**
   * 執行文字改寫，包含載入設定、與 API 互動、處理結果和顯示通知等步驟。
   * @param {string} textToRewrite - 要改寫的文本。
   * @param {boolean} isAutoRewrite - 是否為自動改寫模式，true 表示自動改寫，false 表示手動改寫。
   * @returns {Promise<string>} - 一個 Promise 物件，resolve 後返回改寫後的文本。
   * @throws {Error} - 如果改寫過程中發生錯誤，則拋出錯誤。
   */
  async rewriteText(textToRewrite, isAutoRewrite = false) {
    try {
      console.log('開始 rewriteText 函數');

      // 只在需要時加載設置
      if (!window.GlobalSettings.apiKeys || Object.keys(window.GlobalSettings.apiKeys).length === 0) {
        await window.GlobalSettings.loadSettings();
      }

      const settings = await window.GlobalSettings.loadSettings();
      console.log('載入的設置:', settings);

      if (!window.GlobalSettings.apiKeys['gemini-1.5-flash'] && !window.GlobalSettings.apiKeys['gpt-4']) {
        console.error('未設置任何 API 金鑰');
        throw new Error('未設置任何 API 金鑰，請在擴展設置中輸入至少一個 API 金鑰。');
      }

      const textArea = document.querySelector('textarea[name="content"]');
      if (!textArea) {
        console.error('找不到文本區域');
        throw new Error('找不到文本區域');
      }

      let fullText = textArea.value;
      let isPartialRewrite = isAutoRewrite || (textArea.selectionStart !== textArea.selectionEnd);
      let useShortInstruction = isAutoRewrite || (isPartialRewrite && textArea.selectionEnd - textArea.selectionStart <= 15);

      console.log('改寫類型:', isPartialRewrite ? '部分改寫' : '全文改寫');
      console.log('使用短指令:', useShortInstruction);
      console.log('選中文本長度:', textArea.selectionEnd - textArea.selectionStart);

      let matchedText = null;
      if (isPartialRewrite) {
        const start = Math.max(0, textArea.selectionStart - 3);
        const end = Math.min(textArea.value.length, textArea.selectionEnd + 3);
        const extendedText = fullText.substring(start, end);
        console.log('擴展檢查的文本:', extendedText);

        const matchResult = this.findSpecialText(extendedText);
        if (matchResult) {
          matchedText = matchResult.matchedText;
          textToRewrite = matchedText;
          console.log('匹配到特殊文本:', matchedText);
        } else {
          console.log('未匹配到特殊文本，使用選中文本');
          textToRewrite = fullText.substring(textArea.selectionStart, textArea.selectionEnd);
        }
      } else {
        textToRewrite = fullText;
        console.log('全文改寫');
      }

      let currentInstruction = useShortInstruction ? window.GlobalSettings.shortInstruction : window.GlobalSettings.instruction;
      console.log('使用的指令:', currentInstruction);

      if (!currentInstruction.trim()) {
        console.error('改寫指令為空');
        throw new Error(useShortInstruction ? '短文本改寫指令不能為空' : '改寫指令不能為空');
      }

      let shouldProceed = true;

      // 根據改寫類型選擇模型
      let selectedModel;
      if (isAutoRewrite) {
        selectedModel = window.GlobalSettings.autoRewriteModel || window.GlobalSettings.model;
      } else if (isPartialRewrite && useShortInstruction) {
        selectedModel = window.GlobalSettings.shortRewriteModel || window.GlobalSettings.model;
      } else {
        selectedModel = window.GlobalSettings.fullRewriteModel || window.GlobalSettings.model;
      }

      console.log('選擇的模型:', selectedModel);

      // 選擇正確的 API 金鑰
      let selectedApiKey;
      if (selectedModel.startsWith('gemini')) {
        selectedApiKey = window.GlobalSettings.apiKeys && window.GlobalSettings.apiKeys['gemini-1.5-flash'];
      } else {
        selectedApiKey = window.GlobalSettings.apiKeys && window.GlobalSettings.apiKeys['gpt-4'];
      }

      if (!selectedApiKey) {
        console.error(`未找到 ${selectedModel} 的 API 金鑰`);
        throw new Error(`未找到 ${selectedModel} 的 API 金鑰，請檢查您的設置。`);
      }

      console.log('使用的 API 金鑰:', selectedApiKey.substring(0, 5) + '...');

      let modelDisplayName;
      switch(selectedModel) {
        case 'gpt-4':
          modelDisplayName = 'GPT-4';
          break;
        case 'gpt-4o-mini':
          modelDisplayName = 'GPT-4o mini';
          break;
        case 'gemini-1.5-flash':
          modelDisplayName = 'Gemini 1.5 Flash';
          break;
        default:
          modelDisplayName = selectedModel;
      }

      console.log('設置的 modelDisplayName:', modelDisplayName);

      // 確認模型 (只執行一次)
      if (window.GlobalSettings.confirmModel && !isAutoRewrite) {
        console.log('確認模型 modelDisplayName:', modelDisplayName);
        console.log('確認模型前的 selectedModel:', selectedModel);
        shouldProceed = confirm(`您確定要使用 ${modelDisplayName} 模型進行改寫嗎？`);
        console.log('確認模型結果:', shouldProceed);
      }

      // 確認內容（在自動改寫模式下，這個確認已經在之前步驟中完成）
      if (shouldProceed && window.GlobalSettings.confirmContent && !isAutoRewrite) {
        const confirmMessage = `您確定要改寫以下內容嗎？\n\n文本${textToRewrite.substring(0, 100)}${textToRewrite.length > 100 ? '...' : ''}\n\n指令：${currentInstruction}`;
        shouldProceed = confirm(confirmMessage);
        console.log('確認內容結果:', shouldProceed);
      }

      if (!shouldProceed) {
        console.log('用戶取消了改寫操作');
        return;
      }

      // 顯示開始改寫的通知並開始讀秒
      await window.Notification.showNotification(`
        模型: ${modelDisplayName}<br>
        API KEY: ${selectedApiKey.substring(0, 5)}...<br>
        ${isPartialRewrite ? (useShortInstruction ? '正在改寫選中的短文本' : '正在改寫選中文本') : '正在改寫全文'}
      `, true);

      // 使用選擇的模型進行 API 調用
      let requestBody;
      if (selectedModel.startsWith('gemini')) {
        requestBody = {
          contents: [{
            parts: [{
              text: `要替換的文本：${textToRewrite}。\n\n\n替換指令：${currentInstruction}`
            }]
          }]
        };
      } else {
        requestBody = {
          model: selectedModel === 'gpt-4o-mini' ? 'gpt-4' : selectedModel,
          messages: [
            {role: "system", content: "你是一個專業的文字改寫助手。"},
            {role: "user", content: `要替換的文本：${textToRewrite}。\n\n\n指令：${currentInstruction}`}
          ]
        };
      }

      console.log('準備發送 API 請求');
      console.log('請求體:', JSON.stringify(requestBody, null, 2));

      const response = await fetch(selectedModel.startsWith('gemini') 
        ? `https://generativelanguage.googleapis.com/v1beta/models/${selectedModel}:generateContent?key=${selectedApiKey}`
        : 'https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(selectedModel.startsWith('gemini') ? {} : {'Authorization': `Bearer ${selectedApiKey}`})
        },
        body: JSON.stringify(requestBody)
      });

      console.log('收到 API 響應');
      if (!response.ok) {
        const errorData = await response.json();
        console.error('API 錯誤響應:', errorData);
        throw new Error(`HTTP error! status: ${response.status}, message: ${JSON.stringify(errorData)}`);
      }

      const data = await response.json();
      console.log('API Response:', data);

      let rewrittenText = selectedModel.startsWith('gemini')
        ? data.candidates[0].content.parts[0].text
        : data.choices[0].message.content;

      console.log('改寫前文本:', textToRewrite);
      console.log('改寫後的文本:', rewrittenText);

      // 在改寫之前保存當前內容到歷史
      window.GlobalSettings.rewriteHistory.push(textArea.value);

      // 更新文本內容
      if (isAutoRewrite) {
        console.log('自動改寫完成，準備返回改寫後的文本');
        return rewrittenText.trim();
      }

      // 處理改寫結果
      if (isPartialRewrite && matchedText) {
        const selectedText = fullText.substring(textArea.selectionStart, textArea.selectionEnd);
        const newText = selectedText.replace(matchedText, rewrittenText.trim());
        fullText = fullText.substring(0, textArea.selectionStart) + 
                   newText + 
                   fullText.substring(textArea.selectionEnd);
        console.log('部分改寫 (匹配特殊文本): 已替換文本');
      } else if (isPartialRewrite) {
        fullText = fullText.substring(0, textArea.selectionStart) + 
                   rewrittenText.trim() + 
                   fullText.substring(textArea.selectionEnd);
        console.log('部分改寫 (未匹配特殊文本): 已替換選中文本');
      } else {
        fullText = rewrittenText.trim();
        console.log('全文改寫: 已替換整個文本');
      }

      // 移除可能的多餘空白行
      fullText = fullText.replace(/\n{3,}/g, '\n\n');

      console.log('更新前的文本區域值:', textArea.value);
      textArea.value = fullText;
      console.log('更新後的文本區值:', textArea.value);
      textArea.dispatchEvent(new Event('input', { bubbles: true }));
      console.log('已觸發輸入事件');

      // 顯示復原按鈕
      const undoButton = document.getElementById('gpt-undo-button');
      if (undoButton) {
        undoButton.style.display = 'inline-block';
        console.log('復原按鈕已顯示');
      }

      // 移除 "正在改寫" 的通知
      window.Notification.removeNotification();

      // 顯示改寫完成的通知
      console.log('準備顯示改寫完成通知');
      await window.Notification.showNotification('改寫已完成', false);
      console.log('改寫完成顯示結束');

      console.log('改寫完成');

    } catch (error) {
      window.Notification.removeNotification();
      console.error('rewriteText 函數出錯:', error);
      alert(`改寫過程中發生錯誤: ${error.message}\n請檢查您的設置並重試。`);
      window.Notification.showNotification(`改寫過程中發生錯誤: ${error.message}`, false);
    }
  }
};

// 監聽鍵盤事件，處理 Ctrl+Z 或 Cmd+Z 快捷鍵的復原操作
document.addEventListener('keydown', function(event) {
  if ((event.ctrlKey || event.metaKey) && event.key === 'z') {
    console.log('檢測到 Ctrl+Z 或 Cmd+Z 快捷鍵');
    event.preventDefault();
    TextProcessor.handleUndo();
  }
});

// 確保 TextProcessor 可以被其他檔案訪問
window.TextProcessor = TextProcessor;
