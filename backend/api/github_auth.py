"""
GitHub Authentication API

Manages GitHub CLI authentication for repository operations.
Similar to Claude OAuth token management.
"""

import subprocess
import os
from pathlib import Path
from typing import Optional
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

router = APIRouter(prefix="/api/github", tags=["github"])

# GitHub CLI config location
GH_CONFIG_DIR = Path("/root/.config/gh")
GH_HOSTS_FILE = GH_CONFIG_DIR / "hosts.yml"

class GitHubTokenRequest(BaseModel):
    token: str

class GitHubAuthStatus(BaseModel):
    authenticated: bool
    username: Optional[str] = None
    scopes: Optional[list] = None

def run_gh_command(args: list[str]) -> tuple[str, str, int]:
    """
    Run a GitHub CLI command.

    Args:
        args: Command arguments (e.g., ['auth', 'status'])

    Returns:
        Tuple of (stdout, stderr, returncode)
    """
    try:
        result = subprocess.run(
            ['gh'] + args,
            capture_output=True,
            text=True,
            timeout=30,
            env={**os.environ, 'GH_CONFIG_DIR': str(GH_CONFIG_DIR)}
        )
        return result.stdout, result.stderr, result.returncode
    except subprocess.TimeoutExpired:
        raise HTTPException(status_code=504, detail="GitHub CLI command timed out")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to run gh command: {str(e)}")

@router.get("/auth/status")
async def get_github_auth_status():
    """
    Check if GitHub CLI is authenticated.

    Returns:
        Authentication status including username if authenticated
    """
    stdout, stderr, returncode = run_gh_command(['auth', 'status'])

    # gh auth status returns 0 if authenticated, 1 if not
    if returncode == 0:
        # Parse username from output
        username = None
        for line in stdout.split('\n'):
            if 'Logged in to github.com account' in line:
                # Format: "✓ Logged in to github.com account username (keyring)"
                parts = line.split()
                if 'account' in parts:
                    idx = parts.index('account')
                    if idx + 1 < len(parts):
                        username = parts[idx + 1]
                        break

        return {
            "success": True,
            "data": {
                "authenticated": True,
                "username": username
            }
        }
    else:
        return {
            "success": True,
            "data": {
                "authenticated": False,
                "username": None
            }
        }

@router.post("/auth/login")
async def github_login_with_token(request: GitHubTokenRequest):
    """
    Authenticate GitHub CLI with a personal access token.

    Args:
        request: Contains the GitHub personal access token

    Returns:
        Success status and username
    """
    try:
        # Use gh auth login with token via stdin
        process = subprocess.Popen(
            ['gh', 'auth', 'login', '--with-token'],
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            env={**os.environ, 'GH_CONFIG_DIR': str(GH_CONFIG_DIR)}
        )

        stdout, stderr = process.communicate(input=request.token, timeout=30)

        if process.returncode != 0:
            raise HTTPException(
                status_code=400,
                detail=f"GitHub authentication failed: {stderr or stdout}"
            )

        # Get username after successful authentication
        status_stdout, _, _ = run_gh_command(['auth', 'status'])
        username = None
        for line in status_stdout.split('\n'):
            if 'Logged in to github.com account' in line:
                parts = line.split()
                if 'account' in parts:
                    idx = parts.index('account')
                    if idx + 1 < len(parts):
                        username = parts[idx + 1]
                        break

        return {
            "success": True,
            "data": {
                "message": "GitHub authentication successful",
                "username": username
            }
        }

    except subprocess.TimeoutExpired:
        raise HTTPException(status_code=504, detail="GitHub authentication timed out")
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to authenticate with GitHub: {str(e)}"
        )

@router.post("/auth/logout")
async def github_logout():
    """
    Log out from GitHub CLI.

    Returns:
        Success status
    """
    stdout, stderr, returncode = run_gh_command(['auth', 'logout', '--hostname', 'github.com'])

    if returncode != 0 and 'not logged in' not in stderr:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to logout: {stderr or stdout}"
        )

    return {
        "success": True,
        "data": {
            "message": "GitHub logout successful"
        }
    }

@router.get("/user")
async def get_github_user():
    """
    Get current authenticated GitHub user information.

    Returns:
        User information from GitHub API
    """
    # Check if authenticated first
    _, _, returncode = run_gh_command(['auth', 'status'])
    if returncode != 0:
        raise HTTPException(status_code=401, detail="Not authenticated with GitHub")

    # Get user info via gh api
    stdout, stderr, returncode = run_gh_command(['api', 'user'])

    if returncode != 0:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to fetch user info: {stderr or stdout}"
        )

    import json
    try:
        user_data = json.loads(stdout)
        return {
            "success": True,
            "data": {
                "login": user_data.get("login"),
                "name": user_data.get("name"),
                "email": user_data.get("email"),
                "avatar_url": user_data.get("avatar_url"),
                "bio": user_data.get("bio"),
                "public_repos": user_data.get("public_repos"),
                "followers": user_data.get("followers"),
                "following": user_data.get("following")
            }
        }
    except json.JSONDecodeError:
        raise HTTPException(status_code=500, detail="Failed to parse GitHub user data")

@router.get("/repos")
async def list_github_repos(per_page: int = 30, page: int = 1):
    """
    List repositories for the authenticated user.

    Args:
        per_page: Number of repositories per page (default 30)
        page: Page number (default 1)

    Returns:
        List of repositories
    """
    # Check if authenticated first
    _, _, returncode = run_gh_command(['auth', 'status'])
    if returncode != 0:
        raise HTTPException(status_code=401, detail="Not authenticated with GitHub")

    # Get repos via gh api
    stdout, stderr, returncode = run_gh_command([
        'api',
        f'user/repos?per_page={per_page}&page={page}&sort=updated'
    ])

    if returncode != 0:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to fetch repositories: {stderr or stdout}"
        )

    import json
    try:
        repos = json.loads(stdout)
        return {
            "success": True,
            "data": [
                {
                    "name": repo.get("name"),
                    "full_name": repo.get("full_name"),
                    "description": repo.get("description"),
                    "private": repo.get("private"),
                    "url": repo.get("html_url"),
                    "clone_url": repo.get("clone_url"),
                    "updated_at": repo.get("updated_at")
                }
                for repo in repos
            ]
        }
    except json.JSONDecodeError:
        raise HTTPException(status_code=500, detail="Failed to parse GitHub repositories")
