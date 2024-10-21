// 在控制台輸出消息，表示內容腳本開始加載
console.log('Content script starting to load');

// 初始化全局變量
let apiKey = ''; // 存儲 API 密鑰
let model = 'gemini-1.5-flash'; // 默認模型設置為 Gemini 1.5 Flash
let instruction = '使用更正式的語言'; // 默認的改寫指令
let originalContent = ''; // 存儲原始內容，用於復原功能
let shortInstruction = ''; // 存儲短文本（10字以下）的改寫指令

// 存儲反白改寫前的內容，用於復原功能
let selectedOriginalContent = '';

// 存儲自動改寫的匹配模式
let autoRewritePatterns = [];

// 初始化不同類型改寫的模型變量
let fullRewriteModel = '';
let shortRewriteModel = '';
let autoRewriteModel = '';

// 在文件頂部添加一個新的變量來存儲改寫歷史
let rewriteHistory = [];

/**
 * 從 Chrome 存儲中獲取數據
 * @param {string} key - 要獲取的數據的鍵名
 * @returns {Promise} 返回一個 Promise，解析為獲取的數據
 */
function getChromeStorage(key) {
  return new Promise((resolve, reject) => {
    try {
      chrome.storage.sync.get(key, (result) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve(result[key]);
        }
      });
    } catch (error) {
      reject(new Error('擴展程序上下文無效，請刷新頁面重試。'));
    }
  });
}

/**
 * 加載設置
 * 從 Chrome 存儲中讀取所有必要的設置
 * @returns {Promise} 返回一個 Promise，解析為包含所有設置的對象
 */
async function loadSettings() {
  try {
    const result = await new Promise((resolve, reject) => {
      chrome.storage.sync.get([
        'apiKeys', 'model', 'instruction', 'shortInstruction', 
        'autoRewritePatterns', 'confirmModel', 'confirmContent',
        'fullRewriteModel', 'shortRewriteModel', 'autoRewriteModel'
      ], (result) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve(result);
        }
      });
    });

    console.log('成功載入設置:', result);

    // 設置 API 密鑰
    apiKey = result.apiKeys ? (result.apiKeys[result.model] || '') : '';
    
    // 如果 apiKey 為空，嘗試從其他模型中獲取
    if (!apiKey) {
      const models = ['gpt-4', 'gpt-4o-mini', 'gemini-1.5-flash'];
      for (let model of models) {
        if (result.apiKeys && result.apiKeys[model]) {
          apiKey = result.apiKeys[model];
          break;
        }
      }
    }

    // 設置默認模型
    model = result.model || 'gemini-1.5-flash';
    // 設置改寫指令
    instruction = result.instruction || '使用更正式的語言';
    shortInstruction = result.shortInstruction || '';
    
    // 更新不同類型改寫的模型設置
    fullRewriteModel = result.fullRewriteModel || result.model || '';
    shortRewriteModel = result.shortRewriteModel || result.model || '';
    autoRewriteModel = result.autoRewriteModel || result.model || '';

    console.log('載入的模型設置:', {
      fullRewriteModel,
      shortRewriteModel,
      autoRewriteModel,
      originalModel: result.model
    });

    // 更新自動改寫匹配模式
    if (result.autoRewritePatterns) {
      updateAutoRewritePatterns(result.autoRewritePatterns);
    }

    // 確保 confirmModel 和 confirmContent 有默認值
    result.confirmModel = result.confirmModel !== undefined ? result.confirmModel : true;
    result.confirmContent = result.confirmContent !== undefined ? result.confirmContent : true;

    // 檢查 API 密鑰是否設置
    if (!apiKey) {
      console.error('API 金鑰未設置');
      throw new Error('API 金鑰未設置');
    }

    return result;
  } catch (error) {
    console.error('載入設置時出錯:', error);
    throw error;
  }
}

/**
 * 更新自動改寫匹配模式
 * @param {string} patternsString - 包含匹配模式的字符串，每行一個模式
 */
function updateAutoRewritePatterns(patternsString) {
  try {
    // 將字符串轉換為正則表達式數組
    autoRewritePatterns = patternsString.split('\n')
      .map(line => line.trim())
      .filter(line => line && !line.startsWith('//'))
      .map(pattern => new RegExp(pattern.replace(/^\/|\/$/g, ''), 'g'));
    console.log('成更新自動改寫匹配模式:', autoRewritePatterns);
  } catch (error) {
    console.error('更新匹配模式時出錯:', error);
  }
}

/**
 * 在文本中查找特殊文本（匹配自動改寫模式的文本）
 * @param {string} text - 要搜索的文本
 * @returns {Object|null} 返回匹配的文本信息，如果沒有匹配則返回 null
 */
function findSpecialText(text) {
  console.log('正在查找特殊文本，檢查的文本:', text);
  
  for (let pattern of autoRewritePatterns) {
    pattern.lastIndex = 0; // 重置正則表達式的lastIndex
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
}

/**
 * 檢查文本是否匹配任何自動改寫模式
 * @param {string} text - 要檢查的文本
 * @returns {boolean} 如果文本匹配任模式則返回 true，否則返回 false
 */
function isSpecialText(text) {
  return autoRewritePatterns.some(pattern => pattern.test(text));
}

// 修改 rewriteText 函數
async function rewriteText(textToRewrite, isAutoRewrite = false) {
  try {
    console.log('開始 rewriteText 函數');
    const settings = await loadSettings();
    console.log('載入的設置:', settings);

    if (!apiKey) {
      console.error('API 金鑰未設置');
      throw new Error('API 金鑰未設置');
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
      
      const matchResult = findSpecialText(extendedText);
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

    let currentInstruction = useShortInstruction ? shortInstruction : instruction;
    console.log('使用的指令:', currentInstruction);

    if (!currentInstruction.trim()) {
      console.error('改寫指令為空');
      throw new Error(useShortInstruction ? '短文本改寫要不能為空' : '改寫要求不能為空');
    }

    let shouldProceed = true;

    // 根據改寫
    let selectedModel;
    if (isAutoRewrite) {
      selectedModel = settings.autoRewriteModel || model;
    } else if (isPartialRewrite && useShortInstruction) {
      selectedModel = settings.shortRewriteModel || model;
    } else {
      selectedModel = settings.fullRewriteModel || model;
    }

    console.log('選擇的模型:', selectedModel);

    // 選擇正確的 API 金鑰
    let selectedApiKey;
    if (selectedModel.startsWith('gemini')) {
      selectedApiKey = settings.apiKeys['gemini-1.5-flash'];
    } else {
      selectedApiKey = settings.apiKeys['gpt-4'];
    }

    if (!selectedApiKey) {
      throw new Error(`未找到 ${selectedModel} 的 API 金鑰`);
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
    if (settings.confirmModel && !isAutoRewrite) {
      console.log('確認模型 modelDisplayName:', modelDisplayName);
      console.log('確認模型前的 selectedModel:', selectedModel);
      shouldProceed = confirm(`您確定要使用 ${modelDisplayName} 模型進行改寫嗎？`);
      console.log('確認模型結果:', shouldProceed);
    }

    // 確認內容（在自動改寫模式下，這個確認已經在之前步驟中完成）
    if (shouldProceed && settings.confirmContent && !isAutoRewrite) {
      const confirmMessage = `您確定要改寫以下內容嗎？\n\n文本：${textToRewrite.substring(0, 100)}${textToRewrite.length > 100 ? '...' : ''}\n\n指令：${currentInstruction}`;
      shouldProceed = confirm(confirmMessage);
      console.log('確認內容結果:', shouldProceed);
    }

    if (!shouldProceed) {
      console.log('用戶取消了改寫操作');
      return;
    }

    // 顯示開始改寫的通知並開始讀秒
    await showNotification(`
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
        model: selectedModel === 'gpt-4o-mini' ? 'gpt-4' : selectedModel,
        messages: [
          {role: "system", content: "你是一個專業的文字改寫助手。"},
          {role: "user", content: `原文：${textToRewrite}\n\n\n${currentInstruction}`}
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

    console.log('改寫前的文本:', textToRewrite);
    console.log('改寫後的文本:', rewrittenText);

    // 在改寫之前保存當前內容到歷史
    rewriteHistory.push(textArea.value);

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
      console.log('部分改寫 (未匹特殊文本): 已替換選中文本');
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
    removeNotification();

    // 顯示改寫完成的通知
    console.log('準備顯示改寫完成通知');
    await showNotification('改寫已完成', false);
    console.log('改寫完成顯示結束');

    console.log('改寫完成');

  } catch (error) {
    removeNotification();
    console.error('rewriteText 函數出錯:', error);
    alert(`改寫過程中發生錯誤: ${error.message}\n請檢查您的設置並重試。`);
    showNotification(`改寫過程中發生錯誤: ${error.message}`, false);
  }
}
// 在加載完成後添加按鈕
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', addRewriteButton);
} else {
  addRewriteButton();
}

// 監聽 URL 變化，在 URL 變化時重新添加按鈕
let lastUrl = location.href;
new MutationObserver(() => {
  const url = location.href;
  if (url !== lastUrl) {
    lastUrl = url;
    if (shouldEnableFeatures()) {
      addRewriteButton();
      initializeStockCodeFeature();
    } else {
      // 如果切換到不符合條件的頁面，移除按鈕和股票代號功能
      const buttonContainer = document.getElementById('gpt-button-container');
      if (buttonContainer) {
        buttonContainer.remove();
      }
      removeStockCodeFeature();
    }
  }
}).observe(document, {subtree: true, childList: true});

console.log('Content script fully loaded and initialized');

// 發送準備就緒消息給背景腳本
chrome.runtime.sendMessage({action: "contentScriptReady"}, function(response) {
  console.log('Content script ready message sent', response);
});

// 處理來自彈出窗口的消息
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('收到消息:', request);
  if (request.action === "rewrite") {
    apiKey = request.apiKey;
    model = request.model;
    instruction = request.instruction;
    shortInstruction = request.shortInstruction;
    updateAutoRewritePatterns(request.autoRewritePatterns);
    // 保存確認設置
    chrome.storage.sync.set({
      confirmModel: request.confirmModel,
      confirmContent: request.confirmContent
    });
    rewriteText();
    sendResponse({success: true});
  } else if (request.action === "updateAutoRewritePatterns") {
    updateAutoRewritePatterns(request.patterns);
    sendResponse({success: true});
  } else if (request.action === "updateSettings") {
    if (request.settings.apiKeys) {
      apiKeys = request.settings.apiKeys;
    }
    if (request.settings.fullRewriteModel) {
      fullRewriteModel = request.settings.fullRewriteModel;
    }
    if (request.settings.shortRewriteModel) {
      shortRewriteModel = request.settings.shortRewriteModel;
    }
    if (request.settings.autoRewriteModel) {
      autoRewriteModel = request.settings.autoRewriteModel;
    }
    // ... 其他設置更新 ...
    console.log('更新的設置:', {
      fullRewriteModel,
      shortRewriteModel,
      autoRewriteModel,
      apiKeys
    });
    sendResponse({success: true});
  } else if (request.action === "updateAutoRewritePatterns") {
    updateAutoRewritePatterns(request.patterns);
    sendResponse({success: true});
  }
});

// 處理復原操作的消息
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "undo") {
    const textArea = document.querySelector('textarea[name="content"]');
    if (textArea && originalContent) {
      textArea.value = originalContent; // 恢復始內容
      textArea.dispatchEvent(new Event('input', { bubbles: true })); // 觸發輸入事件
      sendResponse({success: true});
    } else {
      sendResponse({success: false, error: "無法復原或找不到文本區域"});
    }
  }
});

// 添加一個新的監聽器來理 API 金鑰的同步
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "syncApiKeys") {
    if (request.source === 'gpt4') {
      apiKeys['gpt-4'] = request.apiKey;
    } else if (request.source === 'gpt4oMini') {
      apiKeys['gpt-4'] = request.apiKey;
    }
    // 保存更新後的 API 金鑰
    getChromeStorage().then(storage => {
      storage.set({
        apiKeys: apiKeys,
      });
    });
    sendResponse({success: true});
  }
});

// 添加一個新的函數來檢查當前 URL 是否匹配所需模式
function shouldEnableFeatures() {
  const currentUrl = window.location.href;
  const pattern = /^https:\/\/data\.uanalyze\.twobitto\.com\/research-reports\/(\d+|create)/;
  return pattern.test(currentUrl);
}

// 修改 addRewriteButton 函數
function addRewriteButton() {
  // 首先檢查是否應該啟用功能
  if (!shouldEnableFeatures()) {
    console.log('當前頁面不符合啟用條件，不添加改寫按鈕');
    return;
  }

  const existingButton = document.getElementById('gpt-rewrite-button');
  if (existingButton) return; // 如果按鈕已存在，則退出函數

  const textArea = document.querySelector('textarea[name="content"]');
  if (!textArea) return; // 如果找不到文本區域則退出函數

  const buttonContainer = document.createElement('div');
  buttonContainer.id = 'gpt-button-container';
  buttonContainer.style.cssText = `
    position: absolute;
    top: -22px;
    right: 10px;
    display: flex;
    gap: 10px;
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
    display: flex;
    align-items: center;
    justify-content: center;
  `;

  const undoButton = document.createElement('button');
  undoButton.id = 'gpt-undo-button';
  undoButton.textContent = '復原';
  undoButton.style.cssText = `
    padding: 5px 10px;
    background-color: #f44336;
    color: white;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    font-size: 14px;
    display: none;
  `;

  rewriteButton.addEventListener('click', async function() {
    try {
      await loadSettings(); // 每次點擊時重新加載設置
      if (!apiKey) {
        alert('請先在擴展設置中輸入 API 金鑰');
        return;
      }
      if (!instruction.trim()) {
        alert('改寫要求不能為空，請在擴展設置中輸入改寫要求');
        return;
      }
      
      rewriteButton.disabled = true; // 禁用按鈕
      originalContent = textArea.value; // 保存原始內容
      await rewriteText(); // 執行改寫
      console.log('改寫成功完成');
    } catch (error) {
      console.error('Error in rewrite process:', error);
      alert('改寫過程中發生錯誤: ' + error.message);
    } finally {
      rewriteButton.disabled = false; // 重新啟用按鈕
    }
  });

  undoButton.addEventListener('click', handleUndo);

  buttonContainer.appendChild(rewriteButton);
  buttonContainer.appendChild(undoButton);

  // 將按鈕容器添加到文本區域的父元素中
  const textAreaParent = textArea.parentElement;
  textAreaParent.style.position = 'relative';
  textAreaParent.appendChild(buttonContainer);

  // 添加樣式以確保按鈕顯示在文本區域上方
  const style = document.createElement('style');
  style.textContent = `
    .MuiInputBase-root {
      overflow: visible !important;
    }
  `;
  document.head.appendChild(style);
}

let notificationElement = null;
let countdownInterval = null;
let notificationTimeout = null;
let notificationDisappearInterval = null;
let notificationRemoveTimeout = null;
let lastModelName = '';
let lastApiKeyPrefix = '';

async function showNotification(message, isLoading = true) {
  console.log('開始顯示通知:', message, '是否正在加載:', isLoading);
  
  // 從 message 中提取模型名稱和 API KEY
  const modelMatch = message.match(/模型: (.*?)<br>/);
  const apiKeyMatch = message.match(/API KEY: (.*?)<br>/);
  
  const modelName = modelMatch ? modelMatch[1] : (isLoading ? '未知模型' : lastModelName);
  const apiKeyPrefix = apiKeyMatch ? apiKeyMatch[1] : (isLoading ? '未知' : lastApiKeyPrefix);

  if (isLoading) {
    lastModelName = modelName;
    lastApiKeyPrefix = apiKeyPrefix;
  }

  console.log('通知中的模型名:', modelName);
  console.log('通知的 API KEY 前綴:', apiKeyPrefix);

  // 清除之前的時
  if (notificationTimeout) {
    console.log('清除之前的通知超時');
    clearTimeout(notificationTimeout);
    notificationTimeout = null;
  }

  if (!notificationElement) {
    notificationElement = document.createElement('div');
    notificationElement.style.cssText = `
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
    document.body.appendChild(notificationElement);
  }

  if (!document.getElementById('spinner-style')) {
    const style = document.createElement('style');
    style.id = 'spinner-style';
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
    document.head.appendChild(style);
  }

  notificationElement.innerHTML = `
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
    // 淡入效果設置通知元素的不透明度為1，實現淡入效果
    setTimeout(() => {
      notificationElement.style.opacity = '1';
      console.log('通知淡入完成');
    }, 10); // 延遲10毫秒執行，確保DOM更新

    if (isLoading) {
      console.log('開始讀秒');
      // 清除之前的計時器（如果存在）
      if (countdownInterval) {
        clearInterval(countdownInterval);
      }
      
      let count = 0;
      const countdownElement = document.getElementById('countdown');
      
      if (countdownElement) {
        countdownElement.textContent = count;
      }
      
      countdownInterval = setInterval(() => {
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
        notificationElement.style.transition = 'opacity 0.25s ease-out';
        notificationElement.style.opacity = '0';
        
        setTimeout(() => {
          console.log('通知淡出完成，準備移除通知');
          removeNotification();
          resolve();
        }, 250); // 250毫秒後移除元素，與淡出動畫時間一致
      }, 1200); // 1200毫秒後開始淡出
    }
  });
}

/**
 * 移除通知元素的函數
 * 這個函數負從頁面上移除通知元素，並處理相關的清理工作
 */
function removeNotification() {
  console.log('開始移除通知');
  if (notificationElement && notificationElement.parentNode) {
    notificationElement.parentNode.removeChild(notificationElement);
    console.log('通知元素已從 DOM 中移除');
    notificationElement = null;
    console.log('通知元素引用已清空');
  } else {
    console.log('沒有找到通知元素或元素已被移除，無需移除');
  }
  
  // 清除所有相關的計時器
  clearAllTimers();
}

function clearAllTimers() {
  if (countdownInterval) {
    clearInterval(countdownInterval);
    countdownInterval = null;
    console.log('讀秒計時器已清除');
  }
  if (notificationTimeout) {
    clearTimeout(notificationTimeout);
    notificationTimeout = null;
    console.log('通知超時已清除');
  }
  if (notificationDisappearInterval) {
    clearInterval(notificationDisappearInterval);
    notificationDisappearInterval = null;
    console.log('通知消失計時器已清除');
  }
  if (notificationRemoveTimeout) {
    clearTimeout(notificationRemoveTimeout);
    notificationRemoveTimeout = null;
    console.log('通知移除超時已清除');
  }
}

// 在文件底部添加一個消息監聽器，用於接收來自 popup 的新
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "updateAutoRewritePatterns") {
    updateAutoRewritePatterns(request.patterns);
    sendResponse({success: true});
  }
});

// 初始化時加載設置
loadSettings().catch(console.error);

// 在文件底部添加個新的監聽器
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "updateSettings") {
    chrome.storage.sync.set({
      confirmModel: request.confirmModel,
      confirmContent: request.confirmContent
    }, function() {
      console.log('設置已更新');
      sendResponse({success: true});
    });
    return true; // 保持消息通道開放以進行異步響應
  }
});

// 添加一個新的消息監聽器來處理設置更新
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "updateSettings") {
    console.log('收到設置更新:', request.settings);
    chrome.storage.sync.set(request.settings, function() {
      console.log('設置已更新');
      sendResponse({success: true});
    });
    return true; // 保持消息通道開放以進行步響應
  }
});

// 修改 undoButton 的點擊事件處理函數
function handleUndo() {
  console.log('執行 handleUndo 函數');
  const textArea = document.querySelector('textarea[name="content"]');
  const undoButton = document.getElementById('gpt-undo-button');
  if (textArea && rewriteHistory.length > 0) {
    const previousContent = rewriteHistory.pop();
    console.log('從歷史記錄中取出上一次的內容');
    textArea.value = previousContent;
    textArea.dispatchEvent(new Event('input', { bubbles: true }));
    console.log('已復原到上一次改寫前的內容');

    if (rewriteHistory.length === 0) {
      if (undoButton) {
        undoButton.style.display = 'none';
        console.log('沒有更多歷史記錄，復原按鈕已隱藏');
      }
    }
  } else {
    console.log('無法執行復原操作：找不到文本區域或沒有歷史記錄');
  }
}

// 修改 initializeStockCodeFeature 函數
function initializeStockCodeFeature() {
  // 首先檢查是否應該啟用功能
  if (!shouldEnableFeatures()) {
    console.log('當前頁面不符合啟用股票代號功能條件');
    removeStockCodeFeature();
    return;
  }

  const contentTextarea = document.querySelector('textarea[name="content"]');
  const stockCodeInput = document.querySelector('input[id=":r7:"]');
  
  // 如果找不到必要的元素，則退出函數
  if (!contentTextarea || !stockCodeInput) {
    console.log('找不到必要的元素，股票代號功能未初始化');
    return;
  }

  // 如果股票代號容器已存在，則不重複創建
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

  function updateStockCodeContainerPosition() {
    if (stockCodeInput) {
      const rect = stockCodeInput.getBoundingClientRect();
      stockCodeContainer.style.top = `${rect.top + window.scrollY - stockCodeContainer.offsetHeight + 9}px`;
      stockCodeContainer.style.left = `${rect.right + window.scrollX - stockCodeContainer.offsetWidth + 28}px`;
    }
  }

  function detectStockCodes(text) {
    const stockCodeRegex = /[（(]([0-9]{4})(?:[-\s.]*(?:TW|TWO))?[）)]|[（(]([0-9]{4})[-\s.]+(?:TW|TWO)[）)]/g;
    const matches = text.matchAll(stockCodeRegex);
    const stockCodes = [...new Set([...matches].map(match => match[1] || match[2]))];
    return stockCodes;
  }

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
        font-size: 14px; // 從 12px 改為 14px
        margin: 2px;
      `;
      button.addEventListener('click', () => {
        stockCodeInput.value = code;
        stockCodeInput.dispatchEvent(new Event('input', { bubbles: true }));
        
        stockCodeInput.focus();
        setTimeout(() => {
          stockCodeInput.blur();
        }, 10);
      });
      stockCodeContainer.appendChild(button);
    });
    updateStockCodeContainerPosition();
  }

  function handleContentChange() {
    const content = contentTextarea.value;
    const stockCodes = detectStockCodes(content);
    updateStockCodeButtons(stockCodes);
    
    if (stockCodes.length > 0 && !stockCodeInput.value) {
      stockCodeInput.value = stockCodes[0];
      stockCodeInput.dispatchEvent(new Event('input', { bubbles: true }));
      
      stockCodeInput.focus();
      setTimeout(() => {
        stockCodeInput.blur();
      }, 10);
    }
  }

  contentTextarea.addEventListener('input', handleContentChange);
  window.addEventListener('resize', updateStockCodeContainerPosition);
  window.addEventListener('scroll', updateStockCodeContainerPosition);
  
  // 初始檢查
  handleContentChange();

  // 將 'mouseup' 事件監聽器改為 'dblclick'
  contentTextarea.addEventListener('dblclick', async function(event) {
    console.log('檢測到雙擊事件');
    const selectedText = window.getSelection().toString();
    
    console.log('選中的文本:', selectedText);
    if (selectedText.trim() !== '' && selectedText.length <= 10) {
      const start = Math.max(0, this.selectionStart - 4);
      const end = Math.min(this.value.length, this.selectionEnd + 4);
      const extendedText = this.value.substring(start, end);
      
      console.log('選中範圍:', { start: this.selectionStart, end: this.selectionEnd });
      console.log('擴展後的範圍:', { start, end });
      console.log('擴展檢查的文本:', extendedText);
      
      const matchResult = findSpecialText(extendedText);
      if (matchResult) {
        console.log('找到匹配的特殊文本:', matchResult);
        try {
          const settings = await loadSettings();
          if (!apiKey || !shortInstruction.trim()) {
            console.log('API 金鑰或短文本改寫指令未設置，跳過自動改寫');
            return;
          }
          
          let shouldProceed = true;
          
          // 確認模型和內容（根據設置）
          if (settings.confirmModel || settings.confirmContent) {
            const selectedModel = settings.autoRewriteModel || model;
            const confirmMessage = `確定要使用 ${selectedModel} 模型自動改寫以下內容嗎？\n\n文本：${matchResult.matchedText}\n\n指令：${shortInstruction}`;
            shouldProceed = confirm(confirmMessage);
          }
          
          if (shouldProceed) {
            console.log('開始自動改寫流程');
            selectedOriginalContent = this.value;
            console.log('準備改寫的文本:', matchResult.matchedText);
            const rewrittenText = await rewriteText(matchResult.matchedText, true);
            
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
              removeNotification();
              
              // 顯示改寫完成的通知
              console.log('準備顯示改寫完成通知');
              await showNotification('自動改寫已完成', false);
              console.log('改寫完成通知顯示結束');
              
              console.log('反白自動改寫完成');
            } else {
              console.log('API 返回的改寫文本無效，或改寫結果與原文相同');
              removeNotification();
            }
          } else {
            console.log('用戶取消了自動改寫操作');
            removeNotification();
          }
        } catch (error) {
          console.error('自動改寫過程中發生錯誤:', error);
          alert(`自動改寫過程中發生錯誤: ${error.message}\n請檢查您的設置並重試。`);
        }
      } else {
        console.log('未找到匹配的特殊文本，擴展檢查的文本為:', extendedText);
      }
    } else {
      console.log('未選中任何文本或選中文本超過10個字');
    }
  });
}

// 新增：移除股票代號功能的函數
function removeStockCodeFeature() {
  const stockCodeContainer = document.getElementById('stock-code-container');
  if (stockCodeContainer) {
    stockCodeContainer.remove();
  }
  // 移除相關的事件監聽器
  const contentTextarea = document.querySelector('textarea[name="content"]');
  if (contentTextarea) {
    contentTextarea.removeEventListener('input', handleContentChange);
  }
  window.removeEventListener('resize', updateStockCodeContainerPosition);
  window.removeEventListener('scroll', updateStockCodeContainerPosition);
}

// 修改 initializeExtension 函數
async function initializeExtension() {
  try {
    if (!shouldEnableFeatures()) {
      console.log('當前頁面不符合啟用條件，不初始化擴展');
      removeStockCodeFeature(); // 確保在不符合條件的頁面上移除股票代號功能
      return;
    }

    await loadSettings();
    addRewriteButton();
    initializeStockCodeFeature();
  } catch (error) {
    console.error('初始化擴展時出錯:', error);
  }
}

// 確保在頁面加載完成後初始化擴展
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeExtension);
} else {
  initializeExtension();
}

// 監聽鍵盤事件
document.addEventListener('keydown', function(event) {
  // 檢查是否按下了 Ctrl+Z (Windows) 或 Cmd+Z (Mac)
  if ((event.ctrlKey || event.metaKey) && event.key === 'z') {
    console.log('檢測到 Ctrl+Z 或 Cmd+Z 快捷鍵');
    // 防止默認的撤銷行為
    event.preventDefault();
    
    // 直接調用 handleUndo 函數
    handleUndo();
  }
});

// 自定義撤銷功能
function undoLastRewrite() {
  // 在這裡實現您的撤銷邏輯
  console.log('Undo last rewrite');
  // 例如：發送消息給背景腳本來處理撤銷操作
  chrome.runtime.sendMessage({action: "undoRewrite"}, function(response) {
    if (response && response.success) {
      console.log('撤銷成功');
    } else {
      console.error('撤銷失敗');
    }
  });
}

// 創建新的命名空間
const AIAssistant = {
  init: function() {
    // 初始化代碼
  },
  
  processUserInput: function(input) {
    // 處理用戶輸入
  },
  
  displayResponse: function(response) {
    // 顯示 AI 回應
  }
};

// 在頁面加載完成後初始化
document.addEventListener('DOMContentLoaded', AIAssistant.init);

chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
  if (request.action === "activateAIAssistant") {
    AIAssistant.init();
  }
  // 其他現有的消息處理...
});

