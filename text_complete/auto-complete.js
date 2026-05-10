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

      // 準備 API 請求
      const defaultInstruction =
`我正在寫一篇分析文，但我缺乏靈感，請根據前文內容及敍事邏輯，以相同的語氣和風格，自然地接續最後一個字撰寫下去。
續寫長度請在100字左右。
續寫的內容不需有結語，只需自然地接著寫下去。
續寫時不要加入任何解釋或說明。
續寫時不必包含前文內容，只需接著最後一個字寫。

前文：
{{Context}}`;
      const instruction = settings.autoCompleteInstruction || defaultInstruction;

      // 將 {{Context}} 替換為游標前的實際文字
      const finalInstruction = instruction.includes('{{Context}}')
        ? instruction.replace(/\{\{Context\}\}/g, textBeforeCursor)
        : `${instruction}\n\n${textBeforeCursor}`;

      LogUtils.log('準備發送 API 請求');
      const { endpoint, body } = window.TextProcessor._prepareApiConfig(
        model,
        {},
        finalInstruction,
        []
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





