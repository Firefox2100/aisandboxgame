from contextlib import asynccontextmanager
import uvicorn
from starlette.middleware.sessions import SessionMiddleware
from fastapi import FastAPI
from databases import Database

from sandbox_game.etc.consts import CONFIG, LOGGER
from sandbox_game.service import DatabaseService
from sandbox_game.router import auth_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    client = Database(CONFIG.database_url)
    await client.connect()

    app.state.db = DatabaseService(client)

    try:
        yield
    except Exception as e:
        LOGGER.critical('Fatal error during application lifespan: %s', e, exc_info=True)
        raise e
    finally:
        # TODO: Clean up resources here
        pass


def create_app():
    app = FastAPI(
        title='AI Sandbox Game',
        description='A highly customizable, local-first text RPG driven by LLMs.',
        lifespan=lifespan,
    )

    app.add_middleware(
        SessionMiddleware,
        secret_key=CONFIG.secret_key,
        same_site='lax',
        https_only=CONFIG.use_https,
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
