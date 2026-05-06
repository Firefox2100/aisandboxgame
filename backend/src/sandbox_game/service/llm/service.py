import json
from typing import Any

from sandbox_game.model.chat import ChatMessage
from sandbox_game.model.llm import GameTurnData, GenerateTurnRequest, GenerateTurnResponse, LlmModuleConfig, LlmTextResponse
from sandbox_game.model.save import GameSave
from sandbox_game.model.world_card import WorldCard
from sandbox_game.service.prompts import PromptService


class LlmService:
    def __init__(self,
                 prompts: PromptService | None = None,
                 ):
        self._prompts = prompts or PromptService('zh_cn')

    def _build_model(self, config: LlmModuleConfig, api_key: str):
        provider = config.provider.value

        if provider == 'anthropic':
            from pydantic_ai.models.anthropic import AnthropicModel
            from pydantic_ai.providers.anthropic import AnthropicProvider

            return AnthropicModel(
                config.model,
                provider=AnthropicProvider(api_key=api_key),
            )

        if provider == 'gemini':
            from pydantic_ai.models.google import GoogleModel
            from pydantic_ai.providers.google import GoogleProvider

            return GoogleModel(
                config.model,
                provider=GoogleProvider(api_key=api_key),
            )

        from pydantic_ai.models.openai import OpenAIChatModel
        from pydantic_ai.providers.openai import OpenAIProvider

        base_urls = {
            'deepseek': 'https://api.deepseek.com',
            'grok': 'https://api.x.ai/v1',
            'siliconflow': 'https://api.siliconflow.cn/v1',
            'openrouter': 'https://openrouter.ai/api/v1',
            'openai': None,
        }
        base_url = config.base_url or base_urls.get(provider)
        provider_kwargs = {'api_key': api_key}
        if base_url:
            provider_kwargs['base_url'] = base_url
        return OpenAIChatModel(
            config.model,
            provider=OpenAIProvider(**provider_kwargs),
        )

    def _format_history(self, history: list[ChatMessage]) -> str:
        lines = []
        for message in history[-20:]:
            if message.meta == 'ooc_qa':
                lines.append(f'OOC Question: {message.question or ""}')
                if message.answer:
                    lines.append(f'OOC Answer: {message.answer}')
                continue
            sender = 'Player' if message.sender == 'user' else 'Game'
            if message.text:
                lines.append(f'{sender}: {message.text}')
        return '\n'.join(lines)

    def _build_instructions(self,
                            world_card: WorldCard | None,
                            save: GameSave | None,
                            ) -> str:
        parts = [
            self._prompts.core_gm(),
            '# 后端结构化输出契约',
            '你现在运行在 FastAPI 后端。必须把本回合游戏逻辑写入结构化字段，而不是交给前端推断。',
            'narrative 是玩家可见叙事；choices 是 1-3 个下一步选项；panel_status/npc_updates/inventory_changes/timeline_events 是后端持久化依据。',
            '不要把 JSON 写进 narrative。结构化数据只进入输出对象字段。',
        ]

        if world_card:
            snapshot = world_card.snapshot.model_dump(mode='json', by_alias=True)
            prompt_modules = snapshot.get('prompt_modules') or {}
            modules = prompt_modules.get('modules') or {}
            for key in ('core_world_mechanics', 'narrative_base', 'time_protocol', 'economy', 'npc_gen'):
                value = modules.get(key)
                if isinstance(value, str) and value.strip():
                    parts.append(f'## {key}\n{value.strip()}')
            world_summary = snapshot.get('world_setting', {}).get('_summary')
            if world_summary:
                parts.append(f'World summary: {world_summary}')

        if save:
            state = {
                'location': save.location.model_dump(mode='json') if hasattr(save.location, 'model_dump') else save.location,
                'game_time': save.game_time.model_dump(mode='json') if save.game_time else None,
                'player_state': save.player_state_data.model_dump(mode='json') if save.player_state_data else None,
                'inventory': save.inventory_data.model_dump(mode='json') if save.inventory_data else None,
                'npc_data': save.npc_data.model_dump(mode='json') if save.npc_data else None,
            }
            parts.append('## Persisted State\n' + json.dumps(state, ensure_ascii=False, default=str))

        return '\n\n'.join(parts)

    async def generate_turn(self,
                            request: GenerateTurnRequest,
                            world_card: WorldCard | None,
                            save: GameSave | None,
                            api_key: str,
                            ) -> GenerateTurnResponse:
        from pydantic_ai import Agent

        model = self._build_model(request.llm, api_key)
        agent = Agent(
            model,
            instructions=self._build_instructions(world_card, save),
            output_type=GameTurnData,
        )
        prompt = '\n\n'.join(
            part for part in [
                self._format_history(request.history),
                '## Collected Runtime Data\n' + json.dumps(request.collected_data, ensure_ascii=False),
                '## Player Action\n' + request.message,
            ]
            if part
        )
        result = await agent.run(prompt)
        usage: dict[str, Any] | None = None
        try:
            usage_obj = result.usage()
            usage = usage_obj.__dict__ if hasattr(usage_obj, '__dict__') else dict(usage_obj)
        except Exception:
            usage = None
        data = result.output
        return GenerateTurnResponse(
            text=data.narrative,
            data=data,
            model=request.llm.model,
            provider=request.llm.provider,
            usage=usage,
        )

    async def run_text(self,
                       *,
                       instructions: str,
                       prompt: str,
                       llm: LlmModuleConfig,
                       api_key: str,
                       ) -> LlmTextResponse:
        from pydantic_ai import Agent

        agent = Agent(
            self._build_model(llm, api_key),
            instructions=instructions,
            output_type=str,
        )
        result = await agent.run(prompt)
        usage: dict[str, Any] | None = None
        try:
            usage_obj = result.usage()
            usage = usage_obj.__dict__ if hasattr(usage_obj, '__dict__') else dict(usage_obj)
        except Exception:
            usage = None
        return LlmTextResponse(
            text=str(result.output),
            model=llm.model,
            provider=llm.provider,
            usage=usage,
        )

    async def summarize(self,
                        text: str,
                        llm: LlmModuleConfig,
                        api_key: str,
                        *,
                        chapter: bool = False,
                        ) -> LlmTextResponse:
        return await self.run_text(
            instructions=self._prompts.chapter_summary() if chapter else self._prompts.summary(),
            prompt=text,
            llm=llm,
            api_key=api_key,
        )

    async def generate_sms(self,
                           payload: dict[str, Any],
                           llm: LlmModuleConfig,
                           api_key: str,
                           ) -> LlmTextResponse:
        return await self.run_text(
            instructions='\n\n'.join([
                self._prompts.sms_relationship_rules(),
                self._prompts.sms(),
            ]),
            prompt=json.dumps(payload, ensure_ascii=False),
            llm=llm,
            api_key=api_key,
        )

    async def normalize_ooc(self,
                            payload: dict[str, Any],
                            llm: LlmModuleConfig,
                            api_key: str,
                            ) -> LlmTextResponse:
        return await self.run_text(
            instructions=self._prompts.ooc(),
            prompt=json.dumps(payload, ensure_ascii=False),
            llm=llm,
            api_key=api_key,
        )
