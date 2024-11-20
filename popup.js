/**
 * popup.js - 擴充功能彈出視窗的主要腳本
 * 功能：管理 API 金鑰、改寫設置、模型選擇等配置項目
 */

document.addEventListener('DOMContentLoaded', async function() {
  console.log('DOM 載入完成，開始初始化...');
  
  // 1. DOM 元素獲取 (按功能分組)
  // API 和模型相關
  const apiKeyInput = document.getElementById('api-key');
  const modelSelect = document.getElementById('model-select');
  
  // 改寫相關
  const instructionInput = document.getElementById('instruction');
  const shortInstructionInput = document.getElementById('shortInstruction');
  const autoRewritePatternsInput = document.getElementById('autoRewritePatterns');
  const fullRewriteModelSelect = document.getElementById('fullRewriteModel');
  const shortRewriteModelSelect = document.getElementById('shortRewriteModel');
  const autoRewriteModelSelect = document.getElementById('autoRewriteModel');
  const rewriteButton = document.getElementById('rewrite');
  
  // 翻譯相關
  const translateModelSelect = document.getElementById('translateModel');
  const translateInstructionInput = document.getElementById('translateInstruction');
  const removeHashCheckbox = document.getElementById('removeHash');
  const removeStarCheckbox = document.getElementById('removeStar');
  
  // 關鍵要點相關
  const summaryModelSelect = document.getElementById('summaryModel');
  const summaryInstructionInput = document.getElementById('summaryInstruction');
  
  // 其他按鈕
  const saveButton = document.getElementById('save');
  const aiAssistantButton = document.getElementById('aiAssistant');

  // 2. 初始化設定
  let apiKeys = {
    'openai': '',
    'gemini-1.5-flash': ''
  };

  // 載入使用者設定，如果沒有設定，則使用預設設定
  let settings = await GlobalSettings.loadSettings();
  console.log('載入儲存的設置:', settings);
  
  // 如果首次載入，則應用預設設定
  if (settings.firstRun === true && typeof DefaultSettings !== 'undefined') {
    console.log('首次載入，應用預設設定');
    await GlobalSettings.saveSettings();
  } else {
    console.log('非首次載入，應用已保存的設定');
    // API 相關
    apiKeys = settings.apiKeys || {};
    
    // 改寫相關
    instructionInput.value = settings.instruction || '';
    shortInstructionInput.value = settings.shortInstruction || '';
    autoRewritePatternsInput.value = settings.autoRewritePatterns || '';
    fullRewriteModelSelect.value = settings.fullRewriteModel || 'gemini-1.5-flash';
    shortRewriteModelSelect.value = settings.shortRewriteModel || 'gemini-1.5-flash';
    autoRewriteModelSelect.value = settings.autoRewriteModel || 'gemini-1.5-flash';
    
    // 翻譯相關
    translateModelSelect.value = settings.translateModel || 'gemini-1.5-flash'; // 預設使用 Gemini 1.5 Flash
    translateInstructionInput.value = settings.translateInstruction || ''; // 預設為空
    removeHashCheckbox.checked = settings.removeHash !== undefined ? settings.removeHash : true; // 預設為勾選
    removeStarCheckbox.checked = settings.removeStar !== undefined ? settings.removeStar : true; // 預設為勾選
    
    // 關鍵要點相關
    summaryModelSelect.value = settings.summaryModel || 'gemini-1.5-flash'; // 預設使用 Gemini 1.5 Flash
    summaryInstructionInput.value = settings.summaryInstruction || ''; // 預設為空
  }
  
  updateApiKeyInput();

  // 3. API 和模型相關事件處理
  // API 金鑰輸入
  function updateApiKeyInput() {
    apiKeyInput.value = apiKeys[modelSelect.value] || '';
  }

  // 當 API 金鑰輸入變更時自動保存
  apiKeyInput.addEventListener('input', async function() {
    apiKeys[modelSelect.value] = this.value;
    await GlobalSettings.saveSingleSetting('apiKeys', apiKeys);
    updateContentScript();
  });

  // API 模型選擇
  modelSelect.addEventListener('change', updateApiKeyInput);

  // 4. 所有指令輸入相關事件處理
  // 全文改寫指令
  instructionInput.addEventListener('input', async function() {
    await GlobalSettings.saveSingleSetting('instruction', instructionInput.value);
  });

  // 短改寫指令
  shortInstructionInput.addEventListener('input', async function() {
    await GlobalSettings.saveSingleSetting('shortInstruction', shortInstructionInput.value);
  });

  // 自動改寫匹配模式
  autoRewritePatternsInput.addEventListener('input', async function() {
    await GlobalSettings.saveSingleSetting('autoRewritePatterns', autoRewritePatternsInput.value);
    sendAutoRewritePatternsUpdate();
  });

  // 翻譯指令
  translateInstructionInput.addEventListener('input', async function() {
    await GlobalSettings.saveSingleSetting('translateInstruction', translateInstructionInput.value);
  });

  // 關鍵要點指令
  summaryInstructionInput.addEventListener('input', async function() {
    await GlobalSettings.saveSingleSetting('summaryInstruction', summaryInstructionInput.value);
  });

  // 5. 所有模型選擇相關事件處理
  // 全改寫模型選擇
  fullRewriteModelSelect.addEventListener('change', async function() {
    await GlobalSettings.saveModelSelection('fullRewriteModel', this.value);
    updateContentScript();
  });
  // 短改寫模型選擇
  shortRewriteModelSelect.addEventListener('change', async function() {
    await GlobalSettings.saveModelSelection('shortRewriteModel', this.value);
    updateContentScript();
  });
  // 自動改寫模型選擇
  autoRewriteModelSelect.addEventListener('change', async function() {
    await GlobalSettings.saveModelSelection('autoRewriteModel', this.value);
    updateContentScript();
  });

  // 6. 翻譯相關事件處理
  // 翻譯模型選擇
  translateModelSelect.addEventListener('change', async function() {
    await GlobalSettings.saveModelSelection('translateModel', this.value);
    updateContentScript();
  });
  // 移除##設置
  removeHashCheckbox.addEventListener('change', async function() {
    await GlobalSettings.saveSingleSetting('removeHash', removeHashCheckbox.checked);
    console.log('移除##設置已更新:', removeHashCheckbox.checked);
    updateContentScript();
  });
  // 移除**設置
  removeStarCheckbox.addEventListener('change', async function() {
    await GlobalSettings.saveSingleSetting('removeStar', removeStarCheckbox.checked);
    console.log('移除**設置已更新:', removeStarCheckbox.checked);
    updateContentScript();
  });

  // 7. 關鍵要點相關事件處理
  // 關鍵要點模型選擇
  summaryModelSelect.addEventListener('change', async function() {
    await GlobalSettings.saveModelSelection('summaryModel', this.value);
    updateContentScript();
  });

  // 8. 保存按鈕事件處理
  saveButton.addEventListener('click', async function() {
    apiKeys[modelSelect.value] = apiKeyInput.value;
    await GlobalSettings.saveSettings({
      apiKeys: apiKeys, // API 金鑰
      instruction: instructionInput.value, // 改寫指令
      shortInstruction: shortInstructionInput.value, // 短改寫指令
      autoRewritePatterns: autoRewritePatternsInput.value, // 自動改寫匹配模式
      fullRewriteModel: fullRewriteModelSelect.value, // 全改寫模型
      shortRewriteModel: shortRewriteModelSelect.value, // 短改寫模型
      autoRewriteModel: autoRewriteModelSelect.value, // 自動改寫模型
      translateModel: translateModelSelect.value, // 翻譯模型
      translateInstruction: translateInstructionInput.value, // 翻譯指令
      removeHash: removeHashCheckbox.checked, // 移除##設置
      removeStar: removeStarCheckbox.checked, // 移除**設置
      summaryModel: summaryModelSelect.value, // 關鍵要點模型
      summaryInstruction: summaryInstructionInput.value // 關鍵要點指令
    });
    console.log('設置已保存');
    alert('設置已保存');
    updateContentScript();
  });

  // 9. 功能按鈕事件處理
  rewriteButton.addEventListener('click', function() {
    chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
      chrome.tabs.sendMessage(tabs[0].id, {
        action: "rewrite", // 改寫請求
        apiKeys: apiKeys, // API 金鑰
        model: modelSelect.value, // API 模型
        instruction: instructionInput.value, // 改寫指令
        shortInstruction: shortInstructionInput.value, // 短改寫指令
        autoRewritePatterns: autoRewritePatternsInput.value, // 自動改寫匹配模式
        fullRewriteModel: fullRewriteModelSelect.value, // 全改寫模型
        shortRewriteModel: shortRewriteModelSelect.value, // 短改寫模型
        autoRewriteModel: autoRewriteModelSelect.value, // 自動改寫模型
        translateModel: translateModelSelect.value, // 翻譯模型
        translateInstruction: translateInstructionInput.value, // 翻譯指令
        removeHash: removeHashCheckbox.checked, // 移除##設置
        removeStar: removeStarCheckbox.checked // 移除**設置
      }, function(response) {
        if (response && response.success) {
          console.log('改寫請求已發送');
        } else {
          console.error('發送改寫請求失敗');
        }
      });
    });
  });

  // AI 助理按鈕事件處理
  if (aiAssistantButton) {
    aiAssistantButton.addEventListener('click', function() {
      chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
        chrome.tabs.sendMessage(tabs[0].id, {action: "activateAIAssistant"});
      });
    });
  }

  // 9. UI 相關功能
  // 分頁切換功能
  const tabs = document.querySelectorAll('.tab');
  const tabContents = document.querySelectorAll('.tab-content');

  tabs.forEach(tab => {
    tab.addEventListener('click', function() {
      const tabName = this.getAttribute('data-tab');
      tabs.forEach(t => t.classList.remove('active'));
      tabContents.forEach(c => c.classList.remove('active'));
      this.classList.add('active');
      document.getElementById(`${tabName}-tab`).classList.add('active');
    });
  });

  // 主分頁切換功能
  const mainTabs = document.querySelectorAll('.main-tab');
  const mainTabContents = document.querySelectorAll('.main-tab-content');
  // 主分頁切換功能
  mainTabs.forEach(tab => {
    tab.addEventListener('click', function() {
      const tabName = this.getAttribute('data-tab');
      mainTabs.forEach(t => t.classList.remove('active'));
      mainTabContents.forEach(c => c.classList.remove('active'));
      tab.classList.add('active');
      document.getElementById(`${tabName}-tab`).classList.add('active');
    });
  });

  // 10. 輔助功能
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

  // 更新 content.js 設置
  async function updateContentScript() {
    const settings = await GlobalSettings.loadSettings();
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
});
