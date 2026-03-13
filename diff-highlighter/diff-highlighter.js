/**
 * diff-highlighter.js - 差異比對浮動標注模組
 *
 * 功能：比對公司簡介框與報告框的文字差異，在報告框上方疊加浮動泡泡標注
 *
 * 職責：
 * - LCS 差異算法（tokenize / computeDiff / groupOps / postProcessGroups）
 * - 在 textarea 上建立 overlay 容器（與 TextHighlight 容器並存，不干擾現有高亮）
 * - 複用 TextHighlight.PositionCalculator 精確計算中文字元像素位置
 * - 複用 TextHighlight.ScrollHelper 同步 textarea 滾動
 * - 支援點 X 還原單筆修改（整合 UndoManager）
 * - 切換按鈕控制整個 overlay 顯示/隱藏
 * - 自訂合併規則（setCustomRules）：指定 oldPattern/newPattern，強制合併字元層級被拆散的 group
 *   支援精準字串與 /regex/ 語法，格式：A,B / A, / ,B（逗點分隔，任一側可空）
 *
 * 依賴：
 * - text_highlight/highlight.js（TextHighlight.PositionCalculator、TextHighlight.ScrollHelper）
 * - undo.js（UndoManager）
 */
const DiffHighlighter = {
  /** 泡泡高度估算（px），用於計算垂直偏移 */
  BUBBLE_H: 6,
  /** 泡泡與文字的垂直間距（px） */
  BUBBLE_GAP: 2,
  /** 泡泡整體垂直偏移量（px），正值往下移，負值往上移 */
  BUBBLE_VERTICAL_ADJUST: 2,
  /** 上方額外允許顯示的距離（px），讓泡泡超出容器頂部時仍可見 */
  BOUNDS_TOP_EXTRA: 10,
  /** 下方提早隱藏的距離（px），讓泡泡在接近容器底部時即隱藏 */
  BOUNDS_BOTTOM_MARGIN: 10,

  isEnabled: true,
  /** @type {HTMLTextAreaElement|null} */
  contentTextarea: null,
  /** @type {HTMLTextAreaElement|null} */
  introTextarea: null,
  /** @type {HTMLElement|null} overlay 容器 */
  overlayContainer: null,
  /** @type {Function|null} 解除 scroll 監聽的函式 */
  _removeScrollListener: null,
  /** @type {ResizeObserver|null} */
  _resizeObserver: null,
  /** requestAnimationFrame 排程旗標，避免重複排程 */
  _rafPending: false,
  /** 自訂合併規則，每條為 {oldMatcher, newMatcher}，任一可為 null */
  customRules: [],

  // ─────────────────────────────────────────────────
  // 1. DIFF（使用 diff-match-patch）
  //    Myers diff 字元層級操作，不使用 diff_cleanupSemantic
  //    （cleanupSemantic 會把短等值段如「延續」吸收進 replace，
  //      導致相鄰的多個差異合併成一個超大 replace，讓自訂規則無法拆分）
  //    回傳 ops 陣列：{type:'equal'|'insert'|'delete', a?, b?}
  // ─────────────────────────────────────────────────
  computeDiffDMP(introText, contentText) {
    const dmp   = new diff_match_patch();  // eslint-disable-line new-cap
    const diffs = dmp.diff_main(introText, contentText);
    // 不呼叫 diff_cleanupSemantic：它會過度合併相鄰差異，使自訂規則失效
    const ops = diffs.map((diff) => {
      const op   = diff[0];
      const text = diff[1];
      if (op ===  0) return { type: 'equal',  a: text, b: text };
      if (op ===  1) return { type: 'insert', b: text };
      /* op === -1 */ return { type: 'delete', a: text };
    });
    const t = new Date(); const ts = `${t.getHours().toString().padStart(2,'0')}:${t.getMinutes().toString().padStart(2,'0')}:${t.getSeconds().toString().padStart(2,'0')}`;
    console.log(`[DiffHighlighter][${ts}] 📝 DMP ops (${ops.length}):`, ops.map(o => `[${o.type}] a=${JSON.stringify(o.a||'')} b=${JSON.stringify(o.b||'')}`));
    return ops;
  },

  // ─────────────────────────────────────────────────
  // 3. GROUP OPS
  //    把連續的 delete/insert（任意順序）合成 replace/insert/delete 組
  // ─────────────────────────────────────────────────
  groupOps(ops) {
    const groups = [];
    let i = 0;
    while (i < ops.length) {
      if (ops[i].type === 'equal') {
        let text = '';
        while (i < ops.length && ops[i].type === 'equal') { text += ops[i].b; i++; }
        groups.push({ type: 'equal', text });
      } else {
        let del = '', ins = '';
        while (i < ops.length && ops[i].type !== 'equal') {
          if (ops[i].type === 'delete') del += ops[i].a;
          else                          ins += ops[i].b;
          i++;
        }
        if      (del && ins) groups.push({ type: 'replace', oldText: del, newText: ins });
        else if (del)        groups.push({ type: 'delete',  oldText: del });
        else if (ins)        groups.push({ type: 'insert',  newText: ins });
      }
    }
    return groups;
  },

  // ─────────────────────────────────────────────────
  // 3b. POST-PROCESS GROUPS
  //    修正 LCS 次優路徑：delete + equal(僅空白) + insert → replace
  // ─────────────────────────────────────────────────
  postProcessGroups(groups) {
    let changed = true;
    while (changed) {
      changed = false;
      for (let i = 0; i < groups.length - 2; i++) {
        const a = groups[i], b = groups[i+1], c = groups[i+2];
        const isWsOnly = b.type === 'equal' && /^\s+$/.test(b.text);
        if (a.type === 'delete' && isWsOnly && c.type === 'insert') {
          groups.splice(i, 3, { type: 'replace', oldText: a.oldText + b.text, newText: c.newText });
          changed = true; break;
        }
        if (a.type === 'insert' && isWsOnly && c.type === 'delete') {
          groups.splice(i, 3, { type: 'replace', oldText: c.oldText + b.text, newText: a.newText });
          changed = true; break;
        }
      }
    }
    return groups;
  },

  // ─────────────────────────────────────────────────
  // 3c. CUSTOM RULES
  //    解析使用者設定的自訂合併規則，並在 postProcessGroups 後套用
  //    格式每行：A,B / A, / ,B（逗點分隔，支援 /regex/ 語法）
  // ─────────────────────────────────────────────────

  /**
   * 解析單個 pattern 字串為 matcher 物件
   * @param {string} str - trim 後的 pattern 字串
   * @returns {{type:'exact'|'regex', value:string|RegExp}|null}
   */
  _parseMatcher(str) {
    if (!str) return null;
    // /pattern/ 語法 → regex
    if (str.startsWith('/') && str.lastIndexOf('/') > 0) {
      const lastSlash = str.lastIndexOf('/');
      const flags     = str.slice(lastSlash + 1);
      const body      = str.slice(1, lastSlash);
      try {
        return { type: 'regex', value: new RegExp(body, flags) };
      } catch (e) {
        LogUtils.warn(`[DiffHighlighter] 無效的正則表達式: ${str}`, e);
        return null;
      }
    }
    return { type: 'exact', value: str };
  },

  /**
   * 解析自訂規則文字，設定 customRules
   * @param {string} text - 每行一條規則，格式 A,B / A, / ,B
   */
  setCustomRules(text) {
    this.customRules = [];
    if (!text) return;
    const lines = text.split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      // 以第一個逗點分割（pattern 內可能含逗點的情況由使用者自行處理）
      const commaIdx = trimmed.indexOf(',');
      let rawOld, rawNew;
      if (commaIdx === -1) {
        // 無逗點 → 視為 A,（舊文字模式）
        rawOld = trimmed;
        rawNew = '';
      } else {
        rawOld = trimmed.slice(0, commaIdx).trim();
        rawNew = trimmed.slice(commaIdx + 1).trim();
      }
      const oldMatcher = this._parseMatcher(rawOld);
      const newMatcher = this._parseMatcher(rawNew);
      if (!oldMatcher && !newMatcher) continue;
      this.customRules.push({ oldMatcher, newMatcher });
    }
    const t = new Date(); const ts = `${t.getHours().toString().padStart(2,'0')}:${t.getMinutes().toString().padStart(2,'0')}:${t.getSeconds().toString().padStart(2,'0')}`;
    LogUtils.log(`[DiffHighlighter][${ts}] ✅ 自訂規則已載入 (${this.customRules.length} 條)`);
  },

  /**
   * 在 text 中找出 matcher 的所有不重疊匹配位置
   * @param {string} text
   * @param {{type:'exact'|'regex', value:string|RegExp}} matcher
   * @returns {Array<{start:number, end:number}>}
   */
  _findTextMatches(text, matcher) {
    const results = [];
    if (matcher.type === 'exact') {
      let pos = 0;
      const val = matcher.value;
      if (!val) return results;
      while (pos <= text.length - val.length) {
        const idx = text.indexOf(val, pos);
        if (idx < 0) break;
        results.push({ start: idx, end: idx + val.length });
        pos = idx + val.length;
      }
    } else {
      // 建立帶 g flag 的副本（避免污染原 RegExp 的 lastIndex）
      const flags = (matcher.value.flags || '').replace('g', '') + 'g';
      const re = new RegExp(matcher.value.source, flags);
      let m;
      while ((m = re.exec(text)) !== null) {
        results.push({ start: m.index, end: m.index + m[0].length });
        if (!m[0].length) re.lastIndex++; // 防止零寬匹配無窮迴圈
      }
    }
    return results;
  },

  /**
   * 依規則合併 groups：
   *  - 重建 old/new 全文及 group 跨度資訊
   *  - 在全文中找 pattern 匹配位置
   *  - 在匹配邊界拆分橫跨的 equal group
   *  - 合併對應 group 範圍為單一 replace group
   *  - 反覆直到無法繼續（單次執行多個匹配 → restart loop）
   * @param {Array} groups
   * @param {{oldMatcher, newMatcher}} rule
   * @returns {Array}
   */
  _mergeByRule(groups, rule) {
    const { oldMatcher, newMatcher } = rule;

    let _iterCount = 0;
    let changed = true;
    while (changed) {
      // 防止自訂規則 regex 組合在某些文字上觸發無限迴圈
      if (++_iterCount > 500) {
        const t = new Date(); const ts = `${t.getHours().toString().padStart(2,'0')}:${t.getMinutes().toString().padStart(2,'0')}:${t.getSeconds().toString().padStart(2,'0')}`;
        LogUtils.warn(`[DiffHighlighter][${ts}] ⚠️ _mergeByRule 超過 500 次迭代，強制中止`);
        break;
      }
      changed = false;

      // ── Step 1：重建 old/new 全文與各 group 的跨度 ──
      let oldText = '', newText = '';
      const gOS = [], gNS = [], gOL = [], gNL = []; // old/new start, old/new length
      for (let gi = 0; gi < groups.length; gi++) {
        const g = groups[gi];
        gOS.push(oldText.length);
        gNS.push(newText.length);
        let op = '', np = '';
        if (g.type === 'equal')   { op = g.text;    np = g.text; }
        if (g.type === 'delete')  { op = g.oldText; }
        if (g.type === 'insert')  { np = g.newText; }
        if (g.type === 'replace') { op = g.oldText; np = g.newText; }
        gOL.push(op.length); gNL.push(np.length);
        oldText += op; newText += np;
      }

      // 找到 pos 所在的 group index（在 old 或 new 文字中）
      const findGi = (starts, lens, pos) => {
        for (let gi = 0; gi < starts.length; gi++) {
          if (lens[gi] > 0 && pos >= starts[gi] && pos < starts[gi] + lens[gi]) return gi;
        }
        return -1;
      };

      // ── Step 2：找匹配 ──
      const oldMs = oldMatcher ? this._findTextMatches(oldText, oldMatcher) : [];
      const newMs = newMatcher ? this._findTextMatches(newText, newMatcher) : [];

      // ── Step 3：嘗試套用第一個有效的合併 ──
      const attempt = (om, nm) => {
        // 確定各自的 group 範圍
        let oS = -1, oE = -1, nS = -1, nE = -1;
        if (om) { oS = findGi(gOS, gOL, om.start); oE = findGi(gOS, gOL, om.end - 1); }
        if (nm) { nS = findGi(gNS, gNL, nm.start); nE = findGi(gNS, gNL, nm.end - 1); }
        if (om && (oS < 0 || oE < 0)) return false;
        if (nm && (nS < 0 || nE < 0)) return false;
        // 單側模式：以另一側的 group 範圍為預設
        if (!om) { oS = nS; oE = nE; }
        if (!nm) { nS = oS; nE = oE; }

        let giS = Math.min(oS, nS);
        let giE = Math.max(oE, nE);

        // 若 [giS..giE] 全為 equal group，segOld 必然等於 segNew，
        // 不需合併且任何 split 都會引發無限迴圈（pattern 匹配在 equal 內部時）
        let _hasNonEqual = false;
        for (let _k = giS; _k <= giE; _k++) {
          if (groups[_k].type !== 'equal') { _hasNonEqual = true; break; }
        }
        if (!_hasNonEqual) return false;

        // A, 模式（僅 oldMatcher）：在 old match 結尾的 equal group 後，
        // 把緊接的非 equal group 也納入（捕捉例如「2Q23 」中的尾部空格 replace）
        if (!newMatcher) {
          while (giE + 1 < groups.length &&
                 groups[giE].type === 'equal' &&
                 groups[giE + 1].type !== 'equal') {
            giE++;
          }
        }
        // ,B 模式（僅 newMatcher）：類似地往前擴展
        if (!oldMatcher) {
          while (giS > 0 &&
                 groups[giS].type === 'equal' &&
                 groups[giS - 1].type !== 'equal') {
            giS--;
          }
        }

        // ── Step 4：如需要，拆分 leading equal group ──
        if (groups[giS] && groups[giS].type === 'equal') {
          // 對 equal group，old 與 new 的文字相同，offset 一致
          const splitOff = om ? (om.start - gOS[giS]) : (nm.start - gNS[giS]);
          if (splitOff > 0) {
            const g = groups[giS];
            groups.splice(giS, 1,
              { type: 'equal', text: g.text.slice(0, splitOff) },
              { type: 'equal', text: g.text.slice(splitOff) }
            );
            return true; // restart loop（indices 已失效）
          }
        }

        // ── Step 5：如需要，拆分 trailing equal group ──
        if (groups[giE] && groups[giE].type === 'equal') {
          // 計算匹配在此 group 中的終止 offset
          const matchEnd  = om ? om.end : nm.end;
          const groupStart = om ? gOS[giE] : gNS[giE];
          const groupLen   = om ? gOL[giE] : gNL[giE];
          const splitOff   = matchEnd - groupStart;
          if (splitOff > 0 && splitOff < groupLen) {
            const g = groups[giE];
            groups.splice(giE, 1,
              { type: 'equal', text: g.text.slice(0, splitOff) },
              { type: 'equal', text: g.text.slice(splitOff) }
            );
            return true; // restart（giE 現在指向前半部，正好是匹配結尾）
          }
        }

        // ── Step 6：合併 groups[giS..giE] ──
        let segOld = '', segNew = '';
        for (let k = giS; k <= giE; k++) {
          const g = groups[k];
          if (g.type === 'equal')   { segOld += g.text;    segNew += g.text; }
          if (g.type === 'delete')  { segOld += g.oldText; }
          if (g.type === 'insert')  { segNew += g.newText; }
          if (g.type === 'replace') { segOld += g.oldText; segNew += g.newText; }
        }
        if (segOld === segNew) return false; // 無實際變動

        // 若 range 已是單一 replace group 且內容相同，代表已合併過，不重複處理
        // 若不做此檢查，while(changed) loop 會在同一 replace group 上無窮迴圈
        if (giE === giS && groups[giS].type === 'replace' &&
            groups[giS].oldText === segOld && groups[giS].newText === segNew) {
          return false;
        }

        groups.splice(giS, giE - giS + 1, { type: 'replace', oldText: segOld, newText: segNew });
        return true;
      };

      // ── Step 3 dispatch ──
      if (oldMatcher && newMatcher) {
        // A,B 模式：找 old 與 new 的 group 範圍有重疊的配對
        outer: for (const om of oldMs) {
          const oS = findGi(gOS, gOL, om.start), oE = findGi(gOS, gOL, om.end - 1);
          for (const nm of newMs) {
            const nS = findGi(gNS, gNL, nm.start), nE = findGi(gNS, gNL, nm.end - 1);
            if (oS >= 0 && oE >= 0 && nS >= 0 && nE >= 0 &&
                Math.max(oS, nS) <= Math.min(oE, nE)) {
              if (attempt(om, nm)) { changed = true; break outer; }
            }
          }
        }
      } else if (oldMatcher) {
        for (const om of oldMs) { if (attempt(om, null)) { changed = true; break; } }
      } else if (newMatcher) {
        for (const nm of newMs) { if (attempt(null, nm)) { changed = true; break; } }
      }
    }

    return groups;
  },

  /**
   * 套用所有自訂規則
   * @param {Array} groups
   * @returns {Array}
   */
  applyCustomRules(groups) {
    if (!this.customRules || this.customRules.length === 0) return groups;
    for (const rule of this.customRules) {
      groups = this._mergeByRule(groups, rule);
    }
    return groups;
  },

  // ─────────────────────────────────────────────────
  // 4. ANNOTATE GROUPS WITH CONTENT INDICES
  //    遍歷 groups，追蹤每個 group 在 content textarea 中的字元索引
  // ─────────────────────────────────────────────────
  annotateGroupsWithIndices(groups) {
    let contentIdx = 0;
    for (const g of groups) {
      switch (g.type) {
        case 'equal':
          contentIdx += g.text.length;
          break;
        case 'replace':
          g.contentStartIdx = contentIdx;
          contentIdx += g.newText.length;
          g.contentEndIdx = contentIdx;
          break;
        case 'insert':
          g.contentStartIdx = contentIdx;
          contentIdx += g.newText.length;
          g.contentEndIdx = contentIdx;
          break;
        case 'delete':
          g.contentInsertIdx = contentIdx;
          break;
      }
    }
    return groups;
  },

  // ─────────────────────────────────────────────────
  // 5. INIT
  // ─────────────────────────────────────────────────
  init(introSel, contentSel) {
    this.introTextarea   = document.querySelector(introSel);
    this.contentTextarea = document.querySelector(contentSel);

    if (!this.contentTextarea) {
      LogUtils.warn('[DiffHighlighter] 找不到 content textarea:', contentSel);
      return;
    }

    this.setupOverlayContainer();
    this.bindEvents();

    // 兩框都有內容時立即比對
    if (this.introTextarea && this.introTextarea.value.trim() && this.contentTextarea.value.trim()) {
      this.scheduleDiff();
    }

    LogUtils.log('[DiffHighlighter] 🚀 初始化完成');
  },

  // ─────────────────────────────────────────────────
  // 6. SETUP OVERLAY CONTAINER
  //    複用 TextHighlight.DOMManager 的定位邏輯，建立並存容器
  //    overflow:visible 讓泡泡可浮在 textarea 上方
  // ─────────────────────────────────────────────────
  setupOverlayContainer() {
    const existing = document.getElementById('gpt-diff-overlay-container');
    if (existing) existing.remove();

    const ta = this.contentTextarea;
    const taRect    = ta.getBoundingClientRect();
    const parentRect = ta.parentElement.getBoundingClientRect();
    const containerTop  = taRect.top  - parentRect.top;
    const containerLeft = taRect.left - parentRect.left;

    const container = document.createElement('div');
    container.id = 'gpt-diff-overlay-container';
    container.style.cssText = `
      position: absolute;
      top: ${containerTop}px;
      left: ${containerLeft}px;
      width: ${ta.offsetWidth}px;
      height: ${ta.offsetHeight}px;
      pointer-events: none;
      z-index: 1002;
      overflow: visible;
    `;

    const taParent      = ta.parentElement;
    const taGrandParent = taParent?.parentElement;
    if (taGrandParent) {
      taGrandParent.style.position = 'relative';
      taGrandParent.insertBefore(container, taParent);
    } else {
      taParent.appendChild(container);
    }

    this.overlayContainer = container;
  },

  // ─────────────────────────────────────────────────
  // 7. BIND EVENTS
  // ─────────────────────────────────────────────────
  bindEvents() {
    const ta      = this.contentTextarea;
    const introTa = this.introTextarea;

    // 任一框輸入 → 立即排程 diff（rAF 保護，下一幀執行）
    const onInput = () => this.scheduleDiff();
    ta.addEventListener('input', onInput);
    if (introTa) introTa.addEventListener('input', onInput);

    // Scroll 同步（複用 TextHighlight.ScrollHelper）
    if (window.TextHighlight && window.TextHighlight.ScrollHelper) {
      this._removeScrollListener = TextHighlight.ScrollHelper.bindScrollEvent(
        ta, () => this.syncScroll()
      );
    } else {
      const handler = () => this.syncScroll();
      ta.addEventListener('scroll', handler, { passive: true });
      this._removeScrollListener = () => ta.removeEventListener('scroll', handler);
    }

    // ResizeObserver → 重建容器尺寸 + 重跑 diff
    this._resizeObserver = new ResizeObserver(() => this._onResize());
    this._resizeObserver.observe(ta);

    // 字體載入完成後重新比對（確保字寬計算正確）
    document.fonts.ready.then(() => this.scheduleDiff());
  },

  _onResize() {
    if (!this.contentTextarea || !this.overlayContainer) return;
    const ta = this.contentTextarea;
    const taRect     = ta.getBoundingClientRect();
    const parentRect = ta.parentElement.getBoundingClientRect();
    this.overlayContainer.style.top    = `${taRect.top  - parentRect.top}px`;
    this.overlayContainer.style.left   = `${taRect.left - parentRect.left}px`;
    this.overlayContainer.style.width  = `${ta.offsetWidth}px`;
    this.overlayContainer.style.height = `${ta.offsetHeight}px`;
    this.clearBubbles();
    this.scheduleDiff();
  },

  // ─────────────────────────────────────────────────
  // 8. SCHEDULE DIFF（rAF 保護）
  // ─────────────────────────────────────────────────
  scheduleDiff() {
    if (this._rafPending) return;
    this._rafPending = true;
    requestAnimationFrame(() => {
      this._rafPending = false;
      this.runDiff();
    });
  },

  // ─────────────────────────────────────────────────
  // 9. RUN DIFF
  // ─────────────────────────────────────────────────
  runDiff() {
    if (!this.isEnabled) return;
    if (!this.contentTextarea || !this.introTextarea) return;

    const introText   = this.introTextarea.value;
    const contentText = this.contentTextarea.value;

    this.clearBubbles();
    if (!introText.trim() || !contentText.trim()) return;

    const ops    = this.computeDiffDMP(introText, contentText);
    const groups = this.applyCustomRules(this.postProcessGroups(this.groupOps(ops)));
    this.annotateGroupsWithIndices(groups);

    const t = new Date(); const ts = `${t.getHours().toString().padStart(2,'0')}:${t.getMinutes().toString().padStart(2,'0')}:${t.getSeconds().toString().padStart(2,'0')}`;
    console.log(`[DiffHighlighter][${ts}] 🔍 groups (${groups.length}):`, groups.map((g,i) => `[${i}] type=${g.type} old=${JSON.stringify(g.oldText||'')} new=${JSON.stringify(g.newText||'')} contentStart=${g.contentStartIdx} contentInsert=${g.contentInsertIdx}`));

    this.renderBubbles(groups, contentText);
  },

  // ─────────────────────────────────────────────────
  // 10. CLEAR BUBBLES
  // ─────────────────────────────────────────────────
  clearBubbles() {
    if (this.overlayContainer) {
      this.overlayContainer.innerHTML = '';
    }
  },

  // ─────────────────────────────────────────────────
  // 11. RENDER BUBBLES
  //    遍歷 annotated groups，為每個有差異的 group 建立泡泡
  // ─────────────────────────────────────────────────
  renderBubbles(groups, contentText) {
    const ta = this.contentTextarea;
    if (!ta || !this.overlayContainer) return;

    const calc = window.TextHighlight && window.TextHighlight.PositionCalculator;
    if (!calc) {
      LogUtils.warn('[DiffHighlighter] TextHighlight.PositionCalculator 不可用，略過渲染');
      return;
    }

    const styles    = calc.getTextAreaStyles(ta);
    const WS_ONLY   = /^\s+$/;
    const scrollTop = ta.scrollTop;
    const fragment  = document.createDocumentFragment();

    for (const g of groups) {
      if (g.type === 'equal') continue;

      let bubble = null;

      if (g.type === 'replace') {
        const oldTrimmed = g.oldText.trim();
        const newTrimmed = g.newText.trim();
        // 兩側都是空白 → 忽略
        if (!oldTrimmed && !newTrimmed) continue;
        // 去空白後相同 → 忽略
        if (oldTrimmed === newTrimmed) continue;
        // 唯一差異是句尾句點（. 或 。）→ 忽略
        if (this._isOnlyTrailingPeriodDiff(oldTrimmed, newTrimmed)) continue;

        if (!oldTrimmed) {
          // 空白 → 有意義文字：視為新增
          bubble = this._makeBubble('insert', '✕', g, ta, contentText,
            g.contentStartIdx, g.newText, styles, scrollTop);
        } else if (!newTrimmed) {
          // 有意義文字 → 空白：視為刪除，錨點用 contentStartIdx
          bubble = this._makeBubble('delete', this._abbrev(oldTrimmed), g, ta, contentText,
            g.contentStartIdx, g.newText.length > 0 ? g.newText : (contentText[g.contentStartIdx] || ' '),
            styles, scrollTop);
        } else {
          // 一般替換：泡泡顯示原始文字
          bubble = this._makeBubble('replace', this._abbrev(oldTrimmed), g, ta, contentText,
            g.contentStartIdx, g.newText, styles, scrollTop);
        }

      } else if (g.type === 'insert') {
        // 純空白新增 → 忽略（換行、空格不顯示泡泡）
        if (WS_ONLY.test(g.newText)) continue;
        // 唯一新增的是句尾句點 → 忽略
        if (/^[.。]+$/.test(g.newText.trim())) continue;
        bubble = this._makeBubble('insert', '✕', g, ta, contentText,
          g.contentStartIdx, g.newText, styles, scrollTop);

      } else if (g.type === 'delete') {
        // 純空白刪除 → 忽略
        if (WS_ONLY.test(g.oldText)) continue;
        // 唯一刪除的是句尾句點 → 忽略
        if (/^[.。]+$/.test(g.oldText.trim())) continue;
        // 刪除型：contentInsertIdx 指向刪除點（即被刪文字在原文中的位置）
        // 取刪除點前一字（contentInsertIdx - 1）的右緣，精確對準刪除縫隙
        // 例：營收[分別]年增 → 刪除後 contentInsertIdx=2（年），應取 index 1（收）右緣
        const anchorIdx = Math.min(g.contentInsertIdx - 1, contentText.length - 1);
        if (anchorIdx < 0) continue;
        bubble = this._makeBubble('delete', this._abbrev(g.oldText), g, ta, contentText,
          anchorIdx, contentText[anchorIdx] || ' ', styles, scrollTop, true);
      }

      if (bubble) fragment.appendChild(bubble);
    }

    this.overlayContainer.appendChild(fragment);
  },

  // ─────────────────────────────────────────────────
  // 12. _makeBubble（內部工具函式）
  //    複用 TextHighlight.PositionCalculator 計算字元像素位置
  //    水平置中：所有同行 rect 合併 bounding box 後取中心
  //    指示線：CSS ::after 從泡泡底部中心向下指
  // ─────────────────────────────────────────────────
  _makeBubble(type, label, group, ta, contentText, startIdx, matchText, styles, scrollTop, useRightEdge = false) {
    const calc = window.TextHighlight.PositionCalculator;

    if (!matchText || matchText.length === 0) return null;
    if (startIdx < 0 || startIdx >= contentText.length) return null;

    // 確保 matchText 不超出 contentText 邊界
    const safeMatch = contentText.slice(startIdx, startIdx + matchText.length);
    if (!safeMatch) return null;

    // 步驟1：去掉前後空白（\n、空格），避免空白偏移中心
    const leadTrim = safeMatch.length - safeMatch.trimStart().length;
    const tailTrim = safeMatch.length - safeMatch.trimEnd().length;
    const trimLen  = safeMatch.length - leadTrim - tailTrim;
    let posIdx = (trimLen > 0) ? startIdx + leadTrim : startIdx;
    let posStr = (trimLen > 0) ? contentText.slice(posIdx, posIdx + trimLen) : safeMatch;

    // 步驟2：若 posStr 含換行，LCS 邊界不精確導致 newText 從前一行行尾開始
    //   (例：'期。\n\n\n2022年第' → positions[0] 落在行尾，泡泡跑到錯誤的行)
    //   修正：跳到最後一個 \n 之後的內容，定位在真正的替換行
    const lastNlIdx = posStr.lastIndexOf('\n');
    if (lastNlIdx !== -1) {
      const afterNl = posStr.slice(lastNlIdx + 1);
      if (afterNl.trim()) {
        posIdx += lastNlIdx + 1;
        posStr  = afterNl;
      }
    }

    const t2 = new Date(); const ts2 = `${t2.getHours().toString().padStart(2,'0')}:${t2.getMinutes().toString().padStart(2,'0')}:${t2.getSeconds().toString().padStart(2,'0')}`;
    console.log(`[DiffHighlighter][${ts2}] 📍 _makeBubble type=${type} label=${JSON.stringify(label)} posIdx=${posIdx} posStr=${JSON.stringify(posStr)}`);

    const positions = calc.calculatePosition(ta, posIdx, contentText, posStr, styles);
    if (!positions || positions.length === 0) return null;

    // 合併同行所有 rect 的 bounding box，解決中英混合被拆多 rect 時偏移的問題
    // 閾值放寬到 3px，避免次像素差異造成誤判不同行
    const firstTop = positions[0].top;
    let leftMost  = positions[0].left;
    let rightMost = positions[0].left + positions[0].width;
    for (let i = 1; i < positions.length; i++) {
      if (Math.abs(positions[i].top - firstTop) < 3) {
        leftMost  = Math.min(leftMost,  positions[i].left);
        rightMost = Math.max(rightMost, positions[i].left + positions[i].width);
      }
    }
    // 水平中心（相對於 overlay 容器左邊），整體右移 1px
    // delete 型取右緣，對準刪除縫隙；其他型取中心
    const centerX = (useRightEdge ? rightMost : (leftMost + rightMost) / 2);
    const t3 = new Date(); const ts3 = `${t3.getHours().toString().padStart(2,'0')}:${t3.getMinutes().toString().padStart(2,'0')}:${t3.getSeconds().toString().padStart(2,'0')}`;
    console.log(`[DiffHighlighter][${ts3}]   → positions[0]={top:${positions[0].top.toFixed(1)},left:${positions[0].left.toFixed(1)},w:${positions[0].width.toFixed(1)}} leftMost=${leftMost.toFixed(1)} rightMost=${rightMost.toFixed(1)} centerX=${centerX.toFixed(1)}`);

    // 泡泡頂端（相對於 overlay 容器，可為負值 → 浮在 textarea 上方）
    const absTop   = positions[0].top - this.BUBBLE_H - this.BUBBLE_GAP + this.BUBBLE_VERTICAL_ADJUST;
    // 應用 scrollTop 補償（等同 TextHighlight 的 top - scrollTop pattern）
    const finalTop = absTop - scrollTop;

    const bubble = document.createElement('div');
    bubble.className = `gpt-ann gpt-ann-${type}`;

    // 文字包在 label span 內，父元素 overflow:visible 才能讓指示線突出
    const labelSpan = document.createElement('span');
    labelSpan.className = 'gpt-ann-label';
    labelSpan.textContent = label;
    bubble.appendChild(labelSpan);

    // 儲存絕對位置供 syncScroll 使用
    bubble.dataset.absTop  = absTop;
    bubble.dataset.centerX = centerX;

    // 水平置中：先平移到 centerX，再用 translateX(-50%) 讓泡泡自身置中
    const containerH = this.overlayContainer.offsetHeight;
    const inBounds = finalTop > -(this.BUBBLE_H + this.BOUNDS_TOP_EXTRA) && finalTop < containerH - this.BOUNDS_BOTTOM_MARGIN;
    bubble.style.cssText = `
      position: absolute;
      top: 0;
      left: 0;
      transform: translate(${centerX}px, ${finalTop}px) translateX(-50%);
      pointer-events: auto;
      visibility: ${inBounds ? 'visible' : 'hidden'};
    `;

    // X 按鈕
    const closeBtn = document.createElement('span');
    closeBtn.className = 'gpt-ann-close';
    closeBtn.textContent = '✕';
    closeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.revertChange(group);
    });
    bubble.appendChild(closeBtn);

    // 組合回傳：replace/insert 附帶橫線，垂直對齊泡泡正中心
    const result = document.createDocumentFragment();
    if ((type === 'replace' || type === 'insert') && rightMost > leftMost) {
      const lineEl = document.createElement('div');
      lineEl.className = `gpt-ann-hline gpt-ann-hline-${type}`;
      const BUBBLE_MID = 5; // 泡泡高度約 11px，取中點 ~5px
      const absLineTop   = absTop + BUBBLE_MID;
      const lineFinalTop = absLineTop - scrollTop;
      const lineLeft = leftMost - 1; // 整體左移 1px
      lineEl.dataset.absLineTop = absLineTop;
      lineEl.dataset.lineLeft   = lineLeft;
      const lineWidth  = (rightMost - leftMost) + 2;
      const inBoundsLn = lineFinalTop > -(this.BUBBLE_H + this.BOUNDS_TOP_EXTRA) && lineFinalTop < containerH - this.BOUNDS_BOTTOM_MARGIN;
      lineEl.style.cssText = `
        position: absolute;
        top: 0;
        left: 0;
        transform: translate(${lineLeft}px, ${lineFinalTop}px);
        width: ${lineWidth}px;
        pointer-events: none;
        visibility: ${inBoundsLn ? 'visible' : 'hidden'};
      `;
      result.appendChild(lineEl);
    }
    result.appendChild(bubble);
    return result;
  },

  _abbrev(text, max = 30) {
    return text.length > max ? text.slice(0, max) + '…' : text;
  },

  /** 判斷兩字串唯一的差異是否只是句尾句點（. 或 。），若是則視為相同 */
  _isOnlyTrailingPeriodDiff(a, b) {
    const strip = s => s.replace(/[.。]+$/, '');
    return strip(a) === strip(b);
  },

  // ─────────────────────────────────────────────────
  // 13. SCROLL SYNC
  //    與 TextHighlight 完全相同的 pattern：top - scrollTop
  // ─────────────────────────────────────────────────
  syncScroll() {
    if (!this.overlayContainer || !this.contentTextarea) return;
    const scrollTop  = this.contentTextarea.scrollTop;
    const containerH = this.overlayContainer.offsetHeight;
    this.overlayContainer.querySelectorAll('.gpt-ann').forEach(bubble => {
      const absTop   = parseFloat(bubble.dataset.absTop);
      const centerX  = parseFloat(bubble.dataset.centerX);
      const finalTop = absTop - scrollTop;
      const inBounds = finalTop > -(this.BUBBLE_H + this.BOUNDS_TOP_EXTRA) && finalTop < containerH - this.BOUNDS_BOTTOM_MARGIN;
      bubble.style.visibility = inBounds ? 'visible' : 'hidden';
      bubble.style.transform =
        `translate(${centerX}px, ${finalTop}px) translateX(-50%)`;
    });
    this.overlayContainer.querySelectorAll('.gpt-ann-hline').forEach(lineEl => {
      const absLineTop   = parseFloat(lineEl.dataset.absLineTop);
      const lineLeft     = parseFloat(lineEl.dataset.lineLeft);
      const lineFinalTop = absLineTop - scrollTop;
      const inBounds = lineFinalTop > -(this.BUBBLE_H + this.BOUNDS_TOP_EXTRA) && lineFinalTop < containerH - this.BOUNDS_BOTTOM_MARGIN;
      lineEl.style.visibility = inBounds ? 'visible' : 'hidden';
      lineEl.style.transform = `translate(${lineLeft}px, ${lineFinalTop}px)`;
    });
  },

  // ─────────────────────────────────────────────────
  // 14. REVERT CHANGE
  //    先確保 currentVal 在 UndoManager 歷史中，再還原
  //    → Ctrl+Z 可撤銷 X 的動作
  // ─────────────────────────────────────────────────
  revertChange(group) {
    const ta = this.contentTextarea;
    if (!ta) return;

    const currentVal = ta.value;
    let newVal;

    switch (group.type) {
      case 'replace':
        // 把 content 中的 newText 換回 oldText
        newVal = currentVal.slice(0, group.contentStartIdx) +
                 group.oldText +
                 currentVal.slice(group.contentEndIdx);
        break;
      case 'insert':
        // 移除 content 中新增的 newText
        newVal = currentVal.slice(0, group.contentStartIdx) +
                 currentVal.slice(group.contentEndIdx);
        break;
      case 'delete':
        // 在刪除位置插入 oldText
        newVal = currentVal.slice(0, group.contentInsertIdx) +
                 group.oldText +
                 currentVal.slice(group.contentInsertIdx);
        break;
      default:
        return;
    }

    // 確保 currentVal 在 UndoManager 歷史中，讓 Ctrl+Z 可以還原到此狀態
    if (window.UndoManager && typeof window.UndoManager.addToHistory === 'function') {
      window.UndoManager.addToHistory(currentVal, ta);
    }

    ta.value = newVal;
    // 觸發 input 讓網站 React 感知，UndoManager 會自動將 newVal 加入歷史
    ta.dispatchEvent(new Event('input', { bubbles: true }));

    this.scheduleDiff();
  },

  // ─────────────────────────────────────────────────
  // 15. TOGGLE
  // ─────────────────────────────────────────────────
  toggle(enabled) {
    this.isEnabled = enabled;
    if (this.overlayContainer) {
      this.overlayContainer.style.display = enabled ? '' : 'none';
    }
    if (enabled) this.scheduleDiff();
  }
};

window.DiffHighlighter = DiffHighlighter;
