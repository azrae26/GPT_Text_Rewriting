/** 自動替換管理模組 */
const AutoReplaceManager = {
  CONFIG: {
    AUTO_REPLACE_KEY: 'autoReplaceRules',
    FROM_INPUT_WIDTH: 290,    // 替換目標框寬度
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
      const input = document.createElement('textarea');
      input.placeholder = placeholder;
      input.className = 'replace-input';
      const width = isFromInput ? AutoReplaceManager.CONFIG.FROM_INPUT_WIDTH : AutoReplaceManager.CONFIG.TO_INPUT_WIDTH;
      input.style.cssText = `width: ${width}px !important; height: ${AutoReplaceManager.CONFIG.INPUT_HEIGHT}px !important;`;
      input.rows = 1;
      
      // 添加輸入事件來自動調整高度
      const adjustHeight = (element) => {
        console.log('開始調整高度');
        console.log('當前元素焦點狀態:', document.activeElement === element);

        // 如果不是焦點狀態，保持單行模式
        if (document.activeElement !== element) {
          console.log('非焦點狀態，保持單行模式');
          element.style.height = '32px';
          element.style.whiteSpace = 'nowrap';
          element.style.display = 'flex';
          element.style.alignItems = 'center';
          return;
        }

        // 創建臨時 div 來計算文字尺寸
        const div = document.createElement('div');
        div.style.cssText = `
          position: fixed;
          visibility: hidden;
          width: ${element.offsetWidth - 16}px;
          font: ${getComputedStyle(element).font};
          line-height: ${getComputedStyle(element).lineHeight};
          white-space: pre-wrap;
          word-wrap: break-word;
          box-sizing: border-box;
          margin: 0;
          border: 0;
          padding: 0;
        `;
        
        // 計算單行文字的實際高度
        div.textContent = 'X';
        document.body.appendChild(div);
        const singleLineTextHeight = div.offsetHeight;
        console.log('單行文字高度:', singleLineTextHeight);
        
        // 計算當前文字的實際高度
        const content = element.value || element.placeholder;
        div.textContent = content;
        const totalTextHeight = div.offsetHeight;
        console.log('當前文字內容:', content);
        console.log('文字總高度:', totalTextHeight);
        
        // 檢查是否有換行符並計算額外高度
        const endsWithNewline = content.endsWith('\n');
        const newlineHeight = endsWithNewline ? singleLineTextHeight : 0;
        console.log('是否以換行符結尾:', endsWithNewline);
        console.log('換行符高度:', newlineHeight);
        
        // 檢查是否需要換行
        const needsWrap = div.scrollWidth > (element.offsetWidth - 16) || 
                         content.includes('\n') ||
                         totalTextHeight > singleLineTextHeight;
        console.log('是否需要換行:', needsWrap);
        console.log('文字寬度:', div.scrollWidth);
        console.log('容器寬度:', element.offsetWidth - 16);
        console.log('是否包含換行符:', content.includes('\n'));
        
        // 計算新的輸入框高度，包含換行符的高度
        const newHeight = needsWrap ? 
          Math.max(32, totalTextHeight + newlineHeight + 12) : // 需要換行時，加上換行符高度和內邊距
          32; // 不需要換行時，保持單行高度
        console.log('計算得到的新高度:', newHeight);
        
        // 設置多行模式和新高度
        element.style.whiteSpace = 'pre-wrap';
        element.style.display = 'block';
        element.style.alignItems = 'initial';
        element.style.height = `${newHeight}px`;
        console.log('最終設置的樣式:', {
          whiteSpace: element.style.whiteSpace,
          display: element.style.display,
          alignItems: element.style.alignItems,
          height: element.style.height
        });
        
        // 清理臨時元素
        div.remove();
        console.log('高度調整完成');
      };

      // 監聽輸入事件
      input.addEventListener('input', function() {
        if (document.activeElement === this) {
          requestAnimationFrame(() => adjustHeight(this));
        }
      });

      // 監聽按鍵事件（處理 Enter 鍵）
      input.addEventListener('keydown', function(e) {
        if (e.key === 'Enter' && document.activeElement === this) {
          requestAnimationFrame(() => adjustHeight(this));
        }
      });

      // 失去焦點時恢復單行模式
      input.addEventListener('blur', function() {
        this.style.height = '32px';
        this.style.whiteSpace = 'nowrap';
        this.style.display = 'flex';
        this.style.alignItems = 'center';
      });

      // 獲得焦點時切換到多行模式並立即調整高度
      input.addEventListener('focus', function() {
        // 先切換到多行模式
        this.style.whiteSpace = 'pre-wrap';
        this.style.display = 'block';
        this.style.alignItems = 'initial';
        
        // 然後調整高度
        requestAnimationFrame(() => adjustHeight(this));
      });

      return input;
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
        const inputs = group.querySelectorAll('input[type="text"]');
        inputs.forEach(input => input.value = '');
        group.querySelector('input[type="checkbox"]').checked = false;
      } else {
        group.remove();
      }
      
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
    controlsContainer.appendChild(checkbox);

    // 將控制元素容器添加到組中
    group.appendChild(controlsContainer);

    // 創建輸入框，傳入參數指示是哪個輸入框
    const fromInput = this.UI.createInput('自動替換', true);   // 替換目標框
    const toInput = this.UI.createInput('替換為', false);      // 替換結果框

    // 設置初始值
    if (initialData) {
      fromInput.value = initialData.from || '';
      toInput.value = initialData.to || '';
      checkbox.checked = initialData.enabled || false;
    }

    // 設置事件
    this.setupGroupEvents(group, textArea, fromInput, toInput, checkbox);

    // 添加輸入框
    group.appendChild(fromInput);
    group.appendChild(toInput);

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
      this.saveAutoReplaceRules(group.parentElement);
      
      // 更新到 content script
      chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
        if (tabs[0]) {
          try {
            chrome.tabs.sendMessage(tabs[0].id, {
              action: "updateAutoReplaceRules"
            }, function(response) {
              if (chrome.runtime.lastError) {
                console.log('Content script 尚未準備好');
              }
            });
          } catch (error) {
            console.log('發送消息時出錯:', error);
          }
        }
      });
    };

    // 為兩個輸入框添加輸入事件監聽
    [fromInput, toInput].forEach(input => {
      input.addEventListener('input', () => handleInput(input));
      
      input.addEventListener('blur', () => {
        if (checkbox.checked && fromInput.value.trim() && toInput.value.trim()) {
          this.handleAutoReplace(textArea);
        }
      });
    });

    // 複選框事件
    checkbox.addEventListener('change', () => {
      this.saveAutoReplaceRules(group.parentElement);
      if (checkbox.checked && fromInput.value.trim() && toInput.value.trim()) {
        this.handleAutoReplace(textArea);
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
        const group = this.createAutoReplaceGroup(textArea, rule);
        container.appendChild(group);
      });

      this.handleAutoReplace(textArea);
    });

    textArea.addEventListener('input', () => this.handleAutoReplace(textArea));
  },

  /** 保存自動替換規則 */
  saveAutoReplaceRules(container) {
    const rules = Array.from(container.querySelectorAll('.auto-replace-group')).map(group => {
      const inputs = group.querySelectorAll('.replace-input');
      return {
        from: inputs[0].value,
        to: inputs[1].value,
        enabled: group.querySelector('.auto-replace-checkbox').checked
      };
    });

    chrome.storage.sync.set({ [this.CONFIG.AUTO_REPLACE_KEY]: rules });
  },

  /** 執行自動替換 */
  handleAutoReplace(textArea) {
    // 如果在 popup 頁面中，發送消息到 content script
    if (window.location.pathname.endsWith('popup.html')) {
      chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
        chrome.tabs.sendMessage(tabs[0].id, {
          action: "triggerAutoReplace"
        });
      });
      return;
    }

    // 保存當前游標位置
    const selectionStart = textArea.selectionStart;
    const selectionEnd = textArea.selectionEnd;

    let text = textArea.value;
    let changed = false;

    document.querySelectorAll('.auto-replace-group').forEach(group => {
      // 修改選擇器以匹配新的 textarea 元素
      const inputs = group.querySelectorAll('.replace-input');
      const from = inputs[0].value.trim();
      const to = inputs[1].value.trim();
      const enabled = group.querySelector('.auto-replace-checkbox').checked;

      if (enabled && from) {
        try {
          // 支持正則表達式
          const regex = this.createRegex(from);
          const newText = text.replace(regex, to);
          if (newText !== text) {
            text = newText;
            changed = true;
          }
        } catch (error) {
          console.error('替換錯誤:', error);
        }
      }
    });

    if (changed) {
      textArea.value = text;
      textArea.dispatchEvent(new Event('input', { bubbles: true }));
      
      // 恢復游標位置
      textArea.setSelectionRange(selectionStart, selectionEnd);
    }
  },

  /** 創建則表達式 */
  createRegex(text) {
    if (text.startsWith('/') && text.match(/\/[gim]*$/)) {
      const lastSlash = text.lastIndexOf('/');
      const pattern = text.slice(1, lastSlash);
      const flags = text.slice(lastSlash + 1);
      return new RegExp(pattern, flags || 'g');
    }
    return new RegExp(this.escapeRegExp(text), 'g');
  },

  /** 轉義正則表達式特殊字符 */
  escapeRegExp(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
};

window.AutoReplaceManager = AutoReplaceManager; 