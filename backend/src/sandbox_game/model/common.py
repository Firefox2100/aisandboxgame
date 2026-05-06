from typing import Optional
from pydantic import BaseModel, Field


class LocationPoint(BaseModel):
    country: str = Field(
        default='',
    )
    site: str = Field(
        default='',
    )
    spot: str = Field(
        default='',
    )


class GameDate(BaseModel):
    year: Optional[int | str] = Field(
        default=None,
    )
    month: Optional[int | str] = Field(
        default=None,
    )
    day: Optional[int | str] = Field(
        default=None,
    )
    hour: Optional[int | str] = Field(
        default=None,
    )
    minute: Optional[int | str] = Field(
        default=None,
    )
    time_str: Optional[str] = Field(
        default=None,
    )
