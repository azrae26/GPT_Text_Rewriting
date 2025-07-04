/* global GlobalSettings, TextProcessor, Notification, UndoManager */
/**
 * ui-manager.js - UI 管理模組
 * 功能：管理所有使用者介面元素的創建、事件處理和狀態管理
 * 職責：
 * - 改寫按鈕管理：創建和管理改寫、翻譯按鈕
 * - 股票代碼功能委派：委派給 StockMatcher 模組處理（保持向後兼容）
 * - 雙擊事件處理：處理文本區域的雙擊自動改寫
 * - 文本區域增強：添加快捷鍵和事件監聽
 * - 動態 UI 更新：根據頁面狀態動態調整 UI 元素
 * - Google 翻譯整合：處理多語言翻譯下拉選單
 * - 任務狀態追蹤：管理活動改寫任務的狀態
 * 
 * 依賴：
 * - GlobalSettings：全局設定管理
 * - TextProcessor：文本處理核心
 * - TranslateManager：翻譯功能管理
 * - GoogleTranslateManager：Google 翻譯功能
 * - UndoManager：復原功能
 * - StockMatcher：股票代號匹配功能（新分離模組）
 */
const UIManager = {
  /** 初始化追蹤改寫任務的 Set */
  _activeRewrites: new Set(),

  /** 添加改寫按鈕 */
  addRewriteButton() {
    window.console.log('開始添加改寫按鈕');
    if (!window.shouldEnableFeatures() || document.getElementById('gpt-rewrite-button')) {
      window.console.log('不符合添加按鈕條件');
      return;
    }

    // 獲取textarea元素
    const textArea = document.querySelector('textarea[name="content"]');
    if (!textArea) {
      window.console.log('找不到文本區域');
      return;
    }

    // 創建按鈕容器
    const buttonContainer = document.createElement('div');
    buttonContainer.id = 'gpt-button-container';

    // 創建改寫按鈕
    const rewriteButton = document.createElement('button');
    rewriteButton.id = 'gpt-rewrite-button';
    rewriteButton.textContent = '改寫';
    rewriteButton.addEventListener('click', async function() {
      try {
        const textArea = document.querySelector('textarea[name="content"]');
        if (!textArea || !textArea.value.trim()) {
          alert('請先輸入要改寫的內容');
          return;
        }

        const settings = await window.GlobalSettings.loadSettings();
        // 檢查是否有任何可用的 API 金鑰
        const hasAnyApiKey = Object.values(settings.apiKeys || {}).some(key => key && key.trim());
        if (!hasAnyApiKey) {
          throw new Error('請先設置 API 金鑰');
        }
        if (!settings.instruction.trim()) {
          alert('請設置改寫要求');
          return;
        }
        
        this.disabled = true;
        await window.TextProcessor.rewriteText();
        window.console.log('改寫完成');
      } catch (error) {
        window.console.error('改寫錯誤:', error);
        alert('改寫錯誤: ' + error.message);
      } finally {
        this.disabled = false;
      }
    });

    buttonContainer.appendChild(rewriteButton);

    // 創建翻譯按鈕
    if (window.TranslateManager) {
      const translateButton = document.createElement('button');
      translateButton.id = 'ai-translate-button';
      translateButton.textContent = 'AI翻譯';
      translateButton.addEventListener('click', () => {
        console.log('AI翻譯按鈕被點擊');
        
        const textArea = document.querySelector('textarea[name="content"]');
        if (!textArea || !textArea.value.trim()) {
          alert('請先輸入要翻譯的內容');
          return;
        }

        if (window.TranslateManager && window.TranslateManager.handleTranslateClick) {
          window.TranslateManager.handleTranslateClick(translateButton);
        } else {
          console.error('TranslateManager 不存在或 handleTranslateClick 方法未定義');
          alert('翻譯功能未正確載入，請重新整理頁面');
        }
      });
      buttonContainer.appendChild(translateButton);
    } else {
      console.warn('TranslateManager 未定義，跳過創建AI翻譯按鈕');
    }

    // 創建 Google 翻譯按鈕容器
    if (window.GoogleTranslateManager) {
      const googleTranslateContainer = document.createElement('div');
      googleTranslateContainer.className = 'google-translate-container';
      
      const googleTranslateButton = document.createElement('button');
      googleTranslateButton.id = 'google-translate-button';
      googleTranslateButton.className = 'google-translate-button-with-dropdown';
      googleTranslateButton.innerHTML = `
        <span>Google翻譯(繁中)</span>
        <span class="dropdown-arrow"></span>
      `;
      
      // 創建語言選擇下拉選單
      const languageDropdown = document.createElement('div');
      languageDropdown.id = 'google-translate-dropdown';
      languageDropdown.className = 'google-translate-dropdown';
      
      const languages = [
        { code: 'zh-TW', name: '繁中' },
        { code: 'zh-CN', name: '簡中' },
        { code: 'en', name: '英文' },
        { code: 'ja', name: '日文' }
      ];
      
      languages.forEach(lang => {
        const option = document.createElement('div');
        option.className = 'dropdown-option';
        option.textContent = lang.name;
        option.addEventListener('click', (e) => {
          e.stopPropagation();
          
          const textArea = document.querySelector('textarea[name="content"]');
          if (!textArea || !textArea.value.trim()) {
            alert('請先輸入要翻譯的內容');
            // 隱藏下拉選單
            languageDropdown.style.display = 'none';
            googleTranslateButton.classList.remove('dropdown-open');
            return;
          }

          // 設置選中的語言
          window.GoogleTranslateManager.setTargetLanguage(lang.code);
          
          // 使用簡寫的語言名稱更新按鈕文字
          const shortNames = {
            'zh-TW': '繁中',
            'zh-CN': '簡中', 
            'en': '英文',
            'ja': '日文'
          };
          const shortName = shortNames[lang.code] || lang.name;
          googleTranslateButton.querySelector('span').textContent = `Google翻譯(${shortName})`;
          
          // 隱藏下拉選單
          languageDropdown.style.display = 'none';
          googleTranslateButton.classList.remove('dropdown-open');
          
          // 開始翻譯
          window.GoogleTranslateManager.handleGoogleTranslateClick(googleTranslateButton);
        });
        languageDropdown.appendChild(option);
      });
      
      // 點擊按鈕主體開始翻譯（如果已選擇語言）
      googleTranslateButton.addEventListener('click', (e) => {
        console.log('Google翻譯按鈕被點擊');
        
        // 檢查 GoogleTranslateManager 是否存在
        if (!window.GoogleTranslateManager) {
          console.error('GoogleTranslateManager 不存在');
          alert('Google翻譯功能未正確載入，請重新整理頁面');
          return;
        }
        
        // 如果點擊的是箭頭區域，顯示/隱藏下拉選單
        const rect = googleTranslateButton.getBoundingClientRect();
        const clickX = e.clientX - rect.left;
        const isArrowClick = clickX > rect.width - 30; // 箭頭區域寬度約30px
        
        console.log('點擊位置分析:', {
          clickX: clickX,
          buttonWidth: rect.width,
          isArrowClick: isArrowClick,
          targetLanguage: window.GoogleTranslateManager.targetLanguage
        });
        
        if (isArrowClick) {
          console.log('箭頭區域被點擊，切換下拉選單');
          e.stopPropagation();
          const isVisible = languageDropdown.style.display === 'block';
          languageDropdown.style.display = isVisible ? 'none' : 'block';
          
          // 切換箭頭動畫狀態
          if (isVisible) {
            googleTranslateButton.classList.remove('dropdown-open');
          } else {
            googleTranslateButton.classList.add('dropdown-open');
          }
        } else {
          console.log('按鈕主體被點擊');
          
          const textArea = document.querySelector('textarea[name="content"]');
          if (!textArea || !textArea.value.trim()) {
            alert('請先輸入要翻譯的內容');
            return;
          }

          // 如果已設置目標語言，直接開始翻譯
          if (window.GoogleTranslateManager.targetLanguage) {
            console.log('開始翻譯，目標語言:', window.GoogleTranslateManager.targetLanguage);
            window.GoogleTranslateManager.handleGoogleTranslateClick(googleTranslateButton);
          } else {
            // 未設置語言時顯示下拉選單並提示用戶
            console.log('未設置目標語言，顯示下拉選單');
            languageDropdown.style.display = 'block';
            googleTranslateButton.classList.add('dropdown-open');
          }
        }
      });
      
      // 點擊其他地方時隱藏下拉選單
      document.addEventListener('click', () => {
        languageDropdown.style.display = 'none';
        googleTranslateButton.classList.remove('dropdown-open');
      });
      
      googleTranslateContainer.appendChild(googleTranslateButton);
      googleTranslateContainer.appendChild(languageDropdown);
      buttonContainer.appendChild(googleTranslateContainer);
    }

    // 創建生成按鈕
    if (window.GenerationManager) {
      const generateButton = document.createElement('button');
      generateButton.id = 'gpt-generate-button';
      generateButton.textContent = '生成';
      generateButton.addEventListener('click', () => {
        const textArea = document.querySelector('textarea[name="content"]');
        if (!textArea || !textArea.value.trim()) {
          alert('請先輸入要生成的內容');
          return;
        }
        window.GenerationManager.handleGenerateClick(generateButton);
      });
      buttonContainer.appendChild(generateButton);
    }

    this._setupTextArea(textArea, buttonContainer);
    window.console.log('改寫按鈕添加成功');
  },

  /** 設置文本區域樣式和事件 */
  _setupTextArea(textArea, buttonContainer) {
    const parent = textArea.parentElement;
    parent.appendChild(buttonContainer);

    window.UndoManager.initInputHistory(textArea);
    textArea.addEventListener('dblclick', (e) => this._handleDoubleClick(e, textArea));

    // 監聽文本變化以更新按鈕狀態
    textArea.addEventListener('input', () => {
      this.updateButtonStates();
    });

    // 初始化按鈕狀態
    this.updateButtonStates();

    // 監聽URL變化
    let lastUrl = location.href;
    new MutationObserver(() => {
      const url = location.href;
      if (url !== lastUrl) {
        lastUrl = url;
        window.console.log('URL變化檢測到，重新檢查是否需要初始化UI');
        if (window.shouldEnableFeatures()) {
          this.initializeAllUI();
        } else {
          this.removeAllUI();
        }
      }
    }).observe(document, {subtree: true, childList: true});
  },

  /** 處理雙擊改寫事件 */
  async _handleDoubleClick(event, textArea) {
    const selectedText = window.getSelection().toString().trim();
    if (!selectedText) return;

    // 獲取選擇的文本範圍
    const range = {
      start: Math.max(0, textArea.selectionStart - 4),
      end: Math.min(textArea.value.length, textArea.selectionEnd + 4)
    };
    
    const matchResult = window.TextProcessor.findSpecialText(
      textArea.value.substring(range.start, range.end)
    );
    if (!matchResult) return;

    try {
      const settings = await window.GlobalSettings.loadSettings();
      // 檢查是否有任何可用的 API 金鑰
      const hasAnyApiKey = Object.values(settings.apiKeys || {}).some(key => key && key.trim());
      if (!hasAnyApiKey) {
        throw new Error('請先設置 API 金鑰');
      }

      // 記錄這次改寫任務的位置
      const rewriteTask = {
        startIndex: range.start + matchResult.startIndex, // 改寫任務的開始位置
        endIndex: range.start + matchResult.endIndex, // 改寫任務的結束位置
        originalText: matchResult.matchedText // 改寫任務的原始文本，用於比對改寫後的文本
      };
      this._activeRewrites.add(rewriteTask);

      // 改寫文本
      const rewrittenText = await window.TextProcessor.rewriteText(matchResult.matchedText, true);
      
      if (rewrittenText?.trim() !== matchResult.matchedText) {
        // 計算長度差
        const lengthDiff = rewrittenText.length - matchResult.matchedText.length;
        
        // 更新其他改寫任務的位置
        for (const task of this._activeRewrites) {
          if (task !== rewriteTask && task.startIndex > rewriteTask.startIndex) {
            task.startIndex += lengthDiff; // 更新其他改寫任務的開始位置
            task.endIndex += lengthDiff; // 更新其他改寫任務的結束位置
          }
        }

        // 更新文本
        textArea.value = textArea.value.substring(0, rewriteTask.startIndex) + // 改寫前的文本，從文本開始到改寫開始位置
                        rewrittenText + // 改寫後的文本，從改寫開始位置到文本結束
                        textArea.value.substring(rewriteTask.endIndex); // 改寫後的文本，從改寫結束位置到文本結束
        
        textArea.dispatchEvent(new Event('input', { bubbles: true })); // 觸發文本區域的input事件，更新顯示
        await window.Notification.showNotification('自動改寫完成', false); // 顯示通知
      }

    } catch (error) {
      window.console.error('自動改寫錯誤:', error);
      alert('自動改寫錯誤: ' + error.message);
    } finally {
      if (typeof rewriteTask !== 'undefined') {
        this._activeRewrites.delete(rewriteTask);
      }
    }
  },

  /** 從設定載入股票清單 - 已移至 StockMatcher 模組 */
  async _loadStockListFromSettings() {
    // 注意：此方法已移至 stock_matcher/stock-matcher.js 模組 
    // 為保持向後兼容，這裡委派給 StockMatcher
    if (window.StockMatcher && window.StockMatcher._loadStockListFromSettings) {
      return window.StockMatcher._loadStockListFromSettings();
    }
  },

  /** 解析股票清單文字為股票物件陣列 - 已移至 StockMatcher 模組 */
  _parseStockList(stockListText) {
    // 注意：此方法已移至 stock_matcher/stock-matcher.js 模組
    // 為保持向後兼容，這裡委派給 StockMatcher
    if (window.StockMatcher && window.StockMatcher._parseStockList) {
      return window.StockMatcher._parseStockList(stockListText);
    }
    return [];
  },

  /** 初始化股票代碼功能 - 委派給 StockMatcher 模組 */
  initializeStockCodeFeature() {
    // 注意：此方法已移至 stock_matcher/stock-matcher.js 模組
    // 為保持向後兼容，這裡委派給 StockMatcher
    if (window.StockMatcher && window.StockMatcher.initializeStockCodeFeature) {
      return window.StockMatcher.initializeStockCodeFeature();
    } else {
      window.console.warn('StockMatcher 模組未載入，無法初始化股票代碼功能');
    }
  },

  /** 獲取或創建按鈕容器 - 已移至 StockMatcher 模組 */
  _getOrCreateContainer() {
    // 注意：此方法已移至 stock_matcher/stock-matcher.js 模組
    // 為保持向後兼容，這裡委派給 StockMatcher
    if (window.StockMatcher && window.StockMatcher._getOrCreateContainer) {
      return window.StockMatcher._getOrCreateContainer();
    }
    return null;
  },

  /** 從文本中提取股票代碼和名稱 - 已移至 StockMatcher 模組 */
  _getStockCodes(text, inputCode = '') {
    // 注意：此方法已移至 stock_matcher/stock-matcher.js 模組
    // 為保持向後兼容，這裡委派給 StockMatcher
    if (window.StockMatcher && window.StockMatcher._getStockCodes) {
      return window.StockMatcher._getStockCodes(text, inputCode);
    }
    return { codes: [], matchedStocks: new Map(), stockCounts: new Map() };
  },

  /** 更新股票代碼按鈕 - 已移至 StockMatcher 模組 */
  _updateStockButtons(codes, matchedStocks, elements) {
    // 注意：此方法已移至 stock_matcher/stock-matcher.js 模組
    // 為保持向後兼容，這裡委派給 StockMatcher
    if (window.StockMatcher && window.StockMatcher._updateStockButtons) {
      return window.StockMatcher._updateStockButtons(codes, matchedStocks, elements);
    }
  },

  /** 移除股票代碼功能 - 委派給 StockMatcher 模組 */
  removeStockCodeFeature() {
    // 注意：此方法已移至 stock_matcher/stock-matcher.js 模組
    // 為保持向後兼容，這裡委派給 StockMatcher
    if (window.StockMatcher && window.StockMatcher.removeStockCodeFeature) {
      return window.StockMatcher.removeStockCodeFeature();
    } else {
      // 備用清理邏輯，確保DOM元素被移除
      const container = document.getElementById('stock-code-container');
      if (container) container.remove();
    }
  },

  /** 移除改寫按鈕，在URL變化時調用 */
  removeRewriteButton() {
    const container = document.getElementById('gpt-button-container');
    if (container) {
      container.remove();
      window.console.log('改寫按鈕已移除');
    }
  },

  /** 初始化所有UI元素 */
  initializeAllUI() {
    if (!window.shouldEnableFeatures()) {
      window.console.log('不符合啟用功能條件，移除所有UI元素');
      this.removeAllUI();
      return;
    }
    
    window.console.log('初始化所有UI元素');
    this.addRewriteButton();
    this.initializeStockCodeFeature();
    window.ReplaceManager.initializeReplaceUI();
    
    // 初始化各 Manager 的非按鈕元素
    if (window.TranslateManager) {
      window.TranslateManager.initialize();
    }
    if (window.GoogleTranslateManager) {
      window.GoogleTranslateManager.initialize();
    }

    // 確保按鈕狀態正確
    setTimeout(() => {
      this.updateButtonStates();
    }, 100);
  },

  /** 移除所有UI元素 */
  removeAllUI() {
    window.console.log('移除所有UI元素');
    this.removeRewriteButton();
    this.removeStockCodeFeature();
    window.ReplaceManager.removeReplaceUI();
  },

  /** 檢查文本內容並更新按鈕狀態 */
  updateButtonStates() {
    const textArea = document.querySelector('textarea[name="content"]');
    if (!textArea) return;

    const hasContent = textArea.value.trim().length > 0;
    
    // 更新所有功能按鈕的狀態
    const buttons = [
      'gpt-rewrite-button',
      'ai-translate-button', 
      'google-translate-button',
      'gpt-generate-button'
    ];

    buttons.forEach(buttonId => {
      const button = document.getElementById(buttonId);
      if (button) {
        button.disabled = !hasContent;
        // 設置游標樣式
        if (hasContent) {
          button.style.cursor = 'pointer';
        } else {
          button.style.cursor = 'not-allowed';
        }
      }
    });
  }
};

window.UIManager = UIManager;
