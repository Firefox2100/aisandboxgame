/**
 * ai/react.js
 * 统一工作流 Runner — ReAct 主循环
 *
 * 通过 mixin 模式扩展 AIService.prototype。所有方法实现与原 class
 * AIService 中的版本完全一致，仅以独立 class 形式承载，文件末尾通过
 * _applyAIServiceMixin 合并到 AIService 上。
 *
 * 内容：核心 Agent 工作流（策略模式）、ReAct Loop → Step 3 流程、
 * narrative/settlement/closing 三阶段编排、function calling、streaming、
 * segment tracking。
 *
 * 加载顺序：必须在 aiService.js 之后加载。
 */

class _AIServiceReactMixin {
  // ========================================
  // 统一工作流 Runner
  // ========================================

  /**
   * 核心 Agent 工作流(策略模式)
   * 统一处理 ReAct Loop -> Step 3 流程
   * 各模块可使用不同模型(通过 react/step3 等模块配置)
   * Step 完成通知通过 EventBus 广播，不再使用回调
   * @param {Array} messages - 通用格式消息
   * @param {Function|null} onChunk - 流式输出回调（高频，保留）
   * @param {string} systemContext - 系统上下文(包含角色档案等)
   * @returns {Promise<string>} 最终输出
   */
  async _runAgentWorkflow(messages, onChunk, systemContext, actionClassificationOptions = null, oocOptions = null, abortSignal = null) {
    // ━━━ ReAct Workflow: Entry & Setup ━━━
    // 中止信号、telemetry 追踪、turn 级初始化
    // 存储当前中止信号，供所有子方法访问
    this._currentAbortSignal = abortSignal || null;

    const _analyticsReqId = (() => {
      try { return crypto.randomUUID(); } catch (_) { return 'r_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8); }
    })();
    const _analyticsT0 = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
    try {
      // Telemetry 用 iter1（叙事 spine）作为代表性 model/provider；推荐模式下其他 iter
      // 各自不同（参见 RECOMMENDED_PHASE_MAP），完整 per-iter 数据在 stepMetrics 里。
      const reactModelForTelemetry = this.getModelForModule('iter1_narrative', AI_REQUEST_SCOPED);
      const reactProviderForTelemetry = this.getProviderForModule('iter1_narrative', AI_REQUEST_SCOPED);
      const promptLenChars = Array.isArray(messages)
        ? messages.reduce((n, m) => n + (typeof m?.content === 'string' ? m.content.length : 0), 0) : 0;
      window.analyticsService?.track?.('ai.request', {
        request_id: _analyticsReqId,
        model: reactModelForTelemetry,
        provider: reactProviderForTelemetry,
        phase: 'react',
        prompt_len_chars: promptLenChars,
      });
    } catch (_) { /* ignore */ }

    try {

    // 获取 adapter（iter1_narrative 作为 react 流的代表性 protocol adapter；
    // 推荐模式下 cleanHistoryForGeneration / convertMessages 等协议级方法所有 iter 共享，
    // 仅 buildPayload + callAPI 阶段每 iter 重新查 adapter 拿不同 model/thinking）
    const reactAdapter = this._getAdapter('iter1_narrative', AI_REQUEST_SCOPED);

    // 重置调试记录
    this.lastFunctionCalls = null;
    this.lastReasoningContents = [];
    this.lastGMPayload = null;
    this.lastNpcReactions = null;
    this._pendingEventToMark = null; // 防止上一次请求失败后的残留事件被错误播报

    this.lastPayload = {
      provider: 'multi-step-agent',
      traceId: this._generateTraceId(),
      failedPhase: null,
      errorInfo: null,
      models: {
        // 代表性 model（iter1 叙事 spine）；推荐模式下其他 iter 各自配置，
        // 完整数据在 stepMetrics.perIteration 里。
        react: this.getModelForModule('iter1_narrative', AI_REQUEST_SCOPED),
      },
      steps: [],
      settlementDispatch: null,
    };
    this.accumulatedStepCount = 0;

    // 重置模块追踪(避免跨调用模块重复加载)
    if (typeof archiveService !== 'undefined' && archiveService.resetLoadedModules) {
      archiveService.resetLoadedModules();
    }

    // 初始化时间指标记录
    const requestStartTime = performance.now();
    const stepMetrics = [];

    // 转换消息为厂商格式(使用 ReAct adapter)
    const currentMessages = reactAdapter.convertMessages(messages);
    const executedTools = new Set();

    // 本回合主循环成功执行过的工具调用次数（按工具名累计）
    // 用于让 settlement subagent 决策是否跳过自身（如 inventorySkill 仅在主循环 0 次 update_item 时兜底）
    const mainLoopToolCounts = Object.create(null);

    // ==========================================
    // 前置准备：消息转换 + 清理 + 提取状态
    // ==========================================
    // 周边 subagent 用各自专属 module key 拿 adapter（推荐模式下分别走 npc_reaction /
    // ooc_normalizer 配置；非推荐模式 aliasMap 兜底到用户 'react' 选择）。
    const npcReactionAdapter = this._getAdapter('npc_reaction', AI_REQUEST_SCOPED);
    const oocAdapter = this._getAdapter('ooc_normalizer', AI_REQUEST_SCOPED);
    // reactModel 用 iter1_narrative（叙事 spine）作代表性显示；UI 标签 + 旧 telemetry 用。
    const reactModel = this.getModelForModule('iter1_narrative', AI_REQUEST_SCOPED);
    const reactLabel = reactAdapter.getProviderLabel();

    const { cleanedMessages, lastGameState } =
      reactAdapter.cleanHistoryForGeneration(currentMessages);
    const { messages: sanitizedMessages, stats: messageSanitization } =
      this._sanitizeMessagesForDeepSeek(cleanedMessages, reactAdapter.provider);
    const lastUserMessage =
      messages
        .slice()
        .reverse()
        .find(m => m.role === 'user')?.content || '';
    const openingTurn =
      typeof chatHistory !== 'undefined' ? chatHistory.filter(m => m.sender === 'ai').length : 0;
    const openingTimeContext = this._getSelectedOpeningTimeContext(
      lastUserMessage,
      lastGameState,
      openingTurn
    );
    if (this.lastPayload) {
      this.lastPayload.openingTimeContext = openingTimeContext
        ? {
            mode: openingTimeContext.mode,
            currentTurn: openingTimeContext.currentTurn,
            blocked: openingTimeContext.blocked === true,
            message: openingTimeContext.message || '',
            selectedTime: openingTimeContext.selectedTime,
            precision: openingTimeContext.precision,
            source: openingTimeContext.source,
            selectedEventId: openingTimeContext.selectedEvent?.eventId || null,
            selectedLocation: openingTimeContext.selectedLocation || null,
          }
        : null;
    }

    // 开局 Turn 1：prime timelineService，避免 panelSkill / buildTurnResult 等下游
    // 在 update_panel 第一次调用前读到 currentDate=null 而自行编造时间（如 panelSkill
    // 缺时间上下文时编出 "2077-3-15"，与 gmDirective 的"新历 32 年"错位）。
    // 四重 guard：仅新游戏开局首回合 + selectedTime 存在 + timelineService 加载 + 未初始化时触发。
    if (
      openingTurn === 0 &&
      openingTimeContext?.selectedTime &&
      typeof timelineService !== 'undefined' &&
      !timelineService.getCurrentDate()
    ) {
      const t = openingTimeContext.selectedTime;
      timelineService.setCurrentDateManual(
        t.year, t.month, t.day,
        t.time_str || '00:00',
        null,   // minute 由 time_str 解析
        null,   // 无 previousTurnDate
        true,   // skipSideEffects=true（Turn 1 不触发事件 SMS 跳跃检查）
      );
      console.log('[Agent] Turn 1 prime timelineService:', t);
    }

    // ==========================================
    // Phase 1: OOC Subagent (在 ReAct 循环前完成)
    // ==========================================
    // NPC Reaction 和 Action Classification 已挪入下方大 Promise.all，
    // 与 Branch A iter 1 / Branch B iter 2-4 并行，iter 5+ rebuild 时统一拿到。
    // 本轮开始先清掉上一轮遗留的 OOC 准则，避免空触发时残留。
    this.clearPendingOoc();

    await (async () => {
      // 优先级：forced directive（regenerate 复用上一轮 OOC）> candidates（首次输入提取）。
      // forced 路径不走 subagent，不打 stepLog，不会触发反问。
      if (typeof oocOptions?.forcedNormalized === 'string' && oocOptions.forcedNormalized.trim()) {
        this.setPendingOoc({
          raw: Array.isArray(oocOptions.forcedRaw) ? oocOptions.forcedRaw.slice() : [],
          normalized: oocOptions.forcedNormalized,
        });
        return;
      }
      const cands = Array.isArray(oocOptions?.candidates)
        ? oocOptions.candidates
        : [];
      if (!cands.length) return;
      // _runOocWorkflow 内部已吞掉所有异常，不抛出
      await this._runOocWorkflow(oocAdapter, cands);
    })();

    // ==========================================
    // GM 决策层（OOC 完成后、ReAct 循环前，纯代码瞬时完成）
    // ==========================================
    let gmDirective = null;
    const hasEnoughHistory =
      typeof chatHistory !== 'undefined' && chatHistory.filter(m => m.sender === 'ai').length > 0;
    const openingTimeBlocked = this._activeOpeningTimeContext?.blocked === true;

    if (hasEnoughHistory && !openingTimeBlocked) {
      const gmStepLog = {
        step: 'gm',
        phase: 'gm_decision',
        engine: 'GM Code Engine',
        request: null,
      };
      this.lastPayload.steps.push(gmStepLog);
      this._markStepStarted(gmStepLog);

      try {
        gmDirective = await this._callGM(messages);
        gmStepLog.request = this.lastGMPayload?.request || null;
        gmStepLog.response = {
          directive: gmDirective,
          result: this.lastGMPayload?.result || null,
        };
        if (this.lastGMPayload?.errorInfo) {
          gmStepLog.failed = true;
          gmStepLog.errorInfo = this.lastGMPayload.errorInfo;
          gmStepLog.error = this.lastGMPayload.errorInfo.message;
          gmStepLog.endedAt = new Date().toISOString();
        } else {
          this._markStepSucceeded(gmStepLog);
        }
        if (gmDirective) {
          console.log(`[GM] 写作指导: ${gmDirective.substring(0, 100)}...`);
        } else {
          console.log('[GM] 无指导');
        }
      } catch (e) {
        this._markStepFailure(
          gmStepLog,
          e,
          {
            phase: 'gm_decision',
            module: 'gm',
            engine: 'GM Code Engine',
            defaultErrorType: 'unknown',
          },
          {
            updatePayload: false,
          }
        );
        console.warn('[GM] 调用失败:', e);
      }
    } else if (openingTimeBlocked) {
      console.log('[GM] 首轮随机开局缺少合法时间范围，跳过 GM 引导');
    }

    // ==========================================
    // Pure ReAct Loop
    // ==========================================

    // 保存当前状态快照（工具会在循环中直接修改状态，需在修改前记录）
    if (typeof playerStateService !== 'undefined') {
      const prevDate = typeof timelineService !== 'undefined' ? timelineService.getCurrentDate() : null;
      const prevLocation = typeof locationTracker !== 'undefined' ? locationTracker.getLocation() : null;
      playerStateService.setPreviousTurnState(prevDate, prevLocation);
    }

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // Parallel ReAct Pipeline (v0)
    // Branch A (iter 1, narrative-only) ‖ Branch B (iter 2-4 read-only chain)
    //                            ↓ Promise.all merge ↓
    //                  iter 5 (read 补查 + mutations，执行 iter1 next_tool)
    //                  iter 6 (segment 2 narrative + 可选 update_item，checkpoint 三选一: none/item_check/hidden_state)
    //                  iter 7 (仅 iter6 type 非-none 时跑：执行 iter6 next_tool + segment 3 收尾)
    //                  → fall through to iter 8 (settlement) + iter 9 (choices)
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    this.accumulatedStepCount++;
    console.log(`[${reactLabel} Agent] Parallel ReAct Pipeline (model: ${reactModel})`);

    reactAdapter.syncExecutedTools(currentMessages, executedTools);

    // 构建系统提示词（包含所有上下文：GM、游戏状态等）
    // 注：npcReactions 已挪入下方大 Promise.all（与 Branch A/B 并行），此处尚未解析；
    // iter 5+ 通过 _rebuildMergedSystemPartsForIteration 拿到完整 NPC reactions / action context。
    let mergedSystemParts;
    try {
      mergedSystemParts = this._buildMergedSystemParts(
        systemContext,
        lastGameState,
        lastUserMessage,
        messages,
        gmDirective,
        null
      );
    } catch (e) {
      e.failedPhase = 'react';
      throw e;
    }
    const mergedPromptManifest = this._lastPromptManifest;

    // DeepSeek 预检：确保消息中有 user 消息
    if (reactAdapter.provider === 'deepseek' && !messageSanitization.hasUser) {
      throw new Error('ReAct 请求前检查失败：未找到玩家输入');
    }

    // 温度（所有 iter 共享，由用户 modules.react.temperature 决定）
    // thinking 改为 per-iter：iter1_narrative 作 default（用于 iter 1/6/7 叙事路径），
    // iter 2-4/5/9 在各自 buildPayload 前再单独查。
    const defaultTemperature = 1.0;
    const temperature = this.getModuleTemperature('react', defaultTemperature, AI_REQUEST_SCOPED);
    const thinking = this.getModuleThinking('iter1_narrative', AI_REQUEST_SCOPED);

    // ━━━ 累积器 ━━━
    const iterationMetrics = [];
    const reactIterationSegments = [];
    const narrativeAccRef = { value: '' };       // wrapper：让 _runReactIteration mutate 字符串
    let narrativeAccumulator = '';                // iter 8/9 + 函数 epilogue 用 plain string
    let choicesData = [];
    // mainLoopToolCounts 已在函数顶部声明（line ~95），跨 stage 复用。
    let messagesRef;                              // 每个 stage 后刷新指向最新 stage 的 messagesRef

    const isEn = this._getGamePromptLanguage?.() === 'en';

    // ━━━ Branch A 准备：iter 1 (narrative-only) ━━━
    // 关键：每个 branch 必须 deep-clone sanitizedMessages 再传给 buildPayload。
    // 原因：Gemini 的 buildPayload 直接 alias 输入数组（payload.contents = messages），
    // 不复制。两支并发跑时若共用同一个数组，appendUserMessage / appendToolResults
    // 会互相污染（指令交叉、tool result 串入对方分支），merge 时 slice(baseLen) 也会
    // 拿到重复内容。OpenAI / Anthropic 的 buildPayload 内部 .map 已新建数组，本身无碍，
    // 但为统一代码路径都加 clone。
    const { tools: branchATools, allowedToolNames: branchAAllowed, toolChoice: branchAToolChoice } = this._buildToolsForStage('narrative_only', reactAdapter);
    const branchABaseMessages = JSON.parse(JSON.stringify(sanitizedMessages));
    const { payload: branchAPayloadObj, url: branchAUrl, streamUrl: branchAStreamUrl } =
      reactAdapter.buildPayload(branchABaseMessages, mergedSystemParts, branchATools, { temperature, thinking, toolChoice: branchAToolChoice });
    const branchAMessagesRef = reactAdapter.getPayloadMessagesRef(branchAPayloadObj);
    // ⚠️ 关键：baseLen 必须在 buildPayload 之后、appendUserMessage 之前捕获。
    // 不同 adapter 的 messagesRef 起始长度不同：
    //   Gemini: payload.contents = messages（无 system 前缀）→ length = sanitized.length
    //   OpenAI/DeepSeek: payload.messages = [system, ...converted]（多 1 项 system 前缀）→ length = sanitized.length + 1
    //   Anthropic: payload.messages = converted（system 走 system 字段）→ length = sanitized.length
    // 用 sanitizedMessages.length 当 baseLen 在 OpenAI/DeepSeek 上 off-by-one，会让 branchADelta
    // 把原始 user 消息也拽进 delta，merge 后产生重复用户消息。改用 messagesRef.length 自适应所有 adapter。
    const baseLen = branchAMessagesRef.length;
    this.reactLoop.appendUserMessage(
      branchAMessagesRef,
      window.promptRegistry.get('react.directive.parallelStage1Narrative').builder({ isEn }),
      reactAdapter
    );

    // ━━━ Branch B 准备：iter 2-4 chain (reads-only) ━━━
    // per-iter 路由：iter 2-4 用 iter2_4_reads（推荐模式：v4-flash + thinking=off）。
    // tool_choice='auto'，即便后续把 thinking 调高也不会被 forced-tool gate 吞。
    const branchBAdapter = this._getAdapter('iter2_4_reads', AI_REQUEST_SCOPED);
    const branchBModel = this.getModelForModule('iter2_4_reads', AI_REQUEST_SCOPED);
    const branchBThinking = this.getModuleThinking('iter2_4_reads', AI_REQUEST_SCOPED);
    const { tools: branchBTools, allowedToolNames: branchBAllowed, toolChoice: branchBToolChoice } = this._buildToolsForStage('reads_only', branchBAdapter);
    const branchBBaseMessages = JSON.parse(JSON.stringify(sanitizedMessages));
    const { payload: branchBPayloadObj, url: branchBUrl, streamUrl: branchBStreamUrl } =
      branchBAdapter.buildPayload(branchBBaseMessages, mergedSystemParts, branchBTools, { temperature, thinking: branchBThinking, toolChoice: branchBToolChoice });
    const branchBMessagesRef = branchBAdapter.getPayloadMessagesRef(branchBPayloadObj);
    this.reactLoop.appendUserMessage(
      branchBMessagesRef,
      window.promptRegistry.get('react.directive.parallelStage2Reads').builder({ isEn }),
      branchBAdapter
    );

    // ━━━ Promise.all 跑四支：Branch A ‖ Branch B ‖ NPC Reaction ‖ Action Classification ━━━
    const [iter1Result, , npcReactions] = await Promise.all([
      // Branch A: 单轮 iter 1（attach promptManifest 到首个 stepLog 供 debug UI）
      this._runReactIteration({
        reactAdapter, reactLabel, reactModel,
        payload: branchAPayloadObj, messagesRef: branchAMessagesRef,
        url: branchAUrl, streamUrl: branchAStreamUrl,
        executedTools,
        narrativeAccumulator: narrativeAccRef,
        reactIterationSegments, iterationMetrics, mainLoopToolCounts,
        iteration: 1, iterationLabel: 'iter1.A', branchLabel: 'A',
        onChunk,
        skipNarrativeRescue: false,
        promptManifest: mergedPromptManifest,
        allowedToolNames: branchAAllowed,
      }).catch(e => {
        console.error('[Agent] Branch A (iter 1) 异常:', e?.message || e);
        return { hadError: true, hadToolCalls: false, narrativeCheckpoint: null };
      }),
      // Branch B: 最多 3 iter 链（用 iter2_4_reads 配置）
      (async () => {
        let last = null;
        for (let i = 0; i < 3; i++) {
          const branchBLabel = `iter${i + 2}.B`;
          try {
            last = await this._runReactIteration({
              reactAdapter: branchBAdapter, reactLabel, reactModel: branchBModel,
              payload: branchBPayloadObj, messagesRef: branchBMessagesRef,
              url: branchBUrl, streamUrl: branchBStreamUrl,
              executedTools,
              narrativeAccumulator: narrativeAccRef,
              reactIterationSegments, iterationMetrics, mainLoopToolCounts,
              iteration: i + 2, iterationLabel: branchBLabel, branchLabel: 'B',
              onChunk: null,
              skipNarrativeRescue: true,  // 后台 read 阶段不抢救纯文本为叙事
              allowedToolNames: branchBAllowed,
            });
          } catch (e) {
            console.warn(`[Agent] Branch B ${branchBLabel} 异常，终止 chain:`, e?.message || e);
            break;
          }
          if (!last.hadToolCalls) {
            console.log(`[Agent] Branch B ${branchBLabel} 无工具调用，提前终止 chain`);
            break;
          }
        }
        return last;
      })(),
      // NPC Reaction（原 Phase 1 内容，挪到此处与 Branch A/B 并行）
      this._runNpcReactionCalls(npcReactionAdapter, messages, systemContext).catch(e => {
        console.warn('[NPC Reaction] 整体失败，不阻塞主流程:', e?.message || e);
        return [];
      }),
      // Action Classification（原 Phase 1 内容，挪到此处与 Branch A/B 并行）
      (async () => {
        if (!actionClassificationOptions?.actionInputText) return;
        try {
          await this.preparePendingPlayerActionContext(
            actionClassificationOptions.actionInputText,
            {
              selectedChoicePayload: actionClassificationOptions.selectedChoicePayload || '',
              selectedChoiceText: actionClassificationOptions.selectedChoiceText || '',
            }
          );
        } catch (error) {
          this.clearPendingPlayerActionContext();
          console.warn('[ActionContext] 并行动作分类失败:', error?.message || error);
        }
      })(),
    ]);

    // NPC Reaction 完成通知（移到此处，原 Phase 1 emit 已删除）
    if (npcReactions && npcReactions.length > 0 && window.eventBus && window.GameEvents) {
      window.eventBus.emit(window.GameEvents.AI_NPC_REACTIONS_COMPLETE, {
        reactions: npcReactions,
      });
    }

    // ━━━ Merge: 拼出统一 messagesArr ━━━
    const branchADelta = branchAMessagesRef.slice(baseLen);
    const branchBDelta = branchBMessagesRef.slice(baseLen);
    let unifiedMessages = [...sanitizedMessages, ...branchADelta, ...branchBDelta];
    console.log(`[Agent] Parallel merge: A=+${branchADelta.length} entries, B=+${branchBDelta.length} entries`);

    const iter1Checkpoint = iter1Result?.narrativeCheckpoint || null;
    const iter1NextTool = (iter1Checkpoint && iter1Checkpoint.type !== 'none' && typeof iter1Checkpoint.next_tool === 'string')
      ? iter1Checkpoint.next_tool.trim()
      : '';

    if (!iter1NextTool) {
      console.warn('[Agent] iter 1 未声明有效 checkpoint（type=none 或 next_tool 缺失），跳过 iter 5/6/7，直接进 iter 8/9');
      // 用一个临时 payload 把 unifiedMessages 转成可被 iter 8/9 后续 mutate 的 messagesRef
      const tailPayload = reactAdapter.buildPayload(unifiedMessages, mergedSystemParts, branchATools, { temperature, thinking, toolChoice: branchAToolChoice });
      messagesRef = reactAdapter.getPayloadMessagesRef(tailPayload.payload);
    } else {
      // ━━━ iter 5: read 补查 + mutations ━━━
      // per-iter 路由：iter 5 是整个回合的逻辑决策核心（state mutations）。
      // 推荐模式 v4-flash + thinking=max；tool_choice='auto' → forced-tool gate 不触发。
      const iter5Adapter = this._getAdapter('iter5_mutations', AI_REQUEST_SCOPED);
      const iter5Model = this.getModelForModule('iter5_mutations', AI_REQUEST_SCOPED);
      const iter5Thinking = this.getModuleThinking('iter5_mutations', AI_REQUEST_SCOPED);
      let mergedSystemParts5 = mergedSystemParts;
      try {
        mergedSystemParts5 = this._rebuildMergedSystemPartsForIteration({
          lastGameState, userMessage: lastUserMessage, messages,
          gmDirective, npcReactions,
        });
      } catch (e) {
        console.warn('[Agent] iter 5: 刷新 system 块失败，沿用初始值:', e?.message || e);
      }
      const { tools: iter5Tools, allowedToolNames: iter5Allowed, toolChoice: iter5ToolChoice } = this._buildToolsForStage('reads_and_mutations', iter5Adapter);
      const iter5Built = iter5Adapter.buildPayload(unifiedMessages, mergedSystemParts5, iter5Tools, { temperature, thinking: iter5Thinking, toolChoice: iter5ToolChoice });
      const iter5MessagesRef = iter5Adapter.getPayloadMessagesRef(iter5Built.payload);
      this.reactLoop.appendUserMessage(
        iter5MessagesRef,
        window.promptRegistry.get('react.directive.parallelStage3MergeAndMutate').builder({ isEn, iter1NextTool }),
        iter5Adapter
      );

      try {
        await this._runReactIteration({
          reactAdapter: iter5Adapter, reactLabel, reactModel: iter5Model,
          payload: iter5Built.payload, messagesRef: iter5MessagesRef,
          url: iter5Built.url, streamUrl: iter5Built.streamUrl,
          executedTools,
          narrativeAccumulator: narrativeAccRef,
          reactIterationSegments, iterationMetrics, mainLoopToolCounts,
          iteration: 5, iterationLabel: 'iter5', branchLabel: 'main',
          onChunk: null,
          skipNarrativeRescue: true,
          allowedToolNames: iter5Allowed,
        });
      } catch (e) {
        console.warn('[Agent] iter 5 异常，继续 iter 6:', e?.message || e);
      }
      messagesRef = iter5MessagesRef;
      unifiedMessages = iter5MessagesRef.slice();

      // ━━━ iter 6: segment 2 narrative ━━━
      let mergedSystemParts6 = mergedSystemParts5;
      try {
        mergedSystemParts6 = this._rebuildMergedSystemPartsForIteration({
          lastGameState, userMessage: lastUserMessage, messages,
          gmDirective, npcReactions,
        });
      } catch (e) {
        console.warn('[Agent] iter 6: 刷新 system 块失败，沿用 iter 5 值:', e?.message || e);
      }
      const { tools: iter6Tools, allowedToolNames: iter6Allowed, toolChoice: iter6ToolChoice } = this._buildToolsForStage('narrative_with_item', reactAdapter);
      const iter6Built = reactAdapter.buildPayload(unifiedMessages, mergedSystemParts6, iter6Tools, { temperature, thinking, toolChoice: iter6ToolChoice });
      const iter6MessagesRef = reactAdapter.getPayloadMessagesRef(iter6Built.payload);
      this.reactLoop.appendUserMessage(
        iter6MessagesRef,
        window.promptRegistry.get('react.directive.parallelStage4Resolve').builder({ isEn }),
        reactAdapter
      );

      let iter6Result = null;
      try {
        iter6Result = await this._runReactIteration({
          reactAdapter, reactLabel, reactModel,
          payload: iter6Built.payload, messagesRef: iter6MessagesRef,
          url: iter6Built.url, streamUrl: iter6Built.streamUrl,
          executedTools,
          narrativeAccumulator: narrativeAccRef,
          reactIterationSegments, iterationMetrics, mainLoopToolCounts,
          iteration: 6, iterationLabel: 'iter6', branchLabel: 'main',
          onChunk,
          skipNarrativeRescue: false,
          allowedToolNames: iter6Allowed,
        });
      } catch (e) {
        console.warn('[Agent] iter 6 异常，跳到 iter 8:', e?.message || e);
      }
      messagesRef = iter6MessagesRef;
      unifiedMessages = iter6MessagesRef.slice();

      // ━━━ iter 7: 三分支 gating ━━━
      //   分支 1: rescue 模式  — iter 6 漏调 update_narrative（segment 2 缺失），用 iter 7 槽位补写
      //                        包含两种情况：(a) iter 6 跑完但 AI 没调 update_narrative；
      //                                     (b) iter 6 整体抛异常（iter6Result=null）
      //                        瞬时故障 / 单点解析失败下，rescue 用更简单 payload 还能救活回合
      //   分支 2: closing_resolve — iter 6 调了 narrative + 非-none type，正常闭合
      //   分支 3: 跳过           — iter 6 调了 narrative 但 type=none，无需 iter 7
      const iter6MissedNarrative = !iter6Result || !iter6Result.executedToolNames?.includes('update_narrative');
      const iter6Checkpoint = iter6Result?.narrativeCheckpoint || null;
      const iter6NextToolRaw = (iter6Checkpoint && iter6Checkpoint.type !== 'none' && typeof iter6Checkpoint.next_tool === 'string')
        ? iter6Checkpoint.next_tool.trim()
        : '';

      // 验证 iter6NextTool 必须命中 registry——否则 closing_resolve filter 只会暴露 update_narrative，
      // 而 directive 仍会要求 AI 调那个不存在的工具，触发 hard-reject。
      // schema enum 已锁住合法名，但保留 runtime 校验作为防御层（custom function override / 工具被禁用等场景）。
      let iter6NextTool = '';
      if (iter6NextToolRaw) {
        const reg = window.toolRegistry;
        if (reg && typeof reg.has === 'function' && reg.has(iter6NextToolRaw) && !reg.isDispatcherManaged(iter6NextToolRaw)) {
          iter6NextTool = iter6NextToolRaw;
        } else {
          console.warn(`[Agent] iter 6 声明 next_tool="${iter6NextToolRaw}" 但 registry 中不存在或被 dispatcher 管理，跳过 iter 7`);
        }
      }

      if (iter6MissedNarrative) {
        // ━━━ 分支 1: iter 7 rescue 模式 ━━━
        // iter 6 漏调 update_narrative（典型：弱模型如 DeepSeek 在 toolChoice='any' + 多工具下选了逃逸路径
        // 只调 update_item 跳过 update_narrative）。用命名强制 narrative_only_closing stage 占用 iter 7 槽位
        // 补写 segment 2，type 强制为 none（与 iter 7 closing 精神一致）。
        console.warn('[Agent] iter 6 漏调 update_narrative，iter 7 切换到 rescue 模式');
        let mergedSystemParts7 = mergedSystemParts6;
        try {
          mergedSystemParts7 = this._rebuildMergedSystemPartsForIteration({
            lastGameState, userMessage: lastUserMessage, messages,
            gmDirective, npcReactions,
          });
        } catch (e) {
          console.warn('[Agent] iter 7 rescue: 刷新 system 块失败:', e?.message || e);
        }
        const { tools: rescueTools, allowedToolNames: rescueAllowed, toolChoice: rescueToolChoice } = this._buildToolsForStage('narrative_only_closing', reactAdapter);
        const rescueBuilt = reactAdapter.buildPayload(unifiedMessages, mergedSystemParts7, rescueTools, { temperature, thinking, toolChoice: rescueToolChoice });
        const rescueMessagesRef = reactAdapter.getPayloadMessagesRef(rescueBuilt.payload);
        this.reactLoop.appendUserMessage(
          rescueMessagesRef,
          window.promptRegistry.get('react.directive.parallelStage5Rescue').builder({ isEn }),
          reactAdapter
        );

        try {
          await this._runReactIteration({
            reactAdapter, reactLabel, reactModel,
            payload: rescueBuilt.payload, messagesRef: rescueMessagesRef,
            url: rescueBuilt.url, streamUrl: rescueBuilt.streamUrl,
            executedTools,
            narrativeAccumulator: narrativeAccRef,
            reactIterationSegments, iterationMetrics, mainLoopToolCounts,
            iteration: 7, iterationLabel: 'iter7.rescue', branchLabel: 'main',
            onChunk,
            skipNarrativeRescue: false,
            allowedToolNames: rescueAllowed,
          });
        } catch (e) {
          console.warn('[Agent] iter 7 rescue 异常，跳到 iter 8:', e?.message || e);
        }
        messagesRef = rescueMessagesRef;
      } else if (iter6NextTool) {
        // ━━━ 分支 2: iter 7 closing_resolve 正常路径 ━━━
        let mergedSystemParts7 = mergedSystemParts6;
        try {
          mergedSystemParts7 = this._rebuildMergedSystemPartsForIteration({
            lastGameState, userMessage: lastUserMessage, messages,
            gmDirective, npcReactions,
          });
        } catch (e) {
          console.warn('[Agent] iter 7: 刷新 system 块失败:', e?.message || e);
        }
        const { tools: iter7Tools, allowedToolNames: iter7Allowed, toolChoice: iter7ToolChoice } = this._buildToolsForStage('closing_resolve', reactAdapter, { iter6NextTool });
        const iter7Built = reactAdapter.buildPayload(unifiedMessages, mergedSystemParts7, iter7Tools, { temperature, thinking, toolChoice: iter7ToolChoice });
        const iter7MessagesRef = reactAdapter.getPayloadMessagesRef(iter7Built.payload);
        this.reactLoop.appendUserMessage(
          iter7MessagesRef,
          window.promptRegistry.get('react.directive.parallelStage5Final').builder({ isEn, iter6NextTool }),
          reactAdapter
        );

        try {
          await this._runReactIteration({
            reactAdapter, reactLabel, reactModel,
            payload: iter7Built.payload, messagesRef: iter7MessagesRef,
            url: iter7Built.url, streamUrl: iter7Built.streamUrl,
            executedTools,
            narrativeAccumulator: narrativeAccRef,
            reactIterationSegments, iterationMetrics, mainLoopToolCounts,
            iteration: 7, iterationLabel: 'iter7', branchLabel: 'main',
            onChunk,
            skipNarrativeRescue: false,
            allowedToolNames: iter7Allowed,
          });
        } catch (e) {
          console.warn('[Agent] iter 7 异常，跳到 iter 8:', e?.message || e);
        }
        messagesRef = iter7MessagesRef;
      } else {
        // ━━━ 分支 3: 跳过 iter 7 ━━━
        console.log('[Agent] iter 6 type=none 或无有效 next_tool，跳过 iter 7');
      }
    }

    // 把累积叙事拷回 plain string 供 iter 8/9 与函数 epilogue 使用
    narrativeAccumulator = narrativeAccRef.value;

    // ━━━ iter 8: settlement（panelSkill ‖ inventorySkill 并发 + 摘要注回 messagesRef）━━━
    await this._runSettlementIteration({
      narrativeAccumulator,
      mainLoopToolCounts,
      messagesRef,
      reactAdapter,
      temperature,
      reactIterationSegments,
    });

    // ━━━ iter 9: choices（仅 update_choices 工具 + 4 层 salvage）━━━
    // 注：iter 9 在 _runChoicesIteration 内部用 iter9_choices 专属配置（v4-flash + off），
    // 不复用 caller 的 reactAdapter / thinking / reactModel；本调用不再传这三个参数。
    const choicesResult = await this._runChoicesIteration({
      sanitizedMessages,
      messagesRef,
      lastGameState,
      lastUserMessage,
      messages,
      gmDirective,
      npcReactions,
      mergedSystemParts,
      temperature,
      reactLabel,
      reactIterationSegments,
      iterationMetrics,
      narrativeAccumulator,
    });
    choicesData = choicesResult.choicesData;
    narrativeAccumulator = choicesResult.narrativeAccumulator;

    // ── 函数 epilogue · 空 narrative 灾难兜底 ──
    // 处理"全 pipeline 一字未产"的极端情况：iter 1/6/7 都 throw + iter 9 也无 hallucinated narrative。
    // 这是函数级最后一道闸，与 iter 9 内部 4 层 salvage 不同（后者只兜 choices）。
    if (!narrativeAccumulator.trim()) {
      // 兜底 1：尝试从 commentary 段落拼接明文输出
      const commentaryText = reactIterationSegments
        .filter(s => s.type === 'commentary' && s.text && s.text.trim())
        .map(s => s.text.trim())
        .join('\n\n');

      if (commentaryText) {
        console.warn('[Agent] 模型未调用 update_narrative()，使用 commentary 文本兜底');
        narrativeAccumulator = commentaryText;
        reactIterationSegments.push({
          type: 'narrative',
          iteration: 0,
          text: commentaryText,
          fallback: true,
        });
      } else {
        // 兜底 2：commentary 也为空 → 抛出更可操作的错误
        const lang = this._getGamePromptLanguage?.() || 'zh';

        // 扫上游 step 找出真实根因：tool_choice 被 provider 拒绝时，原始错误信息会
        // 被 epilogue 改写成误导性的"模型不支持 function calling"，把它换成上游首条错误。
        const upstreamFailures = (this.lastPayload?.steps || []).filter(
          s => s?.failed && /tool[_ ]choice|does not support|400/i.test(
            s?.errorInfo?.message || s?.error || ''
          )
        );
        const upstreamFirst = upstreamFailures[0];
        const upstreamFirstMsg = upstreamFirst
          ? (upstreamFirst.errorInfo?.message || upstreamFirst.error)
          : null;

        const msg = upstreamFirst
          ? (lang === 'en'
              ? `Narrative generation failed: ${upstreamFailures.length} upstream tool_choice request(s) were rejected by the provider. First: ${upstreamFirstMsg}`
              : `叙事生成失败：上游 ${upstreamFailures.length} 次 tool_choice 请求被 provider 拒绝。首条：${upstreamFirstMsg}`)
          : (lang === 'en'
              ? 'Model did not produce narrative via function calling (no update_narrative call and no plain text output). This model may not support tool calling — try a model with function calling support.'
              : '模型未通过 function calling 返回叙事（既未调用 update_narrative 也无明文输出）。该模型可能不支持工具调用，建议改用支持 function calling 的模型。');

        const rootCause = upstreamFirst
          ? `上游 ${upstreamFailures.length} 次工具调用因 tool_choice 被 provider 拒绝（首条 ${upstreamFirst.phase || '?'}: ${upstreamFirstMsg}）`
          : '模型未按 function calling 协议返回叙事（commentary 也为空）';

        const emptyTextError = new Error(`Agent ReAct Error: ${msg}`);
        this._markStepFailure(
          this.lastPayload.steps[this.lastPayload.steps.length - 1],
          emptyTextError,
          {
            phase: 'react',
            module: 'react',
            provider: reactLabel,
            model: reactModel,
            url: null,  // 函数 epilogue：无单一 url 概念（pipeline 多 stage 各自 url）
            defaultErrorType: 'unexpected_format',
            rootCause,
          }
        );
        throw emptyTextError;
      }
    }

    // ── 保存结果 ──
    this.lastReactSegments = reactIterationSegments;
    this.lastNarrativeText = narrativeAccumulator;
    this.lastNarrativeOnly = narrativeAccumulator;

    // 保存结构化选项数据（供 processAIResponse 注入 gameData）
    this.lastChoicesData = choicesData.length > 0 ? choicesData : null;

    // 将 choices 格式化为 step2Choices 文本（供 UI 展示）
    if (choicesData.length > 0) {
      this.lastStep2Choices = choicesData
        .filter(c => c && c.id != null && c.text)
        .map(c => `${c.id}. [${c.type_tag || '?'}] ${c.text}`)
        .join('\n');
    } else {
      this.lastStep2Choices = '';
    }

    // 通知前端
    if (window.eventBus && window.GameEvents) {
      window.eventBus.emit(window.GameEvents.AI_REACT_COMPLETE, {
        functionCalls: this.lastFunctionCalls,
      });
      window.eventBus.emit(window.GameEvents.AI_NARRATIVE_COMPLETE, {});
    }

    // 汇总 ReAct 循环 metrics
    if (iterationMetrics.length > 0) {
      // TTFT 取 Branch A（iter 1）的——这是用户感知的首字延迟。
      // Promise.all 下完成顺序非确定，iterationMetrics[0] 可能是更快返回的 Branch B 小 read query，
      // 那不是 user-visible TTFT。所以显式按 branch='A' 找。
      const branchATTFT = iterationMetrics.find(m => m.branch === 'A')?.ttft;
      stepMetrics.push({
        phase: 'react',
        model: reactModel,
        iterations: iterationMetrics.length,
        inputTokens: iterationMetrics.reduce((s, m) => s + (m.inputTokens || 0), 0),
        outputTokens: iterationMetrics.reduce((s, m) => s + (m.outputTokens || 0), 0),
        ttft: branchATTFT ?? iterationMetrics[0]?.ttft ?? null,
        totalTime: iterationMetrics.reduce((s, m) => s + (m.totalTime || 0), 0),
        perIteration: iterationMetrics,
      });
    }

    this.lastPayload.models.react = reactModel;

    console.log(`[Agent] ReAct 完成: 叙事 ${narrativeAccumulator.length} 字, ${choicesData.length} 个选项`);

    // 记录当前 turn number，供标记短信时使用
    if (this._pendingSmsInjection) {
      this._pendingSmsTurnNumber =
        messages.filter(m => m.role === 'model' || m.role === 'assistant').length + 1;
    }

    this.clearPendingPlayerActionContext();

    // GM 状态提交
    const openingGuideTurn =
      typeof chatHistory !== 'undefined' ? chatHistory.filter(m => m.sender === 'ai').length : 0;

    if (
      typeof gmCodeEngine !== 'undefined' &&
      typeof gmCodeEngine.updateOpeningGuideProgress === 'function'
    ) {
      gmCodeEngine.updateOpeningGuideProgress(openingGuideTurn, narrativeAccumulator);
    }

    if (this._pendingEventToMark) {
      const pending = this._pendingEventToMark;
      if (
        typeof gmCodeEngine !== 'undefined' &&
        typeof gmCodeEngine.markEventBroadcasted === 'function'
      ) {
        gmCodeEngine.markEventBroadcasted(pending.eventId, pending.turn, pending.type, null);
        console.log('[GM] 事件已标记:', pending.eventId);
      }
      this._pendingEventToMark = null;
    }

    // 返回叙事文本（不再包装为 JSON 代码块）
    // processAIResponse 将以纯文本形式接收，panel_status 由工具直接修改
    const finalOutput = narrativeAccumulator;

    // 兼容下游监听器
    if (window.eventBus && window.GameEvents) {
      window.eventBus.emit(window.GameEvents.AI_STEP3_COMPLETE, {
        jsonData: { choices: choicesData, panel_narrative: narrativeAccumulator },
        narrativeText: narrativeAccumulator,
      });
    }

    // 时间指标
    const totalRequestTime = performance.now() - requestStartTime;
    const totalInputTokens = stepMetrics.reduce((sum, s) => sum + (s.inputTokens || 0), 0);
    const totalOutputTokens = stepMetrics.reduce((sum, s) => sum + (s.outputTokens || 0), 0);

    const reactProviderKey = reactAdapter.getProviderLabel().toLowerCase();
    this.lastRequestMetrics = {
      provider: reactProviderKey,
      providers: {
        react: reactProviderKey,
      },
      models: {
        react: reactModel,
      },
      thinking: reactProviderKey === 'deepseek'
        ? { react: this.getModuleThinking('react', AI_REQUEST_SCOPED) }
        : {},
      prices: {
        react: this.getModulePrices('react', AI_REQUEST_SCOPED),
      },
      gmDirective: gmDirective ? true : false,
      ttft: stepMetrics[0]?.ttft || null,
      totalTime: Math.round(totalRequestTime),
      inputTokens: totalInputTokens,
      outputTokens: totalOutputTokens,
      steps: stepMetrics,
      timestamp: new Date(),
    };
    console.log(
      `[Agent] 请求完成 - ReAct: ${reactModel}, GM指令: ${gmDirective ? '有' : '无'} | TTFT: ${this.lastRequestMetrics.ttft}ms, 总时间: ${this.lastRequestMetrics.totalTime}ms`
    );

    // 标记短信
    if (this._pendingSmsInjection && typeof smsService !== 'undefined') {
      smsService.markAllNewAsInjected(this._pendingSmsTurnNumber);
      console.log(`[Agent] 短信已标记为 injected (Turn ${this._pendingSmsTurnNumber})`);
      this._pendingSmsInjection = false;
      this._pendingSmsTurnNumber = null;
    }

    try {
      const _dur = ((typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now()) - _analyticsT0;
      window.analyticsService?.noteAiCall?.(_dur);
      window.analyticsService?.track?.('ai.response', {
        request_id: _analyticsReqId,
        duration_ms: Math.round(_dur),
        completion_len_chars: typeof finalOutput === 'string' ? finalOutput.length : 0,
        finish_reason: 'stop',
        retry_count: 0,
        was_streamed: true,
        ok: true,
      });
    } catch (_) { /* ignore */ }

    return finalOutput;

    } catch (err) {
      try {
        const _dur = ((typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now()) - _analyticsT0;
        window.analyticsService?.noteAiCall?.(_dur);
        window.analyticsService?.track?.('ai.response', {
          request_id: _analyticsReqId,
          duration_ms: Math.round(_dur),
          completion_len_chars: 0,
          finish_reason: 'error',
          retry_count: 0,
          was_streamed: true,
          ok: false,
          error_message: err?.message ? String(err.message).slice(0, 256) : null,
        });
      } catch (_) { /* ignore */ }
      throw err;
    } finally {
      this._currentAbortSignal = null;
      // Turn 结束（正常/abort/异常）统一清理 turn 级全局状态
      // 避免用户快速连续提交时前一回合的 hints 泄露到下一回合
      window._currentTurnSettlementHints = null;
    }
  }

  // ============================================
  // iter 8 · settlement
  // ============================================
  /**
   * 并发执行所有已注册 skill（panelSkill + inventorySkill），结果折叠成结算摘要
   * 注回 messagesRef 末尾，给 iter 9 看见结算后状态。
   *
   * 输入契约：
   *   - narrativeAccumulator: iter 1-7 累积叙事的 plain string
   *   - mainLoopToolCounts: 主循环 tool 调用次数累计（inventorySkill.shouldRun 用）
   *   - messagesRef: 主对话流引用（结算摘要 append 进去）
   *   - reactAdapter / temperature: 透传给 skill subagent 调用
   *
   * 输出契约：
   *   - 写 this.lastPayload.settlementDispatch（debug UI 在 6 处读这个字段）
   *   - 通过 settlementSummaryWrapper directive 把结算摘要 append 到 messagesRef
   *   - 返回 dispatchResult（caller 可选地利用，目前不用）
   *
   * @returns {Promise<Object>} skillDispatcher.dispatch 的原始 result
   */
  async _runSettlementIteration({
    narrativeAccumulator,
    mainLoopToolCounts,
    messagesRef,
    reactAdapter,
    temperature,
    reactIterationSegments,  // 让 iter 8 出现在主气泡的推理列表（VIII）
  }) {
    if (!window.skillDispatcher || window.skillDispatcher.size === 0) {
      // 没有任何 skill 注册时直接 no-op（早期初始化或测试场景）
      return { completedTools: [], failedSkills: [], summary: {}, skillResults: {} };
    }

    const turnCtx = {
      narrativeText: narrativeAccumulator,
      gameState: window.buildTurnResult?.() || {},
      settlementHints: window._currentTurnSettlementHints || null,
      mainLoopToolCounts: { ...mainLoopToolCounts },
      adapter: reactAdapter,
      temperature,
      abortSignal: this._currentAbortSignal,
    };

    let result = null;
    let dispatchCrashed = false;
    try {
      result = await window.skillDispatcher.dispatch(turnCtx, this);
    } catch (e) {
      console.error('[Agent] iter 8 settlement dispatch 异常:', e);
      dispatchCrashed = true;
    }

    const hasRequiredFailure = !dispatchCrashed && (result?.failedSkills || []).some(name => {
      const skill = window.skillDispatcher._skills?.get(name);
      return skill?.required;
    });

    // 持久化到 lastPayload 供 debug UI 使用
    if (this.lastPayload) {
      this.lastPayload.settlementDispatch = {
        status: dispatchCrashed ? 'crashed' : (hasRequiredFailure ? 'failed' : 'succeeded'),
        completedTools: result?.completedTools || [],
        failedSkills: result?.failedSkills || [],
        duration: result?.duration || 0,
        skillResults: Object.fromEntries(
          Object.entries(result?.skillResults || {}).map(
            ([k, v]) => [k, { status: v.status, duration: v.duration }]
          )
        ),
      };
    }

    // 结算摘要 → user 消息注入 messagesRef，给 iter 9 看见结算结果
    // 仅在 dispatch 正常返回时注入；crash 时跳过避免给 iter 9 注入误导性的"(无字段变化)"
    if (result && this.reactLoop) {
      const summaryText = this._formatSettlementSummary(result);
      if (summaryText) {
        const wrappedSummary = window.promptRegistry
          ?.get('react.directive.settlementSummaryWrapper')
          ?.builder({ summaryText });
        if (wrappedSummary) {
          this.reactLoop.appendUserMessage(messagesRef, wrappedSummary, reactAdapter);
        }
      }
    }

    // 把 iter 8 的 skill subagent 工具调用同步到 lastFunctionCalls + reactIterationSegments，
    // 让主气泡的推理时间线显示 VIII 这一步（与 iter 1-7 同形）。
    if (result?.skillResults) {
      const iter8Calls = [];
      for (const [skillName, sr] of Object.entries(result.skillResults)) {
        if (!Array.isArray(sr?.toolResults)) continue;
        for (const tr of sr.toolResults) {
          iter8Calls.push({
            name: tr.name,
            args: tr.args || {},
            status: tr.success ? 'executed' : 'failed',
            result: tr.result ?? (tr.error ? `[失败] ${tr.error}` : null),
            skill: skillName,
          });
        }
      }
      if (iter8Calls.length > 0) {
        if (!this.lastFunctionCalls) this.lastFunctionCalls = [];
        this.lastFunctionCalls.push({
          step: this.accumulatedStepCount,
          iteration: 8,
          iterationLabel: 'iter8',
          branch: 'main',
          calls: iter8Calls,
        });
        if (Array.isArray(reactIterationSegments)) {
          reactIterationSegments.push({ type: 'tools', iteration: 8, iterationLabel: 'iter8' });
        }
        if (window.eventBus && window.GameEvents?.AI_REACT_TOOL_CALL) {
          window.eventBus.emit(window.GameEvents.AI_REACT_TOOL_CALL, {
            iteration: 8,
            iterationLabel: 'iter8',
            calls: iter8Calls,
          });
        }
      }
    }

    return result;
  }

  // ============================================
  // iter 9 · choices
  // ============================================
  /**
   * 单次主模型 API call，工具白名单 = [update_choices]，tool_choice 锁定该工具。
   * 4 层 salvage 保底：
   *   L1: ALLOWED_FORCE_TOOLS 过滤 hallucinated 工具调用
   *   L2: 逐条 _normalizeAndValidateChoiceObject + 占位字段填充
   *   L3: hallucinated update_narrative 文本 salvage 进 narrativeAccumulator
   *   L4: 完全失败 → 注入 3 个泛用 fallback choices, lastPayload.fallbackChoicesUsed=true
   *
   * @returns {Promise<{choicesData: Array, narrativeAccumulator: string}>}
   */
  async _runChoicesIteration({
    // 注意：caller 仍传 reactAdapter/thinking/reactModel（iter1 配置），
    // 但 iter 9 走自己专属 iter9_choices 配置，这里不解构 caller 的版本。
    sanitizedMessages,
    messagesRef,
    lastGameState,
    lastUserMessage,
    messages,
    gmDirective,
    npcReactions,
    mergedSystemParts,
    temperature,
    reactLabel,
    reactIterationSegments,
    iterationMetrics,
    narrativeAccumulator,
  }) {
    let choicesData = [];

    // per-iter 路由：iter 9 用 iter9_choices（推荐模式：v4-flash + thinking=off）。
    // tool_choice 强制 update_choices，forced-tool gate 会自动 strip thinking——
    // 但 thinking=off 一开始就不会触发 gate。
    const reactAdapter = this._getAdapter('iter9_choices', AI_REQUEST_SCOPED);
    const thinking = this.getModuleThinking('iter9_choices', AI_REQUEST_SCOPED);
    const reactModel = this.getModelForModule('iter9_choices', AI_REQUEST_SCOPED);

    // 工具集仅 update_choices；通过 _buildToolsForStage 走统一 schema clone + tool_choice 路径
    const { tools: ucTools, toolChoice: ucToolChoice } = this._buildToolsForStage('choices_only', reactAdapter);

    // 注入 directive：tool_choice 已硬约束工具调用，directive 只负责告知 args 引导
    const isEn = this._getGamePromptLanguage?.() === 'en';
    const forceText = window.promptRegistry
      ?.get('react.directive.forceUpdateChoices')
      ?.builder({ isEn });
    if (forceText && this.reactLoop) {
      this.reactLoop.appendUserMessage(messagesRef, forceText, reactAdapter);
    }

    // iter 9 调用前刷新易变 system 块（确保看到 iter 8 结算后状态）
    let iter9SystemParts = mergedSystemParts;
    try {
      iter9SystemParts = this._rebuildMergedSystemPartsForIteration({
        lastGameState,
        userMessage: lastUserMessage,
        messages,
        gmDirective,
        npcReactions,
      });
    } catch (e) {
      console.warn('[Agent] iter 9 前刷新 system 块失败，沿用最后一次值:', e?.message || e);
    }

    // 构建 payload，messagesRef 内容拷贝过去（与 iter 1-7 形态保持一致）
    const iter9Payload = reactAdapter.buildPayload(
      sanitizedMessages,
      iter9SystemParts,
      ucTools,
      { temperature, thinking, toolChoice: ucToolChoice }
    );
    const iter9MessagesRef = reactAdapter.getPayloadMessagesRef(iter9Payload.payload);

    // OpenAI/DeepSeek 把 system 放 messages[0]，messagesRef 也带着上一 stage 的 system；
    // 直接 length=0 + push 会让旧 system 覆盖刚刚 _rebuildMergedSystemPartsForIteration 的
    // 新 system。保留 iter 9 freshly-built 的 system，跳过上一 stage 拷贝过来的同位 system。
    const family = reactAdapter?.protocolFamily || reactAdapter?.provider || 'gemini';
    const systemInMessages = family !== 'gemini' && family !== 'anthropic';
    const freshSystemMsg = systemInMessages && iter9MessagesRef[0]?.role === 'system'
      ? iter9MessagesRef[0]
      : null;
    iter9MessagesRef.length = 0;
    if (freshSystemMsg) iter9MessagesRef.push(freshSystemMsg);
    for (const msg of messagesRef) {
      if (systemInMessages && msg?.role === 'system') continue;
      iter9MessagesRef.push(msg);
    }

    const stepLog = {
      step: this.accumulatedStepCount,
      phase: 'react',
      iteration: 9,
      iterationLabel: 'iter9',
      branch: 'main',
      model: reactModel,
      provider: reactLabel,
      request: this._cloneSerializable(iter9Payload.payload),
      url: iter9Payload.url.replace(/key=[^&]+/, 'key=***'),
    };
    this.lastPayload.steps.push(stepLog);
    this._markStepStarted(stepLog);

    try {
      const apiResult = await reactAdapter.callAPI(
        iter9Payload.url, iter9Payload.payload, null, this._currentAbortSignal
      );
      stepLog.response = apiResult.raw;
      stepLog.metrics = apiResult.metrics;
      iterationMetrics.push({ iteration: 9, branch: 'main', ...apiResult.metrics });
      this._markStepSucceeded(stepLog);

      const { toolCalls: callsAll } = reactAdapter.parseToolCalls(apiResult.raw);

      // L1: 白名单过滤 hallucinated 工具
      const ALLOWED_TOOLS = new Set(['update_choices']);
      const calls = callsAll.filter(c => ALLOWED_TOOLS.has(c.name));
      const rejected = callsAll.filter(c => !ALLOWED_TOOLS.has(c.name));
      if (rejected.length > 0) {
        stepLog.rejectedHallucinations = rejected.map(c => ({ name: c.name, args: c.args || {} }));
        console.warn(
          `[Agent] iter 9：拒掉 ${rejected.length} 个 stage 外 hallucinate 调用 (${rejected.map(c => c.name).join(', ')})`
        );
      }

      // L2: 逐条验证 choices；失败用占位字段兜底
      const ucCall = calls.find(c => c.name === 'update_choices');
      if (ucCall) {
        const rawChoices = Array.isArray(ucCall.args?.choices) ? ucCall.args.choices : [];
        const salvaged = [];
        for (let idx = 0; idx < rawChoices.length; idx++) {
          const validation = this._normalizeAndValidateChoiceObject(rawChoices[idx], {
            requireId: false,
            index: idx,
          });
          if (validation.isValid) {
            salvaged.push(validation.choice);
          } else {
            const raw = rawChoices[idx] || {};
            const shortText = raw.short_text || raw.text || `选项 ${idx + 1}`;
            const rawDetail = typeof raw.detail_text === 'string' ? raw.detail_text.trim() : '';
            const fallback = {
              id: raw.id || String.fromCharCode(65 + idx),
              type_tag: raw.type_tag || 'action',
              short_text: shortText,
              detail_text: rawDetail || shortText,
              cost_hint: (typeof raw.cost_hint === 'string' && raw.cost_hint.trim()) ? raw.cost_hint : '待定',
              effect_days: typeof raw.effect_days === 'number' ? raw.effect_days : 0,
            };
            console.warn(`[Agent] iter 9: choice #${idx} 验证失败 (${validation.reason})，使用占位符`);
            salvaged.push(fallback);
          }
        }
        choicesData = salvaged;
        console.log(`[Agent] iter 9 成功: ${choicesData.length} 个选项`);
      } else {
        console.warn('[Agent] iter 9：AI 仍未调用 update_choices');
      }

      // L3: hallucinated update_narrative 文本 salvage
      // 不当工具执行（避免破坏 tool_call_id 配对），但 AI 已生成的文本不浪费
      const narHallucinated = callsAll.find(c => c.name === 'update_narrative');
      if (narHallucinated) {
        const narText = narHallucinated.args?.text || '';
        if (narText) {
          narrativeAccumulator += narText;
          reactIterationSegments.push({ type: 'narrative', iteration: 9, text: narText, hallucinated: true });
          if (window.eventBus && window.GameEvents) {
            window.eventBus.emit(window.GameEvents.AI_NARRATIVE_DISPLAY, {
              text: narText,
              accumulated: narrativeAccumulator,
            });
          }
        }
      }
    } catch (e) {
      this._markStepFailure(stepLog, e, {
        phase: 'react',
        module: 'react',
        provider: reactLabel,
        model: reactModel,
        url: iter9Payload.url,
      });
      console.warn('[Agent] iter 9 API 调用失败:', e);
      if (window.eventBus && window.GameEvents?.AI_ERROR) {
        window.eventBus.emit(window.GameEvents.AI_ERROR, {
          error: e,
          errorInfo: `iter 9 API 调用失败: ${e?.message || String(e)}`,
          traceId: this.lastPayload?.traceId,
          failedPhase: 'react',
        });
      }
      // 不抛出 → 落到 L4 兜底
    }

    // L4: 终极兜底 —— 仍无 choices → 注入 3 个泛用预设
    if (choicesData.length === 0) {
      console.warn('[Agent] iter 9 兜底 → 注入泛用 fallback choices 保证 turn 能收尾');
      choicesData = [
        {
          id: 'A',
          type_tag: 'explore',
          short_text: '观察四周',
          detail_text: '环顾当前所在的环境，留意身边的人和事，看看有什么值得注意的。',
          cost_hint: '无',
          effect_days: 0,
        },
        {
          id: 'B',
          type_tag: 'talk',
          short_text: '主动搭话',
          detail_text: '走向一个看起来好接近的人，找个由头聊上几句，看能打听到什么。',
          cost_hint: '无',
          effect_days: 0,
        },
        {
          id: 'C',
          type_tag: 'action',
          short_text: '稍作休整',
          detail_text: '原地停顿片刻，整理思绪和身上的物件，思考下一步该往哪去。',
          cost_hint: '无',
          effect_days: 0,
        },
      ];
      if (this.lastPayload) {
        this.lastPayload.fallbackChoicesUsed = true;
      }
    }

    // 同步 iter 9 到 lastFunctionCalls + reactIterationSegments，让主气泡推理时间线显示 IX
    // status: 'executed' / 'fallback'（区分真 update_choices 调用 vs L4 兜底）
    const iter9Status = this.lastPayload?.fallbackChoicesUsed ? 'fallback' : 'executed';
    const iter9Calls = [{
      name: 'update_choices',
      args: { choices: choicesData },
      status: iter9Status,
      result: JSON.stringify({ count: choicesData.length, fallback: iter9Status === 'fallback' }),
    }];
    if (!this.lastFunctionCalls) this.lastFunctionCalls = [];
    this.lastFunctionCalls.push({
      step: this.accumulatedStepCount,
      iteration: 9,
      iterationLabel: 'iter9',
      branch: 'main',
      calls: iter9Calls,
    });
    if (Array.isArray(reactIterationSegments)) {
      reactIterationSegments.push({ type: 'tools', iteration: 9, iterationLabel: 'iter9' });
    }
    if (window.eventBus && window.GameEvents?.AI_REACT_TOOL_CALL) {
      window.eventBus.emit(window.GameEvents.AI_REACT_TOOL_CALL, {
        iteration: 9,
        iterationLabel: 'iter9',
        calls: iter9Calls,
      });
    }

    return { choicesData, narrativeAccumulator };
  }

  /**
   * 生成 AI 回复(主聊天模块)
   * Step 完成通知通过 EventBus 广播（AI_REACT_COMPLETE, AI_NARRATIVE_DISPLAY, AI_NARRATIVE_COMPLETE, AI_STEP3_COMPLETE）
   * @param {Array} history - 对话历史
   * @param {Function} onChunk - 流式输出回调（高频），每收到一个 chunk 调用一次 onChunk(accumulatedText)
   * @returns {Promise<string>} 完整的 AI 回复
   */
  async generateResponse(history, onChunk = null, options = {}) {
    // OOC Q&A 元消息不应出现在发给 NPC/GM/ReAct 的上下文中——它们是玩家与 subagent 的元对话
    if (Array.isArray(history) && history.some(m => m?.meta === 'ooc_qa')) {
      history = history.filter(m => m?.meta !== 'ooc_qa');
    }

    // 🔧 启动后台保活（iOS 后台运行支持）
    if (window.backgroundService) {
      await window.backgroundService.startAITask();
    }

    const requestContext = this._buildActiveRequestContext();
    this._activeRequestContext = requestContext;
    this._requestInFlight = true;

    try {
      // 检查核心模块的 API Key
      const missingKeys = [];

      ['react'].forEach(step => {
        const config = this.getModuleConfig(step, AI_REQUEST_SCOPED);
        const apiKey = this.getApiKeyForModule(step, AI_REQUEST_SCOPED);
        if (!apiKey) {
          missingKeys.push(`${step}(${config.provider})`);
        }
      });

      if (missingKeys.length > 0) {
        // 停止后台任务（API Key 未设置）
        if (window.backgroundService) {
          await window.backgroundService.finishAITask(false, 'API Key 未设置');
        }
        const missingKeyError = new Error(
          `以下模块的 API Key 未设置:${missingKeys.join(', ')}。请点击右上角齿轮图标进行设置。`
        );
        missingKeyError.apiErrorInfo = {
          errorType: 'unknown',
          provider: 'config',
          responseBody: { missingModules: missingKeys },
        };

        // API Key 校验失败发生在 workflow 前，这里手动初始化最小调试 payload
        this.lastPayload = {
          provider: 'multi-step-agent',
          traceId: this._generateTraceId(),
          failedPhase: null,
          errorInfo: null,
          models: {
            react: this.getModelForModule('react', AI_REQUEST_SCOPED),
          },
          steps: [],
        };

        const keyErrorInfo = this._buildUnifiedErrorInfo(missingKeyError, {
          traceId: this.lastPayload.traceId,
          phase: 'react',
          module: 'react',
          provider: 'config',
          model: this.getModelForModule('react', AI_REQUEST_SCOPED),
          responseBody: { missingModules: missingKeys },
        });

        this._markPayloadFailure('react', keyErrorInfo);
        missingKeyError.unifiedErrorInfo = keyErrorInfo;
        missingKeyError.errorInfo = keyErrorInfo;
        missingKeyError.traceId = keyErrorInfo.traceId;
        missingKeyError.failedPhase = keyErrorInfo.phase;

        throw missingKeyError;
      }

      // formatMessages 现在返回 { systemContext, messages }
      const { systemContext, messages } = this.formatMessages(history);

      // 如果开启流式输出且提供了回调，使用流式模式
      const useStream =
        this._getConfigSource(AI_REQUEST_SCOPED).useStreaming && typeof onChunk === 'function';

      // 创建请求级 AbortController，支持外部取消
      this._requestAbortController = new AbortController();

      // 使用新的策略模式架构(每个 step 在 _runAgentWorkflow 内部获取各自的 adapter)
      // Step 完成通知通过 EventBus 广播，不再传递回调
      const result = await this._runAgentWorkflow(
        messages,
        useStream ? onChunk : null,
        systemContext,
        options.actionClassification || null,
        options.ooc || null,
        this._requestAbortController.signal
      );

      // 成功：短信标记在_runAgentWorkflow内部已处理

      // 🔧 完成后台任务，发送通知（await 确保通知发出）
      if (window.backgroundService) {
        await window.backgroundService.finishAITask(true, 'AI 已生成完整回复');
      }

      this._lastResponseConfigSnapshot = this._cloneSerializable(requestContext.configSnapshot);
      this.clearPendingPlayerActionContext();
      return result;
    } catch (error) {
      const lastStepPhase =
        this.lastPayload?.steps?.[this.lastPayload.steps.length - 1]?.phase || null;
      const phase =
        error?.failedPhase || this.lastPayload?.failedPhase || lastStepPhase || 'unknown';
      const moduleName = this._phaseToModule(phase);
      const provider = moduleName ? this.getProviderForModule(moduleName, AI_REQUEST_SCOPED) : null;
      const model = moduleName ? this.getModelForModule(moduleName, AI_REQUEST_SCOPED) : null;
      const fallbackInfo =
        error?.unifiedErrorInfo ||
        this.lastPayload?.errorInfo ||
        this._buildUnifiedErrorInfo(error, {
          traceId: this.lastPayload?.traceId,
          phase,
          module: moduleName,
          provider,
          model,
        });

      error.unifiedErrorInfo = fallbackInfo;
      error.errorInfo = fallbackInfo;
      error.traceId = fallbackInfo.traceId;
      error.failedPhase = fallbackInfo.phase;

      if (this.lastPayload && !this.lastPayload.errorInfo) {
        this._markPayloadFailure(fallbackInfo.phase, fallbackInfo);
      }

      // 🔧 Bug修复：失败时清理短信注入标志
      if (this._pendingSmsInjection) {
        console.warn('[AIService] 请求失败，短信保持new状态供下次注入');
        this._pendingSmsInjection = false;
        this._pendingSmsTurnNumber = null;
      }

      if (this._pendingEventToMark) {
        console.warn('[AIService] 请求失败，清理待标记 GM 事件');
        this._pendingEventToMark = null;
      }

      // 🔧 失败时也要停止后台任务并通知（await 确保通知发出）
      if (window.backgroundService) {
        console.log('[AIService] AI 请求失败，调用 finishAITask');
        await window.backgroundService.finishAITask(false, error.message || '请求失败');
      }

      this.clearPendingPlayerActionContext();
      // 重新抛出异常，让上层（chatCore.js）处理
      throw error;
    } finally {
      this._requestAbortController = null;
      this._requestInFlight = false;
      this._activeRequestContext = null;
    }
  }

  // 生成一句话总结(总结模块)
  async generateSummary(text) {
    const moduleConfig = this.getModuleConfig('summary', AI_REQUEST_SCOPED);
    const apiKey = this.getApiKeyForModule('summary', AI_REQUEST_SCOPED);
    const locale = this._getGamePromptLanguage();
    // 通过 promptRegistry 装配；fallback 到原 SUMMARY_PROMPT
    let summaryPrompt;
    if (window.promptRegistry) {
      const { parts } = window.promptRegistry.assembleChannel('summary', { locale });
      summaryPrompt =
        parts.map(p => p.text).join('\n') ||
        this._getLocalizedGlobalPromptValue('SUMMARY_PROMPT', locale) ||
        SUMMARY_PROMPT;
    } else {
      summaryPrompt =
        this._getLocalizedGlobalPromptValue('SUMMARY_PROMPT', locale) || SUMMARY_PROMPT;
    }

    if (!apiKey) {
      throw new Error(`总结模块的 ${moduleConfig.provider} API Key 未设置`);
    }

    // SUMMARY_PROMPT 作为系统指令，text 作为用户输入
    const userMessage =
      locale === 'en'
        ? `**[System Ready] Please summarize the following text:**\n\n${text}`
        : `**[系统就绪] 请输入待处理文本:**\n\n${text}`;
    const messages = [{ role: 'user', content: userMessage }];

    return this._callSummaryAPI(messages, summaryPrompt, 'summary');
  }

  // 生成章节总结(章节模块)
  // @param {string[]} turnSummaries - 单轮总结文本数组
  async generateChapterSummary(turnSummaries) {
    const moduleConfig = this.getModuleConfig('chapter', AI_REQUEST_SCOPED);
    const apiKey = this.getApiKeyForModule('chapter', AI_REQUEST_SCOPED);
    const locale = this._getGamePromptLanguage();
    let chapterPrompt;
    if (window.promptRegistry) {
      const { parts } = window.promptRegistry.assembleChannel('chapterSummary', { locale });
      chapterPrompt =
        parts.map(p => p.text).join('\n') ||
        this._getLocalizedGlobalPromptValue('CHAPTER_SUMMARY_PROMPT', locale) ||
        CHAPTER_SUMMARY_PROMPT;
    } else {
      chapterPrompt =
        this._getLocalizedGlobalPromptValue('CHAPTER_SUMMARY_PROMPT', locale) ||
        CHAPTER_SUMMARY_PROMPT;
    }

    if (!apiKey) {
      throw new Error(`章节模块的 ${moduleConfig.provider} API Key 未设置`);
    }

    // 将单轮总结格式化为带编号的列表
    const formattedInput = turnSummaries.map((text, idx) => `T${idx + 1}: ${text}`).join('\n');

    const userMessage =
      locale === 'en'
        ? `**[Chapter Compression] Merge these ${turnSummaries.length} turn summaries into one chapter summary:**\n\n${formattedInput}`
        : `**[章节压缩任务] 请将以下${turnSummaries.length}条剧情摘要合并为一段章节概要:**\n\n${formattedInput}`;
    const messages = [{ role: 'user', content: userMessage }];

    return this._callSummaryAPI(messages, chapterPrompt, 'chapter');
  }

  // 生成短信回复(短信模块)
  // @param {string} contactId - 联系人ID(如 'elena')
  // @param {string} message - 玩家发送的短信
  // @param {Array} history - 短信历史记录 [{role: 'user'|'assistant', content: string}]
  async generateSMSReply(contactId, message, history = []) {
    const moduleConfig = this.getModuleConfig('sms', AI_REQUEST_SCOPED);
    const apiKey = this.getApiKeyForModule('sms', AI_REQUEST_SCOPED);
    const locale = this._getGamePromptLanguage();
    let smsPrompt;
    if (window.promptRegistry) {
      const { parts } = window.promptRegistry.assembleChannel('sms', { locale });
      smsPrompt =
        parts.map(p => p.text).join('\n') ||
        this._getLocalizedGlobalPromptValue('SMS_PROMPT', locale) ||
        SMS_PROMPT;
    } else {
      smsPrompt = this._getLocalizedGlobalPromptValue('SMS_PROMPT', locale) || SMS_PROMPT;
    }

    if (!apiKey) {
      throw new Error(`短信模块的 ${moduleConfig.provider} API Key 未设置`);
    }

    // 获取联系人配置(支持预定义角色和临时角色，自动填充动态字段)
    const contact = this._getContactWithDynamicState(contactId, this._getCurrentGameTime());
    if (!contact) {
      throw new Error('未知联系人: ' + contactId);
    }
    const isDynamic = contact.type === 'dynamic';
    const currentCognitiveState = contact.cognitive_state;

    // 获取当前关系(从短信历史中的最新 AI 回复获取，或使用默认值)
    const currentRelationship = this._getCurrentRelationship(
      contactId,
      history,
      contact.default_relationship
    );

    // 构建系统提示词各部分(分开便于 API 分别处理)
    // 临时角色:不使用预设的性格和回复风格，而是从主聊天历史中学习
    // 预定义角色:使用预设的性格和回复风格
    let characterInfo;
    let recentStoryContext = ''; // 临时角色的最近剧情原文参考

    if (isDynamic) {
      // 临时角色:只提供基本信息，不提供性格和回复风格
      characterInfo = `## 当前角色
- 名字: ${contact.name}
- 年龄: ${contact.age || '未知'}
- 当前认知状态: ${currentCognitiveState}
- 当前关系: ${currentRelationship}`;
      if (contact.appearance) characterInfo += `\n- 外貌: ${contact.appearance}`;
      if (contact.clothing) characterInfo += `\n- 衣着: ${contact.clothing}`;

      // 获取最后两次 AI 回复的完整文本作为风格参考
      const recentReplies = this._getRecentAIReplies(2);
      if (recentReplies.length > 0) {
        recentStoryContext = `## 最近的剧情原文(作为${contact.name}说话风格的参考)
请从以下剧情中学习${contact.name}的说话方式和语气，在短信中模仿相同的风格:

${recentReplies.map((text, i) => `--- 剧情片段 ${i + 1} ---\n${text}`).join('\n\n')}`;
      }
    } else {
      // 预定义角色:使用预设的性格和回复风格
      characterInfo = `## 当前角色
- 名字: ${contact.name}
- 年龄: ${contact.age || '未知'}
- 性格: ${contact.personality || '未知'}
- 当前认知状态: ${currentCognitiveState}
- 当前关系: ${currentRelationship}
- 回复风格: ${contact.msg_reply_tone || '普通'}`;
    }

    // 获取当前游戏时间
    let currentTimeInfo = '';
    if (typeof timelineService !== 'undefined') {
      const gameDate = timelineService.getCurrentDate();
      const formattedSmsTime = this._formatGameTimeForPrompt(gameDate);
      if (formattedSmsTime) {
        currentTimeInfo = `## 当前游戏时间\n${formattedSmsTime}`;
      }
    }

    // 获取该角色相关的时间线事件(+/-3个月范围)
    const timelineContext =
      typeof timelineService !== 'undefined' ? timelineService.formatForSMS(contact.name, 3) : '';

    // 获取主聊天的剧情总结(让角色了解"最近发生了什么")
    let storySummaryContext = '';
    if (typeof summaryService !== 'undefined') {
      const summaries = summaryService.getSummaries();
      if (summaries.length > 0) {
        storySummaryContext = `## 最近的剧情总结\n${summaries.join('\n')}`;
      }
    }

    // 计算消息间隔(距离玩家上一条消息过了多久)
    let timeSinceLastMsgInfo = '';
    if (history.length > 0) {
      // 找到最后一条玩家消息
      const lastUserMsg = [...history].reverse().find(m => m.role === 'user');
      if (lastUserMsg && lastUserMsg.gameTime) {
        const currentTime = this._getCurrentGameTime();
        if (currentTime) {
          const timeDiff = this._calculateGameTimeDiff(lastUserMsg.gameTime, currentTime);
          timeSinceLastMsgInfo = `## 消息间隔\n距离玩家上一条消息: ${timeDiff}`;
        }
      }
    }

    // 构建系统提示词 parts 数组(类似主聊天的 Gemini 格式)
    const systemParts = [smsPrompt, characterInfo];
    if (currentTimeInfo) {
      systemParts.push(currentTimeInfo);
    }
    if (timeSinceLastMsgInfo) {
      systemParts.push(timeSinceLastMsgInfo);
    }
    if (timelineContext) {
      systemParts.push(timelineContext);
    }
    // 先给剧情总结(理解背景和关系)，再给剧情原文(学习说话风格)
    if (storySummaryContext) {
      systemParts.push(storySummaryContext);
    }
    if (recentStoryContext) {
      systemParts.push(recentStoryContext);
    }

    // 构建消息(包含历史 + 新消息，带时间戳)
    // 格式化消息，在内容前加上时间标签让 AI 理解时间流逝
    const reg = window.promptRegistry;
    const formatMsgWithTime = m => {
      // 系统提示消息:添加特殊标记，不算角色发的消息
      if (m.role === 'system') {
        return {
          role: 'user',
          content: reg.get('sms.format.systemMessageTag').builder({ content: m.content }),
        };
      }

      let content = m.content;

      // 添加时间前缀
      if (m.gameTime) {
        const gt = m.gameTime;
        content = reg.get('sms.format.timestampPrefix').builder({
          month: gt.month,
          day: gt.day,
          timeStr: gt.timeStr || '',
          content,
        });
      }

      // 事件驱动的消息添加特殊标记(角色主动发送，玩家未回复不代表是陌生人)
      if (m.isEventDriven) {
        content = reg.get('sms.format.eventDrivenTag').builder({ content });
      }

      return { role: m.role, content };
    };

    const messages = [
      ...history.map(formatMsgWithTime),
      formatMsgWithTime({ role: 'user', content: message, gameTime: this._getCurrentGameTime() }),
    ];

    // 保存 payload 以供调试
    this.lastSMSPayload = {
      contactId,
      isDynamic: isDynamic,
      contact: {
        name: contact.name,
        age: contact.age,
        personality: contact.personality, // 临时角色可能没有
        msg_reply_tone: contact.msg_reply_tone, // 临时角色没有
      },
      characterInfo: characterInfo,
      recentStoryContext: recentStoryContext || null, // 临时角色的最近剧情原文
      currentTimeInfo: currentTimeInfo,
      timeSinceLastMsgInfo: timeSinceLastMsgInfo,
      timelineContext: timelineContext,
      storySummaryContext: storySummaryContext,
      systemParts: systemParts,
      messages: messages,
    };

    // 调用 API 获取回复
    const rawReply = await this._callSMSAPI(messages, systemParts);

    // 解析 JSON 格式的回复
    const parsedResponse = this._parseSMSResponse(rawReply);

    // 将解析结果保存到 payload 中用于调试
    this.lastSMSPayload.response = {
      raw: rawReply,
      parsed: {
        location: parsedResponse.location,
        cognitive_state: parsedResponse.cognitive_state,
        relationship: parsedResponse.relationship,
        message: parsedResponse.message,
      },
      parseError: parsedResponse.parseError || null,
    };

    return parsedResponse;
  }

  // 解析 SMS 回复的 JSON 格式
  _parseSMSResponse(rawReply) {
    try {
      // 尝试从回复中提取 JSON(可能被 markdown 代码块包裹)
      let jsonStr = rawReply.trim();

      // 移除 markdown 代码块标记
      const jsonMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (jsonMatch) {
        jsonStr = jsonMatch[1].trim();
      }

      const parsed = JSON.parse(jsonStr);

      // 验证必需字段
      if (!parsed.message) {
        throw new Error('Missing message field');
      }

      return {
        location: parsed.location || '未知',
        cognitive_state: parsed.cognitive_state || '未知',
        relationship: parsed.relationship || '未知',
        message: parsed.message,
        raw: rawReply, // 保留原始回复用于调试
      };
    } catch (e) {
      // JSON 解析失败，回退到直接使用原始回复作为消息
      console.warn('SMS JSON parse failed, using raw reply:', e);
      return {
        location: '未知',
        cognitive_state: '未知',
        relationship: '未知',
        message: rawReply.trim(),
        raw: rawReply,
        parseError: e.message,
      };
    }
  }

  // 获取当前关系(从短信历史或 smsService 中获取最新的关系)
  _getCurrentRelationship(contactId, history, defaultRelationship) {
    // 1. 优先从 smsService 中获取完整历史(包含 relationship 字段)
    if (typeof smsService !== 'undefined') {
      const fullHistory = smsService.getConversation(contactId);
      if (fullHistory && fullHistory.length > 0) {
        // 从后往前找到最近一条有 relationship 的 AI 回复
        for (let i = fullHistory.length - 1; i >= 0; i--) {
          const msg = fullHistory[i];
          if (msg.role === 'assistant' && msg.relationship && msg.relationship !== '未知') {
            return msg.relationship;
          }
        }
      }
    }

    // 2. 从传入的 history 中查找(API 调用时的历史)
    if (history && history.length > 0) {
      for (let i = history.length - 1; i >= 0; i--) {
        const msg = history[i];
        if (msg.role === 'assistant' && msg.relationship && msg.relationship !== '未知') {
          return msg.relationship;
        }
      }
    }

    // 3. 使用默认值
    return defaultRelationship || '陌生人';
  }

}

_applyAIServiceMixin(_AIServiceReactMixin);

// promptRegistry 注册已抽出到 js/services/ai/reactPromptBootstrap.js
