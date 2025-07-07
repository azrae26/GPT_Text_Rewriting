/**
 * 手動替換核心模組
 * 
 * 功能：
 * 1. 規則管理 - 新增、更新、刪除替換規則
 * 2. 替換執行 - 執行文本替換邏輯
 * 3. 按鈕狀態管理 - 動態更新替換按鈕狀態
 * 4. 文本選擇處理 - 處理用戶選擇文本的邏輯
 * 5. 輸入框寬度調整 - 自動調整輸入框寬度
 * 
 * 職責：
 * - 提供手動替換的核心API
 * - 管理替換規則的生命週期
 * - 處理文本選擇和替換邏輯
 * - 協調UI和數據的同步
 * 
 * 依賴：
 * - replace-core.js (基礎配置和工具)
 * - regex_helper/regex-helper.js (正則表達式處理)
 */

window.ManualReplaceCore = {

  /**
   * 配置常數
   */
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

  /**
   * 動態時間格式化函數
   */
  _getTimeStamp() {
    const now = new Date();
    const hours = now.getHours().toString().padStart(2, '0');
    const minutes = now.getMinutes().toString().padStart(2, '0');
    const seconds = now.getSeconds().toString().padStart(2, '0');
    return `${hours}:${minutes}:${seconds}`;
  },

  /**
   * 規則管理器
   */
  RuleManager: {
    /**
     * 內部規則狀態
     */
    _rules: {
      mainGroup: { from: '', to: '' },
      extraGroups: [] // [{from: '', to: ''}, ...]
    },

    /**
     * 更新規則
     * @param {Object} rule 規則對象 {from: string, to: string}
     * @param {number} index 規則索引
     * @param {boolean} isMainGroup 是否為主組
     */
    updateRule(rule, index, isMainGroup = false) {
      if (isMainGroup) {
        this._rules.mainGroup = rule;
        // 主組由調用者控制預覽更新時機，避免重複觸發
      } else {
        this._rules.extraGroups[index] = rule;
        // 觸發預覽更新和規則保存
        this._triggerUpdate();
      }
    },

    /**
     * 添加規則
     * @param {number} insertIndex 插入位置索引
     */
    addRule(insertIndex = null) {
      // 如果沒有指定插入位置，則在末尾添加
      if (insertIndex === null || insertIndex >= this._rules.extraGroups.length) {
        this._rules.extraGroups.push({ from: '', to: '' });
      } else {
        // 在指定位置插入
        this._rules.extraGroups.splice(insertIndex + 1, 0, { from: '', to: '' });
      }
      
      this._triggerRebuild();
    },

    /**
     * 移除規則
     * @param {number} index 規則索引
     */
    removeRule(index) {
      this._rules.extraGroups.splice(index, 1);
      if (this._rules.extraGroups.length === 0) {
        this._rules.extraGroups.push({ from: '', to: '' });
      }
      
      this._triggerRebuild();
    },

    /**
     * 獲取所有規則
     * @returns {Object} 包含主組和額外組的規則對象
     */
    getAllRules() {
      return {
        mainGroup: { ...this._rules.mainGroup },
        extraGroups: [...this._rules.extraGroups]
      };
    },

    /**
     * 設置所有規則
     * @param {Object} rules 規則對象
     */
    setAllRules(rules) {
      if (rules.mainGroup) {
        this._rules.mainGroup = rules.mainGroup;
      }
      if (rules.extraGroups) {
        this._rules.extraGroups = rules.extraGroups;
      }
    },

    /**
     * 觸發更新（預覽和保存）
     * @private
     */
    _triggerUpdate() {
      // 由外部系統註冊回調
      if (this.onUpdate) {
        this.onUpdate();
      }
    },

    /**
     * 觸發重建（重新渲染組）
     * @private
     */
    _triggerRebuild() {
      // 由外部系統註冊回調
      if (this.onRebuild) {
        this.onRebuild();
      }
    }
  },

  /**
   * 替換執行器
   */
  ReplaceExecutor: {
    /**
     * 執行替換
     * @param {HTMLTextAreaElement} textArea 文本區域
     * @param {string} fromText 要替換的文字
     * @param {string} toText 替換為的文字
     */
    executeReplace(textArea, fromText, toText) {
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
          
          // 觸發預覽更新
          if (this.onTextChanged) {
            this.onTextChanged();
          }
        }
      } catch (error) {
        console.error(`[ManualReplaceCore][${ManualReplaceCore._getTimeStamp()}] ❌ 替換錯誤:`, error);
      }
    },

    /**
     * 計算匹配數量
     * @param {string} searchText 搜尋文字
     * @param {string} text 目標文本
     * @returns {number} 匹配數量
     */
    getMatchCount(searchText, text) {
      searchText = searchText.trim();
      if (!searchText) return 0;

      try {
        const regex = RegexHelper.createRegex(searchText);
        return (text.match(regex) || []).length;
      } catch (error) {
        return 0;
      }
    }
  },

  /**
   * 按鈕狀態管理器
   */
  ButtonStateManager: {
    /**
     * 更新替換按鈕狀態
     * @param {string} searchText 搜尋文字
     * @param {string} text 目標文本
     * @param {HTMLButtonElement} button 按鈕元素
     */
    updateButtonState(searchText, text, button) {
      const count = ManualReplaceCore.ReplaceExecutor.getMatchCount(searchText, text);
      button.textContent = count > 0 ? `替換 (${count})` : '替換';
      button.classList.toggle('disabled', count === 0);
    }
  },

  /**
   * 文本選擇處理器
   */
  TextSelectionHandler: {
    /**
     * 設置文本選擇功能
     * @param {HTMLTextAreaElement} textArea 文本區域
     * @param {HTMLInputElement} fromInput 來源輸入框
     * @param {HTMLInputElement} toInput 目標輸入框
     * @param {Function} updateCallback 更新回調函數
     */
    setupTextSelection(textArea, fromInput, toInput, updateCallback) {
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
          
          console.log(`[ManualReplaceCore][${ManualReplaceCore._getTimeStamp()}] 🎯 文本選取事件: 選取長度=${selectedText.length}, 內容="${selectedText}"`);
          lastSelectedText = selectedText;

          if (selectedText) {
            console.log(`[ManualReplaceCore][${ManualReplaceCore._getTimeStamp()}] ✅ 設定主組文字: "${selectedText}"`);
            fromInput.value = selectedText;
            toInput.value = '';
            
            // 更新主組規則
            ManualReplaceCore.RuleManager.updateRule({ from: selectedText, to: '' }, 0, true);
            
            // 有選取文字時展開輸入框
            ManualReplaceCore.InputWidthManager.adjustInputWidth(fromInput);
            
            // 更新替換按鈕狀態
            updateCallback();
            
            // 觸發預覽更新
            if (this.onPreviewUpdate) {
              this.onPreviewUpdate();
            }
            
          } else if (!selectedText && fromInput.value) {
            console.log(`[ManualReplaceCore][${ManualReplaceCore._getTimeStamp()}] 🧹 清空主組內容`);
            // 當沒有選取文字且 fromInput 有值時清空
            fromInput.value = '';
            toInput.value = '';
            lastSelectedText = ''; // 重置記錄
            ManualReplaceCore.RuleManager.updateRule({ from: '', to: '' }, 0, true);
            
            // 清空時收合輸入框
            fromInput.style.cssText = `width: ${ManualReplaceCore.CONFIG.MIN_WIDTH}px !important;`;
            toInput.style.cssText = `width: ${ManualReplaceCore.CONFIG.MIN_WIDTH}px !important;`;
            
            // 清理主組的高亮預覽
            if (this.onClearPreview) {
              this.onClearPreview(0);
            }
            
            // 更新替換按鈕狀態
            updateCallback();
          }
        } catch (error) {
          console.error(`[ManualReplaceCore][${ManualReplaceCore._getTimeStamp()}] ❌ 處理文本選取時出錯:`, error);
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
    }
  },

  /**
   * 輸入框寬度管理器
   */
  InputWidthManager: {
    /**
     * 調整輸入框寬度
     * @param {HTMLInputElement} input 輸入框元素
     */
    adjustInputWidth(input) {
      const text = input.value;
      if (!text) {
        input.style.cssText = `width: ${ManualReplaceCore.CONFIG.MIN_WIDTH}px !important;`;
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
      const maxWidth = isMainGroup ? ManualReplaceCore.CONFIG.MAIN_GROUP_MAX_WIDTH : ManualReplaceCore.CONFIG.MAX_WIDTH;

      const width = Math.min(
        Math.max(ManualReplaceCore.CONFIG.MIN_WIDTH, span.offsetWidth + ManualReplaceCore.CONFIG.PADDING),
        maxWidth
      );
      input.style.cssText = `width: ${width}px !important;`;

      span.remove();
    },

    /**
     * 檢查文字是否過長
     * @param {HTMLInputElement} element 輸入框元素
     * @returns {boolean} 是否過長
     */
    isTextTooLong(element) {
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
      const paddedWidth = textWidth + ManualReplaceCore.CONFIG.PADDING;
      return paddedWidth >= ManualReplaceCore.CONFIG.MAX_WIDTH * 0.8; // 降低閾值，提前攔截
    }
  },

  /**
   * 事件處理器管理
   */
  EventManager: {
    /**
     * 設置組事件
     * @param {HTMLElement} group 組元素
     * @param {HTMLTextAreaElement} textArea 文本區域
     * @param {HTMLInputElement} fromInput 來源輸入框
     * @param {HTMLInputElement} toInput 目標輸入框
     * @param {HTMLButtonElement} replaceButton 替換按鈕
     * @param {boolean} isMainGroup 是否為主組
     */
    setupGroupEvents(group, textArea, fromInput, toInput, replaceButton, isMainGroup) {
      // 創建統一的按鈕更新處理器
      const updateButton = () => {
        ManualReplaceCore.ButtonStateManager.updateButtonState(fromInput.value, textArea.value, replaceButton);
      };

      const handleInput = () => {
        const rule = {
          from: fromInput.value,
          to: toInput.value
        };

        const index = isMainGroup ? 0 : 
          Array.from(group.parentElement.children).indexOf(group);
        
        ManualReplaceCore.RuleManager.updateRule(rule, index, isMainGroup);
        updateButton();
        
        // 根據是否有文字來調整寬度
        if (isMainGroup) {
          if (fromInput.value) {
            ManualReplaceCore.InputWidthManager.adjustInputWidth(fromInput);
          }
          if (toInput.value) {
            ManualReplaceCore.InputWidthManager.adjustInputWidth(toInput);
          }
        } else {
          // 其他組保持原本的行為
          if (document.activeElement === fromInput) {
            ManualReplaceCore.InputWidthManager.adjustInputWidth(fromInput);
          }
          if (document.activeElement === toInput) {
            ManualReplaceCore.InputWidthManager.adjustInputWidth(toInput);
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
            input.style.cssText = `width: ${ManualReplaceCore.CONFIG.MIN_WIDTH}px !important;`;
          }
        });
        
        input.addEventListener('focus', () => {
          // 檢查是否應該跳過擴展
          if (!input.dataset.skipExpand) {
            ManualReplaceCore.InputWidthManager.adjustInputWidth(input);
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
        ManualReplaceCore.ReplaceExecutor.executeReplace(textArea, fromInput.value, toInput.value);
      });

      if (isMainGroup) {
        ManualReplaceCore.TextSelectionHandler.setupTextSelection(textArea, fromInput, toInput, updateButton);
      }
    }
  },

  /**
   * 存儲管理器
   */
  StorageManager: {
    /**
     * 保存規則到存儲
     */
    saveRules() {
      const manualContainer = document.querySelector('.manual-replace-container');
      if (!manualContainer) return;
      
      // 使用 ReplaceManager.StorageHelper 提取規則
      const extraRules = window.ReplaceManager.StorageHelper.extractRulesFromDOM({
        container: manualContainer,
        groupSelector: '.replace-extra-group'
      });
      
      // 更新內部規則
      ManualReplaceCore.RuleManager._rules.extraGroups = extraRules;
      
      // 使用 StorageHelper 保存
      const storageKey = 'replace_' + ManualReplaceCore.CONFIG.MANUAL_REPLACE_KEY;
      window.ReplaceManager.StorageHelper.saveRules(
        storageKey,
        extraRules,
        () => console.log(`[ManualReplaceCore][${ManualReplaceCore._getTimeStamp()}] 手動替換規則已保存`)
      );
    },

    /**
     * 從存儲載入規則
     * @param {Function} callback 載入完成回調
     */
    loadRules(callback) {
      const storageKey = 'replace_' + ManualReplaceCore.CONFIG.MANUAL_REPLACE_KEY;
      window.ReplaceManager.StorageHelper.loadRules(storageKey, [], (rules) => {
        // 過濾掉空組
        const filteredRules = rules.filter(rule => rule.from?.trim() || rule.to?.trim());
        
        // 如果沒有規則，創建一個空的預設規則
        const finalRules = filteredRules.length > 0 ? filteredRules : [{ from: '', to: '' }];
        
        // 更新內部規則狀態
        ManualReplaceCore.RuleManager._rules.extraGroups = finalRules;
        
        if (callback) {
          callback(finalRules);
        }
      });
    }
  },

  /**
   * 文本變化監聽器
   */
  TextChangeMonitor: {
    _lastValue: '',
    _lastLength: 0,
    _lastHash: '',

    /**
     * 計算文本簡單哈希
     */
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

    /**
     * 設置文本區域變化監聽器
     * @param {HTMLTextAreaElement} textArea 文本區域
     */
    setupTextAreaChangeListener(textArea) {
      this._lastValue = textArea.value;
      this._lastLength = textArea.value.length;
      this._lastHash = this._hashText(textArea.value);
      
      const checkValue = () => {
        const currentValue = textArea.value;
        const currentLength = currentValue.length;
        const currentHash = this._hashText(currentValue);
        
        if (currentValue !== this._lastValue || currentLength !== this._lastLength || currentHash !== this._lastHash) {
          console.log(`[ManualReplaceCore][${ManualReplaceCore._getTimeStamp()}] 📝 文本變化: ${this._lastLength} → ${currentLength} 字符`);
          
          this._lastValue = currentValue;
          this._lastLength = currentLength;
          this._lastHash = currentHash;
          
          // 觸發變化回調
          if (this.onTextChanged) {
            this.onTextChanged();
          }
        }
        requestAnimationFrame(checkValue);
      };
      checkValue();
    }
  },

  /**
   * 初始化核心模組
   */
  initialize() {
    // 設置回調函數
    this.RuleManager.onUpdate = () => {
      this.StorageManager.saveRules();
      // 觸發預覽更新的回調
      if (this.onPreviewUpdate) {
        this.onPreviewUpdate();
      }
    };

    this.RuleManager.onRebuild = () => {
      this.StorageManager.saveRules();
      // 觸發重新渲染的回調
      if (this.onRebuild) {
        this.onRebuild();
      }
    };

    console.log(`[ManualReplaceCore][${this._getTimeStamp()}] 手動替換核心模組已初始化`);
  }
};

// 初始化模組
window.ManualReplaceCore.initialize();

// 向後兼容的 ManualReplaceManager 包裝器
window.ManualReplaceManager = {
  /**
   * 向後兼容：初始化手動替換組
   * @param {HTMLElement} mainContainer 主容器
   * @param {HTMLElement} otherContainer 其他容器
   * @param {HTMLTextAreaElement} textArea 文本區域
   */
  initializeManualGroups(mainContainer, otherContainer, textArea) {
    console.log(`[ManualReplaceManager][${ManualReplaceCore._getTimeStamp()}] 向後兼容：初始化手動替換組`);
    
    if (!window.ReplaceManager?.initializeReplaceGroups) {
      console.error('[ManualReplaceManager] ReplaceManager.initializeReplaceGroups 不可用');
      return;
    }

    // 委託給新的架構，傳遞手動替換的配置
    return window.ReplaceManager.initializeReplaceGroups({
      mainContainer: mainContainer,
      otherContainer: otherContainer,
      textArea: textArea,
      storageKey: 'replace_' + ManualReplaceCore.CONFIG.MANUAL_REPLACE_KEY,
      createGroupFn: this.createReplaceGroup.bind(this),
      onInitialized: () => {
        // 設置文本變化監聽
        this._setupTextAreaChangeListener(textArea);

        // 初始化規則狀態
        const mainGroup = mainContainer.querySelector('.replace-main-group');
        const mainFromInput = mainGroup?.querySelector('.replace-input');
        if (mainFromInput) {
          ManualReplaceCore.RuleManager._rules.mainGroup = {
            from: mainFromInput.value,
            to: mainGroup.querySelector('.replace-input:last-of-type').value
          };
        }

        const extraGroups = document.querySelectorAll('.manual-replace-container .replace-extra-group');
        ManualReplaceCore.RuleManager._rules.extraGroups = Array.from(extraGroups).map(group => ({
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

  /**
   * 向後兼容：創建替換組
   * @param {HTMLTextAreaElement} textArea 文本區域
   * @param {boolean} isMainGroup 是否為主組
   * @param {Object} initialData 初始資料
   * @param {number} groupIndex 組索引
   * @returns {HTMLElement} 組元素
   */
  createReplaceGroup(textArea, isMainGroup = false, initialData = null, groupIndex = null) {
    if (!window.ReplaceUIFactory) {
      console.error('[ManualReplaceManager] ReplaceUIFactory 不可用');
      return document.createElement('div');
    }

    // 委託給 UI 工廠創建手動替換組
    return window.ReplaceUIFactory.createManualReplaceGroup(textArea, isMainGroup, initialData, groupIndex);
  },

  /**
   * 向後兼容：設置文本區域變化監聽器
   * @param {HTMLTextAreaElement} textArea 文本區域
   */
  _setupTextAreaChangeListener(textArea) {
    // 委託給新的文本變化監聽器
    ManualReplaceCore.TextChangeMonitor.onTextChanged = () => {
      this._updatePreviews();
    };
    ManualReplaceCore.TextChangeMonitor.setupTextAreaChangeListener(textArea);
  },

  /**
   * 向後兼容：更新預覽
   */
  _updatePreviews() {
    console.log(`[ManualReplaceManager][${ManualReplaceCore._getTimeStamp()}] 向後兼容：更新預覽`);
    
    // 委託給預覽管理器
    if (window.ReplacePreview) {
      window.ReplacePreview.updateAllPreviews();
    } else {
      console.warn('[ManualReplaceManager] ReplacePreview 模組未載入');
    }
  },

  /**
   * 向後兼容：設置所有拖曳事件
   */
  _setupAllSortDragEvents() {
    console.log(`[ManualReplaceManager][${ManualReplaceCore._getTimeStamp()}] 向後兼容：設置拖曳事件`);
    
    // 委託給拖曳管理器
    if (window.ReplaceDrag) {
      const container = document.querySelector('.manual-replace-container');
      if (container) {
        window.ReplaceDrag.setupGroupDragEvents(container, {
          groupSelector: '.replace-extra-group',
          lockHorizontal: true,
          placeholderId: 'manual-drag-placeholder'
        });
      }
    } else {
      console.warn('[ManualReplaceManager] ReplaceDrag 模組未載入');
    }
  },

  /**
   * 向後兼容：從存儲刷新
   */
  refreshFromStorage() {
    console.log(`[ManualReplaceManager][${ManualReplaceCore._getTimeStamp()}] 向後兼容：從存儲刷新`);
    
    // 委託給存儲管理器
    ManualReplaceCore.StorageManager.loadRules((rules) => {
      console.log(`[ManualReplaceManager] 載入了 ${rules.length} 個規則`);
      // 這裡可以添加重新渲染UI的邏輯
    });
  },

  /**
   * 向後兼容：檢查是否需要刷新
   * @param {Array} changedKeys 變化的鍵值
   * @returns {boolean} 是否需要刷新
   */
  shouldRefresh(changedKeys) {
    const manualKey = 'replace_' + ManualReplaceCore.CONFIG.MANUAL_REPLACE_KEY;
    return changedKeys.includes(manualKey);
  },

  /**
   * 配置常量（向後兼容）
   */
  CONFIG: {
    MIN_WIDTH: 80,
    MAX_WIDTH: 600,
    MAIN_GROUP_MAX_WIDTH: 330,
    PADDING: 24,
    MANUAL_REPLACE_KEY: 'manualReplaceRules',
    MAX_PREVIEWS: 1000,
    PREVIEW_COLORS: [
      '#FF0000', '#FF8C00', '#0095FF', '#AB00FF', '#00AF06', '#9932CC'
    ],
    PREVIEW_CONTAINER_ID: 'replace-preview-container'
  },

  /**
   * 內部規則狀態（向後兼容）
   */
  _rules: {
    mainGroup: { from: '', to: '' },
    extraGroups: []
  }
};

console.log('[ManualReplaceManager] 向後兼容包裝器已建立'); 