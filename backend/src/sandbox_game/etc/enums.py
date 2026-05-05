from enum import Enum


class CustomLlmProvider(Enum):
    OLLAMA = 'ollama'
    OPENAI_COMPATIBLE = 'openai_compatible'


class LlmProvider(Enum):
    OPENAI = 'openai'
    CUSTOM = 'custom'


class UserRole(Enum):
    ADMIN = 'admin'
    USER = 'user'
