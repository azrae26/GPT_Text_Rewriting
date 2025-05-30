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

    // 為所有新創建的組設置拖曳事件
    requestAnimationFrame(() => {
      this._setupAllSortDragEvents();
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

      // 存儲拖移按鈕和索引，以便稍後設置拖曳事件
      if (groupIndex !== null) {
        container.sortButton = sortButton;
        container.groupIndex = groupIndex;
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
      lastLogTime: null, // 效能計算用
      observedElements: new Map() // 追踪已被觀察的元素
    },
    observer: null, // IntersectionObserver 實例

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
      
      // 初始化 IntersectionObserver
      this._initializeObserver();
      
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

    // 新增方法：初始化 IntersectionObserver
    _initializeObserver() {
      // 如果已經存在觀察器，先斷開連接
      if (this.observer) {
        this.observer.disconnect();
      }

      // 創建新的 IntersectionObserver
      this.observer = new IntersectionObserver(entries => {
        entries.forEach(entry => {
          const highlight = entry.target;
          // 當元素進入可視區域時顯示，離開時隱藏
          highlight.style.display = entry.isIntersecting ? 'block' : 'none';
        });
      }, { 
        root: this.container,
        // 增加緩衝區，提前加載和延遲卸載
        rootMargin: `${this.virtualScrollData.bufferSize}px 0px ${this.virtualScrollData.bufferSize}px 0px`,
        threshold: 0
      });
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
      
      // 創建文檔片段，減少DOM操作
      const fragment = document.createDocumentFragment();
      const newElements = [];
      
      // 更新每個組的可見性
      this.virtualScrollData.allPositions.forEach((positions, groupIndex) => {
        // 獲取或創建該組的可見高亮 Map
        if (!this.virtualScrollData.visibleHighlights.has(groupIndex)) {
          this.virtualScrollData.visibleHighlights.set(groupIndex, new Map());
        }
        const groupHighlights = this.virtualScrollData.visibleHighlights.get(groupIndex);
        
        // 處理所有位置
        positions.forEach(pos => {
          const top = pos.position ? pos.position.top : pos.top;
          const left = pos.position ? pos.position.left : pos.left;
          const text = pos.position ? pos.position.text : pos.text;
          
          const key = `${groupIndex}-${top}-${left}-${text}`;
          
          // 檢查元素是否已存在
          if (!this.virtualScrollData.observedElements.has(key)) {
            // 創建新元素
            const highlight = document.createElement('div');
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
            
            // 設置 data 屬性，用於識別元素
            highlight.dataset.groupIndex = groupIndex;
            highlight.dataset.top = top;
            highlight.dataset.key = key;
            
            // 將新元素添加到文檔片段
            fragment.appendChild(highlight);
            newElements.push(highlight);
            
            // 將元素添加到映射中
            this.virtualScrollData.observedElements.set(key, highlight);
            groupHighlights.set(key, highlight);
          } else {
            // 更新現有元素的位置
            const highlight = this.virtualScrollData.observedElements.get(key);
            highlight.style.transform = `translate3d(0, ${top - scrollTop}px, 0)`;
            
            // 確保該元素在當前組的可見高亮中
            if (!groupHighlights.has(key)) {
              groupHighlights.set(key, highlight);
            }
          }
        });
      });
      
      // 一次性將所有新元素添加到DOM
      if (fragment.childNodes.length > 0) {
        this.container.appendChild(fragment);
        
        // 將新元素添加到 IntersectionObserver 中觀察
        newElements.forEach(highlight => {
          this.observer.observe(highlight);
        });
      }
      
      // 處理不再需要的元素
      // 找出所有不再位於 allPositions 中的元素並停止觀察
      this._cleanupUnusedHighlights();
    },
    
    // 新增方法：清理不再使用的高亮元素
    _cleanupUnusedHighlights() {
      // 先收集所有有效的鍵
      const validKeys = new Set();
      this.virtualScrollData.allPositions.forEach((positions, groupIndex) => {
        positions.forEach(pos => {
          const top = pos.position ? pos.position.top : pos.top;
          const left = pos.position ? pos.position.left : pos.left;
          const text = pos.position ? pos.position.text : pos.text;
          const key = `${groupIndex}-${top}-${left}-${text}`;
          validKeys.add(key);
        });
      });
      
      // 檢查並移除不再有效的元素
      const keysToRemove = [];
      this.virtualScrollData.observedElements.forEach((highlight, key) => {
        if (!validKeys.has(key)) {
          // 停止觀察此元素
          this.observer.unobserve(highlight);
          // 從DOM中移除
          if (highlight.parentNode) {
            highlight.parentNode.removeChild(highlight);
          }
          // 標記為待移除
          keysToRemove.push(key);
          
          // 從各組的可見高亮中移除
          const groupIndex = highlight.dataset.groupIndex;
          if (groupIndex && this.virtualScrollData.visibleHighlights.has(parseInt(groupIndex))) {
            this.virtualScrollData.visibleHighlights.get(parseInt(groupIndex)).delete(key);
          }
        }
      });
      
      // 從觀察元素映射中移除
      keysToRemove.forEach(key => {
        this.virtualScrollData.observedElements.delete(key);
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
      
      // 清除可見的高亮元素和停止觀察
      const groupHighlights = this.virtualScrollData.visibleHighlights.get(groupIndex);
      if (groupHighlights) {
        groupHighlights.forEach(highlight => {
          // 停止觀察此元素
          if (this.observer) {
            this.observer.unobserve(highlight);
          }
          // 從DOM中移除
          highlight.remove();
          
          // 從觀察元素映射中移除
          const key = highlight.dataset.key;
          if (key) {
            this.virtualScrollData.observedElements.delete(key);
          }
        });
        groupHighlights.clear();
      }
    },

    clearAllHighlights() {
      // 停止所有觀察
      if (this.observer) {
        this.observer.disconnect();
      }
      
      // 清除數據結構
      this.virtualScrollData.allPositions.clear();
      this.virtualScrollData.positionCache.clear();
      this.virtualScrollData.observedElements.clear();
      
      // 清除DOM元素
      this.virtualScrollData.visibleHighlights.forEach(groupHighlights => {
        groupHighlights.forEach(highlight => {
          highlight.remove();
        });
        groupHighlights.clear();
      });
      this.virtualScrollData.visibleHighlights.clear();
      
      // 重新初始化觀察器
      this._initializeObserver();
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
    const manualContainer = document.querySelector('.manual-replace-container');
    if (!manualContainer) return;
    
    // 使用 ReplaceManager.StorageHelper 提取規則
    const extraRules = window.ReplaceManager.StorageHelper.extractRulesFromDOM({
      container: manualContainer,
      groupSelector: '.replace-extra-group'
    });
    
    // 更新內部規則
    this._rules.extraGroups = extraRules;
    
    // 使用 StorageHelper 保存
    const storageKey = 'replace_' + this.CONFIG.MANUAL_REPLACE_KEY;
    window.ReplaceManager.StorageHelper.saveRules(
      storageKey,
      extraRules,
      () => console.log('手動替換規則已保存')
    );
  },

  _loadRules(callback) {
    const storageKey = 'replace_' + this.CONFIG.MANUAL_REPLACE_KEY;
    
    // 使用 StorageHelper 加載
    window.ReplaceManager.StorageHelper.loadRules(
      storageKey,
      [{ from: '', to: '' }],
      (rules) => {
        this._rules.extraGroups = rules;
        if (callback) callback();
      }
    );
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

        // 設置所有拖曳事件
        this._setupAllSortDragEvents();

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
    // 獲取組元素和容器
    const group = button.closest('.replace-extra-group');
    if (!group) return;
    
    const container = group.parentElement;
    if (!container) {
      console.error('無法找到替換組的父容器');
      return;
    }
    
    // 使用 ReplaceManager.DragManager 提供的統一拖移排序函數
    ReplaceManager.DragManager.setupSortDragEvents(button, {
      groupSelector: '.replace-extra-group',  // 組選擇器
      container: container,                   // 明確指定容器
      lockHorizontal: true,                   // 鎖定水平位置
      placeholderId: 'manual-drag-placeholder', // 沿用原有佔位符ID
      onComplete: (container) => {
        // 獲取所有 extra 組，建立新的順序陣列
        const groups = Array.from(container.querySelectorAll('.replace-extra-group'));
        const newExtraGroups = groups.map(groupElement => {
          const fromInput = groupElement.querySelector('.replace-input');
          const toInput = groupElement.querySelector('.replace-input:last-of-type');
          return {
            from: fromInput ? fromInput.value : '',
            to: toInput ? toInput.value : ''
          };
        });
        
        // 更新資料模型中的順序
        this._rules.extraGroups = newExtraGroups;
        
        // 保存新順序
        this._saveRules();
        
        // 更新預覽（因為組的索引改變了）
        this._updatePreviews();
      }
    });
  },

  /** 設置所有排序拖移事件 */
  _setupAllSortDragEvents() {
    // 查找所有額外組的控制按鈕容器
    const containers = document.querySelectorAll('.manual-replace-container .replace-extra-group .replace-group-controls');
    
    containers.forEach(container => {
      if (container.sortButton && container.groupIndex !== undefined) {
        this._setupSortDragEvents(container.sortButton, container.groupIndex);
      }
    });
  },
};

window.ManualReplaceManager = ManualReplaceManager; 