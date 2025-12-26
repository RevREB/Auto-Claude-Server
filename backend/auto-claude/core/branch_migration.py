#!/usr/bin/env python3
"""
Branch Migration Checker
=========================

Checks repository branch model on pull/clone and offers migration to
the hierarchical model if needed.

Usage:
    # Check on project load
    checker = BranchMigrationChecker(project_dir)
    if checker.needs_migration():
        result = checker.prompt_migration()

    # Or run as CLI
    python -m auto_claude.core.branch_migration /path/to/project
"""

import subprocess
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Callable, Optional

from .branch_model import (
    BranchModel,
    BranchModelManager,
    BranchModelStatus,
    MigrationResult,
)


@dataclass
class MigrationCheckResult:
    """Result of a migration check."""
    needs_migration: bool
    current_model: BranchModel
    status: BranchModelStatus
    message: str


class BranchMigrationChecker:
    """
    Checks and handles branch model migration.

    Integrates with git pull/clone to detect when a repository needs
    migration to the hierarchical branch model.
    """

    def __init__(self, project_dir: Path):
        self.project_dir = Path(project_dir)
        self.manager = BranchModelManager(project_dir)
        self._status: Optional[BranchModelStatus] = None

    @property
    def status(self) -> BranchModelStatus:
        """Get cached status or detect."""
        if self._status is None:
            self._status = self.manager.detect_model()
        return self._status

    def refresh_status(self) -> BranchModelStatus:
        """Force refresh of status."""
        self._status = self.manager.detect_model()
        return self._status

    def needs_migration(self) -> bool:
        """Check if the repository needs migration."""
        return self.status.model != BranchModel.HIERARCHICAL

    def check(self) -> MigrationCheckResult:
        """
        Perform a full migration check.

        Returns:
            MigrationCheckResult with details
        """
        status = self.status

        if status.model == BranchModel.HIERARCHICAL:
            return MigrationCheckResult(
                needs_migration=False,
                current_model=status.model,
                status=status,
                message="Repository uses hierarchical branch model ✓",
            )

        if status.model == BranchModel.WORKTREE:
            return MigrationCheckResult(
                needs_migration=True,
                current_model=status.model,
                status=status,
                message=(
                    f"Repository uses legacy worktree model with "
                    f"{len(status.worktree_branches)} auto-claude/* branches. "
                    "Migration to hierarchical model recommended."
                ),
            )

        if status.model == BranchModel.FLAT:
            return MigrationCheckResult(
                needs_migration=True,
                current_model=status.model,
                status=status,
                message=(
                    "Repository uses flat branch model. "
                    "Migration to hierarchical model will create 'dev' branch."
                ),
            )

        return MigrationCheckResult(
            needs_migration=True,
            current_model=status.model,
            status=status,
            message="Unknown branch model. Migration may help establish structure.",
        )

    def get_migration_preview(self) -> str:
        """Get a preview of what migration will do."""
        result = self.manager.migrate_to_hierarchical(dry_run=True)

        lines = ["Migration Preview:", ""]

        if result.branches_created:
            lines.append("Branches to create:")
            for branch in result.branches_created:
                lines.append(f"  + {branch}")

        if result.branches_renamed:
            lines.append("")
            lines.append("Branches to rename:")
            for rename in result.branches_renamed:
                lines.append(f"  → {rename}")

        if result.warnings:
            lines.append("")
            lines.append("Warnings:")
            for warning in result.warnings:
                lines.append(f"  ⚠ {warning}")

        if not result.branches_created and not result.branches_renamed:
            lines.append("  (No changes needed)")

        return "\n".join(lines)

    def migrate(
        self,
        dry_run: bool = False,
        on_progress: Optional[Callable[[str], None]] = None,
    ) -> MigrationResult:
        """
        Perform the migration.

        Args:
            dry_run: If True, only report what would be done
            on_progress: Optional callback for progress updates

        Returns:
            MigrationResult with details
        """
        if on_progress:
            on_progress("Checking current branch model...")

        result = self.manager.migrate_to_hierarchical(dry_run=dry_run)

        if on_progress:
            if result.success:
                on_progress("Migration completed successfully")
            else:
                on_progress(f"Migration failed: {', '.join(result.errors)}")

        # Refresh status after migration
        if not dry_run:
            self.refresh_status()

        return result

    def interactive_migrate(self) -> bool:
        """
        Run interactive migration with user prompts.

        Returns:
            True if migration was performed, False if skipped
        """
        check_result = self.check()

        if not check_result.needs_migration:
            print(check_result.message)
            return False

        print("\n" + "=" * 60)
        print("BRANCH MODEL MIGRATION")
        print("=" * 60)
        print()
        print(check_result.message)
        print()
        print(self.manager.print_status())
        print()
        print("-" * 60)
        print(self.get_migration_preview())
        print("-" * 60)
        print()

        try:
            response = input("Migrate to hierarchical model? [y/N]: ").strip().lower()
        except (EOFError, KeyboardInterrupt):
            print("\nMigration skipped.")
            return False

        if response not in ("y", "yes"):
            print("Migration skipped.")
            return False

        print("\nMigrating...")
        result = self.migrate(on_progress=print)

        if result.success:
            print("\n✓ Migration complete!")
            if result.branches_created:
                print(f"  Created: {', '.join(result.branches_created)}")
            if result.branches_renamed:
                print(f"  Renamed: {len(result.branches_renamed)} branches")
            if result.warnings:
                print("\nWarnings:")
                for warning in result.warnings:
                    print(f"  ⚠ {warning}")
            return True
        else:
            print("\n✗ Migration failed:")
            for error in result.errors:
                print(f"  ✗ {error}")
            return False


def check_on_pull(project_dir: Path) -> MigrationCheckResult:
    """
    Check branch model after a git pull.

    This should be called after git pull operations to detect
    if the repository structure has changed or needs migration.
    """
    checker = BranchMigrationChecker(project_dir)
    return checker.check()


def run_git_pull_with_check(project_dir: Path, remote: str = "origin") -> tuple[bool, Optional[MigrationCheckResult]]:
    """
    Run git pull and then check for migration.

    Args:
        project_dir: Project directory
        remote: Remote name (default: origin)

    Returns:
        (pull_success, migration_check_result)
    """
    # Run git pull
    result = subprocess.run(
        ["git", "pull", remote],
        cwd=project_dir,
        capture_output=True,
        text=True,
    )

    if result.returncode != 0:
        print(f"Git pull failed: {result.stderr}")
        return False, None

    print(result.stdout)

    # Check for migration
    check_result = check_on_pull(project_dir)

    if check_result.needs_migration:
        print(f"\n⚠ {check_result.message}")
        print("Run migration with: auto-claude migrate-branches")

    return True, check_result


def run_git_clone_with_check(
    url: str,
    target_dir: Optional[Path] = None,
    branch: Optional[str] = None,
) -> tuple[bool, Optional[MigrationCheckResult]]:
    """
    Run git clone and then check for migration.

    Args:
        url: Repository URL
        target_dir: Target directory (optional)
        branch: Branch to clone (optional)

    Returns:
        (clone_success, migration_check_result)
    """
    cmd = ["git", "clone"]

    if branch:
        cmd.extend(["-b", branch])

    cmd.append(url)

    if target_dir:
        cmd.append(str(target_dir))

    result = subprocess.run(cmd, capture_output=True, text=True)

    if result.returncode != 0:
        print(f"Git clone failed: {result.stderr}")
        return False, None

    print(result.stdout or f"Cloned to {target_dir or 'current directory'}")

    # Determine project directory
    if target_dir:
        project_dir = Path(target_dir)
    else:
        # Extract from URL
        repo_name = url.rstrip("/").split("/")[-1]
        if repo_name.endswith(".git"):
            repo_name = repo_name[:-4]
        project_dir = Path.cwd() / repo_name

    # Check for migration
    check_result = check_on_pull(project_dir)

    if check_result.needs_migration:
        print(f"\n⚠ {check_result.message}")
        print("Run migration with: auto-claude migrate-branches")

    return True, check_result


# CLI entry point
def main():
    """CLI entry point for branch migration."""
    import argparse

    parser = argparse.ArgumentParser(
        description="Check and migrate Git branch model"
    )
    parser.add_argument(
        "project_dir",
        type=Path,
        nargs="?",
        default=Path.cwd(),
        help="Project directory (default: current directory)",
    )
    parser.add_argument(
        "--check",
        action="store_true",
        help="Only check, don't prompt for migration",
    )
    parser.add_argument(
        "--migrate",
        action="store_true",
        help="Migrate without prompting",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Show what would be done without making changes",
    )
    parser.add_argument(
        "--status",
        action="store_true",
        help="Show detailed branch status",
    )

    args = parser.parse_args()

    if not args.project_dir.exists():
        print(f"Error: Directory not found: {args.project_dir}")
        sys.exit(1)

    checker = BranchMigrationChecker(args.project_dir)

    if args.status:
        print(checker.manager.print_status())
        sys.exit(0)

    if args.dry_run:
        print(checker.get_migration_preview())
        sys.exit(0)

    if args.check:
        result = checker.check()
        print(result.message)
        sys.exit(0 if not result.needs_migration else 1)

    if args.migrate:
        result = checker.migrate()
        if result.success:
            print("Migration completed successfully")
            sys.exit(0)
        else:
            print(f"Migration failed: {', '.join(result.errors)}")
            sys.exit(1)

    # Interactive mode
    checker.interactive_migrate()


if __name__ == "__main__":
    main()
