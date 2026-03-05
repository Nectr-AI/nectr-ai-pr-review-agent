"""
Neo4j async driver singleton.
Gracefully no-ops when NEO4J_PASSWORD is not configured.
"""
import logging
from contextlib import asynccontextmanager
from typing import AsyncGenerator

from app.core.config import settings

logger = logging.getLogger(__name__)

_driver = None


def get_driver():
    """Return the Neo4j async driver, or None if not configured."""
    return _driver


async def init_driver():
    """Initialise the Neo4j async driver. Called once on app startup."""
    global _driver
    if not settings.NEO4J_PASSWORD:
        logger.info("NEO4J_PASSWORD not set — Neo4j disabled")
        return

    try:
        from neo4j import AsyncGraphDatabase

        _driver = AsyncGraphDatabase.driver(
            settings.NEO4J_URI,
            auth=(settings.NEO4J_USERNAME, settings.NEO4J_PASSWORD),
        )
        await _driver.verify_connectivity()
        logger.info(f"Neo4j connected: {settings.NEO4J_URI}")
    except Exception as e:
        logger.warning(f"Neo4j init failed (disabled): {e}")
        _driver = None


async def close_driver():
    """Close the Neo4j driver. Called on app shutdown."""
    global _driver
    if _driver:
        await _driver.close()
        _driver = None
        logger.info("Neo4j driver closed")


def is_available() -> bool:
    return _driver is not None


@asynccontextmanager
async def get_session() -> AsyncGenerator:
    """Async context manager for a Neo4j session."""
    driver = get_driver()
    if not driver:
        raise RuntimeError("Neo4j not available")
    async with driver.session() as session:
        yield session
