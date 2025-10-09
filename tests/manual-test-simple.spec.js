// manual-test-simple.spec.js - 簡化版手動測試
// 功能：使用最直接的方式加載插件進行手動測試
// 職責：確保插件正確加載並提供測試環境

const { chromium } = require('@playwright/test');
const path = require('path');

(async () => {
  console.log('🚀 正在啟動帶有插件的 Chrome 瀏覽器...');
  console.log('');
  
  // 插件路徑
  const extensionPath = path.resolve(__dirname, '..');
  console.log('📁 插件路徑:', extensionPath);
  console.log('');
  
  // 啟動瀏覽器並加載插件
  const context = await chromium.launchPersistentContext('', {
    headless: false,
    args: [
      `--disable-extensions-except=${extensionPath}`,
      `--load-extension=${extensionPath}`,
      '--no-sandbox'
    ]
  });
  
  console.log('✅ 瀏覽器已啟動');
  console.log('');
  
  // 創建新頁面
  const page = context.pages()[0] || await context.newPage();
  
  // 步驟 1: 檢查擴展頁面
  console.log('🔍 步驟 1: 打開擴展頁面驗證...');
  const extensionsPage = await context.newPage();
  await extensionsPage.goto('chrome://extensions');
  await extensionsPage.waitForTimeout(2000);
  
  // 截圖
  await extensionsPage.screenshot({ path: 'test-results/extensions-check.png' });
  console.log('📸 擴展頁面截圖已保存: test-results/extensions-check.png');
  console.log('');
  
  // 檢查插件是否載入
  const pageContent = await extensionsPage.content();
  const hasExtension = pageContent.includes('AI 文章改寫助手') || 
                       pageContent.includes('GPT') ||
                       pageContent.includes('改寫');
  
  if (hasExtension) {
    console.log('✅ 確認：插件已成功載入！');
  } else {
    console.log('❌ 警告：無法找到插件');
    console.log('📋 請查看截圖或手動檢查 chrome://extensions 頁面');
  }
  console.log('');
  
  // 步驟 2: 導航到 UAnalyze 測試頁面
  console.log('🔍 步驟 2: 導航到 UAnalyze 研究報告頁面...');
  await page.goto('https://data.uanalyze.twobitto.com/research-reports/create');
  await page.waitForTimeout(2000);
  console.log('✅ 已導航到:', page.url());
  console.log('');
  
  // 檢查是否需要登入
  const currentUrl = page.url();
  if (currentUrl.includes('login') || currentUrl.includes('signin')) {
    console.log('🔐 檢測到需要登入，正在嘗試自動登入...');
    
    try {
      // 嘗試填寫登入表單
      await page.fill('input[type="email"], input[name="email"], input[id*="email"]', 'azrae24@uanalyze.com.tw');
      await page.fill('input[type="password"], input[name="password"], input[id*="password"]', 'Uanalyze27473447');
      
      // 點擊登入按鈕
      await page.click('button[type="submit"], input[type="submit"], button:has-text("登入"), button:has-text("Login")');
      
      console.log('⏳ 等待登入完成...');
      await page.waitForTimeout(3000);
      
      console.log('✅ 登入完成！');
      console.log('📍 當前頁面:', page.url());
    } catch (error) {
      console.log('⚠️  自動登入失敗，請手動登入');
      console.log('   帳號: azrae24@uanalyze.com.tw');
      console.log('   密碼: Uanalyze27473447');
    }
  }
  console.log('');
  
  // 檢查 Content Script
  const hasContentScript = await page.evaluate(() => {
    return typeof window.textProcessor !== 'undefined' || 
           typeof window.settingsInstance !== 'undefined';
  });
  
  if (hasContentScript) {
    console.log('✅ 確認：Content Script 已注入到頁面！');
  } else {
    console.log('⚠️  警告：Content Script 未注入');
    console.log('   插件可能未正確加載，某些功能可能無法使用');
  }
  console.log('');
  
  // 截圖當前頁面
  await page.screenshot({ path: 'test-results/uanalyze-page.png' });
  console.log('📸 當前頁面截圖已保存: test-results/uanalyze-page.png');
  console.log('');
  
  // 提示信息
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🎯 UAnalyze 測試環境已就緒！');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('');
  console.log('📋 在 UAnalyze 頁面測試插件功能：');
  console.log('   1. 選取頁面上的文字');
  console.log('   2. 右鍵查看改寫選單是否出現');
  console.log('   3. 點擊瀏覽器右上角的插件圖示測試設定');
  console.log('   4. 測試文字高亮、翻譯等功能');
  console.log('');
  console.log('⏰ 測試環境將保持開啟 10 分鐘');
  console.log('💡 按 Ctrl+C 可提前結束');
  console.log('');
  
  // 保持開啟
  await page.waitForTimeout(600000); // 10分鐘
  
  console.log('🧹 關閉瀏覽器...');
  await context.close();
  console.log('✅ 測試結束');
})();

