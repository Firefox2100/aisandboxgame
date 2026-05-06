import pytest

from sandbox_game.model.user import UserCreate
from sandbox_game.service.save import SaveService


@pytest.mark.asyncio
async def test_save_service_persists_slot_and_current_pointer(db_service):
    user = await db_service.create_user(UserCreate(username='save_user', password='password123'))
    service = SaveService(repository=db_service, user_id=user.user_id)

    saved = await service.save(
        world_card_id='world_1',
        slot_id='slot_1',
        name='First save',
        data={
            'history': [
                {'sender': 'user', 'text': 'start'},
                {'sender': 'ai', 'text': 'welcome'},
            ],
            'save_source': 'manual',
        },
    )

    loaded = await service.load('world_1', 'slot_1')
    summaries = await service.list('world_1')

    assert saved.name == 'First save'
    assert loaded is not None
    assert loaded.history[1].text == 'welcome'
    assert summaries[0].id == 'slot_1'
    assert await service.get_current_slot('world_1') == 'slot_1'


@pytest.mark.asyncio
async def test_save_service_finds_first_empty_slot_and_clears_deleted_current(db_service):
    user = await db_service.create_user(UserCreate(username='slot_user', password='password123'))
    service = SaveService(repository=db_service, user_id=user.user_id)

    await service.save('world_1', 'slot_1', None, {'history': []})
    await service.save('world_1', 'slot_2', None, {'history': []})
    await service.delete('world_1', 'slot_2')

    assert await service.find_first_empty_slot('world_1') == 'slot_2'
    assert await service.get_current_slot('world_1') is None

