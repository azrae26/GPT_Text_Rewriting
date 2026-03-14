/**
 * regex_helper/regex-syntax-highlighter.js - 正則語法高亮模組
 * 功能：將含有正則表達式的文字解析並產生語法上色 HTML
 * 職責：
 * - 核心解析：tokenize 正則字串，辨識跳脫、字元類、群組、量詞等
 * - 格式支援：'plain'（整段為正則）與 'diffRule'（A,B 比對規則格式）
 * - UI 整合：initTextarea() 將 textarea 接上 mirror 層，實現可見語法高亮
 * 依賴：
 * - LogUtils（來自 default.js）
 */
const RegexSyntaxHighlighter = {

  // ─────────────────────────────────────────────────
  // 1. 核心：escape 工具
  // ─────────────────────────────────────────────────

  /**
   * 將字串做 HTML entity escape，防止 XSS
   * @param {string} str
   * @returns {string}
   */
  _esc(str) {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  },

  /**
   * 包裝成帶 class 的 span
   * @param {string} cls - CSS class（不含前綴）
   * @param {string} text - 已 escape 的文字
   */
  _span(cls, text) {
    return `<span class="re-sh-${cls}">${text}</span>`;
  },

  // ─────────────────────────────────────────────────
  // 2. 正則 tokenizer
  // ─────────────────────────────────────────────────

  /**
   * 將 /pattern/flags 內部的 pattern 字串 tokenize 並轉為帶 span 的 HTML
   * 呼叫者已確保傳入的是 pattern 本體（不含前後斜線）
   * @param {string} pattern
   * @returns {string} HTML
   */
  _tokenizePattern(pattern) {
    let html = '';
    let i = 0;
    const len = pattern.length;

    while (i < len) {
      const ch = pattern[i];

      // ── 跳脫序列 \x ──
      if (ch === '\\' && i + 1 < len) {
        html += this._span('escape', this._esc(pattern.slice(i, i + 2)));
        i += 2;
        continue;
      }

      // ── 字元類 [...] ──
      if (ch === '[') {
        let j = i + 1;
        // 處理 [^ 和 [] 的邊界情況
        if (j < len && pattern[j] === '^') j++;
        if (j < len && pattern[j] === ']') j++; // ']' 作為首字元時是字面量
        while (j < len) {
          if (pattern[j] === '\\') { j += 2; continue; } // 跳過跳脫
          if (pattern[j] === ']') { j++; break; }
          j++;
        }
        html += this._span('charclass', this._esc(pattern.slice(i, j)));
        i = j;
        continue;
      }

      // ── 群組 / lookaround ──
      if (ch === '(') {
        // lookahead: (?= (?!  lookbehind: (?<= (?<!  non-capture: (?:  named: (?<name>
        // 只標記開頭的群組語法符號，不追蹤閉合（避免嵌套複雜度）
        let groupPrefix = '(';
        let j = i + 1;
        if (j < len && pattern[j] === '?') {
          j++;
          if (j < len && (pattern[j] === ':' || pattern[j] === '=' || pattern[j] === '!')) {
            groupPrefix = pattern.slice(i, j + 1);
            j++;
          } else if (j < len && pattern[j] === '<') {
            // (?<= (?<! (?<name>
            j++;
            if (j < len && (pattern[j] === '=' || pattern[j] === '!')) {
              groupPrefix = pattern.slice(i, j + 1);
              j++;
            } else {
              // named group: (?<name>
              const nameEnd = pattern.indexOf('>', j);
              groupPrefix = nameEnd >= 0 ? pattern.slice(i, nameEnd + 1) : pattern.slice(i, j);
              j = nameEnd >= 0 ? nameEnd + 1 : j;
            }
          } else {
            groupPrefix = pattern.slice(i, j);
          }
        }
        html += this._span('group', this._esc(groupPrefix));
        i = j;
        continue;
      }

      // ── 群組閉合 ) ──
      if (ch === ')') {
        html += this._span('group', this._esc(ch));
        i++;
        continue;
      }

      // ── 量詞 * + ? {n,m} ──
      if (ch === '*' || ch === '+') {
        // 支援 *? +? （非貪婪）
        let q = ch;
        if (i + 1 < len && pattern[i + 1] === '?') { q += '?'; i++; }
        html += this._span('quant', this._esc(q));
        i++;
        continue;
      }
      if (ch === '?') {
        // 單獨的 ? 是量詞（非貪婪標記在上面已吃掉）
        html += this._span('quant', '?');
        i++;
        continue;
      }
      if (ch === '{') {
        const end = pattern.indexOf('}', i);
        if (end >= 0) {
          const quant = pattern.slice(i, end + 1);
          // 確認是合法量詞 {n} {n,} {n,m}
          if (/^\{\d+,?\d*\}$/.test(quant)) {
            html += this._span('quant', this._esc(quant));
            i = end + 1;
            continue;
          }
        }
        html += this._span('literal', this._esc(ch));
        i++;
        continue;
      }

      // ── alternation | ──
      if (ch === '|') {
        html += this._span('alt', '|');
        i++;
        continue;
      }

      // ── 錨點 ^ $ ──
      if (ch === '^' || ch === '$') {
        html += this._span('anchor', this._esc(ch));
        i++;
        continue;
      }

      // ── 萬用字元 . ──
      if (ch === '.') {
        html += this._span('dot', '.');
        i++;
        continue;
      }

      // ── 其餘為 literal ──
      html += this._span('literal', this._esc(ch));
      i++;
    }

    return html;
  },

  /**
   * 解析 /pattern/flags 格式，回傳帶 span 的 HTML
   * @param {string} str - 完整正則字串（含前後斜線）
   * @returns {string} HTML
   */
  _highlightRegex(str) {
    const lastSlash = str.lastIndexOf('/');
    if (lastSlash <= 0) {
      // 不是合法的 /pattern/ 格式，當成 literal
      return this._span('literal', this._esc(str));
    }
    const pattern = str.slice(1, lastSlash);
    const flags = str.slice(lastSlash + 1);
    return (
      this._span('delim', '/') +
      this._tokenizePattern(pattern) +
      this._span('delim', '/') +
      (flags ? this._span('flags', this._esc(flags)) : '')
    );
  },

  // ─────────────────────────────────────────────────
  // 3. 公開 API：highlight(text, format)
  // ─────────────────────────────────────────────────

  /**
   * 將文字解析並回傳帶語法高亮 span 的 HTML
   * @param {string} text - 整段文字（可含換行）
   * @param {'plain'|'diffRule'} format
   *   'plain'    : 整段視為單一正則
   *   'diffRule' : 每行為 A,B 格式（A=舊, B=新），各自判斷是否為 /regex/
   * @returns {string} HTML
   */
  highlight(text, format = 'plain') {
    if (!text) return '';

    if (format === 'diffRule') {
      return this._highlightDiffRules(text);
    }
    // plain: 判斷是否為 /pattern/flags
    const trimmed = text.trim();
    if (trimmed.startsWith('/') && trimmed.lastIndexOf('/') > 0) {
      return this._highlightRegex(trimmed);
    }
    return this._span('literal', this._esc(text));
  },

  /**
   * 解析比對規則格式（每行 A,B）並上色
   * @param {string} text
   * @returns {string} HTML
   */
  _highlightDiffRules(text) {
    const lines = text.split('\n');
    const htmlLines = lines.map(line => this._highlightDiffRuleLine(line));
    // 用換行符拼接，mirror 使用 white-space:pre-wrap 會自動換行
    return htmlLines.join('\n');
  },

  /**
   * 解析單行 diffRule（A,B 格式）
   * @param {string} line
   * @returns {string} HTML
   */
  _highlightDiffRuleLine(line) {
    // 空行
    if (!line) return '';

    // 註解行（# 開頭）
    if (line.trimStart().startsWith('#')) {
      return this._span('comment', this._esc(line));
    }

    // 找第一個逗號（A,B 分隔符）
    const commaIdx = line.indexOf(',');

    if (commaIdx === -1) {
      // 無逗號：整行視為 A（舊文字）
      return this._highlightSide(line);
    }

    const rawA = line.slice(0, commaIdx);
    const rawB = line.slice(commaIdx + 1);

    const htmlA = rawA ? this._highlightSide(rawA) : '';
    const comma = this._span('comma', ',');
    const htmlB = rawB ? this._highlightSide(rawB) : '';

    return htmlA + comma + htmlB;
  },

  /**
   * 判斷 A 或 B 側是正則還是純文字，回傳上色 HTML
   * @param {string} str
   * @returns {string} HTML
   */
  _highlightSide(str) {
    const t = str.trim();
    if (t.startsWith('/') && t.lastIndexOf('/') > 0) {
      // 保留前導空白（若有）
      const leading = str.slice(0, str.indexOf('/'));
      const trailing = str.slice(str.lastIndexOf('/') + (str.match(/\/[gimsuy]*$/) ? str.match(/\/[gimsuy]*$/)[0].length : 1));
      return (
        (leading ? this._span('literal', this._esc(leading)) : '') +
        this._highlightRegex(t) +
        (trailing ? this._span('literal', this._esc(trailing)) : '')
      );
    }
    return this._span('literal', this._esc(str));
  },

  // ─────────────────────────────────────────────────
  // 4. UI 整合：initTextarea
  // ─────────────────────────────────────────────────

  /**
   * 將 textarea 接上語法高亮 mirror 層
   * @param {HTMLTextAreaElement} textarea
   * @param {{format?: 'plain'|'diffRule'}} options
   */
  initTextarea(textarea, options = {}) {
    const format = options.format || 'plain';

    // 建立 wrapper（若父層尚未是 regex-highlight-container）
    let container = textarea.parentElement;
    if (!container.classList.contains('regex-highlight-container')) {
      container = document.createElement('div');
      container.className = 'regex-highlight-container';
      textarea.parentElement.insertBefore(container, textarea);
      container.appendChild(textarea);
    }

    // 建立 mirror div
    const mirror = document.createElement('div');
    mirror.className = 'regex-highlight-mirror';
    mirror.setAttribute('aria-hidden', 'true');
    container.insertBefore(mirror, textarea);

    // 讓 textarea 字透明，但游標可見
    textarea.classList.add('regex-highlight-textarea');

    // 輸入時更新 mirror（用 rAF 避免連打卡頓）
    let rafId = null;
    const sync = () => {
      if (rafId) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        this._syncMirror(textarea, mirror, format);
        rafId = null;
      });
    };

    textarea.addEventListener('input', sync);

    // 捲動時同步
    textarea.addEventListener('scroll', () => {
      mirror.scrollTop = textarea.scrollTop;
      mirror.scrollLeft = textarea.scrollLeft;
    });

    // ResizeObserver：textarea 尺寸變化（或從隱藏變可見）時重新同步
    if (typeof ResizeObserver !== 'undefined') {
      const ro = new ResizeObserver(() => sync());
      ro.observe(textarea);
    }

    // 初次渲染（textarea 若在隱藏 tab 中，offsetWidth 為 0，但 HTML 內容還是先填）
    this._syncMirror(textarea, mirror, format);

    const t = new Date();
    const ts = `${t.getHours().toString().padStart(2,'0')}:${t.getMinutes().toString().padStart(2,'0')}:${t.getSeconds().toString().padStart(2,'0')}`;
    LogUtils.log(`[RegexSyntaxHighlighter][${ts}] ✅ textarea 語法高亮已初始化 (format=${format})`);
  },

  /**
   * 同步 mirror 的內容與樣式（font/padding 對齊，不設 width/height 由 CSS 控制）
   * @param {HTMLTextAreaElement} textarea
   * @param {HTMLElement} mirror
   * @param {string} format
   */
  _syncMirror(textarea, mirror, format) {
    const cs = getComputedStyle(textarea);

    // 同步字型與內距（確保文字換行位置一致）
    mirror.style.font = cs.font;
    mirror.style.lineHeight = cs.lineHeight;
    mirror.style.padding = cs.padding;
    mirror.style.borderWidth = cs.borderWidth;
    mirror.style.boxSizing = cs.boxSizing;
    mirror.style.letterSpacing = cs.letterSpacing;
    // 使用 clientWidth/clientHeight 排除捲軸佔用空間，確保 mirror 與 textarea 內容區寬高一致
    // （textarea 有捲軸時 offsetWidth 為總寬，mirror 無捲軸會較寬導致對不齊）
    // clientWidth 不含 border，需加回以匹配 mirror 的 box-sizing
    if (textarea.offsetWidth > 0) {
      const bL = parseFloat(cs.borderLeftWidth) || 0;
      const bR = parseFloat(cs.borderRightWidth) || 0;
      const bT = parseFloat(cs.borderTopWidth) || 0;
      const bB = parseFloat(cs.borderBottomWidth) || 0;
      mirror.style.width = `${textarea.clientWidth + bL + bR}px`;
      mirror.style.height = `${textarea.clientHeight + bT + bB}px`;
    }

    // 更新語法高亮 HTML
    mirror.innerHTML = this.highlight(textarea.value, format);

    // 同步捲動位置
    mirror.scrollTop = textarea.scrollTop;
    mirror.scrollLeft = textarea.scrollLeft;
  }
};

window.RegexSyntaxHighlighter = RegexSyntaxHighlighter;
