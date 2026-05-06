from __future__ import annotations

import json
import re
from typing import Any, Literal, Optional

from pydantic import BaseModel, Field, field_validator, model_validator

from sandbox_game.model.llm import InventoryDelta, PanelStatusUpdate, TurnChoice
from sandbox_game.model.save import GameSave
from sandbox_game.model.world_card import WorldCard


class ToolValidationError(ValueError):
    pass


class ToolResult(BaseModel):
    ok: bool = Field(
        ...,
    )
    message: str = Field(
        default='',
    )
    data: dict[str, Any] = Field(
        default_factory=dict,
    )


class GetNpcCardInput(BaseModel):
    npc_id: str = Field(
        ...,
        min_length=1,
    )


class GetNpcReactionInput(BaseModel):
    npc_id: str = Field(
        ...,
        min_length=1,
    )
    turns: int = Field(
        default=1,
        ge=1,
        le=20,
    )


class GetSmsHistoryInput(BaseModel):
    contact_id: str = Field(
        ...,
        min_length=1,
        max_length=80,
    )
    limit: int = Field(
        default=10,
        ge=1,
        le=50,
    )
    offset: int = Field(
        default=0,
        ge=0,
        le=1000,
    )


class GetRawNarrativeInput(BaseModel):
    turn_number: Optional[int] = Field(
        default=None,
        ge=1,
    )
    turn_numbers: list[int] = Field(
        default_factory=list,
        max_length=3,
    )

    @field_validator('turn_numbers')
    @classmethod
    def check_turn_numbers(cls, value: list[int]) -> list[int]:
        if any(item < 1 for item in value):
            raise ToolValidationError('turn_numbers must be positive integers.')
        return value

    @model_validator(mode='after')
    def require_turn_reference(self):
        if self.turn_number is None and not self.turn_numbers:
            raise ToolValidationError('Provide turn_number or turn_numbers.')
        return self


class GetStorySummaryInput(BaseModel):
    depth: Literal['recent', 'full'] = Field(
        default='recent',
    )
    from_turn: Optional[int] = Field(
        default=None,
        ge=0,
    )
    to_turn: Optional[int] = Field(
        default=None,
        ge=0,
    )

    @model_validator(mode='after')
    def check_range(self):
        if self.from_turn is not None and self.to_turn is not None and self.from_turn > self.to_turn:
            raise ToolValidationError('from_turn cannot be greater than to_turn.')
        return self


class SearchWorldInput(BaseModel):
    query: str = Field(
        ...,
        min_length=1,
        max_length=80,
    )

    @field_validator('query')
    @classmethod
    def normalize_query(cls, value: str) -> str:
        value = re.sub(r'\s+', ' ', value).strip()
        if not value:
            raise ToolValidationError('query cannot be empty.')
        return value


class GetRuleInput(BaseModel):
    module_id: str = Field(
        ...,
        min_length=1,
        max_length=80,
    )


class UpdateItemInput(BaseModel):
    name: str = Field(
        ...,
        min_length=1,
        max_length=40,
    )
    delta: int = Field(
        ...,
    )
    desc: Optional[str] = Field(
        default=None,
        max_length=240,
    )
    icon: Optional[str] = Field(
        default=None,
        max_length=20,
    )

    @field_validator('name')
    @classmethod
    def normalize_name(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ToolValidationError('item name cannot be empty.')
        return value

    @field_validator('delta')
    @classmethod
    def check_delta(cls, value: int) -> int:
        if value == 0:
            raise ToolValidationError('delta must be a non-zero integer.')
        if abs(value) > 999999:
            raise ToolValidationError('delta is unreasonably large.')
        return value


class SendSmsInput(BaseModel):
    from_npc_id: str = Field(
        ...,
        min_length=1,
        max_length=80,
    )
    message: str = Field(
        ...,
        min_length=1,
        max_length=1000,
    )
    mood: Optional[str] = Field(
        default=None,
        max_length=20,
    )


class SendNotificationInput(BaseModel):
    type: Literal['environment', 'system', 'danger'] = Field(
        ...,
    )
    text: str = Field(
        ...,
        min_length=1,
        max_length=400,
    )


class NewNpcInput(BaseModel):
    id: str = Field(
        ...,
        min_length=1,
        max_length=80,
        pattern=r'^[a-z][a-z0-9_]*$',
    )
    name: str = Field(
        ...,
        min_length=1,
        max_length=40,
    )
    fields: dict[str, Any] = Field(
        default_factory=dict,
    )

    @model_validator(mode='after')
    def check_fields(self):
        if any(key in self.fields for key in {'trigger_type', 'id', 'name'}):
            raise ToolValidationError('fields must not include trigger_type, id, or name.')
        return self


class UpdateNpcInput(BaseModel):
    id: str = Field(
        ...,
        min_length=1,
        max_length=80,
    )
    fields: dict[str, Any] = Field(
        ...,
        min_length=1,
    )

    @model_validator(mode='after')
    def check_fields(self):
        locked = {'trigger_type', 'id', 'name', 'gender', 'origin', 'birthday', 'age'}
        bad = locked.intersection(self.fields)
        if bad:
            raise ToolValidationError(f'Cannot update locked NPC fields: {", ".join(sorted(bad))}.')
        if not any(value is not None for value in self.fields.values()):
            raise ToolValidationError('At least one NPC field must have a non-null value.')
        return self


class LoadPredefinedNpcInput(BaseModel):
    id: str = Field(
        ...,
        min_length=1,
        max_length=80,
    )


class ReactToolContext:
    def __init__(self,
                 world_card: WorldCard | None,
                 save: GameSave | None,
                 collected_data: dict[str, Any] | None = None,
                 ):
        self.world_card = world_card
        self.save = save
        self.collected_data = collected_data or {}
        self.inventory_changes: list[InventoryDelta] = []
        self.sms_messages: list[dict[str, Any]] = []
        self.notifications: list[dict[str, Any]] = []
        self.npc_updates: list[dict[str, Any]] = []
        self.tool_log: list[dict[str, Any]] = []

    def get_state(self) -> ToolResult:
        save = self.save
        data = {
            'location': self._dump(save.location) if save else None,
            'game_time': self._dump(save.game_time) if save else None,
            'player_state': self._dump(save.player_state_data) if save else None,
            'inventory': self._dump(save.inventory_data) if save else None,
            'custom_status': save.custom_status_data if save else None,
            'known_npc_ids': sorted(self._active_npcs().keys()),
            'predefined_npc_ids': sorted(self._predefined_npcs().keys()),
        }
        return self._record('get_state', {}, data)

    def get_story_summary(self,
                          args: GetStorySummaryInput,
                          ) -> ToolResult:
        summaries = self.save.summaries if self.save and self.save.summaries else []
        if not summaries:
            return self._record('get_story_summary', args.model_dump(), {'summaries': []}, '目前没有剧情摘要。')

        filtered = summaries
        if args.from_turn is not None or args.to_turn is not None:
            lower = args.from_turn if args.from_turn is not None else 0
            upper = args.to_turn if args.to_turn is not None else 10**12
            filtered = [
                item for item in summaries
                if item.turn_number is not None and lower <= item.turn_number <= upper
            ]
        elif args.depth == 'recent':
            filtered = [item for item in summaries if item.type == 'turn'][-5:]

        data = {'summaries': [self._dump(item) for item in filtered if item.text]}
        return self._record('get_story_summary', args.model_dump(), data)

    def get_raw_narrative(self,
                          args: GetRawNarrativeInput,
                          ) -> ToolResult:
        turns = args.turn_numbers[:3] if args.turn_numbers else [args.turn_number]
        history = self.save.history if self.save else []
        results = []
        for turn in [item for item in turns if item is not None]:
            ai_index = None
            ai_message = None
            for index, message in enumerate(history):
                if message.sender != 'ai':
                    continue
                if self._turn_number(message, index) == turn:
                    ai_index = index
                    ai_message = message
                    break
            if not ai_message:
                results.append({'turn_number': turn, 'found': False})
                continue
            player_text = None
            if ai_index is not None and ai_index > 0:
                previous = history[ai_index - 1]
                if previous.sender == 'user':
                    player_text = previous.text
            results.append({
                'turn_number': turn,
                'found': True,
                'player': player_text,
                'ai': ai_message.text,
            })
        return self._record('get_raw_narrative', args.model_dump(), {'turns': results})

    def get_npc_card(self,
                     args: GetNpcCardInput,
                     ) -> ToolResult:
        npc_id = args.npc_id.strip()
        candidates = self._all_npcs()

        if npc_id in candidates:
            return self._record('get_npc_card', args.model_dump(), {'npc': candidates[npc_id]})

        normalized = self._normalize_npc_lookup(npc_id)
        for key, value in candidates.items():
            if self._normalize_npc_lookup(key) == normalized:
                return self._record('get_npc_card', args.model_dump(), {'npc': value, 'matched_id': key})
            if self._normalize_npc_lookup(str(value.get('name', ''))) == normalized:
                return self._record('get_npc_card', args.model_dump(), {'npc': value, 'matched_id': key})

        return self._record(
            'get_npc_card',
            args.model_dump(),
            {},
            f'未找到 NPC: {npc_id}',
            ok=False,
        )

    def get_npc_reaction(self,
                         args: GetNpcReactionInput,
                         ) -> ToolResult:
        data = self.save.npc_reaction_data if self.save else None
        if not data:
            return self._record(
                'get_npc_reaction',
                args.model_dump(),
                {'npc_id': args.npc_id, 'reactions': []},
                '该 NPC 没有近期自主决策记录。',
            )
        selected_turns = data.turn_order[-args.turns:]
        reactions = []
        for turn_id in selected_turns:
            turn = data.reactions.get(turn_id, {})
            entry = turn.get(args.npc_id)
            if entry:
                reactions.append({
                    'turn_uid': turn_id,
                    'name': entry.name,
                    'text': entry.text,
                    'decision': entry.decision,
                })
        return self._record(
            'get_npc_reaction',
            args.model_dump(),
            {'npc_id': args.npc_id, 'reactions': reactions},
        )

    def get_sms_history(self,
                        args: GetSmsHistoryInput,
                        ) -> ToolResult:
        conversations = self.save.sms_data.conversations if self.save and self.save.sms_data else {}
        messages = conversations.get(args.contact_id) or []
        start = max(len(messages) - args.offset - args.limit, 0)
        end = len(messages) - args.offset if args.offset else len(messages)
        selected = messages[start:end]
        return self._record(
            'get_sms_history',
            args.model_dump(),
            {
                'contact_id': args.contact_id,
                'messages': [self._dump(item) for item in selected],
            },
        )

    def search_world(self,
                     args: SearchWorldInput,
                     ) -> ToolResult:
        query = args.query.lower()
        results = []
        for npc_id, npc in self._all_npcs().items():
            text = json.dumps(npc, ensure_ascii=False, default=str).lower()
            if query in text:
                results.append({
                    'source': 'npc',
                    'id': npc_id,
                    'name': npc.get('name') or npc_id,
                    'snippet': self._snippet(npc),
                })

        snapshot = self._world_snapshot()
        for entity_id, text in self._world_entities(snapshot).items():
            if query in text.lower():
                results.append({
                    'source': 'world_setting',
                    'id': entity_id,
                    'snippet': self._snippet(text),
                })

        for event in self._timeline_events(snapshot):
            text = json.dumps(event, ensure_ascii=False, default=str)
            if query in text.lower():
                results.append({
                    'source': 'timeline',
                    'id': str(event.get('id') or event.get('time') or len(results)),
                    'snippet': self._snippet(text),
                })

        for module_id, text in self._prompt_modules(snapshot).items():
            if query in text.lower():
                results.append({
                    'source': 'rule',
                    'id': module_id,
                    'snippet': self._snippet(text),
                })

        history = self.save.history if self.save else []
        for index, message in enumerate(history):
            if not message.text or query not in message.text.lower():
                continue
            results.append({
                'source': 'player_action' if message.sender == 'user' else 'narrative',
                'turn_number': self._turn_number(message, index),
                'snippet': self._snippet(message.text),
            })

        return self._record(
            'search_world',
            args.model_dump(),
            {'query': args.query, 'results': results[:30]},
            '' if results else f'未找到与 "{args.query}" 相关的内容。',
            ok=bool(results),
        )

    def get_rule(self,
                 args: GetRuleInput,
                 ) -> ToolResult:
        modules = self._prompt_modules(self._world_snapshot())
        if args.module_id not in modules:
            return self._record(
                'get_rule',
                args.model_dump(),
                {'available_modules': sorted(modules.keys())},
                f'规则模块不可用: {args.module_id}',
                ok=False,
            )
        return self._record(
            'get_rule',
            args.model_dump(),
            {'module_id': args.module_id, 'text': modules[args.module_id]},
        )

    def update_item(self,
                    args: UpdateItemInput,
                    ) -> ToolResult:
        current_count = self._inventory_count(args.name)
        if args.delta < 0 and current_count + args.delta < 0:
            raise ToolValidationError(
                f'Cannot remove {-args.delta} {args.name}; current count is {current_count}.'
            )

        change = InventoryDelta(
            name=args.name,
            delta=args.delta,
            desc=args.desc,
            icon=args.icon,
        )
        self.inventory_changes.append(change)
        data = {
            'name': args.name,
            'count_before': current_count,
            'count_after': current_count + args.delta,
            'delta': args.delta,
        }
        return self._record('update_item', args.model_dump(), data)

    def send_sms(self,
                 args: SendSmsInput,
                 ) -> ToolResult:
        if not self._known_npc(args.from_npc_id):
            raise ToolValidationError(f'Cannot send SMS from unknown NPC: {args.from_npc_id}.')
        payload = args.model_dump()
        self.sms_messages.append(payload)
        return self._record('send_sms', payload, {'delivered': True})

    def send_notification(self,
                          args: SendNotificationInput,
                          ) -> ToolResult:
        payload = args.model_dump()
        self.notifications.append(payload)
        return self._record('send_notification', payload, {'shown': True})

    def new_npc(self,
                args: NewNpcInput,
                ) -> ToolResult:
        active = self._active_npcs()
        predefined = self._predefined_npcs()
        if args.id in active:
            raise ToolValidationError(f'NPC already exists; use update_npc for {args.id}.')
        predefined_match = self._resolve_predefined(args.id) or self._resolve_predefined(args.name)
        if predefined_match:
            raise ToolValidationError(
                f'{args.name} appears to be predefined NPC {predefined_match}; use load_predefined_npc.'
            )
        if args.id in predefined:
            raise ToolValidationError(f'NPC is predefined; use load_predefined_npc for {args.id}.')
        card = {
            'id': args.id,
            'name': args.name,
            **args.fields,
            'trigger_type': 'NEW',
        }
        self.npc_updates.append(card)
        return self._record('new_npc', args.model_dump(), {'status': 'created', 'card': card})

    def update_npc(self,
                   args: UpdateNpcInput,
                   ) -> ToolResult:
        active = self._active_npcs()
        if args.id not in active:
            raise ToolValidationError(f'Cannot update unknown or inactive NPC: {args.id}.')
        current = dict(active[args.id])
        updated = {
            'id': args.id,
            'trigger_type': 'UPDATE',
            **args.fields,
        }
        self.npc_updates.append(updated)
        changed = sorted(args.fields.keys())
        return self._record(
            'update_npc',
            args.model_dump(),
            {'status': 'pending_review', 'id': args.id, 'requested_changes': changed, 'current_card': current},
        )

    def load_predefined_npc(self,
                            args: LoadPredefinedNpcInput,
                            ) -> ToolResult:
        active = self._active_npcs()
        if args.id in active:
            raise ToolValidationError(f'NPC already active; use get_npc_card or update_npc for {args.id}.')
        predefined = self._predefined_npcs()
        if args.id not in predefined:
            raise ToolValidationError(f'Unknown predefined NPC: {args.id}.')
        card = {
            **predefined[args.id],
            'id': predefined[args.id].get('id') or args.id,
            'trigger_type': 'NEW_PREDEFINED',
        }
        if 'cognitive_state' not in card and card.get('default_cognitive_state'):
            card['cognitive_state'] = card['default_cognitive_state']
        self.npc_updates.append({'id': args.id, 'trigger_type': 'NEW_PREDEFINED'})
        return self._record('load_predefined_npc', args.model_dump(), {'status': 'loaded', 'card': card})

    def build_panel_update(self,
                           settlement: PanelStatusUpdate | None,
                           ) -> PanelStatusUpdate | None:
        if not settlement:
            return None
        if settlement.datetime:
            self._validate_datetime(settlement.datetime)
        return settlement

    def build_choices(self,
                      choices: list[TurnChoice],
                      ) -> list[TurnChoice]:
        seen = set()
        result = []
        for choice in choices:
            key = choice.text.strip()
            if not key or key in seen:
                continue
            seen.add(key)
            result.append(choice)
        if not result:
            raise ToolValidationError('At least one choice is required.')
        return result[:3]

    def tool_side_effects(self) -> dict[str, Any]:
        return {
            'inventory_changes': [item.model_dump(mode='json') for item in self.inventory_changes],
            'sms_messages': self.sms_messages,
            'notifications': self.notifications,
            'npc_updates': self.npc_updates,
            'tool_log': self.tool_log,
        }

    def available_rule_modules(self) -> list[str]:
        return sorted(self._prompt_modules(self._world_snapshot()).keys())

    def active_npc_ids(self) -> list[str]:
        return sorted(self._active_npcs().keys())

    def predefined_npc_ids(self) -> list[str]:
        return sorted(self._predefined_npcs().keys())

    def _inventory_count(self, name: str) -> int:
        total = 0
        if self.save and self.save.inventory_data:
            for item in self.save.inventory_data.items:
                if item.name == name:
                    total += item.count
        for change in self.inventory_changes:
            if change.name == name:
                total += change.delta
        return total

    def _known_npc(self, npc_id: str) -> bool:
        if not npc_id:
            return False
        if self.get_npc_card(GetNpcCardInput(npc_id=npc_id)).ok:
            return True
        return False

    def _active_npcs(self) -> dict[str, Any]:
        if self.save and self.save.npc_data:
            return {
                key: value for key, value in self.save.npc_data.npc_data.items()
                if isinstance(value, dict) and not key.startswith('_')
            }
        return {}

    def _predefined_npcs(self) -> dict[str, Any]:
        candidates: dict[str, Any] = {}
        if self.save and self.save.npc_data:
            candidates.update({
                key: value for key, value in self.save.npc_data.predefined_pool.items()
                if isinstance(value, dict) and not key.startswith('_')
            })
        snapshot = self._world_snapshot()
        char_db = snapshot.get('character_database') or {}
        for key, value in char_db.items():
            if isinstance(value, dict) and not key.startswith('_') and key not in self._active_npcs():
                candidates[key] = value
        return candidates

    def _all_npcs(self) -> dict[str, Any]:
        candidates = {}
        candidates.update(self._predefined_npcs())
        candidates.update(self._active_npcs())
        return candidates

    def _resolve_predefined(self, lookup: str) -> str | None:
        normalized = self._normalize_npc_lookup(lookup)
        if not normalized:
            return None
        for npc_id, npc in self._predefined_npcs().items():
            if self._normalize_npc_lookup(npc_id) == normalized:
                return npc_id
            if self._normalize_npc_lookup(str(npc.get('name') or '')) == normalized:
                return npc_id
        return None

    def _world_snapshot(self) -> dict[str, Any]:
        if not self.world_card:
            return {}
        return self.world_card.snapshot.model_dump(mode='json', by_alias=True)

    def _world_entities(self, snapshot: dict[str, Any]) -> dict[str, str]:
        settings = (snapshot.get('world_setting') or {}).get('settings') or {}
        entities = {}
        for key, value in settings.items():
            if isinstance(value, str):
                entities[key] = value
        if self.save and self.save.entities:
            for key, value in self.save.entities.entities.items():
                entities[key] = value.text
        return entities

    def _timeline_events(self, snapshot: dict[str, Any]) -> list[dict[str, Any]]:
        events = (snapshot.get('timeline') or {}).get('events') or []
        result = [event for event in events if isinstance(event, dict)]
        if self.save and self.save.timeline_events:
            result.extend(
                event.model_dump(mode='json') if hasattr(event, 'model_dump') else event
                for event in self.save.timeline_events.events
            )
        return [event for event in result if isinstance(event, dict)]

    def _prompt_modules(self, snapshot: dict[str, Any]) -> dict[str, str]:
        modules = (snapshot.get('prompt_modules') or {}).get('modules') or {}
        return {
            key: value for key, value in modules.items()
            if isinstance(value, str) and key not in {'core_world_mechanics', 'narrative_base'}
        }

    def _turn_number(self, message: Any, index: int) -> int:
        if getattr(message, 'uid', None):
            match = re.search(r'(?:turn|T|t)[_-]?(\d+)', str(message.uid))
            if match:
                return int(match.group(1))
        return index // 2 + 1

    def _snippet(self, value: Any, limit: int = 180) -> str:
        if not isinstance(value, str):
            value = json.dumps(value, ensure_ascii=False, default=str)
        value = re.sub(r'\s+', ' ', value).strip()
        if len(value) <= limit:
            return value
        return value[:limit - 1] + '…'

    def _normalize_npc_lookup(self, value: str) -> str:
        return re.sub(r'[\s_\-]+', '', str(value or '').lower())

    def _validate_datetime(self, value: dict[str, Any]):
        hour = value.get('hour')
        minute = value.get('minute', 0)
        month = value.get('month')
        day = value.get('day')
        if hour is not None and not 0 <= int(hour) <= 23:
            raise ToolValidationError('hour must be between 0 and 23.')
        if minute is not None and not 0 <= int(minute) <= 59:
            raise ToolValidationError('minute must be between 0 and 59.')
        if month is not None and not 1 <= int(month) <= 12:
            raise ToolValidationError('month must be between 1 and 12.')
        if day is not None and not 1 <= int(day) <= 31:
            raise ToolValidationError('day must be between 1 and 31.')

    def _record(self,
                name: str,
                args: dict[str, Any],
                data: dict[str, Any],
                message: str = '',
                ok: bool = True,
                ) -> ToolResult:
        result = ToolResult(
            ok=ok,
            message=message,
            data=data,
        )
        self.tool_log.append({
            'name': name,
            'args': args,
            'result': result.model_dump(mode='json'),
        })
        return result

    def _dump(self, value: Any) -> Any:
        if value is None:
            return None
        if hasattr(value, 'model_dump'):
            return value.model_dump(mode='json')
        return value


def tool_result_json(result: ToolResult) -> str:
    return json.dumps(result.model_dump(mode='json'), ensure_ascii=False)
