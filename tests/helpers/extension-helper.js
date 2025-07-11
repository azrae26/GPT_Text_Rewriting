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
        
        // 填入模型資訊
        await this.page.fill('#custom-model-name', model.name);
        await this.page.fill('#custom-model-display', model.display);
        await this.page.selectOption('#custom-model-type', model.apiType);
        
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
   * 等待插件完全初始化
   */
  async waitForExtensionReady() {
    // 檢查是否為測試頁面（本地檔案）
    const isTestPage = await this.page.evaluate(() => {
      return window.location.protocol === 'file:';
    });
    
    if (isTestPage) {
      // 對於測試頁面，只等待頁面載入完成，不需要插件全域物件
      await this.page.waitForLoadState('domcontentloaded');
      console.log('⚡ 測試頁面載入完成');
    } else {
      // 對於真實網站，等待插件完全初始化
      await this.page.waitForFunction(() => {
        return window.UIManager && 
               window.GlobalSettings && 
               window.TextProcessor &&
               window.TranslateManager;
      }, { timeout: 15000 });
      console.log('⚡ 插件初始化完成');
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
}

module.exports = ExtensionHelper; 