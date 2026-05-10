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
 * - ModelManager：自定義模型管理（來自 settings/model-manager.js）
 * - StockManager：股票功能管理（來自 popup/stock-controller.js）
 * - PopupSyncManager：同步功能管理（來自 SettingsIO/settings-io-popup.js）
 * - AutoReplaceManager：自動替換管理
 * - Chrome Extensions API：storage, tabs, runtime
 * 
 * 模組化設計：
 * - 股票相關功能已獨立為 popup/stock-controller.js
 * - 自定義模型管理功能已移至 settings/model-manager.js
 * - 同步功能已移至 SettingsIO/settings-io-popup.js
 * - 通過 StockManager、ModelManager、PopupSyncManager 接口與相關控制器交互
 * - 保持功能完整性和代碼關聯性
 */

// 開發模式：連接 port，讓 SW 追蹤 popup 開關狀態
chrome.runtime.connect({ name: 'popupOpen' });

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
  const rephraseInstructionInput = document.getElementById('rephraseInstruction');
  const fullRewriteModelSelect = document.getElementById('fullRewriteModel');
  const shortRewriteModelSelect = document.getElementById('shortRewriteModel');
  const autoRewriteModelSelect = document.getElementById('autoRewriteModel');
  const rephraseModelSelect = document.getElementById('rephraseModel');
  const rewriteButton = document.getElementById('rewrite');
  const translateModelSelect = document.getElementById('translateModel');
  const translateInstructionInput = document.getElementById('translateInstruction');
  const removeHashCheckbox = document.getElementById('removeHash');
  const removeStarCheckbox = document.getElementById('removeStar');
  const zhEnMappingInput = document.getElementById('zhEnMapping');
  const diffCustomRulesInput = document.getElementById('diffCustomRules');
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
  const autoCompleteModelSelect = document.getElementById('autoCompleteModel');
  const autoCompleteInstructionInput = document.getElementById('autoCompleteInstruction');

  const highlightWordsInput = document.getElementById('highlight-words');
  const stockListInput = document.getElementById('stock-list-input');
  const stockChangeLogInput = document.getElementById('stock-change-log');
  const stockCrawlLogInput = document.getElementById('stock-crawl-log');
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
  // 同步相關 DOM 元素已移至 PopupSyncManager

  // 初始化設定
  let apiKeys = {};
  let settings = await GlobalSettings.loadSettings();
  
  // SettingsIO 實例化已移至 PopupSyncManager
  
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
  rephraseInstructionInput.value = settings.rephraseInstruction || '';
  fullRewriteModelSelect.value = settings.fullRewriteModel || '';
  shortRewriteModelSelect.value = settings.shortRewriteModel || '';
  autoRewriteModelSelect.value = settings.autoRewriteModel || '';
  rephraseModelSelect.value = settings.rephraseModel || '';
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
  autoCompleteModelSelect.value = settings.autoCompleteModel || '';
  autoCompleteInstructionInput.value = settings.autoCompleteInstruction || '';
  zhEnMappingInput.value = settings.zhEnMapping || '';
  diffCustomRulesInput.value = settings.diffCustomRules || '';
  stockListInput.value = settings.stockList || '';
  stockChangeLogInput.value = settings.stockChangeLog || '';
  stockCrawlLogInput.value = settings.stockCrawlLog || '';
  
  const crawlerIntervalInput = document.getElementById('crawler-interval');
  if (crawlerIntervalInput) {
    crawlerIntervalInput.value = settings.crawlerInterval || 30;
  }
  
  // 同步間隔載入已移至 PopupSyncManager
  
  updateApiKeyInput();

  // 高亮功能的載入將由 HighlightPreviewManager 處理

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
      'rephraseInstruction': { type: 'input', element: rephraseInstructionInput },
      'translateInstruction': { type: 'input', element: translateInstructionInput },
      'summaryInstruction': { type: 'input', element: summaryInstructionInput },
      'codeCheckInstruction': { type: 'input', element: codeCheckInstructionInput },
      'autoCompleteInstruction': { type: 'input', element: autoCompleteInstructionInput },
      'zhEnMapping': { type: 'input', element: zhEnMappingInput },
      'diffCustomRules': { type: 'input', element: diffCustomRulesInput },
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
      'rephraseModel': { type: 'model', element: rephraseModelSelect },
      'translateModel': { type: 'model', element: translateModelSelect },
      'summaryModel': { type: 'model', element: summaryModelSelect },
      'codeCheckModel': { type: 'model', element: codeCheckModelSelect },
      'autoCompleteModel': { type: 'model', element: autoCompleteModelSelect },
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

  // 高亮相關的狀態管理已移至 HighlightPreviewManager

  // 顏色選擇器的初始化已移至 HighlightPreviewManager

  // 高亮輸入框的事件處理已移至 HighlightPreviewManager

  // 輸入變更監聽已移至 HighlightPreviewManager

  // updateHighlightWords 函數已移至 HighlightPreviewManager

  // updatePreview 函數已移至 HighlightPreviewManager

  // updatePreviewsPosition 函數和滾動監聽已移至 HighlightPreviewManager

  // 初始化高亮預覽管理器
  if (typeof HighlightPreviewManager !== 'undefined') {
    const colorBoxes = document.querySelectorAll('.color-box');
    const overlay = document.querySelector('.highlight-overlay');
    
    HighlightPreviewManager.init(highlightWordsInput, colorBoxes, overlay, sendMessageToTab);
    LogUtils.log('高亮預覽管理器已初始化');
  } else {
    LogUtils.warn('HighlightPreviewManager 未載入');
  }

  // 初始化比對規則語法高亮
  if (typeof RegexSyntaxHighlighter !== 'undefined') {
    RegexSyntaxHighlighter.initTextarea(diffCustomRulesInput, { format: 'diffRule' });
  } else {
    LogUtils.warn('RegexSyntaxHighlighter 未載入');
  }

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

  // 自定義模型管理功能已移至 settings/model-manager.js
  
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

  // 同步功能已移至 PopupSyncManager

  // 同步功能相關函數已移至 PopupSyncManager

  // 初始化 PopupSyncManager
  if (typeof PopupSyncManager !== 'undefined') {
    try {
      await PopupSyncManager.init();
      LogUtils.log('PopupSyncManager 已初始化');
    } catch (error) {
      LogUtils.error('PopupSyncManager 初始化失敗:', error);
    }
  } else {
    LogUtils.warn('PopupSyncManager 未載入');
  }

  // 初始化 ModelManager 和 StockCrawlerController
  setTimeout(async () => {
    try {
      // 初始化 ModelManager 的完整 UI 功能
      if (typeof ModelManager !== 'undefined') {
        ModelManager.initializeCustomModelUI();
        ModelManager.updateAllModelSelects();
        
        // 初始化自動填入功能
        if (ModelManager.initializeUI) {
          ModelManager.initializeUI();
        }
      }
      
      // 重新載入設定以恢復用戶的模型選擇
      const currentSettings = await GlobalSettings.loadSettings();
      
      // 重新應用模型選擇設定
      const modelMappings = [
        { setting: 'fullRewriteModel', element: fullRewriteModelSelect },
        { setting: 'shortRewriteModel', element: shortRewriteModelSelect },
        { setting: 'autoRewriteModel', element: autoRewriteModelSelect },
        { setting: 'rephraseModel', element: rephraseModelSelect },
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
        { setting: 'autoCompleteModel', element: autoCompleteModelSelect },
        { setting: 'reflectModel', element: reflectModelSelect },
        { setting: 'optimizeModel', element: optimizeModelSelect }
      ];
      
      modelMappings.forEach(({ setting, element }) => {
        if (element && currentSettings[setting]) {
          element.value = currentSettings[setting];
        }
      });
    } catch (error) {
      LogUtils.error('初始化 ModelManager 時發生錯誤:', error);
    }
    
    // 初始化股票爬蟲控制器
    try {
      if (typeof StockCrawlerController !== 'undefined') {
        StockCrawlerController.init();
      }
    } catch (error) {
      LogUtils.error('初始化 StockCrawlerController 時發生錯誤:', error);
    }
    
    // 觸發彈出視窗啟動同步檢查
    setTimeout(async () => {
      try {
        LogUtils.log('🚀 觸發彈出視窗啟動同步檢查...');
        const result = await performPopupStartupSync();
        if (result.success) {
          LogUtils.log(`✅ 彈出視窗啟動同步檢查完成: ${result.reason || 'executed'}`);
        } else {
          LogUtils.warn(`⚠️ 彈出視窗啟動同步檢查失敗: ${result.error}`);
        }
      } catch (error) {
        LogUtils.error('彈出視窗啟動同步檢查異常:', error);
      }
    }, 500); // 延遲500ms執行，確保所有初始化完成
  }, 0);

}); 