console.log('Content script starting to load');

// 全局變量和設置模組
const GlobalSettings = {
  apiKeys: {},
  model: 'gemini-1.5-flash',
  instruction: '使用更正式的語言',
  shortInstruction: '',
  autoRewritePatterns: [],
  fullRewriteModel: '',
  shortRewriteModel: '',
  autoRewriteModel: '',
  rewriteHistory: [],
  // 載入設置
  async loadSettings() {
    try {
      const result = await new Promise((resolve) => {
        chrome.storage.sync.get([
          'apiKeys', 'model', 'instruction', 'shortInstruction', 
          'autoRewritePatterns', 'confirmModel', 'confirmContent',
          'fullRewriteModel', 'shortRewriteModel', 'autoRewriteModel'
        ], resolve);
      });

      console.log('成功載入設置:', result);

      this.apiKeys = result.apiKeys || {}; // 確保 apiKeys 是一個對象
      this.model = result.model || 'gemini-1.5-flash';
      this.instruction = result.instruction || '使用更正式的語言';
      this.shortInstruction = result.shortInstruction || '';
      this.fullRewriteModel = result.fullRewriteModel || result.model || '';
      this.shortRewriteModel = result.shortRewriteModel || result.model || '';
      this.autoRewriteModel = result.autoRewriteModel || result.model || '';

      if (result.autoRewritePatterns) {
        this.updateAutoRewritePatterns(result.autoRewritePatterns);
      }

      // 檢查是否有任何 API 金鑰
      if (!this.apiKeys['gemini-1.5-flash'] && !this.apiKeys['gpt-4']) {
        console.error('未設置任何 API 金鑰');
        throw new Error('未設置任何 API 金鑰，請在擴展設置中輸入至少一個 API 金鑰。');
      }

      return result;
    } catch (error) {
      console.error('載入設置時出錯:', error);
      throw error;
    }
  },

  updateAutoRewritePatterns(patternsString) {
    try {
      this.autoRewritePatterns = patternsString.split('\n')
        .map(line => line.trim())
        .filter(line => line && !line.startsWith('//'))
        .map(pattern => new RegExp(pattern.replace(/^\/|\/$/g, ''), 'g'));
      console.log('成功更新自動改寫匹配模式:', this.autoRewritePatterns);
    } catch (error) {
      console.error('更新匹配模式時出錯:', error);
    }
  }
};

// TextProcessor 對象：處理文本改寫的核心功能
const TextProcessor = {
  // findSpecialText: 在給定文本中查找特殊模式
  findSpecialText(text) {
    console.log('正在查找特殊文本，檢查的文本:', text);
    
    for (let pattern of GlobalSettings.autoRewritePatterns) {
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

  // isSpecialText: 檢查文本是否匹配任何特殊模式
  isSpecialText(text) {
    return GlobalSettings.autoRewritePatterns.some(pattern => pattern.test(text));
  },

  // rewriteText: 核心改寫功能
  async rewriteText(textToRewrite, isAutoRewrite = false) {
    try {
      console.log('開始 rewriteText 函數');
      console.log('要改寫的文本:', textToRewrite);
      console.log('是否為自動改寫:', isAutoRewrite);
      
      // 只在需要時加載設置
      if (!GlobalSettings.apiKeys || Object.keys(GlobalSettings.apiKeys).length === 0) {
        await GlobalSettings.loadSettings();
      }

      const settings = await GlobalSettings.loadSettings();
      console.log('載入的設置:', settings);

      if (!GlobalSettings.apiKeys['gemini-1.5-flash'] && !GlobalSettings.apiKeys['gpt-4']) {
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
      let selectedTextLength = textArea.selectionEnd - textArea.selectionStart;
      let useShortInstruction = isAutoRewrite || (isPartialRewrite && selectedTextLength <= 10);

      console.log('改寫類型:', isPartialRewrite ? '部分改寫' : '全文改寫');
      console.log('使用短指令:', useShortInstruction);
      console.log('選中文本長度:', selectedTextLength);

      let matchedText = null;
      if (isPartialRewrite) {
        if (selectedTextLength <= 10) {
          // 對於小於等於10個字符的選中文本，保持原有的檢查邏輯
          const start = Math.max(0, textArea.selectionStart - 3);
          const end = Math.min(textArea.value.length, textArea.selectionEnd + 3);
          const extendedText = fullText.substring(start, end);
          console.log('擴展檢查的文本:', extendedText);
          
          const matchResult = TextProcessor.findSpecialText(extendedText);
          if (matchResult) {
            matchedText = matchResult.matchedText;
            textToRewrite = matchedText;
            console.log('匹配到特殊文本:', matchedText);
          } else {
            console.log('未匹配到特殊文本，使用選中文本');
            textToRewrite = fullText.substring(textArea.selectionStart, textArea.selectionEnd);
          }
        } else {
          // 對於大於10個字符的選中文本，直接使用選中的文本，不進行特殊文本檢查
          textToRewrite = fullText.substring(textArea.selectionStart, textArea.selectionEnd);
          console.log('選中文本大於10個字符，直接使用選中文本:', textToRewrite);
        }
      } else {
        textToRewrite = fullText;
        console.log('全文改寫');
      }

      let currentInstruction = useShortInstruction ? GlobalSettings.shortInstruction : GlobalSettings.instruction;
      console.log('使用的指令:', currentInstruction);

      if (!currentInstruction.trim()) {
        console.error('改寫指令為空');
        throw new Error(useShortInstruction ? '短文本改寫要不能為空' : '改寫要求不能為空');
      }

      let shouldProceed = true;

      // 根據改寫類型選擇模型
      let selectedModel;
      if (isAutoRewrite) {
        selectedModel = GlobalSettings.autoRewriteModel || GlobalSettings.model;
      } else if (isPartialRewrite && useShortInstruction) {
        selectedModel = GlobalSettings.shortRewriteModel || GlobalSettings.model;
      } else {
        selectedModel = GlobalSettings.fullRewriteModel || GlobalSettings.model;
      }

      console.log('選擇的模型:', selectedModel);

      // 選擇正確的 API 金鑰
      let selectedApiKey;
      if (selectedModel.startsWith('gemini')) {
        selectedApiKey = GlobalSettings.apiKeys && GlobalSettings.apiKeys['gemini-1.5-flash'];
      } else {
        selectedApiKey = GlobalSettings.apiKeys && GlobalSettings.apiKeys['gpt-4'];
      }

      if (!selectedApiKey) {
        console.error(`未找到 ${selectedModel} 的 API 金鑰`);
        throw new Error(`未找到 ${selectedModel} 的 API 金鑰，請檢查您的設置。`);
      }

      console.log('使用的 API 金鑰:', selectedApiKey.substring(0, 5) + '...');

      let modelDisplayName = selectedModel;

      // 確認模型 (只執行一次)
      if (GlobalSettings.confirmModel && !isAutoRewrite) {
        console.log('確認模型 modelDisplayName:', modelDisplayName);
        console.log('確認模型前的 selectedModel:', selectedModel);
        shouldProceed = confirm(`您確定要使用 ${modelDisplayName} 模型進行改寫嗎？`);
        console.log('確認模型結果:', shouldProceed);
      }

      // 確認內容（在自動改寫模式下，這個確認已經在之前步驟中完成）
      if (shouldProceed && GlobalSettings.confirmContent && !isAutoRewrite) {
        const confirmMessage = `您確定要改寫以下內容嗎？\n\n文本：${textToRewrite.substring(0, 100)}${textToRewrite.length > 100 ? '...' : ''}\n\n指令：${currentInstruction}`;
        shouldProceed = confirm(confirmMessage);
        console.log('確認內容結果:', shouldProceed);
      }

      if (!shouldProceed) {
        console.log('用戶取消了改寫操作');
        return;
      }

      // 顯示開始改寫的通知並開始讀秒
      await UIManager.showNotification(`
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
              text: `原文：${textToRewrite}\n\n\n${currentInstruction}`
            }]
          }]
        };
      } else {
        requestBody = {
          model: selectedModel, // 直接使用選擇的模型名稱
          messages: [
            {role: "user", content: `原文：${textToRewrite}\n\n\n${currentInstruction}`}
          ]
        };
      }
      // 輸出請求內容以供檢查
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

      // 移除保存歷史的代碼
      // GlobalSettings.rewriteHistory.push(textArea.value);

      // 更新文本內容
      if (isAutoRewrite) {
        console.log('自動改寫完成，準備返回改寫後的文本');
        return rewrittenText.trim();
      }

      // 處理改寫結果
      console.log('處理改寫結果');
      console.log('是否為部分改寫:', isPartialRewrite);
      
      textArea.focus(); // 確保文本區域獲得焦點
      
      if (isPartialRewrite) {
        const start = textArea.selectionStart;
        const end = textArea.selectionEnd;
        console.log('選中文本的起始位置:', start);
        console.log('選中文本的結束位置:', end);
        const originalText = textArea.value.substring(start, end);
        console.log('原始選中的文本:', originalText);
        
        // 使用 execCommand 來替換選中的文本
        document.execCommand('insertText', false, rewrittenText.trim());
        console.log('部分改寫: 已替換選中文本');
        console.log('替換前的文本:', originalText);
        console.log('替換後的文本:', rewrittenText.trim());
      } else {
        // 全文改寫
        const originalText = textArea.value;
        textArea.select(); // 選中所有文本
        document.execCommand('insertText', false, rewrittenText.trim());
        console.log('全文改寫: 已替換整個文本');
        console.log('替換前的文本:', originalText);
        console.log('替換後的文本:', rewrittenText.trim());
      }

      console.log('更新後的文本區值:', textArea.value);
      textArea.dispatchEvent(new Event('input', { bubbles: true }));
      console.log('已觸發輸入事件');

      // 移除 "正在改寫" 的通知
      UIManager.removeNotification();

      // 顯示改寫完成的通知
      console.log('準備顯示改寫完成通知');
      await UIManager.showNotification('改寫已完成', false);
      console.log('改寫完成顯示結束');

      console.log('改寫完成');

    } catch (error) {
      UIManager.removeNotification();
      console.error('rewriteText 函數出錯:', error);
      alert(`改寫過程中發生錯誤: ${error.message}\n請檢查您的設置並重試。`);
      UIManager.showNotification(`改寫過程中發生: ${error.message}`, false);
    }
  }
};

// UIManager 對象：管理用戶界面相關功能
const UIManager = {
  // addRewriteButton: 添加改寫按鈕到界面
  addRewriteButton() {
    console.log('開始添加改寫按鈕');

    const existingButton = document.getElementById('gpt-rewrite-button');
    if (existingButton) {
      console.log('改寫按鈕已存在，不重複添加');
      return;
    }

    const textArea = document.querySelector('textarea[name="content"]');
    if (!textArea) {
      console.log('找不到文本區域，無法添加改寫按鈕');
      return;
    }

    const buttonContainer = document.createElement('div');
    buttonContainer.id = 'gpt-button-container';
    buttonContainer.style.cssText = `
      position: absolute;
      top: -22px;
      right: 10px;
      display: flex;
      z-index: 1000;
    `;

    const rewriteButton = document.createElement('button');
    rewriteButton.id = 'gpt-rewrite-button';
    rewriteButton.textContent = '改寫';
    rewriteButton.style.cssText = `
      padding: 5px 10px;
      background-color: #4CAF50;
      color: white;
      border: none;
      border-radius: 4px;
      cursor: pointer;
      font-size: 14px;
    `;
    // 添加改寫按鈕的點擊事件監聽器
    rewriteButton.addEventListener('click', async function() {
      try {
        await GlobalSettings.loadSettings();
        if (!GlobalSettings.apiKeys['gemini-1.5-flash'] && !GlobalSettings.apiKeys['gpt-4']) {
          alert('請先在擴展設置中輸入至少一個 API 金鑰');
          return;
        }
        if (!GlobalSettings.instruction.trim()) {
          alert('改寫要求不能為空，請在擴展設置中輸入改寫要求');
          return;
        }
        
        rewriteButton.disabled = true;
        await TextProcessor.rewriteText();
        console.log('改寫成功完成');
      } catch (error) {
        console.error('Error in rewrite process:', error);
        alert('改寫過程中發生錯誤: ' + error.message);
      } finally {
        rewriteButton.disabled = false;
      }
    });

    // 將改寫按鈕添加到按鈕容器
    buttonContainer.appendChild(rewriteButton);

    // 設置文本區域的父元素的定位方式為相對定位
    const textAreaParent = textArea.parentElement;
    textAreaParent.style.position = 'relative';
    // 將按鈕容器添加到文本區域的父元素中
    textAreaParent.appendChild(buttonContainer);

    textAreaParent.style.display = 'flex';
    textAreaParent.style.flexDirection = 'column';
    textAreaParent.style.alignItems = 'flex-end';

    console.log('改寫按鈕添加成功');
  },

  // showNotification: 顯示通知
  showNotification(message, isLoading = true) {
    console.log('顯示通知:', message, '正在加載:', isLoading);
    
    // 從 message 中提取模型名稱和 API KEY
    const modelMatch = message.match(/模型: (.*?)<br>/);
    const apiKeyMatch = message.match(/API KEY: (.*?)<br>/);
    
    const modelName = modelMatch ? modelMatch[1] : (isLoading ? '未知模型' : this.lastModelName);
    const apiKeyPrefix = apiKeyMatch ? apiKeyMatch[1] : (isLoading ? '未知' : this.lastApiKeyPrefix);

    if (isLoading) {
      this.lastModelName = modelName;
      this.lastApiKeyPrefix = apiKeyPrefix;
    }

    console.log('通知中的模型名:', modelName);
    console.log('通知的 API KEY 前綴:', apiKeyPrefix);

    // 清除之前的超時
    if (this.notificationTimeout) {
      console.log('清除之前的通知超時');
      clearTimeout(this.notificationTimeout);
      this.notificationTimeout = null;
    }

    // 如果通知元素不存在，則創建一個新的通知元素
    if (!this.notificationElement) {
      this.notificationElement = document.createElement('div');
      // 設置通知元素的樣式
      this.notificationElement.style.cssText = `
        position: fixed;
        top: 20px;
        left: 50%;
        transform: translateX(-50%);
        background-color: rgba(0, 0, 0, 0.8);
        color: white;
        padding: 20px;
        border-radius: 10px;
        z-index: 10000;
        max-width: 400px;
        box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
        font-family: Arial, sans-serif;
        line-height: 1.4;
        text-align: center;
        opacity: 0;
        transition: opacity 0.3s ease-in-out;
      `;
      // 將通知元素添加到文檔主體
      document.body.appendChild(this.notificationElement);
      console.log('通知元素已創建並添加到 DOM');
    }

    // 如果頁面中還沒有加載旋轉器的樣式，則添加
    if (!document.getElementById('spinner-style')) {
      const style = document.createElement('style');
      style.id = 'spinner-style';
      // 定義旋轉器的 CSS 動畫和樣式
      style.textContent = `
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
        .spinner-container {
          position: relative;
          width: 80px;
          height: 80px;
          margin: 20px auto;
        }
        .spinner {
          position: absolute;
          border: 6px solid rgba(243, 243, 243, 0.3);
          border-top: 6px solid #3498db;
          border-radius: 50%;
          width: 80px;
          height: 80px;
          animation: spin 2s linear infinite;
        }
        #countdown {
          position: absolute;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          font-size: 24px;
          font-weight: bold;
        }
      `;
      // 將樣式添加到文檔頭部
      document.head.appendChild(style);
    }

    // 設置通知元素的內容
    this.notificationElement.innerHTML = `
      <div style="font-weight: bold; margin-bottom: 10px; font-size: 20px;">
        ${isLoading ? '正在改寫' : '改寫完成'}
      </div>
      ${isLoading ? '<div class="spinner-container"><div class="spinner"></div><div id="countdown">0</div></div>' : ''}
      <div style="font-size: 14px;color: #e0e0e0;">
        模型: ${modelName}<br>
        API KEY: ${apiKeyPrefix}
      </div>
    `;
    
    return new Promise((resolve) => {
      // 淡入效果設通知元素的不透明度為1，實現淡入效果
      setTimeout(() => {
        this.notificationElement.style.opacity = '1';
        console.log('通知淡入完成');
      }, 10); // 延遲10毫秒執行，確保DOM更新

      if (isLoading) {
        console.log('開始讀秒');
        // 清除之前的計時器（如果存在）
        if (this.countdownInterval) {
          clearInterval(this.countdownInterval);
        }
        
        let count = 0;
        const countdownElement = document.getElementById('countdown');
        
        if (countdownElement) {
          countdownElement.textContent = count;
        }
        
        this.countdownInterval = setInterval(() => {
          count++;
          if (countdownElement) {
            countdownElement.textContent = count;
          }
          console.log('讀秒:', count);
        }, 1000);
        
        resolve(); // 立即解析 Promise，不等待倒計時完成
      } else {
        console.log('設置非加載狀態的通知顯示時間');
        setTimeout(() => {
          console.log('開始淡出通知');
          this.notificationElement.style.transition = 'opacity 0.25s ease-out';
          this.notificationElement.style.opacity = '0';
          
          setTimeout(() => {
            console.log('通知淡出完成，準備移除通知');
            this.removeNotification();
            resolve();
          }, 250); // 250毫秒後移除元素，與淡出動畫一致
        }, 1200); // 1200毫秒後開始淡出
      }
    });
  },

  // removeNotification: 移除通知
  removeNotification() {
    console.log('嘗試移除通知');
    if (this.notificationElement) {
      if (this.notificationElement.parentNode) {
        this.notificationElement.parentNode.removeChild(this.notificationElement);
        console.log('通知元素已從 DOM 中移除');
      } else {
        console.log('通知元素不在 DOM 中');
      }
      this.notificationElement = null;
    } else {
      console.log('沒有找到通知元素，無需移除');
    }
    this.clearAllTimers();
  },

  // clearAllTimers: 清除所有計時器
  clearAllTimers() {
    if (this.countdownInterval) {
      clearInterval(this.countdownInterval);
      this.countdownInterval = null;
      console.log('讀秒計時器已清除');
    }
    if (this.notificationTimeout) {
      clearTimeout(this.notificationTimeout);
      this.notificationTimeout = null;
      console.log('通知超時已清除');
    }
  },

  // initializeStockCodeFeature: 初始化股票代碼功能和雙擊自動改寫功能
  initializeStockCodeFeature() {
    console.log('開始初始化股票代碼功能和雙擊自動改寫功能');

    const contentTextarea = document.querySelector('textarea[name="content"]');
    const stockCodeInput = document.querySelector('input[id=":r7:"]');
    
    if (!contentTextarea || !stockCodeInput) {
      console.log('找不到必要的元素，股票代號功能未初始化');
      return;
    }

    // 創建或獲取股票代碼容器
    let stockCodeContainer = document.getElementById('stock-code-container');
    if (!stockCodeContainer) {
      stockCodeContainer = document.createElement('div');
      stockCodeContainer.id = 'stock-code-container';
      stockCodeContainer.style.cssText = `
        position: absolute;
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
        z-index: 1000;
        padding: 5px;
        border-radius: 4px;
      `;
      document.body.appendChild(stockCodeContainer);
    }

    // 更新股票代碼容器的位置
    function updateStockCodeContainerPosition() {
      if (stockCodeInput) {
        const rect = stockCodeInput.getBoundingClientRect();
        stockCodeContainer.style.top = `${rect.top + window.scrollY - stockCodeContainer.offsetHeight + 9}px`;
        stockCodeContainer.style.left = `${rect.right + window.scrollX - stockCodeContainer.offsetWidth + 28}px`;
      }
    }

    // 從文本中檢測股票代碼
    function detectStockCodes(text) {
      const stockCodeRegex = /[（(]([0-9]{4})(?:[-\s.]*(?:TW|TWO))?[）)]|[（(]([0-9]{4})[-\s.]+(?:TW|TWO)[）)]/g;
      const matches = text.matchAll(stockCodeRegex);
      const stockCodes = [...new Set([...matches].map(match => match[1] || match[2]))];
      return stockCodes;
    }

    // 更新股票代碼按鈕
    function updateStockCodeButtons(stockCodes) {
      stockCodeContainer.innerHTML = '';
      stockCodes.forEach(code => {
        const button = document.createElement('button');
        button.textContent = code;
        button.style.cssText = `
          padding: 2px 5px;
          background-color: #4CAF50;
          color: white;
          border: none;
          border-radius: 4px;
          cursor: pointer;
          font-size: 14px;
          margin: 2px;
        `;
        // 點擊按鈕時填充股票代碼輸入框
        button.addEventListener('click', () => {
          stockCodeInput.value = code;
          stockCodeInput.dispatchEvent(new Event('input', { bubbles: true }));
          
          // 聚焦然後立即失焦，觸發相關事件
          stockCodeInput.focus();
          setTimeout(() => {
            stockCodeInput.blur();
          }, 10);
        });
        stockCodeContainer.appendChild(button);
      });
      updateStockCodeContainerPosition();
    }

    // 處理內容變化
    function handleContentChange() {
      const content = contentTextarea.value;
      const stockCodes = detectStockCodes(content);
      updateStockCodeButtons(stockCodes);
      
      // 如果檢測到股票代碼且輸入框為空，自動填充第一個檢測到的代碼
      if (stockCodes.length > 0 && !stockCodeInput.value) {
        stockCodeInput.value = stockCodes[0];
        stockCodeInput.dispatchEvent(new Event('input', { bubbles: true }));
        
        // 聚焦然後立即失焦，觸發相關事件
        stockCodeInput.focus();
        setTimeout(() => {
          stockCodeInput.blur();
        }, 10);
      }
    }

    // 添加事件監聽器
    contentTextarea.addEventListener('input', handleContentChange);
    window.addEventListener('resize', updateStockCodeContainerPosition);
    window.addEventListener('scroll', updateStockCodeContainerPosition);
    
    // 初始化時執行一次內容變化處理
    handleContentChange();

    // 雙擊事件監聽器：處理雙擊自動改寫
    contentTextarea.addEventListener('dblclick', async function(event) {
      console.log('檢測到雙擊事件，準備執行自動改寫');
      const selectedText = window.getSelection().toString();
      
      console.log('選中的文本:', selectedText);
      if (selectedText.trim() !== '' && selectedText.length <= 10) {
        const start = Math.max(0, this.selectionStart - 4);
        const end = Math.min(this.value.length, this.selectionEnd + 4);
        const extendedText = this.value.substring(start, end);
        
        console.log('選中範圍:', { start: this.selectionStart, end: this.selectionEnd });
        console.log('擴展後的範圍:', { start, end });
        console.log('擴展檢查的文本:', extendedText);
        
        const matchResult = TextProcessor.findSpecialText(extendedText);
        if (matchResult) {
          console.log('找到匹配的特殊文本，開始雙擊自動改寫流程');
          try {
            const settings = await GlobalSettings.loadSettings();
            if (!GlobalSettings.apiKeys['gemini-1.5-flash'] && !GlobalSettings.apiKeys['gpt-4']) {
              console.log('API 金鑰或短文本改寫指令未設置，跳過自動改寫');
              return;
            }
            
            let shouldProceed = true;
            
            // 確認模型和內容（根據設置）
            if (settings.confirmModel || settings.confirmContent) {
              const selectedModel = settings.autoRewriteModel || GlobalSettings.model;
              const confirmMessage = `確定要使用 ${selectedModel} 模型自動改寫以下內容嗎？\n\n文本：${matchResult.matchedText}\n\n指令：${GlobalSettings.shortInstruction}`;
              shouldProceed = confirm(confirmMessage);
            }
            
            if (shouldProceed) {
              console.log('開始雙擊自動改寫流程');
              GlobalSettings.selectedOriginalContent = this.value;
              console.log('準備改寫的文本:', matchResult.matchedText);
              const rewrittenText = await TextProcessor.rewriteText(matchResult.matchedText, true);
              
              if (rewrittenText && rewrittenText.trim() !== matchResult.matchedText) {
                console.log('開始替換文本');
                const newText = this.value.substring(0, start + matchResult.startIndex) +
                                rewrittenText +
                                this.value.substring(start + matchResult.endIndex);
                
                console.log('改寫前的文本:', matchResult.matchedText);
                console.log('改寫後的文本:', rewrittenText);
                
                this.value = newText;
                console.log('文本已替換');
                this.dispatchEvent(new Event('input', { bubbles: true }));
                console.log('已觸發輸入事件');
                
                // 顯示復原按鈕
                const undoButton = document.getElementById('gpt-undo-button');
                if (undoButton) {
                  undoButton.style.display = 'inline-block';
                  console.log('復原按鈕已顯示');
                }
                
                // 移除 "正在改寫" 的通知
                UIManager.removeNotification();
                
                // 顯示改寫完成的通知
                console.log('準備顯示改寫完成通知');
                await UIManager.showNotification('自動改寫已完成', false);
                console.log('改寫完成通知顯示結束');
                
                console.log('雙擊自動改寫完成');
              } else {
                console.log('API 返回的改寫文本無效，或改寫結果與原文相同');
                UIManager.removeNotification();
              }
            } else {
              console.log('用戶取消了雙擊自動改寫操作');
              UIManager.removeNotification();
            }
          } catch (error) {
            console.error('雙擊自動改寫過程中發生錯誤:', error);
            alert(`雙擊自動改寫過程中發生錯誤: ${error.message}\n請檢查您的設置並重試。`);
          }
        } else {
          console.log('未找到匹配的特殊文本，無法執行雙擊自動改寫');
        }
      } else {
        console.log('未選中任何文本或選中文本超過10個字，無法執行雙擊自動改寫');
      }
    });

    console.log('股票代碼功能和雙擊自動改寫功能初始化成功');
  },

  removeStockCodeFeature() {
    const stockCodeContainer = document.getElementById('stock-code-container');
    if (stockCodeContainer) {
      stockCodeContainer.remove();
    }
    const contentTextarea = document.querySelector('textarea[name="content"]');
    if (contentTextarea) {
      contentTextarea.removeEventListener('input', handleContentChange);
    }
    window.removeEventListener('resize', updateStockCodeContainerPosition);
    window.removeEventListener('scroll', updateStockCodeContainerPosition);
  },

  removeRewriteButton() {
    const buttonContainer = document.getElementById('gpt-button-container');
    if (buttonContainer) {
      buttonContainer.remove();
      console.log('改寫按鈕已移除');
    }
  }
};

// 檢查當前 URL 是否匹配所需模式
function shouldEnableFeatures() {
  const currentUrl = window.location.href;
  const patterns = [
    /^https:\/\/data\.uanalyze\.twobitto\.com\/research-reports\/create/,
    /^https:\/\/data\.uanalyze\.twobitto\.com\/research-reports\/\d+\/edit/
  ];
  return patterns.some(pattern => pattern.test(currentUrl));
}

// initializeExtension: 初始化擴展功能
function initializeExtension() {
  console.log('開始初始化擴展');

  async function initUI() {
    console.log('初始化UI元素');
    if (shouldEnableFeatures()) {
      try {
        await GlobalSettings.loadSettings();
        UIManager.addRewriteButton();
        UIManager.initializeStockCodeFeature();
      } catch (error) {
        console.error('初始化UI元素時發生錯誤:', error);
      }
    } else {
      console.log('當前頁面不符合啟用條件，移除插件功能');
      UIManager.removeRewriteButton();
      UIManager.removeStockCodeFeature();
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initUI);
  } else {
    initUI();
  }

  // 監聽 URL 變化
  let lastUrl = location.href;
  new MutationObserver(() => {
    const url = location.href;
    if (url !== lastUrl) {
      lastUrl = url;
      console.log('URL變化檢測到，重新檢查是否需要初始化UI');
      initUI();
    }
  }).observe(document, {subtree: true, childList: true});

  console.log('Content script fully loaded and initialized');

  chrome.runtime.sendMessage({action: "contentScriptReady"}, function(response) {
    console.log('Content script ready message sent', response);
  });
}

// 初始化擴展
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeExtension);
} else {
  initializeExtension();
}

// 添加全局錯誤處理
// window.addEventListener('error', function(event) {
//   console.error('捕獲到全局錯誤:', event.error);
// });

