// playwright.config.js - Chrome 插件測試配置
const { defineConfig, devices } = require('@playwright/test');

module.exports = defineConfig({
  // 測試檔案位置
  testDir: './tests',
  
  // 單個測試超時時間（30秒）
  timeout: 30000,
  
  expect: {
    timeout: 5000 // 減少期望等待時間
  },
  
  forbidOnly: !!process.env.CI,
  
  retries: process.env.CI ? 2 : 0, // 本地開發不重試
  
  workers: 1, // 順序執行避免資源競爭
  
  // 測試報告
  reporter: [
    ['list'], // 實時顯示進度
    ['html', { open: 'never' }]
  ],
  
  // 全域設定
  globalSetup: require.resolve('./tests/global-setup.js'),
  globalTeardown: require.resolve('./tests/global-teardown.js'),
  
  use: {
    // 必須使用有頭模式進行插件測試
    headless: false,
    
    // 使用 Chrome 瀏覽器
    channel: 'chrome',
    
    // 測試設定
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    trace: 'retain-on-failure',
    actionTimeout: 10000, // 減少動作等待時間
    navigationTimeout: 30000 // 減少導航等待時間
  },
  
  // 測試專案配置
  projects: [
    {
      name: 'chrome-extension-tests',
      use: { 
        ...devices['Desktop Chrome'],
        headless: false,
        viewport: { width: 1280, height: 720 },
        launchOptions: {
          args: [
            '--no-sandbox',
            '--disable-web-security'
          ]
        }
      }
    }
  ],
}); 