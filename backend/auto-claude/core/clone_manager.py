"""
Clone Manager - Manages temporary clones for isolated task execution.

This module replaces the worktree-based approach with pure Git clones for task isolation.

Architecture:
- Each task runs in a fresh clone at /tmp/auto-claude/{task-id}-{hash}/
- Clone is created before task execution starts
- Branch is pushed to origin after task completes
- Clone folder is deleted after push

Benefits over worktrees:
- True isolation (each clone has its own .git)
- No shared state between parallel tasks
- Standard Git workflow (clone → work → push)
- CI/CD friendly
- Easy cleanup on failure
"""

import hashlib
import os
import shutil
import subprocess
import time
from dataclasses import dataclass
from datetime import datetime, timedelta
from pathlib import Path
from typing import Optional, List, Dict, Any


# Base directory for all clones
CLONE_BASE_DIR = Path("/tmp/auto-claude")

# Maximum age for orphaned clones (24 hours)
ORPHAN_AGE_HOURS = 24


@dataclass
class CloneInfo:
    """Information about a clone."""
    task_id: str
    clone_path: Path
    branch: str
    remote_url: str
    created_at: datetime
    is_active: bool = True


class CloneManager:
    """
    Manages temporary Git clones for task execution.

    Lifecycle:
    1. create_clone() - Clone repo to temp location, checkout branch
    2. Task executes in clone directory
    3. push_and_cleanup() - Push branch to origin, delete clone folder
    """

    def __init__(self, project_dir: str | Path, remote: str = "origin"):
        """
        Initialize CloneManager.

        Args:
            project_dir: Path to the main project directory
            remote: Git remote name (default: "origin")
        """
        self.project_dir = Path(project_dir)
        self.remote = remote

        # Ensure base directory exists
        CLONE_BASE_DIR.mkdir(parents=True, exist_ok=True)

    def _run_git(self, *args, cwd: Path = None, check: bool = True, capture: bool = True) -> subprocess.CompletedProcess:
        """Run a git command."""
        cmd = ["git"] + list(args)
        return subprocess.run(
            cmd,
            cwd=cwd or self.project_dir,
            capture_output=capture,
            text=True,
            check=check
        )

    def _get_remote_url(self) -> str:
        """Get the remote URL for cloning."""
        result = self._run_git("remote", "get-url", self.remote)
        return result.stdout.strip()

    def _generate_clone_path(self, task_id: str) -> Path:
        """Generate a unique clone path for a task."""
        # Use hash to ensure unique paths even if task is restarted
        hash_input = f"{task_id}-{time.time()}"
        short_hash = hashlib.sha256(hash_input.encode()).hexdigest()[:8]
        return CLONE_BASE_DIR / f"{task_id}-{short_hash}"

    def _find_existing_clone(self, task_id: str) -> Optional[Path]:
        """Find an existing clone for a task."""
        if not CLONE_BASE_DIR.exists():
            return None

        for path in CLONE_BASE_DIR.iterdir():
            if path.is_dir() and path.name.startswith(f"{task_id}-"):
                return path
        return None

    def create_clone(
        self,
        task_id: str,
        branch: str,
        base_branch: str = "main"
    ) -> Path:
        """
        Create a clone for task execution.

        Args:
            task_id: Unique task identifier
            branch: Branch name to create/checkout (e.g., "feature/task-abc123")
            base_branch: Base branch to create new branch from (default: "main")

        Returns:
            Path to the clone directory

        Raises:
            subprocess.CalledProcessError: If git operations fail
        """
        # Check for existing clone
        existing = self._find_existing_clone(task_id)
        if existing:
            print(f"[CloneManager] Found existing clone: {existing}")
            return existing

        # Get remote URL
        remote_url = self._get_remote_url()

        # Generate clone path
        clone_path = self._generate_clone_path(task_id)
        print(f"[CloneManager] Creating clone at {clone_path}")

        try:
            # Clone the repository
            self._run_git(
                "clone",
                "--single-branch",
                "--branch", base_branch,
                remote_url,
                str(clone_path),
                cwd=CLONE_BASE_DIR
            )

            # Check if branch already exists on remote
            result = self._run_git(
                "ls-remote", "--heads", self.remote, branch,
                cwd=clone_path,
                check=False
            )

            if result.stdout.strip():
                # Branch exists, check it out
                print(f"[CloneManager] Checking out existing branch: {branch}")
                self._run_git("fetch", self.remote, branch, cwd=clone_path)
                self._run_git("checkout", "-B", branch, f"{self.remote}/{branch}", cwd=clone_path)
            else:
                # Create new branch
                print(f"[CloneManager] Creating new branch: {branch}")
                self._run_git("checkout", "-b", branch, cwd=clone_path)

            # Write metadata file for tracking
            self._write_metadata(clone_path, task_id, branch, remote_url)

            print(f"[CloneManager] Clone ready at {clone_path}")
            return clone_path

        except subprocess.CalledProcessError as e:
            # Clean up on failure
            if clone_path.exists():
                shutil.rmtree(clone_path)
            raise

    def _write_metadata(self, clone_path: Path, task_id: str, branch: str, remote_url: str):
        """Write metadata file for clone tracking."""
        metadata = {
            "task_id": task_id,
            "branch": branch,
            "remote_url": remote_url,
            "created_at": datetime.utcnow().isoformat(),
            "project_dir": str(self.project_dir)
        }

        metadata_file = clone_path / ".auto-claude-clone"
        import json
        metadata_file.write_text(json.dumps(metadata, indent=2))

    def _read_metadata(self, clone_path: Path) -> Optional[Dict[str, Any]]:
        """Read metadata from a clone directory."""
        metadata_file = clone_path / ".auto-claude-clone"
        if not metadata_file.exists():
            return None

        import json
        try:
            return json.loads(metadata_file.read_text())
        except Exception:
            return None

    def get_clone_path(self, task_id: str) -> Optional[Path]:
        """
        Get the path to an existing clone.

        Args:
            task_id: Task identifier

        Returns:
            Path to clone directory, or None if not found
        """
        return self._find_existing_clone(task_id)

    def get_clone_info(self, task_id: str) -> Optional[CloneInfo]:
        """
        Get information about a clone.

        Args:
            task_id: Task identifier

        Returns:
            CloneInfo or None if clone not found
        """
        clone_path = self._find_existing_clone(task_id)
        if not clone_path:
            return None

        metadata = self._read_metadata(clone_path)
        if not metadata:
            return None

        return CloneInfo(
            task_id=task_id,
            clone_path=clone_path,
            branch=metadata.get("branch", ""),
            remote_url=metadata.get("remote_url", ""),
            created_at=datetime.fromisoformat(metadata.get("created_at", datetime.utcnow().isoformat())),
            is_active=True
        )

    def push_branch(self, task_id: str, force: bool = False) -> bool:
        """
        Push the branch from a clone to the remote.

        Args:
            task_id: Task identifier
            force: Whether to force push (default: False)

        Returns:
            True if successful
        """
        clone_path = self._find_existing_clone(task_id)
        if not clone_path:
            print(f"[CloneManager] No clone found for task {task_id}")
            return False

        metadata = self._read_metadata(clone_path)
        if not metadata:
            print(f"[CloneManager] No metadata found for clone {clone_path}")
            return False

        branch = metadata.get("branch")
        if not branch:
            print(f"[CloneManager] No branch in metadata for {clone_path}")
            return False

        try:
            # Push to remote
            push_args = ["push", "-u", self.remote, branch]
            if force:
                push_args.insert(1, "--force")

            self._run_git(*push_args, cwd=clone_path)
            print(f"[CloneManager] Pushed branch {branch} to {self.remote}")
            return True

        except subprocess.CalledProcessError as e:
            print(f"[CloneManager] Failed to push: {e.stderr}")
            return False

    def push_and_cleanup(self, task_id: str, force: bool = False) -> bool:
        """
        Push the branch and delete the clone.

        Args:
            task_id: Task identifier
            force: Whether to force push

        Returns:
            True if successful
        """
        if not self.push_branch(task_id, force):
            return False

        return self.cleanup_clone(task_id)

    def cleanup_clone(self, task_id: str) -> bool:
        """
        Delete a clone directory (for discard or cleanup).

        Args:
            task_id: Task identifier

        Returns:
            True if successful
        """
        clone_path = self._find_existing_clone(task_id)
        if not clone_path:
            print(f"[CloneManager] No clone found for task {task_id}")
            return True  # Already clean

        try:
            shutil.rmtree(clone_path)
            print(f"[CloneManager] Deleted clone at {clone_path}")
            return True
        except Exception as e:
            print(f"[CloneManager] Failed to delete clone: {e}")
            return False

    def get_commit_count(self, task_id: str, base_branch: str = "main") -> int:
        """
        Get the number of commits ahead of base branch.

        Args:
            task_id: Task identifier
            base_branch: Branch to compare against

        Returns:
            Number of commits ahead
        """
        clone_path = self._find_existing_clone(task_id)
        if not clone_path:
            return 0

        try:
            result = self._run_git(
                "rev-list", "--count", f"{self.remote}/{base_branch}..HEAD",
                cwd=clone_path,
                check=False
            )
            return int(result.stdout.strip()) if result.returncode == 0 else 0
        except Exception:
            return 0

    def get_changed_files(self, task_id: str, base_branch: str = "main") -> List[Dict[str, Any]]:
        """
        Get list of changed files in the clone.

        Args:
            task_id: Task identifier
            base_branch: Branch to compare against

        Returns:
            List of dicts with file info (path, status, additions, deletions)
        """
        clone_path = self._find_existing_clone(task_id)
        if not clone_path:
            return []

        try:
            # Get changed files with stats
            result = self._run_git(
                "diff", "--numstat", f"{self.remote}/{base_branch}...HEAD",
                cwd=clone_path,
                check=False
            )

            if result.returncode != 0:
                return []

            files = []
            for line in result.stdout.strip().split("\n"):
                if not line:
                    continue
                parts = line.split("\t")
                if len(parts) >= 3:
                    additions = int(parts[0]) if parts[0] != "-" else 0
                    deletions = int(parts[1]) if parts[1] != "-" else 0
                    files.append({
                        "path": parts[2],
                        "additions": additions,
                        "deletions": deletions
                    })

            return files

        except Exception:
            return []

    def list_active_clones(self) -> List[CloneInfo]:
        """
        List all active clone directories.

        Returns:
            List of CloneInfo for all active clones
        """
        clones = []

        if not CLONE_BASE_DIR.exists():
            return clones

        for path in CLONE_BASE_DIR.iterdir():
            if not path.is_dir():
                continue

            metadata = self._read_metadata(path)
            if not metadata:
                continue

            clones.append(CloneInfo(
                task_id=metadata.get("task_id", path.name.split("-")[0]),
                clone_path=path,
                branch=metadata.get("branch", ""),
                remote_url=metadata.get("remote_url", ""),
                created_at=datetime.fromisoformat(metadata.get("created_at", datetime.utcnow().isoformat())),
                is_active=True
            ))

        return clones

    def cleanup_orphaned_clones(self, max_age_hours: int = ORPHAN_AGE_HOURS) -> int:
        """
        Clean up clone directories older than max_age_hours.

        Args:
            max_age_hours: Maximum age in hours (default: 24)

        Returns:
            Number of clones removed
        """
        if not CLONE_BASE_DIR.exists():
            return 0

        cutoff = datetime.utcnow() - timedelta(hours=max_age_hours)
        count = 0

        for path in CLONE_BASE_DIR.iterdir():
            if not path.is_dir():
                continue

            metadata = self._read_metadata(path)
            if metadata:
                created_at = datetime.fromisoformat(metadata.get("created_at", datetime.utcnow().isoformat()))
                if created_at >= cutoff:
                    continue  # Not old enough
            else:
                # No metadata - use directory modification time
                mtime = datetime.fromtimestamp(path.stat().st_mtime)
                if mtime >= cutoff:
                    continue

            try:
                shutil.rmtree(path)
                print(f"[CloneManager] Removed orphaned clone: {path}")
                count += 1
            except Exception as e:
                print(f"[CloneManager] Failed to remove orphaned clone {path}: {e}")

        return count


def get_clone_manager(project_dir: str | Path) -> CloneManager:
    """
    Factory function to get a CloneManager instance.

    Args:
        project_dir: Path to the project directory

    Returns:
        CloneManager instance
    """
    return CloneManager(project_dir)
