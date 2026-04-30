# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 重要規則：每次修改代碼後必須更新版本號

**每次對任何檔案做出修改並推送後，必須同步更新 `version.json` 的版本號（往上加），否則自動更新機制不會觸發，擴充功能不會重新載入新代碼。**

```json
// version.json
{ "version": "1.0.2" }  // 每次推送都要遞增
```

## 架構概覽

這是一個 Chrome 擴充功能（Manifest V3），採用「靜態 shell + 動態遠端載入」架構：

- **本機靜態檔案**（安裝後不會自動更新）：`manifest.json`、`background.js`、`loader.js`
- **GitHub Pages 動態檔案**（每次重新載入都會從遠端拉取）：`content.js`、`popup.html`、`popup.js`、`version.json`

遠端基底 URL：`https://azrae26.github.io/GPT_Text_Rewriting`

## 自動更新流程

`background.js` 使用 `chrome.alarms` 每分鐘執行一次版本檢查：

1. fetch `version.json` 比對本機 `chrome.storage.local` 中儲存的版本號
2. 若遠端版本較新 → 重載所有 `data.uanalyze.twobitto.com` 的分頁
3. 呼叫 `chrome.runtime.reload()` 自動重啟擴充功能（不需手動到 `chrome://extensions/` 按重新載入）

## 各檔案職責

| 檔案 | 職責 |
|------|------|
| `background.js` | Service Worker：版本檢查、訊息路由（popup ↔ content script） |
| `loader.js` | Content script 入口：從 GitHub Pages 動態載入 `content.js` |
| `content.js` | 核心功能：改寫按鈕、AI API 呼叫、股票代碼偵測、雙擊改寫 |
| `popup.js` | 擴充功能彈出視窗：設定 API 金鑰、改寫指令、模型選擇 |
| `version.json` | 版本號，控制自動更新觸發 |

## content.js 結構

三個主要物件：
- **`GlobalSettings`**：從 `chrome.storage.sync` 載入設定（API 金鑰、改寫指令、模型選擇、自動改寫 regex 模式）
- **`TextProcessor`**：處理改寫邏輯，呼叫 Gemini 或 GPT-4 API
- **`UIManager`**：管理改寫按鈕、改寫中通知（含讀秒）、股票代碼快速填充按鈕

功能僅在以下 URL 啟用（由 `shouldEnableFeatures()` 控制）：
- `https://data.uanalyze.twobitto.com/research-reports/create`
- `https://data.uanalyze.twobitto.com/research-reports/*/edit`

## 訊息傳遞

```
popup.js → background.js → content.js（透過 chrome.tabs.sendMessage）
content.js → background.js（contentScriptReady、rewrite 等 action）
```

設定儲存使用 `chrome.storage.sync`（跨裝置同步），版本號使用 `chrome.storage.local`。
