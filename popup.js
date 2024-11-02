/**
 * popup.js - 擴充功能彈出視窗的主要腳本
 * 功能：管理 API 金鑰、改寫設置、模型選擇等配置項目
 */

document.addEventListener('DOMContentLoaded', function() {
  // 獲取所有需要的 DOM 元素
  const apiKeyInput = document.getElementById('api-key');                          // API 金鑰輸入
  const modelSelect = document.getElementById('model-select');                     // 模型選擇
  const instructionInput = document.getElementById('instruction');                 // 改寫指令
  const shortInstructionInput = document.getElementById('shortInstruction');       // 短文本指令
  const autoRewritePatternsInput = document.getElementById('autoRewritePatterns'); // 自動改寫模式
  const saveButton = document.getElementById('save');                              // 保存按鈕
  const rewriteButton = document.getElementById('rewrite');                        // 改寫按鈕
  const confirmModelCheckbox = document.getElementById('confirmModel');            // 確認模型選項
  const confirmContentCheckbox = document.getElementById('confirmContent');        // 確認內容選項
  const fullRewriteModelSelect = document.getElementById('fullRewriteModel');      // 全文改寫模型
  const shortRewriteModelSelect = document.getElementById('shortRewriteModel');    // 短文本模型
  const autoRewriteModelSelect = document.getElementById('autoRewriteModel');      // 自動改寫模型
  const aiAssistantButton = document.getElementById('aiAssistant');               // AI 助手按鈕
  
  // 暫時隱藏自動改寫按鈕（功能開發中）
  rewriteButton.style.display = 'none';
  
  // API 金鑰存儲對象
  let apiKeys = {
    'openai': '',
    'gemini-1.5-flash': ''
  };

  // 從 Chrome 儲存空間載入設置
  chrome.storage.sync.get(['apiKeys', 'instruction', 'shortInstruction', 'autoRewritePatterns', 'confirmModel', 'confirmContent', 'fullRewriteModel', 'shortRewriteModel', 'autoRewriteModel'], function(result) {
    if (result.apiKeys) {
      apiKeys = result.apiKeys;
    }
    if (result.instruction) instructionInput.value = result.instruction;
    if (result.shortInstruction) shortInstructionInput.value = result.shortInstruction;
    if (result.autoRewritePatterns) autoRewritePatternsInput.value = result.autoRewritePatterns;
    if (result.confirmModel !== undefined) confirmModelCheckbox.checked = result.confirmModel;
    if (result.confirmContent !== undefined) confirmContentCheckbox.checked = result.confirmContent;
    if (result.fullRewriteModel) fullRewriteModelSelect.value = result.fullRewriteModel;
    if (result.shortRewriteModel) shortRewriteModelSelect.value = result.shortRewriteModel;
    if (result.autoRewriteModel) autoRewriteModelSelect.value = result.autoRewriteModel;
    updateApiKeyInput();
  });

  // 更新 API 金鑰輸入框顯示
  function updateApiKeyInput() {
    apiKeyInput.value = apiKeys[modelSelect.value] || '';
  }

  // 模型選擇變更處理
  modelSelect.addEventListener('change', updateApiKeyInput);

  // 保存所有設置
  saveButton.addEventListener('click', function() {
    const selectedModel = modelSelect.value;
    const apiKey = apiKeyInput.value;
    
    const keyName = selectedModel === 'openai' ? 'openai' : selectedModel;
    apiKeys[keyName] = apiKey;

    const settings = {
      apiKeys: apiKeys,
      instruction: instructionInput.value,
      shortInstruction: shortInstructionInput.value,
      autoRewritePatterns: autoRewritePatternsInput.value,
      confirmModel: confirmModelCheckbox.checked,
      confirmContent: confirmContentCheckbox.checked,
      fullRewriteModel: fullRewriteModelSelect.value,
      shortRewriteModel: shortRewriteModelSelect.value,
      autoRewriteModel: autoRewriteModelSelect.value
    };

    chrome.storage.sync.set(settings, function() {
      console.log('設置已保存:', settings);
      alert('設置已保存');
      updateContentScript(settings);
    });
  });

  // 自動保存各項設置的事件監聽器
  instructionInput.addEventListener('input', function() {
    chrome.storage.sync.set({ instruction: instructionInput.value });
  });

  shortInstructionInput.addEventListener('input', function() {
    chrome.storage.sync.set({ shortInstruction: shortInstructionInput.value });
  });

  autoRewritePatternsInput.addEventListener('input', function() {
    chrome.storage.sync.set({ autoRewritePatterns: autoRewritePatternsInput.value });
    sendAutoRewritePatternsUpdate();
  });

  // 確認選項變更處理
  confirmModelCheckbox.addEventListener('change', function() {
    chrome.storage.sync.set({ confirmModel: confirmModelCheckbox.checked }, function() {
      console.log('確認模型設置已更新:', confirmModelCheckbox.checked);
      chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
        chrome.tabs.sendMessage(tabs[0].id, {
          action: "updateSettings",
          settings: { confirmModel: confirmModelCheckbox.checked }
        });
      });
    });
  });

  confirmContentCheckbox.addEventListener('change', function() {
    chrome.storage.sync.set({ confirmContent: confirmContentCheckbox.checked }, function() {
      console.log('確認內容設置已更新:', confirmContentCheckbox.checked);
      chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
        chrome.tabs.sendMessage(tabs[0].id, {
          action: "updateSettings",
          settings: { confirmContent: confirmContentCheckbox.checked }
        });
      });
    });
  });

  // 模型選擇變更處理
  fullRewriteModelSelect.addEventListener('change', function() {
    saveModelSelection('fullRewriteModel', this.value);
  });

  shortRewriteModelSelect.addEventListener('change', function() {
    saveModelSelection('shortRewriteModel', this.value);
  });

  autoRewriteModelSelect.addEventListener('change', function() {
    saveModelSelection('autoRewriteModel', this.value);
  });

  // 保存模型選擇
  function saveModelSelection(modelType, value) {
    let settings = {};
    settings[modelType] = value;
    chrome.storage.sync.set(settings, function() {
      console.log(`${modelType} 已更新:`, value);
      updateContentScript(settings);
    });
  }

  // 改寫請求處理
  rewriteButton.addEventListener('click', function() {
    chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
      chrome.tabs.sendMessage(tabs[0].id, {
        action: "rewrite",
        apiKeys: {
          'openai': apiKeys['openai'],
          'gemini-1.5-flash': apiKeys['gemini-1.5-flash']
        },
        model: modelSelect.value,
        instruction: instructionInput.value,
        shortInstruction: shortInstructionInput.value,
        autoRewritePatterns: autoRewritePatternsInput.value,
        confirmModel: confirmModelCheckbox.checked,
        confirmContent: confirmContentCheckbox.checked,
        fullRewriteModel: fullRewriteModelSelect.value,
        shortRewriteModel: shortRewriteModelSelect.value,
        autoRewriteModel: autoRewriteModelSelect.value
      }, function(response) {
        if (response && response.success) {
          console.log('改寫請求已發送');
        } else {
          console.error('發送改寫請求失敗');
        }
      });
    });
  });

  // 分頁切換功能
  const tabs = document.querySelectorAll('.tab');
  const tabContents = document.querySelectorAll('.tab-content');

  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const tabName = tab.getAttribute('data-tab');
      
      tabs.forEach(t => t.classList.remove('active'));
      tabContents.forEach(c => c.classList.remove('active'));
      
      tab.classList.add('active');
      document.getElementById(`${tabName}-tab`).classList.add('active');
    });
  });

  // 主分頁切換功能
  const mainTabs = document.querySelectorAll('.main-tab');
  const mainTabContents = document.querySelectorAll('.main-tab-content');

  mainTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const tabName = tab.getAttribute('data-tab');
      
      mainTabs.forEach(t => t.classList.remove('active'));
      mainTabContents.forEach(c => c.classList.remove('active'));
      
      tab.classList.add('active');
      document.getElementById(`${tabName}-tab`).classList.add('active');
    });
  });

  // 更新自動改寫模式
  function sendAutoRewritePatternsUpdate() {
    chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
      chrome.tabs.sendMessage(tabs[0].id, {
        action: "updateAutoRewritePatterns",
        patterns: autoRewritePatternsInput.value
      }, function(response) {
        if (response && response.success) {
          console.log('自動改寫匹配模式已更新');
        } else {
          console.error('更新自動改寫匹配模式失敗');
        }
      });
    });
  }

  // 初始化自動改寫模式
  sendAutoRewritePatternsUpdate();

  // 更新內容腳本設置
  function updateContentScript(settings) {
    chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
      chrome.tabs.sendMessage(tabs[0].id, {
        action: "updateSettings",
        settings: settings
      }, function(response) {
        if (response && response.success) {
          console.log('設置已成功更新到 content.js');
        } else {
          console.error('更新 content.js 設置失敗');
        }
      });
    });
  }

  // AI 助手功能啟動
  aiAssistantButton.addEventListener('click', function() {
    chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
      chrome.tabs.sendMessage(tabs[0].id, {action: "activateAIAssistant"});
    });
  });
});
