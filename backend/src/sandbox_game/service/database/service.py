import json
from argon2.exceptions import VerifyMismatchError
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncConnection, create_async_engine

from sandbox_game.etc.consts import PH
from sandbox_game.etc.enums import UserRole, CustomLlmProviderType
from sandbox_game.etc.errors import AuthenticationError, LlmProviderNotFound, UserNotFound
from sandbox_game.model.custom_llm_provider import CustomLlmProviderCreate, CustomLlmProvider
from sandbox_game.model.save import GameSave
from sandbox_game.model.user import UserCreate, User
from sandbox_game.model.world_card import WorldCard
from .tables import CUSTOM_LLM_PROVIDER_TABLE, SAVE_SLOT_TABLE, USER_TABLE, USER_WORLD_STATE_TABLE, WORLD_CARD_TABLE


class CustomLlmProviderRepository:
    def __init__(self, conn: AsyncConnection):
        self._conn = conn

    async def create(self,
                     provider: CustomLlmProviderCreate,
                     ) -> int:
        payload = {
            'name': provider.name,
            'type': provider.provider.value,
            'url': provider.url,
        }
        query = CUSTOM_LLM_PROVIDER_TABLE.insert().values(**payload)

        result = await self._conn.execute(query)
        return result.inserted_primary_key[0]

    async def get(self, provider_id: int) -> CustomLlmProvider:
        query = CUSTOM_LLM_PROVIDER_TABLE.select().where(CUSTOM_LLM_PROVIDER_TABLE.c.id == provider_id)
        result = await self._conn.execute(query)
        record = result.mappings().first()

        if not record:
            raise LlmProviderNotFound(provider_id)

        return CustomLlmProvider(
            provider_id=record['id'],
            name=record['name'],
            provider=CustomLlmProviderType(record['type']),
            url=record['url'],
        )

    async def list(self) -> list[CustomLlmProvider]:
        query = CUSTOM_LLM_PROVIDER_TABLE.select()
        result = await self._conn.execute(query)
        records = result.mappings().all()

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

    def __init__(self, conn: AsyncConnection):
        self._conn = conn

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

        result = await self._conn.execute(query)
        return result.inserted_primary_key[0]

    async def get_by_username(self,
                              username: str,
                              ) -> User:
        query = USER_TABLE.select().where(USER_TABLE.c.username == username)
        result = await self._conn.execute(query)
        record = result.mappings().first()

        if not record:
            raise UserNotFound(username=username)

        return User(
            user_id=record['id'],
            username=record['username'],
            password_hash=record['password_hash'],
            role=UserRole(record['role']),
        )


class WorldStateRepository:
    def __init__(self, conn: AsyncConnection):
        self._conn = conn

    async def get_active_world_card_id(self, user_id: int) -> str | None:
        query = USER_WORLD_STATE_TABLE.select().where(USER_WORLD_STATE_TABLE.c.user_id == user_id)
        result = await self._conn.execute(query)
        record = result.mappings().first()
        return record['active_world_card_id'] if record else None

    async def set_active_world_card_id(self, user_id: int, card_id: str | None):
        current_slots = await self.get_current_slots(user_id)
        values = {
            'user_id': user_id,
            'active_world_card_id': card_id,
            'current_slots': json.dumps(current_slots),
        }
        existing_result = await self._conn.execute(
            USER_WORLD_STATE_TABLE.select().where(USER_WORLD_STATE_TABLE.c.user_id == user_id)
        )
        existing = existing_result.mappings().first()

        if existing:
            query = (
                USER_WORLD_STATE_TABLE.update()
                .where(USER_WORLD_STATE_TABLE.c.user_id == user_id)
                .values(active_world_card_id=card_id)
            )
        else:
            query = USER_WORLD_STATE_TABLE.insert().values(**values)
        await self._conn.execute(query)

    async def get_current_slots(self, user_id: int) -> dict[str, str]:
        query = USER_WORLD_STATE_TABLE.select().where(USER_WORLD_STATE_TABLE.c.user_id == user_id)
        result = await self._conn.execute(query)
        record = result.mappings().first()
        if not record:
            return {}
        try:
            parsed = json.loads(record['current_slots'] or '{}')
        except json.JSONDecodeError:
            return {}
        return parsed if isinstance(parsed, dict) else {}

    async def set_current_slot(self, user_id: int, world_card_id: str, slot_id: str | None):
        current_slots = await self.get_current_slots(user_id)
        if slot_id:
            current_slots[world_card_id] = slot_id
        else:
            current_slots.pop(world_card_id, None)

        existing_result = await self._conn.execute(
            USER_WORLD_STATE_TABLE.select().where(USER_WORLD_STATE_TABLE.c.user_id == user_id)
        )
        existing = existing_result.mappings().first()
        values = {
            'user_id': user_id,
            'active_world_card_id': existing['active_world_card_id'] if existing else None,
            'current_slots': json.dumps(current_slots),
        }
        if existing:
            query = (
                USER_WORLD_STATE_TABLE.update()
                .where(USER_WORLD_STATE_TABLE.c.user_id == user_id)
                .values(current_slots=values['current_slots'])
            )
        else:
            query = USER_WORLD_STATE_TABLE.insert().values(**values)
        await self._conn.execute(query)


class WorldCardRepository:
    def __init__(self, conn: AsyncConnection):
        self._conn = conn

    @staticmethod
    def _to_model(record) -> WorldCard:
        payload = json.loads(record['payload'])
        payload.setdefault('id', record['id'])
        payload.setdefault('name', record['name'])
        payload.setdefault('description', record['description'])
        payload.setdefault('created_at', record['created_at'])
        payload.setdefault('updated_at', record['updated_at'])
        payload.setdefault('is_built_in', record['is_built_in'])
        payload.setdefault('content_locale', record['content_locale'])
        return WorldCard.model_validate(payload)

    async def upsert(self,
                     user_id: int | None,
                     card: WorldCard,
                     is_empty: bool = False,
                     ):
        payload = card.model_dump(mode='json', by_alias=True)
        values = {
            'id': card.id,
            'owner_user_id': user_id,
            'name': card.name,
            'description': card.description,
            'created_at': card.created_at or '',
            'updated_at': card.updated_at or '',
            'is_built_in': card.is_built_in,
            'is_empty': is_empty,
            'content_locale': card.content_locale,
            'payload': json.dumps(payload, ensure_ascii=False),
        }
        existing_result = await self._conn.execute(WORLD_CARD_TABLE.select().where(WORLD_CARD_TABLE.c.id == card.id))
        existing = existing_result.mappings().first()
        if existing:
            query = WORLD_CARD_TABLE.update().where(WORLD_CARD_TABLE.c.id == card.id).values(**values)
        else:
            query = WORLD_CARD_TABLE.insert().values(**values)
        await self._conn.execute(query)

    async def get(self,
                  user_id: int | None,
                  card_id: str,
                  include_built_in: bool = True,
                  ) -> WorldCard | None:
        query = WORLD_CARD_TABLE.select().where(WORLD_CARD_TABLE.c.id == card_id)
        result = await self._conn.execute(query)
        record = result.mappings().first()
        if not record:
            return None
        if record['is_built_in'] and include_built_in:
            return self._to_model(record)
        if user_id is not None and record['owner_user_id'] == user_id:
            return self._to_model(record)
        return None

    async def list(self,
                   user_id: int,
                   include_built_in: bool = True,
                   ) -> list[WorldCard]:
        if include_built_in:
            query = WORLD_CARD_TABLE.select().where(
                (WORLD_CARD_TABLE.c.owner_user_id == user_id) |
                (WORLD_CARD_TABLE.c.is_built_in == True)  # noqa: E712
            )
        else:
            query = WORLD_CARD_TABLE.select().where(WORLD_CARD_TABLE.c.owner_user_id == user_id)
        result = await self._conn.execute(query)
        records = result.mappings().all()
        return [self._to_model(record) for record in records]

    async def delete(self, user_id: int, card_id: str):
        query = WORLD_CARD_TABLE.delete().where(
            (WORLD_CARD_TABLE.c.id == card_id) &
            (WORLD_CARD_TABLE.c.owner_user_id == user_id) &
            (WORLD_CARD_TABLE.c.is_built_in == False)  # noqa: E712
        )
        await self._conn.execute(query)


class SaveRepository:
    def __init__(self, conn: AsyncConnection):
        self._conn = conn

    @staticmethod
    def _to_model(record) -> GameSave:
        payload = json.loads(record['payload'])
        return GameSave.model_validate(payload)

    async def upsert(self, user_id: int, world_card_id: str, save: GameSave):
        payload = save.model_dump(mode='json')
        values = {
            'user_id': user_id,
            'world_card_id': world_card_id,
            'slot_id': save.id,
            'name': save.name,
            'created_at': save.created_at,
            'updated_at': save.updated_at,
            'progress_updated_at': save.progress_updated_at,
            'schema_version': save.schema_version,
            'payload': json.dumps(payload, ensure_ascii=False),
        }
        existing_result = await self._conn.execute(
            SAVE_SLOT_TABLE.select().where(
                (SAVE_SLOT_TABLE.c.user_id == user_id) &
                (SAVE_SLOT_TABLE.c.world_card_id == world_card_id) &
                (SAVE_SLOT_TABLE.c.slot_id == save.id)
            )
        )
        existing = existing_result.mappings().first()
        if existing:
            query = SAVE_SLOT_TABLE.update().where(
                (SAVE_SLOT_TABLE.c.user_id == user_id) &
                (SAVE_SLOT_TABLE.c.world_card_id == world_card_id) &
                (SAVE_SLOT_TABLE.c.slot_id == save.id)
            ).values(**values)
        else:
            query = SAVE_SLOT_TABLE.insert().values(**values)
        await self._conn.execute(query)

    async def get(self, user_id: int, world_card_id: str, slot_id: str) -> GameSave | None:
        query = SAVE_SLOT_TABLE.select().where(
            (SAVE_SLOT_TABLE.c.user_id == user_id) &
            (SAVE_SLOT_TABLE.c.world_card_id == world_card_id) &
            (SAVE_SLOT_TABLE.c.slot_id == slot_id)
        )
        result = await self._conn.execute(query)
        record = result.mappings().first()
        return self._to_model(record) if record else None

    async def list(self, user_id: int, world_card_id: str) -> list[GameSave]:
        query = SAVE_SLOT_TABLE.select().where(
            (SAVE_SLOT_TABLE.c.user_id == user_id) &
            (SAVE_SLOT_TABLE.c.world_card_id == world_card_id)
        )
        result = await self._conn.execute(query)
        records = result.mappings().all()
        return [self._to_model(record) for record in records]

    async def delete(self, user_id: int, world_card_id: str, slot_id: str):
        query = SAVE_SLOT_TABLE.delete().where(
            (SAVE_SLOT_TABLE.c.user_id == user_id) &
            (SAVE_SLOT_TABLE.c.world_card_id == world_card_id) &
            (SAVE_SLOT_TABLE.c.slot_id == slot_id)
        )
        await self._conn.execute(query)


class DatabaseService:
    def __init__(self, engine: AsyncEngine):
        self._engine = engine

    async def create_user(self,
                          user: UserCreate,
                          role: UserRole = UserRole.USER,
                          ) -> User:
        """
        Create a new user in the database.
        """
        hashed_password = PH.hash(user.password)
        async with self._engine.begin() as conn:
            user_repo = UserRepository(conn)
            user_id = await user_repo.create(
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
        async with self._engine.begin() as conn:
            user_repo = UserRepository(conn)
            user = await user_repo.get_by_username(username)

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
        async with self._engine.begin() as conn:
            custom_llm_provider_repo = CustomLlmProviderRepository(conn)
            provider_id = await custom_llm_provider_repo.create(provider)

        return CustomLlmProvider(
            provider_id=provider_id,
            name=provider.name,
            provider=provider.provider,
            url=provider.url,
        )

    async def list_custom_llm_providers(self) -> list[CustomLlmProvider]:
        async with self._engine.begin() as conn:
            custom_llm_provider_repo = CustomLlmProviderRepository(conn)
            return await custom_llm_provider_repo.list()

    async def get_custom_llm_provider(self, provider_id: int) -> CustomLlmProvider:
        async with self._engine.begin() as conn:
            custom_llm_provider_repo = CustomLlmProviderRepository(conn)
            return await custom_llm_provider_repo.get(provider_id)

    async def upsert_world_card(self,
                                user_id: int | None,
                                card: WorldCard,
                                is_empty: bool = False,
                                ):
        async with self._engine.begin() as conn:
            world_card_repo = WorldCardRepository(conn)
            await world_card_repo.upsert(
                user_id=user_id,
                card=card,
                is_empty=is_empty,
            )

    async def get_world_card(self,
                             user_id: int | None,
                             card_id: str,
                             include_built_in: bool = True,
                             ) -> WorldCard | None:
        async with self._engine.begin() as conn:
            world_card_repo = WorldCardRepository(conn)
            return await world_card_repo.get(
                user_id=user_id,
                card_id=card_id,
                include_built_in=include_built_in,
            )

    async def list_world_cards(self,
                               user_id: int,
                               include_built_in: bool = True,
                               ) -> list[WorldCard]:
        async with self._engine.begin() as conn:
            world_card_repo = WorldCardRepository(conn)
            return await world_card_repo.list(
                user_id=user_id,
                include_built_in=include_built_in,
            )

    async def delete_world_card(self, user_id: int, card_id: str):
        async with self._engine.begin() as conn:
            world_card_repo = WorldCardRepository(conn)
            await world_card_repo.delete(user_id, card_id)

    async def get_active_world_card_id(self, user_id: int) -> str | None:
        async with self._engine.begin() as conn:
            world_state_repo = WorldStateRepository(conn)
            return await world_state_repo.get_active_world_card_id(user_id)

    async def set_active_world_card_id(self, user_id: int, card_id: str | None):
        async with self._engine.begin() as conn:
            world_state_repo = WorldStateRepository(conn)
            await world_state_repo.set_active_world_card_id(user_id, card_id)

    async def get_current_save_slot(self, user_id: int, world_card_id: str) -> str | None:
        async with self._engine.begin() as conn:
            world_state_repo = WorldStateRepository(conn)
            return (await world_state_repo.get_current_slots(user_id)).get(world_card_id)

    async def set_current_save_slot(self, user_id: int, world_card_id: str, slot_id: str | None):
        async with self._engine.begin() as conn:
            world_state_repo = WorldStateRepository(conn)
            await world_state_repo.set_current_slot(user_id, world_card_id, slot_id)

    async def upsert_save(self, user_id: int, world_card_id: str, save: GameSave):
        async with self._engine.begin() as conn:
            save_repo = SaveRepository(conn)
            await save_repo.upsert(user_id, world_card_id, save)

    async def get_save(self, user_id: int, world_card_id: str, slot_id: str) -> GameSave | None:
        async with self._engine.begin() as conn:
            save_repo = SaveRepository(conn)
            return await save_repo.get(user_id, world_card_id, slot_id)

    async def list_saves(self, user_id: int, world_card_id: str) -> list[GameSave]:
        async with self._engine.begin() as conn:
            save_repo = SaveRepository(conn)
            return await save_repo.list(user_id, world_card_id)

    async def delete_save(self, user_id: int, world_card_id: str, slot_id: str):
        async with self._engine.begin() as conn:
            save_repo = SaveRepository(conn)
            await save_repo.delete(user_id, world_card_id, slot_id)
