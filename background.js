let contentScriptReady = false;
let pendingRewriteRequest = null;

const REMOTE_BASE_URL = 'https://azrae26.github.io';
const UPDATE_INTERVAL = 1 * 60 * 1000; // 更新時間1分鐘

async function checkForUpdates() {
  try {
    const response = await fetch(`${REMOTE_BASE_URL}/version.json`);
    const remoteVersion = await response.json();
    const localData = await chrome.storage.local.get('version');

    if (!localData.version || remoteVersion.version > localData.version) {
      // 遠端版本更新，執行更新操作
      await chrome.storage.local.set({ version: remoteVersion.version });
      chrome.tabs.query({}, function(tabs) {
        tabs.forEach(tab => {
          if (tab.url.startsWith('https://data.uanalyze.twobitto.com/')) {
            chrome.tabs.reload(tab.id);
          }
        });
      });
      console.log('更新到新版本:', remoteVersion.version);
    } else {
      console.log('本地版本已是最新');
    }
  } catch (error) {
    console.error('檢查更新時發生錯誤:', error);
  }
}

chrome.runtime.onInstalled.addListener(() => {
  checkForUpdates();
  setInterval(checkForUpdates, UPDATE_INTERVAL);
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log("Background script received message:", request);
  if (request.action === "contentScriptReady") {
    contentScriptReady = true;
    sendResponse({received: true});
    console.log("Content script is ready");
  } else if (request.action === "checkContentScriptReady") {
    sendResponse({ ready: contentScriptReady });
    console.log("Checked content script readiness:", contentScriptReady);
  } else if (request.action === "rewrite") {
    console.log("Received rewrite request, storing it");
    pendingRewriteRequest = request;
    sendResponse({received: true});
  } else if (request.action === "popupReady") {
    console.log("Popup is ready");
    if (pendingRewriteRequest) {
      console.log("Forwarding pending rewrite request to popup");
      chrome.runtime.sendMessage(pendingRewriteRequest, (response) => {
        console.log("Received response from popup:", response);
        pendingRewriteRequest = null;
      });
    }
    sendResponse({received: true});
  } else if (request.action === "getStorageData") {
    chrome.storage.sync.get(request.keys, sendResponse);
    return true;  // 表示我們會異步發送響應
  } else if (request.action === "setStorageData") {
    chrome.storage.sync.set(request.data, sendResponse);
    return true;  // 表示我們會異步發送響應
  }
  return true; // 表示我們會異步發送回應
});

// 修改這個監聽器來處理來自彈出窗口的消息
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "updateContentScript") {
    console.log("Forwarding update request to content script", request);
    // 將消息轉發給內容腳本
    chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
      if (tabs[0]) {
        chrome.tabs.sendMessage(tabs[0].id, request, (response) => {
          console.log("Received response from content script:", response);
          if (chrome.runtime.lastError) {
            console.error("Error sending message to content script:", chrome.runtime.lastError);
            sendResponse({error: "Failed to communicate with content script", details: chrome.runtime.lastError.message});
          } else {
            sendResponse(response);
          }
        });
      } else {
        console.error("No active tab found");
        sendResponse({error: "No active tab found"});
      }
    });
    return true; // 表示我們會異步發送回應
  }
});

console.log("Background script loaded");
