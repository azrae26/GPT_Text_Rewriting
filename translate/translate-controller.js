/* global TranslateConfig, Notification */
/**
 * translate-controller.js - 翻譯流程控制模組
 * 功能：管理翻譯流程的狀態和控制機制
 * 職責：
 * - 狀態管理：管理翻譯流程的各個狀態
 * - 取消機制：提供統一的取消控制
 * - 觀察者模式：通知狀態變更給訂閱者
 * - 錯誤邊界：統一的取消檢查和錯誤處理
 * 
 * 依賴：
 * - TranslateConfig：配置常數
 * - Notification：通知系統（用於取消時清理）
 */

/**
 * 翻譯狀態管理器
 * 統一管理翻譯流程的狀態和取消機制
 */
class TranslationController {
  constructor() {
    this.abortController = new AbortController();
    this.state = 'idle'; // idle, translating, reflecting, optimizing, completed, cancelled
    this.currentPhase = '';
    this.observers = new Set(); // 狀態觀察者
  }

  // 狀態管理
  setState(newState, phase = '') {
    // 安全檢查：如果當前狀態是 cancelled，不允許設置為 completed
    if (this.state === 'cancelled' && newState === 'completed') {
      console.log(`[TranslationController] 拒絕狀態變更: ${this.state} → ${newState} (已取消的流程不能變為完成)`);
      return;
    }
    
    console.log(`[TranslationController] 狀態變更: ${this.state} → ${newState}${phase ? ` (${phase})` : ''}`);
    this.state = newState;
    this.currentPhase = phase;
    this._notifyObservers();
  }

  /**
   * 檢查控制器是否處於活動狀態
   * @returns {boolean} 是否活動
   */
  isActive() {
    return ['translating', 'reflecting', 'optimizing'].includes(this.state);
  }

  /**
   * 檢查是否已取消
   * @returns {boolean} 是否已取消
   */
  isCancelled() {
    return this.state === 'cancelled' || this.abortController.signal.aborted;
  }

  /**
   * 取消翻譯流程
   */
  cancel() {
    console.log('[TranslationController] 執行取消操作');
    this.setState('cancelled');
    this.abortController.abort();
    
    // 清理通知
    if (window.Notification && window.Notification.clearAllTimers) {
      window.Notification.clearAllTimers();
    }
  }

  /**
   * 重置控制器狀態
   */
  reset() {
    console.log('[TranslationController] 重置控制器');
    
    if (this.abortController) {
      this.abortController.abort();
    }
    
    this.abortController = new AbortController();
    this.setState('idle');
    this.observers.clear();
  }

  /**
   * 檢查取消狀態，如果已取消則拋出錯誤
   * @throws {Error} 翻譯請求已取消
   */
  checkCancellation() {
    if (this.isCancelled()) {
      throw new Error('翻譯請求已取消');
    }
  }

  /**
   * 訂閱狀態變更
   * @param {Function} observer - 觀察者函數 (state, phase) => void
   * @returns {Function} 取消訂閱函數
   */
  subscribe(observer) {
    this.observers.add(observer);
    return () => this.observers.delete(observer); // 返回取消訂閱函數
  }

  /**
   * 通知所有觀察者狀態變更
   * @private
   */
  _notifyObservers() {
    this.observers.forEach(observer => {
      try {
        observer(this.state, this.currentPhase);
      } catch (error) {
        console.error('[TranslationController] 通知觀察者時出錯:', error);
      }
    });
  }

  /**
   * 獲取 AbortSignal，用於中止請求
   * @returns {AbortSignal} 中止信號
   */
  get signal() {
    return this.abortController.signal;
  }

  /**
   * 獲取當前狀態
   * @returns {string} 當前狀態
   */
  getState() {
    return this.state;
  }

  /**
   * 獲取當前階段
   * @returns {string} 當前階段
   */
  getPhase() {
    return this.currentPhase;
  }

  /**
   * 檢查狀態轉換是否有效
   * @param {string} fromState - 來源狀態
   * @param {string} toState - 目標狀態
   * @returns {boolean} 是否有效
   * @private
   */
  _isValidTransition(fromState, toState) {
    // 定義有效的狀態轉換
    const validTransitions = {
      'idle': ['translating'],
      'translating': ['reflecting', 'cancelled', 'completed'],
      'reflecting': ['optimizing', 'cancelled', 'completed'],
      'optimizing': ['completed', 'cancelled'],
      'completed': ['idle'],
      'cancelled': ['idle']
    };

    return validTransitions[fromState]?.includes(toState) ?? false;
  }
}

// 導出到全局
window.TranslationController = TranslationController;

console.log('[TranslationController] 翻譯控制器模組已載入'); 