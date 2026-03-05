"""
Neo4j constraints and indexes.
Called once on app startup after the driver is initialised.
"""
import logging
from app.core.neo4j_client import get_session, is_available

logger = logging.getLogger(__name__)

# Constraint DDL — idempotent (IF NOT EXISTS)
_CONSTRAINTS = [
    "CREATE CONSTRAINT repo_unique IF NOT EXISTS FOR (r:Repository) REQUIRE r.full_name IS UNIQUE",
    "CREATE CONSTRAINT file_unique IF NOT EXISTS FOR (f:File) REQUIRE (f.repo, f.path) IS NODE KEY",
    "CREATE CONSTRAINT pr_unique IF NOT EXISTS FOR (p:PullRequest) REQUIRE (p.repo, p.number) IS NODE KEY",
    "CREATE CONSTRAINT developer_unique IF NOT EXISTS FOR (d:Developer) REQUIRE d.login IS UNIQUE",
    "CREATE CONSTRAINT issue_unique IF NOT EXISTS FOR (i:Issue) REQUIRE (i.repo, i.number) IS NODE KEY",
]


async def create_schema():
    """Create all Neo4j constraints. Safe to call on every startup."""
    if not is_available():
        return

    try:
        async with get_session() as session:
            for cypher in _CONSTRAINTS:
                try:
                    await session.run(cypher)
                except Exception as e:
                    # Older Neo4j versions may not support IF NOT EXISTS
                    logger.debug(f"Constraint creation note: {e}")
        logger.info("Neo4j schema ready")
    except Exception as e:
        logger.warning(f"Neo4j schema setup failed: {e}")
