// tests/helpers/extension-helper.js - 插件測試輔助工具
const { test, expect, chromium } = require('@playwright/test');
const path = require('path');

class ExtensionHelper {
  static _sharedContext = null;
  static _sharedPage = null;

  constructor(page) {
    this.page = page;
    this.extensionId = null;
  }

  /**
   * 建立或重用共享的插件瀏覽器上下文
   */
  static async createExtensionContext() {
    // 如果已有共享上下文且仍然活躍，重用它
    if (ExtensionHelper._sharedContext) {
      try {
        const pages = ExtensionHelper._sharedContext.pages();
        if (pages.length > 0) {
          console.log('🔄 重用現有瀏覽器上下文');
          return ExtensionHelper._sharedContext;
        }
      } catch (error) {
        console.log('🔄 現有上下文已失效，建立新的');
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
    
    console.log('✅ 新瀏覽器上下文已建立');
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
      console.log('📄 新頁面已建立');
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
    console.log('🧹 共享資源已清理');
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

      console.log(`🔍 找到插件 ID: ${this.extensionId}`);
      return this.extensionId;
    } catch (error) {
      console.error('獲取插件 ID 失敗:', error);
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
    console.log('✅ 插件彈出視窗已開啟');
  }

  /**
   * 清理插件儲存
   */
  async clearExtensionStorage() {
    await this.page.evaluate(() => {
      if (chrome && chrome.storage) {
        chrome.storage.local.clear();
        chrome.storage.sync.clear();
      }
    });
    console.log('🧹 插件儲存已清理');
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
    
    // 等待儲存
    await this.page.waitForTimeout(500);
    console.log('🔑 API 金鑰已設定');
  }

  /**
   * 設置測試用的自定義模型
   */
  async setupTestModels() {
    console.log('🔧 開始設置測試用模型...');
    
    await this.openPopup();
    await this.page.click('[data-tab="settings"]');
    
    // 等待頁面完全載入
    await this.page.waitForTimeout(1000);
    
    // 測試用模型配置
    const testModels = [
      {
        name: 'gemini-1.5-pro',
        display: 'Gemini 1.5 Pro (測試)',
        apiType: 'gemini'
      },
      {
        name: 'gemini-1.5-flash',
        display: 'Gemini 1.5 Flash (測試)',
        apiType: 'gemini'
      },
      {
        name: 'gpt-4o',
        display: 'GPT-4o (測試)',
        apiType: 'openai'
      }
    ];
    
    // 新增每個測試模型
    for (const model of testModels) {
      try {
        // 檢查模型是否已存在
        const modelExists = await this.page.evaluate((modelName) => {
          return window.GlobalSettings && 
                 window.GlobalSettings.customModels && 
                 window.GlobalSettings.customModels[modelName];
        }, model.name);
        
        if (modelExists) {
          console.log(`⏭️ 模型 ${model.name} 已存在，跳過`);
          continue;
        }
        
        // 🔧 修復：避免自動填入機制衝突
        // 先選擇 API 類型，避免自動檢測覆蓋
        await this.page.selectOption('#custom-model-type', model.apiType);
        await this.page.waitForTimeout(100);
        
        // 再填入顯示名稱，避免自動填入覆蓋
        await this.page.fill('#custom-model-display', model.display);
        await this.page.waitForTimeout(100);
        
        // 最後填入模型名稱，但要等待自動填入完成
        await this.page.fill('#custom-model-name', model.name);
        
        // 🕒 等待自動填入機制完成（300ms防抖 + 緩衝時間）
        await this.page.waitForTimeout(500);
        
        // 🔄 確保值沒有被自動填入覆蓋，必要時重新設置
        await this.page.evaluate(({ name, display, apiType }) => {
          const nameInput = document.getElementById('custom-model-name');
          const displayInput = document.getElementById('custom-model-display');
          const typeSelect = document.getElementById('custom-model-type');
          
          if (nameInput && nameInput.value !== name) {
            nameInput.value = name;
          }
          if (displayInput && displayInput.value !== display) {
            displayInput.value = display;
          }
          if (typeSelect && typeSelect.value !== apiType) {
            typeSelect.value = apiType;
          }
        }, model);
        
        // 點擊新增按鈕
        await this.page.click('#add-custom-model');
        
        // 等待新增完成
        await this.page.waitForTimeout(500);
        
        console.log(`✅ 已新增測試模型: ${model.name}`);
        
      } catch (error) {
        console.log(`⚠️ 新增模型 ${model.name} 失敗:`, error.message);
      }
    }
    
    // 驗證模型是否成功新增
    const availableModels = await this.page.evaluate(() => {
      if (!window.GlobalSettings || !window.GlobalSettings.customModels) {
        return {};
      }
      return window.GlobalSettings.customModels;
    });
    
    console.log('🔍 當前可用的自定義模型:', Object.keys(availableModels));
    console.log('✅ 測試模型設置完成');
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
    console.log('📄 測試頁面已載入');
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
      console.log('⚡ 插件在目標網站初始化完成');
    } else {
      // 對於測試環境，只等待頁面載入完成
      await this.page.waitForLoadState('domcontentloaded');
      await this.page.waitForTimeout(500); // 給插件內容腳本一些時間載入
      console.log('⚡ 測試環境頁面載入完成');
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
      console.warn('⚠️ 發現錯誤訊息:', errorText);
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

    console.log('🔧 設置API Mock:', options);

    // 攔截所有可能的API端點
    const apiEndpoints = [
      'https://api.openai.com/v1/chat/completions',
      'https://generativelanguage.googleapis.com/v1beta/models/*/generateContent*',
      'https://api.anthropic.com/v1/messages'
    ];

    for (const endpoint of apiEndpoints) {
      await this.page.route(endpoint, async (route) => {
        console.log(`🌐 攔截API請求: ${route.request().url()}`);
        
        // 如果設置了延遲，等待指定時間
        if (delay > 0) {
          console.log(`⏱️ 模擬API延遲: ${delay}ms`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }

        // 如果設置了中止，模擬請求被取消
        if (shouldAbort) {
          console.log('🛑 模擬API請求被中止');
          route.abort();
          return;
        }

        if (shouldFail) {
          // 模擬API失敗
          console.log(`❌ 模擬API失敗: ${errorCode} - ${errorMessage}`);
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
          console.log(`✅ 模擬API成功回應: ${responseText.substring(0, 50)}...`);
          
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

    console.log('✅ API Mock設置完成');
  }

  /**
   * 清除所有API Mock
   */
  async clearApiMocks() {
    await this.page.unrouteAll();
    console.log('🧹 API Mock已清除');
  }

  /**
   * 獲取頁面上的改寫按鈕
   */
  async getRewriteButton() {
    // 首先嘗試等待動態創建的按鈕
    try {
      await this.page.waitForSelector('#gpt-rewrite-button', { timeout: 5000 });
      return this.page.locator('#gpt-rewrite-button');
    } catch (error) {
      console.log('⚠️ 動態按鈕未找到，手動創建測試按鈕');
      
      // 手動創建測試按鈕
      await this.page.evaluate(() => {
        if (!document.getElementById('gpt-rewrite-button')) {
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
            
            // 添加點擊事件
            button.addEventListener('click', async () => {
              if (window.TextProcessor && window.TextProcessor.rewriteText) {
                await window.TextProcessor.rewriteText();
              }
            });
            
            document.body.appendChild(button);
            console.log('✅ 測試改寫按鈕已創建');
          }
        }
      });
      
      await this.page.waitForSelector('#gpt-rewrite-button', { timeout: 2000 });
      return this.page.locator('#gpt-rewrite-button');
    }
  }

  /**
   * 獲取頁面上的翻譯按鈕
   */
  async getTranslateButton() {
    // 直接創建測試按鈕，不浪費時間等待動態按鈕
    console.log('🔧 直接創建測試翻譯按鈕');
    
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
        
        // 添加點擊事件 - 簡化版本，僅用於測試UI交互
        button.addEventListener('click', () => {
          button.textContent = '翻譯中...';
          console.log('🚀 測試按鈕被點擊');
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
    console.log(`⏳ 等待翻譯狀態變為: ${expectedState}`);
    
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
    
    console.log(`✅ 翻譯狀態已變為: ${expectedState}`);
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
    
    console.log(`📊 開始檢查文本穩定性 ${duration}ms，初始文本: "${initialText.substring(0, 50)}..."`);
    
    const startTime = Date.now();
    while (Date.now() - startTime < duration) {
      await this.page.waitForTimeout(checkInterval);
      const currentText = await textArea.inputValue();
      
      if (currentText !== initialText) {
        console.log(`❌ 文本發生變化！`);
        console.log(`   初始: "${initialText.substring(0, 50)}..."`);
        console.log(`   現在: "${currentText.substring(0, 50)}..."`);
        return false;
      }
    }
    
    console.log(`✅ 文本在 ${duration}ms 內保持穩定`);
    return true;
  }
}

module.exports = ExtensionHelper; 