"""Pytest configuration and fixtures."""

import asyncio
from collections.abc import AsyncGenerator, Generator

import pytest
from httpx import AsyncClient

from backend.database import get_db_session
from backend.main import app


@pytest.fixture(scope="session")
def event_loop() -> Generator[asyncio.AbstractEventLoop, None, None]:
    """Keep asyncpg's global engine pool bound to one test-session loop."""
    loop = asyncio.get_event_loop_policy().new_event_loop()
    yield loop
    loop.close()


@pytest.fixture
async def client() -> AsyncGenerator[AsyncClient, None]:
    """HTTP client for API testing."""
    async with AsyncClient(app=app, base_url="http://test") as ac:
        yield ac


@pytest.fixture
async def db_session():
    """Database session for tests."""
    async with get_db_session() as session:
        yield session


@pytest.fixture
async def benefit_repository():
    """P5 benefit persistence dependency."""
    from backend.benefit.repository import BenefitRepository

    return BenefitRepository()


@pytest.fixture
async def benefit_service(benefit_repository):
    """P5 benefit engine service over the shared repository."""
    from backend.benefit.service import BenefitService

    return BenefitService(benefit_repository)
