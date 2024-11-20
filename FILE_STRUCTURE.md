# 專案檔案結構說明

## 功能分類對照表

### 股票代碼功能
- `ui-manager.js`: 股票代碼按鈕的初始化和移除
- `stock_list.js`: 股票代碼和名稱的對應資料
- `content_script_uanalyze.css`: 股票代碼按鈕樣式

### 文字改寫功能
- `text-processor.js`: 改寫核心邏輯
- `ui-manager.js`: 改寫按鈕相關功能
- `settings.js`: 改寫模式設定

### 翻譯功能
- `translate.js`: 翻譯核心功能
- `settings.js`: 翻譯相關設定

### 設定管理
- `popup.html/popup.js`: 設定介面
- `settings.js`: 設定儲存和讀取
- `default.js`: 預設設定

### 通知系統
- `notification.js`: 通知功能
- `content_script_uanalyze.css`: 通知樣式

## 核心功能檔案

### ui-manager.js
UI 管理模組，負責處理使用者介面相關功能
- `addRewriteButton()`: 添加改寫按鈕
- `_setupTextArea()`: 設置文本區域
- `_handleDoubleClick()`: 處理雙擊改寫事件
- `initializeStockCodeFeature()`: 初始化股票代號按鈕功能
- `removeStockCodeFeature()`: 移除股票代號按鈕功能
- `removeRewriteButton()`: 移除改寫按鈕

### text-processor.js
文本處理模組，負責文字改寫的核心邏輯
- `findSpecialText()`: 查找特殊文本
- `isSpecialText()`: 檢查是否為特殊文本
- `rewriteText()`: 執行文字改寫
- `_prepareApiConfig()`: 準備 API 請求配置
- `_sendRequest()`: 發送 API 請求

### translate.js
翻譯功能模組
- `translateText()`: 執行文本翻譯
- `batchTranslate()`: 批次翻譯處理
- `cancelTranslation()`: 取消翻譯

### notification.js
通知系統模組
- `showNotification()`: 顯示通知
- `removeNotification()`: 移除通知
- `updateNotification()`: 更新通知內容

### settings.js
設定管理模組
- `loadSettings()`: 載入設定
- `saveSettings()`: 儲存設定
- `saveSingleSetting()`: 儲存單一設定
- `updateAutoRewritePatterns()`: 更新自動改寫模式

### undo.js
復原功能模組
- `initInputHistory()`: 初始化輸入歷史
- `addToHistory()`: 添加到歷史記錄
- `undo()`: 復原操作
- `redo()`: 重做操作

## 資料檔案

### stock_list.js
股票清單資料
- 包含股票代號按鈕和名稱的對應資料

### default.js
預設設定檔
- 包含預設的 API 設定
- 預設的改寫指令
- 預設的翻譯指令

## 介面檔案

### popup.html
擴充功能彈出視窗的 HTML 檔案

### popup.js
彈出視窗的功能實作
- 設定頁面的互動邏輯
- API 金鑰管理
- 模型選擇功能

### content_script_uanalyze.css
頁面樣式表
- 按鈕樣式
- 通知元素樣式
- 股票代號按鈕樣式

## 設定檔案

### manifest.json
Chrome 擴充功能設定檔
- 擴充功能基本資訊
- 權限設定
- 資源引用設定

### .vscode/settings.json
VS Code 編輯器設定

## 其他檔案

### content.js
內容腳本，負責與網頁互動
- 初始化擴充功能
- 監聽頁面變化
- 載入必要模組

### README.md
專案說明文件
- 功能說明
- 安裝步驟
- 使用指南

### npm-debug.log
npm 除錯日誌檔案