from argon2.exceptions import VerifyMismatchError
from databases import Database

from sandbox_game.etc.consts import PH
from sandbox_game.etc.enums import UserRole, CustomLlmProviderType
from sandbox_game.etc.errors import AuthenticationError, LlmProviderNotFound, UserNotFound
from sandbox_game.model.custom_llm_provider import CustomLlmProviderCreate, CustomLlmProvider
from sandbox_game.model.user import UserCreate, User
from .tables import USER_TABLE


class CustomLlmProviderRepository:
    def __init__(self, db: Database):
        self._db = db

    async def create(self,
                     provider: CustomLlmProviderCreate,
                     ) -> int:
        payload = {
            'name': provider.name,
            'type': provider.provider.value,
            'url': provider.url,
        }
        query = USER_TABLE.insert().values(**payload)

        result = await self._db.execute(query)
        return result

    async def get(self, provider_id: int) -> CustomLlmProvider:
        query = USER_TABLE.select().where(USER_TABLE.c.id == provider_id)
        record = await self._db.fetch_one(query)

        if not record:
            raise LlmProviderNotFound(provider_id)

        return CustomLlmProvider(
            provider_id=record['id'],
            name=record['name'],
            provider=CustomLlmProviderType(record['type']),
            url=record['url'],
        )

    async def list(self) -> list[CustomLlmProvider]:
        query = USER_TABLE.select()
        records = await self._db.fetch_all(query)

        providers = []
        for record in records:
            providers.append(CustomLlmProvider(
                provider_id=record['id'],
                name=record['name'],
                provider=CustomLlmProviderType(record['type']),
                url=record['url'],
            ))

        return providers


class UserRepository:
    """
    Database repository for user entities.
    """

    def __init__(self, db: Database):
        self._db = db

    async def create(self,
                     username: str,
                     password_hash: str,
                     role: UserRole = UserRole.USER,
                     ) -> int:
        """
        Create a new user in the database.
        :param username: The username of the new user.
        :param password_hash: The password of the new user.
        :param role: The role of the new user.
        :return: The ID of the newly created user.
        """
        payload = {
            'username': username,
            'password_hash': password_hash,
            'role': role.value,
        }
        query = USER_TABLE.insert().values(**payload)

        result = await self._db.execute(query)
        return result

    async def get_by_username(self,
                              username: str,
                              ) -> User:
        query = USER_TABLE.select().where(USER_TABLE.c.username == username)
        record = await self._db.fetch_one(query)

        if not record:
            raise UserNotFound(username=username)

        return User(
            user_id=record['id'],
            username=record['username'],
            password_hash=record['password_hash'],
            role=UserRole(record['role']),
        )


class DatabaseService:
    def __init__(self, db: Database):
        self._db = db

        self._custom_llm_provider = CustomLlmProviderRepository(db)
        self._user = UserRepository(db)

    async def create_user(self,
                          user: UserCreate,
                          role: UserRole = UserRole.USER,
                          ) -> User:
        """
        Create a new user in the database.
        """
        hashed_password = PH.hash(user.password)
        user_id = await self._user.create(
            username=user.username,
            password_hash=hashed_password,
            role=role,
        )

        return User(
            user_id=user_id,
            username=user.username,
            password_hash=None,
            role=role,
        )

    async def login_user(self,
                         username: str,
                         password: str,
                         ) -> User:
        user = await self._user.get_by_username(username)

        try:
            PH.verify(
                user.password_hash,
                password,
            )
        except VerifyMismatchError as e:
            raise AuthenticationError('Invalid password.') from e
        except Exception as e:
            raise AuthenticationError('Failed to invoke Argon2 password hasher.') from e

        return user

    async def create_custom_llm_provider(self, provider: CustomLlmProviderCreate) -> CustomLlmProvider:
        provider_id = await self._custom_llm_provider.create(provider)

        return CustomLlmProvider(
            provider_id=provider_id,
            name=provider.name,
            provider=provider.provider,
            url=provider.url,
        )

    async def list_custom_llm_providers(self) -> list[CustomLlmProvider]:
        return await self._custom_llm_provider.list()
