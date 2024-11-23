/** 手動替換管理模組 */
const ManualReplaceManager = {
  CONFIG: {
    MIN_WIDTH: 75, // 最小寬度
    MAX_WIDTH: 300, // 最大寬度
    PADDING: 24, // 內邊距
    MANUAL_REPLACE_KEY: 'manualReplaceRules' // 儲存鍵名稱
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
      const group = ManualReplaceManager.createReplaceGroup(textArea);
      container.appendChild(group);
      ManualReplaceManager.saveReplaceRules(container);
    },

    /** 移除組 */
    removeGroup(group) {
      const container = group.parentElement;
      const groups = container.querySelectorAll('.replace-extra-group');
      
      if (groups.length === 1) {
        const inputs = group.querySelectorAll('input[type="text"]');
        inputs.forEach(input => input.value = '');
        group.querySelector('.replace-button').textContent = '替換';
        group.querySelector('.replace-button').classList.add('disabled');
      } else {
        group.remove();
      }
      
      ManualReplaceManager.saveReplaceRules(container);
    }
  },

  /** 創建替換組 */
  createReplaceGroup(textArea, isMainGroup = false, initialData = null) {
    const group = document.createElement('div');
    group.className = isMainGroup ? 'replace-main-group' : 'replace-extra-group';

    if (!isMainGroup) {
      const controlButtons = this.UI.createControlButtons(
        () => this.GroupManager.addGroup(group, textArea),
        () => this.GroupManager.removeGroup(group)
      );
      group.appendChild(controlButtons);
    }

    const fromInput = this.UI.createInput('替換文字', this.CONFIG.MIN_WIDTH);
    const toInput = this.UI.createInput('替換為', this.CONFIG.MIN_WIDTH);
    const replaceButton = this.UI.createReplaceButton();

    if (initialData) {
      fromInput.value = initialData.from || '';
      toInput.value = initialData.to || '';
      this.updateButtonState(fromInput.value, textArea.value, replaceButton);
    }

    this.setupGroupEvents(group, textArea, fromInput, toInput, replaceButton, isMainGroup);

    group.appendChild(fromInput);
    group.appendChild(toInput);
    group.appendChild(replaceButton);

    return group;
  },

  /** 設置組事件 */
  setupGroupEvents(group, textArea, fromInput, toInput, replaceButton, isMainGroup) {
    const handleInput = (input) => {
      this.adjustInputWidth(input);
      this.updateButtonState(fromInput.value, textArea.value, replaceButton);
      if (!isMainGroup) {
        this.saveReplaceRules(group.parentElement);
      }
    };

    [fromInput, toInput].forEach(input => {
      input.addEventListener('input', () => handleInput(input));
    });

    // 文本區域變化時更新按鈕狀態
    textArea.addEventListener('input', () => {
      this.updateButtonState(fromInput.value, textArea.value, replaceButton);
    });

    replaceButton.addEventListener('click', () => {
      this.executeReplace(textArea, fromInput.value, toInput.value, replaceButton);
    });

    // 主組添加文字選擇功能
    if (isMainGroup) {
      textArea.addEventListener('mouseup', () => {
        this.handleTextSelection(textArea, fromInput, toInput);
      });

      textArea.addEventListener('keyup', (e) => {
        if (e.shiftKey || e.key === 'Shift') {
          this.handleTextSelection(textArea, fromInput, toInput);
        }
      });

      // 添加失去焦點事件
      textArea.addEventListener('blur', () => {
        this.handleTextSelection(textArea, fromInput, toInput);
      });
    }
  },

  /** 處理文字選擇 */
  handleTextSelection(textArea, fromInput, toInput) {
    const selectedText = textArea.value.substring(
      textArea.selectionStart,
      textArea.selectionEnd
    ).trim();

    if (selectedText) {
      fromInput.value = selectedText;
      fromInput.dispatchEvent(new Event('input'));
    } else {
      // 當沒有選中文字時清空輸入框
      fromInput.value = '';
      toInput.value = '';
      fromInput.dispatchEvent(new Event('input'));
    }
  },

  /** 調整輸入框寬度 */
  adjustInputWidth(input) {
    const text = input.value;
    if (!text) {
      input.style.cssText = `width: ${this.CONFIG.MIN_WIDTH}px !important;`;
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
      Math.max(this.CONFIG.MIN_WIDTH, span.offsetWidth + this.CONFIG.PADDING),
      this.CONFIG.MAX_WIDTH
    );
    input.style.cssText = `width: ${width}px !important;`;

    span.remove();
  },

  /** 更新按鈕狀態 */
  updateButtonState(searchText, text, button) {
    // 先檢查搜索文字是否為空
    searchText = searchText.trim();
    if (!searchText) {
      button.textContent = '替換';
      button.classList.add('disabled');
      return;
    }

    try {
      const regex = this.createRegex(searchText);
      const count = (text.match(regex) || []).length;
      button.textContent = count > 0 ? `替換 (${count})` : '替換';
      button.classList.toggle('disabled', count === 0);
    } catch (error) {
      button.textContent = '替換';
      button.classList.add('disabled');
    }
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
  },

  /** 執行替換 */
  executeReplace(textArea, fromText, toText, button) {
    fromText = fromText.trim();
    if (!fromText || !textArea.value) return;

    try {
      const regex = this.createRegex(fromText);
      const newText = textArea.value.replace(regex, toText);

      if (newText !== textArea.value) {
        textArea.value = newText;
        textArea.dispatchEvent(new Event('input', { bubbles: true }));
        // 直接更新當前按鈕狀態
        this.updateButtonState(fromText, newText, button);
      }
    } catch (error) {
      console.error('替換錯誤:', error);
    }
  },

  /** 創建正則表達式 */
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
  },

  /** 初始化手動替換組 */
  initializeManualGroups(mainContainer, otherContainer, textArea) {
    // 創建主組
    mainContainer.appendChild(this.createReplaceGroup(textArea, true));

    const manualContainer = document.createElement('div');
    manualContainer.className = 'manual-replace-container';

    // 載入額外組
    chrome.storage.sync.get([this.CONFIG.MANUAL_REPLACE_KEY], (result) => {
      const rules = (result[this.CONFIG.MANUAL_REPLACE_KEY] || [])
        .filter(rule => rule.from?.trim() || rule.to?.trim());
      
      if (rules.length === 0) rules.push({});
      
      rules.forEach(rule => {
        manualContainer.appendChild(this.createReplaceGroup(textArea, false, rule));
      });
    });

    otherContainer.appendChild(manualContainer);
  },

  /** 保存替換規則 */
  saveReplaceRules(container) {
    const rules = Array.from(container.querySelectorAll('.replace-extra-group')).map(group => {
      const inputs = group.querySelectorAll('input[type="text"]');
      return {
        from: inputs[0].value,
        to: inputs[1].value
      };
    });

    chrome.storage.sync.set({ [this.CONFIG.MANUAL_REPLACE_KEY]: rules });
  }
};

window.ManualReplaceManager = ManualReplaceManager; 