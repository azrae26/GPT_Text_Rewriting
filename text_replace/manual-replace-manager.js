/**
 * 手動替換主控制器模組
 * 
 * 職責：
 * 1. 模組初始化 - 協調各子模組的初始化順序
 * 2. 公共API - 提供統一的對外接口
 * 3. 模組間協調 - 處理模組間的通信和依賴
 * 4. 兼容性維護 - 保持與原有API的兼容性
 * 
 * 依賴模組：
 * 1. text_replace/manual-replace-storage.js - ManualReplaceStorage
 * 2. text_replace/manual-replace-ui.js - ManualReplaceUI
 * 3. text_replace/manual-replace-preview.js - ManualReplacePreview
 * 4. text_replace/replace-manager.js - ReplaceManager
 * 
 * 重構說明：
 * 原本的 manual-replace-manager.js (1296行) 已拆分為：
 * - manual-replace-storage.js (200行) - 資料存儲管理
 * - manual-replace-ui.js (636行) - UI元件管理
 * - manual-replace-preview.js (741行) - 預覽高亮管理
 * - manual-replace-manager-new.js (本檔案) - 主控制器
 */

const ManualReplaceManager = {
  CONFIG: {
    MIN_WIDTH: 80,
    MAX_WIDTH: 600,
    MAIN_GROUP_MAX_WIDTH: 330, // 主組輸入框最大寬度
    PADDING: 24,
    MANUAL_REPLACE_KEY: 'manualReplaceRules',
    MAX_PREVIEWS: 1000, // 最大預覽數量
    PREVIEW_COLORS: [
      '#FF0000', // 紅色
      '#FF8C00', // 橙色
      '#0095FF', // 藍色
      '#AB00FF', // 紫色
      '#00AF06', // 綠色
      '#9932CC', // 紫色
    ],
    PREVIEW_CONTAINER_ID: 'replace-preview-container'
  },

  // 模組實例引用
  _storage: null,
  _ui: null,
  _preview: null,
  _initialized: false,

  /** 初始化方法 */
  
  /**
   * 初始化手動替換系統
   * @param {HTMLElement} mainContainer - 主組容器
   * @param {HTMLElement} otherContainer - 其他組容器
   * @param {HTMLTextAreaElement} textArea - 文本區域元素
   */
  initializeManualGroups(mainContainer, otherContainer, textArea) {
    if (this._initialized) {
      console.log('[ManualReplaceManager] 已經初始化，跳過重複初始化');
      return;
    }

    console.log('[ManualReplaceManager] 🚀 開始初始化手動替換系統');

    try {
      // 1. 初始化各個子模組
      this._initializeSubModules(textArea);

      // 2. 使用 ReplaceManager 的初始化方法
      this._initializeWithReplaceManager(mainContainer, otherContainer, textArea);

      // 3. 設置模組間的協調邏輯
      this._setupModuleCoordination(textArea);

      this._initialized = true;
      console.log('[ManualReplaceManager] ✅ 手動替換系統初始化完成');

    } catch (error) {
      console.error('[ManualReplaceManager] ❌ 初始化失敗:', error);
      throw error;
    }
  },

  /**
   * 初始化子模組
   * @param {HTMLTextAreaElement} textArea - 文本區域元素
   */
  _initializeSubModules(textArea) {
    console.log('[ManualReplaceManager] 📦 初始化子模組');

    // 檢查依賴模組是否存在
    if (!window.ManualReplaceStorage) {
      throw new Error('ManualReplaceStorage 模組未載入');
    }
    if (!window.ManualReplaceUI) {
      throw new Error('ManualReplaceUI 模組未載入');
    }
    if (!window.ManualReplacePreview) {
      throw new Error('ManualReplacePreview 模組未載入');
    }

    // 初始化各個模組
    this._storage = window.ManualReplaceStorage;
    this._ui = window.ManualReplaceUI;
    this._preview = window.ManualReplacePreview;

    // 調用各模組的初始化方法
    this._storage.initialize();
    this._ui.initialize();
    this._preview.initialize(textArea);

    console.log('[ManualReplaceManager] ✅ 子模組初始化完成');
  },

  /**
   * 使用 ReplaceManager 進行初始化
   * @param {HTMLElement} mainContainer - 主組容器
   * @param {HTMLElement} otherContainer - 其他組容器
   * @param {HTMLTextAreaElement} textArea - 文本區域元素
   */
  _initializeWithReplaceManager(mainContainer, otherContainer, textArea) {
    console.log('[ManualReplaceManager] 🔧 使用 ReplaceManager 初始化替換組');

    // 使用 ReplaceManager 的初始化方法
    window.ReplaceManager.initializeReplaceGroups({
      mainContainer,        // 主組容器
      otherContainer,       // 其他組容器
      textArea,            // 文本區域
      storageKey: 'replace_' + this.CONFIG.MANUAL_REPLACE_KEY,  // 儲存鍵名
      createGroupFn: this._ui.createReplaceGroup.bind(this._ui),        // 創建組函數
      onInitialized: () => {
        this._onReplaceManagerInitialized(textArea);
      },
      isManual: true
    });
  },

  /**
   * ReplaceManager 初始化完成回調
   * @param {HTMLTextAreaElement} textArea - 文本區域元素
   */
  _onReplaceManagerInitialized(textArea) {
    console.log('[ManualReplaceManager] 🎯 ReplaceManager 初始化完成，執行後續設置');

    // 初始化主組狀態
    this._initializeMainGroupState();

    // 初始化額外組狀態  
    this._initializeExtraGroupsState();

    // 設置拖曳排序
    this._ui.setupAllSortDragEvents();

    // 設置文本變化監聽
    this._setupTextAreaChangeListener(textArea);

    // 初始預覽更新
    this._preview.updateAllPreviews(textArea);

    // 開始高亮檢查
    this.startHighlightCheck();
  },

  /**
   * 初始化主組狀態
   */
  _initializeMainGroupState() {
    const mainGroup = document.querySelector('.replace-main-group');
    if (mainGroup) {
      const fromInput = mainGroup.querySelector('.replace-input');
      const toInput = mainGroup.querySelector('.replace-input:last-of-type');
      
      if (fromInput && toInput) {
        this._storage.setMainGroup({
          from: fromInput.value || '',
          to: toInput.value || ''
        });
        console.log('[ManualReplaceManager] ✅ 主組狀態初始化完成');
      }
    }
  },

  /**
   * 初始化額外組狀態
   */
  _initializeExtraGroupsState() {
    const extraGroups = document.querySelectorAll('.manual-replace-container .replace-extra-group');
    const rules = Array.from(extraGroups).map(group => {
      const fromInput = group.querySelector('.replace-input');
      const toInput = group.querySelector('.replace-input:last-of-type');
      return {
        from: fromInput ? fromInput.value : '',
        to: toInput ? toInput.value : ''
      };
    });

    // 更新存儲中的額外組規則
    this._storage.updateRuleOrder(rules);
    console.log('[ManualReplaceManager] ✅ 額外組狀態初始化完成');
  },

  /** 模組協調方法 */
  
  /**
   * 設置模組間協調邏輯
   * @param {HTMLTextAreaElement} textArea - 文本區域元素
   */
  _setupModuleCoordination(textArea) {
    console.log('[ManualReplaceManager] 🔗 設置模組間協調邏輯');

    // 監聽存儲模組的事件，協調UI和預覽更新
    document.addEventListener('manualReplaceRuleChanged', (event) => {
      console.log('[ManualReplaceManager] 📡 協調規則變化事件');
      // 預覽模組會自動監聽此事件並更新
    });

    document.addEventListener('manualReplaceStructureChanged', (event) => {
      console.log('[ManualReplaceManager] 📡 協調結構變化事件');
      // UI模組會自動監聽此事件並重新渲染
    });
  },

  /**
   * 設置文本區域變化監聽器
   * @param {HTMLTextAreaElement} textArea - 文本區域元素
   */
  _setupTextAreaChangeListener(textArea) {
    let lastValue = textArea.value;
    let lastLength = textArea.value.length;
    let lastHash = this._hashText(textArea.value);
    
    const checkValue = () => {
      const currentValue = textArea.value;
      const currentLength = currentValue.length;
      const currentHash = this._hashText(currentValue);
      
      if (currentValue !== lastValue || currentLength !== lastLength || currentHash !== lastHash) {
        console.log(`[ManualReplaceManager] 📝 文本變化: ${lastLength} → ${currentLength} 字符`);
        
        // 通知預覽模組強制清理緩存
        this._preview._forceCleanAllCaches();
        
        lastValue = currentValue;
        lastLength = currentLength;
        lastHash = currentHash;
        
        // 延遲更新預覽，確保 DOM 和緩存完全清理
        setTimeout(() => {
          this._preview.updateAllPreviews(textArea);
        }, 15);
      }
      requestAnimationFrame(checkValue);
    };
    checkValue();
  },

  /** 兼容性API - 保持與原有接口兼容 */
  
  /**
   * 創建替換組（兼容性方法）
   */
  createReplaceGroup(textArea, isMainGroup = false, initialData = null, groupIndex = null) {
    return this._ui.createReplaceGroup(textArea, isMainGroup, initialData, groupIndex);
  },

  /**
   * 更新預覽（兼容性方法）
   */
  _updatePreviews() {
    const textArea = document.querySelector('textarea[name="content"]');
    if (textArea && this._preview) {
      this._preview.updateAllPreviews(textArea);
    }
  },

  /**
   * 調整輸入框寬度（兼容性方法）
   */
  _adjustInputWidth(input) {
    if (this._ui) {
      this._ui._adjustInputWidth(input);
    }
  },

  /**
   * 檢查並強制更新高亮
   */
  checkAndForceUpdateHighlights() {
    const highlights = document.querySelectorAll('.replace-preview-highlight');
    const totalHighlights = highlights.length;
    const visibleHighlights = Array.from(highlights).filter(h => 
      h.style.display !== 'none' && 
      parseFloat(h.style.width) > 0
    ).length;

    if (visibleHighlights === 0 && totalHighlights === 0) {
      const textArea = document.querySelector('textarea[name="content"]');
      if (textArea && this._preview) {
        this._preview.updateAllPreviews(textArea);
      }
    }
  },

  /**
   * 開始定期檢查高亮
   */
  startHighlightCheck() {
    // 在前幾秒多檢查
    const checkTimes = [100, 500, 1000, 2000];
    checkTimes.forEach(delay => {
      setTimeout(() => {
        this.checkAndForceUpdateHighlights();
      }, delay);
    });
  },

  /**
   * 從存儲刷新替換組UI
   */
  refreshFromStorage() {
    // 🆕 防重複調用機制
    if (this._refreshInProgress) {
      console.log('[ManualReplaceManager] ⏸️ UI刷新已在進行中，跳過此次調用');
      return;
    }
    
    this._refreshInProgress = true;
    console.log('[ManualReplaceManager] 🔄 從存儲刷新替換組UI');
    
    const textArea = document.querySelector('textarea[name="content"]');
    const manualContainer = document.querySelector('.manual-replace-container');
    
    if (!textArea || !manualContainer) {
      console.log('[ManualReplaceManager] ⚠️ 找不到必要的DOM元素，跳過刷新');
      this._refreshInProgress = false;
      return;
    }

    // 清除所有現有的額外組
    const existingGroups = manualContainer.querySelectorAll('.replace-extra-group');
    existingGroups.forEach(group => group.remove());
    
    // 清除舊的高亮
    if (this._preview) {
      this._preview.clearAllHighlights();
    }

    // 從存儲重新載入規則
    this._storage.loadRules((rules) => {
      console.log('[ManualReplaceManager] 📥 從存儲載入的規則:', rules);
      
      // 重新創建額外組
      rules.forEach((rule, index) => {
        const group = this._ui.createReplaceGroup(textArea, false, rule, index);
        manualContainer.appendChild(group);
      });

      // 重新設置拖曳事件
      requestAnimationFrame(() => {
        this._ui.setupAllSortDragEvents();
        
        // 更新預覽（延遲一點讓DOM完全更新）
        setTimeout(() => {
          if (this._preview) {
            this._preview.updateAllPreviews(textArea);
          }
          console.log('[ManualReplaceManager] ✅ 替換組UI刷新完成');
          
          // 重置刷新標記
          this._refreshInProgress = false;
        }, 100);
      });
    });
  },

  /**
   * 檢查是否需要刷新UI
   */
  shouldRefresh(changedKeys) {
    return this._storage ? this._storage.shouldRefresh(changedKeys) : false;
  },

  /** 工具方法 */
  
  /**
   * 計算文本簡單哈希
   */
  _hashText(text) {
    if (!text) return '';
    let hash = 0;
    for (let i = 0; i < Math.min(text.length, 100); i++) {
      const char = text.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // 轉為32位整數
    }
    return hash.toString();
  },

  /** 清理資源 */
  
  /**
   * 清理所有資源
   */
  cleanup() {
    console.log('[ManualReplaceManager] 🧹 清理所有資源');
    
    if (this._preview) {
      this._preview.cleanup();
    }
    
    this._storage = null;
    this._ui = null;
    this._preview = null;
    this._initialized = false;
  }
};

// 暴露到全域，保持兼容性
window.ManualReplaceManager = ManualReplaceManager; 