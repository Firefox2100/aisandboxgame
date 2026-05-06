from pathlib import Path
from typing import Literal


PromptLocale = Literal['zh_cn', 'en']


class PromptService:
    def __init__(self,
                 locale: PromptLocale = 'zh_cn',
                 ):
        self._locale = locale
        self._root = Path(__file__).resolve().parents[1] / 'data' / 'prompts' / locale

    def read(self, name: str) -> str:
        path = self._root / name
        return path.read_text(encoding='utf-8')

    def core_gm(self) -> str:
        return self.read('core_gm.md')

    def npc_reaction(self) -> str:
        return self.read('npc_reaction.md')

    def ooc(self) -> str:
        return self.read('ooc.md')

    def ooc_round1(self) -> str:
        return self.read('ooc_round1.md')

    def ooc_round2(self) -> str:
        return self.read('ooc_round2.md')

    def sms(self) -> str:
        return self.read('sms.md')

    def sms_relationship_rules(self) -> str:
        return self.read('sms_relationship_rules.md')

    def react_narrative(self) -> str:
        return self.read('react_narrative.md')

    def react_settlement(self) -> str:
        return self.read('react_settlement.md')

    def react_effects(self) -> str:
        return self.read('react_effects.md')

    def react_choices(self) -> str:
        return self.read('react_choices.md')

    def summary(self) -> str:
        return self.read('summary.md')

    def chapter_summary(self) -> str:
        return self.read('chapter_summary.md')

    def world_card_path(self, file_name: str) -> Path:
        return self._root / 'world_cards' / file_name
