/**
 * model-manager.js - 自定義模型管理器
 * 功能：專門負責自定義模型的管理，包含新增、刪除、查詢、UI 管理等功能
 * 職責：
 * - 管理自定義模型的增刪改查
 * - 模型 API 類型判斷和自動檢測
 * - 模型顯示名稱處理
 * - API 金鑰名稱匹配
 * - 預設模型選擇邏輯
 * - 自定義模型的 UI 管理和事件處理
 * - 模型列表的 DOM 操作和更新
 * 
 * 依賴：
 * - Chrome Extensions API (storage)
 * - GlobalSettings (透過 window.GlobalSettings)
 * - DOM 元素（用於 UI 管理功能）
 */

const ModelManager = {
  // 防抖計時器
  autoDetectDebounceTimer: null,

  /**
   * 新增自定義模型
   * @param {string} modelName - 模型名稱
   * @param {string} displayName - 顯示名稱
   * @param {string} apiType - API類型 (gemini/openai)
   * @param {string} thinkingLevel - 思考程度 (off/low/medium/high，空字串表示不設定)
   * @returns {Promise<boolean>} - 成功與否
   */
  async addCustomModel(modelName, displayName, apiType, thinkingLevel = '') {
    try {
      if (!modelName || !displayName || !apiType) {
        throw new Error('模型名稱、顯示名稱和API類型都是必填的');
      }

      // 檢查是否已存在
      if (window.GlobalSettings.customModels[modelName]) {
        throw new Error('模型名稱已存在');
      }

      // 新增自定義模型
      window.GlobalSettings.customModels[modelName] = {
        displayName: displayName,
        apiType: apiType,
        isCustom: true,
        thinkingLevel: thinkingLevel
      };

      // 也將模型新增到 API.models 中
      window.GlobalSettings.API.models[modelName] = displayName;

      // 儲存到 storage
      await window.GlobalSettings.saveSingleSetting('customModels', window.GlobalSettings.customModels);
      
      LogUtils.log(`成功新增自定義模型: ${modelName}`);
      return true;
    } catch (error) {
      LogUtils.error('新增自定義模型失敗:', error);
      throw error;
    }
  },

  /**
   * 移除自定義模型
   * @param {string} modelName - 模型名稱
   * @returns {Promise<boolean>} - 成功與否
   */
  async removeCustomModel(modelName) {
    try {
      if (!window.GlobalSettings.customModels[modelName]) {
        throw new Error('找不到指定的自定義模型');
      }

      // 從自定義模型列表中移除
      delete window.GlobalSettings.customModels[modelName];
      
      // 從 API.models 中移除
      delete window.GlobalSettings.API.models[modelName];

      // 注意：不要刪除 API 金鑰，因為自定義模型使用對應服務提供商的金鑰
      // 例如自定義的 Gemini 模型使用 'gemini' API 金鑰
      // 例如自定義的 OpenAI 模型使用 'openai' 的金鑰

      // 儲存更新後的自定義模型列表
      await window.GlobalSettings.saveSingleSetting('customModels', window.GlobalSettings.customModels);
      
      LogUtils.log(`成功移除自定義模型: ${modelName}`);
      return true;
    } catch (error) {
      LogUtils.error('移除自定義模型失敗:', error);
      throw error;
    }
  },

  /**
   * 獲取所有自定義模型
   * @returns {object} - 自定義模型列表
   */
  getCustomModels() {
    return window.GlobalSettings.customModels;
  },

  /**
   * 獲取所有可用模型（內建+自定義）
   * @returns {object} - 所有可用模型
   */
  getAllAvailableModels() {
    // 合併內建模型和自定義模型
    const allModels = { ...window.GlobalSettings.API.models };
    
    // 確保自定義模型也包含在內
    Object.entries(window.GlobalSettings.customModels).forEach(([key, model]) => {
      allModels[key] = model.displayName;
    });
    
    return allModels;
  },

  /**
   * 檢查是否為自定義模型
   * @param {string} modelName - 模型名稱
   * @returns {boolean} - 是否為自定義模型
   */
  isCustomModel(modelName) {
    return window.GlobalSettings.customModels[modelName] && window.GlobalSettings.customModels[modelName].isCustom;
  },

  /**
   * 獲取模型的 API 類型
   * @param {string} modelName - 模型名稱
   * @returns {string} - API類型 (gemini/openai/google-translate/unknown)
   */
  getModelApiType(modelName) {
    // 檢查是否為自定義模型
    if (window.GlobalSettings.customModels[modelName]) {
      return window.GlobalSettings.customModels[modelName].apiType;
    }
    
    // 內建模型的 API 類型判斷
    if (modelName.startsWith('gemini')) {
      return 'gemini';
    } else if (modelName.startsWith('gpt') || modelName === 'openai') {
      return 'openai';
    } else if (modelName === 'google-translate') {
      return 'google-translate';
    }
    
    return 'unknown';
  },

  /**
   * 獲取模型對應的 API 金鑰名稱
   * @param {string} modelName - 模型名稱
   * @returns {string|null} - API金鑰名稱或null
   */
  getApiKeyNameForModel(modelName) {
    LogUtils.log('開始處理模型:', modelName);
    const apiType = this.getModelApiType(modelName);
    LogUtils.log('模型 API 類型:', apiType);
    LogUtils.log('當前可用的 API 金鑰:', Object.keys(window.GlobalSettings.apiKeys));
    
    switch (apiType) {
      case 'gemini':
        // 對於 Gemini 模型，查找可用的 Gemini API 金鑰
        const geminiKeys = Object.keys(window.GlobalSettings.apiKeys).filter(key => 
          key === 'gemini' && window.GlobalSettings.apiKeys[key]  // 只查找 'gemini' 金鑰
        );
        LogUtils.log('找到的 Gemini 金鑰:', geminiKeys);
        if (geminiKeys.length > 0) {
          LogUtils.log('使用 Gemini 金鑰:', geminiKeys[0]);
          return geminiKeys[0];
        }
        LogUtils.log('未找到可用的 Gemini 金鑰');
        return null;
        
      case 'openai':
        LogUtils.log('檢查 OpenAI 金鑰');
        if (window.GlobalSettings.apiKeys['openai'] && window.GlobalSettings.apiKeys['openai'].trim()) {
          LogUtils.log('找到 OpenAI 金鑰');
          return 'openai';
        } else {
          LogUtils.log('未找到可用的 OpenAI 金鑰');
          LogUtils.log('當前 OpenAI 金鑰值:', window.GlobalSettings.apiKeys['openai'] || 'undefined');
          return null;
        }
        
      case 'google-translate':
        LogUtils.log('使用 Google Translate 金鑰');
        return 'google-translate';
        
      default:
        LogUtils.error('未知 API 類型:', apiType, '模型:', modelName);
        return null;
    }
  },

  /**
   * 獲取模型的顯示名稱
   * @param {string} modelName - 模型名稱
   * @returns {string} - 顯示名稱
   */
  getModelDisplayName(modelName) {
    LogUtils.log('開始處理模型名稱:', modelName);
    
    if (!modelName) {
      LogUtils.log('模型名稱為空，返回未知模型');
      return '未知模型';
    }
    
    // 優先檢查 API.models 中是否有對應的顯示名稱
    if (window.GlobalSettings.API.models[modelName]) {
      LogUtils.log('找到 API 模型:', window.GlobalSettings.API.models[modelName]);
      return window.GlobalSettings.API.models[modelName];
    }
    
    // 檢查是否為自定義模型
    if (window.GlobalSettings.customModels[modelName]) {
      LogUtils.log('找到自定義模型:', window.GlobalSettings.customModels[modelName].displayName);
      return window.GlobalSettings.customModels[modelName].displayName;
    }
    
    // 如果都沒有，使用自動轉換功能
    const formattedName = this._formatModelName(modelName);
    LogUtils.log('沒有找到顯示名稱，使用自動轉換:', modelName, '->', formattedName);
    LogUtils.log('當前自定義模型列表:', Object.keys(window.GlobalSettings.customModels));
    LogUtils.log('當前 API 模型列表:', Object.keys(window.GlobalSettings.API.models));
    return formattedName;
  },

  /**
   * 獲取預設模型，如果沒有則返回第一個可用模型
   * @returns {string|null} - 預設模型名稱或null
   */
  getDefaultModel() {
    // 如果有設定模型，優先使用
    if (window.GlobalSettings.model && (window.GlobalSettings.customModels[window.GlobalSettings.model] || window.GlobalSettings.API.models[window.GlobalSettings.model])) {
      return window.GlobalSettings.model;
    }
    
    // 獲取所有可用模型
    const allModels = this.getAllAvailableModels();
    const modelKeys = Object.keys(allModels);
    
    // 如果沒有可用模型，返回 null
    if (modelKeys.length === 0) {
      return null;
    }
    
    // 返回第一個可用模型
    return modelKeys[0];
  },

  /**
   * 自動轉換模型名稱格式
   * @param {string} modelName - 原始模型名稱
   * @returns {string} - 格式化後的模型名稱
   */
  _formatModelName(modelName) {
    if (!modelName) return '';
    
    // 將連字符和底線替換為空格，並分割成單詞
    let words = modelName.toLowerCase().split(/[-_]/);
    
    // 處理每個單詞
    words = words.map(word => {
      // 如果是版本號，保持原樣
      if (/^\d+(\.\d+)*$/.test(word)) {
        return word;
      }
      
      // 如果是類似 "4o" 的格式，保持原樣
      if (/^\d+[a-z]$/.test(word)) {
        return word;
      }
      
      // 只有幾個特殊縮寫需要全大寫
      if (word === 'gpt') {
        return 'GPT';
      }
      if (word === 'llama') {
        return 'LLaMA';
      }
      if (word === 'palm') {
        return 'PaLM';
      }
      
      // 其他所有單詞都是首字母大寫
      return word.charAt(0).toUpperCase() + word.slice(1);
    });
    
    // 將單詞連接成最終的顯示名稱
    return words.join(' ');
  },

  /**
   * 初始化模型管理器的 UI 功能
   * 綁定自動填入事件監聽器
   */
  initializeUI() {
    LogUtils.log('初始化模型管理器 UI 功能');
    
    // 獲取 DOM 元素
    const customModelNameInput = document.getElementById('custom-model-name');
    const customModelDisplayInput = document.getElementById('custom-model-display');
    
    if (!customModelNameInput || !customModelDisplayInput) {
      LogUtils.warn('找不到自定義模型輸入框元素');
      return;
    }
    
    // 防抖定時器
    let debounceTimer = null;
    
    // 監聽模型名稱輸入
    customModelNameInput.addEventListener('input', (e) => {
      const modelName = e.target.value.trim();
      
      // 清除之前的定時器
      if (debounceTimer) {
        clearTimeout(debounceTimer);
      }
      
      // 防抖處理
      debounceTimer = setTimeout(() => {
        this.autoFillDisplayName(modelName, customModelDisplayInput);
      }, 300);
    });
    
    // 監聽失焦事件，立即處理
    customModelNameInput.addEventListener('blur', (e) => {
      const modelName = e.target.value.trim();
      if (debounceTimer) {
        clearTimeout(debounceTimer);
      }
      this.autoFillDisplayName(modelName, customModelDisplayInput);
    });
    
    // 監聽顯示名稱輸入框的手動修改
    customModelDisplayInput.addEventListener('input', (e) => {
      // 當用戶手動修改顯示名稱時，清除自動填入標記
      if (e.target.dataset.autoFilled === 'true') {
        // 檢查是否是用戶手動修改（不是程序設置的）
        if (e.isTrusted) {
          e.target.dataset.autoFilled = 'false';
          LogUtils.log('用戶手動修改顯示名稱，清除自動填入標記');
        }
      }
    });
    
    LogUtils.log('模型管理器 UI 事件綁定完成');
  },

  /**
   * 初始化自定義模型管理的完整 UI 功能
   * 包含事件綁定、自動檢測、列表管理等
   */
  initializeCustomModelUI() {
    LogUtils.log('初始化自定義模型管理 UI 功能');
    
    // 綁定事件
    this.bindCustomModelEvents();
    
    // 更新模型列表
    this.updateCustomModelsList();
    
    LogUtils.log('自定義模型管理 UI 初始化完成');
  },

  /**
   * 綁定自定義模型相關的事件
   */
  bindCustomModelEvents() {
    // 獲取 DOM 元素
    const addCustomModelBtn = document.getElementById('add-custom-model');
    const customModelNameInput = document.getElementById('custom-model-name');
    const customModelDisplayInput = document.getElementById('custom-model-display');
    const customModelTypeSelect = document.getElementById('custom-model-type');
    
    // 綁定新增按鈕事件
    if (addCustomModelBtn) {
      addCustomModelBtn.addEventListener('click', () => {
        this.handleAddCustomModel();
      });
    }
    
    // 綁定自動檢測事件
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

  /**
   * 防抖的自動檢測
   * @param {string} inputText - 輸入的文本
   * @param {HTMLElement} customModelTypeSelect - API類型選擇器
   * @param {string} type - 輸入類型 ('modelName' 或 'displayName')
   */
  debouncedAutoDetect(inputText, customModelTypeSelect, type) {
    if (this.autoDetectDebounceTimer) {
      clearTimeout(this.autoDetectDebounceTimer);
    }
    
    this.autoDetectDebounceTimer = setTimeout(() => {
      this.autoDetectApiType(inputText, customModelTypeSelect, type);
    }, 300);
  },

  /**
   * 自動檢測 API 類型
   * @param {string} inputText - 輸入的文本
   * @param {HTMLElement} customModelTypeSelect - API類型選擇器
   * @param {string} type - 輸入類型 ('modelName' 或 'displayName')
   */
  autoDetectApiType(inputText, customModelTypeSelect, type = 'modelName') {
    if (!customModelTypeSelect) {
      customModelTypeSelect = document.getElementById('custom-model-type');
    }
    
    if (!inputText || !customModelTypeSelect) return;
    
    let detectedType = 'gemini';
    let textToAnalyze = inputText.toLowerCase();
    
    // 如果是顯示名稱，先清理不相關的詞語
    if (type === 'displayName') {
      textToAnalyze = textToAnalyze
        .replace(/\s*(api|模型|model|版本|version|最新|latest|pro|advanced|mini|小型|大型|智能|ai)\s*/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    }
    
    // OpenAI 模型的特徵模式
    const openaiPatterns = [
      /gpt[\s\-]?4/, /gpt[\s\-]?3\.?5?/, /gpt[\s\-]?o/, /\bgpt\b/,
      /text[\s\-]?davinci/, /davinci/, /curie/, /babbage/, /ada\b/,
      /o1[\s\-]?(preview|mini)?/, /o3[\s\-]/,
      /code[\s\-]?davinci/, /codex/,
      /openai/, /chatgpt/,
      /turbo\b/, /instruct\b/, /\bmini\b.*gpt/, /\bpro\b.*gpt/
    ];
    
    // Gemini 模型的特徵模式
    const geminiPatterns = [
      /gemini/, /palm[\s\-]?2?/, /bard/, /google/, /claude/,
      /lamda/, /minerva/, /pathways/, /flash\b/,
      /\bpro\b.*gemini/, /gemini.*\bpro\b/
    ];
    
    // 檢測 API 類型
    if (openaiPatterns.some(pattern => pattern.test(textToAnalyze))) {
      detectedType = 'openai';
    } else if (geminiPatterns.some(pattern => pattern.test(textToAnalyze))) {
      detectedType = 'gemini';
    }
    
    // 如果檢測到不同的類型，則更新選擇器並添加視覺效果
    if (customModelTypeSelect.value !== detectedType) {
      customModelTypeSelect.value = detectedType;
      customModelTypeSelect.classList.add('auto-detected', detectedType, 'auto-detect-pulse');
      setTimeout(() => {
        customModelTypeSelect.classList.remove('auto-detected', 'gemini', 'openai', 'auto-detect-pulse');
      }, 1200);
    }
  },

  /**
   * 處理新增自定義模型的 UI 操作
   */
  async handleAddCustomModel() {
    try {
      const customModelNameInput = document.getElementById('custom-model-name');
      const customModelDisplayInput = document.getElementById('custom-model-display');
      const customModelThinkingSelect = document.getElementById('custom-model-thinking');
      const customModelTypeSelect = document.getElementById('custom-model-type');
      
      if (!customModelNameInput || !customModelDisplayInput || !customModelTypeSelect) {
        LogUtils.error('找不到必要的表單元素');
        alert('找不到必要的表單元素，請重新載入頁面');
        return;
      }
      
      const modelName = customModelNameInput.value.trim();
      const displayName = customModelDisplayInput.value.trim();
      const thinkingLevel = customModelThinkingSelect ? customModelThinkingSelect.value : '';
      const apiType = customModelTypeSelect.value;

      // 驗證輸入
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

      // 呼叫核心新增方法
      await this.addCustomModel(modelName, displayName, apiType, thinkingLevel);
      
      // 清空表單
      customModelNameInput.value = '';
      customModelDisplayInput.value = '';
      if (customModelThinkingSelect) customModelThinkingSelect.value = '';
      customModelTypeSelect.value = '';

      // 更新 UI
      this.updateCustomModelsList();
      this.updateAllModelSelects();
    } catch (error) {
      LogUtils.error('新增模型錯誤:', error);
      alert('新增模型失敗：' + error.message);
    }
  },

  /**
   * 處理移除自定義模型的 UI 操作
   * @param {string} modelName - 模型名稱
   */
  async handleRemoveCustomModel(modelName) {
    if (!modelName) {
      alert('模型名稱無效');
      return;
    }
    
    if (confirm(`確定要刪除模型 "${modelName}" 嗎？這將同時移除相關的 API 金鑰。`)) {
      try {
        await this.removeCustomModel(modelName);
        this.updateCustomModelsList();
        this.updateAllModelSelects();

        // 如果當前選擇的是被刪除的模型，重置選擇
        const modelSelect = document.getElementById('model-select');
        if (modelSelect && modelSelect.value === modelName) {
          modelSelect.selectedIndex = 0;
          // 觸發更新 API 金鑰輸入框的事件
          const event = new Event('change');
          modelSelect.dispatchEvent(event);
        }
      } catch (error) {
        LogUtils.error(`刪除模型失敗:`, error);
        alert('刪除模型失敗：' + error.message);
      }
    }
  },

  /**
   * 更新自定義模型列表的 DOM 顯示
   */
  updateCustomModelsList() {
    const customModelsContainer = document.getElementById('custom-models-container');
    if (!customModelsContainer) {
      LogUtils.error('找不到 customModelsContainer 元素');
      return;
    }

    const customModels = this.getCustomModels();
    
    // 如果沒有自定義模型，顯示提示信息
    if (Object.keys(customModels).length === 0) {
      customModelsContainer.innerHTML = '<p style="color: #6c757d; font-size: 12px; margin: 0;">尚未新增任何自定義模型</p>';
      return;
    }

    // 清空容器
    customModelsContainer.innerHTML = '';
    
    // 為每個自定義模型創建 DOM 元素
    Object.entries(customModels).forEach(([key, model]) => {
      const modelItem = document.createElement('div');
      modelItem.className = 'custom-model-item';
      
      const thinkingLabelMap = { off: '關閉', low: '低', medium: '中', high: '高' };
      const thinkingLabel = thinkingLabelMap[model.thinkingLevel] || '—';

      modelItem.innerHTML = `
        <div class="custom-model-info">
          <div class="custom-model-name">${key}</div>
          <div class="custom-model-details">${model.displayName}</div>
          <div class="custom-model-thinking">${thinkingLabel}</div>
          <div class="custom-model-api-type">${model.apiType === 'gemini' ? 'Gemini API' : 'OpenAI API'}</div>
        </div>
        <div class="custom-model-actions">
          <button class="delete-model-button" data-model-key="${key}">刪除</button>
        </div>
      `;
      
      // 綁定刪除按鈕事件
      const deleteButton = modelItem.querySelector('.delete-model-button');
      deleteButton.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.handleRemoveCustomModel(key);
      });
      
      customModelsContainer.appendChild(modelItem);
    });
  },

  /**
   * 更新所有模型選擇器的選項
   */
  updateAllModelSelects() {
    const allModels = this.getAllAvailableModels();
    
    // API 提供者映射
    const apiProviders = {
      'gemini': 'Gemini',
      'openai': 'OpenAI', 
      'google-translate': 'Google 翻譯'
    };
    
    // 需要更新的模型選擇器元素
    const modelSelectorsIds = [
      'fullRewriteModel', 'shortRewriteModel', 'autoRewriteModel',
      'rephraseModel', 'translateModel', 'generateModel', 'reflect1Model',
      'generationOptimize_1_Model', 'reflect2Model', 'generationOptimize_2_Model',
      'reflect3Model', 'generationOptimize_3_Model', 'summaryModel',
      'codeCheckModel', 'reflectModel', 'optimizeModel'
    ];

    // 更新主要的模型選擇器（API 提供者）
    const modelSelect = document.getElementById('model-select');
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

    // 更新其他所有模型選擇器
    modelSelectorsIds.forEach(selectorId => {
      const selector = document.getElementById(selectorId);
      if (!selector) return;
      
      const currentValue = selector.value;
      selector.innerHTML = '';
      
      // 過濾掉 google-translate，因為它不適用於其他功能
      const availableModels = Object.entries(allModels).filter(([key]) => key !== 'google-translate');
      
      if (availableModels.length === 0) {
        // 如果沒有可用模型，顯示提示並禁用選擇器
        const option = document.createElement('option');
        option.value = '';
        option.textContent = '請先新增模型';
        option.disabled = true;
        selector.appendChild(option);
        selector.disabled = true;
      } else {
        selector.disabled = false;
        
        // 添加所有可用模型
        availableModels.forEach(([key, displayName]) => {
          const option = document.createElement('option');
          option.value = key;
          option.textContent = displayName;
          selector.appendChild(option);
        });
        
        // 恢復之前選擇的值
        if (currentValue && allModels[currentValue]) {
          selector.value = currentValue;
        } else {
          selector.value = '';
        }
      }
    });
  },

  /**
   * 自動填入顯示名稱
   * @param {string} modelName - 模型名稱
   * @param {HTMLElement} displayInput - 顯示名稱輸入框
   */
  autoFillDisplayName(modelName, displayInput) {
    if (!modelName || !displayInput) return;
    
    // 使用 _formatModelName 方法自動轉換
    const formattedName = this._formatModelName(modelName);
    const currentValue = displayInput.value.trim();
    
    // 檢查是否應該更新顯示名稱
    const shouldUpdate = this._shouldUpdateDisplayName(modelName, formattedName, currentValue);
    
    if (shouldUpdate && formattedName) {
      displayInput.value = formattedName;
      
      // 標記為自動填入
      displayInput.dataset.autoFilled = 'true';
      displayInput.dataset.lastModelName = modelName;
      
      // 添加視覺反饋動畫
      this.addAutoFillAnimation(displayInput);
      
      LogUtils.log(`自動填入顯示名稱: ${modelName} -> ${formattedName}`);
    }
  },

  /**
   * 判斷是否應該更新顯示名稱
   * @param {string} modelName - 當前模型名稱
   * @param {string} formattedName - 格式化後的名稱
   * @param {string} currentValue - 當前顯示名稱
   * @returns {boolean} - 是否應該更新
   */
  _shouldUpdateDisplayName(modelName, formattedName, currentValue) {
    // 如果顯示名稱為空，可以填入
    if (!currentValue) {
      return true;
    }
    
    // 如果當前值是之前自動填入的，可以更新
    const displayInput = document.getElementById('custom-model-display');
    const isAutoFilled = displayInput && displayInput.dataset.autoFilled === 'true';
    const lastModelName = displayInput && displayInput.dataset.lastModelName;
    
    if (isAutoFilled && lastModelName) {
      // 如果是連續輸入（模型名稱是上次的擴展），可以更新
      if (modelName.startsWith(lastModelName) || lastModelName.startsWith(modelName)) {
        return true;
      }
      
      // 如果當前值是上次模型名稱的格式化結果，可以更新
      const lastFormattedName = this._formatModelName(lastModelName);
      if (currentValue === lastFormattedName) {
        return true;
      }
    }
    
    // 如果當前值與格式化後的名稱不同，且轉換後的名稱與原始名稱不同，可以更新
    if (currentValue !== formattedName && formattedName !== modelName) {
      return true;
    }
    
    return false;
  },

  /**
   * 添加自動填入動畫效果
   * @param {HTMLElement} element - 要添加動畫的元素
   */
  addAutoFillAnimation(element) {
    if (!element) return;
    
    // 添加綠色邊框和跳躍動畫
    element.classList.add('auto-detected', 'gemini', 'auto-detect-pulse');
    
    // 1.2秒後移除動畫效果
    setTimeout(() => {
      element.classList.remove('auto-detected', 'gemini', 'auto-detect-pulse');
    }, 1200);
  }
};

// 暴露到全局 - 兼容不同環境
if (typeof window !== 'undefined') {
  window.ModelManager = ModelManager;
} else if (typeof self !== 'undefined') {
  // Service Worker 環境
  self.ModelManager = ModelManager;
} else if (typeof global !== 'undefined') {
  // Node.js 環境
  global.ModelManager = ModelManager;
}