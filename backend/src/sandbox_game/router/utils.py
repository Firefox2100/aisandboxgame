from fastapi import Request, Cookie, Depends, HTTPException
from starlette import status

from sandbox_game.model.user import User
from sandbox_game.service import CacheService, DatabaseService


def get_cache(request: Request) -> CacheService:
    return request.app.state.cache


def get_db(request: Request) -> DatabaseService:
    return request.app.state.db


async def authenticate_user(session_id: str = Cookie(None),
                            cache: CacheService = Depends(get_cache),
                            ) -> User:
    if not session_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail='User is not authenticated.',
        )

    session_data = await cache.get_session(session_id)
    if not session_data:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail='Login expired, please login again.',
        )

    return session_data[0]
