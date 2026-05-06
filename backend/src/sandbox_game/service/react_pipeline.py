from __future__ import annotations

import json
import re
from typing import Any, Optional

from pydantic import BaseModel, Field

from sandbox_game.model.llm import (
    GameTurnData,
    GenerateTurnRequest,
    GenerateTurnResponse,
    OocStageResult,
    PanelStatusUpdate,
    TurnChoice,
)
from sandbox_game.model.save import GameSave
from sandbox_game.model.world_card import WorldCard
from sandbox_game.service.llm.service import LlmService
from sandbox_game.service.prompts import PromptService
from sandbox_game.service.react_tools import (
    GetRawNarrativeInput,
    GetNpcCardInput,
    GetNpcReactionInput,
    GetRuleInput,
    GetSmsHistoryInput,
    GetStorySummaryInput,
    LoadPredefinedNpcInput,
    NewNpcInput,
    ReactToolContext,
    SendNotificationInput,
    SendSmsInput,
    SearchWorldInput,
    ToolValidationError,
    UpdateNpcInput,
    UpdateItemInput,
    tool_result_json,
)


class ChoicesStageOutput(BaseModel):
    choices: list[TurnChoice] = Field(
        ...,
        min_length=1,
        max_length=3,
    )


class NpcDecision(BaseModel):
    action: str = Field(
        ...,
    )
    location: Optional[str] = Field(
        default=None,
    )
    social_target: Optional[str] = Field(
        default=None,
    )
    mood: Optional[str] = Field(
        default=None,
    )
    inner_thought: Optional[str] = Field(
        default=None,
    )


class EffectsStageOutput(BaseModel):
    done: bool = Field(
        default=True,
    )
    notes: list[str] = Field(
        default_factory=list,
        max_length=10,
    )


class ReactPipelineService:
    OOC_PATTERN = re.compile(r'【([^】\n]{1,300})】|\[([^\]\n]{1,300})\]')

    def __init__(self,
                 llm_service: LlmService | None = None,
                 prompts: PromptService | None = None,
                 ):
        self._prompts = prompts or PromptService('zh_cn')
        self._llm = llm_service or LlmService(self._prompts)

    async def run(self,
                  request: GenerateTurnRequest,
                  world_card: WorldCard | None,
                  save: GameSave | None,
                  api_key: str,
                  ) -> GenerateTurnResponse:
        from pydantic_ai import Agent

        tool_context = ReactToolContext(
            world_card=world_card,
            save=save,
            collected_data=request.collected_data,
        )
        ooc_result = await self._run_ooc_if_needed(request, api_key)
        if ooc_result and ooc_result.mode == 'ask':
            question = ooc_result.question or '你想让我按这个方向调整本轮写法吗？'
            return GenerateTurnResponse(
                text=question,
                data=GameTurnData(
                    narrative=question,
                    choices=[
                        TurnChoice(
                            id='A',
                            text='回答澄清问题',
                            type='talk',
                            time_effect='low',
                        )
                    ],
                ),
                model=request.llm.model,
                provider=request.llm.provider,
                ooc=ooc_result,
            )

        npc_reactions = await self._run_npc_reactions(request, world_card, save, api_key)
        narrative = await self._run_narrative_stage(
            request=request,
            world_card=world_card,
            save=save,
            api_key=api_key,
            tool_context=tool_context,
            ooc_directive=ooc_result.directive if ooc_result and ooc_result.mode == 'commit' else None,
            npc_reactions=npc_reactions,
        )
        await self._run_effects_stage(
            request=request,
            narrative=narrative,
            save=save,
            api_key=api_key,
            tool_context=tool_context,
        )
        settlement = await self._run_settlement_stage(
            request=request,
            narrative=narrative,
            save=save,
            api_key=api_key,
            tool_context=tool_context,
        )
        choices = await self._run_choices_stage(
            request=request,
            narrative=narrative,
            settlement=settlement,
            save=save,
            api_key=api_key,
            tool_context=tool_context,
        )

        side_effects = tool_context.tool_side_effects()
        data = GameTurnData(
            narrative=narrative,
            choices=choices,
            panel_status=settlement,
            npc_updates=tool_context.npc_updates,
            inventory_changes=tool_context.inventory_changes,
            timeline_events=[],
        )
        for message in side_effects['sms_messages']:
            data.timeline_events.append({
                'type': 'sms',
                'content': message,
            })
        for notification in side_effects['notifications']:
            data.timeline_events.append({
                'type': 'notification',
                'content': notification,
            })
        if npc_reactions:
            data.timeline_events.append({
                'type': 'npc_reactions',
                'content': npc_reactions,
            })

        return GenerateTurnResponse(
            text=narrative,
            data=data,
            model=request.llm.model,
            provider=request.llm.provider,
            ooc=ooc_result,
        )

    async def _run_ooc_if_needed(self,
                                 request: GenerateTurnRequest,
                                 api_key: str,
                                 ) -> OocStageResult | None:
        candidates = request.ooc_candidates or self.extract_ooc_candidates(request.message)
        if not candidates:
            return None

        from pydantic_ai import Agent

        is_round_2 = request.ooc_answer is not None
        agent = Agent(
            self._llm._build_model(request.llm, api_key),
            instructions=self._prompts.ooc_round2() if is_round_2 else self._prompts.ooc_round1(),
            output_type=OocStageResult,
        )
        prompt = {
            'candidates': candidates,
            'previous_question': request.ooc_question,
            'player_answer': request.ooc_answer,
        }
        result = await agent.run(json.dumps(prompt, ensure_ascii=False))
        output = result.output
        if is_round_2 and output.mode == 'ask':
            return OocStageResult(mode='continue')
        return output

    async def _run_npc_reactions(self,
                                 request: GenerateTurnRequest,
                                 world_card: WorldCard | None,
                                 save: GameSave | None,
                                 api_key: str,
                                 ) -> list[dict[str, Any]]:
        selected = request.collected_data.get('selected_npcs') or []
        if not isinstance(selected, list) or not selected:
            return []

        from pydantic_ai import Agent

        reactions = []
        tool_context = ReactToolContext(world_card, save, request.collected_data)
        for npc in selected[:8]:
            if not isinstance(npc, dict):
                continue
            npc_id = str(npc.get('id') or npc.get('name') or '').strip()
            if not npc_id:
                continue
            card = tool_context.get_npc_card(GetNpcCardInput(npc_id=npc_id))
            if not card.ok:
                continue
            agent = Agent(
                self._llm._build_model(request.llm, api_key),
                instructions=self._prompts.npc_reaction(),
                output_type=NpcDecision,
            )
            prompt = {
                'npc': card.data.get('npc'),
                'player_message': request.message,
                'state': tool_context.get_state().data,
                'recent_history': [item.model_dump(mode='json') for item in request.history[-8:]],
            }
            result = await agent.run(json.dumps(prompt, ensure_ascii=False, default=str))
            reactions.append({
                'npc_id': npc_id,
                'name': npc.get('name') or npc_id,
                'decision': result.output.model_dump(mode='json'),
            })
        return reactions

    async def _run_narrative_stage(self,
                                   request: GenerateTurnRequest,
                                   world_card: WorldCard | None,
                                   save: GameSave | None,
                                   api_key: str,
                                   tool_context: ReactToolContext,
                                   ooc_directive: str | None,
                                   npc_reactions: list[dict[str, Any]],
                                   ) -> str:
        from pydantic_ai import Agent

        agent = Agent(
            self._llm._build_model(request.llm, api_key),
            instructions=self._build_narrative_instructions(request, world_card, save, ooc_directive),
            output_type=str,
        )

        self._register_narrative_tools(agent, tool_context)

        prompt = {
            'player_message': request.message,
            'history': [item.model_dump(mode='json') for item in request.history[-16:]],
            'collected_data': request.collected_data,
            'npc_reactions': npc_reactions,
            'state': tool_context.get_state().data,
            'available_tools': self._narrative_tool_list(tool_context),
        }
        try:
            result = await agent.run(json.dumps(prompt, ensure_ascii=False, default=str))
        except ToolValidationError as e:
            raise ValueError(f'Invalid tool call: {e}') from e
        return str(result.output).strip()

    async def _run_effects_stage(self,
                                 request: GenerateTurnRequest,
                                 narrative: str,
                                 save: GameSave | None,
                                 api_key: str,
                                 tool_context: ReactToolContext,
                                 ) -> EffectsStageOutput:
        from pydantic_ai import Agent

        agent = Agent(
            self._llm._build_model(request.llm, api_key),
            instructions=self._prompts.react_effects(),
            output_type=EffectsStageOutput,
        )
        self._register_effect_tools(agent, tool_context)
        prompt = {
            'player_message': request.message,
            'narrative': narrative,
            'state': tool_context.get_state().data,
            'active_npc_ids': tool_context.active_npc_ids(),
            'save': self._compact_save_for_effects(save),
            'available_tools': [
                tool for tool in [
                'update_item',
                'send_sms',
                'send_notification',
                'update_npc' if tool_context.active_npc_ids() else None,
                ]
                if tool
            ],
        }
        try:
            result = await agent.run(json.dumps(prompt, ensure_ascii=False, default=str))
        except ToolValidationError as e:
            raise ValueError(f'Invalid effect tool call: {e}') from e
        return result.output

    async def _run_settlement_stage(self,
                                    request: GenerateTurnRequest,
                                    narrative: str,
                                    save: GameSave | None,
                                    api_key: str,
                                    tool_context: ReactToolContext,
                                    ) -> PanelStatusUpdate | None:
        from pydantic_ai import Agent

        agent = Agent(
            self._llm._build_model(request.llm, api_key),
            instructions=self._prompts.react_settlement(),
            output_type=PanelStatusUpdate,
        )
        prompt = {
            'player_message': request.message,
            'narrative': narrative,
            'state': tool_context.get_state().data,
            'tool_side_effects': tool_context.tool_side_effects(),
            'save': save.model_dump(mode='json') if save else None,
        }
        result = await agent.run(json.dumps(prompt, ensure_ascii=False, default=str))
        return tool_context.build_panel_update(result.output)

    async def _run_choices_stage(self,
                                 request: GenerateTurnRequest,
                                 narrative: str,
                                 settlement: PanelStatusUpdate | None,
                                 save: GameSave | None,
                                 api_key: str,
                                 tool_context: ReactToolContext,
                                 ) -> list[TurnChoice]:
        from pydantic_ai import Agent

        agent = Agent(
            self._llm._build_model(request.llm, api_key),
            instructions=self._prompts.react_choices(),
            output_type=ChoicesStageOutput,
        )
        prompt = {
            'player_message': request.message,
            'narrative': narrative,
            'settlement': settlement.model_dump(mode='json') if settlement else None,
            'state': tool_context.get_state().data,
            'save': save.model_dump(mode='json') if save else None,
        }
        result = await agent.run(json.dumps(prompt, ensure_ascii=False, default=str))
        return tool_context.build_choices(result.output.choices)

    def _build_narrative_instructions(self,
                                      request: GenerateTurnRequest,
                                      world_card: WorldCard | None,
                                      save: GameSave | None,
                                      ooc_directive: str | None,
                                      ) -> str:
        parts = [self._prompts.react_narrative()]
        if world_card:
            snapshot = world_card.snapshot.model_dump(mode='json', by_alias=True)
            prompt_modules = snapshot.get('prompt_modules') or {}
            modules = prompt_modules.get('modules') or {}
            for key in self._select_narrative_modules(request, modules):
                value = modules.get(key)
                if isinstance(value, str) and value.strip():
                    parts.append(f'## {key}\n{value.strip()}')
        if save:
            parts.append('## 当前存档摘要\n' + json.dumps({
                'location': self._dump(save.location),
                'game_time': self._dump(save.game_time),
                'player_state': self._dump(save.player_state_data),
                'inventory': self._dump(save.inventory_data),
            }, ensure_ascii=False, default=str))
        if ooc_directive:
            parts.append('## 本轮玩家写作准则（最高优先级）\n' + ooc_directive)
        return '\n\n'.join(parts)

    def _select_narrative_modules(self,
                                  request: GenerateTurnRequest,
                                  modules: dict[str, Any],
                                  ) -> list[str]:
        selected = ['core_world_mechanics', 'narrative_base']
        text = request.message or ''
        collected = request.collected_data or {}

        module_triggers = {
            'time_protocol': ('等', '等待', '睡', '休息', '旅行', '赶路', '闭关', '几天', '明天', '今晚', '时间'),
            'economy': ('买', '卖', '交易', '付', '钱', '货币', '金币', '银币', '灵石', '算力', '物品', '道具', '背包'),
            'npc_gen': ('见', '找', '问', '说', '谈', '短信', '电话', '消息', '陌生人', '守卫', '商人', '角色'),
            'init': ('开始', '开场', '随机开始', '推荐剧情', '时间', '地点'),
        }
        for module_id, keywords in module_triggers.items():
            if module_id in modules and any(keyword in text for keyword in keywords):
                selected.append(module_id)

        if collected.get('selected_npcs') and 'npc_gen' in modules:
            selected.append('npc_gen')
        if collected.get('opening') and 'init' in modules:
            selected.append('init')

        result = []
        seen = set()
        for module_id in selected:
            if module_id in modules and module_id not in seen:
                seen.add(module_id)
                result.append(module_id)
        return result

    def _register_narrative_tools(self,
                                  agent: Any,
                                  tool_context: ReactToolContext,
                                  ):
        @agent.tool_plain
        def get_state() -> str:
            return tool_result_json(tool_context.get_state())

        @agent.tool_plain
        def get_story_summary(depth: str = 'recent',
                              from_turn: int | None = None,
                              to_turn: int | None = None,
                              ) -> str:
            args = GetStorySummaryInput(
                depth=depth,
                from_turn=from_turn,
                to_turn=to_turn,
            )
            return tool_result_json(tool_context.get_story_summary(args))

        @agent.tool_plain
        def get_raw_narrative(turn_number: int | None = None,
                              turn_numbers: list[int] | None = None,
                              ) -> str:
            args = GetRawNarrativeInput(
                turn_number=turn_number,
                turn_numbers=turn_numbers or [],
            )
            return tool_result_json(tool_context.get_raw_narrative(args))

        @agent.tool_plain
        def search_world(query: str) -> str:
            return tool_result_json(tool_context.search_world(SearchWorldInput(query=query)))

        @agent.tool_plain
        def get_rule(module_id: str) -> str:
            return tool_result_json(tool_context.get_rule(GetRuleInput(module_id=module_id)))

        @agent.tool_plain
        def get_npc_card(npc_id: str) -> str:
            return tool_result_json(tool_context.get_npc_card(GetNpcCardInput(npc_id=npc_id)))

        @agent.tool_plain
        def get_npc_reaction(npc_id: str,
                             turns: int = 1,
                             ) -> str:
            args = GetNpcReactionInput(npc_id=npc_id, turns=turns)
            return tool_result_json(tool_context.get_npc_reaction(args))

        @agent.tool_plain
        def get_sms_history(contact_id: str,
                            limit: int = 10,
                            offset: int = 0,
                            ) -> str:
            args = GetSmsHistoryInput(contact_id=contact_id, limit=limit, offset=offset)
            return tool_result_json(tool_context.get_sms_history(args))

        if tool_context.predefined_npc_ids():
            @agent.tool_plain
            def load_predefined_npc(id: str) -> str:
                return tool_result_json(tool_context.load_predefined_npc(LoadPredefinedNpcInput(id=id)))

        @agent.tool_plain
        def new_npc(id: str,
                    name: str,
                    fields: dict[str, Any] | None = None,
                    ) -> str:
            args = NewNpcInput(id=id, name=name, fields=fields or {})
            return tool_result_json(tool_context.new_npc(args))

    def _register_effect_tools(self,
                               agent: Any,
                               tool_context: ReactToolContext,
                               ):
        @agent.tool_plain
        def update_item(name: str,
                        delta: int,
                        desc: str | None = None,
                        icon: str | None = None,
                        ) -> str:
            args = UpdateItemInput(name=name, delta=delta, desc=desc, icon=icon)
            return tool_result_json(tool_context.update_item(args))

        @agent.tool_plain
        def send_sms(from_npc_id: str,
                     message: str,
                     mood: str | None = None,
                     ) -> str:
            args = SendSmsInput(from_npc_id=from_npc_id, message=message, mood=mood)
            return tool_result_json(tool_context.send_sms(args))

        @agent.tool_plain
        def send_notification(type: str,
                              text: str,
                              ) -> str:
            args = SendNotificationInput(type=type, text=text)
            return tool_result_json(tool_context.send_notification(args))

        if tool_context.active_npc_ids():
            @agent.tool_plain
            def update_npc(id: str,
                           fields: dict[str, Any],
                           ) -> str:
                args = UpdateNpcInput(id=id, fields=fields)
                return tool_result_json(tool_context.update_npc(args))

    def _narrative_tool_list(self,
                             tool_context: ReactToolContext,
                             ) -> dict[str, Any]:
        tools = [
            'get_state',
            'get_story_summary',
            'get_raw_narrative',
            'search_world',
            'get_rule',
            'get_npc_card',
            'get_npc_reaction',
            'get_sms_history',
            'new_npc',
        ]
        if tool_context.predefined_npc_ids():
            tools.append('load_predefined_npc')
        return {
            'tools': tools,
            'rule_modules': tool_context.available_rule_modules(),
            'active_npc_ids': tool_context.active_npc_ids(),
            'predefined_npc_ids': tool_context.predefined_npc_ids()[:30],
        }

    def _compact_save_for_effects(self,
                                  save: GameSave | None,
                                  ) -> dict[str, Any] | None:
        if not save:
            return None
        return {
            'inventory': self._dump(save.inventory_data),
            'sms_contacts': sorted((save.sms_data.conversations if save.sms_data else {}).keys()),
            'npc_ids': sorted((save.npc_data.npc_data if save.npc_data else {}).keys()),
            'custom_status': save.custom_status_data,
        }

    def extract_ooc_candidates(self, text: str) -> list[str]:
        candidates = []
        for match in self.OOC_PATTERN.finditer(text or ''):
            value = match.group(1) or match.group(2)
            value = value.strip()
            if value:
                candidates.append(value)
        return candidates

    def _dump(self, value: Any) -> Any:
        if value is None:
            return None
        if hasattr(value, 'model_dump'):
            return value.model_dump(mode='json')
        return value
