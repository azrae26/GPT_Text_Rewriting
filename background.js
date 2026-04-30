let contentScriptReady = false;
let pendingRewriteRequest = null;

const REMOTE_BASE_URL = 'https://azrae26.github.io';
const UPDATE_ALARM_NAME = 'checkForUpdates';
const UPDATE_INTERVAL_MINUTES = 1;

async function checkForUpdates() {
  try {
    const response = await fetch(`${REMOTE_BASE_URL}/version.json?t=${Date.now()}`);
    const remoteVersion = await response.json();
    const localData = await chrome.storage.local.get('version');

    if (!localData.version || remoteVersion.version > localData.version) {
      await chrome.storage.local.set({ version: remoteVersion.version });
      console.log('更新到新版本:', remoteVersion.version);

      // 重載目標分頁
      chrome.tabs.query({}, function(tabs) {
        tabs.forEach(tab => {
          if (tab.url && tab.url.startsWith('https://data.uanalyze.twobitto.com/')) {
            chrome.tabs.reload(tab.id);
          }
        });
      });

      // 自動重啟擴充功能，不需手動到擴充功能頁面按重新載入
      chrome.runtime.reload();
    } else {
      console.log('本地版本已是最新');
    }
  } catch (error) {
    console.error('檢查更新時發生錯誤:', error);
  }
}

chrome.runtime.onInstalled.addListener(() => {
  checkForUpdates();
  // 使用 alarms 取代 setInterval，確保 Service Worker 終止後定時任務仍然存在
  chrome.alarms.create(UPDATE_ALARM_NAME, { periodInMinutes: UPDATE_INTERVAL_MINUTES });
});

chrome.runtime.onStartup.addListener(() => {
  // 確保 alarm 在瀏覽器重啟後仍存在
  chrome.alarms.get(UPDATE_ALARM_NAME, (alarm) => {
    if (!alarm) {
      chrome.alarms.create(UPDATE_ALARM_NAME, { periodInMinutes: UPDATE_INTERVAL_MINUTES });
    }
  });
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === UPDATE_ALARM_NAME) {
    checkForUpdates();
  }
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
    return true;
  } else if (request.action === "setStorageData") {
    chrome.storage.sync.set(request.data, sendResponse);
    return true;
  }
  return true;
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "updateContentScript") {
    console.log("Forwarding update request to content script", request);
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
    return true;
  }
});

console.log("Background script loaded");
