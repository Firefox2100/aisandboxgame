from typing import Literal, Optional, Any
from pydantic import BaseModel, Field

from sandbox_game.model.actions import CollectErrorsGuard, GmData
from sandbox_game.model.chat import ChatMessage, SummaryEntry
from sandbox_game.model.common import LocationPoint
from sandbox_game.model.items import InventoryData
from sandbox_game.model.map import MapData
from sandbox_game.model.npc import CharacterStatesData, NpcReactionData, NpcStoreData, SmsData
from sandbox_game.model.world_state import EntityStoreData, GameTimeData, LocationData, PlayerStateData, \
    TimelineEventsData


class GameSave(BaseModel):
    id: str = Field(
        ...,
        description='Save slot id, for example slot_1.'
    )
    owner_world_card_id: str = Field(
        ...,
    )
    name: str = Field(
        ...,
    )
    created_at: str = Field(
        ...,
    )
    updated_at: str = Field(
        ...,
    )
    progress_updated_at: str = Field(
        ...,
    )
    schema_version: int = Field(
        default=5,
    )
    history: list[ChatMessage] = Field(
        default_factory=list,
    )

    summaries: Optional[list[SummaryEntry]] = Field(
        default=None,
    )
    location: Optional[LocationData | LocationPoint | dict[str, Any]] = Field(
        default=None,
    )
    npc_data: Optional[NpcStoreData] = Field(
        default=None,
    )
    sms_data: Optional[SmsData] = Field(
        default=None,
    )
    game_time: Optional[GameTimeData] = Field(
        default=None,
    )
    character_states: Optional[CharacterStatesData] = Field(
        default=None,
    )
    map_data: Optional[MapData] = Field(
        default=None,
    )
    player_state_data: Optional[PlayerStateData] = Field(
        default=None,
    )
    gm_data: Optional[GmData] = Field(
        default=None,
    )
    active_world_card_id: Optional[str] = Field(
        default=None,
    )
    save_source: (
        Literal['manual', 'live', 'auto_transition', 'auto_runtime', 'repair', 'unknown'] | str
    ) = Field(
        default='unknown',
    )

    entities: Optional[EntityStoreData] = Field(
        default=None,
    )
    timeline_events: Optional[TimelineEventsData] = Field(
        default=None,
    )
    inventory_data: Optional[InventoryData] = Field(
        default=None,
    )
    custom_status_data: Optional[dict[str, Any]] = Field(
        default=None,
    )
    npc_reaction_data: Optional[NpcReactionData] = Field(
        default=None,
    )
    collect_errors_guard: Optional[CollectErrorsGuard] = Field(
        default=None,
    )

    repaired: bool = Field(
        default=False,
    )
    migrated: bool = Field(
        default=False,
    )


class SaveSlotSummary(BaseModel):
    id: str = Field(
        ...,
    )
    owner_world_card_id: str = Field(
        ...,
    )
    name: str = Field(
        ...,
    )
    created_at: str = Field(
        ...,
    )
    updated_at: str = Field(
        ...,
    )
    progress_updated_at: str = Field(
        ...,
    )
    schema_version: int = Field(
        default=5,
    )
    active_world_card_id: Optional[str] = Field(
        default=None,
    )
    save_source: Optional[str] = Field(
        default=None,
    )
