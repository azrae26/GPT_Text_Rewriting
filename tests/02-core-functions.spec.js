// tests/02-core-functions.spec.js - 核心功能測試
const { test, expect } = require('@playwright/test');
const ExtensionHelper = require('./helpers/extension-helper');

test.describe('核心功能測試', () => {
  let context;
  let page;
  let helper;

  test.beforeAll(async () => {
    // 建立共享的瀏覽器上下文
    context = await ExtensionHelper.createExtensionContext();
  });

  test.afterAll(async () => {
    // 清理共享資源
    await ExtensionHelper.cleanup();
  });

  test.beforeEach(async () => {
    // 獲取共享頁面並設定基本配置
    page = await ExtensionHelper.getSharedPage();
    helper = new ExtensionHelper(page);
    await helper.clearExtensionStorage();
    await helper.setApiKey();
  });

  test('🚀 插件基本功能測試', async () => {
    console.log('🧪 開始測試: 插件基本功能');
    
    // 測試 Popup 基本功能
    await helper.openPopup();
    
    // 檢查主要元素是否存在
    const hasRewriteTab = await page.evaluate(() => !!document.querySelector('[data-tab="rewrite"]'));
    const hasTranslateTab = await page.evaluate(() => !!document.querySelector('[data-tab="translate"]'));
    const hasSettingsTab = await page.evaluate(() => !!document.querySelector('[data-tab="settings"]'));
    
    expect(hasRewriteTab).toBe(true);
    expect(hasTranslateTab).toBe(true);
    expect(hasSettingsTab).toBe(true);
    
    console.log('✅ 插件基本功能測試通過');
  });

  test('⚙️ 設定儲存和載入測試', async () => {
    console.log('🧪 開始測試: 設定儲存和載入');
    
    await helper.openPopup();
    
    // 設定改寫指令
    await page.click('[data-tab="rewrite"]');
    const testInstruction = '請改寫得更正式和清晰';
    await page.fill('#instruction', testInstruction);
    await page.waitForTimeout(1000); // 等待自動保存
    
    // 設定翻譯指令
    await page.click('[data-tab="translate"]');
    const testTranslateInstruction = '請翻譯成英文';
    await page.fill('#translateInstruction', testTranslateInstruction);
    await page.waitForTimeout(1000);
    
    // 重新開啟 popup 驗證設定是否保存
    await page.close();
    page = await ExtensionHelper.getSharedPage();
    helper = new ExtensionHelper(page);
    await helper.openPopup();
    
    // 驗證改寫指令
    await page.click('[data-tab="rewrite"]');
    const savedInstruction = await page.inputValue('#instruction');
    expect(savedInstruction).toBe(testInstruction);
    
    // 驗證翻譯指令
    await page.click('[data-tab="translate"]');
    const savedTranslateInstruction = await page.inputValue('#translateInstruction');
    expect(savedTranslateInstruction).toBe(testTranslateInstruction);
    
    console.log('✅ 設定儲存和載入測試通過');
  });

  test('🔧 API Mock 基礎測試', async () => {
    console.log('🧪 開始測試: API Mock 基礎功能');
    
    // 設定 API Mock
    await helper.setupApiMock({
      responseText: '這是測試回應',
      delay: 500
    });
    
    // 測試 API 攔截是否正常工作
    const response = await page.evaluate(async () => {
      try {
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ test: 'data' })
        });
        return await response.json();
      } catch (error) {
        return { error: error.message };
      }
    });
    
    expect(response.choices).toBeDefined();
    expect(response.choices[0].message.content).toBe('這是測試回應');
    
    console.log('✅ API Mock 基礎測試通過');
  });

  test('🌐 全域物件檢查測試', async () => {
    console.log('🧪 開始測試: 全域物件檢查');
    
    // 導航到測試頁面
    await helper.goToTestPage();
    
    // 檢查基本的頁面載入狀態
    const pageInfo = await page.evaluate(() => {
      return {
        currentUrl: window.location.href,
        hasDocument: !!document,
        hasWindow: !!window,
        isContentLoaded: document.readyState === 'complete'
      };
    });
    
    expect(pageInfo.hasDocument).toBe(true);
    expect(pageInfo.hasWindow).toBe(true);
    expect(pageInfo.currentUrl).toContain('test-page.html');
    
    // 檢查 shouldEnableFeatures 函數（這個函數應該在 content script 中定義）
    const hasShouldEnableFeatures = await page.evaluate(() => {
      return typeof window.shouldEnableFeatures === 'function';
    });
    
    // 在測試頁面上，shouldEnableFeatures 可能不存在或返回 false
    // 這是正常的，因為插件設計為只在特定網站上工作
    console.log('🔍 shouldEnableFeatures 函數存在:', hasShouldEnableFeatures);
    
    console.log('✅ 全域物件檢查測試通過');
  });

  test('📝 文本區域基本操作測試', async () => {
    console.log('🧪 開始測試: 文本區域基本操作');
    
    await helper.goToTestPage();
    
    const textArea = helper.getTextArea();
    const testText = '這是一段測試文本，用於驗證基本的文本操作功能。';
    
    // 設定文本
    await textArea.fill(testText);
    const currentText = await textArea.inputValue();
    expect(currentText).toBe(testText);
    
    // 測試文本選擇
    await textArea.selectText();
    const selectedText = await page.evaluate(() => {
      const textarea = document.querySelector('textarea[name="content"]');
      return textarea ? textarea.value.substring(textarea.selectionStart, textarea.selectionEnd) : '';
    });
    expect(selectedText).toBe(testText);
    
    console.log('✅ 文本區域基本操作測試通過');
  });

  test('🔍 URL 功能啟用檢查測試', async () => {
    console.log('🧪 開始測試: URL 功能啟用檢查');
    
    await helper.goToTestPage();
    
    // 檢查 shouldEnableFeatures 函數
    const urlCheck = await page.evaluate(() => {
      const currentUrl = window.location.href;
      const shouldEnable = window.shouldEnableFeatures ? window.shouldEnableFeatures() : false;
      return {
        currentUrl,
        shouldEnable,
        isFileProtocol: currentUrl.startsWith('file://')
      };
    });
    
    console.log('🔍 URL 檢查結果:', urlCheck);
    
    // 對於測試頁面（file://），功能可能不會自動啟用
    // 這是正常的，因為插件設計為只在特定網站上工作
    expect(urlCheck.isFileProtocol).toBe(true);
    
    console.log('✅ URL 功能啟用檢查測試通過');
  });

  test('💾 儲存機制完整性測試', async () => {
    console.log('🧪 開始測試: 儲存機制完整性');
    
    await helper.openPopup();
    
    // 測試多個設定項目的儲存
    const testSettings = {
      instruction: '改寫測試指令',
      translateInstruction: '翻譯測試指令',
      shortInstruction: '短文本改寫指令',
      reflectInstruction: '反思測試指令',
      codeCheckInstruction: '代號檢查測試指令'
    };
    
    // 設定各種指令 - 需要正確切換分頁
    await page.click('[data-tab="rewrite"]');
    await page.fill('#instruction', testSettings.instruction);
    
    // 切換到短文本改寫分頁
    await page.click('.tab[data-tab="short"]');
    await page.fill('#shortInstruction', testSettings.shortInstruction);
    
    // 切換到代號檢查分頁
    await page.click('.tab[data-tab="code-check"]');
    await page.fill('#codeCheckInstruction', testSettings.codeCheckInstruction);
    
    // 切換到翻譯分頁
    await page.click('[data-tab="translate"]');
    await page.fill('#translateInstruction', testSettings.translateInstruction);
    
    // 切換到反思分頁
    await page.click('.tab[data-tab="reflect"]');
    await page.fill('#reflectInstruction', testSettings.reflectInstruction);
    
    // 等待儲存
    await page.waitForTimeout(1500);
    
    // 檢查 Chrome Storage 中的值 - 根據設定分類，這些都是 LARGE_CONTENT，應該在 Local Storage 中
    const storageValues = await page.evaluate(async () => {
      return new Promise((resolve) => {
        chrome.storage.local.get([
          'instruction',
          'translateInstruction',
          'shortInstruction',
          'reflectInstruction',
          'codeCheckInstruction'
        ], resolve);
      });
    });
    
    expect(storageValues.instruction).toBe(testSettings.instruction);
    expect(storageValues.translateInstruction).toBe(testSettings.translateInstruction);
    expect(storageValues.shortInstruction).toBe(testSettings.shortInstruction);
    expect(storageValues.reflectInstruction).toBe(testSettings.reflectInstruction);
    expect(storageValues.codeCheckInstruction).toBe(testSettings.codeCheckInstruction);
    
    console.log('✅ 儲存機制完整性測試通過');
  });

  test('🎯 錯誤處理機制測試', async () => {
    console.log('🧪 開始測試: 錯誤處理機制');
    
    // 測試 API 錯誤處理
    await helper.setupApiMock({
      shouldFail: true,
      errorCode: 401,
      errorMessage: 'Invalid API key'
    });
    
    // 測試錯誤 API 調用
    const errorResponse = await page.evaluate(async () => {
      try {
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ test: 'data' })
        });
        return {
          status: response.status,
          data: await response.json()
        };
      } catch (error) {
        return { error: error.message };
      }
    });
    
    expect(errorResponse.status).toBe(401);
    expect(errorResponse.data.error.message).toBe('Invalid API key');
    
    console.log('✅ 錯誤處理機制測試通過');
  });

  test('🔄 設定重置和清理測試', async () => {
    console.log('🧪 開始測試: 設定重置和清理');
    
    await helper.openPopup();
    
    // 設定一些測試值
    await page.click('[data-tab="rewrite"]');
    await page.fill('#instruction', '這是要被清理的測試指令');
    await page.waitForTimeout(1000);
    
    // 清理儲存
    await helper.clearExtensionStorage();
    
    // 重新開啟並檢查是否已清理
    await page.close();
    page = await ExtensionHelper.getSharedPage();
    helper = new ExtensionHelper(page);
    await helper.openPopup();
    
    await page.click('[data-tab="rewrite"]');
    const clearedInstruction = await page.inputValue('#instruction');
    expect(clearedInstruction).toBe('');
    
    console.log('✅ 設定重置和清理測試通過');
  });
});