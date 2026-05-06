from fastapi import APIRouter, Depends, HTTPException, status

from sandbox_game.model.api_key import ApiKeyStatus, ApiKeyStoreRequest
from sandbox_game.model.custom_llm_provider import CustomLlmProviderCreate, CustomLlmProvider
from sandbox_game.model.user import User
from sandbox_game.service import DatabaseService, KmsService
from .utils import get_db, get_kms, authenticate_user, authenticate_admin


config_router = APIRouter(
    prefix='/config',
    tags=['Configuration'],
)


@config_router.get('')
async def get_user_config(user: User = Depends(authenticate_user)):
    pass


@config_router.get('/system')
async def get_system_config():
    pass


@config_router.get('/providers', response_model=list[CustomLlmProvider])
async def get_custom_llm_providers(db: DatabaseService = Depends(get_db),
                                   _: User = Depends(authenticate_user),
                                   ):
    providers = await db.list_custom_llm_providers()

    return providers


@config_router.post('/providers', response_model=CustomLlmProvider)
async def add_custom_llm_provider(provider: CustomLlmProviderCreate,
                                  db: DatabaseService = Depends(get_db),
                                  _: User = Depends(authenticate_admin),
                                  ):
    provider = await db.create_custom_llm_provider(provider)

    return provider


@config_router.post('/keys', response_model=ApiKeyStatus)
async def add_api_key(request: ApiKeyStoreRequest,
                      kms: KmsService = Depends(get_kms),
                      user: User = Depends(authenticate_user),
                      ):
    kms.store_api_key(
        user_id=user.user_id,
        api_key=request.api_key,
        provider=request.provider,
        provider_id=request.custom_provider_id,
    )
    return ApiKeyStatus(
        provider=request.provider,
        custom_provider_id=request.custom_provider_id,
        exists=True,
    )


@config_router.get('/keys/{provider}', response_model=ApiKeyStatus)
async def get_api_key_status(provider: str,
                             custom_provider_id: int | None = None,
                             kms: KmsService = Depends(get_kms),
                             user: User = Depends(authenticate_user),
                             ):
    from sandbox_game.etc.enums import LlmProviderType

    try:
        provider_type = LlmProviderType(provider)
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail='Unknown LLM provider.',
        ) from e
    exists = kms.get_api_key(
        user_id=user.user_id,
        provider=provider_type,
        provider_id=custom_provider_id,
    ) is not None
    return ApiKeyStatus(
        provider=provider_type,
        custom_provider_id=custom_provider_id,
        exists=exists,
    )
