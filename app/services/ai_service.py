import anthropic
from app.core.config import settings

class AIServices:
    def __init__(self):
        self.client = anthropic.AsyncAnthropic(api_key=settings.ANTHROPIC_API_KEY)
        self.model = settings.ANTHROPIC_MODEL

    async def analyze_pull_request(self, pr_data: dict, diff: str = "", files: list = None) -> str:
        """
        Analyzes a PR and provide a review of its changes.
        """
        file_summary = ""
        if files:
            file_summary = "\n".join(
                f"  - {f['filename']} (+{f.get('additions', 0)} -{f.get('deletions', 0)}) [{f.get('status', 'modified')}]"
                for f in files[:20]
            )
        if len(diff) > 15000:
            diff = diff[:15000] + "\n...truncated"

        prompt = f"""You are Samosa, an AI code review agent. You analyze pull requests and report how they impact the project.

RULES:
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

PR Title: {pr_data.get('title', 'N/A')}
PR #{pr_data.get('number', 'N/A')} by {pr_data.get('user', {}).get('login', 'N/A')}
Description: {pr_data.get('body', 'No description provided')}

Files Changed:
{file_summary or 'No file data available'}

Diff:
{diff or 'No diff available'}
"""

        message = await self.client.messages.create(
            model=self.model,
            max_tokens=4000,
            messages=[{"role": "user", "content": prompt}]
        )
        return message.content[0].text

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