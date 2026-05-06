from sandbox_game.router.chat import classify_sms_relationship


def test_classify_sms_relationship_prefers_explicit_proactive_context():
    assert classify_sms_relationship([], {'proactive': True}) == 'proactive'


def test_classify_sms_relationship_detects_known_contact_from_history():
    assert classify_sms_relationship(
        [
            {'role': 'system', 'content': '[系统提示] do not count'},
            {'role': 'user', 'content': 'Are you there?'},
        ],
        {},
    ) == 'known'


def test_classify_sms_relationship_defaults_to_stranger():
    assert classify_sms_relationship([], {}) == 'stranger'

