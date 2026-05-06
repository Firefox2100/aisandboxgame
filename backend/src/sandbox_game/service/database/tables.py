from sqlalchemy import Table, Column, MetaData, Integer, Boolean, String, ForeignKey, Text, UniqueConstraint


METADATA = MetaData()


CONFIG_TABLE = Table(
    'configs',
    METADATA,
    Column('id', Integer, primary_key=True, autoincrement=True),
    Column('key', String, unique=True, nullable=False),
    Column('value', String, nullable=False),
)


CUSTOM_LLM_PROVIDER_TABLE = Table(
    'custom_llm_providers',
    METADATA,
    Column('id', Integer, primary_key=True, autoincrement=True),
    Column('name', String, unique=True, nullable=False),
    Column('url', String, nullable=False),
    Column('type', String, nullable=False),
)


WORLD_CARD_TABLE = Table(
    'world_cards',
    METADATA,
    Column('id', String, primary_key=True),
    Column('owner_user_id', Integer, ForeignKey('users.id'), nullable=True),
    Column('name', String, nullable=False),
    Column('description', Text, nullable=False),
    Column('created_at', String, nullable=False),
    Column('updated_at', String, nullable=False),
    Column('is_built_in', Boolean, nullable=False, default=False),
    Column('is_empty', Boolean, nullable=False, default=False),
    Column('content_locale', String, nullable=False),
    Column('payload', Text, nullable=False),
)


USER_WORLD_STATE_TABLE = Table(
    'user_world_state',
    METADATA,
    Column('user_id', Integer, ForeignKey('users.id'), primary_key=True),
    Column('active_world_card_id', String, nullable=True),
    Column('current_slots', Text, nullable=False, default='{}'),
)


SAVE_SLOT_TABLE = Table(
    'save_slots',
    METADATA,
    Column('user_id', Integer, ForeignKey('users.id'), primary_key=True),
    Column('world_card_id', String, primary_key=True),
    Column('slot_id', String, primary_key=True),
    Column('name', String, nullable=False),
    Column('created_at', String, nullable=False),
    Column('updated_at', String, nullable=False),
    Column('progress_updated_at', String, nullable=False),
    Column('schema_version', Integer, nullable=False),
    Column('payload', Text, nullable=False),
    UniqueConstraint('user_id', 'world_card_id', 'slot_id', name='uq_save_slot'),
)


USER_TABLE = Table(
    'users',
    METADATA,
    Column('id', Integer, primary_key=True, autoincrement=True),
    Column('username', String, unique=True, nullable=False),
    Column('password_hash', String, nullable=False),
    Column('role', String, nullable=False),
)


USER_CONFIG_TABLE = Table(
    'user_configs',
    METADATA,
    Column('user_id', Integer, ForeignKey('users.id'), primary_key=True),
    Column('config_id', Integer, ForeignKey('configs.id'), primary_key=True),
    Column('value', String, nullable=False),
)
