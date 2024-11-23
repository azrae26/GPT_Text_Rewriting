/** 文字替換管理整合模組 */
const ReplaceManager = {
  CONFIG: {
    STORAGE_KEY: 'replacePosition'
  },

  /** 初始化替換介面 */
  initializeReplaceUI() {
    if (!window.shouldEnableFeatures() || document.getElementById('text-replace-container')) return;

    const textArea = document.querySelector('textarea[name="content"]');
    if (!textArea) return;

    // 創建主組容器（第一組）
    const mainContainer = document.createElement('div');
    mainContainer.id = 'text-replace-main';
    mainContainer.className = 'replace-controls-main';

    // 創建其他組容器（第二組和自動組）
    const otherContainer = document.createElement('div');
    otherContainer.id = 'text-replace-container';
    otherContainer.className = 'replace-controls';

    // 載入儲存的位置，如果沒有則使用預設位置
    chrome.storage.sync.get([this.CONFIG.STORAGE_KEY], (result) => {
      const position = result[this.CONFIG.STORAGE_KEY];
      otherContainer.style.cssText = position 
        ? `left: ${position.left}px; top: ${position.top}px;`
        : 'right: 20px; top: 20px;';
    });

    // 添加拖動圖示
    otherContainer.appendChild(document.createElement('div')).className = 'replace-drag-handle';

    // 初始化替換組
    window.ManualReplaceManager.initializeManualGroups(mainContainer, otherContainer, textArea);
    window.AutoReplaceManager.initializeAutoReplaceGroups(otherContainer, textArea);

    // 插入到頁面
    textArea.parentElement.insertBefore(mainContainer, textArea);
    document.body.appendChild(otherContainer);

    // 簡化的拖動功能
    this._initializeDragFeature(otherContainer);
  },

  /** 初始化拖動功能 */
  _initializeDragFeature(container) {
    let isDragging = false;
    let startX, startY, startLeft, startTop;

    // 找到拖動圖示元素
    const dragHandle = container.querySelector('.replace-drag-handle');

    // 只在拖動圖示上綁定事件
    dragHandle.addEventListener('mousedown', (e) => {
      isDragging = true;
      startX = e.clientX;
      startY = e.clientY;
      
      const computedStyle = window.getComputedStyle(container);
      startLeft = parseInt(computedStyle.left) || 0;
      startTop = parseInt(computedStyle.top) || 0;
      
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      
      e.preventDefault();
    });

    const handleMouseMove = (e) => {
      if (!isDragging) return;
      
      const deltaX = e.clientX - startX;
      const deltaY = e.clientY - startY;
      
      container.style.left = `${startLeft + deltaX}px`;
      container.style.top = `${startTop + deltaY}px`;
    };

    const handleMouseUp = () => {
      isDragging = false;
      const position = {
        left: parseInt(container.style.left),
        top: parseInt(container.style.top)
      };
      chrome.storage.sync.set({
        [this.CONFIG.STORAGE_KEY]: position
      });
      
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  },

  /** 移除替換介面 */
  removeReplaceUI() {
    console.log('移除替換介面');
    const mainContainer = document.getElementById('text-replace-main');
    const otherContainer = document.getElementById('text-replace-container');
    
    if (mainContainer) mainContainer.remove();
    if (otherContainer) otherContainer.remove();
    
    console.log('替換介面已移除');
  }
};

window.ReplaceManager = ReplaceManager; 