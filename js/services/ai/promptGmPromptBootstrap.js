// ============================================
// prompt-gm prompt bootstrap — extracted from prompt-gm.js
// ============================================
// 注册 react.systemBlock.* (6 helpers + 14 placeholders = 20 blocks)
// 三个消费者（浏览器 / build-prompt-index / promptviewer）共享，无 mirror。
//
// 注：6 个 helper builder 通过 ai() = window.aiService lazy 访问。在 headless 时
// window.aiService 不存在，builder 返回空字符串（与原 prompt-gm IIFE 行为一致）。
// ============================================

// ============================================
// promptRegistry 注册：react 通道的关键 system blocks（有独立 helper 的 6 块）
// 注：不是全部 21 块——其它 inline block（systemContext / lastGameState / opening / ooc 等）
// 由 _buildMergedSystemParts 在每次装配后通过 recordSnapshot 写入"实际注入" snapshot。
// 这里预注册的 6 块让 Prompt Inspector "可能注入" 模式有内容显示。
// ============================================
(function bootstrapReactSystemBlocks() {
  if (!window.promptRegistry) {
    console.warn('[promptRegistry] react bootstrap 失败：promptRegistry 未加载');
    return;
  }
  const reg = window.promptRegistry;
  const ai = () => window.aiService;

  reg.register('react.systemBlock.predefinedNpcList', {
    channel: 'react',
    category: 'systemBlock',
    source: 'dynamic-runtime',
    cacheable: true,
    description: '预定义 NPC 名单（候选 load_predefined_npc）',
    conditionDesc: 'npcStore 池非空',
    origin: { file: 'js/services/aiService.js', symbol: '_buildPredefinedNpcListText' },
    relatedTools: ['load_predefined_npc'],
    builder: () => ai()?._buildPredefinedNpcListText?.() || '',
  });

  reg.register('react.systemBlock.ruleModulePreview', {
    channel: 'react',
    category: 'systemBlock',
    source: 'dynamic-runtime',
    cacheable: true,
    description: '规则模块速览（archiveTools 候选清单）',
    conditionDesc: 'archiveTools 可用',
    origin: { file: 'js/services/aiService.js', symbol: '_buildRuleModulePreviewSystemText' },
    relatedTools: ['get_rule'],
    builder: () => ai()?._buildRuleModulePreviewSystemText?.() || '',
  });

  reg.register('react.systemBlock.mapContext', {
    channel: 'react',
    category: 'context',
    source: 'dynamic-runtime',
    cacheable: false,
    description: '地图上下文（玩家位置 + 相邻地形 + 地标）',
    conditionDesc: 'mapService 可用',
    origin: { file: 'js/services/aiService.js', symbol: '_buildMapContextSystemText' },
    builder: () => ai()?._buildMapContextSystemText?.() || '',
  });

  reg.register('react.systemBlock.playerInventory', {
    channel: 'react',
    category: 'context',
    source: 'dynamic-runtime',
    cacheable: false,
    description: '玩家物品栏（含 active / tombstone / pending + update_item 调用规则）',
    conditionDesc: 'inventoryStore 可用',
    origin: { file: 'js/services/aiService.js', symbol: '_buildInventorySystemText' },
    relatedTools: ['update_item'],
    builder: () => ai()?._buildInventorySystemText?.() || '',
  });

  reg.register('react.systemBlock.playerActionClassification', {
    channel: 'react',
    category: 'directive',
    source: 'dynamic-runtime',
    cacheable: false,
    description: '玩家行动分类引导（让 AI 在叙事中按类型处理玩家输入）',
    conditionDesc: '有待处理玩家行动上下文',
    origin: { file: 'js/services/aiService.js', symbol: '_buildActionContextSystemText' },
    builder: () => ai()?._buildActionContextSystemText?.() || '',
  });

  // ── 占位注册：剩余 ~15 块 inline blocks（无独立 helper，builder 返回占位描述）
  // UI "实际注入" 模式仍能从 _buildMergedSystemParts 的 recordSnapshot 看到完整文本
  // 这里只为 "可能注入" 模式提供元数据展示
  const placeholder = (label) => `(本 block 由 _buildMergedSystemParts 在装配时 inline 构造；真实文本请切到"实际注入"模式查看 last snapshot。说明：${label})`;

  reg.register('react.systemBlock.coreComposite', {
    channel: 'react', category: 'core', source: 'static-file', cacheable: true,
    description: 'CORE_PROMPT_MERGED + worldcard core_world_mechanics + narrative_base 的合并块（SECTION A 起点）',
    conditionDesc: 'always',
    origin: { file: 'prompts/[Fixed]core_prompt.js + js/services/ai/prompt-gm.js' },
    builder: () => placeholder('全局 CORE_PROMPT_MERGED + 当前世界卡 core_world_mechanics + narrative_base 三段合并'),
  });

  reg.register('react.systemBlock.narrativeLength', {
    channel: 'react', category: 'directive', source: 'static-file', cacheable: true,
    description: '叙事篇幅档位变体（短/中/长）— 由 narrativeLength 配置切换',
    conditionDesc: 'narrativeLengthVariants 配置存在',
    origin: { file: 'js/services/ai/prompt-gm.js', symbol: 'NARRATIVE_LENGTH_VARIANTS' },
    builder: () => placeholder('当前 narrativeLength 配置对应的 variant.section 文案'),
  });

  reg.register('react.systemBlock.eraConstraint', {
    channel: 'react', category: 'context', source: 'world-card', cacheable: true,
    description: '纪年约束（世界卡 timeTerms：era / calendar units / time precision）',
    conditionDesc: 'always（worldMeta 总有时间术语）',
    origin: { file: 'js/services/ai/prompt-gm.js', symbol: '_buildWorldLevelDynamicBlocks' },
    builder: () => placeholder('世界卡 timeTerms 派生的纪年约束 prompt'),
  });

  reg.register('react.systemBlock.currencyConstraint', {
    channel: 'react', category: 'context', source: 'world-card', cacheable: true,
    description: '货币约束（世界卡 currencyTerms：currencyLabel / currencyShort）',
    conditionDesc: 'currencyTerms 存在',
    origin: { file: 'js/services/ai/prompt-gm.js', symbol: '_buildWorldLevelDynamicBlocks' },
    builder: () => placeholder('世界卡 currency_name 派生的货币约束（含 update_item 提示）'),
  });

  reg.register('react.systemBlock.systemContext', {
    channel: 'react', category: 'context', source: 'dynamic-runtime', cacheable: false,
    description: '剧情总结 + NPC 档案 JSON（每轮最易变的核心上下文）',
    conditionDesc: '参数 systemContext 非空',
    origin: { file: 'js/services/ai/prompt-gm.js', symbol: '_buildVolatileSystemBlocks' },
    builder: () => placeholder('summaryService 总结 + npcStore.character_database JSON'),
  });

  reg.register('react.systemBlock.lastGameState', {
    channel: 'react', category: 'context', source: 'dynamic-runtime', cacheable: false,
    description: '上一轮游戏状态快照（panel_status / panel_npc 等）',
    conditionDesc: '参数 lastGameState 非空（非首回合）',
    origin: { file: 'js/services/ai/prompt-gm.js', symbol: '_buildVolatileSystemBlocks' },
    builder: () => placeholder('上一回合 buildTurnResult() 派生的状态快照'),
  });

  reg.register('react.systemBlock.openingDirective', {
    channel: 'react', category: 'directive', source: 'dynamic-runtime', cacheable: false,
    description: '开场引导 directive（由 OpeningController.resolve 生成）',
    conditionDesc: 'Turn 1（首回合）',
    origin: { file: 'js/services/openingController.js', symbol: 'OpeningController.resolve' },
    builder: () => placeholder('Turn 1 OpeningController 决议产物（mode/event/initRules 三选一）'),
  });

  reg.register('react.systemBlock.openingFallback', {
    channel: 'react', category: 'directive', source: 'world-card', cacheable: false,
    description: '开场引导 fallback（OpeningController 缺失时读 worldMeta.getRuleModule("init")）',
    conditionDesc: 'Turn 1 且 OpeningController 不可用',
    origin: { file: 'js/services/ai/prompt-gm.js' },
    builder: () => placeholder('worldMeta.getRuleModule("init") 文本'),
  });

  reg.register('react.systemBlock.openingTimeContext', {
    channel: 'react', category: 'context', source: 'dynamic-runtime', cacheable: false,
    description: '开场时间上下文（random / recommended 模式时注入）',
    conditionDesc: 'Turn 1 且 mode in [random, recommended]',
    origin: { file: 'js/services/aiService.js', symbol: '_buildOpeningTimePromptText' },
    builder: () => ai()?._buildOpeningTimePromptText?.() || placeholder('随机/推荐开局的时间锚点'),
  });

  reg.register('react.systemBlock.smsInjection', {
    channel: 'react', category: 'context', source: 'dynamic-runtime', cacheable: false,
    description: '短信注入（玩家收到的新短信，让 AI 知道玩家收到了什么）',
    conditionDesc: 'smsService 有未读消息',
    origin: { file: 'js/services/ai/prompt-gm.js', symbol: '_formatSmsForInjection' },
    builder: () => placeholder('smsService 派生的最近短信摘要'),
  });

  reg.register('react.systemBlock.npcReactions', {
    channel: 'react', category: 'context', source: 'dynamic-runtime', cacheable: false,
    description: 'NPC 自主反应（Phase 1 NPC subagent 决策结果，结构化注入主 ReAct）',
    conditionDesc: 'npcReactions 数组非空',
    origin: { file: 'js/services/ai/prompt-gm.js', symbol: '_buildVolatileSystemBlocks' },
    builder: () => placeholder('Phase 1 NPC reactions 的结构化构造（行动/位置/情绪）'),
  });

  reg.register('react.systemBlock.gmDirective', {
    channel: 'react', category: 'directive', source: 'dynamic-runtime', cacheable: false,
    description: 'GM CodeEngine 生成的本回合写作指导',
    conditionDesc: '参数 gmDirective 非空',
    origin: { file: 'js/services/gmCodeEngine.js' },
    builder: () => placeholder('GMCodeEngine.generateDirective() 产物（事件触发、写作建议等）'),
  });

  reg.register('react.systemBlock.customSystemPrompt', {
    channel: 'react', category: 'directive', source: 'static-file', cacheable: false,
    description: '用户自定义 system prompt（设置中可填，会附加到末尾）',
    conditionDesc: 'requestConfig.customSystemPrompt 非空',
    origin: { file: 'js/services/ai/prompt-gm.js' },
    builder: () => placeholder('用户在设置中填写的 customSystemPrompt'),
  });

  reg.register('react.systemBlock.ooc', {
    channel: 'react', category: 'directive', source: 'dynamic-runtime', cacheable: false,
    description: 'OOC 玩家级指令（最末位 = 最高优先级，覆盖前述所有规则）',
    conditionDesc: 'getPendingOoc().normalized 非空',
    origin: { file: 'js/services/ai/prompt-gm.js' },
    relatedTools: [],
    order: 1000, // 强制末位
    builder: () => placeholder('OOC 子 agent 规范化后的玩家级指令'),
  });

  console.log('[promptRegistry] 已注册 react.systemBlock.* (6 with helpers + 14 placeholders = 20 blocks)');
})();
