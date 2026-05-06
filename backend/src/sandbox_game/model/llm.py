from typing import Any, Literal, Optional

from pydantic import BaseModel, Field

from sandbox_game.etc.enums import LlmProviderType
from sandbox_game.model.chat import ChatMessage


class LlmModuleConfig(BaseModel):
    provider: LlmProviderType = Field(
        default=LlmProviderType.OPENAI,
    )
    model: str = Field(
        default='gpt-5.4',
    )
    custom_provider_id: Optional[int] = Field(
        default=None,
    )
    base_url: Optional[str] = Field(
        default=None,
    )
    temperature: Optional[float] = Field(
        default=None,
    )
    max_tokens: Optional[int] = Field(
        default=None,
    )


class TurnChoice(BaseModel):
    id: Literal['A', 'B', 'C'] | str = Field(
        ...,
    )
    text: str = Field(
        ...,
    )
    type: Literal['explore', 'trade', 'travel', 'work', 'talk', 'action'] | str = Field(
        default='action',
    )
    time_effect: Literal['low', 'medium', 'high', 'extra'] | str = Field(
        default='low',
    )
    money_delta: Optional[int] = Field(
        default=None,
    )


class PanelStatusUpdate(BaseModel):
    datetime: Optional[dict[str, Any]] = Field(
        default=None,
    )
    location: Optional[dict[str, Any]] = Field(
        default=None,
    )
    objective: Optional[dict[str, Any]] = Field(
        default=None,
    )
    money: Optional[dict[str, Any]] = Field(
        default=None,
    )
    custom: dict[str, Any] = Field(
        default_factory=dict,
    )


class InventoryDelta(BaseModel):
    name: str = Field(
        ...,
    )
    delta: int = Field(
        ...,
    )
    desc: Optional[str] = Field(
        default=None,
    )
    icon: Optional[str] = Field(
        default=None,
    )


class GameTurnData(BaseModel):
    narrative: str = Field(
        ...,
    )
    choices: list[TurnChoice] = Field(
        default_factory=list,
        min_length=1,
        max_length=3,
    )
    panel_status: Optional[PanelStatusUpdate] = Field(
        default=None,
    )
    npc_updates: list[dict[str, Any]] = Field(
        default_factory=list,
    )
    inventory_changes: list[InventoryDelta] = Field(
        default_factory=list,
    )
    timeline_events: list[dict[str, Any]] = Field(
        default_factory=list,
    )


class OocStageResult(BaseModel):
    mode: Literal['commit', 'continue', 'ask'] = Field(
        ...,
    )
    directive: Optional[str] = Field(
        default=None,
    )
    question: Optional[str] = Field(
        default=None,
    )


class GenerateTurnRequest(BaseModel):
    message: str = Field(
        ...,
    )
    world_card_id: Optional[str] = Field(
        default=None,
    )
    save_slot_id: Optional[str] = Field(
        default=None,
    )
    history: list[ChatMessage] = Field(
        default_factory=list,
    )
    collected_data: dict[str, Any] = Field(
        default_factory=dict,
    )
    ooc_candidates: list[str] = Field(
        default_factory=list,
    )
    ooc_question: Optional[str] = Field(
        default=None,
    )
    ooc_answer: Optional[str] = Field(
        default=None,
    )
    llm: LlmModuleConfig = Field(
        ...,
    )
    autosave: bool = Field(
        default=True,
    )


class GenerateTurnResponse(BaseModel):
    text: str = Field(
        ...,
    )
    data: GameTurnData = Field(
        ...,
    )
    model: str = Field(
        ...,
    )
    provider: LlmProviderType = Field(
        ...,
    )
    save_slot_id: Optional[str] = Field(
        default=None,
    )
    ooc: Optional[OocStageResult] = Field(
        default=None,
    )
    usage: Optional[dict[str, Any]] = Field(
        default=None,
    )


class LlmTextRequest(BaseModel):
    text: str = Field(
        ...,
    )
    llm: LlmModuleConfig = Field(
        ...,
    )


class LlmTextResponse(BaseModel):
    text: str = Field(
        ...,
    )
    model: str = Field(
        ...,
    )
    provider: LlmProviderType = Field(
        ...,
    )
    usage: Optional[dict[str, Any]] = Field(
        default=None,
    )


class SmsGenerateRequest(BaseModel):
    contact: dict[str, Any] = Field(
        ...,
    )
    message: str = Field(
        ...,
    )
    context: dict[str, Any] = Field(
        default_factory=dict,
    )
    history: list[dict[str, Any]] = Field(
        default_factory=list,
    )
    llm: LlmModuleConfig = Field(
        ...,
    )


class OocNormalizeRequest(BaseModel):
    candidates: list[str] = Field(
        ...,
    )
    player_answer: Optional[str] = Field(
        default=None,
    )
    previous_question: Optional[str] = Field(
        default=None,
    )
    llm: LlmModuleConfig = Field(
        ...,
    )
