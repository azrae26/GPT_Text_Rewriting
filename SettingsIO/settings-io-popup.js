/**
 * settings-io-popup.js - 設定同步功能的 Popup UI 管理器
 * 功能：管理 popup 中的同步功能 UI、事件處理、狀態更新
 * 職責：
 * - 管理同步相關的 DOM 元素和事件處理
 * - 處理與 background.js 的同步命令通信
 * - 管理同步狀態的 UI 顯示和更新
 * - 處理 Google OAuth 認證（需要用戶交互）
 * - 管理同步間隔設定和 UI 錯誤顯示
 * 
 * 依賴：
 * - SettingsIO/settings-io.js：核心同步邏輯
 * - background.js：背景同步管理
 * - Chrome Extensions API：runtime, storage
 * - LogUtils：統一日誌輸出
 * 
 * 使用方式：
 * - 在 popup.js 中引入並初始化
 * - 通過 PopupSyncManager.init() 啟動同步功能
 * - 通過 PopupSyncManager.getDOMElements() 獲取 DOM 元素引用
 */

window.PopupSyncManager = {
  // 同步相關 DOM 元素
  elements: {
    syncStatus: null,
    statusIcon: null,
    statusText: null,
    authButton: null,
    signoutButton: null,
    manualSyncButton: null,
    autoSyncToggle: null,
    syncError: null,
    syncIntervalInput: null
  },

  // SettingsIO 實例
  settingsIO: null,

  /**
   * 初始化 DOM 元素引用
   */
  initializeDOMElements() {
    this.elements.syncStatus = document.getElementById('sync-status');
    this.elements.statusIcon = document.getElementById('status-icon');
    this.elements.statusText = document.getElementById('status-text');
    this.elements.authButton = document.getElementById('auth-button');
    this.elements.signoutButton = document.getElementById('signout-button');
    this.elements.manualSyncButton = document.getElementById('manual-sync-button');
    this.elements.autoSyncToggle = document.getElementById('auto-sync-toggle');
    this.elements.syncError = document.getElementById('sync-error');
    this.elements.syncIntervalInput = document.getElementById('sync-interval');
  },

  /**
   * 初始化 SettingsIO 實例（單例模式）
   */
  initializeSettingsIO() {
    if (typeof SettingsIO !== 'undefined') {
      // 使用單例模式獲取實例
      this.settingsIO = SettingsIO.getInstance();
      window.settingsIO = this.settingsIO; // 暴露到全局，供 settings-manager.js 使用
      LogUtils.log('✅ 使用 SettingsIO 單例實例並暴露到 window');
    } else {
      LogUtils.warn('SettingsIO 類別未載入');
    }
  },

  /**
   * 載入同步間隔設定
   */
  async loadSyncInterval() {
    if (this.elements.syncIntervalInput && this.settingsIO) {
      try {
        const syncInterval = await this.settingsIO.getSyncInterval();
        this.elements.syncIntervalInput.value = syncInterval;
      } catch (error) {
        LogUtils.warn('載入同步間隔失敗:', error);
        this.elements.syncIntervalInput.value = 2; // 預設值
      }
    }
  },

  /**
   * 認證操作
   */
  authOperations: {
    async authenticateWithGoogle(interactive = false) {
      const manager = window.PopupSyncManager;
      if (!manager.settingsIO) {
        if (typeof SettingsIO !== 'undefined') {
          // 🔧 修復：使用單例實例，不創建新實例
          manager.settingsIO = SettingsIO.getInstance();
          LogUtils.log('✅ 認證操作使用 SettingsIO 單例實例');
        } else {
          throw new Error('SettingsIO 未載入');
        }
      }
      return await manager.settingsIO.authenticateWithGoogle(interactive);
    }
  },

  /**
   * 同步操作 - 通過 background.js 執行
   */
  syncOperations: {
    async manualSync() {
      return new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({
          action: 'settingsSync',
          command: 'manualSync'
        }, response => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
          } else {
            resolve(response);
          }
        });
      });
    },

    async toggleAutoSync(enabled) {
      return new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({
          action: 'settingsSync',
          command: 'toggleAutoSync',
          enabled: enabled
        }, response => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
          } else {
            resolve(response);
          }
        });
      });
    },

    async getSyncStatus() {
      return new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({
          action: 'settingsSync',
          command: 'getSyncStatus'
        }, response => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
          } else {
            resolve(response);
          }
        });
      });
    },

    async resetSyncStatus() {
      return new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({
          action: 'settingsSync',
          command: 'resetSyncStatus'
        }, response => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
          } else {
            resolve(response);
          }
        });
      });
    },

    async signOut() {
      return new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({
          action: 'settingsSync',
          command: 'signOut'
        }, response => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
          } else {
            resolve(response);
          }
        });
      });
    },

    async forceUpload() {
      return new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({
          action: 'settingsSync',
          command: 'forceUpload'
        }, response => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
          } else {
            resolve(response);
          }
        });
      });
    }
  },

  /**
   * 設置同步相關事件處理器
   */
  setupSyncEventHandlers() {
    const { elements, authOperations, syncOperations } = this;

    // 認證按鈕
    if (elements.authButton) {
      elements.authButton.addEventListener('click', async () => {
        LogUtils.log('開始認證');
        try {
          elements.authButton.disabled = true;
          elements.authButton.textContent = '認證中...';
          
          // Google OAuth需要在popup環境中進行交互式認證
          const result = await authOperations.authenticateWithGoogle(true);
          if (result.success) {
            LogUtils.log('認證成功');
            await this.updateSyncStatus();
          } else {
            throw new Error(result.error || '認證失敗');
          }
        } catch (error) {
          LogUtils.error('認證失敗:', error);
          this.showSyncError('認證失敗: ' + error.message);
        } finally {
          elements.authButton.disabled = false;
          elements.authButton.textContent = '連接 Google Drive';
        }
      });
    }

    // 登出按鈕
    if (elements.signoutButton) {
      elements.signoutButton.addEventListener('click', async () => {
        LogUtils.log('開始登出');
        try {
          const result = await syncOperations.signOut();
          if (!result.success) {
            throw new Error(result.error);
          }
          await this.updateSyncStatus();
          LogUtils.log('登出成功');
        } catch (error) {
          LogUtils.error('登出失敗:', error);
          this.showSyncError('登出失敗: ' + error.message);
        }
      });
    }

    // 手動同步按鈕
    if (elements.manualSyncButton) {
      elements.manualSyncButton.addEventListener('click', async () => {
        LogUtils.log('開始手動同步');
        try {
          elements.manualSyncButton.disabled = true;
          elements.manualSyncButton.textContent = '同步中...';
          
          const result = await syncOperations.manualSync();
          if (result.success) {
            LogUtils.log('手動同步成功');
            this.clearSyncError();
          } else {
            throw new Error(result.error || '同步失敗');
          }
        } catch (error) {
          LogUtils.error('手動同步失敗:', error);
          this.showSyncError('同步失敗: ' + error.message);
        } finally {
          elements.manualSyncButton.disabled = false;
          elements.manualSyncButton.textContent = '手動同步';
          await this.updateSyncStatus();
        }
      });
    }

    // 自動同步開關
    if (elements.autoSyncToggle) {
      elements.autoSyncToggle.addEventListener('click', async () => {
        LogUtils.log('切換自動同步');
        try {
          const enabled = elements.autoSyncToggle.classList.contains('active');
          const newState = !enabled;
          
          const result = await syncOperations.toggleAutoSync(newState);
          if (!result.success) {
            throw new Error(result.error);
          }
          
          if (newState) {
            elements.autoSyncToggle.classList.add('active');
          } else {
            elements.autoSyncToggle.classList.remove('active');
          }
          
          LogUtils.log('自動同步已' + (newState ? '啟用' : '停用'));
          await this.updateSyncStatus();
        } catch (error) {
          LogUtils.error('切換自動同步失敗:', error);
          this.showSyncError('切換自動同步失敗: ' + error.message);
        }
      });
    }

    // 同步間隔輸入框
    if (elements.syncIntervalInput && this.settingsIO) {
      elements.syncIntervalInput.addEventListener('change', async () => {
        try {
          const intervalMinutes = parseFloat(elements.syncIntervalInput.value);
          
          // 驗證輸入值
          if (isNaN(intervalMinutes) || intervalMinutes < 0.1 || intervalMinutes > 60) {
            throw new Error('間隔時間必須在 0.1 到 60 分鐘之間');
          }
          
          await this.settingsIO.setSyncInterval(intervalMinutes);
          LogUtils.log(`同步間隔已更新為 ${intervalMinutes} 分鐘`);
          
        } catch (error) {
          LogUtils.error(`更新同步間隔失敗:`, error);
          this.showSyncError('更新同步間隔失敗: ' + error.message);
          
          // 重新載入正確的值
          try {
            const currentInterval = await this.settingsIO.getSyncInterval();
            elements.syncIntervalInput.value = currentInterval;
          } catch (loadError) {
            elements.syncIntervalInput.value = 2; // 回到預設值
          }
        }
      });
    }
  },

  /**
   * 更新同步狀態顯示
   */
  async updateSyncStatus() {
    const { elements, syncOperations } = this;
    
    if (!elements.syncStatus) {
      LogUtils.log('updateSyncStatus: syncStatus元素未找到');
      return;
    }

    try {
      const result = await syncOperations.getSyncStatus();
      if (!result.success) {
        throw new Error(result.error);
      }
      
      const syncStatusData = result;
      LogUtils.log(`updateSyncStatus: enabled=${syncStatusData.enabled}, status=${syncStatusData.status}`, {
        fullResult: result,
        syncStatusData: syncStatusData
      });
      
      // 更新狀態圖示和文字
      if (elements.statusIcon && elements.statusText) {
        elements.statusIcon.className = 'status-icon';
        elements.syncStatus.className = 'sync-status-display';
        
        if (syncStatusData.enabled && !syncStatusData.error) {
          elements.statusIcon.classList.add('connected');
          elements.syncStatus.classList.add('connected');
          elements.statusText.textContent = '已連接 Google Drive';
        } else if (syncStatusData.status === 'syncing') {
          elements.statusIcon.classList.add('syncing');
          elements.syncStatus.classList.add('syncing');
          elements.statusText.textContent = '同步中...';
        } else if (syncStatusData.error) {
          elements.statusIcon.classList.add('error');
          elements.syncStatus.classList.add('error');
          elements.statusText.textContent = '同步錯誤';
        } else {
          elements.statusIcon.classList.add('disconnected');
          elements.syncStatus.classList.add('disconnected');
          elements.statusText.textContent = '未連接';
        }
      }

      // 更新按鈕狀態
      if (elements.authButton && elements.signoutButton) {
        if (syncStatusData.enabled) {
          elements.authButton.style.display = 'none';
          elements.signoutButton.style.display = 'inline-block';
        } else {
          elements.authButton.style.display = 'inline-block';
          elements.signoutButton.style.display = 'none';
        }
      }

      // 更新自動同步開關
      if (elements.autoSyncToggle) {
        LogUtils.log(`更新自動同步開關狀態: ${syncStatusData.autoSyncActive}`);
        if (syncStatusData.autoSyncActive) {
          elements.autoSyncToggle.classList.add('active');
        } else {
          elements.autoSyncToggle.classList.remove('active');
        }
      }

      // 顯示錯誤訊息
      if (syncStatusData.error) {
        this.showSyncError(syncStatusData.error);
      } else {
        this.clearSyncError();
      }

    } catch (error) {
      LogUtils.error('更新同步狀態失敗:', error);
    }
  },

  /**
   * 顯示同步錯誤
   */
  showSyncError(message) {
    if (this.elements.syncError) {
      this.elements.syncError.textContent = message;
      this.elements.syncError.style.display = 'block';
    }
  },

  /**
   * 清除同步錯誤
   */
  clearSyncError() {
    if (this.elements.syncError) {
      this.elements.syncError.style.display = 'none';
      this.elements.syncError.textContent = '';
    }
  },

  /**
   * 初始化同步功能
   */
  async initializeSyncFeatures() {
    try {
      this.setupSyncEventHandlers();
      
      chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        if (message.action === 'syncStatusUpdate') {
          this.updateSyncStatus();
        }
      });
      
      await this.updateSyncStatus();
    } catch (error) {
      LogUtils.error('同步功能初始化失敗:', error);
    }
  },

  /**
   * 主初始化方法
   */
  async init() {
    LogUtils.log('PopupSyncManager 開始初始化...');
    
    // 初始化 DOM 元素
    this.initializeDOMElements();
    
    // 初始化 SettingsIO
    this.initializeSettingsIO();
    
    // 載入同步間隔設定
    await this.loadSyncInterval();
    
    // 初始化同步功能
    await this.initializeSyncFeatures();
    
    LogUtils.log('PopupSyncManager 初始化完成');
  },

  /**
   * 獲取 DOM 元素引用（供 popup.js 使用）
   */
  getDOMElements() {
    return this.elements;
  }
}; 