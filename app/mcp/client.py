"""
app/mcp/client.py
=================
Nectr MCP Client Manager (INBOUND).

Manages connections to external MCP servers (Linear, GitHub, Sentry, Slack)
so Nectr's AI reviewer can pull live context — issues, tasks, and production
errors — during a PR review.

Behaviour:
  - If the relevant MCP server URL is configured in settings → connect via MCP
    protocol and call the named tool.
  - Otherwise → log an info message and return an empty list (graceful
    degradation — the review continues without that context).
"""

from __future__ import annotations

import json
import logging
from typing import Any

import httpx

from app.core.config import settings

logger = logging.getLogger(__name__)

# HTTP timeout for external MCP server calls (seconds)
_MCP_TIMEOUT = 10.0


class MCPClientManager:
    """Manages connections to external MCP servers.

    Each public method corresponds to one inbound data source.  All methods
    are async and return plain Python dicts/lists — callers do not need to
    know whether the data came from a live MCP call or a graceful fallback.
    """

    # ------------------------------------------------------------------
    # Public API — called by ReviewToolExecutor
    # ------------------------------------------------------------------

    async def get_linear_issues(self, team_id: str, query: str) -> list[dict]:
        """Pull issues / tasks from the Linear MCP server matching *query*.

        Args:
            team_id: Linear team identifier (e.g. ``"ENG"``).
            query:   Free-text search query (topic, feature area, keyword).

        Returns:
            List of issue dicts: ``{id, title, state, url, description}``.
            Empty list if Linear MCP is not configured or the call fails.
        """
        if not settings.LINEAR_MCP_URL:
            logger.info(
                "LINEAR_MCP_URL not configured — skipping Linear issue fetch "
                "(set LINEAR_MCP_URL + LINEAR_API_KEY to enable)"
            )
            return []

        return await self.query_mcp_server(
            server_url=settings.LINEAR_MCP_URL,
            tool_name="search_issues",
            args={"team_id": team_id, "query": query},
            auth_token=settings.LINEAR_API_KEY,
        )

    async def get_sentry_errors(self, project: str, filename: str) -> list[dict]:
        """Get recent Sentry errors related to a file being reviewed.

        Args:
            project:  Sentry project slug (e.g. ``"backend"``).
            filename: File path from the PR diff to filter errors by.

        Returns:
            List of error dicts: ``{id, title, culprit, count, last_seen}``.
            Empty list if Sentry MCP is not configured or the call fails.
        """
        if not settings.SENTRY_MCP_URL:
            logger.info(
                "SENTRY_MCP_URL not configured — skipping Sentry error fetch "
                "(set SENTRY_MCP_URL + SENTRY_AUTH_TOKEN to enable)"
            )
            return []

        return await self.query_mcp_server(
            server_url=settings.SENTRY_MCP_URL,
            tool_name="search_errors",
            args={"project": project, "filename": filename},
            auth_token=settings.SENTRY_AUTH_TOKEN,
        )

    async def get_github_issues(
        self,
        repo: str,
        labels: list[str] | None = None,
        query: str = "",
    ) -> list[dict]:
        """Pull open GitHub issues that a PR might be addressing.

        Falls back to the Metorial-hosted GitHub MCP if configured, otherwise
        returns an empty list — the native GitHub REST client in
        ``ReviewToolExecutor`` already covers the common case.

        Args:
            repo:   Full repo name, e.g. ``owner/repo``.
            labels: Optional label filter list.
            query:  Free-text search string.

        Returns:
            List of issue dicts: ``{number, title, state, body, labels}``.
        """
        # Check for Metorial / GitHub MCP deployment first
        metorial_url = _metorial_mcp_url()
        if not metorial_url:
            logger.info(
                "GitHub MCP not configured — skipping (METORIAL_API_KEY or "
                "GITHUB_MCP_DEPLOYMENT_ID not set)"
            )
            return []

        return await self.query_mcp_server(
            server_url=metorial_url,
            tool_name="list_issues",
            args={"repo": repo, "labels": labels or [], "query": query},
        )

    async def query_mcp_server(
        self,
        server_url: str,
        tool_name: str,
        args: dict,
        auth_token: str | None = None,
    ) -> list[dict] | dict:
        """Generic method to call any MCP server tool over HTTP/SSE JSON-RPC.

        Sends a JSON-RPC 2.0 ``tools/call`` request to *server_url* and
        returns the parsed result.  Returns an empty list on any error so
        callers can always iterate over the result safely.

        Args:
            server_url:  Base URL of the MCP server (e.g. ``http://host:8001``).
            tool_name:   MCP tool name to invoke.
            args:        Tool input arguments dict.
            auth_token:  Optional bearer token for the Authorization header.

        Returns:
            Parsed tool result (list or dict).  Empty list on failure.
        """
        payload = {
            "jsonrpc": "2.0",
            "id": 1,
            "method": "tools/call",
            "params": {"name": tool_name, "arguments": args},
        }
        headers: dict[str, str] = {"Content-Type": "application/json"}
        if auth_token:
            headers["Authorization"] = f"Bearer {auth_token}"

        try:
            async with httpx.AsyncClient(timeout=_MCP_TIMEOUT) as client:
                response = await client.post(
                    f"{server_url.rstrip('/')}/",
                    json=payload,
                    headers=headers,
                )
                response.raise_for_status()
                data = response.json()

            # JSON-RPC 2.0 result shape: {"result": {"content": [...]}}
            result = data.get("result", data)
            if isinstance(result, dict):
                # Unwrap MCP content array if present
                content = result.get("content", result)
                if isinstance(content, list):
                    # Each content item may be {type: "text", text: "<json>"}
                    items = []
                    for item in content:
                        if isinstance(item, dict) and item.get("type") == "text":
                            try:
                                parsed = json.loads(item["text"])
                                if isinstance(parsed, list):
                                    items.extend(parsed)
                                else:
                                    items.append(parsed)
                            except (json.JSONDecodeError, KeyError):
                                items.append(item)
                        else:
                            items.append(item)
                    return items
                return content if isinstance(content, list) else [content]
            if isinstance(result, list):
                return result
            return []

        except httpx.TimeoutException:
            logger.warning(
                "MCP call timed out: %s tool=%s (timeout=%ss)",
                server_url, tool_name, _MCP_TIMEOUT,
            )
            return []
        except httpx.HTTPStatusError as exc:
            logger.warning(
                "MCP server returned HTTP %s for tool=%s: %s",
                exc.response.status_code, tool_name, exc,
            )
            return []
        except Exception as exc:
            logger.warning(
                "MCP query_mcp_server failed (server=%s tool=%s): %s",
                server_url, tool_name, exc,
            )
            return []


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------


def _metorial_mcp_url() -> str | None:
    """Build the Metorial GitHub MCP URL if both required settings are present."""
    api_key = settings.METORIAL_API_KEY
    deployment_id = settings.GITHUB_MCP_DEPLOYMENT_ID
    if api_key and deployment_id:
        return f"https://api.metorial.com/mcp/{deployment_id}"
    return None


# ---------------------------------------------------------------------------
# Module-level singleton — import and use directly
# ---------------------------------------------------------------------------
mcp_client = MCPClientManager()
