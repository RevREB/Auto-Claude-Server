"""
Git Operations API

Provides git operations for projects, including:
- Status checking
- Branch management
- Repository initialization
- Current branch detection
"""

import subprocess
from pathlib import Path
from typing import List, Optional
from fastapi import APIRouter, HTTPException

router = APIRouter(prefix="/api/projects", tags=["git"])

# Note: This router is mounted under /api/projects so endpoints are:
# /api/projects/{project_id}/git/...

def run_git_command(project_path: str, command: List[str]) -> tuple[str, str, int]:
    """
    Run a git command in the project directory.

    Args:
        project_path: Path to the project
        command: Git command and arguments (e.g., ['git', 'status'])

    Returns:
        Tuple of (stdout, stderr, returncode)
    """
    try:
        result = subprocess.run(
            command,
            cwd=project_path,
            capture_output=True,
            text=True,
            timeout=30
        )
        return result.stdout, result.stderr, result.returncode
    except subprocess.TimeoutExpired:
        raise HTTPException(status_code=504, detail="Git command timed out")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to run git command: {str(e)}")

@router.get("/{project_id}/git/status")
async def get_git_status(project_id: str):
    """
    Get git status for a project.

    Uses `git status --porcelain` for machine-readable output.
    Also determines if git setup is needed based on:
    - Whether git is initialized with commits
    - Whether user has skipped git setup for this project

    Args:
        project_id: ID of the project

    Returns:
        Git status information including needsGitSetup flag
    """
    from . import main

    if project_id not in main.projects:
        raise HTTPException(status_code=404, detail="Project not found")

    project = main.projects[project_id]
    project_path = project.path

    # Check if user has skipped git setup for this project
    git_setup_skipped = project.settings.get("gitSetupSkipped", False)

    stdout, stderr, returncode = run_git_command(
        project_path,
        ["git", "status", "--porcelain"]
    )

    if returncode != 0:
        # Not a git repo or error
        # needsGitSetup is True only if user hasn't skipped
        return {
            "success": True,
            "data": {
                "isGitRepo": False,
                "hasCommits": False,
                "needsGitSetup": not git_setup_skipped
            }
        }

    # Parse porcelain output
    files = []
    for line in stdout.strip().split('\n'):
        if not line:
            continue

        status_code = line[:2]
        filename = line[3:]

        files.append({
            "filename": filename,
            "status": status_code.strip(),
        })

    # Get branch info
    branch_stdout, _, branch_returncode = run_git_command(
        project_path,
        ["git", "rev-parse", "--abbrev-ref", "HEAD"]
    )

    current_branch = branch_stdout.strip() if branch_returncode == 0 else None

    # Check if repository has any commits
    commits_stdout, _, commits_returncode = run_git_command(
        project_path,
        ["git", "rev-list", "-n", "1", "--all"]
    )
    has_commits = commits_returncode == 0 and bool(commits_stdout.strip())

    # Determine if git setup is needed:
    # - Git must be initialized AND have commits
    # - OR user must have skipped git setup
    git_is_ready = has_commits
    needs_git_setup = not git_is_ready and not git_setup_skipped

    return {
        "success": True,
        "data": {
            "isGitRepo": True,
            "currentBranch": current_branch,
            "files": files,
            "hasChanges": len(files) > 0,
            "hasCommits": has_commits,
            "needsGitSetup": needs_git_setup
        }
    }

@router.get("/{project_id}/git/branches")
async def get_git_branches(project_id: str):
    """
    Get all git branches for a project.

    Uses `git branch -a` to list all branches including remotes.

    Args:
        project_id: ID of the project

    Returns:
        List of branches
    """
    from . import main

    if project_id not in main.projects:
        raise HTTPException(status_code=404, detail="Project not found")

    project = main.projects[project_id]
    project_path = project.path

    stdout, stderr, returncode = run_git_command(
        project_path,
        ["git", "branch", "-a"]
    )

    if returncode != 0:
        raise HTTPException(
            status_code=400,
            detail=stderr or "Failed to get branches"
        )

    # Parse branch output
    branches = []
    current_branch = None

    for line in stdout.strip().split('\n'):
        if not line:
            continue

        # Current branch is marked with *
        is_current = line.startswith('*')
        branch_name = line[2:].strip()  # Remove '* ' or '  '

        # Skip HEAD detached state
        if 'HEAD detached' in branch_name or 'HEAD ->' in branch_name:
            continue

        branch_info = {
            "name": branch_name,
            "current": is_current
        }

        branches.append(branch_info)

        if is_current:
            current_branch = branch_name

    return {
        "success": True,
        "data": {
            "branches": branches,
            "currentBranch": current_branch
        }
    }

@router.get("/{project_id}/git/current-branch")
async def get_current_branch(project_id: str):
    """
    Get the current git branch.

    Uses `git rev-parse --abbrev-ref HEAD`.

    Args:
        project_id: ID of the project

    Returns:
        Current branch name
    """
    from . import main

    if project_id not in main.projects:
        raise HTTPException(status_code=404, detail="Project not found")

    project = main.projects[project_id]
    project_path = project.path

    stdout, stderr, returncode = run_git_command(
        project_path,
        ["git", "rev-parse", "--abbrev-ref", "HEAD"]
    )

    if returncode != 0:
        raise HTTPException(
            status_code=400,
            detail=stderr or "Failed to get current branch"
        )

    branch = stdout.strip()

    return {
        "success": True,
        "data": {
            "branch": branch
        }
    }

@router.get("/{project_id}/git/main-branch")
async def detect_main_branch(project_id: str):
    """
    Detect the main/master branch.

    Tries to find 'main' or 'master' branch.

    Args:
        project_id: ID of the project

    Returns:
        Main branch name
    """
    from . import main

    if project_id not in main.projects:
        raise HTTPException(status_code=404, detail="Project not found")

    project = main.projects[project_id]
    project_path = project.path

    # Try 'main' first, then 'master'
    for branch_name in ['main', 'master']:
        stdout, stderr, returncode = run_git_command(
            project_path,
            ["git", "rev-parse", "--verify", branch_name]
        )

        if returncode == 0:
            return {
                "success": True,
                "data": {
                    "branch": branch_name
                }
            }

    # If neither exists, return the current branch
    stdout, stderr, returncode = run_git_command(
        project_path,
        ["git", "rev-parse", "--abbrev-ref", "HEAD"]
    )

    if returncode == 0:
        return {
            "success": True,
            "data": {
                "branch": stdout.strip()
            }
        }

    raise HTTPException(
        status_code=400,
        detail="Could not detect main branch"
    )

@router.post("/{project_id}/git/skip-setup")
async def skip_git_setup(project_id: str):
    """
    Mark git setup as skipped for this project.

    This prevents the git setup modal from appearing again.

    Args:
        project_id: ID of the project

    Returns:
        Success status
    """
    from . import main

    if project_id not in main.projects:
        raise HTTPException(status_code=404, detail="Project not found")

    project = main.projects[project_id]
    project.settings["gitSetupSkipped"] = True
    main._save_projects()

    return {
        "success": True,
        "data": {
            "message": "Git setup skipped for this project"
        }
    }

@router.post("/{project_id}/git/initialize")
async def initialize_git(project_id: str):
    """
    Initialize a git repository in the project.

    Runs `git init` in the project directory.

    Args:
        project_id: ID of the project

    Returns:
        Success status
    """
    from . import main

    if project_id not in main.projects:
        raise HTTPException(status_code=404, detail="Project not found")

    project = main.projects[project_id]
    project_path = project.path

    # Check if already a git repo with commits
    check_stdout, _, check_returncode = run_git_command(
        project_path,
        ["git", "rev-parse", "--git-dir"]
    )

    already_initialized = check_returncode == 0

    # Check if has commits
    commits_stdout, _, commits_returncode = run_git_command(
        project_path,
        ["git", "rev-list", "-n", "1", "--all"]
    )
    has_commits = commits_returncode == 0 and bool(commits_stdout.strip())

    if already_initialized and has_commits:
        return {
            "success": True,
            "data": {
                "message": "Git repository already initialized with commits",
                "alreadyInitialized": True
            }
        }

    # Initialize git if needed
    if not already_initialized:
        stdout, stderr, returncode = run_git_command(
            project_path,
            ["git", "init"]
        )

        if returncode != 0:
            raise HTTPException(
                status_code=500,
                detail=stderr or "Failed to initialize git repository"
            )

    # Create initial commit if no commits exist
    if not has_commits:
        # Configure git user if not already set (needed for commits)
        run_git_command(
            project_path,
            ["git", "config", "user.email", "auto-claude@localhost"]
        )
        run_git_command(
            project_path,
            ["git", "config", "user.name", "Auto Claude"]
        )

        # Add all files
        add_stdout, add_stderr, add_returncode = run_git_command(
            project_path,
            ["git", "add", "."]
        )

        if add_returncode != 0:
            raise HTTPException(
                status_code=500,
                detail=add_stderr or "Failed to add files to git"
            )

        # Create initial commit
        commit_stdout, commit_stderr, commit_returncode = run_git_command(
            project_path,
            ["git", "commit", "-m", "Initial commit", "--allow-empty"]
        )

        if commit_returncode != 0:
            raise HTTPException(
                status_code=500,
                detail=commit_stderr or "Failed to create initial commit"
            )

    return {
        "success": True,
        "data": {
            "message": "Git repository initialized successfully with initial commit",
            "alreadyInitialized": False
        }
    }
