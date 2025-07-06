# 專案檔案結構說明

## 功能分類對照表

### 股票代碼功能 (已模組化 - 2025-01-08)
- `stock_matcher/stock-matcher.js`: 股票代號自動匹配核心模組 ⭐**新增**
- `ui-manager.js`: 股票代碼功能委派和向後兼容 (已重構)
- `stock_list.js`: 股票代碼和名稱的對應資料
- `content_script_uanalyze.css`: 股票代碼按鈕樣式

### 文字改寫功能
- `text-processor.js`: 改寫核心邏輯
- `ui-manager.js`: 改寫按鈕相關功能
- `settings.js`: 改寫模式設定

### 翻譯功能
- `translate/translate-config.js`: 翻譯配置與常數
- `translate/translate-controller.js`: 翻譯狀態管理
- `translate/translate-service.js`: 翻譯核心業務邏輯
- `translate/translate-adapter.js`: 翻譯UI適配器
- `settings.js`: 翻譯相關設定

### 設定管理
- `popup.html/popup.js`: 設定介面
- `settings.js`: 設定儲存和讀取
- `default.js`: 預設設定

### 通知系統
- `notification.js`: 通知功能
- `content_script_uanalyze.css`: 通知樣式

### 文字標示功能
- `text_highlight/highlight.js`: 文字標示核心功能
- `content_script_uanalyze.css`: 標示樣式

## 核心功能檔案

### ui-manager.js
UI 管理模組，負責處理使用者介面相關功能 (已重構 - 2025-01-08)
- `addRewriteButton()`: 添加改寫按鈕
- `_setupTextArea()`: 設置文本區域
- `_handleDoubleClick()`: 處理雙擊改寫事件
- `initializeStockCodeFeature()`: 委派給 StockMatcher 模組 (保持向後兼容)
- `removeStockCodeFeature()`: 委派給 StockMatcher 模組 (保持向後兼容)
- `removeRewriteButton()`: 移除改寫按鈕

### text-processor.js
文本處理模組，負責文字改寫的核心邏輯
- `findSpecialText()`: 查找特殊文本
- `isSpecialText()`: 檢查是否為特殊文本
- `rewriteText()`: 執行文字改寫
- `_prepareApiConfig()`: 準備 API 請求配置
- `_sendRequest()`: 發送 API 請求

### translate/ 翻譯模組
模組化翻譯功能，分為四個檔案：

#### translate-config.js
翻譯配置與常數管理
- API 配置（重試、超時、間隔）
- 批次處理配置
- 階段標識符

#### translate-controller.js  
翻譯狀態管理器
- 狀態管理（idle, translating, reflecting, optimizing, completed, cancelled）
- 取消機制和 AbortController
- 觀察者模式實現

#### translate-service.js
翻譯核心業務邏輯
- 文本分割邏輯
- 中英對照表管理
- 翻譯上下文處理
- API請求重試機制

#### translate-adapter.js
翻譯UI適配器
- UI操作和事件處理
- 翻譯流程協調
- 批次管理和進度更新
- 向後兼容性支持

### stock_matcher/stock-matcher.js ⭐**新增模組**
股票代號自動匹配模組 (2025-01-08 從 ui-manager.js 分離)
- `initializeStockCodeFeature()`: 初始化股票代碼功能
- `removeStockCodeFeature()`: 移除股票代碼功能
- `_loadStockListFromSettings()`: 從設定載入股票清單
- `_parseStockList()`: 解析股票清單文字為物件陣列
- `_getStockCodes()`: 從文本中智能提取股票代碼
- `_updateStockButtons()`: 動態創建和管理股票代碼按鈕
- `_getOrCreateContainer()`: 獲取或創建按鈕容器
- `updateStockList()`: 更新股票清單並重新初始化

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

### stock_matcher/test-stock-matcher.html ⭐**新增**
StockMatcher 模組測試檔案 (2025-01-08)
- 獨立的 HTML 測試頁面
- 測試股票清單解析功能
- 測試股票代碼提取功能
- 測試UI功能模擬
- 提供視覺化測試結果