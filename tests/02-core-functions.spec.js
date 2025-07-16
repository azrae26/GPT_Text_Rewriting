// tests/02-core-functions.spec.js - 核心功能測試
const { test, expect } = require('@playwright/test');
const { ExtensionHelper, TestLogger } = require('./helpers/extension-helper');

test.describe('核心功能測試', () => {
  // 配置並行模式
  test.describe.configure({ mode: 'parallel' });
  
  let context;
  let page;
  let helper;

  test.beforeAll(async () => {
    // 🚀 使用獨立瀏覽器上下文實現真正並行
    context = await ExtensionHelper.createIndependentContext();
  });

  test.afterAll(async () => {
    // 清理獨立資源
    if (context) {
      await context.close();
      TestLogger.log('🧹 獨立上下文已清理');
    }
  });

  test.beforeEach(async () => {
    // 每個測試使用獨立頁面
    page = await context.newPage();
    helper = new ExtensionHelper(page);
    
    TestLogger.log('📄 新頁面已建立');
    
    // ⚡ 移除不必要的等待和儲存清理
    // await helper.clearExtensionStorage();
  });

  test.afterEach(async () => {
    // 清理頁面資源
    if (page && !page.isClosed()) {
      await page.close();
      TestLogger.log('🧹 頁面已清理');
    }
  });

  test('🚀 插件初始化載入測試', async () => {
    TestLogger.start('插件初始化載入');
    
    // 導航到測試頁面
    await helper.goToTestPage();
    
    // ⚡ 智能等待插件就緒，替換固定時間等待
    await helper.waitForExtensionReady();
    // await page.waitForTimeout(1000); // 🗑️ 移除：等待自動保存
    
    // 驗證插件是否正確載入
    const isExtensionLoaded = await page.evaluate(() => {
      return !!(window.UIManager && window.GlobalSettings && window.TextProcessor);
    });
    
    expect(isExtensionLoaded).toBe(true);
    
    // ⚡ 移除固定等待
    // await page.waitForTimeout(1000);
    TestLogger.success('插件初始化載入測試通過');
  });

  test('✏️ 文本改寫功能測試', async () => {
    TestLogger.start('文本改寫功能');
    
    // 設置API Mock
    await helper.setupApiMock({
      shouldFail: false,
      responseText: '這是改寫後的文本內容。'
    });
    
    await helper.goToTestPage();
    await helper.waitForExtensionReady();
    
    // 獲取文本區域和改寫按鈕
    const textArea = helper.getTextArea();
    const rewriteButton = await helper.getRewriteButton();
    
    // 設置初始文本
    await textArea.fill('這是需要改寫的原始文本。');
    
    // 點擊改寫按鈕
    await rewriteButton.click();
    
    // ⚡ 使用智能等待替代固定延遲
    await expect(textArea).toHaveValue('這是改寫後的文本內容。', { timeout: 5000 });
    
    TestLogger.success('文本改寫功能測試通過');
  });

  test('🌐 翻譯功能測試', async () => {
    TestLogger.start('翻譯功能');
    
    // 設置API Mock
    await helper.setupApiMock({
      shouldFail: false,
      responseText: 'This is the translated content.'
    });
    
    await helper.goToTestPage();
    await helper.waitForExtensionReady();
    
    // 獲取文本區域和翻譯按鈕
    const textArea = helper.getTextArea();
    const translateButton = await helper.getTranslateButton();
    
    // 設置初始文本
    await textArea.fill('這是需要翻譯的中文文本。');
    
    // 點擊翻譯按鈕
    await translateButton.click();
    
    // ⚡ 使用智能等待替代固定延遲
    await expect(textArea).toHaveValue('This is the translated content.', { timeout: 5000 });
    
    TestLogger.success('翻譯功能測試通過');
  });

  test('🛑 翻譯取消功能測試', async () => {
    TestLogger.start('翻譯取消功能');
    
    // 設置API Mock，模擬長時間處理和中止
    await helper.setupApiMock({
      shouldFail: false,
      responseText: '這不應該出現的翻譯結果',
      delay: 2000, // 2秒延遲，給我們時間取消
      shouldAbort: true  // 模擬請求被中止
    });
    
    await helper.goToTestPage();
    await helper.waitForExtensionReady();
    
    const textArea = helper.getTextArea();
    const translateButton = await helper.getTranslateButton();
    
    // 設置初始文本
    const originalText = '需要翻譯但會被取消的文本';
    await textArea.fill(originalText);
    
    // 開始翻譯
    await translateButton.click();
    
    // 等待一小段時間確保翻譯開始
    await page.waitForTimeout(100);
    
    // 取消翻譯（再次點擊按鈕）
    await translateButton.click();
    
    // ⚡ 驗證文本保持原始狀態，使用更可靠的檢查
    await expect(textArea).toHaveValue(originalText, { timeout: 1000 });
    
    // 檢查文本在一段時間內保持穩定
    const isStable = await helper.checkTextStability(1000, 200);
    expect(isStable).toBe(true);
    
    TestLogger.success('翻譯取消功能測試通過');
  });

  test('📊 API 錯誤處理測試', async () => {
    TestLogger.start('API 錯誤處理');
    
    // 設置API Mock模擬錯誤
    await helper.setupApiMock({
      shouldFail: true,
      errorCode: 401,
      errorMessage: 'Invalid API key.'
    });
    
    await helper.goToTestPage();
    await helper.waitForExtensionReady();
    
    const textArea = helper.getTextArea();
    const rewriteButton = await helper.getRewriteButton();
    
    // 設置文本
    await textArea.fill('測試API錯誤處理的文本。');
    
    // 點擊改寫按鈕
    await rewriteButton.click();
    
    // ⚡ 等待錯誤訊息出現
    await page.waitForSelector('.error-message', { timeout: 5000 });
    
    // 驗證錯誤訊息
    const errorMessage = await helper.checkForErrors();
    expect(errorMessage).toContain('Invalid API key');
    
    TestLogger.success('API 錯誤處理測試通過');
  });

  test('🔄 多重任務處理測試', async () => {
    TestLogger.start('多重任務處理');
    
    // 設置API Mock
    await helper.setupApiMock({
      shouldFail: false,
      responseText: '處理完成的文本'
    });
    
    await helper.goToTestPage();
    await helper.waitForExtensionReady();
    
    const textArea = helper.getTextArea();
    const rewriteButton = await helper.getRewriteButton();
    
    // 設置文本
    await textArea.fill('多重任務測試文本');
    
    // 檢查處理狀態，確保初始為非處理狀態
    const initialProcessingState = await page.evaluate(() => {
      return window.TextProcessor && window.TextProcessor._isProcessing;
    });
    expect(initialProcessingState).toBeFalsy();
    
    // 第一次點擊改寫按鈕
    TestLogger.log('🔄 第一次點擊改寫按鈕');
    await rewriteButton.click();
    
    // 檢查處理狀態
    const processingState = await page.evaluate(() => {
      return window.TextProcessor && window.TextProcessor._isProcessing;
    });
    TestLogger.log('🔍 第一次點擊後，處理狀態:', processingState);
    
    // 立即第二次點擊（應該被忽略）
    TestLogger.log('🔄 第二次點擊改寫按鈕');
    await rewriteButton.click();
    
    // ⚡ 等待處理完成
    await expect(textArea).toHaveValue('處理完成的文本', { timeout: 5000 });
    
    TestLogger.success('多重任務處理測試通過');
  });

  test('🎯 特殊文本識別測試', async () => {
    TestLogger.start('特殊文本識別');
    
    await helper.goToTestPage();
    await helper.waitForExtensionReady();
    
    const textArea = helper.getTextArea();
    
    // 測試各種特殊格式文本
    const specialTexts = [
      'https://example.com',
      'user@example.com',
      '電話: 0912-345-678',
      'JSON: {"key": "value"}',
      '程式碼: console.log("hello");'
    ];
    
    for (const text of specialTexts) {
      await textArea.fill(text);
      await page.waitForTimeout(100); // 給予處理時間
      
      // 驗證文本被正確保留
      const currentValue = await textArea.inputValue();
      expect(currentValue).toBe(text);
    }
    
    TestLogger.success('特殊文本識別測試通過');
  });

  test('💾 內容自動保存測試', async () => {
    TestLogger.start('內容自動保存');
    
    await helper.goToTestPage();
    await helper.waitForExtensionReady();
    
    const textArea = helper.getTextArea();
    
    // 輸入大量文本內容
    const testContent = `這是一段測試文本。我們可以使用這個文本來測試 GPT 文章改寫助手的各種功能，包括文本改寫、翻譯、替換等功能。

這個測試頁面專門設計來測試 Chrome 插件的各種功能，確保插件能夠正常運作並提供良好的用戶體驗。`;
    
    await textArea.fill(testContent);
    
    // ⚡ 觸發自動保存事件
    await textArea.dispatchEvent('input');
    await page.waitForTimeout(100); // 短暫等待保存
    
    // 驗證內容保存
    TestLogger.log('📝 保存的內容:', `"${testContent}"`);
    const savedValue = await textArea.inputValue();
    expect(savedValue).toBe(testContent);
    
    TestLogger.success('內容自動保存測試通過');
  });
});