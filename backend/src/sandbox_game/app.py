from contextlib import asynccontextmanager
import uvicorn
from fastapi import FastAPI
from databases import Database
from redis.asyncio import Redis

from sandbox_game.etc.consts import CONFIG, LOGGER
from sandbox_game.service import CacheService, DatabaseService
from sandbox_game.router import auth_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    db_client = Database(CONFIG.database_url)
    await db_client.connect()
    app.state.db = DatabaseService(db_client)

    redis_client = Redis(
        host=CONFIG.redis_host,
        port=CONFIG.redis_port,
    )
    app.state.cache = CacheService(redis_client)

    try:
        yield
    except Exception as e:
        LOGGER.critical('Fatal error during application lifespan: %s', e, exc_info=True)
        raise e
    finally:
        await db_client.disconnect()
        await redis_client.aclose()


def create_app():
    app = FastAPI(
        title='AI Sandbox Game',
        description='A highly customizable, local-first text RPG driven by LLMs.',
        lifespan=lifespan,
    )

    app.include_router(auth_router)

    return app


if __name__ == '__main__':
    app = create_app()

    uvicorn.run(
        app,
        host='0.0.0.0',
        port=8090,
    )
