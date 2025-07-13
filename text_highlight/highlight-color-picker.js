/**
 * text_highlight/highlight-color-picker.js - 高亮顏色選擇器模組
 * 功能：為高亮按鈕提供雙擊彈出顏色選擇器功能
 * 職責：
 * - 雙擊事件處理：偵測顏色按鈕的雙擊操作
 * - RGBA滑桿管理：創建和管理RGBA滑桿顏色選擇器（包含透明度）
 * - 顏色格式轉換：支援rgba、rgb、border等格式
 * - 顏色應用：將選擇的顏色應用到按鈕和高亮系統
 * - 介面整合：與現有的HighlightPreviewManager整合
 * 
 * 使用方式：
 * - 單擊按鈕：選擇預設顏色
 * - 雙擊按鈕：彈出RGBA滑桿顏色選擇器自定義顏色（含透明度）
 * 
 * 依賴：
 * - Chrome Storage API：持久化自定義顏色
 * - HighlightPreviewManager：與高亮預覽系統整合
 */

const HighlightColorPicker = {
  // 狀態管理
  isInitialized: false,
  clickTimers: new Map(), // 用於區分單擊和雙擊
  colorPickerPanel: null, // RGBA滑桿面板
  rgbaSliders: {}, // RGBA滑桿元素
  currentBox: null, // 當前操作的按鈕
  onColorChanged: null, // 顏色變更的回調函數
  
  // 配置
  DOUBLE_CLICK_DELAY: 300, // 雙擊檢測延遲（毫秒）
  
  /**
   * 初始化顏色選擇器
   * @param {NodeList} colorBoxes - 顏色按鈕集合
   * @param {Function} onColorChangedCallback - 顏色變更回調函數
   */
  init(colorBoxes, onColorChangedCallback) {
    if (this.isInitialized) {
      LogUtils.warn('HighlightColorPicker 已經初始化');
      return;
    }
    
    LogUtils.log('初始化高亮顏色選擇器');
    
    this.onColorChanged = onColorChangedCallback;
    this.setupRgbColorPicker();
    this.bindColorBoxEvents(colorBoxes);
    
    this.isInitialized = true;
    LogUtils.log('高亮顏色選擇器初始化完成');
  },
  
  /**
   * 創建RGBA滑桿顏色選擇器面板
   */
  setupRgbColorPicker() {
    // 創建主面板
    this.colorPickerPanel = document.createElement('div');
    this.colorPickerPanel.className = 'rgb-color-picker-panel';
    this.colorPickerPanel.style.cssText = `
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      background: white;
      border: 0;
      border-radius: 12px;
      padding: 20px;
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
      z-index: 10000;
      display: none;
      min-width: 300px;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    `;
    
    // 創建標題
    const title = document.createElement('div');
    title.textContent = '顏色選擇器';
    title.style.cssText = `
      font-size: 16px;
      font-weight: bold;
      color: #333;
      margin-bottom: 20px;
      text-align: center;
    `;
    this.colorPickerPanel.appendChild(title);
    
    // 創建顏色預覽區域
    const colorPreview = document.createElement('div');
    colorPreview.className = 'color-preview';
    colorPreview.style.cssText = `
      width: 100%;
      height: 40px;
      border: 1px solid #ddd;
      border-radius: 6px;
      margin-bottom: 20px;
      background: #ff0000;
    `;
    this.colorPickerPanel.appendChild(colorPreview);
    this.colorPreview = colorPreview;
    
    // 創建RGB滑桿容器
    const rgbContainer = document.createElement('div');
    rgbContainer.className = 'rgb-sliders-container';
    
    // 創建四條RGBA滑桿
    const colors = [
      { name: 'R', label: '紅色 (Red)', color: '#ff4444', max: 255 },
      { name: 'G', label: '綠色 (Green)', color: '#44ff44', max: 255 },
      { name: 'B', label: '藍色 (Blue)', color: '#4444ff', max: 255 },
      { name: 'A', label: '透明度 (Alpha)', color: '#888888', max: 100 }
    ];
    
    colors.forEach(({ name, label, color, max }) => {
      const sliderGroup = document.createElement('div');
      sliderGroup.className = 'slider-group';
      sliderGroup.style.cssText = `
        margin-bottom: 10px;
      `;
      
      // 標籤和數值顯示
      const labelContainer = document.createElement('div');
      labelContainer.style.cssText = `
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 4px;
      `;
      
      const labelElement = document.createElement('label');
      labelElement.textContent = label;
      labelElement.style.cssText = `
        font-size: 14px;
        color: #333;
        font-weight: 500;
      `;
      
      const valueDisplay = document.createElement('span');
      valueDisplay.className = `${name.toLowerCase()}-value`;
      valueDisplay.textContent = name === 'A' ? '30%' : '255';
      valueDisplay.style.cssText = `
        font-size: 14px;
        color: #666;
        background: rgb(234, 238, 241);
        padding: 2px 8px;
        border-radius: 4px;
        min-width: 35px;
        text-align: center;
      `;
      
      labelContainer.appendChild(labelElement);
      labelContainer.appendChild(valueDisplay);
      
      // 滑桿
      const slider = document.createElement('input');
      slider.type = 'range';
      slider.min = '0';
      slider.max = max.toString();
      slider.value = name === 'A' ? '30' : '255'; // 透明度預設30%，RGB預設255
      slider.className = `rgba-slider ${name.toLowerCase()}-slider`;
              const bgGradient = name === 'A' 
          ? 'linear-gradient(to right, transparent, black), repeating-linear-gradient(45deg, #fff 0px, #fff 5px, #ddd 5px, #ddd 10px)'
          : `linear-gradient(to right, #000, ${color})`;
          
        slider.style.cssText = `
          width: 100%;
          height: 8px;
          border-radius: 4px;
          background: ${bgGradient};
          outline: none;
          appearance: none;
          cursor: pointer;
        `;
      
      // 為 WebKit 瀏覽器設置滑桿樣式
      const style = document.createElement('style');
      style.textContent = `
        .rgba-slider::-webkit-slider-thumb {
          appearance: none;
          width: 18px;
          height: 18px;
          border-radius: 50%;
          background: white;
          border: 2px solid ${color};
          cursor: pointer;
          box-shadow: 0 2px 6px rgba(0,0,0,0.2);
        }
        .rgba-slider::-webkit-slider-thumb:hover {
          transform: scale(1.1);
          transition: transform 0.2s ease;
        }
        .rgba-slider::-moz-range-thumb {
          width: 18px;
          height: 18px;
          border-radius: 50%;
          background: white;
          border: 2px solid ${color};
          cursor: pointer;
          box-shadow: 0 2px 6px rgba(0,0,0,0.2);
        }
      `;
      document.head.appendChild(style);
      
      // 綁定滑桿事件
      slider.addEventListener('input', (e) => {
        const value = e.target.value;
        valueDisplay.textContent = name === 'A' ? `${value}%` : value;
        this.updateColorPreview();
      });
      
      sliderGroup.appendChild(labelContainer);
      sliderGroup.appendChild(slider);
      rgbContainer.appendChild(sliderGroup);
      
      // 儲存滑桿引用
      this.rgbaSliders = this.rgbaSliders || {};
      this.rgbaSliders[name.toLowerCase()] = { slider, valueDisplay };
    });
    
    this.colorPickerPanel.appendChild(rgbContainer);
    
    // 創建按鈕容器
    const buttonContainer = document.createElement('div');
    buttonContainer.style.cssText = `
      display: flex;
      gap: 10px;
      margin-top: 20px;
      justify-content: flex-end;
    `;
    
    // 確認按鈕
    const confirmButton = document.createElement('button');
    confirmButton.textContent = '確認';
    confirmButton.style.cssText = `
      background: #007cba;
      color: white;
      border: none;
      padding: 8px 16px;
      border-radius: 6px;
      cursor: pointer;
      font-size: 14px;
      font-weight: 500;
    `;
    confirmButton.addEventListener('click', () => {
      this.applySelectedColor();
    });
    
    // 取消按鈕
    const cancelButton = document.createElement('button');
    cancelButton.textContent = '取消';
    cancelButton.style.cssText = `
      background: #6c757d;
      color: white;
      border: none;
      padding: 8px 16px;
      border-radius: 6px;
      cursor: pointer;
      font-size: 14px;
      font-weight: 500;
    `;
    cancelButton.addEventListener('click', () => {
      this.hideColorPicker();
    });
    
    buttonContainer.appendChild(cancelButton);
    buttonContainer.appendChild(confirmButton);
    this.colorPickerPanel.appendChild(buttonContainer);
    
    // 添加遮罩層
    const overlay = document.createElement('div');
    overlay.className = 'color-picker-overlay';
    overlay.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0, 0, 0, 0.5);
      z-index: 9999;
      display: none;
    `;
    overlay.addEventListener('click', () => {
      this.hideColorPicker();
    });
    
    // 添加到body
    document.body.appendChild(overlay);
    document.body.appendChild(this.colorPickerPanel);
    this.colorPickerOverlay = overlay;
    
    LogUtils.log('RGB滑桿顏色選擇器已創建');
  },
  
  /**
   * 更新顏色預覽
   */
  updateColorPreview() {
    const r = parseInt(this.rgbaSliders.r.slider.value);
    const g = parseInt(this.rgbaSliders.g.slider.value);
    const b = parseInt(this.rgbaSliders.b.slider.value);
    const a = parseInt(this.rgbaSliders.a.slider.value) / 100; // 轉換為 0-1 範圍
    
    const color = `rgba(${r}, ${g}, ${b}, ${a})`;
    this.colorPreview.style.background = color;
    
    // 為預覽區域添加棋盤格背景來顯示透明度效果
    this.colorPreview.style.backgroundImage = `
      ${color}, 
      repeating-linear-gradient(45deg, #fff 0px, #fff 5px, #ddd 5px, #ddd 10px)
    `;
    this.colorPreview.style.backgroundBlendMode = 'normal, normal';
    
    // 更新滑桿背景漸變
    this.rgbaSliders.r.slider.style.background = `linear-gradient(to right, rgba(0,${g},${b},${a}), rgba(255,${g},${b},${a}))`;
    this.rgbaSliders.g.slider.style.background = `linear-gradient(to right, rgba(${r},0,${b},${a}), rgba(${r},255,${b},${a}))`;
    this.rgbaSliders.b.slider.style.background = `linear-gradient(to right, rgba(${r},${g},0,${a}), rgba(${r},${g},255,${a}))`;
    
    // 更新透明度滑桿背景（包含棋盤格）
    this.rgbaSliders.a.slider.style.background = `
      linear-gradient(to right, rgba(${r},${g},${b},0), rgba(${r},${g},${b},1)),
      repeating-linear-gradient(45deg, #fff 0px, #fff 3px, #ddd 3px, #ddd 6px)
    `;
  },
  
  /**
   * 顯示顏色選擇器
   * @param {string} currentColor - 當前顏色值
   */
  showColorPicker(currentColor) {
    // 解析當前顏色並設置滑桿值
    const rgba = this.extractRgbaValues(currentColor);
    
    this.rgbaSliders.r.slider.value = rgba.r;
    this.rgbaSliders.g.slider.value = rgba.g;
    this.rgbaSliders.b.slider.value = rgba.b;
    this.rgbaSliders.a.slider.value = rgba.a;
    
    this.rgbaSliders.r.valueDisplay.textContent = rgba.r;
    this.rgbaSliders.g.valueDisplay.textContent = rgba.g;
    this.rgbaSliders.b.valueDisplay.textContent = rgba.b;
    this.rgbaSliders.a.valueDisplay.textContent = `${rgba.a}%`;
    
    this.updateColorPreview();
    
    // 顯示面板和遮罩
    this.colorPickerOverlay.style.display = 'block';
    this.colorPickerPanel.style.display = 'block';
    
    LogUtils.log('📱 RGB顏色選擇器已顯示');
  },
  
  /**
   * 隱藏顏色選擇器
   */
  hideColorPicker() {
    this.colorPickerOverlay.style.display = 'none';
    this.colorPickerPanel.style.display = 'none';
    this.currentBox = null;
    
    LogUtils.log('❌ RGB顏色選擇器已隱藏');
  },
  
  /**
   * 應用選擇的顏色
   */
  applySelectedColor() {
    if (!this.currentBox) {
      LogUtils.warn('沒有當前操作的按鈕');
      return;
    }
    
    const r = parseInt(this.rgbaSliders.r.slider.value);
    const g = parseInt(this.rgbaSliders.g.slider.value);
    const b = parseInt(this.rgbaSliders.b.slider.value);
    const a = parseInt(this.rgbaSliders.a.slider.value);
    
    const box = this.currentBox;
    const style = box.dataset.originalStyle;
    
    // 在更新按鈕顏色之前，先獲取舊顏色
    const originalColor = box.dataset.originalColor;
    const currentColor = box.dataset.currentColor || originalColor;
    const currentStyle = box.dataset.currentStyle || style;
    
    // 轉換為適當的顏色格式
    const convertedColor = this.convertRgbaToFormat(r, g, b, a, style);
    
    LogUtils.log('📝 用戶選擇了新顏色:', convertedColor);
    
    // 先調用外部的顏色變更回調（在更新按鈕之前），並傳遞舊顏色和新顏色
    if (this.onColorChanged) {
      this.onColorChanged(convertedColor, style, box, currentColor, currentStyle);
    }
    
    // 然後更新按鈕的顏色資料和外觀
    this.updateButtonColor(box, convertedColor, style);
    
    // 保存自定義顏色
    this.saveCustomColor(box.dataset.boxIndex, convertedColor, style);
    
    // 隱藏選擇器
    this.hideColorPicker();
  },
  
  /**
   * 將RGBA值轉換為適當的顏色格式
   * @param {number} r - 紅色值 (0-255)
   * @param {number} g - 綠色值 (0-255)
   * @param {number} b - 藍色值 (0-255)
   * @param {number} a - 透明度值 (0-100)
   * @param {string} style - 樣式類型
   * @returns {string} 轉換後的顏色格式
   */
  convertRgbaToFormat(r, g, b, a, style) {
    const alpha = a / 100; // 轉換為 0-1 範圍
    
    if (style === 'border') {
      return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    } else {
      // 背景式使用用戶選擇的透明度
      return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    }
  },
  
  /**
   * 從顏色字串中提取RGBA數值
   * @param {string} colorString - 顏色字串
   * @returns {Object} RGBA數值對象 {r, g, b, a}
   */
  extractRgbaValues(colorString) {
    // 解析 rgba() 格式
    const rgbaMatch = colorString.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
    if (rgbaMatch) {
      const alpha = rgbaMatch[4] ? parseFloat(rgbaMatch[4]) : 1.0;
      return {
        r: parseInt(rgbaMatch[1]),
        g: parseInt(rgbaMatch[2]),
        b: parseInt(rgbaMatch[3]),
        a: Math.round(alpha * 100) // 轉換為百分比
      };
    }
    
    // 如果是HEX格式，轉換為RGB，透明度預設為30%
    if (colorString.startsWith('#')) {
      const hex = colorString.substring(1);
      const r = parseInt(hex.substring(0, 2), 16);
      const g = parseInt(hex.substring(2, 4), 16);
      const b = parseInt(hex.substring(4, 6), 16);
      return { r, g, b, a: 30 };
    }
    
    // 預設返回半透明紅色
    return { r: 255, g: 0, b: 0, a: 30 };
  },
  
  /**
   * 綁定顏色按鈕事件
   * @param {NodeList} colorBoxes - 顏色按鈕集合
   */
  bindColorBoxEvents(colorBoxes) {
    if (!colorBoxes) {
      LogUtils.warn('顏色按鈕集合為空');
      return;
    }
    
    colorBoxes.forEach((box, index) => {
      // 儲存按鈕的原始資訊
      box.dataset.originalColor = box.dataset.color;
      box.dataset.originalStyle = box.dataset.style;
      box.dataset.boxIndex = index;
      
      // 綁定點擊事件（處理單擊和雙擊）
      box.addEventListener('click', (e) => {
        this.handleColorBoxClick(e, box);
      });
      
      // 添加右鍵菜單功能（重置為預設顏色）
      box.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        this.resetToOriginalColor(box);
      });
      
      // 添加鼠標懸停提示
      this.updateTooltip(box);
    });
    
    LogUtils.log(`已綁定 ${colorBoxes.length} 個顏色按鈕事件`);
  },
  
  /**
   * 處理顏色按鈕點擊事件
   * @param {Event} event - 點擊事件
   * @param {HTMLElement} box - 顏色按鈕元素
   */
  handleColorBoxClick(event, box) {
    event.preventDefault();
    
    const boxIndex = box.dataset.boxIndex;
    const now = Date.now();
    
    // 檢查是否有正在進行的計時器
    if (this.clickTimers.has(boxIndex)) {
      // 這是雙擊
      clearTimeout(this.clickTimers.get(boxIndex));
      this.clickTimers.delete(boxIndex);
      
      // 處理雙擊事件
      this.handleDoubleClick(box);
    } else {
      // 這可能是單擊，設置延遲檢查
      const timer = setTimeout(() => {
        this.clickTimers.delete(boxIndex);
        // 處理單擊事件
        this.handleSingleClick(box);
      }, this.DOUBLE_CLICK_DELAY);
      
      this.clickTimers.set(boxIndex, timer);
    }
  },
  
  /**
   * 處理單擊事件（使用當前顏色）
   * @param {HTMLElement} box - 顏色按鈕元素
   */
  handleSingleClick(box) {
    // 使用當前顏色（如果有自定義顏色則使用自定義顏色，否則使用原始顏色）
    const currentColor = box.dataset.currentColor || box.dataset.color;
    const currentStyle = box.dataset.currentStyle || box.dataset.style;
    
    const isCustomColor = box.dataset.currentColor && box.dataset.currentColor !== box.dataset.color;
    LogUtils.log(`🎨 單擊顏色按鈕，使用${isCustomColor ? '自定義' : '預設'}顏色:`, currentColor);
    
    // 調用外部的顏色變更回調
    if (this.onColorChanged) {
      this.onColorChanged(currentColor, currentStyle, box);
    }
  },
  
  /**
   * 處理雙擊事件（彈出RGB滑桿顏色選擇器）
   * @param {HTMLElement} box - 顏色按鈕元素
   */
  handleDoubleClick(box) {
    LogUtils.log('🎨🎨 雙擊顏色按鈕，彈出RGB滑桿顏色選擇器');
    
    this.currentBox = box; // 儲存當前操作的按鈕
    
    // 獲取當前顏色
    const currentColor = box.dataset.currentColor || box.dataset.color;
    
    // 顯示RGB滑桿選擇器
    this.showColorPicker(currentColor);
  },
  

  
  /**
   * 重置按鈕為原始顏色
   * @param {HTMLElement} box - 顏色按鈕元素
   */
  resetToOriginalColor(box) {
    LogUtils.log('🔄 重置按鈕為原始顏色');
    
    const originalColor = box.dataset.originalColor;
    const originalStyle = box.dataset.originalStyle;
    
    // 在更新按鈕之前，先保存當前顏色用於回調
    const currentColor = box.dataset.currentColor || originalColor;
    const currentStyle = box.dataset.currentStyle || originalStyle;
    
    // 先調用外部的顏色變更回調（在更新按鈕之前），並傳遞舊顏色和新顏色
    if (this.onColorChanged) {
      this.onColorChanged(originalColor, originalStyle, box, currentColor, currentStyle);
    }
    
    // 然後更新按鈕的顏色資料和外觀
    this.updateButtonColor(box, originalColor, originalStyle);
    
    // 移除自定義顏色記錄
    this.removeCustomColor(box.dataset.boxIndex);
  },
  
  /**
   * 更新按鈕顏色和外觀
   * @param {HTMLElement} box - 顏色按鈕元素
   * @param {string} color - 新顏色
   * @param {string} style - 樣式類型
   */
  updateButtonColor(box, color, style) {
    // 更新當前顏色屬性（用於檢測是否自定義）
    box.dataset.currentColor = color;
    box.dataset.currentStyle = style;
    
    // 更新視覺外觀
    if (style === 'border') {
      box.style.color = this.extractRgbColor(color);
      box.style.backgroundColor = '#fff';
    } else {
      box.style.backgroundColor = color;
      box.style.color = '';
    }
    
    // 更新提示文字和自定義指示器
    this.updateTooltip(box);
    
    LogUtils.log('✅ 按鈕顏色已更新:', { color, style });
  },
  

  
  /**
   * 從顏色字串中提取RGB顏色（轉為HEX）
   * @param {string} colorString - 顏色字串（如 rgba(255,0,0,0.3) 或 rgb(255,0,0)）
   * @returns {string} HEX顏色（如 #ff0000）
   */
  extractRgbColor(colorString) {
    const rgbaMatch = colorString.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
    if (rgbaMatch) {
      const r = parseInt(rgbaMatch[1]);
      const g = parseInt(rgbaMatch[2]);
      const b = parseInt(rgbaMatch[3]);
      return this.rgbToHex(r, g, b);
    }
    
    // 如果已經是HEX格式，直接返回
    if (colorString.startsWith('#')) {
      return colorString;
    }
    
    // 預設返回黑色
    return '#000000';
  },
  
  /**
   * HEX轉RGB
   * @param {string} hex - HEX顏色
   * @returns {Object} RGB物件
   */
  hexToRgb(hex) {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? {
      r: parseInt(result[1], 16),
      g: parseInt(result[2], 16),
      b: parseInt(result[3], 16)
    } : null;
  },
  
  /**
   * RGB轉HEX
   * @param {number} r - 紅色值
   * @param {number} g - 綠色值
   * @param {number} b - 藍色值
   * @returns {string} HEX顏色
   */
  rgbToHex(r, g, b) {
    return "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
  },
  
  /**
   * 更新按鈕提示文字
   * @param {HTMLElement} box - 顏色按鈕元素
   */
  updateTooltip(box) {
    const currentColor = box.dataset.currentColor || box.dataset.color;
    const originalColor = box.dataset.originalColor || box.dataset.color;
    const isCustom = currentColor !== originalColor;
    const colorType = box.dataset.originalStyle === 'border' ? '外框式' : '背景式';
    
    if (isCustom) {
      // 添加自定義顏色樣式類，顯示✨標記和發光效果
      box.classList.add('custom-color');
      box.title = `${colorType}高亮 (自定義)\n單擊：應用顏色\n雙擊：修改顏色\n右鍵：重置顏色`;
      LogUtils.log('🎨✨ 顯示自定義顏色指示器:', { 
        button: box.dataset.boxIndex || 'unknown',
        currentColor: currentColor,
        originalColor: originalColor 
      });
    } else {
      // 移除自定義顏色樣式類
      box.classList.remove('custom-color');
      box.title = `${colorType}高亮\n單擊：應用顏色\n雙擊：自定義顏色`;
    }
  },
  
  /**
   * 保存自定義顏色到 Chrome Storage
   * @param {string} boxIndex - 按鈕索引
   * @param {string} color - 顏色值
   * @param {string} style - 樣式類型
   */
  saveCustomColor(boxIndex, color, style) {
    const key = `customHighlightColor_${boxIndex}`;
    const data = { color, style, timestamp: Date.now() };
    
    chrome.storage.local.set({ [key]: data }, () => {
      LogUtils.log('💾 自定義顏色已保存:', { boxIndex, color, style });
    });
  },
  
  /**
   * 移除自定義顏色記錄
   * @param {string} boxIndex - 按鈕索引
   */
  removeCustomColor(boxIndex) {
    const key = `customHighlightColor_${boxIndex}`;
    
    chrome.storage.local.remove([key], () => {
      LogUtils.log('🗑️ 自定義顏色記錄已移除:', boxIndex);
    });
  },
  
  /**
   * 載入保存的自定義顏色
   * @param {NodeList} colorBoxes - 顏色按鈕集合
   */
  async loadCustomColors(colorBoxes) {
    LogUtils.log('📂 載入保存的自定義顏色...');
    
    const keys = [];
    colorBoxes.forEach((box, index) => {
      keys.push(`customHighlightColor_${index}`);
    });
    
    return new Promise((resolve) => {
      chrome.storage.local.get(keys, (result) => {
        let loadedCount = 0;
        
        colorBoxes.forEach((box, index) => {
          const key = `customHighlightColor_${index}`;
          const customColor = result[key];
          
          if (customColor) {
            this.updateButtonColor(box, customColor.color, customColor.style);
            loadedCount++;
          }
        });
        
        LogUtils.log(`📥 已載入 ${loadedCount} 個自定義顏色`);
        resolve(loadedCount);
      });
    });
  },
  
  /**
   * 清理資源
   */
  cleanup() {
    // 清理計時器
    this.clickTimers.forEach(timer => clearTimeout(timer));
    this.clickTimers.clear();
    
    // 隱藏RGB顏色選擇器
    this.hideColorPicker();
    
    // 移除RGB顏色選擇器面板和遮罩
    if (this.colorPickerPanel && this.colorPickerPanel.parentNode) {
      this.colorPickerPanel.parentNode.removeChild(this.colorPickerPanel);
    }
    if (this.colorPickerOverlay && this.colorPickerOverlay.parentNode) {
      this.colorPickerOverlay.parentNode.removeChild(this.colorPickerOverlay);
    }
    
    this.isInitialized = false;
    this.currentBox = null;
    this.onColorChanged = null;
    this.colorPickerPanel = null;
    this.colorPickerOverlay = null;
    this.rgbaSliders = {};
    
    LogUtils.log('🧹 HighlightColorPicker 資源已清理');
  }
};

// 暴露到全局作用域
window.HighlightColorPicker = HighlightColorPicker; 