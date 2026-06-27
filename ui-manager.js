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
    LogUtils.log('開始添加改寫按鈕');
    if (!window.shouldEnableFeatures() || document.getElementById('gpt-rewrite-button')) {
      LogUtils.log('不符合添加按鈕條件');
      return;
    }

    // 獲取textarea元素
    const textArea = document.querySelector('textarea[name="content"]');
    if (!textArea) {
      LogUtils.log('找不到文本區域');
      return;
    }

    // 創建按鈕容器
    const buttonContainer = document.createElement('div');
    buttonContainer.id = 'gpt-button-container';

    // 創建比對切換按鈕（三態循環：hide → show → off → hide）
    // hide：隱藏等價差異（預設，綠色），show：顯示等價差異（橘色），off：關閉（灰色）
    this._DIFF_MODES = ['hide', 'show', 'off'];
    this._diffModeIdx = 0;
    const diffToggleBtn = document.createElement('button');
    this._diffToggleBtn = diffToggleBtn;
    diffToggleBtn.id = 'gpt-diff-toggle';
    diffToggleBtn.textContent = '比對';
    diffToggleBtn.classList.add('gpt-diff-toggle-hide');
    diffToggleBtn.addEventListener('click', () => {
      this._diffModeIdx = (this._diffModeIdx + 1) % this._DIFF_MODES.length;
      const mode = this._DIFF_MODES[this._diffModeIdx];
      diffToggleBtn.className = '';
      diffToggleBtn.id = 'gpt-diff-toggle';
      if (mode !== 'off') diffToggleBtn.classList.add(`gpt-diff-toggle-${mode}`);
      if (window.DiffHighlighter) window.DiffHighlighter.toggle(mode);
    });
    // 初始化為 hide 模式
    if (window.DiffHighlighter) window.DiffHighlighter.toggle('hide');

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

        // 改寫前立即將報告框內容複製到公司簡介框，作為 diff 基準
        const introTextarea = document.querySelector('textarea[name="info"]');
        if (introTextarea) {
          introTextarea.value = textArea.value;
          introTextarea.dispatchEvent(new Event('input', { bubbles: true }));
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
        LogUtils.log('改寫完成');
      } catch (error) {
        LogUtils.error('改寫錯誤:', error);
        alert('改寫錯誤: ' + error.message);
      } finally {
        this.disabled = false;
      }
    });

    buttonContainer.appendChild(rewriteButton);

    // 創建重述按鈕
    const rephraseButton = document.createElement('button');
    rephraseButton.id = 'gpt-rephrase-button';
    rephraseButton.textContent = '重述';
    rephraseButton.addEventListener('click', async function() {
      try {
        const textArea = document.querySelector('textarea[name="content"]');
        if (!textArea || !textArea.value.trim()) {
          alert('請先輸入要重述的內容');
          return;
        }

        const settings = await window.GlobalSettings.loadSettings();
        // 檢查是否有任何可用的 API 金鑰
        const hasAnyApiKey = Object.values(settings.apiKeys || {}).some(key => key && key.trim());
        if (!hasAnyApiKey) {
          throw new Error('請先設置 API 金鑰');
        }
        if (!settings.rephraseInstruction || !settings.rephraseInstruction.trim()) {
          alert('請設置重述要求');
          return;
        }
        
        this.disabled = true;
        // 使用重述指令和模型
        await window.TextProcessor.rephraseText();
        LogUtils.log('重述完成');
      } catch (error) {
        LogUtils.error('重述錯誤:', error);
        alert('重述錯誤: ' + error.message);
      } finally {
        this.disabled = false;
      }
    });

    buttonContainer.appendChild(rephraseButton);

    // 創建翻譯按鈕
    if (window.TranslateManager) {
      const translateButton = document.createElement('button');
      translateButton.id = 'ai-translate-button';
      translateButton.textContent = 'AI翻譯';
      translateButton.addEventListener('click', () => {
        LogUtils.log('AI翻譯按鈕被點擊');
        
        const textArea = document.querySelector('textarea[name="content"]');
        if (!textArea || !textArea.value.trim()) {
          alert('請先輸入要翻譯的內容');
          return;
        }

        // 翻譯時自動關閉比對
        this.setDiffOff();

        if (window.TranslateManager && window.TranslateManager.handleTranslateClick) {
          window.TranslateManager.handleTranslateClick(translateButton);
        } else {
          LogUtils.error('TranslateManager 不存在或 handleTranslateClick 方法未定義');
          alert('翻譯功能未正確載入，請重新整理頁面');
        }
      });
      buttonContainer.appendChild(translateButton);
    } else {
      LogUtils.warn('TranslateManager 未定義，跳過創建AI翻譯按鈕');
    }

    // 創建 Google 翻譯按鈕容器
    if (window.GoogleTranslateManager) {
      const googleTranslateContainer = document.createElement('div');
      googleTranslateContainer.className = 'google-translate-container';
      
      const googleTranslateButton = document.createElement('button');
      googleTranslateButton.id = 'google-translate-button';
      googleTranslateButton.className = 'google-translate-button-with-dropdown';
      googleTranslateButton.innerHTML = `
        <span>G翻譯(繁中)</span>
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

          // 翻譯時自動關閉比對
          this.setDiffOff();

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
          googleTranslateButton.querySelector('span').textContent = `G翻譯(${shortName})`;
          
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
        LogUtils.log('Google翻譯按鈕被點擊');
        
        // 檢查 GoogleTranslateManager 是否存在
        if (!window.GoogleTranslateManager) {
          LogUtils.error('GoogleTranslateManager 不存在');
          alert('Google翻譯功能未正確載入，請重新整理頁面');
          return;
        }
        
        // 如果點擊的是箭頭區域，顯示/隱藏下拉選單
        const rect = googleTranslateButton.getBoundingClientRect();
        const clickX = e.clientX - rect.left;
        const isArrowClick = clickX > rect.width - 30; // 箭頭區域寬度約30px
        
        LogUtils.log('點擊位置分析:', {
          clickX: clickX,
          buttonWidth: rect.width,
          isArrowClick: isArrowClick,
          targetLanguage: window.GoogleTranslateManager.targetLanguage
        });
        
        if (isArrowClick) {
          LogUtils.log('箭頭區域被點擊，切換下拉選單');
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
          LogUtils.log('按鈕主體被點擊');
          
          const textArea = document.querySelector('textarea[name="content"]');
          if (!textArea || !textArea.value.trim()) {
            alert('請先輸入要翻譯的內容');
            return;
          }

          // 如果已設置目標語言，直接開始翻譯
          if (window.GoogleTranslateManager.targetLanguage) {
            // 翻譯時自動關閉比對
            this.setDiffOff();
            LogUtils.log('開始翻譯，目標語言:', window.GoogleTranslateManager.targetLanguage);
            window.GoogleTranslateManager.handleGoogleTranslateClick(googleTranslateButton);
          } else {
            // 未設置語言時顯示下拉選單並提示用戶
            LogUtils.log('未設置目標語言，顯示下拉選單');
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

    // 創建複製按鈕（edit 頁與 create 頁；複製本報告欄位到多檔新報告）
    if (window.ReportCopy && /\/research-reports\/(\d+\/edit|create)/.test(location.pathname)) {
      const copyButton = document.createElement('button');
      copyButton.id = 'gpt-copy-button';
      copyButton.textContent = '複製';
      copyButton.addEventListener('click', () => window.ReportCopy.openDialog());
      buttonContainer.appendChild(copyButton);
    }

    // 創建自動替換暫停開關按鈕
    if (window.AutoReplaceManager) {
      const replaceToggleButton = document.createElement('button');
      replaceToggleButton.id = 'auto-replace-toggle-button';
      replaceToggleButton.textContent = '替換';
      replaceToggleButton.addEventListener('click', () => {
        const paused = !window.AutoReplaceManager._paused;
        window.AutoReplaceManager._paused = paused;
        replaceToggleButton.classList.toggle('paused', paused);
      });
      buttonContainer.appendChild(replaceToggleButton);
    }
    buttonContainer.appendChild(diffToggleBtn);

    this._setupTextArea(textArea, buttonContainer);

    // 初始化比對功能（在 DOM 就緒後）
    if (window.DiffHighlighter) {
      window.DiffHighlighter.init('textarea[name="info"]', 'textarea[name="content"]');
      if (window.GlobalSettings) {
        window.DiffHighlighter.setCustomRules(GlobalSettings.diffCustomRules || '');
      }
    }

    LogUtils.log('改寫按鈕添加成功');
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

    // 監聽 URL 變化：改用共用 SharedUrlWatcher，且全域只訂閱一次。
    // 原本每次 _setupTextArea 都 new 一個永不斷開的全 document 觀察者 → 編輯器每次重掛就洩漏一個，越點越慢。
    if (!this._urlWatchBound) {
      this._urlWatchBound = true;
      window.SharedUrlWatcher.subscribe(async () => {
        LogUtils.log('URL變化檢測到，重新檢查是否需要初始化UI');
        if (window.shouldEnableFeatures()) {
          await this.initializeAllUI();
        } else {
          this.removeAllUI();
        }
      });
    }
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
      LogUtils.error('自動改寫錯誤:', error);
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

  /** 初始化股票代碼功能 - 委派給 StockMatcher 模組 */
  initializeStockCodeFeature(isFromSettingsUpdate = false) {
    // 注意：此方法已移至 stock_matcher/stock-matcher.js 模組
    // 為保持向後兼容，這裡委派給 StockMatcher
    if (window.StockMatcher && window.StockMatcher.initializeStockCodeFeature) {
      return window.StockMatcher.initializeStockCodeFeature(isFromSettingsUpdate);
    } else {
      LogUtils.warn('StockMatcher 模組未載入，無法初始化股票代碼功能');
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
      LogUtils.log('改寫按鈕已移除');
    }
  },

  /** 初始化所有UI元素 */
  async initializeAllUI() {
    if (!window.shouldEnableFeatures()) {
      LogUtils.log('不符合啟用功能條件，移除所有UI元素');
      this.removeAllUI();
      return;
    }
    
    LogUtils.log('初始化所有UI元素');
    this.addRewriteButton();
    this.initializeStockCodeFeature();
    await window.ReplaceManager.initializeReplaceUI();
    
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
    LogUtils.log('移除所有UI元素');
    this.removeRewriteButton();
    this.removeStockCodeFeature();
    window.ReplaceManager.removeReplaceUI();
  },

  /**
   * 強制將比對按鈕設為 off 狀態
   * ⚠️ 翻譯功能會呼叫此方法，因為翻譯結果不應與原文比對
   */
  setDiffOff() {
    if (!this._diffToggleBtn) return;
    // 已是 off 就不重複操作
    const currentMode = this._DIFF_MODES[this._diffModeIdx];
    if (currentMode === 'off') return;

    this._diffModeIdx = this._DIFF_MODES.indexOf('off'); // = 2
    this._diffToggleBtn.className = '';
    this._diffToggleBtn.id = 'gpt-diff-toggle';
    if (window.DiffHighlighter) window.DiffHighlighter.toggle('off');
    LogUtils.log('比對按鈕已自動設為 off');
  },

  /** 檢查文本內容並更新按鈕狀態 */
  updateButtonStates() {
    const textArea = document.querySelector('textarea[name="content"]');
    if (!textArea) return;

    const hasContent = textArea.value.trim().length > 0;
    
    // 更新所有功能按鈕的狀態
    const buttons = [
      'gpt-rewrite-button',
      'gpt-rephrase-button',
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
