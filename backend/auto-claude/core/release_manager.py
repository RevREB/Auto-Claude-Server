"""
Release Manager - Manages release lifecycle in the hierarchical branching model.

Release flow:
1. Create release candidate from dev → release/{version}
2. QA/testing on release branch
3. Promote to main (merge + tag)
4. Optionally back-merge to dev

States:
- candidate: Release branch created, testing in progress
- promoted: Merged to main and tagged
- abandoned: Release cancelled
"""

import subprocess
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path
from typing import Optional, List, Dict, Any

from .version_calculator import Version, VersionCalculator, get_version_calculator
from .merge_manager import MergeManager, get_merge_manager


@dataclass
class ReleaseInfo:
    """Information about a release."""
    version: str
    branch: str
    status: str  # 'candidate', 'promoted', 'abandoned'
    created_at: datetime
    promoted_at: Optional[datetime] = None
    tag: Optional[str] = None
    release_notes: Optional[str] = None
    tasks: List[str] = field(default_factory=list)


@dataclass
class ReleaseResult:
    """Result of a release operation."""
    success: bool
    message: str
    release: Optional[ReleaseInfo] = None
    tag: Optional[str] = None
    commit_sha: Optional[str] = None


class ReleaseManager:
    """
    Manages the release lifecycle.

    Supports:
    - Creating release candidates from dev
    - Promoting releases to main
    - Generating release notes
    - Managing version tags
    """

    def __init__(self, project_dir: str | Path, remote: str = "origin"):
        """
        Initialize ReleaseManager.

        Args:
            project_dir: Path to the project directory
            remote: Git remote name (default: "origin")
        """
        self.project_dir = Path(project_dir)
        self.remote = remote
        self._merge_manager = get_merge_manager(project_dir)
        self._version_calculator = get_version_calculator(project_dir)

    def _run_git(
        self,
        *args,
        check: bool = True,
        capture: bool = True
    ) -> subprocess.CompletedProcess:
        """Run a git command."""
        cmd = ["git"] + list(args)
        return subprocess.run(
            cmd,
            cwd=self.project_dir,
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

    def _tag_exists(self, tag: str) -> bool:
        """Check if a tag exists."""
        result = self._run_git("tag", "-l", tag, check=False)
        return bool(result.stdout.strip())

    def get_current_version(self) -> Optional[str]:
        """Get the current version from git tags."""
        version = self._version_calculator.get_current_version()
        return str(version) if version else None

    def get_next_version(self, tasks: List[Dict[str, Any]] = None) -> Dict[str, Any]:
        """
        Calculate the next version based on tasks.

        Args:
            tasks: Tasks to include (default: all unreleased tasks)

        Returns:
            Dict with current, next version, and bump type
        """
        if tasks is None:
            tasks = []

        bump = self._version_calculator.calculate_next(tasks)

        return {
            "current": str(bump.current),
            "next": str(bump.next),
            "bumpType": bump.bump_type,
            "breakingChanges": bump.breaking_changes,
            "features": bump.features,
            "fixes": bump.fixes
        }

    def create_release(
        self,
        version: str,
        tasks: List[Dict[str, Any]] = None,
        release_notes: Optional[str] = None,
        from_branch: str = "dev"
    ) -> ReleaseResult:
        """
        Create a release candidate branch from dev.

        Args:
            version: Version string (e.g., "1.2.0")
            tasks: Tasks included in this release
            release_notes: Optional release notes
            from_branch: Branch to create release from (default: "dev")

        Returns:
            ReleaseResult
        """
        release_branch = f"release/{version}"
        tag_name = f"v{version}"

        # Check if release already exists
        if self._branch_exists(release_branch, remote=True):
            return ReleaseResult(
                success=False,
                message=f"Release branch {release_branch} already exists"
            )

        if self._tag_exists(tag_name):
            return ReleaseResult(
                success=False,
                message=f"Version tag {tag_name} already exists"
            )

        # Ensure from_branch exists
        if not self._branch_exists(from_branch, remote=True):
            return ReleaseResult(
                success=False,
                message=f"Branch {from_branch} does not exist"
            )

        original_branch = self._get_current_branch()

        try:
            # Fetch latest
            self._run_git("fetch", self.remote, from_branch)

            # Create release branch
            self._run_git("checkout", "-b", release_branch, f"{self.remote}/{from_branch}")

            # Generate release notes if not provided
            if not release_notes and tasks:
                version_obj = Version.parse(version)
                release_notes = self._version_calculator.generate_changelog_markdown(
                    version_obj,
                    tasks
                )

            # Write release notes to file if provided
            if release_notes:
                release_notes_file = self.project_dir / "RELEASE_NOTES.md"
                release_notes_file.write_text(release_notes)
                self._run_git("add", "RELEASE_NOTES.md")
                self._run_git("commit", "-m", f"Add release notes for v{version}")

            # Push release branch
            self._run_git("push", "-u", self.remote, release_branch)

            release_info = ReleaseInfo(
                version=version,
                branch=release_branch,
                status="candidate",
                created_at=datetime.utcnow(),
                release_notes=release_notes,
                tasks=[t.get("id", "") for t in (tasks or [])]
            )

            return ReleaseResult(
                success=True,
                message=f"Created release candidate {release_branch}",
                release=release_info
            )

        except subprocess.CalledProcessError as e:
            return ReleaseResult(
                success=False,
                message=f"Failed to create release: {e.stderr}"
            )
        finally:
            # Return to original branch
            try:
                self._run_git("checkout", original_branch, check=False)
            except Exception:
                pass

    def promote_to_main(
        self,
        version: str,
        create_tag: bool = True,
        back_merge: bool = True
    ) -> ReleaseResult:
        """
        Promote a release to main (merge and tag).

        Args:
            version: Version to promote
            create_tag: Whether to create a version tag
            back_merge: Whether to merge release back to dev

        Returns:
            ReleaseResult
        """
        release_branch = f"release/{version}"
        tag_name = f"v{version}"

        # Verify release branch exists
        if not self._branch_exists(release_branch, remote=True):
            return ReleaseResult(
                success=False,
                message=f"Release branch {release_branch} does not exist"
            )

        original_branch = self._get_current_branch()

        try:
            # Fetch latest
            self._run_git("fetch", self.remote)

            # Checkout main
            self._run_git("checkout", "main")
            self._run_git("pull", self.remote, "main", check=False)

            # Merge release into main
            result = self._run_git(
                "merge", "--no-ff", "-m", f"Release v{version}",
                f"{self.remote}/{release_branch}",
                check=False
            )

            if result.returncode != 0:
                if "CONFLICT" in result.stdout or "CONFLICT" in result.stderr:
                    self._run_git("merge", "--abort", check=False)
                    return ReleaseResult(
                        success=False,
                        message="Merge conflicts detected. Resolve manually."
                    )
                return ReleaseResult(
                    success=False,
                    message=f"Merge failed: {result.stderr}"
                )

            commit_sha = None
            tag = None

            # Get commit SHA
            commit_result = self._run_git("rev-parse", "HEAD")
            commit_sha = commit_result.stdout.strip()

            # Create tag
            if create_tag and not self._tag_exists(tag_name):
                self._run_git("tag", "-a", tag_name, "-m", f"Release v{version}")
                tag = tag_name

            # Push main and tag
            self._run_git("push", self.remote, "main")
            if tag:
                self._run_git("push", self.remote, tag)

            # Back-merge to dev
            if back_merge and self._branch_exists("dev", remote=True):
                try:
                    self._run_git("checkout", "dev")
                    self._run_git("pull", self.remote, "dev", check=False)
                    self._run_git(
                        "merge", "--no-ff", "-m",
                        f"Back-merge release v{version} to dev",
                        f"{self.remote}/{release_branch}",
                        check=False
                    )
                    self._run_git("push", self.remote, "dev")
                except Exception as e:
                    print(f"[ReleaseManager] Back-merge warning: {e}")

            release_info = ReleaseInfo(
                version=version,
                branch=release_branch,
                status="promoted",
                created_at=datetime.utcnow(),  # Would need to read from DB
                promoted_at=datetime.utcnow(),
                tag=tag
            )

            return ReleaseResult(
                success=True,
                message=f"Promoted v{version} to main" + (f" and tagged {tag}" if tag else ""),
                release=release_info,
                tag=tag,
                commit_sha=commit_sha
            )

        except subprocess.CalledProcessError as e:
            return ReleaseResult(
                success=False,
                message=f"Promotion failed: {e.stderr}"
            )
        finally:
            try:
                self._run_git("checkout", original_branch, check=False)
            except Exception:
                pass

    def abandon_release(self, version: str, delete_branch: bool = True) -> ReleaseResult:
        """
        Abandon a release candidate.

        Args:
            version: Version to abandon
            delete_branch: Whether to delete the release branch

        Returns:
            ReleaseResult
        """
        release_branch = f"release/{version}"

        if not self._branch_exists(release_branch, remote=True):
            return ReleaseResult(
                success=False,
                message=f"Release branch {release_branch} does not exist"
            )

        if delete_branch:
            try:
                # Delete remote branch
                self._run_git("push", self.remote, "--delete", release_branch, check=False)
                # Delete local branch
                self._run_git("branch", "-D", release_branch, check=False)
            except Exception as e:
                print(f"[ReleaseManager] Warning deleting branch: {e}")

        return ReleaseResult(
            success=True,
            message=f"Abandoned release v{version}"
        )

    def list_releases(self) -> List[Dict[str, Any]]:
        """
        List all release branches.

        Returns:
            List of release info dicts
        """
        releases = []

        try:
            # Get release branches
            result = self._run_git(
                "branch", "-r", "--list", f"{self.remote}/release/*",
                check=False
            )

            if result.returncode == 0:
                for line in result.stdout.strip().split("\n"):
                    if line:
                        branch = line.strip().replace(f"{self.remote}/", "")
                        version = branch.replace("release/", "")

                        # Check if promoted (has tag)
                        tag = f"v{version}"
                        is_promoted = self._tag_exists(tag)

                        releases.append({
                            "version": version,
                            "branch": branch,
                            "status": "promoted" if is_promoted else "candidate",
                            "tag": tag if is_promoted else None
                        })

            # Sort by version (newest first)
            releases.sort(key=lambda r: r["version"], reverse=True)

        except Exception as e:
            print(f"[ReleaseManager] Error listing releases: {e}")

        return releases

    def get_release(self, version: str) -> Optional[Dict[str, Any]]:
        """
        Get information about a specific release.

        Args:
            version: Version to get

        Returns:
            Release info dict or None
        """
        release_branch = f"release/{version}"
        tag = f"v{version}"

        if not self._branch_exists(release_branch, remote=True):
            return None

        is_promoted = self._tag_exists(tag)

        # Get commit info
        try:
            result = self._run_git(
                "log", "-1", "--format=%H|%ai|%s",
                f"{self.remote}/{release_branch}",
                check=False
            )

            commit_info = None
            if result.returncode == 0 and result.stdout.strip():
                parts = result.stdout.strip().split("|")
                if len(parts) >= 3:
                    commit_info = {
                        "sha": parts[0],
                        "date": parts[1],
                        "message": parts[2]
                    }

            return {
                "version": version,
                "branch": release_branch,
                "status": "promoted" if is_promoted else "candidate",
                "tag": tag if is_promoted else None,
                "commit": commit_info
            }

        except Exception:
            return None

    def generate_changelog(
        self,
        version: str,
        tasks: List[Dict[str, Any]]
    ) -> str:
        """
        Generate changelog for a release.

        Args:
            version: Version string
            tasks: Tasks included in release

        Returns:
            Markdown formatted changelog
        """
        try:
            version_obj = Version.parse(version)
            return self._version_calculator.generate_changelog_markdown(version_obj, tasks)
        except Exception as e:
            print(f"[ReleaseManager] Error generating changelog: {e}")
            return f"## [{version}]\n\nRelease notes not available."

    def get_unreleased_tasks_on_dev(self) -> List[str]:
        """
        Get list of commits on dev that aren't in any release.

        Returns:
            List of commit messages/task references
        """
        try:
            # Find the latest release tag
            result = self._run_git(
                "describe", "--tags", "--abbrev=0", "--match", "v*",
                check=False
            )

            if result.returncode != 0:
                # No releases yet - all dev commits are unreleased
                base = "main"
            else:
                base = result.stdout.strip()

            # Get commits between base and dev
            result = self._run_git(
                "log", "--oneline", f"{base}..{self.remote}/dev",
                check=False
            )

            if result.returncode == 0:
                return [line.strip() for line in result.stdout.strip().split("\n") if line]

            return []

        except Exception as e:
            print(f"[ReleaseManager] Error getting unreleased tasks: {e}")
            return []


def get_release_manager(project_dir: str | Path) -> ReleaseManager:
    """
    Factory function to get a ReleaseManager instance.

    Args:
        project_dir: Path to the project directory

    Returns:
        ReleaseManager instance
    """
    return ReleaseManager(project_dir)
