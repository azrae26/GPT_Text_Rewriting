---
name: add-setting
description: 新增設定項的完整 7 步驟清單，避免遺漏導致設定無法儲存或載入
---

# 新增設定項 — 必須完成的 7 步驟

> **最常失敗原因**：忘記步驟 2、3、5，導致載入是 `undefined` 或儲存無效

---

**1. settings.js 屬性初始化**
```javascript
newFeatureName: '',
```

**2. settings-key.js 註冊分類 ⚠️ 最常忘記**
```javascript
LARGE_CONTENT: [
  'newFeatureName',
],
```

**3. settings-loader.js localKeys 列表 ⚠️ 第二常忘記**
```javascript
const localKeys = [
  // 其他設定...
  'newFeatureName',
];
```

**4. settings-loader.js 載入邏輯**
```javascript
this.newFeatureName = localResult.newFeatureName || '';
```

**5. settings.js saveSettings() 儲存邏輯 ⚠️ 第三常忘記**
```javascript
// chrome.storage.local.set({ ... }) 區塊內加入：
newFeatureName: this.newFeatureName,
```

**6. popup.js DOM 引用 + 事件配置**
```javascript
const newFeatureInput = document.getElementById('newFeature');
newFeatureInput.value = settings.newFeatureName || '';
'newFeatureName': { type: 'input', element: newFeatureInput },
```

**7. popup.html 元素**
```html
<input id="newFeature" placeholder="輸入新功能內容">
```

---

**驗證**：輸入內容 → 關閉 Popup → 重開，確認有保存
