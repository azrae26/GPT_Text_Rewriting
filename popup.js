/**
 * popup.js - 擴充功能彈出視窗的主要腳本
 * 功能：管理 API 金鑰、改寫設置、模型選擇等配置項目
 */

document.addEventListener('DOMContentLoaded', function() {
  console.log('DOM 載入完成，開始初始化...');
  
  // 獲取所有需要的 DOM 元素
  const apiKeyInput = document.getElementById('api-key');                          // API 金鑰輸入
  const modelSelect = document.getElementById('model-select');                     // 模型選擇
  const instructionInput = document.getElementById('instruction');                 // 改寫指令
  const shortInstructionInput = document.getElementById('shortInstruction');       // 短文本指令
  const autoRewritePatternsInput = document.getElementById('autoRewritePatterns'); // 自動改寫模式
  const translateInstructionInput = document.getElementById('translateInstruction'); // 翻譯指令
  const saveButton = document.getElementById('save');                              // 保存按鈕
  const rewriteButton = document.getElementById('rewrite');                        // 改寫按鈕
  const confirmModelCheckbox = document.getElementById('confirmModel');            // 確認模型選項
  const confirmContentCheckbox = document.getElementById('confirmContent');        // 確認內容選項
  const fullRewriteModelSelect = document.getElementById('fullRewriteModel');      // 全文改寫模型
  const shortRewriteModelSelect = document.getElementById('shortRewriteModel');    // 短文本模型
  const autoRewriteModelSelect = document.getElementById('autoRewriteModel');      // 自動改寫模型
  const translateModelSelect = document.getElementById('translateModel');          // 翻譯模型
  const aiAssistantButton = document.getElementById('aiAssistant');               // AI 助手按鈕
  const removeHashCheckbox = document.getElementById('removeHash');                // 刪除 ## 勾選框
  const removeStarCheckbox = document.getElementById('removeStar');                // 刪除 ** 勾選框

  console.log('DOM 元素初始化完成');
  console.log('removeHashCheckbox:', removeHashCheckbox ? '已找到' : '未找到');
  console.log('removeStarCheckbox:', removeStarCheckbox ? '已找到' : '未找到');

  // 暫時隱藏自動改寫按鈕（功能開發中）
  rewriteButton.style.display = 'none';

  // API 金鑰存儲對象
  let apiKeys = {
    'openai': '',
    'gemini-1.5-flash': ''
  };

  // 從 Chrome 儲存空間載入設置
  chrome.storage.sync.get([
    'apiKeys',
    'instruction',
    'shortInstruction',
    'autoRewritePatterns',
    'confirmModel',
    'confirmContent',
    'fullRewriteModel',
    'shortRewriteModel',
    'autoRewriteModel',
    'translateModel',
    'translateInstruction',
    'isFirstTime',
    'removeHash',
    'removeStar'
  ], function(result) {
    console.log('載入儲存的設置:', result);
    const isFirstTime = result.isFirstTime === true;

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
    if (result.translateModel) translateModelSelect.value = result.translateModel;
    if (result.translateInstruction) translateInstructionInput.value = result.translateInstruction;
    if (result.removeHash !== undefined) {
      console.log('設置 removeHash checkbox 狀態:', result.removeHash);
      removeHashCheckbox.checked = result.removeHash;
    }
    if (result.removeStar !== undefined) {
      console.log('設置 removeStar checkbox 狀態:', result.removeStar);
      removeStarCheckbox.checked = result.removeStar;
    }
    updateApiKeyInput();

    // Load default settings if it's the first time and DefaultSettings is defined
    if (isFirstTime && typeof DefaultSettings !== 'undefined') {
      loadDefaultSettings();
    }
  });

  // Function to load default settings
  function loadDefaultSettings() {
    instructionInput.value = DefaultSettings.fullRewriteInstruction;
    shortInstructionInput.value = DefaultSettings.shortRewriteInstruction;
    autoRewritePatternsInput.value = DefaultSettings.autoRewritePatterns;
    translateInstructionInput.value = DefaultSettings.translateInstruction;
    fullRewriteModelSelect.value = DefaultSettings.fullRewriteModel || 'gemini-1.5-flash';
    shortRewriteModelSelect.value = DefaultSettings.shortRewriteModel || 'gemini-1.5-flash';
    autoRewriteModelSelect.value = DefaultSettings.autoRewriteModel || 'gemini-1.5-flash';
    translateModelSelect.value = DefaultSettings.translateModel || 'gemini-1.5-flash';
    //Set isFirstTime to false only after successfully loading default settings.
    chrome.storage.sync.set({ isFirstTime: false }, function() {
      console.log('預設設定已保存');
    });
  }


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
      autoRewriteModel: autoRewriteModelSelect.value,
      translateModel: translateModelSelect.value,
      translateInstruction: translateInstructionInput.value,
      removeHash: removeHashCheckbox.checked,
      removeStar: removeStarCheckbox.checked
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

  translateInstructionInput.addEventListener('input', function() {
    chrome.storage.sync.set({ translateInstruction: translateInstructionInput.value });
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

  translateModelSelect.addEventListener('change', function() {
    saveModelSelection('translateModel', this.value);
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
        autoRewriteModel: autoRewriteModelSelect.value,
        translateModel: translateModelSelect.value,
        translateInstruction: translateInstructionInput.value,
        removeHash: removeHashCheckbox.checked,
        removeStar: removeStarCheckbox.checked
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
  if (aiAssistantButton) {
    aiAssistantButton.addEventListener('click', function() {
      chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
        chrome.tabs.sendMessage(tabs[0].id, {action: "activateAIAssistant"});
      });
    });
  }

  // 新增的勾選框事件監聽器
  if (removeHashCheckbox) {
    removeHashCheckbox.addEventListener('change', function() {
      console.log('removeHash checkbox 變更事件觸發');
      console.log('新的狀態:', removeHashCheckbox.checked);
      chrome.storage.sync.set({ removeHash: removeHashCheckbox.checked }, function() {
        console.log('removeHash 已保存到 storage:', removeHashCheckbox.checked);
      });
    });
  } else {
    console.error('removeHash checkbox 元素未找到');
  }

  if (removeStarCheckbox) {
    removeStarCheckbox.addEventListener('change', function() {
      console.log('removeStar checkbox 變更事件觸發');
      console.log('新的狀態:', removeStarCheckbox.checked);
      chrome.storage.sync.set({ removeStar: removeStarCheckbox.checked }, function() {
        console.log('removeStar 已保存到 storage:', removeStarCheckbox.checked);
      });
    });
  } else {
    console.error('removeStar checkbox 元素未找到');
  }

  // 初始化 TranslateManager
  console.log('準備初始化 TranslateManager...');
  if (typeof window.TranslateManager !== 'undefined') {
    console.log('TranslateManager 存在，設置 checkboxes');
    window.TranslateManager.setCheckboxes(removeHashCheckbox, removeStarCheckbox);
  } else {
    console.error('TranslateManager 未定義');
  }
});
