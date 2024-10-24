// 這個腳本可以在您的開發環境中運行，用於更新本地版本信息
const fs = require('fs');

function updateLocalVersion() {
  const now = new Date().toISOString();
  const versionData = {
    version: "1.0.0", // 根據需要更新版本號
    lastUpdated: now
  };

  fs.writeFileSync('version.json', JSON.stringify(versionData, null, 2));
  console.log('本地版本已更新:', versionData);
}

updateLocalVersion();
