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
      input: document.querySelector('input[aria-autocomplete="list"][class*="MuiAutocomplete-input"]'),
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

    // 預處理股票列表，建立快速查找表
    const stockMap = new Map();
    const nameMap = new Map();
    
    if (window.stockList) {
      window.stockList.forEach(stock => {
        stockMap.set(stock.code, stock);
        nameMap.set(stock.name, stock);
        const baseName = stock.name.replace(/-KY$/, '');
        if (baseName !== stock.name) {
          nameMap.set(baseName, stock);
        }
      });
    }

    // 更新股票UI的函數
    const updateUI = (source = 'textarea') => {
      const textValue = elements.textarea.value;
      const inputValue = elements.input.value.trim();
      
      if (textValue.length < 4 && !inputValue) return;
      
      const first100Chars = textValue.substring(0, 100);
      const matchedStocks = new Map();
      const stockCounts = new Map();
      
      // 根據來源使用不同的匹配規則
      if (source === 'textarea') {
        // 文本區域的匹配規則（保持原有的嚴格匹配）
        const codePattern = /[（(](\d{4,})(?:[-\s.]*(?:TW|TWO))?[）)]|_(\d{4,})/g;
        let match;
        while ((match = codePattern.exec(first100Chars)) !== null) {
          const code = match[1] || match[2];
          if (stockMap.has(code)) {
            const stock = stockMap.get(code);
            matchedStocks.set(code, stock.name);
            stockCounts.set(code, (stockCounts.get(code) || 0) + 1);
          }
        }
      } else {
        // 輸入框的匹配規則（寬鬆匹配）
        const inputCode = inputValue.match(/\d{4,}/)?.[0];
        if (inputCode && stockMap.has(inputCode)) {
          const stock = stockMap.get(inputCode);
          matchedStocks.set(inputCode, stock.name);
          stockCounts.set(inputCode, 1);
        }
      }
      
      // 檢查股票名稱（兩種來源都檢查）
      nameMap.forEach((stock, name) => {
        // 使用 pattern 屬性進行匹配
        const pattern = stock.pattern ? 
          new RegExp(stock.pattern) : 
          new RegExp(name.replace(/[*]/g, '\\*')); // 轉義特殊字符 *

        if (pattern.test(first100Chars)) {
          matchedStocks.set(stock.code, stock.name);
          stockCounts.set(stock.code, (stockCounts.get(stock.code) || 0) + 1);
        }
      });

      const codes = Array.from(matchedStocks.keys());
      
      // 自動填入最常出現的股票代碼（僅在文本區域觸發時）
      if (source === 'textarea' && codes.length > 0 && !inputValue) {
        const [mostFrequentCode] = Array.from(stockCounts.entries())
          .sort((a, b) => b[1] - a[1]);
          
        if (mostFrequentCode) {
          elements.input.value = mostFrequentCode[0];
          elements.input.dispatchEvent(new Event('input', { bubbles: true }));
          elements.input.focus();
          setTimeout(() => elements.input.blur(), 10);
        }
      }
      
      this._updateStockButtons(codes, matchedStocks, elements);
    };

    // 監聽文本區域變化
    elements.textarea.addEventListener('input', () => {
      requestAnimationFrame(() => updateUI('textarea'));
    });

    // 監聽股票代號輸入框變化
    elements.input.addEventListener('input', () => {
      requestAnimationFrame(() => updateUI('input'));
    });
    
    // 初始更新
    requestAnimationFrame(() => updateUI('textarea'));
  },

  /** 獲取或創建按鈕容器 */
  _getOrCreateContainer() {
    console.log('開始獲取或創建按鈕容器');
    let container = document.getElementById('stock-code-container');
    
    if (!container) {
      console.log('找不到現有容器，創建新容器');
      container = document.createElement('div');
      container.id = 'stock-code-container';
      
      const input = document.querySelector('input[aria-autocomplete="list"][class*="MuiAutocomplete-input"]');
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
      return { codes: [], matchedStocks: new Map(), stockCounts: new Map() };
    }

    const matchedStocks = new Map();
    const stockCounts = new Map();
    
    // 先用簡單的字串搜尋快速篩選可能的股票
    const potentialStocks = window.stockList.filter(stock => {
      // 如果是輸入的代碼，直接加入
      if (stock.code === inputCode) {
        matchedStocks.set(stock.code, stock.name);
        stockCounts.set(stock.code, 1);
        return true;
      }
      
      // 快速檢查股票代號和名稱是否出現在文本中
      return text.includes(stock.code) || 
             text.includes(stock.name) || 
             text.includes(stock.name.replace(/-KY$/, ''));
    });

    // 只對可能匹配的股票進行詳細檢查
    const matchedCodes = potentialStocks
      .filter(stock => {
        if (stock.code === inputCode) return true;
        
        // 計算出現次數
        let count = 0;
        
        // 檢查代碼
        const codeMatches = text.match(
          new RegExp(`[（(]${stock.code}(?:[-\\s.]*(?:TW|TWO))?[）)]|_${stock.code}`, 'g')
        );
        if (codeMatches) count += codeMatches.length;
        
        // 檢查名稱
        const baseStockName = stock.name.replace(/[*]|-KY$/g, '');
        const namePattern = stock.pattern || `${baseStockName}(?:[-\\s]*KY)?`;
        const nameMatches = text.match(new RegExp(namePattern, 'g'));
        if (nameMatches) count += nameMatches.length;
        
        if (count > 0) {
          matchedStocks.set(stock.code, stock.name);
          stockCounts.set(stock.code, count);
          return true;
        }
        
        return false;
      })
      .map(stock => stock.code);

    return { codes: matchedCodes, matchedStocks, stockCounts };
  },

  /** 更新股票代碼按鈕 */
  _updateStockButtons(codes, matchedStocks, elements) {
    elements.container.innerHTML = '';
    console.log('開始更新股票代碼按鈕，找到的代碼:', codes);
    console.log('當前輸入框的值:', elements.input.value);
    
    const createButton = (code) => {
        const button = document.createElement('button');
        const isMatched = code === elements.input.value;
        button.textContent = matchedStocks.has(code) ? `${matchedStocks.get(code)}${code}` : code;
        button.classList.add('stock-code-button');
        button.dataset.stockCode = code;
        
        if (isMatched) button.classList.add('matched');
        
        button.onclick = () => {
            console.log(`點擊股票按鈕: ${code}`);
            elements.input.value = code;
            elements.input.dispatchEvent(new Event('input', { bubbles: true }));
            
            // 先移除所有按鈕
            const allButtons = Array.from(elements.container.children);
            elements.container.innerHTML = '';
            
            // 更新按鈕狀態並重新排序
            allButtons.sort((a, b) => {
                const aCode = a.dataset.stockCode;
                const bCode = b.dataset.stockCode;
                const isAMatched = aCode === code;
                const isBMatched = bCode === code;
                if (isAMatched && !isBMatched) return -1;
                if (!isAMatched && isBMatched) return 1;
                return 0;
            }).forEach(btn => {
                const btnCode = btn.dataset.stockCode;
                if (btnCode === code) {
                    btn.classList.add('matched');
                } else {
                    btn.classList.remove('matched');
                }
                elements.container.appendChild(btn);
            });
            
            elements.input.focus();
            setTimeout(() => elements.input.blur(), 10);
        };
        
        return button;
    };
    
    // 初始排序並創建按鈕
    codes.sort((a, b) => {
        const isAMatched = a === elements.input.value;
        const isBMatched = b === elements.input.value;
        if (isAMatched && !isBMatched) return -1;
        if (!isAMatched && isBMatched) return 1;
        return 0;
    }).forEach(code => {
        elements.container.appendChild(createButton(code));
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
