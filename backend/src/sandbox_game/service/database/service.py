from databases import Database

from sandbox_game.etc.consts import PH
from sandbox_game.etc.enums import UserRole
from sandbox_game.model.user import UserCreate, User
from .tables import USER_TABLE


class UserRepository:
    """
    Database repository for user entities.
    """

    def __init__(self, db: Database):
        self._db = db

    async def create(self,
                     user: UserCreate,
                     role: UserRole = UserRole.USER,
                     ) -> int:
        """
        Create a new user in the database.
        :param user: The user to create.
        :param role: The role of the user.
        :return: The ID of the newly created user.
        """
        hashed_password = PH.hash(user.password)

        payload = {
            'username': user.username,
            'password_hash': hashed_password,
            'role': role.value,
        }
        query = USER_TABLE.insert().values(**payload)

        result = await self._db.execute(query)

        return result.lastrowid


class DatabaseService:
    def __init__(self, db: Database):
        self._db = db

        self._user = UserRepository(db)

    async def create_user(self,
                          user: UserCreate,
                          role: UserRole = UserRole.USER,
                          ) -> User:
        """
        Create a new user in the database.
        """
        user_id = await self._user.create(user, role)

        return User(
            user_id=user_id,
            username=user.username,
            password_hash=None,
            role=role,
        )
