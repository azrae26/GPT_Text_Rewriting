/**
 * 替換功能存儲管理模組
 * 
 * 職責：
 * - 統一管理規則的儲存和載入
 * - 處理數據驗證和過濾
 * - 提供DOM規則提取功能
 * - 管理存儲鍵值
 * 
 * 依賴：
 * - replace-core.js (ReplaceCore)
 * - replace-ui-factory.js (ReplaceUIFactory)
 */

const ReplaceStorageManager = {
  /**
   * 保存規則到存儲
   * @param {string} storageKey - 存儲鍵名
   * @param {Array} rules - 規則數組
   * @param {Function} callback - 完成回調
   */
  saveRules(storageKey, rules, callback = null) {
    try {
      // 驗證和清理規則
      const cleanRules = this._cleanRules(rules);
      
      // 創建存儲對象
      const storageData = {
        [storageKey]: cleanRules
      };
      
      // 保存到本地存儲
      chrome.storage.local.set(storageData, () => {
        if (chrome.runtime.lastError) {
          ReplaceCore.Logger.error('保存規則失敗', chrome.runtime.lastError, 'ReplaceStorageManager');
        } else {
          ReplaceCore.Logger.info(`規則保存成功: ${storageKey}, 數量: ${cleanRules.length}`, 'ReplaceStorageManager');
        }
        
        if (callback) {
          callback(chrome.runtime.lastError ? false : true);
        }
      });
      
    } catch (error) {
      ReplaceCore.Logger.error('保存規則時發生錯誤', error, 'ReplaceStorageManager');
      if (callback) {
        callback(false);
      }
    }
  },

  /**
   * 從存儲載入規則
   * @param {string} storageKey - 存儲鍵名
   * @param {Array} defaultValue - 預設值
   * @param {Function} callback - 完成回調
   */
  loadRules(storageKey, defaultValue = [], callback = null) {
    try {
      chrome.storage.local.get([storageKey], (result) => {
        if (chrome.runtime.lastError) {
          ReplaceCore.Logger.error('載入規則失敗', chrome.runtime.lastError, 'ReplaceStorageManager');
          if (callback) {
            callback(defaultValue);
          }
          return;
        }
        
        const rules = result[storageKey] || defaultValue;
        const cleanRules = this._cleanRules(rules);
        
        ReplaceCore.Logger.info(`規則載入成功: ${storageKey}, 數量: ${cleanRules.length}`, 'ReplaceStorageManager');
        
        if (callback) {
          callback(cleanRules);
        }
      });
      
    } catch (error) {
      ReplaceCore.Logger.error('載入規則時發生錯誤', error, 'ReplaceStorageManager');
      if (callback) {
        callback(defaultValue);
      }
    }
  },

  /**
   * 從DOM元素提取規則
   * @param {Object} options - 配置選項
   * @param {HTMLElement} options.container - 容器元素
   * @param {string} options.groupSelector - 組選擇器
   * @param {boolean} options.includeMainGroup - 是否包含主組
   * @returns {Array} 提取的規則數組
   */
  extractRulesFromDOM(options) {
    const {
      container,
      groupSelector = '.replace-extra-group',
      includeMainGroup = false
    } = options;

    if (!container) {
      ReplaceCore.Logger.warn('容器元素不存在，無法提取規則', 'ReplaceStorageManager');
      return [];
    }

    const rules = [];

    try {
      // 如果包含主組，先處理主組
      if (includeMainGroup) {
        const mainGroup = container.querySelector('.replace-main-group');
        if (mainGroup) {
          const mainRule = this._extractRuleFromGroup(mainGroup);
          if (mainRule) {
            rules.push(mainRule);
          }
        }
      }

      // 處理其他組
      const groups = container.querySelectorAll(groupSelector);
      groups.forEach(group => {
        const rule = this._extractRuleFromGroup(group);
        if (rule) {
          rules.push(rule);
        }
      });

      ReplaceCore.Logger.info(`從DOM提取到 ${rules.length} 個規則`, 'ReplaceStorageManager');
      
    } catch (error) {
      ReplaceCore.Logger.error('從DOM提取規則時發生錯誤', error, 'ReplaceStorageManager');
    }

    return this._cleanRules(rules);
  },

  /**
   * 從單個組元素提取規則
   * @param {HTMLElement} group - 組元素
   * @returns {Object|null} 提取的規則對象
   */
  _extractRuleFromGroup(group) {
    try {
      // 查找輸入框元素
      const inputs = group.querySelectorAll('input, textarea');
      const fromInput = inputs[0];
      const toInput = inputs[1];

      if (!fromInput || !toInput) {
        return null;
      }

      // 獲取輸入框的值（處理容器包裝的情況）
      const fromValue = ReplaceUIFactory.getValue(fromInput) || '';
      const toValue = ReplaceUIFactory.getValue(toInput) || '';

      // 檢查是否為有效規則
      if (!fromValue.trim() && !toValue.trim()) {
        return null;
      }

      // 提取其他屬性（如果存在）
      const rule = {
        from: fromValue,
        to: toValue
      };

      // 如果是自動替換組，可能有開啟狀態
      const checkbox = group.querySelector('input[type="checkbox"]');
      if (checkbox) {
        rule.enabled = checkbox.checked;
      }

      return rule;
      
    } catch (error) {
      ReplaceCore.Logger.error('從組提取規則時發生錯誤', error, 'ReplaceStorageManager');
      return null;
    }
  },

  /**
   * 清理和驗證規則數組
   * @param {Array} rules - 原始規則數組
   * @returns {Array} 清理後的規則數組
   */
  _cleanRules(rules) {
    if (!Array.isArray(rules)) {
      ReplaceCore.Logger.warn('規則不是數組，返回空數組', 'ReplaceStorageManager');
      return [];
    }

    return rules
      .map(rule => this._cleanRule(rule))
      .filter(rule => rule !== null);
  },

  /**
   * 清理和驗證單個規則
   * @param {Object} rule - 原始規則對象
   * @returns {Object|null} 清理後的規則對象
   */
  _cleanRule(rule) {
    if (!rule || typeof rule !== 'object') {
      return null;
    }

    try {
      const cleanRule = {
        from: this._cleanString(rule.from),
        to: this._cleanString(rule.to)
      };

      // 保留其他有效屬性
      if (typeof rule.enabled === 'boolean') {
        cleanRule.enabled = rule.enabled;
      }

      // 至少需要有一個字段有內容
      if (!cleanRule.from && !cleanRule.to) {
        return null;
      }

      return cleanRule;
      
    } catch (error) {
      ReplaceCore.Logger.error('清理規則時發生錯誤', error, 'ReplaceStorageManager');
      return null;
    }
  },

  /**
   * 清理字符串
   * @param {any} value - 原始值
   * @returns {string} 清理後的字符串
   */
  _cleanString(value) {
    if (typeof value !== 'string') {
      return '';
    }
    
    // 移除前後空白，但保留內容中的空白
    return value.trim();
  },

  /**
   * 批量操作：保存多個存儲鍵
   * @param {Object} storageData - 存儲數據對象
   * @param {Function} callback - 完成回調
   */
  batchSave(storageData, callback = null) {
    try {
      const cleanData = {};
      
      // 清理所有數據
      Object.entries(storageData).forEach(([key, rules]) => {
        if (Array.isArray(rules)) {
          cleanData[key] = this._cleanRules(rules);
        } else {
          cleanData[key] = rules; // 非規則數據直接保存
        }
      });

      chrome.storage.local.set(cleanData, () => {
        if (chrome.runtime.lastError) {
          ReplaceCore.Logger.error('批量保存失敗', chrome.runtime.lastError, 'ReplaceStorageManager');
        } else {
          ReplaceCore.Logger.info(`批量保存成功: ${Object.keys(cleanData).length} 個鍵`, 'ReplaceStorageManager');
        }
        
        if (callback) {
          callback(chrome.runtime.lastError ? false : true);
        }
      });
      
    } catch (error) {
      ReplaceCore.Logger.error('批量保存時發生錯誤', error, 'ReplaceStorageManager');
      if (callback) {
        callback(false);
      }
    }
  },

  /**
   * 批量操作：載入多個存儲鍵
   * @param {Array} storageKeys - 存儲鍵數組
   * @param {Function} callback - 完成回調
   */
  batchLoad(storageKeys, callback = null) {
    try {
      chrome.storage.local.get(storageKeys, (result) => {
        if (chrome.runtime.lastError) {
          ReplaceCore.Logger.error('批量載入失敗', chrome.runtime.lastError, 'ReplaceStorageManager');
          if (callback) {
            callback({});
          }
          return;
        }
        
        const cleanResult = {};
        
        // 清理載入的數據
        Object.entries(result).forEach(([key, value]) => {
          if (Array.isArray(value)) {
            cleanResult[key] = this._cleanRules(value);
          } else {
            cleanResult[key] = value;
          }
        });
        
        ReplaceCore.Logger.info(`批量載入成功: ${Object.keys(cleanResult).length} 個鍵`, 'ReplaceStorageManager');
        
        if (callback) {
          callback(cleanResult);
        }
      });
      
    } catch (error) {
      ReplaceCore.Logger.error('批量載入時發生錯誤', error, 'ReplaceStorageManager');
      if (callback) {
        callback({});
      }
    }
  },

  /**
   * 檢查存儲鍵是否存在
   * @param {string} storageKey - 存儲鍵名
   * @param {Function} callback - 完成回調
   */
  keyExists(storageKey, callback) {
    try {
      chrome.storage.local.get([storageKey], (result) => {
        const exists = result.hasOwnProperty(storageKey);
        if (callback) {
          callback(exists);
        }
      });
    } catch (error) {
      ReplaceCore.Logger.error('檢查存儲鍵時發生錯誤', error, 'ReplaceStorageManager');
      if (callback) {
        callback(false);
      }
    }
  },

  /**
   * 移除存儲鍵
   * @param {string|Array} storageKeys - 存儲鍵名或數組
   * @param {Function} callback - 完成回調
   */
  removeKeys(storageKeys, callback = null) {
    try {
      const keys = Array.isArray(storageKeys) ? storageKeys : [storageKeys];
      
      chrome.storage.local.remove(keys, () => {
        if (chrome.runtime.lastError) {
          ReplaceCore.Logger.error('移除存儲鍵失敗', chrome.runtime.lastError, 'ReplaceStorageManager');
        } else {
          ReplaceCore.Logger.info(`移除存儲鍵成功: ${keys.join(', ')}`, 'ReplaceStorageManager');
        }
        
        if (callback) {
          callback(chrome.runtime.lastError ? false : true);
        }
      });
      
    } catch (error) {
      ReplaceCore.Logger.error('移除存儲鍵時發生錯誤', error, 'ReplaceStorageManager');
      if (callback) {
        callback(false);
      }
    }
  },

  /**
   * 清理空規則
   * @param {string} storageKey - 存儲鍵名
   * @param {Function} callback - 完成回調
   */
  cleanupEmptyRules(storageKey, callback = null) {
    this.loadRules(storageKey, [], (rules) => {
      const originalCount = rules.length;
      const cleanRules = rules.filter(rule => 
        rule.from?.trim() || rule.to?.trim()
      );
      
      if (cleanRules.length !== originalCount) {
        this.saveRules(storageKey, cleanRules, (success) => {
          if (success) {
            ReplaceCore.Logger.info(
              `清理空規則: ${storageKey}, 原始: ${originalCount}, 清理後: ${cleanRules.length}`, 
              'ReplaceStorageManager'
            );
          }
          if (callback) {
            callback(success, cleanRules.length, originalCount);
          }
        });
      } else {
        if (callback) {
          callback(true, cleanRules.length, originalCount);
        }
      }
    });
  },

  /**
   * 獲取存儲統計信息
   * @param {Array} storageKeys - 存儲鍵數組
   * @param {Function} callback - 完成回調
   */
  getStorageStats(storageKeys, callback) {
    this.batchLoad(storageKeys, (result) => {
      const stats = {
        totalKeys: 0,
        totalRules: 0,
        emptyRules: 0,
        validRules: 0,
        keyDetails: {}
      };

      Object.entries(result).forEach(([key, rules]) => {
        if (Array.isArray(rules)) {
          stats.totalKeys++;
          stats.totalRules += rules.length;
          
          const validCount = rules.filter(rule => 
            rule.from?.trim() || rule.to?.trim()
          ).length;
          
          const emptyCount = rules.length - validCount;
          
          stats.validRules += validCount;
          stats.emptyRules += emptyCount;
          
          stats.keyDetails[key] = {
            total: rules.length,
            valid: validCount,
            empty: emptyCount
          };
        }
      });

      ReplaceCore.Logger.info('存儲統計信息', stats, 'ReplaceStorageManager');
      
      if (callback) {
        callback(stats);
      }
    });
  }
};

// 暴露到全局
window.ReplaceStorageManager = ReplaceStorageManager; 