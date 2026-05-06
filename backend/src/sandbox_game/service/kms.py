from hvac import Client
from hvac.exceptions import InvalidPath, InvalidRequest

from sandbox_game.etc.consts import CONFIG
from sandbox_game.etc.enums import LlmProviderType


class KmsService:
    def __init__(self,
                 client: Client,
                 ):
        self._client = client

    def store_api_key(self,
                      user_id: int,
                      api_key: str,
                      provider: LlmProviderType,
                      provider_id: int | None = None,
                      ):
        if provider == LlmProviderType.CUSTOM:
            if provider_id is None:
                raise ValueError('provider_id is required for CUSTOM provider')

            self._client.secrets.kv.v2.create_or_update_secret(
                path=f'api-keys/custom/{provider_id}/{user_id}',
                secret={'api-key': api_key},
                mount_point=CONFIG.vault_kv_path,
            )
        else:
            self._client.secrets.kv.v2.create_or_update_secret(
                path=f'api-keys/{provider.value}/{user_id}',
                secret={'api-key': api_key},
                mount_point=CONFIG.vault_kv_path,
            )

    def get_api_key(self,
                    user_id: int,
                    provider: LlmProviderType,
                    provider_id: int | None = None,
                    ) -> str | None:
        try:
            if provider == LlmProviderType.CUSTOM:
                if provider_id is None:
                    raise ValueError('provider_id is required for CUSTOM provider')

                secret = self._client.secrets.kv.v2.read_secret_version(
                    path=f'api-keys/custom/{provider_id}/{user_id}',
                    mount_point=CONFIG.vault_kv_path,
                )
            else:
                secret = self._client.secrets.kv.v2.read_secret_version(
                    path=f'api-keys/{provider.value}/{user_id}',
                    mount_point=CONFIG.vault_kv_path,
                )
            return secret['data']['data']['api-key']
        except (InvalidPath, InvalidRequest):
            return None
