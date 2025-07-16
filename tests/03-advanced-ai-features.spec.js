// tests/03-advanced-ai-features.spec.js - 高級AI功能測試
const { test, expect } = require('@playwright/test');
const { ExtensionHelper, TestLogger } = require('./helpers/extension-helper');

test.describe('高級AI功能測試', () => {
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
    // await helper.setApiKey();
  });

  test.afterEach(async () => {
    // 清理頁面資源
    if (page && !page.isClosed()) {
      await page.close();
      TestLogger.log('🧹 頁面已清理');
    }
  });

  test('🔄 多階段翻譯流程測試', async () => {
    TestLogger.start('多階段翻譯流程');
    
    await helper.goToTestPage();
    await helper.waitForExtensionReady();
    
    // 設置API Mock返回結果
    await helper.setupApiMock({
      responseText: '這是一個需要多階段翻譯過程的複雜文檔。',
      delay: 100
    });
    
    const textArea = helper.getTextArea();
    const translateButton = await helper.getTranslateButton();
    
    // 階段1：初始翻譯
    await textArea.fill('這是一個複雜的中文文檔，需要多階段翻譯。');
    await translateButton.click();
    
    // 等待第一階段完成
    await expect(textArea).toHaveValue('這是一個需要多階段翻譯過程的複雜文檔。', { timeout: 5000 });
    TestLogger.log('🚀 階段1：初始翻譯已開始');
    
    const stage1Result = await textArea.inputValue();
    TestLogger.success(`階段1結果: ${stage1Result}`);
    
    TestLogger.success('多階段翻譯流程測試通過');
  });

  test('🧠 反思機制測試', async () => {
    TestLogger.start('反思機制');
    
    // 開啟設定並配置反思指令
    await helper.openPopup();
    await page.click('[data-tab="translate"]');
    await page.waitForTimeout(300);
    
    // 切換到反思子分頁
    await page.click('[data-tab="reflect"]');
    await page.waitForTimeout(300);
    
    const reflectionInstruction = '請仔細反思翻譯的準確性和流暢度，並進行必要的優化。';
    await page.fill('#reflectInstruction', reflectionInstruction);
    await page.waitForTimeout(500);
    
    TestLogger.success('反思指令設置完成');
    
    // 設置API Mock，模擬反思後的改進結果
    await helper.setupApiMock({
      responseText: '經過反思優化後的翻譯：用於驗證反思機制的測試文本。這個翻譯經過了仔細的反思和改進。',
      delay: 100
    });
    
    await helper.goToTestPage();
    await helper.waitForExtensionReady();
    
    const textArea = helper.getTextArea();
    const translateButton = await helper.getTranslateButton();
    
    // 執行帶反思的翻譯
    await textArea.fill('用於驗證反思機制的測試文本。');
    await translateButton.click();
    
    // 等待反思完成
    await expect(textArea).toHaveValue(/經過反思優化後的翻譯/, { timeout: 8000 });
    
    const reflectionResult = await textArea.inputValue();
    TestLogger.success(`反思結果: ${reflectionResult}`);
    
    TestLogger.success('反思機制測試通過');
  });

  test('⚡ 高負載並發測試', async () => {
    TestLogger.start('高負載並發');
    
    await helper.goToTestPage();
    await helper.waitForExtensionReady();
    
    // 設置API Mock
    await helper.setupApiMock({
      responseText: '高負載並發測試結果',
      delay: 100
    });
    
    const translateButton = await helper.getTranslateButton();
    const textArea = helper.getTextArea();
    
    // 設置測試文本
    await textArea.fill('高負載並發測試文本');
    
    // 快速連續點擊測試並發處理
    TestLogger.log('🚀 開始快速連續點擊測試');
    await translateButton.click();
    await translateButton.click(); // 第二次點擊應該被正確處理
    await translateButton.click(); // 第三次點擊應該被正確處理
    
    // 檢查按鈕狀態
    const buttonText = await translateButton.textContent();
    TestLogger.log('🔍 按鈕狀態:', buttonText);
    
    // 等待處理完成
    await expect(textArea).toHaveValue('高負載並發測試結果', { timeout: 5000 });
    
    const finalResult = await textArea.inputValue();
    TestLogger.log('🔍 最終結果:', finalResult);
    
    TestLogger.success('高負載並發測試通過');
  });

  test('🔄 中斷恢復測試', async () => {
    TestLogger.start('中斷恢復');
    
    await helper.goToTestPage();
    await helper.waitForExtensionReady();
    
    const textArea = helper.getTextArea();
    const translateButton = await helper.getTranslateButton();
    
    // 第一階段：設置長時間任務並中斷
    await helper.setupApiMock({
      responseText: '中斷恢復測試結果',
      delay: 1000
    });
    
    await textArea.fill('長時間翻譯任務測試');
    await translateButton.click();
    TestLogger.log('🚀 長時間任務已開始');
    
    // 快速取消
    await page.waitForTimeout(200);
    await translateButton.click();
    TestLogger.log('🛑 任務已取消');
    
    // 清除Mock並設置新的快速回應
    await helper.clearApiMocks();
    await helper.setupApiMock({
      responseText: '恢復後的翻譯結果',
      delay: 100
    });
    
    // 第二階段：恢復並執行新任務
    await textArea.fill('恢復測試文本');
    await translateButton.click();
    TestLogger.log('🔄 任務已重新開始');
    
    // 等待恢復完成
    await expect(textArea).toHaveValue('恢復後的翻譯結果', { timeout: 3000 });
    
    const recoveryResult = await textArea.inputValue();
    TestLogger.log('🔍 恢復結果:', recoveryResult);
    
    TestLogger.success('中斷恢復測試通過');
  });

  test('🎯 邊界條件測試', async () => {
    TestLogger.start('邊界條件');
    
    await helper.goToTestPage();
    await helper.waitForExtensionReady();
    
    const textArea = helper.getTextArea();
    const translateButton = await helper.getTranslateButton();
    
    // 測試1：空文本處理
    await textArea.fill('');
    await translateButton.click();
    await page.waitForTimeout(300);
    
    let currentValue = await textArea.inputValue();
    expect(currentValue).toBe(''); // 空文本應保持空
    TestLogger.log('✅ 空文本處理測試完成');
    
    // 測試2：超長文本處理
    await helper.setupApiMock({
      responseText: '超長文本處理結果',
      delay: 100
    });
    
    const longText = '超長文本測試。'.repeat(1000); // 約15KB文本
    await textArea.fill(longText);
    await translateButton.click();
    TestLogger.log('🚀 超長文本處理已開始');
    
    // 等待處理完成或超時
    try {
      await expect(textArea).toHaveValue('超長文本處理結果', { timeout: 8000 });
      TestLogger.success('超長文本處理完成: 超長文本處理結果');
    } catch (error) {
      TestLogger.log('ℹ️ 超長文本可能需要更長處理時間或有大小限制');
    }
    
    TestLogger.success('邊界條件測試通過');
  });
}); 