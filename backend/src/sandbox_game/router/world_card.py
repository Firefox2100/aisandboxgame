from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status

from sandbox_game.model.expansion import (
    CharacterExpansionData,
    ExpandCharactersRequest,
    ExpandWorldRequest,
    ExpansionResponse,
    WorldExpansionData,
)
from sandbox_game.model.user import User
from sandbox_game.model.world_card import WorldCard, WorldCardCreate, WorldCardSummary
from sandbox_game.service import DatabaseService, ExpansionService, KmsService
from sandbox_game.service.expansion import ExpansionValidationError
from sandbox_game.service.save import SaveService
from sandbox_game.service.world_card import WorldCardService
from .chat import resolve_llm_config_and_key
from .utils import authenticate_user, get_db, get_kms


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


@world_card_router.post('/{card_id}/expand/world', response_model=ExpansionResponse)
async def expand_world(card_id: str,
                       request: ExpandWorldRequest,
                       db: DatabaseService = Depends(get_db),
                       kms: KmsService = Depends(get_kms),
                       user: User = Depends(authenticate_user),
                       ):
    llm_config, api_key = await resolve_llm_config_and_key(request.llm, db, kms, user)
    card = await db.get_world_card(
        user_id=user.user_id,
        card_id=card_id,
        include_built_in=True,
    )
    if not card:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail='World card not found.',
        )

    save = None
    if request.save_slot_id:
        save = await db.get_save(user.user_id, card_id, request.save_slot_id)

    expansion_service = ExpansionService()
    try:
        data = await expansion_service.generate_world(
            context=request.context,
            world_card=card,
            save=save,
            llm=llm_config,
            api_key=api_key,
        )
    except ExpansionValidationError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        ) from e

    applied = False
    if request.apply:
        if not request.save_slot_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail='save_slot_id is required when apply=true.',
            )
        payload = save.model_dump(mode='json') if save else {}
        expansion_service.apply_world_to_save(payload, data)
        save_service = SaveService(repository=db, user_id=user.user_id)
        await save_service.save(
            world_card_id=card_id,
            slot_id=request.save_slot_id,
            name=save.name if save else None,
            data=payload,
            set_current=True,
            touch_progress=True,
        )
        applied = True

    return ExpansionResponse(
        applied=applied,
        save_slot_id=request.save_slot_id,
        world_card_id=card_id,
        added_ids=list(data.settings.keys()),
        data=data,
    )


@world_card_router.post('/{card_id}/expand/characters', response_model=ExpansionResponse)
async def expand_characters(card_id: str,
                            request: ExpandCharactersRequest,
                            db: DatabaseService = Depends(get_db),
                            kms: KmsService = Depends(get_kms),
                            user: User = Depends(authenticate_user),
                            ):
    llm_config, api_key = await resolve_llm_config_and_key(request.llm, db, kms, user)
    card = await db.get_world_card(
        user_id=user.user_id,
        card_id=card_id,
        include_built_in=True,
    )
    if not card:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail='World card not found.',
        )

    save = None
    if request.save_slot_id:
        save = await db.get_save(user.user_id, card_id, request.save_slot_id)

    expansion_service = ExpansionService()
    try:
        data = await expansion_service.generate_characters(
            context=request.context,
            world_card=card,
            save=save,
            llm=llm_config,
            api_key=api_key,
        )
    except ExpansionValidationError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        ) from e

    applied = False
    if request.apply:
        if not request.save_slot_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail='save_slot_id is required when apply=true.',
            )
        payload = save.model_dump(mode='json') if save else {}
        expansion_service.apply_characters_to_save(payload, data)
        save_service = SaveService(repository=db, user_id=user.user_id)
        await save_service.save(
            world_card_id=card_id,
            slot_id=request.save_slot_id,
            name=save.name if save else None,
            data=payload,
            set_current=True,
            touch_progress=True,
        )
        applied = True

    return ExpansionResponse(
        applied=applied,
        save_slot_id=request.save_slot_id,
        world_card_id=card_id,
        added_ids=list(data.character_database.keys()),
        data=data,
    )
