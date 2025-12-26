"""
Authentication helpers for Auto Claude.

Provides centralized authentication token resolution with fallback support
for multiple environment variables, and SDK environment variable passthrough
for custom API endpoints.

Includes automatic OAuth token refresh when tokens expire.
"""

import json
import os
import platform
import subprocess
import time

# Priority order for auth token resolution
# NOTE: We intentionally do NOT fall back to ANTHROPIC_API_KEY.
# Auto Claude is designed to use Claude Code OAuth tokens only.
# This prevents silent billing to user's API credits when OAuth fails.
AUTH_TOKEN_ENV_VARS = [
    "CLAUDE_CODE_OAUTH_TOKEN",  # OAuth token from Claude Code CLI
    "ANTHROPIC_AUTH_TOKEN",  # CCR/proxy token (for enterprise setups)
]

# Environment variables to pass through to SDK subprocess
# NOTE: ANTHROPIC_API_KEY is intentionally excluded to prevent silent API billing
SDK_ENV_VARS = [
    "ANTHROPIC_BASE_URL",
    "ANTHROPIC_AUTH_TOKEN",
    "NO_PROXY",
    "DISABLE_TELEMETRY",
    "DISABLE_COST_WARNINGS",
    "API_TIMEOUT_MS",
]


# Buffer time before expiration to trigger refresh (5 minutes) - used for reactive refresh
TOKEN_REFRESH_BUFFER_MS = 5 * 60 * 1000

# Buffer time for proactive refresh (2 hours) - used for background task
PROACTIVE_REFRESH_BUFFER_MS = 2 * 60 * 60 * 1000


def _is_token_expiring_soon(expires_at: int | None, buffer_ms: int) -> bool:
    """
    Check if token will expire within the given buffer time.

    Args:
        expires_at: Token expiration timestamp in milliseconds
        buffer_ms: Buffer time in milliseconds

    Returns:
        True if token will expire within buffer time
    """
    if expires_at is None:
        return False  # No expiration info, assume valid

    current_time_ms = int(time.time() * 1000)
    return current_time_ms >= (expires_at - buffer_ms)


def _is_token_expired(expires_at: int | None) -> bool:
    """
    Check if token is expired or about to expire (within 5 minutes).

    Args:
        expires_at: Token expiration timestamp in milliseconds

    Returns:
        True if token is expired or will expire within buffer time
    """
    return _is_token_expiring_soon(expires_at, TOKEN_REFRESH_BUFFER_MS)


def _refresh_oauth_token_via_cli() -> bool:
    """
    Refresh OAuth token by running Claude CLI.

    The Claude CLI automatically refreshes expired tokens when invoked.
    We run a minimal command to trigger the refresh.

    Returns:
        True if refresh was successful
    """
    try:
        # Run a minimal Claude CLI command - this triggers automatic token refresh
        result = subprocess.run(
            ["claude", "--print", "ok"],
            capture_output=True,
            text=True,
            timeout=60,
            env={**os.environ, "TERM": "xterm-256color"}
        )

        if result.returncode == 0:
            print("[Auth] Token refreshed successfully via CLI")
            return True
        else:
            print(f"[Auth] CLI token refresh failed: {result.stderr}")
            return False

    except subprocess.TimeoutExpired:
        print("[Auth] CLI token refresh timed out")
        return False
    except FileNotFoundError:
        print("[Auth] Claude CLI not found")
        return False
    except Exception as e:
        print(f"[Auth] Token refresh error: {e}")
        return False


def check_and_refresh_token_proactively() -> dict:
    """
    Proactively check token expiration and refresh if needed.

    This is called by the background task every 30 minutes.
    Refreshes the token if it will expire within 2 hours.

    Returns:
        Dict with status information:
        - checked: True if check was performed
        - needs_refresh: True if token was expiring soon
        - refreshed: True if refresh was successful
        - expires_at: Token expiration timestamp (if available)
        - error: Error message (if any)
    """
    result = {
        "checked": False,
        "needs_refresh": False,
        "refreshed": False,
        "expires_at": None,
        "error": None
    }

    # Check standard credentials file locations
    credentials_paths = [
        os.path.expanduser("~/.claude/.credentials.json"),
        "/root/.claude/.credentials.json",
    ]

    for creds_path in credentials_paths:
        try:
            if not os.path.exists(creds_path):
                continue

            with open(creds_path) as f:
                data = json.load(f)

            oauth_data = data.get("claudeAiOauth", {})
            expires_at = oauth_data.get("expiresAt")
            result["expires_at"] = expires_at
            result["checked"] = True

            if expires_at is None:
                print("[Auth] No expiration info in token, skipping proactive refresh")
                return result

            # Check if token will expire within 2 hours
            if _is_token_expiring_soon(expires_at, PROACTIVE_REFRESH_BUFFER_MS):
                result["needs_refresh"] = True
                expires_in_mins = (expires_at - int(time.time() * 1000)) / 1000 / 60
                print(f"[Auth] Token expires in {expires_in_mins:.1f} minutes, proactively refreshing...")

                if _refresh_oauth_token_via_cli():
                    result["refreshed"] = True
                    # Re-read to get new expiration
                    try:
                        with open(creds_path) as f:
                            new_data = json.load(f)
                        result["expires_at"] = new_data.get("claudeAiOauth", {}).get("expiresAt")
                    except:
                        pass
                else:
                    result["error"] = "Refresh failed"
            else:
                expires_in_mins = (expires_at - int(time.time() * 1000)) / 1000 / 60
                print(f"[Auth] Token valid for {expires_in_mins:.1f} more minutes, no refresh needed")

            return result

        except Exception as e:
            result["error"] = str(e)
            print(f"[Auth] Error in proactive refresh check: {e}")

    if not result["checked"]:
        result["error"] = "No credentials file found"

    return result


def get_token_from_credentials_file() -> str | None:
    """
    Get authentication token from Claude CLI credentials file.

    Reads ~/.claude/.credentials.json which is created by 'claude /login'.
    This is the standard location for Docker/Linux environments.

    Automatically refreshes the token if it's expired or about to expire.

    Returns:
        Token string if found in credentials file, None otherwise
    """
    # Check standard credentials file locations
    credentials_paths = [
        os.path.expanduser("~/.claude/.credentials.json"),
        "/root/.claude/.credentials.json",
    ]

    for creds_path in credentials_paths:
        try:
            if not os.path.exists(creds_path):
                continue

            with open(creds_path) as f:
                data = json.load(f)

            oauth_data = data.get("claudeAiOauth", {})
            token = oauth_data.get("accessToken")
            refresh_token = oauth_data.get("refreshToken")
            expires_at = oauth_data.get("expiresAt")

            if not token:
                continue

            # Validate token format (Claude OAuth tokens start with sk-ant-oat01-)
            if not token.startswith("sk-ant-oat01-"):
                continue

            # Check if token is expired or about to expire
            if _is_token_expired(expires_at):
                print(f"[Auth] Token expired or expiring soon (expiresAt: {expires_at}), attempting refresh...")

                # Use Claude CLI to refresh token - it handles refresh internally
                if _refresh_oauth_token_via_cli():
                    # Re-read the credentials file to get the refreshed token
                    try:
                        with open(creds_path) as f:
                            refreshed_data = json.load(f)
                        refreshed_token = refreshed_data.get("claudeAiOauth", {}).get("accessToken")
                        if refreshed_token and refreshed_token.startswith("sk-ant-oat01-"):
                            return refreshed_token
                    except Exception as e:
                        print(f"[Auth] Error re-reading refreshed credentials: {e}")

                print("[Auth] Token refresh failed, returning existing token")
                # Return the expired token anyway - let the API call fail with proper error
                return token

            return token

        except (json.JSONDecodeError, KeyError, IOError, Exception) as e:
            print(f"[Auth] Error reading credentials from {creds_path}: {e}")
            continue

    return None


def get_token_from_keychain() -> str | None:
    """
    Get authentication token from macOS Keychain.

    Reads Claude Code credentials from macOS Keychain and extracts the OAuth token.
    Only works on macOS (Darwin platform).

    Returns:
        Token string if found in Keychain, None otherwise
    """
    # Only attempt on macOS
    if platform.system() != "Darwin":
        return None

    try:
        # Query macOS Keychain for Claude Code credentials
        result = subprocess.run(
            [
                "/usr/bin/security",
                "find-generic-password",
                "-s",
                "Claude Code-credentials",
                "-w",
            ],
            capture_output=True,
            text=True,
            timeout=5,
        )

        if result.returncode != 0:
            return None

        # Parse JSON response
        credentials_json = result.stdout.strip()
        if not credentials_json:
            return None

        data = json.loads(credentials_json)

        # Extract OAuth token from nested structure
        token = data.get("claudeAiOauth", {}).get("accessToken")

        if not token:
            return None

        # Validate token format (Claude OAuth tokens start with sk-ant-oat01-)
        if not token.startswith("sk-ant-oat01-"):
            return None

        return token

    except (subprocess.TimeoutExpired, json.JSONDecodeError, KeyError, Exception):
        # Silently fail - this is a fallback mechanism
        return None


def get_auth_token() -> str | None:
    """
    Get authentication token from environment variables, credentials file, or macOS Keychain.

    Checks multiple sources in priority order:
    1. CLAUDE_CODE_OAUTH_TOKEN (env var)
    2. ANTHROPIC_AUTH_TOKEN (CCR/proxy env var for enterprise setups)
    3. ~/.claude/.credentials.json (created by 'claude /login')
    4. macOS Keychain (if on Darwin platform)

    NOTE: ANTHROPIC_API_KEY is intentionally NOT supported to prevent
    silent billing to user's API credits when OAuth is misconfigured.

    Returns:
        Token string if found, None otherwise
    """
    # First check environment variables
    for var in AUTH_TOKEN_ENV_VARS:
        token = os.environ.get(var)
        if token:
            return token

    # Fallback to credentials file (Docker/Linux)
    token = get_token_from_credentials_file()
    if token:
        return token

    # Fallback to macOS Keychain
    return get_token_from_keychain()


def get_auth_token_source() -> str | None:
    """Get the name of the source that provided the auth token."""
    # Check environment variables first
    for var in AUTH_TOKEN_ENV_VARS:
        if os.environ.get(var):
            return var

    # Check if token came from credentials file
    if get_token_from_credentials_file():
        return "credentials file (~/.claude/.credentials.json)"

    # Check if token came from macOS Keychain
    if get_token_from_keychain():
        return "macOS Keychain"

    return None


def require_auth_token() -> str:
    """
    Get authentication token or raise ValueError.

    Raises:
        ValueError: If no auth token is found in any supported source
    """
    token = get_auth_token()
    if not token:
        error_msg = (
            "No OAuth token found.\n\n"
            "Auto Claude requires Claude Code OAuth authentication.\n"
            "Direct API keys (ANTHROPIC_API_KEY) are not supported.\n\n"
        )
        # Provide platform-specific guidance
        if platform.system() == "Darwin":
            error_msg += (
                "To authenticate:\n"
                "  1. Run: claude setup-token\n"
                "  2. The token will be saved to macOS Keychain automatically\n\n"
                "Or set CLAUDE_CODE_OAUTH_TOKEN in your .env file."
            )
        else:
            error_msg += (
                "To authenticate:\n"
                "  1. Run: claude setup-token\n"
                "  2. Set CLAUDE_CODE_OAUTH_TOKEN in your .env file"
            )
        raise ValueError(error_msg)
    return token


def get_sdk_env_vars() -> dict[str, str]:
    """
    Get environment variables to pass to SDK.

    Collects relevant env vars (ANTHROPIC_BASE_URL, etc.) that should
    be passed through to the claude-agent-sdk subprocess.

    Returns:
        Dict of env var name -> value for non-empty vars
    """
    env = {}
    for var in SDK_ENV_VARS:
        value = os.environ.get(var)
        if value:
            env[var] = value
    return env


def ensure_claude_code_oauth_token() -> None:
    """
    Ensure CLAUDE_CODE_OAUTH_TOKEN is set (for SDK compatibility).

    If not set but other auth tokens are available, copies the value
    to CLAUDE_CODE_OAUTH_TOKEN so the underlying SDK can use it.
    """
    if os.environ.get("CLAUDE_CODE_OAUTH_TOKEN"):
        return

    token = get_auth_token()
    if token:
        os.environ["CLAUDE_CODE_OAUTH_TOKEN"] = token
