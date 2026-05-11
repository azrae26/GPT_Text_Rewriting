# AI 文章改寫助手

Chrome Extension (Manifest V3)，針對 `data.uanalyze.com.tw` 與 `pro.uanalyze.com.tw` 提供 AI 改寫、翻譯、文字替換、股票匹配等功能。

## 系統要求

- Chrome 88.0 或更高版本
- 有效的 API 金鑰（Gemini 或 OpenAI GPT-4o）

## 安裝步驟

1. 下載擴展文件
2. 開啟 Chrome → `chrome://extensions/`
3. 開啟右上角「開發者模式」
4. 點擊「載入已解壓的擴充功能」，選擇擴展資料夾

---

## 主要功能

### 1. 智能文本改寫
- 選取改寫：反白文字後點擊改寫按鈕
- 全文改寫：未選取時改寫整篇文章
- 雙擊觸發智能改寫（自動識別特殊格式）
- 支援多任務並行、位置自動追蹤

### 2. 關鍵要點總結
- 浮動視窗顯示（可拖曳、位置記憶）
- 切換股票時自動更新內容

### 3. 文字替換
- 手動替換：高亮框標示，虛擬滾動優化
- 自動替換：規則型批次替換

### 4. 翻譯功能
- 支援 Google Cloud Translation API
- 多段落批次翻譯，含錯誤處理與狀態重置

### 5. 股票功能
- 股票代碼智能識別與匹配
- 自動爬取台股清單（37 個產業，來源：goodinfo.tw）
- 定時爬取（可設間隔）、立即爬取、停止控制
- 智能合併：保留匹配規則，更新公司名稱

### 6. AI 智能續寫
- `text_complete/auto-complete.js` 提供游標位置續寫功能

### 7. Diff 高亮
- 改寫前後差異視覺化標示

---

## 執行環境

| 環境 | 入口 | 說明 |
|------|------|------|
| Service Worker | `background.js` | 背景常駐，處理爬蟲／同步／消息路由 |
| Content Script | `content.js` | 注入目標網頁，協調所有功能模組 |
| Popup | `popup.html` + `popup.js` | 用戶設定介面 |

支援網域：
- `https://data.uanalyze.com.tw/*`（主要功能）
- `https://pro.uanalyze.com.tw/lab/*`（UA 助手、快速複製）

---

## 核心模組架構

| 模組 | 路徑 | 說明 |
|------|------|------|
| 預設值與日誌 | `default.js` | 所有腳本第一依賴，提供 `LogUtils` |
| 設定系統 | `settings/` + `settings.js` | 分類儲存、載入、匯入匯出 |
| 雲端同步 | `SettingsIO/` | Google Drive 雙向同步 |
| 文本處理 | `text-processor.js` | AI 模型整合核心 |
| UI 管理 | `ui-manager.js` | 統一介面控制 |
| 文字替換 | `text_replace/` | 手動／自動替換 |
| 高亮系統 | `text_highlight/highlight.js` | 虛擬滾動高亮渲染 |
| 翻譯 | `translate/` + `google_translator/` | 多語言翻譯 |
| 股票爬蟲 | `stock_crawl/` | 背景爬蟲管理 |
| 股票匹配 | `stock_matcher/` | 代碼識別與比對 |
| 股票控制器 | `popup/stock-controller.js` | Popup 股票功能模組 |
| 報告輔助 | `stock_report_helper/` | 快速複製、股票分析 |
| 智能續寫 | `text_complete/auto-complete.js` | AI 續寫 |
| Diff 高亮 | `diff-highlighter/` | 改寫差異標示 |
| UA 助手 | `ua_assistant/` | pro 站點自動操作 |

---

## 設定系統

### 儲存策略

| 分類 | 代表鍵值 | 儲存位置 |
|------|------|------|
| `CORE_SETTINGS` | 模型選擇、API 金鑰、生成設定群組 | Chrome sync storage |
| `LARGE_CONTENT` | instruction、背景知識等大型文字 | local storage（Drive 同步）|
| `USER_DATA` | 替換規則、自定義模型 | local storage（Drive 同步）|
| `INTERNAL_SYSTEM` | 同步狀態、deviceId | local storage（不同步）|

> 所有新功能一律使用 Local Storage，避免 sync storage 8KB 限制。

---

## 使用指南

### 基本操作

1. **文本改寫**：選中文字 → 點擊改寫按鈕；或快捷鍵 Alt+R
2. **總結視窗**：點擊浮動燈泡展開／收合，拖曳標題列移動
3. **股票爬蟲**：Popup → 股票分頁 → 設定間隔 → 啟動自動爬取

### API 設定

點擊擴展圖示 → 設定頁面 → 輸入 Gemini 或 OpenAI API 金鑰

### 雲端同步

透過 Google Drive 同步設定（需 Google 帳號授權），自動於背景執行，不受 Popup 關閉影響。

---

## 測試

```bash
# 運行所有測試
npx playwright test

# 查看測試報告
npx playwright show-report
```

### 測試文件
- `tests/01-critical-settings.spec.js` — 關鍵設定功能
- `tests/02-core-functions.spec.js` — 核心功能
- `tests/helpers/extension-helper.js` — 測試輔助工具

### 需要更新測試的情況
- 新增／修改設定項目（輸入框、下拉選單）
- 修改儲存機制或記憶功能
- 變更 UI 結構（分頁、選擇器）
- 修改核心功能邏輯

---

## 常見問題

1. **API 連接失敗** — 確認金鑰有效、網路連線正常、API 配額充足
2. **改寫／總結無反應** — 確認網址在支援清單內，重新載入擴展
3. **高亮框消失** — 重新整理頁面，或重新載入擴展

---

## 版權聲明

© 2025 AI 文章改寫助手。保留所有權利。
