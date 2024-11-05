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
      if ((settings.confirmModel || settings.confirmContent) && 
          !confirm(`使用 ${model} 改寫:\n${matchResult.matchedText}`)) {
        return;
      }

      // 改寫文本
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
    // 獲取textarea和input元素
    const elements = {
      textarea: document.querySelector('textarea[name="content"]'),
      input: document.querySelector('input[id=":r7:"]'),
      container: this._getOrCreateContainer()
    };

    // 檢查元素是否存在
    if (!elements.textarea || !elements.input) return;

    // 更新UI
    const updateUI = () => {
      // 傳入當前輸入框的值
      const { codes, matchedStocks } = this._getStockCodes(
        elements.textarea.value, 
        elements.input.value.trim()
      );
      this._updateStockButtons(codes, matchedStocks, elements);
      this._updateContainerPosition(elements);
    };

    // 添加事件監聽器
    elements.textarea.addEventListener('input', updateUI);
    elements.input.addEventListener('input', updateUI); // 監聽輸入框變化
    window.addEventListener('resize', () => this._updateContainerPosition(elements));
    window.addEventListener('scroll', () => this._updateContainerPosition(elements));

    // 初始化UI
    updateUI();
  },

  /** 獲取或創建按鈕容器 */
  _getOrCreateContainer() {
    return document.getElementById('stock-code-container') || (() => {
      const container = document.createElement('div');
      container.id = 'stock-code-container';
      document.body.appendChild(container);
      return container;
    })();
  },

  /** 從文本中提取股票代碼和名稱 */
  _getStockCodes(text, inputCode = '') {
    const codes = new Set();
    const matchedStocks = new Map();
    
    // 檢查輸入框代號是否在 stockList 中
    if (inputCode && window.stockList) {
      const stock = window.stockList.find(s => s.code === inputCode);
      if (stock) {
        codes.add(stock.code);
        matchedStocks.set(stock.code, stock.name);
      }
    }

    // 從前100個字符中尋找股票名稱
    const first10Chars = text.substring(0, 100);
    console.log('檢查前100個字:', first10Chars);

    // 檢查股票名稱匹配
    if (window.stockList) {
      window.stockList.forEach(stock => {
        const variants = [
          stock.name,
          stock.name.replace(/-KY$/, ''),
          stock.name.replace(/\*$/, '')
        ];
        
        // 檢查股票名稱匹配
        if (variants.some(name => first10Chars.includes(name))) {
          codes.add(stock.code);
          matchedStocks.set(stock.code, stock.name);
        }
      });
    }

    // 檢查股票代碼匹配
    const codeRegex = /[（(]([0-9]{4})(?:[-\s.]*(?:TW|TWO))?[）)]|[（(]([0-9]{4})[-\s.]+(?:TW|TWO)[）)]|_([0-9]{4})/g;
    [...text.matchAll(codeRegex)].forEach(match => {
      const code = match[1] || match[2] || match[3];
      if (code) {
        codes.add(code);
        const stock = window.stockList?.find(s => s.code === code);
        if (stock) matchedStocks.set(code, stock.name);
      }
    });

    return { codes: Array.from(codes), matchedStocks };
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
