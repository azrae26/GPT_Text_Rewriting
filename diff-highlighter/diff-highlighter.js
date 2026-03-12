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

  // ─────────────────────────────────────────────────
  // 1. TOKENIZE
  //    優先順序（長匹配優先）：季度 4Q22 > 斜線數字 2023/24 > 純數字
  //    > ASCII 詞 > 中文字（單字）> 換行 > 空白序列 > 其他字元
  // ─────────────────────────────────────────────────
  tokenize(text) {
    const re = /\d+Q\d+|(?:\d+\/)+\d+|\d+(?:\.\d+)?|[a-zA-Z]+|\r?\n|[ \t]+|[\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff\u2e80-\u2eff\u31c0-\u31ef\u3200-\u32ff\u3300-\u33ff\ufe30-\ufe4f\uff00-\uffef]|./gu;
    const tokens = [];
    let m;
    while ((m = re.exec(text)) !== null) tokens.push(m[0]);
    return tokens;
  },

  // ─────────────────────────────────────────────────
  // 2. LCS-BASED DIFF
  //    回傳 ops 陣列，每個 op：{type:'equal'|'insert'|'delete', a?, b?}
  // ─────────────────────────────────────────────────
  computeDiff(aT, bT) {
    const m = aT.length, n = bT.length;
    const dp = Array.from({ length: m + 1 }, () => new Int32Array(n + 1));
    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        dp[i][j] = aT[i-1] === bT[j-1]
          ? dp[i-1][j-1] + 1
          : Math.max(dp[i-1][j], dp[i][j-1]);
      }
    }
    const ops = [];
    let i = m, j = n;
    while (i > 0 || j > 0) {
      if (i > 0 && j > 0 && aT[i-1] === bT[j-1]) {
        ops.unshift({ type: 'equal', a: aT[i-1], b: bT[j-1] });
        i--; j--;
      } else if (j > 0 && (i === 0 || dp[i][j-1] >= dp[i-1][j])) {
        ops.unshift({ type: 'insert', b: bT[j-1] });
        j--;
      } else {
        ops.unshift({ type: 'delete', a: aT[i-1] });
        i--;
      }
    }
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

    const aT     = this.tokenize(introText);
    const bT     = this.tokenize(contentText);
    const ops    = this.computeDiff(aT, bT);
    const groups = this.postProcessGroups(this.groupOps(ops));
    this.annotateGroupsWithIndices(groups);

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

        if (!oldTrimmed) {
          // 空白 → 有意義文字：視為新增
          bubble = this._makeBubble('insert', '+', g, ta, contentText,
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
        bubble = this._makeBubble('insert', '+', g, ta, contentText,
          g.contentStartIdx, g.newText, styles, scrollTop);

      } else if (g.type === 'delete') {
        // 純空白刪除 → 忽略
        if (WS_ONLY.test(g.oldText)) continue;
        // 刪除型：contentInsertIdx 指向刪除點前一字（'收'）
        // 取該字右緣作為 centerX，精確對準刪除縫隙
        const anchorIdx = Math.min(g.contentInsertIdx, contentText.length - 1);
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

    // 步驟3：label 不含中文（如 "1Q"、"FY23"）但 posStr 以中文字元開頭
    //   → LCS 把前一個 equal 區塊的末尾中文誤包進 newText（上文殘影），偏移 10-15px
    //   → 跳過開頭連續的中文區段，直到遇到非中文內容
    const CJK_RE  = /[\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff\u2e80-\u2eff\u31c0-\u31ef\u3200-\u32ff\u3300-\u33ff\ufe30-\ufe4f\uff00-\uffef]/;
    const labelHasCJK = CJK_RE.test(label);
    if (!labelHasCJK && posStr.length > 1) {
      // 匹配開頭連續的中文字元（含全形標點與空格）
      const cjkLeadRe = /^[\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff\u2e80-\u2eff\u31c0-\u31ef\u3200-\u32ff\u3300-\u33ff\ufe30-\ufe4f\uff00-\uffef\s]+/;
      const cjkLead  = posStr.match(cjkLeadRe);
      if (cjkLead && cjkLead[0].length < posStr.length) {
        posIdx += cjkLead[0].length;
        posStr  = posStr.slice(cjkLead[0].length);
      }
    }

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
    // 水平中心（相對於 overlay 容器左邊）
    // delete 型取右緣，對準刪除縫隙；其他型取中心
    const centerX = useRightEdge ? rightMost : (leftMost + rightMost) / 2;

    // [DEBUG] 位置診斷 log，確認後請移除
    const _cs = getComputedStyle(ta);
    console.log(`[DiffHighlighter] type=${type} label="${label}"`, {
      posIdx,
      posStr,
      positions_count: positions.length,
      leftMost:       leftMost.toFixed(1),
      rightMost:      rightMost.toFixed(1),
      centerX:        centerX.toFixed(1),
      pos0_top:       positions[0].top.toFixed(1),
      ta_paddingLeft: parseFloat(_cs.paddingLeft).toFixed(1),
      ta_borderLeft:  parseFloat(_cs.borderLeft).toFixed(1),
      overlay_left:   this.overlayContainer?.getBoundingClientRect().left.toFixed(1),
      ta_rect_left:   ta.getBoundingClientRect().left.toFixed(1),
    });

    // 泡泡頂端（相對於 overlay 容器，可為負值 → 浮在 textarea 上方）
    const absTop   = positions[0].top - this.BUBBLE_H - this.BUBBLE_GAP;
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
    const inBounds = finalTop > -(this.BUBBLE_H + 10) && finalTop < containerH;
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

    return bubble;
  },

  _abbrev(text, max = 30) {
    return text.length > max ? text.slice(0, max) + '…' : text;
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
      const inBounds = finalTop > -(this.BUBBLE_H + 10) && finalTop < containerH;
      bubble.style.visibility = inBounds ? 'visible' : 'hidden';
      bubble.style.transform =
        `translate(${centerX}px, ${finalTop}px) translateX(-50%)`;
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
