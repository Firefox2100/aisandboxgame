from fastapi import APIRouter, Depends, HTTPException, status

from sandbox_game.etc.enums import LlmProviderType
from sandbox_game.etc.errors import LlmProviderNotFound
from sandbox_game.model.api_key import ApiKeyStatus, ApiKeyStoreRequest
from sandbox_game.model.config import SystemConfig, SystemConfigUpdate, UserConfigResponse, UserConfigUpdate, \
    UserRoleUpdate
from sandbox_game.model.custom_llm_provider import CustomLlmProviderCreate, CustomLlmProvider, CustomLlmProviderUpdate
from sandbox_game.model.user import User
from sandbox_game.service import DatabaseService, KmsService
from .utils import get_db, get_kms, authenticate_user, authenticate_admin


config_router = APIRouter(
    prefix='/config',
    tags=['Configuration'],
)


@config_router.get('')
async def get_user_config(db: DatabaseService = Depends(get_db),
                          kms: KmsService = Depends(get_kms),
                          user: User = Depends(authenticate_user),
                          ):
    config = await db.get_user_config(user.user_id)
    api_keys = await get_api_key_statuses(
        db=db,
        kms=kms,
        user=user,
    )
    return UserConfigResponse(
        user=user,
        config=config,
        api_keys=api_keys,
    )


@config_router.put('', response_model=UserConfigResponse)
async def update_user_config(request: UserConfigUpdate,
                             db: DatabaseService = Depends(get_db),
                             kms: KmsService = Depends(get_kms),
                             user: User = Depends(authenticate_user),
                             ):
    config = await db.update_user_config(user.user_id, request)
    api_keys = await get_api_key_statuses(
        db=db,
        kms=kms,
        user=user,
    )
    return UserConfigResponse(
        user=user,
        config=config,
        api_keys=api_keys,
    )


@config_router.get('/system', response_model=SystemConfig)
async def get_system_config(db: DatabaseService = Depends(get_db),
                            _: User = Depends(authenticate_admin),
                            ):
    return await db.get_system_config()


@config_router.put('/system', response_model=SystemConfig)
async def update_system_config(request: SystemConfigUpdate,
                               db: DatabaseService = Depends(get_db),
                               _: User = Depends(authenticate_admin),
                               ):
    return await db.update_system_config(SystemConfig.model_validate(request.model_dump()))


@config_router.get('/users', response_model=list[User])
async def list_users(db: DatabaseService = Depends(get_db),
                     _: User = Depends(authenticate_admin),
                     ):
    return await db.list_users()


@config_router.put('/users/{user_id}/role', response_model=User)
async def update_user_role(user_id: int,
                           request: UserRoleUpdate,
                           db: DatabaseService = Depends(get_db),
                           _: User = Depends(authenticate_admin),
                           ):
    return await db.update_user_role(user_id, request.role)


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


@config_router.put('/providers/{provider_id}', response_model=CustomLlmProvider)
async def update_custom_llm_provider(provider_id: int,
                                     provider: CustomLlmProviderUpdate,
                                     db: DatabaseService = Depends(get_db),
                                     _: User = Depends(authenticate_admin),
                                     ):
    try:
        return await db.update_custom_llm_provider(provider_id, provider)
    except LlmProviderNotFound as e:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=e.message,
        ) from e


@config_router.delete('/providers/{provider_id}', response_model=None)
async def delete_custom_llm_provider(provider_id: int,
                                     db: DatabaseService = Depends(get_db),
                                     _: User = Depends(authenticate_admin),
                                     ):
    try:
        await db.delete_custom_llm_provider(provider_id)
    except LlmProviderNotFound as e:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=e.message,
        ) from e


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


@config_router.get('/keys', response_model=list[ApiKeyStatus])
async def get_api_key_statuses(db: DatabaseService = Depends(get_db),
                               kms: KmsService = Depends(get_kms),
                               user: User = Depends(authenticate_user),
                               ):
    providers = await db.list_custom_llm_providers()
    statuses = []
    for provider in LlmProviderType:
        if provider == LlmProviderType.CUSTOM:
            for custom_provider in providers:
                statuses.append(ApiKeyStatus(
                    provider=provider,
                    custom_provider_id=custom_provider.provider_id,
                    exists=kms.get_api_key(
                        user_id=user.user_id,
                        provider=provider,
                        provider_id=custom_provider.provider_id,
                    ) is not None,
                ))
            continue
        statuses.append(ApiKeyStatus(
            provider=provider,
            custom_provider_id=None,
            exists=kms.get_api_key(
                user_id=user.user_id,
                provider=provider,
            ) is not None,
        ))
    return statuses


@config_router.delete('/keys/{provider}', response_model=None)
async def delete_api_key(provider: str,
                         custom_provider_id: int | None = None,
                         kms: KmsService = Depends(get_kms),
                         user: User = Depends(authenticate_user),
                         ):
    try:
        provider_type = LlmProviderType(provider)
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail='Unknown LLM provider.',
        ) from e
    kms.delete_api_key(
        user_id=user.user_id,
        provider=provider_type,
        provider_id=custom_provider_id,
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
