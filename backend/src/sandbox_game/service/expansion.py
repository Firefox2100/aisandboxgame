from __future__ import annotations

import json
import re
from typing import Any

from pydantic import BaseModel

from sandbox_game.model.expansion import CharacterExpansionData, WorldExpansionData
from sandbox_game.model.llm import LlmModuleConfig
from sandbox_game.model.save import GameSave
from sandbox_game.model.world_card import WorldCard
from sandbox_game.model.world_state import EntityEntry, EntityStoreData
from sandbox_game.model.npc import NpcStoreData
from sandbox_game.service.llm.service import LlmService


class ExpansionValidationError(ValueError):
    pass


class _RuntimeFrame(BaseModel):
    context_world: str
    context_rules: str
    context_chars: str
    style_guide: str
    status_terms: str


class ExpansionService:
    ENTITY_ID_PATTERN = re.compile(r'^[a-z][a-z0-9_]{3,39}$')

    def __init__(self,
                 llm_service: LlmService | None = None,
                 ):
        self._llm = llm_service or LlmService()

    async def generate_world(self,
                             *,
                             context: str,
                             world_card: WorldCard,
                             save: GameSave | None,
                             llm: LlmModuleConfig,
                             api_key: str,
                             ) -> WorldExpansionData:
        from pydantic_ai import Agent

        agent = Agent(
            self._llm._build_model(llm, api_key),
            instructions=self._build_world_prompt(context, world_card, save),
            output_type=WorldExpansionData,
        )
        result = await agent.run('请根据 system 指令生成世界扩展 JSON。')
        return self.validate_world_expansion(result.output, world_card, save)

    async def generate_characters(self,
                                  *,
                                  context: str,
                                  world_card: WorldCard,
                                  save: GameSave | None,
                                  llm: LlmModuleConfig,
                                  api_key: str,
                                  ) -> CharacterExpansionData:
        from pydantic_ai import Agent

        agent = Agent(
            self._llm._build_model(llm, api_key),
            instructions=self._build_characters_prompt(context, world_card, save),
            output_type=CharacterExpansionData,
        )
        result = await agent.run('请根据 system 指令生成角色扩展 JSON。')
        return self.validate_character_expansion(result.output, world_card, save)

    def validate_world_expansion(self,
                                 data: WorldExpansionData,
                                 world_card: WorldCard,
                                 save: GameSave | None,
                                 ) -> WorldExpansionData:
        existing_ids = set(self._existing_world_entities(world_card, save))
        clean_settings: dict[str, str] = {}
        clean_core_chars: dict[str, list[str]] = {}

        for entity_id, text in data.settings.items():
            entity_id = entity_id.strip()
            if not self.ENTITY_ID_PATTERN.match(entity_id):
                raise ExpansionValidationError(
                    f'Invalid entity id "{entity_id}". Use snake_case, 4-40 chars.'
                )
            if entity_id in existing_ids:
                raise ExpansionValidationError(f'World entity already exists: {entity_id}.')
            text = str(text or '').strip()
            if len(text) < 120:
                raise ExpansionValidationError(f'World entity "{entity_id}" text is too short.')
            clean_settings[entity_id] = text

            chars = data.narrative_core_characters.get(entity_id) or []
            clean_core_chars[entity_id] = [
                str(item).strip()
                for item in chars
                if str(item).strip()
            ][:20]

        if not clean_settings:
            raise ExpansionValidationError('World expansion produced no new settings.')

        return WorldExpansionData.model_validate({
            'settings': clean_settings,
            '_narrativeCoreCharacters': clean_core_chars,
            '_summary': data.summary.strip(),
        })

    def validate_character_expansion(self,
                                     data: CharacterExpansionData,
                                     world_card: WorldCard,
                                     save: GameSave | None,
                                     ) -> CharacterExpansionData:
        existing_ids = set(self._existing_character_ids(world_card, save))
        clean_chars: dict[str, dict[str, Any]] = {}
        clean_rules: dict[str, dict[str, Any]] = {}

        for char_id, card in data.character_database.items():
            char_id = char_id.strip()
            if not self.ENTITY_ID_PATTERN.match(char_id):
                raise ExpansionValidationError(
                    f'Invalid character id "{char_id}". Use snake_case, 4-40 chars.'
                )
            if char_id in existing_ids:
                raise ExpansionValidationError(f'Character already exists: {char_id}.')
            if not isinstance(card, dict):
                raise ExpansionValidationError(f'Character "{char_id}" must be an object.')
            name = str(card.get('name') or '').strip()
            if not name:
                raise ExpansionValidationError(f'Character "{char_id}" requires name.')
            clean_card = {
                **card,
                'id': card.get('id') or char_id,
                'name': name,
            }
            clean_chars[char_id] = clean_card

            rule = data.relationship_rules.get(char_id)
            if isinstance(rule, dict):
                clean_rules[char_id] = rule

        if not clean_chars:
            raise ExpansionValidationError('Character expansion produced no new characters.')

        return CharacterExpansionData.model_validate({
            'character_database': clean_chars,
            'relationship_rules': clean_rules,
            '_summary': data.summary.strip(),
        })

    def apply_world_to_save(self,
                            save_payload: dict[str, Any],
                            data: WorldExpansionData,
                            ) -> dict[str, Any]:
        existing = save_payload.get('entities') or {}
        entries = dict(existing.get('entities') or {})
        core_chars = dict(existing.get('narrative_core_characters') or {})
        for entity_id, text in data.settings.items():
            entries[entity_id] = EntityEntry(text=text, origin='expanded').model_dump(mode='json')
            chars = data.narrative_core_characters.get(entity_id)
            if chars:
                core_chars[entity_id] = chars
        save_payload['entities'] = EntityStoreData(
            entities={
                key: EntityEntry.model_validate(value)
                for key, value in entries.items()
            },
            narrative_core_characters=core_chars,
            summary=data.summary or existing.get('summary') or '',
        ).model_dump(mode='json')
        return save_payload

    def apply_characters_to_save(self,
                                 save_payload: dict[str, Any],
                                 data: CharacterExpansionData,
                                 ) -> dict[str, Any]:
        existing = save_payload.get('npc_data') or {}
        npc_data = dict(existing.get('npc_data') or {})
        predefined_pool = dict(existing.get('predefined_pool') or {})
        char_origin = dict(existing.get('char_origin') or {})
        relationship_rules = dict(existing.get('relationship_rules') or {})

        for char_id, card in data.character_database.items():
            predefined_pool[char_id] = card
            char_origin[char_id] = 'expanded'
            rule = data.relationship_rules.get(char_id)
            if rule:
                relationship_rules[char_id] = rule

        save_payload['npc_data'] = NpcStoreData(
            npc_data=npc_data,
            deleted_ids=existing.get('deleted_ids') or {},
            rejected_updates=existing.get('rejected_updates') or {},
            npc_order=existing.get('npc_order') or [],
            unselected_ids=existing.get('unselected_ids') or [],
            pending_updates=existing.get('pending_updates') or {},
            current_turn=existing.get('current_turn') or 0,
            predefined_pool=predefined_pool,
            char_origin=char_origin,
            relationship_rules=relationship_rules,
        ).model_dump(mode='json')
        return save_payload

    def _build_world_prompt(self,
                            context: str,
                            world_card: WorldCard,
                            save: GameSave | None,
                            ) -> str:
        frame = self._runtime_frame(world_card, save)
        existing = self._existing_world_entities(world_card, save)
        existing_list = '\n'.join(
            f'- {entity_id}: {text[:200]}...'
            for entity_id, text in existing.items()
        ) or '（无）'

        return f'''你是一个游戏世界观设计师。游戏正在进行中，玩家行动触及了世界卡尚未定义的区域。请根据现有世界观扩展生成新的世界实体。

## 扩展请求
{context}

## 现有世界框架
{frame.context_world}

## 风格基调
{frame.style_guide}

## 已有世界实体（不要重复）
{existing_list}

## 输出职责
- 只生成新实体，不要重写已有实体。
- 新实体数量通常 1-3 个。
- 每个实体设定文本必须是可长期复用的 Markdown 世界设定，包含地缘定位、历史文化、治理结构、经济环境、核心人物与当前局势。
- settings 的 key 使用 snake_case，4-40 字符，不能与已有实体重复。
- `_narrativeCoreCharacters` 必须按实体列出核心人物名。

## UI 术语参考
{frame.status_terms}

只输出符合结构的 JSON，不要解释。'''

    def _build_characters_prompt(self,
                                 context: str,
                                 world_card: WorldCard,
                                 save: GameSave | None,
                                 ) -> str:
        frame = self._runtime_frame(world_card, save)
        existing_chars = self._existing_characters(world_card, save)
        existing_list = '\n'.join(
            f'- {char_id}: {card.get("name") or char_id} — {card.get("origin") or card.get("role") or ""}'
            for char_id, card in existing_chars.items()
        ) or '（无）'

        return f'''你是一个游戏角色数据库设计师。游戏正在进行中，需要扩展可长期复用的新角色档案。

## 扩展请求
{context}

## 世界框架
{frame.context_world}

## 规则与风格
{frame.context_rules}

## 已有角色（不要重复）
{existing_list}

## 输出职责
- 只生成新角色，不要重写已有角色。
- 新角色应写入 character_database，供之后 `load_predefined_npc` 激活。
- 每个角色必须至少包含 name、origin、personality、appearance、msg_reply_tone、default_cognitive_state 或 cognitive_state。
- 如角色之间存在默认关系，写入 relationship_rules。
- 角色 id 使用 snake_case，4-40 字符，不能与已有角色重复。

## 角色字段术语参考
{frame.status_terms}

只输出符合结构的 JSON，不要解释。'''

    def _runtime_frame(self,
                       world_card: WorldCard,
                       save: GameSave | None,
                       ) -> _RuntimeFrame:
        snapshot = world_card.snapshot.model_dump(mode='json', by_alias=True)
        world_setting = snapshot.get('world_setting') or {}
        prompt_modules = snapshot.get('prompt_modules') or {}
        modules = prompt_modules.get('modules') or {}

        world_parts = []
        if world_setting.get('_summary'):
            world_parts.append(world_setting['_summary'])
        for entity_id, text in self._existing_world_entities(world_card, save).items():
            world_parts.append(f'[{entity_id}] {text[:400]}')

        rule_parts = []
        if prompt_modules.get('_summary'):
            rule_parts.append(prompt_modules['_summary'])
        for module_id, text in modules.items():
            if isinstance(text, str):
                rule_parts.append(f'[{module_id}] {text[:300]}')

        char_parts = []
        for char_id, card in self._existing_characters(world_card, save).items():
            char_parts.append(
                f'{char_id}: {card.get("name") or char_id} '
                f'{card.get("origin") or ""} {card.get("personality") or ""}'.strip()
            )

        return _RuntimeFrame(
            context_world='\n\n'.join(world_parts) or '（无世界设定）',
            context_rules='\n\n'.join(rule_parts) or '（无规则数据）',
            context_chars='; '.join(char_parts) or '（无角色数据）',
            style_guide=modules.get('narrative_base') or '（无风格指南）',
            status_terms=self._status_terms(snapshot),
        )

    def _status_terms(self, snapshot: dict[str, Any]) -> str:
        fields = snapshot.get('step3_fields') or {}
        lines = []
        for group in fields.get('panel_status') or []:
            if not isinstance(group, dict):
                continue
            lines.append(f'- {group.get("key")}: {group.get("label")}')
            for field in group.get('fields') or []:
                if isinstance(field, dict):
                    lines.append(f'  - {field.get("key")} -> {field.get("label")}')
        for field in fields.get('panel_npc') or []:
            if isinstance(field, dict):
                lines.append(f'- NPC.{field.get("key")} -> {field.get("label")}')
        return '\n'.join(lines) or '（使用世界默认字段）'

    def _existing_world_entities(self,
                                 world_card: WorldCard,
                                 save: GameSave | None,
                                 ) -> dict[str, str]:
        snapshot = world_card.snapshot.model_dump(mode='json', by_alias=True)
        settings = (snapshot.get('world_setting') or {}).get('settings') or {}
        result = {
            key: value
            for key, value in settings.items()
            if isinstance(value, str) and not key.startswith('_')
        }
        if save and save.entities:
            for entity_id, entry in save.entities.entities.items():
                result[entity_id] = entry.text
        return result

    def _existing_characters(self,
                             world_card: WorldCard,
                             save: GameSave | None,
                             ) -> dict[str, dict[str, Any]]:
        snapshot = world_card.snapshot.model_dump(mode='json', by_alias=True)
        result = {
            key: value
            for key, value in (snapshot.get('character_database') or {}).items()
            if isinstance(value, dict) and not key.startswith('_')
        }
        if save and save.npc_data:
            result.update(save.npc_data.predefined_pool)
            result.update(save.npc_data.npc_data)
        return result

    def _existing_character_ids(self,
                                world_card: WorldCard,
                                save: GameSave | None,
                                ) -> list[str]:
        return list(self._existing_characters(world_card, save).keys())
