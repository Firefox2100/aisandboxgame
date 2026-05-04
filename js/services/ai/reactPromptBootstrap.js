// ============================================
// react prompt bootstrap — extracted from react.js
// ============================================
// 注册 react / summary / chapterSummary / sms / expand 通道 + 14+ react.directive + react.format
// 三个消费者（浏览器 / build-prompt-index / promptviewer）共享，无 mirror。
//
// 注：localized() helper 在 headless 时 window.aiService 不存在，会 fallback 到全局常量
// （SUMMARY_PROMPT / CHAPTER_SUMMARY_PROMPT / SMS_PROMPT 由 prompts/[Fixed]*_prompt.js 提供）。
// ============================================

// ============================================
// promptRegistry 注册：summary / chapterSummary / sms 三个 subagent 通道
// 这些通道的 prompt 来自全局常量（prompts/[Fixed]*_prompt.js），通过 i18n helper 切语言
// ============================================
(function bootstrapSubagentCorePrompts() {
  if (!window.promptRegistry) {
    console.warn('[promptRegistry] bootstrap 失败：promptRegistry 未加载');
    return;
  }
  const reg = window.promptRegistry;

  // 通过 aiService 实例访问 i18n helper（builder 调用时 aiService 已就绪）
  const localized = (key, fallbackGlobal) => {
    const ai = window.aiService;
    if (!ai) return fallbackGlobal || '';
    try {
      const locale = ai._getGamePromptLanguage?.() || 'zh-CN';
      return ai._getLocalizedGlobalPromptValue?.(key, locale) || fallbackGlobal || '';
    } catch (e) {
      return fallbackGlobal || '';
    }
  };

  reg.register('summary.corePrompt', {
    channel: 'summary',
    category: 'core',
    source: 'static-file',
    cacheable: true,
    description: 'Turn summary 子 agent 系统提示（一句话总结协议）',
    origin: { file: 'prompts/[Fixed]summary_prompt.js', symbol: 'SUMMARY_PROMPT' },
    builder: () =>
      localized('SUMMARY_PROMPT', typeof SUMMARY_PROMPT !== 'undefined' ? SUMMARY_PROMPT : ''),
  });

  reg.register('chapterSummary.corePrompt', {
    channel: 'chapterSummary',
    category: 'core',
    source: 'static-file',
    cacheable: true,
    description: 'Chapter summary 子 agent 系统提示（章节压缩协议）',
    origin: { file: 'prompts/[Fixed]summary_prompt.js', symbol: 'CHAPTER_SUMMARY_PROMPT' },
    builder: () =>
      localized(
        'CHAPTER_SUMMARY_PROMPT',
        typeof CHAPTER_SUMMARY_PROMPT !== 'undefined' ? CHAPTER_SUMMARY_PROMPT : ''
      ),
  });

  reg.register('sms.corePrompt', {
    channel: 'sms',
    category: 'core',
    source: 'static-file',
    cacheable: true,
    description: 'SMS 短信回复子 agent 系统提示（角色模拟协议）',
    origin: { file: 'prompts/[Fixed]sms_prompt.js', symbol: 'SMS_PROMPT' },
    builder: () =>
      localized('SMS_PROMPT', typeof SMS_PROMPT !== 'undefined' ? SMS_PROMPT : ''),
  });

  // ============================================
  // ReAct 主回路 inline 指令（user message，直接拼到消息流）
  // 这些短句不在 systemParts 中，但每个都精确决定 AI 下一轮工具调用走向，
  // 注册到 react 通道 category='directive'，inspector 可见
  // ============================================
  reg.register('react.directive.forceUpdateChoices', {
    channel: 'react',
    category: 'directive',
    source: 'static-file',
    cacheable: false,
    description: 'iter 9 注入的指令：告知 AI 当前轮意图是输出 update_choices（API 层 tool_choice 已硬约束工具，directive 仅作 args 引导）',
    origin: { file: 'js/services/ai/react.js', symbol: 'forceText' },
    builder: ctx => {
      const isEn = ctx?.isEn === true;
      return isEn
        ? 'You must now call update_choices() to end this turn. Provide 2-4 choices based on the current situation.'
        : '你必须立刻调用 update_choices() 结束本回合。根据当前情境提供2-4个选项。';
    },
  });

  // ── tool 错误回灌（也是一种 micro-prompt：AI 看到后切换工具）──
  reg.register('react.directive.npcRedirectToLoadPredefined', {
    channel: 'react',
    category: 'directive',
    source: 'static-file',
    cacheable: false,
    description: 'new_npc 命中预定义角色时回灌的错误消息：引导 AI 改用 load_predefined_npc',
    origin: { file: 'js/tools/npcTools.js', symbol: 'new_npc 预检 1' },
    builder: ctx => {
      const lookup = ctx?.lookup || '<lookup>';
      const predefinedId = ctx?.predefinedId || '<id>';
      return `[错误] "${lookup}" 属于预定义角色 (${predefinedId})，请改用 load_predefined_npc 激活，不要用 new_npc 自创。`;
    },
  });

  reg.register('react.directive.npcRedirectToUpdate', {
    channel: 'react',
    category: 'directive',
    source: 'static-file',
    cacheable: false,
    description: 'new_npc 重复创建已登场角色时回灌的错误消息：引导 AI 改用 update_npc',
    origin: { file: 'js/tools/npcTools.js', symbol: 'new_npc 预检 2' },
    builder: ctx => {
      const id = ctx?.id || '<id>';
      return `[错误] 角色 "${id}" 已登场，请改用 update_npc 更新其字段。`;
    },
  });

  reg.register('react.directive.npcLoadPredefinedNotFound', {
    channel: 'react',
    category: 'directive',
    source: 'static-file',
    cacheable: false,
    description: 'load_predefined_npc 找不到目标 id 时回灌的错误消息（已登场或非预定义）',
    origin: { file: 'js/tools/npcTools.js', symbol: 'load_predefined_npc 预检' },
    builder: ctx => {
      const id = ctx?.id || '<id>';
      return `[错误] "${id}" 不在未登场预定义池中，可能已登场或非预定义角色。`;
    },
  });

  // ── 重复 / 越权 tool 调用回灌（来自 prompt-gm.js _executeToolCalls）──
  reg.register('react.directive.duplicateNarrative', {
    channel: 'react',
    category: 'directive',
    source: 'static-file',
    cacheable: false,
    description: 'update_narrative 重复调用（同一文本已记录）时回灌的错误消息',
    origin: { file: 'js/services/ai/prompt-gm.js', symbol: 'duplicate request narrative' },
    builder: () => '[重复：该段叙事已记录，请继续写新内容或结束回合]',
  });

  reg.register('react.directive.duplicateQuery', {
    channel: 'react',
    category: 'directive',
    source: 'static-file',
    cacheable: false,
    description: '只读查询 tool 重复调用时回灌的错误消息',
    origin: { file: 'js/services/ai/prompt-gm.js', symbol: 'duplicate request query' },
    builder: () => '[已查询，结果见上文]',
  });

  reg.register('react.directive.dispatcherManagedRejected', {
    channel: 'react',
    category: 'directive',
    source: 'static-file',
    cacheable: false,
    description: 'AI 错误调用 dispatcher-managed tool（如 update_panel）时的拒绝消息',
    origin: { file: 'js/services/ai/prompt-gm.js', symbol: 'dispatcher-managed rejected' },
    builder: ctx => {
      const toolName = ctx?.toolName || '<toolName>';
      return `${toolName} 由系统在结算阶段自动处理，无需手动调用。请继续叙事或调用 update_choices 结束回合。`;
    },
  });

  // ============================================
  // 并行 ReAct 流水线 stage directives（v0：iter 1 // iter 2-4 // iter 5/6/7）
  // 每个 stage directive 由 _runAgentWorkflow 在该 iter 启动前注入到 messagesRef 头部，
  // 让 AI 知道当前阶段的角色与约束。
  // ============================================
  reg.register('react.directive.parallelStage1Narrative', {
    channel: 'react',
    category: 'directive',
    source: 'static-file',
    cacheable: false,
    description: '并行 iter 1：强制叙事 + 必带 non-none checkpoint + next_tool（segment 1 起笔到首个不确定点停下）',
    origin: { file: 'js/services/ai/react.js', symbol: 'parallel iter1 directive' },
    builder: ctx => {
      const isEn = ctx?.isEn === true;
      return isEn
        ? '[Parallel pipeline · stage 1 — STRICT] You are running in a constrained stage. The ONLY tool exposed to you this iteration is `update_narrative`. Any call to a different tool will be HARD-REJECTED by the runtime and produce an error. Your task: write segment 1 of the narrative. Rules: (1) Make EXACTLY ONE tool call: update_narrative. Do not call get_*, search_*, update_item, load_predefined_npc, or anything else. (2) Narrate up to the first uncertainty point (an item-check or hidden-world-state question), then STOP — do not narrate the resolution. (3) checkpoint.type MUST be one of {item_check, hidden_state} — type="none" is NOT allowed in this stage. checkpoint.next_tool MUST be one of {get_state, update_item, search_world, get_rule, get_npc_reaction}. **next_tool selection rule**: if segment 1 stops at any item/money exchange (purchase, payment, pickup, sale, barter, theft, gift, consumption, reward) — pick `update_item` with `type=item_check`, NOT a read tool. Reads only postpone the inventory mutation by one stage; for item-related uncertainty you should mutate directly. Use a read-class next_tool only when the question is genuinely about hidden world facts. The runtime will execute your next_tool in a later stage and write segment 2 there. Even for environment-heavy openings, you must find an uncertainty hook (a hidden_state query about who is around / what is in the room / what NPC is doing) and stop before describing it.'
        : '[并行流水线 · 阶段 1 — 严格] 你处于约束阶段。本轮**唯一暴露**给你的工具是 `update_narrative`。调用任何其他工具都会被 runtime **硬拒绝**并返回错误。任务：写 segment 1 叙事。规则：(1) **必须且仅做一个工具调用：update_narrative**。不要调 get_* / search_* / update_item / load_predefined_npc / 任何其他工具。(2) 叙事写到第一个不确定点（物品判定 or 隐藏世界状态查询）就停——不要写出结果。(3) checkpoint.type **必须**是 {item_check, hidden_state} 之一—— **本阶段禁止 type="none"**。checkpoint.next_tool 必须是 {get_state, update_item, search_world, get_rule, get_npc_reaction} 之一。**next_tool 选择规则**：如果 segment 1 停在任何物品/货币变化（购买、支付、拾取、出售、交换、被偷、赠送、消耗、奖赏）—— 选 `update_item` + `type=item_check`，**不要**选读类工具。读类只把库存变更推后一段，对物品类不确定性应直接 mutate。仅当 question 是真正的世界隐藏事实时才选读类 next_tool。Runtime 会在后续阶段执行你声明的 next_tool 并写 segment 2。即使是偏环境描写的开局，也必须找一个不确定点（关于场上有谁、房间里有什么、NPC 在做什么的 hidden_state 查询）并停在它之前。';
    },
  });

  reg.register('react.directive.parallelStage2Reads', {
    channel: 'react',
    category: 'directive',
    source: 'static-file',
    cacheable: false,
    description: '并行 iter 2-4：后台只读探索分支，禁 narrate 禁 mutate',
    origin: { file: 'js/services/ai/react.js', symbol: 'parallel iter2-4 directive' },
    builder: ctx => {
      const isEn = ctx?.isEn === true;
      return isEn
        ? '[Parallel pipeline · stage 2 — background reads — STRICT] You are running concurrent read-only exploration in the background while another branch writes the narrative. ONLY read-class tools are exposed: get_*, search_*. Any call to an update_*, load_predefined_npc, new_npc, or send_* tool will be HARD-REJECTED by the runtime. Rules: (1) Read-only — call get_* / search_* tools to gather facts useful for later. (2) DO NOT call update_narrative — that is another branch\'s job. (3) DO NOT call update_choices. (4) DO NOT mutate state (no update_*, no load_predefined_npc, no new_npc — those run in a later stage). (5) When info is enough, RETURN ZERO TOOL CALLS to terminate this branch early. Max 3 iterations. (6) **Reasoning required**: Before each tool_call, write a one-sentence reasoning in content — why you\'re calling this tool and what you\'ll do with the result. This is a 3-iter chain; content reasoning helps you maintain goals across iters and lets iter 5 understand your exploration intent from the trace.'
        : '[并行流水线 · 阶段 2 — 后台读取 — 严格] 你是后台并发的只读探索分支，与另一个写叙事的分支同时跑。本轮**仅暴露**读类工具：get_* / search_*。调用 update_* / load_predefined_npc / new_npc / send_* 任何一个都会被 runtime **硬拒绝**。规则：(1) **仅读** — 用 get_* / search_* 工具收集事实。(2) **禁止调用 update_narrative** —— 那是另一支的任务。(3) **禁止调用 update_choices**。(4) **禁止改状态** —— 不要 update_*、不要 load_predefined_npc、不要 new_npc（这些工具在后续阶段才能用）。(5) 信息够了就**返回零 tool call** 提前终止本分支。最多 3 轮。(6) **content 推理要求**：每次 tool_call 前在 content 写一句简短推理——你为什么调这个工具、期待用结果做什么。本阶段是 3 步链，content 推理帮你跨 iter 保持目标，也让 iter 5 看 trace 时能理解你的探索意图。';
    },
  });

  reg.register('react.directive.parallelStage3MergeAndMutate', {
    channel: 'react',
    category: 'directive',
    source: 'static-file',
    cacheable: false,
    description: '并行 iter 5：合并两支结果 + 执行 next_tool + 所有 mutations',
    origin: { file: 'js/services/ai/react.js', symbol: 'parallel iter5 directive' },
    builder: ctx => {
      const isEn = ctx?.isEn === true;
      const nextTool = ctx?.iter1NextTool || '';
      const nextToolHint = nextTool
        ? (isEn
            ? `Iter 1 declared next_tool="${nextTool}". If that tool wasn\'t already invoked by the read branch, call it now. `
            : `iter 1 声明的 next_tool="${nextTool}"。如果读取分支没有调过它，现在就调。`)
        : '';
      return isEn
        ? `[Parallel pipeline · stage 3 — merge & mutate — STRICT] Above messages contain TWO parallel results: (A) segment 1 narrative with a checkpoint, (B) read-only exploration tool calls. Note: conversational order (A then B) reflects branch identity, not chronology — both branches ran simultaneously from the same initial state. This iteration\'s tool exposure: read tools (get_*, search_*) PLUS mutation tools (update_item, update_npc, update_new_world, update_new_characters, load_predefined_npc, new_npc, send_sms, send_notification). update_narrative and update_choices are NOT exposed and calls to them will be HARD-REJECTED. Your job: (1) ${nextToolHint}(2) Call any state mutations consistent with how segment 2 should resolve the iter 1 checkpoint. (3) DO NOT call update_narrative — segment 2 is the next iteration\'s responsibility. (4) DO NOT call update_choices. (5) **Reasoning required**: Before each tool_call, write a one-sentence reasoning in content — why you\'re mutating this state and how it resolves the iter 1 checkpoint. This stage often batches multiple mutations in one response; content reasoning makes each call\'s intent traceable.`
        : `[并行流水线 · 阶段 3 — 合并与改状态 — 严格] 上面两段消息是并行结果：(A) segment 1 叙事含 checkpoint；(B) 只读探索的 tool 调用。注意：消息中的顺序（A 在前 B 在后）反映分支身份，不是时间顺序——两支从相同初始状态同时跑。本轮**暴露的工具**：读类（get_* / search_*）+ mutation 类（update_item / update_npc / update_new_world / update_new_characters / load_predefined_npc / new_npc / send_sms / send_notification）。**update_narrative 与 update_choices 未暴露**，调用会被 runtime **硬拒绝**。任务：(1) ${nextToolHint}(2) 调用与 segment 2 应当如何解决 iter 1 checkpoint 一致的所有状态改动。(3) **禁止调用 update_narrative** —— segment 2 是下一轮的事。(4) **禁止调用 update_choices**。(5) **content 推理要求**：每次 tool_call 前在 content 写一句简短推理——你为什么改这个 state、它如何对应 iter 1 checkpoint 的解决。本阶段经常一次性 batch 多个 mutation 工具，content 推理让每个调用的意图可追溯。`;
    },
  });

  reg.register('react.directive.parallelStage4Resolve', {
    channel: 'react',
    category: 'directive',
    source: 'static-file',
    cacheable: false,
    description: '并行 iter 6：基于 mutated state 写 segment 2，可在同响应内直接调 update_item 落地确定物品事件；checkpoint.type 三选一（none/item_check/hidden_state）',
    origin: { file: 'js/services/ai/react.js', symbol: 'parallel iter6 directive' },
    builder: ctx => {
      const isEn = ctx?.isEn === true;
      return isEn
        ? `[Parallel pipeline · stage 4 — segment 2 — STRICT] State has been updated by iter 5. Tools exposed this iteration: \`update_narrative\` and \`update_item\`. Any other tool will be HARD-REJECTED.

⚠️ **YOU MUST ALWAYS CALL update_narrative** — segment 2 narrative is mandatory. update_item is OPTIONAL (only when segment 2 describes a CERTAIN item/money event). Returning only update_item without update_narrative will leave segment 2 missing and break the turn.

Your task: write segment 2 — resolve the iter 1 checkpoint based on actual state, and continue the scene. Pick ONE of three checkpoint modes:

**Mode A — type="none" (preferred when scene resolves naturally)**
Use when segment 2 reaches a complete, unambiguous endpoint with no further uncertainty needing resolution. Examples: player picks up an item, NPC gives reward, consumption, certain payment that already succeeded in iter 5, player walks away. If the narrative describes any CERTAIN item/money change (pickup, reward, gift, consumption, definite payment, item-name evolution like raw→cooked), call \`update_item\` in the SAME response — directly land the mutation. Set next_tool="" and stop_before="". iter 7 will be SKIPPED.

🔍 **CRITICAL — avoid double-mutation**: Before calling update_item, scan the messages above for prior \`update_item\` tool calls in this turn (especially from iter 5). Only call update_item for **NEW** item events that segment 2 introduces and that have NOT already been executed. Example: if iter 1 declared next_tool="update_item" for "is the player able to pay 5 coins", iter 5 already executed update_item(coin, -5). When you write segment 2 "you handed over 5 coins and received an apple", do NOT re-call update_item(coin, -5) — the deduction is done. Only call update_item(apple, +1) for the new pickup. Re-applying iter 5's mutations causes double-deduction or double-issuance.

**Mode B — type="item_check" (uncertain item judgment)**
Use when segment 2 stops BEFORE a contested item/money event (purchase that might fail, bargain that might be rejected). Set next_tool="update_item". Do NOT call update_item yourself in this response — iter 7 will attempt the mutation and write segment 3 outcome based on the result. Stop the narrative at "you reach for your purse" before the actual transaction.

**Mode C — type="hidden_state" (hidden world fact query)**
Use when segment 2 stops before a question about hidden world facts (who is in the room, NPC stance, faction info, rule lookup). Set next_tool to one of {get_state, search_world, get_rule, get_npc_reaction}. Do NOT call update_item. iter 7 will read + write segment 3.

**next_tool selection rule (Mode B vs Mode C)**: if the uncertainty is "do I have enough X" or "will this trade succeed" → Mode B. If "what is the hidden fact" → Mode C. Don't use Mode C as a deferral mechanism for item events — use Mode A (direct mutate) or Mode B (delegated mutate) for inventory changes.

**Reasoning required**: Before each tool_call, write a one-sentence reasoning in content — why you're picking this mode and (if calling update_item) why the event is certain.`
        : `[并行流水线 · 阶段 4 — segment 2 — 严格] iter 5 已更新状态。本轮**暴露的工具**：\`update_narrative\` 和 \`update_item\`。其他工具调用会被 runtime **硬拒绝**。

⚠️ **必须始终调用 update_narrative** —— segment 2 叙事是强制项。update_item 是**可选项**（仅当 segment 2 描述了**确定**的物品/货币事件时调）。只调 update_item 不调 update_narrative 会导致 segment 2 缺失，回合断裂。

任务：写 segment 2 —— 基于真实状态解决 iter 1 checkpoint，把场景往下推。从 3 种 checkpoint 模式里选**一个**：

**模式 A — type="none"（首选，叙事自然收尾）**
当 segment 2 写到一个完整、明确、无遗留未决的收尾点时使用。例如：玩家拾起物品、NPC 给奖赏、消耗道具、iter 5 已成功的支付、玩家转身离开。若叙事描述了任何**确定**的物品/货币变化（拾取、奖赏、赠送、消耗、确定的支付、名称演化如生肉→烤肉），**在同一响应里调 \`update_item\`** 直接落地。next_tool 填 \`""\`，stop_before 填 \`""\`。iter 7 会被**跳过**。

🔍 **关键 —— 避免重复扣减/重复发放**：调 update_item 前，**先扫上方消息历史**中本回合已经执行过的 \`update_item\` 调用（特别是 iter 5 的）。**只对 segment 2 新引入的、且之前未执行**的物品事件调 update_item。例：iter 1 声明 next_tool="update_item" 让 iter 5 检查"玩家有没有 5 铜板"，iter 5 已调 update_item(铜板, -5)。当你 segment 2 写"你递过 5 铜板，接过一个苹果"时，**不要**再调 update_item(铜板, -5)——钱已经扣过了。只需调 update_item(苹果, +1) 落地新增的物品。重复执行 iter 5 已做过的 mutation 会导致双扣货币 / 双发物品。

**模式 B — type="item_check"（不确定的物品判定）**
当 segment 2 停在一个**未决**的物品/货币事件**之前**时使用（购买可能钱不够、还价可能被拒）。next_tool 填 \`"update_item"\`。**本响应不要自己调 update_item** —— iter 7 会尝试 mutation 并基于结果写 segment 3 outcome。叙事停在"你伸手摸向钱袋"之前，不要写出交易结果。

**模式 C — type="hidden_state"（隐藏世界事实查询）**
当 segment 2 停在一个关于隐藏世界事实的 question 之前时使用（谁在房间里、NPC 立场、势力信息、规则查询）。next_tool 选 \`get_state\` / \`search_world\` / \`get_rule\` / \`get_npc_reaction\` 之一。**不要调 update_item**。iter 7 会读 + 写 segment 3。

**模式 B vs 模式 C 选择规则**：不确定是"我钱够不够 / 这笔交易能不能成"→ 模式 B。不确定是"隐藏的世界事实是什么"→ 模式 C。**不要用模式 C 把物品类事件推后**——物品变更要么模式 A 直接落地，要么模式 B 委托 iter 7。

**content 推理要求**：每个 tool_call 前在 content 写一句简短推理——你选这个模式的理由，以及（若调 update_item）为什么这个事件是确定的。`;
    },
  });

  reg.register('react.directive.parallelStage5Final', {
    channel: 'react',
    category: 'directive',
    source: 'static-file',
    cacheable: false,
    description: '并行 iter 7：执行 iter 6 的 next_tool + 写 segment 3（type 可 none 终止）',
    origin: { file: 'js/services/ai/react.js', symbol: 'parallel iter7 directive' },
    builder: ctx => {
      const isEn = ctx?.isEn === true;
      const nextTool = ctx?.iter6NextTool || '';
      return isEn
        ? `[Parallel pipeline · stage 5 — segment 3 / closing — STRICT, SINGLE RESPONSE] This is ONE LLM call (single response) — there is NO next iteration after this. You have EXACTLY TWO tools exposed: \`${nextTool || '<iter6_next_tool>'}\` and \`update_narrative\`. Any call to a different tool will be HARD-REJECTED. ⚠️ **You MUST return BOTH tool calls in the SAME tool_calls array of this ONE response.** Do NOT call only one and expect another turn — there isn\'t one. Required tool_calls (in this single response): (1) \`${nextTool || '<iter6_next_tool>'}\` to resolve iter 6's checkpoint question; (2) \`update_narrative\` to write segment 3 with checkpoint.type="none" (closes the narrative cascade). If you only call one of these, segment 3 will be missing and the turn will fail.`
        : `[并行流水线 · 阶段 5 — segment 3 / 收尾 — 严格 · 单次响应] 本轮是**单次 LLM 调用**——之后**没有下一轮**。本轮**仅暴露两个工具**：\`${nextTool || '<iter6_next_tool>'}\` 和 \`update_narrative\`。调用任何其他工具会被 runtime **硬拒绝**。⚠️ **你必须在本次响应的同一个 tool_calls 数组里同时返回两个 tool 调用。** 不要只调一个就等下一轮——没有下一轮。本次响应**必须包含**的 tool_calls：(1) \`${nextTool || '<iter6_next_tool>'}\` 解决 iter 6 checkpoint 问题；(2) \`update_narrative\` 写 segment 3 ， checkpoint.type="none"（收尾叙事链）。如果只调一个，segment 3 就会缺失，回合失败。`;
    },
  });

  reg.register('react.directive.parallelStage5Rescue', {
    channel: 'react',
    category: 'directive',
    source: 'static-file',
    cacheable: false,
    description: '并行 iter 7 rescue 模式：iter 6 漏调 update_narrative 时启动，命名强制补写 segment 2 + type=none 闭合',
    origin: { file: 'js/services/ai/react.js', symbol: 'iter7 rescue directive' },
    builder: ctx => {
      const isEn = ctx?.isEn === true;
      return isEn
        ? `[Parallel pipeline · stage 5 — RESCUE — STRICT, SINGLE RESPONSE] ⚠️ The previous iteration (iter 6) was supposed to write segment 2 narrative via \`update_narrative\` but DID NOT — segment 2 is currently MISSING from the player's view, leaving the story stranded at the end of segment 1. This iteration is the rescue slot.

The ONLY tool exposed is \`update_narrative\` (named-force). Any other tool will be HARD-REJECTED. You MUST call update_narrative exactly once.

Required behavior:
1. Write segment 2 NOW based on the actual state (iter 5 mutations have already landed; check messages above for what changed).
2. checkpoint.type MUST be \`"none"\` — type \`item_check\` and \`hidden_state\` are NOT allowed in this rescue stage. The narrative must self-close: write the event through to a complete, unambiguous endpoint with no lingering uncertainty. If you would normally pause at "you reach for your purse", instead narrate the entire transaction outcome based on the actual state.
3. checkpoint.next_tool MUST be \`""\` (empty string), checkpoint.question MUST be \`""\`, checkpoint.stop_before MUST be \`""\`.
4. DO NOT call update_item even if narrative describes item events — system tooling will catch missed item changes via fallback audit.

Why this happened: a previous iteration was given multiple tools (update_narrative + update_item) but only called update_item, skipping the mandatory narrative. This rescue ensures the player still sees segment 2.`
        : `[并行流水线 · 阶段 5 — RESCUE — 严格 · 单次响应] ⚠️ 上一轮 (iter 6) 本应通过 \`update_narrative\` 写 segment 2 叙事但**没有调用** —— segment 2 当前**缺失**，玩家视角下故事卡在 segment 1 末尾。本轮是 rescue 槽位。

本轮**唯一暴露**的工具是 \`update_narrative\`（命名强制）。调任何其他工具会被 runtime **硬拒绝**。你**必须**恰好调一次 update_narrative。

强制要求：
1. **立刻写 segment 2**，基于真实状态（iter 5 的 mutation 已落地，看上方消息知道改了什么）。
2. checkpoint.type **必须**是 \`"none"\` —— \`item_check\` 和 \`hidden_state\` 在 rescue 阶段**不被允许**。叙事必须自我闭合：把事件写到完整、明确、无悬念的收尾点。如果你正常情况下会停在"你伸手摸钱袋"，rescue 模式下要直接基于真实状态写完整笔交易的结果。
3. checkpoint.next_tool 必须是 \`""\`（空字符串），checkpoint.question 必须是 \`""\`，checkpoint.stop_before 必须是 \`""\`。
4. **不要调 update_item**，即便叙事描述了物品事件——系统兜底机制会通过审计 skill 接力补漏的物品变化。

为什么走到这里：上一轮给了你多个工具（update_narrative + update_item），但你只调了 update_item，跳过了强制项 update_narrative。本 rescue 保证玩家仍能看到 segment 2。`;
    },
  });

  reg.register('react.directive.settlementSummaryWrapper', {
    channel: 'react',
    category: 'directive',
    source: 'static-file',
    cacheable: false,
    description: '硬停 force payload 之前注入的结算摘要包装（"[系统结算摘要]\\n..."），让 AI 看到最新状态',
    origin: { file: 'js/services/ai/react.js', symbol: 'settlement summary 注入' },
    builder: ctx => {
      const summaryText = ctx?.summaryText || '<summaryText>';
      return `[系统结算摘要]\n${summaryText}`;
    },
  });

  // expand 工具的 user trigger
  reg.register('expand.triggerMessage', {
    channel: 'expand.worldSetting',
    category: 'directive',
    source: 'static-file',
    cacheable: false,
    excludeFromAssembly: true, // user 触发消息，不进 system prompt
    description: 'Expand 工具（worldSetting + characters 共用）的 user 触发消息',
    origin: { file: 'js/tools/expandTools.js', symbol: '_generateAndExtract user trigger' },
    builder: () => '请直接生成。',
  });

  reg.register('react.format.archiveSearchResult', {
    channel: 'react',
    category: 'messageFormat',
    source: 'static-file',
    cacheable: false,
    description: 'search_history tool 返回给 AI 的搜索结果格式（"[玩家行动] T123: 摘要片段"）',
    origin: { file: 'js/tools/archiveTools.js', symbol: 'search_history result format' },
    builder: ctx => {
      const turnNum = ctx?.turnNum ?? '<turn>';
      const snippet = ctx?.snippet || '<snippet>';
      return `[玩家行动] T${turnNum}: ${snippet}`;
    },
  });

  console.log('[promptRegistry] 已注册 summary/chapterSummary/sms core prompts + react directives (forceUpdateChoices/settlementSummaryWrapper/npc redirects/duplicate guards/dispatcherManaged) + 5 parallel pipeline directives + expand trigger + archive search format');
})();
