import pytest

from tests.helpers import register_user

pytestmark = pytest.mark.asyncio

from sandbox_game.etc.enums import LlmProviderType
from sandbox_game.model.llm import GameTurnData, GenerateTurnResponse, LlmTextResponse, TurnChoice


async def create_world_card(client):
    response = await client.post(
        '/world-cards',
        json={
            'name': 'Rain City',
            'snapshot': {
                'world_setting': {
                    'settings': {
                        'premise': 'A city under permanent rain.',
                    },
                },
            },
        },
    )
    assert response.status_code == 200, response.text
    return response.json()


async def test_summary_endpoint_resolves_api_key_and_calls_llm_driver(client, monkeypatch):
    await register_user(client)
    seen = {}

    async def fake_summarize(self, text, llm, api_key, chapter=False):
        seen['text'] = text
        seen['model'] = llm.model
        seen['api_key'] = api_key
        seen['chapter'] = chapter
        return LlmTextResponse(text='short summary', model=llm.model, provider=llm.provider)

    monkeypatch.setattr('sandbox_game.router.chat.LlmService.summarize', fake_summarize)

    response = await client.post(
        '/chat/summary?chapter=true',
        json={
            'text': 'A long passage.',
            'llm': {'provider': 'openai', 'model': 'gpt-test'},
        },
    )

    assert response.status_code == 200, response.text
    assert response.json()['text'] == 'short summary'
    assert seen == {
        'text': 'A long passage.',
        'model': 'gpt-test',
        'api_key': 'test-api-key',
        'chapter': True,
    }


async def test_turn_endpoint_autosaves_pipeline_response(client, monkeypatch):
    await register_user(client)
    world_card = await create_world_card(client)
    world_card_id = world_card['id']
    seen = {}

    async def fake_run(self, request, world_card, save, api_key):
        seen['message'] = request.message
        seen['world_card_id'] = world_card.id
        seen['save'] = save
        seen['api_key'] = api_key
        return GenerateTurnResponse(
            text='The rain answers.',
            data=GameTurnData(
                narrative='The rain answers.',
                choices=[TurnChoice(id='A', text='Listen', type='talk')],
            ),
            model=request.llm.model,
            provider=LlmProviderType.OPENAI,
        )

    monkeypatch.setattr('sandbox_game.router.chat.ReactPipelineService.run', fake_run)

    response = await client.post(
        '/chat/turn',
        json={
            'message': 'Hello?',
            'world_card_id': world_card_id,
            'save_slot_id': 'slot_1',
            'history': [],
            'llm': {'provider': 'openai', 'model': 'gpt-test'},
            'autosave': True,
        },
    )

    assert response.status_code == 200, response.text
    assert response.json()['save_slot_id'] == 'slot_1'
    assert seen['message'] == 'Hello?'
    assert seen['world_card_id'] == world_card_id
    assert seen['save'] is None
    assert seen['api_key'] == 'test-api-key'

    save_response = await client.get(f'/world-cards/{world_card_id}/saves/slot_1')
    history = save_response.json()['history']

    assert save_response.status_code == 200
    assert [message['sender'] for message in history] == ['user', 'ai']
    assert history[1]['game_data']['panel_narrative'] == 'The rain answers.'
