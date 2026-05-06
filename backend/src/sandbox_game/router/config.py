from fastapi import APIRouter, Depends

from sandbox_game.model.custom_llm_provider import CustomLlmProviderCreate, CustomLlmProvider
from sandbox_game.model.user import User
from sandbox_game.service import DatabaseService
from .utils import get_db, authenticate_user, authenticate_admin


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


@config_router.post('/keys')
async def add_api_key():
    pass
