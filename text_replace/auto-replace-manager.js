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
    FROM_INPUT_WIDTH: 285,    // 替換目標框寬度
    TO_INPUT_WIDTH: 115,      // 替換結果框寬度
    INPUT_HEIGHT: 32          // 輸入框高度
  },

  // 添加一個屬性來存儲當前的規則
  _activeRules: [],

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
      
      // 添加輸入事件來自動調整高
      const adjustHeight = (element) => {
        const container = element.parentElement;
        
        if (document.activeElement !== element) {
          container.style.height = '32px';
          element.style.whiteSpace = 'nowrap';
          return;
        }

        // 創建臨時元素來計算高度
        const div = document.createElement('div');
        div.style.cssText = `
          position: fixed;
          visibility: hidden;
          width: ${element.offsetWidth - 16}px;
          font: ${getComputedStyle(element).font};
          line-height: ${getComputedStyle(element).lineHeight};
          white-space: pre-wrap;
          word-wrap: break-word;
          padding: 6px 8px;
        `;
        
        // 設置內容
        const content = element.value || element.placeholder;
        const hasNewline = content.includes('\n');
        
        div.textContent = content;
        document.body.appendChild(div);
        
        // 計算新高度
        const newHeight = Math.max(32, div.offsetHeight + (hasNewline ? 20 : 0));
        container.style.height = `${newHeight}px`;
        element.style.whiteSpace = 'pre-wrap';
        
        // 移除臨時元素
        div.remove();
      };

      // 監聽事件
      input.addEventListener('input', function() {
        if (document.activeElement === this) {
          requestAnimationFrame(() => adjustHeight(this));
        }
      });

      // 監聽 Enter 鍵事件
      input.addEventListener('keydown', function(e) {
        if (e.key === 'Enter' && document.activeElement === this) {
          requestAnimationFrame(() => adjustHeight(this));
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
      container.appendChild(group);
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
    let groups = null;
    let startIndex = 0;

    handle.addEventListener('mousedown', (e) => {
      e.preventDefault();
      isDragging = true;
      startY = e.clientY;
      
      // 獲取初始位置和尺寸
      startRect = group.getBoundingClientRect();
      
      // 獲取所有組
      const container = group.parentElement;
      groups = Array.from(container.querySelectorAll('.auto-replace-group'));
      startIndex = groups.indexOf(group);
      
      // 創建佔位元素
      placeholder = group.cloneNode(true);
      placeholder.style.opacity = '0.3';
      placeholder.style.pointerEvents = 'none';
      
      // 設置拖曳中的組樣式
      group.style.position = 'fixed';
      group.style.zIndex = '1000';
      group.style.width = `${startRect.width}px`;
      group.style.left = `${startRect.left}px`;
      group.style.top = `${startRect.top}px`;
      group.style.backgroundColor = '#fff';
      group.style.transform = 'scale(1.02)';
      group.style.boxShadow = '0 2px 10px rgba(0,0,0,0.1)';
      
      container.insertBefore(placeholder, group);
      
      // 更新 groups 陣列，將 placeholder 加入
      const placeholderIndex = groups.indexOf(group);
      groups.splice(placeholderIndex, 0, placeholder);
      
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    });

    const handleMouseMove = (e) => {
      if (!isDragging) return;
      
      // 計算新位置
      const deltaY = e.clientY - startY;
      const newTop = startRect.top + deltaY;
      group.style.top = `${newTop}px`;
      
      // 計算當前位置
      const container = group.parentElement;
      const containerRect = container.getBoundingClientRect();
      const relativeY = e.clientY - containerRect.top;
      
      // 找到最接近的目標位置
      let targetIndex = -1;
      let minDistance = Infinity;
      
      groups.forEach((item, index) => {
        if (item === group || item === placeholder) return;
        
        const itemRect = item.getBoundingClientRect();
        // 修改：使用項目的頂部位置而不是中點
        const itemTop = itemRect.top - containerRect.top;
        // 修改：降低距離判斷的門檻
        const distance = Math.abs(relativeY - itemTop);
        
        // 修改：降低最小距離的門檻，讓更容易觸發
        if (distance < minDistance && distance < itemRect.height) {
          minDistance = distance;
          targetIndex = index;
        }
      });
      
      // 移動佔位元素
      if (targetIndex !== -1) {
        const targetGroup = groups[targetIndex];
        // 修改：簡化插入位置的判斷
        // 如果當拖動元素的中心點超過目標元素的 50% 高度時，插入到前面
        const shouldInsertBefore = relativeY < 
          targetGroup.getBoundingClientRect().top - containerRect.top + 
          (targetGroup.offsetHeight * 0.5); // 降低到 50% 的高度就觸發
        
        // 從當前位置移除 placeholder
        placeholder.remove();
        
        // 插入到新位置
        container.insertBefore(
          placeholder, 
          shouldInsertBefore ? targetGroup : targetGroup.nextSibling
        );
        
        // 更新 groups 陣列中 placeholder 的位置
        const oldIndex = groups.indexOf(placeholder);
        const newIndex = shouldInsertBefore ? targetIndex : targetIndex + 1;
        if (oldIndex !== -1 && oldIndex !== newIndex) {
          groups.splice(oldIndex, 1);
          groups.splice(newIndex, 0, placeholder);
        }
      }

      // 處理容器滾動
      const margin = 100;
      if (e.clientY - containerRect.top < margin) {
        container.scrollTop -= 10;
      } else if (containerRect.bottom - e.clientY < margin) {
        container.scrollTop += 10;
      }
    };

    const handleMouseUp = () => {
      if (!isDragging) return;
      isDragging = false;
      
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
      container.insertBefore(group, placeholder);
      placeholder.remove();
      
      // 保存新順序
      this.saveAutoReplaceRules(container);
      
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
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
        const fromInput = containers[0]?.querySelector('textarea'); // 獲取替換目標框
        const toInput = containers[1]?.querySelector('textarea');   // 獲取替換結果框
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

    const rules = this._getActiveRules();
    
    rules.forEach(rule => {
        try {
            const regex = this.createRegex(rule.from);
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
        const fromInput = containers[0]?.querySelector('textarea');
        const toInput = containers[1]?.querySelector('textarea');
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