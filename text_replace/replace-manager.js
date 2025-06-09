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
 * - 自動清理空組：重新載入時過濾掉沒有內容的替換規則
 * - 拖移排序功能：支持替換組的拖移重新排序（已修復閃爍和無法移動到最後位置的問題）
 */
const ReplaceManager = {
  CONFIG: {
    STORAGE_KEY: 'replacePosition'
  },

  /** 初始化替換介面 */
  initializeReplaceUI() {
    try {
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
        console.error('找不到文本區域元素');
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
      this._loadContainerPosition(otherContainer);

      // 添加拖動圖示
      otherContainer.appendChild(document.createElement('div')).className = 'replace-drag-handle';

      // 初始化替換組
      Promise.all([
        this._initializeManualGroups(mainContainer, otherContainer, textArea),
        this._initializeAutoGroups(otherContainer, textArea)
      ]).then(() => {
        console.log('所有替換組初始化完成');
      }).catch(error => {
        console.error('初始化替換組時出錯:', error);
      });

      // 在創建其他組容器後，添加大型輸入框事件處理
      this._initializeLargeInputFeature(otherContainer);

      // 插入到頁面
      if (textArea.parentElement) {
        textArea.parentElement.insertBefore(mainContainer, textArea);
      }
      document.body.appendChild(otherContainer);

      // 簡化的拖動功能
      this._initializeDragFeature(otherContainer);

      console.log('替換介面初始化完成');
      
      // 設置 MutationObserver 監控文本區域，處理動態變化
      this._setupTextAreaObserver(textArea);
      
      return { mainContainer, otherContainer };
    } catch (error) {
      console.error('初始化替換介面時出錯:', error);
      // 嘗試清理已創建的元素
      this.removeReplaceUI();
      return null;
    }
  },
  
  /** 載入容器位置 */
  _loadContainerPosition(container) {
    try {
      chrome.storage.sync.get([this.CONFIG.STORAGE_KEY], (result) => {
        if (chrome.runtime.lastError) {
          console.warn('載入位置設定時出錯:', chrome.runtime.lastError);
          container.style.cssText = 'right: 20px; top: 20px;';
          return;
        }
        
        const position = result[this.CONFIG.STORAGE_KEY];
        container.style.cssText = position 
          ? `left: ${position.left}px; top: ${position.top}px;`
          : 'right: 20px; top: 20px;';
      });
    } catch (error) {
      console.error('載入容器位置時出錯:', error);
      container.style.cssText = 'right: 20px; top: 20px;';
    }
  },
  
  /** 初始化手動替換組 */
  _initializeManualGroups(mainContainer, otherContainer, textArea) {
    return new Promise((resolve, reject) => {
      try {
        if (!window.ManualReplaceManager) {
          reject(new Error('找不到 ManualReplaceManager 模組'));
          return;
        }
        
        window.ManualReplaceManager.initializeManualGroups(mainContainer, otherContainer, textArea);
        resolve();
      } catch (error) {
        console.error('初始化手動替換組時出錯:', error);
        reject(error);
      }
    });
  },
  
  /** 初始化自動替換組 */
  _initializeAutoGroups(otherContainer, textArea) {
    return new Promise((resolve, reject) => {
      try {
        if (!window.AutoReplaceManager) {
          reject(new Error('找不到 AutoReplaceManager 模組'));
          return;
        }
        
        window.AutoReplaceManager.initializeAutoReplaceGroups(otherContainer, textArea);
        resolve();
      } catch (error) {
        console.error('初始化自動替換組時出錯:', error);
        reject(error);
      }
    });
  },
  
  /** 設置文本區域觀察器 */
  _setupTextAreaObserver(textArea) {
    // 如果頁面上的文本區域被替換，重新初始化
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === 'childList' && Array.from(mutation.removedNodes).includes(textArea)) {
          console.log('文本區域被移除，重新初始化替換介面');
          // 延遲執行以確保新的文本區域已經添加到頁面
          setTimeout(() => this.initializeReplaceUI(), 500);
          observer.disconnect();
          break;
        }
      }
    });
    
    // 監視文本區域的父元素
    if (textArea.parentElement) {
      observer.observe(textArea.parentElement, { 
        childList: true, 
        subtree: true 
      });
    }
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
  setupGroupEvents(group, textArea, fromInput, toInput, checkboxOrButton, options = {}) {
    const {
      isManual = false,  // 是否為手動替換組
      onInputChange = null, // 輸入變更時的回調
      onRulesSave = null,   // 保存規則時的回調
      updatePreviewFn = null, // 更新預覽的函數
      executeReplaceFn = null  // 執行替換的函數
    } = options;

    // 獲取實際的輸入元素（處理可能的容器情況）
    const getInputElement = (input) => {
      if (input.classList.contains('replace-input')) {
        return input;
      }
      return input.querySelector('.replace-input');
    };

    const fromInputElement = getInputElement(fromInput);
    const toInputElement = getInputElement(toInput);
    
    // 判斷是按鈕還是複選框
    const isButton = checkboxOrButton && checkboxOrButton.tagName === 'BUTTON';

    // 防抖函數，延遲處理輸入事件
    const debounce = (fn, delay) => {
      let timer = null;
      return function(...args) {
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => {
          fn.apply(this, args);
          timer = null;
        }, delay);
      };
    };

    // 更新按鈕狀態（僅用於手動替換）
    const updateButtonState = () => {
      if (isManual && isButton) {
        const button = checkboxOrButton;
        const searchText = fromInputElement.value.trim();
        
        if (!searchText) {
          button.textContent = '替換';
          button.classList.add('disabled');
          return;
        }

        try {
          const regex = window.RegexHelper.createRegex(searchText);
          const count = (textArea.value.match(regex) || []).length;
          button.textContent = count > 0 ? `替換 (${count})` : '替換';
          button.classList.toggle('disabled', count === 0);
        } catch (error) {
          button.textContent = '替換';
          button.classList.add('disabled');
        }
      }
    };

    // 處理輸入事件
    const handleInput = debounce((input) => {
      try {
        // 更新按鈕狀態（手動替換）
        if (isManual) {
          updateButtonState();
        }

        // 更新預覽（手動替換）
        if (isManual && updatePreviewFn) {
          const index = Array.from(group.parentElement.children).indexOf(group);
          updatePreviewFn(textArea, fromInputElement.value, index);
        }

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
          this._sendMessageToContentScript(group, isManual);
        }
      } catch (error) {
        console.error('處理輸入事件時出錯:', error);
      }
    }, 300);

    // 為輸入框添加事件監聽
    [fromInputElement, toInputElement].forEach(input => {
      // 使用事件代理，避免多次添加相同的事件監聽器
      if (input.dataset.hasInputHandler) {
        return;
      }
      
      input.dataset.hasInputHandler = 'true';
      
      input.addEventListener('input', () => {
        handleInput(input);
      });
      
      // 失去焦點時也觸發更新
      input.addEventListener('blur', () => {
        handleInput(input);
      });
      
      // 同步自定義事件處理
      input.addEventListener('value-sync', (e) => {
        handleInput(input);
      });
    });

    // 複選框事件（自動替換）
    if (!isManual && checkboxOrButton && !checkboxOrButton.dataset.hasChangeHandler) {
      checkboxOrButton.dataset.hasChangeHandler = 'true';
      checkboxOrButton.addEventListener('change', () => {
        handleInput(fromInputElement);
      });
    }

    // 替換按鈕事件（手動替換）
    if (isManual && isButton && !checkboxOrButton.dataset.hasClickHandler) {
      checkboxOrButton.dataset.hasClickHandler = 'true';
      checkboxOrButton.addEventListener('click', () => {
        if (executeReplaceFn) {
          executeReplaceFn(textArea, fromInputElement.value, toInputElement.value);
        }
      });
    }

    // 監聽文本區域的變化以更新按鈕狀態（手動替換）
    if (isManual) {
      textArea.addEventListener('input', updateButtonState);
    }
  },
  
  /** 發送消息到 content script */
  _sendMessageToContentScript(group, isManual) {
    try {
      chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
        if (!tabs[0]) {
          console.log('找不到活動標籤頁');
          return;
        }
        
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

          // 發送完整的規則列表
          chrome.tabs.sendMessage(tabs[0].id, {
            action: isManual ? "updateManualReplaceRules" : "updateAutoReplaceRules",
            rules: rules
          }, function(response) {
            if (chrome.runtime.lastError) {
              console.debug('Content script 正在載入中...');
            } else {
              // 發送觸發替換的消息
              chrome.tabs.sendMessage(tabs[0].id, {
                action: isManual ? "triggerManualReplace" : "triggerAutoReplace"
              });
            }
          });
        } catch (error) {
          console.error('發送消息時出錯:', error);
        }
      });
    } catch (error) {
      console.error('準備發送消息時出錯:', error);
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
        
        // 新增：過濾掉空組（只有當 from 或 to 有內容時才保留）
        const filteredRules = rules.filter(rule => rule.from?.trim() || rule.to?.trim());
        console.log('過濾後的規則:', filteredRules);
        
        // 如果過濾後沒有規則，添加一個空規則作為預設
        const finalRules = filteredRules.length > 0 ? filteredRules : [{ from: '', to: '' }];
        
        // 創建組（使用過濾後的規則）
        finalRules.forEach((rule, index) => {
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
        
        // 創建和添加所有組
        const groups = [];
        finalRules.forEach(rule => {
          const group = createGroupFn(textArea, rule);
          otherContainer.appendChild(group);
          groups.push(group);
        });

        // 在所有組添加到 DOM 後，設置拖曳事件
        requestAnimationFrame(() => {
          // 為每個組設置拖曳事件
          groups.forEach(group => {
            if (group.dragHandle) {
              window.AutoReplaceManager.setupDragEvents(group, group.dragHandle);
            }
          });
        });

        if (onInitialized) onInitialized();
      });

      // 監聽文本變化
      textArea.addEventListener('input', () => window.AutoReplaceManager.handleAutoReplace(textArea));
    }
  },
  
  // 統一的存儲邏輯
  StorageHelper: {
    /**
     * 統一的規則保存方法
     * @param {string} key - 存儲鍵名
     * @param {Array} rules - 規則數組
     * @param {Function} callback - 回調函數
     */
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

    /**
     * 統一的規則讀取方法
     * @param {string} key - 存儲鍵名
     * @param {Array} defaultValue - 默認值
     * @param {Function} callback - 回調函數
     */
    loadRules(key, defaultValue, callback) {
      const storageKey = key.startsWith('replace_') ? key : `replace_${key}`;
      chrome.storage.local.get([storageKey], (result) => {
        const rules = result[storageKey] || defaultValue;
        if (callback) callback(rules);
      });
    },
    
    /**
     * 從容器提取規則
     * @param {Object} options - 配置項
     * @param {HTMLElement} options.container - 容器元素
     * @param {string} options.groupSelector - 組選擇器
     * @param {boolean} options.hasCheckbox - 是否有啟用勾選框
     * @returns {Array} - 提取的規則數組
     */
    extractRulesFromDOM(options) {
      const {
        container,
        groupSelector,
        hasCheckbox = false
      } = options;
      
      if (!container) return [];
      
      return Array.from(container.querySelectorAll(groupSelector)).map(group => {
        // 找出所有輸入框元素
        const inputs = Array.from(group.querySelectorAll('.replace-input'));
        
        // 如果輸入框是被包裹在容器中的，需要進一步處理
        let fromInput, toInput;
        
        if (inputs.length === 0) {
          // 如果沒有直接的輸入框，查找包裝在容器中的
          const containers = Array.from(group.children)
            .filter(el => el.classList.contains('replace-input-container'));
          
          fromInput = containers[0]?.querySelector('.replace-input');
          toInput = containers[1]?.querySelector('.replace-input');
        } else {
          // 直接使用找到的輸入框
          fromInput = inputs[0];
          toInput = inputs[1];
        }
        
        // 創建規則對象
        const rule = {
          from: fromInput?.value?.trim() || '',
          to: toInput?.value?.trim() || ''
        };
        
        // 如果有勾選框，添加啟用狀態
        if (hasCheckbox) {
          const checkbox = group.querySelector('.auto-replace-checkbox');
          rule.enabled = checkbox?.checked || false;
        }
        
        return rule;
      });
    }
  },

  // 拖曳管理功能
  DragManager: {
    setupSortDragEvents(button, options = {}) {
      const {
        groupSelector = '.replace-extra-group',  // 默認組選擇器
        container = null,  // 允許外部傳入容器
        onComplete = null,  // 拖移完成回調
        placeholderId = 'drag-placeholder'  // 佔位符ID
      } = options || {};
      
      // 為每個拖曳實例創建獨立的狀態
      const dragState = {
        isDragging: false,
        startY: 0,
        startX: 0,
        startRect: null,
        placeholder: null,
        scrollInterval: null
      };
      
      button.addEventListener('mousedown', (e) => {
        e.preventDefault();
        // 先找到當前拖曳的組元素
        const group = button.closest(groupSelector);
        if (!group) return;
        
        // 確定容器元素
        let targetContainer = container;
        if (!targetContainer) {
          // 如果未指定容器，嘗試從組元素獲取父元素
          targetContainer = group.parentElement;
          if (!targetContainer) {
            console.error('無法找到有效的容器元素');
            return; // 中止操作
          }
        }
        
        dragState.isDragging = true;
        dragState.startX = e.clientX;
        dragState.startY = e.clientY;
        
        // 獲取初始位置和尺寸
        dragState.startRect = group.getBoundingClientRect();
        
        // 創建佔位元素
        dragState.placeholder = group.cloneNode(true);
        dragState.placeholder.style.opacity = '0.3';
        dragState.placeholder.style.pointerEvents = 'none';
        dragState.placeholder.id = placeholderId;
        dragState.placeholder.classList.add(groupSelector.replace('.', '')); // 保持相同的基本樣式
        
        // 設置拖曳中的組樣式
        group.style.position = 'fixed';
        group.style.zIndex = '1000';
        group.style.width = `${dragState.startRect.width}px`;
        group.style.left = `${dragState.startRect.left}px`;
        group.style.top = `${dragState.startRect.top}px`;
        group.style.backgroundColor = '#fff';
        group.style.transform = 'scale(1.02)';
        group.style.boxShadow = '0 4px 15px rgba(0,0,0,0.35)';
        
        // 將 placeholder 插入到 DOM 中 group 原本的位置
        targetContainer.insertBefore(dragState.placeholder, group);
        
        const moveHandler = (e) => {
          if (!dragState.isDragging) return;
          
          // 使用幫助函數處理移動邏輯
          const scrollInfo = this._handleSortMouseMove(e, group, dragState.placeholder, targetContainer, 
                                                 true, dragState.startX, dragState.startY, dragState.startRect, 
                                                 placeholderId, groupSelector);
          
          // 處理滾動邏輯
          const { isInTopScrollZone, isInBottomScrollZone } = scrollInfo;
          
          // 清除現有的滾動定時器
          if (dragState.scrollInterval) {
            clearInterval(dragState.scrollInterval);
            dragState.scrollInterval = null;
          }
          
          // 如果在滾動區域內，設置新的滾動定時器
          if (isInTopScrollZone || isInBottomScrollZone) {
            dragState.scrollInterval = setInterval(() => {
              if (isInTopScrollZone) {
                targetContainer.scrollTop -= 5;
              } else if (isInBottomScrollZone) {
                targetContainer.scrollTop += 5;
              }
            }, 16); // 約60fps的滾動速率
          }
        };
        
        const upHandler = () => {
          if (!dragState.isDragging) return;
          dragState.isDragging = false;
          
          this._handleSortMouseUp(group, dragState.placeholder, targetContainer, 
                             onComplete, dragState.scrollInterval, moveHandler, upHandler);
        };
        
        document.addEventListener('mousemove', moveHandler);
        document.addEventListener('mouseup', upHandler);
      });
    },
    
    _handleSortMouseMove(e, group, placeholder, container, 
                        lockHorizontal, startX, startY, startRect, placeholderId, groupSelector) {
      // 檢查必要參數
      if (!group || !placeholder || !container || !startRect) {
        console.error('_handleSortMouseMove: 缺少必要參數', { 
          group, placeholder, container, startRect 
        });
        return { isInTopScrollZone: false, isInBottomScrollZone: false };
      }
      
      // 計算新位置
      const deltaYDragging = e.clientY - startY;
      const deltaXDragging = e.clientX - startX;
      const newTop = startRect.top + deltaYDragging;
      // 水平位置固定不變
      const newLeft = startRect.left;
      
      // 更新拖曳元素位置
      group.style.top = `${newTop}px`;
      group.style.left = `${newLeft}px`;
      
      // 安全獲取容器矩形
      let containerRect;
      try {
        containerRect = container.getBoundingClientRect();
      } catch (error) {
        console.error('獲取容器位置信息失敗:', error);
        return { isInTopScrollZone: false, isInBottomScrollZone: false };
      }
      
      // 取得佔位符與拖移元素的相對位置
      const placeholderRect = placeholder.getBoundingClientRect();
      const groupRect = group.getBoundingClientRect();
      
      let nextSibling = null;
      let shouldMove = false; // 添加明確的移動標記
      
      // 用佔位符跟拖移元素相對位置來判斷方向
      if (placeholderRect.top < groupRect.top) {
        // 佔位符在拖移元素上方，往下移
        console.log('拖移方向：往下');
        
        const nextElement = placeholder.nextElementSibling;
        if (nextElement && nextElement !== group && nextElement.id !== placeholderId) {
          const nextElementRect = nextElement.getBoundingClientRect();
          const nextElementTop = nextElementRect.top;
          
          // 滑鼠位置比下個元素的頂部還大時，把佔位符插入到下個元素之後
          if (e.clientY > nextElementTop) {
            nextSibling = nextElement.nextElementSibling; // 插入到下個元素之後
            shouldMove = true;
            console.log('觸發往下移動：滑鼠超過下個元素頂部');
          }
        } else if (nextElement === group) {
          // 如果下個元素是拖移元素本身，檢查再下一個元素
          const nextNextElement = group.nextElementSibling;
          if (nextNextElement && nextNextElement.id !== placeholderId) {
            const nextNextElementRect = nextNextElement.getBoundingClientRect();
            const nextNextElementTop = nextNextElementRect.top;
            
            if (e.clientY > nextNextElementTop) {
              nextSibling = nextNextElement.nextElementSibling; // 插入到下下個元素之後
              shouldMove = true;
              console.log('觸發往下移動：滑鼠超過下下個元素頂部');
            }
          } else if (!nextNextElement) {
            // 已經是最後一個元素，檢查是否要移到最後
            const groupBottom = groupRect.bottom;
            if (e.clientY > groupBottom) {
              nextSibling = null; // 移到最後
              shouldMove = true;
              console.log('觸發移到最後：滑鼠超過拖移元素底部');
            }
          }
        }
      } else {
        // 佔位符在拖移元素下方，往上移
        console.log('拖移方向：往上');
        
        // 找到佔位符的前一個元素
        const allSiblings = Array.from(container.querySelectorAll(groupSelector) || []);
        const placeholderIndex = allSiblings.indexOf(placeholder);
        
        if (placeholderIndex > 0) {
          const prevElement = allSiblings[placeholderIndex - 1];
          if (prevElement && prevElement !== group && prevElement.id !== placeholderId) {
            const prevElementRect = prevElement.getBoundingClientRect();
            const prevElementBottom = prevElementRect.bottom;
            
            // 滑鼠位置比上個元素的底部還小時，把佔位符插入到上個元素之前
            if (e.clientY < prevElementBottom) {
              nextSibling = prevElement; // 插入到上個元素之前
              shouldMove = true;
              console.log(`觸發往上移動：滑鼠Y${e.clientY}低於上個元素底部Y${prevElementBottom}`);
          }
          } else if (prevElement === group) {
            // 如果上個元素是拖移元素本身，檢查再上一個元素
            if (placeholderIndex > 1) {
              const prevPrevElement = allSiblings[placeholderIndex - 2];
              if (prevPrevElement && prevPrevElement.id !== placeholderId) {
                const prevPrevElementRect = prevPrevElement.getBoundingClientRect();
                const prevPrevElementBottom = prevPrevElementRect.bottom;
                
                if (e.clientY < prevPrevElementBottom) {
                  nextSibling = prevPrevElement; // 插入到上上個元素之前
                  shouldMove = true;
                  console.log('觸發往上移動：滑鼠低於上上個元素底部');
          }
        }
            } else {
              // 已經是第一個元素，檢查是否要移到最前
              const groupTop = groupRect.top;
              if (e.clientY < groupTop) {
                nextSibling = allSiblings[0]; // 移到最前
                shouldMove = true;
                console.log('觸發移到最前：滑鼠高於拖移元素頂部');
              }
            }
          }
        }
      }
      
      // 檢查是否需要移動佔位符
      if (placeholder && container.contains(placeholder) && shouldMove) {
        const placeholderCurrentPosition = placeholder.nextSibling;
        const needsMove = nextSibling !== placeholderCurrentPosition;
        
        if (needsMove) {
          try {
            container.insertBefore(placeholder, nextSibling);
            console.log('佔位符已移動到新位置');
          } catch (error) {
            console.error('移動佔位符失敗:', error);
          }
        }
      }

      // 處理容器滾動
      const margin = 50;
      const isInTopScrollZone = e.clientY - containerRect.top < margin && container.scrollTop > 0;
      const isInBottomScrollZone = containerRect.bottom - e.clientY < margin && 
                                container.scrollTop < container.scrollHeight - container.clientHeight;
      
      return {
        isInTopScrollZone,
        isInBottomScrollZone
      };
    },
    
    _handleSortMouseUp(group, placeholder, container, onComplete, scrollInterval, moveHandler, upHandler) {
      // 檢查必要參數
      if (!group) {
        console.error('_handleSortMouseUp: 缺少必要參數 group');
        return;
      }
      
      // 清除滾動定時器
      if (scrollInterval) {
        try {
          clearInterval(scrollInterval);
        } catch (error) {
          console.error('清除滾動定時器失敗:', error);
        }
      }
      
      // 恢復組的樣式
      group.style.position = '';
      group.style.zIndex = '';
      group.style.width = '';
      group.style.left = '';
      group.style.top = '';
      group.style.transform = '';
      group.style.boxShadow = '';
      group.style.backgroundColor = '';
      
      // 移動到新位置
      if (placeholder && container && container.contains(placeholder)) {
        try {
          container.insertBefore(group, placeholder);
          placeholder.remove();
          
          // 調用完成回調
          if (typeof onComplete === 'function') {
            onComplete(container);
          }
        } catch (error) {
          console.error('移動元素到新位置失敗:', error);
        }
      } else {
        // 如果無法找到佔位符或容器，嘗試恢復正常顯示
        if (group.parentElement) {
          console.log('無法找到佔位符或容器，嘗試恢復正常顯示');
        }
      }
      
      // 移除事件監聽器
      if (moveHandler) {
        document.removeEventListener('mousemove', moveHandler);
      }
      if (upHandler) {
        document.removeEventListener('mouseup', upHandler);
      }
    }
  },
};

window.ReplaceManager = ReplaceManager;

// 🆕 監聽設定更新消息，用於同步後刷新UI
if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onMessage) {
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    // 只處理設定更新消息
    if (request.action === 'settingsUpdated') {
      const { reason, changedKeys } = request.data || {};
      
      console.log('[ReplaceManager] 🔔 收到設定更新消息:', { reason, changedKeys });
      
      // 檢查是否需要刷新手動替換組
      if (changedKeys && window.ManualReplaceManager && window.ManualReplaceManager.shouldRefresh(changedKeys)) {
        console.log('[ReplaceManager] 🔄 檢測到手動替換規則變化，開始刷新UI');
        
        // 延遲一點執行，確保設定已經完全保存
        setTimeout(() => {
          window.ManualReplaceManager.refreshFromStorage();
        }, 200);
      }
      
      // 向背景腳本回應已處理
      if (sendResponse) {
        sendResponse({ received: true, processed: true });
      }
    }
    
    return false; // 不保持消息通道開啟
  });
  
  console.log('[ReplaceManager] 📡 設定更新消息監聽器已設置');
} 