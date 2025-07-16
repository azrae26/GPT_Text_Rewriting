// playwright.config.js - Chrome 插件測試配置
const { defineConfig, devices } = require('@playwright/test');

module.exports = defineConfig({
  // 測試檔案位置
  testDir: './tests',
  
  // 🚀 優化超時設定（進一步縮短）
  timeout: 20000, // 減少到20秒
  
  expect: {
    timeout: 2000 // 減少期望等待時間到2秒
  },
  
  forbidOnly: !!process.env.CI,
  
  retries: process.env.CI ? 2 : 0, // 本地開發不重試
  
  workers: 3, // 🏃‍♂️ 回滾到3個 worker，6個會造成資源競爭
  
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
    actionTimeout: 4000, // 減少動作等待時間到4秒
    navigationTimeout: 15000 // 減少導航等待時間到15秒
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
            
            // 🚀 真正並行優化參數（與 ExtensionHelper 同步）
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
            '--max_old_space_size=2048', // 降低記憶體限制
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
            '--disable-component-extensions-with-background-pages',
            '--memory-pressure-off',
            
            // ⚡ 進一步加速參數
            '--disable-features=TranslateUI',
            '--disable-ipc-flooding-protection',
            '--disable-dev-shm-usage',
            '--disable-renderer-backgrounding'
          ]
        }
      }
    }
  ],
}); 