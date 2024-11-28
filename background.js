// background.js
// 用於追踪內容腳本是否已準備就緒的標誌
let contentScriptReady = false;
// 用於存儲待處理的改寫請求
let pendingRewriteRequest = null;

// 監聽來自其他部分的消息
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  // 處理日誌消息
  if (request.type === 'LOG') {
    const timestamp = new Date(request.timestamp).toLocaleTimeString();
    let style = '';
    
    // 根據不同顏色設置不同的樣式
    switch (request.color) {
      case '#4CAF50': // 成功
        style = 'color: #2E7D32'; // 更深的綠色
        break;
      case '#2196F3': // 信息
        style = 'color: #1565C0'; // 更深的藍色
        break;
      case '#9C27B0': // 等待/處理中
        style = 'color: #9C27B0; font-weight: bold;'; // 紫色加粗
        break;
      case '#F44336': // 錯誤
        style = 'color: #F44336; font-weight: bold;'; // 紅色加粗
        break;
      case '#FF9800': // 警告
        style = 'color: #FF9800; font-weight: bold;'; // 橙色加粗
        break;
      default:
        style = request.color ? `color: ${request.color}` : '';
    }
    
    console.log(
        `%c[${timestamp}] ${request.source}: ${request.message}`,
        style
    );
    return true;
  }

  // 處理內容腳本準備就緒的通知
  if (request.action === "contentScriptReady") {
    contentScriptReady = true;
    sendResponse({received: true});
    console.log("內容腳本已準備就緒");
  }
  // 檢查內容腳本是否準備就緒
  else if (request.action === "checkContentScriptReady") {
    sendResponse({ ready: contentScriptReady });
  }
  // 處理改寫請求
  else if (request.action === "rewrite") {
    console.log("收到改寫請求，正在存儲");
    pendingRewriteRequest = request;
    sendResponse({received: true});
  }
  // 處理彈出窗口準備就緒的通知
  else if (request.action === "popupReady") {
    console.log("彈出窗口已準備就緒");
    // 如果有待處理的改寫請求，則轉發給彈出窗口
    if (pendingRewriteRequest) {
      console.log("轉發待處理的改寫請求到彈出窗口");
      chrome.runtime.sendMessage(pendingRewriteRequest, (response) => {
        console.log("收到彈出窗口的回應:", response);
        pendingRewriteRequest = null;
      });
    }
    sendResponse({received: true});
  }
  // 處理獲取存儲數據的請求
  else if (request.action === "getStorageData") {
    chrome.storage.sync.get(request.keys, sendResponse);
    return true;  // 表示我們會異步發送響應
  }
  // 處理設置存儲數據的請求
  else if (request.action === "setStorageData") {
    chrome.storage.sync.set(request.data, sendResponse);
    return true;  // 表示我們會異步發送響應
  }
  // 處理更新內容腳本的請求
  else if (request.action === "updateContentScript") {
    console.log("轉發更新請求到內容腳本", request);
    // 查找當前活動的標籤頁
    chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
      if (tabs[0]) {
        // 向內容腳本發送消息
        chrome.tabs.sendMessage(tabs[0].id, request, (response) => {
          console.log("收到內容腳本的回應:", response);
          // 錯誤處理
          if (chrome.runtime.lastError) {
            console.error("向內容腳本發送消息時出錯:", chrome.runtime.lastError);
            sendResponse({error: "與內容腳本通信失敗", details: chrome.runtime.lastError.message});
          } else {
            sendResponse(response);
          }
        });
      } else {
        console.error("未找到活動的標籤頁");
        sendResponse({error: "未找到活動的標籤頁"});
      }
    });
    return true;
  }
  // 處理設定管理器的日誌
  else if (request.action === 'settingsLog') {
    const { logType, message: logMessage, data, timestamp } = request;
    
    // 根據日誌類型使用不同的 console 方法
    switch (logType) {
        case 'error':
            console.error(`[設定管理器 ${timestamp}]`, logMessage, data || '');
            break;
        case 'warn':
            console.warn(`[設定管理器 ${timestamp}]`, logMessage, data || '');
            break;
        case 'success':
            console.log(`%c[設定管理器 ${timestamp}] ${logMessage}`, 
                'color: #2E7D32', // 更深的綠色
                data || '');
            break;
        case 'info':
        default:
            console.log(`[設定管理器 ${timestamp}]`, logMessage, data || '');
    }
  }
  return true; // 表示我們會異步發送回應
});

// 監聽插件啟動事件
chrome.runtime.onInstalled.addListener((details) => {
  console.log('插件已安裝或更新', details);
  if(details.reason === "install"){
    chrome.storage.sync.set({ isFirstTime: true });
  }
});

console.log("背景腳本已加載");
