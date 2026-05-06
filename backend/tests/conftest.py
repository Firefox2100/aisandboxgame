import os
import sys
from pathlib import Path

import httpx
import pytest
import pytest_asyncio
from fastapi import FastAPI
from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy.pool import StaticPool


BACKEND_SRC = Path(__file__).resolve().parents[1] / 'src'
sys.path.insert(0, str(BACKEND_SRC))
os.environ.setdefault('SG_DATABASE_URL', 'sqlite+aiosqlite:///:memory:')

from sandbox_game.etc.enums import LlmProviderType  # noqa: E402
from sandbox_game.model.user import User  # noqa: E402
from sandbox_game.router import auth_router, chat_router, config_router, save_router, world_card_router  # noqa: E402
from sandbox_game.service.database.service import DatabaseService  # noqa: E402
from sandbox_game.service.database.tables import METADATA  # noqa: E402


class FastPasswordHasher:
    def hash(self, password: str) -> str:
        return f'test-hash:{password}'

    def verify(self, password_hash: str, password: str):
        if password_hash != self.hash(password):
            from argon2.exceptions import VerifyMismatchError

            raise VerifyMismatchError()
        return True


@pytest.fixture(autouse=True)
def fast_password_hasher(monkeypatch):
    import sandbox_game.etc.consts as consts
    import sandbox_game.service.database.service as database_service

    hasher = FastPasswordHasher()
    monkeypatch.setattr(consts, 'PH', hasher)
    monkeypatch.setattr(database_service, 'PH', hasher)


@pytest_asyncio.fixture
async def db_engine():
    engine = create_async_engine(
        'sqlite+aiosqlite:///:memory:',
        connect_args={'check_same_thread': False},
        poolclass=StaticPool,
    )
    async with engine.begin() as conn:
        await conn.run_sync(METADATA.create_all)

    yield engine

    await engine.dispose()


@pytest_asyncio.fixture
async def db_service(db_engine):
    return DatabaseService(db_engine)


class InMemoryCache:
    def __init__(self):
        self.sessions = {}

    async def store_session(self, session_id: str, user: User):
        self.sessions[session_id] = (user, 1)

    async def get_session(self, session_id: str):
        return self.sessions.get(session_id)

    async def refresh_session(self, session_id: str):
        return None

    async def delete_session(self, session_id: str):
        self.sessions.pop(session_id, None)


class FakeKms:
    def __init__(self):
        self.keys = {}

    def store_api_key(self,
                      user_id: int,
                      api_key: str,
                      provider: LlmProviderType,
                      provider_id: int | None = None,
                      ):
        self.keys[(user_id, provider, provider_id)] = api_key

    def get_api_key(self,
                    user_id: int,
                    provider: LlmProviderType,
                    provider_id: int | None = None,
                    ):
        return self.keys.get((user_id, provider, provider_id), 'test-api-key')


@pytest_asyncio.fixture
async def test_app(db_service):
    app = FastAPI()
    app.state.db = db_service
    app.state.cache = InMemoryCache()
    app.state.kms = FakeKms()
    app.include_router(auth_router)
    app.include_router(config_router)
    app.include_router(world_card_router)
    app.include_router(save_router)
    app.include_router(chat_router)
    return app


@pytest_asyncio.fixture
async def client(test_app):
    transport = httpx.ASGITransport(app=test_app)
    async with httpx.AsyncClient(transport=transport, base_url='http://test') as client:
        yield client
