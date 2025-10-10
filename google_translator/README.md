# Google 翻譯功能

這個模組提供了基於 Google Translation API v3 的翻譯功能，支援分批翻譯大型文本。

## ⚙️ API 設定資訊

**更新日期：2025-10-10**

- **Google 帳號**：azrae26@gmail.com
- **專案 ID**：gen-lang-client-0507957210
- **專案編號**：862665835661
- **免費配額**：500,000 字元/月
- **每分鐘限制**：3,000,000 字元
- **計費警告**：$100 USD
- **計費狀態**：已啟用（Mastercard •••• 3513）

## 功能特點

- **分批處理**：自動將大型文本分割成多個批次（每批最多 29,000 字元）
- **智能分割**：按段落和句子進行智能分割，保持文本結構
- **進度顯示**：實時顯示翻譯進度和狀態
- **取消支持**：隨時可以取消正在進行的翻譯
- **選擇翻譯**：支援翻譯選中的文本或整個文檔

## 使用方法

1. 在符合條件的頁面上，會自動出現「Google翻譯」按鈕
2. 點擊按鈕開始翻譯：
   - 如果有選中文本，只翻譯選中部分
   - 如果沒有選中文本，翻譯整個文檔
3. 翻譯過程中按鈕會變成「取消」，可以隨時停止
4. 翻譯完成後會自動替換原文

## 配置文件

- `gen-lang-client-0507957210-3b8a690087e2.json`：Google Cloud 服務帳戶金鑰（已被 .gitignore 排除）

## 重要安全提醒

⚠️ **當前實現為演示版本，不適合生產環境使用**

### 安全問題
- 服務帳戶金鑰暴露在前端代碼中
- JWT 簽名無法在瀏覽器中安全執行
- API 金鑰可能被惡意使用

### 建議的生產環境解決方案

1. **後端代理服務**
   ```
   前端 → 您的後端服務 → Google Translation API
   ```

2. **後端實現要點**
   - 在後端安全地處理 JWT 簽名
   - 在後端調用 Google Translation API
   - 前端只向您的後端發送翻譯請求
   - 實施適當的身份驗證和授權

3. **參考架構**
   ```javascript
   // 前端代碼示例
   async function translateText(text) {
     const response = await fetch('/api/translate', {
       method: 'POST',
       headers: {
         'Content-Type': 'application/json',
         'Authorization': 'Bearer YOUR_APP_TOKEN'
       },
       body: JSON.stringify({
         text: text,
         sourceLanguage: 'zh-TW',
         targetLanguage: 'en'
       })
     });
     
     return await response.json();
   }
   ```

## API 使用量和費用

### Google Translation API v3 免費額度
- **每月前 500,000 字元完全免費**
- 超出後按 $20/百萬字元收費

### 當前配置
- 單次最大：29,000 字元
- 分批間隔：根據總批次數自動調整（0.5-7秒）

## 技術實現

### 文件結構
```
google_translator/
├── google-translate.js     # 主要翻譯邏輯
├── jwt-helper.js          # JWT 處理輔助工具
├── gen-lang-client-*.json # Google Cloud 服務帳戶金鑰
└── README.md             # 說明文件
```

### 核心模組
- `GoogleTranslateManager`：主要管理器
- `GoogleTranslateConfig`：配置常數
- `JWTHelper`：JWT 處理工具

### 關鍵方法
- `splitTextIntoBatches()`：智能文本分割
- `translateText()`：調用 Google Translation API
- `processNextBatch()`：批次處理邏輯

## 開發和調試

### 啟用實際 API 調用
在 `google-translate.js` 中將演示模式設為 false：
```javascript
// 方案一：使用演示模式（當前實現）
if (false) { // 改為 false 啟用實際 API
```

### 調整翻譯語言
在 `translateText()` 方法中修改：
```javascript
const requestBody = {
  contents: [text],
  targetLanguageCode: 'en',    // 目標語言
  sourceLanguageCode: 'zh-TW'  // 源語言
};
```

支援的語言代碼請參考 [Google Cloud Translation 文檔](https://cloud.google.com/translate/docs/languages)。 