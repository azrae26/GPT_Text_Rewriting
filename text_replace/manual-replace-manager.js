/**
 * 手動替換管理模組
 * 
 * 依賴模組：
 * 1. text_highlight/highlight.js
 *    - TextHighlight.CONFIG.FIXED_OFFSET：用於設置預覽容器的位置偏移
 *    - TextHighlight.PositionCalculator：用於計算文本位置和樣式
 *    - TextHighlight.ScrollHelper：用於處理滾動事件
 *    - TextHighlight.SharedVirtualScroll：用於優化虛擬滾動
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
    MAX_WIDTH: 600,
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
  _addRule(insertIndex = null) {
    // 如果沒有指定插入位置，則在末尾添加
    if (insertIndex === null || insertIndex >= this._rules.extraGroups.length) {
      this._rules.extraGroups.push({ from: '', to: '' });
    } else {
      // 在指定位置插入
      this._rules.extraGroups.splice(insertIndex + 1, 0, { from: '', to: '' });
    }
    
    // 重新渲染所有extra組
    this._rerenderExtraGroups();
    this._saveRules();
  },

  /** 重新渲染所有extra組 */
  _rerenderExtraGroups() {
    const textArea = document.querySelector('textarea[name="content"]');
    const manualContainer = document.querySelector('.manual-replace-container');
    if (!textArea || !manualContainer) return;

    // 移除所有現有的extra組
    const existingGroups = manualContainer.querySelectorAll('.replace-extra-group');
    existingGroups.forEach(group => group.remove());

    // 重新創建所有extra組
    this._rules.extraGroups.forEach((rule, index) => {
      const newGroup = this.createReplaceGroup(textArea, false, rule, index);
      manualContainer.appendChild(newGroup);
    });

    // 更新預覽
    this._updatePreviews();
  },

  /** 移除規則 */
  _removeRule(index) {
    this._rules.extraGroups.splice(index, 1);
    if (this._rules.extraGroups.length === 0) {
      this._rules.extraGroups.push({ from: '', to: '' });
    }
    
    // 重新渲染所有extra組
    this._rerenderExtraGroups();
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
      
      // 先檢查文字是否過長的函數 - 如果過長，直接返回 true
      const isTextTooLong = (element) => {
        const text = element.value;
        if (!text) return false;
        
        const span = document.createElement('span');
        span.style.cssText = `
          visibility: hidden;
          position: absolute;
          white-space: pre;
          font: ${window.getComputedStyle(element).font};
        `;
        span.textContent = text;
        document.body.appendChild(span);
        
        const textWidth = span.offsetWidth;
        span.remove();
        
        // 如果寬度接近最大值，返回 true
        const paddedWidth = textWidth + ManualReplaceManager.CONFIG.PADDING;
        return paddedWidth >= ManualReplaceManager.CONFIG.MAX_WIDTH * 0.8; // 降低閾值，提前攔截
      };
      
      // 加入焦點事件
      input.addEventListener('focus', (e) => {
        // 如果主組輸入框，一律不擴展
        if (input.closest('.replace-main-group')) {
          return;
        }
        
        // 攔截原始焦點事件，暫停輸入框擴展
        e.preventDefault();
        
        // 標記輸入框，防止其他處理器再次擴展
        input.dataset.skipExpand = 'true';
        
        // 立即檢查文本長度
        if (isTextTooLong(input)) {
          // 阻止擴展，僅將焦點設置回原輸入框
          input.focus();
          // 確保不擴展
          setTimeout(() => {
            if (input.dataset.skipExpand === 'true') {
              // 維持原始寬度
              input.style.cssText = `width: ${ManualReplaceManager.CONFIG.MIN_WIDTH}px !important;`;
            }
          }, 0);
          return;
        }
        
        // 正常擴展輸入框
        delete input.dataset.skipExpand;
        ManualReplaceManager._adjustInputWidth(input);
      }, true);
      
      input.addEventListener('blur', () => {
        if (!input.closest('.replace-main-group')) {
          input.style.cssText = `width: ${ManualReplaceManager.CONFIG.MIN_WIDTH}px !important;`;
          delete input.dataset.skipExpand;
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

    createControlButtons(addCallback, removeCallback, groupIndex = null) {
      const container = document.createElement('div');
      container.className = 'replace-group-controls';

      // 新增排序拖移按鈕
      const sortButton = document.createElement('button');
      sortButton.innerHTML = '<span>⋮⋮</span>';
      sortButton.className = 'replace-sort-button';
      sortButton.draggable = true;
      sortButton.title = '拖移排序';
      container.appendChild(sortButton);

      const addButton = document.createElement('button');
      addButton.textContent = '+';
      addButton.className = 'replace-control-button';
      addButton.id = 'replace-add-button';
      addButton.onclick = () => addCallback(groupIndex);
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

      // 設置排序拖移事件
      if (groupIndex !== null) {
        ManualReplaceManager._setupSortDragEvents(sortButton, groupIndex);
      }

      return container;
    }
  },

  /** 創建替換組 */
  createReplaceGroup(textArea, isMainGroup = false, initialData = null, groupIndex = null) {
    const group = document.createElement('div');
    group.className = isMainGroup ? 'replace-main-group' : 'replace-extra-group';

    if (!isMainGroup) {
      const controlButtons = this.UI.createControlButtons(
        (index) => this._addRule(index),
        () => {
          const container = group.parentElement;
          const groups = Array.from(container.querySelectorAll('.replace-extra-group'));
          const index = groups.indexOf(group);
          if (index !== -1) {
            this._removeRule(index);
          }
        },
        groupIndex  // 傳遞組索引
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
        // 檢查是否應該跳過擴展
        if (!input.dataset.skipExpand) {
          this._adjustInputWidth(input);
        }
      });
      
      // 監聽自定義的值同步事件
      input.addEventListener('value-sync', () => {
        handleInput();
        updateButton();
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
      lastScrollTop: 0,     // 上次滾動位置
      bufferSize: 200,      // 緩衝區大小（像素）
      lastText: '',     // 記錄上次的文本
      lineInfo: null,   // 行信息引用
      positionCache: new Map(), // 位置快取
      lastLogTime: null // 效能計算用
    },

    // 添加效能計算日誌方法
    _logWithDiff(message, startTime) {
      const endTime = performance.now();
      const timeDiff = endTime - startTime;
      
      // 只保留初始化相關的日誌
      if (message.includes('開始初始化替換預覽') || 
          message.includes('替換預覽初始化完成')) {
        console.log(`${message} (耗時: ${timeDiff.toFixed(2)}ms)`);
      }
    },

    initialize(textArea) {
      if (!textArea) return;
      
      this._logWithDiff('開始初始化替換預覽', performance.now());
      
      this.container = document.createElement('div');
      this.container.id = ManualReplaceManager.CONFIG.PREVIEW_CONTAINER_ID;
      
      // 使用 TextHighlight 的樣式計算方法
      const styles = TextHighlight.PositionCalculator.getTextAreaStyles(textArea);
      
      this.container.style.cssText = `
        position: absolute;
        top: ${TextHighlight.CONFIG.FIXED_OFFSET.TOP}px;
        left: 0;
        width: ${textArea.offsetWidth}px;
        height: ${textArea.offsetHeight}px;
        pointer-events: none;
        z-index: 1001;
        overflow: hidden;
        font: ${styles.font};
        line-height: ${styles.lineHeight}px;
        padding: ${styles.paddingTop}px ${styles.paddingLeft}px;
      `;
      
      textArea.parentElement.appendChild(this.container);
      
      // 使用 TextHighlight 的滾動處理器
      TextHighlight.ScrollHelper.bindScrollEvent(
        textArea,
        () => this._updateVirtualScrolling(textArea)
      );
      
      this._setupResizeObserver(textArea);
      
      // 初始化行信息引用
      this.virtualScrollData.lineInfo = TextHighlight.PositionCalculator.cache.lineInfo;
      
      this._logWithDiff('替換預覽初始化完成', performance.now());
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

    _updateVirtualScrolling(textArea) {
      const scrollTop = textArea.scrollTop;
      const visibleHeight = textArea.clientHeight;
      const totalHeight = textArea.scrollHeight;
      
      // 計算可見區域的範圍（加上緩衝區）
      const bufferSize = this.virtualScrollData.bufferSize;
      const visibleTop = Math.max(0, scrollTop - bufferSize);
      const visibleBottom = Math.min(totalHeight, scrollTop + visibleHeight + bufferSize);

      let totalVisiblePositions = 0;

      // 更新每個組的可見性
      this.virtualScrollData.allPositions.forEach((positions, groupIndex) => {
        // 獲取或創建該組的可見高亮 Map
        if (!this.virtualScrollData.visibleHighlights.has(groupIndex)) {
          this.virtualScrollData.visibleHighlights.set(groupIndex, new Map());
        }
        const groupHighlights = this.virtualScrollData.visibleHighlights.get(groupIndex);
        
        // 記錄現有的高亮元素
        const existingHighlights = new Map(groupHighlights);
        groupHighlights.clear();

        // 找出需要顯示的位置
        const visiblePositions = positions.filter(pos => {
          const top = pos.position ? pos.position.top : pos.top;
          return top >= visibleTop && top <= visibleBottom;
        });

        totalVisiblePositions += visiblePositions.length;

        // 更新或創建可見範圍內的高亮
        visiblePositions.forEach(pos => {
          const top = pos.position ? pos.position.top : pos.top;
          const left = pos.position ? pos.position.left : pos.left;
          const text = pos.position ? pos.position.text : pos.text;
          
          const key = `${top}-${left}-${text}`;
          let highlight = existingHighlights.get(key);

          if (highlight) {
            // 重用現有元素
            existingHighlights.delete(key);
            highlight.style.transform = `translate3d(0, ${top - scrollTop}px, 0)`;
            highlight.style.display = 'block';
          } else {
            // 創建新元素
            highlight = document.createElement('div');
            highlight.className = 'replace-preview-highlight';
            highlight.style.cssText = `
              position: absolute;
              left: ${left - 1}px;
              top: 0;
              width: ${pos.width + 3}px;
              height: ${pos.lineHeight - 1}px;
              border: 0px solid ${pos.color}; // 改為 0px 不要動他
              border-radius: 2px;
              will-change: transform;
              z-index: 1001;
              transform: translate3d(0, ${top - scrollTop}px, 0);
              backface-visibility: hidden;
              -webkit-font-smoothing: antialiased;
              background: none;
            `;
            this.container.appendChild(highlight);
          }

          groupHighlights.set(key, highlight);
        });

        // 隱藏不再可見的元素
        existingHighlights.forEach(highlight => {
          highlight.style.display = 'none';
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
          matches.length = ManualReplaceManager.CONFIG.MAX_PREVIEWS;
        }

        // 使用 TextHighlight 的樣式計算方法
        const styles = TextHighlight.PositionCalculator.getTextAreaStyles(textArea);
        const color = ManualReplaceManager.CONFIG.PREVIEW_COLORS[
          groupIndex % ManualReplaceManager.CONFIG.PREVIEW_COLORS.length
        ];

        // 檢查文本是否變化
        const textChanged = this.virtualScrollData.lastText !== text;
        if (textChanged) {
          // 文本變化時清除快取
          this.virtualScrollData.positionCache.clear();
          this.virtualScrollData.lastText = text;
        }

        // 收集所有位置信息
        const positions = [];
        let cacheHits = 0;
        let cacheMisses = 0;
        
        for (const match of matches) {
          // 檢查快取
          const cacheKey = `${groupIndex}-${match.index}-${match[0]}`;
          let positionList = this.virtualScrollData.positionCache.get(cacheKey);
          
          // 如果快取未命中或需要重新計算
          if (!positionList || textChanged) {
            cacheMisses++;
            positionList = TextHighlight.PositionCalculator.calculatePosition(
              textArea,
              match.index,
              text,
              match[0],
              styles
            );
            
            if (positionList) {
              // 更新快取
              this.virtualScrollData.positionCache.set(cacheKey, positionList.map(pos => ({
                ...pos,
                text: match[0],
                color,
                lineHeight: styles.lineHeight,
                originalTop: pos.top
              })));
            }
          } else {
            cacheHits++;
          }
          
          if (positionList) {
            positionList.forEach(position => {
              positions.push({
                ...position,
                text: match[0],
                color,
                lineHeight: styles.lineHeight,
                originalTop: position.top
              });
            });
          }
        }

        this._logWithDiff(`收集到 ${positions.length} 個位置信息`, performance.now());

        // 更新虛擬滾動數據
        this.virtualScrollData.allPositions.set(groupIndex, positions);
        
        // 觸發可見性更新
        this._updateVirtualScrolling(textArea);

        // 清理過期的快取
        if (this.virtualScrollData.positionCache.size > 1000) {
          const entries = Array.from(this.virtualScrollData.positionCache.entries());
          const halfSize = Math.floor(entries.length / 2);
          this.virtualScrollData.positionCache = new Map(entries.slice(halfSize));
        }

      } catch (error) {
        console.error('預覽更新失敗:', error);
      }
    },

    clearGroupHighlights(groupIndex) {
      // 清除位置數據
      this.virtualScrollData.allPositions.delete(groupIndex);
      
      // 清除該組的位置快取
      const cacheKeys = Array.from(this.virtualScrollData.positionCache.keys())
        .filter(key => key.startsWith(`${groupIndex}-`));
      cacheKeys.forEach(key => this.virtualScrollData.positionCache.delete(key));
      
      // 清除可見的高亮元素
      const groupHighlights = this.virtualScrollData.visibleHighlights.get(groupIndex);
      if (groupHighlights) {
        groupHighlights.forEach(highlight => highlight.remove());
        groupHighlights.clear();
      }
    },

    clearAllHighlights() {
      this.virtualScrollData.allPositions.clear();
      this.virtualScrollData.positionCache.clear();
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
    console.log('[高亮檢查] 開始定期檢查.');
    // 在前幾秒多檢查
    const checkTimes = [100, 500, 1000, 2000];
    checkTimes.forEach(delay => {
      setTimeout(() => {
        this.checkAndForceUpdateHighlights();
      }, delay);
    });
  },

  /** 設置排序拖移事件 */
  _setupSortDragEvents(button, groupIndex) {
    button.addEventListener('dragstart', (e) => {
      e.dataTransfer.setData('text/plain', groupIndex.toString());
      e.dataTransfer.effectAllowed = 'move';
      button.closest('.replace-extra-group').classList.add('dragging');
      
      // 為所有組設置拖放區域
      this._setupDropZones();
    });

    button.addEventListener('dragend', () => {
      document.querySelectorAll('.replace-extra-group').forEach(group => {
        group.classList.remove('dragging', 'drag-over');
      });
      
      // 清理拖放區域
      this._cleanupDropZones();
    });
  },

  /** 設置拖放區域 */
  _setupDropZones() {
    const container = document.querySelector('.manual-replace-container');
    if (!container) return;

    const allGroups = document.querySelectorAll('.replace-extra-group');
    let currentDraggedIndex = null;
    
    // 容器級別的拖放處理
    const handleContainerDragOver = (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      
      // 根據滑鼠位置找到最近的組
      const closestGroup = this._getClosestGroup(e.clientY);
      if (closestGroup) {
        // 清除所有高亮
        allGroups.forEach(g => g.classList.remove('drag-over'));
        // 高亮最近的組
        if (!closestGroup.classList.contains('dragging')) {
          closestGroup.classList.add('drag-over');
        }
      }
    };

    const handleContainerDrop = (e) => {
      e.preventDefault();
      const fromIndex = parseInt(e.dataTransfer.getData('text/plain'));
      
      // 根據滑鼠位置計算目標索引
      const toIndex = this._getDropIndex(e.clientY);
      
      if (fromIndex !== toIndex && toIndex !== -1) {
        this._reorderExtraGroups(fromIndex, toIndex);
      }
      
      document.querySelectorAll('.replace-extra-group').forEach(g => {
        g.classList.remove('dragging', 'drag-over');
      });
    };

    const handleContainerDragLeave = (e) => {
      // 只有真正離開容器時才清除高亮
      if (!container.contains(e.relatedTarget)) {
        allGroups.forEach(g => g.classList.remove('drag-over'));
      }
    };

    // 添加容器事件監聽器
    container._dragOverHandler = handleContainerDragOver;
    container._dropHandler = handleContainerDrop;
    container._dragLeaveHandler = handleContainerDragLeave;
    
    container.addEventListener('dragover', handleContainerDragOver);
    container.addEventListener('drop', handleContainerDrop);
    container.addEventListener('dragleave', handleContainerDragLeave);
  },

  /** 根據Y座標找到最近的組 */
  _getClosestGroup(y) {
    const groups = Array.from(document.querySelectorAll('.replace-extra-group'));
    let closestGroup = null;
    let closestDistance = Infinity;

    groups.forEach(group => {
      const rect = group.getBoundingClientRect();
      const groupCenter = rect.top + rect.height / 2;
      const distance = Math.abs(y - groupCenter);
      
      if (distance < closestDistance) {
        closestDistance = distance;
        closestGroup = group;
      }
    });

    return closestGroup;
  },

  /** 根據Y座標計算放置索引 */
  _getDropIndex(y) {
    const groups = Array.from(document.querySelectorAll('.replace-extra-group'));
    
    // 如果沒有組，返回0
    if (groups.length === 0) return 0;
    
    // 檢查是否在第一個組之前
    const firstRect = groups[0].getBoundingClientRect();
    if (y < firstRect.top + firstRect.height / 2) {
      return 0;
    }
    
    // 檢查每個組之間的位置
    for (let i = 0; i < groups.length - 1; i++) {
      const currentRect = groups[i].getBoundingClientRect();
      const nextRect = groups[i + 1].getBoundingClientRect();
      
      if (y >= currentRect.top + currentRect.height / 2 && 
          y < nextRect.top + nextRect.height / 2) {
        return i + 1;
      }
    }
    
    // 如果在最後一個組之後
    return groups.length;
  },

  /** 清理拖放區域 */
  _cleanupDropZones() {
    const container = document.querySelector('.manual-replace-container');
    if (container) {
      if (container._dragOverHandler) {
        container.removeEventListener('dragover', container._dragOverHandler);
        delete container._dragOverHandler;
      }
      if (container._dropHandler) {
        container.removeEventListener('drop', container._dropHandler);
        delete container._dropHandler;
      }
      if (container._dragLeaveHandler) {
        container.removeEventListener('dragleave', container._dragLeaveHandler);
        delete container._dragLeaveHandler;
      }
    }
    
    const allGroups = document.querySelectorAll('.replace-extra-group');
    allGroups.forEach(group => {
      group.classList.remove('drag-over');
    });
  },

  /** 重新排序額外組 */
  _reorderExtraGroups(fromIndex, toIndex) {
    if (fromIndex === toIndex) return;

    // 調整目標索引（如果從較小索引移到較大索引，需要減1）
    const adjustedToIndex = fromIndex < toIndex ? toIndex - 1 : toIndex;

    // 重新排列陣列
    const item = this._rules.extraGroups.splice(fromIndex, 1)[0];
    this._rules.extraGroups.splice(adjustedToIndex, 0, item);

    // 重新渲染所有組
    this._rerenderExtraGroups();
    
    // 保存更新後的規則
    this._saveRules();
    
    // 更新預覽（因為組的索引改變了）
    this._updatePreviews();
  }
};

window.ManualReplaceManager = ManualReplaceManager; 