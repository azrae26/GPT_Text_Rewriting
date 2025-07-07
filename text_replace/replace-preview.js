/**
 * 替換預覽功能模組
 * 
 * 功能：
 * 1. 預覽高亮管理 - 多組預覽高亮的顯示和隱藏
 * 2. 虛擬滾動預覽 - 優化大量高亮元素的渲染性能
 * 3. 位置數據緩存 - 獨立的位置數據管理和快取
 * 4. 滾動性能優化 - 輕量級滾動更新機制
 * 5. 容器生命週期管理 - 預覽容器的創建、更新、清理
 * 
 * 職責：
 * - 提供統一的預覽API
 * - 管理多組高亮的可見性
 * - 協調虛擬滾動和預覽渲染
 * - 處理緩存同步和清理
 * 
 * 依賴：
 * - highlight-virtual-scroll.js (SharedVirtualScroll)
 * - text_highlight/highlight-core.js (核心配置)
 * - text_highlight/highlight-position.js (PositionCalculator)
 * - text_highlight/highlight-render.js (Renderer)
 * - text_highlight/highlight-virtual-scroll.js (虛擬滾動和向後兼容)
 * - regex_helper/regex-helper.js (正則表達式處理)
 */

window.ReplacePreview = {

  /**
   * 配置常數
   */
  CONFIG: {
    CONTAINER_ID: 'replace-preview-container',
    MAX_PREVIEWS: 1000, // 最大預覽數量
    PREVIEW_COLORS: [
      '#FF0000', // 紅色
      '#FF8C00', // 橙色
      '#0095FF', // 藍色
      '#AB00FF', // 紫色
      '#00AF06', // 綠色
      '#9932CC', // 紫色
    ],
    BUFFER_SIZE: 200, // 滾動緩衝區大小
    DEBOUNCE_DELAY: 16, // 防抖延遲（約60fps）
    UPDATE_TIMEOUT: 100 // 容器更新延遲
  },

  /**
   * 動態時間格式化函數
   */
  _getTimeStamp() {
    const now = new Date();
    const hours = now.getHours().toString().padStart(2, '0');
    const minutes = now.getMinutes().toString().padStart(2, '0');
    const seconds = now.getSeconds().toString().padStart(2, '0');
    return `${hours}:${minutes}:${seconds}`;
  },

  /**
   * 預覽管理器 - 核心預覽功能
   */
  PreviewManager: {
    container: null,
    groupHighlights: new Map(), // 存儲每個組的高亮元素 Map<groupIndex, Map<key, element>>
    cachedGroupPositions: new Map(), // 獨立位置緩存 Map<groupIndex, positions[]>
    observer: null, // IntersectionObserver 實例
    _updateTimer: null, // 防抖計時器
    _refreshInProgress: false, // 刷新進行中標記

    /**
     * 初始化預覽管理器
     * @param {HTMLTextAreaElement} textArea 文本區域
     */
    initialize(textArea) {
      if (!textArea) {
        console.error(`[ReplacePreview][${ReplacePreview._getTimeStamp()}] ❌ 初始化失敗：找不到文本區域`);
        return;
      }
      
      this.container = document.createElement('div');
      this.container.id = ReplacePreview.CONFIG.CONTAINER_ID;
      
      // 使用 TextHighlight 的樣式計算方法
      const styles = window.TextHighlight.PositionCalculator.getTextAreaStyles(textArea);
      
      // 模仿 TextHighlight 的內層容器設置，位置計算方法已經處理了所有偏移
      // 需要與 TextHighlight 外層容器設置相同的基準偏移
      this.container.style.cssText = `
        position: absolute;
        top: ${window.TextHighlight.CONFIG.FIXED_OFFSET.TOP + 0}px;
        left: 0;
        width: ${textArea.offsetWidth}px;
        height: ${textArea.offsetHeight}px;
        pointer-events: none;
        z-index: 1001;
        overflow: hidden;
        font-family: ${styles.fontFamily};
        font-size: ${styles.fontSize}px;
        font-weight: ${styles.fontWeight};
        line-height: ${styles.lineHeight}px;
        letter-spacing: ${styles.letterSpacing};
        word-spacing: ${styles.wordSpacing};
      `;
      
      textArea.parentElement.appendChild(this.container);
      
      // 使用 TextHighlight 的滾動處理器 - 滾動時使用輕量級更新
      window.TextHighlight.ScrollHelper.bindScrollEvent(
        textArea,
        () => this._updateScrollVisibility(textArea)
      );
      
      this._setupResizeObserver(textArea);
      
      console.log(`[ReplacePreview][${ReplacePreview._getTimeStamp()}] ✅ 預覽管理器初始化完成`);
    },

    /**
     * 設置容器尺寸變化觀察器
     * @param {HTMLTextAreaElement} textArea 文本區域
     * @private
     */
    _setupResizeObserver(textArea) {
      let resizeTimeout;

      const updateAfterResize = () => {
        if (!textArea || !this.container) {
          console.error(`[ReplacePreview][${ReplacePreview._getTimeStamp()}] ❌ 找不到必要元素`);
          return;
        }
        
        // 獲取新的尺寸
        const offsetWidth = textArea.offsetWidth;
        const offsetHeight = textArea.offsetHeight;
        
        // 更新容器尺寸
        this.container.style.width = `${offsetWidth}px`;
        this.container.style.height = `${offsetHeight}px`;
        
        // 清除所有現有的高亮
        this.clearAllHighlights();
        
        // 強制更新所有預覽
        requestAnimationFrame(() => {
          if (ReplacePreview.onUpdate) {
            ReplacePreview.onUpdate();
          }
        });
      };

      const resizeObserver = new ResizeObserver(() => {
        // 清除之前的延遲執行
        if (resizeTimeout) {
          clearTimeout(resizeTimeout);
        }
        
        // 延遲執行更新，避免過於頻繁的更新
        resizeTimeout = setTimeout(() => {
          updateAfterResize();
        }, ReplacePreview.CONFIG.UPDATE_TIMEOUT);
      });
      
      if (textArea) {
        resizeObserver.observe(textArea);
      }
    },

    /**
     * 更新虛擬滾動預覽
     * @param {HTMLTextAreaElement} textArea 文本區域
     */
    updateVirtualScrolling(textArea) {
      // 🔍 統一緩存同步驗證 - 在處理所有組之前統一檢查
      const currentText = textArea.value;
      
      // 🔥 強制性 DOM 同步 - 確保位置計算的 DOM 內容完全一致
      this._forceDOMSync(textArea, currentText);

      const scrollTop = textArea.scrollTop;
      const scrollBottom = scrollTop + textArea.clientHeight;
      const bufferSize = ReplacePreview.CONFIG.BUFFER_SIZE;
      
      // 使用 SharedVirtualScroll 的多組更新方法
      const groupedPositions = new Map();
      
      // 清理所有組，再重新添加有內容的組
      const activeGroups = new Set();
      
      // 🎯 獲取所有組的位置數據
      const allRules = this._getAllRules();
      
      allRules.forEach((rule, index) => {
        if (rule.from?.trim()) {
          const positions = ReplacePreview.PositionCalculator.getGroupPositions(textArea, rule.from, index);
          if (positions && positions.length > 0) {
            groupedPositions.set(index, positions);
            activeGroups.add(index);
            console.log(`[ReplacePreview][${ReplacePreview._getTimeStamp()}] 組 ${index} 成功獲取 ${positions.length} 個位置`);
          }
        }
      });
      
      // 清理非活躍組的高亮
      this.groupHighlights.forEach((groupHighlightMap, groupIndex) => {
        if (!activeGroups.has(groupIndex)) {
          console.log(`[ReplacePreview][${ReplacePreview._getTimeStamp()}] 清理非活躍組 ${groupIndex} 的高亮`);
          this.clearGroupHighlights(groupIndex);
        }
      });
      
      // 🆕 保存位置數據到獨立緩存
      console.log(`[ReplacePreview][${ReplacePreview._getTimeStamp()}] 保存 ${groupedPositions.size} 個組的位置數據到緩存`);
      this.cachedGroupPositions.clear();
      groupedPositions.forEach((positions, groupIndex) => {
        this.cachedGroupPositions.set(groupIndex, positions);
      });

      // 使用 SharedVirtualScroll 更新可見性
      try {
        window.TextHighlightVirtualScroll.SharedVirtualScroll.updateMultiGroupVirtualView({
          groupedPositions,
          groupHighlights: this.groupHighlights,
          visibleTop: scrollTop - bufferSize,
          visibleBottom: scrollBottom + bufferSize,
          scrollTop,
          createHighlight: (pos) => {
            const element = window.TextHighlight.Renderer.createPreviewHighlight(
              pos.position,
              pos.position.width,
              pos.lineHeight,
              pos.color
            );
            // 🔗 存儲位置數據供滾動時重用
            element.positionData = pos;
            return element;
          },
          container: this.container,
          highlightClass: 'replace-preview-highlight'
        });
      } catch (error) {
        console.error(`[ReplacePreview][${ReplacePreview._getTimeStamp()}] ❌ 虛擬滾動更新失敗:`, error);
      }
    },

    /**
     * 輕量級滾動更新 - 專門用於滾動時的性能優化
     * @param {HTMLTextAreaElement} textArea 文本區域
     * @private
     */
    _updateScrollVisibility(textArea) {
      // 滾動時只更新可見性，不重新計算位置
      const scrollTop = textArea.scrollTop;
      const scrollBottom = scrollTop + textArea.clientHeight;
      const bufferSize = ReplacePreview.CONFIG.BUFFER_SIZE;
      
      // 🆕 直接從獨立緩存獲取位置數據（不依賴DOM元素）
      const groupedPositions = new Map();
      
      // 複製緩存的位置數據
      this.cachedGroupPositions.forEach((positions, groupIndex) => {
        if (positions && positions.length > 0) {
          groupedPositions.set(groupIndex, positions);
        }
      });
      
      // 如果沒有緩存位置數據，回退到完整更新
      if (groupedPositions.size === 0) {
        console.log(`[ReplacePreview][${ReplacePreview._getTimeStamp()}] 無緩存位置數據，回退到完整更新`);
        this.updateVirtualScrolling(textArea);
        return;
      }
      
      console.log(`[ReplacePreview][${ReplacePreview._getTimeStamp()}] 快速滾動更新: ${groupedPositions.size} 個組`);
      
      // 使用 SharedVirtualScroll 僅更新可見性
      try {
        window.TextHighlightVirtualScroll.SharedVirtualScroll.updateMultiGroupVirtualView({
          groupedPositions,
          groupHighlights: this.groupHighlights,
          visibleTop: scrollTop - bufferSize,
          visibleBottom: scrollBottom + bufferSize,
          scrollTop,
          createHighlight: (pos) => {
            const element = window.TextHighlight.Renderer.createPreviewHighlight(
              pos.position,
              pos.position.width,
              pos.lineHeight,
              pos.color
            );
            element.positionData = pos;
            return element;
          },
          container: this.container,
          highlightClass: 'replace-preview-highlight'
        });
      } catch (error) {
        console.error(`[ReplacePreview][${ReplacePreview._getTimeStamp()}] ❌ 快速滾動更新失敗，回退到完整更新:`, error);
        this.updateVirtualScrolling(textArea);
      }
    },

    /**
     * 強制DOM同步
     * @param {HTMLTextAreaElement} textArea 文本區域
     * @param {string} currentText 當前文本
     * @private
     */
    _forceDOMSync(textArea, currentText) {
      if (window.TextHighlight.PositionCalculator && window.TextHighlight.PositionCalculator.cache) {
        const cachedText = window.TextHighlight.PositionCalculator.cache.lastText || '';
        
        // 無論如何都要強制同步，確保 DOM 內容正確
        
        // 完全清理緩存
        ReplacePreview.CacheManager.forceCleanAllCaches();
        
        // 多重強制同步策略
        if (window.TextHighlight.PositionCalculator.cache.div) {
          const div = window.TextHighlight.PositionCalculator.cache.div;
          
          // 1. 完全重置 div
          div.textContent = '';
          div.innerHTML = '';
          
          // 2. 強制瀏覽器重排
          div.offsetHeight;
          div.scrollTop;
          
          // 3. 分步設置內容，確保同步
          div.textContent = currentText;
          
          // 4. 再次強制重排並驗證
          div.offsetHeight;
          const verifyText = div.textContent || '';
          
          // 5. 如果同步失敗，重新創建 div
          if (verifyText.length !== currentText.length || verifyText !== currentText) {
            console.warn(`[ReplacePreview][${ReplacePreview._getTimeStamp()}] ❌ DOM 同步失敗，重新創建計算容器`);
            
            // 移除舊的 div
            if (div.parentNode) {
              div.parentNode.removeChild(div);
            }
            
            // 重新創建 div 並設置樣式
            const newDiv = document.createElement('div');
            const styles = window.TextHighlight.PositionCalculator.getTextAreaStyles(textArea);
            newDiv.style.cssText = `
              position: absolute;
              visibility: hidden;
              pointer-events: none;
              white-space: pre-wrap;
              word-wrap: break-word;
              overflow-wrap: break-word;
              font-family: ${styles.fontFamily};
              font-size: ${styles.fontSize}px;
              font-weight: ${styles.fontWeight};
              line-height: ${styles.lineHeight}px;
              letter-spacing: ${styles.letterSpacing};
              word-spacing: ${styles.wordSpacing};
              width: ${textArea.offsetWidth}px;
              height: auto;
              border: none;
              margin: 0;
              padding: ${styles.paddingTop}px ${styles.paddingRight}px ${styles.paddingBottom}px ${styles.paddingLeft}px;
              left: -9999px;
              top: -9999px;
            `;
            
            // 添加到 DOM 並設置內容
            document.body.appendChild(newDiv);
            newDiv.textContent = currentText;
            
            // 強制重排並更新緩存
            newDiv.offsetHeight;
            window.TextHighlight.PositionCalculator.cache.div = newDiv;
          }
        }
        
        // 強制更新緩存狀態
        window.TextHighlight.PositionCalculator.cache.lastText = currentText;
        window.TextHighlight.PositionCalculator.cache.positions.clear();
      }
    },

    /**
     * 獲取所有規則
     * @returns {Array} 規則陣列
     * @private
     */
    _getAllRules() {
      // 嘗試從外部系統獲取規則
      if (ReplacePreview.onGetRules) {
        return ReplacePreview.onGetRules();
      }
      
      // 回退方案：從DOM獲取
      const rules = [];
      
      // 獲取主組規則
      const mainGroup = document.querySelector('.replace-main-group');
      if (mainGroup) {
        const fromInput = mainGroup.querySelector('.replace-input');
        const toInput = mainGroup.querySelector('.replace-input:last-of-type');
        rules.push({
          from: fromInput?.value || '',
          to: toInput?.value || ''
        });
      }
      
      // 獲取額外組規則
      const extraGroups = document.querySelectorAll('.replace-extra-group');
      extraGroups.forEach(group => {
        const fromInput = group.querySelector('.replace-input');
        const toInput = group.querySelector('.replace-input:last-of-type');
        rules.push({
          from: fromInput?.value || '',
          to: toInput?.value || ''
        });
      });
      
      return rules;
    },

    /**
     * 更新預覽
     * @param {HTMLTextAreaElement} textArea 文本區域
     * @param {string} searchText 搜尋文字
     * @param {number} groupIndex 組索引
     */
    updatePreview(textArea, searchText, groupIndex) {
      console.log(`[ReplacePreview][${ReplacePreview._getTimeStamp()}] updatePreview 被調用: 組 ${groupIndex}, 搜尋文字: "${searchText}"`);
      
      if (!searchText || !searchText.trim()) {
        console.log(`[ReplacePreview][${ReplacePreview._getTimeStamp()}] 清理組 ${groupIndex} 高亮（搜尋文字為空）`);
        this.clearGroupHighlights(groupIndex);
        return;
      }

      // 清除現有的防抖計時器
      if (this._updateTimer) {
        clearTimeout(this._updateTimer);
      }
      
      // 🎯 主組（用戶選取的文字）立即更新，不使用防抖
      if (groupIndex === 0) {
        console.log(`[ReplacePreview][${ReplacePreview._getTimeStamp()}] 主組立即更新高亮`);
        this.updateVirtualScrolling(textArea);
        return;
      }
      
      // 其他組使用防抖機制，避免頻繁更新
      console.log(`[ReplacePreview][${ReplacePreview._getTimeStamp()}] 組 ${groupIndex} 使用防抖更新（${ReplacePreview.CONFIG.DEBOUNCE_DELAY}ms 延遲）`);
      this._updateTimer = setTimeout(() => {
        console.log(`[ReplacePreview][${ReplacePreview._getTimeStamp()}] 執行防抖更新: 組 ${groupIndex}`);
        this.updateVirtualScrolling(textArea);
      }, ReplacePreview.CONFIG.DEBOUNCE_DELAY);
    },

    /**
     * 清理特定組的高亮
     * @param {number} groupIndex 組索引
     */
    clearGroupHighlights(groupIndex) {
      // 使用 SharedVirtualScroll 的清理方法
      window.TextHighlightVirtualScroll.SharedVirtualScroll.clearGroupHighlights(
        groupIndex, 
        this.groupHighlights, 
        this.observer
      );
      
      // 🆕 同時清理該組的位置緩存
      this.cachedGroupPositions.delete(groupIndex);
      console.log(`[ReplacePreview][${ReplacePreview._getTimeStamp()}] 清理組 ${groupIndex} 的位置緩存`);
    },

    /**
     * 清理所有高亮
     */
    clearAllHighlights() {
      // 使用 SharedVirtualScroll 的清理方法
      window.TextHighlightVirtualScroll.SharedVirtualScroll.clearAllGroupHighlights(
        this.groupHighlights, 
        this.observer
      );
      
      // 🆕 同時清理所有位置緩存
      this.cachedGroupPositions.clear();
      console.log(`[ReplacePreview][${ReplacePreview._getTimeStamp()}] 清理所有組的位置緩存`);
    },

    /**
     * 清理資源
     */
    cleanup() {
      this.clearAllHighlights();
      if (this.container) {
        this.container.remove();
        this.container = null;
      }
      // 清理防抖計時器
      if (this._updateTimer) {
        clearTimeout(this._updateTimer);
        this._updateTimer = null;
      }
      this._refreshInProgress = false;
      console.log(`[ReplacePreview][${ReplacePreview._getTimeStamp()}] 預覽管理器已清理`);
    }
  },

  /**
   * 位置計算器
   */
  PositionCalculator: {
    /**
     * 獲取組的位置數據
     * @param {HTMLTextAreaElement} textArea 文本區域
     * @param {string} searchText 搜尋文字
     * @param {number} groupIndex 組索引
     * @returns {Array} 位置陣列
     */
    getGroupPositions(textArea, searchText, groupIndex) {
      try {
        // 確保獲取最新的文本內容
        const text = textArea.value;
        
        // 驗證文本合法性
        if (!text || typeof text !== 'string') {
          console.warn(`[ReplacePreview][${ReplacePreview._getTimeStamp()}] ❌ 無效的文本內容，組 ${groupIndex}`);
          return [];
        }
        
        // 驗證搜尋文字
        if (!searchText || !searchText.trim()) {
          console.warn(`[ReplacePreview][${ReplacePreview._getTimeStamp()}] 搜尋文字為空，組 ${groupIndex}`);
          return [];
        }
        
        // 創建正則表達式並查找匹配
        let regex, matches;
        try {
          regex = window.RegexHelper.createRegex(searchText);
          matches = Array.from(text.matchAll(regex));
        } catch (regexError) {
          console.error(`[ReplacePreview][${ReplacePreview._getTimeStamp()}] ❌ 正則表達式創建失敗，組 ${groupIndex}:`, regexError);
          return [];
        }
        
        if (matches.length === 0) {
          return [];
        }

        // 檢查匹配數量是否超過上限
        if (matches.length > ReplacePreview.CONFIG.MAX_PREVIEWS) {
          console.warn(`[ReplacePreview][${ReplacePreview._getTimeStamp()}] 組 ${groupIndex} 匹配數量 ${matches.length} 超過上限，截取到 ${ReplacePreview.CONFIG.MAX_PREVIEWS}`);
          matches.length = ReplacePreview.CONFIG.MAX_PREVIEWS;
        }

        // 使用 TextHighlight 的樣式計算方法
        const styles = window.TextHighlight.PositionCalculator.getTextAreaStyles(textArea);
        const color = ReplacePreview.CONFIG.PREVIEW_COLORS[
          groupIndex % ReplacePreview.CONFIG.PREVIEW_COLORS.length
        ];

        // 收集所有位置信息
        const positions = [];
        let successCount = 0;
        let failCount = 0;
        
        // 🔍 預先驗證 DOM 同步狀態
        let domContentLength = 0;
        if (window.TextHighlight.PositionCalculator && window.TextHighlight.PositionCalculator.cache && window.TextHighlight.PositionCalculator.cache.div) {
          const divText = window.TextHighlight.PositionCalculator.cache.div.textContent || '';
          domContentLength = divText.length;
          
          if (domContentLength !== text.length) {
            console.error(`[ReplacePreview][${ReplacePreview._getTimeStamp()}] ❌ 組 ${groupIndex} DOM 內容與文本不同步！DOM: ${domContentLength}, Text: ${text.length}`);
            return [];
          }
        } else {
          console.error(`[ReplacePreview][${ReplacePreview._getTimeStamp()}] ❌ 組 ${groupIndex} 找不到位置計算的 DOM 容器`);
          return [];
        }
        
        for (let i = 0; i < matches.length; i++) {
          const match = matches[i];
          
          // 🔥 加強邊界檢查：多重驗證
          if (match.index < 0 || match.index >= text.length) {
            console.warn(`[ReplacePreview][${ReplacePreview._getTimeStamp()}] 組 ${groupIndex} 跳過無效匹配索引: ${match.index}, 文本長度: ${text.length}`);
            failCount++;
            continue;
          }
          
          // 檢查匹配文本的結束位置
          const endIndex = match.index + match[0].length;
          if (endIndex > text.length) {
            console.warn(`[ReplacePreview][${ReplacePreview._getTimeStamp()}] 組 ${groupIndex} 跳過無效匹配結束位置: ${endIndex}, 文本長度: ${text.length}`);
            failCount++;
            continue;
          }
          
          // 🆕 檢查索引是否在 DOM 範圍內
          if (match.index >= domContentLength) {
            console.warn(`[ReplacePreview][${ReplacePreview._getTimeStamp()}] 組 ${groupIndex} 跳過超出 DOM 範圍的匹配: index=${match.index}, DOM長度=${domContentLength}`);
            failCount++;
            continue;
          }
          
          // 🆕 檢查結束位置是否在 DOM 範圍內
          if (endIndex > domContentLength) {
            console.warn(`[ReplacePreview][${ReplacePreview._getTimeStamp()}] 組 ${groupIndex} 跳過超出 DOM 範圍的匹配結束位置: endIndex=${endIndex}, DOM長度=${domContentLength}`);
            failCount++;
            continue;
          }
          
          // 🆕 檢查匹配的字符是否一致
          const textSubstring = text.substring(match.index, endIndex);
          if (textSubstring !== match[0]) {
            console.warn(`[ReplacePreview][${ReplacePreview._getTimeStamp()}] 組 ${groupIndex} 匹配內容不一致: 期望="${match[0]}", 實際="${textSubstring}"`);
            failCount++;
            continue;
          }   
          
          try {
            const positionList = window.TextHighlight.PositionCalculator.calculatePosition(
              textArea,
              match.index,
              text,
              match[0],
              styles
            );
            
            if (positionList && positionList.length > 0) {
              positionList.forEach(position => {
                positions.push({
                  position: {
                    ...position,
                    text: match[0],
                    width: position.width
                  },
                  color,
                  targetWord: searchText,
                  lineHeight: styles.lineHeight
                });
              });
              successCount++;
            } else {
              console.warn(`[ReplacePreview][${ReplacePreview._getTimeStamp()}] 組 ${groupIndex} 匹配 ${i} 位置計算失敗`);
              failCount++;
            }
          } catch (posError) {
            console.error(`[ReplacePreview][${ReplacePreview._getTimeStamp()}] ❌ 組 ${groupIndex} 匹配 ${i} 位置計算出錯:`, posError);
            failCount++;
          }
        }

        console.log(`[ReplacePreview][${ReplacePreview._getTimeStamp()}] 組 ${groupIndex} 位置計算完成: 成功 ${successCount}, 失敗 ${failCount}, 總位置 ${positions.length}`);
        return positions;
        
      } catch (error) {
        console.error(`[ReplacePreview][${ReplacePreview._getTimeStamp()}] ❌ 組 ${groupIndex} 獲取位置數據失敗:`, error);
        return [];
      }
    }
  },

  /**
   * 緩存管理器
   */
  CacheManager: {
    /**
     * 強制清理所有緩存
     */
    forceCleanAllCaches() {
      // 清理位置計算器緩存
      if (window.TextHighlight.PositionCalculator && window.TextHighlight.PositionCalculator.cache) {
        window.TextHighlight.PositionCalculator.cache.lastText = '';
        window.TextHighlight.PositionCalculator.cache.positions.clear();
        
        // 強制重置 div 內容
        if (window.TextHighlight.PositionCalculator.cache.div) {
          window.TextHighlight.PositionCalculator.cache.div.textContent = '';
        }
      }
      
      // 清理全局位置緩存
      if (window.TextHighlight.GlobalPositionCache && window.TextHighlight.GlobalPositionCache.clear) {
        window.TextHighlight.GlobalPositionCache.clear();
      }
      
      // 🆕 清理預覽管理器的位置緩存
      ReplacePreview.PreviewManager.cachedGroupPositions.clear();
      console.log(`[ReplacePreview][${ReplacePreview._getTimeStamp()}] 清理預覽位置緩存`);
      
      // 清理當前高亮
      ReplacePreview.PreviewManager.clearAllHighlights();
      
      console.log(`[ReplacePreview][${ReplacePreview._getTimeStamp()}] 所有緩存已清理`);
    },

    /**
     * 計算文本簡單哈希
     * @param {string} text 文本
     * @returns {string} 哈希值
     */
    hashText(text) {
      if (!text) return '';
      let hash = 0;
      for (let i = 0; i < Math.min(text.length, 100); i++) {
        const char = text.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash; // 轉為32位整數
      }
      return hash.toString();
    }
  },

  /**
   * 檢查和診斷工具
   */
  DiagnosticTools: {
    /**
     * 檢查並強制更新高亮
     */
    checkAndForceUpdateHighlights() {
      const highlights = document.querySelectorAll('.replace-preview-highlight');
      const totalHighlights = highlights.length;
      const visibleHighlights = Array.from(highlights).filter(h => 
        h.style.display !== 'none' && 
        parseFloat(h.style.width) > 0
      ).length;

      console.log(`[ReplacePreview][${ReplacePreview._getTimeStamp()}] 高亮檢查: 總數 ${totalHighlights}, 可見 ${visibleHighlights}`);

      if (visibleHighlights === 0 && totalHighlights === 0) {
        const textArea = document.querySelector('textarea[name="content"]');
        if (textArea && ReplacePreview.onUpdate) {
          ReplacePreview.onUpdate();
        }
      }
    },

    /**
     * 開始定期檢查高亮
     */
    startHighlightCheck() {
      // 在前幾秒多檢查
      const checkTimes = [100, 500, 1000, 2000];
      checkTimes.forEach(delay => {
        setTimeout(() => {
          this.checkAndForceUpdateHighlights();
        }, delay);
      });
    },

    /**
     * 獲取預覽統計信息
     * @returns {Object} 統計信息
     */
    getStats() {
      return {
        totalGroups: ReplacePreview.PreviewManager.groupHighlights.size,
        cachedPositions: ReplacePreview.PreviewManager.cachedGroupPositions.size,
        containerExists: !!ReplacePreview.PreviewManager.container,
        updateTimerActive: !!ReplacePreview.PreviewManager._updateTimer,
        refreshInProgress: ReplacePreview.PreviewManager._refreshInProgress
      };
    }
  },

  /**
   * 文本變化監聽器
   */
  TextChangeMonitor: {
    _lastValue: '',
    _lastLength: 0,
    _lastHash: '',

    /**
     * 設置文本區域變化監聽器
     * @param {HTMLTextAreaElement} textArea 文本區域
     */
    setupTextAreaChangeListener(textArea) {
      this._lastValue = textArea.value;
      this._lastLength = textArea.value.length;
      this._lastHash = ReplacePreview.CacheManager.hashText(textArea.value);
      
      const checkValue = () => {
        const currentValue = textArea.value;
        const currentLength = currentValue.length;
        const currentHash = ReplacePreview.CacheManager.hashText(currentValue);
        
        if (currentValue !== this._lastValue || currentLength !== this._lastLength || currentHash !== this._lastHash) {
          console.log(`[ReplacePreview][${ReplacePreview._getTimeStamp()}] 📝 文本變化: ${this._lastLength} → ${currentLength} 字符`);
          
          // 🧹 強制清理所有相關緩存
          ReplacePreview.CacheManager.forceCleanAllCaches();
          
          this._lastValue = currentValue;
          this._lastLength = currentLength;
          this._lastHash = currentHash;
          
          // 延遲更新預覽，確保 DOM 和緩存完全清理
          setTimeout(() => {
            if (ReplacePreview.onUpdate) {
              ReplacePreview.onUpdate();
            }
          }, 15);
        }
        requestAnimationFrame(checkValue);
      };
      checkValue();
    }
  },

  /**
   * 主要API方法
   */

  /**
   * 初始化預覽系統
   * @param {HTMLTextAreaElement} textArea 文本區域
   */
  initialize(textArea) {
    this.PreviewManager.initialize(textArea);
    this.TextChangeMonitor.setupTextAreaChangeListener(textArea);
    this.DiagnosticTools.startHighlightCheck();
    
    console.log(`[ReplacePreview][${this._getTimeStamp()}] 🚀 預覽系統初始化完成`);
  },

  /**
   * 更新所有預覽
   */
  updateAllPreviews() {
    const textArea = document.querySelector('textarea[name="content"]');
    if (!textArea) {
      console.warn(`[ReplacePreview][${this._getTimeStamp()}] 找不到文本區域，跳過預覽更新`);
      return;
    }

    this.PreviewManager.updateVirtualScrolling(textArea);
  },

  /**
   * 更新特定組的預覽
   * @param {HTMLTextAreaElement} textArea 文本區域
   * @param {string} searchText 搜尋文字
   * @param {number} groupIndex 組索引
   */
  updateGroupPreview(textArea, searchText, groupIndex) {
    this.PreviewManager.updatePreview(textArea, searchText, groupIndex);
  },

  /**
   * 清理預覽系統
   */
  cleanup() {
    this.PreviewManager.cleanup();
    console.log(`[ReplacePreview][${this._getTimeStamp()}] 預覽系統已清理`);
  },

  // 回調函數接口，由外部系統設置
  onUpdate: null,      // 預覽更新回調
  onGetRules: null     // 獲取規則回調
}; 