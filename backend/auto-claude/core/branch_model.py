#!/usr/bin/env python3
"""
Branch Model Manager
=====================

Manages the hierarchical Git branching model:
  main → release/{version} → dev → feature/{task-id} → feature/{task-id}/{subtask}

Provides:
- Detection of current branch model (flat vs hierarchical)
- Migration from flat/worktree model to hierarchical
- Branch creation following the hierarchy
- Model validation and enforcement
"""

import subprocess
import re
from dataclasses import dataclass, field
from enum import Enum
from pathlib import Path
from typing import Optional


class BranchModel(Enum):
    """Types of branch models."""
    UNKNOWN = "unknown"           # Can't determine
    FLAT = "flat"                 # Only main/master, no structure
    WORKTREE = "worktree"         # Old auto-claude/* branches
    HIERARCHICAL = "hierarchical" # Full model: main/release/dev/feature


@dataclass
class BranchModelStatus:
    """Status of the repository's branch model."""
    model: BranchModel
    main_branch: Optional[str] = None        # main or master
    dev_branch: Optional[str] = None         # dev if exists
    release_branches: list[str] = field(default_factory=list)
    feature_branches: list[str] = field(default_factory=list)
    worktree_branches: list[str] = field(default_factory=list)  # Old auto-claude/*
    issues: list[str] = field(default_factory=list)
    can_migrate: bool = True
    migration_steps: list[str] = field(default_factory=list)


@dataclass
class MigrationResult:
    """Result of a migration operation."""
    success: bool
    model: BranchModel
    branches_created: list[str] = field(default_factory=list)
    branches_renamed: list[str] = field(default_factory=list)
    errors: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)


class BranchModelManager:
    """
    Manages Git branch model detection, migration, and enforcement.

    The hierarchical model:
    - main: Production releases only (tagged)
    - release/{version}: Release candidates
    - dev: Integration branch for completed features
    - feature/{task-id}: Task-level feature branches
    - feature/{task-id}/{subtask}: Subtask work branches
    """

    # Branch patterns for detection
    MAIN_BRANCHES = ["main", "master"]
    DEV_BRANCH = "dev"
    RELEASE_PATTERN = re.compile(r"^release/[\d.]+(-[\w.]+)?$")
    FEATURE_PATTERN = re.compile(r"^feature/[\w-]+$")
    SUBTASK_PATTERN = re.compile(r"^feature/[\w-]+/[\w-]+$")
    WORKTREE_PATTERN = re.compile(r"^auto-claude/")
    HOTFIX_PATTERN = re.compile(r"^hotfix/[\w-]+$")

    def __init__(self, project_dir: Path):
        self.project_dir = Path(project_dir)

    def _run_git(self, args: list[str], check: bool = False) -> subprocess.CompletedProcess:
        """Run a git command."""
        result = subprocess.run(
            ["git"] + args,
            cwd=self.project_dir,
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
        )
        if check and result.returncode != 0:
            raise RuntimeError(f"Git command failed: {result.stderr}")
        return result

    def _branch_exists(self, branch: str) -> bool:
        """Check if a branch exists."""
        result = self._run_git(["rev-parse", "--verify", branch])
        return result.returncode == 0

    def _get_all_branches(self) -> list[str]:
        """Get all local branches."""
        result = self._run_git(["branch", "--list", "--format=%(refname:short)"])
        if result.returncode != 0:
            return []
        return [b.strip() for b in result.stdout.strip().split("\n") if b.strip()]

    def _get_current_branch(self) -> str:
        """Get the current branch name."""
        result = self._run_git(["rev-parse", "--abbrev-ref", "HEAD"])
        return result.stdout.strip() if result.returncode == 0 else ""

    def _get_remote_branches(self) -> list[str]:
        """Get all remote branches."""
        result = self._run_git(["branch", "-r", "--format=%(refname:short)"])
        if result.returncode != 0:
            return []
        return [b.strip() for b in result.stdout.strip().split("\n") if b.strip()]

    # ==================== Detection ====================

    def detect_model(self) -> BranchModelStatus:
        """
        Detect the current branch model of the repository.

        Returns:
            BranchModelStatus with detected model and details
        """
        status = BranchModelStatus(model=BranchModel.UNKNOWN)
        branches = self._get_all_branches()

        # Find main branch
        for main in self.MAIN_BRANCHES:
            if main in branches:
                status.main_branch = main
                break

        if not status.main_branch:
            status.issues.append("No main/master branch found")
            status.can_migrate = False

        # Check for dev branch
        if self.DEV_BRANCH in branches:
            status.dev_branch = self.DEV_BRANCH

        # Categorize all branches
        for branch in branches:
            if self.RELEASE_PATTERN.match(branch):
                status.release_branches.append(branch)
            elif self.FEATURE_PATTERN.match(branch) or self.SUBTASK_PATTERN.match(branch):
                status.feature_branches.append(branch)
            elif self.WORKTREE_PATTERN.match(branch):
                status.worktree_branches.append(branch)

        # Determine model type
        status.model = self._classify_model(status)

        # Generate migration steps if needed
        if status.model != BranchModel.HIERARCHICAL:
            status.migration_steps = self._generate_migration_steps(status)

        return status

    def _classify_model(self, status: BranchModelStatus) -> BranchModel:
        """Classify the branch model based on detected branches."""

        # Has old worktree branches = WORKTREE model
        if status.worktree_branches:
            return BranchModel.WORKTREE

        # Has dev + release branches + feature branches = HIERARCHICAL
        if (status.dev_branch and
            (status.release_branches or status.feature_branches)):
            return BranchModel.HIERARCHICAL

        # Has dev but no features yet = could be partial hierarchical
        if status.dev_branch:
            return BranchModel.HIERARCHICAL

        # Only main/master = FLAT
        if status.main_branch and not status.feature_branches:
            return BranchModel.FLAT

        # Has feature branches but no dev = partial/broken
        if status.feature_branches and not status.dev_branch:
            return BranchModel.FLAT  # Treat as flat, needs migration

        return BranchModel.UNKNOWN

    def _generate_migration_steps(self, status: BranchModelStatus) -> list[str]:
        """Generate human-readable migration steps."""
        steps = []

        if not status.main_branch:
            steps.append("Create 'main' branch from current HEAD")

        if not status.dev_branch:
            steps.append(f"Create 'dev' branch from '{status.main_branch or 'main'}'")

        if status.worktree_branches:
            steps.append(f"Migrate {len(status.worktree_branches)} auto-claude/* branches to feature/* format")
            for branch in status.worktree_branches:
                new_name = branch.replace("auto-claude/", "feature/")
                steps.append(f"  - Rename '{branch}' → '{new_name}'")

        return steps

    # ==================== Migration ====================

    def migrate_to_hierarchical(self, dry_run: bool = False) -> MigrationResult:
        """
        Migrate the repository to the hierarchical branch model.

        Args:
            dry_run: If True, only report what would be done

        Returns:
            MigrationResult with details of the migration
        """
        result = MigrationResult(success=True, model=BranchModel.HIERARCHICAL)
        status = self.detect_model()

        if status.model == BranchModel.HIERARCHICAL:
            result.warnings.append("Repository already uses hierarchical model")
            return result

        if not status.can_migrate:
            result.success = False
            result.errors.extend(status.issues)
            return result

        # Step 1: Ensure main branch exists
        if not status.main_branch:
            if dry_run:
                result.branches_created.append("main")
            else:
                try:
                    self._create_main_branch()
                    result.branches_created.append("main")
                    status.main_branch = "main"
                except Exception as e:
                    result.errors.append(f"Failed to create main branch: {e}")
                    result.success = False
                    return result

        # Step 2: Create dev branch if missing
        if not status.dev_branch:
            if dry_run:
                result.branches_created.append("dev")
            else:
                try:
                    self._create_dev_branch(status.main_branch)
                    result.branches_created.append("dev")
                except Exception as e:
                    result.errors.append(f"Failed to create dev branch: {e}")
                    result.success = False
                    return result

        # Step 3: Migrate worktree branches to feature branches
        for worktree_branch in status.worktree_branches:
            new_name = worktree_branch.replace("auto-claude/", "feature/")
            if dry_run:
                result.branches_renamed.append(f"{worktree_branch} → {new_name}")
            else:
                try:
                    self._rename_branch(worktree_branch, new_name)
                    result.branches_renamed.append(f"{worktree_branch} → {new_name}")
                except Exception as e:
                    result.warnings.append(f"Failed to rename {worktree_branch}: {e}")

        # Step 4: Rebase orphaned feature branches onto dev
        for feature_branch in status.feature_branches:
            if not self._is_descendant_of(feature_branch, status.dev_branch or "dev"):
                if dry_run:
                    result.warnings.append(f"Would rebase {feature_branch} onto dev")
                else:
                    # Don't auto-rebase, just warn
                    result.warnings.append(
                        f"Branch '{feature_branch}' is not based on dev. "
                        f"Consider rebasing: git rebase dev {feature_branch}"
                    )

        return result

    def _create_main_branch(self) -> None:
        """Create main branch from current HEAD."""
        current = self._get_current_branch()
        if current == "main":
            return
        self._run_git(["branch", "main"], check=True)

    def _create_dev_branch(self, base: str) -> None:
        """Create dev branch from base."""
        if self._branch_exists("dev"):
            return
        self._run_git(["branch", "dev", base], check=True)

    def _rename_branch(self, old_name: str, new_name: str) -> None:
        """Rename a branch."""
        if self._branch_exists(new_name):
            raise RuntimeError(f"Branch '{new_name}' already exists")
        self._run_git(["branch", "-m", old_name, new_name], check=True)

    def _is_descendant_of(self, branch: str, ancestor: str) -> bool:
        """Check if branch is a descendant of ancestor."""
        result = self._run_git(["merge-base", "--is-ancestor", ancestor, branch])
        return result.returncode == 0

    # ==================== Branch Operations ====================

    def create_feature_branch(self, task_id: str, base: str = "dev") -> str:
        """
        Create a feature branch for a task.

        Args:
            task_id: Task identifier
            base: Base branch (default: dev)

        Returns:
            Name of created branch
        """
        branch_name = f"feature/{task_id}"

        if self._branch_exists(branch_name):
            return branch_name

        self._run_git(["branch", branch_name, base], check=True)
        return branch_name

    def create_subtask_branch(self, task_id: str, subtask_id: str) -> str:
        """
        Create a subtask branch.

        Args:
            task_id: Parent task identifier
            subtask_id: Subtask identifier

        Returns:
            Name of created branch
        """
        feature_branch = f"feature/{task_id}"
        subtask_branch = f"feature/{task_id}/{subtask_id}"

        if not self._branch_exists(feature_branch):
            raise RuntimeError(f"Feature branch '{feature_branch}' does not exist")

        if self._branch_exists(subtask_branch):
            return subtask_branch

        self._run_git(["branch", subtask_branch, feature_branch], check=True)
        return subtask_branch

    def create_release_branch(self, version: str, base: str = "dev") -> str:
        """
        Create a release branch.

        Args:
            version: Version number (e.g., "1.2.0")
            base: Base branch (default: dev)

        Returns:
            Name of created branch
        """
        branch_name = f"release/{version}"

        if self._branch_exists(branch_name):
            raise RuntimeError(f"Release branch '{branch_name}' already exists")

        self._run_git(["branch", branch_name, base], check=True)
        return branch_name

    def create_hotfix_branch(self, name: str, tag: str) -> str:
        """
        Create a hotfix branch from a tag.

        Args:
            name: Hotfix name
            tag: Tag to branch from (e.g., "v1.2.0")

        Returns:
            Name of created branch
        """
        branch_name = f"hotfix/{name}"

        if self._branch_exists(branch_name):
            raise RuntimeError(f"Hotfix branch '{branch_name}' already exists")

        self._run_git(["branch", branch_name, tag], check=True)
        return branch_name

    # ==================== Validation ====================

    def validate_branch_name(self, branch: str) -> tuple[bool, str]:
        """
        Validate a branch name against the hierarchical model.

        Returns:
            (is_valid, error_message)
        """
        # Main branches
        if branch in self.MAIN_BRANCHES:
            return True, ""

        # Dev branch
        if branch == self.DEV_BRANCH:
            return True, ""

        # Release branches
        if self.RELEASE_PATTERN.match(branch):
            return True, ""

        # Feature branches (with or without subtask)
        if self.FEATURE_PATTERN.match(branch) or self.SUBTASK_PATTERN.match(branch):
            return True, ""

        # Hotfix branches
        if self.HOTFIX_PATTERN.match(branch):
            return True, ""

        # Old worktree pattern - invalid
        if self.WORKTREE_PATTERN.match(branch):
            return False, f"Branch '{branch}' uses old auto-claude/* pattern. Use feature/* instead."

        return False, f"Branch '{branch}' does not follow naming convention"

    def get_merge_target(self, branch: str) -> Optional[str]:
        """
        Get the appropriate merge target for a branch.

        Returns:
            Target branch name, or None if unknown
        """
        # Subtask → parent feature
        if self.SUBTASK_PATTERN.match(branch):
            parts = branch.split("/")
            return f"feature/{parts[1]}"

        # Feature → dev
        if self.FEATURE_PATTERN.match(branch):
            return "dev"

        # Release → main
        if self.RELEASE_PATTERN.match(branch):
            return "main"

        # Hotfix → main
        if self.HOTFIX_PATTERN.match(branch):
            return "main"

        # Dev → release (manual)
        if branch == "dev":
            return None  # Requires release version

        return None

    # ==================== Status & Info ====================

    def get_branch_hierarchy(self) -> dict:
        """
        Get the current branch hierarchy as a nested dict.

        Returns:
            Dict representing the branch tree
        """
        status = self.detect_model()

        hierarchy = {
            "main": status.main_branch,
            "releases": status.release_branches,
            "dev": status.dev_branch,
            "features": {},
        }

        # Group features with their subtasks
        for branch in status.feature_branches:
            if self.SUBTASK_PATTERN.match(branch):
                parts = branch.split("/")
                parent = f"feature/{parts[1]}"
                if parent not in hierarchy["features"]:
                    hierarchy["features"][parent] = []
                hierarchy["features"][parent].append(branch)
            elif self.FEATURE_PATTERN.match(branch):
                if branch not in hierarchy["features"]:
                    hierarchy["features"][branch] = []

        return hierarchy

    def print_status(self) -> str:
        """Generate a human-readable status report."""
        status = self.detect_model()
        lines = []

        lines.append(f"Branch Model: {status.model.value.upper()}")
        lines.append("")

        if status.main_branch:
            lines.append(f"  main: {status.main_branch}")
        else:
            lines.append("  main: (missing)")

        if status.dev_branch:
            lines.append(f"  dev:  {status.dev_branch}")
        else:
            lines.append("  dev:  (missing)")

        if status.release_branches:
            lines.append(f"  releases: {len(status.release_branches)}")
            for r in status.release_branches[:5]:
                lines.append(f"    - {r}")
            if len(status.release_branches) > 5:
                lines.append(f"    ... and {len(status.release_branches) - 5} more")

        if status.feature_branches:
            lines.append(f"  features: {len(status.feature_branches)}")
            for f in status.feature_branches[:5]:
                lines.append(f"    - {f}")
            if len(status.feature_branches) > 5:
                lines.append(f"    ... and {len(status.feature_branches) - 5} more")

        if status.worktree_branches:
            lines.append("")
            lines.append(f"  ⚠️  Legacy worktree branches: {len(status.worktree_branches)}")
            for w in status.worktree_branches:
                lines.append(f"    - {w}")

        if status.issues:
            lines.append("")
            lines.append("Issues:")
            for issue in status.issues:
                lines.append(f"  ❌ {issue}")

        if status.migration_steps:
            lines.append("")
            lines.append("Migration steps needed:")
            for step in status.migration_steps:
                lines.append(f"  → {step}")

        return "\n".join(lines)


# Convenience function for quick detection
def detect_branch_model(project_dir: Path) -> BranchModelStatus:
    """Detect the branch model of a repository."""
    return BranchModelManager(project_dir).detect_model()


# Convenience function for migration
def migrate_branch_model(project_dir: Path, dry_run: bool = False) -> MigrationResult:
    """Migrate a repository to the hierarchical branch model."""
    return BranchModelManager(project_dir).migrate_to_hierarchical(dry_run=dry_run)
