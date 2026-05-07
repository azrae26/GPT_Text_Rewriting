# Chrome Extension 開發模式自動重載功能

## 功能說明

儲存任何插件檔案後，Chrome 插件會在 5 秒內自動重新載入。
若 popup 頁面當時是開著的，重載後會自動重新開啟。
不需要任何外部程式或手動操作。

## 實作方式

使用 Chrome MV3 的 **Offscreen Document** API，在背景永久執行隱藏頁面，
定期 fetch 插件自身的檔案內容，偵測到內容變更時通知 service worker 重載。

---

## 步驟一：新增 `dev-offscreen.html`

```html
<!DOCTYPE html>
<html><head><meta charset="utf-8"></head>
<body><script src="dev-offscreen.js"></script></body>
</html>
```

---

## 步驟二：新增 `dev-offscreen.js`

```js
// 從 manifest.json 動態取得所有檔案清單
async function getManifestFiles() {
  const res = await fetch(chrome.runtime.getURL('manifest.json') + '?_=' + Date.now(), { cache: 'no-cache' });
  const manifest = await res.json();
  const files = new Set(['manifest.json']);

  if (manifest.background?.service_worker) files.add(manifest.background.service_worker);
  if (manifest.action?.default_popup) files.add(manifest.action.default_popup);

  for (const cs of manifest.content_scripts || []) {
    for (const f of [...(cs.js || []), ...(cs.css || [])]) files.add(f);
  }

  for (const entry of manifest.web_accessible_resources || []) {
    for (const f of entry.resources || []) {
      if (!f.includes('*')) files.add(f);
    }
  }

  return [...files];
}

// 取得所有檔案內容的合併字串（用來比對是否有變更）
async function getHash(files) {
  const contents = await Promise.all(
    files.map(async file => {
      try {
        const res = await fetch(chrome.runtime.getURL(file) + '?_=' + Date.now(), { cache: 'no-cache' });
        return await res.text();
      } catch (e) {
        return '';
      }
    })
  );
  return contents.join('\n---\n');
}

(async () => {
  const files = await getManifestFiles();
  let lastHash = await getHash(files);

  setInterval(async () => {
    try {
      const currentHash = await getHash(files);
      if (currentHash !== lastHash) {
        lastHash = currentHash;
        chrome.runtime.sendMessage({ action: 'fileChanged' });
      }
    } catch (e) {}
  }, 5000); // 每 5 秒檢查一次
})();
```

---

## 步驟三：修改 `manifest.json`

在 `permissions` 陣列加入：

```json
"offscreen",
"windows"
```

範例：
```json
"permissions": [
  "storage",
  "tabs",
  "offscreen",
  "windows"
]
```

---

## 步驟四：修改 `background.js`（service worker）

### 4-1. 啟動時建立 offscreen document

在 service worker 初始化的地方（最外層 or 初始化函式內）加入：

```js
(async () => {
  try {
    const contexts = await chrome.runtime.getContexts({ contextTypes: ['OFFSCREEN_DOCUMENT'] });
    if (contexts.length === 0) {
      await chrome.offscreen.createDocument({
        url: 'dev-offscreen.html',
        reasons: ['DOM_SCRAPING'],
        justification: '監聽擴充套件檔案變更以支援開發時自動重新載入'
      });
    }
  } catch (e) {
    // chrome.runtime.getContexts 在較舊 Chrome 版本不存在，改用 try/catch 直接建立
    try {
      await chrome.offscreen.createDocument({
        url: 'dev-offscreen.html',
        reasons: ['DOM_SCRAPING'],
        justification: '監聽擴充套件檔案變更以支援開發時自動重新載入'
      });
    } catch (e2) {
      // 已存在或不支援時忽略
    }
  }
})();
```

### 4-2. 監聽 popup 開關狀態

在 `chrome.runtime.onConnect.addListener` 的最前面加入：

```js
chrome.runtime.onConnect.addListener((port) => {
  if (port.name === 'popupOpen') {
    chrome.storage.session.set({ devPopupWasOpen: true });
    port.onDisconnect.addListener(() => {
      chrome.storage.session.remove('devPopupWasOpen');
    });
    return;
  }

  // ... 其他 port 處理邏輯
});
```

如果原本沒有 `onConnect` listener，直接新增整個 listener 即可。

### 4-3. 處理 `fileChanged` 訊息

在 `chrome.runtime.onMessage.addListener` 的處理邏輯內加入：

```js
if (request.action === 'fileChanged') {
  console.log('🔄 [DevReload] 偵測到檔案變更');
  chrome.storage.session.get('devPopupWasOpen').then((result) => {
    const popupWasOpen = !!result.devPopupWasOpen;
    console.log(`🔄 [DevReload] popup 狀態: ${popupWasOpen ? '開著，重啟後重開' : '關著，不重開'}`);
    if (popupWasOpen) chrome.storage.local.set({ devReopenPopup: true });
    console.log('🔄 [DevReload] 300ms 後執行 chrome.runtime.reload()...');
    setTimeout(() => chrome.runtime.reload(), 300);
  });
  return false;
}
```

### 4-4. 重啟後自動重開 popup

在 service worker 的初始化函式（`onInstalled` 或自訂的 init 函式）一開始加入：

```js
const result = await chrome.storage.local.get('devReopenPopup');
if (result.devReopenPopup) {
  console.log('🔄 [DevReload] 重啟完成，準備重開 popup...');
  await chrome.storage.local.remove('devReopenPopup');
  setTimeout(async () => {
    try {
      const wins = await chrome.windows.getAll({ windowTypes: ['normal'] });
      const win = wins[0];
      if (win) {
        await chrome.windows.update(win.id, { focused: true });
        await new Promise(r => setTimeout(r, 300));
        await chrome.action.openPopup({ windowId: win.id });
        console.log('✅ [DevReload] popup 重開成功');
      }
    } catch (e) {
      console.warn('⚠️ [DevReload] 無法自動重開 popup:', e.message);
    }
  }, 800);
} else {
  console.log('🔄 [DevReload] 重啟完成（popup 原本關著）');
}
```

> **注意**：`chrome.action.openPopup()` 需要 Chrome 127+。舊版本不支援時會靜默失敗，其他功能不受影響。
>
> 若專案有自訂的 log 工具（如 `LogUtils.important`），可把 `console.log` 換成對應的方法。

---

## 步驟五：修改 `popup.js`

在 popup.js 的最頂層（所有程式碼最前面）加入一行：

```js
chrome.runtime.connect({ name: 'popupOpen' });
```

---

## 完整運作流程

1. 插件載入 → service worker 建立 offscreen document
2. Offscreen document 每 5 秒 fetch 所有插件檔案，比對內容是否變更
3. 偵測到變更 → 通知 service worker
4. Service worker 檢查 popup 是否開著（透過 port 連線追蹤）
5. 若 popup 開著 → 設定 `devReopenPopup` flag
6. 呼叫 `chrome.runtime.reload()` 重載插件
7. 重載後 → 若有 `devReopenPopup` flag → 聚焦 Chrome 視窗 → 重開 popup

## 注意事項

- 此功能沒有環境判斷，上線版本建議移除（或加上 `const DEV_MODE = false` 的開關）
- `chrome.storage.session` 需要 Chrome 102+
- `chrome.action.openPopup()` 需要 Chrome 127+
- Offscreen document 的 `fetch` 對 unpacked（開發者模式載入）插件會讀取磁碟上的最新檔案內容

---

## 已知陷阱

### 陷阱一：`importScripts` 不能在函式內呼叫

MV3 service worker 嚴格限制 `importScripts` 只能在頂層（top-level）呼叫。
若原本的插件有類似這種「懶載入」模式：

```js
function loadDependencies() {
  importScripts('settings.js');      // ❌ 在函式內呼叫，auto-reload 後會 NetworkError
  importScripts('settings-key.js');
}
```

auto-reload 後 Chrome 會拒絕執行，拋出 `NetworkError: The script failed to load`，
導致後續依賴這些 scripts 的功能全部失效。

**解法**：把所有 `importScripts` 移到頂層：

```js
// ✅ 正確：全部放在頂層
importScripts('settings/settings-key.js');
importScripts('settings.js');
importScripts('SettingsIO/settings-io.js');
importScripts('SettingsIO/settings-io-startup.js');

function loadDependencies() {
  // 不再呼叫 importScripts，只做狀態檢查
  if (typeof SettingsIO === 'undefined') {
    console.error('SettingsIO 未定義');
  }
}
```

### 陷阱二：`pagehide` 在 popup 關閉時不可靠

直覺上會想用 `window.addEventListener('pagehide', ...)` 來偵測 popup 關閉，但
Chrome extension popup 關閉時 `pagehide` 不一定會觸發，導致 flag 無法被清除，
造成「popup 明明沒開，卻每次都自動重開」的問題。

**解法**：改用 port 連線讓 service worker 追蹤，port 斷線比 `pagehide` 可靠：

```js
// popup.js（用 port，不用 pagehide）
chrome.runtime.connect({ name: 'popupOpen' });

// background.js
chrome.runtime.onConnect.addListener((port) => {
  if (port.name === 'popupOpen') {
    chrome.storage.session.set({ devPopupWasOpen: true });
    port.onDisconnect.addListener(() => {
      chrome.storage.session.remove('devPopupWasOpen');
    });
  }
});
```

Port 在 extension reload 時 service worker 來不及執行 `onDisconnect`，
所以 `devPopupWasOpen` 自然保留，這正是我們需要的行為。
