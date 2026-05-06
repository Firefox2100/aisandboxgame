from enum import Enum


class CustomLlmProviderType(Enum):
    OLLAMA = 'ollama'


class LlmProviderType(Enum):
    OPENAI = 'openai'
    CUSTOM = 'custom'


class UserRole(Enum):
    ADMIN = 'admin'
    USER = 'user'
