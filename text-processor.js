/* global GlobalSettings, Notification */
/**
 * 文本處理模組，負責處理文字改寫的邏輯。
 */
const TextProcessor = {
  /**
   * 最大歷史記錄數量
   */
  MAX_HISTORY_SIZE: 50,

  /**
   * 當前歷史位置
   */
  currentHistoryIndex: -1,

  /**
   * 是否為復原/重做操作
   */
  isUndoRedoOperation: false,

  /**
   * 儲存每個輸入框的歷史記錄
   */
  inputHistories: new Map(),

  /**
   * 獲取輸入框的唯一標識
   * @param {Element} element - 輸入框元素
   * @returns {string} - 輸入框的唯一標識
   */
  getInputId(element) {
    if (!element) {
      console.error('getInputId: element is undefined');
      return 'unknown';
    }
    
    // 優先使用 name 屬性，因為 id 可能會變化
    if (element.name) {
      return `input-${element.tagName.toLowerCase()}-${element.name}`;
    }
    
    // 如果沒有 name，再使用 id
    if (element.id) {
      return `input-${element.tagName.toLowerCase()}-${element.id}`;
    }
    
    // 如果都沒有，使用元素類型和索引
    const elements = document.querySelectorAll(element.tagName);
    const index = Array.from(elements).indexOf(element);
    return `input-${element.tagName.toLowerCase()}-${index}`;
  },

  /**
   * 初始化輸入框的歷史記錄
   * @param {Element} element - 輸入框元素
   */
  initInputHistory(element) {
    if (!element || element._historyInitialized) {
      return;
    }

    try {
      const inputId = this.getInputId(element);
      if (!this.inputHistories.has(inputId)) {
        this.inputHistories.set(inputId, {
          history: [element.value || ''],
          currentIndex: 0
        });
        
        // 添加輸入事件監聽器
        const handleInput = (event) => {
          if (this.isUndoRedoOperation) return;
          
          const oldLength = this.inputHistories.get(inputId)?.history[this.inputHistories.get(inputId)?.currentIndex]?.length || 0;
          const newLength = event.target.value.length;
          const lengthDiff = Math.abs(newLength - oldLength);
          
          if (lengthDiff > 1) {
            clearTimeout(element._inputTimeout);
            element._inputTimeout = setTimeout(() => {
              this.addToHistory(event.target.value, element);
            }, 500);
          } else {
            this.addToHistory(event.target.value, element);
          }
        };

        // 添加事件監聽器
        element.addEventListener('input', handleInput);
        element.addEventListener('paste', () => {
          setTimeout(() => this.addToHistory(element.value, element), 0);
        });
        element.addEventListener('cut', () => {
          setTimeout(() => this.addToHistory(element.value, element), 0);
        });

        // 儲存事件監聽器引用，以便之後可以移除
        element._historyHandlers = {
          input: handleInput
        };

        element._historyInitialized = true;
        console.log(`已初始化輸入框歷史記錄 [${inputId}]`);
      }
    } catch (error) {
      console.error('初始化輸入框歷史記錄時發生錯誤:', error);
    }
  },

  /**
   * 添加新的歷史記錄
   * @param {string} content - 要記錄的內容
   * @param {Element} element - 輸入框元素
   */
  addToHistory(content, element) {
    if (!element) {
      console.error('addToHistory: element is undefined');
      return;
    }

    try {
      if (this.isUndoRedoOperation) {
        console.log('跳過在復原/重做操作期間的歷史記錄');
        return;
      }

      const inputId = this.getInputId(element);
      let inputHistory = this.inputHistories.get(inputId);
      
      if (!inputHistory) {
        this.initInputHistory(element);
        inputHistory = this.inputHistories.get(inputId);
        if (!inputHistory) {
          console.error(`無法為輸入框 [${inputId}] 創建歷史記錄`);
          return;
        }
      }

      // 檢查是否與最後一條記錄相同
      if (inputHistory.history[inputHistory.currentIndex] === content) {
        return;
      }

      // 如果在歷史中間位置進行了新的修改，刪除該位置之後的歷史
      if (inputHistory.currentIndex < inputHistory.history.length - 1) {
        inputHistory.history = inputHistory.history.slice(0, inputHistory.currentIndex + 1);
      }

      inputHistory.history.push(content);
      
      // 如果超過最大數量，移除最舊的記錄
      if (inputHistory.history.length > this.MAX_HISTORY_SIZE) {
        inputHistory.history.shift();
        inputHistory.currentIndex = Math.max(0, inputHistory.currentIndex - 1);
      }

      inputHistory.currentIndex = inputHistory.history.length - 1;
      console.log(`添加新的歷史記錄 [${inputId}]，當前索引:`, inputHistory.currentIndex);
    } catch (error) {
      console.error('添加歷史記錄時發生錯誤:', error);
    }
  },

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
   * 執行復原操作
   */
  handleUndo() {
    console.log('執行復原操作');
    const activeElement = document.activeElement;
    if (!activeElement || !(activeElement.tagName === 'INPUT' || activeElement.tagName === 'TEXTAREA')) return;
    
    const inputId = this.getInputId(activeElement);
    const inputHistory = this.inputHistories.get(inputId);
    
    if (!inputHistory) {
      this.initInputHistory(activeElement);
      return;
    }

    if (inputHistory.currentIndex > 0) {
      inputHistory.currentIndex--;
      const previousContent = inputHistory.history[inputHistory.currentIndex];
      
      this.isUndoRedoOperation = true;
      activeElement.value = previousContent;
      activeElement.dispatchEvent(new Event('input', { bubbles: true }));
      
      requestAnimationFrame(() => {
        this.isUndoRedoOperation = false;
      });
      
      console.log(`復原到索引 [${inputId}]:`, inputHistory.currentIndex);
    }
  },

  /**
   * 執行重做操作
   */
  handleRedo() {
    console.log('執行重做操作');
    const activeElement = document.activeElement;
    if (!activeElement || !(activeElement.tagName === 'INPUT' || activeElement.tagName === 'TEXTAREA')) return;
    
    const inputId = this.getInputId(activeElement);
    const inputHistory = this.inputHistories.get(inputId);
    
    if (!inputHistory) {
      this.initInputHistory(activeElement);
      return;
    }

    if (inputHistory.currentIndex < inputHistory.history.length - 1) {
      inputHistory.currentIndex++;
      const nextContent = inputHistory.history[inputHistory.currentIndex];
      
      this.isUndoRedoOperation = true;
      activeElement.value = nextContent;
      activeElement.dispatchEvent(new Event('input', { bubbles: true }));
      
      requestAnimationFrame(() => {
        this.isUndoRedoOperation = false;
      });
      
      console.log(`重做到索引 [${inputId}]:`, inputHistory.currentIndex);
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

      if (!window.GlobalSettings.apiKeys['gemini-1.5-flash'] && !window.GlobalSettings.apiKeys['openai']) {
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

      // 修改這部分邏輯，直接使用選中的文本
      if (isPartialRewrite) {
        if (isAutoRewrite) {
          // 自動改寫模式下才進行特殊文本匹配
          const start = Math.max(0, textArea.selectionStart - 3);
          const end = Math.min(textArea.value.length, textArea.selectionEnd + 3);
          const extendedText = fullText.substring(start, end);
          const matchResult = this.findSpecialText(extendedText);
          if (matchResult) {
            textToRewrite = matchResult.matchedText;
          }
        } else {
          // 手動選取模式下直接使用選中的文本
          textToRewrite = fullText.substring(textArea.selectionStart, textArea.selectionEnd);
        }
      } else {
        textToRewrite = fullText;
      }

      let currentInstruction = useShortInstruction ? window.GlobalSettings.shortInstruction : window.GlobalSettings.instruction;
      console.log('使用的指令:', currentInstruction);

      if (!currentInstruction.trim()) {
        console.error('改寫指令為空');
        throw new Error(useShortInstruction ? '短文本改寫指令不能為空' : '改寫令不能為空');
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
        selectedApiKey = window.GlobalSettings.apiKeys && window.GlobalSettings.apiKeys['openai'];
      }

      if (!selectedApiKey) {
        const provider = selectedModel.startsWith('gemini') ? 'Gemini' : 'OpenAI';
        console.error(`未找到 ${provider} 的 API 金鑰`);
        throw new Error(`未找到 ${provider} 的 API 金鑰，請檢查您的設置。`);
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
          model: selectedModel,
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
      this.addToHistory(textArea.value, textArea);

      // 更新文本內容
      if (isAutoRewrite) {
        console.log('自動改寫完成，準備返回改寫後的文本');
        return rewrittenText.trim();
      }

      // 處理改寫結果
      if (isPartialRewrite) {
        fullText = fullText.substring(0, textArea.selectionStart) + 
                  rewrittenText.trim() + 
                  fullText.substring(textArea.selectionEnd);
        console.log('部分改寫: 已替換選中文本');
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

// 修改鍵盤事件監聽器
document.addEventListener('keydown', function(event) {
  // 獲取當前焦點的元素
  const activeElement = document.activeElement;
  
  // 檢查當前焦點元素是否為輸入框或文本區域
  if (!activeElement || !(activeElement.tagName === 'INPUT' || activeElement.tagName === 'TEXTAREA')) {
    return;
  }

  // 如果是輸入框，檢查是否為文本類型
  if (activeElement.tagName === 'INPUT' && 
      !['text', 'search', 'url', 'tel', 'password'].includes(activeElement.type)) {
    return;
  }

  // Ctrl+Z 或 Cmd+Z
  if ((event.ctrlKey || event.metaKey) && !event.shiftKey && event.key.toLowerCase() === 'z') {
    event.preventDefault();
    TextProcessor.handleUndo();
  }
  // Ctrl+Shift+Z 或 Cmd+Shift+Z
  else if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key.toLowerCase() === 'z') {
    event.preventDefault();
    TextProcessor.handleRedo();
  }
});

// 確保 TextProcessor 可以被其他檔案訪問
window.TextProcessor = TextProcessor;

// 修改初始化邏輯
function initializeInputs() {
  const inputs = document.querySelectorAll('input[type="text"], input[type="search"], input[type="url"], input[type="tel"], input[type="password"], textarea');
  inputs.forEach(input => {
    // 檢查是否已經初始化
    if (!input._historyInitialized) {
      TextProcessor.initInputHistory(input);
      input._historyInitialized = true;
      console.log('初始化輸入框:', input.name || input.id || 'unnamed input');
    }
  });
}

// 在 DOMContentLoaded 時初始化
document.addEventListener('DOMContentLoaded', initializeInputs);

// 使用 MutationObserver 監聽 DOM 變化
const observer = new MutationObserver((mutations) => {
  let shouldInit = false;
  
  mutations.forEach(mutation => {
    if (mutation.addedNodes.length > 0) {
      shouldInit = true;
    }
  });

  if (shouldInit) {
    // 延遲執行初始化，確保 React 等框架完成渲染
    setTimeout(initializeInputs, 100);
  }
});

// 開始觀察
observer.observe(document.body, {
  childList: true,
  subtree: true
});
