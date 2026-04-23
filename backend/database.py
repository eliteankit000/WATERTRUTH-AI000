"""
Async SQLAlchemy setup for Supabase (PostgreSQL Transaction Pooler).
Safe fallback: if DATABASE_URL is not set, the app runs without persistence.
"""
import os
from pathlib import Path
from typing import Optional

from dotenv import load_dotenv
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase

load_dotenv(Path(__file__).parent / ".env")

DATABASE_URL = os.environ.get("DATABASE_URL", "").strip()


class Base(DeclarativeBase):
    pass


engine = None
AsyncSessionLocal: Optional[async_sessionmaker[AsyncSession]] = None


def _init_engine() -> None:
    """Lazily build the async engine if DATABASE_URL is configured."""
    global engine, AsyncSessionLocal
    if engine is not None or not DATABASE_URL:
        return

    async_url = DATABASE_URL.replace("postgresql://", "postgresql+asyncpg://", 1)

    engine = create_async_engine(
        async_url,
        pool_size=10,
        max_overflow=5,
        pool_timeout=30,
        pool_recycle=1800,
        pool_pre_ping=False,
        echo=False,
        connect_args={
            "statement_cache_size": 0,   # required for Supabase transaction pooler
            "command_timeout": 30,
        },
    )

    AsyncSessionLocal = async_sessionmaker(
        bind=engine,
        class_=AsyncSession,
        expire_on_commit=False,
        autocommit=False,
        autoflush=False,
    )


_init_engine()


def is_configured() -> bool:
    return engine is not None


async def get_db():
    if AsyncSessionLocal is None:
        raise RuntimeError("DATABASE_URL not configured")
    async with AsyncSessionLocal() as session:
        try:
            yield session
        finally:
            await session.close()
