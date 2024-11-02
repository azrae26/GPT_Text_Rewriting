/* global GlobalSettings, TextProcessor, Notification */
/**
 * UI 管理模組，負責管理使用者介面的元素和事件。
 */
const UIManager = {
  /**
   * 向網頁中添加改寫按鈕和復原按鈕。
   */
  addRewriteButton() {
    console.log('開始添加改寫按鈕');
    if (!window.shouldEnableFeatures()) {
      console.log('當前頁面不符合啟用條件，不添加改寫按鈕');
      return;
    }

    const existingButton = document.getElementById('gpt-rewrite-button');
    if (existingButton) {
      console.log('改寫按鈕已存在，不重複添加');
      return;
    }

    const textArea = document.querySelector('textarea[name="content"]');
    if (!textArea) {
      console.log('找不到文本區域，無法添加改寫按鈕');
      return;
    }

    const buttonContainer = document.createElement('div');
    buttonContainer.id = 'gpt-button-container';

    const rewriteButton = document.createElement('button');
    rewriteButton.id = 'gpt-rewrite-button';
    rewriteButton.textContent = '改寫';

    const undoButton = document.createElement('button');
    undoButton.id = 'gpt-undo-button';
    undoButton.textContent = '復原';

    rewriteButton.addEventListener('click', async function() {
      try {
        await window.GlobalSettings.loadSettings();
        if (!window.GlobalSettings.apiKeys['gemini-1.5-flash'] && !window.GlobalSettings.apiKeys['gpt-4']) {
          alert('請先在擴展設置中輸入至少一個 API 金鑰');
          return;
        }
        if (!window.GlobalSettings.instruction.trim()) {
          alert('改寫要求不能為空，請在擴展設置中輸入改寫要求');
          return;
        }
        
        rewriteButton.disabled = true;
        window.GlobalSettings.originalContent = textArea.value;
        await window.TextProcessor.rewriteText();
        console.log('改寫成功完成');
      } catch (error) {
        console.error('Error in rewrite process:', error);
        alert('改寫過程中發生錯誤: ' + error.message);
      } finally {
        rewriteButton.disabled = false;
      }
    });

    undoButton.addEventListener('click', handleUndo);

    buttonContainer.appendChild(rewriteButton);
    buttonContainer.appendChild(undoButton);

    const textAreaParent = textArea.parentElement;
    textAreaParent.style.position = 'relative';
    textAreaParent.appendChild(buttonContainer);

    textAreaParent.style.display = 'flex';
    textAreaParent.style.flexDirection = 'column';
    textAreaParent.style.alignItems = 'flex-end';

    console.log('改寫按鈕添加成功');
  },

  /**
   * 初始化股票代碼功能，在文本區域附近顯示股票代碼按鈕。
   */
  initializeStockCodeFeature() {
    console.log('開始初始化股票代碼功能');
    if (!window.shouldEnableFeatures()) {
      console.log('當前頁面不符合啟用股票代號功能條件');
      this.removeStockCodeFeature();
      return;
    }

    const contentTextarea = document.querySelector('textarea[name="content"]');
    const stockCodeInput = document.querySelector('input[id=":r7:"]');
    
    if (!contentTextarea || !stockCodeInput) {
      console.log('找不到必要的元素，股票代號功能未初始化');
      return;
    }

    let stockCodeContainer = document.getElementById('stock-code-container');
    if (!stockCodeContainer) {
      stockCodeContainer = document.createElement('div');
      stockCodeContainer.id = 'stock-code-container';
      document.body.appendChild(stockCodeContainer);
    }

    function updateStockCodeContainerPosition() {
      if (stockCodeInput) {
        const rect = stockCodeInput.getBoundingClientRect();
        stockCodeContainer.style.top = `${rect.top + window.scrollY - stockCodeContainer.offsetHeight + 9}px`;
        stockCodeContainer.style.left = `${rect.right + window.scrollX - stockCodeContainer.offsetWidth + 28}px`;
      }
    }

    function detectStockCodes(text) {
      const stockCodeRegex = /[（(]([0-9]{4})(?:[-\s.]*(?:TW|TWO))?[）)]|[（(]([0-9]{4})[-\s.]+(?:TW|TWO)[）)]/g;
      const matches = text.matchAll(stockCodeRegex);
      const stockCodes = [...new Set([...matches].map(match => match[1] || match[2]))];
      return stockCodes;
    }

    function updateStockCodeButtons(stockCodes) {
      stockCodeContainer.innerHTML = '';
      stockCodes.forEach(code => {
        const button = document.createElement('button');
        button.textContent = code;
        button.classList.add('stock-code-button');
        button.addEventListener('click', () => {
          stockCodeInput.value = code;
          stockCodeInput.dispatchEvent(new Event('input', { bubbles: true }));
          
          stockCodeInput.focus();
          setTimeout(() => {
            stockCodeInput.blur();
          }, 10);
        });
        stockCodeContainer.appendChild(button);
      });
      updateStockCodeContainerPosition();
    }

    function handleContentChange() {
      const content = contentTextarea.value;
      const stockCodes = detectStockCodes(content);
      updateStockCodeButtons(stockCodes);
      
      if (stockCodes.length > 0 && !stockCodeInput.value) {
        stockCodeInput.value = stockCodes[0];
        stockCodeInput.dispatchEvent(new Event('input', { bubbles: true }));
        
        stockCodeInput.focus();
        setTimeout(() => {
          stockCodeInput.blur();
        }, 10);
      }
    }

    contentTextarea.addEventListener('input', handleContentChange);
    window.addEventListener('resize', updateStockCodeContainerPosition);
    window.addEventListener('scroll', updateStockCodeContainerPosition);
    
    handleContentChange();

    contentTextarea.addEventListener('dblclick', async function(event) {
      console.log('檢測到雙擊事件');
      const selectedText = window.getSelection().toString();
      
      console.log('選中的文本:', selectedText);
      if (selectedText.trim() !== '' && selectedText.length <= 10) {
        const start = Math.max(0, this.selectionStart - 4);
        const end = Math.min(this.value.length, this.selectionEnd + 4);
        const extendedText = this.value.substring(start, end);
        
        console.log('選中範圍:', { start: this.selectionStart, end: this.selectionEnd });
        console.log('擴展後的範圍:', { start, end });
        console.log('擴展檢查的文本:', extendedText);
        
        const matchResult = window.TextProcessor.findSpecialText(extendedText);
        if (matchResult) {
          console.log('找到匹配的特殊文本:', matchResult);
          try {
            const settings = await window.GlobalSettings.loadSettings();
            if (!window.GlobalSettings.apiKeys['gemini-1.5-flash'] && !window.GlobalSettings.apiKeys['gpt-4']) {
              console.log('API 金鑰或短文本改寫指令未設置，跳過自動改寫');
              return;
            }
            
            let shouldProceed = true;
            
            if (settings.confirmModel || settings.confirmContent) {
              const selectedModel = settings.autoRewriteModel || window.GlobalSettings.model;
              const confirmMessage = `確定要使用 ${selectedModel} 模型自動改寫以下內容嗎？\n\n文本：${matchResult.matchedText}\n\n指令：${window.GlobalSettings.shortInstruction}`;
              shouldProceed = confirm(confirmMessage);
            }
            
            if (shouldProceed) {
              console.log('開始自動改寫流程');
              window.GlobalSettings.selectedOriginalContent = this.value;
              console.log('準備改寫的文本:', matchResult.matchedText);
              const rewrittenText = await window.TextProcessor.rewriteText(matchResult.matchedText, true);
              
              if (rewrittenText && rewrittenText.trim() !== matchResult.matchedText) {
                console.log('開始替換文本');
                const newText = this.value.substring(0, start + matchResult.startIndex) +
                                rewrittenText +
                                this.value.substring(start + matchResult.endIndex);
                
                console.log('改寫前的文本:', matchResult.matchedText);
                console.log('改寫後的文本:', rewrittenText);
                
                this.value = newText;
                console.log('文本已替換');
                this.dispatchEvent(new Event('input', { bubbles: true }));
                console.log('已觸發輸入事件');
                
                const undoButton = document.getElementById('gpt-undo-button');
                if (undoButton) {
                  undoButton.style.display = 'inline-block';
                  console.log('復原按鈕已顯示');
                }
                
                window.Notification.removeNotification();
                
                console.log('準備顯示改寫完成通知');
                await window.Notification.showNotification('自動改寫已完成', false);
                console.log('改寫完成通知顯示結束');
                
                console.log('反白自動改寫完成');
              } else {
                console.log('API 返回的改寫文本無效，或改寫結果與原文相同');
                window.Notification.removeNotification();
              }
            } else {
              console.log('用戶取消了自動改寫操作');
              window.Notification.removeNotification();
            }
          } catch (error) {
            console.error('自動改寫過程中發生錯誤:', error);
            alert(`自動改寫過程中發生錯誤: ${error.message}\n請檢查您的設置並重試。`);
          }
        } else {
          console.log('未找到匹配的特殊文本，擴展檢查的文本為:', extendedText);
        }
      } else {
        console.log('未選中任何文或選中文本超過10個字');
      }
    });

    console.log('股代碼功能初始化成');
  },

  /**
   * 移除股票代碼功能相關的元素和事件監聽器。
   */
  removeStockCodeFeature() {
    const stockCodeContainer = document.getElementById('stock-code-container');
    if (stockCodeContainer) {
      stockCodeContainer.remove();
    }
    const contentTextarea = document.querySelector('textarea[name="content"]');
    if (contentTextarea) {
      contentTextarea.removeEventListener('input', handleContentChange);
    }
    window.removeEventListener('resize', updateStockCodeContainerPosition);
    window.removeEventListener('scroll', updateStockCodeContainerPosition);
  },

  /**
   * 移除改寫按鈕和復原按鈕。
   */
  removeRewriteButton() {
    const buttonContainer = document.getElementById('gpt-button-container');
    if (buttonContainer) {
      buttonContainer.remove();
      console.log('改寫按鈕已移除');
    }
  }
};

window.UIManager = UIManager;
