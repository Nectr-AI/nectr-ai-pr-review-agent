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

        prompt = f"""You are DevCopilot, an AI code review assistant for engineering teams.
Analyze this pull request thoroughly and provide:

1. **Summary** (2-3 sentences): What does this PR do and why?
2. **Key Changes**: List the most important changes
3. **Potential Issues**: Any bugs, security concerns, or code smells
4. **Suggestions**: Improvements the author should consider
5. **Review Verdict**: APPROVE, REQUEST_CHANGES, or NEEDS_DISCUSSION

## Pull Request Info
- Title: {pr_data.get('title', 'N/A')}
- Number: #{pr_data.get('number', 'N/A')}
- Author: {pr_data.get('user', {}).get('login', 'N/A')}
- Description: {pr_data.get('body', 'No description provided')}

## Files Changed
{file_summary or 'No file data available'}
## Code Diff
{diff or 'No diff available'}

Provide a thorough but concise review. Be specific — reference file names and line numbers when pointing out issues.
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