from typing import Any, Literal, Optional
from pydantic import BaseModel, Field


class MapCoordinates(BaseModel):
    row: Optional[int] = Field(
        default=None,
    )
    col: Optional[int] = Field(
        default=None,
    )
    terrain: Optional[str] = Field(
        default=None,
    )
    layer: Optional[Literal['world', 'local'] | str] = Field(
        default=None,
    )
    landmark: Optional[str] = Field(
        default=None,
    )
    landmark_id: Optional[str] = Field(
        default=None,
    )
    site_name: Optional[str] = Field(
        default=None,
    )
    location_name: Optional[str] = Field(
        default=None,
    )


class MapPosition(BaseModel):
    row: int = Field(
        default=0,
    )
    col: int = Field(
        default=0,
    )


class CountryMapData(BaseModel):
    world_map: list[Any] = Field(
        default_factory=list,
    )
    local_map_cache: dict[str, list[Any]] = Field(
        default_factory=dict,
    )
    world_player_pos: MapPosition = Field(
        default=MapPosition(row=1, col=1),
    )


class MapData(BaseModel):
    current_country_id: Optional[str] = Field(
        default=None,
    )
    country_maps: dict[str, CountryMapData] = Field(
        default_factory=dict,
    )
    local_map: list[Any] = Field(
        default_factory=list,
    )
    layer: Literal['world', 'local'] | str = Field(
        default='world',
    )
    local_player_pos: MapPosition = Field(
        default=MapPosition(),
    )
    active_landmark: Optional[dict[str, Any]] = Field(
        default=None,
    )
