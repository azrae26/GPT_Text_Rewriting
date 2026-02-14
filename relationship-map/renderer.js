/**
 * RelationshipRenderer - 自動化產業關係圖渲染模組
 * 
 * 功能：接收結構化關係資料 (JSON)，自動計算佈局、節點大小、顏色，
 *       並渲染互動式 D3.js 力導向圖
 *       內建佈局控制系統（LAYOUT_GOALS），透過預模擬 + 核心散佈 + 自適應視窗達成：
 *       1. 不出界（完整視覺範圍含光暈/標籤皆在視窗內）
 *       2. 盡量填滿空間（覆蓋率目標 ~65%）
 *       3. 避開圖例框（可用區域視為「矩形扣掉圖例」的不規則形狀）
 *       4. 核心主題採最佳散佈（依可用區域與長寬比自動分散）
 *       5. 連線長度約主體尺寸 2 倍
 * 依賴：D3.js v7（需在此檔案之前載入）
 * 
 * 支援兩種資料格式：
 * 
 * ═══ 精簡格式（推薦，token 省 50%+）═══
 * {
 *   "title": "圖表標題",
 *   "cores": [
 *     ["核心公司A", "描述"],
 *     ["核心公司B", "描述"]
 *   ],
 *   "coreLinks": [["公司A", "公司B", "上下游關係"]],
 *   "nodes": [
 *     ["公司名", "type", "描述(選填)", [["連接對象","關係標籤"], ...]]
 *   ]
 * }
 *
 * ═══ 完整格式（向下相容）═══
 * {
 *   "title": "圖表標題",
 *   "nodes": [{ "name": "公司A", "type": "core", "desc": "描述" }],
 *   "links": [{ "source": "公司A", "target": "公司B", "label": "關係" }]
 * }
 */
(function () {
  'use strict';

  // ═══════════════════════════════════════════
  // 常數定義
  // ═══════════════════════════════════════════

  /** 核心節點調色盤（依序分配給每個 core 節點） */
  const CORE_PALETTE = [
    '#ff6b6b', // 紅
    '#4d96ff', // 藍
    '#2dd4bf', // 青綠
    '#f97316', // 橘
    '#a78bfa', // 紫
    '#f472b6', // 粉
    '#facc15', // 黃
    '#34d399', // 綠
  ];

  /** 節點類型顏色（非 core 節點使用） */
  const TYPE_COLORS = {
    subsidiary: '#ffd93d',
    customer: '#6bcb77',
    competitor: '#4d96ff',
    supply: '#c084fc',
    driver: '#f97316',
  };

  /** 節點類型中文標籤 */
  const TYPE_LABELS = {
    core: '核心主體',
    subsidiary: '子公司',
    customer: '客戶',
    competitor: '競爭對手',
    supply: '供應鏈',
    driver: '平台方',
  };

  /** 節點大小設定 */
  const SIZE = {
    CORE_RADIUS: 48,
    MIN_RADIUS: 14,
    MAX_RADIUS: 38,
    BASE_RADIUS: 14,
    PER_LINK_BONUS: 3.5,
  };

  /** 佈局目標與力參數 */
  const LAYOUT_GOALS = {
    TARGET_COVERAGE: 0.65,      // 目標覆蓋率（越大→節點佔螢幕越滿；越小→越空曠）
    LINK_BODY_RATIO: 1,         // 連線基礎長度 = 主體尺寸 × 此值（越大→連線越長；越小→越短）
    LINK_OUTER_STRETCH: 1.8,    // 外圍衛星額外拉長倍率（越大→外圈越開；越小→越貼核心）
    LINK_STRENGTH: 0.8,         // 連線彈簧剛性（越大→越尊重目標距離；越小→越鬆散）
    LINK_UPSTREAM_RATIO: 1.3,   // 上下游連線距離倍率（越大→核心間連線越長；越小→越短）
    LINK_UPSTREAM_STRENGTH: 0.38, // 上下游連線剛性（越大→核心間距越穩；越小→越鬆）
    BOUNDARY_PADDING: 12,       // 邊界安全距離 px（越大→離邊越遠；越小→越貼邊）
    COLLISION_BASE_PAD: 8,      // 碰撞間距 px（越大→圈圈間隔越寬；越小→越擠）
    NORM_POST_ITERS: 50,        // 歸一化後碰撞修正次數（越大→修正越徹底；越小→越快但可能殘留重疊）
    CHARGE_CORE: -1480,         // 核心排斥力（越負→核心推越開；越接近 0→越擠）
    CHARGE_NODE: -120,          // 非核心排斥力（越負→小圈推越開；越接近 0→越擠）
    CORE_SPREAD: 0.12,          // 核心分佈半徑 = 短邊 × 此值（越大→核心越分散；越小→越集中）
    CENTER_STRENGTH: 0.024,     // 中心吸引力（越大→全體越往中間擠；越小→越自由散開）
    FORCE_XY_BASE: 0.07,        // 目標位置吸引力（越大→節點越黏目標位置；越小→越受其他力影響）
    CORE_PACKING_STRENGTH: 0.12, // 核心散佈力（越大→核心越快到錨點；越小→越受其他力牽制）
    CORE_PACKING_LEGEND_GAP: 14, // 圖例避讓間距 px（越大→核心離圖例越遠；越小→越近）
    CORE_PACKING_MIN_ZONE: 90,   // 可用區塊最小尺寸 px（越大→忽略更多小區塊；越小→更積極使用邊角）
    CORE_PACKING_CENTER_BIAS: 0.07, // 核心靠中偏好（越大→核心越往中間放；越小→越往邊角展開）
    CORE_PACKING_MAX_DIST_RATIO: 0.56, // 核心最大距離 = 短邊 × 此值（越大→核心可離越遠；越小→越近）
    CORE_PACKING_AXIS_RATIO_WEIGHT: 3.6, // 長寬比權重（越大→越強制橫扁直長；越小→越接近正圓分佈）
    CORE_PACKING_SWAP_PASSES: 2, // 局部優化輪數（越大→選點品質越高但越慢；越小→越快但可能非最佳）
    REF_SHORT_SIDE: 680,        // 參考座標系短邊（越小→圈圈文字在大螢幕越大；越大→越小）
  };

  /** 動畫與模擬速度參數 */
  const SIM_CONFIG = {
    ALPHA: 3.5,                 // 初始能量（越大→動畫移動距離越長；越小→越短促）
    ALPHA_DECAY: 0.03,          // 能量衰減速率（越大→收斂越快動畫越短；越小→越慢越長）
    VELOCITY_DECAY: 0.6,        // 速度阻力（越大→節點越黏滯；越小→越滑順）
    LINEAR_THRESHOLD: 0.3,      // 線性收尾門檻（越大→越早切線性尾段；越小→越晚切）
    LINEAR_STEP: 0.012,         // 線性收尾步長（越大→尾段越快結束；越小→越慢淡出）
    PRE_SIM_TICKS: 500,         // 預模擬次數（越大→初始佈局越穩定但越慢；越小→越快但可能未收斂）
    VIEW_SMOOTHING: 0.22,       // 視窗追蹤平滑度（越大→鏡頭反應越快；越小→越柔和但延遲）
    VIEW_PADDING_X: 20,         // 左右留白 px（越大→左右空間越多；越小→越貼邊）
    VIEW_PADDING_TOP: 30,       // 上方留白 px（越大→頂部空間越多；越小→越貼頂）
    VIEW_PADDING_BOTTOM: 16,    // 下方留白 px（越大→底部空間越多；越小→越貼底）
  };

  // ═══════════════════════════════════════════
  // RelationshipRenderer 類別
  // ═══════════════════════════════════════════

  class RelationshipRenderer {
    /**
     * @param {string|HTMLElement} container - SVG 容器元素或 CSS 選擇器
     * @param {Object} data - 關係資料 JSON
     * @param {Object} [options] - 可選設定
     * @param {string} [options.theme='dark'] - 主題 ('dark' | 'light')
     */
    constructor(container, data, options = {}) {
      this.container = typeof container === 'string'
        ? document.querySelector(container)
        : container;
      this.rawData = data;
      this.options = {
        theme: options.theme || 'dark',
      };

      // 內部狀態
      this.simulation = null;
      this.svg = null;
      this.g = null; // 主要繪圖群組
      this.tooltip = null;
      this.processedNodes = [];
      this.processedLinks = [];
      this.coreNodes = [];
      this.coreColorMap = {}; // coreName → color
      this.corePositionMap = {}; // coreName → { x, y }
      this.layoutProfile = null; // 視窗感知佈局參數
      this._legendAvoidRect = null; // 世界座標中的圖例避障區塊
      this._corePackingDirty = false;
      this.markCorePackingDirty();
      this.width = 0;
      this.height = 0;
      this._viewportBucket = '';
    }

    // ─── 公開方法 ───

    /** 渲染圖表 */
    render() {
      this.destroy();

      // 自動偵測並展開精簡格式
      if (this.rawData.cores) {
        this.rawData = RelationshipRenderer.expandCompact(this.rawData);
      }

      this._measure();
      this._viewportBucket = this._getViewportBucket();
      this._validate();
      this._processData();
      this._createSvg();
      this._createSimulation();
      this._drawGraph();
      this._setupInteractions();
      return this;
    }

    /** 銷毀圖表，釋放資源 */
    destroy() {
      if (this._resizeHandler) {
        window.removeEventListener('resize', this._resizeHandler);
        this._resizeHandler = null;
      }
      if (this.simulation) {
        this.simulation.stop();
        this.simulation = null;
      }
      if (this.svg) {
        this.svg.remove();
        this.svg = null;
      }
      if (this.tooltip) {
        this.tooltip.remove();
        this.tooltip = null;
      }
      this._legendAvoidRect = null;
      this.g = null;
    }

    /**
     * 圖例定位後呼叫：帶著避障區重跑預模擬 → 更新 _finalPositions → 重新 fit
     * 確保 fit 邊界把「節點閃圖例後的新位置」算進去
     */
    refineLayout() {
      if (!this._legendAvoidRect || !this.simulation) return;

      const profile = this.layoutProfile || this._buildLayoutProfile();
      this.markCorePackingDirty();
      this._applyCoreAnchors(true);
      this._prepareLayoutForAnimation(profile);

      // 重啟動畫
      this._linearMode = false;
      this.simulation.alpha(SIM_CONFIG.ALPHA).alphaDecay(SIM_CONFIG.ALPHA_DECAY).restart();
    }

    /** 取得目前使用的資料格式資訊（供除錯） */
    getInfo() {
      return {
        nodes: this.processedNodes.length,
        links: this.processedLinks.length,
        cores: this.coreNodes.map(n => n.name),
      };
    }

    // ─── 私有方法：資料處理 ───

    _measure() {
      const rect = this.container.getBoundingClientRect();
      // 實際螢幕像素（供 HTML 圖例定位使用）
      this._realWidth = rect.width || window.innerWidth;
      this._realHeight = rect.height || window.innerHeight;

      // 參考座標系：短邊固定為 REF_SHORT_SIDE，SVG viewBox 使用此座標
      // → 圈圈、文字等 SVG 元素會自動按螢幕比例放大
      const refShort = LAYOUT_GOALS.REF_SHORT_SIDE;
      const aspect = this._realWidth / this._realHeight;
      if (aspect >= 1) {
        // 橫向：高度 = refShort，寬度按比例
        this.height = refShort;
        this.width = refShort * aspect;
      } else {
        // 直向：寬度 = refShort，高度按比例
        this.width = refShort;
        this.height = refShort / aspect;
      }
      // viewBox → 螢幕像素的縮放比（用於座標轉換）
      this._vbScale = this._realHeight / this.height;
      this.markCorePackingDirty();
    }

    _validate() {
      const d = this.rawData;
      if (!d || !Array.isArray(d.nodes) || !Array.isArray(d.links)) {
        throw new Error('❌ 資料格式錯誤：需要 { nodes: [...], links: [...] }');
      }
      if (d.nodes.length === 0) {
        throw new Error('❌ 資料錯誤：nodes 陣列不能為空');
      }
      const coreCount = d.nodes.filter(n => n.type === 'core').length;
      if (coreCount === 0) {
        throw new Error('❌ 資料錯誤：至少需要一個 type="core" 的節點');
      }
      if (coreCount > CORE_PALETTE.length) {
        throw new Error(`❌ 核心節點數量超過上限（最多 ${CORE_PALETTE.length} 個）`);
      }
      // 檢查 links 的 source/target 是否都存在
      const nameSet = new Set(d.nodes.map(n => n.name));
      d.links.forEach((l, i) => {
        if (!nameSet.has(l.source)) {
          throw new Error(`❌ links[${i}].source "${l.source}" 不存在於 nodes 中`);
        }
        if (!nameSet.has(l.target)) {
          throw new Error(`❌ links[${i}].target "${l.target}" 不存在於 nodes 中`);
        }
      });
    }

    _processData() {
      const d = this.rawData;
      this.layoutProfile = this._buildLayoutProfile();

      // 1. 辨識 core 節點並分配顏色
      this.coreNodes = d.nodes.filter(n => n.type === 'core');
      this.coreColorMap = {};
      this.coreNodes.forEach((core, i) => {
        this.coreColorMap[core.name] = CORE_PALETTE[i % CORE_PALETTE.length];
      });

      // 2. 計算每個節點的連線數
      const linkCount = {};
      d.nodes.forEach(n => { linkCount[n.name] = 0; });
      d.links.forEach(l => {
        linkCount[l.source] = (linkCount[l.source] || 0) + 1;
        linkCount[l.target] = (linkCount[l.target] || 0) + 1;
      });

      // 3. 計算每個節點連接到哪些 core
      const coreNames = new Set(this.coreNodes.map(n => n.name));
      const nodeConnectedCores = {}; // nodeName → Set of core names
      d.nodes.forEach(n => { nodeConnectedCores[n.name] = new Set(); });

      d.links.forEach(l => {
        if (coreNames.has(l.source)) nodeConnectedCores[l.target].add(l.source);
        if (coreNames.has(l.target)) nodeConnectedCores[l.source].add(l.target);
      });

      // 對 core 節點本身，加入自己
      coreNames.forEach(name => { nodeConnectedCores[name].add(name); });

      // 二次傳播：如果節點沒有直接連到任何 core，從鄰居繼承
      d.links.forEach(l => {
        if (nodeConnectedCores[l.source].size === 0 && nodeConnectedCores[l.target].size > 0) {
          nodeConnectedCores[l.target].forEach(c => nodeConnectedCores[l.source].add(c));
        }
        if (nodeConnectedCores[l.target].size === 0 && nodeConnectedCores[l.source].size > 0) {
          nodeConnectedCores[l.source].forEach(c => nodeConnectedCores[l.target].add(c));
        }
      });

      // 4. 計算 core 佈局位置
      this._computeCorePositions();

      // 5. 建立 processedNodes
      this.processedNodes = d.nodes.map(n => {
        const isCore = n.type === 'core';
        const connCount = linkCount[n.name] || 0;
        const r = isCore
          ? SIZE.CORE_RADIUS
          : Math.min(SIZE.MAX_RADIUS, SIZE.BASE_RADIUS + connCount * SIZE.PER_LINK_BONUS);
        const labelHalfW = this._estimateNodeLabelHalfWidth(n.name, isCore, r);

        // 計算目標位置
        const connected = nodeConnectedCores[n.name];
        let target = this._computeTargetPosition(n.name, connected);

        return {
          id: n.name,
          group: n.type || 'customer',
          r: r,
          desc: n.desc || '',
          connectedCores: connected,
          targetX: target.x,
          targetY: target.y,
          _labelHalfW: labelHalfW,
          _isCore: isCore,
        };
      });

      // 6. 建立 processedLinks
      this.processedLinks = d.links.map(l => {
        // 判斷連線類型與顏色
        const srcIsCore = coreNames.has(l.source);
        const tgtIsCore = coreNames.has(l.target);
        let type = 'other';

        if (srcIsCore && tgtIsCore) {
          type = 'upstream'; // 兩個 core 之間
        } else if (srcIsCore) {
          type = l.source; // 以 source core 的名字作為 type
        } else if (tgtIsCore) {
          type = l.target;
        } else {
          // 兩端都不是 core，嘗試找最近的 core
          const srcCores = nodeConnectedCores[l.source];
          if (srcCores.size === 1) {
            type = [...srcCores][0];
          }
        }

        return {
          source: l.source,
          target: l.target,
          label: l.label || '',
          _type: type,
        };
      });
    }

    _computeCorePositions() {
      const cx = this.width / 2;
      const cy = this.height / 2;
      const count = this.coreNodes.length;
      const profile = this.layoutProfile || this._buildLayoutProfile();
      const rx = profile.coreRx;
      const ry = profile.coreRy;
      const aspect = profile.aspect;

      this.corePositionMap = {};

      if (count === 1) {
        this.corePositionMap[this.coreNodes[0].name] = { x: cx, y: cy };
      } else if (count === 2) {
        // 視窗感知：寬螢幕左右展開、窄螢幕上下展開
        if (aspect < 0.95) {
          this.corePositionMap[this.coreNodes[0].name] = { x: cx, y: cy - ry * 1.05 };
          this.corePositionMap[this.coreNodes[1].name] = { x: cx, y: cy + ry * 1.05 };
        } else {
          this.corePositionMap[this.coreNodes[0].name] = { x: cx - rx * 1.05, y: cy };
          this.corePositionMap[this.coreNodes[1].name] = { x: cx + rx * 1.05, y: cy };
        }
      } else if (count === 3) {
        // 視窗感知：窄螢幕改為「上一下二」，寬螢幕偏「左右下」
        if (aspect < 0.95) {
          this.corePositionMap[this.coreNodes[0].name] = { x: cx, y: cy - ry * 1.08 };
          this.corePositionMap[this.coreNodes[1].name] = { x: cx - rx * 0.95, y: cy + ry * 0.62 };
          this.corePositionMap[this.coreNodes[2].name] = { x: cx + rx * 0.95, y: cy + ry * 0.62 };
        } else {
          this.corePositionMap[this.coreNodes[0].name] = { x: cx - rx, y: cy - ry * 0.18 };
          this.corePositionMap[this.coreNodes[1].name] = { x: cx + rx, y: cy - ry * 0.18 };
          this.corePositionMap[this.coreNodes[2].name] = { x: cx, y: cy + ry * 0.95 };
        }
      } else {
        // N 個 core：均勻分佈在橢圓上（依視窗比例調整）
        const startAngle = -Math.PI / 2; // 從正上方開始
        this.coreNodes.forEach((core, i) => {
          const angle = startAngle + (2 * Math.PI * i) / count;
          this.corePositionMap[core.name] = {
            x: cx + rx * Math.cos(angle),
            y: cy + ry * Math.sin(angle),
          };
        });
      }
    }

    _computeTargetPosition(nodeName, connectedCores) {
      const cx = this.width / 2;
      const cy = this.height / 2;
      const profile = this.layoutProfile || this._buildLayoutProfile();

      if (connectedCores.size === 0) {
        return { x: cx, y: cy };
      }

      // 如果是 core 自身
      if (this.corePositionMap[nodeName]) {
        return this.corePositionMap[nodeName];
      }

      // 計算所有連接 core 位置的重心
      let sumX = 0, sumY = 0, count = 0;
      connectedCores.forEach(coreName => {
        const pos = this.corePositionMap[coreName];
        if (pos) {
          sumX += pos.x;
          sumY += pos.y;
          count++;
        }
      });

      if (count === 0) return { x: cx, y: cy };
      const avgX = sumX / count;
      const avgY = sumY / count;

      // 依視窗比例做軸向擴張：窄螢幕多用 Y，寬螢幕多用 X
      let dx = avgX - cx;
      let dy = avgY - cy;

      // 共用核心太多時可能落在中心，給穩定且可重現的小偏移避免重疊
      if (Math.abs(dx) + Math.abs(dy) < 1e-6) {
        const h = this._nameHash(nodeName);
        const angle = (h % 360) * (Math.PI / 180);
        const jitter = connectedCores.size >= 3 ? 18 : 26;
        dx = Math.cos(angle) * jitter;
        dy = Math.sin(angle) * jitter;
      }

      // 單核心連接的節點更外擴，多核心收斂一些避免過度離散
      const spread = connectedCores.size <= 1
        ? 1.18
        : (connectedCores.size === 2 ? 1.04 : 0.92);

      return {
        x: cx + dx * profile.nodeStretchX * spread,
        y: cy + dy * profile.nodeStretchY * spread,
      };
    }

    _nameHash(text) {
      let hash = 0;
      for (let i = 0; i < text.length; i++) {
        hash = ((hash << 5) - hash + text.charCodeAt(i)) | 0;
      }
      return Math.abs(hash);
    }

    _estimateNodeLabelHalfWidth(name, isCore, r) {
      const fontSize = isCore ? 15 : (r > 26 ? 11 : 9.5);
      const lines = String(name || '').split('\n');

      const lineWidth = (line) => {
        let width = 0;
        for (const ch of line) {
          // CJK 字寬約 1.0em，ASCII 約 0.58em
          width += /[\u4e00-\u9fff\u3040-\u30ff\uac00-\ud7af]/.test(ch)
            ? fontSize
            : fontSize * 0.58;
        }
        return width;
      };

      const maxW = lines.reduce((m, line) => Math.max(m, lineWidth(line)), 0);
      return maxW / 2 + 2; // 少量抗鋸齒邊界
    }

    _clamp(v, min, max) {
      return Math.max(min, Math.min(max, v));
    }

    /** 集中標記 corePacking 需重算，避免分散設定造成遺漏 */
    markCorePackingDirty() {
      this._corePackingDirty = true;
    }

    /**
     * 計算當前佈局指標
     * @returns {{ coverage, bbox }}
     */
    _computeLayoutMetrics() {
      const nodes = this.processedNodes;
      const w = this.width, h = this.height;

      // ── 覆蓋率：節點視覺 bbox 面積 / 視窗面積 ──
      let bMinX = Infinity, bMinY = Infinity, bMaxX = -Infinity, bMaxY = -Infinity;
      nodes.forEach(n => {
        const ext = RelationshipRenderer._nodeVisualExtent(n.r, !!n._isCore, n._labelHalfW || 0);
        bMinX = Math.min(bMinX, n.x - ext.left);
        bMinY = Math.min(bMinY, n.y - ext.top);
        bMaxX = Math.max(bMaxX, n.x + ext.right);
        bMaxY = Math.max(bMaxY, n.y + ext.bottom);
      });
      const contentW = bMaxX - bMinX;
      const contentH = bMaxY - bMinY;
      const coverage = (contentW * contentH) / (w * h);

      return {
        coverage,
        bbox: { minX: bMinX, minY: bMinY, maxX: bMaxX, maxY: bMaxY },
      };
    }

    _buildLayoutProfile() {
      const w = this.width || 1;
      const h = this.height || 1;
      const aspect = w / h;

      const portraitBias = this._clamp((1 - aspect) / 0.45, 0, 1);
      const landscapeBias = this._clamp((aspect - 1) / 0.75, 0, 1);
      const baseR = Math.min(w, h) * LAYOUT_GOALS.CORE_SPREAD;

      // 直式畫面加強「壓 X、展 Y」，減少左右溢出並提高上下利用
      const coreRx = Math.min(w * 0.36, baseR * (0.9 + landscapeBias * 0.58 - portraitBias * 0.28));
      const coreRy = Math.min(h * 0.46, baseR * (0.9 + portraitBias * 0.95 - landscapeBias * 0.08));

      const xyBase = LAYOUT_GOALS.FORCE_XY_BASE;
      const centerBase = LAYOUT_GOALS.CENTER_STRENGTH;

      return {
        aspect,
        coreRx,
        coreRy,
        nodeStretchX: 1 + landscapeBias * 0.3 - portraitBias * 0.38,
        nodeStretchY: 1 + portraitBias * 0.56 - landscapeBias * 0.12,
        forceXStrength: xyBase * (1 + landscapeBias * 0.3 - portraitBias * 0.22),
        forceYStrength: xyBase * (1 + portraitBias * 0.3 - landscapeBias * 0.22),
        centerStrength: centerBase + (portraitBias + landscapeBias) * 0.008,
      };
    }

    _getCoreSafeWorldRect() {
      const pad = LAYOUT_GOALS.BOUNDARY_PADDING;
      const maxCoreLabelHalfW = this.processedNodes
        .filter(n => n._isCore)
        .reduce((m, n) => Math.max(m, n._labelHalfW || 0), 0);
      const ext = RelationshipRenderer._nodeVisualExtent(SIZE.CORE_RADIUS, true, maxCoreLabelHalfW);
      return {
        left: ext.left + pad,
        right: this.width - ext.right - pad,
        top: ext.top + pad,
        bottom: this.height - ext.bottom - pad,
      };
    }

    _clipRect(rect, bound) {
      const left = Math.max(rect.left, bound.left);
      const right = Math.min(rect.right, bound.right);
      const top = Math.max(rect.top, bound.top);
      const bottom = Math.min(rect.bottom, bound.bottom);
      if (right <= left || bottom <= top) return null;
      return { left, right, top, bottom };
    }

    _getCoreUsableZones() {
      const safe = this._getCoreSafeWorldRect();
      const minZone = LAYOUT_GOALS.CORE_PACKING_MIN_ZONE;
      const rect = this._legendAvoidRect;
      if (!rect) return [safe];

      const gap = LAYOUT_GOALS.CORE_PACKING_LEGEND_GAP;
      const legend = this._clipRect({
        left: rect.left - gap,
        right: rect.right + gap,
        top: rect.top - gap,
        bottom: rect.bottom + gap,
      }, safe);
      if (!legend) return [safe];

      // 矩形扣除 legend 後的「不規則可用區域」以最多 4 個子矩形表示
      const zones = [
        { left: safe.left, right: legend.left, top: safe.top, bottom: safe.bottom },       // 左
        { left: legend.right, right: safe.right, top: safe.top, bottom: safe.bottom },      // 右
        { left: legend.left, right: legend.right, top: safe.top, bottom: legend.top },      // 上
        { left: legend.left, right: legend.right, top: legend.bottom, bottom: safe.bottom }, // 下
      ].filter(z => (z.right - z.left) >= minZone && (z.bottom - z.top) >= minZone);

      return zones.length ? zones : [safe];
    }

    _buildCorePackingCandidates(coreCount) {
      const zones = this._getCoreUsableZones();
      const shortSide = Math.min(this.width, this.height);
      const step = this._clamp(
        shortSide / Math.max(5, Math.sqrt(coreCount) * 2.8),
        34,
        92,
      );

      const candidates = [];
      const keySet = new Set();
      const pushPoint = (x, y) => {
        const key = `${Math.round(x)}:${Math.round(y)}`;
        if (keySet.has(key)) return;
        keySet.add(key);
        candidates.push({ x, y });
      };

      zones.forEach(z => {
        pushPoint((z.left + z.right) / 2, (z.top + z.bottom) / 2);
        for (let x = z.left; x <= z.right + 0.1; x += step) {
          for (let y = z.top; y <= z.bottom + 0.1; y += step) {
            pushPoint(x, y);
          }
        }
      });

      return candidates;
    }

    _pickCoreAnchors(candidates, coreCount) {
      if (!candidates.length || coreCount <= 0) return [];
      if (coreCount === 1) return [candidates[0]];

      const centerX = this.width / 2;
      const centerY = this.height / 2;
      const shortSide = Math.max(1, Math.min(this.width, this.height));
      const aspect = this._clamp((this.width || 1) / (this.height || 1), 0.55, 1.85);
      const isLandscape = aspect >= 1;
      const centerBias = LAYOUT_GOALS.CORE_PACKING_CENTER_BIAS;
      const maxCoreDistNorm = LAYOUT_GOALS.CORE_PACKING_MAX_DIST_RATIO;

      const normPts = candidates.map(c => ({
        x: (c.x - centerX) / shortSide,
        y: (c.y - centerY) / shortSide,
      }));

      const scoreSet = (idxSet) => {
        const n = idxSet.length;
        if (!n) return -Infinity;

        let minD2 = Infinity;
        let sumD2 = 0;
        let pairCount = 0;
        let overPenalty = 0;
        let centerAvgD2 = 0;

        for (let i = 0; i < n; i++) {
          const pi = normPts[idxSet[i]];
          centerAvgD2 += pi.x * pi.x + pi.y * pi.y;
          for (let j = i + 1; j < n; j++) {
            const pj = normPts[idxSet[j]];
            const dx = pi.x - pj.x;
            const dy = pi.y - pj.y;
            const d2 = dx * dx + dy * dy;
            minD2 = Math.min(minD2, d2);
            sumD2 += d2;
            pairCount++;
            const d = Math.sqrt(d2);
            if (d > maxCoreDistNorm) {
              const over = d - maxCoreDistNorm;
              overPenalty += over * over;
            }
          }
        }
        centerAvgD2 /= n;

        // 2D 分散指標：共線時 det 接近 0
        let mx = 0, my = 0;
        idxSet.forEach(idx => { mx += normPts[idx].x; my += normPts[idx].y; });
        mx /= n;
        my /= n;
        let sxx = 0, syy = 0, sxy = 0;
        idxSet.forEach(idx => {
          const dx = normPts[idx].x - mx;
          const dy = normPts[idx].y - my;
          sxx += dx * dx;
          syy += dy * dy;
          sxy += dx * dy;
        });
        sxx /= n;
        syy /= n;
        sxy /= n;
        const axisRatio = (sxx + 1e-6) / (syy + 1e-6);
        const axisErr = Math.log(axisRatio / aspect);
        const axisPenalty = axisErr * axisErr * LAYOUT_GOALS.CORE_PACKING_AXIS_RATIO_WEIGHT;
        const majorSpread = isLandscape ? sxx : syy;
        const minorSpread = isLandscape ? syy : sxx;

        const avgD2 = pairCount ? (sumD2 / pairCount) : 0;
        let score = minD2 * 2.6
          + avgD2 * 0.85
          + majorSpread * 2.1
          - minorSpread * 0.12
          - centerAvgD2 * centerBias
          - overPenalty * 1.1
          - axisPenalty;

        return score;
      };

      // 初始種子：依畫面主軸優先展開，避免先天就卡在中間
      let firstIdx = 0;
      let firstScore = -Infinity;
      normPts.forEach((p, idx) => {
        const primary = isLandscape ? Math.abs(p.x) : Math.abs(p.y);
        const secondary = isLandscape ? Math.abs(p.y) : Math.abs(p.x);
        const dist2 = p.x * p.x + p.y * p.y;
        const s = primary * primary * 1.25 - secondary * secondary * 0.25 - centerBias * dist2 * 0.18;
        if (s > firstScore) {
          firstScore = s;
          firstIdx = idx;
        }
      });

      const selectedIdx = [firstIdx];
      while (selectedIdx.length < coreCount) {
        let bestIdx = -1;
        let bestScore = -Infinity;
        for (let i = 0; i < candidates.length; i++) {
          if (selectedIdx.includes(i)) continue;
          const trial = selectedIdx.concat(i);
          const s = scoreSet(trial);
          if (s > bestScore) {
            bestScore = s;
            bestIdx = i;
          }
        }
        if (bestIdx < 0) break;
        selectedIdx.push(bestIdx);
      }

      // 局部最佳化：逐點替換提升整體分散品質
      const passes = Math.max(0, LAYOUT_GOALS.CORE_PACKING_SWAP_PASSES | 0);
      for (let pass = 0; pass < passes; pass++) {
        let improved = false;
        for (let pos = 0; pos < selectedIdx.length; pos++) {
          let bestIdx = selectedIdx[pos];
          let bestScore = scoreSet(selectedIdx);
          for (let i = 0; i < candidates.length; i++) {
            if (selectedIdx.includes(i)) continue;
            const trial = selectedIdx.slice();
            trial[pos] = i;
            const s = scoreSet(trial);
            if (s > bestScore + 1e-6) {
              bestScore = s;
              bestIdx = i;
            }
          }
          if (bestIdx !== selectedIdx[pos]) {
            selectedIdx[pos] = bestIdx;
            improved = true;
          }
        }
        if (!improved) break;
      }

      return selectedIdx.map(i => candidates[i]);
    }

    _applyCoreAnchors(forceUpdate = false) {
      const cores = this.processedNodes.filter(n => n._isCore);
      if (!cores.length) return;

      const needRefresh = forceUpdate || this._corePackingDirty;
      if (!needRefresh) return;
      this._corePackingDirty = false;

      const candidates = this._buildCorePackingCandidates(cores.length);
      const anchors = this._pickCoreAnchors(candidates, cores.length);
      if (!anchors.length) return;

      // 用「最接近既有核心位置」的方式配對，降低抖動
      const restAnchors = anchors.slice();
      const sortedCores = cores.slice().sort((a, b) => a.id.localeCompare(b.id));
      let coreShift = 0;
      sortedCores.forEach(core => {
        let bestIdx = 0;
        let bestDist = Infinity;
        restAnchors.forEach((a, idx) => {
          const tx = core.targetX ?? core.x;
          const ty = core.targetY ?? core.y;
          const dx = tx - a.x;
          const dy = ty - a.y;
          const d = dx * dx + dy * dy;
          if (d < bestDist) {
            bestDist = d;
            bestIdx = idx;
          }
        });
        const pick = restAnchors.splice(bestIdx, 1)[0];
        if (!pick) return;
        this.corePositionMap[core.id] = { x: pick.x, y: pick.y };
        const dx = (core.targetX ?? core.x) - pick.x;
        const dy = (core.targetY ?? core.y) - pick.y;
        coreShift += Math.sqrt(dx * dx + dy * dy);
      });

      // 若核心錨點有明顯變動，重算全部節點 target，避免 x/y 力與新核心分佈衝突
      if (coreShift > 1) {
        this.processedNodes.forEach(n => {
          const t = this._computeTargetPosition(n.id, n.connectedCores || new Set());
          n.targetX = t.x;
          n.targetY = t.y;
        });

        if (this.simulation && this.layoutProfile) {
          this.simulation.force('x', d3.forceX(d => d.targetX).strength(this.layoutProfile.forceXStrength));
          this.simulation.force('y', d3.forceY(d => d.targetY).strength(this.layoutProfile.forceYStrength));
        }
      }
    }

    _getViewportBucket() {
      const aspect = (this.width || 1) / (this.height || 1);
      if (aspect < 0.95) return 'portrait';
      if (aspect > 1.2) return 'landscape';
      return 'balanced';
    }

    // ─── 私有方法：SVG 建立 ───

    _createSvg() {
      // 建立 SVG
      this.svg = d3.select(this.container).append('svg')
        .attr('width', '100%')
        .attr('height', '100%')
        .attr('viewBox', [0, 0, this.width, this.height]);

      const defs = this.svg.append('defs');

      // Glow 濾鏡
      const glow = defs.append('filter').attr('id', 'rr-glow');
      glow.append('feGaussianBlur').attr('stdDeviation', '3.5').attr('result', 'blur');
      const merge1 = glow.append('feMerge');
      merge1.append('feMergeNode').attr('in', 'blur');
      merge1.append('feMergeNode').attr('in', 'SourceGraphic');

      const coreGlow = defs.append('filter').attr('id', 'rr-coreGlow');
      coreGlow.append('feGaussianBlur').attr('stdDeviation', '7').attr('result', 'blur');
      const merge2 = coreGlow.append('feMerge');
      merge2.append('feMergeNode').attr('in', 'blur');
      merge2.append('feMergeNode').attr('in', 'SourceGraphic');

      // 為每對 core 建立漸層
      const coreList = this.coreNodes.map(n => n.name);
      for (let i = 0; i < coreList.length; i++) {
        for (let j = i + 1; j < coreList.length; j++) {
          const gradId = `rr-grad-${i}-${j}`;
          const grad = defs.append('linearGradient').attr('id', gradId);
          grad.append('stop').attr('offset', '0%').attr('stop-color', this.coreColorMap[coreList[i]]);
          grad.append('stop').attr('offset', '100%').attr('stop-color', this.coreColorMap[coreList[j]]);
        }
      }

      // Zoom
      this.g = this.svg.append('g');
      this.zoomBehavior = d3.zoom()
        .scaleExtent([0.15, 4])
        .on('zoom', (event) => this.g.attr('transform', event.transform));
      this.svg.call(this.zoomBehavior);

      // Tooltip
      this.tooltip = d3.select('body').append('div')
        .attr('class', 'rr-tooltip')
        .style('position', 'fixed')
        .style('background', 'rgba(15, 20, 55, 0.96)')
        .style('border', '1px solid rgba(100, 160, 255, 0.35)')
        .style('border-radius', '10px')
        .style('padding', '14px 18px')
        .style('color', '#e0e6ed')
        .style('font-size', '12px')
        .style('line-height', '1.65')
        .style('max-width', '380px')
        .style('pointer-events', 'none')
        .style('opacity', '0')
        .style('transition', 'opacity 0.2s')
        .style('z-index', '10000')
        .style('backdrop-filter', 'blur(10px)')
        .style('box-shadow', '0 8px 32px rgba(0,0,0,0.5)')
        .style('font-family', "'Microsoft JhengHei', 'Segoe UI', sans-serif");
    }

    // ─── 私有方法：自適應佈局系統 ───

    /**
     * 預模擬：以固定 tick 數讓力場先收斂到穩定狀態
     * @param {number} ticks - 總模擬 tick 數
     */
    _adaptivePreSimulate(ticks = 500) {
      for (let i = 0; i < ticks; i++) {
        this.simulation.tick();
      }
    }

    /**
     * 後處理歸一化：基於最終模擬結果，精確縮放座標填滿視窗
     * 
     * 核心邏輯：
     *   1. 測量最終節點 bbox（含視覺範圍）
     *   2. 計算「寬度要放大多少」和「高度要放大多少」才能填滿視窗
     *   3. 取較小的那個（等比縮放，保持佈局比例）
     *   4. 修正重疊和邊界
     * 
     * 這是基於【最終模擬結果】的精確計算，不是自適應。
     * 
     * @returns {number} 實際套用的縮放因子（1 = 未調整）
     */
    _normalizeToTarget() {
      const G = LAYOUT_GOALS;
      const m = this._computeLayoutMetrics();
      const pad = G.BOUNDARY_PADDING;

      // 可用空間（扣除邊界安全距離）
      const availW = this.width - pad * 2;
      const availH = this.height - pad * 2;

      // 內容實際範圍
      const contentW = m.bbox.maxX - m.bbox.minX;
      const contentH = m.bbox.maxY - m.bbox.minY;

      if (contentW < 1 || contentH < 1) return 1;

      // 目標：內容填滿可用空間的 TARGET_COVERAGE 比例
      // 分別算 X 和 Y 方向的縮放，取較小的（等比縮放不變形）
      const targetFill = Math.sqrt(G.TARGET_COVERAGE); // 面積目標 → 單軸目標
      const scaleX = (availW * targetFill) / contentW;
      const scaleY = (availH * targetFill) / contentH;
      const rawScale = Math.min(scaleX, scaleY);

      // 限制縮放範圍
      const scaleFactor = this._clamp(rawScale, 0.6, 3.0);

      // 差距太小不值得調整
      if (Math.abs(scaleFactor - 1) < 0.03) return 1;

      // 從內容中心向外等比縮放（不是從節點質心，而是從 bbox 中心）
      const bboxCx = (m.bbox.minX + m.bbox.maxX) / 2;
      const bboxCy = (m.bbox.minY + m.bbox.maxY) / 2;

      this.processedNodes.forEach(n => {
        n.x = bboxCx + (n.x - bboxCx) * scaleFactor;
        n.y = bboxCy + (n.y - bboxCy) * scaleFactor;
        n.vx = 0;
        n.vy = 0;
      });

      // 縮放後將整體平移到視窗中心
      const newM = this._computeLayoutMetrics();
      const newCx = (newM.bbox.minX + newM.bbox.maxX) / 2;
      const newCy = (newM.bbox.minY + newM.bbox.maxY) / 2;
      const viewCx = this.width / 2;
      const viewCy = this.height / 2;
      const dx = viewCx - newCx;
      const dy = viewCy - newCy;
      this.processedNodes.forEach(n => {
        n.x += dx;
        n.y += dy;
      });

      // 修正重疊 + 邊界（交替執行，確保最終結果不出界）
      for (let pass = 0; pass < 3; pass++) {
        this._resolveOverlaps(Math.floor(G.NORM_POST_ITERS / 3));
        this._clampToBounds();
      }

      return scaleFactor;
    }

    /**
     * 簡易碰撞修正：雙層迴圈推開重疊的節點（不依賴 D3 力）
     * @param {number} iterations - 迭代次數
     */
    _resolveOverlaps(iterations = 50) {
      const nodes = this.processedNodes;
      const pad = LAYOUT_GOALS.COLLISION_BASE_PAD;

      for (let iter = 0; iter < iterations; iter++) {
        let anyOverlap = false;
        for (let i = 0; i < nodes.length; i++) {
          for (let j = i + 1; j < nodes.length; j++) {
            const dx = nodes[j].x - nodes[i].x;
            const dy = nodes[j].y - nodes[i].y;
            const dist = Math.sqrt(dx * dx + dy * dy) || 0.1;
            const minDist = nodes[i].r + nodes[j].r + pad;

            if (dist < minDist) {
              anyOverlap = true;
              const overlap = (minDist - dist) / 2;
              const nx = dx / dist;
              const ny = dy / dist;
              nodes[i].x -= nx * overlap;
              nodes[i].y -= ny * overlap;
              nodes[j].x += nx * overlap;
              nodes[j].y += ny * overlap;
            }
          }
        }
        if (!anyOverlap) break; // 提早結束
      }
    }

    /**
     * 邊界約束：確保所有節點的完整視覺範圍都在視窗內（目標1）
     */
    _clampToBounds() {
      const pad = LAYOUT_GOALS.BOUNDARY_PADDING;
      this.processedNodes.forEach(n => {
        const ext = RelationshipRenderer._nodeVisualExtent(n.r, !!n._isCore, n._labelHalfW || 0);
        n.x = this._clamp(n.x, ext.left + pad, this.width - ext.right - pad);
        n.y = this._clamp(n.y, ext.top + pad, this.height - ext.bottom - pad);
      });
    }

    // ─── 私有方法：力模擬 ───

    _createSimulation() {
      const profile = this.layoutProfile || this._buildLayoutProfile();

      // 建立力模擬（先不啟動）
      this.simulation = d3.forceSimulation(this.processedNodes)
        .alpha(SIM_CONFIG.ALPHA)
        .alphaDecay(SIM_CONFIG.ALPHA_DECAY)
        .velocityDecay(SIM_CONFIG.VELOCITY_DECAY)
        .force('link', d3.forceLink(this.processedLinks)
          .id(d => d.id)
          .distance(d => {
            const sNode = this.processedNodes.find(n => n.id === (typeof d.source === 'string' ? d.source : d.source.id));
            const tNode = this.processedNodes.find(n => n.id === (typeof d.target === 'string' ? d.target : d.target.id));
            const sr = sNode?.r || 25;
            const tr = tNode?.r || 25;
            const isUpstream = d._type === 'upstream';
            const bodySize = sr + tr;
            const baseDist = bodySize * LAYOUT_GOALS.LINK_BODY_RATIO;

            if (isUpstream) return baseDist * LAYOUT_GOALS.LINK_UPSTREAM_RATIO;

            // 外圍衛星（只連 1 核心的非核心節點）拉長外展；中間夾層維持短
            const sCores = sNode?.connectedCores?.size || 0;
            const tCores = tNode?.connectedCores?.size || 0;
            const isOuter = (!sNode?._isCore && sCores <= 1) || (!tNode?._isCore && tCores <= 1);
            return isOuter ? baseDist * LAYOUT_GOALS.LINK_OUTER_STRETCH : baseDist;
          })
          .strength(d => d._type === 'upstream' ? LAYOUT_GOALS.LINK_UPSTREAM_STRENGTH : LAYOUT_GOALS.LINK_STRENGTH))
        .force('charge', d3.forceManyBody()
          .strength(d => d._isCore ? LAYOUT_GOALS.CHARGE_CORE : LAYOUT_GOALS.CHARGE_NODE))
        .force('center', d3.forceCenter(this.width / 2, this.height / 2).strength(profile.centerStrength))
        .force('collision', d3.forceCollide().radius(d => d.r + LAYOUT_GOALS.COLLISION_BASE_PAD))
        .force('x', d3.forceX(d => d.targetX).strength(profile.forceXStrength))
        .force('y', d3.forceY(d => d.targetY).strength(profile.forceYStrength))
        .force('corePacking', this._createCorePackingForce())
        .force('legendAvoid', this._createLegendAvoidForce())
        .stop(); // 先暫停

      this._prepareLayoutForAnimation(profile);

      // 重新啟動模擬，播放動畫（起點相同 → 最終位置相同）
      this.simulation.alpha(SIM_CONFIG.ALPHA).alphaDecay(SIM_CONFIG.ALPHA_DECAY).restart();
    }

    /**
     * 共用流程：預模擬收斂 → 歸一化 → 同步 target → 記錄 final → 回到動畫起點 → fit
     * 用於首次建立與 refineLayout，避免兩條路徑行為漂移。
     * @param {{ forceXStrength: number, forceYStrength: number }} profile
     */
    _prepareLayoutForAnimation(profile) {
      // 記錄動畫起點（正規化前的 target 位置）
      this.processedNodes.forEach(n => {
        n._startX = n.targetX;
        n._startY = n.targetY;
      });

      // 預模擬：從 target 出發先收斂
      this.processedNodes.forEach(n => {
        n.x = n.targetX;
        n.y = n.targetY;
        n.vx = 0;
        n.vy = 0;
      });
      this.simulation.alpha(SIM_CONFIG.ALPHA).alphaDecay(SIM_CONFIG.ALPHA_DECAY).velocityDecay(SIM_CONFIG.VELOCITY_DECAY).stop();
      this._adaptivePreSimulate(SIM_CONFIG.PRE_SIM_TICKS);

      // 後處理歸一化（安全網）
      this._normalizeToTarget();

      // 將錨點同步到最終座標，避免動畫目標與 fit 基準不一致
      this.processedNodes.forEach(n => {
        n.targetX = n.x;
        n.targetY = n.y;
      });
      this.simulation.force('x', d3.forceX(d => d.targetX).strength(profile.forceXStrength));
      this.simulation.force('y', d3.forceY(d => d.targetY).strength(profile.forceYStrength));

      // 記錄最終位置供 fit / 圖例定位使用
      this._finalPositions = this.processedNodes.map(n => ({
        x: n.x, y: n.y, r: n.r, isCore: !!n._isCore, labelHalfW: n._labelHalfW || 0,
      }));

      // 回到動畫起點
      this.processedNodes.forEach(n => {
        n.x = n._startX;
        n.y = n._startY;
        n.vx = 0;
        n.vy = 0;
        delete n._startX;
        delete n._startY;
      });

      // 依最終位置計算視窗
      this._fitFromFinalPositions();
    }

    /**
     * 計算單一節點的完整視覺邊界（含光暈、描邊、文字標籤）
     * @returns {{ left, right, top, bottom }} 相對於節點中心 (x,y) 的偏移量
     */
    static _nodeVisualExtent(r, isCore, labelHalfW = 0) {
      // 光暈 + 描邊：core 有外圈光暈 (r+5, stroke 2, filter 7) ≈ +16
      //             非 core：filter 3.5 + stroke 1.3 ≈ +6
      const glowOut = isCore ? 16 : 6;
      // 節點名文字：使用預估字寬，避免長英文名稱被低估（如 Anthropic）
      const textHalfW = Math.max(0, labelHalfW - r);
      // 非 core 底部類型標籤：偏移 r+13，字高 8 ≈ r+22
      const typeLabelExtra = isCore ? 0 : 22;

      return {
        left:   r + Math.max(glowOut, textHalfW),
        right:  r + Math.max(glowOut, textHalfW),
        top:    r + glowOut,
        bottom: r + glowOut + typeLabelExtra,
      };
    }

    /** 用預跑的最終位置計算精確視窗 */
    _fitFromFinalPositions() {
      this._fitFromNodes(this._finalPositions);
    }

    /**
     * 以指定節點集合直接套用 fit transform（統一路徑）
     * @param {Array} nodes
     */
    _fitFromNodes(nodes) {
      const fit = this._calcFitFromNodes(nodes);
      if (!fit) return;
      this.svg.call(this.zoomBehavior.transform,
        d3.zoomIdentity.translate(fit.tx, fit.ty).scale(fit.scale));
    }

    /**
     * 以指定節點集合計算 fit 目標（支援 current nodes / finalPositions）
     * @param {Array<{x:number,y:number,r:number,isCore?:boolean,labelHalfW?:number,_isCore?:boolean,_labelHalfW?:number}>} nodes
     * @returns {{scale:number,tx:number,ty:number}|null}
     */
    _calcFitFromNodes(nodes) {
      if (!nodes || !nodes.length) return null;
      const paddingX = SIM_CONFIG.VIEW_PADDING_X;
      const paddingTop = SIM_CONFIG.VIEW_PADDING_TOP;
      const paddingBottom = SIM_CONFIG.VIEW_PADDING_BOTTOM;

      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      nodes.forEach(n => {
        const isCore = (typeof n.isCore === 'boolean') ? n.isCore : !!n._isCore;
        const labelHalfW = (typeof n.labelHalfW === 'number') ? n.labelHalfW : (n._labelHalfW || 0);
        const ext = RelationshipRenderer._nodeVisualExtent(n.r, isCore, labelHalfW);
        minX = Math.min(minX, n.x - ext.left);
        minY = Math.min(minY, n.y - ext.top);
        maxX = Math.max(maxX, n.x + ext.right);
        maxY = Math.max(maxY, n.y + ext.bottom);
      });

      return this._calcFitTransform(minX, minY, maxX, maxY, paddingX, paddingTop, paddingBottom);
    }

    /**
     * 動畫期間自適應視窗：持續逼近「都在畫面內 + 儘量放大」
     * 透過平滑追蹤避免 zoom transform 抖動
     */
    _adaptiveViewportTick() {
      if (!this.svg || !this.processedNodes?.length) return;

      const target = this._calcFitFromNodes(this.processedNodes);
      if (!target) return;

      const current = d3.zoomTransform(this.svg.node());
      const smooth = this._clamp(SIM_CONFIG.VIEW_SMOOTHING, 0.05, 1);
      const nextScale = current.k + (target.scale - current.k) * smooth;
      const nextTx = current.x + (target.tx - current.x) * smooth;
      const nextTy = current.y + (target.ty - current.y) * smooth;

      this.svg.call(
        this.zoomBehavior.transform,
        d3.zoomIdentity.translate(nextTx, nextTy).scale(nextScale),
      );
    }

    // ─── 私有方法：繪圖 ───

    _getNodeColor(d) {
      if (d._isCore) return this.coreColorMap[d.id];
      return TYPE_COLORS[d.group] || '#888';
    }

    _getLinkColor(d) {
      if (d._type === 'upstream') {
        // 找到兩個 core 的漸層 ID
        const coreList = this.coreNodes.map(n => n.name);
        const i = coreList.indexOf(typeof d.source === 'string' ? d.source : d.source.id);
        const j = coreList.indexOf(typeof d.target === 'string' ? d.target : d.target.id);
        if (i >= 0 && j >= 0) {
          const [a, b] = i < j ? [i, j] : [j, i];
          return `url(#rr-grad-${a}-${b})`;
        }
        return 'rgba(100, 255, 218, 0.5)';
      }

      // 如果 type 是某個 core 的名字
      if (this.coreColorMap[d._type]) {
        const c = d3.color(this.coreColorMap[d._type]);
        c.opacity = 0.4;
        return c + '';
      }

      return 'rgba(150, 150, 150, 0.25)';
    }

    _drawGraph() {
      const self = this;

      // ─ 繪製連線 ─
      this._linkElements = this.g.append('g')
        .selectAll('line')
        .data(this.processedLinks)
        .join('line')
        .attr('stroke', d => this._getLinkColor(d))
        .attr('stroke-width', d => d._type === 'upstream' ? 2.5 : 1.3)
        .attr('stroke-dasharray', d =>
          d._type === 'upstream' ? '8,4' : (d._type === 'other' ? '4,4' : 'none'));

      // ─ 連線標籤 ─
      this._linkLabels = this.g.append('g')
        .selectAll('text')
        .data(this.processedLinks)
        .join('text')
        .text(d => d.label)
        .attr('fill', 'rgba(180, 190, 210, 0.5)')
        .attr('font-size', 8)
        .attr('text-anchor', 'middle')
        .attr('dy', -3)
        .style('font-family', "'Microsoft JhengHei', sans-serif");

      // ─ 繪製節點 ─
      this._nodeElements = this.g.append('g')
        .selectAll('g')
        .data(this.processedNodes)
        .join('g')
        .call(d3.drag()
          .on('start', (e, d) => this._dragStarted(e, d))
          .on('drag', (e, d) => this._dragged(e, d))
          .on('end', (e, d) => this._dragEnded(e, d)));

      // Core 外圈光暈
      this._nodeElements.filter(d => d._isCore)
        .append('circle')
        .attr('r', d => d.r + 5)
        .attr('fill', 'none')
        .attr('stroke', d => this._getNodeColor(d))
        .attr('stroke-width', 2)
        .attr('stroke-opacity', 0.3)
        .attr('filter', 'url(#rr-coreGlow)');

      // 節點圓形
      this._nodeElements.append('circle')
        .attr('r', d => d.r)
        .attr('fill', d => {
          const c = d3.color(this._getNodeColor(d));
          c.opacity = d._isCore ? 0.2 : 0.12;
          return c + '';
        })
        .attr('stroke', d => this._getNodeColor(d))
        .attr('stroke-width', d => d._isCore ? 2.5 : 1.3)
        .attr('filter', d => d._isCore ? 'url(#rr-coreGlow)' : 'url(#rr-glow)')
        .style('cursor', 'pointer');

      // 節點文字
      this._nodeElements.each(function (d) {
        const lines = d.id.split('\n');
        const text = d3.select(this).append('text')
          .attr('text-anchor', 'middle')
          .attr('fill', '#fff')
          .attr('font-size', d._isCore ? 15 : (d.r > 26 ? 11 : 9.5))
          .attr('font-weight', d._isCore ? 700 : 500)
          .style('pointer-events', 'none')
          .style('text-shadow', '0 0 8px rgba(0,0,0,0.8)')
          .style('font-family', "'Microsoft JhengHei', sans-serif");

        lines.forEach((line, i) => {
          text.append('tspan')
            .attr('x', 0)
            .attr('dy', i === 0 ? `${-(lines.length - 1) * 0.35}em` : '1.1em')
            .text(line);
        });
      });

      // 類型標籤（非 core）
      this._nodeElements.filter(d => !d._isCore)
        .append('text')
        .attr('text-anchor', 'middle')
        .attr('y', d => d.r + 13)
        .attr('fill', d => {
          const c = d3.color(this._getNodeColor(d));
          c.opacity = 0.65;
          return c + '';
        })
        .attr('font-size', 8)
        .style('font-family', "'Microsoft JhengHei', sans-serif")
        .text(d => TYPE_LABELS[d.group] || d.group);

      // ─ Tick 更新 + 線性衰減尾段 ─
      this._linearMode = false;

      this.simulation.on('tick', () => {
        // 尾段切換為線性衰減（僅在自然衰減時，拖曳中 alphaTarget>0 不觸發）
        if (!this._linearMode
            && this.simulation.alpha() < SIM_CONFIG.LINEAR_THRESHOLD
            && this.simulation.alphaTarget() === 0) {
          this._linearMode = true;
          this.simulation.alphaDecay(0); // 關掉指數衰減
        }
        if (this._linearMode) {
          const next = this.simulation.alpha() - SIM_CONFIG.LINEAR_STEP;
          if (next <= this.simulation.alphaMin()) {
            this.simulation.stop();
          } else {
            this.simulation.alpha(next);
          }
        }

        // 繪製更新
        this._linkElements
          .attr('x1', d => d.source.x)
          .attr('y1', d => d.source.y)
          .attr('x2', d => d.target.x)
          .attr('y2', d => d.target.y);

        this._linkLabels
          .attr('x', d => (d.source.x + d.target.x) / 2)
          .attr('y', d => (d.source.y + d.target.y) / 2);

        this._nodeElements.attr('transform', d => `translate(${d.x},${d.y})`);

        // 視窗縮放閉迴路控制：持續調整到「完整在畫面內 + 儘量放大」
        this._adaptiveViewportTick();
      });

      // 視窗大小變化時重新 fit + 重新定位圖例
      let resizeTimer = null;
      this._resizeHandler = () => {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(() => {
          const prevBucket = this._viewportBucket || this._getViewportBucket();
          this._measure();
          const nextBucket = this._getViewportBucket();
          this._viewportBucket = nextBucket;

          // 版型比例跨門檻時重排（不只縮放），確保窄螢幕會往上下展開、寬螢幕往左右展開
          if (prevBucket !== nextBucket) {
            this.render();
            if (this._legendEl) {
              this.positionLegend(this._legendEl);
              this.refineLayout();
              this.positionLegend(this._legendEl);
            }
            return;
          }

          this.svg.attr('viewBox', [0, 0, this.width, this.height]);
          this._fitFromFinalPositions();
          if (this._legendEl) this.positionLegend(this._legendEl);
        }, 150);
      };
      window.addEventListener('resize', this._resizeHandler);
    }

    // ─── 私有方法：fit 計算 ───

    /** 共用的 fit 計算（支援非對稱 padding） */
    _calcFitTransform(minX, minY, maxX, maxY, px, pt, pb) {
      const contentW = maxX - minX;
      const contentH = maxY - minY;
      const availW = this.width - px * 2;
      const availH = this.height - pt - pb;
      const scale = Math.min(availW / contentW, availH / contentH, 2.5);

      const bcx = (minX + maxX) / 2;
      const bcy = (minY + maxY) / 2;
      return {
        scale,
        tx: this.width / 2 - bcx * scale,
        ty: pt + availH / 2 - bcy * scale,
      };
    }

    // ─── 私有方法：互動 ───

    _setupInteractions() {
      const self = this;
      const tooltip = this.tooltip;

      this._nodeElements
        .on('mouseenter', function (event, d) {
          // 建立 tooltip 內容
          const color = self._getNodeColor(d);
          let html = `<div style="font-size:15px;font-weight:700;margin-bottom:6px;color:${color}">${d.id.replace(/\n/g, ' ')}</div>`;

          // 找關聯
          const related = self.processedLinks.filter(l => {
            const sid = typeof l.source === 'string' ? l.source : l.source.id;
            const tid = typeof l.target === 'string' ? l.target : l.target.id;
            return sid === d.id || tid === d.id;
          });

          const connections = related.map(l => {
            const sid = typeof l.source === 'string' ? l.source : l.source.id;
            const tid = typeof l.target === 'string' ? l.target : l.target.id;
            const other = sid === d.id ? tid : sid;
            return `${other.replace(/\n/g, ' ')}：${l.label}`;
          });

          if (d.desc) {
            html += `<div style="margin:6px 0;white-space:pre-line;color:#b8c4d4;">${d.desc}</div>`;
          }
          if (connections.length) {
            html += `<div style="color:#64ffda;font-weight:600;margin-bottom:4px;">關聯 (${connections.length})</div>`;
            html += connections.map(c => `<div style="color:#8892b0;font-size:11px;">• ${c}</div>`).join('');
          }

          tooltip.html(html)
            .style('opacity', '1')
            .style('left', Math.min(event.clientX + 20, window.innerWidth - 400) + 'px')
            .style('top', Math.min(event.clientY - 10, window.innerHeight - 300) + 'px');

          // 高亮連接的節點
          const connectedIds = new Set([d.id]);
          related.forEach(l => {
            connectedIds.add(typeof l.source === 'string' ? l.source : l.source.id);
            connectedIds.add(typeof l.target === 'string' ? l.target : l.target.id);
          });

          self._nodeElements.select('circle:last-of-type')
            .attr('stroke-opacity', n => connectedIds.has(n.id) ? 1 : 0.1);
          self._nodeElements.selectAll('text')
            .attr('opacity', n => connectedIds.has(n.id) ? 1 : 0.15);
          self._linkElements
            .attr('stroke-opacity', l => {
              const sid = typeof l.source === 'string' ? l.source : l.source.id;
              const tid = typeof l.target === 'string' ? l.target : l.target.id;
              return (sid === d.id || tid === d.id) ? 1 : 0.03;
            })
            .attr('stroke-width', l => {
              const sid = typeof l.source === 'string' ? l.source : l.source.id;
              const tid = typeof l.target === 'string' ? l.target : l.target.id;
              return (sid === d.id || tid === d.id) ? 2.5 : 0.8;
            });
          self._linkLabels.attr('opacity', l => {
            const sid = typeof l.source === 'string' ? l.source : l.source.id;
            const tid = typeof l.target === 'string' ? l.target : l.target.id;
            return (sid === d.id || tid === d.id) ? 1 : 0;
          });
        })
        .on('mousemove', function (event) {
          tooltip
            .style('left', Math.min(event.clientX + 20, window.innerWidth - 400) + 'px')
            .style('top', Math.min(event.clientY - 10, window.innerHeight - 300) + 'px');
        })
        .on('mouseleave', function () {
          tooltip.style('opacity', '0');
          self._nodeElements.select('circle:last-of-type').attr('stroke-opacity', 1);
          self._nodeElements.selectAll('text').attr('opacity', 1);
          self._linkElements
            .attr('stroke-opacity', 1)
            .attr('stroke-width', d => d._type === 'upstream' ? 2.5 : 1.3);
          self._linkLabels.attr('opacity', 1);
        });
    }

    // ─── 私有方法：拖曳 ───

    _dragStarted(event, d) {
      if (!event.active) {
        // 重置線性衰減狀態，恢復指數衰減，alpha 拉高避免立刻觸發線性模式
        this._linearMode = false;
        // 拖曳時暫時提高模擬能量，確保互動回饋
        this.simulation
          .alpha(0.5)
          .alphaDecay(0.06)
          .alphaTarget(0.3)
          .restart();
      }
      d.fx = d.x;
      d.fy = d.y;
    }

    _dragged(event, d) {
      d.fx = event.x;
      d.fy = event.y;
    }

    _dragEnded(event, d) {
      if (!event.active) this.simulation.alphaTarget(0);
      d.fx = null;
      d.fy = null;
    }

    // ─── 核心最佳散佈力：依可用區域（扣圖例後不規則形狀）分散核心 ───

    _createCorePackingForce() {
      let nodes = [];
      const self = this;
      let strength = LAYOUT_GOALS.CORE_PACKING_STRENGTH;

      function force(alpha) {
        self._applyCoreAnchors(false);
        const k = strength * alpha;
        if (k <= 0) return;
        nodes.forEach(n => {
          if (!n._isCore) return;
          n.vx += (n.targetX - n.x) * k;
          n.vy += (n.targetY - n.y) * k;
        });
      }

      force.initialize = function (_nodes) {
        nodes = _nodes;
        self.markCorePackingDirty();
        self._applyCoreAnchors(true);
      };
      force.strength = function (v) {
        if (v === undefined) return strength;
        strength = v;
        return force;
      };
      return force;
    }

    // ─── 圖例自動定位：避開節點 ───

    _createLegendAvoidForce() {
      let nodes = [];
      const self = this;

      function force(alpha) {
        const rect = self._legendAvoidRect;
        if (!rect) return;

        const pushStrength = 0.95;

        nodes.forEach(n => {
          // 用完整視覺範圍計算碰撞，不只是圓半徑
          const ext = RelationshipRenderer._nodeVisualExtent(n.r, !!n._isCore, n._labelHalfW || 0);
          const minX = rect.left - ext.left;
          const maxX = rect.right + ext.right;
          const minY = rect.top - ext.top;
          const maxY = rect.bottom + ext.bottom;

          if (n.x < minX || n.x > maxX || n.y < minY || n.y > maxY) return;

          const toLeft = Math.abs(n.x - minX);
          const toRight = Math.abs(maxX - n.x);
          const toTop = Math.abs(n.y - minY);
          const toBottom = Math.abs(maxY - n.y);
          const minDist = Math.min(toLeft, toRight, toTop, toBottom);

          let dx = 0;
          let dy = 0;
          if (minDist === toLeft) dx = -1;
          else if (minDist === toRight) dx = 1;
          else if (minDist === toTop) dy = -1;
          else dy = 1;

          const amp = (1 + (n._isCore ? 0.35 : 0)) * pushStrength * alpha;
          n.vx += dx * amp;
          n.vy += dy * amp;
        });
      }

      force.initialize = function (_nodes) {
        nodes = _nodes;
      };
      return force;
    }

    _updateLegendAvoidRect(legendEl) {
      if (!legendEl || !this.svg) return;

      const legendRect = legendEl.getBoundingClientRect();
      const svgRect = this.svg.node().getBoundingClientRect();
      const t = d3.zoomTransform(this.svg.node());
      const vbs = this._vbScale || 1; // viewBox → 螢幕縮放比
      const pad = 10; // 圖例外擴安全距離

      // 螢幕像素座標（相對 SVG）→ viewBox 座標 → 世界座標
      const localLeft = (legendRect.left - svgRect.left - pad) / vbs;
      const localRight = (legendRect.right - svgRect.left + pad) / vbs;
      const localTop = (legendRect.top - svgRect.top - pad) / vbs;
      const localBottom = (legendRect.bottom - svgRect.top + pad) / vbs;

      this._legendAvoidRect = {
        left: (localLeft - t.x) / t.k,
        right: (localRight - t.x) / t.k,
        top: (localTop - t.y) / t.k,
        bottom: (localBottom - t.y) / t.k,
      };
      this.markCorePackingDirty();
    }

    /**
     * 自動把圖例面板放到右側不擋節點的位置
     * @param {HTMLElement} legendEl - 圖例 DOM 元素
     */
    positionLegend(legendEl) {
      if (!legendEl) return;
      this._legendEl = legendEl; // 存起來供 resize 時重算

      if (!this._finalPositions || !this._finalPositions.length) return;

      const t = d3.zoomTransform(this.svg.node());
      const vbs = this._vbScale || 1; // viewBox → 螢幕像素縮放
      const legendRect = legendEl.getBoundingClientRect();
      const legendW = legendRect.width;
      const legendH = legendRect.height;
      const margin = 16;
      const legendPad = 8; // 圖例邊框到節點視覺邊界的額外間距
      const realW = this._realWidth || this.width;
      const realH = this._realHeight || this.height;

      // Legend 水平範圍（螢幕像素座標）
      const legendLeft = realW - legendW - margin;

      // 將預跑最終位置轉為螢幕像素座標（world → viewBox → screen）
      const screenNodes = this._finalPositions.map(p => {
        const sx = (p.x * t.k + t.x) * vbs;
        const sy = (p.y * t.k + t.y) * vbs;
        const ext = RelationshipRenderer._nodeVisualExtent(p.r, p.isCore, p.labelHalfW || 0);
        const extScale = t.k * vbs; // 視覺範圍也要按比例
        return {
          x: sx, y: sy,
          left:   sx - ext.left * extScale - legendPad,
          right:  sx + ext.right * extScale + legendPad,
          top:    sy - ext.top * extScale - legendPad,
          bottom: sy + ext.bottom * extScale + legendPad,
        };
      });

      // 篩選水平方向會與 legend 區域重疊的節點
      const overlapping = screenNodes.filter(n =>
        n.right >= legendLeft && n.left <= realW
      );

      if (overlapping.length === 0) {
        legendEl.style.top = margin + 'px';
        this._updateLegendAvoidRect(legendEl);
        return;
      }

      // 收集被佔用的垂直範圍，排序後合併重疊
      const occupied = overlapping
        .map(n => ({ top: n.top, bottom: n.bottom }))
        .sort((a, b) => a.top - b.top);

      const merged = [];
      for (const range of occupied) {
        if (merged.length === 0 || range.top > merged[merged.length - 1].bottom) {
          merged.push({ ...range });
        } else {
          merged[merged.length - 1].bottom = Math.max(merged[merged.length - 1].bottom, range.bottom);
        }
      }

      // 從頂部到底部找能放下 legend 的空隙
      const gaps = [];
      let prevBottom = 0;
      for (const range of merged) {
        const gapH = range.top - prevBottom;
        if (gapH >= legendH) {
          gaps.push({ top: prevBottom, height: gapH });
        }
        prevBottom = range.bottom;
      }
      // 底部剩餘空間
      if (realH - prevBottom >= legendH) {
        gaps.push({ top: prevBottom, height: realH - prevBottom });
      }

      if (gaps.length === 0) {
        // 完全放不下，選佔用最少的位置（預設最上方）
        legendEl.style.top = margin + 'px';
        this._updateLegendAvoidRect(legendEl);
        return;
      }

      // 選最靠頂部的空隙，稍微內縮
      const bestGap = gaps[0];
      const bestTop = Math.max(margin, bestGap.top + Math.min(12, (bestGap.height - legendH) / 2));
      legendEl.style.top = bestTop + 'px';
      this._updateLegendAvoidRect(legendEl);
    }
  }

  // ═══ 精簡格式展開 ═══

  /**
   * 將精簡格式展開為完整格式
   * 
   * 精簡格式結構：
   *   cores:     [["名稱", "描述"], ...]
   *   coreLinks: [["公司A", "公司B", "標籤"], ...]  （選填）
   *   nodes:     [["名稱", "type", "描述(選填)", [["對象","標籤"], ...]], ...]
   * 
   * nodes 陣列中每個元素：
   *   [0] name   (必填)
   *   [1] type   (必填)
   *   [2] 如果是 string → desc；如果是 array → links（省略 desc）
   *   [3] 如果 [2] 是 string 且 [3] 存在 → links
   * 
   * @param {Object} data - 精簡格式資料
   * @returns {Object} 完整格式資料
   */
  RelationshipRenderer.expandCompact = function (data) {
    const expanded = {
      title: data.title || '',
      subtitle: data.subtitle || '',
      nodes: [],
      links: [],
    };

    // 1. 展開 cores → nodes (type: 'core')
    if (Array.isArray(data.cores)) {
      data.cores.forEach(core => {
        expanded.nodes.push({
          name: core[0],
          type: 'core',
          desc: core[1] || '',
        });
      });
    }

    // 2. 展開 coreLinks → links
    if (Array.isArray(data.coreLinks)) {
      data.coreLinks.forEach(cl => {
        expanded.links.push({
          source: cl[0],
          target: cl[1],
          label: cl[2] || '',
        });
      });
    }

    // 3. 展開 nodes → nodes + 內嵌 links
    if (Array.isArray(data.nodes)) {
      data.nodes.forEach(node => {
        const name = node[0];
        const type = node[1] || 'customer';
        let desc = '';
        let inlineLinks = [];

        // [2] 可以是 desc(string) 或 links(array)
        if (node.length >= 3) {
          if (typeof node[2] === 'string') {
            desc = node[2];
            // [3] 如果存在，一定是 links
            if (node.length >= 4 && Array.isArray(node[3])) {
              inlineLinks = node[3];
            }
          } else if (Array.isArray(node[2])) {
            inlineLinks = node[2];
          }
        }

        expanded.nodes.push({ name, type, desc });

        // 展開內嵌 links：每個 [target, label]
        inlineLinks.forEach(link => {
          expanded.links.push({
            source: name,
            target: link[0],
            label: link[1] || '',
          });
        });
      });
    }

    return expanded;
  };

  // ═══ 建立圖例的輔助方法 ═══

  /**
   * 根據資料自動建立圖例
   * @param {HTMLElement} container - 圖例容器
   * @param {Object} data - 原始資料
   * @param {Object} coreColorMap - core 名稱 → 顏色對映
   */
  RelationshipRenderer.buildLegend = function (container, data, coreColorMap) {
    const types = new Set(data.nodes.map(n => n.type));

    let html = '<div style="margin-bottom:8px;font-weight:600;color:#fff;font-size:13px;">節點類型</div>';
    types.forEach(type => {
      const color = type === 'core' ? '#ff6b6b' : (TYPE_COLORS[type] || '#888');
      const label = TYPE_LABELS[type] || type;
      html += `<div style="display:flex;align-items:center;margin-bottom:5px;">
        <div style="width:12px;height:12px;border-radius:50%;background:${color};margin-right:8px;flex-shrink:0;"></div>
        <span>${label}</span></div>`;
    });

    html += '<div style="margin:8px 0;border-top:1px solid rgba(100,140,255,0.15);padding-top:8px;font-weight:600;color:#fff;font-size:13px;">連線顏色</div>';
    Object.entries(coreColorMap).forEach(([name, color]) => {
      html += `<div style="display:flex;align-items:center;margin-bottom:5px;">
        <div style="width:26px;height:3px;border-radius:2px;background:${color};opacity:0.6;margin-right:8px;flex-shrink:0;"></div>
        <span>${name}關聯</span></div>`;
    });
    html += `<div style="display:flex;align-items:center;margin-bottom:5px;">
      <div style="width:26px;height:3px;border-radius:2px;background:linear-gradient(90deg, ${Object.values(coreColorMap)[0] || '#fff'}, ${Object.values(coreColorMap)[1] || '#fff'});margin-right:8px;flex-shrink:0;"></div>
      <span>上下游關係</span></div>`;

    container.innerHTML = html;
  };

  // ═══ 匯出 ═══
  window.RelationshipRenderer = RelationshipRenderer;

})();
