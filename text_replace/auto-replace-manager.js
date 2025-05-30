/**
 * 自動替換管理模組
 * 
 * 依賴模組：
 * 1. text_replace/replace-manager.js
 *    - ReplaceManager.initializeReplaceGroups：用於初始化替換組
 *    - ReplaceManager.setupGroupEvents：設置組事件處理
 * 
 * 2. regex_helper/regex-helper.js
 *    - RegexHelper.createRegex：用於創建替換用的正則表達式
 * 
 * 3. Chrome Storage API
 *    - chrome.storage.local：用於存儲和讀取自動替換規則
 * 
 * 4. Chrome Tabs API
 *    - chrome.tabs：用於與 content script 通信
 * 
 * 主要功能：
 * - 管理自動替換規則
 * - 處理自動替換的執行
 * - 提供拖曳排序功能
 * - 管理輸入框的展開/收縮
 */
const AutoReplaceManager = {
  CONFIG: {
    AUTO_REPLACE_KEY: 'autoReplaceRules',
    FROM_INPUT_WIDTH: 367,    // 替換目標框寬度 (285 + 82)
    TO_INPUT_WIDTH: 115,      // 替換結果框寬度
    INPUT_HEIGHT: 32          // 輸入框高度
  },

  // 添加一個屬性來存儲當前的規則
  _activeRules: [],

  // 工具函數 - 節流函數，減少函數執行頻率
  throttle: function(fn, delay) {
    let lastCall = 0;
    return function(...args) {
      const now = new Date().getTime();
      if (now - lastCall < delay) {
        return;
      }
      lastCall = now;
      return fn(...args);
    };
  },

  /** UI 創建相關方法 */
  UI: {
    /** 創建拖曳把手 */
    createDragHandle() {
      const handle = document.createElement('div');
      handle.className = 'replace-drag-handle';
      return handle;
    },

    /** 創建輸入框 */
    createInput(placeholder, isFromInput) {
      // 創建容器
      const container = document.createElement('div');
      container.className = 'replace-input-container';
      const width = isFromInput ? 
        AutoReplaceManager.CONFIG.FROM_INPUT_WIDTH : 
        AutoReplaceManager.CONFIG.TO_INPUT_WIDTH;
      container.style.width = `${width}px`;
      
      // 創建輸入框
      const input = document.createElement('textarea');
      input.placeholder = placeholder;
      input.className = 'replace-input';
      input.rows = 1;
      
      // 創建共用的測量用div
      const measureDiv = document.createElement('div');
      measureDiv.style.cssText = `
        position: fixed;
        visibility: hidden;
        white-space: pre-wrap;
        word-wrap: break-word;
        padding: 6px 8px;
      `;
      document.body.appendChild(measureDiv);
      
      // 添加輸入事件來自動調整高
      const adjustHeight = (element) => {
        const container = element.parentElement;
        
        if (document.activeElement !== element) {
          container.style.height = '32px';
          element.style.whiteSpace = 'nowrap';
          return;
        }

        // 更新測量元素的樣式
        measureDiv.style.width = `${element.offsetWidth - 16}px`;
        measureDiv.style.font = getComputedStyle(element).font;
        measureDiv.style.lineHeight = getComputedStyle(element).lineHeight;
        
        // 設置內容
        const content = element.value || element.placeholder;
        const hasNewline = content.includes('\n');
        
        measureDiv.textContent = content;
        
        // 計算新高度
        const newHeight = Math.max(32, measureDiv.offsetHeight + (hasNewline ? 20 : 0));
        container.style.height = `${newHeight}px`;
        element.style.whiteSpace = 'pre-wrap';
      };

      // 使用節流函數減少觸發頻率
      const throttledAdjust = AutoReplaceManager.throttle((element) => {
        adjustHeight(element);
      }, 100);

      // 監聽事件
      input.addEventListener('input', function() {
        if (document.activeElement === this) {
          throttledAdjust(this);
        }
      });

      // 監聽 Enter 鍵事件
      input.addEventListener('keydown', function(e) {
        if (e.key === 'Enter' && document.activeElement === this) {
          throttledAdjust(this);
        }
      });

      // 失去焦點時調整高度
      input.addEventListener('blur', function() {
        requestAnimationFrame(() => {
          this.parentElement.style.height = '32px';
          this.style.whiteSpace = 'nowrap';
        });
      });

      // 獲得焦點時調整高度
      input.addEventListener('focus', function() {
        requestAnimationFrame(() => {
          this.style.whiteSpace = 'pre-wrap';
          adjustHeight(this);
        });
      });

      // 將輸入框添加到容器中
      container.appendChild(input);
      
      // 在視窗關閉時清理測量元素
      window.addEventListener('beforeunload', () => {
        measureDiv.remove();
      }, { once: true });
      
      return container;
    },

    /** 創建控制按鈕 */
    createControlButtons(addCallback, removeCallback) {
      const container = document.createElement('div');
      container.className = 'replace-group-controls';

      const addButton = document.createElement('button');
      addButton.textContent = '+';
      addButton.className = 'replace-control-button';
      addButton.id = 'replace-add-button';
      addButton.onclick = addCallback;
      container.appendChild(addButton);

      const removeButton = document.createElement('button');
      removeButton.textContent = '-';
      removeButton.className = 'replace-control-button';
      removeButton.id = 'replace-remove-button';
      
      // 修改為雙擊事件
      let lastClickTime = 0;
      removeButton.addEventListener('click', (e) => {
        const currentTime = new Date().getTime();
        const timeDiff = currentTime - lastClickTime;
        
        if (timeDiff < 300) { // 300毫秒內的雙擊
          removeCallback();
        }
        
        lastClickTime = currentTime;
      });
      
      // 將按鈕添加到容器中
      container.appendChild(removeButton);

      return container;
    }
  },

  /** 組管理相關方法 */
  GroupManager: {
    /** 添加新組 */
    addGroup(referenceGroup, textArea) {
      const container = referenceGroup.parentElement;
      const group = AutoReplaceManager.createAutoReplaceGroup(textArea);
      
      // 在當前組的下一行插入新組，而不是添加到最後
      if (referenceGroup.nextSibling) {
        container.insertBefore(group, referenceGroup.nextSibling);
      } else {
        // 如果當前組是最後一個，則直接添加到最後
        container.appendChild(group);
      }
      
      AutoReplaceManager.saveAutoReplaceRules(container);
    },

    /** 移除組 */
    removeGroup(group) {
      const container = group.parentElement;
      const groups = container.querySelectorAll('.auto-replace-group');
      
      if (groups.length === 1) {
        // 如果是最後一個組，清空輸入框
        const fromInput = group.querySelector('.replace-input-container:first-of-type .replace-input');
        // 如果沒有替換目標框，則不進行清空
        if (fromInput) fromInput.value = '';
        const toInput = group.querySelector('.replace-input-container:last-of-type .replace-input');
        // 如果沒有替換結果框，則不進行清空
        if (toInput) toInput.value = '';
        const checkbox = group.querySelector('.auto-replace-checkbox');
        if (checkbox) checkbox.checked = false;
      } else {
        // 移除組
        group.remove();
      }
      
      // 保存規則
      AutoReplaceManager.saveAutoReplaceRules(container);
    }
  },

  /** 創建自動替換組 */
  createAutoReplaceGroup(textArea, initialData = null) {
    const group = document.createElement('div');
    group.className = 'auto-replace-group';
    
    // 創建控制元素容器
    const controlsContainer = document.createElement('div');
    controlsContainer.className = 'controls-container';
    
    // 添加拖曳把手
    const dragHandle = this.UI.createDragHandle();
    controlsContainer.appendChild(dragHandle);

    // 添加控制按鈕
    const controlButtons = this.UI.createControlButtons(
      () => this.GroupManager.addGroup(group, textArea),
      () => this.GroupManager.removeGroup(group)
    );
    controlsContainer.appendChild(controlButtons);

    // 創建勾選框
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.className = 'auto-replace-checkbox';
    if (initialData?.enabled) {
      checkbox.checked = true;
    }
    controlsContainer.appendChild(checkbox);

    // 將控制元素容器添加到組中
    group.appendChild(controlsContainer);

    // 創建輸入框容器
    const fromInputContainer = this.UI.createInput('自動替換', true);   // 替換目標框
    const toInputContainer = this.UI.createInput('替換為', false);      // 替換結果框

    // 獲取實際的輸入框元素並設置初始值
    const fromInput = fromInputContainer.querySelector('.replace-input');
    const toInput = toInputContainer.querySelector('.replace-input');
    if (initialData) {
      if (initialData.from) fromInput.value = initialData.from;
      if (initialData.to) toInput.value = initialData.to;
    }

    // 設置事件
    this.setupGroupEvents(group, textArea, fromInput, toInput, checkbox);

    // 添加輸入框容器
    group.appendChild(fromInputContainer);
    group.appendChild(toInputContainer);

    // 設置拖曳事件
    this.setupDragEvents(group, dragHandle);

    return group;
  },

  /** 設置拖曳事件 */
  setupDragEvents(group, handle) {
    let isDragging = false;
    let startY = 0;
    let startRect = null;
    let placeholder = null;
    let initialSiblingGroups = null;
    let moveHandler = null;
    let upHandler = null;
    let scrollInterval = null;  // 新增：滾動定時器

    handle.addEventListener('mousedown', (e) => {
      e.preventDefault();
      isDragging = true;
      startY = e.clientY;
      
      // 獲取初始位置和尺寸
      startRect = group.getBoundingClientRect();
      
      // 獲取所有可拖曳的兄弟組 (不包含當前拖曳的組)
      const container = group.parentElement;
      initialSiblingGroups = Array.from(container.querySelectorAll('.auto-replace-group')).filter(g => g !== group);
      
      // 創建佔位元素
      placeholder = group.cloneNode(true);
      placeholder.style.opacity = '0.3';
      placeholder.style.pointerEvents = 'none';
      placeholder.id = 'drag-placeholder'; // 添加唯一ID便於識別
      
      // 設置拖曳中的組樣式
      group.style.position = 'fixed';
      group.style.zIndex = '1000';
      group.style.width = `${startRect.width}px`;
      group.style.left = `${startRect.left}px`;
      group.style.top = `${startRect.top}px`;
      group.style.backgroundColor = '#fff';
      group.style.transform = 'scale(1.02)';
      group.style.boxShadow = '0 4px 15px rgba(0,0,0,0.35)';
      
      // 將 placeholder 插入到 DOM 中 group 原本的位置
      container.insertBefore(placeholder, group);
      
      moveHandler = (e) => handleMouseMove(e);
      upHandler = () => handleMouseUp();
      
      document.addEventListener('mousemove', moveHandler);
      document.addEventListener('mouseup', upHandler);
    });

    const handleMouseMove = (e) => {
      if (!isDragging) return;
      
      // 計算新位置
      const deltaYDragging = e.clientY - startY;
      const newTop = startRect.top + deltaYDragging;
      group.style.top = `${newTop}px`;
      
      const container = group.parentElement;
      const containerRect = container.getBoundingClientRect();
      
      // 取得佔位符與原始元素的相對位置
      const placeholder = document.getElementById('drag-placeholder');
      const placeholderRect = placeholder.getBoundingClientRect();
      const groupRect = group.getBoundingClientRect();
      
      let nextSibling = null;
      
      // 判斷拖曳方向
      if (placeholderRect.top < groupRect.top) {
        // 佔位符在原始元素上方，往下拖
        console.log('往下拖曳，滑鼠Y:', e.clientY);
        
        // 只比較佔位符的下一列
        const nextElement = placeholder.nextElementSibling;
        console.log('下一元素:', nextElement ? (nextElement.id || '普通元素') : '無');
        
        // 檢查下一元素是否為拖曳元素
        if (nextElement === group) {
          console.log('下一元素是拖曳元素，檢查下下一元素');
          const nextNextElement = group.nextElementSibling;
          
          if (nextNextElement && nextNextElement.id !== 'drag-placeholder') {
            const nextElementRect = nextNextElement.getBoundingClientRect();
            console.log(`比較滑鼠Y(${e.clientY}) > 下下一列頂(${nextElementRect.top}) ?`, e.clientY > nextElementRect.top);
            
            // 如果滑鼠Y大於下下一列的頂邊界，把佔位符移到下下一列之前
            if (e.clientY > nextElementRect.top) {
              nextSibling = nextNextElement;
              console.log('滑鼠超過下下一列頂部，移動佔位符');
            }
          } else {
            console.log('沒有下下一列或者是佔位符，保持不變');
          }
        } else if (nextElement && nextElement.id !== 'drag-placeholder') {
          const nextElementRect = nextElement.getBoundingClientRect();
          console.log(`比較滑鼠Y(${e.clientY}) > 下一列頂(${nextElementRect.top}) ?`, e.clientY > nextElementRect.top);
          
          // 如果滑鼠Y大於下一列的頂邊界，把佔位符移到下一列之後
          if (e.clientY > nextElementRect.top) {
            nextSibling = nextElement.nextElementSibling;
            console.log('滑鼠超過下一列頂部，移動佔位符');
          }
        } else {
          console.log('沒有有效的下一列，保持佔位符位置不變');
        }
      } else {
        // 佔位符在原始元素下方，往上拖
        console.log('往上拖曳，滑鼠Y:', e.clientY);
        
        // 找出佔位符的前一列
        let prevElement = null;
        const siblings = Array.from(container.querySelectorAll('.auto-replace-group'));
        for (let i = 0; i < siblings.length; i++) {
          if (siblings[i] === placeholder && i > 0) {
            prevElement = siblings[i-1];
            break;
          }
        }
        
        console.log('上一元素:', prevElement ? (prevElement.id || '普通元素') : '無');
        
        // 檢查上一元素是否為拖曳元素
        if (prevElement === group) {
          console.log('上一元素是拖曳元素，檢查上上一元素');
          // 尋找拖曳元素的前一個元素
          for (let i = 0; i < siblings.length; i++) {
            if (siblings[i] === group && i > 0) {
              prevElement = siblings[i-1];
              break;
            }
          }
          
          if (prevElement && prevElement.id !== 'drag-placeholder') {
            const prevElementRect = prevElement.getBoundingClientRect();
            console.log(`比較滑鼠Y(${e.clientY}) < 上上一列底(${prevElementRect.bottom}) ?`, e.clientY < prevElementRect.bottom);
            
            // 如果滑鼠Y小於上上一列的底邊界，把佔位符移到上上一列之前
            if (e.clientY < prevElementRect.bottom) {
              nextSibling = prevElement;
              console.log('滑鼠低於上上一列底部，移動佔位符');
            }
          } else {
            console.log('沒有上上一列或者是佔位符，保持不變');
          }
        } else if (prevElement && prevElement.id !== 'drag-placeholder') {
          const prevElementRect = prevElement.getBoundingClientRect();
          console.log(`比較滑鼠Y(${e.clientY}) < 上一列底(${prevElementRect.bottom}) ?`, e.clientY < prevElementRect.bottom);
          
          // 如果滑鼠Y小於上一列的底邊界，把佔位符移到上一列之前
          if (e.clientY < prevElementRect.bottom) {
            nextSibling = prevElement;
            console.log('滑鼠低於上一列底部，移動佔位符');
          }
        } else {
          console.log('沒有有效的上一列，保持佔位符位置不變');
        }
      }
      
      // 獲取佔位符
      if (placeholder) {
        const placeholderCurrentPosition = placeholder.nextSibling;
        const needsMove = nextSibling !== null && 
                          nextSibling !== placeholderCurrentPosition;
        if (needsMove) {
          console.log(`移動佔位符: 從 ${placeholderCurrentPosition ? placeholderCurrentPosition.id || '元素' : '尾部'} 到 ${nextSibling ? nextSibling.id || '元素' : '尾部'}`);
          container.insertBefore(placeholder, nextSibling);
          console.log('佔位符已移動到新位置');
        } else {
          console.log('佔位符位置無需變更');
        }
      }

      // 處理容器滾動 - 改用定時器處理
      const margin = 100;
      const isInTopScrollZone = e.clientY - containerRect.top < margin && container.scrollTop > 0;
      const isInBottomScrollZone = containerRect.bottom - e.clientY < margin && 
                                 container.scrollTop < container.scrollHeight - container.clientHeight;
      
      // 清除現有的滾動定時器，
      if (scrollInterval) {
        clearInterval(scrollInterval);
        scrollInterval = null;
      }
      
      // 如果在滾動區域內，設置新的滾動定時器
      if (isInTopScrollZone || isInBottomScrollZone) {
        scrollInterval = setInterval(() => {
          if (isInTopScrollZone) {
            container.scrollTop -= 5;
          } else if (isInBottomScrollZone) {
            container.scrollTop += 5;
          }
        }, 16); // 約60fps的滾動速率
      }
    };

    const handleMouseUp = () => {
      if (!isDragging) return;
      isDragging = false;
      
      // 清除滾動定時器
      if (scrollInterval) {
        clearInterval(scrollInterval);
        scrollInterval = null;
      }
      
      // 恢復組的樣式
      group.style.position = '';
      group.style.zIndex = '';
      group.style.width = '';
      group.style.left = '';
      group.style.top = '';
      group.style.transform = '';
      group.style.boxShadow = '';
      
      // 移動到新位置
      const container = group.parentElement;
      const placeholder = document.getElementById('drag-placeholder');
      if (placeholder && container.contains(placeholder)) {
        // 防止最後一次不必要的閃爍，先移除拖曳元素的視覺效果，再執行位置調整
        container.insertBefore(group, placeholder);
        placeholder.remove();
      }
      
      // 保存新順序
      this.saveAutoReplaceRules(container);
      
      // 移除事件監聽器，防止內存洩漏
      if (moveHandler) {
        document.removeEventListener('mousemove', moveHandler);
        moveHandler = null;
      }
      if (upHandler) {
        document.removeEventListener('mouseup', upHandler);
        upHandler = null;
      }
    };
  },

  /** 設置組事件 */
  setupGroupEvents(group, textArea, fromInput, toInput, checkbox) {
    window.ReplaceManager.setupGroupEvents(group, textArea, fromInput, toInput, checkbox, {
      isManual: false,
      onRulesSave: (container) => {
        this.saveAutoReplaceRules(container);
      }
    });
  },

  /** 發送消息到 content script */
  sendMessageToTab(message) {
    chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
      if (!tabs[0]) {
        console.debug('沒有找到活動的標籤頁');
        return;
      }
      
      try {
        chrome.tabs.sendMessage(tabs[0].id, message, function(response) {
          if (chrome.runtime.lastError) {
            // 這是正常的情況，不需要顯示為錯誤
            console.debug('Content script 正在載入中...');
            return;
          }
        });
      } catch (error) {
        console.debug('發送消息時出錯:', error);
      }
    });
  },

  /** 初始化自動替換組 */
  initializeAutoReplaceGroups(container, textArea) {
    window.ReplaceManager.initializeReplaceGroups({
      otherContainer: container,  // 其他組容器
      textArea,                  // 文本區域
      storageKey: 'replace_autoReplaceRules', // 儲存 key
      createGroupFn: this.createAutoReplaceGroup.bind(this), // 創建組函數
      onInitialized: () => this.handleAutoReplace(textArea), // 初始化完成後的回調
      isManual: false            // 是否為手動替換
    });
  },

  /** 保存自動替換規則 */
  saveAutoReplaceRules(container) {
    console.group('保存替換規則');
    
    const rules = Array.from(container.querySelectorAll('.auto-replace-group')).map(group => {
        const containers = Array.from(group.children).filter(el => el.classList.contains('replace-input-container')); // 獲取輸入框容器
        const fromInput = containers[0]?.querySelector('.replace-input'); // 獲取替換目標框
        const toInput = containers[1]?.querySelector('.replace-input');   // 獲取替換結果框
        const checkbox = group.querySelector('.auto-replace-checkbox'); // 獲取勾選框
        
        const rule = {
            from: fromInput?.value || '', // 獲取替換目標框的值
            to: toInput?.value || '',     // 獲取替換結果框的值
            enabled: checkbox?.checked || false // 獲取勾選框的狀態
        };
        
        console.log('保存規則:', rule); // 輸出規則
        return rule;
    });

    console.log('所有規則:', rules); // 輸出所有規則

    // 修改：使用 local storage 和帶前綴的 key 儲存
    const storageKey = 'replace_' + this.CONFIG.AUTO_REPLACE_KEY; // 帶前綴的 key
    chrome.storage.local.set({ [storageKey]: rules }, () => {
        if (chrome.runtime.lastError) {
            console.error('保存規則失敗:', chrome.runtime.lastError);
        } else {
            console.log('規則保存成功'); // 規則保存成功
        }
    });

    console.groupEnd();
  },

  /** 執行自動替換 */
  handleAutoReplace(textArea) {
    // 如果在 popup 頁面中，發送消息到 content script
    if (window.location.pathname.endsWith('popup.html')) {
      this._sendMessageToContentScript();
      return;
    }

    // 獲取並保存游標位置
    const cursorState = this._saveCursorState(textArea);
    
    // 執行替換
    const result = this._executeReplacements(textArea);
    
    // 如果有變更，更新文本並恢復游標
    if (result.changed) {
      this._updateTextAreaValue(textArea, result.text, cursorState);
    }
  },

  /** 發送消息到 content script */
  _sendMessageToContentScript() {
    chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
      chrome.tabs.sendMessage(tabs[0].id, {
        action: "triggerAutoReplace"
      });
    });
  },

  /** 保存游標狀態 */
  _saveCursorState(textArea) {
    return {
      start: textArea.selectionStart,
      end: textArea.selectionEnd
    };
  },

  /** 執行所有替換規則 */
  _executeReplacements(textArea) {
    let text = textArea.value;
    let changed = false;
    let totalChanges = 0;
    let replacementDetails = [];
    let regexCache = new Map(); // 正則表達式緩存

    const rules = this._getActiveRules();
    
    rules.forEach(rule => {
        try {
            const fromText = rule.from;
            // 優先使用緩存中的正則表達式
            let regex = regexCache.get(fromText);
            if (!regex) {
                regex = this.createRegex(fromText);
                regexCache.set(fromText, regex); // 緩存新創建的正則表達式
            }
            
            const matches = text.match(regex);
            
            if (matches) {
                // 記錄每個匹配項被替換的詳情
                matches.forEach(match => {
                    replacementDetails.push({
                        from: match,
                        to: rule.to
                    });
                });
            }
            // 進行替換
            const newText = text.replace(regex, rule.to);
            if (newText !== text) {
                text = newText;
                changed = true;
                totalChanges += matches ? matches.length : 0;
            }
        } catch (error) {
            console.error('替換錯誤:', error);
        }
    });

    if (changed) {
        // 輸出詳細的替換資訊
        console.log(`自動替換：完成 ${totalChanges} 處替換`);
        replacementDetails.forEach(detail => {
            console.log(`將「${detail.from}」替換為「${detail.to}」`);
        });
    }
    return { text, changed };
  },

  /** 獲取所有啟用的替換規則 */
  _getActiveRules() {
    // 如果有新規則，使用新規則
    if (this._activeRules && this._activeRules.length > 0) {
      return this._activeRules.filter(rule => rule.enabled && rule.from);
    }

    // 否則從 DOM 中獲取規則
    const rules = Array.from(document.querySelectorAll('.auto-replace-group'))
      .map(group => {
        const containers = Array.from(group.children)
          .filter(el => el.classList.contains('replace-input-container'));
        const fromInput = containers[0]?.querySelector('.replace-input');
        const toInput = containers[1]?.querySelector('.replace-input');
        const enabled = group.querySelector('.auto-replace-checkbox').checked;
        
        return {
          from: fromInput?.value?.trim() || '',
          to: toInput?.value?.trim() || '',
          enabled
        };
      })
      .filter(rule => rule.enabled && rule.from);

    return rules;
  },

  /** 更新文本區域的值並恢復游標位置 */
  _updateTextAreaValue(textArea, newText, cursorState) {
    textArea.value = newText;
    textArea.dispatchEvent(new Event('input', { bubbles: true }));
    textArea.setSelectionRange(cursorState.start, cursorState.end);
  },

  /** 創建正則表達式 */
  createRegex(text) {
    return RegexHelper.createRegex(text);
  }
};

window.AutoReplaceManager = AutoReplaceManager; 