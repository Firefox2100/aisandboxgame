from typing import Any, Literal, Optional
from pydantic import BaseModel, Field


class WorldCardPromptModules(BaseModel):
    modules: dict[str, str] = Field(
        default_factory=dict,
    )
    module_meta: dict[str, dict[str, Any]] = Field(
        default_factory=dict,
    )
    opening_greeting: str = Field(
        default='',
    )
    summary: str = Field(
        default='',
        alias='_summary'
    )


class WorldSettingSnapshot(BaseModel):
    settings: dict[str, str] = Field(
        default_factory=dict,
    )
    summary: str = Field(
        default='',
        alias='_summary'
    )


class TimelineSnapshot(BaseModel):
    events: list[dict[str, Any]] = Field(
        default_factory=list,
    )
    summary: str = Field(
        default='',
        alias='_summary'
    )


class WorldCardSnapshot(BaseModel):
    world_setting: Optional[WorldSettingSnapshot | dict[str, Any]] = Field(
        default=None,
    )
    prompt_modules: Optional[WorldCardPromptModules | dict[str, Any]] = Field(
        default=None,
    )
    character_database: dict[str, Any] = Field(
        default_factory=dict,
    )
    relationship_rules: dict[str, Any] = Field(
        default_factory=dict,
    )
    timeline: Optional[TimelineSnapshot | dict[str, Any]] = Field(
        default=None,
    )
    character_timelines: dict[str, Any] = Field(
        default_factory=dict,
    )
    random_opening: Optional[dict[str, Any]] = Field(
        default=None,
    )
    step3_fields: Optional[dict[str, Any]] = Field(
        default=None,
    )
    custom_terrains: list[dict[str, Any]] = Field(
        default_factory=list,
    )
    custom_territories: list[dict[str, Any]] = Field(
        default_factory=list,
    )


class WorldCardLocalization(BaseModel):
    name: str = Field(
        default='',
    )
    description: str = Field(
        default='',
    )
    snapshot: WorldCardSnapshot
    content_locale: Literal['zh-CN', 'en'] | str = Field(
        default='zh-CN',
    )


class WorldCard(BaseModel):
    id: Optional[str] = Field(
        default=None,
    )
    name: str = Field(
        default='',
    )
    description: str = Field(
        default='',
    )
    created_at: Optional[str] = None
    updated_at: Optional[str] = None
    is_built_in: bool = Field(
        default=False,
    )
    content_locale: Literal['zh-CN', 'en'] | str = Field(
        default='zh-CN',
    )
    localizations: dict[str, WorldCardLocalization] = Field(
        default_factory=dict,
    )
    snapshot: WorldCardSnapshot = Field(
        default_factory=WorldCardSnapshot
    )
    design_chat_history: list[dict[str, Any]] = Field(
        default_factory=list,
    )
    design_meta: Optional[dict[str, Any]] = Field(
        default=None,
    )


class WorldCardCreate(BaseModel):
    name: str = Field(
        ...,
    )
    snapshot: WorldCardSnapshot = Field(
        ...,
    )
    description: str = Field(
        default='',
    )
    content_locale: Literal['zh-CN', 'en'] | str = Field(
        default='zh-CN',
    )
    localizations: dict[str, WorldCardLocalization] = Field(
        default_factory=dict,
    )
    design_chat_history: list[dict[str, Any]] = Field(
        default_factory=list,
    )
    design_meta: Optional[dict[str, Any]] = Field(
        default=None,
    )
    allow_empty_snapshot: bool = Field(
        default=False,
    )


class WorldCardSummary(BaseModel):
    id: str = Field(
        ...,
    )
    name: str = Field(
        ...,
    )
    description: str = Field(
        default='',
    )
    created_at: str = Field(
        ...,
    )
    updated_at: str = Field(
        ...,
    )
    is_built_in: bool = Field(
        default=False,
    )
    content_locale: Literal['zh-CN', 'en'] | str = Field(
        default='zh-CN',
    )
