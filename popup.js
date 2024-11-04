/**
 * popup.js - 擴充功能彈出視窗的主要腳本
 * 功能：管理 API 金鑰、改寫設置、模型選擇等配置項目
 */

document.addEventListener('DOMContentLoaded', async function() {
  console.log('DOM 載入完成，開始初始化...');
  
  // 獲取所有需要的 DOM 元素，白話文：獲取頁面上的元素
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
  const settings = await GlobalSettings.loadSettings();
  console.log('載入儲存的設置:', settings);

  if (settings.firstRun === true && typeof DefaultSettings !== 'undefined') {
    console.log('首次載入，應用預設設定');
    await GlobalSettings.saveSettings();
  } else {
    console.log('非首次載入，應用已保存的設定');
    apiKeys = settings.apiKeys || {};
    instructionInput.value = settings.instruction || '';
    shortInstructionInput.value = settings.shortInstruction || '';
    autoRewritePatternsInput.value = settings.autoRewritePatterns || '';
    confirmModelCheckbox.checked = settings.confirmModel || false;
    confirmContentCheckbox.checked = settings.confirmContent || false;
    fullRewriteModelSelect.value = settings.fullRewriteModel || 'gemini-1.5-flash';
    shortRewriteModelSelect.value = settings.shortRewriteModel || 'gemini-1.5-flash';
    autoRewriteModelSelect.value = settings.autoRewriteModel || 'gemini-1.5-flash';
    translateModelSelect.value = settings.translateModel || 'gemini-1.5-flash';
    translateInstructionInput.value = settings.translateInstruction || '';
    removeHashCheckbox.checked = settings.removeHash !== undefined ? settings.removeHash : true;
    removeStarCheckbox.checked = settings.removeStar !== undefined ? settings.removeStar : true;
  }
  updateApiKeyInput();

  // 更新 API 金鑰輸入框顯示
  function updateApiKeyInput() {
    apiKeyInput.value = apiKeys[modelSelect.value] || '';
  }

  // 模型選擇變更處理
  modelSelect.addEventListener('change', updateApiKeyInput);

  // 保存所有設置
  saveButton.addEventListener('click', async function() {
    apiKeys[modelSelect.value] = apiKeyInput.value;
    await GlobalSettings.saveSettings({
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
    });
    console.log('設置已保存');
    alert('設置已保存');
    updateContentScript();
  });

  // 自動保存各項設置的事件監聽器
  instructionInput.addEventListener('input', async function() {
    await GlobalSettings.saveSingleSetting('instruction', instructionInput.value);
  });

  shortInstructionInput.addEventListener('input', async function() {
    await GlobalSettings.saveSingleSetting('shortInstruction', shortInstructionInput.value);
  });

  autoRewritePatternsInput.addEventListener('input', async function() {
    await GlobalSettings.saveSingleSetting('autoRewritePatterns', autoRewritePatternsInput.value);
    sendAutoRewritePatternsUpdate();
  });

  translateInstructionInput.addEventListener('input', async function() {
    await GlobalSettings.saveSingleSetting('translateInstruction', translateInstructionInput.value);
  });

  // 確認選項變更處理
  confirmModelCheckbox.addEventListener('change', async function() {
    await GlobalSettings.saveSingleSetting('confirmModel', confirmModelCheckbox.checked);
    console.log('確認模型設置已更新:', confirmModelCheckbox.checked);
    updateContentScript();
  });

  confirmContentCheckbox.addEventListener('change', async function() {
    await GlobalSettings.saveSingleSetting('confirmContent', confirmContentCheckbox.checked);
    console.log('確認內容設置已更新:', confirmContentCheckbox.checked);
    updateContentScript();
  });

  // 移除標記符號選項變更處理
  removeHashCheckbox.addEventListener('change', async function() {
    await GlobalSettings.saveSingleSetting('removeHash', removeHashCheckbox.checked);
    console.log('移除##設置已更新:', removeHashCheckbox.checked);
    updateContentScript();
  });

  removeStarCheckbox.addEventListener('change', async function() {
    await GlobalSettings.saveSingleSetting('removeStar', removeStarCheckbox.checked);
    console.log('移除**設置已更新:', removeStarCheckbox.checked);
    updateContentScript();
  });

  // 模型選擇變更處理
  fullRewriteModelSelect.addEventListener('change', async function() {
    await GlobalSettings.saveModelSelection('fullRewriteModel', this.value);
    updateContentScript();
  });

  shortRewriteModelSelect.addEventListener('change', async function() {
    await GlobalSettings.saveModelSelection('shortRewriteModel', this.value);
    updateContentScript();
  });

  autoRewriteModelSelect.addEventListener('change', async function() {
    await GlobalSettings.saveModelSelection('autoRewriteModel', this.value);
    updateContentScript();
  });

  translateModelSelect.addEventListener('change', async function() {
    await GlobalSettings.saveModelSelection('translateModel', this.value);
    updateContentScript();
  });

  // 改寫請求處理
  rewriteButton.addEventListener('click', function() {
    chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
      chrome.tabs.sendMessage(tabs[0].id, {
        action: "rewrite",
        apiKeys: apiKeys,
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

  mainTabs.forEach(tab => {
    tab.addEventListener('click', function() {
      const tabName = this.getAttribute('data-tab');

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

  // 更新內容腳本設置
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

  // AI 助手功能啟動
  if (aiAssistantButton) {
    aiAssistantButton.addEventListener('click', function() {
      chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
        chrome.tabs.sendMessage(tabs[0].id, {action: "activateAIAssistant"});
      });
    });
  }
});
