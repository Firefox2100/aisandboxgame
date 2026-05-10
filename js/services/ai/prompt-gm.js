/**
 * ai/prompt-gm.js
 * 公共方法 Prompt 构建 + GM 决策层
 *
 * 通过 mixin 模式扩展 AIService.prototype。所有方法实现与原 class
 * AIService 中的版本完全一致，仅以独立 class 形式承载，文件末尾通过
 * _applyAIServiceMixin 合并到 AIService 上。
 *
 * 内容：
 * - Prompt 构建：_buildActionContextSystemText / _buildMapContextSystemText 等
 *   游戏运行时 prompt 拼装逻辑，含时间效果、语言切换
 * - GM 决策层：GM 指令历史、game 状态推理、player action processing
 *
 * 加载顺序：必须在 aiService.js 之后加载。
 */

class _AIServicePromptGmMixin {
  // ========================================
  // 公共方法: Prompt 构建
  // ========================================

  /**
   * 执行 ReAct 工具调用（从主循环提取的辅助方法）
   * @param {Array} callsToExecute - 待执行的工具调用 [{name, args, id?}]
   * @param {Set} executedTools - 已执行工具的签名集合（用于去重）
   * @param {string} providerLabel - 日志用的 provider 标签
   * @param {Set<string>|null} allowedToolNames - 本 stage 允许的工具白名单
   * @returns {{ executionResults: Array, stepCallsLog: Array, toolExecutionErrors: Array }}
   */
  async _executeReactTools(callsToExecute, executedTools, providerLabel, allowedToolNames = null) {
    const stepCallsLog = [];
    const executionResults = [];
    const toolExecutionErrors = [];

    for (const call of callsToExecute) {
      const signature = `${call.name}:${JSON.stringify(call.args)}`;

      // ── Stage-allowed 拦截：AI 在并行 pipeline 中可能 hallucinate 调用未暴露工具
      //    （OpenAI/DeepSeek protocol server 端不验证 tools 列表）。这里硬拒掉，
      //    保护 stage 边界（如 Branch A 不应执行 read/mutation 类工具）。
      if (allowedToolNames && !allowedToolNames.has(call.name)) {
        console.warn(`[${providerLabel} Agent] 拒绝 stage-外工具: ${call.name}`);
        stepCallsLog.push({ name: call.name, args: call.args, status: 'stage-not-allowed' });
        executionResults.push({
          name: call.name,
          args: call.args || {},
          result: JSON.stringify({
            error: `[stage 限制] 工具 "${call.name}" 在本阶段不可用。请只调用本阶段允许的工具。`,
          }),
        });
        continue;
      }

      if (executedTools.has(signature)) {
        console.warn(`[${providerLabel} Agent] 忽略重复请求: ${signature}`);
        stepCallsLog.push({ name: call.name, args: call.args, status: 'duplicate' });
        // 仍需推入结果，否则 appendToolResults 的 toolCalls 和 results 长度不匹配
        // 导致 DeepSeek 400: "insufficient tool messages following tool_calls message"
        // update_narrative 等价重复：文本首次已拼接进 narrativeAccumulator，明确告知 AI 别重试
        const isNarrative = call.name === 'update_narrative';
        executionResults.push({
          name: call.name,
          args: call.args || {},
          result: isNarrative
            ? window.promptRegistry.get('react.directive.duplicateNarrative').builder({})
            : window.promptRegistry.get('react.directive.duplicateQuery').builder({}),
        });
        continue;
      }

      // ── Dispatcher-managed 拦截：AI 不应直接调用，由 SkillDispatcher 自动处理 ──
      if (window.toolRegistry?.isDispatcherManaged?.(call.name)) {
        console.warn(`[${providerLabel} Agent] 拒绝 dispatcher-managed 工具: ${call.name}`);
        stepCallsLog.push({ name: call.name, args: call.args, status: 'dispatcher-managed-rejected' });
        executionResults.push({
          name: call.name,
          args: call.args || {},
          result: JSON.stringify({
            error: window.promptRegistry
              .get('react.directive.dispatcherManagedRejected')
              .builder({ toolName: call.name }),
          }),
        });
        continue;
      }

      executedTools.add(signature);
      stepCallsLog.push({ name: call.name, args: call.args, status: 'executed' });

      let toolResult;
      let executionSucceeded = true;
      try {
        // 优先检查用户自定义内容覆写（从设置UI）
        const customContents = this.config?.customFunctionContents;
        const customFunctions = this.config?.customFunctions;
        if (customContents && customContents[call.name]) {
          toolResult = customContents[call.name];
        } else if (customFunctions && Array.isArray(customFunctions)) {
          const cf = customFunctions.find(f => f.name === call.name);
          if (cf) {
            toolResult = cf.content || `[自定义函数 ${call.name} 无返回内容]`;
          }
        }

        // 无自定义覆写时，检查是否为 state 工具需要 preview
        // 无自定义覆写时，走 toolRegistry 执行
        if (toolResult === undefined) {
          if (call.parseError) {
            // adapter 已标记参数 JSON parse 失败：跳过执行，返回 [失败] 字符串让 LLM 重试。
            toolResult = `[失败] 工具参数 JSON 格式错误：${call.parseError.message}。原始片段：${call.parseError.rawPreview}。请重新生成本次工具调用。`;
            executionSucceeded = false;
            toolExecutionErrors.push({
              name: call.name,
              args: {},
              message: `parse error: ${call.parseError.message}`,
              stack: null,
            });
          } else if (window.toolRegistry?.has(call.name)) {
            const registryResult = await window.toolRegistry.execute(call.name, call.args);
            toolResult = typeof registryResult === 'string'
              ? registryResult
              : JSON.stringify(registryResult);
          } else {
            toolResult = `未知工具: ${call.name}`;
          }
        }
      } catch (e) {
        executionSucceeded = false;
        console.error(`Tool execution failed: ${call.name}`, e);
        toolResult = `Error executing tool: ${e.message}`;
        toolExecutionErrors.push({
          name: call.name,
          args: call.args || {},
          message: e?.message || String(e),
          stack: e?.stack || null,
        });
      }

      console.log(
        `[${providerLabel} Agent] 档案 ${call.name}(${JSON.stringify(call.args)}) 结果长度:`,
        toolResult?.length || 0
      );
      executionResults.push({ name: call.name, args: call.args || {}, result: toolResult });

      // Signal 广播：仅执行成功时 emit（通用 TOOL_EXECUTED + 工具专属 signal）
      if (executionSucceeded && window.eventBus && window.GameEvents) {
        let parsedResult = toolResult;
        try {
          parsedResult = typeof toolResult === 'string' ? JSON.parse(toolResult) : toolResult;
        } catch {
          /* 保留原始字符串 */
        }
        const signalPayload = {
          name: call.name,
          args: call.args || {},
          result: parsedResult,
          turnNumber: this.accumulatedStepCount,
        };
        if (window.GameEvents.TOOL_EXECUTED) {
          window.eventBus.emit(window.GameEvents.TOOL_EXECUTED, signalPayload);
        }
        const registry = window.toolRegistry;
        const toolSignal = registry?.getSignal?.(call.name);
        if (toolSignal) {
          window.eventBus.emit(toolSignal, signalPayload);
        }
      }
    }

    return { executionResults, stepCallsLog, toolExecutionErrors };
  }

  /**
   * 按 stage 过滤 toolRegistry 声明并转换为 adapter 格式
   * 用于并行 ReAct 流水线：每个 iter 只暴露子集工具
   *
   * @param {string} stage - 'narrative_only' | 'reads_only' | 'reads_and_mutations' | 'closing_resolve' | 'choices_only'
   * @param {Object} reactAdapter
   * @param {Object} [opts] - { iter6NextTool: string } 仅 'closing_resolve' 用
   * @returns {{ tools: Array, allowedToolNames: Set<string> }}
   *   tools: adapter 格式的 tools（喂给 buildPayload）
   *   allowedToolNames: 名字集合（喂给 _runReactIteration ctx，用于 stage 边界硬拒）
   */
  _buildToolsForStage(stage, reactAdapter, opts = {}) {
    const registry = window.toolRegistry;
    if (!registry) return { tools: [], allowedToolNames: new Set(), toolChoice: 'auto' };
    const reactLoop = this.reactLoop;
    if (!reactLoop) return { tools: [], allowedToolNames: new Set(), toolChoice: 'auto' };

    // ⚠️ 必须用 _getReactLoopFunctionDeclarations() 而非直接的 registry.getReactLoopDeclarations()。
    // 前者会先调 refreshArchiveTools() / refreshNpcTools() 刷新动态工具
    // (search_world / load_predefined_npc / new_npc / update_npc 等依赖运行时世界状态注册)，
    // 然后应用用户在设置里 toggle off 的工具 + append customFunctions。
    // 直接调 registry 版本会漏掉所有动态工具——iter 5 mutations 阶段会发现 search_world/load_predefined_npc
    // 都不在 allowedToolNames 里，被 stage 拦截器误拒掉，AI 完不成应有的状态变更。
    const all = typeof this._getReactLoopFunctionDeclarations === 'function'
      ? this._getReactLoopFunctionDeclarations()
      : registry.getReactLoopDeclarations();

    // 收窄 update_narrative 的 checkpoint.type enum——按 stage 不同
    //   narrative_only (iter 1, iter 6): 只允许 [item_check, hidden_state]，禁 none（防 AI 跳叙事链）
    //   closing_resolve (iter 7):       只允许 [none]（强制叙事链终止）
    // 必须 deep clone declaration 再 mutate enum，否则会污染 toolRegistry 内部缓存的共享对象。
    const _cloneNarrativeDeclWithEnum = (decl, allowedEnum) => {
      const cloned = typeof structuredClone === 'function'
        ? structuredClone(decl)
        : JSON.parse(JSON.stringify(decl));
      const cpEnum = cloned?.parameters?.properties?.checkpoint?.properties?.type;
      if (cpEnum && Array.isArray(cpEnum.enum)) {
        cpEnum.enum = allowedEnum.slice();
      }
      return cloned;
    };

    let filtered;
    let toolChoice = 'auto';
    switch (stage) {
      case 'narrative_only': {
        const base = all.filter(d => d.name === 'update_narrative');
        filtered = base.map(d => _cloneNarrativeDeclWithEnum(d, ['item_check', 'hidden_state']));
        toolChoice = { name: 'update_narrative' };
        break;
      }
      case 'narrative_with_item': {
        // iter 6：segment 2 叙事 + 直接落地确定的物品/货币变化。
        // 工具集 = [update_narrative, update_item]，type enum 保留全 3 值（含 'none' 让叙事自然收尾）。
        // toolChoice='any' 强制 ≥1 工具调用，update_narrative 始终被调用靠 prompt 软约束（同 iter 7 模式）。
        const base = all.filter(d => d.name === 'update_narrative' || d.name === 'update_item');
        filtered = base.map(d => d.name === 'update_narrative'
          ? _cloneNarrativeDeclWithEnum(d, ['none', 'item_check', 'hidden_state'])
          : d
        );
        toolChoice = 'any';
        break;
      }
      case 'reads_only':
        // 白名单前缀：仅 get_* / search_*（覆盖 search_world / get_state / get_rule /
        // get_npc_reaction / get_npc_card / get_story_summary / get_sms_history /
        // get_raw_narrative / get_roll 等所有读类）。
        // 用白名单而非"非 update_*"是因为 load_predefined_npc / new_npc 是 mutation 但
        // 不带 update_ 前缀，会被负面过滤漏入 reads-only 阶段。
        filtered = all.filter(d =>
          d.name.startsWith('get_') ||
          d.name.startsWith('search_')
        );
        toolChoice = 'auto';
        break;
      case 'reads_and_mutations':
        // 全工具去掉 update_narrative / update_choices；dispatcherManaged 已被 getReactLoopDeclarations 过滤
        // 注意：load_predefined_npc / new_npc 在此 stage 是允许的（它们是 mutation 类）
        filtered = all.filter(d =>
          d.name !== 'update_narrative' &&
          d.name !== 'update_choices'
        );
        toolChoice = 'auto';
        break;
      case 'closing_resolve': {
        // iter 7：只暴露 update_narrative + iter 6 请求的 next_tool；
        // update_narrative 的 checkpoint.type enum 收窄为 [none]（强制叙事链终止）
        const nt = (opts && typeof opts.iter6NextTool === 'string') ? opts.iter6NextTool.trim() : '';
        filtered = all
          .filter(d => d.name === 'update_narrative' || (nt && d.name === nt))
          .map(d => d.name === 'update_narrative'
            ? _cloneNarrativeDeclWithEnum(d, ['none'])
            : d
          );
        toolChoice = 'any';
        break;
      }
      case 'narrative_only_closing': {
        // iter 7 rescue 模式：iter 6 漏调 update_narrative 时，用此 stage 占用 iter 7 槽位补写 segment 2。
        // 命名强制 update_narrative，type enum 锁 ['none']（与 closing_resolve 同精神：iter 7 是叙事链终止角色，
        // 不允许再开新 checkpoint）。不暴露 update_item（前一轮可能已调过，避免重复触发双扣；rescue 是叙事补救，
        // 不是 mutation 补救——若 segment 2 描述了新物品事件，由 inventorySkill count==0 兜底接力）。
        const base = all.filter(d => d.name === 'update_narrative');
        filtered = base.map(d => _cloneNarrativeDeclWithEnum(d, ['none']));
        toolChoice = { name: 'update_narrative' };
        break;
      }
      case 'choices_only':
        filtered = all.filter(d => d.name === 'update_choices');
        toolChoice = { name: 'update_choices' };
        break;
      default:
        console.warn(`[_buildToolsForStage] unknown stage "${stage}", returning empty tool set`);
        filtered = [];
        toolChoice = 'auto';
    }
    const allowedToolNames = new Set(filtered.map(d => d.name));
    const tools = reactLoop.buildAdapterTools(filtered, reactAdapter);
    return { tools, allowedToolNames, toolChoice };
  }

  /**
   * 执行单个 ReAct iter（LLM call + 工具执行 + 消息追加）
   * 用于并行 ReAct 流水线：iter 1 / iter 2-4 chain / iter 5 / iter 6 / iter 7 都用这个。
   *
   * 与今天 react.js 主循环 body 的差异：
   *   - 不做 nudge / trigger 扫描 / 自动 system rebuild（caller 负责按需注入 directive 与 rebuild）
   *   - 不做 settlement dispatch（dispatch 在 iter 8 由 _runSettlementIteration 触发）
   *   - latch 状态由 caller 在 stage 之间显式管理（iter 1 → iter 5 / iter 6 → iter 7）
   *
   * @param {Object} ctx 见 react.js 调用点
   * @returns {Promise<{ hadError, hadToolCalls, callsExecuted, narrativeCheckpoint, executedToolNames }>}
   */
  async _runReactIteration(ctx) {
    const {
      reactAdapter, reactLabel, reactModel,
      payload, messagesRef, url, streamUrl,
      executedTools,
      narrativeAccumulator,
      reactIterationSegments, iterationMetrics,
      mainLoopToolCounts,
      iteration, iterationLabel, branchLabel,
      onChunk,
      skipNarrativeRescue = false,
      promptManifest = null,    // 仅 caller 给 first iter（如 iter1.A）传一次，attach 到 stepLog 供 debug UI 用
      allowedToolNames = null,  // Set<string>：本 stage 允许调的工具白名单，AI hallucinate 调用其他工具会被拒绝
    } = ctx;

    // step log
    const stepLog = {
      step: this.accumulatedStepCount,
      phase: 'react',
      iteration,
      iterationLabel,
      branch: branchLabel,
      model: reactModel,
      provider: reactLabel,
      request: this._cloneSerializable(payload),
      url: (url || '').replace(/key=[^&]+/, 'key=***'),
    };
    if (promptManifest) {
      stepLog.promptManifest = promptManifest;
      stepLog.systemPartsDebug = this._buildSystemPartsDebug(promptManifest);
    }
    this.lastPayload.steps.push(stepLog);
    this._markStepStarted(stepLog);

    // LLM call（流式时透传 onChunk；非流式直接 await）
    let result;
    try {
      const iterationOnChunk = onChunk
        ? (accText, reasoning, extra) => {
            if (window.eventBus && window.GameEvents?.AI_REACT_ITERATION_STREAM) {
              window.eventBus.emit(window.GameEvents.AI_REACT_ITERATION_STREAM, {
                iteration,
                iterationLabel,
                text: accText,
                reasoning: reasoning || null,
              });
            }
            if (extra?.narrativeStream && window.eventBus && window.GameEvents?.AI_NARRATIVE_STREAM) {
              window.eventBus.emit(window.GameEvents.AI_NARRATIVE_STREAM, {
                iteration,
                iterationLabel,
                text: extra.narrativeStream,
                isBlob: !!extra.narrativeBlob,
              });
            }
          }
        : null;
      const apiUrl = iterationOnChunk ? (streamUrl || url) : url;
      result = await reactAdapter.callAPI(apiUrl, payload, iterationOnChunk, this._currentAbortSignal);
      stepLog.response = result.raw;
      stepLog.metrics = result.metrics;
      iterationMetrics.push({ iteration: iterationLabel, branch: branchLabel, ...result.metrics });
      this._markStepSucceeded(stepLog);
    } catch (e) {
      this._markStepFailure(stepLog, e, {
        phase: 'react',
        module: 'react',
        provider: reactLabel,
        model: reactModel,
        url,
      });
      throw e;
    }

    let currentText = result.text || '';
    const currentReasoning = result.reasoningContent || '';

    // 流式中途事件可能被节流截断，结束后幂等再发一次保证 UI 见到完整内容
    if (onChunk && (currentText || currentReasoning) &&
        window.eventBus && window.GameEvents?.AI_REACT_ITERATION_STREAM) {
      window.eventBus.emit(window.GameEvents.AI_REACT_ITERATION_STREAM, {
        iteration,
        iterationLabel,
        text: currentText,
        reasoning: currentReasoning || null,
      });
    }

    const { toolCalls, needsRecovery, recoveredCalls, cleanedText } = reactAdapter.parseToolCalls(result.raw);
    const callsToExecute = needsRecovery ? recoveredCalls : toolCalls;
    if (cleanedText !== undefined) currentText = cleanedText;

    if (currentText.trim()) {
      console.log(`[Agent] ${iterationLabel}: 内部推理 (${currentText.length} 字)`);
    }

    // 无工具调用：纯文本路径
    if (callsToExecute.length === 0) {
      const textLen = (currentText || '').trim().length;
      const looksLikeNarrative = !skipNarrativeRescue && textLen >= 200 && !narrativeAccumulator.value.trim();
      if (looksLikeNarrative) {
        const rescuedText = currentText.trim();
        narrativeAccumulator.value += rescuedText;
        reactIterationSegments.push({
          type: 'narrative',
          iteration,
          iterationLabel,
          text: rescuedText,
          autoRescued: true,
        });
        if (window.eventBus && window.GameEvents) {
          window.eventBus.emit(window.GameEvents.AI_NARRATIVE_DISPLAY, {
            text: rescuedText,
            accumulated: narrativeAccumulator.value,
          });
        }
        reactAdapter.appendAssistantText(messagesRef, currentText, currentReasoning);
        if (!this.lastPayload.rescuedTurns) this.lastPayload.rescuedTurns = [];
        this.lastPayload.rescuedTurns.push({
          iteration: iterationLabel,
          chars: textLen,
          provider: reactLabel,
          model: reactModel,
        });
        console.warn('[Agent][RESCUE] plain-text narrative rescued', {
          iteration: iterationLabel,
          chars: textLen,
          provider: reactLabel,
          model: reactModel,
          preview: rescuedText.slice(0, 80),
        });
      } else if (currentText.trim() || currentReasoning.trim()) {
        reactAdapter.appendAssistantText(messagesRef, currentText, currentReasoning);
        reactIterationSegments.push({
          type: 'commentary',
          iteration,
          iterationLabel,
          text: currentText,
          reasoning: currentReasoning,
        });
        console.log(`[Agent] ${iterationLabel}: 纯文本轮 (${currentText.length} 字)`);
      }
      return {
        hadError: false,
        hadToolCalls: false,
        callsExecuted: 0,
        narrativeCheckpoint: null,
        executedToolNames: [],
      };
    }

    // 执行工具（按 allowedToolNames 拒绝 stage 外调用）
    const { executionResults, stepCallsLog, toolExecutionErrors } =
      await this._executeReactTools(callsToExecute, executedTools, reactLabel, allowedToolNames);

    // mainLoopToolCounts 累计（settlement subagent 用它判断主循环是否已覆盖）
    // update_item 返回 [失败] 不计入；其他成功执行的工具计数
    if (mainLoopToolCounts) {
      for (let i = 0; i < stepCallsLog.length; i++) {
        const c = stepCallsLog[i];
        if (c.status !== 'executed') continue;
        if (c.name === 'update_item') {
          const r = executionResults[i]?.result;
          if (typeof r === 'string' && r.startsWith('[失败]')) continue;
        }
        mainLoopToolCounts[c.name] = (mainLoopToolCounts[c.name] || 0) + 1;
      }
    }

    // 函数调用日志
    const callsWithResults = stepCallsLog.map((log, idx) => {
      const execResult = executionResults[idx];
      return { ...log, result: execResult?.result ?? null };
    });
    if (!this.lastFunctionCalls) this.lastFunctionCalls = [];
    this.lastFunctionCalls.push({
      step: this.accumulatedStepCount,
      iteration,
      iterationLabel,
      branch: branchLabel,
      calls: callsWithResults,
      recovered: needsRecovery,
    });

    if (window.eventBus && window.GameEvents?.AI_REACT_TOOL_CALL) {
      window.eventBus.emit(window.GameEvents.AI_REACT_TOOL_CALL, {
        iteration,
        iterationLabel,
        calls: callsWithResults,
      });
    }

    if (currentText.trim() || currentReasoning.trim()) {
      reactIterationSegments.push({
        type: 'commentary',
        iteration,
        iterationLabel,
        text: currentText,
        reasoning: currentReasoning,
      });
    }
    reactIterationSegments.push({ type: 'tools', iteration, iterationLabel });

    stepLog.executionResults = executionResults.map(r => ({
      name: r.name,
      args: r.args || {},
      resultLength: r.result?.length,
    }));
    if (needsRecovery) stepLog.recoveredFromMalformed = true;

    if (toolExecutionErrors.length > 0) {
      console.warn(`[Agent] ${iterationLabel}: ${toolExecutionErrors.length} 个工具执行错误`);
      stepLog.toolErrors = toolExecutionErrors;
    }

    // 处理特殊工具：update_narrative 累积叙事 + 抽 checkpoint。
    // update_choices 在 iter 1-7 任何 stage 的 allowedToolNames 中都不存在，
    // hallucinated 调用会在 _executeReactTools 顶部被 stage-not-allowed 拦截，到不了这里。
    let narrativeCheckpoint = null;
    const executedToolNames = [];
    for (let i = 0; i < callsToExecute.length; i++) {
      const call = callsToExecute[i];
      const logStatus = stepCallsLog[i]?.status;
      if (logStatus !== 'executed') continue;
      executedToolNames.push(call.name);

      if (call.name === 'update_narrative') {
        const narText = call.args?.text || '';
        const cp = call.args?.checkpoint || null;
        narrativeAccumulator.value += narText;
        reactIterationSegments.push({
          type: 'narrative',
          iteration,
          iterationLabel,
          text: narText,
          checkpoint: cp,
        });
        if (cp) {
          console.log(
            `[checkpoint] iter=${iterationLabel} type=${cp.type} q="${cp.question}" stop="${cp.stop_before}" next=${cp.next_tool}`
          );
          narrativeCheckpoint = cp;
        } else {
          console.log(`[checkpoint] iter=${iterationLabel} MISSING (AI 漏写)`);
        }
        if (window.eventBus && window.GameEvents) {
          window.eventBus.emit(window.GameEvents.AI_NARRATIVE_DISPLAY, {
            text: narText,
            accumulated: narrativeAccumulator.value,
          });
        }
      }
    }

    // 把工具结果追加到消息历史
    reactAdapter.appendToolResults(messagesRef, callsToExecute, executionResults, currentText, currentReasoning);

    console.log(`[Agent] ${iterationLabel}: 执行 ${executionResults.length} 个工具`);

    return {
      hadError: false,
      hadToolCalls: true,
      callsExecuted: executionResults.length,
      narrativeCheckpoint,
      executedToolNames,
    };
  }

  /**
   * 将 SkillDispatcher 结果格式化为可读结算摘要
   * 给 AI 看到本回合的状态变化，便于生成准确的 choices
   * @param {Object} dispatchResult - { completedTools, failedSkills, summary, skillResults }
   * @returns {string}
   */
  _formatSettlementSummary(dispatchResult) {
    if (!dispatchResult) return '(无结算结果)';
    const lines = [];
    const summary = dispatchResult.summary || {};

    for (const [skillName, skillSummary] of Object.entries(summary)) {
      lines.push(`【${skillName}】`);
      if (!skillSummary || typeof skillSummary !== 'object') {
        lines.push(`  ${String(skillSummary)}`);
        continue;
      }
      if (skillSummary.error) {
        lines.push(`  ❌ ${skillSummary.error}`);
        continue;
      }
      if (skillSummary.skipped) {
        lines.push(`  ${skillSummary.note || '本回合无字段变化'}`);
        continue;
      }
      // 平铺关键字段（time/location/money/objective/custom_status）
      for (const [field, value] of Object.entries(skillSummary)) {
        if (value == null) continue;
        if (typeof value === 'object') {
          if (Array.isArray(value)) {
            for (const item of value) {
              if (item && typeof item === 'object' && item.field) {
                lines.push(`  ${item.field}: ${item.previous} → ${item.current}`);
              } else {
                lines.push(`  ${field}: ${JSON.stringify(item)}`);
              }
            }
          } else if (value.previous !== undefined || value.current !== undefined) {
            const prev = value.previous ?? '未知';
            const curr = value.current ?? '未知';
            lines.push(`  ${field}: ${prev} → ${curr}${value.warning ? ` ⚠️ ${value.warning}` : ''}`);
          } else {
            lines.push(`  ${field}: ${JSON.stringify(value)}`);
          }
        } else {
          lines.push(`  ${field}: ${value}`);
        }
      }
    }

    if ((dispatchResult.failedSkills || []).length > 0) {
      lines.push(`失败 skill: ${dispatchResult.failedSkills.join(', ')}`);
    }

    return lines.length > 0 ? lines.join('\n') : '(无字段变化)';
  }

  /**
   * 将 prompt manifest 转换为轻量 system part 调试信息（不携带全文）
   * @param {Array} manifest
   * @returns {Array<{order:number,name:string,type:string,length?:number,status?:string,info?:string,worldMechanics?:string,condition?:string}>}
   */
  _buildSystemPartsDebug(manifest) {
    if (!Array.isArray(manifest)) return [];

    return manifest.map((entry, index) => {
      const item = {
        order: index + 1,
        name: entry?.name || `part_${index + 1}`,
        type: entry?.type || 'unknown',
      };

      if (typeof entry?.cacheable === 'boolean') item.cacheable = entry.cacheable;

      const length =
        typeof entry?.length === 'number'
          ? entry.length
          : typeof entry?.content === 'string'
            ? entry.content.length
            : null;
      if (length !== null) item.length = length;

      if (typeof entry?.status === 'string' && entry.status) item.status = entry.status;
      if (typeof entry?.info === 'string' && entry.info) item.info = entry.info;
      if (typeof entry?.worldMechanics === 'string' && entry.worldMechanics)
        item.worldMechanics = entry.worldMechanics;
      if (typeof entry?.condition === 'string' && entry.condition) item.condition = entry.condition;

      return item;
    });
  }
  _getFallbackExploreSceneLabel() {
    const openingLocation = this._activeOpeningTimeContext?.selectedLocation || null;
    const currentLocation =
      typeof locationTracker !== 'undefined' && typeof locationTracker.getLocation === 'function'
        ? locationTracker.getLocation()
        : null;
    return (
      openingLocation?.site ||
      openingLocation?.spot ||
      openingLocation?.country ||
      currentLocation?.site ||
      currentLocation?.spot ||
      currentLocation?.country ||
      '当前场景'
    );
  }

  _buildFallbackTradeBusinessHint(text = '', shortText = '') {
    const normalized = String(text || '').replace(/\s+/g, ' ').trim();
    const cleaned = normalized
      .replace(/([+-]?\d+)\s+\S+\s*$/, '')
      .replace(/^[买卖付购雇租用支付付款出售卖掉买下]+/u, '')
      .trim();
    if (cleaned) {
      return cleaned.length > 12 ? cleaned.slice(0, 12) : cleaned;
    }
    return shortText || '交易';
  }

  _buildFallbackBusinessHint(typeTag = '', text = '', shortText = '') {
    const isEnglish = this._getGamePromptLanguage() === 'en';
    if (typeTag === 'explore') {
      return `${isEnglish ? 'Scene' : '场景'}：${this._getFallbackExploreSceneLabel()}`;
    }
    if (typeTag === 'talk') {
      return isEnglish ? 'Ask for information' : '打探消息';
    }
    if (typeTag === 'action') {
      return shortText || (isEnglish ? 'Take action' : '采取行动');
    }
    return text || shortText || '';
  }

  _extractExplicitTravelDays(text = '') {
    const match = text.match(/([+-]?\d+)\s*(?:天|days?)/i);
    if (!match) return null;
    const days = Number.parseInt(match[1], 10);
    return Number.isFinite(days) && days > 0 ? days : null;
  }

  _deriveFallbackChoiceType(text = '') {
    const normalized = String(text || '').trim();
    if (!normalized) return 'explore';

    const isTrade =
      /(购买|出售|支付|付款|付费|付钱|雇佣|租用|买下|卖掉|buy|sell|pay|hire|rent|\d+\s*(银币|金币|铜板|铜币|钱|货币|coins?|gold|silver|money|currency))/.test(
        normalized
      ) && !/(开价|问价|报价|多少钱|价钱|price|how much|quote)/i.test(normalized);
    if (isTrade) return 'trade';

    if (
      /(对话|打听|试探|询问|追问|问|聊|听说|消息|说说|talk|ask|chat|question|probe|news|rumor)/i.test(
        normalized
      )
    ) {
      return 'talk';
    }

    if (
      /(布告栏|找活|应聘|短工|招工|差事|接活|打工|闭关|冥想|修炼|训练|值守|巡逻|锻造|制作|打坐|睡|休息|过夜|job board|apply|shift|odd job|work\b|meditat|train|forge|craft|study|rest|sleep|overnight)/i.test(
        normalized
      )
    ) {
      return 'work';
    }

    if (
      /(离开|赶路|出发|动身|启程|赶往|赶去|去别处|过河|上路|出城|进城|换地方|leave|depart|travel|set out|cross the river|head out)/i.test(
        normalized
      )
    ) {
      return 'travel';
    }

    if (
      /(看|查|找|去哪|哪里|观察|调查|寻找|附近|歇脚|什么地方|哪儿|看看|翻找|搜寻|查看|靠近|门口|柜台|look|check|find|where|observe|inspect|investigate|search|nearby|look around)/i.test(
        normalized
      )
    ) {
      return 'explore';
    }

    if (
      /(前往|去往|赶到|去|go to|head to)/i.test(normalized) &&
      /(镇|城|村|码头|港|车站|驿站|街区|城区|边境|城门|港口|town|city|village|port|station|district|border)/i.test(
        normalized
      )
    ) {
      return 'travel';
    }

    return 'action';
  }

  _buildFallbackChoiceShortText(typeTag = '', text = '') {
    const normalized = String(text || '').trim();
    const isEnglish = this._getGamePromptLanguage() === 'en';
    if (typeTag === 'work') {
      if (normalized.includes('布告栏') || /job board/i.test(normalized)) {
        return isEnglish ? 'Check Jobs' : '查看布告';
      }
      if (/(睡|休息|过夜|sleep|rest|overnight)/i.test(normalized)) {
        return isEnglish ? 'Rest Up' : '休息过夜';
      }
      if (/(闭关|冥想|修炼|训练|打坐|meditat|train|study)/i.test(normalized)) {
        return isEnglish ? 'Focus Training' : '专心修炼';
      }
      if (/(锻造|制作|forge|craft|make)/i.test(normalized)) {
        return isEnglish ? 'Focus Crafting' : '专心制作';
      }
      return isEnglish ? 'Long Task' : '安排耗时';
    }
    if (typeTag === 'travel') return isEnglish ? 'Set Out' : '动身出发';
    if (typeTag === 'trade') return isEnglish ? 'Make Payment' : '支付费用';
    if (typeTag === 'explore') {
      if (/(调查|查|investigate|inspect)/i.test(normalized))
        return isEnglish ? 'Investigate' : '调查线索';
      if (/(找|哪里|哪儿|去处|歇脚|find|where|place)/i.test(normalized))
        return isEnglish ? 'Find a Place' : '寻找去处';
      return isEnglish ? 'Look Around' : '查看情况';
    }
    if (typeTag === 'talk') {
      if (/(试探|probe)/i.test(normalized)) return isEnglish ? 'Probe Gently' : '试探口风';
      if (/(追问|询问|问|ask|question)/i.test(normalized))
        return isEnglish ? 'Press for Details' : '追问线索';
      return isEnglish ? 'Ask Around' : '打探消息';
    }
    if (typeTag === 'action') {
      if (/(攻击|打|砍|attack|fight|hit|strike)/i.test(normalized))
        return isEnglish ? 'Attack' : '发起攻击';
      if (/(偷|steal)/i.test(normalized)) return isEnglish ? 'Steal' : '偷窃';
      if (/(搜|翻|search|loot)/i.test(normalized)) return isEnglish ? 'Search' : '搜索';
      return isEnglish ? 'Take Action' : '采取行动';
    }
    return isEnglish ? 'Take Action' : '采取行动';
  }

  _buildFallbackChoiceFromText(text = '', id = 'A') {
    const detailText = String(text || '').trim();
    const typeTag = this._deriveFallbackChoiceType(detailText);
    let costHint = '';
    let effectDays = 0;
    const shortText = this._buildFallbackChoiceShortText(typeTag, detailText);

    if (typeTag === 'travel' || typeTag === 'work') {
      effectDays = this._extractExplicitTravelDays(detailText) || 1;
      costHint = `+${effectDays}天`;
    } else if (typeTag === 'trade') {
      costHint = this._buildFallbackTradeBusinessHint(detailText, shortText);
    } else {
      costHint = this._buildFallbackBusinessHint(typeTag, detailText, shortText);
    }

    return {
      id,
      type_tag: typeTag,
      short_text: shortText,
      detail_text: detailText,
      cost_hint: costHint,
      effect_time: this._getExpectedChoiceEffectTime(typeTag) || 'low',
      effect_days: effectDays,
    };
  }

  _parseJsonTextLoose(jsonText = '') {
    try {
      return JSON.parse(jsonText);
    } catch (_error) {
      const jsonMatch = String(jsonText || '').match(/```json\s*([\s\S]*?)\s*```/i);
      const jsonContent = jsonMatch ? jsonMatch[1] : jsonText;
      return JSON.parse(jsonContent);
    }
  }

  _buildSingleActionClassificationPrompt() {
    return `# 动作分类器

你的唯一任务是：把玩家这一条输入转换成一个结构化动作对象。

## 固定 type_tag
- explore
- trade
- travel
- work
- talk
- action

## 天数规则
- travel 和 work 必须输出正整数 effect_days（=本回合时间推进的天数）
- 其他 type_tag 不需要填 effect_days（可省略或填 0）

## 输出要求
- 直接输出一个 JSON 对象
- detail_text 保留玩家原意，仅做轻微整理
- short_text 写成简短行动短语（≤10 字）
- cost_hint 简短自由文本（≤20 字），如 "+3天"、"风险中等"、"通宵"，仅作 UI 显示
- 不要输出解释`;
  }

  _buildSingleActionClassificationSchema() {
    return {
      type: 'object',
      properties: {
        type_tag: {
          type: 'string',
          enum: STEP3_CHOICE_TYPES,
        },
        short_text: { type: 'string' },
        detail_text: { type: 'string' },
        cost_hint: { type: 'string' },
        effect_days: { type: 'integer' },
      },
      required: [
        'type_tag',
        'short_text',
        'detail_text',
        'cost_hint',
      ],
      additionalProperties: false,
    };
  }

  _resolveChoiceTimeMinutes(choice = null) {
    if (!choice) return null;
    const normalizedType = this._normalizeChoiceTypeTag(choice.type_tag);
    if (STEP3_CHOICE_DAY_TYPES.has(normalizedType)) {
      const effectDays = this._normalizeChoiceEffectDays(choice.effect_days);
      return Number.isInteger(effectDays) && effectDays > 0 ? effectDays * 1440 : null;
    }
    const effectTime = this._getExpectedChoiceEffectTime(normalizedType);
    return this._rollChoiceTimeMinutes(effectTime);
  }

  async classifySingleAction(inputText, options = {}) {
    const normalizedInput = this._sanitizeActionInputForClassification(inputText);
    if (!normalizedInput) return null;

    const fallbackChoice = this._buildFallbackChoiceFromText(normalizedInput, 'A');
    const validationFallback = this._normalizeAndValidateChoiceObject(fallbackChoice, {
      requireId: false,
      index: 0,
    });
    const validFallbackChoice = validationFallback.isValid ? validationFallback.choice : fallbackChoice;

    try {
      // 推荐模式下走 action_classify 配置（v4-flash + thinking=off）。
      // 阻塞型调用（玩家选项分类），off 是为了延迟最低；非推荐模式 aliasMap 兜底到 'react'。
      const adapter = this._getAdapter('action_classify', AI_REQUEST_SCOPED);
      const providerType = adapter.provider || 'gemini';
      const systemParts = [];
      const currentTime = this._getCurrentGameTime();
      const formattedTime = this._formatGameTimeForPrompt(currentTime);
      if (formattedTime) {
        systemParts.push(`## 当前游戏时间\n\n当前为${formattedTime}。`);
      }
      const currentLocation =
        typeof locationTracker !== 'undefined' && typeof locationTracker.getLocation === 'function'
          ? locationTracker.getLocation()
          : null;
      if (currentLocation && (currentLocation.country || currentLocation.site || currentLocation.spot)) {
        const locText = [currentLocation.country, currentLocation.site, currentLocation.spot]
          .filter(part => typeof part === 'string' && part.trim())
          .join(' - ');
        if (locText) {
          systemParts.push(`## 当前地点\n\n${locText}`);
        }
      }
      systemParts.push(this._buildSingleActionClassificationPrompt());

      const messages = [{ role: 'user', parts: [{ text: normalizedInput }] }];
      // thinking 选择：推荐模式走 action_classify 配置（默认 off）；
      // 非推荐模式（simple/advanced）强制 'off'，保留 "轻量 JSON 分类、阻塞玩家选项 → 延迟最低" 的历史语义，
      // 避免用户给 react 设了 high 后，玩家自定义动作分类被拖慢。
      const isRecommended = this.getEffectiveApiSettingsMode(AI_REQUEST_SCOPED) === 'recommended';
      const optionsForPayload = {
        temperature: this.getModuleTemperature('action_classify', 1.0, AI_REQUEST_SCOPED),
        thinking: isRecommended
          ? this.getModuleThinking('action_classify', AI_REQUEST_SCOPED)
          : 'off',
      };
      if (this._isStep3SchemaSupportedProvider(providerType)) {
        optionsForPayload.responseSchema = this._buildSingleActionClassificationSchema();
      }
      const { payload, url } = adapter.buildPayload(messages, systemParts, [], optionsForPayload);
      const result = await adapter.callAPI(url, payload, null, this._currentAbortSignal);
      const parsed = this._parseJsonTextLoose(result?.text || '');
      const validation = this._normalizeAndValidateChoiceObject(
        {
          ...parsed,
          id: 'A',
        },
        {
          requireId: false,
          index: 0,
        }
      );
      if (validation.isValid) {
        return validation.choice;
      }
    } catch (error) {
      console.warn('[ActionClassifier] AI 分类失败，回退本地规则:', error?.message || error);
    }

    return validFallbackChoice;
  }

  async preparePendingPlayerActionContext(actionInputText = '', options = {}) {
    const originalInput = typeof actionInputText === 'string' ? actionInputText.trim() : '';
    if (!originalInput) {
      this.clearPendingPlayerActionContext();
      return null;
    }

    if (!this._hasStructuredGameHistory()) {
      this.clearPendingPlayerActionContext();
      return null;
    }

    const selectedChoiceText =
      typeof options.selectedChoiceText === 'string' ? options.selectedChoiceText.trim() : '';
    const selectedChoicePayload =
      typeof options.selectedChoicePayload === 'string' ? options.selectedChoicePayload.trim() : '';

    let choice = null;
    let source = 'classified';

    if (selectedChoicePayload && selectedChoiceText && originalInput === selectedChoiceText) {
      try {
        const parsedChoice = JSON.parse(decodeURIComponent(selectedChoicePayload));
        const validation = this._normalizeAndValidateChoiceObject(parsedChoice, {
          requireId: false,
          index: 0,
        });
        if (validation.isValid) {
          choice = validation.choice;
          source = 'preset';
        }
      } catch (error) {
        console.warn('[ActionContext] 预设选项元数据解析失败，改走分类器:', error?.message || error);
      }
    }

    if (!choice) {
      choice = await this.classifySingleAction(originalInput, options);
    }

    if (!choice) {
      this.clearPendingPlayerActionContext();
      return null;
    }

    const context = {
      source,
      originalInput,
      normalizedInput: this._sanitizeActionInputForClassification(originalInput),
      choice,
    };
    this.setPendingPlayerActionContext(context);
    return context;
  }

  /**
   * 合并模式（merged pipeline）的 system 组装
   * - 工具结果在 message history 中（无需 collectedReferences）
   * - 使用 CORE_PROMPT_MERGED（调查员+讲述者合一）
   *
   * 返回的 parts 为 `{text, cacheable, tag}` 对象数组：
   * - cacheable=true 段供 prompt cache 命中（Anthropic 显式 cache_control / OpenAI 自动前缀）
   * - 按"静态核心 → 独立 NARRATIVE_LENGTH → 世界级动态（半稳定）→ 本轮动态"排序，
   *   保证前缀真的"静态"，本轮动态落在最后
   * 非 Anthropic adapter 会忽略 cacheable 字段，只读 text
   */
  _buildMergedSystemParts(
    systemContext,
    lastGameState,
    _userMessage = '',
    messages = [],
    gmDirective = null,
    npcReactions = null
  ) {
    const parts = [];
    const manifest = [];
    const requestConfig = this._getConfigSource(AI_REQUEST_SCOPED);
    const corePromptMerged = this._getRequiredCorePromptString('CORE_PROMPT_MERGED');

    // 叙事篇幅三档变体（短/中/长）— 推荐模式下锁定为 medium
    const narrativeLengthVariants = globalThis.NARRATIVE_LENGTH_VARIANTS || {};
    const effectiveNarrativeLength =
      typeof this.getEffectiveNarrativeLength === 'function'
        ? this.getEffectiveNarrativeLength(AI_REQUEST_SCOPED)
        : requestConfig.narrativeLength;
    const narrativeLengthKey = narrativeLengthVariants[effectiveNarrativeLength]
      ? effectiveNarrativeLength
      : 'medium';
    const narrativeLengthVariant =
      narrativeLengthVariants[narrativeLengthKey] || { planning: '', section: '' };

    // ================================================================
    // SECTION A — 静态核心（cacheable）
    // CORE_PROMPT_MERGED + coreWorldMechanics + narrativeBase
    // 整场游戏（同一世界卡下）完全不变
    // ================================================================
    const coreWorldMechanics = this._getEffectiveCoreWorldMechanics();
    const narrativeBase = this._getEffectiveNarrativeBase();
    const dynamicMergedPrompt = [corePromptMerged, coreWorldMechanics, narrativeBase]
      .filter(Boolean)
      .join('\n\n');

    parts.push({
      text: dynamicMergedPrompt,
      cacheable: true,
      cacheBreakpoint: true, // 显式 breakpoint：即使后续 cacheable 段失效，core 仍能命中
      tag: 'core_composite',
    });
    const worldMechanicsStatus = coreWorldMechanics ? 'injected' : 'missing';
    manifest.push({
      name: 'CORE_PROMPT_MERGED',
      type: 'static',
      cacheable: true,
      length: corePromptMerged.length,
      status: 'injected',
    });
    manifest.push({
      name: 'PROMPT_MODULE_core_world_mechanics',
      type: 'static',
      cacheable: true,
      length: coreWorldMechanics.length,
      status: worldMechanicsStatus,
    });
    const narrativeBaseStatus = narrativeBase ? 'injected' : 'missing';
    manifest.push({
      name: 'PROMPT_MODULE_narrative_base',
      type: 'static',
      cacheable: true,
      length: narrativeBase.length,
      status: narrativeBaseStatus,
    });
    manifest.push({
      name: 'CORE_PROMPT_MERGED_COMPOSITE',
      type: 'static',
      cacheable: true,
      length: dynamicMergedPrompt.length,
      worldMechanics: worldMechanicsStatus,
      narrativeBase: narrativeBaseStatus,
      components: [
        'CORE_PROMPT_MERGED',
        'PROMPT_MODULE_core_world_mechanics',
        'PROMPT_MODULE_narrative_base',
      ],
      componentCount: 3,
    });

    // ================================================================
    // SECTION B — NARRATIVE_LENGTH（cacheable，独立 part）
    // 拆为独立 part：切换篇幅档位只失效这一小段，不影响 SECTION A 缓存
    // ================================================================
    if (narrativeLengthVariant.section) {
      parts.push({
        text: narrativeLengthVariant.section,
        cacheable: true,
        tag: 'narrative_length',
      });
      manifest.push({
        name: 'NARRATIVE_LENGTH',
        type: 'dynamic',
        cacheable: true,
        length: narrativeLengthVariant.section.length,
        status: 'injected',
        info: `length tier: ${narrativeLengthKey}`,
      });
    }

    // ================================================================
    // SECTION C — 世界级动态（cacheable，半稳定）
    // era + currency + mapContext + predefined NPC list + rule module preview
    // 仅在世界卡切换 / 预定义 NPC 登场 / 新规则模块添加时失效
    // ================================================================
    const worldLevelBlocks = this._buildWorldLevelDynamicBlocks();
    for (const block of worldLevelBlocks) {
      parts.push({ text: block.text, cacheable: true, tag: block.tag });
      manifest.push({
        name: block.name,
        type: 'dynamic',
        cacheable: true,
        length: block.text.length,
      });
    }

    // ================================================================
    // SECTION D — 本轮动态（非 cacheable）
    // systemContext, lastGameState, opening, SMS, npcReactions, gmDirective,
    // customPrompt, playerActionClassification, OOC（OOC 最后=最高优先级）
    // ================================================================
    const volatileBlocks = this._buildVolatileSystemBlocks(
      systemContext,
      lastGameState,
      _userMessage,
      messages,
      gmDirective,
      npcReactions
    );
    for (const block of volatileBlocks) {
      parts.push({ text: block.text, cacheable: false, tag: block.tag });
      manifest.push({
        name: block.name,
        type: 'dynamic',
        cacheable: false,
        length: block.text.length,
        ...(block.extra || {}),
      });
    }

    this._lastPromptManifest = manifest;

    // 同步 snapshot 到 promptRegistry（react 通道），供 Prompt Inspector UI 预览
    // 注：_buildMergedSystemParts 的装配逻辑不变（保 Anthropic prompt cache 字节级一致），
    // 这里只把"实际注入了哪些 block + 文本"拍快照给 UI/文档生成器用。
    // blockId 来自 part.tag → 通过映射表对齐到 register ID 后缀，让 UI detail 能找到 metadata
    if (window.promptRegistry?.recordSnapshot) {
      try {
        // tag (snake_case) → register ID suffix (小驼峰)，与 prompt-gm.js 末尾 IIFE 注册的 react.systemBlock.* 对齐
        const TAG_TO_BLOCK_ID = {
          core_composite: 'coreComposite',
          narrative_length: 'narrativeLength',
          era: 'eraConstraint',
          currency: 'currencyConstraint',
          predefined_npc_list: 'predefinedNpcList',
          rule_module_preview: 'ruleModulePreview',
          system_context: 'systemContext',
          last_game_state: 'lastGameState',
          map_context: 'mapContext',
          player_inventory: 'playerInventory',
          opening_directive: 'openingDirective',
          opening_time_context: 'openingTimeContext',
          world_card_init: 'openingFallback',
          world_card_init_fallback: 'openingFallback',
          sms: 'smsInjection',
          npc_reactions: 'npcReactions',
          gm_directive: 'gmDirective',
          custom_prompt: 'customSystemPrompt',
          player_action_classification: 'playerActionClassification',
          ooc: 'ooc',
        };
        const injected = parts.map((p, i) => {
          const suffix = TAG_TO_BLOCK_ID[p.tag] || p.tag || `unknown_${i}`;
          return {
            blockId: `react.systemBlock.${suffix}`,
            length: (p.text || '').length,
            cacheable: !!p.cacheable,
            text: p.text || '',
          };
        });
        const cacheableInj = injected.filter(b => b.cacheable);
        const volatileInj = injected.filter(b => !b.cacheable);
        const totalChars = injected.reduce((s, b) => s + b.length, 0);
        window.promptRegistry.recordSnapshot('react', {
          channel: 'react',
          timestamp: Date.now(),
          ctxHash: 'react-' + (this.accumulatedStepCount || 0),
          injected,
          skipped: [],
          totalChars,
          cacheable: { count: cacheableInj.length, chars: cacheableInj.reduce((s, b) => s + b.length, 0) },
          volatile: { count: volatileInj.length, chars: volatileInj.reduce((s, b) => s + b.length, 0) },
        });
      } catch (e) {
        console.warn('[promptRegistry] react snapshot 同步失败:', e);
      }
    }

    return parts;
  }

  /**
   * 构建世界级动态 system 块（cacheable，半稳定）
   * 包含：era / currency / map context / predefined NPC list / rule module preview
   * 这些数据只在世界卡切换 / 预定义 NPC 登场 / 新规则模块添加时才变，
   * 因此放在 cacheable 段，跨迭代和跨回合都能命中缓存。
   * @returns {Array<{text:string, tag:string, name:string}>}
   */
  _buildWorldLevelDynamicBlocks() {
    const blocks = [];

    // 纪年约束
    const timeTerms = this._getActiveTimeTerms();
    if (timeTerms?.era) {
      const isStandardEra = ['UE', 'Pre-UE'].includes(timeTerms.era);
      const banClause = isStandardEra ? '' : '严禁出现 UE/Pre-UE 纪年写法。';
      blocks.push({
        name: 'eraConstraintNamed',
        tag: 'era',
        text: `[!CRITICAL] 本世界纪年为"${timeTerms.era}"。叙事与状态中的时间表达必须使用该纪年。${banClause}`,
      });
    } else {
      blocks.push({
        name: 'eraConstraintNoPrefix',
        tag: 'era',
        text: '[!CRITICAL] 本世界未定义纪年名称。叙事与状态中的时间表达必须使用无纪年写法（仅年/月/日或对应时间单位），严禁添加任何纪年前缀。',
      });
    }

    // 货币约束
    const currencyTerms = this._getActiveCurrencyTerms();
    if (currencyTerms?.currencyLabel) {
      blocks.push({
        name: 'currencyConstraint',
        tag: 'currency',
        text: `[!CRITICAL] 本世界货币单位为"${currencyTerms.currencyLabel}"，叙事中必须统一使用此名称，严禁出现其他货币名称（如铜板、银两等）。`,
      });
    }

    // 地图上下文已搬到 volatile 段（玩家每移动一格就变，无缓存价值）
    // 见 _buildVolatileSystemBlocks 中的 mapContext 注入

    // 预定义 NPC 名单（从 npcTools 的 tool description 搬出来）
    const npcListText = this._buildPredefinedNpcListText();
    if (npcListText) {
      blocks.push({
        name: 'predefinedNpcList',
        tag: 'predefined_npc_list',
        text: npcListText,
      });
    }

    // 规则模块速览（从 archiveTools 的 tool description 搬出来）
    const ruleModuleText = this._buildRuleModulePreviewSystemText();
    if (ruleModuleText) {
      blocks.push({
        name: 'ruleModulePreview',
        tag: 'rule_module_preview',
        text: ruleModuleText,
      });
    }

    return blocks;
  }

  /**
   * 构建"预定义 NPC 名单" system 块文本
   * 从 npcStore.getPredefinedPool() 读取当前未登场的预定义角色
   * 内容变化（预定义角色登场）会失效本段缓存，但不影响 tools 前缀缓存
   * @returns {string|null} 无预定义角色返回 null
   */
  _buildPredefinedNpcListText() {
    const store = window.npcStore;
    if (!store) return null;
    const pool = store.getPredefinedPool?.() || {};
    const formatter = window._formatPredefinedNpcListForPrompt;
    if (typeof formatter !== 'function') return null;

    const list = formatter(pool);
    if (list) {
      return `## 预定义角色名单（load_predefined_npc 可用）\n\n当前可选预定义角色（未登场）：${list}。激活预定义角色用 load_predefined_npc（id 须从本名单挑选）。若当前登场角色不在名单内，请用 new_npc 自行建档（不要猜 ID，蛇形小写英文，不与名单 id 冲突）。`;
    }
    return '## 预定义角色名单\n\n当前世界无预定义角色（未登场池为空），load_predefined_npc 工具不会注册。所有新 NPC 一律使用 new_npc 自行建档。';
  }

  /**
   * 构建"规则模块速览 + 调用建议" system 块文本
   * 从 archiveTools 暴露的 _buildRuleModulePreviewText 读取
   * @returns {string|null} 无可用模块返回 null
   */
  _buildRuleModulePreviewSystemText() {
    const helper = window._buildRuleModulePreviewText;
    if (typeof helper !== 'function') return null;
    const text = helper();
    if (!text) return null;
    return `## 规则模块速览（get_rule 可选 module_id）\n\n${text}`;
  }

  /**
   * 构建本轮动态（volatile）system 块
   * 包括：systemContext / lastGameState / opening_directive / SMS / npcReactions /
   *       gmDirective / customPrompt / playerActionClassification / OOC
   * 这些内容在 turn 边界或 iteration 边界可能发生变化，放 cacheable=false 段。
   * 公开为独立 helper 供 iter 5/6/7 / iter 9 stage 间调用，刷新 SECTION D 易变块。
   *
   * @param {string|null} systemContext
   * @param {string|null} lastGameState
   * @param {string} userMessage
   * @param {Array} messages
   * @param {string|null} gmDirective
   * @param {Array|null} npcReactions
   * @returns {Array<{text:string, tag:string, name:string, extra?:Object}>}
   */
  _buildVolatileSystemBlocks(
    systemContext,
    lastGameState,
    userMessage = '',
    messages = [],
    gmDirective = null,
    npcReactions = null
  ) {
    const blocks = [];
    const requestConfig = this._getConfigSource(AI_REQUEST_SCOPED);
    const worldCardInit = window.worldMeta?.getRuleModule?.('init') || '';

    // systemContext：剧情总结 + NPC 档案 JSON（每轮最易变）
    if (systemContext) {
      blocks.push({
        name: 'systemContext',
        tag: 'system_context',
        text: systemContext,
        extra: { content: systemContext },
      });
    }

    // 上一轮游戏状态
    if (lastGameState) {
      const text = `## 上一轮游戏状态\n\n以下是上一轮的状态数据，仅供参考上下文。你只负责输出纯叙事文本。\n\n${lastGameState}`;
      blocks.push({
        name: 'lastGameState',
        tag: 'last_game_state',
        text,
        extra: { content: text },
      });
    }

    // 地图上下文（玩家位置/相邻地形/地标，每移动一格即变，故归 volatile）
    const mapContextText = this._buildMapContextSystemText();
    if (mapContextText) {
      blocks.push({
        name: 'mapContext',
        tag: 'map_context',
        text: mapContextText,
        extra: { content: mapContextText },
      });
    }

    // 玩家物品栏（update_item 工具的当前状态，每回合可能变 → volatile）
    const inventoryText = this._buildInventorySystemText();
    if (inventoryText) {
      blocks.push({
        name: 'playerInventory',
        tag: 'player_inventory',
        text: inventoryText,
        extra: { content: inventoryText },
      });
    }

    // 开场引导（Turn 1 only，由 OpeningController 统一处理）
    let initInjected = false;
    if (this.openingController) {
      const directive = this.openingController.resolve(messages, lastGameState, userMessage);
      if (directive.promptText) {
        blocks.push({
          name: 'opening_directive',
          tag: 'opening_directive',
          text: directive.promptText,
          extra: { condition: `Turn 1 ${directive.mode || 'opening'}` },
        });
        initInjected = true;
      }
    } else {
      // 降级：OpeningController 未加载
      const modelMessageCount = messages.filter(m => m.role === 'model').length;
      if (modelMessageCount <= 1) {
        if (typeof worldCardInit === 'string' && worldCardInit.trim()) {
          blocks.push({
            name: 'PROMPT_MODULE_init',
            tag: 'world_card_init',
            text: `## 开场引导规则\n\n${worldCardInit}`,
            extra: { condition: 'Turn 1' },
          });
          initInjected = true;
        }
      }
      if (!lastGameState) {
        const openingTimeText = this._buildOpeningTimePromptText();
        if (openingTimeText) {
          blocks.push({
            name: 'openingTimeContext',
            tag: 'opening_time_context',
            text: openingTimeText,
            extra: { condition: 'Turn 1 random/recommended' },
          });
        }
      }
    }

    // 兜底：确保 init 模块在 Turn 1 必定注入
    if (!initInjected && !lastGameState) {
      const modelMsgCount = messages.filter(m => m.role === 'model').length;
      if (modelMsgCount <= 1 && typeof worldCardInit === 'string' && worldCardInit.trim()) {
        blocks.push({
          name: 'PROMPT_MODULE_init_fallback',
          tag: 'world_card_init_fallback',
          text: `## 开场引导规则\n\n${worldCardInit}`,
          extra: { condition: 'Turn 1 fallback' },
        });
        console.warn('[Agent] Init fallback triggered: OpeningController returned null on Turn 1');
      }
    }

    // SMS
    if (typeof smsService !== 'undefined' && smsService.hasNewMessages()) {
      const newMessages = smsService.getNewMessages();
      const smsInjectionText = this._formatSmsForInjection(newMessages);
      if (smsInjectionText) {
        blocks.push({
          name: 'smsInjection',
          tag: 'sms',
          text: smsInjectionText,
          extra: { content: smsInjectionText },
        });
      }
      this._pendingSmsInjection = true;
    } else {
      this._pendingSmsInjection = false;
    }

    // NPC Reactions
    if (Array.isArray(npcReactions) && npcReactions.length > 0) {
      const isEn = this._getGamePromptLanguage() === 'en';

      const npcDirectives = npcReactions.map(r => {
        const d = r.decision;
        if (!d) return `### ${r.name}\n${r.text}`;
        let s = `### ${r.name}\n`;
        s += `- **${isEn ? 'Action' : '行动'}**: ${d.action}\n`;
        if (d.location) s += `- **${isEn ? 'Location' : '位置'}**: ${d.location}\n`;
        if (d.social_target) s += `- **${isEn ? 'Interacts with' : '互动对象'}**: ${d.social_target}\n`;
        if (d.mood) s += `- **${isEn ? 'Mood' : '情绪'}**: ${d.mood}\n`;
        if (d.inner_thought) s += `- **${isEn ? 'Inner thought' : '内心'}**: ${d.inner_thought}\n`;
        s += isEn
          ? `**Requirement**: The narrative MUST show ${r.name}'s actions and location above. Show through behavior, dialogue, expressions — do not quote inner thoughts verbatim.`
          : `**要求**: 叙事中必须体现${r.name}的上述行动和位置。通过具体的行为、对话、表情来展现，不要逐字引用内心独白。`;
        return s;
      }).join('\n\n');

      const hasStructured = npcReactions.some(r => r.decision);
      const npcReactionText = hasStructured
        ? (isEn
          ? `## NPC Autonomous Actions (MUST be reflected in narrative)\n\nThe following characters have independently decided their actions this turn. Your narrative **MUST** include each character's actions — do not ignore or substitute.\n\n${npcDirectives}`
          : `## NPC 自主行动（必须在叙事中体现）\n\n以下角色已独立做出本轮决策。你的叙事**必须**包含每个角色的行动，不可忽略或替换为其他行为。\n\n${npcDirectives}`)
        : (isEn
          ? `## NPC Reactions\n\nThe following are each character's independent reactions to the current situation. Please reference and integrate them into the narrative:\n\n${npcDirectives}`
          : `## NPC 角色反应\n\n以下是各角色对当前情境的独立反应，请在叙事中参考并整合：\n\n${npcDirectives}`);

      blocks.push({ name: 'npcReactions', tag: 'npc_reactions', text: npcReactionText });
    }

    // GM 写作指导
    if (gmDirective) {
      const text = `## 本轮GM指导\n\n${gmDirective}`;
      blocks.push({
        name: 'gmDirective',
        tag: 'gm_directive',
        text,
        extra: { content: text },
      });
    }

    // 额外指令
    const customPrompt = requestConfig.customSystemPrompt || '';
    if (customPrompt) {
      const text = `## 额外指令（最高优先级）\n\n${customPrompt}`;
      blocks.push({
        name: 'customSystemPrompt',
        tag: 'custom_prompt',
        text,
        extra: { content: text },
      });
    }

    // 动作分类器上下文
    const actionContextText = this._buildActionContextSystemText(this.getPendingPlayerActionContext());
    if (actionContextText) {
      blocks.push({
        name: 'playerActionClassification',
        tag: 'player_action_classification',
        text: actionContextText,
      });
    }

    // 玩家主动物品操作（消耗/丢弃）
    const itemActionsText = this._buildPlayerItemActionsText();
    if (itemActionsText) {
      blocks.push({
        name: 'playerItemActions',
        tag: 'player_item_actions',
        text: itemActionsText,
      });
    }

    // OOC 写作准则（必须最后 push，"末尾=最高优先级"）
    const pendingOoc = this.getPendingOoc();
    if (pendingOoc?.normalized) {
      blocks.push({
        name: 'ooc',
        tag: 'ooc',
        text: pendingOoc.normalized,
        extra: { content: pendingOoc.normalized },
      });
    }

    return blocks;
  }

  /**
   * 为 ReAct stage 间重建"最新 system parts"
   *
   * 做什么：
   * - 重新调 formatMessages(chatHistory) 获取最新 systemContext（NPC 档案 JSON 在 update_npc 后会变）
   * - 重走 _buildMergedSystemParts：静态 cacheable 段保持完全一致（利于缓存命中），
   *   易变段（volatile）拿最新数据
   *
   * 使用场景：
   * - iter 5 / iter 6 / iter 7 stage 进入前刷新（state 在 stage 之间会被 mutation 工具更新）
   * - iter 9（_runChoicesIteration）调用前刷新（让 force payload 看见 iter 8 settlement 后状态）
   *
   * 稳态化前提：
   * - `lastGameState` 为 previous-turn 状态，整轮不变，传入原值即可
   * - `gmDirective / npcReactions / playerActionContext / OOC / customSystemPrompt / openingDirective`
   *   均在 turn 开始后不变，直接沿用传入值
   *
   * @param {Object} ctx
   * @param {string|null} ctx.lastGameState
   * @param {string} ctx.userMessage
   * @param {Array} ctx.messages
   * @param {string|null} ctx.gmDirective
   * @param {Array|null} ctx.npcReactions
   * @returns {Array} 新的 merged system parts（同 _buildMergedSystemParts 返回值）
   */
  _rebuildMergedSystemPartsForIteration({
    lastGameState,
    userMessage,
    messages,
    gmDirective,
    npcReactions,
  }) {
    const history = typeof chatHistory !== 'undefined' && Array.isArray(chatHistory) ? chatHistory : [];
    const { systemContext: freshSystemContext } = this.formatMessages(history);
    return this._buildMergedSystemParts(
      freshSystemContext,
      lastGameState,
      userMessage,
      messages,
      gmDirective,
      npcReactions
    );
  }

  // ========================================
  // GM 决策层
  // ========================================

  /**
   * 调用 GM 决策层（纯代码实现，无 AI 调用）
   * @param {Array} messages - 对话消息数组（保留接口兼容性，不再使用）
   * @returns {Promise<string|null>} GM directive 字符串
   */
  async _callGM(_messages) {
    const startTime = performance.now();
    let requestContext = null;

    try {
      // 检查 GMCodeEngine 是否可用
      if (typeof gmCodeEngine === 'undefined') {
        throw new Error('gmCodeEngine 未加载');
      }

      console.log('[GM CodeEngine] 开始生成 directive');

      // 计算当前回合数（从 chatHistory 中的 AI 消息数量）
      const currentTurn =
        typeof chatHistory !== 'undefined' ? chatHistory.filter(m => m.sender === 'ai').length : 0;

      // 构建输入数据
      const currentTime =
        typeof timelineService !== 'undefined' ? timelineService.getCurrentDate() : null;
      const openingTimeContext = this._activeOpeningTimeContext;
      const effectiveCurrentTime = currentTime || openingTimeContext?.selectedTime || null;

      const currentLocation =
        typeof locationTracker !== 'undefined' ? locationTracker.getLocation() : null;
      const effectiveCurrentLocation =
        currentLocation || openingTimeContext?.selectedLocation || null;

      const turnsAtLocation =
        typeof locationTracker !== 'undefined'
          ? locationTracker.getTurnsAtLocation(currentTurn)
          : 0;

      const scenesToday =
        typeof locationTracker !== 'undefined' ? locationTracker.getScenesToday() : 1;
      const worldCardId =
        typeof window !== 'undefined' ? window.worldCardManager?.getActiveCardId?.() || null : null;

      // 调用代码引擎生成 directive
      requestContext = {
        currentTime: effectiveCurrentTime,
        currentLocation: effectiveCurrentLocation,
        turnsAtLocation,
        scenesToday,
        currentTurn,
        worldCardId,
        openingTimeRange: openingTimeContext?.range || null,
        openingEvent: openingTimeContext?.selectedEvent || null,
      };

      const result = gmCodeEngine.generateDirective(requestContext);

      // 格式化为文本
      const directive = gmCodeEngine.formatDirectiveToText(
        result.directive,
        result.openingGuideComment
      );

      // 记录到 payload（用于调试）
      this.lastGMPayload = {
        engine: 'GM Code Engine',
        phase: 'gm_decision',
        request: requestContext,
        directive: directive,
        result: result,
      };

      // 如果有事件被播报，暂存到 _pendingEventToMark（等待叙事完成后再标记）
      if (directive && result.eventToReport) {
        this._pendingEventToMark = {
          eventId: result.eventToReport.eventId,
          turn: currentTurn,
          type: result.eventToReport.type,
        };
        console.log('[GM] 事件待标记（等待叙事完成）:', result.eventToReport.eventId);
      }

      const elapsed = Math.round(performance.now() - startTime);
      console.log(`[GM CodeEngine] 生成完成 (${elapsed}ms): ${directive?.substring(0, 100)}...`);

      return directive;
    } catch (error) {
      const gmInfo = this._buildUnifiedErrorInfo(error, {
        traceId: this.lastPayload?.traceId,
        phase: 'gm_decision',
        module: 'gm',
        engine: 'GM Code Engine',
        defaultErrorType: 'unknown',
      });
      gmInfo.elapsedMs = Math.round(performance.now() - startTime);
      this.lastGMPayload = {
        engine: 'GM Code Engine',
        phase: 'gm_decision',
        request: requestContext,
        directive: null,
        result: null,
        failed: true,
        errorInfo: gmInfo,
      };
      console.error('[GM CodeEngine] 生成失败:', error);
      return null;
    }
  }

  /**
   * 格式化短信消息用于注入主聊天
   * @param {Object} newMessages - 按联系人分组的新消息 { contactId: [{ role, content, contactName }] }
   * @returns {string} 格式化后的短信记录文本
   */
  _formatSmsForInjection(newMessages) {
    if (!newMessages || Object.keys(newMessages).length === 0) {
      return '';
    }

    let text = `## 短信记录(新消息)\n\n`;
    text += `以下是玩家最新的短信互动。**[!CRITICAL] 叙事必须反映短信内容的影响:**\n\n`;
    text += `1. **约定/计划**:如短信中约好见面时间地点，叙事结尾应自然衔接到赴约情境\n`;
    text += `2. **情感变化**:短信中的关系进展(亲密/冷淡/误会)应影响角色互动描写\n`;
    text += `3. **关键信息**:短信中提到的具体时间、地点、事件需在叙事中明确体现\n\n`;
    text += `> 目的:确保后续选项能基于短信约定生成(如"去赴约"、"回复消息"等)\n\n`;

    for (const contactId in newMessages) {
      const messages = newMessages[contactId];
      if (messages.length === 0) continue;

      const contactName = messages[0].contactName || contactId;
      text += `### ${contactName}\n\n`;

      for (const msg of messages) {
        if (msg.role === 'user') {
          text += `**玩家:** ${msg.content}\n\n`;
        } else if (msg.role === 'system') {
          text += `**[系统提示]** ${msg.content}\n\n`;
        } else {
          text += `**${contactName}:** ${msg.content}\n\n`;
        }
      }
    }

    text += `---\n\n`;
    return text;
  }

  /**
   * 安全获取字段值，处理空值和动态占位符
   * @param {*} value - 字段值
   * @param {string} fallback - 默认值
   * @returns {string}
   */
  _getFieldValue(value, fallback = '不详') {
    if (!value || value === '{{DYNAMIC}}' || (typeof value === 'string' && value.trim() === '')) {
      return fallback;
    }
    return value;
  }

  /**
   * 从 systemContext 中提取剧情总结部分，移除 NPC JSON
   * 用于 Step 3，避免 AI 混淆 NPC JSON 格式与 npc_gen 规范
   * @param {string} systemContext - 完整的 systemContext
   * @returns {string} 仅包含剧情总结的部分
   */
  _extractSummaryFromContext(systemContext) {
    if (!systemContext) return '';

    // systemContext 格式：
    // "## 之前剧情的总结\n\n...\n\n---\n\n## 当前角色档案 - 权威数据源\n\n..."
    // 只保留 "## 之前剧情的总结" 部分

    const npcSectionMarker = '## 当前角色档案';
    const markerIndex = systemContext.indexOf(npcSectionMarker);

    if (markerIndex === -1) {
      // 没有 NPC 部分，返回原内容
      return systemContext;
    }

    // 找到 NPC 部分前的分隔符 "---"
    const beforeNpc = systemContext.substring(0, markerIndex);

    // 移除尾部的 "---\n\n" 分隔符
    const cleaned = beforeNpc.replace(/\n*---\n*$/, '').trim();

    // 如果还有内容，添加结尾分隔符
    return cleaned ? cleaned + '\n\n---\n\n' : '';
  }

  /**
   * 将对话历史序列化为可读文本
   * 用于 Step 3 的 system_instruction parts
   * 支持 Gemini 格式（parts）和 OpenAI 格式（content）
   * @param {Array} contents - 对话历史（Gemini 或 OpenAI 格式）
   * @returns {string} 序列化后的文本
   */
  _serializeContentsForPart(contents) {
    if (!contents || contents.length === 0) return '';

    const serialized = contents
      .map(msg => {
        // 判断角色：Gemini 用 'model'，OpenAI 用 'assistant'
        const isAI = msg.role === 'model' || msg.role === 'assistant';
        const role = isAI ? 'AI' : '玩家';

        // 兼容两种格式：Gemini (parts) 和 OpenAI (content)
        let text = '';
        if (msg.parts && msg.parts.length > 0) {
          // Gemini 格式：可能有多个 parts
          text = msg.parts.map(p => p.text || '').join('\n');
        } else if (msg.content) {
          // OpenAI 格式
          text = msg.content;
        }

        return `[${role}]\n${text}`;
      })
      .join('\n\n---\n\n');

    return `## 对话历史\n\n${serialized}`;
  }

  /**
   * 获取带动态认知状态的联系人信息
   * @param {string} contactId - 联系人ID
   * @param {object} gameTime - 游戏时间
   * @returns {object|null} 带动态 cognitive_state 的联系人信息
   */
  _getContactWithDynamicState(contactId, gameTime) {
    const contact = getContactInfo(contactId);
    if (!contact) return null;

    // 预定义角色：从 AnalyzerManager 获取动态 cognitive_state
    if (contact.type === 'system') {
      contact.cognitive_state =
        typeof AnalyzerManager !== 'undefined'
          ? AnalyzerManager.getCognitiveState(contactId, gameTime)
          : contact.default_cognitive_state || '未知';
    }
    // 临时角色：使用 npcStore 中的值（已在 getContactInfo 中处理）
    // 确保有回退值
    if (!contact.cognitive_state) {
      contact.cognitive_state = contact.default_cognitive_state || '未知';
    }

    return contact;
  }

  // 获取当前游戏时间(直接使用 timelineService)
  _getCurrentGameTime() {
    if (typeof timelineService !== 'undefined') {
      return timelineService.getCurrentDate();
    }
    return null;
  }
  _isStructuredDateValid(date, precision = 'time') {
    if (!date || typeof date !== 'object') return false;
    const normalizedPrecision = ['year', 'month', 'day', 'time'].includes(precision)
      ? precision
      : 'time';
    const year = Number.parseInt(date.year, 10);
    if (!Number.isFinite(year) || year <= 0) return false;
    if (['month', 'day', 'time'].includes(normalizedPrecision)) {
      const month = Number.parseInt(date.month, 10);
      if (!Number.isFinite(month) || month < 1 || month > 12) return false;
    }
    if (['day', 'time'].includes(normalizedPrecision)) {
      const day = Number.parseInt(date.day, 10);
      if (!Number.isFinite(day) || day < 1 || day > 30) return false;
    }
    if (normalizedPrecision === 'time') {
      const { hour, minute } = this._extractStructuredTimeParts(date);
      if (!Number.isFinite(hour) || hour < 0 || hour > 23) return false;
      if (!Number.isFinite(minute) || minute < 0 || minute > 59) return false;
    }
    return true;
  }

  _isValidGameLocation(location) {
    if (!location || typeof location !== 'object') return false;
    return Boolean(
      (typeof location.country === 'string' && location.country.trim()) ||
      (typeof location.site === 'string' && location.site.trim()) ||
      (typeof location.spot === 'string' && location.spot.trim())
    );
  }
  /**
   * 格式化游戏时间为 prompt 可用字符串（动态纪年 + 精度）
   * - 有时间字段：使用配置的 _era 和 _precision
   * - 无时间字段：返回 null（跳过注入）
   */
  _formatGameTimeForPrompt(currentTime) {
    if (!currentTime || !currentTime.year) return null;

    const step3Fields = window.worldMeta?.getStep3Fields?.();

    // 若未配置时间组，跳过时间注入
    const hasTimeGroup =
      Array.isArray(step3Fields?.panel_status) &&
      step3Fields.panel_status.some(g => g && (g._template === 'time' || g.key === 'datetime'));
    if (!hasTimeGroup) return null;

    const timeTerms = this._getActiveTimeTerms();
    const era = timeTerms?.era || '';
    const precision = timeTerms?.precision || 'time';
    const labels = timeTerms?.labels || { year: '年', month: '月', day: '日', hour: '时', minute: '分' };

    let text = `${era}${currentTime.year}${labels.year || '年'}`;
    if (
      ['month', 'day', 'time'].includes(precision) &&
      currentTime.month !== null &&
      currentTime.month !== undefined
    )
      text += `${currentTime.month}${labels.month || '月'}`;
    if (
      ['day', 'time'].includes(precision) &&
      currentTime.day !== null &&
      currentTime.day !== undefined
    )
      text += `${currentTime.day}${labels.day || '日'}`;
    const { hour, minute } = this._extractStructuredTimeParts(currentTime);
    const timeText = this._formatClockTime(hour, minute);
    if (precision === 'time' && timeText) text += ` ${timeText}`;
    return text.trim();
  }

  // 计算两个游戏时间之间的差距(辅助方法)
  _calculateGameTimeDiff(fromTime, toTime) {
    if (!fromTime || !toTime) return '未知';

    // 计算天数差
    const fromDays = fromTime.year * 365 + fromTime.month * 30 + fromTime.day;
    const toDays = toTime.year * 365 + toTime.month * 30 + toTime.day;
    const daysDiff = toDays - fromDays;

    if (daysDiff < 0) {
      return '未知'; // 异常情况
    } else if (daysDiff === 0) {
      const fromClock = this._formatClockTime(
        this._extractStructuredTimeParts(fromTime).hour,
        this._extractStructuredTimeParts(fromTime).minute
      );
      const toClock = this._formatClockTime(
        this._extractStructuredTimeParts(toTime).hour,
        this._extractStructuredTimeParts(toTime).minute
      );

      if (fromClock && toClock) {
        const [fromHour, fromMinute] = fromClock.split(':').map(Number);
        const [toHour, toMinute] = toClock.split(':').map(Number);
        const timeDiff = toHour * 60 + toMinute - (fromHour * 60 + fromMinute);
        if (timeDiff <= 0) {
          return '刚刚';
        } else if (timeDiff < 60) {
          return '不到一小时前';
        } else if (timeDiff < 180) {
          return '几小时前';
        } else {
          return '今天早些时候';
        }
      }
      return '刚刚';
    } else if (daysDiff === 1) {
      return '昨天';
    } else if (daysDiff <= 3) {
      return `${daysDiff}天前`;
    } else if (daysDiff <= 7) {
      return '几天前';
    } else if (daysDiff <= 30) {
      return `${Math.floor(daysDiff / 7)}周前`;
    } else if (daysDiff <= 365) {
      return `${Math.floor(daysDiff / 30)}个月前`;
    } else {
      return '很久以前';
    }
  }

  // ============================================
  // _calculateCognitiveState 已迁移到 cognitiveAnalyzer.js
  // 调用方式: cognitiveAnalyzer.getCognitiveState(characterId, currentTime)
  // ============================================
}

_applyAIServiceMixin(_AIServicePromptGmMixin);

// promptRegistry 注册已抽出到 js/services/ai/promptGmPromptBootstrap.js
