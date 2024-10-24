const REMOTE_BASE_URL = 'https://azrae26.github.io/GPT_Text_Rewriting';
const LOCAL_SCRIPT_PATH = 'file:///path/to/your/local/content.js';

async function loadScript() {
  try {
    // 首先嘗試加載本地文件
    const localResponse = await fetch(LOCAL_SCRIPT_PATH);
    if (localResponse.ok) {
      const scriptContent = await localResponse.text();
      executeScript(scriptContent);
      console.log('已加載本地腳本');
      return;
    }
  } catch (error) {
    console.log('無法加載本地腳本，嘗試遠端加載');
  }

  // 如果本地加載失敗，則嘗試遠端加載
  try {
    const remoteResponse = await fetch(`${REMOTE_BASE_URL}/content.js`);
    const scriptContent = await remoteResponse.text();
    executeScript(scriptContent);
    console.log('已加載遠端腳本');
  } catch (error) {
    console.error('加載腳本時發生錯誤:', error);
  }
}

function executeScript(content) {
  const script = document.createElement('script');
  script.textContent = content;
  document.head.appendChild(script);
}

loadScript();
