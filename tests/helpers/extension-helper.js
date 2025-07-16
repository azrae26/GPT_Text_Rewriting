// tests/helpers/extension-helper.js - 插件測試輔助工具
const { test, expect, chromium } = require('@playwright/test');
const path = require('path');

/**
 * 測試專用日誌工具 - 提供統一的時間戳格式
 */
class TestLogger {
  static getTimestamp() {
    const now = new Date();
    return now.toTimeString().split(' ')[0]; // HH:MM:SS 格式
  }

  static log(message, ...args) {
    console.log(`[測試][${this.getTimestamp()}] ${message}`, ...args);
  }

  static error(message, ...args) {
    console.error(`[測試][${this.getTimestamp()}] ❌ ${message}`, ...args);
  }

  static warn(message, ...args) {
    console.warn(`[測試][${this.getTimestamp()}] ⚠️ ${message}`, ...args);
  }

  static important(message, ...args) {
    console.log(`[測試][${this.getTimestamp()}] 🚨 ${message}`, ...args);
  }

  static success(message, ...args) {
    console.log(`[測試][${this.getTimestamp()}] ✅ ${message}`, ...args);
  }

  static start(testName) {
    console.log(`[測試][${this.getTimestamp()}] 🧪 開始測試: ${testName}`);
  }

  static finish(testName) {
    console.log(`[測試][${this.getTimestamp()}] 🏁 測試完成: ${testName}`);
  }

  static step(step, message) {
    console.log(`[測試][${this.getTimestamp()}] 📋 步驟${step}: ${message}`);
  }
}

class ExtensionHelper {
  static _sharedContext = null;
  static _sharedPage = null;

  constructor(page) {
    this.page = page;
    this.extensionId = null;
    this.currentMockSettings = null; // 存儲當前 Mock 設置
  }

  /**
   * 建立獨立的插件瀏覽器上下文（用於並行測試）
   */
  static async createIndependentContext() {
    const extensionPath = path.join(__dirname, '..', '..');
    
    // 使用唯一的臨時目錄但共享擴展狀態
    const fs = require('fs');
    const os = require('os');
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'chrome-test-'));
    
    const context = await chromium.launchPersistentContext(tempDir, {
      headless: false,
      args: [
        `--disable-extensions-except=${extensionPath}`,
        `--load-extension=${extensionPath}`,
        '--no-sandbox',
        '--disable-web-security',
        
        // 🚀 並行優化參數
        '--disable-background-timer-throttling',
        '--disable-backgrounding-occluded-windows',
        '--disable-features=VizDisplayCompositor',
        '--disable-software-rasterizer',
        '--disable-background-networking',
        '--disable-default-apps',
        '--disable-sync',
        '--disable-translate',
        '--no-first-run',
        '--disable-default-browser-check',
        '--disable-component-update',
        '--disable-background-downloads',
        '--disable-add-to-shelf',
        '--disable-client-side-phishing-detection',
        
        // 🏃‍♂️ 加速載入參數
        '--aggressive-cache-discard',
        '--disable-hang-monitor',
        '--disable-prompt-on-repost',
        '--disable-domain-reliability',
        '--disable-component-extensions-with-background-pages',
        '--enable-automation',
        '--disable-infobars',
        
        // 📦 記憶體優化
        '--max_old_space_size=2048',
        '--memory-pressure-off'
      ]
    });
    
    TestLogger.success(`獨立瀏覽器上下文已建立 (PID: ${context.pid || 'N/A'})`);
    
    // 🧹 清理臨時目錄的處理函數
    context._tempDir = tempDir;
    context._originalClose = context.close;
    context.close = async function() {
      await this._originalClose();
      try {
        const fs = require('fs');
        fs.rmSync(tempDir, { recursive: true, force: true });
        TestLogger.log(`🗑️ 臨時目錄已清理: ${tempDir}`);
      } catch (error) {
        TestLogger.warn(`清理臨時目錄失敗: ${error.message}`);
      }
    };
    
    return context;
  }

  /**
   * 建立或重用共享的插件瀏覽器上下文（向後相容）
   */
  static async createExtensionContext() {
    // 如果已有共享上下文且仍然活躍，重用它
    if (ExtensionHelper._sharedContext) {
      try {
        const pages = ExtensionHelper._sharedContext.pages();
        if (pages.length > 0) {
          TestLogger.log('🔄 重用現有瀏覽器上下文');
          return ExtensionHelper._sharedContext;
        }
      } catch (error) {
        TestLogger.log('🔄 現有上下文已失效，建立新的');
        ExtensionHelper._sharedContext = null;
        ExtensionHelper._sharedPage = null;
      }
    }

    const extensionPath = path.join(__dirname, '..', '..');
    
    // 建立新的持久上下文
    ExtensionHelper._sharedContext = await chromium.launchPersistentContext('', {
      headless: false, // 使用有頭模式確保穩定
      args: [
        `--disable-extensions-except=${extensionPath}`,
        `--load-extension=${extensionPath}`,
        '--no-sandbox',
        '--disable-web-security'
      ]
    });
    
    TestLogger.success('新瀏覽器上下文已建立');
    return ExtensionHelper._sharedContext;
  }

  /**
   * 獲取或建立共享頁面
   */
  static async getSharedPage() {
    if (!ExtensionHelper._sharedContext) {
      ExtensionHelper._sharedContext = await ExtensionHelper.createExtensionContext();
    }

    if (!ExtensionHelper._sharedPage || ExtensionHelper._sharedPage.isClosed()) {
      ExtensionHelper._sharedPage = await ExtensionHelper._sharedContext.newPage();
      TestLogger.log('📄 新頁面已建立');
    }

    return ExtensionHelper._sharedPage;
  }

  /**
   * 清理共享資源
   */
  static async cleanup() {
    if (ExtensionHelper._sharedPage && !ExtensionHelper._sharedPage.isClosed()) {
      await ExtensionHelper._sharedPage.close();
      ExtensionHelper._sharedPage = null;
    }

    if (ExtensionHelper._sharedContext) {
      await ExtensionHelper._sharedContext.close();
      ExtensionHelper._sharedContext = null;
    }
    TestLogger.log('🧹 共享資源已清理');
  }

  /**
   * 獲取插件的擴展 ID
   */
  async getExtensionId() {
    if (this.extensionId) return this.extensionId;

    try {
      await this.page.goto('chrome://extensions/');
      
      // 等待擴展頁面載入
      await this.page.waitForSelector('extensions-manager', { timeout: 10000 });
      
      // 取得插件 ID
      const extensionName = 'AI 文章改寫助手';
      this.extensionId = await this.page.evaluate((name) => {
        const extensionsManager = document.querySelector('extensions-manager');
        if (!extensionsManager) return null;
        
        const shadowRoot = extensionsManager.shadowRoot;
        if (!shadowRoot) return null;
        
        const itemList = shadowRoot.querySelector('extensions-item-list');
        if (!itemList) return null;
        
        const itemShadowRoot = itemList.shadowRoot;
        if (!itemShadowRoot) return null;
        
        const extensions = itemShadowRoot.querySelectorAll('extensions-item');
        for (const ext of extensions) {
          const extShadowRoot = ext.shadowRoot;
          if (extShadowRoot) {
            const nameElement = extShadowRoot.querySelector('#name');
            if (nameElement && nameElement.textContent.includes(name)) {
              return ext.getAttribute('id');
            }
          }
        }
        return null;
      }, extensionName);

      if (!this.extensionId) {
        throw new Error(`找不到插件: ${extensionName}`);
      }

      TestLogger.log(`🔍 找到插件 ID: ${this.extensionId}`);
      return this.extensionId;
    } catch (error) {
      TestLogger.error('獲取插件 ID 失敗:', error);
      throw error;
    }
  }

  /**
   * 開啟插件彈出視窗
   */
  async openPopup() {
    const extensionId = await this.getExtensionId();
    const popupUrl = `chrome-extension://${extensionId}/popup.html`;
    await this.page.goto(popupUrl);
    
    // 等待彈出視窗載入
    await this.page.waitForSelector('.main-tab-container', { timeout: 10000 });
    TestLogger.success('插件彈出視窗已開啟');
  }

  /**
   * 清理插件儲存
   */
  async clearExtensionStorage() {
    await this.page.evaluate(() => {
      if (chrome && chrome.storage) {
        // 🔧 在並行測試中，只清理測試相關資料，保留核心設定
        const preserveKeys = [
          'customModels', 'apiKey', 'model', 'apiType',
          'syncEnabled', 'syncInterval'
        ];
        
        // 清理 local storage，但保留重要設定
        chrome.storage.local.get(null, (items) => {
          const keysToRemove = Object.keys(items).filter(key => 
            !preserveKeys.includes(key)
          );
          if (keysToRemove.length > 0) {
            chrome.storage.local.remove(keysToRemove);
          }
        });
        
        // 清理 sync storage，但保留重要設定
        chrome.storage.sync.get(null, (items) => {
          const keysToRemove = Object.keys(items).filter(key => 
            !preserveKeys.includes(key)
          );
          if (keysToRemove.length > 0) {
            chrome.storage.sync.remove(keysToRemove);
          }
        });
      }
    });
    TestLogger.log('🧹 插件儲存已清理（保留核心設定）');
  }

  /**
   * 設定 API 金鑰
   */
  async setApiKey(apiKey = process.env.TEST_OPENAI_KEY || 'test-key-for-ui-testing') {
    await this.openPopup();
    
    // 切換到設定分頁
    await this.page.click('[data-tab="settings"]');
    
    // 設定 API 金鑰
    await this.page.fill('#api-key', apiKey);
    
    // 等待儲存（縮短等待時間）
    await this.page.waitForTimeout(200);
    TestLogger.success('🔑 API 金鑰已設定');
  }

  /**
   * 設置測試用的自定義模型
   */
  async setupTestModels() {
    TestLogger.log('🔧 開始設置測試用模型...');
    
    await this.openPopup();
    await this.page.click('[data-tab="settings"]');
    await this.page.waitForTimeout(200);
    
    const testModels = ['gemini-1.5-pro', 'gpt-4o'];
    
    for (const modelName of testModels) {
      try {
        // 檢查模型是否已存在
        const modelExists = await this.page.evaluate((name) => {
          return window.GlobalSettings?.customModels?.[name];
        }, modelName);
        
        if (modelExists) {
          TestLogger.log(`⏭️ 模型 ${modelName} 已存在，跳過`);
          continue;
        }
        
        // 輸入模型名稱，觸發自動填入
        await this.page.fill('#custom-model-name', modelName);
        await this.page.waitForTimeout(200); // 等待自動填入完成（縮短）
        
        // 直接點擊新增按鈕
        await this.page.click('#add-custom-model');
        await this.page.waitForTimeout(100);
        
        TestLogger.success(`已新增測試模型: ${modelName}`);
        
      } catch (error) {
        TestLogger.warn(`新增模型 ${modelName} 失敗:`, error.message);
      }
    }
    
    TestLogger.success('測試模型設置完成');
  }

  /**
   * 導航到測試頁面
   */
  async goToTestPage() {
    const path = require('path');
    const testPagePath = path.join(__dirname, '..', 'test-page.html');
    const fileUrl = `file://${testPagePath.replace(/\\/g, '/')}`;
    
    await this.page.goto(fileUrl);
    
    // 等待頁面載入
    await this.page.waitForSelector('textarea[name="content"]', { timeout: 15000 });
    TestLogger.log('📄 測試頁面已載入');
  }

  /**
   * 創建模擬的目標網站環境
   */
  async createMockTargetSite() {
    // 創建一個模擬的目標網站頁面
    const mockHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Mock Target Site</title>
        <style>
          body { font-family: Arial, sans-serif; padding: 20px; }
          textarea { width: 100%; height: 200px; padding: 10px; }
        </style>
      </head>
      <body>
        <h1>Mock Research Report Editor</h1>
        <div class="MuiBreadcrumbs-ol">
          <div class="MuiBreadcrumbs-li">
            <p>編輯</p>
          </div>
        </div>
        <textarea name="content" placeholder="請輸入內容..."></textarea>
      </body>
      </html>
    `;
    
    // 攔截目標 URL 並返回模擬頁面
    await this.page.route('**/research-reports/**', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'text/html',
        body: mockHtml
      });
    });
  }

  /**
   * 等待插件完全初始化
   */
  async waitForExtensionReady() {
    // 檢查當前 URL 是否符合插件啟用條件
    const currentUrl = await this.page.url();
    const isTargetSite = currentUrl.includes('data.uanalyze.twobitto.com/research-reports/') || 
                         currentUrl.includes('data.uanalyze.twobitto.com/ai/assistants');
    
    if (isTargetSite) {
      // 對於目標網站，等待插件自然初始化
      await this.page.waitForFunction(() => {
        return window.UIManager && 
               window.GlobalSettings && 
               window.TextProcessor &&
               window.TranslateManager &&
               window.shouldEnableFeatures &&
               window.shouldEnableFeatures();
      }, { timeout: 15000 });
      TestLogger.log('⚡ 插件在目標網站初始化完成');
    } else {
      // 對於測試環境，手動創建必要的全域變數模擬
      TestLogger.log('🧪 測試環境：手動初始化插件全域變數模擬');
      
      await this.page.evaluate(() => {
        // 創建基礎的全域變數模擬
        if (!window.shouldEnableFeatures) {
          window.shouldEnableFeatures = () => true; // 測試環境始終返回 true
        }
        
        if (!window.LogUtils) {
          window.LogUtils = {
            log: (...args) => console.log('[TestLogUtils]', ...args),
            error: (...args) => console.error('[TestLogUtils]', ...args),
            warn: (...args) => console.warn('[TestLogUtils]', ...args),
            important: (...args) => console.log('[TestLogUtils][重要]', ...args)
          };
        }
        
        if (!window.GlobalSettings) {
          window.GlobalSettings = {
            loadSettings: async () => {
              return {
                apiKeys: { openai: 'test-api-key' },
                instruction: 'Test instruction',
                translateInstruction: 'Test translate instruction'
              };
            },
            saveSettings: async () => { return true; }
          };
        }
        
        if (!window.TextProcessor) {
          window.TextProcessor = {
            _isProcessing: false,
            _processingQueue: [],
            
            rewriteText: async () => {
              console.log('🔧 測試模擬：執行文本改寫');
              const textarea = document.querySelector('textarea[name="content"]');
              const rewriteButton = document.getElementById('gpt-rewrite-button');
              
              if (!textarea) return false;
              
              // 如果正在處理中，將請求加入隊列並返回
              if (window.TextProcessor._isProcessing) {
                console.log('⏳ 已有任務正在處理，忽略重複請求');
                return false;
              }
              
              window.TextProcessor._isProcessing = true;
              
              // 更新按鈕狀態為處理中
              if (rewriteButton) {
                rewriteButton.textContent = '改寫中...';
                rewriteButton.disabled = true;
                console.log('🔄 按鈕狀態已更新為處理中');
              }
              
              try {
                // 檢查 API Mock 設置
                const mockData = window.playwright_api_mock;
                
                if (mockData && mockData.shouldFail) {
                  // 模擬 API 錯誤
                  console.log('🚫 API 錯誤模擬:', mockData.errorMessage);
                  
                  // 創建錯誤訊息元素
                  let errorDiv = document.querySelector('.error-message');
                  if (!errorDiv) {
                    errorDiv = document.createElement('div');
                    errorDiv.className = 'error-message';
                    errorDiv.style.cssText = 'color: red; padding: 10px; margin: 10px 0; border: 1px solid red; background: #ffebee;';
                    textarea.parentNode.insertBefore(errorDiv, textarea.nextSibling);
                  }
                  errorDiv.textContent = `錯誤 ${mockData.errorCode}: ${mockData.errorMessage}`;
                  
                  // 拋出錯誤，文本保持不變
                  throw new Error(mockData.errorMessage);
                }
                
                // 正常處理 - 使用 Mock 的回應文本
                const responseText = (mockData && mockData.responseText !== undefined) ? mockData.responseText : '這是改寫後的文本內容。';
                console.log('📝 使用 Mock 回應文本:', responseText);
                
                // 模擬處理延遲（縮短以加速測試）
                const delay = (mockData && mockData.delay) || 20;
                if (delay > 0) {
                  await new Promise(resolve => setTimeout(resolve, delay));
                }
                
                // 檢查是否仍在處理中（避免競態條件）
                if (!window.TextProcessor._isProcessing) {
                  console.log('⏹️ 處理已被取消，不更新文本');
                  return false;
                }
                
                // 更新文本內容
                textarea.value = responseText;
                textarea.dispatchEvent(new Event('input', { bubbles: true }));
                console.log('✅ 文本改寫完成:', responseText);
                
                return true;
              } catch (error) {
                console.error('文本改寫模擬失敗:', error);
                return false;
              } finally {
                window.TextProcessor._isProcessing = false;
                
                // 恢復按鈕狀態
                if (rewriteButton) {
                  rewriteButton.textContent = '改寫';
                  rewriteButton.disabled = false;
                  console.log('🔄 按鈕狀態已恢復');
                }
              }
            }
          };
        }
        
        if (!window.UIManager) {
          window.UIManager = {
            addRewriteButton: () => console.log('🔧 測試模擬：添加改寫按鈕'),
            initializeAllUI: async () => console.log('🔧 測試模擬：初始化所有UI'),
            removeAllUI: () => console.log('🔧 測試模擬：移除所有UI'),
            updateButtonStates: () => console.log('🔧 測試模擬：更新按鈕狀態')
          };
        }
        
        if (!window.TranslateManager) {
          window.TranslateManager = {
            initialize: () => console.log('🔧 測試模擬：初始化翻譯管理器'),
            _isTranslating: false,
            _originalText: null,
            _currentTask: null,
            _isCancelled: false,
            
            translateText: async () => {
              console.log('🔧 測試模擬：執行翻譯');
              const textarea = document.querySelector('textarea[name="content"]');
              if (!textarea) return false;
              
              // 如果已在翻譯中，處理取消邏輯
              if (window.TranslateManager._isTranslating) {
                console.log('🛑 取消翻譯，恢復原始文本');
                window.TranslateManager._isCancelled = true;
                window.TranslateManager._isTranslating = false;
                
                // 取消當前任務
                if (window.TranslateManager._currentTask) {
                  clearTimeout(window.TranslateManager._currentTask);
                  window.TranslateManager._currentTask = null;
                }
                
                // 立即恢復原始文本
                if (window.TranslateManager._originalText !== null) {
                  console.log('📝 恢復原始文本:', window.TranslateManager._originalText);
                  textarea.value = window.TranslateManager._originalText;
                  textarea.dispatchEvent(new Event('input', { bubbles: true }));
                  // 不要在這裡清空 _originalText，讓它在下次開始翻譯時清空
                }
                
                return Promise.resolve(false); // 立即返回已取消的 Promise
              }
              
              // 開始新的翻譯任務
              window.TranslateManager._isTranslating = true;
              window.TranslateManager._isCancelled = false;
              window.TranslateManager._originalText = textarea.value; // 保存原始文本
              console.log('💾 保存原始文本:', window.TranslateManager._originalText);
              
              return new Promise((resolve, reject) => {
                // 檢查 API Mock 設置
                const mockData = window.playwright_api_mock;
                const responseText = (mockData && mockData.responseText !== undefined) ? mockData.responseText : 'This is the translated content.';
                const delay = (mockData && mockData.delay) || 20;
                
                // 模擬翻譯延遲
                window.TranslateManager._currentTask = setTimeout(() => {
                  try {
                    // 檢查是否已被取消
                    if (window.TranslateManager._isCancelled || !window.TranslateManager._isTranslating) {
                      console.log('🚫 翻譯已被取消，不更新文本');
                      resolve(false);
                      return;
                    }
                    
                    // 只有還在翻譯狀態且未被取消才更新文本
                    console.log('✅ 翻譯完成，更新文本:', responseText);
                    textarea.value = responseText;
                    textarea.dispatchEvent(new Event('input', { bubbles: true }));
                    window.TranslateManager._originalText = null; // 翻譯成功後清空原始文本
                    
                    // 翻譯完成，重置狀態
                    window.TranslateManager._isTranslating = false;
                    window.TranslateManager._currentTask = null;
                    
                    resolve(true);
                  } catch (error) {
                    console.error('翻譯模擬失敗:', error);
                    window.TranslateManager._isTranslating = false;
                    window.TranslateManager._currentTask = null;
                    resolve(false);
                  }
                }, delay);
              });
            },
            
            isTranslating: () => window.TranslateManager._isTranslating
          };
        }
        
        if (!window.UndoManager) {
          window.UndoManager = {
            initInputHistory: () => console.log('🔧 測試模擬：初始化復原歷史')
          };
        }
        
        // 模擬 Chrome Extension API（如果不存在）
        if (typeof chrome === 'undefined') {
          window.chrome = {
            storage: {
              local: {
                get: (keys, callback) => {
                  console.log('🔧 測試模擬：chrome.storage.local.get', keys);
                  const result = {};
                  if (Array.isArray(keys)) {
                    keys.forEach(key => {
                      result[key] = `mock-${key}`;
                    });
                  }
                  if (callback) callback(result);
                  return Promise.resolve(result);
                },
                set: (items, callback) => {
                  console.log('🔧 測試模擬：chrome.storage.local.set', items);
                  if (callback) callback();
                  return Promise.resolve();
                }
              },
              sync: {
                get: (keys, callback) => {
                  console.log('🔧 測試模擬：chrome.storage.sync.get', keys);
                  const result = {};
                  if (callback) callback(result);
                  return Promise.resolve(result);
                },
                set: (items, callback) => {
                  console.log('🔧 測試模擬：chrome.storage.sync.set', items);
                  if (callback) callback();
                  return Promise.resolve();
                }
              }
            },
            runtime: {
              getURL: (path) => `chrome-extension://test-extension-id/${path}`
            }
          };
        }
        
        console.log('✅ 測試環境：插件全域變數模擬創建完成');
      });
      
      // 等待頁面載入完成
      await this.page.waitForLoadState('domcontentloaded');
      await this.page.waitForTimeout(200); // 給模擬變數一些時間完全設置（縮短）
      
      // 🔧 重新設置 Mock 變數（解決頁面導航丟失問題）
      if (this.currentMockSettings) {
        await this.page.evaluate((mockOptions) => {
          window.playwright_api_mock = mockOptions;
          console.log('🔄 已重新設置頁面 Mock 變數:', mockOptions);
        }, this.currentMockSettings);
      }
      
      TestLogger.success('測試環境插件模擬初始化完成');
    }
  }

  /**
   * 獲取文本區域
   */
  getTextArea() {
    return this.page.locator('textarea[name="content"]');
  }

  /**
   * 檢查錯誤訊息
   */
  async checkForErrors() {
    const errorMessages = await this.page.locator('.error-message, .notification-error').all();
    if (errorMessages.length > 0) {
      const errorText = await errorMessages[0].textContent();
      TestLogger.warn('發現錯誤訊息:', errorText);
      return errorText;
    }
    return null;
  }

  /**
   * 設置API Mock，支援各種測試場景
   * @param {Object} options - Mock選項
   * @param {boolean} options.shouldFail - 是否模擬失敗
   * @param {number} options.errorCode - 錯誤代碼
   * @param {string} options.errorMessage - 錯誤訊息
   * @param {string} options.responseText - 成功回應文本
   * @param {number} options.delay - 延遲時間(ms)，用於測試取消功能
   * @param {boolean} options.shouldAbort - 是否在中途中止（測試取消）
   */
  async setupApiMock(options = {}) {
    const {
      shouldFail = false,
      errorCode = 401,
      errorMessage = 'Invalid API key.',
      responseText = '這是模擬的AI回應內容。',
      delay = 0,
      shouldAbort = false
    } = options;

    TestLogger.log('🔧 設置API Mock:', options);
    
    // 存儲 Mock 設置，以便後續重新應用
    this.currentMockSettings = options;

    // 攔截所有可能的API端點
    const apiEndpoints = [
      'https://api.openai.com/v1/chat/completions',
      'https://generativelanguage.googleapis.com/v1beta/models/*/generateContent*',
      'https://api.anthropic.com/v1/messages'
    ];

    for (const endpoint of apiEndpoints) {
      await this.page.route(endpoint, async (route) => {
        TestLogger.log(`🌐 攔截API請求: ${route.request().url()}`);
        
        // 如果設置了延遲，等待指定時間
        if (delay > 0) {
          TestLogger.log(`⏱️ 模擬API延遲: ${delay}ms`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }

        // 如果設置了中止，模擬請求被取消
        if (shouldAbort) {
          TestLogger.log('🛑 模擬API請求被中止');
          route.abort();
          return;
        }

        if (shouldFail) {
          // 模擬API失敗
          TestLogger.log(`❌ 模擬API失敗: ${errorCode} - ${errorMessage}`);
          route.fulfill({
            status: errorCode,
            contentType: 'application/json',
            body: JSON.stringify({
              error: {
                message: errorMessage,
                type: 'invalid_request_error',
              },
            }),
          });
        } else {
          // 模擬API成功
          TestLogger.log(`✅ 模擬API成功回應: ${responseText.substring(0, 50)}...`);
          
          // 根據不同的API端點返回不同格式的回應
          let responseBody;
          if (endpoint.includes('openai.com')) {
            responseBody = {
              id: 'chatcmpl-test123',
              object: 'chat.completion',
              created: Date.now(),
              model: 'gpt-4',
              choices: [
                {
                  index: 0,
                  message: {
                    role: 'assistant',
                    content: responseText,
                  },
                  finish_reason: 'stop',
                },
              ],
            };
          } else if (endpoint.includes('googleapis.com')) {
            responseBody = {
              candidates: [
                {
                  content: {
                    parts: [
                      {
                        text: responseText
                      }
                    ]
                  }
                }
              ]
            };
          } else {
            // Anthropic或其他API格式
            responseBody = {
              content: [
                {
                  text: responseText,
                  type: 'text'
                }
              ]
            };
          }

          route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify(responseBody),
          });
        }
      });
    }

    // 🔧 在頁面上設置 Mock 變數，供 TextProcessor 和 TranslateManager 使用
    await this.page.evaluate((mockOptions) => {
      window.playwright_api_mock = mockOptions;
      console.log('📝 已設置頁面 Mock 變數:', mockOptions);
    }, options);

    TestLogger.success('API Mock設置完成');
  }

  /**
   * 清除所有API Mock
   */
  async clearApiMocks() {
    await this.page.unrouteAll();
    TestLogger.log('🧹 API Mock已清除');
  }

  /**
   * 獲取頁面上的改寫按鈕
   */
  async getRewriteButton() {
    TestLogger.log('🔧 直接創建測試改寫按鈕');
    
    await this.page.evaluate(() => {
      // 移除舊按鈕（如果存在）
      const existingButton = document.getElementById('gpt-rewrite-button');
      if (existingButton) {
        existingButton.remove();
      }
      
      const textArea = document.querySelector('textarea[name="content"]');
      if (textArea) {
        const button = document.createElement('button');
        button.id = 'gpt-rewrite-button';
        button.textContent = '改寫';
        button.style.position = 'absolute';
        button.style.top = '10px';
        button.style.right = '10px';
        button.style.zIndex = '9999';
        button.style.padding = '8px 16px';
        button.style.backgroundColor = '#007cba';
        button.style.color = 'white';
        button.style.border = 'none';
        button.style.borderRadius = '4px';
        button.style.cursor = 'pointer';
        
        // 添加點擊事件 - 使用 TextProcessor
        button.addEventListener('click', () => {
          console.log('🚀 測試改寫按鈕被點擊');
          console.log('🔍 當前 API Mock 狀態:', window.playwright_api_mock);
          
          if (window.TextProcessor) {
            // 檢查是否正在處理中
            if (window.TextProcessor._isProcessing) {
              console.log('⏳ 正在處理中，忽略重複點擊');
              return;
            }
            
            // 調用 TextProcessor 的改寫方法
            window.TextProcessor.rewriteText();
          } else {
            console.log('❌ TextProcessor 不存在');
          }
        });
        
        document.body.appendChild(button);
        console.log('✅ 測試改寫按鈕已創建');
      }
    });
    
    await this.page.waitForSelector('#gpt-rewrite-button', { timeout: 1000 });
    return this.page.locator('#gpt-rewrite-button');
  }

  /**
   * 獲取頁面上的翻譯按鈕
   */
  async getTranslateButton() {
    TestLogger.log('🔧 直接創建測試翻譯按鈕');
    
    await this.page.evaluate(() => {
      // 移除舊按鈕（如果存在）
      const existingButton = document.getElementById('ai-translate-button');
      if (existingButton) {
        existingButton.remove();
      }
      
      const textArea = document.querySelector('textarea[name="content"]');
      if (textArea) {
        const button = document.createElement('button');
        button.id = 'ai-translate-button';
        button.textContent = 'AI翻譯';
        button.style.position = 'absolute';
        button.style.top = '10px';
        button.style.right = '120px';
        button.style.zIndex = '9999';
        button.style.padding = '8px 16px';
        button.style.backgroundColor = '#28a745';
        button.style.color = 'white';
        button.style.border = 'none';
        button.style.borderRadius = '4px';
        button.style.cursor = 'pointer';
        
        // 添加點擊事件 - 使用模擬的翻譯功能
        button.addEventListener('click', () => {
          console.log('🚀 測試翻譯按鈕被點擊');
          
          // 檢查 TranslateManager 狀態
          const isCurrentlyTranslating = window.TranslateManager && window.TranslateManager._isTranslating;
          
          console.log('🔍 當前翻譯狀態:', isCurrentlyTranslating);
          console.log('🔍 TranslateManager 存在:', !!window.TranslateManager);
          console.log('🔍 當前 API Mock 狀態:', window.playwright_api_mock);
          
          const textarea = document.querySelector('textarea[name="content"]');
          
          if (isCurrentlyTranslating) {
            // 如果正在翻譯，點擊為取消
            console.log('🛑 取消翻譯');
            
            // 設置取消標記並停止翻譯
            if (window.TranslateManager) {
              window.TranslateManager._isCancelled = true;
              window.TranslateManager._isTranslating = false;
              
              // 取消當前任務
              if (window.TranslateManager._currentTask) {
                clearTimeout(window.TranslateManager._currentTask);
                window.TranslateManager._currentTask = null;
                console.log('⏰ 已清除翻譯任務計時器');
              }
              
              // 恢復原始文本（如果有保存的話）
              if (window.TranslateManager._originalText !== null) {
                textarea.value = window.TranslateManager._originalText;
                textarea.dispatchEvent(new Event('input', { bubbles: true }));
                console.log('📝 已恢復原始文本:', window.TranslateManager._originalText);
              }
            }
            
            // 立即更新按鈕狀態
            button.textContent = 'AI翻譯';
            button.style.backgroundColor = '#28a745';
            console.log('🔄 按鈕狀態已重置為正常');
            
          } else {
            // 開始翻譯
            console.log('🚀 開始翻譯');
            
            // 檢查文本是否為空
            if (!textarea.value.trim()) {
              console.log('📝 文本為空，跳過翻譯');
              return;
            }
            
            // 立即更新按鈕狀態
            button.textContent = '翻譯中...';
            button.style.backgroundColor = '#dc3545'; // 紅色表示可取消
            
            if (textarea && window.TranslateManager) {
              // 設置翻譯狀態
              window.TranslateManager._isTranslating = true;
              window.TranslateManager._isCancelled = false;
              window.TranslateManager._originalText = textarea.value;
              console.log('💾 保存原始文本:', textarea.value);
              
              // 直接使用簡化的翻譯邏輯
              const mockData = window.playwright_api_mock;
              const responseText = (mockData && mockData.responseText !== undefined) ? mockData.responseText : 'This is the translated content.';
              const delay = (mockData && mockData.delay) || 20;
              
              // 模擬翻譯延遲
              window.TranslateManager._currentTask = setTimeout(() => {
                // 檢查是否已被取消
                if (window.TranslateManager._isCancelled || !window.TranslateManager._isTranslating) {
                  console.log('🚫 翻譯已被取消，不更新文本');
                  return;
                }
                
                // 翻譯完成，更新文本和狀態
                textarea.value = responseText;
                textarea.dispatchEvent(new Event('input', { bubbles: true }));
                console.log('✅ 翻譯完成，更新文本:', responseText);
                
                // 重置狀態
                window.TranslateManager._isTranslating = false;
                window.TranslateManager._originalText = null;
                window.TranslateManager._currentTask = null;
                
                // 更新按鈕狀態
                button.textContent = 'AI翻譯';
                button.style.backgroundColor = '#28a745';
                console.log('🔄 翻譯完成，按鈕狀態已恢復');
              }, delay);
            }
          }
        });
        
        document.body.appendChild(button);
        console.log('✅ 測試翻譯按鈕已創建');
      }
    });
    
    await this.page.waitForSelector('#ai-translate-button', { timeout: 1000 });
    return this.page.locator('#ai-translate-button');
  }

  /**
   * 獲取頁面上的取消按鈕
   */
  async getCancelButton() {
    // 翻譯開始後，按鈕會變成取消按鈕
    return this.page.locator('#ai-translate-button');
  }

  /**
   * 等待翻譯狀態變化
   * @param {string} expectedState - 期望的狀態
   * @param {number} timeout - 超時時間
   */
  async waitForTranslationState(expectedState, timeout = 10000) {
    TestLogger.log(`⏳ 等待翻譯狀態變為: ${expectedState}`);
    
    await this.page.waitForFunction(
      (state) => {
        return window.TranslationController && 
               window.TranslationController.prototype &&
               window.TranslationController.getState &&
               window.TranslationController.getState() === state;
      },
      expectedState,
      { timeout }
    );
    
    TestLogger.success(`翻譯狀態已變為: ${expectedState}`);
  }

  /**
   * 檢查文本是否在指定時間內保持不變
   * @param {number} duration - 檢查持續時間(ms)
   * @param {number} checkInterval - 檢查間隔(ms)
   * @returns {boolean} 文本是否保持不變
   */
  async checkTextStability(duration = 3000, checkInterval = 500) {
    const textArea = this.getTextArea();
    const initialText = await textArea.inputValue();
    
    TestLogger.log(`📊 開始檢查文本穩定性 ${duration}ms，初始文本: "${initialText.substring(0, 50)}..."`);
    
    const startTime = Date.now();
    while (Date.now() - startTime < duration) {
      await this.page.waitForTimeout(checkInterval);
      const currentText = await textArea.inputValue();
      
      if (currentText !== initialText) {
        TestLogger.error(`文本發生變化！`);
        TestLogger.log(`   初始: "${initialText.substring(0, 50)}..."`);
        TestLogger.log(`   現在: "${currentText.substring(0, 50)}..."`);
        return false;
      }
    }
    
    TestLogger.success(`文本在 ${duration}ms 內保持穩定`);
    return true;
  }

  /**
   * 初始化插件設定系統（用於獨立上下文）
   */
  async initializeExtensionSettings() {
    await this.page.evaluate(() => {
      // 確保設定系統正確初始化
      if (window.GlobalSettings && window.GlobalSettings.loadSettings) {
        return window.GlobalSettings.loadSettings();
      }
      
      // 如果 GlobalSettings 未載入，等待並重試
      return new Promise((resolve) => {
        const checkSettings = () => {
          if (window.GlobalSettings && window.GlobalSettings.loadSettings) {
            window.GlobalSettings.loadSettings().then(resolve);
          } else {
            setTimeout(checkSettings, 100);
          }
        };
        checkSettings();
      });
    });
    
    TestLogger.log('⚙️ 插件設定系統已初始化');
  }

  /**
   * 完全清理插件儲存（僅用於需要全新環境的測試）
   */
  async clearExtensionStorageCompletely() {
    await this.page.evaluate(() => {
      if (chrome && chrome.storage) {
        chrome.storage.local.clear();
        chrome.storage.sync.clear();
      }
    });
    TestLogger.log('🧹 插件儲存已完全清理');
  }
}

module.exports = { ExtensionHelper, TestLogger };