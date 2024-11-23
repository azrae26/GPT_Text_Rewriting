/** 自動替換管理模組 */
const AutoReplaceManager = {
  CONFIG: {
    MIN_WIDTH: 75,
    MAX_WIDTH: 300,
    PADDING: 24,
    AUTO_REPLACE_KEY: 'autoReplaceRules'
  },

  /** 自動替換規則 */
  autoReplaceRules: [],

  /** 初始化自動替換組 */
  initializeAutoReplaceGroups(container, textArea) {
    // 創建垂直容器
    const autoContainer = document.createElement('div');
    autoContainer.className = 'auto-replace-container';

    // 載入保存的規則
    chrome.storage.sync.get([this.CONFIG.AUTO_REPLACE_KEY], (result) => {
      this.autoReplaceRules = result[this.CONFIG.AUTO_REPLACE_KEY] || [];
      
      // 創建3組自動替換框
      for (let i = 0; i < 3; i++) {
        const group = this._createAutoReplaceGroup(textArea, i);
        autoContainer.appendChild(group);
        
        // 如果有保存的規則，填入內容並設置狀態
        if (this.autoReplaceRules[i]) {
          const { from, to, enabled } = this.autoReplaceRules[i];
          const inputs = group.querySelectorAll('input[type="text"]');
          inputs[0].value = from;
          inputs[1].value = to;
          group.querySelector('input[type="checkbox"]').checked = enabled;
        }
      }

      // 在初始化完成後立即執行一次自動替換
      this._handleAutoReplace(textArea);
    });

    container.appendChild(autoContainer);

    // 監聽文本變化，執行自動替換
    textArea.addEventListener('input', () => this._handleAutoReplace(textArea));
  },

  /** 創建單個自動替換組 */
  _createAutoReplaceGroup(textArea, index) {
    const group = document.createElement('div');
    group.className = 'auto-replace-group';

    const fromInput = document.createElement('input');
    fromInput.type = 'text';
    fromInput.placeholder = '自動替換';
    fromInput.className = 'replace-input';
    fromInput.style.cssText = `width: ${this.CONFIG.MIN_WIDTH}px !important;`;

    const toInput = document.createElement('input');
    toInput.type = 'text';
    toInput.placeholder = '替換為';
    toInput.className = 'replace-input';
    toInput.style.cssText = `width: ${this.CONFIG.MIN_WIDTH}px !important;`;

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.className = 'auto-replace-checkbox';

    // 添加輸入事件來調整寬度
    const adjustWidth = (input) => {
      const text = input.value;
      if (!text) {
        input.style.cssText = `width: ${this.CONFIG.MIN_WIDTH}px !important;`;
        return;
      }
      
      const span = document.createElement('span');
      span.style.visibility = 'hidden';
      span.style.position = 'absolute';
      span.style.whiteSpace = 'pre';
      span.style.font = window.getComputedStyle(input).font;
      span.textContent = text;
      document.body.appendChild(span);
      
      const textWidth = span.offsetWidth;
      const width = Math.min(
        Math.max(this.CONFIG.MIN_WIDTH, textWidth + this.CONFIG.PADDING),
        this.CONFIG.MAX_WIDTH
      );
      input.style.cssText = `width: ${width}px !important;`;
      
      span.remove();
    };

    // 綁定事件
    [fromInput, toInput].forEach(input => {
      input.addEventListener('input', () => {
        adjustWidth(input);
        this._saveAutoReplaceRules();
      });

      input.addEventListener('blur', () => {
        if (checkbox.checked && fromInput.value.trim() && toInput.value.trim()) {
          this._handleAutoReplace(textArea);
        }
      });
    });

    checkbox.addEventListener('change', () => {
      this._saveAutoReplaceRules();
      if (checkbox.checked && fromInput.value.trim() && toInput.value.trim()) {
        this._handleAutoReplace(textArea);
      }
    });

    group.appendChild(fromInput);
    group.appendChild(toInput);
    group.appendChild(checkbox);

    return group;
  },

  /** 保存自動替換規則 */
  _saveAutoReplaceRules() {
    const rules = Array.from(document.querySelectorAll('.auto-replace-group')).map(group => {
      const inputs = group.querySelectorAll('input[type="text"]');
      return {
        from: inputs[0].value,
        to: inputs[1].value,
        enabled: group.querySelector('input[type="checkbox"]').checked
      };
    });

    this.autoReplaceRules = rules;
    chrome.storage.sync.set({ [this.CONFIG.AUTO_REPLACE_KEY]: rules });
  },

  /** 執行自動替換 */
  _handleAutoReplace(textArea) {
    let text = textArea.value;
    let changed = false;

    this.autoReplaceRules.forEach(rule => {
      if (rule.enabled && rule.from.trim()) {
        const regex = new RegExp(this._escapeRegExp(rule.from), 'g');
        const newText = text.replace(regex, rule.to);
        if (newText !== text) {
          text = newText;
          changed = true;
        }
      }
    });

    if (changed) {
      textArea.value = text;
      textArea.dispatchEvent(new Event('input', { bubbles: true }));
    }
  },

  /** 轉義正則表達式特殊字符 */
  _escapeRegExp(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
};

window.AutoReplaceManager = AutoReplaceManager; 