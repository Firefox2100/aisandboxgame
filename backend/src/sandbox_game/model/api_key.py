from typing import Optional
from pydantic import BaseModel, Field

from sandbox_game.etc.enums import LlmProviderType


class ApiKey(BaseModel):
    """
    An API key that the user supplies when using LLM providers.
    """

    key_id: int = Field(
        ...,
        description='The unique identifier for the API key.',
    )
    user_id: int = Field(
        ...,
        description='The ID of the user who owns this API key.',
    )
    provider: LlmProviderType = Field(
        ...,
        description='The LLM provider that this API key is associated with.',
    )
    custom_provider_id: Optional[int] = Field(
        ...,
        description='The ID of the custom provider that this API key is used for, if applicable.',
    )


class ApiKeyStoreRequest(BaseModel):
    provider: LlmProviderType = Field(
        ...,
        description='The LLM provider that this API key is associated with.',
    )
    api_key: str = Field(
        ...,
        description='The raw API key. It is stored in KMS, not the application database.',
    )
    custom_provider_id: Optional[int] = Field(
        default=None,
        description='The custom provider id when provider is custom.',
    )


class ApiKeyStatus(BaseModel):
    provider: LlmProviderType = Field(
        ...,
    )
    custom_provider_id: Optional[int] = Field(
        default=None,
    )
    exists: bool = Field(
        ...,
    )
