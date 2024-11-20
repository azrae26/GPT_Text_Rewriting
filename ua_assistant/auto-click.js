/**
 * 自動點擊管理器
 * 用於監控股票變化並自動點擊"近況發展"按鈕
 */
const AutoClickManager = {
  hasClicked: false,      // 追蹤是否已經點擊過按鈕
  lastStockCode: null,    // 記錄上一次的股票代碼
  onStockChange: null,    // 股票變化回調函數
  isInTargetPage: false,  // 是否在目標頁面
  onPageStateChange: null,  // 添加頁面狀態變化回調
  isInitialized: false,   // 添加初始化標記
  
  /**
   * 初始化函數
   */
  initialize() {
    // 檢查是否已經初始化
    if (this.isInitialized) {
      console.log('AutoClickManager 已經初始化，跳過');
      return;
    }
    
    // 檢查是否已經有其他實例
    if (window.AutoClickManager && window.AutoClickManager !== this) {
      console.log('檢測到其他實例，跳過初始化');
      return;
    }
    
    console.log('開始檢查頁面...');
    this.setupPageObserver();
    this.setupStockObserver();
    this.setupContentObserver();
    
    // 檢查當前頁面狀態
    const assistantTab = document.querySelector('.ua-tab-title[data-laboratory-id="38364"]');
    if (assistantTab && assistantTab.parentElement.classList.contains('active')) {
      console.log('當前在小助理頁面');
      this.isInTargetPage = true;
      
      // 觸發頁面狀態變化回調
      if (this.onPageStateChange) {
        this.onPageStateChange(true);
      }
      
      // 立即檢查股票代碼
      const stockElement = document.querySelector('.stock-number');
      if (stockElement) {
        const currentStockCode = stockElement.textContent.trim();
        this.lastStockCode = currentStockCode;
      }
      
      // 開始檢查按鈕
      this.checkButtonPeriodically();
    }

    // 設置初始化標記
    this.isInitialized = true;
    
    // 保持初始化狀態
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden && this.isInTargetPage) {
        console.log('頁面變為可見，重新檢查狀態');
        this.checkButtonPeriodically();
      }
    });
  },

  /**
   * 設置頁面觀察器
   * 監聽頁面標籤變化
   */
  setupPageObserver() {
    console.log('設置頁面觀察器...');
    
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.type === 'attributes' || mutation.type === 'childList') {
          // 檢查是否在小助理頁面
          const assistantTab = document.querySelector('.ua-tab-title[data-laboratory-id="38364"]');
          if (assistantTab) {
            const isActive = assistantTab.parentElement.classList.contains('active');
            
            if (isActive && !this.isInTargetPage) {
              console.log('進入小助理頁面');
              this.isInTargetPage = true;
              this.hasClicked = false;
              this.checkButtonPeriodically();
              
              // 觸發頁面狀態變化回調
              if (this.onPageStateChange) {
                this.onPageStateChange(true);
              }
            } else if (!isActive && this.isInTargetPage) {
              console.log('離開小助理頁面');
              this.isInTargetPage = false;
              this.hasClicked = false;
              
              // 觸發頁面狀態變化回調
              if (this.onPageStateChange) {
                this.onPageStateChange(false);
              }
            }
          }
        }
      });
    });

    // 監聽整個文檔的變化
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['class']
    });
    
    console.log('頁面觀察器設置完成');
  },

  /**
   * 設置股票觀察器
   */
  setupStockObserver() {
    const observer = new MutationObserver((mutations) => {
      if (!this.isInTargetPage) return;  // 如果不在目標頁面，不處理

      mutations.forEach((mutation) => {
        if (mutation.type === 'childList') {
          const stockElement = document.querySelector('.stock-number');
          if (stockElement) {
            const currentStockCode = stockElement.textContent.trim();
            if (currentStockCode !== this.lastStockCode) {
              console.log(`股票代碼變更: ${this.lastStockCode} -> ${currentStockCode}`);
              this.lastStockCode = currentStockCode;
              this.hasClicked = false;
              this.checkButtonPeriodically();
              
              if (this.onStockChange) {
                this.onStockChange(currentStockCode);
              }
            }
          }
        }
      });
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
  },

  /**
   * 設置內容觀察器
   */
  setupContentObserver() {
    console.log('設置內容觀察器...');
    
    let debounceTimer = null;
    let lastContent = '';
    let isProcessing = false;
    const MIN_UPDATE_INTERVAL = 1000;
    let processingTimeout = null;
    let requestCount = 0;
    let contentStableTimer = null;
    let lastContentLength = 0;
    let contentStableCount = 0;
    const STABLE_THRESHOLD = 3;
    const STABLE_CHECK_INTERVAL = 100;  // 添加穩定檢查間隔
    let stableCheckTimer = null;        // 添加穩定檢查計時器
    
    this.contentObserver = new MutationObserver((mutations) => {
      if (!this.isInTargetPage) return;
      
      // 清除之前的計時器
      if (debounceTimer) {
        clearTimeout(debounceTimer);
      }
      if (contentStableTimer) {
        clearTimeout(contentStableTimer);
      }
      if (stableCheckTimer) {
        clearInterval(stableCheckTimer);
      }
      
      // 設置新的計時器
      debounceTimer = setTimeout(async () => {
        if (isProcessing) {
          console.log('正在處理中，跳過新的請求');
          return;
        }
        
        const contentElement = document.querySelector('fieldset.answers .margin-top-5.margin-bottom-15');
        if (!contentElement) return;
        
        const currentContent = contentElement.textContent.trim();
        
        // 檢查內容是否為 "回答中..."
        if (currentContent === '回答中...') {
          console.log('內容為 "回答中..."，跳過處理');
          contentStableCount = 0;
          return;
        }
        
        // 檢查內容是否為空或太短
        if (!currentContent || currentContent.length < 10) {
          console.log('內容為空或太短，跳過處理');
          contentStableCount = 0;
          return;
        }
        
        // 設置定期檢查內容穩定性
        stableCheckTimer = setInterval(() => {
          const newContent = contentElement.textContent.trim();
          
          if (newContent.length === lastContentLength) {
            contentStableCount++;
            console.log(`內容長度未變化，穩定計數: ${contentStableCount}/${STABLE_THRESHOLD}`);
            
            if (contentStableCount >= STABLE_THRESHOLD && !isProcessing) {
              clearInterval(stableCheckTimer);
              
              if (newContent === lastContent) {
                console.log('內容未變化，跳過處理');
                return;
              }
              
              isProcessing = true;
              lastContent = newContent;
              
              if (window.KeyPointsSummaryManager?.UI?.isExpanded) {
                requestCount++;
                console.log(`面板已展開，觸發第 ${requestCount} 次 API 請求`);
                
                window.KeyPointsSummaryManager.APIManager.fetchAndUpdateSummary(this.lastStockCode)
                  .finally(() => {
                    console.log(`第 ${requestCount} 次 API 請求完成`);
                    setTimeout(() => {
                      isProcessing = false;
                      console.log('重置處理中標記');
                    }, MIN_UPDATE_INTERVAL);
                  });
              }
            }
          } else {
            console.log('內容長度變化，重置穩定計數');
            lastContentLength = newContent.length;
            contentStableCount = 0;
          }
        }, STABLE_CHECK_INTERVAL);
        
      }, 100);
    });

    // 監聽整個文檔的變化
    this.contentObserver.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true
    });
    console.log('內容觀察器設置完成');
  },

  /**
   * 定期檢查並點擊按鈕
   */
  checkButtonPeriodically() {
    if (this.hasClicked || !this.isInTargetPage) {
      console.log('已經點擊過按鈕或不在目標頁面，不再執行');
      return;
    }

    let attempts = 0;
    const maxAttempts = 5;
    const interval = 1000;

    const check = () => {
      if (this.hasClicked || !this.isInTargetPage) return true;

      attempts++;
      const buttons = document.querySelectorAll('.ai-chat .ua-form button.question-submit');

      if (buttons.length > 0) {
        const targetButton = Array.from(buttons).find(button => 
          button.textContent.trim() === '近況發展' && 
          button.closest('.ai-chat')
        );

        if (targetButton && targetButton.offsetParent !== null && !targetButton.disabled) {
          console.log('找到目標按鈕並點擊');
          targetButton.click();
          this.hasClicked = true;
          return true;
        }
      }

      return attempts >= maxAttempts;
    };

    const checkInterval = setInterval(() => {
      if (check()) {
        clearInterval(checkInterval);
      }
    }, interval);
  }
};

// 將管理器掛載到全局對象
if (!window.AutoClickManager) {
  window.AutoClickManager = AutoClickManager;
  // 等待 DOM 完全載入後再初始化
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      if (!window.AutoClickManager.isInitialized) {
        window.AutoClickManager.initialize();
      }
    });
  } else {
    if (!window.AutoClickManager.isInitialized) {
      window.AutoClickManager.initialize();
    }
  }
} 