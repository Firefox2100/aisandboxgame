import pytest

from tests.helpers import register_user

pytestmark = pytest.mark.asyncio


def world_card_payload(name: str = 'Rain City'):
    return {
        'name': name,
        'description': 'A test world.',
        'snapshot': {
            'world_setting': {
                'settings': {
                    'premise': 'A city under permanent rain.',
                },
            },
        },
    }


async def create_world_card(client):
    response = await client.post('/world-cards', json=world_card_payload())
    assert response.status_code == 200, response.text
    return response.json()


async def test_save_router_full_slot_flow(client):
    await register_user(client)
    world_card = await create_world_card(client)
    world_card_id = world_card['id']

    write_response = await client.post(
        f'/world-cards/{world_card_id}/saves',
        json={
            'slot_id': 'slot_1',
            'name': 'Manual save',
            'data': {
                'history': [{'sender': 'user', 'text': 'start'}],
                'saveSource': 'manual',
            },
        },
    )
    assert write_response.status_code == 200, write_response.text
    assert write_response.json()['name'] == 'Manual save'

    list_response = await client.get(f'/world-cards/{world_card_id}/saves')
    current_response = await client.get(f'/world-cards/{world_card_id}/saves/current')
    rename_response = await client.put(
        f'/world-cards/{world_card_id}/saves/slot_1/name',
        json={'name': 'Renamed save'},
    )
    load_response = await client.get(f'/world-cards/{world_card_id}/saves/slot_1')

    assert list_response.status_code == 200
    assert list_response.json()[0]['id'] == 'slot_1'
    assert current_response.json() == 'slot_1'
    assert rename_response.json()['name'] == 'Renamed save'
    assert load_response.json()['history'][0]['text'] == 'start'

    delete_response = await client.delete(f'/world-cards/{world_card_id}/saves/slot_1')
    missing_response = await client.get(f'/world-cards/{world_card_id}/saves/slot_1')
    current_after_delete = await client.get(f'/world-cards/{world_card_id}/saves/current')

    assert delete_response.status_code == 200
    assert missing_response.status_code == 404
    assert current_after_delete.json() is None
