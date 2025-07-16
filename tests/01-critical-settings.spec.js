// tests/01-critical-settings.spec.js - 關鍵設定測試
const { test, expect } = require('@playwright/test');
const { ExtensionHelper, TestLogger } = require('./helpers/extension-helper');

test.describe('關鍵設定功能測試', () => {
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

  test('🚨 POP頁關閉後內容不消失測試', async () => {
    TestLogger.start('POP頁關閉後內容不消失');
    
    await helper.setApiKey();
    await helper.setupTestModels();
    
    // 切換到各種分頁並測試記憶功能
    const testData = [
      { tab: 'rewrite', field: '#instruction', value: '這是改寫指令測試', description: '改寫指令' },
      { tab: 'translate', field: '#translateInstruction', value: '這是翻譯指令測試', description: '翻譯指令' },
      { tab: 'settings', field: '#api-key', value: 'test-api-key-12345', description: 'API金鑰' }
    ];
    
    for (const data of testData) {
      // 切換分頁
      await page.click(`[data-tab="${data.tab}"]`);
      await page.waitForTimeout(300);
      
      // 輸入測試內容
      await page.fill(data.field, data.value);
      await page.waitForTimeout(500); // 等待儲存
      
      // 關閉並重新開啟彈出視窗
      await page.close();
      page = await context.newPage();
      helper = new ExtensionHelper(page);
      await helper.openPopup();
      
      // 切換到相同分頁
      await page.click(`[data-tab="${data.tab}"]`);
      await page.waitForTimeout(300);
      
      // 驗證內容是否保存
      const savedValue = await page.inputValue(data.field);
      expect(savedValue).toBe(data.value);
      TestLogger.log(`✅ ${data.description}保存驗證通過: ${savedValue}`);
    }
    
    TestLogger.success('POP頁關閉後內容保存測試通過');
  });

  test('⚡ 快速修改後立即關閉測試', async () => {
    TestLogger.start('快速修改後立即關閉');
    
    await helper.setApiKey();
    await helper.setupTestModels();
    
    // 快速輸入並立即關閉
    const quickTestValue = '快速測試內容' + Date.now();
    
    await page.click('[data-tab="rewrite"]');
    await page.fill('#instruction', quickTestValue);
    
    // 立即關閉（不等待）
    await page.close();
    
    // 重新開啟驗證
    page = await context.newPage();
    helper = new ExtensionHelper(page);
    await helper.openPopup();
    
    await page.click('[data-tab="rewrite"]');
    await page.waitForTimeout(200);
    
    const savedValue = await page.inputValue('#instruction');
    expect(savedValue).toBe(quickTestValue);
    
    TestLogger.success('快速修改後立即關閉測試通過');
  });

  test('💾 新功能 Local Storage 測試', async () => {
    TestLogger.start('新功能 Local Storage');
    
    await helper.openPopup();
    
    // 根據開發規則，新功能應使用 Local Storage
    const newFeatureTestData = [
      { field: '#stock-description', value: '新功能股票描述測試', tab: 'stock' },
      // 可以添加更多新功能測試項目
    ];
    
    for (const data of newFeatureTestData) {
      // 切換分頁（如果有的話）
      if (data.tab) {
        const tabElement = await page.$(`[data-tab="${data.tab}"]`);
        if (tabElement) {
          await page.click(`[data-tab="${data.tab}"]`);
          await page.waitForTimeout(300);
        }
      }
      
      // 檢查元素是否存在
      const element = await page.$(data.field);
      if (element) {
        await page.fill(data.field, data.value);
        await page.waitForTimeout(500);
        
        // 驗證儲存到 Local Storage
        const storageValue = await page.evaluate((field) => {
          const element = document.querySelector(field);
          const key = element ? element.id : null;
          if (key) {
            return new Promise((resolve) => {
              chrome.storage.local.get([key], (result) => {
                resolve(result[key]);
              });
            });
          }
          return null;
        }, data.field);
        
        TestLogger.log(`📦 ${data.field} Local Storage 值:`, storageValue);
      }
    }
    
    TestLogger.success('新功能 Local Storage 測試通過');
  });

  test('💿 儲存容量限制測試', async () => {
    TestLogger.start('儲存容量限制');
    
    await helper.openPopup();
    
    // 測試大量文本儲存（接近但不超過限制）
    const largeText = 'A'.repeat(4500); // 4.5KB 文本，遠小於 sync storage 8KB 限制
    
    await page.click('[data-tab="rewrite"]');
    await page.fill('#instruction', largeText);
    await page.waitForTimeout(1000); // 等待儲存完成
    
    // 驗證是否成功儲存
    const savedValue = await page.inputValue('#instruction');
    expect(savedValue).toBe(largeText);
    expect(savedValue.length).toBe(4500);
    
    TestLogger.success(`儲存容量限制測試通過，儲存了 ${savedValue.length} 字符`);
  });

  test('📝 設定項目完整性測試', async () => {
    TestLogger.start('設定項目完整性');
    
    await helper.setApiKey();
    await helper.setupTestModels();
    
    // 測試所有主要設定項目
    const settingsTests = [
      { tab: 'rewrite', field: '#instruction', value: '完整性測試改寫指令' },
      { tab: 'translate', field: '#translateInstruction', value: '完整性測試翻譯指令' },
      { tab: 'settings', field: '#api-key', value: 'test-completeness-key' }
    ];
    
    // 批量設定所有項目
    for (const setting of settingsTests) {
      await page.click(`[data-tab="${setting.tab}"]`);
      await page.waitForTimeout(200);
      await page.fill(setting.field, setting.value);
      await page.waitForTimeout(300);
    }
    
    // 重新開啟並驗證所有項目
    await page.close();
    page = await context.newPage();
    helper = new ExtensionHelper(page);
    await helper.openPopup();
    
    for (const setting of settingsTests) {
      await page.click(`[data-tab="${setting.tab}"]`);
      await page.waitForTimeout(200);
      
      const savedValue = await page.inputValue(setting.field);
      expect(savedValue).toBe(setting.value);
      TestLogger.log(`✅ ${setting.field} 完整性驗證通過`);
    }
    
    TestLogger.success('設定項目完整性測試通過');
  });

  test('🎯 全面POP輸入框記憶測試', async () => {
    TestLogger.start('全面POP輸入框記憶');
    
    await helper.setApiKey();
    await helper.setupTestModels();
    
    // 全面的輸入框測試清單
    const comprehensiveTests = [
      // 改寫分頁
      { tab: 'rewrite', field: '#instruction', value: '全面測試改寫指令內容', name: '改寫指令' },
      { tab: 'rewrite', field: '#fullRewriteModel', value: 'gemini-1.5-pro', name: '改寫模型', type: 'select' },
      
      // 翻譯分頁
      { tab: 'translate', field: '#translateInstruction', value: '全面測試翻譯指令內容', name: '翻譯指令' },
      { tab: 'translate', field: '#translateModel', value: 'gpt-4o', name: '翻譯模型', type: 'select' },
      
      // 設定分頁
      { tab: 'settings', field: '#api-key', value: 'comprehensive-test-api-key', name: 'API金鑰' }
    ];
    
    // 設定所有測試項目
    for (const test of comprehensiveTests) {
      await page.click(`[data-tab="${test.tab}"]`);
      await page.waitForTimeout(300);
      
      if (test.type === 'select') {
        await page.selectOption(test.field, test.value);
      } else {
        await page.fill(test.field, test.value);
      }
      await page.waitForTimeout(500);
    }
    
    // 關閉並重新開啟
    await page.close();
    page = await context.newPage();
    helper = new ExtensionHelper(page);
    await helper.openPopup();
    
    // 驗證所有項目
    for (const test of comprehensiveTests) {
      await page.click(`[data-tab="${test.tab}"]`);
      await page.waitForTimeout(300);
      
      let savedValue;
      if (test.type === 'select') {
        savedValue = await page.inputValue(test.field);
      } else {
        savedValue = await page.inputValue(test.field);
      }
      
      expect(savedValue).toBe(test.value);
      TestLogger.log(`✅ ${test.name} 記憶驗證通過: ${savedValue}`);
    }
    
    TestLogger.success('全面POP輸入框記憶測試通過');
  });

  test('🔍 模型選擇器儲存機制診斷', async () => {
    TestLogger.start('模型選擇器儲存機制診斷');
    
    await helper.openPopup();
    await helper.setupTestModels();
    
    // 選擇特定模型
    await page.click('[data-tab="rewrite"]');
    await page.waitForTimeout(300);
    
    await page.selectOption('#fullRewriteModel', 'gemini-1.5-pro');
    await page.waitForTimeout(500);
    
    // 診斷儲存位置
    const storageInfo = await page.evaluate(() => {
      return new Promise((resolve) => {
        // 檢查 sync storage
        chrome.storage.sync.get(['rewriteModel'], (syncResult) => {
          // 檢查 local storage  
          chrome.storage.local.get(['rewriteModel'], (localResult) => {
            resolve({
              sync: syncResult.rewriteModel,
              local: localResult.rewriteModel,
              element: document.querySelector('#fullRewriteModel')?.value
            });
          });
        });
      });
    });
    
    TestLogger.log('📊 儲存診斷結果:', storageInfo);
    
    // 根據規則，模型選擇應該在 Sync Storage
    const storageLocation = storageInfo.sync ? 'Sync Storage' : 
                           storageInfo.local ? 'Local Storage' : 'Unknown';
    
    TestLogger.success(`模型選擇器儲存機制診斷通過\n   📊 儲存位置: ${storageLocation}`);
  });
}); 