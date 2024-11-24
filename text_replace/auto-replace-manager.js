/** 自動替換管理模組 */
const AutoReplaceManager = {
  CONFIG: {
    AUTO_REPLACE_KEY: 'autoReplaceRules',
    FROM_INPUT_WIDTH: 285,    // 替換目標框寬度
    TO_INPUT_WIDTH: 115,      // 替換結果框寬度
    INPUT_HEIGHT: 32          // 輸入框高度
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
      
      // 添加輸入事件來自動調整高
      const adjustHeight = (element) => {
        const container = element.parentElement;
        
        if (document.activeElement !== element) {
          container.style.height = '32px';
          element.style.whiteSpace = 'nowrap';
          return;
        }

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
        
        const content = element.value || element.placeholder;
        const hasNewline = content.includes('\n');
        
        div.textContent = content;
        document.body.appendChild(div);
        
        const newHeight = Math.max(32, div.offsetHeight + (hasNewline ? 20 : 0));
        container.style.height = `${newHeight}px`;
        element.style.whiteSpace = 'pre-wrap';
        
        div.remove();
      };

      // 監聽事件
      input.addEventListener('input', function() {
        if (document.activeElement === this) {
          requestAnimationFrame(() => adjustHeight(this));
        }
      });

      input.addEventListener('keydown', function(e) {
        if (e.key === 'Enter' && document.activeElement === this) {
          requestAnimationFrame(() => adjustHeight(this));
        }
      });

      input.addEventListener('blur', function() {
        requestAnimationFrame(() => {
          this.parentElement.style.height = '32px';
          this.style.whiteSpace = 'nowrap';
        });
      });

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
      removeButton.onclick = removeCallback;
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
        const toInput = group.querySelector('.replace-input-container:last-of-type .replace-input');
        const checkbox = group.querySelector('.auto-replace-checkbox');
        
        if (fromInput) fromInput.value = '';
        if (toInput) toInput.value = '';
        if (checkbox) checkbox.checked = false;
      } else {
        group.remove();
      }
      
      AutoReplaceManager.saveAutoReplaceRules(container);
    }
  },

  /** 創建自動替換 */
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
        const itemMiddle = itemRect.top + itemRect.height / 2 - containerRect.top;
        const distance = Math.abs(relativeY - itemMiddle);
        
        if (distance < minDistance) {
          minDistance = distance;
          targetIndex = index;
        }
      });
      
      // 移動佔位元素
      if (targetIndex !== -1) {
        const targetGroup = groups[targetIndex];
        const shouldInsertBefore = relativeY < targetGroup.getBoundingClientRect().top - containerRect.top + targetGroup.offsetHeight / 2;
        
        // 從當前位置移除 placeholder
        placeholder.remove();
        
        // 插入到新位置
        container.insertBefore(placeholder, shouldInsertBefore ? targetGroup : targetGroup.nextSibling);
        
        // 更新 groups 陣列中 placeholder 的位置
        const oldIndex = groups.indexOf(placeholder);
        const newIndex = shouldInsertBefore ? targetIndex : targetIndex + 1;
        if (oldIndex !== -1 && oldIndex !== newIndex) {
          groups.splice(oldIndex, 1);
          groups.splice(newIndex, 0, placeholder);
        }
      }

      // 處理容器滾動
      const margin = 50;
      if (e.clientY - containerRect.top < margin) {
        container.scrollTop -= 5;
      } else if (containerRect.bottom - e.clientY < margin) {
        container.scrollTop += 5;
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
    const handleInput = (input) => {
      console.group('處理輸入事件');
      console.log('輸入框值:', {
        from: fromInput.value,
        to: toInput.value,
        checked: checkbox.checked
      });

      // 先保存規則
      this.saveAutoReplaceRules(group.parentElement);
      console.log('規則已保存');
      
      // 只在 popup 頁面中發送消息
      if (window.location.pathname.endsWith('popup.html')) {
        console.log('準備發送消息到 content script');
        chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
          if (tabs[0]) {
            try {
              // 獲取當前的規則
              const container = group.parentElement;
              const rules = Array.from(container.querySelectorAll('.auto-replace-group')).map(group => {
                // 使用 children 來獲取直接子元素
                const containers = Array.from(group.children).filter(el => el.classList.contains('replace-input-container'));
                const fromInput = containers[0]?.querySelector('textarea');
                const toInput = containers[1]?.querySelector('textarea');
                const checkbox = group.querySelector('.auto-replace-checkbox');
                
                console.log('找到的輸入框:', {
                  fromContainer: containers[0],
                  toContainer: containers[1],
                  fromInput,
                  toInput
                });
                
                const rule = {
                  from: fromInput?.value || '',
                  to: toInput?.value || '',
                  enabled: checkbox?.checked || false
                };
                
                console.log('獲取到的實際值:', {
                  fromValue: fromInput?.value,
                  toValue: toInput?.value,
                  checked: checkbox?.checked
                });
                
                return rule;
              });

              console.log('準備發送的規則:', rules);

              // 發送完整的規則列表
              chrome.tabs.sendMessage(tabs[0].id, {
                action: "updateAutoReplaceRules",
                rules: rules
              }, function(response) {
                if (chrome.runtime.lastError) {
                  console.debug('Content script 正在載入中...');
                } else {
                  console.log('消息發送成功:', response);
                }
              });
            } catch (error) {
              console.error('發送消息時出錯:', error);
            }
          }
        });
      }
      console.groupEnd();
    };

    // 為兩個輸入框添加輸入事件監聽
    [fromInput, toInput].forEach(input => {
      // 使用 debounce 來限制事件觸發頻率
      let timeoutId = null;
      input.addEventListener('input', () => {
        console.log('輸入事件觸發');
        if (timeoutId) {
          console.log('清除之前的 timeout');
          clearTimeout(timeoutId);
        }
        timeoutId = setTimeout(() => {
          console.log('執行 debounced 處理');
          handleInput(input);
        }, 300);
      });
      
      input.addEventListener('blur', () => {
        console.log('失去焦點事件觸發');
        if (checkbox.checked && fromInput.value.trim() && toInput.value.trim()) {
          this.handleAutoReplace(textArea);
        }
      });
    });

    // 複選框事件
    checkbox.addEventListener('change', () => {
      console.log('複選框狀態改變:', checkbox.checked);
      this.saveAutoReplaceRules(group.parentElement);
      if (checkbox.checked && fromInput.value.trim() && toInput.value.trim()) {
        this.handleAutoReplace(textArea);
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
    chrome.storage.sync.get([this.CONFIG.AUTO_REPLACE_KEY], (result) => {
      const rules = (result[this.CONFIG.AUTO_REPLACE_KEY] || [])
        .filter(rule => rule.from?.trim() || rule.to?.trim());
      
      if (rules.length === 0) rules.push({});
      
      rules.forEach(rule => {
        // 直接在創建時設置初始值
        const group = this.createAutoReplaceGroup(textArea, rule);
        container.appendChild(group);
      });

      this.handleAutoReplace(textArea);
    });

    textArea.addEventListener('input', () => this.handleAutoReplace(textArea));
  },

  /** 保存自動替換規則 */
  saveAutoReplaceRules(container) {
    // 添加日誌追蹤
    console.group('保存替換規則');
    
    const rules = Array.from(container.querySelectorAll('.auto-replace-group')).map(group => {
      // 使用 children 來獲取直接子元素
      const containers = Array.from(group.children).filter(el => el.classList.contains('replace-input-container'));
      const fromInput = containers[0]?.querySelector('textarea');
      const toInput = containers[1]?.querySelector('textarea');
      const checkbox = group.querySelector('.auto-replace-checkbox');
      
      const rule = {
        from: fromInput?.value || '',
        to: toInput?.value || '',
        enabled: checkbox?.checked || false
      };
      
      // 記錄每個規則的內容
      console.log('保存規則:', rule);
      
      return rule;
    });

    console.log('所有規則:', rules);

    chrome.storage.sync.set({ [this.CONFIG.AUTO_REPLACE_KEY]: rules }, () => {
      if (chrome.runtime.lastError) {
        console.error('保存規則失敗:', chrome.runtime.lastError);
      } else {
        console.log('規則保存成功');
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

    // 獲取所有啟用的替換規則
    const rules = this._getActiveRules();
    
    // 批次執行替換
    rules.forEach(rule => {
      try {
        const regex = this.createRegex(rule.from);
        const newText = text.replace(regex, rule.to);
        if (newText !== text) {
          text = newText;
          changed = true;
        }
      } catch (error) {
        console.error('替換錯誤:', error, rule);
      }
    });

    return { text, changed };
  },

  /** 獲取所有啟用的替換規則 */
  _getActiveRules() {
    return Array.from(document.querySelectorAll('.auto-replace-group'))
      .map(group => {
        // 使用相同的邏輯獲取輸入框
        const containers = Array.from(group.children).filter(el => el.classList.contains('replace-input-container'));
        const fromInput = containers[0]?.querySelector('textarea');
        const toInput = containers[1]?.querySelector('textarea');
        const enabled = group.querySelector('.auto-replace-checkbox').checked;
        
        return {
          from: fromInput?.value?.trim() || '',
          to: toInput?.value?.trim() || '',
          enabled
        };
      })
      .filter(rule => rule.enabled && rule.from); // 只返回啟用且有來源文字的規則
  },

  /** 更新文本區域的值並恢復游標位置 */
  _updateTextAreaValue(textArea, newText, cursorState) {
    textArea.value = newText;
    textArea.dispatchEvent(new Event('input', { bubbles: true }));
    textArea.setSelectionRange(cursorState.start, cursorState.end);
  },

  /** 創建正則表達式 */
  createRegex(text) {
    try {
      if (this._isRegexPattern(text)) {
        return this._createRegexFromPattern(text);
      }
      return this._createRegexFromText(text);
    } catch (error) {
      console.error('正則表達式創建失敗:', error);
      // 返回一個永遠不會匹配的正則表達式，而不是拋出錯誤
      return new RegExp('(?!)', 'g');
    }
  },

  /** 檢查是否為正則表達式模式 */
  _isRegexPattern(text) {
    // 檢查是否已經是正則表達式格式
    return text.startsWith('(') || 
           text.startsWith('[') || 
           text.startsWith('/') && text.match(/\/[gim]*$/);
  },

  /** 從正則表達式模式創建正則表達式 */
  _createRegexFromPattern(text) {
    try {
      if (text.startsWith('/') && text.match(/\/[gim]*$/)) {
        // 處理 /pattern/flags 格式
        const lastSlash = text.lastIndexOf('/');
        const pattern = text.slice(1, lastSlash);
        const flags = text.slice(lastSlash + 1);
        return new RegExp(pattern, flags || 'gi');
      } else {
        // 直接作為正則表達式模式使用
        return new RegExp(text, 'gi');
      }
    } catch (error) {
      console.error('正則表達式解析失敗:', error);
      return new RegExp('(?!)', 'g');
    }
  },

  /** 從普通文字創建正則表達式 */
  _createRegexFromText(text) {
    try {
      const escapedText = this.escapeRegExp(text);
      const firstChar = text.charAt(0);
      const reChar = `[${firstChar.toLowerCase()}${firstChar.toUpperCase()}]`;
      const pattern = firstChar + escapedText.slice(1);
      return new RegExp(pattern.replace(reChar, firstChar), 'gi');
    } catch (error) {
      console.error('文轉正則表達式失敗:', error);
      return new RegExp('(?!)', 'g');
    }
  },

  /** 轉義正則表達式特殊字符 */
  escapeRegExp(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
};

window.AutoReplaceManager = AutoReplaceManager; 