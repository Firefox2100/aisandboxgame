from typing import Literal, Optional, Any
from pydantic import BaseModel, Field

from sandbox_game.model.common import GameDate, LocationPoint
from sandbox_game.model.map import MapCoordinates


class LocationData(BaseModel):
    current: Optional[LocationPoint] = Field(
        default=None,
    )
    map_coordinates: Optional[MapCoordinates] = Field(
        default=None,
    )
    enter_turn: int = Field(
        default=0,
    )
    scenes_today: int = Field(
        default=1,
    )
    current_day: Optional[str] = Field(
        default=None,
    )


class GameTimeData(BaseModel):
    current_date: Optional[GameDate | dict[str, Any]] = Field(
        default=None,
    )
    triggered_event_ids: dict[str, Optional[str]] = Field(
        default_factory=dict,
    )


class PlayerStateData(BaseModel):
    current_objective: Optional[str] = Field(
        default=None,
    )
    previous_turn_date: Optional[GameDate | dict[str, Any]] = Field(
        default=None,
    )
    previous_turn_location: Optional[LocationPoint | dict[str, Any]] = Field(
        default=None,
    )


class EntityEntry(BaseModel):
    text: str = Field(
        ...,
    )
    origin: Literal['predefined', 'expanded'] | str = Field(
        default='predefined',
    )


class EntityStoreData(BaseModel):
    entities: dict[str, EntityEntry] = Field(
        default_factory=dict,
    )
    narrative_core_characters: dict[str, list[str]] = Field(
        default_factory=dict,
    )
    summary: str = Field(
        default='',
    )


class TimelineEvent(BaseModel):
    origin: Literal['predefined', 'expanded'] | str = Field(
        default='predefined',
    )


class TimelineEventsData(BaseModel):
    events: list[TimelineEvent] = Field(
        default_factory=list,
    )
    summary: str = Field(
        default='',
    )
