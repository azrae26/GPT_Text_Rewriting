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
- **overlay 容器務必加 `contain: strict`**：否則宿主每幀 measure 整頁時要連 overlay 內部一起算（改 transform 雖不觸發 observer，仍使 overlay 的 layout dirty）。`contain:strict` 把 overlay 隔離成 layout 孤島，宿主直接跳過——這是滾動跟隨成本能壓到趨近零的關鍵之一。三模組各自 `ScrollHelper.bindScrollEvent`（內建 rAF 節流）即可，不需共用分發器。

**診斷陷阱（避免再繞遠路）**：
- **用 PerformanceObserver `longtask` 量，別用 rAF 間隔**：視窗被別的視窗遮擋（occluded）時 Chrome 把該分頁 rAF 節流到 ~1fps，造成「idle 也 1000ms/幀」的假象，會把你導向錯誤方向；longtask 反映真實主執行緒阻塞、不受節流影響。`document.visibilityState` 仍是 `visible` 也可能 occluded。
- longtask 即使分頁在背景也準 → **可程式自驅動**（迴圈 `ta.scrollTop=…` ＋ longtask observer），不必每次叫使用者真人滾。
- **二分定位**：逐一 detach 各模組 overlay 容器，看哪個讓 longtask 歸零 → 鎖定肇事模組；再擋掉插件 scroll handler、自己逐項重現它的操作（改 transform／改 visibility／querySelectorAll）看哪一項觸發。
- `navigate` 的 `initScript` 可 hook `MutationObserver.prototype.observe`，揭露宿主到底 observe 哪個節點、哪些 options。

## 7. 打字卡頓 ≠ 越點越慢、≠ 滾動超卡

**意圖**：打字時高亮／替換預覽／diff 泡泡／股票四個 overlay 模組各自綁 input → 每字重算位置＋重建 DOM。重建改 overlay inline style，觸發宿主 body observer 重算整頁（同 §6 不變量）→ 每字卡頓。**這不是洩漏**（無累積、worstStall 不隨點擊爬升），是「每字都做太多固定工」；與滾動超卡同根（宿主 observer），但觸發源是**文字變動**非捲動。

**目標＝即時零延遲**（使用者鐵則）：overlay 要與打字同步更新；防抖（停頓才重建）的延遲在使用者眼中**就是 lag、不接受**。故正解是讓「每字的工作夠便宜」（增量），而非延後。

**歸因一律用 performance trace（ForcedReflow insight），別用「卸容器」二分**：trace 不破壞模組、按函式累計歸因、可複現。實測瓶頸是 **highlight.js**（`updateHighlightsVisibility`＋`calculatePosition`＋`getTextAreaStyles`），約 diff 的 **47 倍**；diff 渲染本身便宜（每字 ~3ms）。**陷阱（踩過）**：卸 overlay 容器（`.remove()`）會讓該模組拋錯、整條 input 鏈崩 → longtask 數字是垃圾，曾誤導成「diff 占 86%」。**歷史**：早年「diff 慢」其實是逐泡泡 debug LOG（每字 200+ 次、`pageLogEnabled` 下各 JSON 整個 300 筆陣列），非渲染，移除後瓶頸換 highlight。

**不變量**：每模組兩條獨立路徑——捲動跟隨只改 transform（廉價，§6）；打字才全量重算位置＋重建 DOM（昂貴）。優化打字勿動捲動。highlight 的 `updateVirtualView` 用「值 key（含 top/left）」reconcile：位置沒變的高亮 key 不變→自動復用，故**不需每字 `clearHighlights()` 全清**（全清逼它全 churn ＝ 主成本）。

**鐵則（增量，已驗證 ~50→4-8ms/字 行末）**：
1. **快取靜態樣式**：`getTextAreaStyles`（`getComputedStyle`）每字被呼叫但字型/行高/padding 不變 → 快取，只在 resize/字體載入失效。
2. **別每字全清重建**：移除 text 變時的 `clearHighlights()`，讓值-key reconcile 復用未變者、自動移除消失者（實測 `updateHighlightsVisibility` 784→67ms，12x）。
3. **前文不算**：算新舊文字 `commonPrefixLen`，完全落在共同前綴內的 match（前文 byte 相同→像素位置必不變）→ 復用上次 `calculatePosition` 結果、不重量測（行末打字幾乎全復用）。
4. **後文／畫面外＝視窗化 + idle 補算（僅 highlight 採用）**：編輯點之後的高亮位置位移、必重算。打字時**只算可見視窗內**的高亮（依 `scrollTop/scrollHeight` 估字元範圍 + 一個視窗緩衝），畫面外略過；停手後 `requestIdleCallback`（~500ms）全算補回（off-screen 打字時看不到，捲到前多半已補）。
- 統一走 `SharedTypingScheduler.create`（單一真相）；預設即時 rAF。防抖（`enabled`，預設 false）是備援，勿當正解（延遲＝lag）。
- ⚠ diff 用全域 DMP，group 邊界**全域重新對齊**，「前綴穩定」對 diff 不成立（試過 prefix-reuse 復用 diff 泡泡 → 泡泡數崩壞）；highlight/manual-replace 是獨立 match 才可前綴復用。
- **只 highlight 值得視窗化**：曾把 diff/manual-replace 也視窗化、stock 改 debounce，實測**無可量增益**（按住停在下述宿主地板，37↔38ms 雜訊內）→ 全回退，徒增複雜度。highlight 視窗化已把按住從 61→~38ms（到地板），其餘模組省再多也被地板蓋掉。

**⚠ 宿主放大地板（最重要、消不掉）**：viewport 把每字算的元素砍到 ~可見，但實測按住仍有**每字固定地板，且不隨元素數降**。因為插件每字只要**碰一次 DOM**（改任一 overlay、或寫測量用鏡像 div——皆在 uanalyze 監看的 body 內）就觸發宿主 `MutationObserver` → 宿主重算它自己的 MUI 版面。與改 10 個或 134 個無關。`contain:strict` 擋不住（只讓宿主跳過量 overlay 內部，不阻止 observer 觸發、不阻止宿主重排自身）。**鐵證**：關整個插件按住超順（零 DOM 碰觸）；viewport 砍元素數但地板不動。**結論**：要「畫面內每字即時」就有此地板（除非 uanalyze 自己改）；要更順只能按住時不每字碰 DOM（防抖/節流，但畫面內會延後）——使用者選即時、接受此地板。

**診斷**：非破壞性——快照 textarea 值 → 程式驅動連打（中間插入＝最壞、逼後半位移；行末＝最佳、前綴全復用）→ 還原並驗證值一致。**比對位置正確性前先 `scrollTop=0`**（transform=top−scrollTop，捲動位置不同會誤判）。
**陷阱（occlusion，踩過）**：chrome-devtools 跑合成測試時 Chrome 視窗常在背景 → rAF 被節流到 ~1fps、setTimeout 被 clamp → viewport/idle 時序全亂、量到的 overlay 數是更新前舊值（會誤判視窗化沒生效）。**viewport/idle 行為與每字成本只能靠使用者前景真實按住驗證**；longtask 累計值仍可信，個別時點 DOM 數不可信。**performance trace 錄製本身會讓「按住」凍結數秒**（profiler 開銷）→ 按住卡頓不可用 trace 錄，只能用輕量 longtask 探針 + 真人按。同 §1：trace ForcedReflow 把時間算給宿主 InputLabel，那是宿主被插件逼著重排。
