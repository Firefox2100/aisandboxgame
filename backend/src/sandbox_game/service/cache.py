import time
import json
from redis.asyncio import Redis

from sandbox_game.etc.enums import UserRole
from sandbox_game.model.user import User


class CacheService:
    def __init__(self,
                 client: Redis,
                 ):
        self._client = client

    async def store_session(self,
                            session_id: str,
                            user: User,
                            ):
        payload = {
            'user_id': user.user_id,
            'username': user.username,
            'role': user.role,
            'authenticated_at': int(time.time()),
        }

        await self._client.set(f'session:{session_id}', json.dumps(payload), ex=86400)

    async def get_session(self, session_id: str) -> tuple[User, int] | None:
        payload = await self._client.get(f'session:{session_id}')

        if payload:
            payload = json.loads(payload)
            user = User(
                user_id=payload['user_id'],
                username=payload['username'],
                password_hash=None,
                role=UserRole(payload['role']),
            )
            return user, int(payload['authenticated_at'])

        return None

    async def refresh_session(self, session_id: str):
        await self._client.expire(f'session:{session_id}', 86400)

    async def delete_session(self, session_id: str):
        await self._client.delete(f'session:{session_id}')
