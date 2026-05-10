/**
 * text_complete/auto-complete.js - AI 自動完成功能模組
 * 功能：智能文本續寫和自動完成功能
 * 職責：
 * - 快捷鍵觸發：監聽連續三次 Ctrl 按鍵觸發 AI 自動完成
 * - 智能續寫：基於前文內容生成相關的後續文本
 * - 上下文分析：分析游標位置前的文本內容作為生成依據
 * - 生成狀態管理：防止重複觸發和處理生成過程中的狀態
 * - 錯誤處理：處理生成失敗和網路錯誤的情況
 * - 通知整合：與通知系統整合顯示處理狀態
 * 
 * 依賴：
 * - GlobalSettings：載入 AI 模型和 API 設定
 * - window.Notification：顯示處理狀態通知
 * - TextProcessor：處理 AI 文本生成請求
 */

LogUtils.log('腳本載入');

window.AutoComplete = {
  // 計數器和時間戳
  ctrlCount: 0,
  lastCtrlTime: 0,
  isProcessing: false,
  isInitialized: false,
  autoCompleteTimer: null,
  isAIGenerating: false,  // 新增：標記是否正在 AI 生成內容
  cachedSettings: null,   // 快取設定，避免每次觸發都重新載入

  // 初始化
  async initialize() {
    if (this.isInitialized) {
      LogUtils.log('已經初始化過，跳過');
      return;
    }

    LogUtils.log('開始初始化...');

    // 檢查是否在正確的頁面上
    const textArea = document.querySelector('textarea[name="content"]');
    if (!textArea) {
      LogUtils.log('未找到目標文本區域，可能不在正確的頁面上');
      return;
    }

    try {
      // 初始化時載入一次設定並快取
      await this._loadAndCacheSettings();

      // 監聽 storage 變更，保持快取同步
      chrome.storage.onChanged.addListener((changes, area) => {
        if (area === 'sync' || area === 'local') {
          this._loadAndCacheSettings();
        }
      });

      this.setupEventListeners();
      this.setupAutoComplete(textArea);
      this.isInitialized = true;
      LogUtils.log('初始化完成');
    } catch (error) {
      LogUtils.error('初始化失敗:', error);
    }
  },

  // 載入並快取設定
  async _loadAndCacheSettings() {
    try {
      this.cachedSettings = await window.GlobalSettings.loadSettings();
      LogUtils.log('設定快取已更新');
    } catch (error) {
      LogUtils.warn('快取設定更新失敗，保留舊快取:', error.message);
    }
  },

  // 設置自動完成監聽
  setupAutoComplete(textArea) {
    LogUtils.log('設置自動完成監聽');
    
    let previousLength = textArea.value.length;
    let previousText = textArea.value;
    
    textArea.addEventListener('input', (event) => {
      // 如果是 AI 生成的內容，不觸發自動完成
      if (this.isAIGenerating) {
        previousLength = textArea.value.length;
        previousText = textArea.value;
        return;
      }

      // 檢查是否是刪除操作
      const currentLength = textArea.value.length;
      if (currentLength < previousLength) {
        previousLength = currentLength;
        previousText = textArea.value;
        return;
      }

      // 檢查是否只是添加了空格或換行
      const currentText = textArea.value;
      const newContent = currentText.slice(previousText.length);
      if (newContent.trim() === '') {
        previousLength = currentLength;
        previousText = currentText;
        return;
      }
      
      previousLength = currentLength;
      previousText = currentText;
      
      // 暫時關閉自動啟動功能
      /*
      // 清除現有的計時器
      if (this.autoCompleteTimer) {
        clearTimeout(this.autoCompleteTimer);
      }
      
      // 獲取游標位置之前的文本
      const cursorPosition = textArea.selectionStart;
      const textBeforeCursor = textArea.value.substring(0, cursorPosition);
      
      // 如果前文少於5個字，不啟動自動完成
      if (textBeforeCursor.trim().length < 5) {
        return;
      }
      
      // 設置新的計時器
      this.autoCompleteTimer = setTimeout(() => {
        if (!this.isProcessing) {
          this.triggerAutoComplete();
        }
      }, 4000); // 延長到4秒
      */
    });
  },

  // 設置事件監聽器
  setupEventListeners() {
    LogUtils.log('開始設置事件監聽器');
    
    // 移除可能存在的舊監聽器
    document.removeEventListener('keydown', this._boundHandleKeyDown);
    document.removeEventListener('keyup', this._boundHandleKeyUp);
    
    // 創建綁定的事件處理器
    this._boundHandleKeyDown = this.handleKeyDown.bind(this);
    this._boundHandleKeyUp = this.handleKeyUp.bind(this);
    
    // 添加新的監聽器
    document.addEventListener('keydown', this._boundHandleKeyDown);
    document.addEventListener('keyup', this._boundHandleKeyUp);
  },

  // 處理按鍵按下事件
  handleKeyDown(event) {
    if (event.key === 'Control' && !event.repeat) {  // 添加 !event.repeat 來排除按住的情況
      const currentTime = Date.now();
      
      // 檢查是否在 500ms 內的連續按鍵
      if (currentTime - this.lastCtrlTime < 500) {
        this.ctrlCount++;
        LogUtils.log('Ctrl 點擊次數:', this.ctrlCount); // 添加日誌
        
        // 如果是第三次按下，觸發自動完成
        if (this.ctrlCount === 3) {
          // 清除可能存在的自動完成計時器
          if (this.autoCompleteTimer) {
            clearTimeout(this.autoCompleteTimer);
          }
          LogUtils.log('檢測到連續三次 Ctrl，觸發自動完成');
          this.triggerAutoComplete();
        }
      } else {
        // 重置計數器
        this.ctrlCount = 1;
      }
      
      this.lastCtrlTime = currentTime;
    }
  },

  // 處理按鍵釋放事件
  handleKeyUp(event) {
    if (event.key === 'Control') {
      // 如果超過 1 秒沒有新的按鍵，重置計數器
      setTimeout(() => {
        const currentTime = Date.now();
        if (currentTime - this.lastCtrlTime >= 1000) {
          this.ctrlCount = 0;
        }
      }, 1000);
    }
  },

  // 觸發自動完成功能
  async triggerAutoComplete() {
    if (this.isProcessing) {
      LogUtils.log('正在處理中，請稍候...');
      return;
    }

    const textArea = document.querySelector('textarea[name="content"]');
    if (!textArea) {
      LogUtils.log('錯誤：找不到文本輸入區域');
      return;
    }

    try {
      this.isProcessing = true;
      this.isAIGenerating = true;  // 標記開始生成 AI 內容
      LogUtils.log('開始處理自動完成請求');
      
      // 獲取當前游標位置之前的文本
      const cursorPosition = textArea.selectionStart;
      const textBeforeCursor = textArea.value.substring(0, cursorPosition);
      
      // 如果前文為空，不進行處理
      if (!textBeforeCursor.trim()) {
        LogUtils.log('錯誤：沒有檢測到前文內容');
        return;
      }

      LogUtils.log('前文長度:', textBeforeCursor.length);
      LogUtils.log('游標位置:', cursorPosition);

      // 顯示處理中通知
      await window.Notification.showNotification('正在生成自動完成內容...', true);

      // 使用快取設定，避免 extension context 失效時崩潰
      const settings = this.cachedSettings;
      if (!settings) {
        LogUtils.warn('設定尚未載入，請稍後再試');
        return;
      }

      const model = settings.autoCompleteModel || settings.autoRewriteModel;
      if (!model) {
        LogUtils.warn('未設置續寫模型');
        return;
      }
      
      const isGemini = model.startsWith('gemini');
      
      // 使用動態 API 金鑰獲取
      const apiType = window.GlobalSettings.getModelApiType(model);
      const apiKeyName = window.GlobalSettings.getApiKeyNameForModel(model);
      const apiKey = settings.apiKeys[apiKeyName];
      
      if (!apiKey) {
        LogUtils.warn(`未設置 ${apiType.toUpperCase()} API 金鑰`);
        return;
      }

      LogUtils.log('使用模型:', model);

      // 準備上下文信息
      const context = [
        {
          role: "system",
          content: `請記住以下背景知識：

一個ASIC的代理商
ASIC需求的受益者

法人認為金像電(2368：GCE)是ASIC伺服器專案的主要PCB供應商，而ASIC伺服器PCB的更高美元含量和2025年更強勁的需求，將為其在25Q1帶來更多的營收上行空間（法人預計季增+10%，而市場共識為季增+1%）。金像電(2368：GCE)的目標是成為從UBB到OAM PCB的一站式商店，並在泰國擁有更多產能來支持強勁的客戶需求。

ASIC將推動2025年進一步上行
法人認為金像電(2368：GCE)已獲得另一家雲端ASIC伺服器的UBB（通用基板）供應商資格，並將從25Q1開始增加出貨量。由於ASIC伺服器的電路板尺寸大於常規伺服器，且層數為20層以上，並採用高端CCL（M8等級），法人認為來自ASIC需求的定價和盈餘將使該公司在25Q1的表現超出季節性水準。由於更高的產能利用率以支持強勁的ASIC需求，法人預計25Q1的營收將季增+10%（而市場共識為季增+1%）。

從常規伺服器PCB製造商轉變為AI伺服器PCB製造商
法人認為產能限制一直是投資者關注的主要問題，但鑑於來自具有更高生產優先級的ASIC伺服器的貢獻不斷增加，法人看到由於AI/ASIC伺服器PCB的供應增加，其台灣和蘇州工廠的產能價值都有更多上行空間。

ASIC PCB的一站式商店和更多產能以滿足強勁的AI需求
金像電(2368：GCE)計畫在台灣增加10%的產能，以生產用於GPU/AI加速器OAM（開放加速器模組）PCB的HDI。該產業一直面臨AI伺服器OAM PCB的產能短缺，法人認為金像電(2368：GCE)的舉動可以為終端客戶提供UBB和OAM的完整PCB服務。由於產能將從25Q2開始增加並在2025年量產，法人預計將看到更多可用產能來支持金像電(2368：GCE)的訂單。

盈餘修正與估值
由於客戶在2024年年底的庫存盤點，法人將24CT的每股盈餘下調3%，但由於ASIC伺服器PCB的斬獲，將25/26CT的每股盈餘上調7%/7%，以反映更強勁的需求。ASIC伺服器的前景更好。

投資論點
法人預期金像電2368將受益於人工智慧伺服器出貨量的增加，以及CPU伺服器持續的規格升級，這些都需要更高的PCB層數。網路升級至800G也將帶動該公司利潤率的提升。
催化劑
1) 美國雲端服務供應商和企業客戶推動的伺服器出貨量加速；2) 伺服器內容價值的增長；3) 強於預期的網路需求復甦；4) 筆記型電腦需求復甦。

鑑於金像電2368在雲端伺服器和交換器方面有高於同業的營收占比，其領先的市場地位，以及法人對人工智慧伺服器出貨量強勁的預期，以及運算伺服器需求將逐步恢復。

由於金像電2368的營收也有相當一部分來自伺服器和人工智慧，它很可能在中長期內享有強勁的增長（來自伺服器和交換器更好的內容增長）和更好的回報（更少的競爭），勝過組裝廠。

受惠於更強勁的ASIC需求：我們認為金像電(GCE)是所有四大超大型數據中心業者ASIC專案中OAM和UBB的主要PCB供應商。我們預期金像電將持續受惠於ASIC AI需求的增長。ASIC專案的出貨量在2025年開始顯著增加；我們估計其目前整體營收占比為10-15%。ASIC UBB層數將從2024年的20-30層增加到2025年的30層以上，這將持續推動金像電的平均銷售價格(ASP)和利潤率擴張。而2025年即將投產的更多產能擴張，將有助於金像電提高營收，因為其所有與AI相關的PCB生產都在台灣和蘇州進行，目前產能已接近滿載。我們估計金像電在2025年所有三大終端市場（伺服器、網路和筆記型電腦）都將成長，並預測網路設備市場將因升級至800G而呈現最高增長。
 
台灣和泰國產能提升將進一步推動增長：金像電將於2025年第一季在台灣投產部分新產能，這將有助於支撐2025年第一季營收略微季增，但需注意因應2025年農曆新年(CNY)而產生的任何超時加班費用。我們認為台灣廠區可能再增加10%的產能（即每月約貢獻新台幣1億至1.5億元）。泰國廠區於2025年7月投產後，每月可能再貢獻約新台幣3億元。這新台幣3億元僅為第一階段產能的一半；最終將分為三個階段，規模大致相同。因此，當泰國所有產能完全投產後，每月新增貢獻總計至少可達約新台幣18億元。
 
 2024年11月營收為月增4%、年增5%，低於我們的預估值4%，但我們仍維持2024年第四季營收預估值約季減7%，並認為在2024年10月和2024年11月相對較慢的拉貨之後，憑藉更強勁的季度末拉貨，仍有可能達成。我們預測2024年第四季毛利率將達到31.7%（季減60個基點），反映營收規模下降。
 
 ：我們預計未來幾年400G/800G網路PCB需求將增長，這將成為毛利率的利多。
 
 ：一個新的400G客戶將在2024年第四季開始貢獻營收，並在未來持續成長。
 
 ：伺服器PCB CCL規格正在提升，英特爾（Eagle Stream）和AMD（Genoa）的PCB層數也在增加。
 
我們微調了我們的模型，使我們2024年每股盈餘預估值幾乎沒有變化，但由於我們考慮到產品組合改善帶來的更高利潤率假設，因此將2025年和2026年每股盈餘預估值分別上調1%。
 
我們的關鍵假設保持不變，包括 9.3% 的股權成本（貝他係數為 1.0，股權風險溢酬為 8.7%，無風險利率為 1.0%）、12% 的中期成長率和 3% 的終期成長率。
 
我們認為這是合理的，因為金像電正在展現由有利的產品組合轉向更多 AI 伺服器 PCB 以及高速網路 PCB (400G/800G) 所帶動的利潤率擴張。我們認為較高的本益比是合理的，因為這些 AI 伺服器和高速網路 PCB 更難生產，進入障礙更高，這可能意味著更高的單價 (ASP) 和更高的利潤率。

2024年第三季毛利率受產品組合轉佳影響，略優於市場預期2.7%：2024年第三季營收QoQ +9.2%，YoY +26.8%，符合市場預期，成長主要由伺服器、網通產品帶動；毛利率32.3%，略優於市場預期31.4%，較2024年第二季31.63%改善主因為產品組合改善。在十一長假影響下，預計2024年第四季營收QoQ -4.6%，YoY +16.8%。
 
AI需求旺，將加快2025年800G交換器滲透率拉升速度：在AI伺服器需求熱絡下，交換器迭代速度加快。根據Dell'Oro研調資料，2024年資料中心800G交換器滲透率由低個位數，提升至2025年10-15%以上。金像電800G交換器自2024年第三季小量產，隨美系客戶訂單陸續加入生產，高階板材需求熱絡，為2025年成長動能之一。
 
2025年AI ASIC需求佳，且伺服器板材規格持續升級：除了一般伺服器平台轉換帶來的規格升級趨勢外，AI伺服器板層數也將由2024年20層以上，2025年往30層以上靠近，規格提升下亦增加生產難度，市場對高階多層板、HDI產能需求迫切。展望2025年，儘管美系GPU大廠產品仍在認證中，但隨AI ASIC晶片tape out，我們預估金像電持續受惠於2025年AI ASIC供應拉貨影響，伺服器需求保持樂觀。
 
泰國產能將在2025年第三季開出，產能不足問題獲舒緩：高階板材價格高但消耗產能多，金像電在高階製程產能持續滿載，台灣廠和蘇州廠於2024年已擴產，而布局東南亞的泰國廠將在2025年第三季初步開出產能，雖初期以中階產品為主，仍能透過產能調度有效紓解產能不足問題。
 
 AI Server營收占比高，製程能力優勢佳：800G與AI ASIC出貨需求旺盛，海外產能規劃亦確保公司獲利穩定增長。

 2024年第三季毛利率續創新高如預期，營業利益符合預期。即使 NB 出貨本季轉弱，但2024年第三季營收季增 9%、年增 27%，符合預期；在利用率提高下，使毛利率季增 0.7ppt 達 32.3%優預期；伺服器、網通營收分別季增11%、9%達佔比 69%、14%， AI 伺服器占比略增至 25%，使獲利略低預期。
 
 2024年第四季筆電淡季效應及網通調整營收將下滑，2025年第一季 有機會持平至微增。受到颱風、中國長假效應、盤點等影響，2024年第四季 營收恐將季減 5-10%，然而在800G 新增客戶下，以及 AI 伺服器需求持續強勁下，2025年第一季 將不看淡。
 
 800G 交換機市占領先為最大受惠者。由於 800G 交換器預期於 2024年 9 月後放量生產，PCB 平均層數高達 38-48 層，基板材料將使用 M8 以上(extreme/super low loss)，我們認為公司可望取得 30%以上市佔率，我們預估公司2025 年 800G 營收佔比可達中高個位數以上。
 
 公司概況：
 金像電子公司成立於 1981 年 9 月，為國內最大網通 PCB 製造廠商。近年來公司策略性調整產品線，往較高毛利的伺服器板和網通板製造為公司核心產品。2022 年公司產品終端應用比重為：伺服器佔 60％、網通佔 20%、筆記型電腦佔 13%、其他佔 7％。金像電公司工廠有中壢廠、蘇州廠、常熟一廠及常熟二廠。

 2024年第四季營收應該會季增 0% 到 5%：
管理階層現在預估2024年第四季營收將會季持平到季增個位數中段（與法人在台灣 AI 論壇上之前預估的季增個位數一致，只是範圍更明確）。毛利率目標與2024年第三季持平，為 29% 到 32%。但隨著營收規模的擴大，法人認為毛利率應該會略微擴大，達到 32%（季增 40 個基點），特別是法人將看到更多 400G/800G 網路 PCB 的生產，而 AI 相關營收在2024年第四季也應該會持續成長。法人認為 AI 營收在2024年第四季可能會超過公司總營收的 25%。台灣和蘇州的工廠利用率依然飽和，兩者都能每月生產約 13 億元的 PCB。常熟 1 和 2 的利用率在2024年下半年保持在約 90%。

Nvidia 認證仍在進行中：自法人一個月前的台灣 AI 論壇以來，進展有限；目前金像電仍在努力爭取 Nvidia 的 OAM/UBB 認證。

台灣和蘇州的產能增加將有助於金像電在2024年第四季的營收進一步成長，但筆記型電腦PCB在終端需求仍然疲軟的情況下，可能季持平或季減。法人略微下調了利潤率預期，以反映更多正在進行的新專案和不利的外匯影響。

2024年第三季 產品組合：伺服器 69%、網路 14%、NB 8%、其他 9%。

由於伺服器和 NB 需求疲軟，2024年第四季 營收預估下修：
金像電報告 2024年10月 營收（月減 8%，年增 4%），比法人的預估低 12%，法人認為這主要是由於 2024年10月 受到颱風假影響，客戶訂單延後所致。然而，傳統伺服器和 NB 電路板的需求預測也正在下修，因為伺服器電路板庫存累積，而 NB 終端需求仍然疲軟。不過，AI 伺服器和網路電路板的需求在 2024年第四季 將持續維持穩定（季持平）。因此，金像電將 2024年第四季 營收預估下修至季減 5-10%，此前預估為季增 0-5%。毛利率預估略微下修至 28-32%（先前為 29-32%），預估區間下限下調 1 個百分點，主要反映營收下修。法人現在預測 2024年第四季 營收（季減 7%，年增 14%），毛利率為 31.7%（季減 60 個基點）。


然而，2024年第一季 應該會優於季節性：
一些客戶似乎想在 2024年第四季 放緩其 PCB 拉貨，但金像電看到 2024年第一季 的需求回升，包括 AI 電腦的 NB PCB，因此公司認為 2024年第一季 的需求可能會優於季節性（季增 0-5%），受 AI 伺服器、網路和 NB PCB 的成長推動。但是，為了在農曆新年假期中提高 2024年第一季 的營收，金像電將不得不認列加班費用，這將對利潤率造成一些影響，因此 2024年第一季 的利潤率預期為 28-31%。

鑑於金像電 AI/高速網路 PCB 的比例越來越高。`
        }
      ];

      // 準備 API 請求
      const defaultInstruction =
`上下文為背景知識。
我正在寫一篇分析文，但我缺乏靈感，請根據前文內容及敍事邏輯，以相同的語氣和風格，自然地接續最後一個字撰寫下去。
續寫長度請在100字左右。
確保續寫的內容符合背景知識及邏輯。
續寫的內容不需有結語，只需自然地接著寫下去。
續寫時不要加入任何解釋或說明。
續寫時不必包含前文內容，只需接著最後一個字寫。`;
      const instruction = settings.autoCompleteInstruction || defaultInstruction;
      LogUtils.log('準備發送 API 請求');
      const { endpoint, body } = window.TextProcessor._prepareApiConfig(
        model,
        textBeforeCursor,
        instruction,
        context  // 添加上下文
      );

      // 發送請求
      LogUtils.log('發送 API 請求');
      const completedText = await window.TextProcessor._sendRequest(endpoint, body, apiKey, isGemini);
      LogUtils.log('收到 API 回應，生成文本長度:', completedText.length);
      
      // 插入生成的文本
      const textAfterCursor = textArea.value.substring(cursorPosition);
      textArea.value = textBeforeCursor + completedText + textAfterCursor;
      
      // 更新游標位置
      const newCursorPosition = textBeforeCursor.length + completedText.length;
      textArea.setSelectionRange(newCursorPosition, newCursorPosition);
      LogUtils.log('更新游標位置:', newCursorPosition);
      
      // 觸發 input 事件以更新 UI
      const event = new Event('input', { bubbles: true });
      event.isAIGenerated = true;  // 標記這是 AI 生成的事件
      textArea.dispatchEvent(event);
      LogUtils.log('觸發 input 事件');

      // 顯示完成通知
      await window.Notification.showNotification('自動完成內容已生成', false);
      LogUtils.log('自動完成處理完成');

    } catch (error) {
      LogUtils.error('自動完成處理失敗:', error);
      await window.Notification.showNotification(`自動完成失敗: ${error.message}`, false);
    } finally {
      this.isProcessing = false;
      this.ctrlCount = 0;
      this.isAIGenerating = false;  // 標記結束生成 AI 內容
      LogUtils.log('重置處理狀態');
    }
  }
};

// 確保在頁面載入時初始化
if (document.readyState === 'loading') {
  LogUtils.log('等待 DOMContentLoaded 事件...');
  document.addEventListener('DOMContentLoaded', () => {
    LogUtils.log('DOMContentLoaded 事件觸發');
    window.AutoComplete.initialize();
  });
} else {
  LogUtils.log('文檔已經載入，直接初始化');
  window.AutoComplete.initialize();
}

// 為了確保在動態加載的情況下也能正常工作
// 在 window 載入完成後也嘗試初始化一次
window.addEventListener('load', () => {
  LogUtils.log('Window load 事件觸發');
  window.AutoComplete.initialize();
}); 





