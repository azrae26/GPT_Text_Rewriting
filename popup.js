/**
 * popup.js - 擴充功能彈出視窗的主要腳本
 * 功能：管理 API 金鑰、改寫設置、模型選擇等配置項目
 */

document.addEventListener('DOMContentLoaded', async function() {
  console.log('DOM 載入完成，開始初始化...');
  
  // ==================== 1. DOM 元素獲取 ====================
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
  const zhEnMappingInput = document.getElementById('zhEnMapping');
  
  // 生成相關
  const generateModelSelect = document.getElementById('initialGenModel');
  const generateInstructionInput = document.getElementById('initialGenInstruction');
  const reflect1ModelSelect = document.getElementById('reflect1Model');
  const reflect1InstructionInput = document.getElementById('reflect1Instruction');
  const generationOptimize_1_ModelSelect = document.getElementById('generationOptimize_1_Model');
  const generationOptimize_1_InstructionInput = document.getElementById('generationOptimize_1_Instruction');
  const backgroundKnowledgeInput = document.getElementById('backgroundKnowledge');
  
  // 關鍵要點相關
  const summaryModelSelect = document.getElementById('summaryModel');
  const summaryInstructionInput = document.getElementById('summaryInstruction');
  
  // 其他按鈕和功能
  const aiAssistantButton = document.getElementById('aiAssistant');
  const highlightWordsInput = document.getElementById('highlight-words');
  const reflectModelSelect = document.getElementById('reflectModel');
  const optimizeModelSelect = document.getElementById('optimizeModel');
  const reflectInstructionInput = document.getElementById('reflectInstruction');
  const optimizeInstructionInput = document.getElementById('optimizeInstruction');

  // ==================== 2. 初始化設定 ====================
  let apiKeys = {
    'openai': '',
    'gemini-2.0-flash-exp': ''
  };

  // 載入使用者設定
  let settings = await GlobalSettings.loadSettings();
  console.log('載入儲存的設置:', settings);
  
  // 首次載入處理
  if (settings.firstRun === true && typeof DefaultSettings !== 'undefined') {
    console.log('首次載入，應用預設設定');
    settings = { ...DefaultSettings };
    await GlobalSettings.saveSettings(settings);
  } else {
    console.log('非首次載入，應用已保存的設定');
    // API 相關
    apiKeys = settings.apiKeys || {};
    
    // 改寫相關設定載入
    instructionInput.value = settings.instruction || '';
    shortInstructionInput.value = settings.shortInstruction || '';
    autoRewritePatternsInput.value = settings.autoRewritePatterns || '';
    fullRewriteModelSelect.value = settings.fullRewriteModel || 'gemini-2.0-flash-exp';
    shortRewriteModelSelect.value = settings.shortRewriteModel || 'gemini-2.0-flash-exp';
    autoRewriteModelSelect.value = settings.autoRewriteModel || 'gemini-2.0-flash-exp';
    
    // 翻譯相關設定載入
    translateModelSelect.value = settings.translateModel || 'gemini-2.0-flash-exp';
    translateInstructionInput.value = settings.translateInstruction || '';
    removeHashCheckbox.checked = settings.removeHash !== undefined ? settings.removeHash : true;
    removeStarCheckbox.checked = settings.removeStar !== undefined ? settings.removeStar : true;
    
    // 生成相關設定載入
    generateModelSelect.value = settings.generateModel || 'gemini-2.0-flash-exp';
    generateInstructionInput.value = settings.generateInstruction || '';
    reflect1ModelSelect.value = settings.reflect1Model || 'gemini-2.0-flash-exp';
    reflect1InstructionInput.value = settings.reflect1Instruction || '';
    generationOptimize_1_ModelSelect.value = settings.generationOptimize_1_Model || 'gemini-2.0-flash-exp';
    generationOptimize_1_InstructionInput.value = settings.generationOptimize_1_Instruction || '';
    backgroundKnowledgeInput.value = settings.backgroundKnowledge || '';
    
    // 反思相關設定載入
    reflectModelSelect.value = settings.reflectModel || 'gemini-2.0-flash-exp';
    reflectInstructionInput.value = settings.reflectInstruction || '';
    
    // 優化相關設定載入
    optimizeModelSelect.value = settings.optimizeModel || 'gemini-2.0-flash-exp';
    optimizeInstructionInput.value = settings.optimizeInstruction || '';
    
    // 關鍵要點相關設定載入
    summaryModelSelect.value = settings.summaryModel || 'gemini-2.0-flash-exp';
    summaryInstructionInput.value = settings.summaryInstruction || '';

    // 載入中英對照表
    if (settings.zhEnMapping) {
      zhEnMappingInput.value = settings.zhEnMapping;
    }
  }
  
  updateApiKeyInput();

  // ==================== 3. 事件監聽器設置 ====================
  // API 相關事件
  apiKeyInput.addEventListener('input', async function() {
    apiKeys[modelSelect.value] = this.value;
    await GlobalSettings.saveSingleSetting('apiKeys', apiKeys);
    updateContentScript();
  });

  modelSelect.addEventListener('change', updateApiKeyInput);

  // 改寫相關事件
  instructionInput.addEventListener('input', async function() {
    await GlobalSettings.saveSingleSetting('instruction', this.value);
    updateContentScript();
  });

  shortInstructionInput.addEventListener('input', async function() {
    await GlobalSettings.saveSingleSetting('shortInstruction', this.value);
    updateContentScript();
  });

  autoRewritePatternsInput.addEventListener('input', async function() {
    await GlobalSettings.saveSingleSetting('autoRewritePatterns', this.value);
    sendAutoRewritePatternsUpdate();
  });

  // 翻譯相關事件
  translateInstructionInput.addEventListener('input', async function() {
    await GlobalSettings.saveSingleSetting('translateInstruction', this.value);
    updateContentScript();
  });

  translateModelSelect.addEventListener('change', async function() {
    await GlobalSettings.saveModelSelection('translateModel', this.value);
    updateContentScript();
  });

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

  // 生成相關事件
  generateInstructionInput.addEventListener('input', async function() {
    await GlobalSettings.saveSingleSetting('generateInstruction', this.value);
    updateContentScript();
  });

  generateModelSelect.addEventListener('change', async function() {
    await GlobalSettings.saveModelSelection('generateModel', this.value);
    updateContentScript();
  });

  reflect1InstructionInput.addEventListener('input', async function() {
    await GlobalSettings.saveSingleSetting('reflect1Instruction', this.value);
    updateContentScript();
  });

  reflect1ModelSelect.addEventListener('change', async function() {
    await GlobalSettings.saveModelSelection('reflect1Model', this.value);
    updateContentScript();
  });

  generationOptimize_1_InstructionInput.addEventListener('input', async function() {
    await GlobalSettings.saveSingleSetting('generationOptimize_1_Instruction', this.value);
    updateContentScript();
  });

  generationOptimize_1_ModelSelect.addEventListener('change', async function() {
    await GlobalSettings.saveModelSelection('generationOptimize_1_Model', this.value);
    updateContentScript();
  });

  backgroundKnowledgeInput.addEventListener('input', async function() {
    await GlobalSettings.saveSingleSetting('backgroundKnowledge', this.value);
    updateContentScript();
  });

  // 關鍵要點相關事件
  summaryInstructionInput.addEventListener('input', async function() {
    await GlobalSettings.saveSingleSetting('summaryInstruction', this.value);
    updateContentScript();
  });

  summaryModelSelect.addEventListener('change', async function() {
    await GlobalSettings.saveModelSelection('summaryModel', this.value);
    updateContentScript();
  });

  // 中英對照表相關事件
  zhEnMappingInput.addEventListener('input', async function() {
    await GlobalSettings.saveSingleSetting('zhEnMapping', this.value);
    updateContentScript();
  });

  // 反思和優化相關事件
  reflectModelSelect.addEventListener('change', async function() {
    await GlobalSettings.saveSingleSetting('reflectModel', this.value);
    updateContentScript();
  });

  optimizeModelSelect.addEventListener('change', async function() {
    await GlobalSettings.saveSingleSetting('optimizeModel', this.value);
    updateContentScript();
  });

  reflectInstructionInput.addEventListener('input', async function() {
    await GlobalSettings.saveSingleSetting('reflectInstruction', this.value);
    updateContentScript();
  });

  optimizeInstructionInput.addEventListener('input', async function() {
    await GlobalSettings.saveSingleSetting('optimizeInstruction', this.value);
    updateContentScript();
  });

  // 功能按鈕事件
  rewriteButton.addEventListener('click', function() {
    chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
      chrome.tabs.sendMessage(tabs[0].id, {
        action: "rewrite",
        apiKeys: apiKeys,
        model: modelSelect.value,
        instruction: instructionInput.value,
        shortInstruction: shortInstructionInput.value,
        autoRewritePatterns: autoRewritePatternsInput.value,
        fullRewriteModel: fullRewriteModelSelect.value,
        shortRewriteModel: shortRewriteModelSelect.value,
        autoRewriteModel: autoRewriteModelSelect.value,
        translateModel: translateModelSelect.value,
        translateInstruction: translateInstructionInput.value,
        reflectModel: reflectModelSelect.value,
        reflectInstruction: reflectInstructionInput.value,
        optimizeModel: optimizeModelSelect.value,
        optimizeInstruction: optimizeInstructionInput.value,
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

  if (aiAssistantButton) {
    aiAssistantButton.addEventListener('click', function() {
      chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
        chrome.tabs.sendMessage(tabs[0].id, {action: "activateAIAssistant"});
      });
    });
  }

  // ==================== 4. UI 相關功能 ====================
  // 分頁切換功能
  const tabs = document.querySelectorAll('.tab');
  const tabContents = document.querySelectorAll('.tab-content');

  tabs.forEach(tab => {
    tab.addEventListener('click', function() {
      console.group('子分頁切換');
      const tabName = this.getAttribute('data-tab');
      console.log('切換到子分頁:', tabName);
      
      const container = this.closest('.tab-container');
      console.log('tab-container:', container);
      
      const siblingTabs = container.querySelectorAll('.tab');
      console.log('同級分頁數量:', siblingTabs.length);
      
      const containerContent = this.closest('.content');
      console.log('content container:', containerContent);
      
      const containerContents = containerContent.querySelectorAll('.tab-content');
      console.log('內容區塊數量:', containerContents.length);
      
      siblingTabs.forEach(t => {
        console.log('移除分頁活動狀態:', t.getAttribute('data-tab'));
        t.classList.remove('active');
      });
      
      containerContents.forEach(c => {
        console.log('移除內容區塊活動狀態:', c.id);
        c.classList.remove('active');
      });
      
      console.log('設置當前分頁為活動狀態:', this.getAttribute('data-tab'));
      this.classList.add('active');
      
      const isInMainTab = container.closest('.main-tab-content');
      const isInTranslateTab = isInMainTab && isInMainTab.id === 'translate-tab';
      console.log('是否在主分頁內:', !!isInMainTab);
      console.log('是否在翻譯分頁內:', isInTranslateTab);
      
      let contentId;
      if (isInTranslateTab || isInMainTab.id === 'multiple-generation-tab') {
        contentId = `${tabName}-content`;
      } else if (isInMainTab) {
        contentId = `${tabName}-tab`;
      } else {
        contentId = `${tabName}-content`;
      }
      console.log('目標內容區塊ID:', contentId);
      
      const targetContent = document.getElementById(contentId);
      console.log('找到目標內容區塊:', !!targetContent);
      
      if (targetContent) {
        console.log('設置目標內容區塊為活動狀態');
        targetContent.classList.add('active');
      } else {
        console.warn('未找到目標內容區塊:', contentId);
      }
      
      chrome.storage.sync.set({ lastSubTab: tabName });
      console.log('已保存子分頁狀態:', tabName);
      console.groupEnd();
    });
  });

  // 主分頁切換功能
  const mainTabs = document.querySelectorAll('.main-tab');
  const mainTabContents = document.querySelectorAll('.main-tab-content');

  mainTabs.forEach(tab => {
    tab.addEventListener('click', function() {
      console.group('主分頁切換');
      const tabName = this.getAttribute('data-tab');
      console.log('切換到主分頁:', tabName);
      
      mainTabs.forEach(t => {
        console.log('移除主分頁活動狀態:', t.getAttribute('data-tab'));
        t.classList.remove('active');
      });
      
      mainTabContents.forEach(c => {
        console.log('移除主內容區塊活動狀態:', c.id);
        c.classList.remove('active');
      });
      
      console.log('設置當前主分頁為活動狀態:', tabName);
      tab.classList.add('active');
      
      const targetContent = document.getElementById(`${tabName}-tab`);
      console.log('找到目標主內容區塊:', !!targetContent);
      
      if (targetContent) {
        console.log('設置目標主內容區塊為活動狀態');
        targetContent.classList.add('active');
      } else {
        console.warn('未找到目標主內容區塊:', `${tabName}-tab`);
      }
      
      chrome.storage.sync.set({ lastMainTab: tabName });
      console.log('已保存主分頁狀態:', tabName);
      console.groupEnd();
    });
  });

  // ==================== 5. 輔助功能 ====================
  // API 金鑰輸入更新
  function updateApiKeyInput() {
    apiKeyInput.value = apiKeys[modelSelect.value] || '';
  }

  // 自動改寫模式更新
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

  // Content Script 更新
  async function updateContentScript(settings) {
    try {
      const tabs = await chrome.tabs.query({active: true, currentWindow: true});
      if (!tabs || !tabs[0]) {
        console.log('未找到活動的標籤頁');
        return;
      }

      await chrome.storage.sync.set({ settings });
      console.log('設置已保存到 storage');

      try {
        await chrome.tabs.sendMessage(tabs[0].id, {
          action: "updateSettings",
          settings: settings
        });
        console.log('設置已成功發送到 content script');
      } catch (error) {
        if (error.message.includes('Receiving end does not exist')) {
          console.log('content script 未載入，設置將在下次載入時應用');
        } else {
          console.warn('更新 content script 時發生錯誤:', error);
        }
      }
    } catch (error) {
      console.warn('updateContentScript 發生錯誤:', error);
    }
  }

  // 消息發送函數
  function sendMessageToTab(message, callback) {
    chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
      if (!tabs[0]) {
        console.log('未找到活動的標籤頁');
        return;
      }
      
      chrome.tabs.sendMessage(tabs[0].id, message, function(response) {
        if (chrome.runtime.lastError) {
          console.log('content script 未載入或無法連接');
          if (callback) callback({ error: 'content script 未載入' });
          return;
        }
        if (callback) callback(response);
      });
    });
  }

  // 初始化自動替換功能
  const autoReplaceContainer = document.querySelector('#auto-replace-tab .auto-replace-container');
  if (autoReplaceContainer) {
    AutoReplaceManager.initializeAutoReplaceGroups(autoReplaceContainer, document.createElement('textarea'));
  }
});
