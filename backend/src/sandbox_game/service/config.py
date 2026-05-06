from .database import DatabaseService


class UserConfigService:
    def __init__(self,
                 db: DatabaseService,
                 user_id: int,
                 ):
        self._db = db
        self._user_id = user_id


class ConfigService:
    def __init__(self,
                 db: DatabaseService,
                 ):
        self._db = db

    def get_user_config(self, user_id: int) -> UserConfigService:
        return UserConfigService(
            db=self._db,
            user_id=user_id,
        )
