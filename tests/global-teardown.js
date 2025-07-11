// tests/global-teardown.js - 全域測試清理
async function globalTeardown() {
  console.log('🧹 開始清理測試環境...');
  
  // 清理測試環境變數
  delete process.env.TEST_MODE;
  
  console.log('✅ 測試環境清理完成');
}

module.exports = globalTeardown; 