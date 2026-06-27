/**
 * 復原/重做功能模組
 * - 支持輸入框和文本區域的內容復原/重做
 * - 支持快捷鍵：Ctrl+Z (復原) / Ctrl+Shift+Z (重做)
 * - 自動處理貼上、剪切等特殊輸入事件
 */
const UndoManager = {
  MAX_HISTORY_SIZE: 50,
  isUndoRedoOperation: false,
  inputHistories: new Map(),
  _autoIdSeq: 0, // 給無 name/id 的元素分配穩定唯一序號

  /** 獲取輸入元素的唯一標識
   * 意圖：原本對無 name/id 的元素用 querySelectorAll(tagName).indexOf —— 每次呼叫就全頁掃同類元素 O(n)，
   * 在 157+ textarea 的編輯頁演變成每次 DOM 變動 O(n²)。改為在元素上快取一次性序號：O(1)，且不隨 DOM 位置漂移更穩定。 */
  getInputId(element) {
    if (!element) return (LogUtils.error('getInputId: element is undefined'), 'unknown');
    if (element._undoId) return element._undoId;
    const key = element.name || element.id || `auto${++this._autoIdSeq}`;
    return (element._undoId = `input-${element.tagName.toLowerCase()}-${key}`);
  },

  /** 檢查是否為有效的輸入元素 */
  isValidInput: element => 
    element?.tagName === 'TEXTAREA' || 
    (element?.tagName === 'INPUT' && 
     ['text', 'search', 'url', 'tel', 'password'].includes(element.type)),

  /** 添加新的歷史記錄 */
  addToHistory(value, element) {
    if (!element) {
      LogUtils.error('addToHistory: 無效的元素');
      return;
    }

    try {
      const inputId = this.getInputId(element);
      let history = this.inputHistories.get(inputId) || this.initHistory(element);
      
      if (history.history[history.currentIndex] === value) return;

      history.history = history.history
        .slice(0, history.currentIndex + 1)
        .concat(value)
        .slice(-this.MAX_HISTORY_SIZE);
      
      history.currentIndex = history.history.length - 1;
      LogUtils.log(`添加新的歷史記錄 [${inputId}]，當前索引:`, history.currentIndex);
    } catch (error) {
      LogUtils.error('添加歷史記錄時發生錯誤:', error);
    }
  },

  /** 初始化歷史記錄 */
  initHistory(element) {
    const initialValue = element.value || '';
    const history = { 
      history: [initialValue], 
      currentIndex: 0 
    };
    this.inputHistories.set(this.getInputId(element), history);
    return history;
  },

  /** 初始化輸入元素的歷史記錄功能 */
  initInputHistory(inputElement) {
    if (!inputElement) {
      LogUtils.log('找不到輸入元素，跳過初始化歷史記錄');
      return;
    }

    try {
      const inputId = this.getInputId(inputElement);
      if (inputElement._historyInitialized) return;

      this.initHistory(inputElement);

      const handleInput = event => {
        if (!event.target || !document.body.contains(event.target)) {
          LogUtils.log('元素已不存在，跳過處理');
          return;
        }

        try {
          if (!this.isUndoRedoOperation) {
            clearTimeout(this._inputTimeout);
            this._inputTimeout = setTimeout(() => {
              if (event.target && document.body.contains(event.target)) {
                this.addToHistory(event.target.value, event.target);
              }
            }, 0);
          }
        } catch (error) {
          LogUtils.log('處理輸入事件時發生錯誤:', error);
        }
      };

      const handlePasteOrCut = event => {
        if (event.target && document.body.contains(event.target)) {
          setTimeout(() => {
            if (event.target && document.body.contains(event.target)) {
              this.addToHistory(event.target.value, event.target);
            }
          }, 0);
        }
      };

      inputElement.addEventListener('input', handleInput);
      inputElement.addEventListener('paste', handlePasteOrCut);
      inputElement.addEventListener('cut', handlePasteOrCut);

      inputElement._historyHandlers = { 
        input: handleInput,
        paste: handlePasteOrCut,
        cut: handlePasteOrCut
      };
      inputElement._historyInitialized = true;
      
      if (!this._initializedInputs) this._initializedInputs = new Set();
      this._initializedInputs.add(inputId);
      
      clearTimeout(this._logTimeout);
      this._logTimeout = setTimeout(() => {
        LogUtils.log(`已初始化輸入框歷史記錄，共 ${this._initializedInputs.size} 個元素`);
        this._initializedInputs.clear();
      }, 100);

    } catch (error) {
      LogUtils.log('初始化歷史記錄時發生錯誤:', error);
    }
  },

  /** 執行復原或重做操作 */
  executeHistoryOperation(isUndo = true) {
    const operation = isUndo ? '復原' : '重做';
    LogUtils.log(`執行${operation}操作`);

    const activeElement = document.activeElement;
    if (!this.isValidInput(activeElement)) return;

    const inputId = this.getInputId(activeElement);
    const history = this.inputHistories.get(inputId) || this.initHistory(activeElement);
    
    if (isUndo ? history.currentIndex > 0 : history.currentIndex < history.history.length - 1) {
      history.currentIndex += isUndo ? -1 : 1;
      
      this.isUndoRedoOperation = true;
      activeElement.value = history.history[history.currentIndex];
      activeElement.dispatchEvent(new Event('input', { bubbles: true }));
      
      setTimeout(() => {
        this.isUndoRedoOperation = false;
      }, 0);
      
      LogUtils.log(`${operation}到索引 [${inputId}]:`, history.currentIndex);
    }
  },

  /** 執行復原操作 */
  handleUndo: () => UndoManager.executeHistoryOperation(true),

  /** 執行重做操作 */
  handleRedo: () => UndoManager.executeHistoryOperation(false)
};

// 監聽鍵盤快捷鍵
document.addEventListener('keydown', event => {
  if (!UndoManager.isValidInput(document.activeElement)) return;

  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
    event.preventDefault();
    event.shiftKey ? UndoManager.handleRedo() : UndoManager.handleUndo();
  }
});

const INPUT_SELECTOR =
  `textarea, input[type="${['text', 'search', 'url', 'tel', 'password'].join('"], input[type="')}"]`;

// 首次全頁掃描（僅 DOMContentLoaded 用一次）
const initializeInputs = () => {
  document.querySelectorAll(INPUT_SELECTOR).forEach(input => {
    if (!input._historyInitialized) UndoManager.initInputHistory(input);
  });
};

// 只初始化「本批新增子樹」內的輸入元素，成本與新增量成正比，而非全頁元素數平方
const initializeInputsIn = node => {
  if (!node || node.nodeType !== 1) return;
  if (UndoManager.isValidInput(node) && !node._historyInitialized) UndoManager.initInputHistory(node);
  if (node.querySelectorAll) {
    node.querySelectorAll(INPUT_SELECTOR).forEach(input => {
      if (!input._historyInitialized) UndoManager.initInputHistory(input);
    });
  }
};

// 在 DOM 加載完成後初始化
document.addEventListener('DOMContentLoaded', initializeInputs);

// 監聽 DOM 變化：原本每次變動都 setTimeout 全頁重掃（O(n²)，157 textarea 時 ~36ms/次且越點越多越慢）。
// 改為只處理本批 addedNodes 的子樹 —— 不再全頁重掃。
new MutationObserver(mutations => {
  for (const mutation of mutations) {
    for (const node of mutation.addedNodes) initializeInputsIn(node);
  }
}).observe(document.body, { childList: true, subtree: true });

window.UndoManager = UndoManager;
