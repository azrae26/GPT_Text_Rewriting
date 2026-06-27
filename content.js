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
 * - 錯誤處理和重試機制：確保功能在各種網頁狀態下正常工作
 * 
 * 依賴：
 * - GlobalSettings：全局設定管理
 * - UIManager：UI 元素管理 (委派股票功能給 StockMatcher)
 * - StockMatcher：股票代號自動匹配功能模組 (2025-01-08分離)
 * - TextHighlight：文本高亮功能
 * - TextProcessor, TranslateManager 等各功能模組
 * - Chrome Extensions API
 */

LogUtils.log('Content script starting to load');

// 簡化的調試資訊
const debugInfo = {
  startTime: Date.now(),
  refreshCount: 0
};

// 全局變數定義
let uiInitCompleteTime = null; // 記錄 UI 初始化完成時間

/**
 * 檢查當前 URL 是否符合啟用功能的條件。
 * @returns {boolean} - true 表示符合條件，false 表示不符合條件。
 */
function shouldEnableFeatures() {
  const currentUrl = window.location.href;
  // 排除 ai/assistants/create 和 ai/assistants/[數字]/edit 頁面
  const pattern = /^https:\/\/data\.uanalyze\.com\.tw\/(?:research-reports\/(?:\d+\/edit|create)|ai\/assistants.*)(?:\?.*)?$/;
  const excludePattern = /^https:\/\/data\.uanalyze\.com\.tw\/ai\/assistants\/(?:create|\d+\/edit)(?:\?.*)?$/;
  
  const result = pattern.test(currentUrl) && !excludePattern.test(currentUrl);
  LogUtils.log('當前URL:', currentUrl);
  LogUtils.log('是否啟用功能:', result);
  return result;
}

/**
 * 初始化擴充功能，包含初始化 UI 元素和設定事件監聽器。
 */
function initializeExtension() {
  LogUtils.log('開始初始化擴展');

  // 檢查是否需要重新整理
  function checkNeedsRefresh() {
    // 🔧 優化：如果UI已經初始化完成，就不需要檢查重新整理了
    if (isInitialized && highlightInitialized) {
      return false;
    }
    
    // 🔧 優化：添加冷卻時間，避免過於頻繁的檢查
    const now = Date.now();
    if (window._lastRefreshCheck && now - window._lastRefreshCheck < 1000) {
      return false;
    }
    window._lastRefreshCheck = now;
    
    // 檢查麵包屑導航
    const breadcrumbs = document.querySelector('.MuiBreadcrumbs-ol');
    if (!breadcrumbs) {
      return false;
    }

    const lastItem = breadcrumbs.querySelector('.MuiBreadcrumbs-li:last-child p');
    if (!lastItem) {
      return false;
    }

    const lastText = lastItem.textContent.trim();
    
    // 檢查是否為目標頁面
    if (lastText !== '編輯' && lastText !== '新增') {
      return false;
    }

    // 檢查內容是否已載入
    const textarea = document.querySelector('textarea[name="content"]');
    if (!textarea || !textarea.offsetParent) {
      return false;
    }

    // 檢查高亮容器是否正確初始化
    const highlightContainer = document.getElementById('text-highlight-container');
    if (!highlightContainer || !highlightContainer.offsetParent) {
      // 檢查頁面是否已完全載入
      if (document.readyState !== 'complete') {
        return false;
      }
      
      // 🔧 優化：增加更多條件檢查，確保真的需要重新整理
      const currentTime = Date.now();
      const pageLoadTime = currentTime - debugInfo.startTime;
      
      // 如果頁面載入時間太短，可能還在初始化中
      if (pageLoadTime < 2000) {
        return false;
      }
      
      // 確保有足夠的延遲再觸發重新整理
      if (!window._lastRefreshAttempt || currentTime - window._lastRefreshAttempt > 3000) { // 增加到3秒
        window._lastRefreshAttempt = currentTime;
        debugInfo.refreshCount++;
        
        return true;
      }
    } else {
      // 🔧 優化：如果高亮容器正常，停止觀察器
      if (autoRefreshObserver && typeof autoRefreshObserver.disconnect === 'function') {
        autoRefreshObserver.disconnect();
        autoRefreshObserver = null;
      }
    }

    return false;
  }

  // 使用 MutationObserver 監聽 DOM 變化
  let refreshCheckTimeout = null;
  const REFRESH_CHECK_DEBOUNCE = 500; // 500ms 防抖
  let autoRefreshObserver = null; // 🔧 添加全局引用
  
  const observer = new MutationObserver(() => {
    // 🔧 優化：添加防抖機制，避免過度觸發
    if (refreshCheckTimeout) {
      clearTimeout(refreshCheckTimeout);
    }
    
    refreshCheckTimeout = setTimeout(() => {
      if (checkNeedsRefresh()) {
        // 使用 sessionStorage 來防止重複重新整理
        const refreshKey = 'lastRefreshTime';
        const lastRefresh = sessionStorage.getItem(refreshKey);
        const now = Date.now();

        if (!lastRefresh || now - parseInt(lastRefresh) > 2000) {
          sessionStorage.setItem(refreshKey, now.toString());
          
          // 🔧 優化：使用全局引用停止觀察器
          if (autoRefreshObserver) {
            autoRefreshObserver.disconnect();
            autoRefreshObserver = null;
          }
          
          window.location.reload();
          return;
        }
      }
    }, REFRESH_CHECK_DEBOUNCE);
  });

  // 🔧 優化：只監聽特定區域，不是整個 body
  const targetNode = document.querySelector('.MuiBreadcrumbs-ol') || document.body;
  
  observer.observe(targetNode, {
    childList: true,
    subtree: true
  });
  
  // 🔧 設置全局引用
  autoRefreshObserver = observer;

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
          
          await initUI();
          isInitialized = true;   // 設置已初始化標記
          uiInitCompleteTime = Date.now(); // 🔧 記錄完成時間
          
          // 觸發頁面載入時同步檢查
          setTimeout(async () => {
            try {
              LogUtils.log('🚀 觸發內容腳本啟動同步檢查...');
              const result = await performContentStartupSync();
              if (result.success) {
                LogUtils.log(`✅ 內容腳本啟動同步檢查完成: ${result.reason || 'executed'}`);
              } else {
                LogUtils.warn(`⚠️ 內容腳本啟動同步檢查失敗: ${result.error}`);
              }
            } catch (error) {
              LogUtils.error('內容腳本啟動同步檢查異常:', error);
            }
          }, 1000); // 延遲1秒執行，確保UI初始化完成
          
        } catch (error) {
          LogUtils.error('UI初始化失敗:', error);
        } finally {
          isInitializing = false; // 重置正在初始化標記
        }
      }
    } else if (checkCount < maxChecks) {
      checkCount++;
      setTimeout(checkAndInitialize, checkInterval);
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
    chrome.storage.local.get(['highlightWords', 'highlightColors'], function(data) {
      if (data.highlightWords) {
        const words = data.highlightWords.split('\n').filter(word => word.trim());
        const colors = data.highlightColors || {};
        
        window.TextHighlight.setTargetWords(words, colors);
        
        // 確認高亮是否成功
        const highlights = document.querySelectorAll('.text-highlight');
        if (highlights.length === 0) {
          LogUtils.log('未發現高亮元素，強制更新');
          window.TextHighlight.forceUpdate();
        }
        
        // 最後才標記為初始化完成
        highlightInitialized = true;
      }
    });
  }

  // 初始化 UI 元素
  async function initUI() {
    try {
      await window.GlobalSettings.loadSettings();
      
      await window.UIManager.initializeAllUI();
      
      // 在這裡也初始化高亮功能
      initHighlight();
      
      // 初始化狀態監控器
      if (window.StatusMonitor) {
        window.StatusMonitor.init();
        LogUtils.log('狀態監控器已初始化');
      } else {
        LogUtils.warn('StatusMonitor 未載入');
      }

      // 🆕 啟用全域動態 textarea 檢測
      if (window.ReplaceManager) {
        window.ReplaceManager.setupGlobalTextAreaObserver();
        LogUtils.log('全域動態 textarea 檢測已啟用');
      }
      
    } catch (error) {
      LogUtils.error('初始化UI元素時發生錯誤:', error);
    }
  }

  // 立即開始初始化高亮功能
  initHighlight();

  // 🆕 立即啟動全域動態 textarea 檢測（即使在初始化之前）
  if (window.ReplaceManager && window.shouldEnableFeatures()) {
    window.ReplaceManager.setupGlobalTextAreaObserver();
    LogUtils.log('✅ 頁面載入時立即啟動全域動態 textarea 檢測');
  }
  
  // 開始第一次URL檢查
  checkAndInitialize();

  // 監聽 URL 變化（共用 SharedUrlWatcher + 節流）
  window.SharedUrlWatcher.subscribe(() => {
    const currentTime = Date.now();

    if (currentTime - lastUrlCheckTime >= minCheckInterval) {
      lastUrlCheckTime = currentTime;

      // 清除之前的計時器
      if (debounceTimer) {
        clearTimeout(debounceTimer);
      }

      // 設置新的計時器
      debounceTimer = setTimeout(() => {
        if (!shouldEnableFeatures()) {
          // 如果不在目標頁面，移除 UI 並重置標記
          window.UIManager.removeAllUI();
          window.TextHighlight?.DOMManager?.clearHighlights?.(); // 清除高亮
          
          // 清理狀態監控器
          if (window.StatusMonitor) {
            window.StatusMonitor.destroy();
          }
          
          isInitialized = false;
          highlightInitialized = false;  // 重置高亮初始化標記
        }
        checkCount = 0;         // 重置檢查次數
        checkAndInitialize();
      }, 500);  // 500ms 的防抖延遲
    }
  });

  LogUtils.log('Content script fully loaded and initialized');

  // 🆕 監聽標籤頁變為當前時重整UI
  document.addEventListener('visibilitychange', function() {
    if (!document.hidden && shouldEnableFeatures()) {
      LogUtils.log('標籤頁變為當前，重整UI...');
      
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
              chrome.storage.local.get(['highlightWords', 'highlightColors'], function(data) {
                if (data.highlightWords) {
                  const words = data.highlightWords.split('\n').filter(word => word.trim());
                  const colors = data.highlightColors || {};
                  window.TextHighlight.setTargetWords(words, colors);
                  window.TextHighlight.forceUpdate();
                }
              });
            }
            
            LogUtils.log('✅ UI重整完成');
          }
        } catch (error) {
          LogUtils.error('UI重整失敗:', error);
        }
      }, 200); // 延遲200ms確保頁面完全激活
    }
  });

  // 向背景腳本發送訊息，通知內容腳本已準備就緒
  chrome.runtime.sendMessage({action: "contentScriptReady"}, function(response) {
    LogUtils.log('Content script ready message sent', response);
  });
}

/**
 * 監聽來自背景腳本的訊息，並根據訊息類型執行不同的操作。
 */
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  LogUtils.log('收到消息:', request);
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
        
        // 處理比對規則即時更新
        if (request.settings.diffCustomRules !== undefined) {
          window.GlobalSettings.diffCustomRules = request.settings.diffCustomRules;
          if (window.DiffHighlighter) {
            window.DiffHighlighter.setCustomRules(request.settings.diffCustomRules || '');
            window.DiffHighlighter.scheduleDiff();
          }
        }

        // 處理股票清單更新
        if (request.settings.stockList !== undefined) {
          LogUtils.log('檢測到股票清單更新，重新初始化股票功能');
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
                LogUtils.log('股票清單已通過 updateSettings 成功更新');
              })
              .catch(error => {
                LogUtils.error('通過 updateSettings 更新股票清單失敗:', error);
              });
          }
        }
        
        LogUtils.log('更新的設置:', {
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
        LogUtils.warn('updateSettings 收到無效的 settings 參數:', request.settings);
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
              LogUtils.error('更新股票清單失敗:', error);
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

// 監聽高亮設置變更，直接從 storage 更新，不依賴 sendMessage
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;
  if (!changes.highlightWords && !changes.highlightColors) return;

  const words = changes.highlightWords
    ? changes.highlightWords.newValue.split('\n').filter(w => w.trim())
    : TextHighlight.targetWords;
  const colors = changes.highlightColors
    ? changes.highlightColors.newValue
    : TextHighlight.wordColors;

  TextHighlight.setTargetWords(words, colors || {});
});

// 確保在頁面加載完後初始化擴展
if (document.readyState === 'loading') {
  LogUtils.log('頁面仍在載入中，等待 DOMContentLoaded 事件');
  
  document.addEventListener('DOMContentLoaded', () => {
    initializeExtension();
  });
} else {
  LogUtils.log('頁面已載入完成 (readyState: ${document.readyState})，立即初始化');
  initializeExtension();
}

// 添加全局錯誤處理
window.addEventListener('error', function(event) {
  LogUtils.error('捕獲到全局錯誤:', event.error);
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

// 🔧 簡化性能統計報告
function reportPerformanceStats() {
  const actualLoadTime = uiInitCompleteTime ? uiInitCompleteTime - debugInfo.startTime : Date.now() - debugInfo.startTime;
  
  LogUtils.log('插件載入性能統計:', {
    載入時間: `${actualLoadTime}ms`,
    重新整理次數: debugInfo.refreshCount
  });
  
  if (actualLoadTime > 5000) {
    LogUtils.warn('載入性能可能有問題');
  } else {
    LogUtils.log(`載入性能優秀！載入時間：${actualLoadTime}ms`);
  }
}

// 頁面載入完成後5秒報告性能統計
setTimeout(reportPerformanceStats, 5000);

LogUtils.log('Content script 完全載入完成');
