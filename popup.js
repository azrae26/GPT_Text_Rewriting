/**
 * popup.js - 擴充功能彈出視窗的主要腳本
 * 功能：管理 API 金鑰、改寫設置、模型選擇等配置項目
 */

document.addEventListener('DOMContentLoaded', async function() {
  console.log('DOM 載入完成，開始初始化...');
  
  // 1. DOM 元素獲取 (按功能分組)
  // API 和模型相關
  const apiKeyInput = document.getElementById('api-key');
  const modelSelect = document.getElementById('model-select');
  
  // 改寫相關
  const instructionInput = document.getElementById('instruction');
  const shortInstructionInput = document.getElementById('shortInstruction');
  const autoRewritePatternsInput = document.getElementById('autoRewritePatterns');
  const fullRewriteModelSelect = document.getElementById('fullRewriteModel');
  const shortRewriteModelSelect = document.getElementById('shortRewriteModel');
  const autoRewriteModelSelect = document.getElementById('autoRewriteModel');
  const rewriteButton = document.getElementById('rewrite');
  
  // 翻譯相關
  const translateModelSelect = document.getElementById('translateModel');
  const translateInstructionInput = document.getElementById('translateInstruction');
  const removeHashCheckbox = document.getElementById('removeHash');
  const removeStarCheckbox = document.getElementById('removeStar');
  
  // 關鍵要點相關
  const summaryModelSelect = document.getElementById('summaryModel');
  const summaryInstructionInput = document.getElementById('summaryInstruction');
  
  // 其他按鈕
  const aiAssistantButton = document.getElementById('aiAssistant');

  // 高亮功能
  const highlightWordsInput = document.getElementById('highlight-words');

  // 2. 初始化設定
  let apiKeys = {
    'openai': '',
    'gemini-1.5-flash': ''
  };

  // 載入使用者設定，如果沒有設定，則使用預設設定
  let settings = await GlobalSettings.loadSettings();
  console.log('載入儲存的設置:', settings);
  
  // 如果首次載入，則應用預設設定
  if (settings.firstRun === true && typeof DefaultSettings !== 'undefined') {
    console.log('首次載入，應用預設設定');
    await GlobalSettings.saveSettings();
  } else {
    console.log('非首次載入，應用已保存的設定');
    // API 相關
    apiKeys = settings.apiKeys || {};
    
    // 改寫相關
    instructionInput.value = settings.instruction || '';
    shortInstructionInput.value = settings.shortInstruction || '';
    autoRewritePatternsInput.value = settings.autoRewritePatterns || '';
    fullRewriteModelSelect.value = settings.fullRewriteModel || 'gemini-1.5-flash';
    shortRewriteModelSelect.value = settings.shortRewriteModel || 'gemini-1.5-flash';
    autoRewriteModelSelect.value = settings.autoRewriteModel || 'gemini-1.5-flash';
    
    // 翻譯相關
    translateModelSelect.value = settings.translateModel || 'gemini-1.5-flash'; // 預設使用 Gemini 1.5 Flash
    translateInstructionInput.value = settings.translateInstruction || ''; // 預設為空
    removeHashCheckbox.checked = settings.removeHash !== undefined ? settings.removeHash : true; // 預設為勾選
    removeStarCheckbox.checked = settings.removeStar !== undefined ? settings.removeStar : true; // 預設為勾選
    
    // 關鍵要點相關
    summaryModelSelect.value = settings.summaryModel || 'gemini-1.5-flash'; // 預設使用 Gemini 1.5 Flash
    summaryInstructionInput.value = settings.summaryInstruction || ''; // 預設為空
  }
  
  updateApiKeyInput();

  // 載入已保存的高亮文字
  chrome.storage.sync.get('highlightWords', function(data) {
    if (data.highlightWords) {
      highlightWordsInput.value = data.highlightWords;
      updateHighlightWords(data.highlightWords); // 初始化時就更新高亮
    }
  });

  // 新增：載入上次的分頁狀態
  chrome.storage.sync.get(['lastMainTab', 'lastSubTab'], function(data) {
    if (data.lastMainTab) {
      // 切換主分頁
      const mainTab = document.querySelector(`.main-tab[data-tab="${data.lastMainTab}"]`);
      const mainTabContent = document.getElementById(`${data.lastMainTab}-tab`);
      if (mainTab && mainTabContent) {
        document.querySelectorAll('.main-tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.main-tab-content').forEach(c => c.classList.remove('active'));
        mainTab.classList.add('active');
        mainTabContent.classList.add('active');
      }
    }

    if (data.lastSubTab) {
      // 切換子分頁
      const subTab = document.querySelector(`.tab[data-tab="${data.lastSubTab}"]`);
      const subTabContent = document.getElementById(`${data.lastSubTab}-tab`);
      if (subTab && subTabContent) {
        document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
        subTab.classList.add('active');
        subTabContent.classList.add('active');
      }
    }
  });

  // 3. API 和模型相關事件處理
  // API 金鑰輸入
  function updateApiKeyInput() {
    apiKeyInput.value = apiKeys[modelSelect.value] || '';
  }

  // 當 API 金鑰輸入變更時自動保存
  apiKeyInput.addEventListener('input', async function() {
    apiKeys[modelSelect.value] = this.value;
    await GlobalSettings.saveSingleSetting('apiKeys', apiKeys);
    updateContentScript();
  });

  // API 模型選擇
  modelSelect.addEventListener('change', updateApiKeyInput);

  // 4. 所有指令輸入相關事件處理
  // 全文改寫指令
  instructionInput.addEventListener('input', async function() {
    await GlobalSettings.saveSingleSetting('instruction', instructionInput.value);
  });

  // 短改寫指令
  shortInstructionInput.addEventListener('input', async function() {
    await GlobalSettings.saveSingleSetting('shortInstruction', shortInstructionInput.value);
  });

  // 自動改寫匹配模式
  autoRewritePatternsInput.addEventListener('input', async function() {
    await GlobalSettings.saveSingleSetting('autoRewritePatterns', autoRewritePatternsInput.value);
    sendAutoRewritePatternsUpdate();
  });

  // 翻譯指令
  translateInstructionInput.addEventListener('input', async function() {
    await GlobalSettings.saveSingleSetting('translateInstruction', translateInstructionInput.value);
  });

  // 關鍵要點指令
  summaryInstructionInput.addEventListener('input', async function() {
    await GlobalSettings.saveSingleSetting('summaryInstruction', summaryInstructionInput.value);
  });

  // 5. 所有模型選擇相關事件處理
  // 全改寫模型選擇
  fullRewriteModelSelect.addEventListener('change', async function() {
    await GlobalSettings.saveModelSelection('fullRewriteModel', this.value);
    updateContentScript();
  });
  // 短改寫模型選擇
  shortRewriteModelSelect.addEventListener('change', async function() {
    await GlobalSettings.saveModelSelection('shortRewriteModel', this.value);
    updateContentScript();
  });
  // 自動改寫模型選擇
  autoRewriteModelSelect.addEventListener('change', async function() {
    await GlobalSettings.saveModelSelection('autoRewriteModel', this.value);
    updateContentScript();
  });

  // 6. 翻譯相關事件處理
  // 翻譯模型選擇
  translateModelSelect.addEventListener('change', async function() {
    await GlobalSettings.saveModelSelection('translateModel', this.value);
    updateContentScript();
  });
  // 移除##設置
  removeHashCheckbox.addEventListener('change', async function() {
    await GlobalSettings.saveSingleSetting('removeHash', removeHashCheckbox.checked);
    console.log('移除##設置已更新:', removeHashCheckbox.checked);
    updateContentScript();
  });
  // 移除**設置
  removeStarCheckbox.addEventListener('change', async function() {
    await GlobalSettings.saveSingleSetting('removeStar', removeStarCheckbox.checked);
    console.log('移除**設置已更新:', removeStarCheckbox.checked);
    updateContentScript();
  });

  // 7. 關鍵要點相關事件處理
  // 關鍵要點模型選擇
  summaryModelSelect.addEventListener('change', async function() {
    await GlobalSettings.saveModelSelection('summaryModel', this.value);
    updateContentScript();
  });

  // 8. 保存按鈕事件處理
  // saveButton.addEventListener('click', async function() {
  //   apiKeys[modelSelect.value] = apiKeyInput.value;
  //   await GlobalSettings.saveSettings({
  //     apiKeys: apiKeys, // API 金鑰
  //     instruction: instructionInput.value, // 改寫指令
  //     shortInstruction: shortInstructionInput.value, // 短改寫指令
  //     autoRewritePatterns: autoRewritePatternsInput.value, // 自動改寫匹配模式
  //     fullRewriteModel: fullRewriteModelSelect.value, // 全改寫模型
  //     shortRewriteModel: shortRewriteModelSelect.value, // 短改寫模型
  //     autoRewriteModel: autoRewriteModelSelect.value, // 自動改寫模型
  //     translateModel: translateModelSelect.value, // 翻譯模型
  //     translateInstruction: translateInstructionInput.value, // 翻譯指令
  //     removeHash: removeHashCheckbox.checked, // 移除##設置
  //     removeStar: removeStarCheckbox.checked, // 移除**設置
  //     summaryModel: summaryModelSelect.value, // 關鍵要點模型
  //     summaryInstruction: summaryInstructionInput.value // 關鍵要點指令
  //   });
  //   console.log('設置已保存');
  //   alert('設置已保存');
  //   updateContentScript();
  // });

  // 9. 功能按鈕事件處理
  rewriteButton.addEventListener('click', function() {
    chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
      chrome.tabs.sendMessage(tabs[0].id, {
        action: "rewrite", // 改寫請求
        apiKeys: apiKeys, // API 金鑰
        model: modelSelect.value, // API 模型
        instruction: instructionInput.value, // 改寫指令
        shortInstruction: shortInstructionInput.value, // 短改寫指令
        autoRewritePatterns: autoRewritePatternsInput.value, // 自動改寫匹配模式
        fullRewriteModel: fullRewriteModelSelect.value, // 全改寫模型
        shortRewriteModel: shortRewriteModelSelect.value, // 短改寫模型
        autoRewriteModel: autoRewriteModelSelect.value, // 自動改寫模型
        translateModel: translateModelSelect.value, // 翻譯模型
        translateInstruction: translateInstructionInput.value, // 翻譯指令
        removeHash: removeHashCheckbox.checked, // 移除##設置
        removeStar: removeStarCheckbox.checked // 移除**設置
      }, function(response) {
        if (response && response.success) {
          console.log('改寫請求已發送');
        } else {
          console.error('發送改寫請求失敗');
        }
      });
    });
  });

  // AI 助理按鈕事件處理
  if (aiAssistantButton) {
    aiAssistantButton.addEventListener('click', function() {
      chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
        chrome.tabs.sendMessage(tabs[0].id, {action: "activateAIAssistant"});
      });
    });
  }

  // 9. UI 相關功能
  // 分頁切換功能
  const tabs = document.querySelectorAll('.tab');
  const tabContents = document.querySelectorAll('.tab-content');

  tabs.forEach(tab => {
    tab.addEventListener('click', function() {
      const tabName = this.getAttribute('data-tab');
      tabs.forEach(t => t.classList.remove('active'));
      tabContents.forEach(c => c.classList.remove('active'));
      this.classList.add('active');
      document.getElementById(`${tabName}-tab`).classList.add('active');
      
      // 保存子分頁狀態
      chrome.storage.sync.set({ lastSubTab: tabName });
    });
  });

  // 主分頁切換功能
  const mainTabs = document.querySelectorAll('.main-tab');
  const mainTabContents = document.querySelectorAll('.main-tab-content');

  mainTabs.forEach(tab => {
    tab.addEventListener('click', function() {
      const tabName = this.getAttribute('data-tab');
      mainTabs.forEach(t => t.classList.remove('active'));
      mainTabContents.forEach(c => c.classList.remove('active'));
      tab.classList.add('active');
      document.getElementById(`${tabName}-tab`).classList.add('active');
      
      // 保存主分頁狀態
      chrome.storage.sync.set({ lastMainTab: tabName });
    });
  });

  // 10. 輔助功能
  function sendAutoRewritePatternsUpdate() {
    chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
      chrome.tabs.sendMessage(tabs[0].id, {
        action: "updateAutoRewritePatterns",
        patterns: autoRewritePatternsInput.value
      }, function(response) {
        if (response && response.success) {
          console.log('自動改寫匹配模式已更新');
        } else {
          console.error('更新自動改寫匹配模式失敗');
        }
      });
    });
  }

  // 更新 content.js 設置
  async function updateContentScript() {
    const settings = await GlobalSettings.loadSettings();
    chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
      chrome.tabs.sendMessage(tabs[0].id, {
        action: "updateSettings",
        settings: settings
      }, function(response) {
        if (response && response.success) {
          console.log('設置已成功更新到 content.js');
        } else {
          console.error('更新 content.js 設置失敗');
        }
      });
    });
  }

  // 監聽輸入事件
  highlightWordsInput?.addEventListener('input', function(e) {
    const oldLines = this.value.split('\n');
    const cursorPosition = this.selectionStart;
    
    // 找出被修改的是哪一行
    let currentLineNumber = 0;
    let charCount = 0;
    while (charCount <= cursorPosition && currentLineNumber < oldLines.length) {
      charCount += oldLines[currentLineNumber].length + 1;
      currentLineNumber++;
    }
    currentLineNumber--;
    
    // 取得修改前的所有文字
    const previousText = this._previousValue || '';
    const previousLines = previousText.split('\n');
    
    // 如果有這一行的舊文字，且有對應的顏色
    if (previousLines[currentLineNumber] && wordColors[previousLines[currentLineNumber]]) {
      const oldColor = wordColors[previousLines[currentLineNumber]];
      delete wordColors[previousLines[currentLineNumber]];
      wordColors[oldLines[currentLineNumber]] = oldColor;
      chrome.storage.sync.set({ highlightColors: wordColors });
    }
    
    // 儲存當前文字，供下次比對用
    this._previousValue = this.value;
    
    // 保存高亮文字
    const words = this.value;
    chrome.storage.sync.set({ highlightWords: words });
    
    // 更新高亮
    updateHighlightWords(words);
    
    // 更新預覽
    updatePreview();
  });

  // 更新高亮文字的函數
  function updateHighlightWords(text) {
    const words = text.split('\n').filter(word => word.trim());
    
    chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
      chrome.tabs.sendMessage(tabs[0].id, {
        action: "updateHighlightWords",
        words: words,
        colors: wordColors || {}
      });
    });
  }

  let selectedLine = -1;
  let wordColors = {};

  // 載入已保存的顏色設置
  chrome.storage.sync.get('highlightColors', function(data) {
    if (data.highlightColors) {
      wordColors = data.highlightColors;
    }
  });

  // 初始化顏色選擇器
  const colorBoxes = document.querySelectorAll('.color-box');
  colorBoxes.forEach(box => {
    const color = box.dataset.color;
    box.style.backgroundColor = color;
    
    box.addEventListener('click', () => {
      if (selectedLine >= 0) {
        const words = highlightWordsInput.value.split('\n');
        const word = words[selectedLine];
        if (word) {
          wordColors[word] = color;
          // 保存顏色設置
          chrome.storage.sync.set({ highlightColors: wordColors });
          
          // 更新預覽
          updatePreview();
          
          // 更新內容頁的高亮
          chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
            chrome.tabs.sendMessage(tabs[0].id, {
              action: "updateHighlightWords",
              words: words,
              colors: wordColors
            }, function() {
              // 強制觸發一次更新
              chrome.tabs.sendMessage(tabs[0].id, {
                action: "forceUpdateHighlights"
              });
            });
          });
        }
      }
    });
  });

  // 修改 highlightWordsInput 的點擊事件
  highlightWordsInput.addEventListener('click', function(e) {
    const text = this.value;
    const start = this.selectionStart;
    const lines = text.substr(0, start).split('\n');
    selectedLine = lines.length - 1;
  });

  // 修改 updateHighlightWords 函數
  function updateHighlightWords(text) {
    const words = text.split('\n').filter(word => word.trim());
    
    chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
      chrome.tabs.sendMessage(tabs[0].id, {
        action: "updateHighlightWords",
        words: words,
        colors: wordColors || {}
      });
    });
  }

  // 修改 updatePreview 函數
  function updatePreview() {
    // 清除舊的預覽
    const oldPreviews = document.querySelectorAll('.highlight-preview');
    oldPreviews.forEach(p => p.remove());

    const textarea = highlightWordsInput;
    const overlay = document.querySelector('.highlight-overlay');
    const text = textarea.value;
    const lines = text.split('\n');

    // 創建一個隱藏的 div 來計算位置
    const div = document.createElement('div');
    div.style.cssText = `
      position: absolute;
      visibility: hidden;
      white-space: pre-wrap;
      width: ${textarea.clientWidth}px;
      font: ${getComputedStyle(textarea).font};
      line-height: ${getComputedStyle(textarea).lineHeight};
      padding: ${getComputedStyle(textarea).padding};
    `;
    textarea.parentElement.appendChild(div);

    // 使用完整文字來計算位置
    div.textContent = text;
    const range = document.createRange();
    const textNode = div.firstChild;

    lines.forEach((line, index) => {
      if (!line.trim()) return;

      // 找到這一行的開始位置
      let lineStart = 0;
      for (let i = 0; i < index; i++) {
        lineStart += lines[i].length + 1;
      }

      // 使用 Range API 計算位置
      range.setStart(textNode, lineStart);
      range.setEnd(textNode, lineStart + line.length);
      
      // 獲取所有的 ClientRect
      const rects = range.getClientRects();
      const divRect = div.getBoundingClientRect();

      // 為每一個 rect 創建一個預覽元素
      for (let i = 0; i < rects.length; i++) {
        const rect = rects[i];
        
        // 創建預覽元素
        const preview = document.createElement('div');
        preview.className = 'highlight-preview';
        preview.style.top = `${rect.top - divRect.top}px`;
        preview.style.left = `${rect.left - divRect.left}px`; //  是左邊距
        preview.style.width = `${rect.width}px`;
        preview.style.backgroundColor = wordColors[line] || 'rgba(50, 205, 50, 0.3)';
        
        // 保存原始位置
        preview.dataset.originalTop = rect.top - divRect.top;
        
        // 將預覽元素添加到 overlay 中
        overlay.appendChild(preview);
      }
    });

    range.detach();
    div.remove();
    
    // 立即更新滾動位置
    updatePreviewsPosition();
  }

  // 修改 updatePreviewsPosition 函數
  function updatePreviewsPosition() {
    const textarea = highlightWordsInput;
    const scrollTop = textarea.scrollTop;

    const previews = document.querySelectorAll('.highlight-preview');
    previews.forEach(preview => {
      const originalTop = parseFloat(preview.dataset.originalTop);
      
      // 使用與 highlight.js 相同的邏輯
      preview.style.display = 'block';
      // 直接使用 transform 來調整位置
      preview.style.transform = `translateY(${-scrollTop}px)`;
    });
  }

  // 修改滾動事件處理
  highlightWordsInput.addEventListener('scroll', function() {
    requestAnimationFrame(() => {
      updatePreviewsPosition();
    });
  });

  // 在載入時初始化預覽
  chrome.storage.sync.get(['highlightWords', 'highlightColors'], function(data) {
    if (data.highlightColors) {
      wordColors = data.highlightColors;
    }
    if (data.highlightWords) {
      highlightWordsInput.value = data.highlightWords;
    }
    updatePreview();
  });

  // 監聽文字變更以更新預覽
  highlightWordsInput.addEventListener('input', function() {
    updatePreview();
  });

  // 初始化自動替換功能
  const autoReplaceContainer = document.querySelector('#auto-replace-tab .auto-replace-container');
  if (autoReplaceContainer) {
    // 引入 AutoReplaceManager
    const script = document.createElement('script');
    script.src = 'text_replace/auto-replace-manager.js';
    script.onload = function() {
      AutoReplaceManager.initializeAutoReplaceGroups(autoReplaceContainer, document.createElement('textarea'));
    };
    document.head.appendChild(script);
  }
});
