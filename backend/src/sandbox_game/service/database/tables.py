from sqlalchemy import Table, Column, MetaData, Integer, Boolean, String, ForeignKey


METADATA = MetaData()


USER_TABLE = Table(
    'users',
    METADATA,
    Column('id', Integer, primary_key=True, autoincrement=True),
    Column('username', String, unique=True, nullable=False),
    Column('password_hash', String, nullable=False),
    Column('role', String, nullable=False),
)
