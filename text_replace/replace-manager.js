/**
 * 替換管理整合模組
 * 
 * 依賴模組：
 * 1. text_replace/manual-replace-manager.js
 *    - ManualReplaceManager.PreviewHighlight.initialize：初始化預覽功能
 *    - ManualReplaceManager.PreviewHighlight.updatePreview：更新預覽顯示
 *    - ManualReplaceManager.checkAndForceUpdateHighlights：檢查並強制更新高亮
 *    - ManualReplaceManager.startHighlightCheck：開始定期檢查高亮
 * 
 * 2. text_replace/auto-replace-manager.js
 *    - AutoReplaceManager.handleAutoReplace：處理自動替換
 * 
 * 3. Chrome Storage API
 *    - chrome.storage.sync：用於存儲和讀取位置設定
 *    - chrome.storage.local：用於存儲和讀取替換規則
 * 
 * 主要功能：
 * - 統一管理手動和自動替換的初始化
 * - 管理替換介面的位置和拖曳功能
 * - 處理大型輸入框的顯示
 * - 提供通用的存儲和事件處理邏輯
 */
const ReplaceManager = {
  CONFIG: {
    STORAGE_KEY: 'replacePosition'
  },

  /** 初始化替換介面 */
  initializeReplaceUI() {
    // 先檢查是否應該啟用功能
    if (!window.shouldEnableFeatures()) {
      console.log('不在目標頁面，移除UI');
      this.removeReplaceUI();
      return;
    }

    // 先移除所有現有的UI元素
    this.removeReplaceUI();

    const textArea = document.querySelector('textarea[name="content"]');
    if (!textArea) {
      console.log('找不到文本區域元素');
      return;
    }

    // 創建主組容器（第一組）
    const mainContainer = document.createElement('div');
    mainContainer.id = 'text-replace-main';
    mainContainer.className = 'replace-controls-main';

    // 創建其他組容器（第二組和自動組）
    const otherContainer = document.createElement('div');
    otherContainer.id = 'text-replace-container';
    otherContainer.className = 'replace-controls';

    // 載入儲存的位置，如果沒有則使用預設位置
    chrome.storage.sync.get([this.CONFIG.STORAGE_KEY], (result) => {
      const position = result[this.CONFIG.STORAGE_KEY];
      otherContainer.style.cssText = position 
        ? `left: ${position.left}px; top: ${position.top}px;`
        : 'right: 20px; top: 20px;';
    });

    // 添加拖動圖示
    otherContainer.appendChild(document.createElement('div')).className = 'replace-drag-handle';

    // 初始化替換組
    window.ManualReplaceManager.initializeManualGroups(mainContainer, otherContainer, textArea);
    window.AutoReplaceManager.initializeAutoReplaceGroups(otherContainer, textArea);

    // 在創建其他組容器後，添加大型輸入框事件處理
    this._initializeLargeInputFeature(otherContainer);

    // 插入到頁面
    textArea.parentElement.insertBefore(mainContainer, textArea);
    document.body.appendChild(otherContainer);

    // 簡化的拖動功能
    this._initializeDragFeature(otherContainer);

    console.log('替換介面初始化完成');
  },

  /** 初始化拖動功能 */
  _initializeDragFeature(container) {
    let isDragging = false;
    let startX, startY, startLeft, startTop;

    // 找到拖動圖示元素
    const dragHandle = container.querySelector('.replace-drag-handle');

    // 只在拖動圖示上綁定事件
    dragHandle.addEventListener('mousedown', (e) => {
      isDragging = true;
      startX = e.clientX;
      startY = e.clientY;
      
      const computedStyle = window.getComputedStyle(container);
      startLeft = parseInt(computedStyle.left) || 0;
      startTop = parseInt(computedStyle.top) || 0;
      
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      
      e.preventDefault();
    });

    const handleMouseMove = (e) => {
      if (!isDragging) return;
      
      const deltaX = e.clientX - startX;
      const deltaY = e.clientY - startY;
      
      container.style.left = `${startLeft + deltaX}px`;
      container.style.top = `${startTop + deltaY}px`;
    };

    const handleMouseUp = () => {
      isDragging = false;
      const position = {
        left: parseInt(container.style.left),
        top: parseInt(container.style.top)
      };
      chrome.storage.sync.set({
        [this.CONFIG.STORAGE_KEY]: position
      });
      
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  },

  /** 初始化大型輸入框功能 */
  _initializeLargeInputFeature(container) {
    // 創建大型輸入框元素
    const largeInput = document.createElement('textarea');
    largeInput.className = 'replace-large-input';
    largeInput.style.display = 'none';
    document.body.appendChild(largeInput);
    
    // 標記是否正在處理點擊事件
    let isHandlingClick = false;
    
    // 防止原始輸入框焦點的函數
    const preventOriginalFocus = (originalInput) => {
      if (!originalInput) return;
      
      // 創建一個不可見的覆蓋層覆蓋在原始輸入框上
      const blocker = document.createElement('div');
      blocker.style.cssText = `
        position: fixed;
        z-index: 3000;
        background: transparent;
        pointer-events: all;
      `;
      
      // 設置覆蓋層位置和大小
      const rect = originalInput.getBoundingClientRect();
      blocker.style.left = `${rect.left}px`;
      blocker.style.top = `${rect.top}px`;
      blocker.style.width = `${rect.width}px`;
      blocker.style.height = `${rect.height}px`;
      
      // 攔截所有可能引起焦點變化的事件
      ['mousedown', 'mouseup', 'click', 'touchstart', 'touchend'].forEach(eventType => {
        blocker.addEventListener(eventType, (e) => {
          e.preventDefault();
          e.stopPropagation();
          // 重新聚焦到大型輸入框，確保不會丟失焦點
          if (largeInput.style.display === 'block') {
            largeInput.focus();
          }
        }, true);
      });
      
      document.body.appendChild(blocker);
      
      // 在大型輸入框關閉時移除覆蓋層
      const removeBlocker = () => {
        if (document.body.contains(blocker)) {
          document.body.removeChild(blocker);
        }
        largeInput.removeEventListener('blur', checkBlur);
      };
      
      // 在大型輸入框失去焦點時檢查
      const checkBlur = (e) => {
        // 如果焦點不是轉移到原始輸入框，移除覆蓋層
        if (e.relatedTarget !== originalInput) {
          removeBlocker();
        } else {
          // 如果焦點嘗試轉移到原始輸入框，立即將焦點轉回大型輸入框
          setTimeout(() => {
            if (largeInput.style.display === 'block') {
              largeInput.focus();
            }
          }, 0);
        }
      };
      
      largeInput.addEventListener('blur', checkBlur);
      
      return blocker;
    };

    // 檢查並顯示大型輸入框的函數
    const checkAndShowLargeInput = (input) => {
      if (!input || !input.classList.contains('replace-input') || input.closest('.replace-main-group')) {
        return false;
      }
      
      // 如果大型輸入框已經顯示並且關聯的就是當前輸入框，不做任何操作
      if (largeInput.style.display === 'block' && largeInput.originalInput === input) {
        return true;
      }
      
      const text = input.value;
      if (!text) return false;
      
      // 使用原生方法計算寬度
      const span = document.createElement('span');
      span.style.cssText = `
        visibility: hidden;
        position: absolute;
        white-space: pre;
        font: ${window.getComputedStyle(input).font};
      `;
      span.textContent = text;
      document.body.appendChild(span);

      const textWidth = span.offsetWidth;
      span.remove();
      
      // 如果文字寬度加上填充接近或超過MAX_WIDTH，則開啟大型輸入框
      const paddedWidth = textWidth + window.ManualReplaceManager.CONFIG.PADDING;
      if (paddedWidth >= window.ManualReplaceManager.CONFIG.MAX_WIDTH * 0.8) { // 降低閾值，與手動替換協調
        // 先從原始輸入框中捕獲當前值，避免可能的同步問題
        const currentValue = input.value;
        
        // 設置原始輸入框為不可見，防止閃爍
        input.style.visibility = 'hidden';
        
        // 標記輸入框，防止其他處理器擴展它
        input.dataset.skipExpand = 'true';
        
        // 計算位置
        const inputRect = input.getBoundingClientRect();
        const left = inputRect.left + (input.offsetWidth - 450) / 2;
        const top = inputRect.bottom + 5;

        // 設定大型輸入框位置和內容
        largeInput.style.left = `${left}px`;
        largeInput.style.top = `${top}px`;
        largeInput.value = currentValue;
        
        // 放置一個覆蓋層在原始輸入框上
        const blocker = preventOriginalFocus(input);
        
        // 設置大型輸入框顯示並聚焦
        largeInput.style.display = 'block';
        largeInput.focus();

        // 儲存對應的原始輸入框引用
        largeInput.originalInput = input;
        
        // 在大型輸入框關閉時恢復原始輸入框可見性和清除標記
        const restoreVisibility = () => {
          input.style.visibility = 'visible';
          delete input.dataset.skipExpand;
          largeInput.removeEventListener('blur', handleBlur);
        };
        
        const handleBlur = () => {
          // 確保大型輸入框真的關閉了才恢復原始輸入框可見性
          if (largeInput.style.display === 'none') {
            restoreVisibility();
          }
        };
        
        largeInput.addEventListener('blur', handleBlur);
        
        return true;
      }
      
      return false;
    };

    // 監聽替換輸入框的點擊事件
    container.addEventListener('click', (e) => {
      // 如果點擊的是大型輸入框或其內部元素，不處理
      if (largeInput.contains(e.target)) return;
      
      // 正常處理點擊事件
      isHandlingClick = true;
      checkAndShowLargeInput(e.target);
      isHandlingClick = false;
    }, true);
    
    // 監聽替換輸入框的焦點事件，這樣能更快地響應
    container.addEventListener('focusin', (e) => {
      // 如果是點擊事件處理中引起的焦點變化，忽略
      if (isHandlingClick) return;
      
      if (e.target.classList.contains('replace-input') && !e.target.closest('.replace-main-group')) {
        setTimeout(() => {
          // 再次檢查是否需要顯示大型輸入框
          checkAndShowLargeInput(e.target);
        }, 0);
      }
    });

    // 監聽大型輸入框的輸入事件，實時同步到原始輸入框
    largeInput.addEventListener('input', () => {
      const originalInput = largeInput.originalInput;
      if (originalInput) {
        // 同步值但不觸發焦點和輸入事件，避免可能的循環
        originalInput.value = largeInput.value;
        
        // 觸發原始輸入框的自定義事件，讓應用邏輯知道值已更改
        originalInput.dispatchEvent(new CustomEvent('value-sync', { 
          bubbles: true,
          detail: { value: largeInput.value }
        }));
      }
    });

    // 監聽大型輸入框失去焦點事件
    largeInput.addEventListener('blur', (e) => {
      // 立即獲取當前值，避免後續可能的變化
      const currentValue = largeInput.value;
      const originalInput = largeInput.originalInput;
      
      // 檢查焦點是否轉移到了原始輸入框
      if (e.relatedTarget === originalInput) {
        // 立即重新聚焦到大型輸入框
        setTimeout(() => {
          if (largeInput.style.display === 'block') {
            largeInput.focus();
          }
        }, 0);
        return;
      }
      
      // 其他情況正常關閉大型輸入框
      if (originalInput) {
        // 將值同步到原始輸入框
        originalInput.value = currentValue;
        
        // 觸發原始輸入框的值同步事件
        originalInput.dispatchEvent(new CustomEvent('value-sync', { 
          bubbles: true,
          detail: { value: currentValue }
        }));
        
        // 隱藏大型輸入框
        largeInput.style.display = 'none';
        largeInput.originalInput = null;
      }
    });

    // 監聽ESC鍵關閉大型輸入框
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && largeInput.style.display === 'block') {
        // 立即獲取當前值
        const currentValue = largeInput.value;
        const originalInput = largeInput.originalInput;
        
        // 同步值並關閉
        if (originalInput) {
          originalInput.value = currentValue;
          
          // 觸發原始輸入框的值同步事件
          originalInput.dispatchEvent(new CustomEvent('value-sync', { 
            bubbles: true,
            detail: { value: currentValue }
          }));
        }
        
        largeInput.style.display = 'none';
        largeInput.originalInput = null;
      }
    });
  },

  /** 移除替換介面 */
  removeReplaceUI() {
    console.log('移除替換介面');
    const elements = [
      document.getElementById('text-replace-main'),
      document.getElementById('text-replace-container'),
      document.querySelector('.replace-large-input')
    ];
    
    elements.forEach(element => {
      if (element) {
        element.remove();
        console.log(`已移除元素: ${element.id || element.className}`);
      }
    });

    // 清理預覽相關資源
    if (this.manualReplaceManager) {
      const textArea = document.querySelector('textarea[name="content"]');
      if (textArea) {
        this.manualReplaceManager.cleanup(textArea);
      }
    }
  },

  /** 設置替換組的共用事件處理 */
  setupGroupEvents(group, textArea, fromInput, toInput, checkbox, options = {}) {
    const {
      isManual = false,  // 是否為手動替換組
      onInputChange = null, // 輸入變更時的回調
      onRulesSave = null   // 保存規則時的回調
    } = options;

    const handleInput = (input) => {
      console.group('處理輸入事件');
      console.log('輸入框值:', {
        from: fromInput.value,
        to: toInput.value,
        checked: checkbox?.checked
      });

      // 調用自定義的輸入處理函數
      if (onInputChange) {
        onInputChange(input);
      }

      // 保存規則
      if (onRulesSave) {
        onRulesSave(group.parentElement);
      }
      
      // 只在 popup 頁面中發送消息
      if (window.location.pathname.endsWith('popup.html')) {
        console.log('準備發送消息到 content script');
        chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
          if (tabs[0]) {
            try {
              // 獲取當前的規則
              const container = group.parentElement;
              const rules = Array.from(container.querySelectorAll('.auto-replace-group')).map(group => {
                const containers = Array.from(group.children).filter(el => el.classList.contains('replace-input-container'));
                const fromInput = containers[0]?.querySelector('.replace-input');
                const toInput = containers[1]?.querySelector('.replace-input');
                const checkbox = group.querySelector('.auto-replace-checkbox');
                
                return {
                  from: fromInput?.value || '',
                  to: toInput?.value || '',
                  enabled: checkbox?.checked || false
                };
              });

              console.log('準備發送的規則:', rules);

              // 發送完整的規則列表
              chrome.tabs.sendMessage(tabs[0].id, {
                action: isManual ? "updateManualReplaceRules" : "updateAutoReplaceRules",
                rules: rules
              }, function(response) {
                if (chrome.runtime.lastError) {
                  console.debug('Content script 正在載入中...');
                } else {
                  console.log('消息發送成功:', response);
                  // 發送觸發替換的消息
                  chrome.tabs.sendMessage(tabs[0].id, {
                    action: isManual ? "triggerManualReplace" : "triggerAutoReplace"
                  });
                }
              });
            } catch (error) {
              console.error('發送消息時出錯:', error);
            }
          }
        });
      }
      console.groupEnd();
    };

    // 為兩個輸入框添加輸入事件監聽
    [fromInput, toInput].forEach(input => {
      let timeoutId = null;
      input.addEventListener('input', () => {
        console.log('輸入事件觸發');
        if (timeoutId) {
          clearTimeout(timeoutId);
        }
        timeoutId = setTimeout(() => handleInput(input), 300);
      });
      
      // 失去焦點時也觸發更新
      input.addEventListener('blur', () => {
        console.log('失去焦點事件觸發');
        handleInput(input);
      });
    });

    // 複選框事件
    if (checkbox) {
      checkbox.addEventListener('change', () => {
        console.log('複選框狀態改變:', checkbox.checked);
        handleInput(fromInput);
      });
    }
  },

  /** 初始化替換組 */
  initializeReplaceGroups(options) {
    const {
      mainContainer,     // 主容器（僅手動替換需要）
      otherContainer,    // 其他容器
      textArea,          // 文本區域
      storageKey,        // 存儲鍵名
      createGroupFn,     // 創建組的函數
      onInitialized,     // 初始化後的回調
      isManual = false   // 是否為手動替換
    } = options;

    if (isManual) {
      console.log('初始化手動替換組，使用存儲鍵名:', storageKey);
      
      // 初始化預覽
      window.ManualReplaceManager.PreviewHighlight.initialize(textArea);
      
      // 創建主組
      const mainGroup = createGroupFn(textArea, true);
      mainContainer.appendChild(mainGroup);

      // 創建手動容器
      const manualContainer = document.createElement('div');
      manualContainer.className = 'manual-replace-container';
      otherContainer.appendChild(manualContainer);

      // 使用統一的存儲邏輯讀取規則
      this.StorageHelper.loadRules(storageKey, [{ from: '', to: '' }], (rules) => {
        console.log('讀取到的規則:', rules);
        
        // 如果沒有規則，添加一個空規則
        if (rules.length === 0) {
          rules.push({ from: '', to: '' });
        }
        
        // 創建組
        rules.forEach((rule, index) => {
          manualContainer.appendChild(createGroupFn(textArea, false, rule, index));
        });

        // 等待 DOM 更新後初始化預覽
        requestAnimationFrame(() => {
          const mainFromInput = mainGroup.querySelector('input[type="text"]:first-child');
          if (mainFromInput && mainFromInput.value.trim()) {
            window.ManualReplaceManager.PreviewHighlight.updatePreview(textArea, mainFromInput.value, 0);
          }

          const extraGroups = manualContainer.querySelectorAll('.replace-extra-group');
          extraGroups.forEach((group, index) => {
            const fromInput = group.querySelector('input[type="text"]:first-child');
            if (fromInput && fromInput.value.trim()) {
              window.ManualReplaceManager.PreviewHighlight.updatePreview(textArea, fromInput.value, index + 1);
            }
          });

          // 檢查高亮是否正確顯示
          setTimeout(() => {
            window.ManualReplaceManager.checkAndForceUpdateHighlights();
          }, 500);
        });

        // 調用初始化回調
        if (onInitialized) {
          onInitialized();
        }

        // 開始定期檢查高亮
        window.ManualReplaceManager.startHighlightCheck();
      });
    } else {
      console.log('初始化自動替換組，使用存儲鍵名:', storageKey);
      
      // 使用統一的存儲邏輯讀取規則
      this.StorageHelper.loadRules(storageKey, [{}], (rules) => {
        console.log('讀取到的規則:', rules);
        
        const filteredRules = rules.filter(rule => rule.from?.trim() || rule.to?.trim());
        console.log('過濾後的規則:', filteredRules);
        
        const finalRules = filteredRules.length > 0 ? filteredRules : [{}];
        
        finalRules.forEach(rule => {
          const group = createGroupFn(textArea, rule);
          otherContainer.appendChild(group);
        });

        if (onInitialized) onInitialized();
      });

      // 監聽文本變化
      textArea.addEventListener('input', () => window.AutoReplaceManager.handleAutoReplace(textArea));
    }
  },
  
  // 統一的存儲邏輯
  StorageHelper: {
    // 統一的存儲邏輯
    saveRules(key, rules, callback) {
      const storageKey = key.startsWith('replace_') ? key : `replace_${key}`;
      chrome.storage.local.set({ [storageKey]: rules }, () => {
        if (chrome.runtime.lastError) {
          console.error(`保存規則失敗: ${storageKey}`, chrome.runtime.lastError);
        } else if (callback) {
          callback();
        }
      });
    },

    // 統一的讀取邏輯
    loadRules(key, defaultValue, callback) {
      const storageKey = key.startsWith('replace_') ? key : `replace_${key}`;
      chrome.storage.local.get([storageKey], (result) => {
        const rules = result[storageKey] || defaultValue;
        if (callback) callback(rules);
      });
    }
  },

  // 統一的事件處理系統
  _setupEventHandlers(elementMap, handlerMap) {
    Object.entries(handlerMap).forEach(([eventType, handlers]) => {
      Object.entries(handlers).forEach(([elementKey, handler]) => {
        if (elementMap[elementKey]) {
          elementMap[elementKey].addEventListener(eventType, handler);
        }
      });
    });
  },

  // 拖曳管理功能
  DragManager: {
    setupDragSorting(element, options = {}) {
      const {
        container = element.parentElement,
        selector = '.replace-extra-group',
        handleSelector = '.replace-sort-button',
        onComplete = null
      } = options;
      
      const handle = element.querySelector(handleSelector);
      if (!handle) return;
      
      let isDragging = false;
      let startY = 0;
      let startRect = null;
      let placeholder = null;
      let allItems = null;
      
      handle.addEventListener('mousedown', (e) => {
        e.preventDefault();
        isDragging = true;
        startY = e.clientY;
        startRect = element.getBoundingClientRect();
        
        allItems = Array.from(container.querySelectorAll(selector));
        const startIndex = allItems.indexOf(element);
        
        // 創建佔位元素
        placeholder = element.cloneNode(true);
        placeholder.style.opacity = '0.3';
        placeholder.style.pointerEvents = 'none';
        
        // 設置拖曳樣式
        this._setDragStyles(element, startRect);
        
        // 插入佔位元素
        container.insertBefore(placeholder, element);
        
        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);
      });
      
      const handleMouseMove = (e) => {
        if (!isDragging) return;
        
        // 更新位置
        element.style.top = `${startRect.top + (e.clientY - startY)}px`;
        
        // 計算目標位置
        const containerRect = container.getBoundingClientRect();
        const relativeY = e.clientY - containerRect.top;
        
        // 處理位置更新邏輯
        this._updateItemPosition(container, element, placeholder, allItems, relativeY);
      };
      
      const handleMouseUp = () => {
        if (!isDragging) return;
        isDragging = false;
        
        // 恢復樣式
        this._resetDragStyles(element);
        
        // 移動到最終位置
        container.insertBefore(element, placeholder);
        placeholder.remove();
        
        // 完成回調
        if (onComplete) onComplete(container);
        
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };
    },
    
    _setDragStyles(element, rect) {
      element.style.position = 'fixed';
      element.style.zIndex = '1000';
      element.style.width = `${rect.width}px`;
      element.style.left = `${rect.left}px`;
      element.style.top = `${rect.top}px`;
      element.style.backgroundColor = '#fff';
      element.style.transform = 'scale(1.02)';
      element.style.boxShadow = '0 2px 10px rgba(0,0,0,0.1)';
    },
    
    _resetDragStyles(element) {
      element.style.position = '';
      element.style.zIndex = '';
      element.style.width = '';
      element.style.left = '';
      element.style.top = '';
      element.style.transform = '';
      element.style.boxShadow = '';
    },
    
    _updateItemPosition(container, element, placeholder, allItems, relativeY) {
      let targetIndex = -1;
      let minDistance = Infinity;
      
      allItems.forEach((item, index) => {
        if (item === element || item === placeholder) return;
        
        const itemRect = item.getBoundingClientRect();
        const containerRect = container.getBoundingClientRect();
        const itemTop = itemRect.top - containerRect.top;
        const distance = Math.abs(relativeY - itemTop);
        
        if (distance < minDistance && distance < itemRect.height) {
          minDistance = distance;
          targetIndex = index;
        }
      });
      
      if (targetIndex !== -1) {
        const targetItem = allItems[targetIndex];
        const shouldInsertBefore = relativeY < 
          targetItem.getBoundingClientRect().top - container.getBoundingClientRect().top + 
          (targetItem.offsetHeight * 0.5);
        
        placeholder.remove();
        container.insertBefore(
          placeholder, 
          shouldInsertBefore ? targetItem : targetItem.nextSibling
        );
      }
    }
  }
};

window.ReplaceManager = ReplaceManager; 