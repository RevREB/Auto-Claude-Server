"""
OAuth endpoints for Claude.ai authentication using Claude CLI.

This module leverages the Claude Code CLI installed in the container to handle
OAuth authentication with claude.ai. The flow works by:
1. Starting the CLI login flow with PTY to handle interactive prompts
2. Navigating through theme/account selection automatically
3. Capturing the OAuth URL with ALL required scopes
4. User clicks link to authenticate on claude.ai
5. User pastes code back, CLI captures token

IMPORTANT: We use the full login flow (not setup-token) because it requests
all required scopes including user:profile for usage tracking:
- org:create_api_key
- user:profile (needed for /usage command)
- user:inference
- user:sessions:claude_code
"""

import asyncio
import json
import os
import pty
import re
import select
import subprocess
import tempfile
from pathlib import Path
from typing import Dict, Optional, Tuple

from fastapi import APIRouter, HTTPException
from fastapi.responses import HTMLResponse, RedirectResponse
from pydantic import BaseModel

router = APIRouter(prefix="/api/oauth", tags=["oauth"])

# Store active OAuth sessions
_oauth_sessions: Dict[str, dict] = {}

# Required OAuth scopes for full functionality
REQUIRED_SCOPES = [
    "org:create_api_key",
    "user:profile",      # Required for /usage command
    "user:inference",
    "user:sessions:claude_code",
]


class OAuthInitResponse(BaseModel):
    """Response from OAuth initiation."""
    auth_url: str
    profile_id: str
    poll_url: str


class OAuthStatusResponse(BaseModel):
    """Response from OAuth status check."""
    status: str  # pending, completed, error
    token: Optional[str] = None
    email: Optional[str] = None
    error: Optional[str] = None


def _run_cli_login_flow(config_dir: str) -> Tuple[Optional[str], str]:
    """
    Run the Claude CLI login flow using PTY to handle interactive prompts.

    This navigates through:
    1. Theme selection (select first option)
    2. Account type selection (select Claude subscription)
    3. Captures the OAuth URL with full scopes

    Args:
        config_dir: Directory for CLI configuration

    Returns:
        Tuple of (oauth_url, output_log)
    """
    master, slave = pty.openpty()

    env = os.environ.copy()
    env["HOME"] = config_dir
    env["XDG_CONFIG_HOME"] = config_dir
    env["TERM"] = "xterm-256color"

    pid = os.fork()

    if pid == 0:
        # Child process
        os.setsid()
        os.dup2(slave, 0)
        os.dup2(slave, 1)
        os.dup2(slave, 2)
        os.close(master)
        os.close(slave)
        os.chdir(config_dir)
        os.execvpe("claude", ["claude"], env)
    else:
        # Parent process
        os.close(slave)
        output = b""
        oauth_url = None
        step = 0  # 0=waiting, 1=theme sent, 2=account sent

        try:
            import time
            start_time = time.time()
            timeout = 30  # seconds

            while True:
                # Check for timeout
                elapsed = time.time() - start_time
                if elapsed > timeout:
                    break

                r, _, _ = select.select([master], [], [], 0.5)
                if r:
                    try:
                        data = os.read(master, 4096)
                        if not data:
                            break
                        output += data
                        text = output.decode("utf-8", errors="ignore")

                        # Handle theme selection
                        if step == 0 and "Dark mode" in text:
                            time.sleep(0.5)
                            os.write(master, b"\r")  # Select first option
                            step = 1

                        # Handle account type selection
                        if step == 1 and "Claude account with subscription" in text:
                            time.sleep(0.5)
                            os.write(master, b"\r")  # Select Claude subscription
                            step = 2

                        # Look for OAuth URL
                        url_match = re.search(
                            r'https://claude\.ai/oauth/authorize[^\s\x1b]+',
                            text
                        )
                        if url_match:
                            oauth_url = url_match.group(0)
                            # Verify it has proper scopes
                            if "user%3Aprofile" in oauth_url or "user:profile" in oauth_url:
                                break

                    except OSError:
                        break

                # Timeout check
                if len(output) > 50000:  # Safety limit
                    break

        finally:
            try:
                os.kill(pid, 9)
                os.waitpid(pid, 0)
            except:
                pass
            os.close(master)

        return oauth_url, output.decode("utf-8", errors="ignore")


@router.post("/initiate/{profile_id}")
async def initiate_oauth(profile_id: str) -> OAuthInitResponse:
    """
    Initiate OAuth flow using Claude CLI with full scopes.

    This starts the Claude CLI's login flow (not setup-token) to ensure
    all required scopes are requested, including user:profile for usage tracking.

    Args:
        profile_id: ID of the profile to authenticate

    Returns:
        OAuth URL and polling endpoint
    """
    # Create isolated config directory for this profile
    config_dir = tempfile.mkdtemp(prefix=f"claude-profile-{profile_id}-")
    config_path = Path(config_dir)

    # Pre-configure settings to skip some prompts
    claude_dir = config_path / ".claude"
    claude_dir.mkdir(parents=True, exist_ok=True)
    settings_file = claude_dir / "settings.json"
    settings_file.write_text(json.dumps({
        "theme": "dark",
        "hasCompletedOnboarding": True
    }))

    try:
        # Run the login flow with PTY
        oauth_url, output_log = await asyncio.get_event_loop().run_in_executor(
            None,
            _run_cli_login_flow,
            config_dir
        )

        if not oauth_url:
            raise HTTPException(
                status_code=500,
                detail=f"Could not capture OAuth URL from CLI. Output: {output_log[-1000:]}"
            )

        # Verify scopes
        if "user%3Aprofile" not in oauth_url and "user:profile" not in oauth_url:
            print(f"[OAuth] Warning: OAuth URL may be missing user:profile scope")
            print(f"[OAuth] URL: {oauth_url[:200]}...")

        # Store session info
        _oauth_sessions[profile_id] = {
            "status": "pending",
            "config_dir": config_dir,
            "oauth_url": oauth_url,
        }

        return OAuthInitResponse(
            auth_url=oauth_url,
            profile_id=profile_id,
            poll_url=f"/api/oauth/status/{profile_id}"
        )

    except FileNotFoundError:
        raise HTTPException(
            status_code=500,
            detail="Claude CLI not found in container. Please check backend setup."
        )
    except Exception as e:
        # Clean up on error
        if config_path.exists():
            import shutil
            shutil.rmtree(config_dir, ignore_errors=True)
        raise HTTPException(
            status_code=500,
            detail=f"Failed to start OAuth: {str(e)}"
        )


@router.get("/status/{profile_id}")
async def get_oauth_status(profile_id: str) -> OAuthStatusResponse:
    """
    Check the status of an OAuth flow.

    Args:
        profile_id: ID of the profile being authenticated

    Returns:
        Current status and token if completed
    """
    if profile_id not in _oauth_sessions:
        return OAuthStatusResponse(status="not_found")

    session = _oauth_sessions[profile_id]
    current_status = session.get("status")

    # Return current status
    return OAuthStatusResponse(
        status=current_status,
        token=session.get("token"),
        email=session.get("email"),
        error=session.get("error")
    )


class OAuthCompleteRequest(BaseModel):
    """Request to complete OAuth with authorization code."""
    code: str


@router.post("/complete/{profile_id}")
async def complete_oauth(profile_id: str, request: OAuthCompleteRequest) -> OAuthStatusResponse:
    """
    Complete OAuth flow by submitting the authorization code.

    After the user authenticates in the browser and gets the code,
    this endpoint completes the flow by exchanging the code for a token.

    Args:
        profile_id: ID of the profile being authenticated
        request: Contains the authorization code from OAuth redirect

    Returns:
        Completed status with token
    """
    if profile_id not in _oauth_sessions:
        return OAuthStatusResponse(status="not_found", error="No pending OAuth session")

    session = _oauth_sessions[profile_id]
    if session.get("status") != "pending":
        return OAuthStatusResponse(
            status=session.get("status"),
            token=session.get("token"),
            error=session.get("error")
        )

    config_dir = session.get("config_dir")
    if not config_dir:
        return OAuthStatusResponse(status="error", error="Session config directory not found")

    try:
        # Run CLI to complete the auth with the code
        token, email, scopes = await _complete_oauth_with_code(config_dir, request.code)

        if token:
            # Verify scopes include user:profile
            if scopes and "user:profile" not in scopes:
                print(f"[OAuth] Warning: Token missing user:profile scope. Scopes: {scopes}")

            _oauth_sessions[profile_id] = {
                "status": "completed",
                "token": token,
                "email": email,
                "scopes": scopes,
            }

            # Also save to main credentials file for the active profile
            await _save_token_to_main_credentials(token, email, scopes)

            return OAuthStatusResponse(
                status="completed",
                token=token,
                email=email
            )
        else:
            error_msg = "Failed to exchange code for token"
            _oauth_sessions[profile_id] = {"status": "error", "error": error_msg}
            return OAuthStatusResponse(status="error", error=error_msg)

    except Exception as e:
        error_msg = f"OAuth completion failed: {str(e)}"
        _oauth_sessions[profile_id] = {"status": "error", "error": error_msg}
        return OAuthStatusResponse(status="error", error=error_msg)


async def _complete_oauth_with_code(config_dir: str, code: str) -> Tuple[Optional[str], Optional[str], Optional[list]]:
    """
    Complete OAuth by running CLI with the authorization code.

    Args:
        config_dir: CLI config directory
        code: Authorization code from OAuth redirect

    Returns:
        Tuple of (token, email, scopes)
    """
    import time

    master, slave = pty.openpty()

    env = os.environ.copy()
    env["HOME"] = config_dir
    env["XDG_CONFIG_HOME"] = config_dir
    env["TERM"] = "xterm-256color"

    pid = os.fork()

    if pid == 0:
        # Child process
        os.setsid()
        os.dup2(slave, 0)
        os.dup2(slave, 1)
        os.dup2(slave, 2)
        os.close(master)
        os.close(slave)
        os.chdir(config_dir)
        os.execvpe("claude", ["claude"], env)
    else:
        # Parent process
        os.close(slave)
        output = b""
        code_sent = False

        try:
            while True:
                r, _, _ = select.select([master], [], [], 0.5)
                if r:
                    try:
                        data = os.read(master, 4096)
                        if not data:
                            break
                        output += data
                        text = output.decode("utf-8", errors="ignore")

                        # Handle theme selection
                        if "Dark mode" in text and not code_sent:
                            time.sleep(0.3)
                            os.write(master, b"\r")

                        # Handle account type selection
                        if "Claude account with subscription" in text and not code_sent:
                            time.sleep(0.3)
                            os.write(master, b"\r")

                        # When we see the paste prompt, send the code
                        if "Paste code" in text and not code_sent:
                            time.sleep(0.5)
                            os.write(master, (code + "\r").encode())
                            code_sent = True

                        # Check for success
                        if code_sent and ("authenticated" in text.lower() or "success" in text.lower() or ">" in text):
                            time.sleep(1)
                            break

                    except OSError:
                        break

                if len(output) > 50000:
                    break

        finally:
            try:
                os.kill(pid, 9)
                os.waitpid(pid, 0)
            except:
                pass
            os.close(master)

        # Extract token from credentials file
        return await _extract_token_with_scopes(config_dir)


async def _extract_token_with_scopes(config_dir: str) -> Tuple[Optional[str], Optional[str], Optional[list]]:
    """
    Extract token, email, and scopes from CLI credentials.

    Args:
        config_dir: CLI config directory

    Returns:
        Tuple of (token, email, scopes)
    """
    creds_paths = [
        Path(config_dir) / ".claude" / ".credentials.json",
        Path(config_dir) / ".config" / "claude" / "credentials.json",
    ]

    for creds_file in creds_paths:
        if creds_file.exists():
            try:
                with open(creds_file) as f:
                    data = json.load(f)
                    oauth_data = data.get("claudeAiOauth", {})
                    token = oauth_data.get("accessToken")
                    email = oauth_data.get("email")
                    scopes = oauth_data.get("scopes", [])

                    if token and token.startswith("sk-ant-oat01-"):
                        return token, email, scopes
            except Exception as e:
                print(f"[OAuth] Error reading {creds_file}: {e}")
                continue

    return None, None, None


async def _save_token_to_main_credentials(token: str, email: Optional[str], scopes: Optional[list]):
    """
    Save the new token to the main credentials file.

    Args:
        token: OAuth access token
        email: User email
        scopes: Token scopes
    """
    creds_file = Path("/root/.claude/.credentials.json")
    creds_file.parent.mkdir(parents=True, exist_ok=True)

    try:
        # Load existing data or create new
        if creds_file.exists():
            with open(creds_file) as f:
                data = json.load(f)
        else:
            data = {}

        # Update OAuth data
        data["claudeAiOauth"] = {
            "accessToken": token,
            "scopes": scopes or REQUIRED_SCOPES,
        }
        if email:
            data["claudeAiOauth"]["email"] = email

        # Save
        with open(creds_file, "w") as f:
            json.dump(data, f, indent=2)

        print(f"[OAuth] Saved token to {creds_file} with scopes: {scopes}")

    except Exception as e:
        print(f"[OAuth] Error saving token: {e}")


@router.post("/extract-cli-token")
async def extract_cli_token():
    """
    Extract OAuth token from Claude CLI's default storage location.

    This is called after the user runs `claude setup-token` in the terminal.
    The CLI stores the token in the user's home directory.

    Returns:
        Token and email if found
    """
    # Claude CLI stores credentials in the HOME directory
    home_dir = os.path.expanduser("~")

    # Debug: Check what files exist
    config_paths = [
        Path(home_dir) / ".config" / "claude" / "credentials.json",
        Path(home_dir) / "claude" / "credentials.json",
        Path(home_dir) / ".claude" / "credentials.json",
    ]

    print(f"DEBUG: Checking for token files in {home_dir}")
    for path in config_paths:
        print(f"DEBUG: Checking {path} - exists: {path.exists()}")
        if path.exists():
            print(f"DEBUG: File size: {path.stat().st_size} bytes")

    token, email = await _extract_token_from_cli_storage(home_dir)

    if token:
        return {
            "success": True,
            "token": token,
            "email": email
        }
    else:
        return {
            "success": False,
            "error": "Token not found in CLI storage. Please complete authentication first."
        }


async def _extract_token_from_cli_storage(config_dir: str) -> tuple[Optional[str], Optional[str]]:
    """
    Extract OAuth token from Claude CLI's storage.

    The CLI stores credentials in ~/.config/claude/credentials.json

    Args:
        config_dir: Path to the CLI's config directory

    Returns:
        Tuple of (token, email) if found, (None, None) otherwise
    """
    # Check standard config location
    creds_file = Path(config_dir) / ".config" / "claude" / "credentials.json"

    # Also try alternate locations
    if not creds_file.exists():
        creds_file = Path(config_dir) / ".claude" / "credentials.json"

    if not creds_file.exists():
        creds_file = Path(config_dir) / "claude" / "credentials.json"

    if not creds_file.exists():
        # Try macOS Keychain if we're on Darwin (unlikely in Docker but possible)
        import platform
        if platform.system() == "Darwin":
            try:
                result = subprocess.run(
                    ["/usr/bin/security", "find-generic-password", "-s", "Claude Code-credentials", "-w"],
                    capture_output=True,
                    text=True,
                    timeout=5,
                )
                if result.returncode == 0 and result.stdout.strip():
                    data = json.loads(result.stdout.strip())
                    token = data.get("claudeAiOauth", {}).get("accessToken")
                    email = data.get("claudeAiOauth", {}).get("email")
                    if token and token.startswith("sk-ant-oat01-"):
                        return token, email
            except Exception:
                pass

        return None, None

    try:
        with open(creds_file) as f:
            data = json.load(f)
            oauth_data = data.get("claudeAiOauth", {})
            token = oauth_data.get("accessToken")
            email = oauth_data.get("email")

            if token and token.startswith("sk-ant-oat01-"):
                return token, email

            return None, None
    except (json.JSONDecodeError, KeyError, IOError):
        return None, None


@router.get("/callback")
async def oauth_callback():
    """
    OAuth callback endpoint.

    This is here in case claude.ai redirects directly to our backend,
    but typically the Claude CLI's built-in server will catch it.
    """
    return HTMLResponse(
        content="""
        <html>
            <body>
                <h1>Authentication Complete!</h1>
                <p>You can close this window and return to the app.</p>
                <script>
                    setTimeout(() => window.close(), 2000);
                </script>
            </body>
        </html>
        """
    )
