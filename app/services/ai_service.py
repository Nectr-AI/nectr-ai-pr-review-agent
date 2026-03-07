import json
import re
from dataclasses import dataclass, field
from typing import TYPE_CHECKING

import anthropic
from app.core.config import settings

if TYPE_CHECKING:
    from app.services.context_service import ReviewContext

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

ai_service = AIServices()
