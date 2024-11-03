/* global chrome, GlobalSettings, TextProcessor, Notification, UIManager, TranslateManager */
// AI 文章改寫助手 - 內容腳本

console.log('Content script starting to load');

/**
 * 初始化擴充功能，包含初始化 UI 元素和設定事件監聽器。
 */
function initializeExtension() {
  console.log('開始初始化擴展');

  /**
   * 初始化 UI 元素，包含載入設定、添加改寫按鈕和初始化股票代碼功能。
   */
  async function initUI() {
    console.log('初始化UI元素');
    try {
      await window.GlobalSettings.loadSettings();
      window.UIManager.addRewriteButton();
      window.UIManager.initializeStockCodeFeature();
      window.TranslateManager.initialize();
    } catch (error) {
      console.error('初始化UI元素時發生錯誤:', error);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initUI);
  } else {
    initUI();
  }

  // 監聽 URL 變化，如果 URL 變化則重新檢查是否需要初始化 UI
  let lastUrl = location.href;
  new MutationObserver(() => {
    const url = location.href;
    if (url !== lastUrl) {
      lastUrl = url;
      console.log('URL變化檢測到，重新檢查是否需要初始化UI');
      if (shouldEnableFeatures()) {
        initUI();
      } else {
        window.UIManager.removeRewriteButton();
        window.UIManager.removeStockCodeFeature();
      }
    }
  }).observe(document, {subtree: true, childList: true});

  console.log('Content script fully loaded and initialized');

  // 向背景腳本發送訊息，通知內容腳本已準備就緒
  chrome.runtime.sendMessage({action: "contentScriptReady"}, function(response) {
    console.log('Content script ready message sent', response);
  });
}

/**
 * 檢查當前 URL 是否符合啟用功能的條件。
 * @returns {boolean} - true 表示符合條件，false 表示不符合條件。
 */
function shouldEnableFeatures() {
  const currentUrl = window.location.href;
  const pattern = /^https:\/\/data\.uanalyze\.twobitto\.com\/research-reports\/(\d+|create)/;
  const result = pattern.test(currentUrl);
  console.log('當前URL:', currentUrl);
  console.log('是否啟用功能:', result);
  return result;
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
        confirmContent: request.confirmContent
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
      console.log('更新的設置:', {
        fullRewriteModel: window.GlobalSettings.fullRewriteModel,
        shortRewriteModel: window.GlobalSettings.shortRewriteModel,
        autoRewriteModel: window.GlobalSettings.autoRewriteModel,
        translateModel: window.GlobalSettings.translateModel,
        apiKeys: window.GlobalSettings.apiKeys
      });
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
      window.GlobalSettings.apiKeys['gpt-4'] = request.apiKey;
    } else if (request.source === 'gpt4oMini') {
      window.GlobalSettings.apiKeys['gpt-4'] = request.apiKey;
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
