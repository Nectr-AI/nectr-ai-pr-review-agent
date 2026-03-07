import asyncio
import json
import logging
import re
from dataclasses import dataclass, field
from typing import TYPE_CHECKING, Protocol

import anthropic
from app.core.config import settings

if TYPE_CHECKING:
    from app.services.context_service import ReviewContext

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Tool definitions — Claude calls these on demand instead of receiving all
# context upfront.  The actual implementations live in ReviewToolExecutor
# (pr_review_service.py) so this module stays pure of I/O concerns.
# ---------------------------------------------------------------------------
REVIEW_TOOLS: list[dict] = [
    {
        "name": "read_file",
        "description": (
            "Read the complete source code of a file at the PR's head commit. "
            "Use this to understand context that the diff alone doesn't show — "
            "e.g. the full class a method belongs to, imports, or a callee. "
            "Only read files you actually need."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "path": {"type": "string", "description": "Repo-relative file path, e.g. 'app/auth/login.py'"},
            },
            "required": ["path"],
        },
    },
    {
        "name": "search_project_memory",
        "description": (
            "Search the project's accumulated knowledge for patterns, past decisions, "
            "and known risks relevant to your query. Use this when the diff touches "
            "an area you want to cross-check against historical context."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "query": {"type": "string", "description": "What to look up, e.g. 'rate limiting strategy' or 'auth token handling'"},
            },
            "required": ["query"],
        },
    },
    {
        "name": "search_developer_memory",
        "description": (
            "Search what Nectr has learned about a specific developer — "
            "their recurring patterns, known strengths, and past issues. "
            "Use this when the PR author is known and you want to tailor feedback."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "developer": {"type": "string", "description": "GitHub username"},
                "query": {"type": "string", "description": "What aspect to retrieve, e.g. 'error handling habits'"},
            },
            "required": ["developer", "query"],
        },
    },
    {
        "name": "get_file_history",
        "description": (
            "Get (1) which developers have the most commits touching these files, "
            "and (2) past PRs that modified the same files. "
            "Use this to spot patterns like 'this file keeps getting bug-fixed'."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "paths": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": "File paths to check history for (max 10)",
                },
            },
            "required": ["paths"],
        },
    },
    {
        "name": "get_issue_details",
        "description": (
            "Fetch title, state, and description of specific GitHub issues "
            "(e.g. those mentioned in the PR body with 'Fixes #N')."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "numbers": {
                    "type": "array",
                    "items": {"type": "integer"},
                    "description": "Issue numbers to fetch (max 5)",
                },
            },
            "required": ["numbers"],
        },
    },
    {
        "name": "search_open_issues",
        "description": (
            "Search open GitHub issues to find ones this PR might resolve "
            "even without an explicit 'Fixes #N' mention. "
            "Use keywords from the PR's changed functionality."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "keywords": {"type": "string", "description": "Space-separated keywords to match against issue titles/bodies"},
            },
            "required": ["keywords"],
        },
    },
    {
        "name": "get_linked_issues",
        "description": (
            "Fetch Linear or GitHub issues linked to this PR's feature area. "
            "Use when you want to understand what user problem the PR is solving, "
            "or when the PR description references a task/ticket without a direct #N link."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "query": {
                    "type": "string",
                    "description": "Topic or feature area to search for, e.g. 'rate limiting' or 'auth token refresh'",
                },
                "source": {
                    "type": "string",
                    "enum": ["linear", "github"],
                    "description": "Which issue tracker to query (default: github)",
                },
            },
            "required": ["query"],
        },
    },
    {
        "name": "get_related_errors",
        "description": (
            "Get recent Sentry / production errors related to files modified in this PR. "
            "Use to check whether the PR might be fixing (or inadvertently introducing) "
            "a known error that already appears in production logs."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "files": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": "File paths modified in the PR (use the exact paths from the diff)",
                },
            },
            "required": ["files"],
        },
    },
]


# ── Specialized agent tool subsets ────────────────────────────────────────────
# Each agent gets only the tools relevant to its domain

SECURITY_TOOLS = [t for t in REVIEW_TOOLS if t["name"] in {
    "read_file", "search_project_memory", "get_issue_details", "search_open_issues"
}]

PERFORMANCE_TOOLS = [t for t in REVIEW_TOOLS if t["name"] in {
    "read_file", "get_file_history", "search_project_memory"
}]

STYLE_TOOLS = [t for t in REVIEW_TOOLS if t["name"] in {
    "read_file", "search_developer_memory", "search_project_memory", "search_open_issues"
}]

SECURITY_AGENT_PROMPT = """You are a specialized security code reviewer. 
Focus EXCLUSIVELY on security issues:
- Injection vulnerabilities (SQL, command, path traversal, SSRF)
- Authentication and authorization flaws
- Secrets/credentials accidentally committed
- Insecure dependencies or imports
- Input validation gaps at trust boundaries
- Cryptographic weaknesses
- Sensitive data exposure (PII in logs, unencrypted storage)

For each issue found: severity (CRITICAL/HIGH/MEDIUM/LOW), file:line, what the risk is, concrete fix.
If no security issues: say "No security issues found" — do NOT invent issues.
Be terse. Output JSON-serializable structured findings."""

PERFORMANCE_AGENT_PROMPT = """You are a specialized performance code reviewer.
Focus EXCLUSIVELY on performance issues:
- N+1 database queries (loop + individual queries)
- Missing indexes or inefficient query patterns
- Unbounded loops or O(n²)+ algorithms where O(n log n) is feasible
- Memory leaks (unclosed resources, unbounded caches, circular refs)
- Blocking I/O in async contexts
- Unnecessary serialization/deserialization in hot paths
- Large payload transfers that could be paginated/streamed

For each issue found: impact (HIGH/MEDIUM/LOW), file:line, what the bottleneck is, concrete fix.
If no performance issues: say "No performance issues found" — do NOT invent issues.
Be terse. Output JSON-serializable structured findings."""

STYLE_AGENT_PROMPT = """You are a specialized code quality reviewer.
Focus EXCLUSIVELY on code quality, tests, and maintainability:
- Missing or inadequate test coverage for new logic
- Functions/methods that are too complex (>20 lines, deep nesting)
- Unclear variable/function naming that hinders readability
- Missing error handling for operations that can fail
- Dead code, unused imports, or leftover debug statements
- API contract breakages (changed signatures, removed fields)
- Missing or outdated docstrings on public interfaces

For each issue: severity (HIGH/MEDIUM/LOW), file:line, what the issue is, concrete fix.
If no style/quality issues: say "No style issues found" — do NOT invent issues.
Be terse. Output JSON-serializable structured findings."""


class ToolExecutor(Protocol):
    """Interface that pr_review_service.ReviewToolExecutor must satisfy."""
    async def execute(self, tool_name: str, tool_input: dict) -> str: ...

_SUGGESTIONS_RE = re.compile(r"<suggestions>\s*(.*?)\s*</suggestions>", re.DOTALL)
_SEMANTIC_ISSUES_RE = re.compile(r"<semantic_issues>\s*(.*?)\s*</semantic_issues>", re.DOTALL)


@dataclass
class PRReviewResult:
    """Structured result from AI PR analysis."""
    summary: str                                     # Full prose markdown review
    verdict: str = "NEEDS_DISCUSSION"                # "APPROVE" | "REQUEST_CHANGES" | "NEEDS_DISCUSSION"
    inline_comments: list[dict] = field(default_factory=list)
    # Each inline_comment: {file, line_hint, comment, suggestion}
    semantic_issue_matches: list[dict] = field(default_factory=list)
    # Each match: {number, title, confidence, reason}


class AIServices:
    def __init__(self):
        self.client = anthropic.AsyncAnthropic(api_key=settings.ANTHROPIC_API_KEY)
        self.model = settings.ANTHROPIC_MODEL

    async def analyze_pull_request(
        self,
        pr_data: dict,
        diff: str = "",
        files: list = None,
        context: "ReviewContext | None" = None,
        linked_issues: list[dict] | None = None,
        similar_items: list[dict] | None = None,
        file_contents: dict[str, str] | None = None,
        potential_issues: list[dict] | None = None,
    ) -> PRReviewResult:
        """
        Analyzes a PR and provides a review of its changes.
        Returns a PRReviewResult with prose summary + optional inline suggestions.
        Optionally injects ReviewContext (project rules, developer patterns) when available.
        """
        file_summary = ""
        if files:
            file_summary = "\n".join(
                f"  - {f['filename']} (+{f.get('additions', 0)} -{f.get('deletions', 0)}) [{f.get('status', 'modified')}]"
                for f in files[:20]
            )
        if len(diff) > 15000:
            diff = diff[:15000] + "\n...truncated"

        _EXT_LANG = {
            "py": "python", "js": "javascript", "ts": "typescript",
            "tsx": "typescript", "jsx": "javascript", "go": "go",
            "rs": "rust", "java": "java", "rb": "ruby", "cs": "csharp",
            "cpp": "cpp", "c": "c", "php": "php", "swift": "swift",
            "kt": "kotlin", "sh": "bash", "yaml": "yaml", "yml": "yaml",
            "json": "json", "sql": "sql", "tf": "hcl", "md": "markdown",
        }

        file_contents_block = ""
        if file_contents:
            parts = [
                "## Full File Contents",
                "Use these to understand cross-file dependencies, function signatures, "
                "exception types raised, and error-handling patterns beyond the diff.\n",
            ]
            for path, content in file_contents.items():
                ext = path.rsplit(".", 1)[-1].lower() if "." in path else ""
                lang = _EXT_LANG.get(ext, "")
                parts.append(f"### {path}\n```{lang}\n{content}\n```")
            file_contents_block = "\n".join(parts) + "\n\n---\n\n"

        context_block = ""
        if context and context.serialized:
            context_block = f"""
You have memory of this project. Use it to give project-aware reviews.

{context.serialized}

---
"""

        resolved_block = ""
        if linked_issues:
            lines = ["This PR claims to resolve the following issues:"]
            for issue in linked_issues:
                title = issue.get("title") or f"Issue #{issue['number']}"
                state = issue.get("state", "")
                state_tag = f" [{state}]" if state else ""
                body_preview = (issue.get("body") or "")[:150]
                desc = f" — {body_preview}" if body_preview else ""
                lines.append(f"- #{issue['number']}{state_tag}: {title}{desc}")
            resolved_block = "\n".join(lines) + "\n\n"

        similar_block = ""
        if similar_items:
            lines = ["Related past work (use for context, do not pad the review with this):"]
            for item in similar_items:
                tag = f"PR #{item['number']}" if item["type"] == "pr" else f"Issue #{item['number']}"
                lines.append(f"- {tag}: {item['content'][:150]}")
            similar_block = "\n".join(lines) + "\n\n"

        potential_issues_block = ""
        if potential_issues:
            lines = [
                "OPEN ISSUES — assess whether this PR semantically resolves any of them "
                "(even without explicit 'Fixes #N' mention). Only flag if you are confident:",
            ]
            for issue in potential_issues:
                body_preview = (issue.get("body") or "")[:120].replace("\n", " ")
                desc = f" — {body_preview}" if body_preview else ""
                lines.append(f"- #{issue['number']}: {issue.get('title', '')}{desc}")
            potential_issues_block = "\n".join(lines) + "\n\n"

        prompt = f"""You are Nectr, an AI code review agent. You analyze pull requests and report how they impact the project.
{context_block}{resolved_block}{similar_block}{potential_issues_block}RULES:
- Review ONLY the changes in THIS PR. Do not summarize the whole project.
- Be CONCISE. Use short bullet points, not paragraphs. Each bullet should be ONE line.
- For issues: ONLY flag issues that are specific, real, and actionable for THIS PR.
  Do NOT flag generic issues that could apply to any codebase (e.g., "consider adding more tests", "logging could expose sensitive data", "variable timing might be slightly off", "doesn't handle edge case X" when X is hypothetical).
  If you are not confident an issue is real and caused by THIS PR, do not include it.
- If you find no real issues, say so honestly. Do NOT invent filler issues to appear thorough.

Respond in this EXACT format:

## Summary
<Exactly 2-3 short sentences. What does this PR do and why?>

## Key Changes
<3-5 short bullet points. Each bullet: `filename` — one-line description. No paragraphs.>

## Issues
<Only list issues that are real, specific, and caused by THIS PR's code. Use these prefixes:>
- 🔴 **Critical:** <will cause failure, data loss, or security vulnerability>
- 🟡 **Moderate:** <will cause problems under specific, concrete conditions>
- 🟢 **Minor:** <clearly actionable style or efficiency issue>

If no real issues exist, write exactly: No issues found ✅

**Confidence: X/5** — how confident you are this PR is safe to merge (1=very risky, 5=clearly safe)

## Important Files Changed
| File | Change |
|------|--------|
<One row per changed file. "Change" column: 5-10 word summary.>

## Review Verdict
**APPROVE**, **REQUEST_CHANGES**, or **NEEDS_DISCUSSION** — one-line reason.

---

After the markdown review above, output a JSON block wrapped in <suggestions> tags.
For EVERY real issue you listed in "## Issues", you MUST try to include a corresponding suggestion entry here with an exact fix.
You may also include suggestions for non-issue improvements (refactors, clarity, etc.).

<suggestions>
[
  {{
    "file": "path/to/file.py",
    "line_hint": "exact content of the FIRST affected line as it appears after '+' in the diff",
    "end_line_hint": "exact content of the LAST affected line (omit for single-line changes)",
    "comment": "one-line explanation — must reference the specific issue (e.g. 'per_page=10 silently drops bots before filtering')",
    "suggestion": "exact replacement code — preserve original indentation, may be multi-line"
  }}
]
</suggestions>

Rules for suggestions:
- For each 🔴/🟡/🟢 issue above, produce a suggestion targeting the EXACT line(s) in the diff that cause the problem
- "line_hint" = EXACT text of the first `+` line involved (no leading `+`, preserve indentation as-is)
- "end_line_hint" = EXACT text of the last `+` line involved; OMIT for single-line changes
- "suggestion" = the verbatim replacement (preserve indentation); use "" (empty string) to delete a line
- To fix a misplaced/local import (e.g. `import X` inside a function body): set "suggestion" to "" to
  delete it and note in "comment" that it should be added at the top of the file
- To fix a wrong identifier (e.g. `_asyncio.sleep` → `asyncio.sleep`): replace only that one line
- Maximum 6 suggestions total (prioritise 🔴 then 🟡 then 🟢)
- Only include a suggestion if you can provide a CORRECT, CONCRETE fix — do not guess
- "comment" must name the specific problem (e.g. "local import runs on every call; move asyncio to top-level")
- If no suggestions are possible, output exactly: <suggestions>[]</suggestions>

If "OPEN ISSUES" were listed above, output a JSON block in <semantic_issues> tags identifying which open issues this PR likely resolves — even without an explicit "Fixes #N" mention.
Only include an issue if you are confident the PR's changes directly address the problem described.

<semantic_issues>
[
  {{
    "number": 12,
    "confidence": "high",
    "reason": "one-line explanation of why this PR resolves the issue"
  }}
]
</semantic_issues>

Rules for semantic_issues:
- "confidence" must be "high" or "medium" — never include low-confidence matches
- "reason" must be specific (cite code, function names, or behaviour from the diff) — not generic
- Maximum 5 entries
- If no issues are confidently resolved, omit the <semantic_issues> block entirely

---

PR Title: {pr_data.get('title', 'N/A')}
PR #{pr_data.get('number', 'N/A')} by {pr_data.get('user', {}).get('login', 'N/A')}
Description: {pr_data.get('body', 'No description provided')}

Files Changed:
{file_summary or 'No file data available'}

{file_contents_block}Diff:
{diff or 'No diff available'}
"""

        message = await self.client.messages.create(
            model=self.model,
            max_tokens=4000,
            messages=[{"role": "user", "content": prompt}]
        )
        raw_text: str = message.content[0].text

        # --- Parse <suggestions> block ---
        inline_comments: list[dict] = []
        suggestions_match = _SUGGESTIONS_RE.search(raw_text)
        if suggestions_match:
            try:
                parsed = json.loads(suggestions_match.group(1))
                if isinstance(parsed, list):
                    inline_comments = parsed[:5]  # hard cap at 5
            except (json.JSONDecodeError, ValueError):
                pass  # malformed JSON — skip suggestions, keep prose

        # --- Parse <semantic_issues> block ---
        semantic_issue_matches: list[dict] = []
        semantic_match = _SEMANTIC_ISSUES_RE.search(raw_text)
        if semantic_match:
            try:
                parsed_semantic = json.loads(semantic_match.group(1))
                if isinstance(parsed_semantic, list):
                    # Only keep high/medium confidence, cap at 5
                    semantic_issue_matches = [
                        m for m in parsed_semantic
                        if isinstance(m, dict)
                        and m.get("confidence") in ("high", "medium")
                        and isinstance(m.get("number"), int)
                    ][:5]
            except (json.JSONDecodeError, ValueError):
                pass

        # Strip both tagged blocks from the prose summary
        prose_summary = _SUGGESTIONS_RE.sub("", raw_text)
        prose_summary = _SEMANTIC_ISSUES_RE.sub("", prose_summary).strip()

        # --- Extract verdict from prose ---
        verdict = "NEEDS_DISCUSSION"
        if "**APPROVE**" in prose_summary or "## Review Verdict\n**APPROVE**" in prose_summary:
            verdict = "APPROVE"
        elif "**REQUEST_CHANGES**" in prose_summary:
            verdict = "REQUEST_CHANGES"

        return PRReviewResult(
            summary=prose_summary,
            verdict=verdict,
            inline_comments=inline_comments,
            semantic_issue_matches=semantic_issue_matches,
        )

    # ------------------------------------------------------------------
    # Shared output parser — used by both the batch and agentic methods
    # ------------------------------------------------------------------
    def _parse_output(self, raw_text: str) -> PRReviewResult:
        inline_comments: list[dict] = []
        suggestions_match = _SUGGESTIONS_RE.search(raw_text)
        if suggestions_match:
            try:
                parsed = json.loads(suggestions_match.group(1))
                if isinstance(parsed, list):
                    inline_comments = parsed[:6]
            except (json.JSONDecodeError, ValueError):
                pass

        semantic_issue_matches: list[dict] = []
        semantic_match = _SEMANTIC_ISSUES_RE.search(raw_text)
        if semantic_match:
            try:
                parsed_semantic = json.loads(semantic_match.group(1))
                if isinstance(parsed_semantic, list):
                    semantic_issue_matches = [
                        m for m in parsed_semantic
                        if isinstance(m, dict)
                        and m.get("confidence") in ("high", "medium")
                        and isinstance(m.get("number"), int)
                    ][:5]
            except (json.JSONDecodeError, ValueError):
                pass

        prose = _SUGGESTIONS_RE.sub("", raw_text)
        prose = _SEMANTIC_ISSUES_RE.sub("", prose).strip()

        verdict = "NEEDS_DISCUSSION"
        if "**APPROVE**" in prose:
            verdict = "APPROVE"
        elif "**REQUEST_CHANGES**" in prose:
            verdict = "REQUEST_CHANGES"

        return PRReviewResult(
            summary=prose,
            verdict=verdict,
            inline_comments=inline_comments,
            semantic_issue_matches=semantic_issue_matches,
        )

    # ------------------------------------------------------------------
    # Agentic review — Claude decides what context to fetch via tools
    # ------------------------------------------------------------------
    async def analyze_pull_request_agentic(
        self,
        pr_data: dict,
        diff: str,
        files: list,
        tool_executor: "ToolExecutor",
        issue_refs: list[int] | None = None,
    ) -> PRReviewResult:
        """
        Agentic PR review: Claude receives only the diff + file list,
        then calls tools on-demand to pull in exactly the context it needs.

        Advantages over the batch approach:
        - Claude isn't overwhelmed with 50 kB of context it may not need
        - Each tool call is targeted → sharper, less noisy analysis
        - Claude can follow its own reasoning thread (read a file →
          check history → search memory) rather than ingesting everything at once
        """
        file_summary = "\n".join(
            f"  - {f['filename']} (+{f.get('additions', 0)} -{f.get('deletions', 0)}) [{f.get('status', 'modified')}]"
            for f in (files or [])[:20]
        )
        if len(diff) > 15000:
            diff = diff[:15000] + "\n...diff truncated"

        pr_number = pr_data.get("number", "N/A")
        pr_title   = pr_data.get("title", "N/A")
        pr_author  = (pr_data.get("user") or {}).get("login", "N/A")
        pr_body    = pr_data.get("body") or "No description provided"

        refs_hint = ""
        if issue_refs:
            refs_hint = f"\nThis PR references issue(s): {', '.join(f'#{n}' for n in issue_refs)}. Consider fetching their details.\n"

        # ----- OUTPUT FORMAT (identical to batch method) -----
        output_format = """
When you have enough context, write your review in this EXACT format:

## Summary
<2-3 sentences: what does this PR do and why?>

## Key Changes
<3-5 bullets: `filename` — one-line description>

## Issues
- 🔴 **Critical:** <will cause failure, data loss, or security vulnerability>
- 🟡 **Moderate:** <will cause problems under specific, concrete conditions>
- 🟢 **Minor:** <clearly actionable style or efficiency issue>

If no real issues exist, write exactly: No issues found ✅

**Confidence: X/5**

## Important Files Changed
| File | Change |
|------|--------|
<one row per file>

## Review Verdict
**APPROVE**, **REQUEST_CHANGES**, or **NEEDS_DISCUSSION** — one-line reason.

---

<suggestions>
[
  {
    "file": "path/to/file.py",
    "line_hint": "exact content of FIRST affected + line from diff",
    "end_line_hint": "exact content of LAST affected + line (omit for single-line)",
    "comment": "specific problem description",
    "suggestion": "exact replacement (empty string to delete the line)"
  }
]
</suggestions>

<semantic_issues>
[{"number": 12, "confidence": "high", "reason": "one-line explanation"}]
</semantic_issues>
"""

        initial_prompt = f"""You are Nectr, an AI code review agent. You review pull requests surgically — you only look at what you need to.

You have tools to fetch additional context. Use them selectively:
- Call `read_file` only for files where the diff alone is insufficient to understand the change
- Call `search_project_memory` or `search_developer_memory` when you spot a pattern worth cross-checking
- Call `get_file_history` if a file looks fragile or you want to know who owns it
- Call `get_issue_details` for any issue references in the PR
- Call `search_open_issues` if the PR appears to fix something not explicitly mentioned

Rules:
- Only flag issues that are REAL, SPECIFIC, and caused by THIS PR's code
- Do NOT invent issues just to appear thorough
- Be concise — short bullets, not paragraphs
- Maximum 3-4 tool calls total; stop gathering when you have enough to write a confident review

PR Title: {pr_title}
PR #{pr_number} by @{pr_author}
Description: {pr_body[:500]}
{refs_hint}
Files Changed:
{file_summary or 'No file data available'}

Diff:
{diff or 'No diff available'}
{output_format}"""

        messages: list[dict] = [{"role": "user", "content": initial_prompt}]
        raw_text = ""
        max_rounds = 8   # safety cap — prevents infinite tool-call loops

        for round_num in range(max_rounds):
            response = await self.client.messages.create(
                model=self.model,
                max_tokens=4000,
                tools=REVIEW_TOOLS,
                messages=messages,
            )

            logger.info(
                f"Agentic review round {round_num + 1}: "
                f"stop_reason={response.stop_reason}, "
                f"tool_calls={sum(1 for b in response.content if b.type == 'tool_use')}"
            )

            # ── Finished — extract prose ──────────────────────────────────
            if response.stop_reason == "end_turn":
                raw_text = "".join(
                    b.text for b in response.content if hasattr(b, "text")
                )
                break

            # ── Tool calls ────────────────────────────────────────────────
            if response.stop_reason == "tool_use":
                messages.append({"role": "assistant", "content": response.content})

                tool_results = []
                for block in response.content:
                    if block.type != "tool_use":
                        continue
                    logger.info(f"Tool call: {block.name}({block.input})")
                    try:
                        result = await tool_executor.execute(block.name, block.input)
                    except Exception as exc:
                        result = f"Tool error: {exc}"
                    tool_results.append({
                        "type": "tool_result",
                        "tool_use_id": block.id,
                        "content": result,
                    })

                messages.append({"role": "user", "content": tool_results})
                continue

            # ── Unexpected stop reason ────────────────────────────────────
            raw_text = "".join(b.text for b in response.content if hasattr(b, "text"))
            break

        if not raw_text:
            logger.warning("Agentic review produced no text output")
            raw_text = "Review could not be completed."

        return self._parse_output(raw_text)

    async def classify_error(self, error_data: dict) -> str:
        """Analyzes a Sentry error and classifies its severity."""
        prompt = f"""You are DevCopilot, an AI assistant for engineering teams.
Analyze this error and provide:
1. Severity: P0 (critical), P1 (high), P2 (medium), P3 (low)
2. What went wrong
3. Suggested fix

Error Data:
{error_data}
"""
        message = await self.client.messages.create(
            model=self.model,
            max_tokens=1024,
            messages=[{"role": "user", "content": prompt}]
        )
        return message.content[0].text

    # ------------------------------------------------------------------
    # Parallel specialized agents review
    # ------------------------------------------------------------------
    async def analyze_pull_request_parallel(
        self,
        pr: dict,
        diff: str,
        files: list[dict],
        tool_executor,  # ReviewToolExecutor
        issue_refs: list[int] | None = None,
    ) -> dict:
        """
        Run security, performance, and style agents in parallel, then synthesize.
        Returns same shape as analyze_pull_request_agentic().
        """
        # Build shared context block (same for all 3 agents)
        pr_title = pr.get("title", "")
        pr_body = pr.get("body") or ""
        author = (pr.get("user") or {}).get("login", "unknown")
        changed_files = [f.get("filename", "") for f in files if f.get("filename")]

        context_block = f"""PR #{pr.get('number')} — {pr_title}
Author: @{author}
Files changed ({len(changed_files)}): {', '.join(changed_files[:15])}
Issue refs: {issue_refs or []}

--- DIFF ---
{diff[:12000]}
"""

        # Run all 3 specialized agents concurrently
        security_task = self._run_specialized_agent(
            agent_name="security",
            system_prompt=SECURITY_AGENT_PROMPT,
            context=context_block,
            tools=SECURITY_TOOLS,
            tool_executor=tool_executor,
        )
        performance_task = self._run_specialized_agent(
            agent_name="performance",
            system_prompt=PERFORMANCE_AGENT_PROMPT,
            context=context_block,
            tools=PERFORMANCE_TOOLS,
            tool_executor=tool_executor,
        )
        style_task = self._run_specialized_agent(
            agent_name="style",
            system_prompt=STYLE_AGENT_PROMPT,
            context=context_block,
            tools=STYLE_TOOLS,
            tool_executor=tool_executor,
        )

        security_out, performance_out, style_out = await asyncio.gather(
            security_task, performance_task, style_task,
            return_exceptions=True
        )

        # Handle individual agent failures gracefully
        def safe_result(result, name: str) -> str:
            if isinstance(result, Exception):
                logger.error(f"{name} agent failed: {result}")
                return f"[{name} agent error: {result}]"
            return result

        security_findings = safe_result(security_out, "security")
        performance_findings = safe_result(performance_out, "performance")
        style_findings = safe_result(style_out, "style")

        # Synthesis agent combines all findings into one final verdict
        return await self._synthesize_review(
            pr=pr,
            diff=diff,
            files=files,
            security_findings=security_findings,
            performance_findings=performance_findings,
            style_findings=style_findings,
            issue_refs=issue_refs,
        )

    async def _run_specialized_agent(
        self,
        agent_name: str,
        system_prompt: str,
        context: str,
        tools: list[dict],
        tool_executor,
        max_rounds: int = 5,
    ) -> str:
        """Run a single specialized agent with its own tool loop. Returns text findings."""
        messages = [{"role": "user", "content": context}]

        for round_num in range(max_rounds):
            response = await self.client.messages.create(
                model=self.model,
                max_tokens=2048,
                system=system_prompt,
                tools=tools,
                messages=messages,
            )

            logger.info(
                f"[{agent_name}] round {round_num + 1}: "
                f"stop_reason={response.stop_reason}"
            )

            if response.stop_reason == "end_turn":
                text_parts = [b.text for b in response.content if hasattr(b, "text")]
                return "\n".join(text_parts)

            if response.stop_reason == "tool_use":
                tool_results = []
                for block in response.content:
                    if block.type != "tool_use":
                        continue
                    logger.info(f"[{agent_name}] tool call: {block.name}({block.input})")
                    try:
                        result = await tool_executor.execute(block.name, block.input)
                    except Exception as e:
                        result = f"Tool error: {e}"
                    tool_results.append({
                        "type": "tool_result",
                        "tool_use_id": block.id,
                        "content": str(result)[:4000],
                    })

                messages.append({"role": "assistant", "content": response.content})
                messages.append({"role": "user", "content": tool_results})
            else:
                break

        # Fallback: extract whatever text we have from the last response
        text_parts = [b.text for b in response.content if hasattr(b, "text")]
        return "\n".join(text_parts) or f"[{agent_name} agent: no output]"

    async def _synthesize_review(
        self,
        pr: dict,
        diff: str,
        files: list[dict],
        security_findings: str,
        performance_findings: str,
        style_findings: str,
        issue_refs: list[int] | None,
    ) -> dict:
        """Combine specialized findings into one final structured verdict."""
        pr_title = pr.get("title", "")
        author = (pr.get("user") or {}).get("login", "unknown")
        changed_files = [f.get("filename", "") for f in files if f.get("filename")]

        synthesis_prompt = f"""You are the final synthesizer for a parallel code review system.
Three specialized agents have analyzed PR #{pr.get('number')} — "{pr_title}" by @{author}.

SECURITY AGENT FINDINGS:
{security_findings}

PERFORMANCE AGENT FINDINGS:
{performance_findings}

STYLE/QUALITY AGENT FINDINGS:
{style_findings}

Based on ALL findings above, produce a final unified code review. Respond in this EXACT JSON format:
{{
  "verdict": "approved" | "changes_requested" | "comment",
  "summary": "2-3 sentence overall assessment",
  "security_issues": [],
  "performance_issues": [],
  "style_issues": [],
  "inline_comments": [
    {{"path": "file/path.py", "line": 42, "body": "specific comment"}}
  ],
  "memory_insights": "patterns worth remembering about this author/codebase"
}}

Rules:
- verdict = "changes_requested" if ANY critical/high security or performance issue
- verdict = "approved" if only low/medium style issues or no issues
- verdict = "comment" if borderline (medium issues only)
- Deduplicate if multiple agents flagged the same issue
- inline_comments: max 8, most impactful only
- Be constructive and specific"""

        response = await self.client.messages.create(
            model=self.model,
            max_tokens=3000,
            system="You are a senior engineer synthesizing a parallel code review. Output valid JSON only.",
            messages=[{"role": "user", "content": synthesis_prompt}],
        )

        raw = response.content[0].text if response.content else "{}"

        # Parse JSON — strip markdown fences if present
        json_match = re.search(r'\{.*\}', raw, re.DOTALL)
        if json_match:
            try:
                return json.loads(json_match.group())
            except json.JSONDecodeError:
                pass

        # Fallback structure
        return {
            "verdict": "comment",
            "summary": raw[:500],
            "security_issues": [],
            "performance_issues": [],
            "style_issues": [],
            "inline_comments": [],
            "memory_insights": "",
        }


ai_service = AIServices()
