/**
 * 關鍵要點總結管理器
 * 負責管理關鍵要點總結功能的UI和邏輯
 * 功能包括:
 * 1. 可拖動的浮動視窗
 * 2. 自動監聽股票變化並更新總結
 * 3. 展開/收合功能
 * 4. 記住上次位置
 */
const KeyPointsSummaryManager = {
  /** UI 相關狀態 */
  UI: {
    isExpanded: false,     // 面板是否展開
    container: null,       // 主容器元素
    button: null,         // 圓形按鈕元素
    panel: null,          // 面板元素
    dragTarget: null,     // 當前拖動的目標元素
    lastPosition: null,   // 上次的位置
    offsetX: 0,           // 拖動時的X軸偏移
    offsetY: 0,           // 拖動時的Y軸偏移
    lastContent: null,    // 添加內容緩存
    isDragging: false,     // 新增：是否正在拖動的標記
    isInTargetPage: false,  // 添加頁面狀態追蹤
    isInitialized: false,  // 添加初始化標記
    observer: null,         // 添加 MutationObserver
  },

  /** 初始化管理器 */
  initialize() {
    // 檢查是否已經初始化
    if (window.KeyPointsSummaryManager?.UI?.isInitialized) {
      console.log('關鍵要點總結管理器已經初始化，跳過');
      return;
    }
    
    console.log('開始初始化關鍵要點總結管理器...');
    
    // 先清除所有可能存在的實例
    const existingContainers = document.querySelectorAll('.key-points-container');
    existingContainers.forEach(container => container.remove());
    
    // 從 localStorage 讀取上次位置和展開狀態
    this.UI.lastPosition = JSON.parse(localStorage.getItem('summaryPosition')) || { x: 20, y: 20 };
    this.UI.isExpanded = JSON.parse(localStorage.getItem('summaryExpanded')) || false;
    console.log('載入上次位置:', this.UI.lastPosition);
    console.log('載入上次展開狀態:', this.UI.isExpanded);

    // 初始化 UI
    this.UIManager.createElements();
    this.UIManager.setupDragAndDrop();
    this.UIManager.loadLastPosition();
    
    // 檢查是否已經載入 auto-click.js
    if (!window.AutoClickManager) {
      // 動態載入 auto-click.js
      const script = document.createElement('script');
      script.src = chrome.runtime.getURL('ua_assistant/auto-click.js');
      script.onload = () => {
        console.log('auto-click.js 載入完成');
        // 初始化 AutoClickManager
        window.AutoClickManager.initialize();
      };
      (document.head || document.documentElement).appendChild(script);
    }
    
    // 設置事件監聽器
    if (window.AutoClickManager) {
      window.AutoClickManager.onStockChange = this.EventManager.handleStockChange.bind(this.EventManager);
    } else {
      console.warn('AutoClickManager 未找到，部分功能可能無法使用');
    }
    this.EventManager.setupEventListeners();
    
    // 如果上次是展開狀態，則展開面板
    if (this.UI.isExpanded) {
      this.UI.panel.classList.add('expanded');
      if (this.UI.lastContent) {
        this.UIManager.updateContent(this.UI.lastContent);
      }
    }

    // 設置初始化標記
    this.UI.isInitialized = true;
    
    // 確保全局只有一個實例
    if (window.KeyPointsSummaryManager && window.KeyPointsSummaryManager !== this) {
      console.log('檢測到其他實例，進行替換');
      const oldManager = window.KeyPointsSummaryManager;
      if (oldManager.cleanup) {
        oldManager.cleanup();
      }
    }
    window.KeyPointsSummaryManager = this;
    
    // 設置 MutationObserver 來監聽 DOM 變化
    this.setupPageObserver();
    
    // 初始檢查頁面狀態
    this.checkPageState();
  },

  /** 設置頁面觀察器 */
  setupPageObserver() {
    // 如果已經有觀察器，先斷開連接
    if (this.UI.observer) {
      this.UI.observer.disconnect();
    }

    // 創建新的觀察器
    this.UI.observer = new MutationObserver(() => {
      this.checkPageState();
    });

    // 開始觀察整個文檔的變化
    this.UI.observer.observe(document.body, {
      childList: true,
      subtree: true
    });
  },

  /** 檢查頁面狀態 */
  checkPageState() {
    // 尋找小助理標籤
    const assistantTab = Array.from(document.querySelectorAll('.ua-tab-item')).find(tab => {
      const titleDiv = tab.querySelector('.ua-tab-title');
      return titleDiv && titleDiv.textContent.includes('小助理');
    });

    // 檢查是否在目標頁面
    const isInTargetPage = assistantTab && assistantTab.classList.contains('active');
    
    // 如果狀態發生變化
    if (this.UI.isInTargetPage !== isInTargetPage) {
      this.UI.isInTargetPage = isInTargetPage;
      console.log('頁面狀態變更:', isInTargetPage ? '進入目標頁面' : '離開目標頁面');
      
      if (isInTargetPage) {
        // 顯示要點框
        if (this.UI.container) {
          this.UI.container.style.display = 'block';
        } else {
          this.UIManager.createElements();
        }
      } else {
        // 隱藏要點框
        if (this.UI.container) {
          this.UI.container.style.display = 'none';
        }
      }
    }
  },

  /** 清理函數 */
  cleanup() {
    console.log('執行清理...');
    // 移除所有相關的 DOM 元素
    const containers = document.querySelectorAll('.key-points-container');
    containers.forEach(container => {
      if (container.parentNode) {
        container.parentNode.removeChild(container);
      }
    });
    
    // 重置 UI 狀態
    this.UI.container = null;
    this.UI.button = null;
    this.UI.panel = null;
    this.UI.dragTarget = null;
    
    console.log('清理完成');
    
    // 斷開觀察器
    if (this.UI.observer) {
      this.UI.observer.disconnect();
      this.UI.observer = null;
    }
  },

  /** UI 管理模塊 */
  UIManager: {
    /** 創建所需的 UI 元素 */
    createElements() {
      console.log('開始創建 UI 元素...');
      this.createContainer();
      this.createButton();
      this.createPanel();
      this.addStyles();
      document.body.appendChild(KeyPointsSummaryManager.UI.container);
      console.log('UI 元素創建完成');
    },

    /** 創建主容器 */
    createContainer() {
      KeyPointsSummaryManager.UI.container = document.createElement('div');
      KeyPointsSummaryManager.UI.container.className = 'key-points-container';
      console.log('創建主容器完成');
    },

    /** 創建圓形按鈕 */
    createButton() {
      const button = document.createElement('div');
      button.className = 'key-points-button';
      button.innerHTML = '<i class="fas fa-lightbulb"></i>';
      KeyPointsSummaryManager.UI.button = button;
      KeyPointsSummaryManager.UI.container.appendChild(button);
      console.log('創建圓形按鈕完成');
    },

    /** 創建面板 */
    createPanel() {
      const panel = document.createElement('div');
      panel.className = 'key-points-panel';
      panel.innerHTML = `
        <div class="key-points-header">
          <span>關鍵要點總結</span>
        </div>
        <div class="key-points-content"></div>
      `;
      KeyPointsSummaryManager.UI.panel = panel;
      KeyPointsSummaryManager.UI.container.appendChild(panel);
      console.log('創建面板完成');
    },

    /** 添加樣式 */
    addStyles() {
      const styles = this.getStyles();
      const styleSheet = document.createElement('style');
      styleSheet.textContent = styles;
      document.head.appendChild(styleSheet);
    },

    /** 獲取樣式定義 */
    getStyles() {
      return `
        .key-points-container {
          position: fixed;
          z-index: 10000;
          width: 300px;
          user-select: none;  /* 容器不可選取 */
        }
        
        .key-points-button {
          width: 35px;
          height: 35px;
          border-radius: 50%;
          background: #4a90e2;
          color: white;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: grab;
          box-shadow: 0 2px 5px rgba(0,0,0,0.2);
          font-size: 14px;
          position: absolute;
          right: 0;
          top: 0;
          z-index: 1;
          user-select: none;  /* 按鈕不可選取 */
        }
        
        .key-points-panel {
          display: none;
          width: 100%;
          background: white;
          border-radius: 8px;
          box-shadow: 0 2px 10px rgba(0,0,0,0.1);
          margin-top: 45px;
          position: relative;
        }
        
        .key-points-panel.expanded {
          display: block;
        }
        
        .key-points-header {
          padding: 10px 15px; /* 關鍵要點標題上下左右內距 */
          background: #4a90e2;
          color: white;
          border-radius: 8px 8px 0 0;
          display: flex;
          justify-content: space-between;
          align-items: center;
          user-select: none;  /* 標題不可選取 */
        }
        
        .key-points-content {
          padding: 15px;
          max-height: 400px;
          overflow-y: auto;
          color: #333;
          line-height: 1.4;     /* 同一段落內的行距 */
          white-space: pre-line;
          font-size: 14px;
          user-select: text;
          cursor: text;
        }

        /* 新增：處理段落之間的間距 */
        .key-points-content > p {
          margin-bottom: 0.6em;   /* 段落之間的間距 */
        }
      `;
    },

    /** 設置拖放功能 */
    setupDragAndDrop() {
      KeyPointsSummaryManager.UI.button.addEventListener('mousedown', KeyPointsSummaryManager.EventManager.handleDragStart);
      KeyPointsSummaryManager.UI.panel.querySelector('.key-points-header').addEventListener('mousedown', KeyPointsSummaryManager.EventManager.handleDragStart);
      document.addEventListener('mousemove', KeyPointsSummaryManager.EventManager.handleDrag);
      document.addEventListener('mouseup', KeyPointsSummaryManager.EventManager.handleDragEnd);
    },

    /** 載入上次位置 */
    loadLastPosition() {
      const { x, y } = KeyPointsSummaryManager.UI.lastPosition;
      const container = KeyPointsSummaryManager.UI.container;
      container.style.left = `${x}px`;
      container.style.top = `${y}px`;
      
      // 添加座標日誌
      console.log('載入位置 - 容器座標:', {
        left: container.style.left,
        top: container.style.top,
        offsetWidth: container.offsetWidth,
        offsetHeight: container.offsetHeight
      });
      
      const button = KeyPointsSummaryManager.UI.button;
      console.log('載入位置 - 按鈕座標:', {
        offsetLeft: button.offsetLeft,
        offsetTop: button.offsetTop,
        offsetWidth: button.offsetWidth,
        offsetHeight: button.offsetHeight,
        getBoundingClientRect: button.getBoundingClientRect()
      });
    },

    /** 更新總結內容 */
    updateContent(summary) {
      console.log('更新總結內容...');
      const contentDiv = KeyPointsSummaryManager.UI.panel.querySelector('.key-points-content');
      
      // 將每行文字包裝在 <p> 標籤中
      const formattedContent = summary
        .split('\n')
        .filter(line => line.trim())  // 過濾空行
        .map(line => `<p>${line.trim()}</p>`)
        .join('');
        
      contentDiv.innerHTML = formattedContent;
      KeyPointsSummaryManager.UI.lastContent = summary;  // 保存到緩存
      console.log('總結內容更新完成');
    }
  },

  /** 事件管理模塊 */
  EventManager: {
    /** 設置事件監聽器 */
    setupEventListeners() {
      console.log('設置事件監聽器...');
      
      // 記錄滑鼠按下的初始位置
      let mouseDownX = 0;
      let mouseDownY = 0;
      
      // 修改按鈕點擊事件處理
      KeyPointsSummaryManager.UI.button.addEventListener('mousedown', (e) => {
        mouseDownX = e.clientX;
        mouseDownY = e.clientY;
      });
      
      KeyPointsSummaryManager.UI.button.addEventListener('click', (e) => {
        // 計算滑鼠移動距離
        const moveDistance = Math.sqrt(
          Math.pow(e.clientX - mouseDownX, 2) + 
          Math.pow(e.clientY - mouseDownY, 2)
        );
        
        // 如果移動距離小於 5 像素且不在拖動狀態，才觸發展開/收合
        if (moveDistance < 5 && !KeyPointsSummaryManager.UI.isDragging) {
          console.log('按鈕點擊，移動距離:', moveDistance);
          this.handleTogglePanel();
        } else {
          console.log('忽略點擊，移動距離:', moveDistance, '拖動狀態:', KeyPointsSummaryManager.UI.isDragging);
        }
      });
      
      console.log('事件監聽器設置完成');
    },

    /** 處理面板切換 */
    handleTogglePanel() {
      // 先移除所有重複的容器
      const containers = document.querySelectorAll('.key-points-container');
      if (containers.length > 1) {
        containers.forEach((container, index) => {
          if (index > 0) container.remove();
        });
      }

      KeyPointsSummaryManager.UI.isExpanded = !KeyPointsSummaryManager.UI.isExpanded;
      console.log('面板狀態切換:', KeyPointsSummaryManager.UI.isExpanded ? '展開' : '收合');
      
      const container = KeyPointsSummaryManager.UI.container;
      const button = KeyPointsSummaryManager.UI.button;
      
      // 添加切換前座標日誌
      console.log('切換前 - 容器座標:', {
        left: container.style.left,
        top: container.style.top,
        offsetWidth: container.offsetWidth,
        offsetHeight: container.offsetHeight
      });
      
      console.log('切換前 - 按鈕座標:', {
        offsetLeft: button.offsetLeft,
        offsetTop: button.offsetTop,
        getBoundingClientRect: button.getBoundingClientRect()
      });
      
      KeyPointsSummaryManager.UI.panel.classList.toggle('expanded', KeyPointsSummaryManager.UI.isExpanded);
      
      // 添加切換後座標日誌
      console.log('切換後 - 容器座標:', {
        left: container.style.left,
        top: container.style.top,
        offsetWidth: container.offsetWidth,
        offsetHeight: container.offsetHeight
      });
      
      console.log('切換後 - 按鈕座標:', {
        offsetLeft: button.offsetLeft,
        offsetTop: button.offsetTop,
        getBoundingClientRect: button.getBoundingClientRect()
      });
      
      // 保存展開狀態
      localStorage.setItem('summaryExpanded', KeyPointsSummaryManager.UI.isExpanded);
      
      if (KeyPointsSummaryManager.UI.isExpanded) {
        const stockElement = document.querySelector('.stock-number');
        if (stockElement) {
          // 檢查是否已有內容，如果有則不重新獲取
          const contentDiv = KeyPointsSummaryManager.UI.panel.querySelector('.key-points-content');
          if (!contentDiv.textContent.trim()) {
            console.log('檢測到股票代碼，開始獲總結');
            KeyPointsSummaryManager.APIManager.fetchAndUpdateSummary(stockElement.textContent.trim());
          } else {
            console.log('已有總結內容，不重新獲取');
          }
        }
      }
    },

    /** 處理股票變化 */
    handleStockChange(stockCode) {
      console.log('檢測到股票變化:', stockCode);
      if (KeyPointsSummaryManager.UI.isExpanded) {
        console.log('面板處於展開狀態，開始更新總結');
        KeyPointsSummaryManager.APIManager.fetchAndUpdateSummary(stockCode);
      } else {
        console.log('面板處於收合狀態，不更新總結');
      }
    },

    /** 處理拖動開始 */
    handleDragStart(e) {
      // 防止文本選擇
      e.preventDefault();
      
      // 確保只有左鍵點擊才能拖動
      if (e.button !== 0) return;
      
      KeyPointsSummaryManager.UI.dragTarget = KeyPointsSummaryManager.UI.container;
      const rect = KeyPointsSummaryManager.UI.container.getBoundingClientRect();
      KeyPointsSummaryManager.UI.offsetX = e.clientX - rect.left;
      KeyPointsSummaryManager.UI.offsetY = e.clientY - rect.top;
      
      // 設置拖動標記
      KeyPointsSummaryManager.UI.isDragging = true;
      
      // 添加拖動時的樣式
      document.body.style.userSelect = 'none';
      KeyPointsSummaryManager.UI.container.style.cursor = 'grabbing';
    },

    /** 處理拖動中 */
    handleDrag(e) {
      if (!KeyPointsSummaryManager.UI.dragTarget) return;
      e.preventDefault();
      
      const x = e.clientX - KeyPointsSummaryManager.UI.offsetX;
      const y = e.clientY - KeyPointsSummaryManager.UI.offsetY;
      
      // 確保不會拖出視窗
      const maxX = window.innerWidth - KeyPointsSummaryManager.UI.container.offsetWidth;
      const maxY = window.innerHeight - KeyPointsSummaryManager.UI.container.offsetHeight;
      
      const boundedX = Math.max(0, Math.min(x, maxX));
      const boundedY = Math.max(0, Math.min(y, maxY));
      
      const container = KeyPointsSummaryManager.UI.container;
      container.style.left = `${boundedX}px`;
      container.style.top = `${boundedY}px`;
      
      // 添加拖動座標日誌
      console.log('拖動位置 - 容器座標:', {
        left: container.style.left,
        top: container.style.top,
        boundedX,
        boundedY,
        maxX,
        maxY,
        clientX: e.clientX,
        clientY: e.clientY,
        offsetX: KeyPointsSummaryManager.UI.offsetX,
        offsetY: KeyPointsSummaryManager.UI.offsetY
      });
      
      const button = KeyPointsSummaryManager.UI.button;
      console.log('拖動位置 - 按鈕座標:', {
        offsetLeft: button.offsetLeft,
        offsetTop: button.offsetTop,
        getBoundingClientRect: button.getBoundingClientRect()
      });
      
      KeyPointsSummaryManager.UI.lastPosition = { x: boundedX, y: boundedY };
      localStorage.setItem('summaryPosition', JSON.stringify(KeyPointsSummaryManager.UI.lastPosition));
    },

    /** 處理拖動結束 */
    handleDragEnd() {
      if (!KeyPointsSummaryManager.UI.dragTarget) return;
      
      // 移除拖動標記
      KeyPointsSummaryManager.UI.isDragging = false;
      
      // 移除拖動時的樣式
      document.body.style.userSelect = '';
      KeyPointsSummaryManager.UI.container.style.cursor = '';
      KeyPointsSummaryManager.UI.dragTarget = null;
    }
  },

  /** API 管理模塊 */
  APIManager: {
    /** 獲取並更新總結，最多重試2次 */
    async fetchAndUpdateSummary(stockCode, retryCount = 0, maxRetries = 2) {
      console.log('開始獲取總結，股票代碼:', stockCode, '重試次數:', retryCount);
      
      if (!KeyPointsSummaryManager.UI.isExpanded) {
        console.log('面板未展開，取消獲取總結');
        return Promise.resolve();
      }

      const contentElement = document.querySelector('fieldset.answers .margin-top-5.margin-bottom-15');
      if (!contentElement) {
        console.log('找不到內容元素');
        return Promise.resolve();
      }

      const content = contentElement.textContent;
      if (!content) {
        console.log('內容為空');
        return Promise.resolve();
      }

      try {
        console.log('載入設置...');
        const settings = await window.GlobalSettings.loadSettings();
        const model = settings.summaryModel || 'gemini-1.5-flash';
        const isGemini = model.startsWith('gemini');
        const apiKey = settings.apiKeys[isGemini ? 'gemini-1.5-flash' : 'openai'];
        
        if (!apiKey) {
          throw new Error(`未找到 ${isGemini ? 'Gemini' : 'OpenAI'} 的 API 金鑰`);
        }

        console.log('準備 API 請求，使用模型:', model);
        const { endpoint, body } = window.TextProcessor._prepareApiConfig(
          model,
          content,
          settings.summaryInstruction || window.DefaultSettings.summaryInstruction
        );

        console.log('發送 API 請求...');
        const summary = await window.TextProcessor._sendRequest(endpoint, body, apiKey, isGemini);
        console.log('收到 API 回應，更新總結內容');
        
        const formattedSummary = summary.trim().replace(/\n+/g, '\n\n');
        KeyPointsSummaryManager.UIManager.updateContent(formattedSummary);

        return Promise.resolve();

      } catch (error) {
        console.error('獲取摘要失敗:', error);
        
        // 添加重試邏輯
        if (retryCount < maxRetries) {
          console.log(`重試中... (${retryCount + 1}/${maxRetries})`);
          KeyPointsSummaryManager.UIManager.updateContent(`獲取摘要失敗，正在重試 (${retryCount + 1}/${maxRetries})...`);
          
          // 延遲 2 秒後重試
          await new Promise(resolve => setTimeout(resolve, 2000));
          return this.fetchAndUpdateSummary(stockCode, retryCount + 1, maxRetries);
        }
        
        // 如果已達到最大重試次數，顯示最終錯誤信息
        KeyPointsSummaryManager.UIManager.updateContent(`獲取摘要失敗 (已重試 ${maxRetries} 次): ${error.message}`);
        return Promise.reject(error);
      }
    }
  }
};

// 初始化
if (!window.KeyPointsSummaryManager?.UI?.isInitialized) {
  window.addEventListener('load', () => {
    console.log('頁面載入完成，初始化關鍵要點總結管理器');
    KeyPointsSummaryManager.initialize();
  });
}

// 暴露給全局
window.KeyPointsSummaryManager = KeyPointsSummaryManager; 