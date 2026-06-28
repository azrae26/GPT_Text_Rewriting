---
name: slowdown-leak-debug
description: 除錯本插件在 uanalyze 編輯頁「越點越慢／漸進卡頓／記憶體洩漏」、「滾動／捲動超卡、高亮跟隨慢」，或「替換 UI／主組顯不出來、間歇消失、切文章後沒重建」。觸發詞：越點越慢、越用越卡、漸進變慢、記憶體洩漏、效能爬升、UI 越來越慢、滾動卡、滾動超卡、捲動卡頓、高亮跟隨慢、scroll 卡、顯不出來、主組消失、替換框沒出現。
---

# 除錯「越點越慢」— 插件 UI 重建洩漏

**意圖**：uanalyze 點列表項目 → 網站**整個重掛編輯器**（157 個格子 textarea ＋主編輯器全換成新元素）→ 插件隨之重建 UI。若重建時建了 observer/listener 卻不回收，脫離的舊 DOM 與閉包會累積，**GC 暫停隨點擊變長 →「越點越慢」**。卡頓常是 GC 暫停，不是單純 CPU。

## 1. 先做 A/B，別信 trace 歸因（最易走錯的一步）

- 「漸進變慢」第一步：**插件關 vs 開**各點 ~20 次比對。關閉持平、開啟爬升 ＝ 是插件。
- **陷阱**：performance trace 的 ForcedReflow 常把時間算給網站（MUI `InputLabel`）。那是「誰**讀** layout」，不是「誰使 layout **失效**」。插件洩漏的觀察者會反覆使 layout 失效 → 害網站反覆重排；關掉插件網站就不重排。**看 reflow 會誤判方向，A/B 才是裁判。**

## 2. 突破 isolated world（卡關主因）

chrome-devtools `evaluate_script` 跑 **main world**，插件 content script 跑 **isolated world**：

- 看不到 `window.UIManager` 等插件全域；**無法**從外部攔截插件的 `addEventListener`/`MutationObserver`。
- **定位洩漏的唯一可靠法**：在 `default.js`（isolated world、最先載入）**暫時**包裝 `EventTarget.prototype.addEventListener`、`MutationObserver`、`ResizeObserver`，記「淨值（建立−回收）」並抓建立時 `new Error().stack`，寫進 **sessionStorage**（跨世界同源共享），再從 main world `evaluate` 讀。哪個淨值**每點擊爬升 ＝ 洩漏源**；stack 指出確切檔案/函式。用完移除。
- 為何不能用 `history.pushState` patch 偵測 SPA 路由：isolated world 的 patch 抓不到主世界 router 的呼叫，只能 MutationObserver 輪詢 `location.href`（見 `SharedUrlWatcher`）。

## 3. 量測保真度

- 合成 `dispatchEvent('click')` 比真實點擊**便宜 3–6 倍**（跳過 pointer/mousedown/focus/hover → 無 MUI 漣漪、`:hover`、focus 處理器）。要逼近真實須派完整序列：`pointerover→mousedown→blur 舊焦點→mouseup→click`。
- 但**合成仍無法觸發需真實焦點/游標的效果**（如 `selectionchange` 要 `activeElement===textarea`）。「越點越慢」的黃金驗證 ＝ **真人手點**（裝 sessionStorage 監測器，請使用者點 20 次）或 CDP 真實輸入。
- `worstStall`（量 `setTimeout`/`rAF` 最大間隔）會**捕捉到 GC 暫停**——記憶體洩漏使它隨點擊變長，即使 DOM 大小與活躍觀察者數穩定。

## 4. 反覆出現的洩漏 pattern

編輯器每次點擊**整個重掛**，所以：綁在被換掉元素上的監聽器隨元素 GC，**不是主因**（只灌大計數）；真正洩漏在 **document/window/模組層級**，或**扣住舊 DOM 不放使其無法 GC** 的觀察者/閉包。

已踩過的雷（修法皆「重建前先 disconnect/remove，存於 `this._xxx`」）：

- `replace-manager._setupTextAreaObserver`：用 MutationObserver 觀察 `textArea.parentElement` 偵測 textarea 被移除——但網站**連 parentElement 一起移除**，觀察者偵測不到自身根節點被移除、不會自我 disconnect → 每次洩漏一個，且閉包扣住**整個舊編輯器**不被 GC（最大宗）。
- `auto-replace-manager.createInput`：每個 input 各建一個 measureDiv 掛 `document.body`，只靠 `beforeunload` 清（session 內**永不觸發**）→ 累積上百個。改**全模組共用單一 measureDiv**、刪 beforeunload。
- `manual-replace._setupTextSelection`：`document` 上 `selectionchange` 每次重建都加不移除 → remove-before-add。
- `manual-replace.PreviewHighlight.initialize`：每次 UI 重建被**呼叫兩次**（`initializeManualGroups` 與 `initializeReplaceGroups` 手動分支各一次），各建一個 `#replace-preview-container` append 到 `textArea.parentElement` 卻不先移除舊的 → 漏孤兒容器＋每次 init 多一次強制重排，**per-init 同步成本隨 session 爬升（越點越慢；不同於 selectionchange，純合成點擊也測得出，不需真實焦點）**。修法：`initialize` 冪等（建前 `this.container.remove()`）＋刪掉重複呼叫（保留唯一呼叫者 `initializeManualGroups` 那次）。
- `highlight`／`manual-replace`／`diff-highlighter`：`ResizeObserver`、scroll 監聽建了不回收 → 單例化、重建前清。

## 5. 鐵則

- **在「會被重複呼叫的 init／重建路徑」建立任何 observer/listener，必須重建前先 disconnect/remove 上一個**（存 `this._xxx`），或用元素旗標防重綁，或共用單例。違反 ＝ 洩漏。
- 「於 unload 清理」對 session 內重建**無效**（beforeunload 不在點擊時觸發）；要綁到元素生命週期或用單例。
- **重建觸發是 globalObserver 的 mutation 驅動「一次性」事件**：網站載入文章後 DOM 轉靜便不再觸發。重建入口若用「時間鎖**拒絕並丟棄**建立期間收到的觸發」（原 `initializeReplaceUI` 的 `_isInitializing` 建一次鎖死 1000ms），那唯一一次觸發被丟棄後就再也沒有下一次 → 主組移除後**永不重建 →「顯不出來／10 秒以上才出現」**。注意這與越點越慢相反：**主執行緒空閒、worstStall 小，是「沒被重建」非「被卡住」**。**去重要用「合流」不是「丟棄」**：建立中又被任何觸發呼叫 → 記待辦、本次結束補跑最後一次（`_rebuilding`／`_rebuildPending`，永不丟失），再加**冪等**（已為當前編輯器建好就跳過，免重複/閃爍）；如此時間鎖與自癒補丁都不需要。診斷指紋：DOM 探針見 `-main` 卻無 `+main`、且自動組未被移除（`removeReplaceUI` 沒跑）＝ 入口被鎖擋掉了重建。
- DevReload ＝ offscreen 檔案監看 → 背景 `chrome.runtime.reload()`；改 content script 後**須重載擴充＋刷新頁面**才生效。chrome-devtools 的 `initScript` 註冊在 MCP 重連時會失效，需用 `evaluate` 重裝監測器。

## 6. 滾動超卡 ≠ 越點越慢

**意圖**：overlay（高亮／替換預覽／diff 標註）跟隨 textarea 內部捲動，本該是「整體平移」的廉價操作。卡頓不是因為元素多，而是**插件改 overlay 屬性的方式，連帶觸發了宿主網站重算整頁**。

**不變量（讀 code 看不出，必知）**：uanalyze 的 SPA 掛了 `MutationObserver(document.body, {childList:true, subtree:true, attributes:true})` 監聽**整個 body 的所有屬性變動**。overlay 都插在 textarea 容器內（body 子樹），所以插件改 overlay 的任何 inline style，都被它捕捉 → 觸發網站重算整頁（minified `D` 函式，可達數百 ms/次）。

**鐵則**：
- overlay 滾動跟隨**只准改 `transform`**（compositor 屬性，不被當 style 變動觸發宿主）。要藏元素用 `transform: translate(-99999px,-99999px)` 移出視窗、靠容器 `overflow:hidden` 裁切——**絕不每幀改 `visibility`／`display`／任何 inline style**；建立元素時亦同（否則建立那刻就觸發）。
- 復用元素**只寫會變的 transform**，不重寫 display/color（同屬會觸發宿主的 style 變動）。穩定復用 key（用 match 起始索引，非可見陣列索引）避免 `childList` churn（create/remove 同樣觸發宿主）。
- 三模組共用 `TextHighlight.SharedScroll` 單一 rAF（單一真相，模仿 default.js 的 `SharedUrlWatcher`），**禁止各自 `bindScrollEvent`**（各自綁＋各自讀 layout 會跨模組 read-after-write 強制重排）。

**診斷陷阱（避免再繞遠路）**：
- **用 PerformanceObserver `longtask` 量，別用 rAF 間隔**：視窗被別的視窗遮擋（occluded）時 Chrome 把該分頁 rAF 節流到 ~1fps，造成「idle 也 1000ms/幀」的假象，會把你導向錯誤方向；longtask 反映真實主執行緒阻塞、不受節流影響。`document.visibilityState` 仍是 `visible` 也可能 occluded。
- longtask 即使分頁在背景也準 → **可程式自驅動**（迴圈 `ta.scrollTop=…` ＋ longtask observer），不必每次叫使用者真人滾。
- **二分定位**：逐一 detach 各模組 overlay 容器，看哪個讓 longtask 歸零 → 鎖定肇事模組；再擋掉插件 scroll handler、自己逐項重現它的操作（改 transform／改 visibility／querySelectorAll）看哪一項觸發。
- `navigate` 的 `initScript` 可 hook `MutationObserver.prototype.observe`，揭露宿主到底 observe 哪個節點、哪些 options。
