from typing import Optional
from pydantic import BaseModel, Field


class InventoryItem(BaseModel):
    name: str = Field(
        ...,
    )
    count: int = Field(
        default=0,
    )
    desc: str = Field(
        default='',
    )
    icon: Optional[str] = Field(
        default=None,
    )


class InventoryPendingChange(BaseModel):
    id: str = Field(
        ...,
    )
    name: str = Field(
        ...,
    )
    delta: int = Field(
        ...,
    )
    desc_before: Optional[str] = Field(
        default=None,
    )
    desc_after: Optional[str] = Field(
        default=None,
    )
    count_before: int = Field(
        default=0,
    )
    count_after: int = Field(
        default=0,
    )
    turn: int = Field(
        default=0,
    )
    uid: Optional[str] = Field(
        default=None,
    )


class InventoryChangeLogEntry(BaseModel):
    uid: Optional[str] = Field(
        default=None,
    )
    turn: int = Field(
        default=0,
    )
    name: str = Field(
        ...,
    )
    prev_count: int = Field(
        default=0,
    )
    prev_desc: str = Field(
        default='',
    )
    prev_icon: Optional[str] = Field(
        default=None,
    )
    prev_existed: bool = Field(
        ...,
    )
    delta: int = Field(
        ...,
    )


class InventoryData(BaseModel):
    items: list[InventoryItem] = Field(
        default_factory=list,
    )
    pending_changes: list[InventoryPendingChange] = Field(
        default_factory=list,
    )
    pending_seq: int = Field(
        default=0,
    )
    current_turn: int = Field(
        default=0,
    )
    change_log: list[InventoryChangeLogEntry] = Field(
        default_factory=list,
    )
