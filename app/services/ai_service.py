import anthropic
from app.core.config import settings

class AIServices:
    def __init__(self):
        self.client = anthropic.Anthropic(api_key=settings.ANTHROPIC_API_KEY)
        self.model = settings.ANTHROPIC_MODEL

    def analyze_pull_request(self, pr_data: dict, diff: str = "", files: list = None) -> str:
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

CRITICAL INSTRUCTIONS:
- You are reviewing a SINGLE pull request. Focus ONLY on the changes introduced by THIS PR.
- Do NOT summarize the entire project. Only summarize what THIS PR does and why.
- When listing key changes, only list changes from THIS PR's diff.
- When identifying issues, only flag issues that arise from THIS PR's code changes and how they affect the existing project. You may use your understanding of the full project as context, but only report issues CAUSED by this PR.
- Do NOT include a "Suggestions" section. Stick to the four sections below.

Your response MUST follow this EXACT structure (use these exact markdown headings):

## Summary
<2-3 sentences: What does this PR do and why? Only describe THIS PR's purpose.>

## Key Changes
<Bullet list of the most important changes in THIS PR. Reference file names.>

## Issues
<Analyze THIS PR's changes for bugs, security vulnerabilities, performance problems, malicious code, and code smells. Only report issues that THIS PR introduces or could cause in the existing project. Classify each issue by severity:>
- Use "🔴 **Critical**:" prefix for issues that will cause failures, data loss, or security vulnerabilities
- Use "🟡 **Moderate**:" prefix for issues that may cause problems under certain conditions
- Use "🟢 **Minor**:" prefix for style issues, minor inefficiencies, or nitpicks

If you find NO issues, output exactly:
No issues found ✅

At the end of the Issues section, ALWAYS add a blank line then:
**Confidence: X%** (where X is your confidence level from 0-100 that this PR is safe to merge)

## Review Verdict
State one of: **APPROVE**, **REQUEST_CHANGES**, or **NEEDS_DISCUSSION**
Then add a one-line explanation of why.

---

## Pull Request Info
- Title: {pr_data.get('title', 'N/A')}
- Number: #{pr_data.get('number', 'N/A')}
- Author: {pr_data.get('user', {}).get('login', 'N/A')}
- Description: {pr_data.get('body', 'No description provided')}

## Files Changed
{file_summary or 'No file data available'}

## Code Diff
{diff or 'No diff available'}

Be specific — reference file names and line numbers when pointing out issues.
"""

        message = self.client.messages.create(
            model=self.model,
            max_tokens=2048,
            messages=[{"role": "user", "content": prompt}]
        )
        return message.content[0].text

    def classify_error(self, error_data: dict) -> str:
        """Analyzes a Sentry error and classifies its severity."""
        prompt = f"""You are DevCopilot, an AI assistant for engineering teams.
Analyze this error and provide:
1. Severity: P0 (critical), P1 (high), P2 (medium), P3 (low)
2. What went wrong
3. Suggested fix

Error Data:
{error_data}
"""
        message = self.client.messages.create(
            model=self.model,
            max_tokens=1024,
            messages=[{"role": "user", "content": prompt}]
        )
        return message.content[0].text

ai_service = AIServices()