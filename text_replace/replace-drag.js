/**
 * 替換功能拖移管理模組
 * 
 * 職責：
 * - 提供通用的拖移排序功能
 * - 管理拖移狀態和視覺反饋
 * - 處理拖移完成後的回調
 * - 支持多種拖移模式
 * 
 * 依賴：
 * - replace-core.js (ReplaceCore)
 * - replace-events.js (ReplaceEventSystem)
 */

const ReplaceDragManager = {
  /**
   * 當前拖移狀態
   */
  _dragState: {
    isDragging: false,
    dragElement: null,
    placeholder: null,
    startPosition: { x: 0, y: 0 },
    offset: { x: 0, y: 0 },
    container: null,
    config: null
  },

  /**
   * 設置拖移排序事件
   * @param {HTMLElement} dragHandle - 拖移把手元素
   * @param {Object} options - 配置選項
   * @param {string} options.groupSelector - 組選擇器
   * @param {HTMLElement} options.container - 容器元素
   * @param {boolean} options.lockHorizontal - 是否鎖定水平位置
   * @param {string} options.placeholderId - 佔位符ID
   * @param {Function} options.onComplete - 完成回調
   * @param {Function} options.onDragStart - 開始拖移回調
   * @param {Function} options.onDragEnd - 結束拖移回調
   */
  setupSortDragEvents(dragHandle, options = {}) {
    const {
      groupSelector = '.replace-extra-group',
      container = null,
      lockHorizontal = false,
      placeholderId = 'drag-placeholder',
      onComplete = null,
      onDragStart = null,
      onDragEnd = null
    } = options;

    if (!dragHandle) {
      ReplaceCore.Logger.error('拖移把手元素不存在', null, 'ReplaceDragManager');
      return;
    }

    // 確定容器
    const actualContainer = container || this._findContainer(dragHandle, groupSelector);
    if (!actualContainer) {
      ReplaceCore.Logger.error('無法找到拖移容器', null, 'ReplaceDragManager');
      return;
    }

    // 保存配置
    const config = {
      groupSelector,
      container: actualContainer,
      lockHorizontal,
      placeholderId,
      onComplete,
      onDragStart,
      onDragEnd
    };

    // 設置拖移事件
    this._setupDragEvents(dragHandle, config);
    
    ReplaceCore.Logger.info('設置拖移排序事件完成', 'ReplaceDragManager');
  },

  /**
   * 設置拖移事件監聽
   * @param {HTMLElement} dragHandle - 拖移把手
   * @param {Object} config - 配置對象
   */
  _setupDragEvents(dragHandle, config) {
    // 拖移開始
    dragHandle.addEventListener('mousedown', (e) => {
      this._handleMouseDown(e, dragHandle, config);
    });

    // 防止預設的拖放行為
    dragHandle.addEventListener('dragstart', (e) => {
      e.preventDefault();
    });

    // 設置樣式
    dragHandle.style.cursor = 'grab';
  },

  /**
   * 處理滑鼠按下事件
   * @param {MouseEvent} e - 滑鼠事件
   * @param {HTMLElement} dragHandle - 拖移把手
   * @param {Object} config - 配置對象
   */
  _handleMouseDown(e, dragHandle, config) {
    e.preventDefault();
    
    // 找到被拖移的組元素
    const dragElement = dragHandle.closest(config.groupSelector);
    if (!dragElement) {
      ReplaceCore.Logger.warn('無法找到拖移組元素', 'ReplaceDragManager');
      return;
    }

    // 初始化拖移狀態
    this._initDragState(e, dragElement, config);

    // 創建佔位符
    this._createPlaceholder(dragElement, config.placeholderId);

    // 設置拖移樣式
    this._applyDragStyles(dragElement);

    // 觸發開始回調
    if (config.onDragStart) {
      config.onDragStart(dragElement);
    }

    // 設置全局事件監聽
    this._setupGlobalEvents();

    ReplaceCore.Logger.info('開始拖移', 'ReplaceDragManager');
  },

  /**
   * 初始化拖移狀態
   * @param {MouseEvent} e - 滑鼠事件
   * @param {HTMLElement} dragElement - 拖移元素
   * @param {Object} config - 配置對象
   */
  _initDragState(e, dragElement, config) {
    const rect = dragElement.getBoundingClientRect();
    
    this._dragState = {
      isDragging: true,
      dragElement,
      placeholder: null,
      startPosition: { x: e.clientX, y: e.clientY },
      offset: {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top
      },
      container: config.container,
      config
    };
  },

  /**
   * 創建佔位符元素
   * @param {HTMLElement} dragElement - 拖移元素
   * @param {string} placeholderId - 佔位符ID
   */
  _createPlaceholder(dragElement, placeholderId) {
    const placeholder = document.createElement('div');
    placeholder.id = placeholderId;
    placeholder.className = 'drag-placeholder';
    placeholder.style.cssText = `
      height: ${dragElement.offsetHeight}px;
      border: 2px dashed #ccc;
      background-color: #f9f9f9;
      margin: ${getComputedStyle(dragElement).margin};
      opacity: 0.7;
    `;

    // 插入佔位符
    dragElement.parentNode.insertBefore(placeholder, dragElement);
    this._dragState.placeholder = placeholder;
  },

  /**
   * 應用拖移樣式
   * @param {HTMLElement} dragElement - 拖移元素
   */
  _applyDragStyles(dragElement) {
    dragElement.style.cssText += `
      position: fixed;
      z-index: 1000;
      pointer-events: none;
      opacity: 0.8;
      transform: rotate(2deg);
      box-shadow: 0 5px 15px rgba(0,0,0,0.3);
    `;
  },

  /**
   * 設置全局事件監聽
   */
  _setupGlobalEvents() {
    // 滑鼠移動
    document.addEventListener('mousemove', this._handleMouseMove);
    
    // 滑鼠釋放
    document.addEventListener('mouseup', this._handleMouseUp);
    
    // 防止文字選擇
    document.addEventListener('selectstart', this._preventSelect);
  },

  /**
   * 處理滑鼠移動事件
   * @param {MouseEvent} e - 滑鼠事件
   */
  _handleMouseMove: function(e) {
    if (!ReplaceDragManager._dragState.isDragging) return;

    const { dragElement, offset, config, container } = ReplaceDragManager._dragState;

    // 更新拖移元素位置
    const newX = config.lockHorizontal ? dragElement.getBoundingClientRect().left : e.clientX - offset.x;
    const newY = e.clientY - offset.y;
    
    dragElement.style.left = `${newX}px`;
    dragElement.style.top = `${newY}px`;

    // 查找插入位置
    ReplaceDragManager._updatePlaceholderPosition(e, container, config);
  },

  /**
   * 更新佔位符位置
   * @param {MouseEvent} e - 滑鼠事件
   * @param {HTMLElement} container - 容器元素
   * @param {Object} config - 配置對象
   */
  _updatePlaceholderPosition(e, container, config) {
    const { placeholder, dragElement } = this._dragState;
    
    // 獲取所有可拖移的組元素（排除當前拖移元素）
    const allGroups = Array.from(container.querySelectorAll(config.groupSelector))
      .filter(group => group !== dragElement);

    // 找到最接近的插入位置
    let targetElement = null;
    let insertBefore = true;
    let minDistance = Infinity;

    allGroups.forEach(group => {
      const rect = group.getBoundingClientRect();
      const centerY = rect.top + rect.height / 2;
      const distance = Math.abs(e.clientY - centerY);
      
      if (distance < minDistance) {
        minDistance = distance;
        targetElement = group;
        insertBefore = e.clientY < centerY;
      }
    });

    // 更新佔位符位置
    if (targetElement && placeholder && container.contains(placeholder)) {
      try {
        if (insertBefore) {
          container.insertBefore(placeholder, targetElement);
        } else {
          // 插入到目標元素之後
          const nextSibling = targetElement.nextSibling;
          if (nextSibling) {
            container.insertBefore(placeholder, nextSibling);
          } else {
            container.appendChild(placeholder);
          }
        }
      } catch (error) {
        ReplaceCore.Logger.error('更新佔位符位置失敗', error, 'ReplaceDragManager');
      }
    }
  },

  /**
   * 處理滑鼠釋放事件
   * @param {MouseEvent} e - 滑鼠事件
   */
  _handleMouseUp: function(e) {
    if (!ReplaceDragManager._dragState.isDragging) return;

    const { dragElement, placeholder, config, container } = ReplaceDragManager._dragState;

    // 移除全局事件監聽
    ReplaceDragManager._removeGlobalEvents();

    // 恢復拖移元素樣式
    ReplaceDragManager._restoreDragElement(dragElement);

    // 完成拖移操作
    if (placeholder && container.contains(placeholder)) {
      // 將拖移元素插入到佔位符位置
      container.insertBefore(dragElement, placeholder);
      
      // 移除佔位符
      placeholder.remove();
      
      // 觸發完成回調
      if (config.onComplete) {
        config.onComplete(container);
      }
      
      ReplaceCore.Logger.info('拖移排序完成', 'ReplaceDragManager');
    }

    // 觸發結束回調
    if (config.onDragEnd) {
      config.onDragEnd(dragElement);
    }

    // 重置拖移狀態
    ReplaceDragManager._resetDragState();
  },

  /**
   * 移除全局事件監聽
   */
  _removeGlobalEvents() {
    document.removeEventListener('mousemove', this._handleMouseMove);
    document.removeEventListener('mouseup', this._handleMouseUp);
    document.removeEventListener('selectstart', this._preventSelect);
  },

  /**
   * 恢復拖移元素樣式
   * @param {HTMLElement} dragElement - 拖移元素
   */
  _restoreDragElement(dragElement) {
    // 移除拖移樣式，恢復原始樣式
    dragElement.style.position = '';
    dragElement.style.zIndex = '';
    dragElement.style.left = '';
    dragElement.style.top = '';
    dragElement.style.pointerEvents = '';
    dragElement.style.opacity = '';
    dragElement.style.transform = '';
    dragElement.style.boxShadow = '';
  },

  /**
   * 重置拖移狀態
   */
  _resetDragState() {
    this._dragState = {
      isDragging: false,
      dragElement: null,
      placeholder: null,
      startPosition: { x: 0, y: 0 },
      offset: { x: 0, y: 0 },
      container: null,
      config: null
    };
  },

  /**
   * 防止文字選擇
   * @param {Event} e - 事件對象
   */
  _preventSelect: function(e) {
    if (ReplaceDragManager._dragState.isDragging) {
      e.preventDefault();
    }
  },

  /**
   * 查找容器元素
   * @param {HTMLElement} dragHandle - 拖移把手
   * @param {string} groupSelector - 組選擇器
   * @returns {HTMLElement|null} 容器元素
   */
  _findContainer(dragHandle, groupSelector) {
    const group = dragHandle.closest(groupSelector);
    return group ? group.parentElement : null;
  },

  /**
   * 批量設置拖移事件
   * @param {Array} handles - 把手元素數組
   * @param {Object} sharedConfig - 共享配置
   */
  batchSetupDragEvents(handles, sharedConfig) {
    handles.forEach(handle => {
      this.setupSortDragEvents(handle, sharedConfig);
    });
  },

  /**
   * 移除拖移事件
   * @param {HTMLElement} dragHandle - 拖移把手
   */
  removeDragEvents(dragHandle) {
    if (!dragHandle) return;

    // 移除事件監聽器（通過克隆節點）
    const newHandle = dragHandle.cloneNode(true);
    dragHandle.parentNode.replaceChild(newHandle, dragHandle);
    
    // 恢復樣式
    newHandle.style.cursor = '';
    
    ReplaceCore.Logger.info('移除拖移事件', 'ReplaceDragManager');
  },

  /**
   * 清理所有拖移相關資源
   */
  cleanup() {
    // 如果正在拖移，強制結束
    if (this._dragState.isDragging) {
      this._removeGlobalEvents();
      
      if (this._dragState.dragElement) {
        this._restoreDragElement(this._dragState.dragElement);
      }
      
      if (this._dragState.placeholder) {
        this._dragState.placeholder.remove();
      }
    }

    // 重置狀態
    this._resetDragState();
    
    ReplaceCore.Logger.info('清理拖移資源完成', 'ReplaceDragManager');
  },

  /**
   * 檢查是否正在拖移
   * @returns {boolean} 是否正在拖移
   */
  isDragging() {
    return this._dragState.isDragging;
  },

  /**
   * 獲取當前拖移元素
   * @returns {HTMLElement|null} 當前拖移元素
   */
  getCurrentDragElement() {
    return this._dragState.dragElement;
  },

  /**
   * 強制停止拖移
   */
  stopDragging() {
    if (this._dragState.isDragging) {
      // 模擬滑鼠釋放事件
      this._handleMouseUp(new MouseEvent('mouseup'));
    }
  }
};

// 暴露到全局
window.ReplaceDragManager = ReplaceDragManager; 