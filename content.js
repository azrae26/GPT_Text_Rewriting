/* global chrome, GlobalSettings, TextProcessor, Notification, UIManager, TranslateManager, StockMatcher */
/**
 * content.js - 內容腳本主入口
 * 功能：在目標網頁中注入和初始化所有擴充功能
 * 職責：
 * - URL 檢查和條件啟用：確保只在目標頁面啟用功能
 * - 智能初始化：處理動態頁面載入和 DOM 變化檢測
 * - UI 模組協調：統一初始化和管理各功能模組
 * - 頁面狀態監控：監聽 URL 變化和頁面重新載入
 * - 高亮功能初始化：處理文本高亮功能的載入和設定
 * - Rive 動畫管理：在頁面右下角顯示動畫
 * - 錯誤處理和重試機制：確保功能在各種網頁狀態下正常工作
 * 
 * 依賴：
 * - GlobalSettings：全局設定管理
 * - UIManager：UI 元素管理 (委派股票功能給 StockMatcher)
 * - StockMatcher：股票代號自動匹配功能模組 (2025-01-08分離)
 * - TextHighlight：文本高亮功能
 * - TextProcessor, TranslateManager 等各功能模組
 * - Chrome Extensions API
 * - Rive JavaScript Runtime：動畫播放
 */

console.log('Content script starting to load');





/**
 * 檢查當前 URL 是否符合啟用功能的條件。
 * @returns {boolean} - true 表示符合條件，false 表示不符合條件。
 */
function shouldEnableFeatures() {
  const currentUrl = window.location.href;
  const pattern = /^https:\/\/data\.uanalyze\.twobitto\.com\/research-reports\/(?:\d+\/edit|create)(?:\?.*)?$/;
  const result = pattern.test(currentUrl);
  console.log('當前URL:', currentUrl);
  console.log('是否啟用功能:', result);
  return result;
}

/**
 * 初始化擴充功能，包含初始化 UI 元素和設定事件監聽器。
 */
function initializeExtension() {
  console.log('開始初始化擴展');

  // 檢查是否需要重新整理
  function checkNeedsRefresh() {
    // 檢查麵包屑導航
    const breadcrumbs = document.querySelector('.MuiBreadcrumbs-ol');
    if (!breadcrumbs) return false;

    const lastItem = breadcrumbs.querySelector('.MuiBreadcrumbs-li:last-child p');
    if (!lastItem) return false;

    const lastText = lastItem.textContent.trim();
    
    // 檢查是否為目標頁面
    if (lastText !== '編輯' && lastText !== '新增') return false;

    // 檢查內容是否已載入
    const textarea = document.querySelector('textarea[name="content"]');
    if (!textarea || !textarea.offsetParent) return false;

    // 檢查高亮容器是否正確初始化
    const highlightContainer = document.getElementById('text-highlight-container');
    if (!highlightContainer || !highlightContainer.offsetParent) {
      // 檢查頁面是否已完全載入
      if (document.readyState !== 'complete') {
        console.log('頁面尚未完全載入，等待...');
        return false;
      }
      
      // 確保有足夠的延遲再觸發重新整理
      if (!window._lastRefreshAttempt || Date.now() - window._lastRefreshAttempt > 1000) {
        window._lastRefreshAttempt = Date.now();
        console.log('高亮容器未正確初始化，需要重新整理');
        return true;
      }
    }

    return false;
  }

  // 使用 MutationObserver 監聽 DOM 變化
  const observer = new MutationObserver(() => {
    if (checkNeedsRefresh()) {
      // 使用 sessionStorage 來防止重複重新整理
      const refreshKey = 'lastRefreshTime';
      const lastRefresh = sessionStorage.getItem(refreshKey);
      const now = Date.now();

      if (!lastRefresh || now - parseInt(lastRefresh) > 2000) {
        console.log('檢測到需要重新整理');
        sessionStorage.setItem(refreshKey, now.toString());
        window.location.reload();
        observer.disconnect();
        return;
      }
    }
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true
  });

  let checkCount = 0;
  const maxChecks = 3; // 最大檢查次數
  const checkInterval = 300;
  let debounceTimer = null;
  let isInitialized = false;
  let isInitializing = false;
  let lastUrlCheckTime = 0;
  const minCheckInterval = 1000;
  let highlightInitialized = false;

  async function checkAndInitialize() {
    if (shouldEnableFeatures()) {
      if (!isInitialized && !isInitializing) {  // 檢查是否已初始化或正在初始化
        try {
          isInitializing = true;  // 設置正在初始化標記
          console.log('符合條件，初始化UI');
          await initUI();
          isInitialized = true;   // 設置已初始化標記
        } finally {
          isInitializing = false; // 重置正在初始化標記
        }
      }
    } else if (checkCount < maxChecks) {
      checkCount++;
      console.log(`URL檢查第 ${checkCount} 次，等待下次檢查...`);
      setTimeout(checkAndInitialize, checkInterval);
    } else {
      console.log('達到最大檢查次數，停止檢查');
    }
  }

  // 初始化高亮功能
  function initHighlight() {
    if (highlightInitialized) {
      return;
    }

    // 檢查必要元素
    const textarea = document.querySelector('textarea[name="content"]');
    if (!textarea) {
      // 等待元素出現再試
      const observer = new MutationObserver((mutations, obs) => {
        if (document.querySelector('textarea[name="content"]')) {
          obs.disconnect();
          initHighlight();
        }
      });

      observer.observe(document.body, {
        childList: true,
        subtree: true
      });
      return;
    }

    // 先初始化基本功能
    window.TextHighlight.initialize();

    // 等所有設定都載入完成後，再標記為初始化完成
    chrome.storage.sync.get(['highlightWords', 'highlightColors'], function(data) {
      if (data.highlightWords) {
        const words = data.highlightWords.split('\n').filter(word => word.trim());
        const colors = data.highlightColors || {};
        
        // 確保設定已完全載入
        window.TextHighlight.setTargetWords(words, colors);
        
        // 確認高亮是否成功
        const highlights = document.querySelectorAll('.text-highlight');
        if (highlights.length === 0) {
          window.TextHighlight.forceUpdate();
        }
        
        // 最後才標記為初始化完成
        highlightInitialized = true;
      } else {
        // 即使沒有設定，也要標記為初始化完成
        highlightInitialized = true;
      }
    });
  }

  // 初始化 UI 元素
  async function initUI() {
    console.log('初始化UI元素');
    try {
      await window.GlobalSettings.loadSettings();
      window.UIManager.initializeAllUI();
      // 在這裡也初始化高亮功能
      initHighlight();
    } catch (error) {
      console.error('初始化UI元素時發生錯誤:', error);
    }
  }

  // 立即開始初始化高亮功能
  initHighlight();
  
  // 開始第一次URL檢查
  checkAndInitialize();

  // 監聽 URL 變化（添加節流）
  let lastUrl = location.href;
  new MutationObserver(() => {
    const url = location.href;
    const currentTime = Date.now();
    
    if (url !== lastUrl && currentTime - lastUrlCheckTime >= minCheckInterval) {
      lastUrl = url;
      lastUrlCheckTime = currentTime;
      console.log('URL變化檢測到，準備重新檢查');
      
      // 清除之前的計時器
      if (debounceTimer) {
        clearTimeout(debounceTimer);
      }
      
      // 設置新的計時器
      debounceTimer = setTimeout(() => {
        console.log('開始重新檢查');
        if (!shouldEnableFeatures()) {
          // 如果不在目標頁面，移除 UI 並重置標記
          window.UIManager.removeAllUI();
          window.TextHighlight?.DOMManager?.clearHighlights?.(); // 清除高亮
          isInitialized = false;
          highlightInitialized = false;  // 重置高亮初始化標記
        }
        checkCount = 0;         // 重置檢查次數
        checkAndInitialize();
      }, 500);  // 500ms 的防抖延遲
    }
  }).observe(document, {subtree: true, childList: true});

  console.log('Content script fully loaded and initialized');

  // 🆕 監聽標籤頁變為當前時重整UI
  document.addEventListener('visibilitychange', function() {
    if (!document.hidden && shouldEnableFeatures()) {
      console.log('標籤頁變為當前，重整UI...');
      
      // 重新載入設定並更新UI
      setTimeout(async () => {
        try {
          await window.GlobalSettings.loadSettings();
          
          // 如果UI已初始化，則更新所有組件
          if (isInitialized) {
            // 更新替換規則UI（如果存在）
            if (window.ManualReplaceManager) {
              window.ManualReplaceManager.refreshFromStorage();
            }
            
            // 更新高亮功能
            if (window.TextHighlight) {
              chrome.storage.sync.get(['highlightWords', 'highlightColors'], function(data) {
                if (data.highlightWords) {
                  const words = data.highlightWords.split('\n').filter(word => word.trim());
                  const colors = data.highlightColors || {};
                  window.TextHighlight.setTargetWords(words, colors);
                  window.TextHighlight.forceUpdate();
                }
              });
            }
            
            console.log('✅ UI重整完成');
          }
        } catch (error) {
          console.error('❌ UI重整失敗:', error);
        }
      }, 200); // 延遲200ms確保頁面完全激活
    }
  });

  // 向背景腳本發送訊息，通知內容腳本已準備就緒
  chrome.runtime.sendMessage({action: "contentScriptReady"}, function(response) {
    console.log('Content script ready message sent', response);
  });
}

/**
 * 監聽來自背景腳本的訊息，並根據訊息類型執行不同的操作。
 */
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('收到消息:', request);
  switch (request.action) {
    case "rewrite":
      // 處理改寫請求
      window.GlobalSettings.apiKeys = request.apiKeys;
      window.GlobalSettings.model = request.model;
      window.GlobalSettings.instruction = request.instruction;
      window.GlobalSettings.shortInstruction = request.shortInstruction;
      window.GlobalSettings.updateAutoRewritePatterns(request.autoRewritePatterns);
      // 保存確認設置
      chrome.storage.sync.set({
        confirmModel: request.confirmModel,
        confirmContent: request.confirmContent,
        removeHash: request.removeHash,
        removeStar: request.removeStar
      });
      TextProcessor.rewriteText();
      sendResponse({success: true});
      break;
    case "updateAutoRewritePatterns":
      // 更新自動改寫匹配模式
      window.GlobalSettings.updateAutoRewritePatterns(request.patterns);
      sendResponse({success: true});
      break;
    case "updateSettings":
      // 更新設定
      if (request.settings && typeof request.settings === 'object') {
        if (request.settings.apiKeys) {
          window.GlobalSettings.apiKeys = request.settings.apiKeys;
        }
        if (request.settings.fullRewriteModel) {
          window.GlobalSettings.fullRewriteModel = request.settings.fullRewriteModel;
        }
        if (request.settings.shortRewriteModel) {
          window.GlobalSettings.shortRewriteModel = request.settings.shortRewriteModel;
        }
        if (request.settings.autoRewriteModel) {
          window.GlobalSettings.autoRewriteModel = request.settings.autoRewriteModel;
        }
        if (request.settings.translateModel) {
          window.GlobalSettings.translateModel = request.settings.translateModel;
        }
        if (request.settings.translateInstruction) {
          window.GlobalSettings.translateInstruction = request.settings.translateInstruction;
        }
        if (request.settings.removeHash !== undefined) {
          window.GlobalSettings.removeHash = request.settings.removeHash;
        }
        if (request.settings.removeStar !== undefined) {
          window.GlobalSettings.removeStar = request.settings.removeStar;
        }
        
        // 處理股票清單更新
        if (request.settings.stockList !== undefined) {
          console.log('檢測到股票清單更新，重新初始化股票功能');
          // 優先使用 StockMatcher 模組，回退到 UIManager
          const stockManager = window.StockMatcher || window.UIManager;
          if (stockManager && stockManager._loadStockListFromSettings) {
            // 重新載入股票清單並更新UI
            stockManager._loadStockListFromSettings()
              .then(() => {
                // 重新初始化股票代碼功能以應用新的清單
                if (window.StockMatcher) {
                  window.StockMatcher.removeStockCodeFeature();
                  window.StockMatcher.initializeStockCodeFeature(true);
                } else if (window.UIManager) {
                  window.UIManager.removeStockCodeFeature();
                  window.UIManager.initializeStockCodeFeature(true);
                }
                console.log('股票清單已通過 updateSettings 成功更新');
              })
              .catch(error => {
                console.error('通過 updateSettings 更新股票清單失敗:', error);
              });
          }
        }
        
        console.log('更新的設置:', {
          fullRewriteModel: window.GlobalSettings.fullRewriteModel,
          shortRewriteModel: window.GlobalSettings.shortRewriteModel,
          autoRewriteModel: window.GlobalSettings.autoRewriteModel,
          translateModel: window.GlobalSettings.translateModel,
          apiKeys: window.GlobalSettings.apiKeys,
          removeHash: window.GlobalSettings.removeHash,
          removeStar: window.GlobalSettings.removeStar,
          stockListUpdated: request.settings.stockList !== undefined
        });
      } else {
        console.warn('updateSettings 收到無效的 settings 參數:', request.settings);
      }
      sendResponse({success: true});
      break;
    case "generateSummary":
      const textArea = document.querySelector('textarea[name="content"]');
      if (textArea) {
        TextProcessor.generateSummary(textArea.value)
          .then(summary => {
            sendResponse({ success: true, summary });
          })
          .catch(error => {
            sendResponse({ success: false, error: error.message });
          });
        return true; // 表示我們會異步發送回應
      }
      break;
    case "updateHighlightWords":
      TextHighlight.setTargetWords(request.words, request.colors || {});
      sendResponse({success: true});
      break;
    case "forceUpdateHighlights":
      TextHighlight.forceUpdate();
      sendResponse({success: true});
      break;
    case "updateAutoReplaceRules":
      // 更新自動改寫匹配模式
      if (request.rules) {
        // 先保存到 storage
        chrome.storage.local.set({
          'replace_autoReplaceRules': request.rules
        }, () => {
          // 直接更新 AutoReplaceManager 的規則
          window.AutoReplaceManager._activeRules = request.rules;
          
          // 確保規則被保存後，強制更新 AutoReplaceManager
          window.AutoReplaceManager.handleAutoReplace(
            document.querySelector('textarea[name="content"]')
          );
        });
      }
      sendResponse({success: true});
      break;
    case "updateStockList":
      // 更新股票清單
      if (request.stockList !== undefined) {
        // 優先使用 StockMatcher 模組，回退到 UIManager
        const stockManager = window.StockMatcher || window.UIManager;
        if (stockManager && stockManager._loadStockListFromSettings) {
          // 保存到設定中
          window.GlobalSettings.saveSingleSetting('stockList', request.stockList)
            .then(() => {
              // 重新載入股票清單
              return stockManager._loadStockListFromSettings();
            })
            .then(() => {
              // 重新初始化股票代碼功能以應用新的清單
              if (window.StockMatcher) {
                window.StockMatcher.removeStockCodeFeature();
                window.StockMatcher.initializeStockCodeFeature(true);
              } else if (window.UIManager) {
                window.UIManager.removeStockCodeFeature();
                window.UIManager.initializeStockCodeFeature(true);
              }
              sendResponse({success: true});
            })
            .catch(error => {
              console.error('更新股票清單失敗:', error);
              sendResponse({success: false, error: error.message});
            });
          return true; // 表示我們會異步發送回應
        }
      }
      sendResponse({success: true});
      break;
  }
});

/**
 * 監聽來自背景腳本的復原請求，並執行復原操作。
 */
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "undo") {
    const textArea = document.querySelector('textarea[name="content"]');
    if (textArea && window.GlobalSettings.originalContent) {
      textArea.value = window.GlobalSettings.originalContent; // 恢復原始內容
      textArea.dispatchEvent(new Event('input', { bubbles: true })); // 觸發輸入事件
      sendResponse({success: true});
    } else {
      sendResponse({success: false, error: "無法復原或找不到文本區域"});
    }
  }
});

/**
 * 監聽來自背景腳本的 API 金鑰同步請求，並更新 API 金鑰。
 */
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "syncApiKeys") {
    if (request.source === 'gpt4') {
      // 將 gpt-4o 改為使用 openai 金鑰
      window.GlobalSettings.apiKeys['openai'] = request.apiKey;
    } else if (request.source === 'gpt4oMini') {
      // 將 gpt-4o 改為使用 openai 金鑰
      window.GlobalSettings.apiKeys['openai'] = request.apiKey;
    }
    // 保存更新後的 API 金鑰
    window.GlobalSettings.getChromeStorage().then(storage => {
      storage.set({
        apiKeys: window.GlobalSettings.apiKeys,
      });
    });
    sendResponse({success: true});
  }
});

// 尚未實作的 AI 助手功能
const AIAssistant = {
  init: function() {
    // 初始化代碼
  },
  processUserInput: function(input) {
    // 處理用戶輸入
  },
  displayResponse: function(response) {
    // 顯示 AI 應答
  }
};

// 在頁面加載完成後初始化 AI 助手
document.addEventListener('DOMContentLoaded', AIAssistant.init);

// 監聽來自背景腳本的訊息，啟動 AI 助手
chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
  if (request.action === "activateAIAssistant") {
    AIAssistant.init();
  }
  // 其他現有的消息處理...
});

// 確保在頁面加載完後初始化擴展
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeExtension);
} else {
  initializeExtension();
}

// 添加全局錯誤處理
window.addEventListener('error', function(event) {
  console.error('捕獲到全局錯誤:', event.error);
});

function handleUndo() {
  chrome.runtime.sendMessage({ action: "undo" }, function(response) {
    if (!response.success) {
      alert('復原失敗: ' + response.error);
    }
  });
}

// 將 shouldEnableFeatures 函數暴露給全局作用域
window.shouldEnableFeatures = shouldEnableFeatures;
