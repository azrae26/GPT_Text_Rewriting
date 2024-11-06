/* global GlobalSettings, TextProcessor, Notification, UndoManager */
/** UI管理模組 */
const UIManager = {
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
    Object.assign(parent.style, {
      position: 'relative',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'flex-end'
    });
    parent.appendChild(buttonContainer);

    window.UndoManager.initInputHistory(textArea);
    textArea.addEventListener('dblclick', (e) => this._handleDoubleClick(e, textArea));
  },

  /** 處理雙擊改寫事件 */
  async _handleDoubleClick(event, textArea) {
    const selectedText = window.getSelection().toString().trim();
    if (!selectedText || selectedText.length > 10) return;

    // 獲取選擇的文本範圍
    const range = {
      start: Math.max(0, textArea.selectionStart - 4),
      end: Math.min(textArea.value.length, textArea.selectionEnd + 4)
    };
    
    // 獲取選擇的文本
    const text = textArea.value.substring(range.start, range.end);
    console.log('檢查文本:', text);

    // 檢查是否包含特殊文本
    const matchResult = window.TextProcessor.findSpecialText(text);
    if (!matchResult) return;

    try {
      const settings = await window.GlobalSettings.loadSettings();
      if (!settings.apiKeys['gemini-1.5-flash'] && !settings.apiKeys['openai']) return;

      // 檢查模型
      const model = settings.autoRewriteModel || window.GlobalSettings.model;

      // 改寫文本
      const rewrittenText = await window.TextProcessor.rewriteText(matchResult.matchedText, true);
      if (rewrittenText?.trim() !== matchResult.matchedText) {
        textArea.value = textArea.value.substring(0, range.start + matchResult.startIndex) +
                        rewrittenText +
                        textArea.value.substring(range.start + matchResult.endIndex);
        textArea.dispatchEvent(new Event('input', { bubbles: true }));
        
        await window.Notification.showNotification('自動改寫完成', false);
      }
    } catch (error) {
      console.error('自動改寫錯誤:', error);
      alert('自動改寫錯誤: ' + error.message);
    }
  },

  /** 初始化股票代碼功能 */
  initializeStockCodeFeature() {
    if (!window.shouldEnableFeatures()) {
      this.removeStockCodeFeature();
      return;
    }
    
    const elements = {
      textarea: document.querySelector('textarea[name="content"]'),
      input: document.querySelector('input[id=":r7:"]'),
      container: this._getOrCreateContainer()
    };

    if (!elements.textarea || !elements.input) return;

    const updateUI = () => {
      const { codes, matchedStocks } = this._getStockCodes(
        elements.textarea.value, 
        elements.input.value.trim()
      );
      this._updateStockButtons(codes, matchedStocks, elements);
    };

    elements.textarea.addEventListener('input', updateUI);
    elements.input.addEventListener('input', updateUI);

    updateUI();
  },

  /** 獲取或創建按鈕容器 */
  _getOrCreateContainer() {
    let container = document.getElementById('stock-code-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'stock-code-container';
      // 找到輸入框的父元素並插入容器
      const input = document.querySelector('input[id=":r7:"]');
      if (input && input.parentElement) {
        input.parentElement.appendChild(container);
      }
    }
    return container;
  },

  /** 從文本中提取股票代碼和名稱 */
  _getStockCodes(text, inputCode = '') {
    if (!window.stockList) return { codes: [], matchedStocks: new Map() };

    const matchedStocks = new Map();
    const stockCounts = new Map();
    const first100Chars = text.substring(0, 100);
    
    // 收集匹配的股票
    const matchedCodes = window.stockList
      .filter(stock => {
        // 檢查是否為輸入的代碼
        if (stock.code === inputCode) {
          matchedStocks.set(stock.code, stock.name);
          return true;
        }
        
        // 檢查前100字符是否包含股票資訊
        const baseStockName = stock.name.replace(/-KY$|\*$/g, '');
        const codePattern = `[（(]${stock.code}(?:[-\\s.]*(?:TW|TWO))?[）)]|_${stock.code}`;
        
        if (first100Chars.includes(stock.name) || 
            first100Chars.includes(baseStockName) || 
            first100Chars.match(new RegExp(codePattern))) {
          
          // 計算出現次數
          const nameMatches = (text.match(new RegExp(`${baseStockName}(?:-KY)?`, 'g')) || []).length;
          // 日誌：匹配的股票名稱及次數
          console.log(`股票：${stock.name}，基本名稱：${baseStockName}，匹配次數：${nameMatches}`);
          
          const codeMatches = (text.match(new RegExp(codePattern, 'g')) || []).length;
          
          matchedStocks.set(stock.code, stock.name);
          stockCounts.set(stock.code, nameMatches + codeMatches);
          return true;
        }
        return false;
      })

      .map(stock => stock.code)
      .sort((a, b) => {
        // 優先處理與輸入框匹配的代碼
        if (a === inputCode) return -1;
        if (b === inputCode) return 1;
        // 其次按出現次數排序
        return (stockCounts.get(b) || 0) - (stockCounts.get(a) || 0);
      });

    return { codes: matchedCodes, matchedStocks };
  },

  /** 更新股票代碼按鈕 */
  _updateStockButtons(codes, matchedStocks, elements) {
    elements.container.innerHTML = '';
    codes.forEach(code => {
      const button = document.createElement('button');
      button.textContent = matchedStocks.has(code) ? `${matchedStocks.get(code)}${code}` : code;
      button.classList.add('stock-code-button');
      // 檢查是否與輸入框代號匹配
      if (elements.input.value === code) {
        button.classList.add('matched');
      }
      
      button.onclick = () => {
        elements.input.value = code;
        elements.input.dispatchEvent(new Event('input', { bubbles: true }));
        elements.input.focus();
        setTimeout(() => elements.input.blur(), 10);
      };
      elements.container.appendChild(button);
    });

    // 如果找到股票代碼，且input值為空，則填入第一個股票代碼
    if (codes.length > 0 && !elements.input.value) {
      elements.input.value = codes[0];
      elements.input.dispatchEvent(new Event('input', { bubbles: true }));
      elements.input.focus();
      setTimeout(() => {
        elements.input.blur();
        console.log('股票代碼輸入框焦點已移除');
      }, 1);
    }
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
  }
};

window.UIManager = UIManager;
