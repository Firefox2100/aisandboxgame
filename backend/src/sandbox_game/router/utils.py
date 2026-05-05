from fastapi import Request

from sandbox_game.service import DatabaseService


def get_db(request: Request) -> DatabaseService:
    return request.app.state.db
