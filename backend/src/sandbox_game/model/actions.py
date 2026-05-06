from typing import Optional, Any
from pydantic import BaseModel, Field


class GmOpeningGuide(BaseModel):
    pass


class GmData(BaseModel):
    broadcasted_events: dict[str, dict[str, Any]] = Field(
        default_factory=dict,
    )
    opening_guide: Optional[GmOpeningGuide | dict[str, Any]] = Field(
        default=None,
    )


class CollectErrorsGuard(BaseModel):
    has_collect_errors: bool = Field(
        default=False,
    )
    count: int = Field(
        default=0,
    )
    updated_at: Optional[str] = Field(
        default=None,
    )
