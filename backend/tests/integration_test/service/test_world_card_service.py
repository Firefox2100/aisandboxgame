import pytest

from sandbox_game.model.user import UserCreate
from sandbox_game.model.world_card import WorldCardCreate
from sandbox_game.service.world_card import WorldCardService


def world_card_create(name: str = 'Rain City') -> WorldCardCreate:
    return WorldCardCreate.model_validate({
        'name': name,
        'description': 'A test world.',
        'snapshot': {
            'world_setting': {
                'settings': {
                    'premise': 'A city under permanent rain.',
                },
            },
        },
    })


@pytest.mark.asyncio
async def test_world_card_service_custom_card_lifecycle(db_service):
    user = await db_service.create_user(UserCreate(username='world_user', password='password123'))
    service = WorldCardService(repository=db_service, user_id=user.user_id)

    created = await service.create(world_card_create())
    active = await service.set_active_card(created.id)
    updated = await service.update(created.id, world_card_create(name='Neon Rain City'))
    summaries = await service.list(locale='zh-CN')

    assert created.id.startswith('wc_custom_')
    assert active == created.id
    assert updated is not None
    assert updated.name == 'Neon Rain City'
    assert any(card.id == created.id for card in summaries)
    assert await service.delete(created.id)
    assert await service.get(created.id) is None


@pytest.mark.asyncio
async def test_world_card_service_rejects_empty_snapshot_by_default(db_service):
    user = await db_service.create_user(UserCreate(username='empty_world_user', password='password123'))
    service = WorldCardService(repository=db_service, user_id=user.user_id)

    with pytest.raises(ValueError, match='World card snapshot is empty.'):
        await service.create(WorldCardCreate.model_validate({
            'name': 'Empty',
            'snapshot': {},
        }))

