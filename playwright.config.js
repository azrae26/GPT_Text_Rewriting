// playwright.config.js - Chrome 插件測試配置
const { defineConfig, devices } = require('@playwright/test');

module.exports = defineConfig({
  // 測試檔案位置
  testDir: './tests',
  
  // 單個測試超時時間（25秒，稍微減少）
  timeout: 25000,
  
  expect: {
    timeout: 4000 // 減少期望等待時間
  },
  
  forbidOnly: !!process.env.CI,
  
  retries: process.env.CI ? 2 : 0, // 本地開發不重試
  
  workers: 4, // 增加到4個 worker，最大化並行性
  
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
    actionTimeout: 8000, // 減少動作等待時間
    navigationTimeout: 25000 // 減少導航等待時間
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
            // 基本安全和測試設定
            '--no-sandbox',
            '--disable-web-security',
            
            // 🚀 性能優化參數
            '--disable-background-timer-throttling',
            '--disable-backgrounding-occluded-windows',
            '--disable-features=VizDisplayCompositor',
            '--disable-software-rasterizer',
            '--disable-background-networking',
            '--disable-default-apps',
            '--disable-sync',
            '--disable-translate',
            '--disable-extensions-except=' + require('path').resolve(__dirname),
            '--load-extension=' + require('path').resolve(__dirname),
            
            // 🎯 減少資源使用
            '--max_old_space_size=4096',
            '--no-first-run',
            '--no-default-browser-check',
            '--disable-component-update',
            '--disable-background-downloads',
            '--disable-add-to-shelf',
            '--disable-client-side-phishing-detection',
            
            // 🏃‍♂️ 加速載入
            '--aggressive-cache-discard',
            '--disable-hang-monitor',
            '--disable-prompt-on-repost',
            '--disable-domain-reliability',
            '--disable-component-extensions-with-background-pages'
          ]
        }
      }
    }
  ],
}); 