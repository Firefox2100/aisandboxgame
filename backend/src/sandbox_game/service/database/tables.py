from sqlalchemy import Table, Column, MetaData, Integer, Boolean, String, ForeignKey


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
