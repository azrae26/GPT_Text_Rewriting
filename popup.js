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

  // 股票功能
  const stockListInput = document.getElementById('stock-list-input');

  // 獲取新增的元素
  const reflectModelSelect = document.getElementById('reflectModel');
  const optimizeModelSelect = document.getElementById('optimizeModel');
  const reflectInstructionInput = document.getElementById('reflectInstruction');
  const optimizeInstructionInput = document.getElementById('optimizeInstruction');

  // 獲取生成設定相關元素
  const generationSettingsSelect = document.getElementById('generation-settings-select');
  const addGenerationSettingsBtn = document.getElementById('add-generation-settings');
  const editGenerationSettingsBtn = document.getElementById('edit-generation-settings');
  const deleteGenerationSettingsBtn = document.getElementById('delete-generation-settings');

  // 自定義模型管理相關元素
  const customModelNameInput = document.getElementById('custom-model-name');
  const customModelDisplayInput = document.getElementById('custom-model-display');
  const customModelTypeSelect = document.getElementById('custom-model-type');
  const addCustomModelBtn = document.getElementById('add-custom-model');
  const customModelsContainer = document.getElementById('custom-models-container');

  // 2. 初始化設定
  let apiKeys = {};

  // Initialize CustomModelManager (將在 CustomModelManager 定義後進行初始化)

  // 載入使用者設定，如果沒有設定，則使用預設設定
  let settings = await GlobalSettings.loadSettings();
  console.log('載入儲存的設置:', settings);
  
  // 只在真正的首次載入（沒有任何用戶設定）時才應用預設設定
  // 檢查是否有任何實際的用戶設定存在
  const hasUserSettings = settings.instruction || settings.translateInstruction || 
                          settings.stockList || settings.zhEnMapping ||
                          settings.summaryInstruction || settings.reflectInstruction ||
                          settings.optimizeInstruction || settings.generateInstruction ||
                          settings.backgroundKnowledge ||
                          Object.keys(settings.apiKeys || {}).length > 0;
  
  if (!hasUserSettings && typeof DefaultSettings !== 'undefined') {
    console.log('檢測到首次使用（無用戶設定），應用預設設定');
    // 只設定沒有值的屬性，不覆蓋已有設定
    Object.keys(DefaultSettings).forEach(key => {
      if (settings[key] === undefined || settings[key] === '') {
        settings[key] = DefaultSettings[key];
      }
    });
    await GlobalSettings.saveSettings(settings);
  } else {
    console.log('載入已保存的設定，用戶設定存在:', hasUserSettings);
  }
  
  // 載入設定到 UI 元素
  // API 相關
  apiKeys = settings.apiKeys || {};
  
  // 改寫相關
  instructionInput.value = settings.instruction || '';
  shortInstructionInput.value = settings.shortInstruction || '';
  autoRewritePatternsInput.value = settings.autoRewritePatterns || '';
  fullRewriteModelSelect.value = settings.fullRewriteModel || '';
  shortRewriteModelSelect.value = settings.shortRewriteModel || '';
  autoRewriteModelSelect.value = settings.autoRewriteModel || '';
  
  // 翻譯相關
  translateModelSelect.value = settings.translateModel || '';
  translateInstructionInput.value = settings.translateInstruction || '';
  removeHashCheckbox.checked = settings.removeHash !== undefined ? settings.removeHash : true;
  removeStarCheckbox.checked = settings.removeStar !== undefined ? settings.removeStar : true;
  
  // 生成相關
  generateModelSelect.value = settings.generateModel || '';
  generateInstructionInput.value = settings.generateInstruction || '';
  reflect1ModelSelect.value = settings.reflect1Model || '';
  reflect1InstructionInput.value = settings.reflect1Instruction || '';
  generationOptimize_1_ModelSelect.value = settings.generationOptimize_1_Model || '';
  generationOptimize_1_InstructionInput.value = settings.generationOptimize_1_Instruction || '';
  reflect2ModelSelect.value = settings.reflect2Model || '';
  reflect2InstructionInput.value = settings.reflect2Instruction || '';
  generationOptimize_2_ModelSelect.value = settings.generationOptimize_2_Model || '';
  generationOptimize_2_InstructionInput.value = settings.generationOptimize_2_Instruction || '';
  reflect3ModelSelect.value = settings.reflect3Model || '';
  reflect3InstructionInput.value = settings.reflect3Instruction || '';
  generationOptimize_3_ModelSelect.value = settings.generationOptimize_3_Model || '';
  generationOptimize_3_InstructionInput.value = settings.generationOptimize_3_Instruction || '';
  backgroundKnowledgeInput.value = settings.backgroundKnowledge || '';
  
  // 反思相關
  reflectModelSelect.value = settings.reflectModel || '';
  reflectInstructionInput.value = settings.reflectInstruction || '';
  
  // 優化相關
  optimizeModelSelect.value = settings.optimizeModel || '';
  optimizeInstructionInput.value = settings.optimizeInstruction || '';
  
  // 關鍵要點相關
  summaryModelSelect.value = settings.summaryModel || '';
  summaryInstructionInput.value = settings.summaryInstruction || '';

  // 載入中英對照表
  zhEnMappingInput.value = settings.zhEnMapping || '';

  // 載入股票清單
  stockListInput.value = settings.stockList || '';
  
  // 載入爬蟲間隔
  const crawlerIntervalInput = document.getElementById('crawler-interval');
  if (crawlerIntervalInput) {
    crawlerIntervalInput.value = settings.crawlerInterval || 30;
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
    
    // 根據選擇的服務更新 placeholder 文字
    if (modelSelect.value === 'google-translate') {
      apiKeyInput.placeholder = '貼上 Google Cloud 服務帳戶 JSON 憑證';
    } else {
      apiKeyInput.placeholder = '輸入您的 API 金鑰';
    }
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
    // 指令輸入配置（與生成設定組合相關）
    generationInstructions: {
      'generateInstruction': { type: 'input', element: generateInstructionInput },
      'reflect1Instruction': { type: 'input', element: reflect1InstructionInput },
      'generationOptimize_1_Instruction': { type: 'input', element: generationOptimize_1_InstructionInput },
      'reflect2Instruction': { type: 'input', element: reflect2InstructionInput },
      'generationOptimize_2_Instruction': { type: 'input', element: generationOptimize_2_InstructionInput },
      'reflect3Instruction': { type: 'input', element: reflect3InstructionInput },
      'generationOptimize_3_Instruction': { type: 'input', element: generationOptimize_3_InstructionInput },
      'backgroundKnowledge': { type: 'input', element: backgroundKnowledgeInput }
    },
    
    // 一般指令輸入配置（與生成設定組合無關）
    instructions: {
      'instruction': { type: 'input', element: instructionInput },
      'shortInstruction': { type: 'input', element: shortInstructionInput },
      'autoRewritePatterns': { 
        type: 'input', 
        element: autoRewritePatternsInput,
        callback: sendAutoRewritePatternsUpdate 
      },
      'translateInstruction': { type: 'input', element: translateInstructionInput },
      'summaryInstruction': { type: 'input', element: summaryInstructionInput },
      'zhEnMapping': { type: 'input', element: zhEnMappingInput },
      'stockList': { 
        type: 'input', 
        element: stockListInput,
        callback: updateStockListSettings 
      },
      'crawlerInterval': { 
        type: 'input', 
        element: document.getElementById('crawler-interval')
      },
      'reflectInstruction': { type: 'input', element: reflectInstructionInput },
      'optimizeInstruction': { type: 'input', element: optimizeInstructionInput }
    },
    
    // 生成相關模型選擇配置
    generationModels: {
      'generateModel': { type: 'model', element: generateModelSelect },
      'reflect1Model': { type: 'model', element: reflect1ModelSelect },
      'generationOptimize_1_Model': { type: 'model', element: generationOptimize_1_ModelSelect },
      'reflect2Model': { type: 'model', element: reflect2ModelSelect },
      'generationOptimize_2_Model': { type: 'model', element: generationOptimize_2_ModelSelect },
      'reflect3Model': { type: 'model', element: reflect3ModelSelect },
      'generationOptimize_3_Model': { type: 'model', element: generationOptimize_3_ModelSelect }
    },
    
    // 一般模型選擇配置
    models: {
      'fullRewriteModel': { type: 'model', element: fullRewriteModelSelect },
      'shortRewriteModel': { type: 'model', element: shortRewriteModelSelect },
      'autoRewriteModel': { type: 'model', element: autoRewriteModelSelect },
      'translateModel': { type: 'model', element: translateModelSelect },
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
    // 設置生成相關指令輸入事件（與設定組合相關）
    Object.entries(eventHandlerConfig.generationInstructions).forEach(([key, config]) => {
      if (!config.element) {
        console.warn(`找不到元素: ${key}`);
        return;
      }
      
      config.element.addEventListener('input', async function() {
        // 先保存到全局設定
        await GlobalSettings.saveSingleSetting(key, this.value);
        
        // 如果當前有選擇的設定組合，也保存到該組合中
        const selectedName = generationSettingsSelect.value;
        if (selectedName) {
          try {
            const currentSettings = settings.generationSettingsGroups[selectedName] || {};
            currentSettings[key] = this.value;
            
            // 保存到設定組合
            await window.GlobalSettings.saveGenerationSettingsGroup(selectedName, currentSettings);
            console.log(`已更新設定組合 "${selectedName}" 的 ${key}`);
          } catch (error) {
            console.error(`更新設定組合失敗:`, error);
          }
        }
        
        if (config.callback) {
          config.callback();
        }
        throttledUpdateContentScript();
      });
    });

    // 設置一般指令輸入事件（與設定組合無關）
    Object.entries(eventHandlerConfig.instructions).forEach(([key, config]) => {
      if (!config.element) {
        console.warn(`找不到元素: ${key}`);
        return;
      }
      
      config.element.addEventListener('input', async function() {
        // 只保存到全局設定，不與生成設定組合關聯
        await GlobalSettings.saveSingleSetting(key, this.value);
        
        if (config.callback) {
          config.callback();
        }
        throttledUpdateContentScript();
      });
    });

    // 設置生成相關模型選擇事件（與設定組合相關）
    Object.entries(eventHandlerConfig.generationModels).forEach(([key, config]) => {
      if (!config.element) {
        console.warn(`找不到元素: ${key}`);
        return;
      }
      
      config.element.addEventListener('change', async function() {
        // 先保存到全局設定
        await GlobalSettings.saveModelSelection(key, this.value);
        
        // 如果當前有選擇的設定組合，也保存到該組合中
        const selectedName = generationSettingsSelect.value;
        if (selectedName) {
          try {
            const currentSettings = settings.generationSettingsGroups[selectedName] || {};
            currentSettings[key] = this.value;
            
            // 保存到設定組合
            await window.GlobalSettings.saveGenerationSettingsGroup(selectedName, currentSettings);
            console.log(`已更新設定組合 "${selectedName}" 的 ${key}`);
          } catch (error) {
            console.error(`更新設定組合失敗:`, error);
          }
        }
        
        throttledUpdateContentScript();
      });
    });

    // 設置一般模型選擇事件（與設定組合無關）
    Object.entries(eventHandlerConfig.models).forEach(([key, config]) => {
      if (!config.element) {
        console.warn(`找不到元素: ${key}`);
        return;
      }
      
      config.element.addEventListener('change', async function() {
        // 只保存到全局設定，不與生成設定組合關聯
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
        // 先保存到全局設定
        await GlobalSettings.saveSingleSetting(key, this.checked);
        
        // 如果當前有選擇的設定組合，也保存到該組合中
        const selectedName = generationSettingsSelect.value;
        if (selectedName) {
          try {
            const currentSettings = settings.generationSettingsGroups[selectedName] || {};
            currentSettings[key] = this.checked;
            
            // 保存到設定組合
            await window.GlobalSettings.saveGenerationSettingsGroup(selectedName, currentSettings);
            console.log(`已更新設定組合 "${selectedName}" 的 ${key}`);
          } catch (error) {
            console.error(`更新設定組合失敗:`, error);
          }
        }
        
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

  function updateStockListSettings() {
    GlobalSettings.saveSingleSetting('stockList', stockListInput.value);
  }

  // 股票爬蟲控制器
  const StockCrawlerController = {
    // 元素引用
    startButton: document.getElementById('start-crawler'),
    autoToggleButton: document.getElementById('auto-crawler-toggle'),
    intervalInput: document.getElementById('crawler-interval'),
    progressContainer: document.getElementById('crawler-progress'),
    progressFill: document.getElementById('progress-fill'),
    progressText: document.getElementById('progress-text'),
    statusText: document.getElementById('crawler-status-text'),
    
    // 狀態變數
    isScheduled: false,
    savedStockListValue: '',
    
    // 初始化
    init() {
      console.log('初始化股票爬蟲控制器');
      
      // 設置爬蟲管理器的回調函數
      if (window.StockCrawlerManager) {
        window.StockCrawlerManager.setCallbacks(
          (status) => this.updateStatus(status),
          (progress) => this.updateProgress(progress),
          (result) => this.onCrawlComplete(result)
        );
      }
      
      // 綁定事件
      this.bindEvents();
      
      // 初始化UI狀態
      this.updateUI();
    },
    
    // 綁定事件
    bindEvents() {
      // 立刻爬取按鈕事件
      this.startButton.addEventListener('click', () => {
        if (window.StockCrawlerManager && window.StockCrawlerManager.isRunning()) {
          this.stopCurrentCrawl();
        } else {
          this.startSingleCrawl();
        }
      });
      
      // 自動爬取切換按鈕事件
      this.autoToggleButton.addEventListener('click', () => {
        if (this.isScheduled) {
          this.stopScheduledCrawl();
        } else {
          this.startScheduledCrawl();
        }
      });
      
      // 間隔時間變化事件
      this.intervalInput.addEventListener('change', () => {
        // 如果當前有定時爬取，重新啟動以應用新間隔
        if (this.isScheduled) {
          this.stopScheduledCrawl();
          this.startScheduledCrawl();
        }
      });
      
      // 監聽股票清單輸入變化
      stockListInput.addEventListener('input', () => {
        // 保存股票清單時也觸發更新
        updateStockListSettings();
      });
    },
    
    // 開始單次爬取
    startSingleCrawl() {
      if (!window.StockCrawlerManager) {
        this.updateStatus('爬蟲管理器未載入', 'error');
        return;
      }
      
      console.log('開始單次股票爬取');
      this.updateStatus('開始爬取...', 'running');
      this.updateStartButtonState(true);
      this.showProgress();
      
      // 保存當前股票清單內容
      this.savedStockListValue = stockListInput.value;
      
      // 開始爬取
      window.StockCrawlerManager.startCrawl();
    },
    
    // 停止當前爬取
    stopCurrentCrawl() {
      if (!window.StockCrawlerManager) {
        return;
      }
      
      console.log('停止當前股票爬取');
      window.StockCrawlerManager.stopCrawl();
      this.updateStatus('已停止當前爬取');
      this.updateStartButtonState(false);
      this.hideProgress();
    },
    
    // 開始定時爬取
    startScheduledCrawl() {
      const interval = parseInt(this.intervalInput.value) || 30;
      
      if (!window.StockCrawlerManager) {
        this.updateStatus('爬蟲管理器未載入', 'error');
        return;
      }
      
      console.log(`開始定時股票爬取，間隔 ${interval} 分鐘`);
      window.StockCrawlerManager.startScheduledCrawl(interval);
      this.isScheduled = true;
      this.updateAutoToggleButtonState(true);
      this.updateStatus(`已啟動自動爬取，每 ${interval} 分鐘執行一次`);
    },
    
    // 停止定時爬取
    stopScheduledCrawl() {
      if (!window.StockCrawlerManager) {
        return;
      }
      
      console.log('停止定時股票爬取');
      window.StockCrawlerManager.stopScheduledCrawl();
      this.isScheduled = false;
      this.updateAutoToggleButtonState(false);
      this.updateStatus('已停止自動爬取');
    },
    
    // 更新狀態顯示
    updateStatus(message, type = 'info') {
      this.statusText.textContent = message;
      this.statusText.className = `status-text ${type}`;
      console.log(`爬蟲狀態: ${message}`);
    },
    
    // 更新進度顯示
    updateProgress(progress) {
      this.progressFill.style.width = `${progress}%`;
      this.progressText.textContent = `${progress}%`;
    },
    
    // 顯示進度條
    showProgress() {
      this.progressContainer.style.display = 'flex';
      this.updateProgress(0);
    },
    
    // 隱藏進度條
    hideProgress() {
      this.progressContainer.style.display = 'none';
    },
    
    // 更新立刻爬取按鈕狀態
    updateStartButtonState(isRunning) {
      if (isRunning) {
        this.startButton.textContent = '停止爬取';
        this.startButton.classList.add('stop');
      } else {
        this.startButton.textContent = '立刻爬取';
        this.startButton.classList.remove('stop');
      }
    },
    
    // 更新自動爬取切換按鈕狀態
    updateAutoToggleButtonState(isScheduled) {
      if (isScheduled) {
        this.autoToggleButton.textContent = '停止自動爬取';
        this.autoToggleButton.classList.add('running');
      } else {
        this.autoToggleButton.textContent = '啟動自動爬取';
        this.autoToggleButton.classList.remove('running');
      }
    },
    
    // 爬取完成回調
    onCrawlComplete(result) {
      console.log('爬取完成', result);
      this.updateStatus(`爬取完成！新增 ${result.added} 支，刪除 ${result.removed} 支股票`, 'success');
      this.hideProgress();
      
      // 重新載入股票清單到輸入框
      this.reloadStockList();
      
      // 恢復按鈕狀態（但保持定時爬取）
      this.updateStartButtonState(false);
    },
    
    // 重新載入股票清單
    async reloadStockList() {
      try {
        const settings = await window.GlobalSettings.loadSettings();
        const newStockList = settings.stockList || '';
        
        // 如果內容有變化，更新輸入框
        if (newStockList !== this.savedStockListValue) {
          stockListInput.value = newStockList;
          console.log('股票清單已更新');
          
          // 觸發內容腳本更新
          throttledUpdateContentScript();
        }
      } catch (error) {
        console.error('重新載入股票清單失敗:', error);
      }
    },
    
    // 更新UI狀態
    updateUI() {
      // 檢查爬蟲是否正在運行
      if (window.StockCrawlerManager && window.StockCrawlerManager.isRunning && window.StockCrawlerManager.isRunning()) {
        this.updateStartButtonState(true);
        this.showProgress();
        this.updateProgress(window.StockCrawlerManager.getCurrentProgress());
        this.updateStatus('正在爬取中...', 'running');
      } else {
        this.updateStartButtonState(false);
        this.hideProgress();
        this.updateStatus('點擊按鈕開始爬取股票清單');
      }
      
      // 更新自動爬取按鈕狀態
      this.updateAutoToggleButtonState(this.isScheduled);
    }
  };

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

      try {
        // 只發送消息到 content script，不進行額外的儲存
        await chrome.tabs.sendMessage(tabs[0].id, {
          action: "updateSettings",
          settings: settings
        });
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
    const newText = this.value;
    const oldText = this._previousValue || ''; // 確保 oldText 是字串

    const newLines = newText.split('\n');
    const oldLines = oldText.split('\n');

    const newEffectiveWordColors = {}; // 這將成為新的全域 wordColors

    for (let i = 0; i < newLines.length; i++) {
      const newLine = newLines[i];

      if (i < oldLines.length) { // 如果在相同索引處存在對應的舊行
        const oldLineAtIndex = oldLines[i];
        if (newLine === oldLineAtIndex) { // 行文字內容相同
          if (wordColors[oldLineAtIndex] !== undefined) { // 且舊行有顏色
            newEffectiveWordColors[newLine] = wordColors[oldLineAtIndex]; // 保留顏色
          }
        } else { // 行文字內容已改變 (newLine !== oldLineAtIndex)
          // 優先檢查新文字本身是否對應已設定的顏色
          if (wordColors[newLine] !== undefined) {
            newEffectiveWordColors[newLine] = wordColors[newLine];
          }
          // 其次，如果舊行有顏色且新行不是空的，則繼承顏色 (用於就地編輯)
          else if (wordColors[oldLineAtIndex] !== undefined && newLine.trim() !== "") {
            newEffectiveWordColors[newLine] = wordColors[oldLineAtIndex];
          }
        }
      } else { // 這是新增加到文件末尾的行
        if (wordColors[newLine] !== undefined) { // 如果新行文字對應已設定的顏色
          newEffectiveWordColors[newLine] = wordColors[newLine];
        }
      }
    }
    // 此迴圈結束後，newEffectiveWordColors 包含 newText 中所有應有顏色的行的顏色。
    // 被刪除且其文字不再出現的行將自然地從 newEffectiveWordColors 中移除。

    wordColors = newEffectiveWordColors; // 更新全域 `wordColors`
    this._previousValue = newText;     // 為下一個輸入事件更新 _previousValue

    updatePreview();                   // 使用更新後的 wordColors 渲染預覽
    updateHighlightWords(newText);     // 將 newText 和更新後的 wordColors 保存到儲存空間
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

    // 獲取 textarea 的 computed style
    const textareaStyle = getComputedStyle(textarea);
    const font = textareaStyle.font;
    const lineHeight = parseFloat(textareaStyle.lineHeight); // 轉換為數字
    const paddingLeft = parseFloat(textareaStyle.paddingLeft); // 轉換為數字
    const paddingTop = parseFloat(textareaStyle.paddingTop);   // 轉換為數字
    // 使用 scrollWidth 考慮到內容可能比可視區域寬
    // 但 clientWidth 是可視區域寬度，更適合用來模擬換行
    const innerWidth = textarea.clientWidth - paddingLeft - parseFloat(textareaStyle.paddingRight);

    // 創建一個隱藏的 div 來計算位置
    const div = document.createElement('div');
    div.style.cssText = `
      position: absolute;
      visibility: hidden;
      white-space: pre-wrap; /* 保持與 textarea 一致的換行 */
      word-wrap: break-word; /* 保持與 textarea 一致的換行 */
      width: ${innerWidth}px; /* 使用內部可用寬度 */
      font: ${font};
      line-height: ${lineHeight}px; /* 確保單位一致 */
      padding: 0; /* 隱藏 div 本身不需要 padding，我們模擬的是 textarea 內部 */
      border: none; /* 隱藏 div 本身不需要 border */
    `;
    textarea.parentElement.appendChild(div);

    // 使用完整文字來計算位置
    div.textContent = text;
    const range = document.createRange();
    // 獲取隱藏 div 相對於 viewport 的位置，作為基準
    const divRectBase = div.getBoundingClientRect(); 

    lines.forEach((line, index) => {
      if (!line.trim()) return;

      // 找到這一行的開始位置
      let lineStart = 0;
      for (let i = 0; i < index; i++) {
        lineStart += lines[i].length + 1; // +1 for the newline character
      }

      if (div.firstChild && div.firstChild.nodeType === Node.TEXT_NODE) {
        const textNode = div.firstChild;
        // 確保 range 的範圍不超過 textNode 的長度
        const lineEnd = Math.min(lineStart + line.length, textNode.length);
        if (lineStart >= lineEnd) return; // 如果起始點超出或等於結束點，跳過

        range.setStart(textNode, lineStart);
        range.setEnd(textNode, lineEnd);
        
        const rects = range.getClientRects();

        for (let i = 0; i < rects.length; i++) {
          const rect = rects[i];
          const preview = document.createElement('div');
          preview.className = 'highlight-preview';
          
          // 計算相對於 textarea 內部的 top 和 left
          // rect.top/left 是相對於 viewport 的
          // divRectBase.top/left 也是相對於 viewport 的
          // textareaStyle.paddingTop/Left 是 textarea 的內邊距
          // 加上 textarea 的 padding 使其對齊 textarea 內部文字
          preview.style.top = `${rect.top - divRectBase.top + paddingTop}px`;
          preview.style.left = `${rect.left - divRectBase.left + paddingLeft}px`;
          preview.style.width = `${rect.width}px`;
          // 使用 lineHeight 或 rect.height，嘗試 lineHeight 使其更規整
          preview.style.height = `${lineHeight > rect.height ? lineHeight : rect.height}px`; 
          preview.style.backgroundColor = wordColors[line] || 'rgba(50, 205, 50, 0.3)';
          preview.dataset.originalTop = rect.top - divRectBase.top + paddingTop; // 保存 originalTop 時也加上 padding
          overlay.appendChild(preview);
        }
      }
    });

    range.detach();
    div.remove();
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

  // 更新設定組合下拉選單
  function updateGenerationSettingsSelect() {
    generationSettingsSelect.innerHTML = '<option value="">選擇設定組合</option>';
    Object.keys(settings.generationSettingsGroups).forEach(name => {
      const option = document.createElement('option');
      option.value = name;
      option.textContent = name;
      if (name === settings.currentGenerationSettings) {
        option.selected = true;
      }
      generationSettingsSelect.appendChild(option);
    });
  }

  // 初始化設定組合下拉選單
  updateGenerationSettingsSelect();

  // 處理設定組合選擇變更
  generationSettingsSelect.addEventListener('change', async function() {
    const selectedName = this.value;
    if (selectedName) {
      try {
        console.group('切換設定組合');
        console.log('選擇的設定組合:', selectedName);
        
        await window.GlobalSettings.loadGenerationSettingsGroup(selectedName);
        console.log('載入設定組合成功');
        
        // 直接更新所有輸入框的值
        console.groupCollapsed('更新輸入框值');
        
        // 更新模型選擇
        generateModelSelect.value = window.GlobalSettings.generateModel;
        console.log('初始生成模型:', window.GlobalSettings.generateModel);
        
        reflect1ModelSelect.value = window.GlobalSettings.reflect1Model;
        console.log('反思一模型:', window.GlobalSettings.reflect1Model);
        
        generationOptimize_1_ModelSelect.value = window.GlobalSettings.generationOptimize_1_Model;
        console.log('生成優化一模型:', window.GlobalSettings.generationOptimize_1_Model);
        
        reflect2ModelSelect.value = window.GlobalSettings.reflect2Model;
        console.log('反思二模型:', window.GlobalSettings.reflect2Model);
        
        generationOptimize_2_ModelSelect.value = window.GlobalSettings.generationOptimize_2_Model;
        console.log('生成優化二模型:', window.GlobalSettings.generationOptimize_2_Model);
        
        reflect3ModelSelect.value = window.GlobalSettings.reflect3Model;
        console.log('反思三模型:', window.GlobalSettings.reflect3Model);
        
        generationOptimize_3_ModelSelect.value = window.GlobalSettings.generationOptimize_3_Model;
        console.log('生成優化三模型:', window.GlobalSettings.generationOptimize_3_Model);

        // 更新指令輸入框，並只顯示前 100 個字元的日誌
        generateInstructionInput.value = window.GlobalSettings.generateInstruction;
        console.log('初始生成指令:', window.GlobalSettings.generateInstruction?.substring(0, 100) + (window.GlobalSettings.generateInstruction?.length > 100 ? '...' : ''));
        
        reflect1InstructionInput.value = window.GlobalSettings.reflect1Instruction;
        console.log('反思一指令:', window.GlobalSettings.reflect1Instruction?.substring(0, 100) + (window.GlobalSettings.reflect1Instruction?.length > 100 ? '...' : ''));
        
        generationOptimize_1_InstructionInput.value = window.GlobalSettings.generationOptimize_1_Instruction;
        console.log('生成優化一指令:', window.GlobalSettings.generationOptimize_1_Instruction?.substring(0, 100) + (window.GlobalSettings.generationOptimize_1_Instruction?.length > 100 ? '...' : ''));
        
        reflect2InstructionInput.value = window.GlobalSettings.reflect2Instruction;
        console.log('反思二指令:', window.GlobalSettings.reflect2Instruction?.substring(0, 100) + (window.GlobalSettings.reflect2Instruction?.length > 100 ? '...' : ''));
        
        generationOptimize_2_InstructionInput.value = window.GlobalSettings.generationOptimize_2_Instruction;
        console.log('生成優化二指令:', window.GlobalSettings.generationOptimize_2_Instruction?.substring(0, 100) + (window.GlobalSettings.generationOptimize_2_Instruction?.length > 100 ? '...' : ''));
        
        reflect3InstructionInput.value = window.GlobalSettings.reflect3Instruction;
        console.log('反思三指令:', window.GlobalSettings.reflect3Instruction?.substring(0, 100) + (window.GlobalSettings.reflect3Instruction?.length > 100 ? '...' : ''));
        
        generationOptimize_3_InstructionInput.value = window.GlobalSettings.generationOptimize_3_Instruction;
        console.log('生成優化三指令:', window.GlobalSettings.generationOptimize_3_Instruction?.substring(0, 100) + (window.GlobalSettings.generationOptimize_3_Instruction?.length > 100 ? '...' : ''));
        
        backgroundKnowledgeInput.value = window.GlobalSettings.backgroundKnowledge;
        console.log('背景知識:', window.GlobalSettings.backgroundKnowledge?.substring(0, 100) + (window.GlobalSettings.backgroundKnowledge?.length > 100 ? '...' : ''));
        
        console.groupEnd(); // 結束更新輸入框值群組
        console.log('所有設定已更新完成');
        console.groupEnd(); // 結束切換設定組合群組
      } catch (error) {
        console.error('載入設定組合失敗:', error);
        alert('載入設定組合失敗: ' + error.message);
      }
    }
  });

  // 處理新增設定組合
  addGenerationSettingsBtn.addEventListener('click', async function() {
    const name = prompt('請輸入新設定組合的名稱:');
    if (name) {
      if (settings.generationSettingsGroups[name]) {
        alert('設定組合名稱已存在');
        return;
      }
      try {
        const currentSettings = window.GlobalSettings.getCurrentGenerationSettings();
        await window.GlobalSettings.saveGenerationSettingsGroup(name, currentSettings);
        updateGenerationSettingsSelect();
      } catch (error) {
        console.error('新增設定組合失敗:', error);
        alert('新增設定組合失敗: ' + error.message);
      }
    }
  });

  // 處理修改設定組合名稱
  editGenerationSettingsBtn.addEventListener('click', async function() {
    const selectedName = generationSettingsSelect.value;
    if (!selectedName) {
      alert('請先選擇要重命名的設定組合');
      return;
    }
    const newName = prompt('請輸入新的設定組合名稱:', selectedName);
    if (newName && newName !== selectedName) {
      if (settings.generationSettingsGroups[newName]) {
        alert('設定組合名稱已存在');
        return;
      }
      try {
        // 獲取當前設定
        const currentSettings = settings.generationSettingsGroups[selectedName];
        // 從本地儲存獲取設定
        const localStorageKey = `generation_settings_${selectedName}`;
        const localSettings = await new Promise((resolve) => {
          chrome.storage.local.get([localStorageKey], (result) => resolve(result[localStorageKey] || {}));
        });
        
        // 儲存到新名稱
        await window.GlobalSettings.saveGenerationSettingsGroup(newName, {
          ...currentSettings,
          ...localSettings
        });
        
        // 刪除舊名稱的設定
        await window.GlobalSettings.deleteGenerationSettingsGroup(selectedName);
        
        // 更新下拉選單
        updateGenerationSettingsSelect();
      } catch (error) {
        console.error('重命名設定組合失敗:', error);
        alert('重命名設定組合失敗: ' + error.message);
      }
    }
  });

  // 處理刪除設定組合
  deleteGenerationSettingsBtn.addEventListener('click', async function() {
    const selectedName = generationSettingsSelect.value;
    if (!selectedName) {
      alert('請先選擇要刪除的設定組合');
      return;
    }
    if (confirm(`確定要刪除設定組合 "${selectedName}" 嗎？`)) {
      try {
        await window.GlobalSettings.deleteGenerationSettingsGroup(selectedName);
        updateGenerationSettingsSelect();
      } catch (error) {
        console.error('刪除設定組合失敗:', error);
        alert('刪除設定組合失敗: ' + error.message);
      }
    }
  });

  // 處理複製設定組合
  document.getElementById('copy-generation-settings').addEventListener('click', async function() {
    const selectedName = generationSettingsSelect.value;
    if (!selectedName) {
      alert('請先選擇要複製的設定組合');
      return;
    }
    
    const newName = prompt('請輸入新設定組合的名稱:');
    if (newName) {
      if (settings.generationSettingsGroups[newName]) {
        alert('設定組合名稱已存在');
        return;
      }
      try {
        // 獲取同步儲存的設定
        const syncSettings = settings.generationSettingsGroups[selectedName];
        
        // 從本地儲存獲取設定
        const localStorageKey = `generation_settings_${selectedName}`;
        const localSettings = await new Promise((resolve) => {
          chrome.storage.local.get([localStorageKey], (result) => resolve(result[localStorageKey] || {}));
        });
        
        // 合併設定並儲存
        await window.GlobalSettings.saveGenerationSettingsGroup(newName, {
          ...syncSettings,
          ...localSettings
        });
        
        updateGenerationSettingsSelect();
      } catch (error) {
        console.error('複製設定組合失敗:', error);
        alert('複製設定組合失敗: ' + error.message);
      }
    }
  });

  // 自定義模型管理功能
  const CustomModelManager = {
    autoDetectDebounceTimer: null, // 防抖計時器
    
    init() {
      this.bindEvents();
      this.updateCustomModelsList();
    },

    bindEvents() {
      console.log('開始綁定 CustomModelManager 事件');
      
      // 重新獲取元素以確保它們存在
      const customModelNameInput = document.getElementById('custom-model-name');
      const customModelDisplayInput = document.getElementById('custom-model-display');
      const customModelTypeSelect = document.getElementById('custom-model-type');
      const addCustomModelBtn = document.getElementById('add-custom-model');
      
      console.log('元素獲取結果:', {
        customModelNameInput: !!customModelNameInput,
        customModelDisplayInput: !!customModelDisplayInput,
        customModelTypeSelect: !!customModelTypeSelect,
        addCustomModelBtn: !!addCustomModelBtn
      });
      
      if (addCustomModelBtn) {
        addCustomModelBtn.addEventListener('click', () => {
          console.log('新增模型按鈕被點擊');
          this.addCustomModel();
        });
        console.log('新增模型按鈕事件已綁定');
      } else {
        console.error('找不到新增模型按鈕元素');
      }
      
      // 添加模型名稱和顯示名稱輸入框的自動識別功能
      if (customModelNameInput && customModelDisplayInput && customModelTypeSelect) {
        // 模型名稱輸入框的自動識別
        customModelNameInput.addEventListener('input', (e) => {
          console.log('檢測到模型名稱輸入:', e.target.value.trim());
          this.debouncedAutoDetect(e.target.value.trim(), customModelTypeSelect, 'modelName');
        });
        
        customModelNameInput.addEventListener('blur', (e) => {
          console.log('模型名稱輸入框失去焦點:', e.target.value.trim());
          this.autoDetectApiType(e.target.value.trim(), customModelTypeSelect, 'modelName');
        });

        // 顯示名稱輸入框的自動識別
        customModelDisplayInput.addEventListener('input', (e) => {
          console.log('檢測到顯示名稱輸入:', e.target.value.trim());
          this.debouncedAutoDetect(e.target.value.trim(), customModelTypeSelect, 'displayName');
        });
        
        customModelDisplayInput.addEventListener('blur', (e) => {
          console.log('顯示名稱輸入框失去焦點:', e.target.value.trim());
          this.autoDetectApiType(e.target.value.trim(), customModelTypeSelect, 'displayName');
        });
        
        console.log('✅ 模型名稱和顯示名稱輸入框自動識別事件已綁定');
      } else {
        console.error('❌ 找不到必要元素:', {
          customModelNameInput: !!customModelNameInput,
          customModelDisplayInput: !!customModelDisplayInput,
          customModelTypeSelect: !!customModelTypeSelect
        });
      }
    },

    // 防抖版本的自動識別
    debouncedAutoDetect(modelName, customModelTypeSelect, type) {
      // 清除之前的計時器
      if (this.autoDetectDebounceTimer) {
        clearTimeout(this.autoDetectDebounceTimer);
      }
      
      // 設置新的計時器，300毫秒後執行識別
      this.autoDetectDebounceTimer = setTimeout(() => {
        this.autoDetectApiType(modelName, customModelTypeSelect, type);
      }, 300);
    },

    // 自動識別模型 API 類型
    autoDetectApiType(inputText, customModelTypeSelect, type = 'modelName') {
      // 如果沒有傳入元素，嘗試重新獲取
      if (!customModelTypeSelect) {
        customModelTypeSelect = document.getElementById('custom-model-type');
      }
      
      if (!inputText || !customModelTypeSelect) {
        console.log('自動識別終止:', {
          inputText: !!inputText,
          customModelTypeSelect: !!customModelTypeSelect
        });
        return;
      }
      
      console.log(`🔍 開始自動識別${type === 'displayName' ? '顯示名稱' : '模型名稱'}:`, inputText);
      
      let detectedType = 'gemini'; // 預設為 gemini
      
      // 根據輸入類型決定處理方式
      let textToAnalyze = inputText.toLowerCase();
      
      if (type === 'displayName') {
        // 如果是顯示名稱，嘗試從中提取模型名稱
        // 移除常見的描述詞彙，保留關鍵的模型標識
        textToAnalyze = textToAnalyze
          .replace(/\s*(api|模型|model|版本|version|最新|latest|pro|advanced|mini|小型|大型|智能|ai)\s*/g, ' ')
          .replace(/\s+/g, ' ')
          .trim();
        console.log(`📝 從顯示名稱提取的關鍵詞: "${textToAnalyze}"`);
      }
      
      // OpenAI 模型識別規則（增強版）
      const openaiPatterns = [
        // GPT 系列 - 更寬鬆的匹配
        /gpt[\s\-]?4/,          // GPT-4, GPT 4, gpt4
        /gpt[\s\-]?3\.?5?/,     // GPT-3.5, GPT 3.5, gpt35
        /gpt[\s\-]?o/,          // GPT-4o, GPT o1
        /\bgpt\b/,              // 包含 gpt 的模型
        
        // 經典 OpenAI 模型
        /text[\s\-]?davinci/,   // text-davinci-003 等
        /davinci/,              // davinci
        /curie/,                // curie
        /babbage/,              // babbage
        /ada\b/,                // ada (避免匹配到其他詞)
        
        // 新模型系列
        /o1[\s\-]?(preview|mini)?/, // o1-preview, o1-mini
        /o3[\s\-]/,             // o3 系列
        
        // 代碼模型
        /code[\s\-]?davinci/,   // code-davinci-002 等
        /codex/,                // codex
        
        // 品牌相關
        /openai/,               // 包含 openai 的模型
        /chatgpt/,              // chatgpt 相關
        
        // 特殊後綴和描述
        /turbo\b/,              // turbo 模型
        /instruct\b/,           // instruct 模型
        /\bmini\b.*gpt/,        // mini 版本的 GPT
        /\bpro\b.*gpt/          // pro 版本的 GPT
      ];
      
      // Gemini/Google 模型識別規則（增強版）
      const geminiPatterns = [
        /gemini/,               // gemini 開頭或包含
        /palm[\s\-]?2?/,        // PaLM 模型, PaLM 2
        /bard/,                 // Bard 模型
        /google/,               // 包含 google
        /claude/,               // Claude 模型
        /lamda/,                // LaMDA 模型
        /minerva/,              // Minerva 模型
        /pathways/,             // Pathways 模型
        /flash\b/,              // Gemini Flash
        /\bpro\b.*gemini/,      // Pro 版本的 Gemini
        /gemini.*\bpro\b/       // Gemini Pro
      ];
      
      // 檢查是否匹配 OpenAI 模式
      if (openaiPatterns.some(pattern => pattern.test(textToAnalyze))) {
        detectedType = 'openai';
      } 
      // 檢查是否匹配 Gemini 模式
      else if (geminiPatterns.some(pattern => pattern.test(textToAnalyze))) {
        detectedType = 'gemini';
      }
      
      console.log('🎯 識別結果:', {
        輸入類型: type === 'displayName' ? '顯示名稱' : '模型名稱',
        原始輸入: inputText,
        分析文本: textToAnalyze,
        識別類型: detectedType,
        當前選擇: customModelTypeSelect.value
      });
      
      // 如果當前選擇的類型與識別出的類型不同，則自動更新
      if (customModelTypeSelect.value !== detectedType) {
        console.log(`🎯 自動選擇 API 類型: ${detectedType} (來源: ${type === 'displayName' ? '顯示名稱' : '模型名稱'})`);
        customModelTypeSelect.value = detectedType;
        
        // 添加視覺反饋：使用CSS類實現更好的動畫效果
        customModelTypeSelect.classList.add('auto-detected', detectedType, 'auto-detect-pulse');
        
        // 1.2秒後移除動畫和高亮類
        setTimeout(() => {
          customModelTypeSelect.classList.remove('auto-detected', 'gemini', 'openai', 'auto-detect-pulse');
        }, 1200);
        
        // 顯示控制台提示訊息
        if (detectedType === 'openai') {
          console.log(`✅ 從${type === 'displayName' ? '顯示名稱' : '模型名稱'}檢測到 OpenAI 模型，已自動選擇 OpenAI API`);
        } else if (detectedType === 'gemini') {
          console.log(`✅ 從${type === 'displayName' ? '顯示名稱' : '模型名稱'}檢測到 Gemini 模型，已自動選擇 Gemini API`);
        }
      } else {
        console.log('⚡ 類型一致，無需更新');
      }
    },

    // 測試自動識別功能（開發用）
    testAutoDetection() {
      const modelNameTests = [
        // OpenAI 模型測試用例
        { name: 'gpt-4', expected: 'openai' },
        { name: 'gpt-4-1-mini', expected: 'openai' },
        { name: 'gpt-3.5-turbo', expected: 'openai' },
        { name: 'text-davinci-003', expected: 'openai' },
        { name: 'o1-preview', expected: 'openai' },
        { name: 'code-davinci-002', expected: 'openai' },
        
        // Gemini 模型測試用例
        { name: 'gemini-pro', expected: 'gemini' },
        { name: 'gemini-1.5-flash', expected: 'gemini' },
        { name: 'palm-2', expected: 'gemini' },
        { name: 'bard', expected: 'gemini' },
        
        // 邊界情況
        { name: 'my-custom-gpt-model', expected: 'openai' },
        { name: 'google-gemini-advanced', expected: 'gemini' }
      ];

      const displayNameTests = [
        // OpenAI 顯示名稱測試
        { name: 'GPT-4 智能模型', expected: 'openai' },
        { name: 'OpenAI GPT 3.5 Turbo', expected: 'openai' },
        { name: '最新 GPT-4o 版本', expected: 'openai' },
        { name: 'ChatGPT 模型', expected: 'openai' },
        { name: 'O1 Preview 模型', expected: 'openai' },
        { name: 'GPT Mini 版本', expected: 'openai' },
        
        // Gemini 顯示名稱測試
        { name: 'Gemini Pro 高級版', expected: 'gemini' },
        { name: 'Google Gemini Flash 模型', expected: 'gemini' },
        { name: 'Gemini 1.5 Advanced AI', expected: 'gemini' },
        { name: 'PaLM 2 最新版本', expected: 'gemini' },
        { name: 'Google Bard 模型', expected: 'gemini' },
        { name: 'Gemini Flash 智能版', expected: 'gemini' },
        
        // 混合情況
        { name: '企業級 GPT 解決方案', expected: 'openai' },
        { name: 'Google AI Gemini 服務', expected: 'gemini' }
      ];
      
      console.log('🧪 開始測試模型名稱自動識別功能...');
      modelNameTests.forEach(testCase => {
        const detected = this.getDetectedApiType(testCase.name, 'modelName');
        const passed = detected === testCase.expected;
        console.log(`${passed ? '✅' : '❌'} 模型名稱: ${testCase.name} → ${detected} (期望: ${testCase.expected})`);
      });

      console.log('\n🧪 開始測試顯示名稱自動識別功能...');
      displayNameTests.forEach(testCase => {
        const detected = this.getDetectedApiType(testCase.name, 'displayName');
        const passed = detected === testCase.expected;
        console.log(`${passed ? '✅' : '❌'} 顯示名稱: ${testCase.name} → ${detected} (期望: ${testCase.expected})`);
      });
      
      console.log('🧪 測試完成');
    },

    // 獲取模型的 API 類型（不更新UI，僅用於測試）
    getDetectedApiType(inputText, type = 'modelName') {
      if (!inputText) return 'gemini';
      
      // 根據輸入類型決定處理方式
      let textToAnalyze = inputText.toLowerCase();
      
      if (type === 'displayName') {
        // 如果是顯示名稱，嘗試從中提取模型名稱
        textToAnalyze = textToAnalyze
          .replace(/\s*(api|模型|model|版本|version|最新|latest|pro|advanced|mini|小型|大型|智能|ai)\s*/g, ' ')
          .replace(/\s+/g, ' ')
          .trim();
      }
      
      const openaiPatterns = [
        /gpt[\s\-]?4/, /gpt[\s\-]?3\.?5?/, /gpt[\s\-]?o/, /\bgpt\b/, 
        /text[\s\-]?davinci/, /davinci/, /curie/, /babbage/, /ada\b/, 
        /o1[\s\-]?(preview|mini)?/, /o3[\s\-]/, /code[\s\-]?davinci/, /codex/,
        /openai/, /chatgpt/, /turbo\b/, /instruct\b/, /\bmini\b.*gpt/, /\bpro\b.*gpt/
      ];
      
      const geminiPatterns = [
        /gemini/, /palm[\s\-]?2?/, /bard/, /google/, /claude/, 
        /lamda/, /minerva/, /pathways/, /flash\b/, /\bpro\b.*gemini/, /gemini.*\bpro\b/
      ];
      
      if (openaiPatterns.some(pattern => pattern.test(textToAnalyze))) {
        return 'openai';
      } else if (geminiPatterns.some(pattern => pattern.test(textToAnalyze))) {
        return 'gemini';
      }
      
      return 'gemini'; // 預設
    },

    // 新增自定義模型
    async addCustomModel() {
      try {
        // 重新獲取元素以確保它們存在
        const customModelNameInput = document.getElementById('custom-model-name');
        const customModelDisplayInput = document.getElementById('custom-model-display');
        const customModelTypeSelect = document.getElementById('custom-model-type');
        
        if (!customModelNameInput || !customModelDisplayInput || !customModelTypeSelect) {
          console.error('找不到必要的表單元素');
          alert('找不到必要的表單元素，請重新載入頁面');
          return;
        }
        
        const modelName = customModelNameInput.value.trim();
        const displayName = customModelDisplayInput.value.trim();
        const apiType = customModelTypeSelect.value;

        if (!modelName || !displayName) {
          alert('請填寫模型名稱和顯示名稱');
          return;
        }

        // 檢查 API 類型
        if (!apiType) {
          alert('請選擇 API 類型');
          return;
        }

        // 檢查模型名稱格式
        if (!/^[a-z0-9-_.]+$/i.test(modelName)) {
          alert('模型名稱只能包含字母、數字、連字號、底線和點');
          return;
        }

        await GlobalSettings.addCustomModel(modelName, displayName, apiType);
        
        // 清空輸入框
        customModelNameInput.value = '';
        customModelDisplayInput.value = '';
        customModelTypeSelect.value = '';

        // 更新模型列表顯示
        this.updateCustomModelsList();
        
        // 更新所有模型選擇下拉選單
        this.updateAllModelSelects();

        alert('模型新增成功！');
      } catch (error) {
        console.error('新增模型錯誤:', error);
        alert('新增模型失敗：' + error.message);
      }
    },

    // 刪除自定義模型
    async removeCustomModel(modelName) {
      console.log(`開始刪除模型: ${modelName}`);
      
      if (!modelName) {
        console.error('模型名稱為空');
        alert('模型名稱無效');
        return;
      }
      
      if (confirm(`確定要刪除模型 "${modelName}" 嗎？這將同時移除相關的 API 金鑰。`)) {
        try {
          console.log(`用戶確認刪除模型: ${modelName}`);
          await GlobalSettings.removeCustomModel(modelName);
          console.log(`成功從 GlobalSettings 中刪除模型: ${modelName}`);
          
          // 更新模型列表顯示
          this.updateCustomModelsList();
          console.log('模型列表顯示已更新');
          
          // 更新所有模型選擇下拉選單
          this.updateAllModelSelects();
          console.log('所有模型選擇下拉選單已更新');

          // 如果當前API金鑰選擇器選中的是被刪除的模型，切換到第一個可用模型
          if (modelSelect.value === modelName) {
            console.log(`當前選中的模型 ${modelName} 被刪除，切換到第一個可用模型`);
            modelSelect.selectedIndex = 0;
            updateApiKeyInput();
          }

          alert('模型刪除成功！');
          console.log(`模型 ${modelName} 刪除完成`);
        } catch (error) {
          console.error(`刪除模型失敗:`, error);
          alert('刪除模型失敗：' + error.message);
        }
      } else {
        console.log('用戶取消刪除操作');
      }
    },

    // 更新自定義模型列表顯示
    updateCustomModelsList() {
      console.log('開始更新自定義模型列表');
      
      // 重新獲取元素以確保它存在
      const customModelsContainer = document.getElementById('custom-models-container');
      
      if (!customModelsContainer) {
        console.error('找不到 customModelsContainer 元素');
        return;
      }

      const customModels = GlobalSettings.getCustomModels();
      console.log('獲取到的自定義模型:', customModels);
      
      if (Object.keys(customModels).length === 0) {
        console.log('沒有自定義模型，顯示提示文字');
        customModelsContainer.innerHTML = '<p style="color: #6c757d; font-size: 12px; margin: 0;">尚未新增任何自定義模型</p>';
        return;
      }

      console.log(`找到 ${Object.keys(customModels).length} 個自定義模型`);
      
      // 清空容器
      customModelsContainer.innerHTML = '';
      
      // 為每個自定義模型創建元素
      Object.entries(customModels).forEach(([key, model]) => {
        console.log(`創建模型 ${key} 的界面元素`);
        
        const modelItem = document.createElement('div');
        modelItem.className = 'custom-model-item';
        
        modelItem.innerHTML = `
          <div class="custom-model-info">
            <div class="custom-model-name">${model.displayName}</div>
            <div class="custom-model-details">${key}</div>
            <div class="custom-model-api-type">${model.apiType === 'gemini' ? 'Gemini API' : 'OpenAI API'}</div>
          </div>
          <div class="custom-model-actions">
            <button class="delete-model-button" data-model-key="${key}">刪除</button>
          </div>
        `;
        
        // 添加刪除按鈕的事件監聽器
        const deleteButton = modelItem.querySelector('.delete-model-button');
        deleteButton.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          console.log(`點擊刪除模型: ${key}`);
          this.removeCustomModel(key);
        });
        
        customModelsContainer.appendChild(modelItem);
        console.log(`模型 ${key} 的界面元素已添加`);
      });
      
      console.log('自定義模型列表更新完成');
    },

    // 更新所有模型選擇下拉選單
    updateAllModelSelects() {
      const allModels = GlobalSettings.getAllAvailableModels();
      
      // API 金鑰選擇器應該只顯示服務提供商，不包含自定義模型
      const apiProviders = {
        'gemini': 'Gemini',
        'openai': 'OpenAI', 
        'google-translate': 'Google 翻譯'
      };
      
      // 要更新的功能模型選擇器（不包括 API 金鑰選擇器）
      const modelSelectors = [
        fullRewriteModelSelect,
        shortRewriteModelSelect,
        autoRewriteModelSelect,
        translateModelSelect,
        generateModelSelect,
        reflect1ModelSelect,
        generationOptimize_1_ModelSelect,
        reflect2ModelSelect,
        generationOptimize_2_ModelSelect,
        reflect3ModelSelect,
        generationOptimize_3_ModelSelect,
        summaryModelSelect,
        reflectModelSelect,
        optimizeModelSelect
      ];

      // 更新 API 金鑰選擇器（保持原有的服務提供商選項）
      if (modelSelect) {
        const currentValue = modelSelect.value;
        modelSelect.innerHTML = '';
        
        Object.entries(apiProviders).forEach(([key, displayName]) => {
          const option = document.createElement('option');
          option.value = key;
          option.textContent = displayName;
          modelSelect.appendChild(option);
        });
        
        // 恢復之前的選擇
        if (apiProviders[currentValue]) {
          modelSelect.value = currentValue;
        }
      }

      // 更新功能模型選擇器（包含所有可用模型，但排除 google-translate）
      modelSelectors.forEach(selector => {
        if (!selector) return;
        
        const currentValue = selector.value;
        console.log(`更新選擇器，當前值: ${currentValue}`);
        
        // 清空現有選項
        selector.innerHTML = '';
        
        // 檢查是否有可用模型
        const availableModels = Object.entries(allModels).filter(([key]) => key !== 'google-translate');
        
        if (availableModels.length === 0) {
          // 沒有模型時，顯示提示選項
          const option = document.createElement('option');
          option.value = '';
          option.textContent = '請先新增模型';
          option.disabled = true;
          selector.appendChild(option);
          selector.disabled = true;
        } else {
          // 有模型時，啟用選擇器並添加模型選項
          selector.disabled = false;
          
          availableModels.forEach(([key, displayName]) => {
            const option = document.createElement('option');
            option.value = key;
            option.textContent = displayName;
            selector.appendChild(option);
          });
          
          // 恢復之前的選擇，如果該選項仍然存在
          if (currentValue && allModels[currentValue]) {
            console.log(`恢復之前的選擇: ${currentValue}`);
            selector.value = currentValue;
          } else {
            console.log(`之前的選擇 ${currentValue} 不存在，保持空值`);
            // 不要自動選擇第一個選項，保持用戶原來的設定
            selector.value = '';
          }
        }
      });
    }
  };

  // 暴露 CustomModelManager 到全局作用域
  window.CustomModelManager = CustomModelManager;
  console.log('CustomModelManager 已暴露到全局作用域');

  // 立即初始化 CustomModelManager 和 StockCrawlerController
  setTimeout(async () => {
    console.log('🚀 開始初始化 CustomModelManager');
    try {
      CustomModelManager.init();
      console.log('✅ CustomModelManager 初始化完成');
      
      // 在此處添加調用，以確保所有下拉選單在彈出視窗開啟時被正確填充
      CustomModelManager.updateAllModelSelects();
      console.log('✅ 已調用 updateAllModelSelects 更新所有模型下拉選單');
      
      // 重新載入設定以恢復用戶的模型選擇
      console.log('🔄 重新載入設定以恢復用戶的模型選擇...');
      const currentSettings = await GlobalSettings.loadSettings();
      
      // 重新應用模型選擇設定
      const modelMappings = [
        { setting: 'fullRewriteModel', element: fullRewriteModelSelect },
        { setting: 'shortRewriteModel', element: shortRewriteModelSelect },
        { setting: 'autoRewriteModel', element: autoRewriteModelSelect },
        { setting: 'translateModel', element: translateModelSelect },
        { setting: 'generateModel', element: generateModelSelect },
        { setting: 'reflect1Model', element: reflect1ModelSelect },
        { setting: 'generationOptimize_1_Model', element: generationOptimize_1_ModelSelect },
        { setting: 'reflect2Model', element: reflect2ModelSelect },
        { setting: 'generationOptimize_2_Model', element: generationOptimize_2_ModelSelect },
        { setting: 'reflect3Model', element: reflect3ModelSelect },
        { setting: 'generationOptimize_3_Model', element: generationOptimize_3_ModelSelect },
        { setting: 'summaryModel', element: summaryModelSelect },
        { setting: 'reflectModel', element: reflectModelSelect },
        { setting: 'optimizeModel', element: optimizeModelSelect }
      ];
      
      modelMappings.forEach(({ setting, element }) => {
        if (element && currentSettings[setting]) {
          console.log(`🔧 恢復 ${setting} 設定: ${currentSettings[setting]}`);
          element.value = currentSettings[setting];
        }
      });
      
      console.log('✅ 模型選擇設定恢復完成');
    } catch (error) {
      console.error('❌ 初始化 CustomModelManager 時發生錯誤:', error);
    }
    
    // 初始化股票爬蟲控制器
    console.log('🚀 開始初始化 StockCrawlerController');
    try {
      if (typeof StockCrawlerController !== 'undefined') {
        StockCrawlerController.init();
        console.log('✅ StockCrawlerController 初始化完成');
      } else {
        console.warn('⚠️ StockCrawlerController 未定義');
      }
    } catch (error) {
      console.error('❌ 初始化 StockCrawlerController 時發生錯誤:', error);
    }
  }, 100);
});
