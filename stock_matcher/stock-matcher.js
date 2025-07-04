/**
 * stock_matcher/stock-matcher.js - 股票代號自動匹配模組
 * 功能：智能識別股票代碼並創建快速輸入按鈕
 * 職責：
 * - 股票清單解析：解析股票清單文字為物件陣列
 * - 智能匹配：從文本中智能提取股票代碼和名稱
 * - 自動填入：根據文本內容自動填入最常出現的股票代碼
 * - 按鈕管理：動態創建和管理股票代碼按鈕
 * - UI 容器管理：獲取或創建按鈕容器
 * - 事件處理：處理文本變化和按鈕點擊事件
 * 
 * 依賴：
 * - window.shouldEnableFeatures：功能啟用條件檢查
 * - window.GlobalSettings：全局設定管理
 * - window.stockListFromSettings：股票清單全局變數
 * 
 * 重構說明：
 * - 從 ui-manager.js 中分離出來的股票功能模組（2025-01-08）
 * - 保持與原有代碼的完全兼容性
 * - 使用傳統 window.xxx 全域變數模式，符合專案架構
 */

window.StockMatcher = {
  // 私有屬性
  _isInitialized: false,
  _container: null,
  _elements: null,
  _warningBox: null,

  /** 從設定載入股票清單 */
  async _loadStockListFromSettings() {
    try {
      const settings = await window.GlobalSettings.loadSettings();
      const stockListText = settings.stockList || '';
      window.stockListFromSettings = this._parseStockList(stockListText);
      window.console.log('載入股票清單', {
        原始文字長度: stockListText.length,
        解析出的股票數量: window.stockListFromSettings.length
      });
    } catch (error) {
      window.console.error('載入股票清單失敗:', error);
      window.stockListFromSettings = [];
    }
  },

  /** 解析股票清單文字為股票物件陣列 */
  _parseStockList(stockListText) {
    if (!stockListText || typeof stockListText !== 'string') {
      return [];
    }

    const stocks = [];
    const lines = stockListText.split('\n');

    for (const line of lines) {
      const trimmedLine = line.trim();
      if (!trimmedLine) continue;

      // 支援格式：代碼,公司名稱 或 代碼,公司名稱,匹配模式
      const parts = trimmedLine.split(',').map(part => part.trim());
      
      if (parts.length >= 2) {
        const stock = {
          code: parts[0],
          name: parts[1]
        };
        
        // 如果有第三個部分，作為匹配模式
        if (parts.length >= 3 && parts[2]) {
          stock.pattern = parts[2];
        }
        
        stocks.push(stock);
      }
    }

    return stocks;
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
    
    if (!window.stockListFromSettings) {
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
    const potentialStocks = window.stockListFromSettings.filter(stock => {
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

  /** AI代號檢查功能 */
  async _checkStockCodeWithAI(stockCode, stockName, textContent) {
    try {
      // 獲取代號檢查的設定
      const settings = await window.GlobalSettings.loadSettings();
      const model = settings.codeCheckModel;
      const instruction = settings.codeCheckInstruction;
      
      if (!model || !instruction) {
        window.console.warn('[代號檢查] 未設定模型或指令');
        return null;
      }

      // 構建檢查提示
      const prompt = `${instruction}\n\n股票資訊：${stockName}(${stockCode})\n\n文本內容：\n${textContent.substring(0, 1000)}`;
      
      // 調用AI API
      const response = await this._callAIAPI(model, prompt, settings.apiKeys);
      
      if (response && response.includes('不匹配') || response.includes('錯誤') || response.includes('不符') || response.includes('不同')) {
        return {
          isValid: false,
          message: '股票代號可能有錯',
          detail: response
        };
      }
      
      return {
        isValid: true,
        message: '股票代號檢查通過',
        detail: response
      };
    } catch (error) {
      window.console.error('[代號檢查] AI檢查失敗:', error);
      return null;
    }
  },

  /** 調用AI API */
  async _callAIAPI(model, prompt, apiKeys) {
    const apiKey = apiKeys[model];
    if (!apiKey) {
      throw new Error(`未設定 ${model} 的 API 金鑰`);
    }

    let url, headers, body;
    
    if (model.startsWith('gemini') || model === 'gemini') {
      // Gemini API
      url = `https://generativelanguage.googleapis.com/v1beta/models/${model === 'gemini' ? 'gemini-pro' : model}:generateContent?key=${apiKey}`;
      headers = {
        'Content-Type': 'application/json'
      };
      body = JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }]
      });
    } else {
      // OpenAI API
      url = 'https://api.openai.com/v1/chat/completions';
      headers = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      };
      body = JSON.stringify({
        model: model,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.1
      });
    }

    const response = await fetch(url, {
      method: 'POST',
      headers: headers,
      body: body
    });

    if (!response.ok) {
      throw new Error(`API請求失敗: ${response.status}`);
    }

    const data = await response.json();
    
    if (model.startsWith('gemini') || model === 'gemini') {
      return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    } else {
      return data.choices?.[0]?.message?.content || '';
    }
  },

  /** 顯示或隱藏警告提示框 */
  _toggleWarningBox(show, message = '') {
    if (show) {
      if (!this._warningBox) {
        this._warningBox = document.createElement('div');
        this._warningBox.id = 'stock-warning-box';
        this._warningBox.style.cssText = `
          background-color: #fff3cd;
          border: 1px solid #ffeaa7;
          border-radius: 4px;
          padding: 8px 12px;
          margin-bottom: 8px;
          color: #856404;
          font-size: 14px;
          display: flex;
          align-items: center;
          gap: 8px;
        `;
        
        const icon = document.createElement('span');
        icon.innerHTML = '⚠️';
        icon.style.fontSize = '16px';
        
        const text = document.createElement('span');
        text.id = 'warning-text';
        text.textContent = message;
        
        this._warningBox.appendChild(icon);
        this._warningBox.appendChild(text);
      } else {
        document.getElementById('warning-text').textContent = message;
      }
      
      // 插入到容器上方
      if (this._container && this._container.parentElement && !document.getElementById('stock-warning-box')) {
        this._container.parentElement.insertBefore(this._warningBox, this._container);
      }
    } else {
      if (this._warningBox && this._warningBox.parentElement) {
        this._warningBox.parentElement.removeChild(this._warningBox);
      }
    }
  },

  /** 更新股票代碼按鈕 */
  _updateStockButtons(codes, matchedStocks, elements) {
    elements.container.innerHTML = '';
    window.console.log('開始更新股票代碼按鈕，找到的代碼:', codes);
    window.console.log('當前輸入框的值:', elements.input.value);
    
    // 先隱藏警告提示框
    this._toggleWarningBox(false);
    
    // 保存this引用，供內部函數使用
    const self = this;
    
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
            
            // 對新選中的股票代碼進行AI檢查
            if (matchedStocks.has(code)) {
                const stockName = matchedStocks.get(code);
                const textContent = elements.textarea.value;
                
                // 先隱藏之前的警告
                self._toggleWarningBox(false);
                
                // 異步執行AI檢查
                setTimeout(async () => {
                    try {
                        const checkResult = await self._checkStockCodeWithAI(code, stockName, textContent);
                        if (checkResult && !checkResult.isValid) {
                            self._toggleWarningBox(true, checkResult.message);
                            window.console.log('[代號檢查]', checkResult.message, '詳細:', checkResult.detail);
                        }
                    } catch (error) {
                        window.console.error('[代號檢查] 執行失敗:', error);
                    }
                }, 100);
            }
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
    
    // 對當前選中的股票代碼進行AI檢查
    if (elements.input.value && matchedStocks.has(elements.input.value)) {
      const stockCode = elements.input.value;
      const stockName = matchedStocks.get(stockCode);
      const textContent = elements.textarea.value;
      
      // 異步執行AI檢查，避免阻塞UI
      setTimeout(async () => {
        try {
          const checkResult = await self._checkStockCodeWithAI(stockCode, stockName, textContent);
          if (checkResult && !checkResult.isValid) {
            self._toggleWarningBox(true, checkResult.message);
            window.console.log('[代號檢查]', checkResult.message, '詳細:', checkResult.detail);
          }
        } catch (error) {
          window.console.error('[代號檢查] 執行失敗:', error);
        }
      }, 100);
    }
  },

  /** 初始化股票代碼功能 - 公開接口 */
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

    // 載入股票清單設定
    this._loadStockListFromSettings().then(() => {
      // 預處理股票列表，建立快速查找表
      const stockMap = new Map();
      const nameMap = new Map();
      
      if (window.stockListFromSettings && window.stockListFromSettings.length > 0) {
        window.stockListFromSettings.forEach(stock => {
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
    });

    this._isInitialized = true;
    this._elements = elements;
  },

  /** 移除股票代碼功能 - 公開接口 */
  removeStockCodeFeature() {
    const container = document.getElementById('stock-code-container');
    if (container) container.remove();
    this._isInitialized = false;
    this._elements = null;
  },

  /** 檢查是否已初始化 - 公開接口 */
  isInitialized() {
    return this._isInitialized;
  },

  /** 更新股票清單並重新初始化 - 公開接口 */
  async updateStockList() {
    if (this._isInitialized) {
      await this._loadStockListFromSettings();
      // 如果已經初始化，觸發UI更新
      if (this._elements) {
        const { codes, matchedStocks } = this._getStockCodes(
          this._elements.textarea.value,
          this._elements.input.value.trim()
        );
        this._updateStockButtons(codes, matchedStocks, this._elements);
      }
    }
  }
}; 