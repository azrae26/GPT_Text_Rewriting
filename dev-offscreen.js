// dev-offscreen.js - 開發用檔案監聽（Offscreen Document 內執行）
// 從 manifest.json 動態取得所有檔案清單，偵測任何變更就通知 service worker 重啟

async function getManifestFiles() {
  const res = await fetch(chrome.runtime.getURL('manifest.json') + '?_=' + Date.now(), { cache: 'no-cache' });
  const manifest = await res.json();
  const files = new Set(['manifest.json']);

  // background service worker
  if (manifest.background?.service_worker) files.add(manifest.background.service_worker);

  // popup
  if (manifest.action?.default_popup) files.add(manifest.action.default_popup);

  // content scripts
  for (const cs of manifest.content_scripts || []) {
    for (const f of [...(cs.js || []), ...(cs.css || [])]) files.add(f);
  }

  // web accessible resources
  for (const entry of manifest.web_accessible_resources || []) {
    for (const f of entry.resources || []) {
      if (!f.includes('*')) files.add(f);
    }
  }

  return [...files];
}

async function getHash(files) {
  const contents = await Promise.all(
    files.map(async file => {
      try {
        const res = await fetch(chrome.runtime.getURL(file) + '?_=' + Date.now(), { cache: 'no-cache' });
        return await res.text();
      } catch (e) {
        return '';
      }
    })
  );
  return contents.join('\n---\n');
}

(async () => {
  const files = await getManifestFiles();
  let lastHash = await getHash(files);

  setInterval(async () => {
    try {
      const currentHash = await getHash(files);
      if (currentHash !== lastHash) {
        lastHash = currentHash;
        chrome.runtime.sendMessage({ action: 'fileChanged' });
      }
    } catch (e) {}
  }, 5000);
})();
