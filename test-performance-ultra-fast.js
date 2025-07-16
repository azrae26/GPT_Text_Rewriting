// test-performance-ultra-fast.js - 極速性能測試
const { spawn } = require('child_process');

console.log('🚀 開始極速性能測試...');
console.log('📊 目標：從78秒降低到10秒以內（87%提升）');
console.log('🔧 優化內容：移除60+秒的 waitForTimeout，用智能等待替換');
console.log('');

const startTime = Date.now();

// 運行測試，只測試關鍵功能
const testProcess = spawn('npx', ['playwright', 'test', 'tests/01-critical-settings.spec.js', '--reporter=line'], {
  stdio: 'inherit',
  shell: true
});

testProcess.on('close', (code) => {
  const endTime = Date.now();
  const totalTime = (endTime - startTime) / 1000;
  
  console.log('\n📈 極速性能測試結果:');
  console.log(`⏱️  執行時間: ${totalTime.toFixed(2)} 秒`);
  console.log(`🎯 目標時間: 10 秒以內`);
  
  if (totalTime <= 10) {
    console.log('🎉 目標達成！測試時間已降低到10秒以內');
    console.log(`📊 性能提升: ${((78 - totalTime) / 78 * 100).toFixed(1)}%`);
  } else if (totalTime <= 20) {
    console.log('✅ 大幅改善！測試時間大幅減少');
    console.log(`📊 性能提升: ${((78 - totalTime) / 78 * 100).toFixed(1)}%`);
  } else {
    console.log('⚠️  仍需進一步優化');
  }
  
  console.log('\n🔍 優化前後對比:');
  console.log(`   原始時間: 78 秒`);
  console.log(`   優化後: ${totalTime.toFixed(2)} 秒`);
  console.log(`   節省時間: ${(78 - totalTime).toFixed(2)} 秒`);
  
  process.exit(code);
});

testProcess.on('error', (error) => {
  console.error('❌ 測試執行失敗:', error);
  process.exit(1);
}); 