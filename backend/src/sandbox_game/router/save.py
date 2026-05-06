from typing import Any, Optional

from pydantic import BaseModel, Field
from fastapi import APIRouter, Depends, HTTPException, status

from sandbox_game.model.save import GameSave, SaveSlotSummary
from sandbox_game.model.user import User
from sandbox_game.service import DatabaseService
from sandbox_game.service.save import SaveService
from .utils import authenticate_user, get_db


save_router = APIRouter(
    prefix='/world-cards/{world_card_id}/saves',
    tags=['Saves'],
)


class SaveWriteRequest(BaseModel):
    slot_id: str = Field(
        ...,
    )
    name: Optional[str] = Field(
        default=None,
    )
    data: dict[str, Any] = Field(
        default_factory=dict,
    )
    set_current: bool = Field(
        default=True,
    )
    touch_progress: bool = Field(
        default=True,
    )


class SaveRenameRequest(BaseModel):
    name: str = Field(
        ...,
    )


class CurrentSlotRequest(BaseModel):
    slot_id: Optional[str] = Field(
        default=None,
    )


def get_save_service(db: DatabaseService,
                     user: User,
                     ) -> SaveService:
    return SaveService(
        repository=db,
        user_id=user.user_id,
    )


@save_router.get('', response_model=list[SaveSlotSummary])
async def list_saves(world_card_id: str,
                     db: DatabaseService = Depends(get_db),
                     user: User = Depends(authenticate_user),
                     ):
    service = get_save_service(db, user)
    return await service.list(world_card_id)


@save_router.get('/current', response_model=str | None)
async def get_current_save_slot(world_card_id: str,
                                db: DatabaseService = Depends(get_db),
                                user: User = Depends(authenticate_user),
                                ):
    service = get_save_service(db, user)
    return await service.get_current_slot(world_card_id)


@save_router.put('/current', response_model=None)
async def set_current_save_slot(world_card_id: str,
                                request: CurrentSlotRequest,
                                db: DatabaseService = Depends(get_db),
                                user: User = Depends(authenticate_user),
                                ):
    service = get_save_service(db, user)
    await service.set_current_slot(world_card_id, request.slot_id)


@save_router.get('/first-empty', response_model=str | None)
async def find_first_empty_save_slot(world_card_id: str,
                                     db: DatabaseService = Depends(get_db),
                                     user: User = Depends(authenticate_user),
                                     ):
    service = get_save_service(db, user)
    return await service.find_first_empty_slot(world_card_id)


@save_router.post('', response_model=GameSave)
async def write_save(world_card_id: str,
                     request: SaveWriteRequest,
                     db: DatabaseService = Depends(get_db),
                     user: User = Depends(authenticate_user),
                     ):
    service = get_save_service(db, user)
    return await service.save(
        world_card_id=world_card_id,
        slot_id=request.slot_id,
        name=request.name,
        data=request.data,
        set_current=request.set_current,
        touch_progress=request.touch_progress,
    )


@save_router.get('/{slot_id}', response_model=GameSave)
async def load_save(world_card_id: str,
                    slot_id: str,
                    db: DatabaseService = Depends(get_db),
                    user: User = Depends(authenticate_user),
                    ):
    service = get_save_service(db, user)
    save = await service.load(world_card_id, slot_id)
    if not save:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail='Save slot not found.',
        )
    return save


@save_router.put('/{slot_id}/name', response_model=GameSave)
async def rename_save(world_card_id: str,
                      slot_id: str,
                      request: SaveRenameRequest,
                      db: DatabaseService = Depends(get_db),
                      user: User = Depends(authenticate_user),
                      ):
    service = get_save_service(db, user)
    save = await service.rename(world_card_id, slot_id, request.name)
    if not save:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail='Save slot not found.',
        )
    return save


@save_router.delete('/{slot_id}', response_model=None)
async def delete_save(world_card_id: str,
                      slot_id: str,
                      db: DatabaseService = Depends(get_db),
                      user: User = Depends(authenticate_user),
                      ):
    service = get_save_service(db, user)
    await service.delete(world_card_id, slot_id)
