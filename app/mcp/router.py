"""
app/mcp/router.py
=================
FastAPI router that mounts the Nectr MCP server via SSE transport.

Register in app/main.py:

    from app.mcp.router import router as mcp_router
    app.include_router(mcp_router)

External MCP clients (Claude Desktop, Linear, Slack) should point at:

    http://<host>:<port>/mcp/sse      <- SSE stream (server → client events)
    http://<host>:<port>/mcp/messages <- POST endpoint (client → server messages)
"""

from __future__ import annotations

import logging

from fastapi import APIRouter

from app.mcp.server import mcp

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/mcp", tags=["mcp"])

# Mount the MCP SSE transport onto our sub-router.
# FastMCP.sse_app() returns a Starlette sub-application; we mount it so that:
#   GET  /mcp/sse       -> SSE event stream
#   POST /mcp/messages  -> JSON-RPC message ingestion
try:
    mcp_app = mcp.sse_app()
    router.mount("/", mcp_app)
    logger.info("Nectr MCP server mounted at /mcp (SSE transport)")
except Exception as exc:  # pragma: no cover
    # Non-fatal: if mcp package API changes, log and continue rather than
    # crashing the whole application on startup.
    logger.warning("Failed to mount MCP SSE app: %s", exc)
