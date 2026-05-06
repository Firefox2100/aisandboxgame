# tests/integration/test_database_service.py
import pytest
import pytest_asyncio
from datetime import datetime
from sqlalchemy.ext.asyncio import create_async_engine

from sandbox_game.etc.enums import UserRole, CustomLlmProviderType
from sandbox_game.model.user import UserCreate
from sandbox_game.model.custom_llm_provider import CustomLlmProviderCreate
from sandbox_game.model.world_card import WorldCard
from sandbox_game.model.save import GameSave
from sandbox_game.service.database.service import DatabaseService
from sandbox_game.service.database.tables import METADATA


@pytest_asyncio.fixture
async def db():
    """Create in-memory SQLite database for testing."""
    engine = create_async_engine("sqlite+aiosqlite:///:memory:", echo=True)
    async with engine.begin() as conn:
        await conn.run_sync(METADATA.create_all)

    yield engine


@pytest_asyncio.fixture
async def db_service(db):
    """Create DatabaseService instance."""
    return DatabaseService(db)


@pytest.mark.asyncio
async def test_create_user(db_service):
    """Test user creation."""
    user_create = UserCreate(username="testuser", password="password123")

    user = await db_service.create_user(user_create)

    assert user.username == "testuser"
    assert user.user_id is not None
    assert user.role == UserRole.USER


@pytest.mark.asyncio
async def test_login_user_valid_password(db_service):
    """Test login with correct password."""
    user_create = UserCreate(username="testuser", password="password123")
    await db_service.create_user(user_create)

    logged_in_user = await db_service.login_user("testuser", "password123")

    assert logged_in_user.username == "testuser"


@pytest.mark.asyncio
async def test_login_user_invalid_password(db_service):
    """Test login with incorrect password."""
    user_create = UserCreate(username="testuser", password="password123")
    await db_service.create_user(user_create)

    from sandbox_game.etc.errors import AuthenticationError
    with pytest.raises(AuthenticationError):
        await db_service.login_user("testuser", "wrongpassword")


@pytest.mark.asyncio
async def test_create_custom_llm_provider(db_service):
    """Test custom LLM provider creation."""
    provider_create = CustomLlmProviderCreate(
        name="TestProvider",
        provider=CustomLlmProviderType.OLLAMA,
        url="https://openrouter.ai/api/v1"
    )

    provider = await db_service.create_custom_llm_provider(provider_create)

    assert provider.name == "TestProvider"
    assert provider.provider_id is not None


@pytest.mark.asyncio
async def test_list_custom_llm_providers(db_service):
    """Test listing custom LLM providers."""
    provider_create = CustomLlmProviderCreate(
        name="TestProvider",
        provider=CustomLlmProviderType.OLLAMA,
        url="https://openrouter.ai/api/v1"
    )
    await db_service.create_custom_llm_provider(provider_create)

    providers = await db_service.list_custom_llm_providers()

    assert len(providers) == 1
    assert providers[0].name == "TestProvider"


@pytest.mark.asyncio
async def test_upsert_and_get_world_card(db_service):
    """Test upserting and retrieving a world card."""
    user_create = UserCreate(username="testuser", password="password123")
    user = await db_service.create_user(user_create)

    card = WorldCard(
        id="test_card_1",
        name="Test World",
        description="A test world card",
        created_at=datetime.now().isoformat(),
        updated_at=datetime.now().isoformat(),
        is_built_in=False,
        content_locale="en",
        # Add other required fields based on your WorldCard model
    )

    await db_service.upsert_world_card(user.user_id, card)

    retrieved_card = await db_service.get_world_card(user.user_id, "test_card_1")

    assert retrieved_card is not None
    assert retrieved_card.name == "Test World"


@pytest.mark.asyncio
async def test_delete_world_card(db_service):
    """Test deleting a world card."""
    user_create = UserCreate(username="testuser", password="password123")
    user = await db_service.create_user(user_create)

    card = WorldCard(
        id="test_card_1",
        name="Test World",
        description="A test world card",
        created_at=datetime.now().isoformat(),
        updated_at=datetime.now().isoformat(),
        is_built_in=False,
        content_locale="en",
    )

    await db_service.upsert_world_card(user.user_id, card)
    await db_service.delete_world_card(user.user_id, "test_card_1")

    retrieved_card = await db_service.get_world_card(user.user_id, "test_card_1")
    assert retrieved_card is None


@pytest.mark.asyncio
async def test_set_and_get_current_save_slot(db_service):
    """Test setting and retrieving current save slot."""
    user_create = UserCreate(username="testuser", password="password123")
    user = await db_service.create_user(user_create)

    await db_service.set_current_save_slot(user.user_id, "world_1", "slot_1")
    slot = await db_service.get_current_save_slot(user.user_id, "world_1")

    assert slot == "slot_1"
