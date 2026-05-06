from typing import Any, Literal, Optional
from pydantic import BaseModel, Field


class ChatOocData(BaseModel):
    normalized: str = Field(
        ...,
    )
    raw: list[Any] = Field(
        default_factory=list,
    )


class ChatGameData(BaseModel):
    panel_status: Optional[dict[str, Any]] = Field(
        default=None,
    )
    choices: list[Any] = Field(
        default_factory=list,
    )
    panel_narrative: Optional[str] = Field(
        default=None,
    )


class ChatMessage(BaseModel):
    sender: str = Field(
        ...,
    )
    text: Optional[str] = Field(
        default=None,
    )
    uid: Optional[str] = Field(
        default=None,
    )
    model_label: Optional[str] = Field(
        default=None,
    )
    provider_key: Optional[str] = Field(
        default=None,
    )
    function_calls: list[Any] = Field(
        default_factory=list,
    )
    reasoning_contents: list[Any] = Field(
        default_factory=list,
    )
    step2_choices: Optional[str] = Field(
        default=None,
    )
    npc_reactions: Optional[dict[str, Any]] = Field(
        default=None,
    )
    metrics: Optional[dict[str, Any]] = Field(
        default=None,
    )
    react_segments: list[Any] = Field(
        default_factory=list,
    )
    game_data: Optional[ChatGameData] = Field(
        default=None,
    )
    ooc: Optional[ChatOocData] = Field(
        default=None,
    )

    # Out-of-character Q&A messages use question/answer instead of text.
    meta: Optional[Literal['ooc_qa'] | str] = Field(
        default=None,
    )
    kind: Optional[str] = Field(
        default=None,
    )
    question: Optional[str] = Field(
        default=None,
    )
    answer: Optional[str] = Field(
        default=None,
    )
    ooc_id: Optional[str] = Field(
        default=None,
    )
    skipped: Optional[bool] = Field(
        default=None,
    )


class SummaryEntry(BaseModel):
    type: Optional[Literal['turn', 'chapter'] | str] = Field(
        default=None,
    )
    text: Optional[str] = Field(
        default=None,
    )
    uid: Optional[str] = Field(
        default=None,
    )
    turn_number: Optional[int] = Field(
        default=None,
    )


class GameSessionPayload(BaseModel):
    game_history: list[ChatMessage] = Field(
        default_factory=list,
    )
    normalized_history: list[ChatMessage] = Field(
        default_factory=list,
    )
    collected_data: dict[str, Any] = Field(
        default_factory=dict,
    )
    collect_errors: list[dict[str, Any]] = Field(
        default_factory=list,
    )
