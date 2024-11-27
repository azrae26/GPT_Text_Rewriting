/* global GlobalSettings, TextProcessor, Notification, UndoManager */
/** UI管理模組 */
const UIManager = {
  /** 初始化追蹤改寫任務的 Set */
  _activeRewrites: new Set(),

  /** 添加改寫按鈕 */
  addRewriteButton() {
    console.log('開始添加改寫按鈕');
    if (!window.shouldEnableFeatures() || document.getElementById('gpt-rewrite-button')) {
      console.log('不符合添加按鈕條件');
      return;
    }

    // 獲取textarea元素
    const textArea = document.querySelector('textarea[name="content"]');
    if (!textArea) {
      console.log('找不到文本區域');
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
        const settings = await window.GlobalSettings.loadSettings();
        if (!settings.apiKeys['gemini-1.5-flash'] && !settings.apiKeys['openai']) {
          alert('請先設置 API 金');
          return;
        }
        if (!settings.instruction.trim()) {
          alert('請設置改寫要求');
          return;
        }
        
        this.disabled = true;
        await window.TextProcessor.rewriteText();
        console.log('改寫完成');
      } catch (error) {
        console.error('改寫錯誤:', error);
        alert('改寫錯誤: ' + error.message);
      } finally {
        this.disabled = false;
      }
    });

    buttonContainer.appendChild(rewriteButton);
    this._setupTextArea(textArea, buttonContainer);
    console.log('改寫按鈕添加成功');
  },

  /** 設置文本區域樣式和事件 */
  _setupTextArea(textArea, buttonContainer) {
    const parent = textArea.parentElement;
    parent.appendChild(buttonContainer);

    window.UndoManager.initInputHistory(textArea);
    textArea.addEventListener('dblclick', (e) => this._handleDoubleClick(e, textArea));

    // 監聽URL變化
    let lastUrl = location.href;
    new MutationObserver(() => {
      const url = location.href;
      if (url !== lastUrl) {
        lastUrl = url;
        console.log('URL變化檢測到，重新檢查是否需要初始化UI');
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
      if (!settings?.apiKeys?.['gemini-1.5-flash'] && !settings?.apiKeys?.['openai']) {
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
      console.error('自動改寫錯誤:', error);
      alert('自動改寫錯誤: ' + error.message);
    } finally {
      if (typeof rewriteTask !== 'undefined') {
        this._activeRewrites.delete(rewriteTask);
      }
    }
  },

  /** 初始化股票代碼功能 */
  initializeStockCodeFeature() {
    console.log('開始初始化股票代碼功能');
    
    if (!window.shouldEnableFeatures()) {
      console.log('不符合啟用功能條件，移除股票代碼功能');
      this.removeStockCodeFeature();
      return;
    }
    
    const elements = {
      textarea: document.querySelector('textarea[name="content"]'),
      input: document.querySelector('.MuiAutocomplete-input'),
      container: this._getOrCreateContainer()
    };

    console.log('找到的元素:', {
      hasTextarea: !!elements.textarea,
      hasInput: !!elements.input,
      hasContainer: !!elements.container
    });

    if (!elements.textarea || !elements.input) {
      console.log('找不到必要的文本區域或輸入框');
      return;
    }

    // 更新股票UI
    const updateUI = () => {
      console.log('開始更新股票UI');
      const { codes, matchedStocks } = this._getStockCodes(
        elements.textarea.value, 
        elements.input.value.trim()
      );
      console.log('找到的股票代碼:', codes);
      console.log('匹配的股票:', matchedStocks);
      this._updateStockButtons(codes, matchedStocks, elements);
      
      // 如果檢測到股票代碼且輸入框為空，自動填入第一個代碼
      if (codes.length > 0 && !elements.input.value.trim()) {
        this._fillStockCode(codes[0], elements.input);
      }
    };

    elements.textarea.addEventListener('input', updateUI);
    
    // 使用 MutationObserver 監視值的變化
    const observer = new MutationObserver((mutations) => {
      console.log('檢測到輸入框變化');
      mutations.forEach((mutation) => {
        if (mutation.type === 'attributes' && mutation.attributeName === 'value') {
          console.log('輸入框值變化，更新UI');
          updateUI();
        }
      });
    });
    
    observer.observe(elements.input, {
      attributes: true,
      attributeFilter: ['value']
    });

    console.log('執行初始UI更新');
    updateUI();
  },

  /** 填入股票代碼 */
  _fillStockCode(code, input) {
    console.log(`開始填入股票代碼: ${code}`);
    
    // 模擬點擊輸入框
    input.click();
    input.focus();
    
    // 設置值並觸發事件
    input.value = code;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    
    // 等待下拉選單出現並選擇
    setTimeout(() => {
      const option = document.querySelector('li[role="option"]');
      if (option) {
        option.click();
        console.log('選擇下拉選單選項');
      }
      
      // 移除焦點
      setTimeout(() => {
        input.blur();
        console.log('移除輸入框焦點');
        
        // 再次確認值已正確設置
        if (input.value !== code) {
          input.value = code;
          input.dispatchEvent(new Event('input', { bubbles: true }));
        }
      }, 100);
    }, 100);
  },

  /** 獲取或創建按鈕容器 */
  _getOrCreateContainer() {
    console.log('開始獲取或創建按鈕容器');
    let container = document.getElementById('stock-code-container');
    
    if (!container) {
      console.log('找不到現有容器，創建新容器');
      container = document.createElement('div');
      container.id = 'stock-code-container';
      
      const input = document.querySelector('#\\:r3\\:');
      if (input && input.parentElement) {
        console.log('找到輸入框父元素，插入容器');
        input.parentElement.appendChild(container);
      } else {
        console.log('找不到輸入框或其父元素');
      }
    } else {
      console.log('找到現有容器');
    }
    
    return container;
  },

  /** 從文本中提取股票代碼和名稱 */
  _getStockCodes(text, inputCode = '') {
    console.log('開始提取股票代碼，輸入代碼:', inputCode);
    
    if (!window.stockList) {
      console.log('未找到股票列表');
      return { codes: [], matchedStocks: new Map() };
    }
    console.log('股票列表長度:', window.stockList.length);

    const matchedStocks = new Map();
    const stockCounts = new Map();
    const first100Chars = text.substring(0, 100);
    console.log('前100字元:', first100Chars);
    
    // 收集匹配的股票
    let matchedCodes = window.stockList
      .filter(stock => {
        // 檢查是否為輸入的代碼
        if (stock.code === inputCode) {
          console.log(`找到完全匹配的股票代碼: ${stock.code} (${stock.name})`);
          matchedStocks.set(stock.code, stock.name);
          return true;
        }
        
        // 先把 -KY 和 * 去掉
        const baseStockName = stock.name.replace(/[*]|-KY$/g, '');
        const codePattern = `[（(]${stock.code}(?:[-\\s.]*(?:TW|TWO))?[）)]|_${stock.code}`;
        
        // 使用自定義pattern或基本名稱加上可選的KY
        const namePattern = stock.pattern || `${baseStockName}(?:[-\\s]*KY)?`;
        
        if (first100Chars.includes(stock.name) || 
            first100Chars.includes(baseStockName) || 
            first100Chars.match(new RegExp(codePattern))) {
          
          console.log(`檢查股票: ${stock.code} (${stock.name})`);
          
          const nameRegex = new RegExp(namePattern, 'g');
          const codeRegex = new RegExp(codePattern, 'g');
          
          const nameMatches = (text.match(nameRegex) || []).length;
          const codeMatches = (text.match(codeRegex) || []).length;
          
          if (nameMatches > 0 || codeMatches > 0) {
            console.log(`匹配成功 - 名稱匹配: ${nameMatches}次, 代碼匹配: ${codeMatches}次`);
            matchedStocks.set(stock.code, stock.name);
            stockCounts.set(stock.code, nameMatches + codeMatches);
            return true;
          }
        }
        
        return false;
      })
      .map(stock => stock.code);

    // 根據出現次數排序代碼
    matchedCodes = matchedCodes.sort((a, b) => 
      (stockCounts.get(b) || 0) - (stockCounts.get(a) || 0)
    );

    console.log('匹配結果:', {
      matchedCodes,
      stockCounts: Object.fromEntries(stockCounts),
      matchedStocksCount: matchedStocks.size
    });

    return { codes: matchedCodes, matchedStocks };
  },

  /** 更新股票代碼按鈕 */
  _updateStockButtons(codes, matchedStocks, elements) {
    elements.container.innerHTML = '';
    console.log('開始更新股票代碼按鈕，找到的代碼:', codes);
    
    // 將代碼分成匹配和未匹配兩組
    const matchedCodes = codes.filter(code => elements.input.value === code);
    const unmatchedCodes = codes.filter(code => elements.input.value !== code);
    
    // 添加匹配的按鈕
    matchedCodes.forEach(code => {
      const button = document.createElement('button');
      button.textContent = matchedStocks.has(code) ? `${matchedStocks.get(code)}${code}` : code;
      button.classList.add('stock-code-button', 'matched');
      button.onclick = () => this._fillStockCode(code, elements.input);
      elements.container.appendChild(button);
    });
    
    // 添加未匹配的按鈕
    unmatchedCodes.forEach(code => {
      const button = document.createElement('button');
      button.textContent = matchedStocks.has(code) ? `${matchedStocks.get(code)}${code}` : code;
      button.classList.add('stock-code-button');
      button.onclick = () => this._fillStockCode(code, elements.input);
      elements.container.appendChild(button);
    });
  },

  /** 移除股票代碼功能，在URL變化時調用 */
  removeStockCodeFeature() {
    const container = document.getElementById('stock-code-container');
    if (container) container.remove();
  },

  /** 移除改寫按鈕，在URL變化時調用 */
  removeRewriteButton() {
    const container = document.getElementById('gpt-button-container');
    if (container) {
      container.remove();
      console.log('改寫按鈕已移除');
    }
  },

  /** 初始化所有UI元素 */
  initializeAllUI() {
    if (!window.shouldEnableFeatures()) {
      console.log('不符合啟用功能條件，移除所有UI元素');
      this.removeAllUI();
      return;
    }
    
    console.log('初始化所有UI元素');
    this.addRewriteButton();
    this.initializeStockCodeFeature();
    window.ReplaceManager.initializeReplaceUI();
  },

  /** 移除所有UI元素 */
  removeAllUI() {
    console.log('移除所有UI元素');
    this.removeRewriteButton();
    this.removeStockCodeFeature();
    window.ReplaceManager.removeReplaceUI();
  }
};

window.UIManager = UIManager;
