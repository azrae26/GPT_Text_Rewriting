/* global GlobalSettings, TextProcessor, Notification, UndoManager */
/** UI管理模組 */
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
        const settings = await window.GlobalSettings.loadSettings();
        if (!settings.apiKeys['gemini-2.0-flash-exp'] && !settings.apiKeys['openai']) {
          alert('請先設置 API 金');
          return;
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
    this._setupTextArea(textArea, buttonContainer);
    window.console.log('改寫按鈕添加成功');
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
      if (!settings?.apiKeys?.['gemini-2.0-flash-exp'] && !settings?.apiKeys?.['openai']) {
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

  /** 初始化股票代碼功能 */
  initializeStockCodeFeature() {
    window.console.log('開始初始化股票代碼功能');
    
    if (!window.shouldEnableFeatures()) {
      window.console.log('不符合啟用功能條件，移除股票代碼功能');
      this.removeStockCodeFeature();
      return;
    }
    
    const elements = {
      textarea: document.querySelector('textarea[name="content"]'),
      input: document.querySelector('input[aria-autocomplete="list"][class*="MuiAutocomplete-input"]'),
      container: this._getOrCreateContainer()
    };

    window.console.log('找到的元素:', {
      hasTextarea: !!elements.textarea,
      hasInput: !!elements.input,
      hasContainer: !!elements.container
    });

    if (!elements.textarea || !elements.input) {
      window.console.log('找不到必要的文本區域或輸入框');
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
      
      // 使用 _getStockCodes 來處理文本
      const { codes, matchedStocks, stockCounts } = this._getStockCodes(textValue, inputValue);
      
      // 記錄找到的股票代碼數量
      window.console.log('找到的股票代碼', { 
          總數量: codes.length,
          代碼列表: codes,
          來源: source,
          當前輸入值: inputValue
      });
      
      // 自動填入最常出現的股票代碼（僅在文本區域觸發時）
      if (source === 'textarea' && codes.length > 0 && !inputValue) {
          window.console.log('符合自動填入條件', {
              來源是否為文本區域: source === 'textarea',
              是否有找到代碼: codes.length > 0,
              輸入框是否為空: !inputValue
          });
          
          if (codes[0]) { // codes 已經是按出現次數排序的了
              const mostFrequentCode = codes[0];
              window.console.log('選擇最常出現的股票代碼', {
                  代碼: mostFrequentCode,
                  出現次數: stockCounts.get(mostFrequentCode),
                  所有代碼出現次數: Object.fromEntries(stockCounts),
                  檢查範圍: '全文'
              });
              
              elements.input.value = mostFrequentCode;
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
    window.console.log('開始獲取或創建按鈕容器');
    let container = document.getElementById('stock-code-container');
    
    if (!container) {
      window.console.log('找不到現有容器，創建新容器');
      container = document.createElement('div');
      container.id = 'stock-code-container';
      
      const input = document.querySelector('input[aria-autocomplete="list"][class*="MuiAutocomplete-input"]');
      if (input && input.parentElement) {
        window.console.log('找到輸入框父元素，插入容器');
        input.parentElement.appendChild(container);
      } else {
        window.console.log('找不到輸入框或其父元素');
      }
    } else {
      window.console.log('找到現有容器');
    }
    
    return container;
  },

  /** 從文本中提取股票代碼和名稱 */
  _getStockCodes(text, inputCode = '') {
    const first100Chars = text.substring(0, 100);
    
    if (!window.stockList) {
        window.console.warn('[股票代碼提取] 未找到股票列表');
        return { codes: [], matchedStocks: new Map(), stockCounts: new Map() };
    }

    const matchedStocks = new Map();
    const stockCounts = new Map();
    
    // 輔助函數: 使用正則表達式或普通字串匹配文本
    const matchText = (stock, searchText, useGlobalFlag = false) => {
        if (stock.pattern) {
            // 修改：添加 'i' 標誌使匹配不區分大小寫
            const regex = new RegExp(stock.pattern, useGlobalFlag ? 'gi' : 'i');
            if (useGlobalFlag) {
                const matches = searchText.match(regex);
                return matches ? matches.length : 0;
            }
            return regex.test(searchText);
        }
        const baseStockName = stock.name.replace(/-KY$/, '');
        // 修改：轉換為小寫進行比較
        const lowerSearchText = searchText.toLowerCase();
        const lowerBaseName = baseStockName.toLowerCase();
        if (useGlobalFlag) {
            return lowerSearchText.split(lowerBaseName).length - 1;
        }
        return lowerSearchText.includes(lowerBaseName);
    };
    
    // 只在前100字中搜尋可能的股票
    const potentialStocks = window.stockList.filter(stock => {
        // 如果是輸入的代碼，直接加入（不區分大小寫）
        if (stock.code.toLowerCase() === inputCode.toLowerCase()) {
            matchedStocks.set(stock.code, stock.name);
            stockCounts.set(stock.code, 1);
            return true;
        }
        
        // 檢查代碼和名稱是否在前100字中出現（不區分大小寫）
        const hasCode = first100Chars.toLowerCase().includes(stock.code.toLowerCase());
        const hasName = matchText(stock, first100Chars);
        const hasBaseNameIfKY = stock.name.includes('-KY') && 
            first100Chars.toLowerCase().includes(stock.name.replace(/-KY$/, '').toLowerCase());
        
        return hasCode || hasName || hasBaseNameIfKY;
    });

    // 只對前100字中出現的股票計算全文出現次數
    potentialStocks.forEach(stock => {
        if (stock.code.toLowerCase() === inputCode.toLowerCase()) return;
        
        let count = 0;
        
        // 修改：代碼匹配改為不區分大小寫
        const codePattern = new RegExp(`[（(]${stock.code}(?:[-\\s.]*(?:TW|TWO))?[）)]|_${stock.code}`, 'gi');
        const codeMatches = text.match(codePattern);
        const codeCount = codeMatches?.length || 0;
        count += codeCount;
        
        // 檢查名稱在全文中的出現次數（不區分大小寫）
        const nameCount = matchText(stock, text, true);
        count += nameCount;

        // 如果有 -KY 後綴，也檢查完整名稱在全文中的出現次數（不區分大小寫）
        let fullNameCount = 0;
        if (stock.name.includes('-KY')) {
            const lowerText = text.toLowerCase();
            const lowerFullName = stock.name.toLowerCase();
            fullNameCount = lowerText.split(lowerFullName).length - 1;
            count += fullNameCount;
        }
        
        if (count > 0) {
            matchedStocks.set(stock.code, stock.name);
            stockCounts.set(stock.code, count);
            window.console.log('%c[股票出現次數]', 'color: #4CAF50', `${stock.name}(${stock.code}): ${count}次`, {
                代號: codeCount,
                中文名: nameCount + fullNameCount
            });
        }
    });

    const sortedResults = Array.from(stockCounts.entries())
        .sort((a, b) => b[1] - a[1])
        .map(([code, count]) => ({
            代碼: code,
            名稱: matchedStocks.get(code),
            出現次數: count
        }));

    if (sortedResults.length > 0) {
        window.console.log('%c[排序結果]', 'color: #9C27B0', 
            sortedResults.map(r => `${r.名稱}(${r.代碼}): ${r.出現次數}次`).join(', '));
    }

    return { 
        codes: sortedResults.map(item => item.代碼),
        matchedStocks, 
        stockCounts 
    };
  },

  /** 更新股票代碼按鈕 */
  _updateStockButtons(codes, matchedStocks, elements) {
    elements.container.innerHTML = '';
    window.console.log('開始更新股票代碼按鈕，找到的代碼:', codes);
    window.console.log('當前輸入框的值:', elements.input.value);
    
    const createButton = (code) => {
        const button = document.createElement('button');
        const isMatched = code === elements.input.value;
        button.textContent = matchedStocks.has(code) ? `${matchedStocks.get(code)}${code}` : code;
        button.classList.add('stock-code-button');
        button.dataset.stockCode = code;
        
        if (isMatched) button.classList.add('matched');
        
        button.onclick = () => {
            window.console.log(`點擊股票按鈕: ${code}`);
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
  },

  /** 移除所有UI元素 */
  removeAllUI() {
    window.console.log('移除所有UI元素');
    this.removeRewriteButton();
    this.removeStockCodeFeature();
    window.ReplaceManager.removeReplaceUI();
  }
};

window.UIManager = UIManager;
