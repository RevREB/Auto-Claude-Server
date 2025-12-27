"""
Merge Manager - Handles merge operations in the hierarchical branch model.

Merge hierarchy:
- feature/{task-id}/{subtask} → feature/{task-id}  (subtask merge)
- feature/{task-id} → dev                           (feature merge)
- dev → release/{version}                           (release branch creation)
- release/{version} → main                          (release promotion)

This module provides merge operations, conflict detection, and preview functionality.
"""

import subprocess
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path
from typing import Optional, List, Dict, Any


@dataclass
class MergeConflict:
    """Information about a merge conflict."""
    file: str
    conflict_type: str  # 'content', 'rename', 'delete', 'add'
    ours_content: Optional[str] = None
    theirs_content: Optional[str] = None
    can_auto_resolve: bool = False


@dataclass
class MergeResult:
    """Result of a merge operation."""
    success: bool
    message: str
    commit_sha: Optional[str] = None
    merged_files: List[str] = field(default_factory=list)
    conflicts: List[MergeConflict] = field(default_factory=list)
    had_conflicts: bool = False


@dataclass
class MergePreview:
    """Preview of what a merge would do."""
    can_merge: bool
    source_branch: str
    target_branch: str
    commits_ahead: int
    files_changed: int
    additions: int
    deletions: int
    conflicts: List[MergeConflict] = field(default_factory=list)
    changed_files: List[Dict[str, Any]] = field(default_factory=list)


class MergeManager:
    """
    Manages merge operations for the hierarchical branching model.

    Supports:
    - Subtask → Feature branch merges
    - Feature → Dev merges
    - Dev → Release merges
    - Release → Main merges (with tagging)
    """

    def __init__(self, project_dir: str | Path, remote: str = "origin"):
        """
        Initialize MergeManager.

        Args:
            project_dir: Path to the project directory
            remote: Git remote name (default: "origin")
        """
        self.project_dir = Path(project_dir)
        self.remote = remote

    def _run_git(
        self,
        *args,
        cwd: Path = None,
        check: bool = True,
        capture: bool = True
    ) -> subprocess.CompletedProcess:
        """Run a git command."""
        cmd = ["git"] + list(args)
        return subprocess.run(
            cmd,
            cwd=cwd or self.project_dir,
            capture_output=capture,
            text=True,
            check=check
        )

    def _get_current_branch(self) -> str:
        """Get the current branch name."""
        result = self._run_git("rev-parse", "--abbrev-ref", "HEAD")
        return result.stdout.strip()

    def _branch_exists(self, branch: str, remote: bool = False) -> bool:
        """Check if a branch exists."""
        if remote:
            result = self._run_git(
                "ls-remote", "--heads", self.remote, branch,
                check=False
            )
            return bool(result.stdout.strip())
        else:
            result = self._run_git(
                "rev-parse", "--verify", branch,
                check=False
            )
            return result.returncode == 0

    def _fetch_branch(self, branch: str) -> bool:
        """Fetch a branch from remote."""
        try:
            self._run_git("fetch", self.remote, branch)
            return True
        except subprocess.CalledProcessError:
            return False

    def _get_commits_between(self, base: str, head: str) -> int:
        """Get number of commits between two refs."""
        try:
            result = self._run_git(
                "rev-list", "--count", f"{base}..{head}",
                check=False
            )
            return int(result.stdout.strip()) if result.returncode == 0 else 0
        except Exception:
            return 0

    def _get_diff_stats(self, base: str, head: str) -> Dict[str, int]:
        """Get diff statistics between two refs."""
        try:
            result = self._run_git(
                "diff", "--shortstat", f"{base}...{head}",
                check=False
            )

            stats = {"files": 0, "additions": 0, "deletions": 0}
            if result.returncode == 0 and result.stdout.strip():
                line = result.stdout.strip()
                # Parse: "3 files changed, 10 insertions(+), 5 deletions(-)"
                import re
                files_match = re.search(r"(\d+) files? changed", line)
                add_match = re.search(r"(\d+) insertions?", line)
                del_match = re.search(r"(\d+) deletions?", line)

                if files_match:
                    stats["files"] = int(files_match.group(1))
                if add_match:
                    stats["additions"] = int(add_match.group(1))
                if del_match:
                    stats["deletions"] = int(del_match.group(1))

            return stats
        except Exception:
            return {"files": 0, "additions": 0, "deletions": 0}

    def _get_changed_files(self, base: str, head: str) -> List[Dict[str, Any]]:
        """Get list of changed files between two refs."""
        try:
            result = self._run_git(
                "diff", "--numstat", f"{base}...{head}",
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
                        "deletions": deletions,
                        "status": "modified"
                    })

            return files
        except Exception:
            return []

    def _check_merge_conflicts(self, source: str, target: str) -> List[MergeConflict]:
        """
        Check for merge conflicts without actually merging.

        Uses git merge-tree for conflict detection.
        """
        conflicts = []

        try:
            # Get merge base
            result = self._run_git(
                "merge-base", target, source,
                check=False
            )
            if result.returncode != 0:
                return conflicts

            merge_base = result.stdout.strip()

            # Use merge-tree to detect conflicts
            result = self._run_git(
                "merge-tree", merge_base, target, source,
                check=False
            )

            if result.returncode != 0 or "<<<<<<" in result.stdout:
                # Parse conflict markers
                current_file = None
                for line in result.stdout.split("\n"):
                    if line.startswith("changed in both"):
                        # Extract filename
                        parts = line.split()
                        if len(parts) >= 4:
                            current_file = parts[-1]
                            conflicts.append(MergeConflict(
                                file=current_file,
                                conflict_type="content",
                                can_auto_resolve=False
                            ))

        except Exception as e:
            print(f"[MergeManager] Error checking conflicts: {e}")

        return conflicts

    def preview_merge(self, source: str, target: str) -> MergePreview:
        """
        Preview what a merge would do without actually merging.

        Args:
            source: Source branch name
            target: Target branch name

        Returns:
            MergePreview with merge information
        """
        # Ensure we have latest refs
        self._fetch_branch(source)
        self._fetch_branch(target)

        source_ref = f"{self.remote}/{source}" if self._branch_exists(source, remote=True) else source
        target_ref = f"{self.remote}/{target}" if self._branch_exists(target, remote=True) else target

        # Get stats
        commits = self._get_commits_between(target_ref, source_ref)
        stats = self._get_diff_stats(target_ref, source_ref)
        changed_files = self._get_changed_files(target_ref, source_ref)
        conflicts = self._check_merge_conflicts(source_ref, target_ref)

        return MergePreview(
            can_merge=len(conflicts) == 0,
            source_branch=source,
            target_branch=target,
            commits_ahead=commits,
            files_changed=stats["files"],
            additions=stats["additions"],
            deletions=stats["deletions"],
            conflicts=conflicts,
            changed_files=changed_files
        )

    def merge_subtask(
        self,
        task_id: str,
        subtask_id: str,
        no_commit: bool = False,
        message: Optional[str] = None
    ) -> MergeResult:
        """
        Merge a subtask branch into its parent feature branch.

        Args:
            task_id: Parent task ID
            subtask_id: Subtask ID to merge
            no_commit: If True, stage changes but don't commit
            message: Custom merge commit message

        Returns:
            MergeResult
        """
        source = f"feature/{task_id}/{subtask_id}"
        target = f"feature/{task_id}"

        if not message:
            message = f"Merge subtask {subtask_id} into {task_id}"

        return self._do_merge(source, target, no_commit, message)

    def merge_feature_to_dev(
        self,
        task_id: str,
        no_commit: bool = False,
        message: Optional[str] = None
    ) -> MergeResult:
        """
        Merge a feature branch into dev.

        Args:
            task_id: Task ID (feature branch name)
            no_commit: If True, stage changes but don't commit
            message: Custom merge commit message

        Returns:
            MergeResult
        """
        source = f"feature/{task_id}"
        target = "dev"

        if not message:
            message = f"Merge feature/{task_id} into dev"

        return self._do_merge(source, target, no_commit, message)

    def merge_dev_to_release(
        self,
        version: str,
        message: Optional[str] = None
    ) -> MergeResult:
        """
        Create a release branch from dev.

        Args:
            version: Version number (e.g., "1.2.0")
            message: Custom commit message

        Returns:
            MergeResult
        """
        source = "dev"
        target = f"release/{version}"

        # Create release branch if it doesn't exist
        if not self._branch_exists(target):
            try:
                self._run_git("checkout", "-b", target, f"{self.remote}/dev")
                self._run_git("push", "-u", self.remote, target)
                return MergeResult(
                    success=True,
                    message=f"Created release branch {target} from dev",
                    merged_files=[]
                )
            except subprocess.CalledProcessError as e:
                return MergeResult(
                    success=False,
                    message=f"Failed to create release branch: {e.stderr}"
                )

        # If branch exists, merge dev into it
        if not message:
            message = f"Merge dev into release/{version}"

        return self._do_merge(source, target, False, message)

    def merge_release_to_main(
        self,
        version: str,
        tag: bool = True,
        message: Optional[str] = None
    ) -> MergeResult:
        """
        Merge a release branch into main and optionally tag.

        Args:
            version: Version number
            tag: Whether to create a version tag
            message: Custom merge commit message

        Returns:
            MergeResult
        """
        source = f"release/{version}"
        target = "main"

        if not message:
            message = f"Release v{version}"

        result = self._do_merge(source, target, False, message)

        if result.success and tag:
            try:
                self._run_git("tag", "-a", f"v{version}", "-m", f"Release v{version}")
                self._run_git("push", self.remote, f"v{version}")
                result.message += f" (tagged v{version})"
            except subprocess.CalledProcessError as e:
                result.message += f" (tagging failed: {e.stderr})"

        return result

    def _do_merge(
        self,
        source: str,
        target: str,
        no_commit: bool,
        message: str
    ) -> MergeResult:
        """
        Perform the actual merge operation.

        Args:
            source: Source branch
            target: Target branch
            no_commit: If True, don't commit
            message: Merge commit message

        Returns:
            MergeResult
        """
        original_branch = self._get_current_branch()

        try:
            # Fetch latest
            self._fetch_branch(source)
            self._fetch_branch(target)

            # Checkout target branch
            self._run_git("checkout", target)
            self._run_git("pull", self.remote, target, check=False)

            # Attempt merge
            merge_args = ["merge", "--no-ff"]
            if no_commit:
                merge_args.append("--no-commit")
            merge_args.extend(["-m", message, f"{self.remote}/{source}"])

            result = self._run_git(*merge_args, check=False)

            if result.returncode != 0:
                # Check for conflicts
                if "CONFLICT" in result.stdout or "CONFLICT" in result.stderr:
                    # Abort merge
                    self._run_git("merge", "--abort", check=False)
                    conflicts = self._check_merge_conflicts(
                        f"{self.remote}/{source}",
                        target
                    )
                    return MergeResult(
                        success=False,
                        message="Merge conflicts detected",
                        conflicts=conflicts,
                        had_conflicts=True
                    )
                else:
                    return MergeResult(
                        success=False,
                        message=f"Merge failed: {result.stderr}"
                    )

            # Get commit SHA if we committed
            commit_sha = None
            if not no_commit:
                commit_result = self._run_git("rev-parse", "HEAD")
                commit_sha = commit_result.stdout.strip()

                # Push the merge
                self._run_git("push", self.remote, target)

            # Get list of merged files
            merged_files = []
            diff_result = self._run_git(
                "diff", "--name-only", "HEAD~1..HEAD",
                check=False
            )
            if diff_result.returncode == 0:
                merged_files = [f for f in diff_result.stdout.strip().split("\n") if f]

            return MergeResult(
                success=True,
                message=f"Successfully merged {source} into {target}",
                commit_sha=commit_sha,
                merged_files=merged_files
            )

        except subprocess.CalledProcessError as e:
            return MergeResult(
                success=False,
                message=f"Merge error: {e.stderr}"
            )
        finally:
            # Return to original branch
            try:
                self._run_git("checkout", original_branch, check=False)
            except Exception:
                pass

    def ensure_dev_branch(self, base_branch: str = "main") -> bool:
        """
        Ensure the dev branch exists, creating it if necessary.

        Args:
            base_branch: Branch to create dev from (default: "main")

        Returns:
            True if dev exists or was created
        """
        if self._branch_exists("dev", remote=True):
            return True

        if self._branch_exists("dev"):
            # Local exists, push it
            try:
                self._run_git("push", "-u", self.remote, "dev")
                return True
            except subprocess.CalledProcessError:
                return False

        # Create dev branch
        try:
            self._fetch_branch(base_branch)
            self._run_git("checkout", "-b", "dev", f"{self.remote}/{base_branch}")
            self._run_git("push", "-u", self.remote, "dev")
            print(f"[MergeManager] Created dev branch from {base_branch}")
            return True
        except subprocess.CalledProcessError as e:
            print(f"[MergeManager] Failed to create dev branch: {e.stderr}")
            return False

    def create_feature_branch(
        self,
        task_id: str,
        base_branch: str = "dev"
    ) -> Optional[str]:
        """
        Create a feature branch for a task.

        Args:
            task_id: Task identifier
            base_branch: Branch to create from (default: "dev")

        Returns:
            Branch name if successful, None otherwise
        """
        branch_name = f"feature/{task_id}"

        if self._branch_exists(branch_name, remote=True):
            print(f"[MergeManager] Branch {branch_name} already exists")
            return branch_name

        try:
            self._fetch_branch(base_branch)
            self._run_git("checkout", "-b", branch_name, f"{self.remote}/{base_branch}")
            self._run_git("push", "-u", self.remote, branch_name)
            print(f"[MergeManager] Created branch {branch_name}")
            return branch_name
        except subprocess.CalledProcessError as e:
            print(f"[MergeManager] Failed to create branch: {e.stderr}")
            return None

    def create_subtask_branch(
        self,
        task_id: str,
        subtask_id: str
    ) -> Optional[str]:
        """
        Create a subtask branch.

        Args:
            task_id: Parent task ID
            subtask_id: Subtask identifier

        Returns:
            Branch name if successful, None otherwise
        """
        feature_branch = f"feature/{task_id}"
        branch_name = f"feature/{task_id}/{subtask_id}"

        if self._branch_exists(branch_name, remote=True):
            print(f"[MergeManager] Branch {branch_name} already exists")
            return branch_name

        try:
            self._fetch_branch(feature_branch)
            self._run_git("checkout", "-b", branch_name, f"{self.remote}/{feature_branch}")
            self._run_git("push", "-u", self.remote, branch_name)
            print(f"[MergeManager] Created branch {branch_name}")
            return branch_name
        except subprocess.CalledProcessError as e:
            print(f"[MergeManager] Failed to create subtask branch: {e.stderr}")
            return None

    def delete_branch(self, branch: str, remote: bool = True) -> bool:
        """
        Delete a branch.

        Args:
            branch: Branch name
            remote: Also delete from remote

        Returns:
            True if successful
        """
        try:
            # Delete local
            self._run_git("branch", "-D", branch, check=False)

            # Delete remote
            if remote:
                self._run_git("push", self.remote, "--delete", branch, check=False)

            print(f"[MergeManager] Deleted branch {branch}")
            return True
        except subprocess.CalledProcessError:
            return False


def get_merge_manager(project_dir: str | Path) -> MergeManager:
    """
    Factory function to get a MergeManager instance.

    Args:
        project_dir: Path to the project directory

    Returns:
        MergeManager instance
    """
    return MergeManager(project_dir)
