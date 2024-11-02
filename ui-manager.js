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

    const textArea = document.querySelector('textarea[name="content"]');
    if (!textArea) {
      console.log('找不到文本區域');
      return;
    }

    const buttonContainer = document.createElement('div');
    buttonContainer.id = 'gpt-button-container';

    const rewriteButton = document.createElement('button');
    rewriteButton.id = 'gpt-rewrite-button';
    rewriteButton.textContent = '改寫';
    rewriteButton.addEventListener('click', async function() {
      try {
        await window.GlobalSettings.loadSettings();
        if (!window.GlobalSettings.apiKeys['gemini-1.5-flash'] && !window.GlobalSettings.apiKeys['openai']) {
          alert('請先設置 API 金鑰');
          return;
        }
        if (!window.GlobalSettings.instruction.trim()) {
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
    parent.style.position = 'relative';
    parent.style.display = 'flex';
    parent.style.flexDirection = 'column';
    parent.style.alignItems = 'flex-end';
    parent.appendChild(buttonContainer);

    window.UndoManager.initInputHistory(textArea);
    textArea.addEventListener('dblclick', (e) => this._handleDoubleClick(e, textArea));
  },

  /** 處理雙擊事件 */
  async _handleDoubleClick(event, textArea) {
    const selectedText = window.getSelection().toString().trim();
    if (!selectedText || selectedText.length > 10) return;

    const range = {
      start: Math.max(0, textArea.selectionStart - 4),
      end: Math.min(textArea.value.length, textArea.selectionEnd + 4)
    };
    const text = textArea.value.substring(range.start, range.end);
    console.log('檢查文本:', text);

    const matchResult = window.TextProcessor.findSpecialText(text);
    if (!matchResult) return;

    try {
      const settings = await window.GlobalSettings.loadSettings();
      if (!window.GlobalSettings.apiKeys['gemini-1.5-flash'] && !window.GlobalSettings.apiKeys['openai']) return;

      if (settings.confirmModel || settings.confirmContent) {
        const model = settings.autoRewriteModel || window.GlobalSettings.model;
        if (!confirm(`使用 ${model} 改寫:\n${matchResult.matchedText}`)) return;
      }

      const rewrittenText = await window.TextProcessor.rewriteText(matchResult.matchedText, true);
      if (rewrittenText?.trim() !== matchResult.matchedText) {
        textArea.value = textArea.value.substring(0, range.start + matchResult.startIndex) +
                        rewrittenText +
                        textArea.value.substring(range.start + matchResult.endIndex);
        textArea.dispatchEvent(new Event('input', { bubbles: true }));
        
        const undoButton = document.getElementById('gpt-undo-button');
        if (undoButton) undoButton.style.display = 'inline-block';
        
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
      const codes = this._getStockCodes(elements.textarea.value);
      this._updateStockButtons(codes, elements);
      this._updateContainerPosition(elements);
    };

    elements.textarea.addEventListener('input', updateUI);
    window.addEventListener('resize', () => this._updateContainerPosition(elements));
    window.addEventListener('scroll', () => this._updateContainerPosition(elements));
    updateUI();
  },

  /** 獲取或創建按鈕容器 */
  _getOrCreateContainer() {
    let container = document.getElementById('stock-code-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'stock-code-container';
      document.body.appendChild(container);
    }
    return container;
  },

  /** 從文本中提取股票代碼和名稱 */
  _getStockCodes(text) {
    const codes = new Set();
    const matchedStocks = new Map(); // 用於存儲匹配到的股票信息
    
    // 從前100個字符中尋找股票名稱
    const first10Chars = text.substring(0, 100);
    console.log('檢查前100個字:', first10Chars);

    if (window.stockList) {
      window.stockList.forEach(stock => {
        let stockName = stock.name;
        // 檢查是否包含-KY或*，如果有則創建一個不帶後綴的版本
        const baseNameKY = stockName.replace(/-KY$/, '');
        const baseNameStar = stockName.replace(/\*$/, '');
        
        // 檢查完整名稱或基礎名稱是否出現在前10個字符中
        if (first10Chars.includes(stockName) || 
            first10Chars.includes(baseNameKY) || 
            first10Chars.includes(baseNameStar)) {
          codes.add(stock.code);
          matchedStocks.set(stock.code, stock.name);
        }
      });
    }

    // 原有的代碼匹配邏輯
    const codeRegex = /[（(]([0-9]{4})(?:[-\s.]*(?:TW|TWO))?[）)]|[（(]([0-9]{4})[-\s.]+(?:TW|TWO)[）)]|_([0-9]{4})/g;
    const codeMatches = [...text.matchAll(codeRegex)];
    codeMatches.forEach(match => {
      const code = match[1] || match[2] || match[3];
      if (code) {
        codes.add(code);
        // 如果在stockList中找到對應的股票，添加名稱信息
        const stock = window.stockList?.find(s => s.code === code);
        if (stock) {
          matchedStocks.set(code, stock.name);
        }
      }
    });

    return { codes: Array.from(codes), matchedStocks };
  },

  /** 更新股票代碼按鈕 */
  _updateStockButtons(result, elements) {
    const { codes, matchedStocks } = result;
    elements.container.innerHTML = '';
    codes.forEach(code => {
      const button = document.createElement('button');
      const stockName = matchedStocks.get(code);
      button.textContent = stockName ? `${stockName}${code}` : code; // 顯示股票名稱和代碼
      button.classList.add('stock-code-button');
      button.onclick = () => {
        elements.input.value = code;
        elements.input.dispatchEvent(new Event('input', { bubbles: true }));
        elements.input.focus();
        setTimeout(() => elements.input.blur(), 10);
      };
      elements.container.appendChild(button);
    });

    if (codes.length > 0 && !elements.input.value) {
      elements.input.value = codes[0];
      elements.input.dispatchEvent(new Event('input', { bubbles: true }));
    }
  },

  /** 更新按鈕容器位置 */
  _updateContainerPosition(elements) {
    const rect = elements.input.getBoundingClientRect();
    elements.container.style.top = `${rect.top + window.scrollY - elements.container.offsetHeight + 9}px`;
    elements.container.style.left = `${rect.right + window.scrollX - elements.container.offsetWidth + 38}px`;
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
