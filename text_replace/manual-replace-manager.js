/** 手動替換管理模組 */
const ManualReplaceManager = {
  CONFIG: {
    MIN_WIDTH: 75,
    MAX_WIDTH: 300,
    PADDING: 24,
    STORAGE_KEY: 'replacePosition',
    MANUAL_REPLACE_KEY: 'manualReplaceValues',
    EXTRA_GROUPS_KEY: 'extraManualGroups'
  },

  /** UI 創建相關方法 */
  UI: {
    /** 創建輸入框 */
    createInput(placeholder, width) {
      const input = document.createElement('input');
      input.type = 'text';
      input.placeholder = placeholder;
      input.className = 'replace-input';
      input.style.cssText = `width: ${width}px !important;`;
      return input;
    },

    /** 創建替換按鈕 */
    createReplaceButton() {
      const button = document.createElement('button');
      button.className = 'replace-button disabled';
      button.textContent = '替換';
      return button;
    },

    /** 創建控制按鈕 */
    createControlButtons(isSecondGroup, addCallback, removeCallback) {
      const container = document.createElement('div');
      container.className = 'replace-group-controls';

      const addButton = document.createElement('button');
      addButton.textContent = '+';
      addButton.className = 'replace-control-button';
      addButton.id = 'replace-add-button';
      addButton.onclick = addCallback;
      container.appendChild(addButton);

      if (!isSecondGroup) {
        const removeButton = document.createElement('button');
        removeButton.textContent = '-';
        removeButton.className = 'replace-control-button';
        removeButton.id = 'replace-remove-button';
        removeButton.onclick = removeCallback;
        container.appendChild(removeButton);
      }

      return container;
    }
  },

  /** 事件處理相關方法 */
  EventHandlers: {
    /** 處理輸入框寬度調整 */
    handleInputWidth(input, config) {
      const text = input.value;
      if (!text) {
        input.style.cssText = `width: ${config.MIN_WIDTH}px !important;`;
        return;
      }

      const span = document.createElement('span');
      span.style.cssText = `
        visibility: hidden;
        position: absolute;
        white-space: pre;
        font: ${window.getComputedStyle(input).font};
      `;
      span.textContent = text;
      document.body.appendChild(span);

      const width = Math.min(
        Math.max(config.MIN_WIDTH, span.offsetWidth + config.PADDING),
        config.MAX_WIDTH
      );
      input.style.cssText = `width: ${width}px !important;`;

      span.remove();
    },

    /** 處理文字選擇 */
    handleTextSelection(textArea, fromInput, toInput) {
      const selectedText = textArea.value.substring(
        textArea.selectionStart,
        textArea.selectionEnd
      ).trim();

      if (selectedText) {
        console.log('選中文字:', selectedText);
        fromInput.value = selectedText;
        fromInput.dispatchEvent(new Event('input'));
      } else {
        fromInput.value = '';
        toInput.value = '';
        fromInput.dispatchEvent(new Event('input'));
      }
    }
  },

  /** 存儲相關方法 */
  Storage: {
    /** 保存替換值 */
    saveReplaceValues(from, to, key) {
      chrome.storage.sync.set({
        [key]: { from, to }
      });
    },

    /** 載入替換值 */
    loadReplaceValues(key, callback) {
      chrome.storage.sync.get([key], (result) => {
        if (result[key]) {
          callback(result[key]);
        }
      });
    },

    /** 清理存儲數據 */
    clearStorage(pattern) {
      chrome.storage.sync.get(null, (items) => {
        Object.keys(items)
          .filter(key => key.startsWith(pattern))
          .forEach(key => chrome.storage.sync.remove(key));
      });
    }
  },

  /** 替換操作相關方法 */
  ReplaceOperations: {
    /** 執行替換 */
    executeReplace(textArea, fromText, toText, updateButtonCallback) {
      fromText = fromText.trim();
      if (!fromText || !textArea.value) {
        console.log('替換條件不符合');
        return;
      }

      console.log(`執行替換操作: "${fromText}" -> "${toText}"`);
      try {
        const regex = this.createRegex(fromText);
        const newText = textArea.value.replace(regex, toText);

        if (newText !== textArea.value) {
          textArea.value = newText;
          textArea.dispatchEvent(new Event('input', { bubbles: true }));
          requestAnimationFrame(() => updateButtonCallback(textArea));
          console.log('替換完成');
        } else {
          console.log('沒有內容被替換');
        }
      } catch (error) {
        console.error('替換錯誤:', error);
        alert('替換錯誤: ' + error.message);
      }
    },

    /** 創建正則表達式 */
    createRegex(text) {
      if (text.startsWith('/') && text.match(/\/[gimy]*$/)) {
        const lastSlash = text.lastIndexOf('/');
        const pattern = text.slice(1, lastSlash);
        const flags = text.slice(lastSlash + 1);
        return new RegExp(pattern, flags);
      }
      return new RegExp(this.escapeRegExp(text), 'g');
    },

    /** 轉義正則表達式特殊字符 */
    escapeRegExp(string) {
      return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }
  },

  /** 按鈕狀態管理相關方法 */
  ButtonState: {
    /** 更新按鈕狀態 */
    updateButtonState(searchText, text, button) {
      searchText = searchText.trim();
      if (!searchText) {
        this.setButtonState(button, 0);
        return;
      }

      try {
        const regex = ManualReplaceManager.ReplaceOperations.createRegex(searchText);
        const count = (text.match(regex) || []).length;
        this.setButtonState(button, count);
      } catch (error) {
        console.error('計算匹配數量時出錯:', error);
        this.setButtonState(button, 0);
      }
    },

    /** 設置按鈕狀態 */
    setButtonState(button, count) {
      button.textContent = count > 0 ? `替換 (${count})` : '替換';
      button.classList.toggle('disabled', count === 0);
    },

    /** 更新所有按鈕狀態 */
    updateAllButtonStates(textArea) {
      document.querySelectorAll('.replace-main-group, .replace-extra-group').forEach(group => {
        const fromInput = group.querySelector('input:first-child');
        const button = group.querySelector('.replace-button');
        if (fromInput && button) {
          this.updateButtonState(fromInput.value, textArea.value, button);
        }
      });
    }
  },

  /** 組管理相關方法 */
  GroupManager: {
    /** 添加新組 */
    addGroup(referenceGroup, textArea) {
      const container = referenceGroup.parentElement;
      const groups = Array.from(container.querySelectorAll('.replace-extra-group'));
      
      const newGroup = ManualReplaceManager.createReplaceGroup(textArea, {
        storageKey: `${ManualReplaceManager.CONFIG.MANUAL_REPLACE_KEY}_${groups.length}`,
        showControls: true
      });

      container.appendChild(newGroup);
      this.saveGroups(container);
    },

    /** 移除組 */
    removeGroup(group) {
      const container = group.parentElement;
      group.remove();
      this.saveGroups(container);
    },

    /** 保存所有組 */
    saveGroups(container) {
      const groups = this.getValidGroups(container);
      this.saveGroupsToStorage(groups);
    },

    /** 獲取有效的組 */
    getValidGroups(container) {
      return Array.from(container.querySelectorAll('.replace-extra-group'))
        .filter(group => {
          const controls = group.querySelector('.replace-group-controls');
          return controls && controls.children.length > 1;
        })
        .map(group => {
          const inputs = group.querySelectorAll('input[type="text"]');
          return {
            from: inputs[0].value.trim(),
            to: inputs[1].value.trim()
          };
        })
        .filter(group => group.from || group.to);
    },

    /** 保存組到存儲 */
    saveGroupsToStorage(groups) {
      ManualReplaceManager.Storage.clearStorage(ManualReplaceManager.CONFIG.MANUAL_REPLACE_KEY);
      
      groups.forEach((group, index) => {
        const storageKey = `${ManualReplaceManager.CONFIG.MANUAL_REPLACE_KEY}_${index}`;
        ManualReplaceManager.Storage.saveReplaceValues(group.from, group.to, storageKey);
      });

      chrome.storage.sync.set({
        [ManualReplaceManager.CONFIG.EXTRA_GROUPS_KEY]: groups.map((group, index) => ({
          ...group,
          storageKey: `${ManualReplaceManager.CONFIG.MANUAL_REPLACE_KEY}_${index}`
        }))
      });
    }
  },

  /** 創建替換組 */
  createReplaceGroup(textArea, options = {}) {
    const {
      enableSelection = false,
      storageKey = null,
      showControls = false,
      initialData = null,
      isSecondGroup = storageKey === this.CONFIG.MANUAL_REPLACE_KEY
    } = options;

    const group = document.createElement('div');
    group.className = enableSelection ? 'replace-main-group' : 'replace-extra-group';

    if (showControls) {
      const controlButtons = this.UI.createControlButtons(
        isSecondGroup,
        () => this.GroupManager.addGroup(group, textArea),
        () => this.GroupManager.removeGroup(group)
      );
      group.appendChild(controlButtons);
    }

    const fromInput = this.UI.createInput('替換文字', this.CONFIG.MIN_WIDTH);
    const toInput = this.UI.createInput('替換為', this.CONFIG.MIN_WIDTH);
    const replaceButton = this.UI.createReplaceButton();

    this.setupGroupEvents(group, textArea, fromInput, toInput, replaceButton, {
      enableSelection,
      isSecondGroup,
      storageKey
    });

    if (initialData) {
      this.initializeGroupData(fromInput, toInput, replaceButton, initialData, textArea);
    } else if (storageKey) {
      this.Storage.loadReplaceValues(storageKey, data => {
        this.initializeGroupData(fromInput, toInput, replaceButton, data, textArea);
      });
    }

    group.appendChild(fromInput);
    group.appendChild(toInput);
    group.appendChild(replaceButton);

    return group;
  },

  /** 設置組事件 */
  setupGroupEvents(group, textArea, fromInput, toInput, replaceButton, options) {
    const { enableSelection, isSecondGroup, storageKey } = options;

    // 輸入事件
    [fromInput, toInput].forEach(input => {
      input.addEventListener('input', () => {
        this.EventHandlers.handleInputWidth(input, this.CONFIG);
        this.ButtonState.updateButtonState(fromInput.value, textArea.value, replaceButton);
        
        if (!enableSelection && !isSecondGroup) {
          this.GroupManager.saveGroups(group.parentElement);
        } else if (storageKey) {
          this.Storage.saveReplaceValues(fromInput.value, toInput.value, storageKey);
        }
      });
    });

    // 文本區域變化事件
    textArea.addEventListener('input', () => {
      this.ButtonState.updateButtonState(fromInput.value, textArea.value, replaceButton);
    });

    // 替換按鈕事件
    replaceButton.addEventListener('click', () => {
      this.ReplaceOperations.executeReplace(
        textArea,
        fromInput.value,
        toInput.value,
        () => this.ButtonState.updateAllButtonStates(textArea)
      );
    });

    // 選擇文字功能
    if (enableSelection) {
      textArea.addEventListener('mouseup', () => {
        this.EventHandlers.handleTextSelection(textArea, fromInput, toInput);
      });

      textArea.addEventListener('keyup', (e) => {
        if (e.shiftKey || e.key === 'Shift') {
          this.EventHandlers.handleTextSelection(textArea, fromInput, toInput);
        }
      });
    }
  },

  /** 初始化組數據 */
  initializeGroupData(fromInput, toInput, replaceButton, data, textArea) {
    if (data.from) {
      fromInput.value = data.from;
      this.EventHandlers.handleInputWidth(fromInput, this.CONFIG);
      this.ButtonState.updateButtonState(data.from, textArea.value, replaceButton);
    }
    if (data.to) {
      toInput.value = data.to;
      this.EventHandlers.handleInputWidth(toInput, this.CONFIG);
    }
  },

  /** 初始化手動替換組 */
  initializeManualGroups(container, textArea) {
    const manualContainer = document.createElement('div');
    manualContainer.className = 'manual-replace-container';

    // 創建第一組（支持選擇文字的組）
    const mainGroup = this.createReplaceGroup(textArea, { 
      enableSelection: true 
    });
    manualContainer.appendChild(mainGroup);

    // 載入所有額外組（包括原來的第二組）
    this.Storage.loadReplaceValues(this.CONFIG.EXTRA_GROUPS_KEY, (result) => {
      const extraGroups = result || [];
      const validGroups = extraGroups.filter(group => group.from.trim() || group.to.trim());

      // 如果沒有有效的組，創建一個空組
      if (validGroups.length === 0) {
        const emptyGroup = this.createReplaceGroup(textArea, {
          showControls: true
        });
        manualContainer.appendChild(emptyGroup);
      } else {
        // 添加所有有效的組
        validGroups.forEach((groupData, index) => {
          const group = this.createReplaceGroup(textArea, {
            showControls: true,
            initialData: groupData
          });
          manualContainer.appendChild(group);
        });
      }
    });

    container.appendChild(manualContainer);
    return manualContainer;
  }
};

window.ManualReplaceManager = ManualReplaceManager; 