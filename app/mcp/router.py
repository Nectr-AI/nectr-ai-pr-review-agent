"""
app/mcp/router.py
=================
NOTE: The Nectr MCP server (FastMCP SSE app) is mounted directly in app/main.py
via app.mount("/mcp", mcp.sse_app()) because FastAPI's include_router() cannot
handle ASGI sub-applications. This file is kept as a reference only.

External MCP clients should point at:
    GET  /mcp/sse       <- SSE stream (server → client events)
    POST /mcp/messages  <- JSON-RPC message ingestion
"""
