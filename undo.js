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

  /** 獲取輸入元素的唯一標識 */
  getInputId: element => 
    element ? 
    `input-${element.tagName.toLowerCase()}-${element.name || element.id || 
      Array.from(document.querySelectorAll(element.tagName)).indexOf(element)}` :
    (console.error('getInputId: element is undefined'), 'unknown'),

  /** 檢查是否為有效的輸入元素 */
  isValidInput: element => 
    element?.tagName === 'TEXTAREA' || 
    (element?.tagName === 'INPUT' && 
     ['text', 'search', 'url', 'tel', 'password'].includes(element.type)),

  /** 添加新的歷史記錄 */
  addToHistory(value, element) {
    if (!element || this.isUndoRedoOperation) {
      console.error('addToHistory: 無效的元素或正在執行復原/重做操作');
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
      console.log(`添加新的歷史記錄 [${inputId}]，當前索引:`, history.currentIndex);
    } catch (error) {
      console.error('添加歷史記錄時發生錯誤:', error);
    }
  },

  /** 初始化歷史記錄 */
  initHistory(element) {
    const history = { history: [element.value || ''], currentIndex: 0 };
    this.inputHistories.set(this.getInputId(element), history);
    return history;
  },

  /** 初始化輸入元素的歷史記錄功能 */
  initInputHistory(inputElement) {
    if (!inputElement) {
      console.log('找不到輸入元素，跳過初始化歷史記錄');
      return;
    }

    try {
      // 保存初始值
      const initialValue = inputElement.value;
      const history = [initialValue];
      let currentIndex = 0;

      // 監聽輸入變化
      inputElement.addEventListener('input', (event) => {
        // 檢查元素是否還存在
        if (!document.body.contains(event.target)) {
          console.log('輸入元素已不存在，跳過歷史記錄');
          return;
        }

        try {
          const inputId = UndoManager.getInputId(event.target);
          if (UndoManager.inputHistories.has(inputId)) return;

          UndoManager.initHistory(event.target);

          const handleInput = event => {
            // 檢查元素和值是否存在
            if (!event.target || !document.body.contains(event.target)) {
              console.log('元素已不存在，跳過處理');
              return;
            }

            try {
              const history = UndoManager.inputHistories.get(inputId);
              const oldLength = history?.history[history?.currentIndex]?.length || 0;
              const newLength = event.target.value?.length || 0;
              
              clearTimeout(UndoManager._inputTimeout);
              UndoManager._inputTimeout = setTimeout(() => {
                // 再次檢查元素是否存在
                if (event.target && document.body.contains(event.target)) {
                  UndoManager.addToHistory(event.target.value, event.target);
                }
              }, Math.abs(newLength - oldLength) > 1 ? 500 : 0);
            } catch (error) {
              console.log('處理輸入事件時發生錯誤:', error);
            }
          };

          const handlePasteOrCut = () => {
            // 檢查元素是否存在
            if (event.target && document.body.contains(event.target)) {
              setTimeout(() => {
                if (event.target && document.body.contains(event.target)) {
                  UndoManager.addToHistory(event.target.value, event.target);
                }
              }, 0);
            }
          };

          event.target.addEventListener('input', handleInput);
          event.target.addEventListener('paste', handlePasteOrCut);
          event.target.addEventListener('cut', handlePasteOrCut);

          event.target._historyHandlers = { input: handleInput };
          event.target._historyInitialized = true;
          
          if (!UndoManager._initializedInputs) UndoManager._initializedInputs = new Set();
          UndoManager._initializedInputs.add(inputId);
          
          clearTimeout(UndoManager._logTimeout);
          UndoManager._logTimeout = setTimeout(() => {
            console.log(`已初始化輸入框歷史記錄，共 ${UndoManager._initializedInputs.size} 個元素`);
            UndoManager._initializedInputs.clear();
          }, 100);

        } catch (error) {
          console.log('處理輸入變化時發生錯誤:', error);
        }
      });

      console.log('已初始化輸入框歷史記錄，共', history.length, '個元素');
    } catch (error) {
      console.log('初始化歷史記錄時發生錯誤:', error);
    }
  },

  /** 執行復原或重做操作 */
  executeHistoryOperation(isUndo = true) {
    const operation = isUndo ? '復原' : '重做';
    console.log(`執行${operation}操作`);

    const activeElement = document.activeElement;
    if (!this.isValidInput(activeElement)) return;

    const inputId = this.getInputId(activeElement);
    const history = this.inputHistories.get(inputId) || this.initHistory(activeElement);
    
    if (isUndo ? history.currentIndex > 0 : history.currentIndex < history.history.length - 1) {
      history.currentIndex += isUndo ? -1 : 1;
      
      this.isUndoRedoOperation = true;
      activeElement.value = history.history[history.currentIndex];
      activeElement.dispatchEvent(new Event('input', { bubbles: true }));
      
      requestAnimationFrame(() => this.isUndoRedoOperation = false);
      console.log(`${operation}到索引 [${inputId}]:`, history.currentIndex);
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

// 初始化所有輸入元素
const initializeInputs = () => {
  document.querySelectorAll(
    `textarea, input[type="${['text', 'search', 'url', 'tel', 'password'].join('"], input[type="')}"]`
  ).forEach(input => {
    if (!input._historyInitialized) UndoManager.initInputHistory(input);
  });
};

// 在 DOM 加載完成後初始化
document.addEventListener('DOMContentLoaded', initializeInputs);

// 監聽 DOM 變化，處理新添加的輸入元素
new MutationObserver(mutations => {
  if (mutations.some(mutation => mutation.addedNodes.length > 0)) {
    setTimeout(initializeInputs, 100);
  }
}).observe(document.body, { childList: true, subtree: true });

window.UndoManager = UndoManager;
