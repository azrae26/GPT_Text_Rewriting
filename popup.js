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
  const zhEnMappingInput = document.getElementById('zhEnMapping');
  
  // 生成相關
  const generateModelSelect = document.getElementById('initialGenModel');
  const generateInstructionInput = document.getElementById('initialGenInstruction');
  const reflect1ModelSelect = document.getElementById('reflect1Model');
  const reflect1InstructionInput = document.getElementById('reflect1Instruction');
  const generationOptimize_1_ModelSelect = document.getElementById('generationOptimize_1_Model');
  const generationOptimize_1_InstructionInput = document.getElementById('generationOptimize_1_Instruction');
  const reflect2ModelSelect = document.getElementById('reflect2Model');
  const reflect2InstructionInput = document.getElementById('reflect2Instruction');
  const generationOptimize_2_ModelSelect = document.getElementById('generationOptimize_2_Model');
  const generationOptimize_2_InstructionInput = document.getElementById('generationOptimize_2_Instruction');
  const reflect3ModelSelect = document.getElementById('reflect3Model');
  const reflect3InstructionInput = document.getElementById('reflect3Instruction');
  const generationOptimize_3_ModelSelect = document.getElementById('generationOptimize_3_Model');
  const generationOptimize_3_InstructionInput = document.getElementById('generationOptimize_3_Instruction');
  const backgroundKnowledgeInput = document.getElementById('backgroundKnowledge');
  
  // 關鍵要點相關
  const summaryModelSelect = document.getElementById('summaryModel');
  const summaryInstructionInput = document.getElementById('summaryInstruction');
  
  // 其他按鈕
  const aiAssistantButton = document.getElementById('aiAssistant');

  // 高亮功能
  const highlightWordsInput = document.getElementById('highlight-words');

  // 獲取新增的元素
  const reflectModelSelect = document.getElementById('reflectModel');
  const optimizeModelSelect = document.getElementById('optimizeModel');
  const reflectInstructionInput = document.getElementById('reflectInstruction');
  const optimizeInstructionInput = document.getElementById('optimizeInstruction');

  // 2. 初始化設定
  let apiKeys = {
    'openai': '',
    'gemini-2.0-flash-exp': ''
  };

  // 載入使用者設定，如果沒有設定，則使用預設設定
  let settings = await GlobalSettings.loadSettings();
  console.log('載入儲存的設置:', settings);
  
  // 如果首次載入，則應用預設設定
  if (settings.firstRun === true && typeof DefaultSettings !== 'undefined') {
    console.log('首次載入，應用預設設定');
    settings = { ...DefaultSettings };  // 使用預設設定
    await GlobalSettings.saveSettings(settings);
  } else {
    console.log('非首次載入，應用已保存的設定');
    // API 相關
    apiKeys = settings.apiKeys || {};
    
    // 改寫相關
    instructionInput.value = settings.instruction || '';
    shortInstructionInput.value = settings.shortInstruction || '';
    autoRewritePatternsInput.value = settings.autoRewritePatterns || '';
    fullRewriteModelSelect.value = settings.fullRewriteModel || 'gemini-2.0-flash-exp';
    shortRewriteModelSelect.value = settings.shortRewriteModel || 'gemini-2.0-flash-exp';
    autoRewriteModelSelect.value = settings.autoRewriteModel || 'gemini-2.0-flash-exp';
    
    // 翻譯相關
    translateModelSelect.value = settings.translateModel || 'gemini-2.0-flash-exp';
    translateInstructionInput.value = settings.translateInstruction || '';
    removeHashCheckbox.checked = settings.removeHash !== undefined ? settings.removeHash : true;
    removeStarCheckbox.checked = settings.removeStar !== undefined ? settings.removeStar : true;
    
    // 生成相關
    generateModelSelect.value = settings.generateModel || 'gemini-2.0-flash-exp';
    generateInstructionInput.value = settings.generateInstruction || '';
    reflect1ModelSelect.value = settings.reflect1Model || 'gemini-2.0-flash-exp';
    reflect1InstructionInput.value = settings.reflect1Instruction || '';
    generationOptimize_1_ModelSelect.value = settings.generationOptimize_1_Model || 'gemini-2.0-flash-exp';
    generationOptimize_1_InstructionInput.value = settings.generationOptimize_1_Instruction || '';
    reflect2ModelSelect.value = settings.reflect2Model || 'gemini-2.0-flash-exp';
    reflect2InstructionInput.value = settings.reflect2Instruction || '';
    generationOptimize_2_ModelSelect.value = settings.generationOptimize_2_Model || 'gemini-2.0-flash-exp';
    generationOptimize_2_InstructionInput.value = settings.generationOptimize_2_Instruction || '';
    reflect3ModelSelect.value = settings.reflect3Model || 'gemini-2.0-flash-exp';
    reflect3InstructionInput.value = settings.reflect3Instruction || '';
    generationOptimize_3_ModelSelect.value = settings.generationOptimize_3_Model || 'gemini-2.0-flash-exp';
    generationOptimize_3_InstructionInput.value = settings.generationOptimize_3_Instruction || '';
    backgroundKnowledgeInput.value = settings.backgroundKnowledge || '';
    
    // 反思相關
    reflectModelSelect.value = settings.reflectModel || 'gemini-2.0-flash-exp';
    reflectInstructionInput.value = settings.reflectInstruction || '';
    
    // 優化相關
    optimizeModelSelect.value = settings.optimizeModel || 'gemini-2.0-flash-exp';
    optimizeInstructionInput.value = settings.optimizeInstruction || '';
    
    // 關鍵要點相關
    summaryModelSelect.value = settings.summaryModel || 'gemini-2.0-flash-exp';
    summaryInstructionInput.value = settings.summaryInstruction || '';

    // 載入中英對照表
    if (settings.zhEnMapping) {
      zhEnMappingInput.value = settings.zhEnMapping;
    }
  }
  
  updateApiKeyInput();

  // 載入已保存的高亮文字
  chrome.storage.sync.get('highlightWords', function(data) {
    if (data.highlightWords) {
      highlightWordsInput.value = data.highlightWords;
      highlightWordsInput._previousValue = data.highlightWords;
      setTimeout(() => {
        updatePreview();
        requestAnimationFrame(() => {
          updatePreviewsPosition();
        });
      }, 0);
    }
  });

  // 載入已保存的主分頁和子分頁狀態
  chrome.storage.sync.get(['lastMainTab', 'lastSubTab'], function(data) {
    console.log('載入儲存的設置:', data);
    
    // 恢復主分頁狀態
    if (data.lastMainTab) {
      const mainTab = document.querySelector(`.main-tab[data-tab="${data.lastMainTab}"]`);
      const mainContent = document.getElementById(`${data.lastMainTab}-tab`);
      if (mainTab && mainContent) {
        // 移除其他主分頁的活動狀態
        document.querySelectorAll('.main-tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.main-tab-content').forEach(c => c.classList.remove('active'));
        
        // 設置保存的主分頁為活動狀態
        mainTab.classList.add('active');
        mainContent.classList.add('active');
        
        // 如果是翻譯分頁，恢復其子分頁狀態
        if (data.lastMainTab === 'translate' && data.lastSubTab) {
          const subTab = mainContent.querySelector(`.tab[data-tab="${data.lastSubTab}"]`);
          const subContent = document.getElementById(`${data.lastSubTab}-content`);
          if (subTab && subContent) {
            // 移除其他子分頁的活動狀態
            mainContent.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
            mainContent.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
            
            // 設置保存的子分頁為活動狀態
            subTab.classList.add('active');
            subContent.classList.add('active');
          }
        }
      }
    }
    
    // 恢復改寫分頁的子分頁狀態
    const rewriteTab = document.getElementById('rewrite-tab');
    if (rewriteTab && data.lastSubTab) {
      const subTab = rewriteTab.querySelector(`.tab[data-tab="${data.lastSubTab}"]`);
      const subContent = document.getElementById(`${data.lastSubTab}-tab`);
      if (subTab && subContent) {
        // 移除其他子分頁的活動狀態
        rewriteTab.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
        rewriteTab.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
        
        // 設置保存的子分頁為活動狀態
        subTab.classList.add('active');
        subContent.classList.add('active');
      }
    }

    // 如果是生成分頁，恢復其子分頁狀態
    if (data.lastMainTab === 'multiple-generation' && data.lastSubTab) {
      const tabContent = document.getElementById('multiple-generation-tab');
      if (tabContent) {
        const tab = tabContent.querySelector(`.tab[data-tab="${data.lastSubTab}"]`);
        const subContent = document.getElementById(`${data.lastSubTab}-content`);
        if (tab && subContent) {
          // 移除其他子分頁的活動狀態
          tabContent.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
          tabContent.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
          
          // 設置保存的子分頁為活動狀態
          tab.classList.add('active');
          subContent.classList.add('active');
        }
      }
    }
  });

  // 3. API 和模型相關事件處理
  // API 金鑰輸入
  function updateApiKeyInput() {
    apiKeyInput.value = apiKeys[modelSelect.value] || '';
  }

  // 當 API 金鑰輸入變更時自動保存
  apiKeyInput.addEventListener('input', async function() {
    apiKeys[modelSelect.value] = this.value;
    await GlobalSettings.saveSingleSetting('apiKeys', apiKeys);
    throttledUpdateContentScript();
  });

  // API 模型選擇
  modelSelect.addEventListener('change', updateApiKeyInput);

  // 4-8. 統一的事件處理配置
  const eventHandlerConfig = {
    // 指令輸入配置
    instructions: {
      'instruction': { type: 'input', element: instructionInput },
      'shortInstruction': { type: 'input', element: shortInstructionInput },
      'autoRewritePatterns': { 
        type: 'input', 
        element: autoRewritePatternsInput,
        callback: sendAutoRewritePatternsUpdate 
      },
      'translateInstruction': { type: 'input', element: translateInstructionInput },
      'generateInstruction': { type: 'input', element: generateInstructionInput },
      'reflect1Instruction': { type: 'input', element: reflect1InstructionInput },
      'generationOptimize_1_Instruction': { type: 'input', element: generationOptimize_1_InstructionInput },
      'reflect2Instruction': { type: 'input', element: reflect2InstructionInput },
      'generationOptimize_2_Instruction': { type: 'input', element: generationOptimize_2_InstructionInput },
      'reflect3Instruction': { type: 'input', element: reflect3InstructionInput },
      'generationOptimize_3_Instruction': { type: 'input', element: generationOptimize_3_InstructionInput },
      'backgroundKnowledge': { type: 'input', element: backgroundKnowledgeInput },
      'summaryInstruction': { type: 'input', element: summaryInstructionInput },
      'zhEnMapping': { type: 'input', element: zhEnMappingInput },
      'reflectInstruction': { type: 'input', element: reflectInstructionInput },
      'optimizeInstruction': { type: 'input', element: optimizeInstructionInput }
    },
    
    // 模型選擇配置
    models: {
      'fullRewriteModel': { type: 'model', element: fullRewriteModelSelect },
      'shortRewriteModel': { type: 'model', element: shortRewriteModelSelect },
      'autoRewriteModel': { type: 'model', element: autoRewriteModelSelect },
      'translateModel': { type: 'model', element: translateModelSelect },
      'generateModel': { type: 'model', element: generateModelSelect },
      'reflect1Model': { type: 'model', element: reflect1ModelSelect },
      'generationOptimize_1_Model': { type: 'model', element: generationOptimize_1_ModelSelect },
      'reflect2Model': { type: 'model', element: reflect2ModelSelect },
      'generationOptimize_2_Model': { type: 'model', element: generationOptimize_2_ModelSelect },
      'reflect3Model': { type: 'model', element: reflect3ModelSelect },
      'generationOptimize_3_Model': { type: 'model', element: generationOptimize_3_ModelSelect },
      'summaryModel': { type: 'model', element: summaryModelSelect },
      'reflectModel': { type: 'model', element: reflectModelSelect },
      'optimizeModel': { type: 'model', element: optimizeModelSelect }
    },
    
    // 特殊設置配置
    settings: {
      'removeHash': { 
        type: 'checkbox', 
        element: removeHashCheckbox,
        logMessage: '移除##設置已更新:' 
      },
      'removeStar': { 
        type: 'checkbox', 
        element: removeStarCheckbox,
        logMessage: '移除**設置已更新:' 
      }
    }
  };

  // 統一的事件處理器設置函數
  function setupEventHandlers() {
    // 設置指令輸入事件
    Object.entries(eventHandlerConfig.instructions).forEach(([key, config]) => {
      if (!config.element) {
        console.warn(`找不到元素: ${key}`);
        return;
      }
      
      config.element.addEventListener('input', async function() {
        await GlobalSettings.saveSingleSetting(key, this.value);
        if (config.callback) {
          config.callback();
        }
        throttledUpdateContentScript();
      });
    });

    // 設置模型選擇事件
    Object.entries(eventHandlerConfig.models).forEach(([key, config]) => {
      if (!config.element) {
        console.warn(`找不到元素: ${key}`);
        return;
      }
      
      config.element.addEventListener('change', async function() {
        await GlobalSettings.saveModelSelection(key, this.value);
        throttledUpdateContentScript();
      });
    });

    // 設置特殊設置事件
    Object.entries(eventHandlerConfig.settings).forEach(([key, config]) => {
      if (!config.element) {
        console.warn(`找不到元素: ${key}`);
        return;
      }
      
      config.element.addEventListener('change', async function() {
        await GlobalSettings.saveSingleSetting(key, this.checked);
        if (config.logMessage) {
          console.log(config.logMessage, this.checked);
        }
        throttledUpdateContentScript();
      });
    });
  }

  // 初始化所有事件處理器
  setupEventHandlers();

  // 10. 功能按鈕事件處理
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
      console.group('子分頁切換');
      const tabName = this.getAttribute('data-tab');
      console.log('切換到子分頁:', tabName);
      
      // 找到最近的 tab-container 父元素
      const container = this.closest('.tab-container');
      console.log('tab-container:', container);
      
      // 只切換同一個 container 內的分頁
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
      
      // 根據分頁位置選擇正確的內容元素 ID
      const isInMainTab = container.closest('.main-tab-content');
      const isInTranslateTab = isInMainTab && isInMainTab.id === 'translate-tab';
      console.log('是否在主分頁內:', !!isInMainTab);
      console.log('是否在翻譯分頁內:', isInTranslateTab);
      
      let contentId;
      if (isInTranslateTab || isInMainTab.id === 'multiple-generation-tab') {
        contentId = `${tabName}-content`;  // 在翻譯分頁或生成分頁內的子分頁
      } else if (isInMainTab) {
        contentId = `${tabName}-tab`;      // 在其他主分頁內的子分頁
      } else {
        contentId = `${tabName}-content`;  // 其他情況
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
      
      // 保存子分頁狀態
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
      
      // 保存主分頁狀態
      chrome.storage.sync.set({ lastMainTab: tabName });
      console.log('已保存主分頁狀態:', tabName);
      console.groupEnd();
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

  // 添加節流函數
  const throttle = (func, limit) => {
    let inThrottle;
    return function(...args) {
      if (!inThrottle) {
        func.apply(this, args);
        inThrottle = true;
        setTimeout(() => inThrottle = false, limit);
      }
    }
  }

  // 更新 content.js 設置
  async function updateContentScript(settings) {
    try {
      const tabs = await chrome.tabs.query({active: true, currentWindow: true});
      if (!tabs || !tabs[0]) {
        console.log('未找到活動的標籤頁');
        return;
      }

      // 使用 local storage 而不是 sync storage 來減少配額使用
      await chrome.storage.local.set({ tempSettings: settings });
      console.log('設置已暫存到 local storage');

      try {
        // 嘗試發送消息到 content script
        await chrome.tabs.sendMessage(tabs[0].id, {
          action: "updateSettings",
          settings: settings
        });
        console.log('設置已成功發送到 content script');

        // 成功發送後，再將設置保存到 sync storage
        await chrome.storage.sync.set({ settings });
        console.log('設置已保存到 sync storage');
      } catch (error) {
        if (error.message.includes('Receiving end does not exist')) {
          console.log('content script 未載入，設置將在下次載入時應用');
          // 如果 content script 未載入，仍然保存到 sync storage
          await chrome.storage.sync.set({ settings });
        } else {
          console.warn('更新 content script 時發生錯誤:', error);
        }
      }
    } catch (error) {
      console.warn('updateContentScript 發生錯誤:', error);
    }
  }

  // 使用節流包裝 updateContentScript
  const throttledUpdateContentScript = throttle(updateContentScript, 1000);

  // 修改消息發送函數
  function sendMessageToTab(message, callback) {
    chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
      if (!tabs[0]) {
        console.log('未找到活動的標籤頁');
        return;
      }
      
      chrome.tabs.sendMessage(tabs[0].id, message, function(response) {
        if (chrome.runtime.lastError) {
          console.log('content script 未載入或無法連接');
          // 如果有回調函數，則調用它並傳遞錯誤信息
          if (callback) callback({ error: 'content script 未載入' });
          return;
        }
        if (callback) callback(response);
      });
    });
  }

  let selectedLine = -1;
  let wordColors = {};

  // 載入已保存的顏色設置
  chrome.storage.sync.get('highlightColors', function(data) {
    if (data.highlightColors) {
      wordColors = data.highlightColors;
    }
  });

  // 初始化顏色選擇器
  const colorBoxes = document.querySelectorAll('.color-box');
  colorBoxes.forEach(box => {
    const color = box.dataset.color;
    box.style.backgroundColor = color;
    
    box.addEventListener('click', () => {
      if (selectedLine >= 0) {
        const words = highlightWordsInput.value.split('\n');
        const word = words[selectedLine];
        if (word) {
          wordColors[word] = color;
          chrome.storage.sync.set({ highlightColors: wordColors });
          updatePreview();
          
          sendMessageToTab({
            action: "updateHighlightWords",
            words: words,
            colors: wordColors
          }, function() {
            sendMessageToTab({
              action: "forceUpdateHighlights"
            });
          });
        }
      }
    });
  });

  // 修改 highlightWordsInput 的點擊事件
  highlightWordsInput.addEventListener('click', function(e) {
    const text = this.value;
    const start = this.selectionStart;
    const lines = text.substr(0, start).split('\n');
    selectedLine = lines.length - 1;
  });

  // 監聽文字變更以更新預覽
  highlightWordsInput.addEventListener('input', function() {
    updatePreview();
    // 保存高亮文字
    updateHighlightWords(this.value);
  });

  // 修改 updateHighlightWords 函數
  function updateHighlightWords(text) {
    const words = text.split('\n').filter(word => word.trim());
    
    // 保存到 storage
    chrome.storage.sync.set({
      highlightWords: text,
      highlightColors: wordColors
    }, function() {
      // 發送到 content script
      sendMessageToTab({
        action: "updateHighlightWords",
        words: words,
        colors: wordColors
      }, function(response) {
        if (response && response.error) {
          console.log('高亮設置已保存，將在頁面重新載入時應用');
        } else {
          console.log('高亮設置已更新');
          // 強制更新高亮
          sendMessageToTab({
            action: "forceUpdateHighlights"
          });
        }
      });
    });
  }

  // 修改 updatePreview 函數
  function updatePreview() {
    // 確保 textarea 已準備好
    if (!highlightWordsInput || !highlightWordsInput.clientWidth) {
        setTimeout(updatePreview, 10);
        return;
    }
    
    // 清除舊的預覽
    const oldPreviews = document.querySelectorAll('.highlight-preview');
    oldPreviews.forEach(p => p.remove());

    const textarea = highlightWordsInput;
    const overlay = document.querySelector('.highlight-overlay');
    const text = textarea.value;
    const lines = text.split('\n');

    // 創建一個隱藏的 div 來計算位置
    const div = document.createElement('div');
    div.style.cssText = `
      position: absolute;
      visibility: hidden;
      white-space: pre-wrap;
      width: ${textarea.clientWidth}px;
      font: ${getComputedStyle(textarea).font};
      line-height: ${getComputedStyle(textarea).lineHeight};
      padding: ${getComputedStyle(textarea).padding};
    `;
    textarea.parentElement.appendChild(div);

    // 使用完整文字來計算位置
    div.textContent = text;
    const range = document.createRange();
    const textNode = div.firstChild;

    lines.forEach((line, index) => {
      if (!line.trim()) return;

      // 找到這一行的開始位置
      let lineStart = 0;
      for (let i = 0; i < index; i++) {
        lineStart += lines[i].length + 1;
      }

      // 使用 Range API 計算位置
      range.setStart(textNode, lineStart);
      range.setEnd(textNode, lineStart + line.length);
      
      // 獲取所有的 ClientRect
      const rects = range.getClientRects();
      const divRect = div.getBoundingClientRect();

      // 為每一個 rect 創建一個預覽元素
      for (let i = 0; i < rects.length; i++) {
        const rect = rects[i];
        
        // 創建預覽元素
        const preview = document.createElement('div');
        preview.className = 'highlight-preview';
        preview.style.top = `${rect.top - divRect.top - 1}px`; // 上邊距
        preview.style.left = `${rect.left - divRect.left}px`; //  是左邊距
        preview.style.width = `${rect.width}px`;
        preview.style.height = `${rect.height + 1}px`;
        preview.style.backgroundColor = wordColors[line] || 'rgba(50, 205, 50, 0.3)';
        
        // 保存原始位置
        preview.dataset.originalTop = rect.top - divRect.top;
        
        // 將預覽元素添加到 overlay 中
        overlay.appendChild(preview);
      }
    });

    range.detach();
    div.remove();
    
    // 立即更新滾動位置
    updatePreviewsPosition();
  }

  // 修改 updatePreviewsPosition 函數
  function updatePreviewsPosition() {
    const textarea = highlightWordsInput;
    const scrollTop = textarea.scrollTop;

    const previews = document.querySelectorAll('.highlight-preview');
    previews.forEach(preview => {
      const originalTop = parseFloat(preview.dataset.originalTop);
      
      // 使用與 highlight.js 相同的邏輯
      preview.style.display = 'block';
      // 直接使用 transform 來調整位置
      preview.style.transform = `translateY(${-scrollTop}px)`;
    });
  }

  // 修改滾動事件處理
  highlightWordsInput.addEventListener('scroll', function() {
    requestAnimationFrame(() => {
      updatePreviewsPosition();
    });
  });

  // 在載入時初始化預覽
  chrome.storage.sync.get(['highlightWords', 'highlightColors'], function(data) {
    if (data.highlightColors) {
      wordColors = data.highlightColors;
    }
    if (data.highlightWords) {
      highlightWordsInput.value = data.highlightWords;
      highlightWordsInput._previousValue = data.highlightWords;
      // 使用 setTimeout 確保 textarea 已完全準備好
      setTimeout(() => {
        updatePreview();
        // 再次更新以確保位置正確
        requestAnimationFrame(() => {
          updatePreviewsPosition();
        });
      }, 0);
    }
  });

  // 初始化自動替換功能
  const autoReplaceContainer = document.querySelector('#auto-replace-tab .auto-replace-container');
  if (autoReplaceContainer) {
    // 直接使用已載入的 AutoReplaceManager
    AutoReplaceManager.initializeAutoReplaceGroups(autoReplaceContainer, document.createElement('textarea'));
  }
});
