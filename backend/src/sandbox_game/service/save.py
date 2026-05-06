from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Optional

from sandbox_game.model.save import GameSave, SaveSlotSummary


class SaveService:
    MAX_SLOTS = 5
    SCHEMA_VERSION = 5

    def __init__(self,
                 repository,
                 user_id: int,
                 ):
        self._repository = repository
        self._user_id = user_id

    def _now(self) -> str:
        return datetime.now(timezone.utc).isoformat()

    def _normalize_save_source(self, source: Any) -> str:
        normalized = str(source or '').strip().lower()
        if normalized in {'manual', 'live', 'auto_transition', 'auto_runtime', 'repair'}:
            return normalized
        return 'unknown'

    def _camel_to_snake_payload(self, data: dict[str, Any]) -> dict[str, Any]:
        mapping = {
            'ownerWorldCardId': 'owner_world_card_id',
            'createdAt': 'created_at',
            'updatedAt': 'updated_at',
            'progressUpdatedAt': 'progress_updated_at',
            'schemaVersion': 'schema_version',
            'npcData': 'npc_data',
            'smsData': 'sms_data',
            'gameTime': 'game_time',
            'characterStates': 'character_states',
            'mapData': 'map_data',
            'playerStateData': 'player_state_data',
            'gmData': 'gm_data',
            'activeWorldCardId': 'active_world_card_id',
            'saveSource': 'save_source',
            'timelineEvents': 'timeline_events',
            'inventoryData': 'inventory_data',
            'customStatusData': 'custom_status_data',
            'npcReactionData': 'npc_reaction_data',
            'collectErrorsGuard': 'collect_errors_guard',
            '__repaired': 'repaired',
            '__migrated': 'migrated',
        }
        normalized = dict(data)
        for source, target in mapping.items():
            if source in normalized and target not in normalized:
                normalized[target] = normalized.pop(source)
        return normalized

    def _clean_history(self, history: Any) -> list[dict[str, Any]]:
        if not isinstance(history, list):
            return []

        cleaned = []
        for message in history:
            if not isinstance(message, dict):
                continue
            if message.get('meta') == 'ooc_qa':
                question = message.get('question')
                if not isinstance(question, str):
                    continue
                entry = {
                    'sender': message.get('sender') or 'ai',
                    'meta': 'ooc_qa',
                    'kind': message.get('kind') or 'question',
                    'question': question,
                }
                for key in ('answer', 'ooc_id', 'skipped'):
                    if key in message:
                        entry[key] = message[key]
                cleaned.append(entry)
                continue

            text = message.get('text')
            if text is None:
                continue
            entry = {
                'sender': message.get('sender'),
                'text': text,
            }
            if not entry['sender']:
                continue
            passthrough = {
                'uid',
                'model_label',
                'provider_key',
                'function_calls',
                'reasoning_contents',
                'step2_choices',
                'npc_reactions',
                'metrics',
                'react_segments',
                'game_data',
                'ooc',
            }
            camel_mapping = {
                'modelLabel': 'model_label',
                'providerKey': 'provider_key',
                'functionCalls': 'function_calls',
                'reasoningContents': 'reasoning_contents',
                'step2Choices': 'step2_choices',
                'npcReactions': 'npc_reactions',
                'reactSegments': 'react_segments',
                'gameData': 'game_data',
            }
            for key in passthrough:
                if key in message:
                    entry[key] = message[key]
            for source, target in camel_mapping.items():
                if source in message and target not in entry:
                    entry[target] = message[source]
            cleaned.append(entry)
        return cleaned

    def normalize(self,
                  world_card_id: str,
                  slot_id: str,
                  data: dict[str, Any],
                  *,
                  existing: Optional[GameSave] = None,
                  preserve_timestamps: bool = False,
                  touch_progress: bool = True,
                  ) -> GameSave:
        now = self._now()
        source = self._camel_to_snake_payload(data if isinstance(data, dict) else {})
        existing_payload = existing.model_dump(mode='json') if existing else {}

        created_at = (
            source.get('created_at') or existing_payload.get('created_at') or now
            if preserve_timestamps
            else existing_payload.get('created_at') or now
        )
        updated_at = source.get('updated_at') or now if preserve_timestamps else now
        progress_updated_at = (
            source.get('progress_updated_at') or
            (now if touch_progress else existing_payload.get('progress_updated_at')) or
            updated_at
        )

        payload = {
            **existing_payload,
            **source,
            'id': slot_id,
            'owner_world_card_id': world_card_id,
            'active_world_card_id': source.get('active_world_card_id') or world_card_id,
            'name': source.get('name') or existing_payload.get('name') or f'存档 {slot_id.replace("slot_", "")}',
            'created_at': created_at,
            'updated_at': updated_at,
            'progress_updated_at': progress_updated_at,
            'schema_version': self.SCHEMA_VERSION,
            'history': self._clean_history(source.get('history', existing_payload.get('history', []))),
            'save_source': self._normalize_save_source(source.get('save_source') or existing_payload.get('save_source')),
        }

        if payload.get('schema_version', 0) < self.SCHEMA_VERSION:
            payload['migrated'] = True
            payload['schema_version'] = self.SCHEMA_VERSION

        return GameSave.model_validate(payload)

    async def list(self, world_card_id: str) -> list[SaveSlotSummary]:
        saves = await self._repository.list_saves(self._user_id, world_card_id)
        by_id = {save.id: save for save in saves}
        return [
            self._summary(by_id[slot_id])
            for slot_id in self._slot_ids()
            if slot_id in by_id
        ]

    async def find_first_empty_slot(self, world_card_id: str) -> str | None:
        saves = await self._repository.list_saves(self._user_id, world_card_id)
        occupied = {save.id for save in saves}
        for slot_id in self._slot_ids():
            if slot_id not in occupied:
                return slot_id
        return None

    async def save(self,
                   world_card_id: str,
                   slot_id: str,
                   name: Optional[str],
                   data: dict[str, Any],
                   *,
                   set_current: bool = True,
                   touch_progress: bool = True,
                   ) -> GameSave:
        existing = await self._repository.get_save(self._user_id, world_card_id, slot_id)
        merged = dict(data or {})
        if name:
            merged['name'] = name
        save = self.normalize(
            world_card_id,
            slot_id,
            merged,
            existing=existing,
            touch_progress=touch_progress,
        )
        await self._repository.upsert_save(self._user_id, world_card_id, save)
        if set_current:
            await self._repository.set_current_save_slot(self._user_id, world_card_id, slot_id)
        return save

    async def load(self, world_card_id: str, slot_id: str) -> GameSave | None:
        save = await self._repository.get_save(self._user_id, world_card_id, slot_id)
        if save:
            await self._repository.set_current_save_slot(self._user_id, world_card_id, slot_id)
        return save

    async def rename(self, world_card_id: str, slot_id: str, name: str) -> GameSave | None:
        existing = await self._repository.get_save(self._user_id, world_card_id, slot_id)
        if not existing:
            return None
        save = self.normalize(
            world_card_id,
            slot_id,
            {'name': name, **existing.model_dump(mode='json')},
            existing=existing,
            touch_progress=False,
        )
        await self._repository.upsert_save(self._user_id, world_card_id, save)
        return save

    async def delete(self, world_card_id: str, slot_id: str):
        await self._repository.delete_save(self._user_id, world_card_id, slot_id)
        current = await self._repository.get_current_save_slot(self._user_id, world_card_id)
        if current == slot_id:
            await self._repository.set_current_save_slot(self._user_id, world_card_id, None)

    async def get_current_slot(self, world_card_id: str) -> str | None:
        return await self._repository.get_current_save_slot(self._user_id, world_card_id)

    async def set_current_slot(self, world_card_id: str, slot_id: str | None):
        await self._repository.set_current_save_slot(self._user_id, world_card_id, slot_id)

    def _summary(self, save: GameSave) -> SaveSlotSummary:
        return SaveSlotSummary(
            id=save.id,
            owner_world_card_id=save.owner_world_card_id,
            name=save.name,
            created_at=save.created_at,
            updated_at=save.updated_at,
            progress_updated_at=save.progress_updated_at,
            schema_version=save.schema_version,
            active_world_card_id=save.active_world_card_id,
            save_source=save.save_source,
        )

    def _slot_ids(self) -> list[str]:
        return [f'slot_{idx}' for idx in range(1, self.MAX_SLOTS + 1)]
