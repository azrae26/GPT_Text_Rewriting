/** 文字替換管理整合模組 */
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

    // 監聽所有替換輸入框的點擊事件
    container.addEventListener('click', (e) => {
      const input = e.target;
      if (input.classList.contains('replace-input') && 
          !input.closest('.replace-main-group') && 
          input.value.length > 38) {
        
        // 計算位置
        const inputRect = input.getBoundingClientRect();
        const left = inputRect.left + (input.offsetWidth - 450) / 2;
        const top = inputRect.bottom + 5;

        // 設定大型輸入框位置和內容
        largeInput.style.left = `${left}px`;
        largeInput.style.top = `${top}px`;
        largeInput.value = input.value;
        largeInput.style.display = 'block';
        largeInput.focus();

        // 儲存對應的原始輸入框引用
        largeInput.originalInput = input;
      }
    });

    // 監聽大型輸入框失去焦點事件
    largeInput.addEventListener('blur', () => {
      if (largeInput.originalInput) {
        largeInput.originalInput.value = largeInput.value;
        largeInput.style.display = 'none';
        largeInput.originalInput = null;
      }
    });

    // 監聽ESC鍵關閉大型輸入框
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && largeInput.style.display === 'block') {
        largeInput.blur();
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
                const fromInput = containers[0]?.querySelector('textarea');
                const toInput = containers[1]?.querySelector('textarea');
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

      // 從 local storage 讀取規則
      chrome.storage.local.get([storageKey], (result) => {
        console.log('讀取到的規則:', result[storageKey]);
        
        const rules = (result[storageKey] || [])
          .filter(rule => rule.from?.trim() || rule.to?.trim());
        
        console.log('過濾後的規則:', rules);
        
        if (rules.length === 0) {
          rules.push({});
        }
        
        rules.forEach(rule => {
          manualContainer.appendChild(createGroupFn(textArea, false, rule));
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
      
      // 自動替換初始化
      chrome.storage.local.get([storageKey], (result) => {
        console.log('讀取到的規則:', result[storageKey]);
        
        const rules = (result[storageKey] || [])
          .filter(rule => rule.from?.trim() || rule.to?.trim());
        
        console.log('過濾後的規則:', rules);
        
        if (rules.length === 0) rules.push({});
        
        rules.forEach(rule => {
          const group = createGroupFn(textArea, rule);
          otherContainer.appendChild(group);
        });

        if (onInitialized) onInitialized();
      });

      // 監聽文本變化
      textArea.addEventListener('input', () => window.AutoReplaceManager.handleAutoReplace(textArea));
    }
  }
};

window.ReplaceManager = ReplaceManager; 