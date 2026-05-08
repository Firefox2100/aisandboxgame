from pydantic import BaseModel, Field

from sandbox_game.etc.enums import LlmProviderType, UserRole
from sandbox_game.model.api_key import ApiKeyStatus
from sandbox_game.model.user import User


class SystemConfig(BaseModel):
    registration_enabled: bool = Field(
        default=True,
    )
    disabled_builtin_llm_providers: list[LlmProviderType] = Field(
        default_factory=list,
    )


class SystemConfigUpdate(BaseModel):
    registration_enabled: bool = Field(
        default=True,
    )
    disabled_builtin_llm_providers: list[LlmProviderType] = Field(
        default_factory=list,
    )


class UserConfig(BaseModel):
    locale: str = Field(
        default='zh_cn',
    )


class UserConfigUpdate(BaseModel):
    locale: str = Field(
        default='zh_cn',
    )


class UserRoleUpdate(BaseModel):
    role: UserRole = Field(
        ...,
    )


class UserConfigResponse(BaseModel):
    user: User
    config: UserConfig
    api_keys: list[ApiKeyStatus] = Field(
        default_factory=list,
    )
