from fastapi import APIRouter, Depends, HTTPException, status

from sandbox_game.model.chat import ChatGameData, ChatMessage
from sandbox_game.model.llm import (
    GenerateTurnRequest,
    GenerateTurnResponse,
    LlmModuleConfig,
    LlmTextRequest,
    LlmTextResponse,
    OocNormalizeRequest,
    SmsGenerateRequest,
)
from sandbox_game.model.user import User
from sandbox_game.service import DatabaseService, KmsService
from sandbox_game.service.llm.service import LlmService
from sandbox_game.service.react_pipeline import ReactPipelineService
from sandbox_game.service.save import SaveService
from sandbox_game.service.world_card import WorldCardService
from .utils import authenticate_user, get_db, get_kms


chat_router = APIRouter(
    prefix='/chat',
    tags=['Chat'],
)


async def resolve_llm_config_and_key(llm: LlmModuleConfig,
                                     db: DatabaseService,
                                     kms: KmsService,
                                     user: User,
                                     ) -> tuple[LlmModuleConfig, str]:
    llm_config = llm.model_copy(deep=True)
    if llm_config.provider.value == 'custom':
        if llm_config.custom_provider_id is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail='custom_provider_id is required for custom providers.',
            )
        provider = await db.get_custom_llm_provider(llm_config.custom_provider_id)
        llm_config.base_url = llm_config.base_url or provider.url

    api_key = kms.get_api_key(
        user_id=user.user_id,
        provider=llm_config.provider,
        provider_id=llm_config.custom_provider_id,
    )
    if not api_key:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail='No API key stored for the selected provider.',
        )
    return llm_config, api_key


@chat_router.post('/turn', response_model=GenerateTurnResponse)
async def generate_turn(request: GenerateTurnRequest,
                        db: DatabaseService = Depends(get_db),
                        kms: KmsService = Depends(get_kms),
                        user: User = Depends(authenticate_user),
                        ):
    llm_config, api_key = await resolve_llm_config_and_key(request.llm, db, kms, user)

    world_card_id = request.world_card_id
    if not world_card_id:
        world_service = WorldCardService(
            repository=db,
            user_id=user.user_id,
        )
        world_card_id = await world_service.get_active_card_id()

    world_card = None
    if world_card_id:
        world_card = await db.get_world_card(
            user_id=user.user_id,
            card_id=world_card_id,
            include_built_in=True,
        )

    save = None
    if world_card_id and request.save_slot_id:
        save = await db.get_save(
            user_id=user.user_id,
            world_card_id=world_card_id,
            slot_id=request.save_slot_id,
        )

    try:
        response = await ReactPipelineService().run(
            request=request.model_copy(update={'llm': llm_config}),
            world_card=world_card,
            save=save,
            api_key=api_key,
        )
    except ImportError as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail='pydantic-ai is not installed in the active Python environment.',
        ) from e

    if request.autosave and world_card_id and request.save_slot_id:
        history = save.history if save else request.history
        next_history = [
            *history,
            ChatMessage(sender='user', text=request.message),
            ChatMessage(
                sender='ai',
                text=response.text,
                model_label=response.model,
                provider_key=response.provider.value,
                game_data=ChatGameData(
                    panel_status=response.data.panel_status.model_dump(mode='json')
                    if response.data.panel_status else None,
                    choices=[choice.model_dump(mode='json') for choice in response.data.choices],
                    panel_narrative=response.text,
                ),
            ),
        ]
        save_payload = save.model_dump(mode='json') if save else {}
        panel_status = response.data.panel_status
        if panel_status:
            panel_payload = panel_status.model_dump(mode='json')
            if panel_status.location:
                save_payload['location'] = {
                    **(save_payload.get('location') or {}),
                    'current': panel_status.location,
                }
            if panel_status.datetime:
                save_payload['game_time'] = {
                    **(save_payload.get('game_time') or {}),
                    'current_date': panel_status.datetime,
                }
            objective_text = None
            if panel_status.objective:
                objective_text = panel_status.objective.get('text')
            if objective_text is not None:
                save_payload['player_state_data'] = {
                    **(save_payload.get('player_state_data') or {}),
                    'current_objective': objective_text,
                }
            if panel_payload.get('custom'):
                save_payload['custom_status_data'] = panel_payload['custom']
        if response.data.timeline_events:
            existing_timeline = save_payload.get('timeline_events') or {}
            save_payload['timeline_events'] = {
                **existing_timeline,
                'events': [
                    *(existing_timeline.get('events') or []),
                    *response.data.timeline_events,
                ],
            }
            sms_events = [
                event.get('content')
                for event in response.data.timeline_events
                if isinstance(event, dict) and event.get('type') == 'sms' and isinstance(event.get('content'), dict)
            ]
            if sms_events:
                sms_data = save_payload.get('sms_data') or {}
                conversations = dict(sms_data.get('conversations') or {})
                unread_counts = dict(sms_data.get('unread_counts') or {})
                for sms_event in sms_events:
                    contact_id = sms_event.get('from_npc_id')
                    content = sms_event.get('message')
                    if not contact_id or not content:
                        continue
                    messages = list(conversations.get(contact_id) or [])
                    messages.append({
                        'role': 'assistant',
                        'content': content,
                        'game_time': panel_status.datetime if panel_status and panel_status.datetime else None,
                        'injection_status': 'new',
                        'is_event_driven': True,
                    })
                    conversations[contact_id] = messages
                    unread_counts[contact_id] = int(unread_counts.get(contact_id) or 0) + 1
                save_payload['sms_data'] = {
                    **sms_data,
                    'conversations': conversations,
                    'unread_counts': unread_counts,
                }
        if response.data.inventory_changes:
            inventory = save_payload.get('inventory_data') or {}
            items = inventory.get('items') or []
            by_name = {
                item.get('name'): dict(item)
                for item in items
                if isinstance(item, dict) and item.get('name')
            }
            for change in response.data.inventory_changes:
                current = by_name.get(change.name, {'name': change.name, 'count': 0, 'desc': ''})
                current['count'] = int(current.get('count') or 0) + change.delta
                if change.desc is not None:
                    current['desc'] = change.desc
                if change.icon is not None:
                    current['icon'] = change.icon
                by_name[change.name] = current
            save_payload['inventory_data'] = {
                **inventory,
                'items': list(by_name.values()),
            }
        if response.data.npc_updates:
            npc_data = save_payload.get('npc_data') or {}
            active_npcs = dict(npc_data.get('npc_data') or {})
            predefined_pool = dict(npc_data.get('predefined_pool') or {})
            char_db = {}
            if world_card:
                char_db = world_card.snapshot.model_dump(mode='json', by_alias=True).get('character_database') or {}
            for update in response.data.npc_updates:
                npc_id = update.get('id')
                trigger_type = update.get('trigger_type')
                if not npc_id:
                    continue
                if trigger_type == 'NEW_PREDEFINED':
                    source = predefined_pool.get(npc_id) or char_db.get(npc_id) or {}
                    if not isinstance(source, dict):
                        source = {}
                    active_npcs[npc_id] = {
                        **source,
                        'id': source.get('id') or npc_id,
                        'trigger_type': 'NEW_PREDEFINED',
                    }
                    predefined_pool.pop(npc_id, None)
                    continue
                if trigger_type == 'UPDATE':
                    current = dict(active_npcs.get(npc_id) or {})
                    active_npcs[npc_id] = {
                        **current,
                        **{
                            key: value
                            for key, value in update.items()
                            if key not in {'trigger_type'} and value is not None
                        },
                        'id': npc_id,
                    }
                    continue
                active_npcs[npc_id] = {
                    **update,
                    'id': npc_id,
                }
            save_payload['npc_data'] = {
                **npc_data,
                'npc_data': active_npcs,
                'predefined_pool': predefined_pool,
            }

        save_service = SaveService(
            repository=db,
            user_id=user.user_id,
        )
        await save_service.save(
            world_card_id=world_card_id,
            slot_id=request.save_slot_id,
            name=save.name if save else None,
            data={
                **save_payload,
                'history': [message.model_dump(mode='json') for message in next_history],
            },
            set_current=True,
            touch_progress=True,
        )
        response.save_slot_id = request.save_slot_id

    return response


@chat_router.post('/summary', response_model=LlmTextResponse)
async def summarize_turn(request: LlmTextRequest,
                         chapter: bool = False,
                         db: DatabaseService = Depends(get_db),
                         kms: KmsService = Depends(get_kms),
                         user: User = Depends(authenticate_user),
                         ):
    llm_config, api_key = await resolve_llm_config_and_key(request.llm, db, kms, user)
    return await LlmService().summarize(
        text=request.text,
        llm=llm_config,
        api_key=api_key,
        chapter=chapter,
    )


@chat_router.post('/sms', response_model=LlmTextResponse)
async def generate_sms(request: SmsGenerateRequest,
                       db: DatabaseService = Depends(get_db),
                       kms: KmsService = Depends(get_kms),
                       user: User = Depends(authenticate_user),
                       ):
    llm_config, api_key = await resolve_llm_config_and_key(request.llm, db, kms, user)
    relationship_state = classify_sms_relationship(
        history=request.history,
        context=request.context,
    )
    return await LlmService().generate_sms(
        payload={
            'contact': request.contact,
            'message': request.message,
            'context': {
                **request.context,
                'relationship_state': relationship_state,
            },
            'history': request.history,
        },
        llm=llm_config,
        api_key=api_key,
    )


def classify_sms_relationship(history: list[dict],
                              context: dict,
                              ) -> str:
    if context.get('proactive') is True:
        return 'proactive'

    for message in history:
        content = str(message.get('content') or '')
        if '[角色主动发送]' in content:
            return 'proactive'

    for message in history:
        content = str(message.get('content') or '')
        if '[系统提示]' in content:
            continue
        if message.get('role') in {'user', 'assistant'} and content.strip():
            return 'known'

    if context.get('has_story_interaction') is True:
        return 'known'

    return 'stranger'


@chat_router.post('/ooc', response_model=LlmTextResponse)
async def normalize_ooc(request: OocNormalizeRequest,
                        db: DatabaseService = Depends(get_db),
                        kms: KmsService = Depends(get_kms),
                        user: User = Depends(authenticate_user),
                        ):
    llm_config, api_key = await resolve_llm_config_and_key(request.llm, db, kms, user)
    return await LlmService().normalize_ooc(
        payload={
            'candidates': request.candidates,
            'previous_question': request.previous_question,
            'player_answer': request.player_answer,
            'round': 2 if request.player_answer is not None else 1,
        },
        llm=llm_config,
        api_key=api_key,
    )
