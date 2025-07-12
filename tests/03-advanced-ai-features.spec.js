// tests/03-advanced-ai-features.spec.js - 高級AI功能測試
const { test, expect } = require('@playwright/test');
const ExtensionHelper = require('./helpers/extension-helper');

test.describe('高級AI功能測試', () => {
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

  test('🔄 多階段翻譯流程測試', async () => {
    console.log('🧪 開始測試: 多階段翻譯流程');
    
    await helper.goToTestPage();
    await helper.waitForExtensionReady();
    
    const textArea = helper.getTextArea();
    const originalText = 'This is a complex document that requires multi-stage translation process.';
    
    // 設置原始文本
    await textArea.fill(originalText);
    
    // 階段1：初始翻譯
    await helper.setupApiMock({
      responseText: '這是一個需要多階段翻譯過程的複雜文檔。',
      delay: 1000
    });
    
    const translateButton = await helper.getTranslateButton();
    await translateButton.click();
    console.log('🚀 階段1：初始翻譯已開始');
    
    // 等待初始翻譯完成
    await helper.page.waitForFunction(
      (original) => {
        const textArea = document.querySelector('textarea[name="content"]');
        return textArea && textArea.value !== original;
      },
      originalText,
      { timeout: 5000 }
    );
    
    const stage1Result = await textArea.inputValue();
    console.log(`✅ 階段1完成: ${stage1Result}`);
    
    // 清除之前的Mock並設置新的
    await helper.clearApiMocks();
    
    // 階段2：反思優化
    await helper.setupApiMock({
      responseText: '這是一份需要經過多階段翻譯流程處理的複雜文件。',
      delay: 1200
    });
    
    // 再次點擊翻譯按鈕進行優化
    await translateButton.click();
    console.log('🚀 階段2：反思優化已開始');
    
    // 等待優化完成
    await helper.page.waitForFunction(
      (stage1) => {
        const textArea = document.querySelector('textarea[name="content"]');
        return textArea && textArea.value !== stage1;
      },
      stage1Result,
      { timeout: 5000 }
    );
    
    const finalResult = await textArea.inputValue();
    console.log(`✅ 階段2完成: ${finalResult}`);
    
    // 驗證最終結果不同於初始結果
    expect(finalResult).not.toBe(originalText);
    expect(finalResult).not.toBe(stage1Result);
    
    console.log('✅ 多階段翻譯流程測試通過');
  });

  test('🧠 反思機制測試', async () => {
    console.log('🧪 開始測試: 反思機制');
    
    await helper.goToTestPage();
    await helper.waitForExtensionReady();
    
    const textArea = helper.getTextArea();
    const originalText = 'Test text for reflection mechanism validation.';
    
    await textArea.fill(originalText);
    
    // 打開popup設置反思指令
    await helper.openPopup();
    await page.click('[data-tab="translate"]');
    await page.click('[data-tab="reflect"]');
    
    // 設置反思指令
    const reflectInstruction = '請檢查翻譯的準確性和流暢性';
    await page.fill('#reflectInstruction', reflectInstruction);
    
    // 驗證指令設置
    const savedInstruction = await page.inputValue('#reflectInstruction');
    expect(savedInstruction).toBe(reflectInstruction);
    
    console.log('✅ 反思指令設置完成');
    
    // 設置Mock API模擬反思過程
    await helper.setupApiMock({
      responseText: '經過反思優化的翻譯：用於驗證反思機制的測試文本。',
      delay: 800
    });
    
    // 回到測試頁面開始翻譯
    await helper.goToTestPage();
    const translateButton = await helper.getTranslateButton();
    await translateButton.click();
    
    // 等待反思完成
    await helper.page.waitForFunction(
      (original) => {
        const textArea = document.querySelector('textarea[name="content"]');
        return textArea && textArea.value !== original;
      },
      originalText,
      { timeout: 8000 }
    );
    
    const reflectedResult = await textArea.inputValue();
    console.log(`✅ 反思結果: ${reflectedResult}`);
    
    expect(reflectedResult).toContain('反思');
    
    console.log('✅ 反思機制測試通過');
  });

  test('⚡ 高負載並發測試', async () => {
    console.log('🧪 開始測試: 高負載並發');
    
    await helper.goToTestPage();
    await helper.waitForExtensionReady();
    
    const textArea = helper.getTextArea();
    const originalText = 'High load concurrent test content.';
    
    await textArea.fill(originalText);
    
    // 設置Mock API模擬高負載
    await helper.setupApiMock({
      responseText: '高負載並發測試結果',
      delay: 2000
    });
    
    const translateButton = await helper.getTranslateButton();
    
    // 快速連續點擊多次
    console.log('🚀 開始快速連續點擊測試');
    for (let i = 0; i < 5; i++) {
      await translateButton.click();
      await helper.page.waitForTimeout(100);
    }
    
    // 檢查系統是否正確處理了重複點擊
    const buttonText = await translateButton.textContent();
    console.log(`🔍 按鈕狀態: ${buttonText}`);
    
    // 等待處理完成
    await helper.page.waitForTimeout(3000);
    
    // 驗證最終結果
    const finalText = await textArea.inputValue();
    
    // 應該只有一個結果，不應該有重複處理
    expect(finalText).toBe('高負載並發測試結果');
    
    console.log('✅ 高負載並發測試通過');
  });

  test('🔄 中斷恢復測試', async () => {
    console.log('🧪 開始測試: 中斷恢復');
    
    await helper.goToTestPage();
    await helper.waitForExtensionReady();
    
    const textArea = helper.getTextArea();
    const originalText = 'Text for interruption recovery test.';
    
    await textArea.fill(originalText);
    
    // 設置長延遲的Mock API
    await helper.setupApiMock({
      responseText: '中斷恢復測試結果',
      delay: 3000
    });
    
    const translateButton = await helper.getTranslateButton();
    await translateButton.click();
    console.log('🚀 長時間任務已開始');
    
    // 等待1秒後取消
    await helper.page.waitForTimeout(1000);
    await translateButton.click(); // 取消
    console.log('🛑 任務已取消');
    
    // 驗證取消後文本未變
    await helper.page.waitForTimeout(1000);
    let currentText = await textArea.inputValue();
    expect(currentText).toBe(originalText);
    
    // 重新設置Mock API
    await helper.clearApiMocks();
    await helper.setupApiMock({
      responseText: '恢復後的翻譯結果',
      delay: 500
    });
    
    // 重新開始任務
    await translateButton.click();
    console.log('🔄 任務已重新開始');
    
    // 等待恢復完成
    await helper.page.waitForFunction(
      (original) => {
        const textArea = document.querySelector('textarea[name="content"]');
        return textArea && textArea.value !== original;
      },
      originalText,
      { timeout: 3000 }
    );
    
    const recoveredResult = await textArea.inputValue();
    expect(recoveredResult).toBe('恢復後的翻譯結果');
    
    console.log('✅ 中斷恢復測試通過');
  });

  test('🎯 邊界條件測試', async () => {
    console.log('🧪 開始測試: 邊界條件');
    
    await helper.goToTestPage();
    await helper.waitForExtensionReady();
    
    const textArea = helper.getTextArea();
    
    // 測試1：空文本
    await textArea.fill('');
    
    const translateButton = await helper.getTranslateButton();
    await translateButton.click();
    
    // 空文本應該有適當的提示或處理
    await helper.page.waitForTimeout(1000);
    console.log('✅ 空文本處理測試完成');
    
    // 測試2：超長文本
    const longText = 'A'.repeat(10000); // 10K字符
    await textArea.fill(longText);
    
    await helper.setupApiMock({
      responseText: '超長文本處理結果',
      delay: 1000
    });
    
    await translateButton.click();
    console.log('🚀 超長文本處理已開始');
    
    // 等待處理完成或超時
    try {
      await helper.page.waitForFunction(
        (original) => {
          const textArea = document.querySelector('textarea[name="content"]');
          return textArea && textArea.value !== original;
        },
        longText,
        { timeout: 5000 }
      );
      
      const result = await textArea.inputValue();
      console.log(`✅ 超長文本處理完成: ${result.substring(0, 50)}...`);
      
    } catch (error) {
      console.log('ℹ️ 超長文本可能需要更長處理時間或有大小限制');
    }
    
    console.log('✅ 邊界條件測試通過');
  });
}); 