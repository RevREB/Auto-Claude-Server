"""
Claude SDK client wrapper for AI analysis.
"""

import json
from pathlib import Path
from typing import Any

try:
    from claude_agent_sdk import ClaudeAgentOptions, ClaudeSDKClient

    CLAUDE_SDK_AVAILABLE = True
except ImportError:
    CLAUDE_SDK_AVAILABLE = False


class ClaudeAnalysisClient:
    """Wrapper for Claude SDK client with analysis-specific configuration."""

    DEFAULT_MODEL = "claude-sonnet-4-5-20250929"
    ALLOWED_TOOLS = ["Read", "Glob", "Grep"]
    MAX_TURNS = 50

    def __init__(self, project_dir: Path):
        """
        Initialize Claude client.

        Args:
            project_dir: Root directory of project being analyzed
        """
        if not CLAUDE_SDK_AVAILABLE:
            raise RuntimeError(
                "claude-agent-sdk not available. Install with: pip install claude-agent-sdk"
            )

        self.project_dir = project_dir
        self._validate_oauth_token()

    def _validate_oauth_token(self) -> None:
        """Validate that an authentication token is available."""
        from core.auth import require_auth_token

        require_auth_token()  # Raises ValueError if no token found

    async def run_analysis_query(self, prompt: str) -> str:
        """
        Run a Claude query for analysis.

        Args:
            prompt: The analysis prompt

        Returns:
            Claude's response text
        """
        settings_json = self._get_settings_json()
        client = self._create_client(settings_json)

        async with client:
            await client.query(prompt)
            return await self._collect_response(client)

    def _get_settings_json(self) -> str:
        """
        Get security settings as JSON string.

        Returns:
            JSON string of settings (passed directly to SDK, no file needed)
        """
        settings = {
            "sandbox": {"enabled": True, "autoAllowBashIfSandboxed": True},
            "permissions": {
                "defaultMode": "acceptEdits",
                "allow": [
                    "Read(./**)",
                    "Glob(./**)",
                    "Grep(./**)",
                ],
            },
        }
        return json.dumps(settings)

    def _create_client(self, settings_json: str) -> Any:
        """
        Create configured Claude SDK client.

        Args:
            settings_json: Security settings as JSON string

        Returns:
            ClaudeSDKClient instance
        """
        system_prompt = (
            f"You are a senior software architect analyzing this codebase. "
            f"Your working directory is: {self.project_dir.resolve()}\n"
            f"Use Read, Grep, and Glob tools to analyze actual code. "
            f"Output your analysis as valid JSON only."
        )

        return ClaudeSDKClient(
            options=ClaudeAgentOptions(
                model=self.DEFAULT_MODEL,
                system_prompt=system_prompt,
                allowed_tools=self.ALLOWED_TOOLS,
                max_turns=self.MAX_TURNS,
                cwd=str(self.project_dir.resolve()),
                settings=settings_json,
            )
        )

    async def _collect_response(self, client: Any) -> str:
        """
        Collect text response from Claude client.

        Args:
            client: ClaudeSDKClient instance

        Returns:
            Collected response text
        """
        response_text = ""

        async for msg in client.receive_response():
            msg_type = type(msg).__name__

            if msg_type == "AssistantMessage":
                for content in msg.content:
                    if hasattr(content, "text"):
                        response_text += content.text

        return response_text
