/** 手動替換管理模組 */
const ManualReplaceManager = {
  CONFIG: {
    MIN_WIDTH: 80, // 最小寬度
    MAX_WIDTH: 300, // 最大寬度
    PADDING: 24, // 內邊距
    MANUAL_REPLACE_KEY: 'manualReplaceRules', // 儲存鍵名稱
    PREVIEW_COLORS: [
      '#FF0000', // 鮮紅色
      '#FFA500', // 橙色
      '#6565ff', // 藍色
      '#FF00FF', // 洋紅色
      '#00AF06', // 綠色 (rgb(0, 175, 6))
      '#9932CC', // 深紫色
      '#FF1493', // 深粉色
      '#32CD32', // 檸檬綠
      '#FF8C00'  // 深橙色
    ],
    PREVIEW_CONTAINER_ID: 'replace-preview-container'
  },

  // 添加 PreviewHighlight 物件
  PreviewHighlight: {
    container: null,
    highlightGroups: new Map(),
    scrollThrottleTimer: null,
    
    CONFIG: {
      MAX_PREVIEWS: 200,  // 限制最大預覽數
      VIRTUAL_BUFFER: 500,  // 虛擬滾動緩衝區
      // 預編譯的樣式模板
      STYLE_TEMPLATE: (position, color, scrollTop, styles) => `
        position: absolute;
        left: ${position.left - 1}px;
        top: ${position.top}px;
        width: ${position.width + 3}px;
        height: ${styles.lineHeight}px;
        border-color: ${color};
        background-color: transparent;
        pointer-events: none;
        will-change: transform;
        transform: translate3d(0, ${-scrollTop}px, 0);
        z-index: 1001;
      `
    },

    initialize(textArea) {
      if (!textArea) {
        console.error('初始化預覽高亮失敗：未找到文本區域');
        return;
      }
      
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
        will-change: transform;
        transform: translate3d(0, 0, 0);
      `;
      textArea.parentElement.appendChild(this.container);
      this.setupScrollHandler(textArea);
    },

    setupScrollHandler(textArea) {
      let rafId = null;
      let lastScrollTop = textArea.scrollTop;
      
      textArea.addEventListener('scroll', () => {
        if (rafId) return;
        
        rafId = requestAnimationFrame(() => {
          rafId = null;
          const currentScrollTop = textArea.scrollTop;
          const scrollDiff = Math.abs(currentScrollTop - lastScrollTop);
          
          // 只有滾動超過一定距離才更新
          if (scrollDiff > 10) {
            this.updateHighlightsPosition(currentScrollTop);
            lastScrollTop = currentScrollTop;
          }
        });
      });
    },

    updateHighlightsPosition(scrollTop) {
      const visibleRange = this.getVisibleRange();
      const updates = [];

      this.highlightGroups.forEach((highlights) => {
        highlights.forEach(highlight => {
          const originalTop = parseFloat(highlight.dataset.originalTop);
          
          if (originalTop >= visibleRange.top - 500 && 
              originalTop <= visibleRange.bottom + 500) {
            highlight.style.transform = `translate3d(0, ${-scrollTop}px, 0)`;
            updates.push(highlight);
          } else {
            highlight.style.display = 'none';
          }
        });
      });

      // 批量更新
      requestAnimationFrame(() => {
        updates.forEach(highlight => {
          highlight.style.display = 'block';
        });
      });
    },

    getVisibleRange() {
      const textArea = document.querySelector('textarea[name="content"]');
      if (!textArea) return { top: 0, bottom: 0 };
      
      const scrollTop = textArea.scrollTop;
      return {
        top: scrollTop,
        bottom: scrollTop + textArea.clientHeight
      };
    },

    updatePreview(textArea, searchText, groupIndex) {
      if (!searchText.trim() || !textArea) {
        this.clearGroupHighlights(groupIndex);
        return;
      }

      try {
        const text = textArea.value;
        const regex = ManualReplaceManager.createRegex(searchText);
        const matches = Array.from(text.matchAll(regex))
          .slice(0, this.CONFIG.MAX_PREVIEWS);
        
        if (matches.length === 0) {
          this.clearGroupHighlights(groupIndex);
          return;
        }

        const styles = TextHighlight.PositionCalculator.getTextAreaStyles(textArea);
        const color = ManualReplaceManager.CONFIG.PREVIEW_COLORS[groupIndex % ManualReplaceManager.CONFIG.PREVIEW_COLORS.length];
        
        this.clearGroupHighlights(groupIndex);

        const visibleRange = this.getVisibleRange();
        const visibleMatches = matches.filter(match => {
          const position = TextHighlight.PositionCalculator.calculatePosition(
            textArea, match.index, text, match[0], styles
          );
          return position && 
            position.top >= visibleRange.top - this.CONFIG.VIRTUAL_BUFFER &&
            position.top <= visibleRange.bottom + this.CONFIG.VIRTUAL_BUFFER;
        });

        const fragment = document.createDocumentFragment();
        const newHighlights = [];
        
        visibleMatches.forEach(match => {
          const position = TextHighlight.PositionCalculator.calculatePosition(
            textArea, match.index, text, match[0], styles
          );
          
          if (position) {
            const highlight = document.createElement('div');
            highlight.className = 'replace-preview-highlight';
            
            // 使用預編譯的樣式模板
            highlight.style.cssText = this.CONFIG.STYLE_TEMPLATE(
              position, color, textArea.scrollTop, styles
            );
            
            highlight.dataset.originalTop = position.top;
            highlight.dataset.groupIndex = groupIndex;
            
            fragment.appendChild(highlight);
            newHighlights.push(highlight);
          }
        });

        // 批量添加
        requestAnimationFrame(() => {
          this.container.appendChild(fragment);
          this.highlightGroups.set(groupIndex, newHighlights);
        });

      } catch (error) {
        console.error('預覽更新失敗:', error);
      }
    },

    // 添加清除方法
    clearGroupHighlights(groupIndex) {
      const highlights = this.highlightGroups.get(groupIndex) || [];
      const count = highlights.length;
      highlights.forEach(h => h.remove());
      this.highlightGroups.set(groupIndex, []);
      if (count > 0) {
        console.log(`替換預覽：清除第 ${groupIndex} 組的 ${count} 個高亮`);
      }
    },

    clearAllHighlights() {
      let totalCount = 0;
      this.highlightGroups.forEach((highlights, groupIndex) => {
        totalCount += highlights.length;
        this.clearGroupHighlights(groupIndex);
      });
      this.highlightGroups.clear();
      if (totalCount > 0) {
        console.log(`替換預覽：清除所有高亮，共 ${totalCount} 個`);
      }
    }
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
      
      // 修改為雙擊事件
      let lastClickTime = 0;
      removeButton.addEventListener('click', (e) => {
        const currentTime = new Date().getTime();
        const timeDiff = currentTime - lastClickTime;
        
        if (timeDiff < 300) { // 300毫秒內的雙擊
          removeCallback();
        }
        
        lastClickTime = currentTime;
      });
      
      container.appendChild(removeButton);

      return container;
    },

    /** 創建預覽容器 */
    createPreviewContainer(textArea) {
      const container = document.createElement('div');
      container.id = this.CONFIG.PREVIEW_CONTAINER_ID;
      container.style.cssText = `
        position: absolute;
        top: ${TextHighlight.CONFIG.FIXED_OFFSET.TOP}px;
        left: 0;
        width: ${textArea.offsetWidth}px;
        height: ${textArea.offsetHeight}px;
        pointer-events: none;
        z-index: 999;
        overflow: hidden;
      `;
      textArea.parentElement.appendChild(container);
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
      
      // 獲取當前組的索引
      const allGroups = Array.from(document.querySelectorAll('.replace-main-group, .replace-extra-group'));
      const groupIndex = allGroups.indexOf(group);
      
      if (groups.length === 1) {
        // 如果是最後一個組，清空輸入框
        const inputs = group.querySelectorAll('input[type="text"]');
        inputs.forEach(input => input.value = '');
        group.querySelector('.replace-button').textContent = '替換';
        group.querySelector('.replace-button').classList.add('disabled');
        
        // 清除該組的預覽高亮
        ManualReplaceManager.PreviewHighlight.clearGroupHighlights(groupIndex);
      } else {
        // 清除該組的預覽高亮
        ManualReplaceManager.PreviewHighlight.clearGroupHighlights(groupIndex);
        group.remove();
        
        // 更新所有剩餘組的預覽（因為索引會改變）
        requestAnimationFrame(() => {
          ManualReplaceManager.updateAllPreviews(document.querySelector('textarea[name="content"]'));
        });
      }
      
      ManualReplaceManager.saveReplaceRules(container);
    }
  },

  /** 創建替換組 */
  createReplaceGroup(textArea, isMainGroup = false, initialData = null) {
    console.log('創建替換組:', isMainGroup ? '主組' : '其他組', '初始數據:', initialData);
    
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
        console.log('設置初始數據 - 其他組:', !isMainGroup);
        fromInput.value = initialData.from || '';
        toInput.value = initialData.to || '';
        if (!isMainGroup) {
            console.log('設置其他組初始寬度為最小值:', this.CONFIG.MIN_WIDTH);
            fromInput.style.cssText = `width: ${this.CONFIG.MIN_WIDTH}px !important;`;
            toInput.style.cssText = `width: ${this.CONFIG.MIN_WIDTH}px !important;`;
        } else {
            console.log('主組保持原有邏輯');
            this.adjustInputWidth(fromInput);
            this.adjustInputWidth(toInput);
        }
        this.updateButtonState(fromInput.value, textArea.value, replaceButton);
    } else {
        console.log('沒有初始數據，是否為其他組:', !isMainGroup);
        if (!isMainGroup) {
            console.log('設置其他組初始寬度為最小值:', this.CONFIG.MIN_WIDTH);
            fromInput.style.cssText = `width: ${this.CONFIG.MIN_WIDTH}px !important;`;
            toInput.style.cssText = `width: ${this.CONFIG.MIN_WIDTH}px !important;`;
        }
    }

    this.setupGroupEvents(group, textArea, fromInput, toInput, replaceButton, isMainGroup);

    group.appendChild(fromInput);
    group.appendChild(toInput);
    group.appendChild(replaceButton);

    return group;
  },

  /** 設置組事件 */
  setupGroupEvents(group, textArea, fromInput, toInput, replaceButton, isMainGroup) {
    window.ReplaceManager.setupGroupEvents(group, textArea, fromInput, toInput, null, {
      isManual: true,
      onInputChange: (input) => {
        // 只有在主組或有焦點時才調整寬度
        if (isMainGroup || document.activeElement === input) {
          this.adjustInputWidth(input);
        }
        
        this.updateButtonState(fromInput.value, textArea.value, replaceButton);
        
        // 更新預覽
        let groupIndex = 0;
        if (group.parentElement) {
          const allGroups = Array.from(document.querySelectorAll('.replace-main-group, .replace-extra-group'));
          groupIndex = allGroups.indexOf(group);
          if (groupIndex === -1) groupIndex = 0;
        }
        
        this.PreviewHighlight.updatePreview(textArea, fromInput.value, groupIndex);
      },
      onRulesSave: (container) => {
        if (!isMainGroup) {
          this.saveReplaceRules(container);
        }
      }
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

      textArea.addEventListener('blur', () => {
        this.handleTextSelection(textArea, fromInput, toInput);
      });
    }

    // 如果不是主組，添加焦點事件
    if (!isMainGroup) {
      [fromInput, toInput].forEach(input => {
        // 獲得焦點時展開
        input.addEventListener('focus', () => {
          this.adjustInputWidth(input);
        });
        
        // 失去焦點時縮小
        input.addEventListener('blur', () => {
          input.style.cssText = `width: ${this.CONFIG.MIN_WIDTH}px !important;`;
        });
      });
    }

    // 替換按鈕點擊事件
    replaceButton.addEventListener('click', () => {
      this.executeReplace(textArea, fromInput.value, toInput.value, replaceButton);
    });

    // 如果有初始值，等待 DOM 更新後再觸發 handleInput
    if (fromInput.value.trim()) {
      requestAnimationFrame(() => {
        if (!isMainGroup) {
          console.log('其他組的初始值觸發 handleInput');
        }
        fromInput.dispatchEvent(new Event('input'));
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
    console.log('adjustInputWidth 被調用 - 當前值:', input.value);
    const text = input.value;
    if (!text) {
      console.log('文字為空，設置最小寬度');
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

  /** 更所有按鈕狀態 */
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
      // 保存當前游標位置
      const selectionStart = textArea.selectionStart;
      const selectionEnd = textArea.selectionEnd;

      const regex = this.createRegex(fromText);
      const newText = textArea.value.replace(regex, toText);

      if (newText !== textArea.value) {
        textArea.value = newText;
        textArea.dispatchEvent(new Event('input', { bubbles: true }));
        
        // 恢復游標位置
        textArea.setSelectionRange(selectionStart, selectionEnd);
        
        // 更新按鈕狀態
        this.updateButtonState(fromText, newText, button);

        // 找到當前組的索引並清除其預覽
        const group = button.closest('.replace-main-group, .replace-extra-group');
        if (group) {
          const allGroups = Array.from(document.querySelectorAll('.replace-main-group, .replace-extra-group'));
          const groupIndex = allGroups.indexOf(group);
          if (groupIndex !== -1) {
            console.log(`清除第 ${groupIndex} 組的預覽`);
            this.PreviewHighlight.clearGroupHighlights(groupIndex);
          }
        }
      }
    } catch (error) {
      console.error('替換錯誤:', error);
    }
  },

  /** 創建正則表達式 */
  createRegex(text) {
    return RegexHelper.createRegex(text);
  },

  /** 初始化手動替換組 */
  initializeManualGroups(mainContainer, otherContainer, textArea) {
    console.log('初始化手動替換組，使用存儲鍵名:', 'replace_' + this.CONFIG.MANUAL_REPLACE_KEY);
    
    window.ReplaceManager.initializeReplaceGroups({
      mainContainer,
      otherContainer,
      textArea,
      storageKey: 'replace_' + this.CONFIG.MANUAL_REPLACE_KEY,
      createGroupFn: this.createReplaceGroup.bind(this),
      onInitialized: () => {
        this.setupTextAreaChangeListener(textArea);
        this.startHighlightCheck();
      },
      isManual: true
    });
  },

  /** 檢查並強制更新高亮 */
  checkAndForceUpdateHighlights() {
    console.log('檢查高亮顯示狀態');
    const highlights = document.querySelectorAll('.replace-preview-highlight');
    const hasValidHighlights = Array.from(highlights).some(h => 
      h.style.display !== 'none' && 
      parseFloat(h.style.width) > 0
    );

    if (!hasValidHighlights) {
      console.log('未檢測到有效高亮，強制更新');
      const textArea = document.querySelector('textarea[name="content"]');
      if (textArea) {
        this.updateAllPreviews(textArea);
      }
    } else {
      console.log('高亮顯示正常');
    }
  },

  /** 開始定期檢查高亮 */
  startHighlightCheck() {
    // 在前幾秒多次檢查
    const checkTimes = [100, 500, 1000, 2000];
    checkTimes.forEach(delay => {
      setTimeout(() => {
        this.checkAndForceUpdateHighlights();
      }, delay);
    });
  },

  /** 設置文本區域變化監聽器 */
  setupTextAreaChangeListener(textArea) {
    console.log('設置文本變化監聽器');
    
    // 使用 requestAnimationFrame 來做輪詢
    let lastValue = textArea.value;
    let rafId;

    const checkValue = () => {
      if (textArea.value !== lastValue) {
        console.log('檢測到文本變化');
        lastValue = textArea.value;
        this.updateAllPreviews(textArea);
      }
      rafId = requestAnimationFrame(checkValue);
    };
    
    checkValue();
    console.log('開始監聽文本變化');

    // 添加到 textArea 以便清理
    textArea._previewRafId = rafId;

    // 監聽滾動事件
    textArea.addEventListener('scroll', () => {
      requestAnimationFrame(() => {
        console.log('文本區域滾動，更新高亮位置');
        this.PreviewHighlight.updateHighlightsPosition(textArea.scrollTop);
      });
    });

    // 監聽視窗大小變化
    const resizeObserver = new ResizeObserver(() => {
      console.log('視窗大小變化，更新所有預覽');
      this.updateAllPreviews(textArea);
    });
    resizeObserver.observe(textArea);

    // 保存 observer 以便清理
    textArea._previewResizeObserver = resizeObserver;
  },

  /** 更新所有預覽 */
  updateAllPreviews(textArea) {
    console.log('開始更新所有預覽');
    const allGroups = document.querySelectorAll('.replace-main-group, .replace-extra-group');
    allGroups.forEach((group, index) => {
      const fromInput = group.querySelector('input[type="text"]:first-child');
      if (fromInput && fromInput.value.trim()) {
        console.log(`更新第 ${index} 組預覽，搜索文字: ${fromInput.value}`);
        this.PreviewHighlight.updatePreview(textArea, fromInput.value, index);
      }
    });
  },

  /** 清理資源 */
  cleanup(textArea) {
    console.log('開始清理預覽相關資源');
    if (textArea._previewRafId) {
      console.log('取消 RAF');
      cancelAnimationFrame(textArea._previewRafId);
      delete textArea._previewRafId;
    }
    
    if (textArea._previewResizeObserver) {
      console.log('斷開 ResizeObserver');
      textArea._previewResizeObserver.disconnect();
      delete textArea._previewResizeObserver;
    }
    
    this.PreviewHighlight.clearAllHighlights();
    console.log('清理完成');
  },

  /** 保存替換規則 */
  saveReplaceRules(container) {
    console.group('保存手動替換規則');
    
    const rules = Array.from(container.querySelectorAll('.replace-extra-group')).map(group => {
      const inputs = group.querySelectorAll('input[type="text"]');
      const rule = {
        from: inputs[0].value,
        to: inputs[1].value
      };
      console.log('保存規則:', rule);
      return rule;
    });

    console.log('所有規則:', rules);
    const storageKey = 'replace_' + this.CONFIG.MANUAL_REPLACE_KEY;
    console.log('使用存儲鍵名:', storageKey);

    chrome.storage.local.set({ [storageKey]: rules }, () => {
      if (chrome.runtime.lastError) {
        console.error('保存規則失敗:', chrome.runtime.lastError);
      } else {
        console.log('規則保存成功');
      }
    });

    console.groupEnd();
  }
};

window.ManualReplaceManager = ManualReplaceManager; 