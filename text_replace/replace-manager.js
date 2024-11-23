/** 文字替換管理整合模組 */
const ReplaceManager = {
  CONFIG: {
    STORAGE_KEY: 'replacePosition'
  },

  /** 初始化替換介面 */
  initializeReplaceUI() {
    console.log('開始初始化替換介面');
    if (!window.shouldEnableFeatures() || document.getElementById('text-replace-container')) {
      console.log('不符合初始化替換介面條件');
      return;
    }

    const textArea = document.querySelector('textarea[name="content"]');
    if (!textArea) {
      console.log('找不到文本區域');
      return;
    }

    // 創建容器
    const container = document.createElement('div');
    container.id = 'text-replace-container';
    container.className = 'replace-controls';

    // 載入儲存的位置
    chrome.storage.sync.get([this.CONFIG.STORAGE_KEY], (result) => {
      if (result[this.CONFIG.STORAGE_KEY]) {
        const { left, top } = result[this.CONFIG.STORAGE_KEY];
        container.style.left = `${left}px`;
        container.style.top = `${top}px`;
      }
    });

    // 添加拖動圖示
    const dragHandle = document.createElement('div');
    dragHandle.className = 'replace-drag-handle';
    container.appendChild(dragHandle);

    // 實現拖動功能
    this._initializeDragFeature(container, dragHandle);

    // 創建手動替換組
    window.ManualReplaceManager.initializeManualGroups(container, textArea);

    // 添加自動替換組
    window.AutoReplaceManager.initializeAutoReplaceGroups(container, textArea);

    // 插入到文本區域上方
    const parent = textArea.parentElement;
    parent.insertBefore(container, textArea);
    console.log('替換介面初始化完成');
  },

  /** 初始化拖動功能 */
  _initializeDragFeature(container, dragHandle) {
    let isDragging = false;
    let startX, startY, startLeft, startTop;

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
    const container = document.getElementById('text-replace-container');
    if (container) {
      container.remove();
      console.log('替換介面已移除');
    }
  }
};

window.ReplaceManager = ReplaceManager; 