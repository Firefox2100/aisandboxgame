from enum import Enum


class CustomLlmProviderType(Enum):
    OPENAI_COMPATIBLE = 'openai-compatible'
    OLLAMA = 'ollama'


class LlmProviderType(Enum):
    OPENAI = 'openai'
    DEEPSEEK = 'deepseek'
    ANTHROPIC = 'anthropic'
    GEMINI = 'gemini'
    GROK = 'grok'
    SILICONFLOW = 'siliconflow'
    OPENROUTER = 'openrouter'
    CUSTOM = 'custom'


class UserRole(Enum):
    ADMIN = 'admin'
    USER = 'user'
