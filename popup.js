document.addEventListener('DOMContentLoaded', function() {
  const apiKeyInput = document.getElementById('api-key');
  const modelSelect = document.getElementById('model-select');
  const instructionInput = document.getElementById('instruction');
  const shortInstructionInput = document.getElementById('shortInstruction');
  const autoRewritePatternsInput = document.getElementById('autoRewritePatterns');
  const saveButton = document.getElementById('save');
  const rewriteButton = document.getElementById('rewrite');
  const confirmModelCheckbox = document.getElementById('confirmModel');
  const confirmContentCheckbox = document.getElementById('confirmContent');
  const fullRewriteModelSelect = document.getElementById('fullRewriteModel');
  const shortRewriteModelSelect = document.getElementById('shortRewriteModel');
  const autoRewriteModelSelect = document.getElementById('autoRewriteModel');
  const aiAssistantButton = document.getElementById('aiAssistant');
  
  // 暫時隱藏自動改寫按鈕
  rewriteButton.style.display = 'none';
  
  let apiKeys = {
    'openai': '',
    'gemini-1.5-flash': ''
  };

  // 載入保存的設置
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

  function updateApiKeyInput() {
    apiKeyInput.value = apiKeys[modelSelect.value] || '';
  }

  // 當模型選擇改變時更新 API 金鑰輸入框
  modelSelect.addEventListener('change', updateApiKeyInput);

  // 保存設置
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

  // 自動保存指令和匹配模式
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

  // 自動保存勾選狀態
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

  // 添加事件監聽器來保存模型選擇
  fullRewriteModelSelect.addEventListener('change', function() {
    saveModelSelection('fullRewriteModel', this.value);
  });

  shortRewriteModelSelect.addEventListener('change', function() {
    saveModelSelection('shortRewriteModel', this.value);
  });

  autoRewriteModelSelect.addEventListener('change', function() {
    saveModelSelection('autoRewriteModel', this.value);
  });

  function saveModelSelection(modelType, value) {
    let settings = {};
    settings[modelType] = value;
    chrome.storage.sync.set(settings, function() {
      console.log(`${modelType} 已更新:`, value);
      updateContentScript(settings);
    });
  }

  // 發送改寫請求
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

  // 添加分頁切換功能
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

  // 添加主分頁切換功能
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

  // 在 DOMContentLoaded 事件監聽器的末尾添加初始化調用
  sendAutoRewritePatternsUpdate();

  // 添加新的函數來更新 content.js 的設置
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

  aiAssistantButton.addEventListener('click', function() {
    chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
      chrome.tabs.sendMessage(tabs[0].id, {action: "activateAIAssistant"});
    });
  });
});
