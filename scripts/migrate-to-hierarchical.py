#!/usr/bin/env python3
"""
Migration script to convert projects from worktree-based model to hierarchical branching model.

This script:
1. Detects existing .worktrees/ directories
2. Converts worktree branches (auto-claude/*) to feature branches (feature/*)
3. Creates 'dev' branch from main if not exists
4. Rebases/merges existing work to new branch structure
5. Cleans up .worktrees/ folders
6. Updates database records with new branch names
"""

import os
import sys
import shutil
import subprocess
import sqlite3
import json
from pathlib import Path
from datetime import datetime
from typing import Optional, Dict, List, Tuple


class MigrationError(Exception):
    """Custom exception for migration errors."""
    pass


class HierarchicalMigrator:
    """Migrates projects from worktree-based model to hierarchical branching model."""

    def __init__(self, project_path: str, db_path: Optional[str] = None, dry_run: bool = False):
        self.project_path = Path(project_path)
        self.db_path = db_path
        self.dry_run = dry_run
        self.migration_log: List[str] = []

    def log(self, message: str):
        """Log a migration message."""
        timestamp = datetime.now().isoformat()
        log_entry = f"[{timestamp}] {message}"
        self.migration_log.append(log_entry)
        print(log_entry)

    def run_git(self, args: List[str], cwd: Optional[Path] = None, check: bool = True) -> subprocess.CompletedProcess:
        """Run a git command."""
        cwd = cwd or self.project_path
        cmd = ["git"] + args

        if self.dry_run and any(arg in args for arg in ["push", "branch", "checkout", "merge", "rebase"]):
            self.log(f"[DRY RUN] Would execute: {' '.join(cmd)}")
            return subprocess.CompletedProcess(cmd, 0, "", "")

        result = subprocess.run(cmd, cwd=str(cwd), capture_output=True, text=True)
        if check and result.returncode != 0:
            raise MigrationError(f"Git command failed: {' '.join(cmd)}\n{result.stderr}")
        return result

    def get_main_branch(self) -> str:
        """Detect the main branch name (main or master)."""
        result = self.run_git(["branch", "--list", "main", "master"], check=False)
        branches = result.stdout.strip().split('\n')
        for branch in branches:
            branch = branch.strip().lstrip('* ')
            if branch in ['main', 'master']:
                return branch
        raise MigrationError("Could not detect main branch (main or master)")

    def branch_exists(self, branch: str, cwd: Optional[Path] = None) -> bool:
        """Check if a branch exists."""
        result = self.run_git(["rev-parse", "--verify", branch], cwd=cwd, check=False)
        return result.returncode == 0

    def ensure_dev_branch(self) -> bool:
        """Create dev branch from main if it doesn't exist."""
        main_branch = self.get_main_branch()

        if self.branch_exists("dev"):
            self.log(f"Dev branch already exists")
            return False

        self.log(f"Creating dev branch from {main_branch}")
        if not self.dry_run:
            self.run_git(["branch", "dev", main_branch])
            self.run_git(["push", "-u", "origin", "dev"])

        return True

    def detect_worktrees(self) -> List[Tuple[str, Path]]:
        """Detect existing worktrees and their task IDs."""
        worktrees_dir = self.project_path / ".worktrees"
        worktrees = []

        if not worktrees_dir.exists():
            return worktrees

        for entry in worktrees_dir.iterdir():
            if entry.is_dir() and not entry.name.startswith('.'):
                task_id = entry.name
                worktrees.append((task_id, entry))
                self.log(f"Found worktree: {task_id} at {entry}")

        return worktrees

    def get_worktree_branch(self, worktree_path: Path) -> Optional[str]:
        """Get the branch name of a worktree."""
        try:
            result = self.run_git(["rev-parse", "--abbrev-ref", "HEAD"], cwd=worktree_path, check=False)
            if result.returncode == 0:
                return result.stdout.strip()
        except Exception as e:
            self.log(f"Error getting worktree branch: {e}")
        return None

    def migrate_worktree_to_feature_branch(self, task_id: str, worktree_path: Path) -> Optional[str]:
        """Migrate a worktree to a feature branch."""
        old_branch = self.get_worktree_branch(worktree_path)
        if not old_branch:
            self.log(f"Could not get branch for worktree {task_id}")
            return None

        new_branch = f"feature/{task_id}"
        self.log(f"Migrating {old_branch} -> {new_branch}")

        if self.dry_run:
            return new_branch

        try:
            # Check if the old branch has commits ahead of main
            main_branch = self.get_main_branch()
            result = self.run_git(["rev-list", "--count", f"{main_branch}..{old_branch}"], check=False)
            commit_count = int(result.stdout.strip()) if result.returncode == 0 else 0

            if commit_count > 0:
                # Create new feature branch from the worktree branch
                self.run_git(["branch", new_branch, old_branch])
                self.run_git(["push", "-u", "origin", new_branch])
                self.log(f"Pushed {commit_count} commits to {new_branch}")
            else:
                self.log(f"No commits to migrate for {task_id}")

            return new_branch

        except MigrationError as e:
            self.log(f"Error migrating worktree {task_id}: {e}")
            return None

    def cleanup_worktree(self, task_id: str, worktree_path: Path):
        """Remove a worktree directory."""
        if self.dry_run:
            self.log(f"[DRY RUN] Would remove worktree at {worktree_path}")
            return

        try:
            # Try git worktree remove first
            self.run_git(["worktree", "remove", str(worktree_path), "--force"], check=False)
        except Exception:
            pass

        # Then force remove the directory
        if worktree_path.exists():
            shutil.rmtree(worktree_path)
            self.log(f"Removed worktree directory: {worktree_path}")

    def update_database(self, task_id: str, feature_branch: str):
        """Update database records with new branch name."""
        if not self.db_path or self.dry_run:
            if self.dry_run:
                self.log(f"[DRY RUN] Would update task {task_id} with feature_branch={feature_branch}")
            return

        try:
            conn = sqlite3.connect(self.db_path)
            cursor = conn.cursor()

            # Update task with new feature branch
            cursor.execute(
                "UPDATE tasks SET feature_branch = ?, updated_at = ? WHERE id = ?",
                (feature_branch, datetime.now().isoformat(), task_id)
            )

            conn.commit()
            conn.close()
            self.log(f"Updated database for task {task_id}")

        except Exception as e:
            self.log(f"Error updating database: {e}")

    def migrate(self) -> Dict:
        """Run the full migration."""
        self.log(f"Starting migration for project: {self.project_path}")

        results = {
            "project_path": str(self.project_path),
            "dry_run": self.dry_run,
            "dev_branch_created": False,
            "worktrees_migrated": 0,
            "worktrees_failed": 0,
            "errors": []
        }

        try:
            # Step 1: Ensure dev branch exists
            results["dev_branch_created"] = self.ensure_dev_branch()

            # Step 2: Detect worktrees
            worktrees = self.detect_worktrees()
            self.log(f"Found {len(worktrees)} worktrees to migrate")

            # Step 3: Migrate each worktree
            for task_id, worktree_path in worktrees:
                try:
                    feature_branch = self.migrate_worktree_to_feature_branch(task_id, worktree_path)
                    if feature_branch:
                        self.update_database(task_id, feature_branch)
                        self.cleanup_worktree(task_id, worktree_path)
                        results["worktrees_migrated"] += 1
                    else:
                        results["worktrees_failed"] += 1
                except Exception as e:
                    self.log(f"Failed to migrate worktree {task_id}: {e}")
                    results["worktrees_failed"] += 1
                    results["errors"].append(f"{task_id}: {str(e)}")

            # Step 4: Clean up empty .worktrees directory
            worktrees_dir = self.project_path / ".worktrees"
            if worktrees_dir.exists() and not any(worktrees_dir.iterdir()):
                if not self.dry_run:
                    worktrees_dir.rmdir()
                    self.log("Removed empty .worktrees directory")

            self.log("Migration complete!")

        except Exception as e:
            self.log(f"Migration failed: {e}")
            results["errors"].append(str(e))

        results["log"] = self.migration_log
        return results


def main():
    """Main entry point."""
    import argparse

    parser = argparse.ArgumentParser(
        description="Migrate projects from worktree-based to hierarchical branching model"
    )
    parser.add_argument("project_path", help="Path to the project to migrate")
    parser.add_argument("--db", help="Path to the SQLite database")
    parser.add_argument("--dry-run", action="store_true", help="Show what would be done without making changes")
    parser.add_argument("--all-projects", action="store_true", help="Migrate all projects in the /projects directory")

    args = parser.parse_args()

    if args.all_projects:
        projects_dir = Path("/projects")
        if not projects_dir.exists():
            print(f"Projects directory not found: {projects_dir}")
            sys.exit(1)

        for project in projects_dir.iterdir():
            if project.is_dir() and (project / ".git").exists():
                print(f"\n{'='*60}")
                print(f"Migrating: {project}")
                print('='*60)
                migrator = HierarchicalMigrator(str(project), args.db, args.dry_run)
                results = migrator.migrate()
                print(json.dumps(results, indent=2))
    else:
        if not Path(args.project_path).exists():
            print(f"Project path not found: {args.project_path}")
            sys.exit(1)

        migrator = HierarchicalMigrator(args.project_path, args.db, args.dry_run)
        results = migrator.migrate()
        print(json.dumps(results, indent=2))


if __name__ == "__main__":
    main()
