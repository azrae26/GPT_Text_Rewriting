// dev-server.js - 開發用熱重載伺服器
// 使用方式：node dev-server.js
// 監聽目前資料夾的檔案變更，插件每 10 秒 polling 一次，偵測到變更就自動重啟

const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 7777;
const WATCH_DIR = __dirname;
const IGNORE = ['node_modules', '.git', 'playwright-report', 'serena'];

let version = Date.now().toString();

function shouldIgnore(filePath) {
  return IGNORE.some(dir => filePath.includes(path.sep + dir + path.sep) || filePath.includes(path.sep + dir));
}

fs.watch(WATCH_DIR, { recursive: true }, (event, filename) => {
  if (!filename || shouldIgnore(filename)) return;
  version = Date.now().toString();
  console.log(`[dev-server] 檔案變更: ${filename} → version: ${version}`);
});

http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify({ version }));
}).listen(PORT, () => {
  console.log(`[dev-server] 監聽 http://localhost:${PORT}，等待檔案變更...`);
});
