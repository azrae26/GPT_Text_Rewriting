/**
 * popup.js - 擴充功能彈出視窗的主要腳本（入口點）(2025/06/08 更新)
 * 功能：統一管理 API 金鑰、改寫設置、模型選擇、高亮功能、自動替換等配置項目
 * 職責：
 * - 作為彈出視窗的主要入口點，協調各功能模組
 * - 管理 API 金鑰和模型配置
 * - 處理改寫、翻譯、生成相關的 UI 和設定
 * - 整合高亮文字和自動替換功能
 * - 統一事件處理和設定同步
 * - 整合股票功能控制器（StockManager 和 StockCrawlerController）
 * 
 * 依賴：
 * - GlobalSettings：全局設定管理
 * - CustomModelManager：自定義模型管理
 * - StockManager：股票功能管理（來自 popup/stock-controller.js）
 * - AutoReplaceManager：自動替換管理
 * - Chrome Extensions API：storage, tabs, runtime
 * 
 * 模組化設計：
 * - 股票相關功能已獨立為 popup/stock-controller.js
 * - 通過 StockManager 接口與股票控制器交互
 * - 保持功能完整性和代碼關聯性
 */

document.addEventListener('DOMContentLoaded', async function() {
  LogUtils.log('DOM 載入完成，開始初始化...');
  
  // 輔助函數：獲取當前時間字符串
  function getCurrentTimeString() {
    return new Date().toISOString();
  }

  // 監聽來自 background 的訊息
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'settingsUpdated') {
      LogUtils.log('收到設定更新通知:', message.data);
      
      // 當雲端同步或強制下載更新設定時，重新載入 popup 的設定
      if (message.data.reason === 'cloudSync' || message.data.reason === 'forceDownload') {
        LogUtils.log(`${message.data.reason === 'cloudSync' ? '雲端同步' : '強制下載'}已更新設定，正在重新載入...`);
        
        // 延遲一下再重新載入，確保儲存完成
        setTimeout(async () => {
          try {
            // 重新載入設定
            const updatedSettings = await GlobalSettings.loadSettings();
            LogUtils.log('重新載入的設定:', updatedSettings);
            
            // 重新應用到 UI（這裡可以添加更多特定的 UI 更新邏輯）
            location.reload(); // 簡單重新載入 popup
          } catch (error) {
            LogUtils.error('重新載入設定失敗:', error);
          }
        }, 500);
      }
      
      sendResponse({ received: true });
    }
  });

  // DOM 元素獲取
  const apiKeyInput = document.getElementById('api-key');
  const modelSelect = document.getElementById('model-select');
  const instructionInput = document.getElementById('instruction');
  const shortInstructionInput = document.getElementById('shortInstruction');
  const autoRewritePatternsInput = document.getElementById('autoRewritePatterns');
  const fullRewriteModelSelect = document.getElementById('fullRewriteModel');
  const shortRewriteModelSelect = document.getElementById('shortRewriteModel');
  const autoRewriteModelSelect = document.getElementById('autoRewriteModel');
  const rewriteButton = document.getElementById('rewrite');
  const translateModelSelect = document.getElementById('translateModel');
  const translateInstructionInput = document.getElementById('translateInstruction');
  const removeHashCheckbox = document.getElementById('removeHash');
  const removeStarCheckbox = document.getElementById('removeStar');
  const zhEnMappingInput = document.getElementById('zhEnMapping');
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
  const summaryModelSelect = document.getElementById('summaryModel');
  const summaryInstructionInput = document.getElementById('summaryInstruction');
  const codeCheckModelSelect = document.getElementById('codeCheckModel');
  const codeCheckInstructionInput = document.getElementById('codeCheckInstruction');

  const highlightWordsInput = document.getElementById('highlight-words');
  const stockListInput = document.getElementById('stock-list-input');
  const reflectModelSelect = document.getElementById('reflectModel');
  const optimizeModelSelect = document.getElementById('optimizeModel');
  const reflectInstructionInput = document.getElementById('reflectInstruction');
  const optimizeInstructionInput = document.getElementById('optimizeInstruction');
  const generationSettingsSelect = document.getElementById('generation-settings-select');
  const addGenerationSettingsBtn = document.getElementById('add-generation-settings');
  const editGenerationSettingsBtn = document.getElementById('edit-generation-settings');
  const deleteGenerationSettingsBtn = document.getElementById('delete-generation-settings');
  const customModelNameInput = document.getElementById('custom-model-name');
  const customModelDisplayInput = document.getElementById('custom-model-display');
  const customModelTypeSelect = document.getElementById('custom-model-type');
  const addCustomModelBtn = document.getElementById('add-custom-model');
  const customModelsContainer = document.getElementById('custom-models-container');
  const syncStatus = document.getElementById('sync-status');
  const statusIcon = document.getElementById('status-icon');
  const statusText = document.getElementById('status-text');
  const authButton = document.getElementById('auth-button');
  const signoutButton = document.getElementById('signout-button');
  const manualSyncButton = document.getElementById('manual-sync-button');
  const autoSyncToggle = document.getElementById('auto-sync-toggle');
  const syncError = document.getElementById('sync-error');

  // 初始化設定
  let apiKeys = {};
  let settingsIO = null;
  let settings = await GlobalSettings.loadSettings();
  
  // 初始化並暴露 SettingsIO 實例
  if (typeof SettingsIO !== 'undefined') {
    settingsIO = new SettingsIO();
    window.settingsIO = settingsIO; // 暴露到全局，供 settings-manager.js 使用
    LogUtils.log('SettingsIO 實例已初始化並暴露到 window');
  } else {
    LogUtils.warn('SettingsIO 類別未載入');
  }
  
  // 檢查是否為首次使用，如果是則應用預設設定
  const hasUserSettings = settings.instruction || settings.translateInstruction || 
                          settings.stockList || settings.zhEnMapping ||
                          settings.summaryInstruction || settings.reflectInstruction ||
                          settings.optimizeInstruction || settings.generateInstruction ||
                          settings.backgroundKnowledge ||
                          Object.keys(settings.apiKeys || {}).length > 0;
  
  if (!hasUserSettings && typeof DefaultSettings !== 'undefined') {
    Object.keys(DefaultSettings).forEach(key => {
      if (settings[key] === undefined || settings[key] === '') {
        settings[key] = DefaultSettings[key];
      }
    });
    await GlobalSettings.saveSettings(settings);
  }
  
  // 載入設定到 UI 元素
  apiKeys = settings.apiKeys || {};
  instructionInput.value = settings.instruction || '';
  shortInstructionInput.value = settings.shortInstruction || '';
  autoRewritePatternsInput.value = settings.autoRewritePatterns || '';
  fullRewriteModelSelect.value = settings.fullRewriteModel || '';
  shortRewriteModelSelect.value = settings.shortRewriteModel || '';
  autoRewriteModelSelect.value = settings.autoRewriteModel || '';
  translateModelSelect.value = settings.translateModel || '';
  translateInstructionInput.value = settings.translateInstruction || '';
  removeHashCheckbox.checked = settings.removeHash !== undefined ? settings.removeHash : true;
  removeStarCheckbox.checked = settings.removeStar !== undefined ? settings.removeStar : true;
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
  reflectModelSelect.value = settings.reflectModel || '';
  reflectInstructionInput.value = settings.reflectInstruction || '';
  optimizeModelSelect.value = settings.optimizeModel || '';
  optimizeInstructionInput.value = settings.optimizeInstruction || '';
  summaryModelSelect.value = settings.summaryModel || '';
  summaryInstructionInput.value = settings.summaryInstruction || '';
  codeCheckModelSelect.value = settings.codeCheckModel || '';
  codeCheckInstructionInput.value = settings.codeCheckInstruction || '';
  zhEnMappingInput.value = settings.zhEnMapping || '';
  stockListInput.value = settings.stockList || '';
  
  const crawlerIntervalInput = document.getElementById('crawler-interval');
  if (crawlerIntervalInput) {
    crawlerIntervalInput.value = settings.crawlerInterval || 30;
  }
  
  // 載入同步間隔設定
  const syncIntervalInput = document.getElementById('sync-interval');
  if (syncIntervalInput && settingsIO) {
    try {
      const syncInterval = await settingsIO.getSyncInterval();
      syncIntervalInput.value = syncInterval;
    } catch (error) {
      LogUtils.warn('載入同步間隔失敗:', error);
      syncIntervalInput.value = 2; // 預設值
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
    LogUtils.log('載入儲存的設置:', data);
    
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

  // API 金鑰輸入處理
  function updateApiKeyInput() {
    apiKeyInput.value = apiKeys[modelSelect.value] || '';
    apiKeyInput.placeholder = modelSelect.value === 'google-translate' 
      ? '貼上 Google Cloud 服務帳戶 JSON 憑證' 
      : '輸入您的 API 金鑰';
  }

  apiKeyInput.addEventListener('input', async function() {
    apiKeys[modelSelect.value] = this.value;
    await GlobalSettings.saveSingleSetting('apiKeys', apiKeys);
    triggerContentScriptUpdate();
  });

  modelSelect.addEventListener('change', updateApiKeyInput);

  async function triggerContentScriptUpdate() {
    try {
      const currentSettings = await GlobalSettings.loadSettings();
      throttledUpdateContentScript(currentSettings);
    } catch (error) {
      LogUtils.warn('獲取設定時發生錯誤:', error);
    }
  }

  // 10. 輔助功能
  function sendAutoRewritePatternsUpdate() {
    sendMessageToTab({
      action: "updateAutoRewritePatterns",
      patterns: autoRewritePatternsInput.value
    }, function(response) {
      if (response && response.success) {
        LogUtils.log('自動改寫匹配模式已更新');
      } else {
        LogUtils.error('更新自動改寫匹配模式失敗');
      }
    });
  }

  // 事件處理配置
  const eventHandlerConfig = {
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
      'codeCheckInstruction': { type: 'input', element: codeCheckInstructionInput },
      'zhEnMapping': { type: 'input', element: zhEnMappingInput },
      'crawlerInterval': { 
        type: 'input', 
        element: document.getElementById('crawler-interval')
      },
      'reflectInstruction': { type: 'input', element: reflectInstructionInput },
      'optimizeInstruction': { type: 'input', element: optimizeInstructionInput }
    },
    generationModels: {
      'generateModel': { type: 'model', element: generateModelSelect },
      'reflect1Model': { type: 'model', element: reflect1ModelSelect },
      'generationOptimize_1_Model': { type: 'model', element: generationOptimize_1_ModelSelect },
      'reflect2Model': { type: 'model', element: reflect2ModelSelect },
      'generationOptimize_2_Model': { type: 'model', element: generationOptimize_2_ModelSelect },
      'reflect3Model': { type: 'model', element: reflect3ModelSelect },
      'generationOptimize_3_Model': { type: 'model', element: generationOptimize_3_ModelSelect }
    },
    models: {
      'fullRewriteModel': { type: 'model', element: fullRewriteModelSelect },
      'shortRewriteModel': { type: 'model', element: shortRewriteModelSelect },
      'autoRewriteModel': { type: 'model', element: autoRewriteModelSelect },
      'translateModel': { type: 'model', element: translateModelSelect },
      'summaryModel': { type: 'model', element: summaryModelSelect },
      'codeCheckModel': { type: 'model', element: codeCheckModelSelect },
      'reflectModel': { type: 'model', element: reflectModelSelect },
      'optimizeModel': { type: 'model', element: optimizeModelSelect }
    },
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

  function setupEventHandlers() {
    // 生成相關指令輸入事件
    Object.entries(eventHandlerConfig.generationInstructions).forEach(([key, config]) => {
      if (!config.element) {
        LogUtils.warn(`找不到元素: ${key}`);
        return;
      }
      
      config.element.addEventListener('input', async function() {
        await GlobalSettings.saveSingleSetting(key, this.value);
        
        const selectedName = generationSettingsSelect.value;
        if (selectedName) {
          try {
            const currentSettings = settings.generationSettingsGroups[selectedName] || {};
            currentSettings[key] = this.value;
            await window.GlobalSettings.saveGenerationSettingsGroup(selectedName, currentSettings);
          } catch (error) {
            LogUtils.error(`更新設定組合失敗:`, error);
          }
        }
        
        if (config.callback) config.callback();
        triggerContentScriptUpdate();
      });
    });

    // 一般指令輸入事件
    Object.entries(eventHandlerConfig.instructions).forEach(([key, config]) => {
      if (!config.element) {
        LogUtils.warn(`找不到元素: ${key}`);
        return;
      }
      
      config.element.addEventListener('input', async function() {
        await GlobalSettings.saveSingleSetting(key, this.value);
        if (config.callback) config.callback();
        triggerContentScriptUpdate();
      });
    });

    // 生成相關模型選擇事件
    Object.entries(eventHandlerConfig.generationModels).forEach(([key, config]) => {
      if (!config.element) {
        LogUtils.warn(`找不到元素: ${key}`);
        return;
      }
      
      config.element.addEventListener('change', async function() {
        await GlobalSettings.saveModelSelection(key, this.value);
        
        const selectedName = generationSettingsSelect.value;
        if (selectedName) {
          try {
            const currentSettings = settings.generationSettingsGroups[selectedName] || {};
            currentSettings[key] = this.value;
            await window.GlobalSettings.saveGenerationSettingsGroup(selectedName, currentSettings);
          } catch (error) {
            LogUtils.error(`更新設定組合失敗:`, error);
          }
        }
        
        triggerContentScriptUpdate();
      });
    });

    // 一般模型選擇事件
    Object.entries(eventHandlerConfig.models).forEach(([key, config]) => {
      if (!config.element) {
        LogUtils.warn(`找不到元素: ${key}`);
        return;
      }
      
      config.element.addEventListener('change', async function() {
        await GlobalSettings.saveModelSelection(key, this.value);
        triggerContentScriptUpdate();
      });
    });

    // 特殊設置事件
    Object.entries(eventHandlerConfig.settings).forEach(([key, config]) => {
      if (!config.element) {
        LogUtils.warn(`找不到元素: ${key}`);
        return;
      }
      
      config.element.addEventListener('change', async function() {
        await GlobalSettings.saveSingleSetting(key, this.checked);
        
        const selectedName = generationSettingsSelect.value;
        if (selectedName) {
          try {
            const currentSettings = settings.generationSettingsGroups[selectedName] || {};
            currentSettings[key] = this.checked;
            await window.GlobalSettings.saveGenerationSettingsGroup(selectedName, currentSettings);
          } catch (error) {
            LogUtils.error(`更新設定組合失敗:`, error);
          }
        }
        
        if (config.logMessage) LogUtils.log(config.logMessage, this.checked);
        triggerContentScriptUpdate();
      });
    });
  }

  setupEventHandlers();

  // 功能按鈕事件處理
  rewriteButton.addEventListener('click', function() {
    sendMessageToTab({
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
        LogUtils.log('改寫請求已發送');
      } else {
        LogUtils.error('發送改寫請求失敗');
      }
    });
  });



  // 9. UI 相關功能
  // 分頁切換功能
  const tabs = document.querySelectorAll('.tab');

  tabs.forEach(tab => {
    tab.addEventListener('click', function() {
      const tabName = this.getAttribute('data-tab');
      const container = this.closest('.tab-container');
      const containerContent = this.closest('.content');
      
      // 移除同級分頁的活動狀態
      container.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      containerContent.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
      
      // 設置當前分頁為活動狀態
      this.classList.add('active');
      
      // 根據分頁位置選擇正確的內容元素 ID
      const isInMainTab = container.closest('.main-tab-content');
      const isInTranslateTab = isInMainTab && isInMainTab.id === 'translate-tab';
      
      let contentId;
      if (isInTranslateTab || isInMainTab.id === 'multiple-generation-tab') {
        contentId = `${tabName}-content`;
      } else if (isInMainTab) {
        contentId = `${tabName}-tab`;
      } else {
        contentId = `${tabName}-content`;
      }
      
      const targetContent = document.getElementById(contentId);
      if (targetContent) {
        targetContent.classList.add('active');
      } else {
        LogUtils.warn('未找到目標內容區塊:', contentId);
      }
      
      chrome.storage.sync.set({ lastSubTab: tabName });
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
      
      const targetContent = document.getElementById(`${tabName}-tab`);
      if (targetContent) {
        targetContent.classList.add('active');
      } else {
        LogUtils.warn('未找到目標主內容區塊:', `${tabName}-tab`);
      }
      
      chrome.storage.sync.set({ lastMainTab: tabName });
    });
  });

  // 初始化股票功能管理器
  if (typeof StockManager !== 'undefined') {
    // 將 stockList 從 eventHandlerConfig.instructions 中移除，交給 StockManager 處理
    const stockConfig = StockManager.getEventHandlerConfig();
    Object.assign(eventHandlerConfig.instructions, stockConfig);
    
    // 初始化股票管理器
    StockManager.init(stockListInput, triggerContentScriptUpdate);
    LogUtils.log('股票功能管理器已初始化');
  } else {
    LogUtils.warn('StockManager 未載入，股票功能可能無法正常運作');
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
        LogUtils.log('未找到活動的標籤頁');
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
          LogUtils.log('content script 未載入，設置將在下次載入時應用');
        } else {
          LogUtils.warn('更新 content script 時發生錯誤:', error);
        }
      }
    } catch (error) {
      LogUtils.warn('updateContentScript 發生錯誤:', error);
    }
  }

  // 使用節流包裝 updateContentScript
  const throttledUpdateContentScript = throttle(updateContentScript, 1000);

  // 修改消息發送函數
  function sendMessageToTab(message, callback) {
    chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
      if (!tabs[0]) {
        LogUtils.log('未找到活動的標籤頁');
        return;
      }
      
      chrome.tabs.sendMessage(tabs[0].id, message, function(response) {
        if (chrome.runtime.lastError) {
          LogUtils.log('content script 未載入或無法連接');
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
    const style = box.dataset.style;
    
    // 設置顏色方塊的顯示樣式
    if (style === 'border') {
      // 外框式：設置文字顏色，通過currentColor讓偽元素繼承
      box.classList.add('border-box');
      box.style.color = color;
    } else {
      // 背景式：設置背景顏色
      box.style.backgroundColor = color;
    }
    
    box.addEventListener('click', () => {
      if (selectedLine >= 0) {
        const words = highlightWordsInput.value.split('\n');
        const word = words[selectedLine];
        if (word) {
          // 清除所有顏色方塊的選中狀態
          document.querySelectorAll('.color-box').forEach(cb => {
            cb.classList.remove('selected');
          });
          
          // 為當前點擊的方塊添加選中狀態
          box.classList.add('selected');
          
          // 根據樣式類型設置顏色值
          if (style === 'border') {
            wordColors[word] = `border:${color}`;
          } else {
            wordColors[word] = color;
          }
          
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
    
    // 更新顏色選擇器的選中狀態
    updateColorBoxSelection();
  });

  // 更新顏色選擇器選中狀態的函數
  function updateColorBoxSelection() {
    // 清除所有選中狀態
    document.querySelectorAll('.color-box').forEach(cb => {
      cb.classList.remove('selected');
    });
    
    if (selectedLine >= 0) {
      const words = highlightWordsInput.value.split('\n');
      const word = words[selectedLine];
      if (word && wordColors[word]) {
        const currentColor = wordColors[word];
        
        // 找到匹配的顏色方塊並標記為選中
        document.querySelectorAll('.color-box').forEach(box => {
          const boxColor = box.dataset.color;
          const boxStyle = box.dataset.style;
          
          let matches = false;
          if (currentColor.startsWith('border:')) {
            // 外框式顏色
            const colorValue = currentColor.substring(7);
            matches = (boxStyle === 'border' && boxColor === colorValue);
          } else {
            // 背景式顏色
            matches = (boxStyle === 'background' && boxColor === currentColor);
          }
          
          if (matches) {
            box.classList.add('selected');
          }
        });
      }
    }
  }

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
    wordColors = newEffectiveWordColors;
    this._previousValue = newText;
    updatePreview();
    updateHighlightWords(newText);
  });

  function updateHighlightWords(text) {
    const words = text.split('\n').filter(word => word.trim());
    
    chrome.storage.sync.set({
      highlightWords: text,
      highlightColors: wordColors
    }, function() {
      sendMessageToTab({
        action: "updateHighlightWords",
        words: words,
        colors: wordColors
      }, function(response) {
        if (response && response.error) {
          LogUtils.log('高亮設置已保存，將在頁面重新載入時應用');
        } else {
          LogUtils.log('高亮設置已更新');
          sendMessageToTab({
            action: "forceUpdateHighlights"
          });
        }
      });
    });
  }

  function updatePreview() {
    if (!highlightWordsInput || !highlightWordsInput.clientWidth) {
        setTimeout(updatePreview, 10);
        return;
    }
    
    // 清除所有類型的預覽元素
    const oldPreviews = document.querySelectorAll('.highlight-preview, .highlight-preview-border');
    oldPreviews.forEach(p => p.remove());

    const textarea = highlightWordsInput;
    const overlay = document.querySelector('.highlight-overlay');
    const text = textarea.value;
    const lines = text.split('\n');

    const textareaStyle = getComputedStyle(textarea);
    const font = textareaStyle.font;
    const lineHeight = parseFloat(textareaStyle.lineHeight);
    const paddingLeft = parseFloat(textareaStyle.paddingLeft);
    const paddingTop = parseFloat(textareaStyle.paddingTop);
    const innerWidth = textarea.clientWidth - paddingLeft - parseFloat(textareaStyle.paddingRight);
    const div = document.createElement('div');
    div.style.cssText = `
      position: absolute;
      visibility: hidden;
      white-space: pre-wrap;
      word-wrap: break-word;
      width: ${innerWidth}px;
      font: ${font};
      line-height: ${lineHeight}px;
      padding: 0;
      border: none;
    `;
    textarea.parentElement.appendChild(div);

    div.textContent = text;
    const range = document.createRange();
    const divRectBase = div.getBoundingClientRect(); 

    lines.forEach((line, index) => {
      if (!line.trim()) return;

      let lineStart = 0;
      for (let i = 0; i < index; i++) {
        lineStart += lines[i].length + 1;
      }

      if (div.firstChild && div.firstChild.nodeType === Node.TEXT_NODE) {
        const textNode = div.firstChild;
        const lineEnd = Math.min(lineStart + line.length, textNode.length);
        if (lineStart >= lineEnd) return;

        range.setStart(textNode, lineStart);
        range.setEnd(textNode, lineEnd);
        
        const rects = range.getClientRects();

        for (let i = 0; i < rects.length; i++) {
          const rect = rects[i];
          const preview = document.createElement('div');
          
          // 解析顏色和樣式
          const colorValue = wordColors[line] || 'rgba(50, 205, 50, 0.3)';
          let color, isBorder = false;
          
          if (colorValue.startsWith('border:')) {
            isBorder = true;
            color = colorValue.substring(7); // 移除 'border:' 前綴
            preview.className = 'highlight-preview-border';
          } else {
            color = colorValue;
            preview.className = 'highlight-preview';
          }
          
          preview.style.top = `${rect.top - divRectBase.top + paddingTop}px`;
          preview.style.left = `${rect.left - divRectBase.left + paddingLeft}px`;
          preview.style.width = `${rect.width}px`;
          preview.style.height = `${lineHeight > rect.height ? lineHeight : rect.height}px`; 
          
          if (isBorder) {
            preview.style.borderColor = color;
            preview.style.background = 'none';
          } else {
            preview.style.backgroundColor = color;
          }
          
          preview.dataset.originalTop = rect.top - divRectBase.top + paddingTop;
          overlay.appendChild(preview);
        }
      }
    });

    range.detach();
    div.remove();
    updatePreviewsPosition();
  }

  function updatePreviewsPosition() {
    const textarea = highlightWordsInput;
    const scrollTop = textarea.scrollTop;

    const previews = document.querySelectorAll('.highlight-preview');
    previews.forEach(preview => {
      const originalTop = parseFloat(preview.dataset.originalTop);
      preview.style.display = 'block';
      preview.style.transform = `translateY(${-scrollTop}px)`;
    });
  }

  highlightWordsInput.addEventListener('scroll', function() {
    requestAnimationFrame(() => {
      updatePreviewsPosition();
    });
  });

  // 初始化預覽
  chrome.storage.sync.get(['highlightWords', 'highlightColors'], function(data) {
    if (data.highlightColors) {
      wordColors = data.highlightColors;
    }
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

  // 生成設定組合管理
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

  updateGenerationSettingsSelect();
  generationSettingsSelect.addEventListener('change', async function() {
    const selectedName = this.value;
    if (selectedName) {
      try {
        await window.GlobalSettings.loadGenerationSettingsGroup(selectedName);
        
        generateModelSelect.value = window.GlobalSettings.generateModel;
        reflect1ModelSelect.value = window.GlobalSettings.reflect1Model;
        generationOptimize_1_ModelSelect.value = window.GlobalSettings.generationOptimize_1_Model;
        reflect2ModelSelect.value = window.GlobalSettings.reflect2Model;
        generationOptimize_2_ModelSelect.value = window.GlobalSettings.generationOptimize_2_Model;
        reflect3ModelSelect.value = window.GlobalSettings.reflect3Model;
        generationOptimize_3_ModelSelect.value = window.GlobalSettings.generationOptimize_3_Model;

        generateInstructionInput.value = window.GlobalSettings.generateInstruction;
        reflect1InstructionInput.value = window.GlobalSettings.reflect1Instruction;
        generationOptimize_1_InstructionInput.value = window.GlobalSettings.generationOptimize_1_Instruction;
        reflect2InstructionInput.value = window.GlobalSettings.reflect2Instruction;
        generationOptimize_2_InstructionInput.value = window.GlobalSettings.generationOptimize_2_Instruction;
        reflect3InstructionInput.value = window.GlobalSettings.reflect3Instruction;
        generationOptimize_3_InstructionInput.value = window.GlobalSettings.generationOptimize_3_Instruction;
        backgroundKnowledgeInput.value = window.GlobalSettings.backgroundKnowledge;
      } catch (error) {
        LogUtils.error('載入設定組合失敗:', error);
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
        LogUtils.error('新增設定組合失敗:', error);
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
        LogUtils.error('重命名設定組合失敗:', error);
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
        LogUtils.error('刪除設定組合失敗:', error);
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
        LogUtils.error('複製設定組合失敗:', error);
        alert('複製設定組合失敗: ' + error.message);
      }
    }
  });

  // 自定義模型管理
  const CustomModelManager = {
    autoDetectDebounceTimer: null,
    
    init() {
      this.bindEvents();
      this.updateCustomModelsList();
    },

    bindEvents() {
      if (addCustomModelBtn) {
        addCustomModelBtn.addEventListener('click', () => {
          this.addCustomModel();
        });
      }
      
      if (customModelNameInput && customModelDisplayInput && customModelTypeSelect) {
        customModelNameInput.addEventListener('input', (e) => {
          this.debouncedAutoDetect(e.target.value.trim(), customModelTypeSelect, 'modelName');
        });
        
        customModelNameInput.addEventListener('blur', (e) => {
          this.autoDetectApiType(e.target.value.trim(), customModelTypeSelect, 'modelName');
        });

        customModelDisplayInput.addEventListener('input', (e) => {
          this.debouncedAutoDetect(e.target.value.trim(), customModelTypeSelect, 'displayName');
        });
        
        customModelDisplayInput.addEventListener('blur', (e) => {
          this.autoDetectApiType(e.target.value.trim(), customModelTypeSelect, 'displayName');
        });
      }
    },

    debouncedAutoDetect(modelName, customModelTypeSelect, type) {
      if (this.autoDetectDebounceTimer) {
        clearTimeout(this.autoDetectDebounceTimer);
      }
      
      this.autoDetectDebounceTimer = setTimeout(() => {
        this.autoDetectApiType(modelName, customModelTypeSelect, type);
      }, 300);
    },

    autoDetectApiType(inputText, customModelTypeSelect, type = 'modelName') {
      if (!customModelTypeSelect) {
        customModelTypeSelect = document.getElementById('custom-model-type');
      }
      
      if (!inputText || !customModelTypeSelect) return;
      
      let detectedType = 'gemini';
      let textToAnalyze = inputText.toLowerCase();
      
      if (type === 'displayName') {
        textToAnalyze = textToAnalyze
          .replace(/\s*(api|模型|model|版本|version|最新|latest|pro|advanced|mini|小型|大型|智能|ai)\s*/g, ' ')
          .replace(/\s+/g, ' ')
          .trim();
      }
      
      const openaiPatterns = [
        /gpt[\s\-]?4/, /gpt[\s\-]?3\.?5?/, /gpt[\s\-]?o/, /\bgpt\b/,
        /text[\s\-]?davinci/, /davinci/, /curie/, /babbage/, /ada\b/,
        /o1[\s\-]?(preview|mini)?/, /o3[\s\-]/,
        /code[\s\-]?davinci/, /codex/,
        /openai/, /chatgpt/,
        /turbo\b/, /instruct\b/, /\bmini\b.*gpt/, /\bpro\b.*gpt/
      ];
      
      const geminiPatterns = [
        /gemini/, /palm[\s\-]?2?/, /bard/, /google/, /claude/,
        /lamda/, /minerva/, /pathways/, /flash\b/,
        /\bpro\b.*gemini/, /gemini.*\bpro\b/
      ];
      
      if (openaiPatterns.some(pattern => pattern.test(textToAnalyze))) {
        detectedType = 'openai';
      } else if (geminiPatterns.some(pattern => pattern.test(textToAnalyze))) {
        detectedType = 'gemini';
      }
      
      if (customModelTypeSelect.value !== detectedType) {
        customModelTypeSelect.value = detectedType;
        customModelTypeSelect.classList.add('auto-detected', detectedType, 'auto-detect-pulse');
        setTimeout(() => {
          customModelTypeSelect.classList.remove('auto-detected', 'gemini', 'openai', 'auto-detect-pulse');
        }, 1200);
      }
    },

    async addCustomModel() {
      try {
        if (!customModelNameInput || !customModelDisplayInput || !customModelTypeSelect) {
          LogUtils.error('找不到必要的表單元素');
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

        if (!apiType) {
          alert('請選擇 API 類型');
          return;
        }

        if (!/^[a-z0-9-_.]+$/i.test(modelName)) {
          alert('模型名稱只能包含字母、數字、連字號、底線和點');
          return;
        }

        await GlobalSettings.addCustomModel(modelName, displayName, apiType);
        
        customModelNameInput.value = '';
        customModelDisplayInput.value = '';
        customModelTypeSelect.value = '';

        this.updateCustomModelsList();
        this.updateAllModelSelects();

        alert('模型新增成功！');
      } catch (error) {
        LogUtils.error('新增模型錯誤:', error);
        alert('新增模型失敗：' + error.message);
      }
    },

    async removeCustomModel(modelName) {
      if (!modelName) {
        alert('模型名稱無效');
        return;
      }
      
      if (confirm(`確定要刪除模型 "${modelName}" 嗎？這將同時移除相關的 API 金鑰。`)) {
        try {
          await GlobalSettings.removeCustomModel(modelName);
          this.updateCustomModelsList();
          this.updateAllModelSelects();

          if (modelSelect.value === modelName) {
            modelSelect.selectedIndex = 0;
            updateApiKeyInput();
          }

          alert('模型刪除成功！');
        } catch (error) {
          LogUtils.error(`刪除模型失敗:`, error);
          alert('刪除模型失敗：' + error.message);
        }
      }
    },

    updateCustomModelsList() {
      if (!customModelsContainer) {
        LogUtils.error('找不到 customModelsContainer 元素');
        return;
      }

      const customModels = GlobalSettings.getCustomModels();
      
      if (Object.keys(customModels).length === 0) {
        customModelsContainer.innerHTML = '<p style="color: #6c757d; font-size: 12px; margin: 0;">尚未新增任何自定義模型</p>';
        return;
      }

      customModelsContainer.innerHTML = '';
      
      Object.entries(customModels).forEach(([key, model]) => {
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
        
        const deleteButton = modelItem.querySelector('.delete-model-button');
        deleteButton.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          this.removeCustomModel(key);
        });
        
        customModelsContainer.appendChild(modelItem);
      });
    },

    updateAllModelSelects() {
      const allModels = GlobalSettings.getAllAvailableModels();
      
      const apiProviders = {
        'gemini': 'Gemini',
        'openai': 'OpenAI', 
        'google-translate': 'Google 翻譯'
      };
      
      const modelSelectors = [
        fullRewriteModelSelect, shortRewriteModelSelect, autoRewriteModelSelect,
        translateModelSelect, generateModelSelect, reflect1ModelSelect,
        generationOptimize_1_ModelSelect, reflect2ModelSelect, generationOptimize_2_ModelSelect,
        reflect3ModelSelect, generationOptimize_3_ModelSelect, summaryModelSelect,
        codeCheckModelSelect, reflectModelSelect, optimizeModelSelect
      ];

      if (modelSelect) {
        const currentValue = modelSelect.value;
        modelSelect.innerHTML = '';
        
        Object.entries(apiProviders).forEach(([key, displayName]) => {
          const option = document.createElement('option');
          option.value = key;
          option.textContent = displayName;
          modelSelect.appendChild(option);
        });
        
        if (apiProviders[currentValue]) {
          modelSelect.value = currentValue;
        }
      }

      modelSelectors.forEach(selector => {
        if (!selector) return;
        
        const currentValue = selector.value;
        selector.innerHTML = '';
        
        const availableModels = Object.entries(allModels).filter(([key]) => key !== 'google-translate');
        
        if (availableModels.length === 0) {
          const option = document.createElement('option');
          option.value = '';
          option.textContent = '請先新增模型';
          option.disabled = true;
          selector.appendChild(option);
          selector.disabled = true;
        } else {
          selector.disabled = false;
          
          availableModels.forEach(([key, displayName]) => {
            const option = document.createElement('option');
            option.value = key;
            option.textContent = displayName;
            selector.appendChild(option);
          });
          
          if (currentValue && allModels[currentValue]) {
            selector.value = currentValue;
          } else {
            selector.value = '';
          }
        }
      });
    }
  };

  window.CustomModelManager = CustomModelManager;
  
  // 初始化自動替換組（在popup環境中）
  const autoReplaceContainer = document.querySelector('#auto-replace-tab .auto-replace-container');
  if (autoReplaceContainer && window.AutoReplaceManager) {
    LogUtils.log('開始初始化自動替換組...');
    
    // 創建一個模擬的textarea用於popup環境
    const mockTextArea = document.createElement('textarea');
    mockTextArea.value = ''; // popup環境中不需要真實內容
    
    try {
      // 直接使用已載入的 AutoReplaceManager
      AutoReplaceManager.initializeAutoReplaceGroups(autoReplaceContainer, mockTextArea);
      LogUtils.log('✅ 自動替換組初始化完成');
    } catch (error) {
      LogUtils.error('❌ 自動替換組初始化失敗:', error);
    }
  } else {
    LogUtils.warn('⚠️ 找不到自動替換容器或AutoReplaceManager未載入');
  }

  // 同步功能
  const authOperations = {
    async authenticateWithGoogle(interactive = false) {
      if (!settingsIO) {
        if (typeof SettingsIO !== 'undefined') {
          settingsIO = new SettingsIO();
        } else {
          throw new Error('SettingsIO 未載入');
        }
      }
      return await settingsIO.authenticateWithGoogle(interactive);
    }
  };

  const syncOperations = {
    async manualSync() {
      return new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({
          action: 'settingsSync',
          command: 'manualSync'
        }, response => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
          } else {
            resolve(response);
          }
        });
      });
    },

    async toggleAutoSync(enabled) {
      return new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({
          action: 'settingsSync',
          command: 'toggleAutoSync',
          enabled: enabled
        }, response => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
          } else {
            resolve(response);
          }
        });
      });
    },

    async getSyncStatus() {
      return new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({
          action: 'settingsSync',
          command: 'getSyncStatus'
        }, response => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
          } else {
            resolve(response);
          }
        });
      });
    },

    async resetSyncStatus() {
      return new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({
          action: 'settingsSync',
          command: 'resetSyncStatus'
        }, response => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
          } else {
            resolve(response);
          }
        });
      });
    },

    async signOut() {
      return new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({
          action: 'settingsSync',
          command: 'signOut'
        }, response => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
          } else {
            resolve(response);
          }
        });
      });
    },

    async forceUpload() {
      return new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({
          action: 'settingsSync',
          command: 'forceUpload'
        }, response => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
          } else {
            resolve(response);
          }
        });
      });
    }
  };

  async function initializeSyncFeatures() {
    try {
      setupSyncEventHandlers();
      
      chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        if (message.action === 'syncStatusUpdate') {
          updateSyncStatus();
        }
      });
      
      await updateSyncStatus();
    } catch (error) {
      LogUtils.error('同步功能初始化失敗:', error);
    }
  }

  // 設置同步相關事件處理器
  function setupSyncEventHandlers() {
    // 認證按鈕
    if (authButton) {
      authButton.addEventListener('click', async () => {
        LogUtils.log('開始認證');
        try {
          authButton.disabled = true;
          authButton.textContent = '認證中...';
          
          // Google OAuth需要在popup環境中進行交互式認證
          const result = await authOperations.authenticateWithGoogle(true);
          if (result.success) {
            LogUtils.log('認證成功');
            await updateSyncStatus();
          } else {
            throw new Error(result.error || '認證失敗');
          }
        } catch (error) {
          LogUtils.error('認證失敗:', error);
          showSyncError('認證失敗: ' + error.message);
        } finally {
          authButton.disabled = false;
          authButton.textContent = '連接 Google Drive';
        }
      });
    }

    // 登出按鈕
    if (signoutButton) {
      signoutButton.addEventListener('click', async () => {
        LogUtils.log('開始登出');
        try {
          const result = await syncOperations.signOut();
          if (!result.success) {
            throw new Error(result.error);
          }
          await updateSyncStatus();
          LogUtils.log('登出成功');
        } catch (error) {
          LogUtils.error('登出失敗:', error);
          showSyncError('登出失敗: ' + error.message);
        }
      });
    }

    // 手動同步按鈕
    if (manualSyncButton) {
      manualSyncButton.addEventListener('click', async () => {
        LogUtils.log('開始手動同步');
        try {
          manualSyncButton.disabled = true;
          manualSyncButton.textContent = '同步中...';
          
          const result = await syncOperations.manualSync();
          if (result.success) {
            LogUtils.log('手動同步成功');
            clearSyncError();
          } else {
            throw new Error(result.error || '同步失敗');
          }
        } catch (error) {
          LogUtils.error('手動同步失敗:', error);
          showSyncError('同步失敗: ' + error.message);
        } finally {
          manualSyncButton.disabled = false;
          manualSyncButton.textContent = '手動同步';
          await updateSyncStatus();
        }
      });
    }

    // 自動同步開關
    if (autoSyncToggle) {
      autoSyncToggle.addEventListener('click', async () => {
        LogUtils.log('切換自動同步');
        try {
          const enabled = autoSyncToggle.classList.contains('active');
          const newState = !enabled;
          
          const result = await syncOperations.toggleAutoSync(newState);
          if (!result.success) {
            throw new Error(result.error);
          }
          
          if (newState) {
            autoSyncToggle.classList.add('active');
          } else {
            autoSyncToggle.classList.remove('active');
          }
          
          LogUtils.log('自動同步已' + (newState ? '啟用' : '停用'));
          await updateSyncStatus();
        } catch (error) {
          LogUtils.error('切換自動同步失敗:', error);
          showSyncError('切換自動同步失敗: ' + error.message);
        }
      });
    }

    // 同步間隔輸入框
    if (syncIntervalInput && settingsIO) {
      syncIntervalInput.addEventListener('change', async () => {
        try {
          const intervalMinutes = parseFloat(syncIntervalInput.value);
          
          // 驗證輸入值
          if (isNaN(intervalMinutes) || intervalMinutes < 0.1 || intervalMinutes > 60) {
            throw new Error('間隔時間必須在 0.1 到 60 分鐘之間');
          }
          
          await settingsIO.setSyncInterval(intervalMinutes);
          LogUtils.log(`同步間隔已更新為 ${intervalMinutes} 分鐘`);
          
        } catch (error) {
          LogUtils.error(`更新同步間隔失敗:`, error);
          showSyncError('更新同步間隔失敗: ' + error.message);
          
          // 重新載入正確的值
          try {
            const currentInterval = await settingsIO.getSyncInterval();
            syncIntervalInput.value = currentInterval;
          } catch (loadError) {
            syncIntervalInput.value = 2; // 回到預設值
          }
        }
      });
    }


  }

  // 更新同步狀態顯示
  async function updateSyncStatus() {
    if (!syncStatus) {
      LogUtils.log('updateSyncStatus: syncStatus元素未找到');
      return;
    }

    try {
      const result = await syncOperations.getSyncStatus();
      if (!result.success) {
        throw new Error(result.error);
      }
      // 正確解析狀態數據結構（修正：狀態現在直接在 result 中）
      const syncStatusData = result;
      LogUtils.log(`updateSyncStatus: enabled=${syncStatusData.enabled}, status=${syncStatusData.status}`, {
        fullResult: result,
        syncStatusData: syncStatusData
      });
      
      // 更新狀態圖示和文字
      if (statusIcon && statusText) {
        statusIcon.className = 'status-icon';
        syncStatus.className = 'sync-status-display';
        
        if (syncStatusData.enabled && !syncStatusData.error) {
          statusIcon.classList.add('connected');
          syncStatus.classList.add('connected');
          statusText.textContent = '已連接 Google Drive';
        } else if (syncStatusData.status === 'syncing') {
          statusIcon.classList.add('syncing');
          syncStatus.classList.add('syncing');
          statusText.textContent = '同步中...';
        } else if (syncStatusData.error) {
          statusIcon.classList.add('error');
          syncStatus.classList.add('error');
          statusText.textContent = '同步錯誤';
        } else {
          statusIcon.classList.add('disconnected');
          syncStatus.classList.add('disconnected');
          statusText.textContent = '未連接';
        }
      }

      // 更新按鈕狀態
      if (authButton && signoutButton) {
        if (syncStatusData.enabled) {
          authButton.style.display = 'none';
          signoutButton.style.display = 'inline-block';
        } else {
          authButton.style.display = 'inline-block';
          signoutButton.style.display = 'none';
        }
      }

      // 更新自動同步開關（使用 autoSyncActive 屬性）
      if (autoSyncToggle) {
        LogUtils.log(`更新自動同步開關狀態: ${syncStatusData.autoSyncActive}`);
        if (syncStatusData.autoSyncActive) {
          autoSyncToggle.classList.add('active');
        } else {
          autoSyncToggle.classList.remove('active');
        }
      }

      // 顯示錯誤訊息
      if (syncStatusData.error) {
        showSyncError(syncStatusData.error);
      } else {
        clearSyncError();
      }

    } catch (error) {
      LogUtils.error('更新同步狀態失敗:', error);
    }
  }

  // 顯示同步錯誤
  function showSyncError(message) {
    if (syncError) {
      syncError.textContent = message;
      syncError.style.display = 'block';
    }
  }

  // 清除同步錯誤
  function clearSyncError() {
    if (syncError) {
      syncError.style.display = 'none';
      syncError.textContent = '';
    }
  }

  // 初始化同步功能
  initializeSyncFeatures();

  // 初始化 CustomModelManager 和 StockCrawlerController
  setTimeout(async () => {
    try {
      CustomModelManager.init();
      CustomModelManager.updateAllModelSelects();
      
      // 重新載入設定以恢復用戶的模型選擇
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
        { setting: 'codeCheckModel', element: codeCheckModelSelect },
        { setting: 'reflectModel', element: reflectModelSelect },
        { setting: 'optimizeModel', element: optimizeModelSelect }
      ];
      
      modelMappings.forEach(({ setting, element }) => {
        if (element && currentSettings[setting]) {
          element.value = currentSettings[setting];
        }
      });
    } catch (error) {
      LogUtils.error('初始化 CustomModelManager 時發生錯誤:', error);
    }
    
    // 初始化股票爬蟲控制器
    try {
      if (typeof StockCrawlerController !== 'undefined') {
        StockCrawlerController.init();
      }
    } catch (error) {
      LogUtils.error('初始化 StockCrawlerController 時發生錯誤:', error);
    }
  }, 0);

}); 