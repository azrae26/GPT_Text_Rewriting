/** 自動替換管理模組 */
const AutoReplaceManager = {
  CONFIG: {
    MIN_WIDTH: 80,
    MAX_WIDTH: 350,
    PADDING: 24,
    AUTO_REPLACE_KEY: 'autoReplaceRules'
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

    const controlButtons = this.UI.createControlButtons(
      () => this.GroupManager.addGroup(group, textArea),
      () => this.GroupManager.removeGroup(group)
    );
    group.appendChild(controlButtons);

    const fromInput = this.UI.createInput('自動替換', this.CONFIG.MIN_WIDTH);
    const toInput = this.UI.createInput('替換為', this.CONFIG.MIN_WIDTH);
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.className = 'auto-replace-checkbox';

    if (initialData) {
      fromInput.value = initialData.from || '';
      toInput.value = initialData.to || '';
      checkbox.checked = initialData.enabled || false;
    }

    this.setupGroupEvents(group, textArea, fromInput, toInput, checkbox);

    group.appendChild(checkbox);
    group.appendChild(fromInput);
    group.appendChild(toInput);

    return group;
  },

  /** 設置組事件 */
  setupGroupEvents(group, textArea, fromInput, toInput, checkbox) {
    const handleInput = (input) => {
      this.adjustInputWidth(input);
      this.saveAutoReplaceRules(group.parentElement);
      
      // 更新到 content script
      chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
        chrome.tabs.sendMessage(tabs[0].id, {
          action: "updateAutoReplaceRules"
        });
      });
    };

    // 為兩個輸入框添加輸入事件監聽
    [fromInput, toInput].forEach(input => {
      // 監聽輸入事件，實時調整寬度
      input.addEventListener('input', () => handleInput(input));
      
      // 原有的失去焦點事件
      input.addEventListener('blur', () => {
        if (checkbox.checked && fromInput.value.trim() && toInput.value.trim()) {
          this.handleAutoReplace(textArea);
        }
      });

      // 初始調整寬度
      this.adjustInputWidth(input);
    });

    // 原有的複選框事件
    checkbox.addEventListener('change', () => {
      this.saveAutoReplaceRules(group.parentElement);
      if (checkbox.checked && fromInput.value.trim() && toInput.value.trim()) {
        this.handleAutoReplace(textArea);
      }
    });
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

  /** 初始化自動替換組 */
  initializeAutoReplaceGroups(container, textArea) {
    chrome.storage.sync.get([this.CONFIG.AUTO_REPLACE_KEY], (result) => {
      const rules = (result[this.CONFIG.AUTO_REPLACE_KEY] || [])
        .filter(rule => rule.from?.trim() || rule.to?.trim());
      
      if (rules.length === 0) rules.push({});
      
      rules.forEach(rule => {
        const group = this.createAutoReplaceGroup(textArea, rule);
        container.appendChild(group);
        
        // 立即調整所有輸入框的寬度
        const inputs = group.querySelectorAll('.replace-input');
        inputs.forEach(input => {
          this.adjustInputWidth(input);
        });
      });

      this.handleAutoReplace(textArea);
    });

    textArea.addEventListener('input', () => this.handleAutoReplace(textArea));
  },

  /** 保存自動替換規則 */
  saveAutoReplaceRules(container) {
    const rules = Array.from(container.querySelectorAll('.auto-replace-group')).map(group => {
      const inputs = group.querySelectorAll('input[type="text"]');
      return {
        from: inputs[0].value,
        to: inputs[1].value,
        enabled: group.querySelector('input[type="checkbox"]').checked
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

    // 原有的替換邏輯保持不變
    let text = textArea.value;
    let changed = false;

    document.querySelectorAll('.auto-replace-group').forEach(group => {
      const inputs = group.querySelectorAll('input[type="text"]');
      const from = inputs[0].value.trim();
      const to = inputs[1].value.trim();
      const enabled = group.querySelector('input[type="checkbox"]').checked;

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
  }
};

window.AutoReplaceManager = AutoReplaceManager; 