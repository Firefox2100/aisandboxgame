from fastapi import APIRouter, Depends

from sandbox_game.service import DatabaseService
from sandbox_game.model.user import UserCreate, User
from .utils import get_db


auth_router = APIRouter(
    prefix='/auth',
    tags=['Authentication'],
)


@auth_router.get('/register', response_model=User)
async def user_registration(user: UserCreate,
                            db: DatabaseService = Depends(get_db),
                            ):
    """
    Register a new user.
    """
    user = await db.create_user(user)

    return user
