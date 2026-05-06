from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional
from uuid import uuid4

from sandbox_game.model.world_card import WorldCard, WorldCardCreate, WorldCardSummary
from sandbox_game.service.prompts import PromptService


BUILTIN_CARD_SPECS = (
    {
        'id': 'wc_builtin_default',
        'path': 'defaultworldcard.json',
        'fallback_name': '默认世界',
        'fallback_description': '内置默认世界卡（兜底）',
    },
    {
        'id': 'wc_builtin_cyberpunk',
        'path': 'cyberpunkworldcard.json',
        'fallback_name': '赛博朋克世界',
        'fallback_description': '内置赛博朋克世界卡（兜底）',
    },
    {
        'id': 'wc_builtin_cultivation',
        'path': 'cultivationworldcard.json',
        'fallback_name': '修仙世界',
        'fallback_description': '内置修仙世界卡（兜底）',
    },
)


class WorldCardService:
    def __init__(self,
                 repository,
                 user_id: int,
                 project_root: Optional[Path] = None,
                 ):
        self._repository = repository
        self._user_id = user_id
        self._project_root = project_root or Path(__file__).resolve().parents[5]
        self._prompts = PromptService('zh_cn')

    def _now(self) -> str:
        return datetime.now(timezone.utc).isoformat()

    def _deep_copy(self, value: Any) -> Any:
        return json.loads(json.dumps(value, ensure_ascii=False))

    def _has_meaningful_value(self, value: Any) -> bool:
        if isinstance(value, str):
            return len(value.strip()) > 0
        if isinstance(value, bool):
            return True
        if isinstance(value, int | float):
            return True
        if isinstance(value, list):
            return any(self._has_meaningful_value(item) for item in value)
        if isinstance(value, dict):
            return any(
                not str(key).startswith('_') and self._has_meaningful_value(nested)
                for key, nested in value.items()
            )
        return False

    def has_substantial_content(self, snapshot: dict[str, Any]) -> bool:
        if not isinstance(snapshot, dict):
            return False

        world_setting = snapshot.get('world_setting') or {}
        settings = world_setting.get('settings') if isinstance(world_setting, dict) else None
        if isinstance(settings, dict) and self._has_meaningful_value(settings):
            return True

        prompt_modules = snapshot.get('prompt_modules') or {}
        modules = prompt_modules.get('modules') if isinstance(prompt_modules, dict) else None
        if isinstance(modules, dict) and any(
            isinstance(value, str) and value.strip() for value in modules.values()
        ):
            return True

        for key in ('character_database', 'character_timelines', 'relationship_rules'):
            value = snapshot.get(key)
            if isinstance(value, dict) and self._has_meaningful_value(value):
                return True

        timeline = snapshot.get('timeline') or {}
        events = timeline.get('events') if isinstance(timeline, dict) else None
        return isinstance(events, list) and any(isinstance(event, dict) for event in events)

    def _normalize_card_payload(self,
                                card: dict[str, Any],
                                card_id: str,
                                now: Optional[str] = None,
                                *,
                                is_built_in: bool = False,
                                ) -> dict[str, Any]:
        now = now or self._now()
        snapshot = self._deep_copy(card.get('snapshot') or {})
        localizations = self._deep_copy(card.get('localizations') or {})
        if isinstance(localizations, dict):
            for entry in localizations.values():
                if isinstance(entry, dict) and 'contentLocale' in entry and 'content_locale' not in entry:
                    entry['content_locale'] = entry.pop('contentLocale')

        return {
            'id': card_id,
            'name': str(card.get('name') or '未命名世界'),
            'description': str(card.get('description') or ''),
            'created_at': card.get('created_at') or card.get('createdAt') or now,
            'updated_at': card.get('updated_at') or card.get('updatedAt') or now,
            'is_built_in': bool(card.get('is_built_in', card.get('isBuiltIn', is_built_in))),
            'content_locale': card.get('content_locale') or card.get('contentLocale') or 'zh-CN',
            'localizations': localizations,
            'snapshot': snapshot,
            'design_chat_history': (
                card.get('design_chat_history') or card.get('designChatHistory') or []
            ),
            'design_meta': card.get('design_meta') or card.get('designMeta'),
        }

    async def ensure_built_in_cards(self):
        for spec in BUILTIN_CARD_SPECS:
            existing = await self._repository.get_world_card(
                user_id=None,
                card_id=spec['id'],
                include_built_in=True,
            )
            if existing:
                continue

            path = self._prompts.world_card_path(spec['path'])
            try:
                raw = json.loads(path.read_text(encoding='utf-8'))
            except Exception:
                raw = {
                    'name': spec['fallback_name'],
                    'description': spec['fallback_description'],
                    'snapshot': {
                        'world_setting': {
                            'settings': {
                                'fallback': spec['fallback_description'],
                            },
                            '_summary': spec['fallback_description'],
                        },
                    },
                }
            payload = self._normalize_card_payload(raw.get('card') or raw, spec['id'], is_built_in=True)
            await self._repository.upsert_world_card(
                user_id=None,
                card=WorldCard.model_validate(payload),
                is_empty=not self.has_substantial_content(payload['snapshot']),
            )

    async def list(self, locale: Optional[str] = None) -> list[WorldCardSummary]:
        await self.ensure_built_in_cards()
        cards = await self._repository.list_world_cards(self._user_id, include_built_in=True)
        return [self._summary(card, locale) for card in cards]

    async def get(self, card_id: str) -> Optional[WorldCard]:
        await self.ensure_built_in_cards()
        return await self._repository.get_world_card(
            user_id=self._user_id,
            card_id=card_id,
            include_built_in=True,
        )

    async def create(self, request: WorldCardCreate) -> WorldCard:
        snapshot = request.snapshot.model_dump(by_alias=True)
        if not request.allow_empty_snapshot and not self.has_substantial_content(snapshot):
            raise ValueError('World card snapshot is empty.')

        now = self._now()
        payload = {
            'id': f'wc_custom_{uuid4().hex[:16]}',
            'name': request.name,
            'description': request.description,
            'created_at': now,
            'updated_at': now,
            'is_built_in': False,
            'content_locale': request.content_locale,
            'localizations': request.localizations,
            'snapshot': snapshot,
            'design_chat_history': request.design_chat_history,
            'design_meta': request.design_meta,
        }
        card = WorldCard.model_validate(payload)
        await self._repository.upsert_world_card(
            user_id=self._user_id,
            card=card,
            is_empty=not self.has_substantial_content(snapshot),
        )
        return card

    async def update(self,
                     card_id: str,
                     updates: WorldCardCreate,
                     ) -> Optional[WorldCard]:
        existing = await self.get(card_id)
        if not existing or existing.is_built_in:
            return None

        snapshot = updates.snapshot.model_dump(by_alias=True)
        if not updates.allow_empty_snapshot and not self.has_substantial_content(snapshot):
            raise ValueError('World card snapshot is empty.')

        payload = existing.model_dump()
        payload.update({
            'name': updates.name,
            'description': updates.description,
            'updated_at': self._now(),
            'content_locale': updates.content_locale,
            'localizations': updates.localizations,
            'snapshot': snapshot,
            'design_chat_history': updates.design_chat_history,
            'design_meta': updates.design_meta,
        })
        card = WorldCard.model_validate(payload)
        await self._repository.upsert_world_card(
            user_id=self._user_id,
            card=card,
            is_empty=not self.has_substantial_content(snapshot),
        )
        return card

    async def delete(self, card_id: str) -> bool:
        card = await self.get(card_id)
        if not card or card.is_built_in:
            return False
        await self._repository.delete_world_card(self._user_id, card_id)
        return True

    async def get_active_card_id(self) -> Optional[str]:
        await self.ensure_built_in_cards()
        active_id = await self._repository.get_active_world_card_id(self._user_id)
        if active_id and await self.get(active_id):
            return active_id
        cards = await self.list()
        return cards[0].id if cards else None

    async def set_active_card(self, card_id: Optional[str]) -> Optional[str]:
        if card_id is not None and not await self.get(card_id):
            return None
        await self._repository.set_active_world_card_id(self._user_id, card_id)
        return card_id

    def _summary(self, card: WorldCard, locale: Optional[str] = None) -> WorldCardSummary:
        view = self._localized_view(card, locale)
        return WorldCardSummary(
            id=card.id or '',
            name=view['name'],
            description=view['description'],
            created_at=card.created_at or '',
            updated_at=card.updated_at or '',
            is_built_in=card.is_built_in,
            content_locale=view['content_locale'],
        )

    def _localized_view(self, card: WorldCard, locale: Optional[str] = None) -> dict[str, str]:
        target_locale = locale if locale in {'zh-CN', 'en'} else card.content_locale
        entry = card.localizations.get(target_locale) if card.localizations else None
        return {
            'name': entry.name if entry else card.name,
            'description': entry.description if entry else card.description,
            'content_locale': entry.content_locale if entry else card.content_locale,
        }
