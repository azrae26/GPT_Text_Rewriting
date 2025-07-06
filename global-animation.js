/**
 * 全域動畫腳本
 * 在所有網站右下角顯示 AI 動畫
 */

// 避免重複執行
if (window.globalAnimationLoaded) {
  console.log('[GlobalAnimation] 已載入，跳過重複執行');
} else {
  window.globalAnimationLoaded = true;
  
  console.log('[GlobalAnimation] 開始初始化全域動畫');

  // 等待 Rive 載入完成
  function waitForRive() {
    return new Promise((resolve) => {
      if (window.rive && window.rive.Rive) {
        console.log('[GlobalAnimation] 🎉 真正的 Rive 庫已載入');
        resolve();
      } else {
        // 檢查載入狀態
        const checkRive = () => {
          if (window.rive && window.rive.Rive) {
            console.log('[GlobalAnimation] 🎉 真正的 Rive 庫載入完成');
            resolve();
          } else {
            setTimeout(checkRive, 100);
          }
        };
        
        checkRive();
        
        // 給足夠時間載入真正的庫
        setTimeout(() => {
          console.log('[GlobalAnimation] ⚠️ Rive 載入超時');
          resolve();
        }, 5000);
      }
    });
  }

  // 檢查是否應該顯示動畫
  function shouldShowAnimation() {
    // 排除某些不適合的網站
    const excludePatterns = [
      'chrome-extension://',
      'moz-extension://',
      'about:',
      'file://',
      'localhost'
    ];
    
    if (excludePatterns.some(pattern => window.location.href.includes(pattern))) {
      return false;
    }
    
    return true;
  }

  // 創建動畫
  async function createGlobalAnimation() {
    try {
      // 檢查是否應該顯示動畫
      if (!shouldShowAnimation()) {
        console.log('[GlobalAnimation] 不需要顯示動畫');
        return;
      }
      
      await waitForRive();
      
      // 檢查是否已存在動畫
      if (document.getElementById('global-rive-animation')) {
        console.log('[GlobalAnimation] 動畫已存在');
        return;
      }

      // 創建容器
      const container = document.createElement('div');
      container.id = 'global-rive-animation';
      
      // 從localStorage讀取保存的位置
      const savedPosition = localStorage.getItem('rive-animation-position');
      let position = { right: 20, bottom: 20 };
      if (savedPosition) {
        try {
          position = JSON.parse(savedPosition);
        } catch (e) {
          console.log('[GlobalAnimation] 使用默認位置');
        }
      }
      
      // 設置容器樣式，使用 left/top 而不是 right/bottom 以便拖拽
      container.style.cssText = `
        position: fixed !important;
        left: ${position.left || (window.innerWidth - 164)}px !important;
        top: ${position.top || (window.innerHeight - 164)}px !important;
        width: 144px !important;
        height: 144px !important;
        z-index: 999999 !important;
        pointer-events: auto !important;
        border-radius: 50% !important;
        overflow: hidden !important;
        box-shadow: none !important;
        transition: transform 0.3s ease !important;
        cursor: move !important;
        user-select: none !important;
      `;
      
      // 拖拽相關變量
      let isDragging = false;
      let dragOffset = { x: 0, y: 0 };
      let isHovering = false;
      
      // 保存位置到localStorage
      function savePosition() {
        const rect = container.getBoundingClientRect();
        const currentPosition = {
          left: rect.left,
          top: rect.top
        };
        localStorage.setItem('rive-animation-position', JSON.stringify(currentPosition));
      }
      
      // 鼠標按下開始拖拽
      container.addEventListener('mousedown', (e) => {
        isDragging = true;
        const rect = container.getBoundingClientRect();
        dragOffset.x = e.clientX - rect.left;
        dragOffset.y = e.clientY - rect.top;
        
        // 防止拖拽時觸發懸停效果
        container.style.transition = 'none';
        
        e.preventDefault();
      });
      
      // 鼠標移動時更新位置
      document.addEventListener('mousemove', (e) => {
        if (!isDragging) return;
        
        const newLeft = e.clientX - dragOffset.x;
        const newTop = e.clientY - dragOffset.y;
        
        // 限制在視窗內
        const maxLeft = window.innerWidth - 144;
        const maxTop = window.innerHeight - 144;
        
        const constrainedLeft = Math.max(0, Math.min(newLeft, maxLeft));
        const constrainedTop = Math.max(0, Math.min(newTop, maxTop));
        
        container.style.left = constrainedLeft + 'px';
        container.style.top = constrainedTop + 'px';
      });
      
      // 鼠標松開結束拖拽
      document.addEventListener('mouseup', () => {
        if (isDragging) {
          isDragging = false;
          
          // 恢復過渡效果
          container.style.transition = 'transform 0.3s ease';
          
          // 保存位置
          savePosition();
        }
      });
      
      // 懸停效果（只在不拖拽時觸發）
      container.addEventListener('mouseenter', () => {
        if (!isDragging) {
          isHovering = true;
          container.style.transform = 'scale(1.2)';
        }
      });
      
      container.addEventListener('mouseleave', () => {
        isHovering = false;
        if (!isDragging) {
          container.style.transform = 'scale(1)';
        }
      });
      
      // 防止拖拽時的意外縮放
      container.addEventListener('dragstart', (e) => {
        e.preventDefault();
      });

      // 創建 canvas
      const canvas = document.createElement('canvas');
      canvas.style.cssText = `
        width: 100% !important;
        height: 100% !important;
        border-radius: 50% !important;
        box-shadow: none !important;
        border: none !important;
        background: transparent !important;
      `;
      canvas.width = 288;  // 降低解析度，從450減少到288以提高性能
      canvas.height = 288;

      container.appendChild(canvas);
      document.body.appendChild(container);

      // 載入真正的 Rive 動畫！
      if (window.rive && window.rive.Rive) {
        try {
          const animationUrl = chrome.runtime.getURL('images/ai_voice_tm.riv');
          console.log('[GlobalAnimation] 🚀 開始載入 Rive 動畫');
          
          const riveInstance = new window.rive.Rive({
            src: animationUrl,
            canvas: canvas,
            autoplay: true,
            stateMachines: 'State Machine 1',
            fit: window.rive?.Fit?.contain || 'contain',
            alignment: window.rive?.Alignment?.center || 'center',
            playbackSpeed: 2.0,  // 🚀 在創建時就設置2倍速
            speed: 2.0,          // 🚀 備用速度設置
            onLoad: () => {
              console.log('[GlobalAnimation] 🎉 Rive 動畫載入成功！');
              
              // 確保 canvas 尺寸正確
              if (riveInstance.resizeDrawingSurfaceToCanvas) {
                riveInstance.resizeDrawingSurfaceToCanvas();
              }
              
              // 🚀 設置播放速度為2倍速 - 使用更詳細的方法
              console.log('[GlobalAnimation] 🔍 嘗試設置2倍速...');
              
              // 方法1: 直接設置實例的播放速度
              if (riveInstance.playbackSpeed !== undefined) {
                riveInstance.playbackSpeed = 2.0;
                console.log('[GlobalAnimation] ✅ 設置 playbackSpeed = 2.0');
              }
              
              // 方法2: 設置speed屬性
              if (riveInstance.speed !== undefined) {
                riveInstance.speed = 2.0;
                console.log('[GlobalAnimation] ✅ 設置 speed = 2.0');
              }
              
              // 方法3: 嘗試設置動畫器的播放速度
              if (riveInstance.animator && riveInstance.animator.speed !== undefined) {
                riveInstance.animator.speed = 2.0;
                console.log('[GlobalAnimation] ✅ 設置 animator.speed = 2.0');
              }
              
              // 方法4: 延遲設置狀態機速度（確保狀態機完全啟動）
              setTimeout(() => {
                if (riveInstance.activeStateMachines && riveInstance.activeStateMachines.length > 0) {
                  riveInstance.activeStateMachines.forEach((stateMachine, index) => {
                    console.log(`[GlobalAnimation] 🔍 檢查狀態機 ${index + 1}:`, stateMachine);
                    
                    // 嘗試不同的速度設置方式
                    if (stateMachine.speed !== undefined) {
                      stateMachine.speed = 2.0;
                      console.log(`[GlobalAnimation] ✅ 狀態機 ${index + 1} speed = 2.0`);
                    }
                    
                    if (stateMachine.playbackSpeed !== undefined) {
                      stateMachine.playbackSpeed = 2.0;
                      console.log(`[GlobalAnimation] ✅ 狀態機 ${index + 1} playbackSpeed = 2.0`);
                    }
                    
                    // 嘗試設置狀態機的全局速度
                    if (stateMachine.globalSpeed !== undefined) {
                      stateMachine.globalSpeed = 2.0;
                      console.log(`[GlobalAnimation] ✅ 狀態機 ${index + 1} globalSpeed = 2.0`);
                    }
                  });
                } else {
                  console.log('[GlobalAnimation] ⚠️ 沒有找到活躍的狀態機，嘗試其他方法...');
                  
                  // 如果沒有活躍的狀態機，嘗試設置文件級別的速度
                  if (riveInstance.file && riveInstance.file.defaultArtboard) {
                    const artboard = riveInstance.file.defaultArtboard();
                    if (artboard && artboard.animationCount && artboard.animationCount() > 0) {
                      for (let i = 0; i < artboard.animationCount(); i++) {
                        const animation = artboard.animationByIndex(i);
                        if (animation && animation.speed !== undefined) {
                          animation.speed = 2.0;
                          console.log(`[GlobalAnimation] ✅ 動畫 ${i} speed = 2.0`);
                        }
                      }
                    }
                  }
                  
                  // 🚀 嘗試直接通過狀態機輸入設置速度
                  try {
                    const stateMachineInputs = riveInstance.stateMachineInputs('State Machine 1');
                    if (stateMachineInputs && stateMachineInputs.length > 0) {
                      console.log('[GlobalAnimation] 🔍 找到狀態機輸入:', stateMachineInputs);
                      
                      // 查找速度相關的輸入
                      stateMachineInputs.forEach((input, index) => {
                        console.log(`[GlobalAnimation] 🔍 輸入 ${index}:`, input.name, input.type);
                        if (input.name && input.name.toLowerCase().includes('speed')) {
                          if (input.value !== undefined) {
                            input.value = 2.0;
                            console.log(`[GlobalAnimation] ✅ 設置速度輸入 ${input.name} = 2.0`);
                          }
                        }
                      });
                    }
                  } catch (e) {
                    console.log('[GlobalAnimation] ⚠️ 無法獲取狀態機輸入:', e);
                  }
                }
              }, 200);
              
              // 🚀 額外的強制速度設置
              setTimeout(() => {
                if (riveInstance.artboard) {
                  // 嘗試設置 artboard 級別的速度
                  if (riveInstance.artboard.speed !== undefined) {
                    riveInstance.artboard.speed = 2.0;
                    console.log('[GlobalAnimation] ✅ 設置 artboard.speed = 2.0');
                  }
                  
                  // 嘗試設置渲染器的速度
                  if (riveInstance.renderer && riveInstance.renderer.speed !== undefined) {
                    riveInstance.renderer.speed = 2.0;
                    console.log('[GlobalAnimation] ✅ 設置 renderer.speed = 2.0');
                  }
                }
              }, 300);
              
              // 🔍 驗證速度設置是否成功
              setTimeout(() => {
                console.log('[GlobalAnimation] 🔍 驗證當前播放速度:');
                console.log('[GlobalAnimation] 🔍 playbackSpeed:', riveInstance.playbackSpeed);
                console.log('[GlobalAnimation] 🔍 speed:', riveInstance.speed);
                
                if (riveInstance.activeStateMachines && riveInstance.activeStateMachines.length > 0) {
                  riveInstance.activeStateMachines.forEach((stateMachine, index) => {
                    console.log(`[GlobalAnimation] 🔍 狀態機 ${index + 1} 速度:`, {
                      speed: stateMachine.speed,
                      playbackSpeed: stateMachine.playbackSpeed,
                      globalSpeed: stateMachine.globalSpeed
                    });
                  });
                }
              }, 500);
              
              console.log('[GlobalAnimation] ✅ 動畫已啟動');
            },
            onLoadError: (error) => {
              console.error('[GlobalAnimation] ❌ Rive 動畫載入失敗:', error);
            }
          });
          
          console.log('[GlobalAnimation] ✅ Rive 實例已創建');
          
        } catch (error) {
          console.error('[GlobalAnimation] ❌ 創建 Rive 實例失敗:', error);
        }
      } else {
        console.error('[GlobalAnimation] ❌ Rive 庫未載入');
        console.error('[GlobalAnimation] 🔍 window.rive:', window.rive);
      }

    } catch (error) {
      console.error('[GlobalAnimation] 創建動畫失敗:', error);
    }
  }

  // 等待頁面載入完成後創建動畫
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', createGlobalAnimation);
  } else {
    // 延遲一下確保頁面完全載入
    setTimeout(createGlobalAnimation, 500);
  }
} 