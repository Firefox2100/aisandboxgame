from sandbox_game.model.world_card import WorldCard
from sandbox_game.service.world_card import WorldCardService


def test_has_substantial_content_detects_non_empty_world_setting():
    service = WorldCardService(repository=None, user_id=1)

    assert service.has_substantial_content({
        'world_setting': {
            'settings': {
                'premise': 'A city under permanent rain.',
            },
        },
    })


def test_has_substantial_content_ignores_empty_and_private_metadata():
    service = WorldCardService(repository=None, user_id=1)

    assert not service.has_substantial_content({
        'world_setting': {'settings': {'_summary': '', 'premise': '  '}},
        'prompt_modules': {'modules': {'core': ''}},
        'character_database': {'_draft': {'name': ''}},
        'timeline': {'events': []},
    })


def test_localized_summary_prefers_requested_locale():
    service = WorldCardService(repository=None, user_id=1)
    card = WorldCard.model_validate({
        'id': 'wc_1',
        'name': '默认名',
        'description': '默认描述',
        'created_at': '2026-01-01T00:00:00+00:00',
        'updated_at': '2026-01-01T00:00:00+00:00',
        'content_locale': 'zh-CN',
        'localizations': {
            'en': {
                'name': 'English name',
                'description': 'English description',
                'snapshot': {},
                'content_locale': 'en',
            },
        },
    })

    summary = service._summary(card, locale='en')

    assert summary.name == 'English name'
    assert summary.description == 'English description'
    assert summary.content_locale == 'en'

