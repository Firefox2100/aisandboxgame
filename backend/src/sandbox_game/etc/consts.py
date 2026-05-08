import os
import logging
import secrets
from typing import Optional, Literal
from argon2 import PasswordHasher
from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


SECRETS_DIR = '/run/secrets' if os.path.isdir('/run/secrets') else None


class Settings(BaseSettings):
    """
    Configurations for the AI Sandbox Game backend.
    """

    model_config = SettingsConfigDict(
        env_prefix='SG_',
        env_file_encoding='utf-8',
        **({'secrets_dir': SECRETS_DIR} if SECRETS_DIR else {})
    )

    logging_level: Literal['CRITICAL', 'ERROR', 'WARNING', 'INFO', 'DEBUG', 'NOTSET'] = Field(
        'INFO',
        description='Logging level for the application'
    )
    secret_key: str = Field(
        default_factory=secrets.token_urlsafe,
        description='Secret key for the application',
    )
    use_https: bool = Field(
        False,
        description='Whether this application is behind an HTTPS proxy. This affects cookie '
                    'settings, redirect URLs, and security headers.',
    )

    database_url: str = Field(
        ...,
        description='Database connection string for the application',
    )
    redis_host: str = Field(
        'localhost',
        description='Redis host for session storage.',
    )
    redis_port: int = Field(
        6379,
        description='Redis port for session storage.',
    )
    vault_url: str = Field(
        'http://localhost:8200',
        description='Hashicorp Vault URL for secret management.',
    )
    vault_app_role_id: Optional[str] = Field(
        None,
        description='Hashicorp Vault App Role ID for secret management.',
    )
    vault_app_secret_id: Optional[str] = Field(
        None,
        description='Hashicorp Vault App Secret ID for secret management.',
    )
    vault_token: Optional[str] = Field(
        None,
        description='Hashicorp Vault token. This is not as secure as app role, and should only be '
                    'used for local development.'
    )
    vault_kv_path: str = Field(
        'sandbox-game',
        description='The mounting path of the KV engine used for secret management.',
    )


CONFIG = Settings(_env_file=os.getenv('SG_ENV_FILE', '.env'))   # type: ignore
LOGGER = logging.getLogger('AI Sandbox Game')
LOGGER.setLevel(CONFIG.logging_level.upper())

if not LOGGER.hasHandlers():
    console_handler = logging.StreamHandler()
    console_handler.setLevel(CONFIG.logging_level.upper())

    formatter = logging.Formatter(
        fmt='[%(asctime)s] [%(process)d] [%(levelname)s]: %(message)s',
        datefmt='%Y-%m-%d %H:%M:%S %z'
    )
    console_handler.setFormatter(formatter)

    LOGGER.addHandler(console_handler)


PH = PasswordHasher()
