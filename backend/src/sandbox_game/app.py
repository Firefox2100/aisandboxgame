from contextlib import asynccontextmanager
import uvicorn
from fastapi import FastAPI
from sqlalchemy.ext.asyncio import create_async_engine
from redis.asyncio import Redis
from hvac import Client

from sandbox_game.etc.consts import CONFIG, LOGGER
from sandbox_game.service import CacheService, DatabaseService, KmsService
from sandbox_game.router import auth_router, config_router, save_router, world_card_router, chat_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    engine = create_async_engine(CONFIG.database_url)
    app.state.db = DatabaseService(engine)

    redis_client = Redis(
        host=CONFIG.redis_host,
        port=CONFIG.redis_port,
    )
    app.state.cache = CacheService(redis_client)

    app.state.kms = None
    if CONFIG.vault_app_role_id and CONFIG.vault_app_secret_id:
        kms_client = Client(
            url=CONFIG.vault_url,
            strict_http=True,
        )
        kms_client.auth.approle.login(
            role_id=CONFIG.vault_app_role_id,
            secret_id=CONFIG.vault_app_secret_id,
        )
        app.state.kms = KmsService(kms_client)

    try:
        yield
    except Exception as e:
        LOGGER.critical('Fatal error during application lifespan: %s', e, exc_info=True)
        raise e
    finally:
        await engine.dispose()
        await redis_client.aclose()


def create_app():
    app = FastAPI(
        title='AI Sandbox Game',
        description='A highly customizable, local-first text RPG driven by LLMs.',
        lifespan=lifespan,
    )

    app.include_router(auth_router)
    app.include_router(config_router)
    app.include_router(world_card_router)
    app.include_router(save_router)
    app.include_router(chat_router)

    return app


if __name__ == '__main__':
    app = create_app()

    uvicorn.run(
        app,
        host='0.0.0.0',
        port=8090,
    )
