// ============================================
// Archive Tools — 档案查询类工具（动态注册）
// ============================================
// search_world, get_rule
// 依赖世界卡数据，每次 API 请求前通过 refreshArchiveTools() 动态注册/更新
// ============================================

/**
 * 文本截断
 */
function _truncateArchiveToolText(text, maxLength = 1200) {
  if (typeof text !== 'string') return '';
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength - 5) + '其余略。';
}

/**
 * 文本规范化
 */
function _normalizeArchiveToolText(text, maxLength = 120) {
  if (typeof text !== 'string') return '';
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (!normalized) return '';
  if (normalized.length <= maxLength) return normalized;
  return normalized.slice(0, maxLength - 1) + '…';
}

/**
 * 刷新档案类工具的动态注册
 * 根据当前世界卡状态注册/更新 archive 工具到 toolRegistry
 * 应在每次 API 请求前调用
 */
function refreshArchiveTools() {
  const registry = window.toolRegistry;
  if (!registry) return;

  const arch = typeof archiveService !== 'undefined' ? archiveService : null;
  if (!arch) return;

  // 清除上一次的动态注册（toolRegistry + promptRegistry）
  registry.unregisterBySource('archive');
  if (window.promptRegistry) {
    window.promptRegistry.unregisterByPrefix('tool.search_world.');
    window.promptRegistry.unregisterByPrefix('tool.get_rule.');
  }

  // 双写 helper：promptRegistry + toolRegistry
  const register =
    window.registerToolWithPrompt || ((name, cfg) => registry.register(name, cfg));

  // ── 1. search_world — 全局跨数据源搜索 ──

  register('search_world', {
    phase: null,
    required: false,
    trigger: null,
    triggerHint: null,
    signal: null,
    description:
      '跨所有数据源全局搜索——NPC档案、地点设定、时间线事件、规则模块、历史剧情原文。输入关键词，返回所有匹配的摘要。',
    when_to_call:
      '不确定信息在哪里时；需要发现相关NPC、地点或事件时；开始新场景需要了解背景时。先 search_world 再用 get_npc_card/get_rule 精读。',
    avoid_when:
      '已经知道具体NPC ID或规则模块ID时，直接用 get_npc_card/get_rule 更高效。',
    input_focus:
      'query 是搜索关键词，如人物名、地点名、事件描述。越具体越好。',
    expected_output:
      '按数据源分组的搜索结果摘要，标注来源类型（NPC/地点/时间线/规则/剧情/玩家行动）。如需精读某回合原文，用 get_raw_narrative。',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: '搜索关键词，如"失窃货物"、"铁匠"、"桥梁修缮"',
        },
      },
      required: ['query'],
    },
    execute(args) {
      // 类型防御：LLM 偶尔传 number/object 导致 .toLowerCase() 崩
      const rawQuery = args && args.query;
      const query = (typeof rawQuery === 'string' ? rawQuery : '').trim().toLowerCase();
      if (!query) return '[错误] 请提供搜索关键词';

      // 每次执行都读最新 entityStore（登场世界扩展后实时可搜）
      const entityIds = window.entityStore?.list?.() || [];

      const results = [];

      // 搜索 NPC 档案
      const npcStore = window.npcStore;
      if (npcStore) {
        // 防御方法不存在的情况 (压缩后报 _HEX[_HEX(...)] is not a function 那条 bug 就是这里)
        const allNpcs = (typeof npcStore.getAllMap === 'function' ? npcStore.getAllMap() : null) || {};
        for (const [npcId, npc] of Object.entries(allNpcs)) {
          const searchText = JSON.stringify(npc).toLowerCase();
          if (searchText.includes(query)) {
            const name = npc.name || npcId;
            const role = npc.role || npc.title || '';
            const site = npc.default_site || npc.location || '';
            results.push(`[NPC] ${name} (${npcId}) — ${role}${site ? '，常在' + site : ''}`);
          }
        }
      }

      // 搜索地点/世界实体
      for (const entityId of entityIds) {
        // 同上, 方法存在性守卫——同函数里别处的 _getTimelineEvents/getPromptModuleDirect 都用了 ?.()
        const fullText = (typeof arch.getWorldEntity === 'function' ? arch.getWorldEntity(entityId) : '') || '';
        if (fullText && fullText.toLowerCase().includes(query)) {
          // 取前80字作为摘要
          const snippet = fullText.replace(/\s+/g, ' ').trim().slice(0, 80);
          results.push(`[地点] ${entityId} — ${snippet}…`);
        }
      }

      // 搜索时间线事件
      const timelineEvents = arch._getTimelineEvents?.() || [];
      for (const event of timelineEvents) {
        const eventText = JSON.stringify(event).toLowerCase();
        if (eventText.includes(query)) {
          const time = event.time || event.time_str || '';
          const content = (event.content || event.description || '').slice(0, 60);
          const rawChars = event.characters;
          const chars = (Array.isArray(rawChars) ? rawChars : typeof rawChars === 'string' ? rawChars.split(/[、,，]/) : []).join('、');
          results.push(`[时间线] ${time} — ${content}${chars ? '（相关人物：' + chars + '）' : ''}`);
        }
      }

      // 搜索规则模块
      const moduleIds = window.worldMeta?.listRuleModules?.() || [];
      for (const moduleId of moduleIds) {
        const moduleText = arch.getPromptModuleDirect?.(moduleId) || '';
        if (moduleText.toLowerCase().includes(query)) {
          const snippet = moduleText.replace(/\s+/g, ' ').trim().slice(0, 60);
          results.push(`[规则] ${moduleId} — ${snippet}…`);
        }
      }

      // 搜索传闻（时间线候选事件）
      const gm = window.gmCodeEngine;
      if (gm) {
        try {
          const ts = typeof timelineService !== 'undefined' ? timelineService : null;
          const currentTime = ts?.getCurrentDate?.() || null;
          const candidates = gm._getTimelineCandidates?.(currentTime, null) || [];
          for (const c of candidates) {
            const clueText = gm._buildClueText?.(c.event) || '';
            if (clueText.toLowerCase().includes(query)) {
              results.push(`[传闻] ${clueText.slice(0, 80)}`);
            }
          }
        } catch (e) {
          // 传闻搜索失败不影响其他结果
        }
      }

      // 搜索历史剧情原文（chatHistory）
      if (typeof chatHistory !== 'undefined' && Array.isArray(chatHistory)) {
        const _parseTurn = typeof parseTurnFromUID === 'function' ? parseTurnFromUID : null;

        for (let i = 0; i < chatHistory.length; i++) {
          const msg = chatHistory[i];
          if (!msg || !msg.text) continue;
          if (msg.isError || msg.isCancelled) continue;

          const lowerText = msg.text.toLowerCase();
          if (!lowerText.includes(query)) continue;

          if (msg.sender === 'ai') {
            // AI 消息：从 uid 提取回合号
            if (!msg.uid || !_parseTurn) continue;
            const turnNum = _parseTurn(msg.uid);
            if (turnNum === null || turnNum === 0) continue;

            const matchIdx = lowerText.indexOf(query);
            const start = Math.max(0, matchIdx - 30);
            const end = Math.min(msg.text.length, matchIdx + query.length + 50);
            let snippet = msg.text.slice(start, end).replace(/\s+/g, ' ');
            if (start > 0) snippet = '…' + snippet;
            if (end < msg.text.length) snippet = snippet + '…';
            results.push(`[剧情] T${turnNum}: ${snippet}`);

          } else if (msg.sender === 'user') {
            // User 消息：往后找最近的 AI 消息确定回合号
            if (!_parseTurn) continue;
            let turnNum = null;
            for (let j = i + 1; j < chatHistory.length; j++) {
              const next = chatHistory[j];
              if (next && next.sender === 'ai' && next.uid) {
                turnNum = _parseTurn(next.uid);
                break;
              }
            }
            if (turnNum === null || turnNum === 0) continue;

            const matchIdx = lowerText.indexOf(query);
            const start = Math.max(0, matchIdx - 30);
            const end = Math.min(msg.text.length, matchIdx + query.length + 50);
            let snippet = msg.text.slice(start, end).replace(/\s+/g, ' ');
            if (start > 0) snippet = '…' + snippet;
            if (end < msg.text.length) snippet = snippet + '…';
            results.push(
              window.promptRegistry
                .get('react.format.archiveSearchResult')
                .builder({ turnNum, snippet })
            );
          }
        }
      }

      if (results.length === 0) {
        return `[无结果] 未找到与 "${query}" 相关的内容`;
      }

      console.log(`[search_world] "${query}": ${results.length} 条结果`);
      return results.join('\n');
    },
    source: 'archive',
  });

  // ── 2. get_rule — 获取规则模块 ──
  // 模块速览和调用建议由 system 动态块注入（见 aiService._buildRuleModulePreviewText），
  // tool description 保持稳定以利 prompt caching

  const allModuleIds = window.worldMeta?.listRuleModules?.() || [];
  const callableModuleIds = allModuleIds.filter(
    id => typeof id === 'string' && id && id !== 'core_world_mechanics' && id !== 'narrative_base'
  );
  const uniqueModuleIds = Array.from(new Set(callableModuleIds));

  const moduleIdProperty = {
    type: 'string',
    description: uniqueModuleIds.length > 0
      ? '规则模块 ID（可用模块速览与调用建议见 system 动态块）。'
      : '当前无可用规则模块。',
  };
  if (uniqueModuleIds.length > 0) {
    moduleIdProperty.enum = uniqueModuleIds;
  }

  register('get_rule', {
    phase: null,
    required: false,
    trigger: null,
    triggerHint: null,
    signal: null,
    description: '获取当前世界的规则模块全文。',
    when_to_call:
      '叙事涉及世界规则系统时——经济交易需要定价规则、时间推进需要时间协议、NPC生成需要角色规则等。',
    avoid_when:
      '纯社交对话或叙事推进不涉及规则机制时；刚查询过同一模块且内容未变时。',
    input_focus:
      'module_id 从 enum 中选择；各模块用途和调用建议见 system 动态块的"规则模块速览"。',
    expected_output:
      '规则模块的完整文本内容。',
    parameters: {
      type: 'object',
      properties: {
        module_id: moduleIdProperty,
      },
      required: ['module_id'],
    },
    execute(args) {
      const available = arch._listCallableRuleModules();
      if (!available.includes(args.module_id)) {
        const availableText = available.length > 0 ? available.join(', ') : '无';
        return `[数据不可用] 规则模块不可用: ${args.module_id}；可用模块: ${availableText}`;
      }
      return arch.getPromptModuleDirect(args.module_id);
    },
    source: 'archive',
  });

  console.log(`[archiveTools] 已刷新: search_world + get_rule (${uniqueModuleIds.length} 个可用模块)`);
}

/**
 * 构建规则模块速览 + 调用建议文本（供 system 动态块使用）
 * 从 worldMeta.getPromptConfig().module_meta 提取
 * @returns {string|null} 格式化文本，无可用模块返回 null
 */
function _buildRuleModulePreviewText() {
  const allModuleIds = window.worldMeta?.listRuleModules?.() || [];
  const callableModuleIds = allModuleIds.filter(
    id => typeof id === 'string' && id && id !== 'core_world_mechanics' && id !== 'narrative_base'
  );
  const uniqueModuleIds = Array.from(new Set(callableModuleIds));
  if (uniqueModuleIds.length === 0) return null;

  const promptConfig = window.worldMeta?.getPromptConfig?.();
  const moduleMetaMap =
    promptConfig?.module_meta && typeof promptConfig.module_meta === 'object'
      ? promptConfig.module_meta
      : {};

  const previewLimit = 10;
  const guidanceLimit = 8;
  const preview = [];
  const guidance = [];

  for (let i = 0; i < uniqueModuleIds.length; i++) {
    const moduleId = uniqueModuleIds[i];
    const meta =
      moduleMetaMap[moduleId] && typeof moduleMetaMap[moduleId] === 'object'
        ? moduleMetaMap[moduleId]
        : {};
    if (i < previewLimit) {
      const desc = _normalizeArchiveToolText(meta.description, 36) || '未提供用途说明';
      preview.push(`${moduleId} -> ${desc}`);
    }
    if (i < guidanceLimit) {
      const whenToCall =
        _normalizeArchiveToolText(meta.when_to_call, 48) || '按该模块主题相关需求调用';
      const avoidWhen = _normalizeArchiveToolText(meta.avoid_when, 36);
      guidance.push(
        avoidWhen
          ? `${moduleId}: ${whenToCall}（避免：${avoidWhen}）`
          : `${moduleId}: ${whenToCall}`
      );
    }
  }

  if (uniqueModuleIds.length > previewLimit) {
    preview.push(`其余 ${uniqueModuleIds.length - previewLimit} 个模块略`);
  }
  if (uniqueModuleIds.length > guidanceLimit) {
    guidance.push(`其余 ${uniqueModuleIds.length - guidanceLimit} 个模块略`);
  }

  const parts = [];
  if (preview.length > 0) parts.push(`模块速览（ID -> 用途）：${preview.join('；')}`);
  if (guidance.length > 0) parts.push(`调用建议：${guidance.join('；')}`);
  return parts.length > 0 ? parts.join('\n') : null;
}

// 暴露到全局供 aiService 调用
window.refreshArchiveTools = refreshArchiveTools;
window._buildRuleModulePreviewText = _buildRuleModulePreviewText;
