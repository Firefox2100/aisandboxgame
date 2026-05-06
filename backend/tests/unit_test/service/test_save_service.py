from sandbox_game.service.save import SaveService


def test_normalize_maps_legacy_payload_and_cleans_history():
    service = SaveService(repository=None, user_id=1)

    save = service.normalize(
        world_card_id='world_1',
        slot_id='slot_1',
        data={
            'ownerWorldCardId': 'legacy_world',
            'activeWorldCardId': 'active_world',
            'saveSource': 'MANUAL',
            'history': [
                {'sender': 'user', 'text': 'hello', 'modelLabel': 'ignored-for-user'},
                {'sender': 'ai', 'text': 'hi', 'modelLabel': 'gpt-test', 'providerKey': 'openai'},
                {'sender': 'ai'},
                {'meta': 'ooc_qa', 'question': 'clarify?', 'answer': 'yes', 'ooc_id': 'q1'},
            ],
        },
    )

    assert save.id == 'slot_1'
    assert save.owner_world_card_id == 'world_1'
    assert save.active_world_card_id == 'active_world'
    assert save.schema_version == SaveService.SCHEMA_VERSION
    assert save.save_source == 'manual'
    assert len(save.history) == 3
    assert save.history[1].model_label == 'gpt-test'
    assert save.history[1].provider_key == 'openai'
    assert save.history[2].meta == 'ooc_qa'
    assert save.history[2].answer == 'yes'


def test_normalize_defaults_invalid_save_source_to_unknown():
    service = SaveService(repository=None, user_id=1)

    save = service.normalize(
        world_card_id='world_1',
        slot_id='slot_2',
        data={'save_source': 'browser-cache'},
    )

    assert save.name == '存档 2'
    assert save.save_source == 'unknown'

