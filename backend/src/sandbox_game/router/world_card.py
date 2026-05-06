from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status

from sandbox_game.model.user import User
from sandbox_game.model.world_card import WorldCard, WorldCardCreate, WorldCardSummary
from sandbox_game.service import DatabaseService
from sandbox_game.service.world_card import WorldCardService
from .utils import authenticate_user, get_db


world_card_router = APIRouter(
    prefix='/world-cards',
    tags=['World Cards'],
)


def get_world_card_service(db: DatabaseService,
                           user: User,
                           ) -> WorldCardService:
    return WorldCardService(
        repository=db,
        user_id=user.user_id,
    )


@world_card_router.get('', response_model=list[WorldCardSummary])
async def list_world_cards(locale: Optional[str] = Query(default=None),
                           db: DatabaseService = Depends(get_db),
                           user: User = Depends(authenticate_user),
                           ):
    service = get_world_card_service(db, user)
    return await service.list(locale=locale)


@world_card_router.post('', response_model=WorldCard)
async def create_world_card(request: WorldCardCreate,
                            db: DatabaseService = Depends(get_db),
                            user: User = Depends(authenticate_user),
                            ):
    service = get_world_card_service(db, user)
    try:
        return await service.create(request)
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        ) from e


@world_card_router.get('/active', response_model=str | None)
async def get_active_world_card(db: DatabaseService = Depends(get_db),
                                user: User = Depends(authenticate_user),
                                ):
    service = get_world_card_service(db, user)
    return await service.get_active_card_id()


@world_card_router.put('/active/{card_id}', response_model=str | None)
async def set_active_world_card(card_id: str,
                                db: DatabaseService = Depends(get_db),
                                user: User = Depends(authenticate_user),
                                ):
    service = get_world_card_service(db, user)
    result = await service.set_active_card(card_id)
    if result is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail='World card not found.',
        )
    return result


@world_card_router.delete('/active', response_model=None)
async def clear_active_world_card(db: DatabaseService = Depends(get_db),
                                  user: User = Depends(authenticate_user),
                                  ):
    service = get_world_card_service(db, user)
    await service.set_active_card(None)


@world_card_router.get('/{card_id}', response_model=WorldCard)
async def get_world_card(card_id: str,
                         db: DatabaseService = Depends(get_db),
                         user: User = Depends(authenticate_user),
                         ):
    service = get_world_card_service(db, user)
    card = await service.get(card_id)
    if not card:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail='World card not found.',
        )
    return card


@world_card_router.put('/{card_id}', response_model=WorldCard)
async def update_world_card(card_id: str,
                            request: WorldCardCreate,
                            db: DatabaseService = Depends(get_db),
                            user: User = Depends(authenticate_user),
                            ):
    service = get_world_card_service(db, user)
    try:
        card = await service.update(card_id, request)
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        ) from e
    if not card:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail='World card not found or cannot be modified.',
        )
    return card


@world_card_router.delete('/{card_id}', response_model=bool)
async def delete_world_card(card_id: str,
                            db: DatabaseService = Depends(get_db),
                            user: User = Depends(authenticate_user),
                            ):
    service = get_world_card_service(db, user)
    return await service.delete(card_id)
