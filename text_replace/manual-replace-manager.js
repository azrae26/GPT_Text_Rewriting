/**
 * 手動替換管理模組
 * 
 * 依賴模組：
 * 1. text_highlight/highlight.js
 *    - TextHighlight.PositionCalculator：用於計算文本位置和樣式，支援動態容器定位
 *    - TextHighlight.ScrollHelper：用於處理滾動事件
 *    - TextHighlight.SharedVirtualScroll：用於優化虛擬滾動和多組高亮管理
 *    - TextHighlight.Renderer：用於創建預覽高亮元素
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
    MAIN_GROUP_MAX_WIDTH: 330, // 主組輸入框最大寬度
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
  _updateRule(rule, index, isMainGroup = false) {
    if (isMainGroup) {
      this._rules.mainGroup = rule;
      // 主組由調用者控制預覽更新時機，避免重複觸發
    } else {
      this._rules.extraGroups[index] = rule;
      this._updatePreviews();
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

      // 存儲拖移按鈕，以便稍後設置拖曳事件
      if (groupIndex !== null) {
        container.sortButton = sortButton;
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
    let lastSelectedText = ''; // 記錄上次選中的文字
    
    const handleSelection = () => {
      try {
        const selectedText = textArea.value.substring(
          textArea.selectionStart,
          textArea.selectionEnd
        ).trim();

        // 🚫 防止重複處理相同的選中文字
        if (selectedText === lastSelectedText) {
          return;
        }
        
        LogUtils.important(`🎯 文本選取事件: 選取長度=${selectedText.length}, 內容="${selectedText}"`);
        lastSelectedText = selectedText;

        if (selectedText) {
          LogUtils.important(`✅ 設定主組文字: "${selectedText}"`);
          fromInput.value = selectedText;
          toInput.value = '';
          
          // 更新主組規則
          this._updateRule({ from: selectedText, to: '' }, 0, true);
          
          // 有選取文字時展開輸入框
          this._adjustInputWidth(fromInput);
          
          // 更新替換按鈕狀態
          updateButton();
          
          // 🚀 立即更新預覽，提供即時反饋
          this._updatePreviews();
          
        } else if (!selectedText && fromInput.value) {
          LogUtils.log(`🧹 清空主組內容`);
          // 當沒有選取文字且 fromInput 有值時清空
          fromInput.value = '';
          toInput.value = '';
          lastSelectedText = ''; // 重置記錄
          this._updateRule({ from: '', to: '' }, 0, true);
          
          // 清空時收合輸入框
          fromInput.style.cssText = `width: ${this.CONFIG.MIN_WIDTH}px !important;`;
          toInput.style.cssText = `width: ${this.CONFIG.MIN_WIDTH}px !important;`;
          
          // 清理主組的高亮預覽
          this.PreviewHighlight.clearGroupHighlights(0);
          
          // 更新替換按鈕狀態
          updateButton();
        }
      } catch (error) {
        LogUtils.error(`❌ 處理文本選取時出錯:`, error);
      }
    };

    // 🎯 簡化事件綁定，主要使用 selectionchange 事件
    document.addEventListener('selectionchange', () => {
      if (document.activeElement === textArea) {
        handleSelection();
      }
    });
    
    // 🔧 補充 mouseup 事件處理一些特殊情況
    textArea.addEventListener('mouseup', () => {
      // 稍微延遲，讓 selectionchange 先處理
      setTimeout(handleSelection, 10);
    });
    
    // 🎯 添加 click 事件，確保點擊時也會檢查選取狀態
    textArea.addEventListener('click', () => {
      setTimeout(handleSelection, 20);
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
      LogUtils.error(`❌ 替換錯誤:`, error);
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
    groupHighlights: new Map(), // 存儲每個組的高亮元素 Map<groupIndex, Map<key, element>>
    cachedGroupPositions: new Map(), // 🆕 獨立位置緩存 Map<groupIndex, positions[]>
    isCacheInitialized: false, // 🆕 緩存是否已初始化標記
    observer: null, // IntersectionObserver 實例
    _updateTimer: null, // 防抖計時器
    _isUpdating: false, // 🆕 防止重複調用標記

    initialize(textArea) {
      if (!textArea) return;
      
      this.container = document.createElement('div');
      this.container.id = ManualReplaceManager.CONFIG.PREVIEW_CONTAINER_ID;
      
      // 使用 TextHighlight 的樣式計算方法
      const styles = TextHighlight.PositionCalculator.getTextAreaStyles(textArea);
      
      // 獲取 textarea 的計算樣式和位置，使用和高亮容器相同的動態定位邏輯
      const textAreaStyles = window.getComputedStyle(textArea);
      const textAreaRect = textArea.getBoundingClientRect();
      const parentRect = textArea.parentElement.getBoundingClientRect();
      
      // 計算容器應該的精確位置（與 textarea 完全對齊）
      const containerTop = textAreaRect.top - parentRect.top;
      const containerLeft = textAreaRect.left - parentRect.left;
      
      // 使用動態計算的位置，而不是固定偏移
      this.container.style.cssText = `
        position: absolute;
        top: ${containerTop}px;
        left: ${containerLeft - 4}px;
        width: ${textArea.offsetWidth + 4}px;
        height: ${textArea.offsetHeight}px;
        pointer-events: none;
        z-index: 1001;
        overflow: hidden;
        font: ${styles.font};
        line-height: ${styles.lineHeight}px;
      `;
      
      textArea.parentElement.appendChild(this.container);
      
      // 使用 TextHighlight 的滾動處理器 - 滾動時使用輕量級更新
      TextHighlight.ScrollHelper.bindScrollEvent(
        textArea,
        () => this._updateScrollVisibility(textArea)
      );
      
      this._setupResizeObserver(textArea);
    },

    _setupResizeObserver(textArea) {
      let resizeTimeout;

      const updateAfterResize = () => {
        if (!textArea || !this.container) {
          LogUtils.error(`❌ 找不到必要元素`);
          return;
        }
        
        // 重新計算容器的精確位置（與resize後的textarea對齊）
        const textAreaRect = textArea.getBoundingClientRect();
        const parentRect = textArea.parentElement.getBoundingClientRect();
        const containerTop = textAreaRect.top - parentRect.top;
        const containerLeft = textAreaRect.left - parentRect.left;
        
        // 獲取新的尺寸
        const offsetWidth = textArea.offsetWidth;
        const offsetHeight = textArea.offsetHeight;
        
        // 更新容器位置和尺寸
        this.container.style.top = `${containerTop}px`;
        this.container.style.left = `${containerLeft - 4}px`;
        this.container.style.width = `${offsetWidth + 4}px`;
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
      // 🆕 防止重複調用
      if (this._isUpdating) {
        LogUtils.log(`正在更新中，跳過重複調用`);
        return;
      }
      
      this._isUpdating = true;
      
      try {
        // 🔍 統一緩存同步驗證 - 在處理所有組之前統一檢查
        const currentText = textArea.value;
        
        // 🆕 早期文本有效性檢查 - 避免對無效文本進行無意義處理
        if (!currentText || typeof currentText !== 'string' || currentText.length === 0) {
          LogUtils.log(`文本內容為空或無效，跳過處理`);
          
          // 清理現有高亮
          this.clearAllHighlights();
          
          // 標記緩存已初始化（空狀態也是有效狀態）
          this.isCacheInitialized = true;
          
          return;
        }
        
        // 🔥 強制性 DOM 同步 - 確保位置計算的 DOM 內容完全一致
        if (TextHighlight.PositionCalculator && TextHighlight.PositionCalculator.cache) {
          const cachedText = TextHighlight.PositionCalculator.cache.lastText || '';
          
          // 🆕 只在內容真正不同時才清理緩存，避免無用的清理
          if (cachedText !== currentText) {
            LogUtils.log(`🔄 文本內容變化，智能清理緩存`);
            // 智能清理緩存，避免重複操作
            ManualReplaceManager._smartCleanCaches();
          }
          
          // 多重強制同步策略
          if (TextHighlight.PositionCalculator.cache.div) {
            const div = TextHighlight.PositionCalculator.cache.div;
            
            // 1. 完全重置 div
            div.textContent = '';
            div.innerHTML = '';
            
            // 2. 強制瀏覽器重排
            div.offsetHeight;
            div.scrollTop;
            
            // 3. 分步設置內容，確保同步
            div.textContent = currentText;
            
            // 4. 再次強制重排並驗證
            div.offsetHeight;
            const verifyText = div.textContent || '';
            
            // 5. 如果同步失敗，重新創建 div
            if (verifyText.length !== currentText.length || verifyText !== currentText) {
              LogUtils.warn(`❌ DOM 同步失敗，重新創建計算容器`);
              
              // 移除舊的 div
              if (div.parentNode) {
                div.parentNode.removeChild(div);
              }
              
              // 重新創建 div 並設置樣式
              const newDiv = document.createElement('div');
              const styles = TextHighlight.PositionCalculator.getTextAreaStyles(textArea);
              newDiv.style.cssText = `
                position: absolute;
                visibility: hidden;
                pointer-events: none;
                white-space: pre-wrap;
                word-wrap: break-word;
                overflow-wrap: break-word;
                font: ${styles.font};
                line-height: ${styles.lineHeight}px;
                width: ${textArea.offsetWidth}px;
                height: auto;
                border: none;
                margin: 0;
                padding: ${styles.padding};
                left: -9999px;
                top: -9999px;
              `;
              
              // 添加到 DOM 並設置內容
              document.body.appendChild(newDiv);
              newDiv.textContent = currentText;
              
              // 強制重排並更新緩存
              newDiv.offsetHeight;
              TextHighlight.PositionCalculator.cache.div = newDiv;
            }
          }
          
          // 強制更新緩存狀態
          TextHighlight.PositionCalculator.cache.lastText = currentText;
          TextHighlight.PositionCalculator.cache.positions.clear();
        }

        const scrollTop = textArea.scrollTop;
        const scrollBottom = scrollTop + textArea.clientHeight;
        const bufferSize = 200;
        
        // 使用 SharedVirtualScroll 的多組更新方法
        const groupedPositions = new Map();
        
        // 清理所有組，再重新添加有內容的組
        const activeGroups = new Set();
        
        // 🎯 優先處理主組（索引 0）- 確保用戶選取的文字立即顯示
        if (ManualReplaceManager._rules.mainGroup?.from?.trim()) {
          LogUtils.log(`處理主組: "${ManualReplaceManager._rules.mainGroup.from}"`);
          const positions = this._getGroupPositions(textArea, ManualReplaceManager._rules.mainGroup.from, 0);
          if (positions && positions.length > 0) {
            groupedPositions.set(0, positions);
            activeGroups.add(0);
            LogUtils.log(`主組成功獲取 ${positions.length} 個位置`);
          } else {
            LogUtils.warn(`主組位置獲取失敗: "${ManualReplaceManager._rules.mainGroup.from}"`);
          }
        }
        
        // 然後處理額外組
        ManualReplaceManager._rules.extraGroups.forEach((rule, index) => {
          if (rule.from?.trim()) {
            const positions = this._getGroupPositions(textArea, rule.from, index + 1);
            if (positions && positions.length > 0) {
              groupedPositions.set(index + 1, positions);
              activeGroups.add(index + 1);
            }
          }
        });
        
        // 清理非活躍組的高亮
        this.groupHighlights.forEach((groupHighlightMap, groupIndex) => {
          if (!activeGroups.has(groupIndex)) {
            LogUtils.log(`清理非活躍組 ${groupIndex} 的高亮`);
            this.clearGroupHighlights(groupIndex);
          }
        });
        
        // 🆕 保存位置數據到獨立緩存並標記已初始化
        LogUtils.log(`保存 ${groupedPositions.size} 個組的位置數據到緩存`);
        this.cachedGroupPositions.clear();
        groupedPositions.forEach((positions, groupIndex) => {
          this.cachedGroupPositions.set(groupIndex, positions);
        });
        
        // 🆕 標記緩存已初始化（即使是空的也算已初始化）
        this.isCacheInitialized = true;

        // 使用 SharedVirtualScroll 更新可見性
        try {
          TextHighlight.SharedVirtualScroll.updateMultiGroupVirtualView({
            groupedPositions,
            groupHighlights: this.groupHighlights,
            visibleTop: scrollTop - bufferSize,
            visibleBottom: scrollBottom + bufferSize,
            scrollTop,
            createHighlight: (pos) => {
              const element = TextHighlight.Renderer.createPreviewHighlight(
                pos.position,
                pos.position.width,
                pos.lineHeight,
                pos.color
              );
              // 🔗 存儲位置數據供滾動時重用
              element.positionData = pos;
              return element;
            },
            container: this.container,
            highlightClass: 'replace-preview-highlight'
          });
        } catch (error) {
          LogUtils.error(`❌ 虛擬滾動更新失敗:`, error);
        }
      } finally {
        // 🆕 重置更新標記
        this._isUpdating = false;
      }
    },

    // 🚀 輕量級滾動更新 - 專門用於滾動時的性能優化
    _updateScrollVisibility(textArea) {
      // 🆕 防止重複調用
      if (this._isUpdating) {
        return;
      }
      
      // 滾動時只更新可見性，不重新計算位置
      const scrollTop = textArea.scrollTop;
      const scrollBottom = scrollTop + textArea.clientHeight;
      const bufferSize = 200;
      
      // 🆕 修復判斷邏輯：只有在緩存未初始化時才回退到完整更新
      if (!this.isCacheInitialized) {
        LogUtils.log(`緩存未初始化，執行首次完整更新`);
        this._updateVirtualScrolling(textArea);
        return;
      }
      
      // 🆕 直接從獨立緩存獲取位置數據（不依賴DOM元素）
      const groupedPositions = new Map();
      
      // 複製緩存的位置數據
      this.cachedGroupPositions.forEach((positions, groupIndex) => {
        if (positions && positions.length > 0) {
          groupedPositions.set(groupIndex, positions);
        }
      });
      
      // 🆕 即使緩存為空也是正常狀態，不需要回退到完整更新
      LogUtils.log(`快速滾動更新: ${groupedPositions.size} 個組，共 ${Array.from(groupedPositions.values()).reduce((sum, positions) => sum + positions.length, 0)} 個位置`);
      
      // 使用 SharedVirtualScroll 僅更新可見性
      try {
        TextHighlight.SharedVirtualScroll.updateMultiGroupVirtualView({
          groupedPositions,
          groupHighlights: this.groupHighlights,
          visibleTop: scrollTop - bufferSize,
          visibleBottom: scrollBottom + bufferSize,
          scrollTop,
          createHighlight: (pos) => {
            const element = TextHighlight.Renderer.createPreviewHighlight(
              pos.position,
              pos.position.width,
              pos.lineHeight,
              pos.color
            );
            // 🔗 存儲位置數據供滾動時重用
            element.positionData = pos;
            return element;
          },
          container: this.container,
          highlightClass: 'replace-preview-highlight'
        });
      } catch (error) {
        LogUtils.error(`❌ 快速滾動更新失敗:`, error);
        // 🆕 發生錯誤時重置緩存狀態，下次會完整更新
        this.isCacheInitialized = false;
      }
    },

    // 新增：獲取組的位置數據的輔助方法
    _getGroupPositions(textArea, searchText, groupIndex) {
      try {
        // 確保獲取最新的文本內容
        const text = textArea.value;
        
        // 驗證文本合法性 - 🆕 降低日誌級別，避免控制台污染
        if (!text || typeof text !== 'string') {
          // 只在調試模式下輸出，避免正常使用時的控制台污染
          LogUtils.log(`文本內容無效，組 ${groupIndex}`);
          return [];
        }
        
        // 驗證搜尋文字
        if (!searchText || !searchText.trim()) {
          // 搜尋文字為空是正常情況，不需要輸出日誌
          return [];
        }
        
        // 創建正則表達式並查找匹配
        let regex, matches;
        try {
          regex = RegexHelper.createRegex(searchText);
          matches = Array.from(text.matchAll(regex));
        } catch (regexError) {
          LogUtils.error(`❌ 正則表達式創建失敗，組 ${groupIndex}:`, regexError);
          LogUtils.error(`問題文字: "${searchText}"`);
          return [];
        }
        
        if (matches.length === 0) {
          return [];
        }

        // 檢查匹配數量是否超過上限
        if (matches.length > ManualReplaceManager.CONFIG.MAX_PREVIEWS) {
          LogUtils.warn(`組 ${groupIndex} 匹配數量 ${matches.length} 超過上限，截取到 ${ManualReplaceManager.CONFIG.MAX_PREVIEWS}`);
          matches.length = ManualReplaceManager.CONFIG.MAX_PREVIEWS;
        }

        // 使用 TextHighlight 的樣式計算方法
        const styles = TextHighlight.PositionCalculator.getTextAreaStyles(textArea);
        const color = ManualReplaceManager.CONFIG.PREVIEW_COLORS[
          groupIndex % ManualReplaceManager.CONFIG.PREVIEW_COLORS.length
        ];

        // 收集所有位置信息
        const positions = [];
        let successCount = 0;
        let failCount = 0;
        
              // 🔍 預先驗證 DOM 同步狀態，確保 DOM 容器存在
      let domContentLength = 0;
      
      // 🆕 主動確保 DOM 容器存在
      if (!TextHighlight.PositionCalculator || !TextHighlight.PositionCalculator.cache || !TextHighlight.PositionCalculator.cache.div) {
        LogUtils.log(`組 ${groupIndex} DOM 容器不存在，主動初始化`);
        
        // 主動觸發 DOM 容器創建：調用一次位置計算來初始化容器
        if (text.length > 0 && TextHighlight.PositionCalculator && TextHighlight.PositionCalculator.calculatePosition) {
          try {
            // 使用文本的第一個字符來觸發容器創建
            const firstChar = text.charAt(0);
            TextHighlight.PositionCalculator.calculatePosition(textArea, 0, text, firstChar, styles);
            LogUtils.log(`組 ${groupIndex} DOM 容器已成功初始化`);
          } catch (initError) {
            LogUtils.error(`❌ 組 ${groupIndex} DOM 容器初始化失敗:`, initError);
            return [];
          }
        } else {
          LogUtils.error(`❌ 組 ${groupIndex} 無法初始化 DOM 容器（文本為空或缺少依賴）`);
          return [];
        }
      }
      
      // 再次檢查 DOM 容器是否存在
      if (TextHighlight.PositionCalculator && TextHighlight.PositionCalculator.cache && TextHighlight.PositionCalculator.cache.div) {
        const divText = TextHighlight.PositionCalculator.cache.div.textContent || '';
        domContentLength = divText.length;
        
        if (domContentLength !== text.length) {
          LogUtils.error(`❌ 組 ${groupIndex} DOM 內容與文本不同步！DOM: ${domContentLength}, Text: ${text.length}`);
          return [];
        }
      } else {
        LogUtils.error(`❌ 組 ${groupIndex} DOM 容器初始化後仍然找不到`);
        return [];
      }
        
        for (let i = 0; i < matches.length; i++) {
          const match = matches[i];
          
          // 🔥 加強邊界檢查：多重驗證
          if (match.index < 0 || match.index >= text.length) {
            LogUtils.warn(`組 ${groupIndex} 跳過無效匹配索引: ${match.index}, 文本長度: ${text.length}`);
            failCount++;
            continue;
          }
          
          // 檢查匹配文本的結束位置
          const endIndex = match.index + match[0].length;
          if (endIndex > text.length) {
            LogUtils.warn(`組 ${groupIndex} 跳過無效匹配結束位置: ${endIndex}, 文本長度: ${text.length}`);
            failCount++;
            continue;
          }
          
          // 🆕 檢查索引是否在 DOM 範圍內
          if (match.index >= domContentLength) {
            LogUtils.warn(`組 ${groupIndex} 跳過超出 DOM 範圍的匹配: index=${match.index}, DOM長度=${domContentLength}`);
            failCount++;
            continue;
          }
          
          // 🆕 檢查結束位置是否在 DOM 範圍內
          if (endIndex > domContentLength) {
            LogUtils.warn(`組 ${groupIndex} 跳過超出 DOM 範圍的匹配結束位置: endIndex=${endIndex}, DOM長度=${domContentLength}`);
            failCount++;
            continue;
          }
          
          // 🆕 檢查匹配的字符是否一致
          const textSubstring = text.substring(match.index, endIndex);
          if (textSubstring !== match[0]) {
            LogUtils.warn(`組 ${groupIndex} 匹配內容不一致: 期望="${match[0]}", 實際="${textSubstring}"`);
            failCount++;
            continue;
          }
          

          
          try {
            const positionList = TextHighlight.PositionCalculator.calculatePosition(
              textArea,
              match.index,
              text,
              match[0],
              styles
            );
            
            if (positionList && positionList.length > 0) {
              positionList.forEach(position => {
                positions.push({
                  position: {
                    ...position,
                    text: match[0],
                    width: position.width
                  },
                  color,
                  targetWord: searchText,
                  lineHeight: styles.lineHeight
                });
              });
              successCount++;
            } else {
              LogUtils.warn(`組 ${groupIndex} 匹配 ${i} 位置計算失敗`);
              failCount++;
            }
          } catch (posError) {
            LogUtils.error(`❌ 組 ${groupIndex} 匹配 ${i} 位置計算出錯:`, posError);
            LogUtils.error(`錯誤詳情: index=${match.index}, text="${match[0]}", textLength=${text.length}, domLength=${domContentLength}`);
            failCount++;
          }
        }

        return positions;
        
      } catch (error) {
        LogUtils.error(`❌ 組 ${groupIndex} 獲取位置數據失敗:`, error);
        LogUtils.error(`詳細信息: 搜尋文字="${searchText}", 文本長度=${textArea.value?.length || 'undefined'}`);
        return [];
      }
    },

    updatePreview(textArea, searchText, groupIndex) {
      LogUtils.log(`updatePreview 被調用: 組 ${groupIndex}, 搜尋文字: "${searchText}"`);
      
      if (!searchText || !searchText.trim()) {
        LogUtils.log(`清理組 ${groupIndex} 高亮（搜尋文字為空）`);
        this.clearGroupHighlights(groupIndex);
        return;
      }

      // 清除現有的防抖計時器
      if (this._updateTimer) {
        clearTimeout(this._updateTimer);
      }
      
      // 🎯 主組（用戶選取的文字）立即更新，不使用防抖
      if (groupIndex === 0) {
        LogUtils.log(`主組立即更新高亮`);
        this._updateVirtualScrolling(textArea);
        return;
      }
      
      // 其他組使用防抖機制，避免頻繁更新
      LogUtils.log(`組 ${groupIndex} 使用防抖更新（16ms 延遲）`);
      this._updateTimer = setTimeout(() => {
        LogUtils.log(`執行防抖更新: 組 ${groupIndex}`);
        this._updateVirtualScrolling(textArea);
      }, 16); // 約60fps的更新頻率
    },

    clearGroupHighlights(groupIndex) {
      // 使用 SharedVirtualScroll 的清理方法
      TextHighlight.SharedVirtualScroll.clearGroupHighlights(
        groupIndex, 
        this.groupHighlights, 
        this.observer
      );
      
      // 🆕 同時清理該組的位置緩存
      this.cachedGroupPositions.delete(groupIndex);
      LogUtils.log(`清理組 ${groupIndex} 的位置緩存`);
    },

    clearAllHighlights() {
      // 使用 SharedVirtualScroll 的清理方法
      TextHighlight.SharedVirtualScroll.clearAllGroupHighlights(
        this.groupHighlights, 
        this.observer
      );
      
      // 🆕 同時清理所有位置緩存並重置初始化狀態
      this.cachedGroupPositions.clear();
      this.isCacheInitialized = false; // 🆕 重置初始化狀態
      LogUtils.log(`清理所有組的位置緩存並重置狀態`);
    }
  },

  /** 預覽更新方法 */
  _updatePreviews() {
    const textArea = document.querySelector('textarea[name="content"]');
    if (!textArea) return;

    // 直接觸發虛擬滾動更新，這會一次性處理所有組的預覽
    this.PreviewHighlight._updateVirtualScrolling(textArea);
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
      () => LogUtils.log(`手動替換規則已保存`)
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
    let lastLength = textArea.value.length;
    let lastHash = this._hashText(textArea.value);
    let isProcessing = false; // 🆕 防止重複處理
    
    const checkValue = () => {
      // 🆕 如果正在處理中，跳過此次檢查
      if (isProcessing) {
        requestAnimationFrame(checkValue);
        return;
      }
      
      const currentValue = textArea.value;
      const currentLength = currentValue.length;
      const currentHash = this._hashText(currentValue);
      
      if (currentValue !== lastValue || currentLength !== lastLength || currentHash !== lastHash) {
        LogUtils.important(`📝 文本變化: ${lastLength} → ${currentLength} 字符`);
        
        isProcessing = true; // 🆕 標記正在處理
        
        // 🧹 優化：只清理必要的緩存，避免重複調用
        this._smartCleanCaches();
        
        lastValue = currentValue;
        lastLength = currentLength;
        lastHash = currentHash;
        
        // 🆕 使用防抖機制，避免過於頻繁更新
        setTimeout(() => {
          this._updatePreviews();
          isProcessing = false; // 🆕 處理完成，重置標記
        }, 50); // 🆕 增加防抖延遲
      }
      
      // 🆕 減少檢查頻率，避免過度消耗資源
      setTimeout(() => {
        requestAnimationFrame(checkValue);
      }, 16); // 🆕 約60fps的檢查頻率
    };
    checkValue();
  },

  /** 🆕 智能清理緩存 - 避免重複清理 */
  _smartCleanCaches() {
    // 清理位置計算器緩存
    if (TextHighlight.PositionCalculator && TextHighlight.PositionCalculator.cache) {
      TextHighlight.PositionCalculator.cache.lastText = '';
      TextHighlight.PositionCalculator.cache.positions.clear();
      
      // 強制重置 div 內容
      if (TextHighlight.PositionCalculator.cache.div) {
        TextHighlight.PositionCalculator.cache.div.textContent = '';
      }
    }
    
    // 清理全局位置緩存
    if (TextHighlight.GlobalPositionCache && TextHighlight.GlobalPositionCache.clear) {
      TextHighlight.GlobalPositionCache.clear();
    }
    
    // 🆕 清理獨立位置緩存並重置初始化狀態
    this.PreviewHighlight.cachedGroupPositions.clear();
    this.PreviewHighlight.isCacheInitialized = false; // 🆕 重置初始化狀態
    LogUtils.log(`智能清理獨立位置緩存並重置狀態`);
    
    // 🆕 直接清理高亮元素，不再通過其他方法
    TextHighlight.SharedVirtualScroll.clearAllGroupHighlights(
      this.PreviewHighlight.groupHighlights, 
      this.PreviewHighlight.observer
    );
  },

  /** 強制清理所有緩存 - 🔧 優化版本，避免重複調用 */
  _forceCleanAllCaches() {
    // 🆕 直接調用智能清理，避免重複
    this._smartCleanCaches();
  },

  /** 計算文本簡單哈希 */
  _hashText(text) {
    if (!text) return '';
    let hash = 0;
    for (let i = 0; i < Math.min(text.length, 100); i++) {
      const char = text.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // 轉為32位整數
    }
    return hash.toString();
  },

  /** 清理資源 */
  cleanup() {
    this.PreviewHighlight.clearAllHighlights();
    if (this.PreviewHighlight.container) {
      this.PreviewHighlight.container.remove();
    }
    // 清理防抖計時器
    if (this.PreviewHighlight._updateTimer) {
      clearTimeout(this.PreviewHighlight._updateTimer);
      this.PreviewHighlight._updateTimer = null;
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

    // 為主組輸入框設定較小的最大寬度
    const isMainGroup = input.closest('.replace-main-group');
    const maxWidth = isMainGroup ? this.CONFIG.MAIN_GROUP_MAX_WIDTH : this.CONFIG.MAX_WIDTH;

    const width = Math.min(
      Math.max(this.CONFIG.MIN_WIDTH, span.offsetWidth + this.CONFIG.PADDING),
      maxWidth
    );
    input.style.cssText = `width: ${width}px !important;`;

    span.remove();
  },

  /** 檢查並強制更新高亮 */
  checkAndForceUpdateHighlights() {
    const textArea = document.querySelector('textarea[name="content"]');
    
    // 🆕 檢查文本有效性，避免在無效文本時進行無意義的處理
    if (!textArea || !textArea.value || typeof textArea.value !== 'string' || textArea.value.length === 0) {
      LogUtils.log(`文本無效，跳過強制更新高亮`);
      return;
    }
    
    const highlights = document.querySelectorAll('.replace-preview-highlight');
    const totalHighlights = highlights.length;
    const visibleHighlights = Array.from(highlights).filter(h => 
      h.style.display !== 'none' && 
      parseFloat(h.style.width) > 0
    ).length;

    if (visibleHighlights === 0 && totalHighlights === 0) {
      this._updatePreviews();
    }
  },

  /** 開始定期檢查高亮 */
  startHighlightCheck() {
    // 在前幾秒多檢查
    const checkTimes = [100, 500, 1000, 2000];
    checkTimes.forEach(delay => {
      setTimeout(() => {
        this.checkAndForceUpdateHighlights();
      }, delay);
    });
  },

  /** 設置排序拖移事件 */
  _setupSortDragEvents(button) {
    // 獲取組元素和容器
    const group = button.closest('.replace-extra-group');
    if (!group) return;
    
    const container = group.parentElement;
    if (!container) {
      LogUtils.error(`❌ 無法找到替換組的父容器`);
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
      if (container.sortButton) {
        this._setupSortDragEvents(container.sortButton);
      }
    });
  },

  /**
   * 從存儲刷新替換組UI
   * 用於同步後更新UI，保持主組不變，重新創建額外組
   */
  refreshFromStorage() {
    // 🆕 防重複調用機制：如果正在刷新中，跳過此次調用
    if (this._refreshInProgress) {
      LogUtils.log(`UI刷新已在進行中，跳過此次調用`);
      return;
    }
    
    this._refreshInProgress = true;
    LogUtils.log(`從存儲刷新替換組UI`);
    
    const textArea = document.querySelector('textarea[name="content"]');
    const manualContainer = document.querySelector('.manual-replace-container');
    
    if (!textArea || !manualContainer) {
      LogUtils.log(`找不到必要的DOM元素，跳過刷新`);
      this._refreshInProgress = false; // 重置標記
      return;
    }

    // 清除所有現有的額外組
    const existingGroups = manualContainer.querySelectorAll('.replace-extra-group');
    existingGroups.forEach(group => group.remove());
    
    // 清除舊的高亮
    this.PreviewHighlight.clearAllHighlights();

    // 從存儲重新載入規則
    const storageKey = 'replace_' + this.CONFIG.MANUAL_REPLACE_KEY;
    window.ReplaceManager.StorageHelper.loadRules(storageKey, [], (rules) => {
      LogUtils.log(`從存儲載入的規則:`, rules);
      
      // 過濾掉空組
      const filteredRules = rules.filter(rule => rule.from?.trim() || rule.to?.trim());
      LogUtils.log(`過濾後的規則:`, filteredRules);
      
      // 如果沒有規則，創建一個空的預設規則
      const finalRules = filteredRules.length > 0 ? filteredRules : [{ from: '', to: '' }];
      
      // 重新創建額外組
      finalRules.forEach((rule, index) => {
        const group = this.createReplaceGroup(textArea, false, rule, index);
        manualContainer.appendChild(group);
      });

      // 更新內部規則狀態
      this._rules.extraGroups = finalRules;

      // 重新設置拖曳事件
      requestAnimationFrame(() => {
        this._setupAllSortDragEvents();
        
        // 更新預覽（延遲一點讓DOM完全更新）
        setTimeout(() => {
          this._updatePreviews();
          LogUtils.important(`✅ 替換組UI刷新完成`);
          
          // 🆕 重置刷新標記，允許後續刷新
          this._refreshInProgress = false;
        }, 100);
      });
    });
  },

  /**
   * 檢查是否需要刷新UI
   * @param {string[]} changedKeys - 變化的設定鍵值
   * @returns {boolean} - 是否需要刷新
   */
  shouldRefresh(changedKeys) {
    // 檢查是否包含手動替換相關的鍵值
    const relevantKeys = [
      'manualReplaceRules',
      'replace_manualReplaceRules'
    ];
    
    return changedKeys.some(key => relevantKeys.includes(key));
  },
};

window.ManualReplaceManager = ManualReplaceManager; 