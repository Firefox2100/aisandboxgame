from typing import Any, Literal, Optional
from pydantic import BaseModel, Field


class AnalyzerOverrideData(BaseModel):
    player_overrides: dict[str, Any] = Field(
        default_factory=dict,
    )


class CharacterStatesData(BaseModel):
    status: Optional[AnalyzerOverrideData] = Field(
        default=None,
    )
    cognitive: Optional[AnalyzerOverrideData] = Field(
        default=None,
    )
    sex_history: Optional[dict[str, Any]] = Field(
        default_factory=dict,
    )
    relationships: Optional[AnalyzerOverrideData] = Field(
        default=None,
    )


class NpcFieldChange(BaseModel):
    old: Any = Field(
        default=None,
    )
    new: Any = Field(
        default=None,
    )
    turn: int = Field(
        default=0,
    )
    uid: Optional[str] = Field(
        default=None,
    )


class NpcPendingUpdate(BaseModel):
    changes: dict[str, NpcFieldChange] = Field(
        default_factory=dict,
    )


class NpcRejectedField(BaseModel):
    value: Any = Field(
        default=None,
    )
    rejected_value: Any = Field(
        default=None,
    )
    turn: int = Field(
        default=0,
    )
    uid: Optional[str] = Field(
        default=None,
    )


class NpcStoreData(BaseModel):
    npc_data: dict[str, dict[str, Any]] = Field(
        default_factory=dict,
    )
    deleted_ids: dict[str, Optional[str]] = Field(
        default_factory=dict,
    )
    rejected_updates: dict[str, dict[str, NpcRejectedField | dict[str, Any]]] = Field(
        default_factory=dict,
    )
    npc_order: list[str] = Field(
        default_factory=list,
    )
    unselected_ids: list[str] = Field(
        default_factory=list,
    )
    pending_updates: dict[str, NpcPendingUpdate] = Field(
        default_factory=dict,
    )
    current_turn: int = Field(
        default=0,
    )
    predefined_pool: dict[str, dict[str, Any]] = Field(
        default_factory=dict,
    )
    char_origin: dict[str, Literal['predefined', 'expanded'] | str] = Field(
        default_factory=dict,
    )
    relationship_rules: dict[str, dict[str, Any]] = Field(
        default_factory=dict,
    )


class NpcReactionEntry(BaseModel):
    name: str = Field(
        default='',
    )
    text: str = Field(
        default='',
    )
    decision: Optional[dict[str, Any]] = Field(
        default=None,
    )


class NpcReactionData(BaseModel):
    reactions: dict[str, dict[str, NpcReactionEntry]] = Field(
        default_factory=dict,
    )
    turn_order: list[str] = Field(
        default_factory=list,
    )


class SmsMessage(BaseModel):
    role: Literal['user', 'assistant', 'system'] | str = Field(
        ...,
    )
    content: str = Field(
        ...,
    )
    timestamp: Optional[int | float] = Field(
        default=None,
    )
    game_time: Optional[dict[str, Any]] = Field(
        default=None,
    )
    relationship: Optional[Any] = Field(
        default=None,
    )
    injection_status: Optional[Literal['new', 'injected'] | str] = Field(
        default=None,
    )
    created_at_uid: Optional[str] = Field(
        default=None,
    )
    is_event_driven: bool = Field(
        default=False,
    )


class SmsData(BaseModel):
    conversations: dict[str, list[SmsMessage]] = Field(
        default_factory=dict,
    )
    unread_counts: dict[str, int] = Field(
        default_factory=dict,
    )
