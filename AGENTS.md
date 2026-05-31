> **同步提醒**：本檔案與 `CLAUDE.md` 內容相同，更新時必須同步更新另一份。
> **Skill 同步**：`.claude/skills/`、`.cursor/skills/`、`.codex/skills/` 三份 skill 內容相同，修改時必須三個都改。

# AI 文章改寫助手 - 專案架構

Chrome Extension (Manifest V3)，主要針對 `data.uanalyze.com.tw` 提供 AI 改寫、翻譯、文字替換、股票匹配等功能；在 `www.notion.so` 僅載入續寫功能。

## 執行環境

| 環境 | 入口 | 說明 |
|------|------|------|
| Service Worker | `background.js` | 背景常駐，處理爬蟲/同步/消息路由 |
| UAnalyze Content Script | `content.js` | 注入 `data.uanalyze.com.tw`，協調所有功能模組 |
| Notion Content Script | `text_complete/auto-complete.js` | 注入 `www.notion.so`，只啟用續寫 |
| Popup | `popup.html` + `popup.js` | 用戶設定介面 |

## 核心入口檔案

- **`default.js`**：所有腳本的第一個依賴。提供 `LogUtils`（格式 `[FileName][HH:MM:SS]`）、預設設定值。直接宣告為 `const LogUtils`，不用 `window.LogUtils`
- **`content.js`**：UAnalyze content script 主入口（載入順序最後），協調所有模組初始化
- **`text_complete/auto-complete.js`**：續寫功能入口；在 UAnalyze 讀取 `textarea[name="content"]`，在 Notion 讀取游標所在 `.layout.layout-reskin-wider`（缺少時回退 `.layout`）中游標前內容作為 `{{Context}}`、游標後內容作為 `{{background}}`（Ctrl 三下為 `無`，Alt 三下帶入後文）
- **`background.js`**：Service Worker，消息路由、股票爬蟲、雲端同步、自動匯出排程
- **`settings.js`**：`GlobalSettings` 單例，所有模組獲取設定的統一入口（`window.GlobalSettings`）

## 設定系統（`settings/` 資料夾）

架構：`settings-key.js` 定義分類 → `storage-manager.js` 操作儲存 → loader/classifier/exporter/importer 各司其職 → `settings.js` 統一對外

### 儲存策略

| 分類 | 代表鍵值 | 儲存位置 | 同步方式 |
|------|------|------|------|
| `CORE_SETTINGS` | 模型選擇、API金鑰、`generationSettingsGroups` | **Chrome sync storage** | Chrome 自動多裝置同步，不走 Drive |
| `LARGE_CONTENT` | instruction、背景知識等大型文字 | **local storage** | Google Drive 同步 |
| `USER_DATA` | 替換規則、自定義模型等 | **local storage** | Google Drive 同步 |
| `INTERNAL_SYSTEM` | 同步狀態、deviceId 等 | **local storage** | 不同步 |

> **所有新功能一律用 Local Storage**，避免 sync storage 8KB 限制。

## 模組載入順序（Content Script）

UAnalyze 主內容腳本：

```
default.js
  → regex_helper, text_highlight, text_replace/*
  → settings/* (key → storage → api-key → model → generation → cleanup → classifier → exporter → importer → loader)
  → status_monitor
  → settings.js
  → SettingsIO/settings-io.js + settings-io-startup.js
  → notification.js, undo.js, text-processor.js
  → translate/*, multiple_generation, google_translator
  → stock_matcher, diff-highlighter/*
  → ui-manager.js, report_copy/report-copy.js, stock_report_helper/*, text_complete
  → content.js（最後）
```

Notion 續寫專用內容腳本：

```
default.js
  → settings/* (key → storage → api-key → model → generation → cleanup → classifier → exporter → importer → loader)
  → settings.js
  → notification.js
  → text-processor.js
  → text_complete/auto-complete.js
```

## 常見修改對應位置

| 任務 | 需修改的檔案 |
|------|------|
| 新增設定項 | `settings.js`、`settings/settings-key.js`、`settings/settings-loader.js`、`popup.js`、`popup.html` |
| 新增改寫功能 | `text-processor.js`（邏輯）、`ui-manager.js`（按鈕）、`content.js`（初始化） |
| 修改複製到新報告 | `report_copy/report-copy.js`（對話框＋填表）、`ui-manager.js`（複製按鈕）、`background.js`（並行開分頁推送＋`reportCopyLog`）、`stock_matcher/stock-matcher.js`（`resolveStock`/`getStocksFromContent`） |
| 修改 Notion 續寫 | `manifest.json`、`text_complete/auto-complete.js` |
| 新增翻譯功能 | `translate/translate-service.js`（邏輯）、`translate/translate-adapter.js`（UI） |
| 修改爬蟲邏輯 | `stock_crawl/stock-crawler-manager.js`、`background.js` |
| 修改同步邏輯 | `SettingsIO/settings-io.js`、`SettingsIO/settings-io-background-sync.js` |
| 修改 Popup UI | `popup.html`、`popup.js`、`popup.css` |

---

## ES6 模組：不使用

現有代碼全部使用 `window.xxx` 全域變數模式，無 `type="module"` 或 import/export。保持傳統模式，避免大規模重構風險。

---

## 文件維護規則

**本文件必須與程式碼保持同步。** 以下情況發生時，AI 必須主動更新本文件（以及同步更新 `CLAUDE.md`）：

| 觸發條件 | 需更新的章節 |
|------|------|
| 新增/移除 js 檔案或資料夾 | 執行環境、核心入口檔案、模組載入順序 |
| 更改模組載入順序（`manifest.json`） | 模組載入順序 |
| 新增/修改設定分類或儲存策略 | 設定系統、儲存策略 |
| 新增功能類型（改寫、翻譯、爬蟲等） | 常見修改對應位置 |
| 修改全域命名規範或架構慣例 | 核心入口檔案、ES6 模組章節 |

> 完成程式碼修改後，若上述任一條件符合，必須在同一次作業中更新本文件，不可留待日後補充。
