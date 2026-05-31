/**
 * report_copy/report-copy.js - 研究報告「複製到新報告」功能
 *
 * 同一模組同時負責兩種頁面，依 URL / 訊息區分職責：
 * - edit 頁（…/research-reports/{id}/edit）：openDialog() 建立對話框、預填股票、
 *   收集勾選欄位與股票清單，送背景 copyReportToCreate。
 * - create 頁（…/research-reports/create）：監聽背景推送的 fillReportCopy，
 *   等欄位 render 後依勾選填入（只填不送出）。
 *
 * 依賴（皆在本檔之前載入）：
 * - window.StockMatcher：resolveStock / getStocksFromContent（股票解析）
 * - window.Notification：showNotification（提示）
 *
 * 欄位填入法移植自 F:\Cursor\Crawler\data-filler.js（已證實可用）：
 * - 一般 textarea（內容、簡介）：focus + value + input/change/blur 事件
 * - 日期（MUI DatePicker）：原生 value setter 繞過 React proxy
 * - autocomplete（來源、股票代號）：click 開下拉 → 設值 → 點第一個 li[role=option] → blur
 *
 * 重要流程日誌一律透過 swLog() 轉發到 service worker console（前綴 [ReportCopy ...]），
 * 以便集中追蹤。
 */

window.ReportCopy = (function () {
  const CREATE_URL = 'https://data.uanalyze.com.tw/research-reports/create';

  // 勾選欄位定義（key 對應 collectFields 的回傳鍵；股票代號為每分頁各自填入，不在此列）
  const FIELD_DEFS = [
    { key: 'date', label: '資料日期' },
    { key: 'source', label: '來源' },
    { key: 'info', label: '公司簡介' },
    { key: 'content', label: '報告內容' }
  ];

  /** 把重要步驟日誌轉發到 service worker console */
  function swLog(message, data) {
    try {
      chrome.runtime.sendMessage({
        action: 'reportCopyLog',
        message,
        data: data !== undefined ? data : '',
        timestamp: new Date().toLocaleTimeString('zh-TW', {
          hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit'
        })
      });
    } catch (e) { /* SW 可能尚未就緒，忽略 */ }
  }

  /** 依 label 文字定位欄位（讀取與 create 頁填入皆用，label 在兩頁皆穩定） */
  function findFieldByLabel(labelText) {
    const labels = [...document.querySelectorAll('.MuiFormControl-root label')];
    const label = labels.find(l => l.textContent.trim() === labelText);
    if (!label) return null;
    const fc = label.closest('.MuiFormControl-root');
    return fc ? fc.querySelector('input, textarea') : null;
  }

  /** 等待條件成立（輪詢），逾時回傳 false */
  function waitFor(predicate, timeout = 8000, interval = 100) {
    return new Promise(resolve => {
      const start = Date.now();
      (function check() {
        if (predicate()) return resolve(true);
        if (Date.now() - start > timeout) return resolve(false);
        setTimeout(check, interval);
      })();
    });
  }

  // ========================= edit 頁：收集 =========================

  /** 讀取本頁四個欄位的原始值 */
  function collectFields() {
    const contentEl = document.querySelector('textarea[name="content"]');
    const infoEl = document.querySelector('textarea[name="info"]');
    const dateEl = document.querySelector('input.MuiPickersOutlinedInput-input')
      || document.querySelector('input.MuiPickersInputBase-input');
    const sourceEl = findFieldByLabel('來源');
    return {
      date: dateEl ? dateEl.value : '',
      source: sourceEl ? sourceEl.value : '',
      info: infoEl ? infoEl.value : '',
      content: contentEl ? contentEl.value : ''
    };
  }

  /** 讀取本頁現有股票代號（本篇報告自身的股票，需從清單排除） */
  function getCurrentPageStockCode() {
    const el = findFieldByLabel('股票代號');
    return el ? el.value.trim() : '';
  }

  // ========================= 對話框 =========================

  let overlay = null;          // 遮罩 DOM
  let entries = [];            // [{code, name}]
  let listEl = null;           // 清單容器
  let hintEl = null;           // 「匹配不到」提示
  let confirmBtn = null;       // 開始複製按鈕

  function isOpen() { return !!overlay; }

  function closeDialog() {
    if (overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay);
    overlay = null;
    entries = [];
    listEl = null;
    hintEl = null;
    confirmBtn = null;
  }

  /** 重繪股票清單與按鈕計數 */
  function renderList() {
    if (!listEl) return;
    listEl.innerHTML = '';
    entries.forEach((entry, idx) => {
      const row = document.createElement('div');
      row.className = 'report-copy-row';

      const text = document.createElement('span');
      text.className = 'report-copy-row-text';
      text.textContent = `${entry.code}  ${entry.name}`;

      const remove = document.createElement('button');
      remove.className = 'report-copy-remove';
      remove.textContent = '✕';
      remove.title = '移除';
      remove.addEventListener('click', () => {
        entries.splice(idx, 1);
        renderList();
      });

      row.appendChild(text);
      row.appendChild(remove);
      listEl.appendChild(row);
    });
    if (confirmBtn) confirmBtn.textContent = `開始複製 (${entries.length})`;
  }

  /** 新增一筆（已去重：同代號不重複） */
  function addEntry(code, name) {
    if (!code) return false;
    if (entries.some(e => e.code === code)) return false;
    entries.push({ code, name });
    return true;
  }

  /** 建立對話框 DOM */
  function buildModal() {
    overlay = document.createElement('div');
    overlay.className = 'report-copy-overlay';
    overlay.addEventListener('click', (e) => { if (e.target === overlay) closeDialog(); });

    const modal = document.createElement('div');
    modal.className = 'report-copy-modal';

    const title = document.createElement('div');
    title.className = 'report-copy-title';
    title.textContent = '複製到新報告';
    modal.appendChild(title);

    const cols = document.createElement('div');
    cols.className = 'report-copy-cols';

    // 左欄：股票
    const leftCol = document.createElement('div');
    leftCol.className = 'report-copy-col report-copy-col-left';

    const leftLabel = document.createElement('div');
    leftLabel.className = 'report-copy-col-label';
    leftLabel.textContent = '股票（輸入代號或公司名後 Enter）';
    leftCol.appendChild(leftLabel);

    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'report-copy-input';
    input.placeholder = '輸入代號或公司名…';
    input.addEventListener('input', () => { if (hintEl) hintEl.textContent = ''; });
    input.addEventListener('keydown', async (e) => {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      const value = input.value.trim();
      if (!value) return;
      const result = await window.StockMatcher.resolveStock(value);
      if (result.code && result.name) {
        const added = addEntry(result.code, result.name);
        swLog('輸入框 Enter 解析', { 輸入: value, 解析: `${result.code} ${result.name}`, 新增: added });
        input.value = '';
        if (hintEl) hintEl.textContent = '';
        renderList();
      } else {
        swLog('輸入框 Enter 匹配不到', { 輸入: value });
        if (hintEl) hintEl.textContent = '匹配不到';
      }
    });
    leftCol.appendChild(input);

    hintEl = document.createElement('div');
    hintEl.className = 'report-copy-hint';
    leftCol.appendChild(hintEl);

    listEl = document.createElement('div');
    listEl.className = 'report-copy-list';
    leftCol.appendChild(listEl);

    cols.appendChild(leftCol);

    // 右欄：複製欄位勾選
    const rightCol = document.createElement('div');
    rightCol.className = 'report-copy-col report-copy-col-right';

    const rightLabel = document.createElement('div');
    rightLabel.className = 'report-copy-col-label';
    rightLabel.textContent = '複製欄位';
    rightCol.appendChild(rightLabel);

    FIELD_DEFS.forEach(def => {
      const wrap = document.createElement('label');
      wrap.className = 'report-copy-check';
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.checked = true;
      cb.dataset.key = def.key;
      const span = document.createElement('span');
      span.textContent = def.label;
      wrap.appendChild(cb);
      wrap.appendChild(span);
      rightCol.appendChild(wrap);
    });

    cols.appendChild(rightCol);
    modal.appendChild(cols);

    // footer
    const footer = document.createElement('div');
    footer.className = 'report-copy-footer';

    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'report-copy-btn report-copy-btn-cancel';
    cancelBtn.textContent = '取消';
    cancelBtn.addEventListener('click', closeDialog);

    confirmBtn = document.createElement('button');
    confirmBtn.className = 'report-copy-btn report-copy-btn-confirm';
    confirmBtn.textContent = '開始複製 (0)';
    confirmBtn.addEventListener('click', () => onConfirm(rightCol));

    footer.appendChild(cancelBtn);
    footer.appendChild(confirmBtn);
    modal.appendChild(footer);

    overlay.appendChild(modal);
    document.body.appendChild(overlay);
  }

  /** 按下「開始複製」：收集勾選欄位 + 股票清單，送背景 */
  function onConfirm(rightCol) {
    if (entries.length === 0) {
      if (window.Notification) window.Notification.showNotification('請至少加入一檔股票', false);
      return;
    }
    const selected = {};
    rightCol.querySelectorAll('input[type="checkbox"]').forEach(cb => {
      selected[cb.dataset.key] = cb.checked;
    });
    const fields = collectFields();
    const stockCodes = entries.map(e => e.code);

    swLog('按下開始複製', { 勾選: selected, 股票清單: stockCodes });

    chrome.runtime.sendMessage(
      { action: 'copyReportToCreate', fields, selected, stockCodes },
      (resp) => {
        if (chrome.runtime.lastError) {
          swLog('送背景失敗', chrome.runtime.lastError.message);
          if (window.Notification) window.Notification.showNotification('複製失敗：' + chrome.runtime.lastError.message, false);
          return;
        }
        if (resp && resp.success) {
          if (window.Notification) window.Notification.showNotification(`已開啟 ${stockCodes.length} 個新報告分頁`, false);
        } else {
          if (window.Notification) window.Notification.showNotification('複製失敗：' + (resp && resp.error || '未知錯誤'), false);
        }
      }
    );
    closeDialog();
  }

  /** 開啟對話框（edit 頁按鈕呼叫） */
  async function openDialog() {
    if (isOpen()) return;
    swLog('開啟複製對話框');
    buildModal();

    const fields = collectFields();
    const stocks = await window.StockMatcher.getStocksFromContent(fields.content);
    const currentCode = getCurrentPageStockCode();
    const kept = stocks.filter(s => s.code !== currentCode);
    swLog('預填股票', {
      內容匹配到: stocks.map(s => `${s.code} ${s.name}`),
      本頁代號已排除: currentCode || '(無)',
      實際加入: kept.map(s => s.code)
    });
    kept.forEach(s => addEntry(s.code, s.name));
    renderList();
  }

  // ========================= create 頁：填入 =========================

  /** 填一般 textarea（內容、公司簡介） */
  function fillTextarea(selector, text) {
    const el = document.querySelector(selector);
    if (!el) { swLog('未找到欄位', selector); return; }
    el.focus();
    el.value = text;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    el.dispatchEvent(new Event('blur', { bubbles: true }));
    swLog('填入 textarea', { selector, 目標長度: text.length, 實際長度: el.value.length });
  }

  /** 填日期（MUI DatePicker，需原生 setter 繞過 React proxy） */
  function fillDate(date) {
    const el = document.querySelector('input.MuiPickersOutlinedInput-input')
      || document.querySelector('input.MuiPickersInputBase-input');
    if (!el || !date) { swLog('日期未填', { 有欄位: !!el, 目標: date }); return; }
    el.focus();
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    setter.call(el, date);
    ['input', 'change', 'blur'].forEach(t => el.dispatchEvent(new Event(t, { bubbles: true })));
    el.blur();
    swLog('填入日期', { 目標: date, 實際: el.value });
  }

  /**
   * 填 autocomplete（來源、股票代號）：開下拉 → 設值 → 點第一個選項 → blur。
   * 因含 setTimeout，回傳 Promise 讓呼叫端可序列化（避免兩個下拉共用 li[role=option] 互搶）。
   */
  function fillAutocomplete(el, value, label) {
    return new Promise(resolve => {
      if (!el || !value) { swLog('autocomplete 未填', { label, 有欄位: !!el, 目標: value }); resolve(); return; }
      el.click();
      setTimeout(() => {
        el.value = value;
        el.dispatchEvent(new Event('input', { bubbles: true }));
        setTimeout(() => {
          const opt = document.querySelector('li[role="option"]');
          if (opt) opt.click();
          el.blur();
          swLog('填入 autocomplete', { label, 目標: value, 實際: el.value });
          setTimeout(resolve, 100);
        }, 150);
      }, 150);
    });
  }

  /** create 頁主流程：依勾選填入欄位 + 該分頁股票代號（不送出） */
  async function fillCreatePage(payload) {
    const { fields, selected, stockCode } = payload;
    swLog('create 頁收到 fillReportCopy', { stockCode, 勾選: selected });

    const ready = await waitFor(() => document.querySelector('textarea[name="content"]'));
    if (!ready) { swLog('create 頁欄位逾時未 render', { stockCode }); return; }
    swLog('create 頁欄位已 render，開始填入', { stockCode });

    if (selected.date) fillDate(fields.date);
    if (selected.content) fillTextarea('textarea[name="content"]', fields.content);
    if (selected.info) fillTextarea('textarea[name="info"]', fields.info);

    // autocomplete 序列化：先來源、commit 後再股票代號（同頁下拉共用 li[role=option]）
    if (selected.source && fields.source) {
      const srcEl = findFieldByLabel('來源')
        || document.querySelector('input[role="combobox"][aria-autocomplete="list"]:not(.MuiInputBase-inputAdornedEnd)');
      await fillAutocomplete(srcEl, fields.source, '來源');
    }
    if (stockCode) {
      const stkEl = findFieldByLabel('股票代號')
        || document.querySelector('input[role="combobox"][aria-autocomplete="list"].MuiInputBase-inputAdornedEnd');
      await fillAutocomplete(stkEl, stockCode, '股票代號');
    }
    swLog('create 頁填入完成', { stockCode });
  }

  // create 頁監聽背景推送（在 edit 頁註冊亦無害，因背景只對 create 分頁發送）
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'fillReportCopy') {
      fillCreatePage(request);
      sendResponse({ success: true });
      return true;
    }
    return false;
  });

  return { openDialog };
})();
