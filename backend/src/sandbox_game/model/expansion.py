from typing import Any, Optional

from pydantic import BaseModel, Field, field_validator

from sandbox_game.model.llm import LlmModuleConfig


class ExpandWorldRequest(BaseModel):
    context: str = Field(
        ...,
        min_length=1,
        max_length=4000,
    )
    save_slot_id: Optional[str] = Field(
        default=None,
    )
    llm: LlmModuleConfig = Field(
        ...,
    )
    apply: bool = Field(
        default=True,
    )

    @field_validator('context')
    @classmethod
    def normalize_context(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError('context cannot be empty.')
        return value


class ExpandCharactersRequest(BaseModel):
    context: str = Field(
        ...,
        min_length=1,
        max_length=4000,
    )
    save_slot_id: Optional[str] = Field(
        default=None,
    )
    llm: LlmModuleConfig = Field(
        ...,
    )
    apply: bool = Field(
        default=True,
    )

    @field_validator('context')
    @classmethod
    def normalize_context(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError('context cannot be empty.')
        return value


class WorldExpansionData(BaseModel):
    settings: dict[str, str] = Field(
        default_factory=dict,
    )
    narrative_core_characters: dict[str, list[str]] = Field(
        default_factory=dict,
        alias='_narrativeCoreCharacters',
    )
    summary: str = Field(
        default='',
        alias='_summary',
    )


class CharacterExpansionData(BaseModel):
    character_database: dict[str, dict[str, Any]] = Field(
        default_factory=dict,
    )
    relationship_rules: dict[str, dict[str, Any]] = Field(
        default_factory=dict,
    )
    summary: str = Field(
        default='',
        alias='_summary',
    )


class ExpansionResponse(BaseModel):
    applied: bool = Field(
        ...,
    )
    save_slot_id: Optional[str] = Field(
        default=None,
    )
    world_card_id: str = Field(
        ...,
    )
    added_ids: list[str] = Field(
        default_factory=list,
    )
    data: WorldExpansionData | CharacterExpansionData = Field(
        ...,
    )
