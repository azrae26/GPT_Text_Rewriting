# 🧪 GPT Text Rewriting 自動化測試

## 📋 測試概述

本項目使用 **Playwright** 進行 Chrome 插件的自動化測試，專門解決你在開發過程中最常遇到的問題：

### 🎯 測試重點（基於實際開發痛點）
1. **🚨 POP頁關閉後內容消失** - 最關鍵問題
2. **💾 設定儲存功能** - Local Storage vs Sync Storage
3. **🌐 GPT翻譯功能** - API錯誤處理和取消機制
4. **🚀 初始化載入** - 插件模組正確載入
5. **🎨 高亮功能** - 文字高亮正常運作
6. **🔄 手動自動替換** - 替換功能穩定性

## 🛠️ 環境設定

### 前置需求
- **Node.js 16+**
- **Windows 10/11** (配置已針對Windows最佳化)
- **Chrome 瀏覽器**

### 安裝步驟

```powershell
# 1. 安裝依賴
npm install

# 2. 安裝 Playwright 瀏覽器
npm run install-browsers

# 3. 設定測試 API 金鑰（可選）
$env:TEST_OPENAI_KEY = "your-test-api-key"
```

## 🚀 執行測試

### 基本測試命令

```powershell
# 執行所有測試（有頭模式，可以看到瀏覽器）
npm test

# 只執行關鍵設定測試（推薦先執行這個）
npm run test:critical

# 執行核心功能測試
npm run test:core

# 偵錯模式（逐步執行）
npm run test:debug

# 查看測試報告
npm run test:report
```

### 個人用插件簡化測試

```powershell
# 只測試最重要的3個問題
npx playwright test tests/01-critical-settings.spec.js -g "POP頁關閉後內容不消失"
npx playwright test tests/02-core-functions.spec.js -g "文字改寫基本功能"
npx playwright test tests/02-core-functions.spec.js -g "翻譯取消功能"
```

### 基本測試命令

```powershell
# 執行所有測試（有頭模式，可以看到瀏覽器）
npm test

# 只執行關鍵設定測試（推薦先執行這個）
npm run test:critical

# 執行核心功能測試（包含Mock API測試）
npm run test:core

# 執行高級AI功能測試
npm run test:advanced

# 只執行AI相關測試（核心+高級）
npm run test:ai-only

# 專門測試取消功能和競態條件
npm run test:cancel

# 快速執行Mock API測試
npm run test:mock

# 偵錯模式（逐步執行）
npm run test:debug

# 查看測試報告
npm run test:report
```

### 針對性測試命令

```powershell
# 測試最關鍵的取消功能問題
npm run test:cancel

# 測試完整的AI功能流程
npm run test:ai-only

# 測試特定功能（使用grep過濾）
npx playwright test -g "競態條件"
npx playwright test -g "多階段翻譯"
npx playwright test -g "反思機制"

# 快速測試（只看結果，不看過程）
npm run test:mock
```

## 📁 測試檔案結構

```
tests/
├── global-setup.js           # 全域測試設定
├── global-teardown.js        # 測試清理
├── helpers/
│   └── extension-helper.js   # 插件測試輔助工具
├── 01-critical-settings.spec.js  # 🚨 關鍵設定測試
└── 02-core-functions.spec.js     # ⚡ 核心功能測試
```

## 🧪 測試案例說明

### 01-critical-settings.spec.js - 關鍵設定測試

- **🚨 POP頁關閉後內容不消失測試**: 驗證彈出視窗關閉重開後，所有輸入內容都還在
- **⚡ 快速修改後立即關閉測試**: 模擬用戶快速操作，測試設定是否正確保存
- **💾 新功能 Local Storage 測試**: 驗證大型內容使用 Local Storage 儲存
- **🔄 儲存容量限制測試**: 測試超大內容的處理
- **🔧 設定項目完整性測試**: 全面測試所有設定項目的儲存

### 02-core-functions.spec.js - 核心功能測試

- **🚀 插件初始化載入測試**: 驗證插件在目標頁面正確載入
- **✏️ 文字改寫基本功能測試**: 測試改寫功能的基本流程
- **🌐 翻譯功能測試**: 測試翻譯功能（含中英文檢查）
- **🚨 翻譯取消功能測試**: 重點測試取消機制，防止內容丟失
- **⚠️ API 錯誤處理測試**: 測試各種API錯誤的處理
- **🔄 多任務處理測試**: 測試同時多個改寫任務的處理
- **📝 特殊文字識別測試**: 測試股票代碼等特殊文字識別

### 03-advanced-ai-features.spec.js - 高級AI功能測試

- **🔄 多階段翻譯流程測試**: 測試初始翻譯→反思→優化的完整流程
- **🧠 反思機制測試**: 驗證翻譯反思功能的準確性
- **⚡ 高負載並發測試**: 測試快速連續點擊的處理能力
- **🔄 中斷恢復測試**: 測試任務中斷後的恢復機制
- **🎯 邊界條件測試**: 測試空文本、超長文本等邊界情況

## 🔧 測試配置

### Playwright 配置 (playwright.config.js)
- **有頭模式**: 必須開啟，因為插件測試需要看到瀏覽器
- **Chrome 專用**: 只在 Chrome 中測試
- **Windows 最佳化**: 針對 Windows 環境設定
- **60秒超時**: 足夠處理 API 調用

### 輔助工具 (extension-helper.js)
- **自動取得插件ID**: 動態獲取Chrome擴展ID
- **彈出視窗操作**: 簡化彈出視窗開啟和操作
- **儲存清理**: 自動清理測試數據
- **錯誤檢查**: 自動檢查頁面錯誤訊息

## 🐛 常見問題排解

### 測試失敗常見原因

1. **插件未正確載入**
   ```powershell
   # 檢查 manifest.json 是否存在
   ls manifest.json
   
   # 確認插件檔案完整
   npm run test:debug
   ```

2. **找不到插件ID**
   - 確認插件名稱正確：`GPT Text Rewriting`
   - 手動檢查 `chrome://extensions/`

3. **API 測試失敗**
   - 設定測試用的 API 金鑰：`$env:TEST_OPENAI_KEY = "sk-..."`
   - 或使用 mock 模式（預設）

4. **元素找不到**
   - 檢查目標網頁是否正確載入
   - 確認插件是否在該網域啟用

### 偵錯技巧

```powershell
# 單一測試偵錯
npx playwright test tests/01-critical-settings.spec.js -g "POP頁關閉" --debug

# 查看瀏覽器控制台
npx playwright test --headed --debug

# 產生測試錄影
npx playwright test --video=on
```

## 📊 測試報告

執行測試後，可以查看詳細報告：

```powershell
npm run test:report
```

報告包含：
- ✅ 通過的測試數量
- ❌ 失敗的測試詳情
- 📸 失敗時的截圖
- 🎥 測試執行錄影
- ⏱️ 執行時間統計

## 🎯 個人用插件測試建議

基於你的使用情況，建議的測試頻率：

### 每次修改代碼後
```powershell
npm run test:critical
```

### 重大更新前
```powershell
npm test
```

### 遇到問題時
```powershell
npm run test:debug
```

## 🔄 持續改進

根據實際測試結果，我們會：
1. **新增痛點測試**: 遇到新問題時立即加入測試
2. **優化測試效率**: 縮短測試時間
3. **擴展測試範圍**: 涵蓋更多邊緣情況
4. **改進錯誤報告**: 提供更清楚的失敗原因

---

## 📞 支援

如果測試過程中遇到問題：
1. 檢查上述常見問題排解
2. 使用 `--debug` 模式查看詳細資訊
3. 查看測試報告中的錯誤截圖

**記住：這些測試專門針對你最常遇到的問題設計，能有效防止重複發生同樣的bug！** 🛡️ 