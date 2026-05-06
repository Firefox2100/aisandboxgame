from uuid import uuid4
from pydantic import BaseModel, Field, ConfigDict
from fastapi import APIRouter, Depends, Response, Cookie, HTTPException, status

from sandbox_game.etc.consts import CONFIG
from sandbox_game.service import CacheService, DatabaseService
from sandbox_game.model.user import UserCreate, User
from .utils import get_cache, get_db, authenticate_user


auth_router = APIRouter(
    prefix='/auth',
    tags=['Authentication'],
)


class LoginRequest(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )

    username: str = Field(
        ...,
        description='Username of the login request',
    )
    password: str = Field(
        ...,
        description='Password of the login request',
    )


async def set_login_session(response: Response,
                            user: User,
                            cache: CacheService,
                            ):
    session_id = str(uuid4())
    await cache.store_session(
        session_id=session_id,
        user=user,
    )

    response.set_cookie(
        key='session_id',
        value=session_id,
        httponly=True,
        secure=CONFIG.use_https,
        samesite='strict',
    )


@auth_router.get('/register', response_model=User)
async def user_registration(user: UserCreate,
                            response: Response,
                            cache: CacheService = Depends(get_cache),
                            db: DatabaseService = Depends(get_db),
                            ):
    """
    Register a new user.
    """
    user = await db.create_user(user)

    await set_login_session(
        response=response,
        user=user,
        cache=cache,
    )

    return user


@auth_router.post('/login', response_model=User)
async def user_login(credentials: LoginRequest,
                     response: Response,
                     cache: CacheService = Depends(get_cache),
                     db: DatabaseService = Depends(get_db),
                     ):
    """
    Log user in.
    """
    try:
        user = await db.login_user(
            username=credentials.username,
            password=credentials.password,
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail='Incorrect username or password',
        ) from e

    await set_login_session(
        response=response,
        user=user,
        cache=cache,
    )

    return user


@auth_router.post('/logout')
async def user_logout(response: Response,
                      session_id: str = Cookie(None),
                      cache: CacheService = Depends(get_cache),
                      _: User = Depends(authenticate_user),
                      ):
    await cache.delete_session(session_id)

    response.delete_cookie(
        key='session_id',
    )
