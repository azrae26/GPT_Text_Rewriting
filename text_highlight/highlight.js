/* global UIManager */

/**
 * 文字標示模組 - 負責在文本區域中標示特定文字
 */
const TextHighlight = {
  /**
   * DOM 元素管理子模組 - 處理所有 DOM 相關操作
   */
  DOMManager: {
    // 存儲所有需要的 DOM 元素引用
    elements: {
      highlights: [],        // 所有標示元素的集合
      container: null,       // 標示容器
      textArea: null,        // 文本區域
      measureCanvas: null,   // 測量文字寬度的 canvas
      measureContext: null,   // canvas 的 2d context
      highlightPositions: []  // 儲存所有高亮框的絕對位置
    },

    initialize() {
      this.setupMeasureCanvas();
      this.setupHighlightContainer();
    },

    /**
     * 設置用於測量文字寬度的 canvas
     */
    setupMeasureCanvas() {
      this.elements.measureCanvas = document.createElement('canvas');
      this.elements.measureContext = this.elements.measureCanvas.getContext('2d');
    },

    /**
     * 設置標示容器
     */
    setupHighlightContainer() {
      // 創建外層容器
      const outerContainer = document.createElement('div');
      outerContainer.id = 'text-highlight-outer-container';
      
      // 創建內層容器
      const container = document.createElement('div');
      container.id = 'text-highlight-container';
      
      // 獲取 textarea 元素
      const textArea = document.querySelector('textarea[name="content"]');
      if (!textArea) return;
      
      // 設置外層容器樣式，使用 textarea 的實際尺寸
      outerContainer.style.cssText = `
        position: absolute;
        top: 12.5px;
        left: 0;
        width: ${textArea.offsetWidth}px;
        height: ${textArea.offsetHeight}px;
        pointer-events: none;
        z-index: 1000;
        overflow: hidden;
      `;

      // 設置內層容器樣式
      container.style.cssText = `
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        pointer-events: none;
      `;

      // 將內層容器添加到外層容器
      outerContainer.appendChild(container);

      // 將外層容器添加到 textarea 的父元素中
      const textAreaParent = textArea.parentElement;
      if (textAreaParent) {
        textAreaParent.style.position = 'relative';
        textAreaParent.appendChild(outerContainer);
        this.elements.container = container;
        this.elements.textArea = textArea;
      }
    },

    /**
     * 清除所有標示
     */
    clearHighlights() {
      this.elements.highlights.forEach(element => element.remove());
      this.elements.highlights = [];
    },

    /**
     * 檢查位置是否在文本區域可視範圍內
     * @param {Object} position - 位置信息
     * @param {number} width - 標示寬度
     * @param {number} height - 標示高度
     * @returns {boolean} - 是否在可視範圍內
     */
    isPositionVisible(position, width, height) {
      const textArea = this.elements.textArea;
      return (
        position.top >= 0 &&
        position.left >= 0 &&
        position.top + height <= textArea.offsetHeight &&
        position.left + width <= textArea.offsetWidth
      );
    },

    /**
     * 更新高亮框的可見性和位置
     */
    updateHighlightsVisibility() {
      const { textArea, container } = this.elements;
      if (!textArea || !container) return;

      const scrollTop = textArea.scrollTop;
      const visibleHeight = textArea.clientHeight;
      const totalHeight = textArea.scrollHeight;

      this.elements.highlights.forEach((highlight) => {
        // 獲取原始位置（不包含滾動偏移）
        const originalTop = parseFloat(highlight.style.top);
        const highlightHeight = parseFloat(highlight.style.height);
        
        // 計算實際應該顯示的位置
        const adjustedTop = originalTop - scrollTop;
        
        // 擴大可見範圍的判斷
        const isVisible = (adjustedTop + highlightHeight >= -highlightHeight) && 
                         (adjustedTop <= visibleHeight + highlightHeight) &&
                         (originalTop <= totalHeight);

        if (isVisible) {
          highlight.style.display = 'block';
          highlight.style.transform = `translateY(${-scrollTop}px)`;
        } else {
          highlight.style.display = 'none';
        }
      });
    }
  },

  /**
   * 位置計算子模組 - 處理文字位置的計算
   */
  PositionCalculator: {
    // 新增：換行規則配置
    lineBreakRules: {
      // 不能出現在行首的字符（使用 Unicode 轉義序列）
      // 包含：句號、逗號、冒號、分號、感嘆號、問號、右括號、右引號、右單引號、度符號、百分號、美元符號
      noStartChars: '\u3002\u3001\uFF0C\uFF1A\uFF1B\uFF01\uFF1F\uFF09\u300D\u300F\u3011\u300B\u2019\u201D\u2103\uFF05\uFF04', 
      
      // 不能出現在行尾的字符（使用 Unicode 轉義序列）
      // 包含：左括號、左引號、左單引號、度符號、美元符號、歐元符號、英鎊符號
      noEndChars: '\uFF08\u300C\u300E\u3010\u300A\u2018\u201C\u0024\u00A5\u20AC\u00A3',
      
      // 不能被拆開的模式
      noBreakPatterns: [
        /[A-Za-z]+/g,  // 英文單字
        /\d+/g,        // 數字序列
        /\d+年/g,      // 年份
        /\d+%/g,       // 百分比
        /[$¥€£]\d+/g,  // 貨幣金額
        /\d+[kKmMgG][bB]/g,  // 容量單位
        /\d+[kK][gG]/g,      // 重量單位
        /[一二三四五六七八九十百千萬億兆]+/g  // 中文數字
      ]
    },

    /**
     * 檢查字符是否可以作為行首
     */
    canStartLine(char) {
      return !this.lineBreakRules.noStartChars.includes(char);
    },

    /**
     * 檢查字符是否可以作為行尾
     */
    canEndLine(char) {
      return !this.lineBreakRules.noEndChars.includes(char);
    },

    /**
     * 檢查是否需要保持在同一行
     */
    shouldKeepTogether(text, startIndex, endIndex) {
      const subText = text.substring(startIndex, endIndex);
      return this.lineBreakRules.noBreakPatterns.some(pattern => {
        pattern.lastIndex = 0;  // 重置正則表達式
        return pattern.test(subText);
      });
    },

    /**
     * 找到合適的換行點
     */
    findBreakPoint(text, startIndex, maxWidth, styles) {
      let currentWidth = 0;
      let lastSafeBreakPoint = startIndex;
      let i = startIndex;

      while (i < text.length) {
        const char = text[i];
        const charWidth = this.getTextWidth(char, styles.font);

        // 如果添加這個字符會超出寬度
        if (currentWidth + charWidth > maxWidth) {
          // 如果找到了安全的換行點，就在那裡換行
          if (lastSafeBreakPoint > startIndex) {
            return lastSafeBreakPoint;
          }
          // 否則在當前位置換行
          return i;
        }

        // 更新寬度
        currentWidth += charWidth;

        // 檢查是否是安全的換行點
        if (this.canEndLine(char) && 
            (i + 1 >= text.length || this.canStartLine(text[i + 1])) &&
            !this.shouldKeepTogether(text, startIndex, i + 1)) {
          lastSafeBreakPoint = i + 1;
        }

        i++;
      }

      return text.length;
    },

    /**
     * 判斷是否為中文字元
     */
    isChinese(char) {
      return /[\u4E00-\u9FFF]/.test(char);
    },

    /**
     * 獲取文本區域的樣式息
     */
    getTextAreaStyles(textArea) {
      const computedStyle = window.getComputedStyle(textArea);
      return {
        font: `${computedStyle.fontSize} ${computedStyle.fontFamily}`,
        lineHeight: parseFloat(computedStyle.lineHeight),
        paddingLeft: parseFloat(computedStyle.paddingLeft),
        paddingTop: parseFloat(computedStyle.paddingTop),
        letterSpacing: parseFloat(computedStyle.letterSpacing) || 0,
        border: parseFloat(computedStyle.borderWidth) || 0
      };
    },

    /**
     * 使用 Range API 獲取文字的精確位置
     */
    calculatePosition(textArea, index, text, matchedText, styles) {
      const div = document.createElement('div');
      const computedStyle = window.getComputedStyle(textArea);
      div.style.cssText = `
        position: absolute;
        visibility: hidden;
        white-space: pre-wrap;
        word-wrap: break-word;
        overflow-wrap: break-word;
        width: ${textArea.clientWidth}px;
        font: ${computedStyle.font};
        line-height: ${computedStyle.lineHeight};
        padding: ${computedStyle.padding};
        border: ${computedStyle.border};
        box-sizing: border-box;
        margin: 0;
        overflow: hidden;
        background: none;
        pointer-events: none;
      `;
      div.textContent = text;
      textArea.parentElement.appendChild(div);

      const range = document.createRange();
      const textNode = div.firstChild;
      range.setStart(textNode, index);
      range.setEnd(textNode, index + matchedText.length);

      const rects = range.getClientRects();
      const divRect = div.getBoundingClientRect();

      div.remove();
      range.detach();

      if (rects.length > 0) {
        const rect = rects[0];
        return {
          top: rect.top - divRect.top + textArea.scrollTop, // paddingTop 的值
          left: rect.left - divRect.left + 14, // 14 是 paddingLeft 的值
          width: rect.width
        };
      }

      return null;
    }
  },

  /**
   * 事件處理子模組 - 處理所有事件監聽
   */
  EventHandler: {
    initialize() {
      this.setupTextAreaEvents();
      this.setupResizeObserver();
      this.setupFontLoader();
    },

    /**
     * 設置文本區域事件
     */
    setupTextAreaEvents() {
      const textArea = TextHighlight.DOMManager.elements.textArea;
      if (!textArea) return;

      textArea.addEventListener('input', () => TextHighlight.updateHighlights());
      
      // 修改滾動事件處理
      textArea.addEventListener('scroll', () => {
        requestAnimationFrame(() => {
          TextHighlight.DOMManager.updateHighlightsVisibility();
        });
      });
    },

    /**
     * 設置大小變化觀察器
     */
    setupResizeObserver() {
      const resizeObserver = new ResizeObserver(() => {
        TextHighlight.updateHighlights();
      });
      
      const textArea = TextHighlight.DOMManager.elements.textArea;
      if (textArea) {
        resizeObserver.observe(textArea);
      }
    },

    /**
     * 設置字體載入監聽
     */
    setupFontLoader() {
      document.fonts.ready.then(() => {
        TextHighlight.updateHighlights();
      });
    }
  },

  /**
   * 高亮顏色配置 - 循環使用的顏色陣列
   */
  highlightColors: [
    'rgba(255, 165, 0, 0.3)',  // 橙色
    'rgba(255, 105, 180, 0.3)', // 粉紅
    'rgba(50, 205, 50, 0.3)',   // 綠色
    'rgba(30, 144, 255, 0.3)',  // 藍色
    'rgba(238, 130, 238, 0.3)', // 紫色
    'rgba(255, 215, 0, 0.3)',   // 金色
    'rgba(64, 224, 208, 0.3)',  // 綠松石色
    'rgba(255, 99, 71, 0.3)',   // 蕃茄紅
    'rgba(135, 206, 235, 0.3)', // 天藍色
    'rgba(218, 112, 214, 0.3)'  // 蘭花紫
  ],

  // 要高亮的文字陣列
  targetWords: [],

  // 設置要高亮的文字
  setTargetWords(words) {
    this.targetWords = words.filter(word => word.trim()); // 過濾空白文字
    this.updateHighlights();
  },

  // 獲取循環顏色
  getColorForIndex(index) {
    return this.highlightColors[index % this.highlightColors.length];
  },

  /**
   * 標示渲染子模組 - 處理標示的視覺呈現
   */
  Renderer: {
    /**
     * 創建標示元素
     */
    createHighlight(position, width, lineHeight, colorIndex) {
      const highlight = document.createElement('div');
      highlight.className = 'text-highlight';
      
      highlight.style.cssText = `
        position: absolute;
        background-color: ${TextHighlight.getColorForIndex(colorIndex)};
        height: ${lineHeight}px;
        width: ${width}px;
        left: ${position.left}px;
        top: ${position.top}px;
        pointer-events: none;
        will-change: transform;
      `;

      return highlight;
    }
  },

  /**
   * 初始化模組
   */
  initialize() {
    console.log('初始化文字標示功能');
    this.DOMManager.initialize();
    this.EventHandler.initialize();
  },

  /**
   * 更新所有標示
   */
  updateHighlights() {
    const { textArea, container } = this.DOMManager.elements;
    if (!textArea || !container) return;

    if (this._rafId) {
      cancelAnimationFrame(this._rafId);
    }

    this._rafId = requestAnimationFrame(() => {
      console.log('\n=== 開始更新高亮 ===');
      
      // 先清除所有現有的高亮
      this.DOMManager.clearHighlights();

      const text = textArea.value;
      const styles = this.PositionCalculator.getTextAreaStyles(textArea);

      // 更新容器尺寸，使用完整的 scrollHeight
      container.style.width = `${textArea.offsetWidth}px`;
      container.style.height = `${textArea.scrollHeight}px`;
      console.log('容器尺寸:', {
        width: textArea.offsetWidth,
        height: textArea.scrollHeight,
        scrollHeight: textArea.scrollHeight,
        clientHeight: textArea.clientHeight,
        scrollTop: textArea.scrollTop
      });

      const fragment = document.createDocumentFragment();

      // 處理所有匹配，不論是否在可視範圍內
      this.targetWords.forEach((targetWord, wordIndex) => {
        if (!targetWord.trim()) return;

        try {
          if (targetWord.startsWith('/') && targetWord.endsWith('/')) {
            // 正則表達式處理
            const regexStr = targetWord.slice(1, -1);
            console.log(`\n處理正則表達式: "${regexStr}"`);
            const regex = new RegExp(regexStr, 'gm');
            let matchCount = 0;

            const matches = Array.from(text.matchAll(regex));
            console.log(`正則表達式匹配結果:`, matches.map(m => ({
              text: m[0],
              index: m.index
            })));

            for (const match of matches) {
              if (match[0]) {
                console.log(`\n找到正則匹配:`, {
                  文字: match[0],
                  位置: match.index,
                  前後文: text.substring(Math.max(0, match.index - 20), 
                                      Math.min(text.length, match.index + match[0].length + 20))
                });

                const position = this.PositionCalculator.calculatePosition(
                  textArea, 
                  match.index, 
                  text, 
                  match[0], 
                  styles
                );
                
                if (position) {
                  console.log('計算出的位置和尺寸:', {
                    top: position.top,
                    left: position.left,
                    width: position.width,
                    lineHeight: styles.lineHeight
                  });

                  const highlight = this.Renderer.createHighlight(
                    position,
                    position.width,
                    styles.lineHeight,
                    wordIndex
                  );
                  
                  if (highlight) {
                    fragment.appendChild(highlight);
                    this.DOMManager.elements.highlights.push(highlight);
                    matchCount++;
                  }
                }
              }
            }
            console.log(`正則表達式 "${targetWord}" 總共匹配到 ${matchCount} 次`);
          } else {
            let index = 0;
            while ((index = text.indexOf(targetWord, index)) !== -1) {
              console.log(`\n處理匹配:`, {
                文字: targetWord,
                位置: index,
                前後文: text.substring(Math.max(0, index - 20), 
                                    Math.min(text.length, index + targetWord.length + 20))
              });

              const position = this.PositionCalculator.calculatePosition(
                textArea, 
                index, 
                text, 
                targetWord, 
                styles
              );
              
              if (position) {
                // 移除可見性檢查，創建所有高亮框
                const highlight = this.Renderer.createHighlight(
                  position,
                  position.width,
                  styles.lineHeight,
                  wordIndex
                );
                
                if (highlight) {
                  fragment.appendChild(highlight);
                  this.DOMManager.elements.highlights.push(highlight);
                }
              }
              
              index += targetWord.length;
            }
          }
        } catch (error) {
          console.error('高亮處理錯誤:', error);
        }
      });

      container.appendChild(fragment);
      
      // 更新可見性
      this.DOMManager.updateHighlightsVisibility();
    });
  }
};

// 將模組暴露給全局作用域
window.TextHighlight = TextHighlight; 