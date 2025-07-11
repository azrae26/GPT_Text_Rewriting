// tests/global-setup.js - 全域測試設定
const { chromium } = require('@playwright/test');

async function globalSetup() {
  console.log('🚀 開始設定測試環境...');
  
  // 確保插件檔案存在
  const fs = require('fs');
  const path = require('path');
  
  const manifestPath = path.join(__dirname, '..', 'manifest.json');
  if (!fs.existsSync(manifestPath)) {
    throw new Error('找不到 manifest.json 檔案，請確認插件檔案完整');
  }
  
  console.log('✅ 插件檔案檢查完成');
  
  // 設定測試環境變數
  process.env.TEST_MODE = 'true';
  process.env.TEST_OPENAI_KEY = process.env.TEST_OPENAI_KEY || 'sk-test-key-for-testing';
  
  console.log('✅ 測試環境設定完成');
}

module.exports = globalSetup; 