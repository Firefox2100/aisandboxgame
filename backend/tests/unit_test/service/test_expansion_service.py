import pytest

from sandbox_game.model.expansion import CharacterExpansionData, WorldExpansionData
from sandbox_game.model.world_card import WorldCard, WorldCardSnapshot, WorldSettingSnapshot
from sandbox_game.service.expansion import ExpansionService, ExpansionValidationError
from sandbox_game.service.save import SaveService


def make_world_card() -> WorldCard:
    return WorldCard(
        id='world_1',
        name='World',
        snapshot=WorldCardSnapshot(
            world_setting=WorldSettingSnapshot(
                settings={'old_town': 'An old town under rain.'},
                _summary='Rain world.',
            ),
            character_database={
                'old_keeper': {'name': 'Keeper'},
            },
        ),
    )


def make_save():
    return SaveService(repository=None, user_id=1).normalize(
        world_card_id='world_1',
        slot_id='slot_1',
        data={},
    )


def test_world_expansion_validation_rejects_duplicate_entity():
    service = ExpansionService()

    with pytest.raises(ExpansionValidationError):
        service.validate_world_expansion(
            WorldExpansionData.model_validate({
                'settings': {'old_town': 'x' * 200},
                '_summary': 'duplicate',
            }),
            make_world_card(),
            make_save(),
        )


def test_apply_world_expansion_writes_runtime_entities():
    service = ExpansionService()
    payload = make_save().model_dump(mode='json')
    data = WorldExpansionData.model_validate({
        'settings': {
            'new_marsh': '## 实体设定 -- New Marsh\n' + '潮湿的边境设定。' * 80,
        },
        '_narrativeCoreCharacters': {'new_marsh': ['渡鸦信使']},
        '_summary': '新增沼泽边境。',
    })

    service.apply_world_to_save(payload, data)

    assert payload['entities']['entities']['new_marsh']['origin'] == 'expanded'
    assert payload['entities']['narrative_core_characters']['new_marsh'] == ['渡鸦信使']


def test_character_expansion_validation_and_apply_to_predefined_pool():
    service = ExpansionService()
    payload = make_save().model_dump(mode='json')
    data = service.validate_character_expansion(
        CharacterExpansionData.model_validate({
            'character_database': {
                'rain_scout': {
                    'name': 'Rain Scout',
                    'origin': 'Northern watch',
                    'personality': 'quiet',
                },
            },
            'relationship_rules': {
                'rain_scout': {'player': 'stranger'},
            },
            '_summary': '新增侦察兵。',
        }),
        make_world_card(),
        make_save(),
    )

    service.apply_characters_to_save(payload, data)

    assert payload['npc_data']['predefined_pool']['rain_scout']['name'] == 'Rain Scout'
    assert payload['npc_data']['char_origin']['rain_scout'] == 'expanded'
    assert payload['npc_data']['relationship_rules']['rain_scout']['player'] == 'stranger'
