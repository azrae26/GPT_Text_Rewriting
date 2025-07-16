// test-performance.js - 性能測試腳本
const { exec } = require('child_process');
const { promisify } = require('util');

const execAsync = promisify(exec);

async function runPerformanceTest() {
  console.log('🚀 開始性能測試...\n');
  
  const startTime = Date.now();
  
  try {
    // 執行測試
    const { stdout, stderr } = await execAsync('npx playwright test', {
      env: { ...process.env, CI: undefined } // 確保本地模式
    });
    
    const endTime = Date.now();
    const duration = ((endTime - startTime) / 1000).toFixed(2);
    
    console.log('✅ 測試完成！');
    console.log(`⏱️ 總執行時間: ${duration} 秒`);
    
    // 分析結果
    const lines = stdout.split('\n');
    const passedTests = lines.filter(line => line.includes('passed')).length;
    const parallelInfo = lines.find(line => line.includes('workers')) || '';
    
    console.log(`📊 通過測試數量: ${passedTests}`);
    console.log(`🔄 並行資訊: ${parallelInfo}`);
    
    // 計算性能指標
    if (passedTests > 0) {
      const avgTimePerTest = (duration / passedTests).toFixed(2);
      console.log(`📈 平均每測試: ${avgTimePerTest} 秒`);
    }
    
    // 檢查是否有錯誤
    if (stderr) {
      console.log('\n⚠️ 錯誤訊息:');
      console.log(stderr);
    }
    
  } catch (error) {
    const endTime = Date.now();
    const duration = ((endTime - startTime) / 1000).toFixed(2);
    
    console.log(`❌ 測試失敗 (${duration} 秒)`);
    console.log('錯誤:', error.message);
  }
}

// 性能比較函數
async function comparePerformance() {
  console.log('📊 性能比較分析\n');
  
  console.log('🔍 修改前（共享模式）:');
  console.log('  - 4個 worker + 1個共享瀏覽器');
  console.log('  - 預期問題: 資源競爭、串行瓶頸');
  console.log('  - 實測結果: 5X 秒（比預期更慢）\n');
  
  console.log('🚀 修改後（獨立模式）:');
  console.log('  - 4個 worker + 4個獨立瀏覽器');
  console.log('  - 預期效果: 真正並行執行');
  console.log('  - 目標時間: X 秒（4倍速度提升）\n');
  
  await runPerformanceTest();
}

if (require.main === module) {
  comparePerformance().catch(console.error);
}

module.exports = { runPerformanceTest, comparePerformance }; 