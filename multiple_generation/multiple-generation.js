/* global GlobalSettings, Notification, TextProcessor */

// 常數配置
window.GenerationConfig = {
    // API 相關
    API: {
      RETRY: {
        MAX_RETRIES: 3,      // 最大重試次數
        DELAY: 10000,        // 重試延遲時間（毫秒）
        TIMEOUT: {
          GEMINI: {
            GENERATE: 20000,  // 生成超時時間（毫秒）
            REFLECT: 40000,   // 反思超時時間（毫秒）
            OPTIMIZE: 20000   // 優化超時時間（毫秒）
          },
          OPENAI: {
            GENERATE: 45000,  // 生成超時時間（毫秒）
            REFLECT: 55000,   // 反思超時時間（毫秒）
            OPTIMIZE: 45000   // 優化超時時間（毫秒）
          }
        }
      },
      INTERVAL: {
        WAIT: {
          NONE: 0,           // 無等待
          SHORT: 2000,       // 短等待（2秒）
          LONG: 2000         // 長等待（2秒）
        }
      }
    },
    
    // 批次處理相關
    BATCH: {
      INTERVALS: [
        [5, 500],    // 5次以下，0.5秒
        [10, 1000],  // 10次以下，1秒
        [15, 3000],  // 15次以下，3秒
        [20, 5000],  // 20次以下，5秒
        [25, 6000]   // 25次以下，7秒
      ],
      DEFAULT_INTERVAL: 5000,  // 預設間隔
      TEXT_LIMIT: {
        LINE: 1700,           // 單行最大字數
        BATCH: 1200          // 批次最大字數
      },
      MAX_PREVIOUS_BLOCKS: 3  // 最大前文區塊數
    },
    
    // 階段標識符
    STAGES: {
      INITIAL: '初始生成中',
      REFLECT_1: '反思一中',
      OPTIMIZE_1: '生成優化一中',
      REFLECT_2: '反思二中',
      OPTIMIZE_2: '生成優化二中',
      REFLECT_3: '反思三中',
      OPTIMIZE_3: '生成優化三中',
      COMPLETED: '生成完成',
      CANCELLED: '生成已取消'
    }
  };
  
  // 確保在全局範圍內定義 GenerationManager
  window.GenerationManager = {
    isGenerating: false,
    currentBatchIndex: 0,
    generationQueue: [],
    pendingGenerations: new Map(),
    completedGenerations: new Set(),
    generationResults: {
      initial: new Map(),    // 初始生成結果
      reflection: new Map(),  // 反思一結果
      optimize: new Map(),    // 優化一結果
      reflection2: new Map(), // 反思二結果
      optimize2: new Map(),   // 優化二結果
      reflection3: new Map(), // 反思三結果
      optimize3: new Map()    // 優化三結果
    },
    completedStepsCount: 0,
    shouldCancel: false,
    totalBatches: 0,
    timeoutId: null,
    isLastBatchProcessed: false,
    batchInterval: 5000,
    removeHashCheckbox: null,
    removeStarCheckbox: null,
    selectionStart: null,
    selectionEnd: null,
    backgroundKnowledgeTextarea: null,
    activeRequests: new Set(),
  
    /**
     * 根據批次數量決定發送間隔
     */
    getBatchInterval() {
      return GenerationConfig.BATCH.INTERVALS.find(
        ([count]) => this.totalBatches <= count
      )?.[1] || GenerationConfig.BATCH.DEFAULT_INTERVAL;
    },
  
    /**
     * 檢查是否所有批次都已完成
     */
    isAllBatchesCompleted() {
      return this.completedGenerations.size === this.totalBatches;
    },
  
    /**
     * 初始化生成功能
     */
    initialize() {
      console.log('GenerationManager 初始化...');
      const buttonContainer = document.getElementById('gpt-button-container');
      if (!buttonContainer || document.getElementById('gpt-generate-button')) return;
    
      // 創建生成按鈕
      const generateButton = document.createElement('button');
      generateButton.id = 'gpt-generate-button';
      generateButton.textContent = '生成';
      generateButton.addEventListener('click', () => this.handleGenerateClick(generateButton));
      buttonContainer.appendChild(generateButton);
  
      // 初始化 checkbox 元素
      this.checkboxManager.init();
    },
  
    /**
     * 獲取生成上下文
     * @returns {Promise<Array>} 包含背景知識的上下文陣列
     */
    async getGenerationContext() {
      try {
        const settings = await window.GlobalSettings.loadSettings();
        if (!settings.backgroundKnowledge) {
          return [];
        }

        return [{
          role: "system",
          content: `請參考以下背景知識：\n${settings.backgroundKnowledge}`
        }];
      } catch (error) {
        console.error('獲取背景知識時發生錯誤:', error);
        return [];
      }
    },
  
    /**
     * 處理生成按鈕點擊
     */
    async handleGenerateClick(button) {
      try {
        if (this.isGenerating) {
          console.log('取消生成');
          this.shouldCancel = true;
          button.disabled = true;
          button.classList.remove('canceling');
          clearTimeout(this.timeoutId);
          await window.Notification.showNotification('已取消生成', false);
          this.resetGeneration();
          return;
        }

        const settings = await window.GlobalSettings.loadSettings();
        if (!settings.apiKeys['gemini-2.0-flash-exp'] && !settings.apiKeys['openai']) {
          alert('請先設置 API 金鑰');
          return;
        }
        if (!settings.generateInstruction.trim()) {
          alert('請設置生成要求');
          return;
        }

        await this.startGeneration(button);
      } catch (error) {
        console.error('生成錯誤:', error);
        alert('生成錯誤: ' + error.message);
        this.resetGeneration();
      }
    },
  
    /**
     * 解析背景知識
     */
    async parseBackgroundKnowledge() {
      try {
        if (!this.backgroundKnowledgeTextarea) {
          console.log('取消生成');
          this.shouldCancel = true;
          button.disabled = true;
          button.classList.remove('canceling');
          clearTimeout(this.timeoutId);
          await window.Notification.showNotification('已取消生成', false);
          this.resetGeneration();
          return;
        }
  
        const settings = await window.GlobalSettings.loadSettings();
        if (!settings.apiKeys['gemini-2.0-flash-exp'] && !settings.apiKeys['openai']) {
          alert('請先設置 API 金鑰');
          return;
        }
        if (!settings.generateInstruction.trim()) {
          alert('請設置生成要求');
          return;
        }
  
        await this.startGeneration(button);
      } catch (error) {
        console.error('生成錯誤:', error);
        alert('生成錯誤: ' + error.message);
        this.resetGeneration();
      }
    },
  
    /**
     * 重置生成狀態
     */
    resetGeneration() {
      console.log('[resetGeneration] 開始重置生成狀態');
      console.log('[resetGeneration] 重置前狀態:', {
        isGenerating: this.isGenerating,
        shouldCancel: this.shouldCancel,
        currentBatchIndex: this.currentBatchIndex,
        queueLength: this.generationQueue.length,
        pendingCount: this.pendingGenerations.size,
        completedCount: this.completedGenerations.size,
        activeRequests: this.activeRequests?.size || 0,
        completedStepsCount: this.completedStepsCount
      });
  
      this.isGenerating = false;
      this.shouldCancel = false;
      this.currentBatchIndex = 0;
      this.generationQueue = [];
      this.pendingGenerations.clear();
      this.completedGenerations.clear();
      this.completedStepsCount = 0;
      // 清除所有階段的生成結果
      this.generationResults = {
        initial: new Map(),    // 初始生成結果
        reflection: new Map(),  // 反思一結果
        optimize: new Map(),    // 優化一結果
        reflection2: new Map(), // 反思二結果
        optimize2: new Map(),   // 優化二結果
        reflection3: new Map(), // 反思三結果
        optimize3: new Map()    // 優化三結果
      };
      this.isLastBatchProcessed = false;
      this.batchInterval = 5000;
      this.selectionStart = null;
      this.selectionEnd = null;
  
      if (this.timeoutId) { 
        console.log('[resetGeneration] 清除計時器');
        clearTimeout(this.timeoutId);
        this.timeoutId = null;
      }
  
      // 重置按鈕文本
      const button = document.getElementById('gpt-generate-button'); 
      if (button) { 
        console.log('[resetGeneration] 重置按鈕狀態');
        button.textContent = '生成'; 
        button.classList.remove('canceling'); 
        button.disabled = false;
      }
  
      this.activeRequests.clear();
      console.log('[resetGeneration] 重置完成，當前狀態:', {
        isGenerating: this.isGenerating,
        shouldCancel: this.shouldCancel,
        currentBatchIndex: this.currentBatchIndex,
        queueLength: this.generationQueue.length,
        pendingCount: this.pendingGenerations.size,
        completedCount: this.completedGenerations.size,
        activeRequests: this.activeRequests.size
      });
    },
  
    /**
     * 將文本分割成段落
     */
    splitTextIntoParagraphs(text) {
      const paragraphs = [];
      let currentBatch = '';
      
      // 添加到段落
      const addToParagraphs = (text) => {
        if (text.trim()) paragraphs.push(text);
      };
  
      // 處理長行
      const processLongLine = (line) => {
        const segments = line.match(/[^.。]+[.。]/g) || [];
        segments.forEach(segment => addToParagraphs(segment));
        return line.replace(/.*[.。]/, ''); // 返回剩餘文本
      };
  
      // 按換行分割文本
      text.split('\n').forEach(line => {
        if (line.length > GenerationConfig.BATCH.TEXT_LIMIT.LINE) {
          const remainder = processLongLine(line);
          currentBatch = remainder;
          return;
        }
  
        // 組合新批次
        const newBatch = currentBatch ? `${currentBatch}\n${line}` : line;
        const hasPeriod = /[.。]$/.test(line.trim());
  
        // 如果新批次包含句號，且長度超過限制，則添加到段落
        if (hasPeriod && newBatch.length > GenerationConfig.BATCH.TEXT_LIMIT.BATCH) {
          addToParagraphs(newBatch);
          currentBatch = '';
        } else {
          currentBatch = newBatch;
        }
      });
  
      addToParagraphs(currentBatch);
      return paragraphs;
    },
  
    /**
     * 開始生成流程
     */
    async startGeneration(button) {
      const textArea = document.querySelector('textarea[name="content"]');
      if (!textArea) throw new Error('找不到文本區域');
  
      // 檢查是否有選取文字
      const hasSelection = textArea.selectionStart !== textArea.selectionEnd;
      const textToGenerate = hasSelection 
        ? textArea.value.substring(textArea.selectionStart, textArea.selectionEnd)
        : textArea.value;
  
      // 保存選取位置
      if (hasSelection) {
        this.selectionStart = textArea.selectionStart;
        this.selectionEnd = textArea.selectionEnd;
      }
  
      this.isGenerating = true;
      this.shouldCancel = false;
      this.currentBatchIndex = 0;
      this.isLastBatchProcessed = false;
      this.generationQueue = this.splitTextIntoParagraphs(textToGenerate);
      this.totalBatches = this.generationQueue.length;
      this.batchInterval = this.getBatchInterval();
      this.pendingGenerations.clear();
      this.completedGenerations.clear();
      this.timeoutId = null;
  
      // 更新按鈕狀態
      button.textContent = '取消';
      button.classList.add('canceling');
  
      const settings = await window.GlobalSettings.loadSettings();
      const model = settings.generateModel || settings.model;
      const apiKey = settings.apiKeys[model.startsWith('gemini') ? 'gemini-2.0-flash-exp' : 'openai'];
  
      console.log(`總共分割成 ${this.totalBatches} 個批次，間隔時間：${this.batchInterval/1000}秒`);
      await window.Notification.showNotification(`
        模型: ${window.GlobalSettings.API.models[model] || model}<br>
        API KEY: ${apiKey.substring(0, 5)}...<br>
        生成中<br>
        批次進度: 0/${this.totalBatches}<br>
        發送間隔: ${this.batchInterval/1000}秒
      `, true);
  
      // 開始第一個批次並設置定時器
      this.processNextBatch();
      this.scheduleNextBatch();
    },
  
    /**
     * 安排下一個批次
     */
    scheduleNextBatch() {
      if (!this.shouldCancel && this.currentBatchIndex < this.generationQueue.length) {
        this.timeoutId = setTimeout(() => {
          this.processNextBatch();
          this.scheduleNextBatch();
        }, this.batchInterval);
      }
    },
  
    /**
     * 獲取前文上下文
     */
    getPreviousContext(currentIndex) {
      const previousBlocks = [];
      const maxBlocks = GenerationConfig.BATCH.MAX_PREVIOUS_BLOCKS;
      
      console.log(`開始收集前文上下文，當前區塊索引: ${currentIndex}, 最大區塊數: ${maxBlocks}`);
      
      // 從當前區塊往前收集
      for (let i = currentIndex - 1; i >= 0 && i > currentIndex - maxBlocks; i--) {
        // 獲取原文和優化後的生成文本
        const initialResult = this.generationResults.initial.get(i);
        const optimizeResult = this.generationResults.optimize.get(i);
  
        if (!initialResult || !optimizeResult) {
          console.log(`警告：找不到區塊 ${i} 的完整生成結果`);
          continue;
        }
  
        previousBlocks.unshift({
          original: initialResult.original,
          optimized: optimizeResult
        });
      }
  
      if (previousBlocks.length === 0) {
        console.log('沒有找到任何前文上下文');
        return [];
      }
  
      console.log(`成功收集到 ${previousBlocks.length} 個區塊的上下文`);
      return [{
        role: "system",
        content: `請參考前文的生成：\n${previousBlocks.map(block => 
          `原文：\n${block.original}\n\n生成文本：\n${block.optimized}\n---`
        ).join('\n')}`
      }];
    },
  
    /**
     * 處理反思和優化階段
     * @param {string} generatedText - 初始生成的文本
     * @param {string} sourceText - 原始文本
     * @param {string} reflectionResult - 反思結果（僅在優化階段使用）
     * @param {number} blockIndex - 區塊索引
     * @param {string} stage - 處理階段 ('reflect' 或 'optimize')
     * @param {number} step - 步驟編號（1 或 2）
     */
    async processStage(generatedText, sourceText, reflectionResult, blockIndex, stage, step) {
      try {
        console.log(`=== 開始處理 ${stage} 階段 ${step} ===`);
        const settings = await window.GlobalSettings.loadSettings();
        const isReflectStage = stage === 'reflect';
         
        // 根據階段和步驟選擇對應的模型和指令
        const model = isReflectStage ? 
          (step === 1 ? settings.reflect1Model : 
           step === 2 ? settings.reflect2Model :            
           settings.reflect3Model) || settings.model : 
          (step === 1 ? settings.generationOptimize_1_Model : 
           step === 2 ? settings.generationOptimize_2_Model : 
           settings.generationOptimize_3_Model) || settings.model;

        console.log(`選擇的模型: ${model}`);

        // 獲取對應的指令
        const instruction = isReflectStage ? 
          (step === 1 ? settings.reflect1Instruction : 
           step === 2 ? settings.reflect2Instruction : 
           settings.reflect3Instruction) : 
          (step === 1 ? settings.generationOptimize_1_Instruction : 
           step === 2 ? settings.generationOptimize_2_Instruction : 
           settings.generationOptimize_3_Instruction);

        console.log(`獲取到的指令: ${instruction ? '有指令' : '無指令'}`);

        // 檢查指令是否為空
        if (!instruction || !instruction.trim()) {
          console.log(`[重要] ${stage} 階段 ${step} 的指令為空，即將停止處理`);
          // 如果是反思階段，返回 null 表示不需要進行後續優化
          // 如果是優化階段，返回上一階段的結果
          if (isReflectStage) {
            console.log(`[重要] ${stage} 階段 ${step} 返回 null`);
            return { shouldStop: true, result: null };
          } else {
            let result;
            // 根據步驟返回對應的上一階段結果
            if (step === 1) {
              result = this.generationResults.initial.get(blockIndex)?.generated;
              console.log(`[重要] ${stage} 階段 ${step} 返回初始生成結果`);
            } else if (step === 2) {
              result = this.generationResults.optimize.get(blockIndex);
              console.log(`[重要] ${stage} 階段 ${step} 返回優化一結果`);
            } else {
              result = this.generationResults.optimize2.get(blockIndex);
              console.log(`[重要] ${stage} 階段 ${step} 返回優化二結果`);
            }
            console.log(`返回結果是否存在: ${result ? '是' : '否'}`);
            return { shouldStop: true, result };
          }
        }

        console.log(`開始準備 API 請求配置`);

        const isGemini = model.startsWith('gemini');
        const apiKey = settings.apiKeys[isGemini ? 'gemini-2.0-flash-exp' : 'openai'];

        // 顯示階段通知
        const stage_id = isReflectStage ? 
          (step === 1 ? GenerationConfig.STAGES.REFLECT_1 : 
           step === 2 ? GenerationConfig.STAGES.REFLECT_2 : 
           GenerationConfig.STAGES.REFLECT_3) :
          (step === 1 ? GenerationConfig.STAGES.OPTIMIZE_1 : 
           step === 2 ? GenerationConfig.STAGES.OPTIMIZE_2 : 
           GenerationConfig.STAGES.OPTIMIZE_3);
        
        await window.Notification.showNotification(`
          模型: ${window.GlobalSettings.API.models[model] || model}<br>
          API KEY: ${apiKey.substring(0, 5)}...<br>
          ${stage_id}<br>
          批次進度: ${blockIndex + 1}/${this.totalBatches}
        `, true);

        // 獲取前文6個區塊的原文和生成文本
        const prevBlocksStart = Math.max(0, blockIndex - 6);
        const prevBlocks = this.generationQueue.slice(prevBlocksStart, blockIndex);
        const prevGeneratedBlocks = Array.from({ length: blockIndex - prevBlocksStart }, (_, i) => {
          const blockIndex = prevBlocksStart + i;
          return isReflectStage ? 
            this.generationResults.initial.get(blockIndex)?.generated || '' :
            this.generationResults.optimize.get(blockIndex) || 
            this.generationResults.initial.get(blockIndex)?.generated || '';
        });

        // 獲取後文6個區塊的原文
        const nextBlocksEnd = Math.min(this.generationQueue.length, blockIndex + 7);
        const nextBlocks = this.generationQueue.slice(blockIndex + 1, nextBlocksEnd);

        // 組織帶有 XML 標記的文本
        const taggedText = [
          // 前文原文和生成文本
          ...prevBlocks.map((text, i) => 
            `<PREVIOUS_SOURCE>
              ${text}
            </PREVIOUS_SOURCE>
            <PREVIOUS_GENERATED>
              ${prevGeneratedBlocks[i]}
            </PREVIOUS_GENERATED>`
          ),
          // 當前要生成的區塊
          `<IMPROVE_THIS>
            ${sourceText}
          </IMPROVE_THIS>`,
          // 後文原文
          ...nextBlocks.map(text => 
            `<NEXT_SOURCE>
              ${text}
            </NEXT_SOURCE>`
          )
        ].join('\n');

        // 可用的替換符:
        // {tagged_text} - 包含完整上下文標記的文本(前文、當前文本、後文,XML格式)
        // {chunk_to_generate} - 當前需要處理的原始文本區塊
        // {generation_1_chunk} - 初始生成的結果
        // {generate_reflection_1_chunk} - 反思一的結果(在優化一階段和優化二階段可用)
        // {generation_optimize_1_chunk} - 生成優化一的結果(在反思二階段和優化二階段可用)
        // {generate_reflection_2_chunk} - 反思二的結果(在優化二階段可用)
        // {generation_optimize_2_chunk} - 生成優化二的結果(在反思三階段可用)
        // {generate_reflection_3_chunk} - 反思三的結果(在優化三階段可用)
        // {generation_optimize_3_chunk} - 生成優化三的結果(在反思四階段可用)
        
        // 準備替換用的參數
        const replaceParams = {
          tagged_text: taggedText,      // 包含了完整的上下文標記文本，包括前文、當前文本和後文，使用XML標記格式
          chunk_to_generate: sourceText, // 當前需要處理的原始文本區塊
          generation_1_chunk: generatedText  // 初始生成的結果
        };

        // 添加所有可用的結果
        const results = {
          reflection: this.generationResults.reflection.get(blockIndex),
          optimize: this.generationResults.optimize.get(blockIndex),
          reflection2: this.generationResults.reflection2.get(blockIndex),
          optimize2: this.generationResults.optimize2.get(blockIndex),
          reflection3: this.generationResults.reflection3.get(blockIndex)
        };

        // 根據當前步驟更新 generation_1_chunk
        if (isReflectStage) {
          if (step === 2 && results.optimize) {
            replaceParams.generation_1_chunk = results.optimize;
          } else if (step === 3 && results.optimize2) {
            replaceParams.generation_1_chunk = results.optimize2;
          }
        }

        // 添加所有已有的結果
        if (results.reflection) {
          replaceParams.generate_reflection_1_chunk = results.reflection;
        }
        if (results.optimize) {
          replaceParams.generation_optimize_1_chunk = results.optimize;
        }
        if (results.reflection2) {
          replaceParams.generate_reflection_2_chunk = results.reflection2;
        }
        if (results.optimize2) {
          replaceParams.generation_optimize_2_chunk = results.optimize2;
        }
        if (results.reflection3) {
          replaceParams.generate_reflection_3_chunk = results.reflection3;
        }

        // 如果是優化階段，添加當前的反思結果
        if (!isReflectStage && reflectionResult) {
          const reflectionKey = `generate_reflection_${step}_chunk`;
          replaceParams[reflectionKey] = reflectionResult;
        }

        console.log(`${stage} ${step} 階段替換參數：`, replaceParams);

        // 獲取背景知識上下文
        const context = await this.getGenerationContext();

        const { endpoint, body } = TextProcessor._prepareApiConfig(
          model,
          replaceParams,
          isReflectStage ? 
            (step === 1 ? settings.reflect1Instruction : 
             step === 2 ? settings.reflect2Instruction : 
             settings.reflect3Instruction) : 
            (step === 1 ? settings.generationOptimize_1_Instruction : 
             step === 2 ? settings.generationOptimize_2_Instruction : 
             settings.generationOptimize_3_Instruction),
          context
        );

        const result = await this.sendRequestWithRetry(
          endpoint, 
          body, 
          apiKey, 
          isGemini, 
          true, 
          stage
        );
        
        try {
          // 根據階段保存結果到 local storage
          const storageKey = `generation_${stage}_${step}_${blockIndex}`;
          await chrome.storage.local.set({ [storageKey]: result });
          console.log(`成功保存結果到 local storage: ${storageKey}`);
        } catch (error) {
          console.error('保存結果到 local storage 失敗:', error);
          // 儲存失敗不影響後續處理，僅記錄錯誤
        }
        
        // 同時更新內存中的結果
        if (isReflectStage) {
          if (step === 1) {
            this.generationResults.reflection.set(blockIndex, result);
          } else if (step === 2) {
            this.generationResults.reflection2.set(blockIndex, result);
          } else {
            this.generationResults.reflection3.set(blockIndex, result);
          }
        } else {
          if (step === 1) {
            this.generationResults.optimize.set(blockIndex, result);
          } else if (step === 2) {
            this.generationResults.optimize2.set(blockIndex, result);
          } else {
            this.generationResults.optimize3.set(blockIndex, result);
          }
        }
        
        // 增加完成步驟計數
        this.completedStepsCount++;
        
        return { shouldStop: false, result: result };
      } catch (error) {
        console.error(`${stage}階段處理失敗:`, error);
        return { shouldStop: false, result: null };
      }
    },
  
    /**
     * 處理反思階段
     */
    async processReflection(generatedText, sourceText, blockIndex, step) {
      return this.processStage(generatedText, sourceText, null, blockIndex, 'reflect', step);
    },
  
    /**
     * 處理優化階段
     */
    async processOptimization(generatedText, sourceText, reflectionResult, blockIndex, step) {
      return this.processStage(generatedText, sourceText, reflectionResult, blockIndex, 'optimize', step);
    },
  
    /**
     * 處理下一個批次
     */
    async processNextBatch() {
      console.log('processNextBatch called. currentBatchIndex:', this.currentBatchIndex, ', totalBatches:', this.totalBatches);
      
      // 如果已經處理完所有批次，直接返回
      if (this.currentBatchIndex >= this.generationQueue.length) {
        return;
      }
      
      const originalText = this.generationQueue[this.currentBatchIndex];
      const batchIndex = this.currentBatchIndex;
  
      this.pendingGenerations.set(batchIndex, originalText);
      this.currentBatchIndex++;
  
      try {
        const settings = await window.GlobalSettings.loadSettings();
        const model = settings.generateModel || settings.model;
        const isGemini = model.startsWith('gemini');
        const apiKey = settings.apiKeys[isGemini ? 'gemini-2.0-flash-exp' : 'openai'];
        
        // 獲取生成上下文
        const context = await this.getGenerationContext();
  
        const { endpoint, body } = TextProcessor._prepareApiConfig(
          model,
          originalText,
          settings.generateInstruction,
          context  // 添加上下文
        );
  
        console.log(`正在生成第 ${batchIndex + 1}/${this.totalBatches} 批次`);
        const generatedText = await this.sendRequestWithRetry(endpoint, body, apiKey, isGemini, true);
  
        if (this.pendingGenerations.has(batchIndex)) {
          this.updateGeneratedText(batchIndex, generatedText.trim(), settings);
          this.pendingGenerations.delete(batchIndex);
          this.completedGenerations.add(batchIndex);
          
          if (this.isAllBatchesCompleted()) {
            console.log('所有生成批次已完成，開始分區塊反思和優化流程');
            clearTimeout(this.timeoutId);
  
            try {
              const finalText = await this.processAllBlocks();
              
              // 立即重置按鈕狀態，不等通知
              this.resetGeneration();
              
              // 最後顯示完成通知
              await window.Notification.showNotification('生成優化完成', false);
            } catch (error) {
              console.error('反思優化處理失敗:', error);
              
              // 即使出錯也要重置按鈕狀態
              this.resetGeneration();
              
              await window.Notification.showNotification('反思優化處理失敗: ' + error.message, false);
            }
          } else {
            // 如果還有未完成的批次，更新進度通知
            await window.Notification.showNotification(`
              模型: ${window.GlobalSettings.API.models[model] || model}<br>
              API KEY: ${apiKey.substring(0, 5)}...<br>
              ${GenerationConfig.STAGES.INITIAL}<br>
              批次進度: ${this.completedGenerations.size}/${this.totalBatches}<br>
              發送間隔: ${this.batchInterval/1000}秒
            `, true);
          }
        }
      } catch (error) {
        if (error.message === '生成請求已取消') {
          return;
        }
        console.error(`批次 ${batchIndex + 1} 生成錯誤:`, error);
        this.pendingGenerations.delete(batchIndex);
      }
    },
  
    /**
     * 獲取特定區塊的生成文本
     */
    getGeneratedTextForBlock(blockIndex) {
      // 從 generationResults 中獲取初始生成結果
      const result = this.generationResults.initial.get(blockIndex);
      if (!result) {
        console.log(`警告：找不到區塊 ${blockIndex} 的生成文本`);
        return '';
      }
      return result.generated;
    },
  
    /**
     * 更新已生成的文本
     */
    updateGeneratedText(batchIndex, generatedText, settings) {
      const textArea = document.querySelector('textarea[name="content"]');
      if (!textArea) return;
  
      const originalText = this.generationQueue[batchIndex];
      let finalGeneratedText = batchIndex > 0 ? '\n' + generatedText : generatedText;
  
      if (settings.removeHash) {
        finalGeneratedText = finalGeneratedText.replace(/##\s*|\s*##/g, '');
      }
      if (settings.removeStar) {
        finalGeneratedText = finalGeneratedText.replace(/\*\*\s*|\s*\*\*/g, '');
      }
  
      // 保存初始生成結果
      this.generationResults.initial.set(batchIndex, {
        original: originalText,
        generated: finalGeneratedText
      });
      
      // 增加完成步驟計數
      this.completedStepsCount++;
      
      console.log(`\n=== 批次 ${batchIndex + 1}/${this.totalBatches} 生成更新 ===`);
      console.log('原始文本：\n' + (originalText.length > 500 ? originalText.substring(0, 500) + '...' : originalText));
      console.log('生成結果：\n' + (finalGeneratedText.length > 500 ? finalGeneratedText.substring(0, 500) + '...' : finalGeneratedText));
      console.log(`原始長度：${originalText.length}，生成後長度：${finalGeneratedText.length}`);
      console.log('=====================================\n');
  
      textArea.value = textArea.value.replace(originalText, finalGeneratedText);
      textArea.dispatchEvent(new Event('input', { bubbles: true }));
    },
  
    /**
     * 設置 checkbox 元素並載入狀態 (移除監聽器)
     */
    setCheckboxes(removeHashCheckbox, removeStarCheckbox) {
      console.log('設置 checkboxes...');
      console.log('removeHashCheckbox:', removeHashCheckbox ? '已提供' : '未提供');
      console.log('removeStarCheckbox:', removeStarCheckbox ? '已提供' : '未提供');
  
      this.removeHashCheckbox = removeHashCheckbox;
      this.removeStarCheckbox = removeStarCheckbox;
    },
  
    // checkbox 相關配置和方法
    checkboxManager: {
      configs: [
        { id: 'removeHash', ref: 'removeHashCheckbox' },
        { id: 'removeStar', ref: 'removeStarCheckbox' }
      ],
  
      init() {
        this.configs.forEach(({ id, ref }) => {
          if (!GenerationManager[ref]) {
            GenerationManager[ref] = document.getElementById(id) || this._createCheckbox(id);
          }
        });
      },
  
      _createCheckbox(id) {
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.id = id;
        return checkbox;
      },
  
      set(hashCheckbox, starCheckbox) {
        GenerationManager.removeHashCheckbox = hashCheckbox;
        GenerationManager.removeStarCheckbox = starCheckbox;
      }
    },
  
    /**
     * 處理 API 請求並支援重試機制
     */
    async sendRequestWithRetry(endpoint, body, apiKey, isGemini, showProgress, requestType = 'generate') {
      let retryCount = 0;
      const { MAX_RETRIES, DELAY, TIMEOUT } = GenerationConfig.API.RETRY;
      const timeoutDuration = TIMEOUT[isGemini ? 'GEMINI' : 'OPENAI'][requestType.toUpperCase()];
      let retryTimeoutId = null;
  
      while (retryCount < MAX_RETRIES) {
        try {
          const startTime = Date.now();  // 記錄開始時間
  
          // 建立一個帶有超時的 Promise
          const timeoutPromise = new Promise((_, reject) => {
            setTimeout(() => {
              reject(new Error('請求超時'));
            }, timeoutDuration);
          });
  
          // 建立實際的請求 Promise
          const requestPromise = TextProcessor._sendRequest(endpoint, body, apiKey, isGemini, showProgress, requestType);
  
          // 使用 Promise.race 來競爭，誰先完成就用誰的結果
          const response = await Promise.race([
            requestPromise,
            timeoutPromise
          ]);
  
          // 如果請求成功但已經超時，則忽略這個回應
          if (Date.now() - startTime > timeoutDuration) {
            console.log(`收到回應但已超時 (${requestType})，忽略此回應`);
            continue;
          }

          // 清除重試計時器（如果存在）
          if (retryTimeoutId) {
            clearTimeout(retryTimeoutId);
            retryTimeoutId = null;
          }
  
          return response;
        } catch (error) {
          // 如果是取消錯誤，直接拋出不重試
          if (error.message === '生成請求已取消' || error.name === 'AbortError') {
            console.log('檢測到取消請求，停止重試');
            if (retryTimeoutId) {
              clearTimeout(retryTimeoutId);
              retryTimeoutId = null;
            }
            throw error;
          }

          // 檢查是否為 rate limit 錯誤
          if (error.message.includes('Rate limit reached')) {
            const waitTimeMatch = error.message.match(/try again in (\d+\.?\d*)s/);
            if (waitTimeMatch) {
              const waitTime = Math.ceil(parseFloat(waitTimeMatch[1]) * 1000);
              console.log(`檢測到 rate limit，等待 ${waitTime/1000} 秒後重試...`);
              await new Promise(resolve => {
                retryTimeoutId = setTimeout(resolve, waitTime + 1000);
              }); // 多等1秒以確保安全
              continue;
            }
          }
  
          // 其他錯誤進行重試
          if (retryCount < MAX_RETRIES - 1) {
            retryCount++;
            const errorMessage = error.status ? `狀態碼 ${error.status}` : error.message;
            console.log(`收到錯誤 (${errorMessage})，等待 ${DELAY/1000} 秒後進行第 ${retryCount} 次重試...`);
            await new Promise(resolve => {
              retryTimeoutId = setTimeout(resolve, DELAY);
            });
            continue;
          }
          if (retryTimeoutId) {
            clearTimeout(retryTimeoutId);
            retryTimeoutId = null;
          }
          throw error;
        }
      }
    },
  
    /**
     * 處理生成請求
     */
    async processGeneration(text, settings) {
      try {
        const model = settings.generateModel || settings.model;
        const isGemini = model.startsWith('gemini');
        const apiKey = settings.apiKeys[isGemini ? 'gemini-2.0-flash-exp' : 'openai'];
  
        // 獲取完整的上下文文本
        const fullText = this.generationQueue.join('\n');
        const currentIndex = this.generationQueue.indexOf(text);
        
        // 組織帶有 XML 標記的文本
        const taggedText = `<SOURCE_TEXT>${fullText}</SOURCE_TEXT>\n` + 
          this.generationQueue.slice(0, currentIndex).join('\n') +
          `<IMPROVE_THIS>${text}</IMPROVE_THIS>\n` +
          this.generationQueue.slice(currentIndex + 1).join('\n');
  
        // 獲取中英對照表上下文
        const context = await this.getGenerationContext();
  
        // 準備 API 請求配置
        const { endpoint, body } = TextProcessor._prepareApiConfig(
          model,
          taggedText,
          settings.generateInstruction,
          context  // 加入中英對照表
        );
  
        return await this.sendRequestWithRetry(endpoint, body, apiKey, isGemini, true, 'generate');
      } catch (error) {
        console.error('生成處理失敗:', error);
        throw error;
      }
    },
  
    /**
     * 獲取當前生成後的文本
     */
    getGeneratedText() {
      const textArea = document.querySelector('textarea[name="content"]');
      if (!textArea) return '';
      
      // 如果有選取範圍，只返回選取的部分
      if (this.selectionStart !== null && this.selectionEnd !== null) {
        return textArea.value.substring(this.selectionStart, this.selectionEnd);
      }
      return textArea.value;
    },
  
    /**
     * 更新最終文本
     */
    updateFinalText(finalText) {
      if (this.shouldCancel) {
        console.log('流程已取消，停止文本更新');
        return;
      }
  
      const textArea = document.querySelector('textarea[name="content"]');
      if (!textArea) return;
  
      if (this.selectionStart !== null && this.selectionEnd !== null) {
        const beforeSelection = textArea.value.substring(0, this.selectionStart);
        const afterSelection = textArea.value.substring(this.selectionEnd);
        textArea.value = beforeSelection + finalText + afterSelection;
      } else {
        textArea.value = finalText;
      }
  
      textArea.dispatchEvent(new Event('input', { bubbles: true }));
    },
  
    /**
     * 處理所有區塊的反思和優化
     */
    async processAllBlocks() {
      console.log('=== 開始處理所有區塊 ===');
      const resultsMap = new Map();
      
      try {
        // 按順序處理每個區塊
        for (let i = 0; i < this.generationQueue.length; i++) {
          console.log(`\n=== 處理第 ${i + 1} 個區塊 ===`);
          const sourceText = this.generationQueue[i];
          
          // 從 generationResults 中獲取初始生成結果
          const initialResult = this.generationResults.initial.get(i);
          
          if (!initialResult) {
            console.warn(`找不到第 ${i + 1} 個區塊的生成結果`);
            continue;
          }

          const generatedText = initialResult.generated;
          
          try {
            let lastResult = generatedText; // 追蹤上一步的結果
            
            // 定義處理步驟
            const steps = [
              { type: 'reflect', step: 1, input: generatedText, prevResult: null },
              { type: 'optimize', step: 1, prevResult: 'reflection' },
              { type: 'reflect', step: 2, prevResult: 'optimize' },
              { type: 'optimize', step: 2, prevResult: 'reflection2' },
              { type: 'reflect', step: 3, prevResult: 'optimize2' },
              { type: 'optimize', step: 3, prevResult: 'reflection3' }
            ];

            // 依序處理每個步驟
            for (const { type, step, input, prevResult } of steps) {
              const stageName = `${type}${step}`;
              console.log(`\n--- 開始${type === 'reflect' ? '反思' : '優化'}${step} ---`);
              
              // 從 generationResults 中獲取上一步結果
              let prevStageResult = null;
              if (prevResult) {
                prevStageResult = this.generationResults[prevResult].get(i);
              }
              
              // 處理當前階段
              const { shouldStop, result } = await this.processStage(
                type === 'optimize' ? lastResult : generatedText,
                sourceText,
                prevStageResult,
                i,
                type,
                step
              );

              // 如果需要停止
              if (shouldStop) {
                console.log(`[重要] ${stageName}返回停止信號，停止所有後續處理`);
                // 優化階段使用對應的反思結果，反思階段使用上一步結果
                if (type === 'optimize') {
                  console.log(`保存${prevResult}結果到結果集`);
                  resultsMap.set(i, prevStageResult || lastResult);
                } else {
                  console.log(`保存上一步結果到結果集`);
                  resultsMap.set(i, lastResult);
                }
                return await this.finishProcessing(resultsMap);
              }

              // 更新最後的結果
              if (type === 'optimize' && result) {
                lastResult = result;
              }
            }
            
            console.log('\n--- 保存最終結果 ---');
            resultsMap.set(i, lastResult);
            
          } catch (error) {
            console.error(`處理第 ${i + 1} 個區塊時發生錯誤:`, error);
            // 使用初始生成結果作為備用
            console.log('使用初始生成結果作為備用');
            resultsMap.set(i, generatedText);
            console.log('[重要] 發生錯誤，停止後續處理');
            break;
          }
        }
      } catch (error) {
        console.error('處理區塊時發生錯誤:', error);
        // 如果整體處理失敗，使用所有可用的初始生成結果
        for (let i = 0; i < this.generationQueue.length; i++) {
          const initialResult = this.generationResults.initial.get(i);
          if (initialResult) {
            resultsMap.set(i, initialResult.generated);
          }
        }
      }

      return await this.finishProcessing(resultsMap);
    },

    // 新增一個輔助方法來處理最終結果
    async finishProcessing(resultsMap) {
      // 按照原始順序組合結果
      const finalText = Array.from(resultsMap.entries())
        .sort(([a], [b]) => a - b)  // 確保按照索引順序排序
        .map(([_, text]) => text)
        .join('\n');
        
      // 使用統一入口更新最終文本
      console.log('[重要] 更新最終文本到輸入框');
      await this.updateText(finalText, 'final');
      return finalText;
    },
  
    // 取消生成
    cancelGeneration() {
      console.log('[cancelGeneration] 開始取消生成流程');
      console.log('[cancelGeneration] 當前狀態:', {
        isGenerating: this.isGenerating,
        shouldCancel: this.shouldCancel,
        activeRequests: this.activeRequests?.size || 0,
        pendingGenerations: this.pendingGenerations.size,
        completedGenerations: this.completedGenerations.size
      });
  
      this.shouldCancel = true;
  
      // 取消所有進行中的請求
      if (this.activeRequests) {
        console.log(`[cancelGeneration] 準備取消 ${this.activeRequests.size} 個進行中的請求`);
        this.activeRequests.forEach((controller, index) => {
          try {
            console.log(`[cancelGeneration] 取消第 ${index + 1} 個請求`);
            controller.abort();
          } catch (error) {
            console.error('[cancelGeneration] 取消請求時發生錯誤:', error);
          }
        });
        this.activeRequests.clear();
        console.log('[cancelGeneration] 已清空活動請求集合');
      }
  
      // 清除所有計時器
      if (this.timeoutId) {
        console.log('[cancelGeneration] 清除計時器');
        clearTimeout(this.timeoutId);
        this.timeoutId = null;
      }
  
      // 重置所有生成相關的狀態
      console.log('[cancelGeneration] 開始重置生成狀態');
      this.resetGeneration();
      console.log('[cancelGeneration] 生成取消流程完成');
    },
  
    // 更新文本的統一入口
    async updateText(text, type) {
      const storageKey = `generation_${type}_${this.currentBatchIndex}`;
      
      try {
        // 儲存到 local storage
        await chrome.storage.local.set({ [storageKey]: text });
        console.log(`成功保存文本到 local storage: ${storageKey}`);
      } catch (error) {
        console.error('保存文本到 local storage 失敗:', error);
        // 儲存失敗不影響後續處理，僅記錄錯誤
      }
      
      // 同時更新內存中的結果
      switch(type) {
        case 'initial':
          this.generationResults.initial.set(this.currentBatchIndex, text);
          break;
        case 'reflection':
          this.generationResults.reflection.set(this.currentBatchIndex, text);
          break;
        case 'optimize':
          this.generationResults.optimize.set(this.currentBatchIndex, text);
          break;
        case 'final':
          this.updateFinalText(text);
          break;
      }
    }
  };
  