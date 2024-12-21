/**
 * 手動替換管理模組
 * 
 * 依賴模組：
 * 1. text_highlight/highlight.js
 *    - TextHighlight.CONFIG.FIXED_OFFSET：用於設置預覽容器的位置偏移
 *    - TextHighlight.PositionCalculator：用於計算文本位置和樣式
 * 
 * 2. regex_helper/regex-helper.js
 *    - RegexHelper.createRegex：用於創建替換用的正則表達式
 * 
 * 3. text_replace/replace-manager.js
 *    - ReplaceManager.initializeReplaceGroups：用於初始化替換組和規則管理
 * 
 * 4. Chrome Storage API
 *    - chrome.storage.local：用於存儲和讀取替換規則
 */

const ManualReplaceManager = {
  CONFIG: {
    MIN_WIDTH: 80,
    MAX_WIDTH: 300,
    PADDING: 24,
    MANUAL_REPLACE_KEY: 'manualReplaceRules',
    MAX_PREVIEWS: 1000, // 最大預覽數量
    PREVIEW_COLORS: [
      '#FF0000', // 紅色
      '#FF8C00', // 橙色
      '#0095FF', // 藍色
      '#AB00FF', // 紫色
      '#00AF06', // 綠色
      '#9932CC', // 紫色
    ],
    PREVIEW_CONTAINER_ID: 'replace-preview-container'
  },

  // 內部狀態
  _rules: {
    mainGroup: { from: '', to: '' },
    extraGroups: [] // [{from: '', to: ''}, ...]
  },

  /** 規則管理方法 */
  _getActiveRules() {
    const rules = [];
    if (this._rules.mainGroup?.from?.trim()) {
      rules.push(this._rules.mainGroup);
    }
    rules.push(...this._rules.extraGroups.filter(r => r.from?.trim()));
    return rules;
  },

  _updateRule(rule, index, isMainGroup = false) {
    if (isMainGroup) {
      this._rules.mainGroup = rule;
    } else {
      this._rules.extraGroups[index] = rule;
    }
    this._updatePreviews();
    if (!isMainGroup) {
      this._saveRules();
    }
  },

  /** 添加規則 */
  _addRule() {
    this._rules.extraGroups.push({ from: '', to: '' });
    
    // 立即在 DOM 中添加新組
    const textArea = document.querySelector('textarea[name="content"]');
    const manualContainer = document.querySelector('.manual-replace-container');
    if (textArea && manualContainer) {
      const newGroup = this.createReplaceGroup(textArea, false, { from: '', to: '' });
      manualContainer.appendChild(newGroup);
    }
    
    this._saveRules();
  },

  /** 移除規則 */
  _removeRule(index) {
    this._rules.extraGroups.splice(index, 1);
    if (this._rules.extraGroups.length === 0) {
      this._rules.extraGroups.push({ from: '', to: '' });
    }
    
    // 立即從 DOM 中移除組
    const manualContainer = document.querySelector('.manual-replace-container');
    if (manualContainer) {
      const groups = manualContainer.querySelectorAll('.replace-extra-group');
      if (groups.length > 1 || this._rules.extraGroups.length === 0) {
        groups[index]?.remove();
        // 如果是最後一個組，創建一個空組
        if (groups.length === 1 && this._rules.extraGroups.length > 0) {
          const textArea = document.querySelector('textarea[name="content"]');
          if (textArea) {
            const newGroup = this.createReplaceGroup(textArea, false, { from: '', to: '' });
            manualContainer.appendChild(newGroup);
          }
        }
      }
    }
    
    this._updatePreviews();
    this._saveRules();
  },

  /** UI 創建相關方法 */
  UI: {
    createInput(placeholder, width) {
      const input = document.createElement('input');
      input.type = 'text';
      input.placeholder = placeholder;
      input.className = 'replace-input';
      input.style.cssText = `width: ${width}px !important;`;
      
      // 加入焦點事件
      input.addEventListener('focus', () => {
        if (!input.closest('.replace-main-group')) {
          ManualReplaceManager._adjustInputWidth(input);
        }
      });
      
      input.addEventListener('blur', () => {
        if (!input.closest('.replace-main-group')) {
          input.style.cssText = `width: ${ManualReplaceManager.CONFIG.MIN_WIDTH}px !important;`;
        }
      });
      
      return input;
    },

    createReplaceButton() {
      const button = document.createElement('button');
      button.className = 'replace-button disabled';
      button.textContent = '替換';
      return button;
    },

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
      
      let lastClickTime = 0;
      removeButton.addEventListener('click', () => {
        const currentTime = new Date().getTime();
        if (currentTime - lastClickTime < 300) {
          removeCallback();
        }
        lastClickTime = currentTime;
      });
      
      container.appendChild(removeButton);
      return container;
    }
  },

  /** 創建替換組 */
  createReplaceGroup(textArea, isMainGroup = false, initialData = null) {
    const group = document.createElement('div');
    group.className = isMainGroup ? 'replace-main-group' : 'replace-extra-group';

    if (!isMainGroup) {
      const controlButtons = this.UI.createControlButtons(
        () => this._addRule(),
        () => {
          const container = group.parentElement;
          const groups = Array.from(container.querySelectorAll('.replace-extra-group'));
          const index = groups.indexOf(group);
          if (index !== -1) {
            this._removeRule(index);
          }
        }
      );
      group.appendChild(controlButtons);
    }

    const fromInput = this.UI.createInput('替換文字', this.CONFIG.MIN_WIDTH);
    const toInput = this.UI.createInput('替換為', this.CONFIG.MIN_WIDTH);
    const replaceButton = this.UI.createReplaceButton();

    // 設置初始值
    if (initialData) {
      fromInput.value = initialData.from || '';
      toInput.value = initialData.to || '';
      this._updateButtonState(fromInput.value, textArea.value, replaceButton);
    }

    // 設置事件
    this._setupGroupEvents(group, textArea, fromInput, toInput, replaceButton, isMainGroup);

    group.appendChild(fromInput);
    group.appendChild(toInput);
    group.appendChild(replaceButton);

    return group;
  },

  /** 設置組事件 */
  _setupGroupEvents(group, textArea, fromInput, toInput, replaceButton, isMainGroup) {
    // 創建統一的按鈕更新處理器
    const updateButton = () => {
      this._updateButtonState(fromInput.value, textArea.value, replaceButton);
    };

    const handleInput = () => {
      const rule = {
        from: fromInput.value,
        to: toInput.value
      };

      const index = isMainGroup ? 0 : 
        Array.from(group.parentElement.children).indexOf(group);
      
      this._updateRule(rule, index, isMainGroup);
      updateButton();
      
      // 根據是否有文字來調整寬度
      if (isMainGroup) {
        if (fromInput.value) {
          this._adjustInputWidth(fromInput);
        }
        if (toInput.value) {
          this._adjustInputWidth(toInput);
        }
      } else {
        // 其他組保持原本的行為
        if (document.activeElement === fromInput) {
          this._adjustInputWidth(fromInput);
        }
        if (document.activeElement === toInput) {
          this._adjustInputWidth(toInput);
        }
      }
    };

    [fromInput, toInput].forEach(input => {
      input.addEventListener('input', () => {
        handleInput();
        updateButton();
      });

      input.addEventListener('blur', () => {
        handleInput();
        updateButton();
        // 主要組在有文字時不收合
        if (!isMainGroup || !input.value) {
          input.style.cssText = `width: ${this.CONFIG.MIN_WIDTH}px !important;`;
        }
      });
      
      input.addEventListener('focus', () => {
        this._adjustInputWidth(input);
      });
    });

    // 監聽文本區域的變化以更新按鈕狀態
    textArea.addEventListener('input', updateButton);

    replaceButton.addEventListener('click', () => {
      this._executeReplace(textArea, fromInput.value, toInput.value);
    });

    if (isMainGroup) {
      this._setupTextSelection(textArea, fromInput, toInput, updateButton);
    }
  },

  /** 設置文本選擇功能 */
  _setupTextSelection(textArea, fromInput, toInput, updateButton) {
    const handleSelection = () => {
      const selectedText = textArea.value.substring(
        textArea.selectionStart,
        textArea.selectionEnd
      ).trim();

      if (selectedText) {
        fromInput.value = selectedText;
        toInput.value = '';
        this._updateRule({ from: selectedText, to: '' }, 0, true);
        // 有選取文字時展開輸入框
        this._adjustInputWidth(fromInput);
        // 更新替換按鈕狀態
        updateButton();
      } else if (!selectedText && fromInput.value) {
        // 當沒有選取文字且 fromInput 有值時清空
        fromInput.value = '';
        toInput.value = '';
        this._updateRule({ from: '', to: '' }, 0, true);
        // 清空時收合輸入框
        fromInput.style.cssText = `width: ${this.CONFIG.MIN_WIDTH}px !important;`;
        toInput.style.cssText = `width: ${this.CONFIG.MIN_WIDTH}px !important;`;
        // 更新替換按鈕狀態
        updateButton();
      }
    };

    textArea.addEventListener('mouseup', handleSelection);
    textArea.addEventListener('keyup', (e) => {
      if (e.key === 'Shift') handleSelection();
    });
    
    document.addEventListener('selectionchange', () => {
      if (document.activeElement === textArea) {
        handleSelection();
      }
    });
  },

  /** 執行替換 */
  _executeReplace(textArea, fromText, toText) {
    fromText = fromText.trim();
    if (!fromText || !textArea.value) return;

    try {
      const selectionStart = textArea.selectionStart;
      const selectionEnd = textArea.selectionEnd;
      const regex = RegexHelper.createRegex(fromText);
      const newText = textArea.value.replace(regex, toText);

      if (newText !== textArea.value) {
        textArea.value = newText;
        textArea.dispatchEvent(new Event('input', { bubbles: true }));
        textArea.setSelectionRange(selectionStart, selectionEnd);
        this._updatePreviews();
      }
    } catch (error) {
      console.error('替換錯誤:', error);
    }
  },

  /** 更新按鈕狀態 */
  _updateButtonState(searchText, text, button) {
    searchText = searchText.trim();
    if (!searchText) {
      button.textContent = '替換';
      button.classList.add('disabled');
      return;
    }

    try {
      const regex = RegexHelper.createRegex(searchText);
      const count = (text.match(regex) || []).length;
      button.textContent = count > 0 ? `替換 (${count})` : '替換';
      button.classList.toggle('disabled', count === 0);
    } catch (error) {
      button.textContent = '替換';
      button.classList.add('disabled');
    }
  },

  /** 預覽相關方法 */
  PreviewHighlight: {
    container: null,
    highlightGroups: new Map(),
    virtualScrollData: {
      allPositions: new Map(),  // groupIndex -> positions[]
      visibleHighlights: new Map(), // groupIndex -> Map(key -> highlight)
      bufferSize: 200,  // 緩衝區大小（像素）
      lastText: '',     // 新增：記錄上次的文本
      lineInfo: null    // 新增：行信息引用
    },

    initialize(textArea) {
      if (!textArea) return;
      
      this.container = document.createElement('div');
      this.container.id = ManualReplaceManager.CONFIG.PREVIEW_CONTAINER_ID;
      this.container.style.cssText = `
        position: absolute;
        top: ${TextHighlight.CONFIG.FIXED_OFFSET.TOP}px;
        left: 0;
        width: ${textArea.offsetWidth}px;
        height: ${textArea.offsetHeight}px;
        pointer-events: none;
        z-index: 1001;
        overflow: hidden;
      `;
      textArea.parentElement.appendChild(this.container);
      this._setupScrollHandler(textArea);
      this._setupResizeObserver(textArea);

      // 初始化行信息引用
      this.virtualScrollData.lineInfo = TextHighlight.PositionCalculator.cache.lineInfo;
    },

    _setupResizeObserver(textArea) {
      let resizeTimeout;

      const updateAfterResize = () => {
        if (!textArea || !this.container) {
          console.error('[PreviewHighlight] 找不到必要元素');
          return;
        }
        
        // 獲取新的尺寸
        const offsetWidth = textArea.offsetWidth;
        const offsetHeight = textArea.offsetHeight;
        
        // 更新容器尺寸
        this.container.style.width = `${offsetWidth}px`;
        this.container.style.height = `${offsetHeight}px`;
        
        // 清除所有現有的高亮
        this.clearAllHighlights();
        
        // 強制更新所有預覽
        requestAnimationFrame(() => {
          ManualReplaceManager._updatePreviews();
        });
      };

      const resizeObserver = new ResizeObserver(() => {
        // 清除之前的延遲執行
        if (resizeTimeout) {
          clearTimeout(resizeTimeout);
        }
        
        // 延遲執行更新，避免過於頻繁的更新
        resizeTimeout = setTimeout(() => {
          updateAfterResize();
        }, 100);
      });
      
      if (textArea) {
        resizeObserver.observe(textArea);
      }
    },

    _setupScrollHandler(textArea) {
      // 使用 TextHighlight 的 ScrollHelper
      TextHighlight.ScrollHelper.bindScrollEvent(
        textArea,
        () => this._updateVirtualScrolling(textArea)
      );
    },

    _updateVirtualScrolling(textArea) {
      const scrollTop = textArea.scrollTop;
      const visibleHeight = textArea.clientHeight;
      const totalHeight = textArea.scrollHeight;
      
      // 計算可見區域的範圍（加上緩衝區）
      const bufferSize = this.virtualScrollData.bufferSize;
      const visibleTop = Math.max(0, scrollTop - bufferSize);
      const visibleBottom = Math.min(totalHeight, scrollTop + visibleHeight + bufferSize);

      // 更新每個組的可見性
      this.virtualScrollData.allPositions.forEach((positions, groupIndex) => {
        // 獲取或創建該組的可見高亮 Map
        if (!this.virtualScrollData.visibleHighlights.has(groupIndex)) {
          this.virtualScrollData.visibleHighlights.set(groupIndex, new Map());
        }
        const groupHighlights = this.virtualScrollData.visibleHighlights.get(groupIndex);

        // 使用共享的虛擬滾動管理器
        TextHighlight.SharedVirtualScroll.updateVirtualView({
          allPositions: positions,
          visibleHighlights: groupHighlights,
          visibleTop,
          visibleBottom,
          scrollTop,
          createHighlight: (pos) => {
            const highlight = document.createElement('div');
            highlight.style.cssText = `
              position: absolute;
              left: ${pos.left - 1}px;
              top: ${pos.top}px;
              width: ${pos.width + 3}px;
              height: ${pos.lineHeight}px;
              border-color: ${pos.color};
              will-change: transform;
              z-index: 1001;
            `;
            return highlight;
          },
          container: this.container,
          highlightClass: 'replace-preview-highlight'
        });
      });
    },

    updatePreview(textArea, searchText, groupIndex) {
      if (!searchText.trim()) {
        this.clearGroupHighlights(groupIndex);
        return;
      }

      try {
        const text = textArea.value;
        const regex = RegexHelper.createRegex(searchText);
        const matches = Array.from(text.matchAll(regex));
        
        if (matches.length === 0) {
          this.clearGroupHighlights(groupIndex);
          return;
        }

        // 檢查匹配數量是否超過上限
        if (matches.length > ManualReplaceManager.CONFIG.MAX_PREVIEWS) {
          console.log(`匹配數量(${matches.length})超過上限(${ManualReplaceManager.CONFIG.MAX_PREVIEWS})，只顯示前${ManualReplaceManager.CONFIG.MAX_PREVIEWS}個預覽`);
          matches.length = ManualReplaceManager.CONFIG.MAX_PREVIEWS;
        }

        // 獲取文本區域的樣式
        const styles = TextHighlight.PositionCalculator.getTextAreaStyles(textArea);
        const color = ManualReplaceManager.CONFIG.PREVIEW_COLORS[
          groupIndex % ManualReplaceManager.CONFIG.PREVIEW_COLORS.length
        ];

        // 檢查文本是否變化
        const textChanged = this.virtualScrollData.lastText !== text;
        let textChangeInfo = null;
        
        if (textChanged) {
          // 使用 TextHighlight 的文本變化分析
          textChangeInfo = TextHighlight.PositionCalculator.analyzeTextChange(
            this.virtualScrollData.lastText,
            text
          );
          this.virtualScrollData.lastText = text;
        }

        // 收集所有位置信息
        const positions = [];
        for (const match of matches) {
          // 使用 TextHighlight 的位置計算
          let position = TextHighlight.PositionCalculator.calculatePosition(
            textArea,
            match.index,
            text,
            match[0],
            styles
          );
          
          if (position) {
            positions.push({
              ...position,
              text: match[0],
              color,
              lineHeight: styles.lineHeight
            });
          }
        }

        // 更新虛擬滾動數據
        this.virtualScrollData.allPositions.set(groupIndex, positions);
        
        // 觸發可見性更新
        this._updateVirtualScrolling(textArea);

      } catch (error) {
        console.error('預覽更新失敗:', error);
      }
    },

    clearGroupHighlights(groupIndex) {
      // 清除位置數據
      this.virtualScrollData.allPositions.delete(groupIndex);
      
      // 清除可見的高亮元素
      const groupHighlights = this.virtualScrollData.visibleHighlights.get(groupIndex);
      if (groupHighlights) {
        groupHighlights.forEach(highlight => highlight.remove());
        groupHighlights.clear();
      }
    },

    clearAllHighlights() {
      this.virtualScrollData.allPositions.clear();
      this.virtualScrollData.visibleHighlights.forEach(groupHighlights => {
        groupHighlights.forEach(highlight => highlight.remove());
      });
      this.virtualScrollData.visibleHighlights.clear();
    }
  },

  /** 預覽更新方法 */
  _updatePreviews() {
    const textArea = document.querySelector('textarea[name="content"]');
    if (!textArea) return;

    // 更新主組預覽
    if (this._rules.mainGroup?.from?.trim()) {
      this.PreviewHighlight.updatePreview(
        textArea,
        this._rules.mainGroup.from,
        0
      );
    } else {
      this.PreviewHighlight.clearGroupHighlights(0);
    }

    // 更新其他組預覽
    this._rules.extraGroups.forEach((rule, index) => {
      if (rule.from?.trim()) {
        this.PreviewHighlight.updatePreview(
          textArea,
          rule.from,
          index + 1
        );
      } else {
        this.PreviewHighlight.clearGroupHighlights(index + 1);
      }
    });
  },

  /** 存儲相關方法 */
  _saveRules() {
    const storageKey = 'replace_' + this.CONFIG.MANUAL_REPLACE_KEY;
    chrome.storage.local.set({
      [storageKey]: this._rules.extraGroups
    }, () => {
      if (chrome.runtime.lastError) {
        console.error('保存規則失敗:', chrome.runtime.lastError);
      }
    });
  },

  _loadRules(callback) {
    const storageKey = 'replace_' + this.CONFIG.MANUAL_REPLACE_KEY;
    chrome.storage.local.get([storageKey], (result) => {
      const rules = result[storageKey] || [{ from: '', to: '' }];
      this._rules.extraGroups = rules;
      if (callback) callback();
    });
  },

  /** 初始化方法 */
  initializeManualGroups(mainContainer, otherContainer, textArea) {
    // 初始化預覽
    this.PreviewHighlight.initialize(textArea);

    // 使用 ReplaceManager 的初始化方法
    window.ReplaceManager.initializeReplaceGroups({
      mainContainer,        // 主組容器
      otherContainer,       // 其他組容器
      textArea,            // 文本區域
      storageKey: 'replace_' + this.CONFIG.MANUAL_REPLACE_KEY,  // 儲存鍵名
      createGroupFn: this.createReplaceGroup.bind(this),        // 創建組函數
      onInitialized: () => {
        // 設置文本變化監聽
        this._setupTextAreaChangeListener(textArea);

        // 初始化規則狀態
        const mainGroup = mainContainer.querySelector('.replace-main-group');
        const mainFromInput = mainGroup?.querySelector('.replace-input');
        if (mainFromInput) {
          this._rules.mainGroup = {
            from: mainFromInput.value,
            to: mainGroup.querySelector('.replace-input:last-of-type').value
          };
        }

        const extraGroups = document.querySelectorAll('.manual-replace-container .replace-extra-group');
        this._rules.extraGroups = Array.from(extraGroups).map(group => ({
          from: group.querySelector('.replace-input').value,
          to: group.querySelector('.replace-input:last-of-type').value
        }));

        // 更新預覽
        this._updatePreviews();
      },
      isManual: true
    });
  },

  /** 設置文本區域變化監聽器 */
  _setupTextAreaChangeListener(textArea) {
    let lastValue = textArea.value;
    const checkValue = () => {
      if (textArea.value !== lastValue) {
        lastValue = textArea.value;
        this._updatePreviews();
      }
      requestAnimationFrame(checkValue);
    };
    checkValue();
  },

  /** 清理資源 */
  cleanup() {
    this.PreviewHighlight.clearAllHighlights();
    if (this.PreviewHighlight.container) {
      this.PreviewHighlight.container.remove();
    }
  },

  /** 調整輸入框寬度 */
  _adjustInputWidth(input) {
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

  /** 檢查並強制更新高亮 */
  checkAndForceUpdateHighlights() {
    console.log('[高亮檢查] 開始檢查高亮顯示狀態');
    const highlights = document.querySelectorAll('.replace-preview-highlight');
    const hasValidHighlights = Array.from(highlights).some(h => 
      h.style.display !== 'none' && 
      parseFloat(h.style.width) > 0
    );

    if (!hasValidHighlights) {
      console.log('[高亮檢查] 未檢測到有效高亮，強制更新');
      const textArea = document.querySelector('textarea[name="content"]');
      if (textArea) {
        this._updatePreviews();
      }
    } else {
      console.log('[高亮檢查] 高亮顯示正常');
    }
  },

  /** 開始定期檢查高亮 */
  startHighlightCheck() {
    console.log('[高亮檢查] 開始定期檢查');
    // 在前幾秒多檢查
    const checkTimes = [100, 500, 1000, 2000];
    checkTimes.forEach(delay => {
      setTimeout(() => {
        this.checkAndForceUpdateHighlights();
      }, delay);
    });
  }
};

window.ManualReplaceManager = ManualReplaceManager; 