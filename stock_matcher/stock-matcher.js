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

// 常數定義
const AI_CHECK_DEBOUNCE_DELAY = 1000; // AI檢查防抖延遲時間（毫秒）

// 輔助函數：獲取當前時間
const getCurrentTime = () => new Date().toLocaleTimeString('zh-TW', { 
  hour12: false,
  hour: '2-digit',
  minute: '2-digit', 
  second: '2-digit'
});

window.StockMatcher = {
  // 私有屬性
  _isInitialized: false,
  _container: null,
  _elements: null,
  _warningBox: null,
  _aiCheckDebounceTimer: null, // AI檢查防抖計時器

  /** 移除股票名稱後綴（-KY、-創、*） */
  _removeStockSuffixes(stockName) {
    return stockName.replace(/(-KY|-創|\*)$/, '');
  },

  /** 檢查股票名稱是否包含後綴（-KY、-創、*） */
  _hasStockSuffixes(stockName) {
    return /(-KY|-創|\*)$/.test(stockName);
  },

  /** 從設定載入股票清單 */
  async _loadStockListFromSettings() {
    try {
      const settings = await window.GlobalSettings.loadSettings();
      const stockListText = settings.stockList || '';
      window.stockListFromSettings = this._parseStockList(stockListText);
      window.console.log(`[StockMatcher][${getCurrentTime()}] 載入股票清單`, {
        原始文字長度: stockListText.length,
        解析出的股票數量: window.stockListFromSettings.length
      });
    } catch (error) {
      window.console.error(`[StockMatcher][${getCurrentTime()}] ❌ 載入股票清單失敗:`, error);
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
    window.console.log(`[StockMatcher][${getCurrentTime()}] 開始獲取或創建按鈕容器`);
    let container = document.getElementById('stock-code-container');
    
    if (!container) {
      window.console.log(`[StockMatcher][${getCurrentTime()}] 找不到現有容器，創建新容器`);
      container = document.createElement('div');
      container.id = 'stock-code-container';
      
      const input = document.querySelector('input[aria-autocomplete="list"][class*="MuiAutocomplete-input"]');
      if (input && input.parentElement) {
        window.console.log(`[StockMatcher][${getCurrentTime()}] 找到輸入框父元素，插入容器`);
        input.parentElement.appendChild(container);
      } else {
        window.console.log(`[StockMatcher][${getCurrentTime()}] ❌ 找不到輸入框或其父元素`);
      }
    } else {
      window.console.log(`[StockMatcher][${getCurrentTime()}] 找到現有容器`);
    }
    
    return container;
  },

  /** 從文本中提取股票代碼和名稱 */
  _getStockCodes(text, inputCode = '') {
    const first100Chars = text.substring(0, 100);
    
    if (!window.stockListFromSettings) {
        window.console.warn(`[StockMatcher][${getCurrentTime()}] ⚠️ 股票代碼提取 - 未找到股票列表`);
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
        const baseStockName = this._removeStockSuffixes(stock.name);
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
        const hasBaseNameIfSuffix = this._hasStockSuffixes(stock.name) && 
            first100Chars.toLowerCase().includes(this._removeStockSuffixes(stock.name).toLowerCase());
        
        return hasCode || hasName || hasBaseNameIfSuffix;
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

        // 如果有後綴（-KY、-創、*），也檢查完整名稱在全文中的出現次數（不區分大小寫）
        let fullNameCount = 0;
        if (this._hasStockSuffixes(stock.name)) {
            const lowerText = text.toLowerCase();
            const lowerFullName = stock.name.toLowerCase();
            fullNameCount = lowerText.split(lowerFullName).length - 1;
            count += fullNameCount;
        }
        
        if (count > 0) {
            matchedStocks.set(stock.code, stock.name);
            stockCounts.set(stock.code, count);
            window.console.log(`[StockMatcher][${getCurrentTime()}] 股票出現次數 - ${stock.name}(${stock.code}): ${count}次`, {
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
        window.console.log(`[StockMatcher][${getCurrentTime()}] 排序結果 - ${sortedResults.map(r => `${r.名稱}(${r.代碼}): ${r.出現次數}次`).join(', ')}`);
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
        window.console.warn(`[StockMatcher][${getCurrentTime()}] ⚠️ 代號檢查 - 未設定模型或指令`);
        return null;
      }

      // 構建檢查提示
      const prompt = `${instruction}\n\n股票名與代號：${stockName}(${stockCode})\n\n文本內容：\n${textContent.substring(0, 1000)}`;
      
      // 調用AI API
      const response = await this._callAIAPI(model, prompt, settings.apiKeys);
      
      window.console.log(`[StockMatcher][${getCurrentTime()}] 代號檢查 - AI 回應分析:`, {
        回應內容: response,
        回應長度: response?.length || 0,
        包含不匹配: response?.includes('不匹配') || false,
        包含有錯: response?.includes('有錯') || false,
        包含不符: response?.includes('不符') || false,
        包含不同: response?.includes('不同') || false
      });
      
      if (response && (response.includes('不匹配') || response.includes('有錯') || response.includes('不符') || response.includes('不同'))) {
        window.console.log(`[StockMatcher][${getCurrentTime()}] 🚨 代號檢查 - 檢測到問題，返回警告`);
        return {
          isValid: false,
          message: '代號可能有錯',
          detail: response
        };
      }
      
      window.console.log(`[StockMatcher][${getCurrentTime()}] ✅ 代號檢查 - 檢查通過`);
      return {
        isValid: true,
        message: '代號檢查通過',
        detail: response
      };
    } catch (error) {
      window.console.error(`[StockMatcher][${getCurrentTime()}] ❌ 代號檢查 - AI檢查失敗:`, error);
      return null;
    }
  },

  /** 調用AI API */
  async _callAIAPI(model, prompt, apiKeys) {
          window.console.log(`[StockMatcher][${getCurrentTime()}] 調用AI API - 開始 API 請求`, {
      模型: model,
      提示詞長度: prompt.length
    });
    
    // 使用 GlobalSettings 的金鑰名稱獲取方法
    const apiKeyName = window.GlobalSettings.getApiKeyNameForModel(model);
    if (!apiKeyName) {
      window.console.error(`[StockMatcher][${getCurrentTime()}] ❌ 調用AI API - 模型不支援:`, model);
      throw new Error(`模型 ${model} 不支援或無法找到對應的 API 金鑰類型`);
    }
    
    const apiKey = apiKeys[apiKeyName];
    if (!apiKey) {
      window.console.error(`[StockMatcher][${getCurrentTime()}] ❌ 調用AI API - API 金鑰未設定:`, {
        金鑰名稱: apiKeyName,
        模型: model,
        可用金鑰: Object.keys(apiKeys)
      });
      throw new Error(`未設定 ${apiKeyName} 的 API 金鑰（模型: ${model}）`);
    }

    window.console.log(`[StockMatcher][${getCurrentTime()}] ✅ 調用AI API - API 金鑰驗證通過:`, {
      金鑰名稱: apiKeyName,
      金鑰長度: apiKey.length
    });

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
      window.console.log(`[StockMatcher][${getCurrentTime()}] 調用AI API - 準備 Gemini API 請求:`, {
        模型端點: model === 'gemini' ? 'gemini-pro' : model,
        請求體大小: body.length
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
      window.console.log(`[StockMatcher][${getCurrentTime()}] 調用AI API - 準備 OpenAI API 請求:`, {
        模型: model,
        請求體大小: body.length
      });
    }

    window.console.log(`[StockMatcher][${getCurrentTime()}] 調用AI API - 發送 HTTP 請求中...`);
    const response = await fetch(url, {
      method: 'POST',
      headers: headers,
      body: body
    });

    window.console.log(`[StockMatcher][${getCurrentTime()}] 調用AI API - 收到 HTTP 響應:`, {
      狀態碼: response.status,
      狀態文字: response.statusText,
      是否成功: response.ok
    });

    if (!response.ok) {
      window.console.error(`[StockMatcher][${getCurrentTime()}] ❌ 調用AI API - API 請求失敗:`, {
        狀態碼: response.status,
        響應頭: Object.fromEntries(response.headers.entries())
      });
      throw new Error(`API請求失敗: ${response.status}`);
    }

    const data = await response.json();
    window.console.log(`[StockMatcher][${getCurrentTime()}] 調用AI API - 解析 JSON 響應成功`);
    
    let result;
    if (model.startsWith('gemini') || model === 'gemini') {
      result = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
      window.console.log(`[StockMatcher][${getCurrentTime()}] 調用AI API - Gemini 響應解析:`, {
        候選數量: data.candidates?.length || 0,
        回答長度: result.length
      });
    } else {
      result = data.choices?.[0]?.message?.content || '';
      window.console.log(`[StockMatcher][${getCurrentTime()}] 調用AI API - OpenAI 響應解析:`, {
        選擇數量: data.choices?.length || 0,
        回答長度: result.length
      });
    }
    
    window.console.log(`[StockMatcher][${getCurrentTime()}] ✅ 調用AI API - API 請求完成，回答:`, result.substring(0, 100) + (result.length > 100 ? '...' : ''));
    return result;
  },

  /** AI代號檢查防抖方法 */
  _debouncedAICheck(stockCode, stockName, textContent) {
    // 清除之前的計時器
    if (this._aiCheckDebounceTimer) {
      clearTimeout(this._aiCheckDebounceTimer);
      window.console.log(`[StockMatcher][${getCurrentTime()}] 防抖 - 清除之前的AI檢查計時器`);
    }
    
    // 設置新的計時器
    this._aiCheckDebounceTimer = setTimeout(async () => {
      try {
        window.console.log(`[StockMatcher][${getCurrentTime()}] 防抖 - 開始延遲執行的代號檢查:`, { stockCode, stockName });
        const checkResult = await this._checkStockCodeWithAI(stockCode, stockName, textContent);
        window.console.log(`[StockMatcher][${getCurrentTime()}] 防抖 - 代號檢查完整結果:`, checkResult);
        
        if (checkResult && !checkResult.isValid) {
          window.console.log(`[StockMatcher][${getCurrentTime()}] 🚨 防抖 - 檢查結果為無效，準備顯示警告`);
          this._toggleWarningBox(true, checkResult.message);
          window.console.log(`[StockMatcher][${getCurrentTime()}] 代號檢查`, checkResult.message, '詳細:', checkResult.detail);
        } else if (checkResult && checkResult.isValid) {
          window.console.log(`[StockMatcher][${getCurrentTime()}] ✅ 防抖 - 檢查結果為有效，隱藏警告`);
          this._toggleWarningBox(false);
        } else {
          window.console.log(`[StockMatcher][${getCurrentTime()}] 防抖 - 檢查結果為 null，可能是設定問題`);
        }
              } catch (error) {
        window.console.error(`[StockMatcher][${getCurrentTime()}] ❌ 防抖 - 代號檢查執行失敗:`, error);
      } finally {
        this._aiCheckDebounceTimer = null;
      }
    }, AI_CHECK_DEBOUNCE_DELAY);
    
    window.console.log(`[StockMatcher][${getCurrentTime()}] 防抖 - 設置AI檢查計時器，將在 ${AI_CHECK_DEBOUNCE_DELAY}ms 後執行`);
  },

  /** 顯示或隱藏警告提示框 */
  _toggleWarningBox(show, message = '') {
    if (show) {
      if (!this._warningBox) {
        this._warningBox = document.createElement('div');
        this._warningBox.id = 'stock-warning-box';
        this._warningBox.style.cssText = `
          background-color: #ff4444;
          border: 1px solid #cc0000;
          border-radius: 4px;
          padding: 6px 12px 6px 8px;
          color: white;
          font-size: 14px;
          font-weight: 500;
          display: flex;
          align-items: center;
          gap: 2px;
          height: 32px;
          box-sizing: border-box;
        `;
        
        const icon = document.createElement('span');
        icon.innerHTML = '⚠️';
        icon.style.fontSize = '16px';
        
        const text = document.createElement('span');
        text.id = 'warning-text';
        text.textContent = message;
        
        this._warningBox.appendChild(icon);
        this._warningBox.appendChild(text);
        
        window.console.log(`[StockMatcher][${getCurrentTime()}] 🚨 警告框 - 創建並顯示警告提示框:`, message);
      } else {
        const textElement = document.getElementById('warning-text');
        if (textElement) {
          textElement.textContent = message;
          window.console.log(`[StockMatcher][${getCurrentTime()}] 🚨 警告框 - 更新警告提示框內容:`, message);
        } else {
          window.console.error(`[StockMatcher][${getCurrentTime()}] ❌ 警告框 - 找不到 warning-text 元素，重新創建警告框`);
          // 重新創建警告框
          this._warningBox = null;
          this._toggleWarningBox(true, message);
          return;
        }
      }
      
      // 插入到容器上方
      if (this._container && this._container.parentElement) {
        // 如果警告框不在 DOM 中，就插入它
        if (!this._warningBox.parentElement) {
          this._container.parentElement.insertBefore(this._warningBox, this._container);
          window.console.log(`[StockMatcher][${getCurrentTime()}] 警告框 - 警告提示框已插入到頁面`);
        } else {
          window.console.log(`[StockMatcher][${getCurrentTime()}] 警告框 - 警告提示框已存在於頁面中`);
        }
              } else {
        window.console.error(`[StockMatcher][${getCurrentTime()}] ❌ 警告框 - 無法插入警告框，容器或父元素不存在:`, {
          容器存在: !!this._container,
          父元素存在: !!this._container?.parentElement
        });
      }
    } else {
              if (this._warningBox && this._warningBox.parentElement) {
        this._warningBox.parentElement.removeChild(this._warningBox);
        window.console.log(`[StockMatcher][${getCurrentTime()}] 警告框 - 移除警告提示框`);
      }
    }
  },

  /** 更新股票代碼按鈕 */
  _updateStockButtons(codes, matchedStocks, elements, shouldTriggerAICheck = true) {
    elements.container.innerHTML = '';
    window.console.log(`[StockMatcher][${getCurrentTime()}] 開始更新股票代碼按鈕，找到的代碼:`, codes);
    window.console.log(`[StockMatcher][${getCurrentTime()}] 當前輸入框的值:`, elements.input.value);
    window.console.log(`[StockMatcher][${getCurrentTime()}] 是否觸發AI檢查:`, shouldTriggerAICheck);
    
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
            window.console.log(`[StockMatcher][${getCurrentTime()}] 點擊股票按鈕: ${code}`);
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
                
                // 使用防抖方法執行AI檢查
                window.console.log(`[StockMatcher][${getCurrentTime()}] 按鈕點擊 - 準備開始防抖代號檢查:`, { code, stockName });
                self._debouncedAICheck(code, stockName, textContent);
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
    
    // 對當前選中的股票代碼進行AI檢查（只有在shouldTriggerAICheck為true時才觸發）
    if (shouldTriggerAICheck && elements.input.value && matchedStocks.has(elements.input.value)) {
      const stockCode = elements.input.value;
      const stockName = matchedStocks.get(stockCode);
      const textContent = elements.textarea.value;
      
      // 使用防抖方法執行AI檢查，避免頻繁API調用
      window.console.log(`[StockMatcher][${getCurrentTime()}] 股票按鈕更新 - 準備開始防抖代號檢查:`, { stockCode, stockName });
      self._debouncedAICheck(stockCode, stockName, textContent);
    } else if (!shouldTriggerAICheck && elements.input.value && matchedStocks.has(elements.input.value)) {
      window.console.log(`[StockMatcher][${getCurrentTime()}] 股票按鈕更新 - 跳過AI檢查（設定更新觸發）:`, { stockCode: elements.input.value });
    }
  },

  /** 初始化股票代碼功能 - 公開接口 */
  initializeStockCodeFeature(isFromSettingsUpdate = false) {
    window.console.log(`[StockMatcher][${getCurrentTime()}] 🚀 開始初始化股票代碼功能`, {
      來自設定更新: isFromSettingsUpdate
    });
    
    if (!window.shouldEnableFeatures()) {
      window.console.log(`[StockMatcher][${getCurrentTime()}] ⚠️ 不符合啟用功能條件，移除股票代碼功能`);
      this.removeStockCodeFeature();
      return;
    }
    
    const elements = {
      textarea: document.querySelector('textarea[name="content"]'),
      input: document.querySelector('input[aria-autocomplete="list"][class*="MuiAutocomplete-input"]'),
      container: this._getOrCreateContainer()
    };

    window.console.log(`[StockMatcher][${getCurrentTime()}] 找到的元素:`, {
      hasTextarea: !!elements.textarea,
      hasInput: !!elements.input,
      hasContainer: !!elements.container
    });

    if (!elements.textarea || !elements.input) {
      window.console.log(`[StockMatcher][${getCurrentTime()}] ❌ 找不到必要的文本區域或輸入框`);
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
          const baseName = this._removeStockSuffixes(stock.name);
          if (baseName !== stock.name) {
            nameMap.set(baseName, stock);
          }
        });
      }

      // 更新股票UI的函數
      const updateUI = (source = 'textarea', shouldTriggerAICheck = true) => {
        const textValue = elements.textarea.value;
        const inputValue = elements.input.value.trim();
        
        if (textValue.length < 4 && !inputValue) return;
        
        // 根據觸發來源決定是否進行AI檢查
        // 文本框更新時不觸發AI檢查，只有代號框更新時才觸發
        const shouldTriggerAI = source === 'input' ? shouldTriggerAICheck : false;
        
        // 使用 _getStockCodes 來處理文本
        const { codes, matchedStocks, stockCounts } = this._getStockCodes(textValue, inputValue);
        
        // 記錄找到的股票代碼數量
        window.console.log(`[StockMatcher][${getCurrentTime()}] 找到的股票代碼`, { 
            總數量: codes.length,
            代碼列表: codes,
            來源: source,
            當前輸入值: inputValue,
            是否觸發AI檢查: shouldTriggerAI
        });
        
        // 自動填入最常出現的股票代碼（僅在文本區域觸發時）
        if (source === 'textarea' && codes.length > 0 && !inputValue) {
            window.console.log(`[StockMatcher][${getCurrentTime()}] 符合自動填入條件`, {
                來源是否為文本區域: source === 'textarea',
                是否有找到代碼: codes.length > 0,
                輸入框是否為空: !inputValue
            });
            
            if (codes[0]) { // codes 已經是按出現次數排序的了
                const mostFrequentCode = codes[0];
                window.console.log(`[StockMatcher][${getCurrentTime()}] 選擇最常出現的股票代碼`, {
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
        
        this._updateStockButtons(codes, matchedStocks, elements, shouldTriggerAI);
      };

      // 監聽文本區域變化
      elements.textarea.addEventListener('input', () => {
        requestAnimationFrame(() => updateUI('textarea'));
      });

      // 監聽股票代號輸入框變化
      elements.input.addEventListener('input', () => {
        requestAnimationFrame(() => updateUI('input'));
      });
      
      // 初始更新（根據來源決定是否觸發AI檢查）
      requestAnimationFrame(() => updateUI('textarea', !isFromSettingsUpdate));
    });

    this._isInitialized = true;
    this._elements = elements;
    this._container = elements.container; // 確保 this._container 被正確設置
    
    window.console.log(`[StockMatcher][${getCurrentTime()}] 初始化 - 股票代碼功能初始化完成:`, {
      容器已設置: !!this._container,
      容器ID: this._container?.id,
      父元素存在: !!this._container?.parentElement
    });
  },

  /** 移除股票代碼功能 - 公開接口 */
  removeStockCodeFeature() {
    // 清理防抖計時器
    if (this._aiCheckDebounceTimer) {
      clearTimeout(this._aiCheckDebounceTimer);
      this._aiCheckDebounceTimer = null;
      window.console.log(`[StockMatcher][${getCurrentTime()}] 移除功能 - 清理AI檢查防抖計時器`);
    }
    
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
      // 如果已經初始化，觸發UI更新（不觸發AI檢查，避免設定更新時頻繁調用API）
      if (this._elements) {
        const { codes, matchedStocks } = this._getStockCodes(
          this._elements.textarea.value,
          this._elements.input.value.trim()
        );
        this._updateStockButtons(codes, matchedStocks, this._elements, false);
      }
    }
  }
}; 