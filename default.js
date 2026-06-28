/**
 * default.js - 預設設定配置模組 + 通用工具函數
 * 功能：提供擴充程式首次安裝時的預設設定值 + 統一日誌格式工具
 * 職責：
 * - 模型預設配置：各種改寫、翻譯、生成模式的預設模型
 * - 指令模板預設：改寫、翻譯、摘要等功能的預設指令模板
 * - 自動改寫規則：雙擊改寫的預設匹配模式（正規表達式）
 * - UI 狀態預設：勾選框、開關等 UI 元素的預設狀態
 * - 年份更新模板：包含時間相關的智能替換規則
 * - 專業術語配置：翻譯功能的專業術語對照表
 * - 通用日誌工具：統一的 [FileName][Time] 格式日誌函數
 * 
 * 日誌分組調試技巧：
 * 可用縮排和樹狀符號模擬分組調試，例如：
 *   LogUtils.important(' ═══ 開始取得 OAuth Token ═══');
 *   LogUtils.log('  ├─ 發送取得 token 請求到 background');
 *   LogUtils.log('  ├─ 處理授權回應');
 *   LogUtils.important('  └─ 成功取得 token');
 * 
 * 注意：
 * - 僅在首次安裝且無用戶設定時應用
 * - 模型欄位預設為空，等待用戶設定
 * - 指令模板可直接使用，包含完整的專業配置
 * - 日誌工具可供所有檔案使用，確保格式統一
 */

// === 通用日誌工具函數 ===
// 統一的日誌格式工具，支援自動檔名檢測的 [FileName][Time] 格式
const LogUtils = {
  /** 是否將日誌同步注入頁面 top context（供 Chrome DevTools MCP 讀取，除錯時開啟） */
  pageLogEnabled: true,

  /**
   * 將日誌寫入 sessionStorage，供 Chrome DevTools MCP 的 evaluate_script 讀取
   * 使用 sessionStorage 而非 <script> 注入，避免觸發頁面 CSP 限制
   * Content Script 與頁面共享同一個 sessionStorage（同源策略允許）
   * @param {string} level - 日誌等級（log/error/warn）
   * @param {string} message - 已格式化的完整訊息
   */
  _logToPage(level, message) {
    try {
      if (!this.pageLogEnabled || typeof sessionStorage === 'undefined') return;
      const KEY = '__ai_ext_logs__';
      const existing = JSON.parse(sessionStorage.getItem(KEY) || '[]');
      existing.push({ level, message, t: Date.now() });
      if (existing.length > 300) existing.splice(0, existing.length - 300);
      sessionStorage.setItem(KEY, JSON.stringify(existing));
    } catch (e) {}
  },

  /**
   * 將 kebab-case 轉換為 PascalCase
   * @param {string} str - 要轉換的字串
   * @returns {string} PascalCase 格式的字串
   */
  _toPascalCase(str) {
    return str
      .split('-')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join('');
  },

  /**
   * 自動取得檔名（從呼叫堆疊中解析並轉換格式）
   * @returns {string} 檔案名稱（PascalCase 格式）
   */
  _getFileName() {
    try {
      const stack = new Error().stack;
      if (!stack) return 'Unknown';
      
      // 找到第三層調用（跳過 _getFileName 和 LogUtils.method）
      const lines = stack.split('\n');
      for (let i = 3; i < lines.length; i++) {
        const line = lines[i];
        // 匹配檔案路徑，支援不同格式
        const match = line.match(/(?:at|@).*?([^\/\\]+)\.js/);
        if (match && match[1]) {
          const fileName = match[1];
          // 如果檔名包含連字符，轉換為 PascalCase
          if (fileName.includes('-')) {
            return this._toPascalCase(fileName);
          }
          // 否則保持原樣但首字母大寫
          return fileName.charAt(0).toUpperCase() + fileName.slice(1);
        }
      }
      return 'Unknown';
    } catch (error) {
      return 'Unknown';
    }
  },

  /**
   * 取得24小時制時間格式
   * @returns {string} HH:MM:SS 格式的時間
   */
  _get24HourTime() {
    const now = new Date();
    return now.toLocaleTimeString('zh-TW', { 
      hour12: false,
      hour: '2-digit',
      minute: '2-digit', 
      second: '2-digit'
    });
  },

  /**
   * 統一日誌格式 - 一般訊息（自動檔名）
   * @param {string} message - 訊息內容
   * @param {any} data - 可選的額外資料
   */
  log(message, data = null) {
    const fileName = this._getFileName();
    const currentTime = this._get24HourTime();
    if (data !== null) {
      console.log(`%c[AI助手]%c[${fileName}][${currentTime}] ${message}`, 'color:rgb(179, 0, 255); font-weight: bold;', 'color: inherit;', data);
    } else {
      console.log(`%c[AI助手]%c[${fileName}][${currentTime}] ${message}`, 'color:rgb(179, 0, 255); font-weight: bold;', 'color: inherit;');
    }
    this._logToPage('log', `[${fileName}][${currentTime}] ${message}`);
  },

  /**
   * 統一日誌格式 - 重要訊息（自動檔名）
   * @param {string} message - 訊息內容（應包含emoji）
   * @param {any} data - 可選的額外資料
   */
  important(message, data = null) {
    const fileName = this._getFileName();
    const currentTime = this._get24HourTime();
    if (data !== null) {
      console.log(`%c[AI助手]%c[${fileName}][${currentTime}] ${message}`, 'color:rgb(179, 0, 255); font-weight: bold;', 'color: inherit;', data);
    } else {
      console.log(`%c[AI助手]%c[${fileName}][${currentTime}] ${message}`, 'color:rgb(179, 0, 255); font-weight: bold;', 'color: inherit;');
    }
    this._logToPage('log', `[${fileName}][${currentTime}] ${message}`);
  },

  /**
   * 統一日誌格式 - 錯誤訊息（自動檔名）
   * @param {string} message - 錯誤訊息
   * @param {any} error - 可選的錯誤物件
   */
  error(message, error = null) {
    const fileName = this._getFileName();
    const currentTime = this._get24HourTime();
    if (error !== null) {
      console.error(`%c[AI助手]%c[${fileName}][${currentTime}] ❌ ${message}`, 'color:rgb(179, 0, 255); font-weight: bold;', 'color: inherit;', error);
    } else {
      console.error(`%c[AI助手]%c[${fileName}][${currentTime}] ❌ ${message}`, 'color:rgb(179, 0, 255); font-weight: bold;', 'color: inherit;');
    }
    this._logToPage('error', `[${fileName}][${currentTime}] ❌ ${message}`);
  },

  /**
   * 統一日誌格式 - 警告訊息（自動檔名）
   * @param {string} message - 警告訊息
   * @param {any} data - 可選的額外資料
   */
  warn(message, data = null) {
    const fileName = this._getFileName();
    const currentTime = this._get24HourTime();
    if (data !== null) {
      console.warn(`%c[AI助手]%c[${fileName}][${currentTime}] ⚠️ ${message}`, 'color:rgb(176, 0, 252); font-weight: bold;', 'color: inherit;', data);
    } else {
      console.warn(`%c[AI助手]%c[${fileName}][${currentTime}] ⚠️ ${message}`, 'color:rgb(179, 0, 255); font-weight: bold;', 'color: inherit;');
    }
    this._logToPage('warn', `[${fileName}][${currentTime}] ⚠️ ${message}`);
  }
};
const DefaultSettings = {
  // 模型相關預設值
  model: '',                      // 空字串，等待使用者設定
  fullRewriteModel: '',          // 空字串，等待使用者設定
  shortRewriteModel: '',         // 空字串，等待使用者設定
  autoRewriteModel: '',          // 空字串，等待使用者設定
  rephraseModel: '',             // 空字串，等待使用者設定
  translateModel: '',            // 空字串，等待使用者設定
  reflectModel: '',              // 空字串，等待使用者設定
  optimizeModel: '',             // 空字串，等待使用者設定
  generateModel: '',             // 空字串，等待使用者設定
  reflect1Model: '',             // 空字串，等待使用者設定
  generationOptimize_1_Model: '', // 空字串，等待使用者設定
  reflect2Model: '',             // 空字串，等待使用者設定
  generationOptimize_2_Model: '', // 空字串，等待使用者設定
  reflect3Model: '',             // 空字串，等待使用者設定
  generationOptimize_3_Model: '', // 空字串，等待使用者設定
  summaryModel: '',              // 空字串，等待使用者設定

  // 勾選框預設狀態
  confirmModel: false,      // 確認模型：預設不勾選
  confirmContent: false,    // 確認內容：預設不勾選
  removeHash: true,        // 刪除##：預設勾選
  removeStar: true,        // 刪除**：預設勾選

  // 全文改寫預設設定
  fullRewriteInstruction: 
`按以下要求替換文字：
若為"前二季"改為"2024年前二季"。
若為"前三季"改為"2024年前三季"。
若為"前四季"改為"2024年前四季"。
若為"第一季"改為"2024年第一季"。
若為"第二季"改為"2024年第二季"。
若為"第三季"改為"2024年第三季"。
若為"第四季"改為"2024年第四季"。
若為"首季"改為"2024年第一季"。
若為"第1季"改為"2024年第一季"。
若為"第2季"改為"2024年第二季"。
若為"第3季"改為"2024年第三季"。
若為"第4季"改為"2024年第四季"。
若為"Q1"改為"2024年第一季"。
若為"Q2"改為"2024年第二季"。
若為"Q3"改為"2024年第三季"。
若為"Q4"改為"2024年第四季"。
若為"1月"改為"2024年1月"
若為"2月"改為"2024年2月"
若為"3月"改為"2024年3月"
若為"4月"改為"2024年4月"
若為"5月"改為"2024年5月"
若為"6月"改為"2024年6月"
若為"7月"改為"2024年7月"
若為"8月"改為"2024年8月"
若為"9月"改為"2024年9月"
若為"10月"改為"2024年10月"。
若為"11月"改為"2024年11月"。
若為"12月"改為"2024年12月"。
若為"上半年"改為"2024年上半年"，以此類推。
若為"下半年"改為"2024年下半年"，以此類推。
若為"全年"改為"2024年全年"。
若為"年底"改為"2024年年底"。
若為去年改為2023年。
若為今年改為2024年。
若為明年改為2025年。
若為後年改為2026年。
若為今明年改為2024.2025年。
若為明後年改為2025.2026年。

不要替換的文字：
上一季、上季、前一季。

直接輸出結果，不要有其他廢話，只需改寫，也不要自己新增符號。避免輸出『改寫後：』。
即使標題與內文一樣，也不要省略標題。
文末若有2個句點改為1個。`,

  // 重述預設設定
  rephraseInstruction:
`請優化這段文字的語意結構，保持原意但使其更清晰、更通順。

要求：
1. 保持原文的核心意思不變
2. 優化句子結構，使邏輯更清晰
3. 適當調整用詞，提升可讀性
4. 避免改變專業術語和數據
5. 直接輸出結果，不要有其他廢話

避免輸出『改寫後：』或『重述結果：』等前綴。`,

  // 10字內改寫預設設定
  shortRewriteInstruction:
`按以下要求替換文字：
若為"前二季"改為"2024年前二季"。
若為"前三季"改為"2024年前三季"。
若為"前四季"改為"2024年前四季"。
若為"首季"改為"2024年第一季"。
若為"第一季"改為"2024年第一季"。
若為"第二季"改為"2024年第二季"。
若為"第三季"改為"2024年第三季"。
若為"第四季"改為"2024年第四季"。
若為"第1季"改為"2024年第一季"。
若為"第2季"改為"2024年第二季"。
若為"第3季"改為"2024年第三季"。
若為"第4季"改為"2024年第四季"。
若為"Q1"改為"2024年第一季"。
若為"Q2"改為"2024年第二季"。
若為"Q3"改為"2024年第三季"。
若為"Q4"改為"2024年第四季"。
若為"1月"改為"2024年1月"
若為"2月"改為"2024年2月"
若為"3月"改為"2024年3月"
若為"4月"改為"2024年4月"
若為"5月"改為"2024年5月"
若為"6月"改為"2024年6月"
若為"7月"改為"2024年7月"
若為"8月"改為"2024年8月"
若為"9月"改為"2024年9月"
若為"10月"改為"2024年10月"。
若為"11月"改為"2024年11月"。
若為"12月"改為"2024年12月"。
若為"上半年"改為"2024年上半年"，以此類推。
若為"下半年"改為"2024年下半年"，以此類推。
若為"全年"改為"2024年全年"。
若為"年底"改為"2024年年底"。
若為去年改為2023年。
若為今年改為2024年。
若為明年改為2025年。
若為後年改為2026年。
若為今明年改為2024.2025年。
若為明後年改為2025.2026年。

直接輸出結果，不要有其他廢話，只需改寫，也不要換行，也不要自己新增符號。避免輸出『改寫後：』。`,

  // 雙擊改寫預設設定
  autoRewritePatterns: 
`/(去|今|明|後)年\s*第([一二三四]|[1-4])季/
/(去|今|明|後)年\s*Q[1-4]/
/Q\s*[1-4]/

/(?:前|第)?\s*[一二三四1-4]\s*季/

/(去|今|明|後)年\s*(十[一二]?|[一二三四五六七八九])月/
/(去|今|明|後)年\s*(1[0-2]|[1-9])\s*月/

/(十[一二]?|[一二三四五六七八九])月/
/(1[0-2]|[1-9])\s*月/
/(1[0-2]|[1-9])\s*M|M\s*(1[0-2]|[1-9])/

/今\s*明\s*年/
/今、\s*明\s*年/
/今、\s*明\s*兩\s*年/
/明\s*後\s*年/
/明、\s*後\s*年/
/明、\s*後\s*兩\s*年/

/[上下]\s*半\s*年/
/(全|去|今|明|後)\s*年/
/年\s*底/`,

  // 翻譯預設設定
  translateInstruction: 
`Role and Goal: '翻譯專家'，會將收到的內容翻譯成繁體中文。

要求：若已是繁體中文，則不需任何處理直接輸出原文。
要求：有TOEFL托福滿分120的能力，能準確理解原文的意思並翻譯。
要求：句子更通順容易理解。

要求：確保原文內容沒有遺失，例如標題、或Speaker...等。
要求：某些技術性名詞或專有名詞，翻成繁體中文不好懂的，請維持英文。
要求：不要有任何簡體中文，若有請翻譯成繁體中文。
要求：如果開頭為人名，請不要在前面加『講者』。

不用翻譯的詞：
token。
Cooler Master。
對於年與(季|上下半年|月)的表達法，如4Q23，23Q4、24Q1、1Q24、2H24、25M8、11M25，這類不需翻譯。。

翻譯要求：
Speaker翻譯為講者。
盈利翻譯為盈餘。
對於high teens、mid-twenties、low-single digits這類用詞，請翻譯為高十位數、中二十位數、低個位數。
million(m)翻謴為100萬。
billion(b)翻譯10億。
yoy翻譯為年增或年減。
flat yoy翻譯為年持平。
qoq正數翻譯為季增。
qoq負數翻譯為季增。
flat qoq翻譯為季持平。
mom正數翻譯為月增。
mom負數翻譯為月減。
flat mom翻譯為月持平。
revenue翻譯為營收。
sales翻譯為營收。
CPU sockets翻譯為CPU插槽。
Fabless翻譯為IC設計公司。

公司名中英文對照：
EMC=台光電
ITEQ=聯茂
TUC=台燿
Yageo=國巨
GCE=金像電
Parade=譜瑞-KY
Auras=雙鴻

# 輸出格式要求
- 僅輸出譯文結果。
- 使用全形『：』作為冒號。
- 每個段落之間保留空行。
- 不要使用markdown。
- 不要標示標題及粗體。`,

  // 關鍵要點總結預設設定
  summaryInstruction: 
`請將我給你的文章，從文章中取出5句話，每句都代表全篇的關鍵，每句都不超過15個字。
請使用原句，盡量不要修改，前後不用加標點符號。`,

  // 生成功能預設設定
  generateInstruction: '',      // 初始生成指令
  reflect1Instruction: '',      // 反思一指令
  generationOptimize_1_Instruction: '', // 生成優化一指令
  reflect2Instruction: '',      // 反思二指令
  generationOptimize_2_Instruction: '', // 生成優化二指令
  reflect3Instruction: '',      // 反思三指令
  generationOptimize_3_Instruction: '', // 生成優化三指令
  backgroundKnowledge: '',       // 背景知識

  // 股票清單預設設定
  stockList: '1101,台泥',

  // 中英對照表預設設定
  zhEnMapping: '1101,台泥',
};

/**
 * 文本區域檢測工具
 * 支援多種頁面的 textarea 元素檢測
 */
const TextAreaDetector = {
  /**
   * 檢測並返回當前頁面的主要文本區域元素
   * @returns {HTMLTextAreaElement|null} 找到的 textarea 元素
   */
  getTextArea: function() {
    // 1. 原有的 research-reports 頁面
    let textArea = document.querySelector('textarea[name="content"]');
    
    if (!textArea) {
      // 2. ai/assistants 頁面的 Material-UI textarea 元素
      textArea = document.querySelector('textarea.MuiInputBase-input.MuiOutlinedInput-input.MuiInputBase-inputMultiline');
    }
    
    return textArea;
  },

  /**
   * 等待文本區域元素出現
   * @param {number} timeout - 超時時間（毫秒）
   * @returns {Promise<HTMLTextAreaElement>} Promise 返回找到的元素
   */
  waitForTextArea: function(timeout = 5000) {
    return new Promise((resolve, reject) => {
      const startTime = Date.now();
      
      const check = () => {
        const textArea = this.getTextArea();
        if (textArea) {
          resolve(textArea);
          return;
        }
        
        if (Date.now() - startTime > timeout) {
          reject(new Error('找不到文本區域元素：超時'));
          return;
        }
        
        setTimeout(check, 100);
      };
      
      check();
    });
  }
};

// === 共用 URL 變化監聽（單一真相）===
// 意圖：原本 content.js / ui-manager.js / stock-analyzer.js / quick-copy.js 各自開一個「全 document subtree
//       MutationObserver」只為輪詢 location.href —— 每次 DOM 變動都觸發 4 個觀察者；ui-manager 更在每次
//       _setupTextArea 都新建一個永不斷開的觀察者，編輯器重掛就洩漏一個（越點越多越慢）。收斂成這「一個」共用觀察者。
// gotcha：content script 在 isolated world，無法 patch 主世界 router 的 history.pushState，故仍以 DOM 變動輪詢
//        location.href 跨世界偵測 SPA 路由；popstate/hashchange 補上前進後退與 hash 導航。
const SharedUrlWatcher = (() => {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return { subscribe() { return () => {}; }, check() {} };
  }
  const subscribers = new Set();
  let lastUrl = location.href;
  const notify = () => {
    const url = location.href;
    if (url === lastUrl) return; // 早退：絕大多數 DOM 變動不伴隨 URL 變化，成本僅一次字串比對
    const prev = lastUrl;
    lastUrl = url;
    subscribers.forEach(cb => {
      try { cb(url, prev); } catch (e) { LogUtils.error('SharedUrlWatcher 回呼錯誤', e); }
    });
  };
  // MutationObserver 回呼本身已按 microtask 批次合併，每批只比對一次 location.href
  new MutationObserver(notify).observe(document, { subtree: true, childList: true });
  window.addEventListener('popstate', notify);
  window.addEventListener('hashchange', notify);
  return {
    /** 訂閱 URL 變化，回傳取消訂閱函式。cb(newUrl, prevUrl) */
    subscribe(cb) { if (typeof cb === 'function') subscribers.add(cb); return () => subscribers.delete(cb); },
    /** 保險：外部可主動觸發一次比對 */
    check: notify
  };
})();

// 打字更新排程器（單一真相：四個 overlay 模組共用同一排程策略）
// 意圖：input 事件要更新 overlay（高亮／替換預覽／diff 泡泡／股票）。兩種模式：
//   • enabled=false（即時，預設）：rAF 合流，每幀最多一次，overlay 與打字同步、零延遲。
//     使用者要的就是即時——「延遲＝lag，不退讓」。故即時要快得靠各模組做成增量（只重算改變的部分），
//     而非靠延後（防抖）。
//   • enabled=true（防抖）：停頓 WAIT 後才重建，連打不重建。打字當下順但 overlay 落後游標。
//     此模式為備援/實驗（A/B 比較用），預設關閉。
const SharedTypingScheduler = {
  enabled: false,  // 預設即時（rAF）；要實驗防抖才設 true
  WAIT: 120,
  MAX_WAIT: 1500,
  /** 建立排程器；回傳函式綁到 input/compositionend。依 enabled 於呼叫時切換即時/防抖（可執行期 A/B） */
  create(fn, wait = SharedTypingScheduler.WAIT, maxWait = SharedTypingScheduler.MAX_WAIT) {
    let timer = null, firstPendingAt = 0, rafPending = false;
    return function scheduled() {
      if (!SharedTypingScheduler.enabled) {
        // 即時模式：rAF 合流，同幀多次 input 只跑一次，仍與打字同步
        if (rafPending) return;
        rafPending = true;
        requestAnimationFrame(() => { rafPending = false; fn(); });
        return;
      }
      // 防抖模式：尾隨 + MAX_WAIT 補償
      const now = performance.now();
      if (timer === null) firstPendingAt = now;
      else clearTimeout(timer);
      const delay = Math.max(0, Math.min(wait, maxWait - (now - firstPendingAt)));
      timer = setTimeout(() => { timer = null; fn(); }, delay);
    };
  }
};

// 將 DefaultSettings、LogUtils 和 TextAreaDetector 暴露到適當的全域物件
if (typeof window !== 'undefined') {
  window.SharedUrlWatcher = SharedUrlWatcher;
  window.SharedTypingScheduler = SharedTypingScheduler;
  // 瀏覽器環境
  window.DefaultSettings = DefaultSettings;
  window.LogUtils = LogUtils;
  window.TextAreaDetector = TextAreaDetector;
} else if (typeof self !== 'undefined') {
  // Service Worker 環境
  self.DefaultSettings = DefaultSettings;
  self.LogUtils = LogUtils;
  self.TextAreaDetector = TextAreaDetector;
} else if (typeof global !== 'undefined') {
  // Node.js 環境
  global.DefaultSettings = DefaultSettings;
  global.LogUtils = LogUtils;
  global.TextAreaDetector = TextAreaDetector;
}
