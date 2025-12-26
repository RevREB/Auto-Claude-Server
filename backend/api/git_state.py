"""
Git State Manager - Single source of truth with git-backed state persistence.

This module manages task and spec state using the database as the single source
of truth, with automatic export to a hidden git ref for persistence and sharing.

Architecture:
- Database (SQLite) is the single source of truth for all task state
- State is exported to hidden ref 'refs/auto-claude/state' on changes
- State can be imported from git when cloning/restoring a project
- Hidden ref doesn't show in branch list, avoids merge confusion

Uses git plumbing commands to avoid branch switching issues in worktrees.
"""

import json
import subprocess
import tempfile
from pathlib import Path
from datetime import datetime
from typing import Optional, Dict, Any, List
import shutil
import os


# Hidden ref - not under refs/heads/ so it won't appear as a branch
STATE_REF = "refs/auto-claude/state"
STATE_DIR = ".auto-claude-state"


class GitStateManager:
    """Manages task state persistence via git using plumbing commands."""

    def __init__(self, project_path: str):
        self.project_path = Path(project_path)

    def _run_git(self, *args, check: bool = True, capture: bool = True, input_data: str = None) -> subprocess.CompletedProcess:
        """Run a git command in the project directory."""
        cmd = ["git", "-C", str(self.project_path)] + list(args)
        return subprocess.run(
            cmd,
            capture_output=capture,
            text=True,
            check=check,
            input=input_data
        )

    def _is_git_repo(self) -> bool:
        """Check if the project is a git repository."""
        result = self._run_git("rev-parse", "--git-dir", check=False)
        return result.returncode == 0

    def _state_ref_exists(self) -> bool:
        """Check if the state ref exists."""
        result = self._run_git("rev-parse", "--verify", STATE_REF, check=False)
        return result.returncode == 0

    def _get_state_tree(self) -> Optional[str]:
        """Get the tree SHA of the current state ref."""
        if not self._state_ref_exists():
            return None
        result = self._run_git("rev-parse", f"{STATE_REF}^{{tree}}", check=False)
        if result.returncode == 0:
            return result.stdout.strip()
        return None

    def _create_state_doc(self) -> bool:
        """Create AUTO-CLAUDE-STATE.md in the project's working directory."""
        doc_path = self.project_path / "AUTO-CLAUDE-STATE.md"
        if doc_path.exists():
            return True

        doc_content = """# Auto-Claude State Tracking

Auto-Claude uses a **hidden git ref** to persist task state across sessions and machines.

## How It Works

- Task state (status, specs, implementation plans) is stored in the database
- Changes are automatically exported to a hidden git ref for backup/sync
- When you clone a project, state is restored automatically
- State syncs across machines when you push/pull

## What is `refs/auto-claude/state`?

This is a **hidden ref** - not a regular branch. It:

- Does NOT appear in `git branch` output
- Does NOT show up in GitHub's branch list
- Cannot be accidentally merged

## DO NOT

- Manually edit or delete this ref
- Try to merge or checkout this ref
- Run git commands against it

**This ref is managed entirely by Auto-Claude. Leave it alone.**
"""
        try:
            doc_path.write_text(doc_content)
            print(f"[GitState] Created {doc_path}")
            return True
        except Exception as e:
            print(f"[GitState] Error creating state doc: {e}")
            return False

    def init_state_ref(self) -> bool:
        """
        Initialize the state ref using plumbing commands.
        Uses hidden ref (not under refs/heads/) so it won't appear as a branch.
        Also creates AUTO-CLAUDE-STATE.md in the project's working directory.
        """
        if not self._is_git_repo():
            print(f"[GitState] Not a git repo: {self.project_path}")
            return False

        if self._state_ref_exists():
            print(f"[GitState] State ref already exists")
            return True

        # Create documentation file in project working directory
        self._create_state_doc()

        try:
            # Create initial state in a temp directory
            with tempfile.TemporaryDirectory() as tmpdir:
                tmppath = Path(tmpdir)
                state_dir = tmppath / STATE_DIR
                state_dir.mkdir(parents=True)

                # Create initial state files
                initial_state = {
                    "version": "1.0.0",
                    "created_at": datetime.now().isoformat(),
                    "tasks": []
                }
                (state_dir / "tasks.json").write_text(json.dumps(initial_state, indent=2))
                (state_dir / "specs").mkdir(exist_ok=True)
                (state_dir / "specs" / ".gitkeep").write_text("")

                # Add files to git index using a temp index
                env = os.environ.copy()
                temp_index = tmppath / "temp_index"
                env["GIT_INDEX_FILE"] = str(temp_index)

                # Add all files from state_dir
                for root, dirs, files in os.walk(state_dir):
                    for file in files:
                        filepath = Path(root) / file
                        relpath = filepath.relative_to(tmppath)

                        # Hash the file
                        result = subprocess.run(
                            ["git", "-C", str(self.project_path), "hash-object", "-w", str(filepath)],
                            capture_output=True, text=True, check=True
                        )
                        blob_sha = result.stdout.strip()

                        # Add to temp index
                        subprocess.run(
                            ["git", "-C", str(self.project_path), "update-index", "--add",
                             "--cacheinfo", f"100644,{blob_sha},{relpath}"],
                            env=env, capture_output=True, text=True, check=True
                        )

                # Write tree from temp index
                result = subprocess.run(
                    ["git", "-C", str(self.project_path), "write-tree"],
                    env=env, capture_output=True, text=True, check=True
                )
                tree_sha = result.stdout.strip()

                # Create commit (orphan - no parent)
                result = subprocess.run(
                    ["git", "-C", str(self.project_path), "commit-tree", tree_sha,
                     "-m", "Initialize auto-claude state ref"],
                    capture_output=True, text=True, check=True
                )
                commit_sha = result.stdout.strip()

                # Create the branch ref
                self._run_git("update-ref", STATE_REF, commit_sha)

            print(f"[GitState] Created state ref: {STATE_REF}")
            return True

        except subprocess.CalledProcessError as e:
            print(f"[GitState] Error creating state ref: {e}")
            import traceback
            traceback.print_exc()
            return False

    def export_state(self, tasks: List[Dict[str, Any]], specs: Dict[str, Dict[str, Any]] = None) -> bool:
        """
        Export current state from database to the state ref using plumbing commands.
        Does not switch branches.

        Args:
            tasks: List of task dictionaries from database
            specs: Optional dict of spec_id -> spec data (implementation_plan, etc.)

        Returns:
            True if export successful
        """
        if not self._is_git_repo():
            print(f"[GitState] Not a git repo, skipping export")
            return False

        # Ensure state ref exists
        if not self._state_ref_exists():
            if not self.init_state_ref():
                return False

        try:
            with tempfile.TemporaryDirectory() as tmpdir:
                tmppath = Path(tmpdir)
                state_dir = tmppath / STATE_DIR
                state_dir.mkdir(parents=True)
                (state_dir / "specs").mkdir(exist_ok=True)

                # Write tasks.json
                tasks_data = {
                    "version": "1.0.0",
                    "updated_at": datetime.now().isoformat(),
                    "tasks": tasks
                }
                (state_dir / "tasks.json").write_text(json.dumps(tasks_data, indent=2))

                # Write project-level data (settings, index, insights, timelines)
                try:
                    from .database import ProjectService
                    # Get project ID from first task if available
                    project_id = tasks[0].get("projectId") if tasks else None
                    if project_id:
                        project = ProjectService.get_by_id(project_id)
                        if project:
                            # Export claude_settings
                            settings = project.get("settings", {})
                            if settings.get("claudeSettings"):
                                (state_dir / "claude_settings.json").write_text(
                                    json.dumps(settings["claudeSettings"], indent=2)
                                )

                            # Export project_index
                            project_index = ProjectService.get_project_index(project_id)
                            if project_index:
                                (state_dir / "project_index.json").write_text(
                                    json.dumps(project_index, indent=2)
                                )

                            # Export insights_sessions
                            insights = ProjectService.get_insights_sessions(project_id)
                            if insights:
                                (state_dir / "insights_sessions.json").write_text(
                                    json.dumps(insights, indent=2)
                                )

                            # Export file_timelines
                            timelines = ProjectService.get_file_timelines(project_id)
                            if timelines:
                                (state_dir / "file_timelines.json").write_text(
                                    json.dumps(timelines, indent=2)
                                )
                except Exception as e:
                    print(f"[GitState] Warning: Could not export project data: {e}")

                # Write specs if provided
                if specs:
                    for spec_id, spec_data in specs.items():
                        spec_subdir = state_dir / "specs" / spec_id
                        spec_subdir.mkdir(parents=True, exist_ok=True)

                        for filename, content in spec_data.items():
                            filepath = spec_subdir / filename
                            if isinstance(content, dict):
                                filepath.write_text(json.dumps(content, indent=2))
                            else:
                                filepath.write_text(str(content))

                # Keep specs dir if empty
                if not any((state_dir / "specs").iterdir()):
                    (state_dir / "specs" / ".gitkeep").write_text("")

                # Create temp index and add files
                env = os.environ.copy()
                temp_index = tmppath / "temp_index"
                env["GIT_INDEX_FILE"] = str(temp_index)

                for root, dirs, files in os.walk(state_dir):
                    for file in files:
                        filepath = Path(root) / file
                        relpath = filepath.relative_to(tmppath)

                        # Hash the file
                        result = subprocess.run(
                            ["git", "-C", str(self.project_path), "hash-object", "-w", str(filepath)],
                            capture_output=True, text=True, check=True
                        )
                        blob_sha = result.stdout.strip()

                        # Add to temp index
                        subprocess.run(
                            ["git", "-C", str(self.project_path), "update-index", "--add",
                             "--cacheinfo", f"100644,{blob_sha},{relpath}"],
                            env=env, capture_output=True, text=True, check=True
                        )

                # Write tree
                result = subprocess.run(
                    ["git", "-C", str(self.project_path), "write-tree"],
                    env=env, capture_output=True, text=True, check=True
                )
                tree_sha = result.stdout.strip()

                # Check if tree is different from current state ref tree
                current_tree = self._get_state_tree()
                if current_tree == tree_sha:
                    print(f"[GitState] No state changes to export")
                    return True

                # Get current state ref commit for parent
                result = self._run_git("rev-parse", STATE_REF, check=False)
                parent_sha = result.stdout.strip() if result.returncode == 0 else None

                # Create commit
                timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
                commit_args = ["git", "-C", str(self.project_path), "commit-tree", tree_sha,
                               "-m", f"State update: {timestamp}"]
                if parent_sha:
                    commit_args.extend(["-p", parent_sha])

                result = subprocess.run(commit_args, capture_output=True, text=True, check=True)
                commit_sha = result.stdout.strip()

                # Update branch ref
                self._run_git("update-ref", STATE_REF, commit_sha)

                print(f"[GitState] Exported state to {STATE_REF} ({len(tasks)} tasks)")
                return True

        except subprocess.CalledProcessError as e:
            print(f"[GitState] Error exporting state: {e}")
            import traceback
            traceback.print_exc()
            return False

    def import_state(self) -> Optional[Dict[str, Any]]:
        """
        Import state from the git state ref.

        Returns:
            Dictionary with 'tasks' and 'specs' keys, or None if no state found
        """
        if not self._is_git_repo():
            print(f"[GitState] Not a git repo, skipping import")
            return None

        if not self._state_ref_exists():
            print(f"[GitState] No state ref found")
            return None

        try:
            # Read tasks.json from state ref without checking out
            result = self._run_git("show", f"{STATE_REF}:{STATE_DIR}/tasks.json", check=False)
            if result.returncode != 0:
                print(f"[GitState] No tasks.json in state ref")
                return None

            tasks_data = json.loads(result.stdout)
            tasks = tasks_data.get("tasks", [])

            # Read specs by listing the specs directory
            specs = {}
            result = self._run_git("ls-tree", "-r", "--name-only", STATE_REF, check=False)
            if result.returncode == 0:
                for line in result.stdout.strip().split("\n"):
                    if not line or not line.startswith(f"{STATE_DIR}/specs/"):
                        continue

                    # Parse: .auto-claude-state/specs/{spec_id}/{filename}
                    parts = line.replace(f"{STATE_DIR}/specs/", "").split("/", 1)
                    if len(parts) != 2:
                        continue

                    spec_id, filename = parts
                    if spec_id == ".gitkeep" or filename == ".gitkeep":
                        continue

                    if spec_id not in specs:
                        specs[spec_id] = {}

                    # Read file content
                    file_result = self._run_git("show", f"{STATE_REF}:{line}", check=False)
                    if file_result.returncode == 0:
                        content = file_result.stdout
                        if filename.endswith(".json"):
                            try:
                                content = json.loads(content)
                            except json.JSONDecodeError:
                                pass
                        specs[spec_id][filename] = content

            # Read project-level data
            project_data = {}

            # Read claude_settings.json
            result = self._run_git("show", f"{STATE_REF}:{STATE_DIR}/claude_settings.json", check=False)
            if result.returncode == 0:
                try:
                    project_data["claudeSettings"] = json.loads(result.stdout)
                except json.JSONDecodeError:
                    pass

            # Read project_index.json
            result = self._run_git("show", f"{STATE_REF}:{STATE_DIR}/project_index.json", check=False)
            if result.returncode == 0:
                try:
                    project_data["projectIndex"] = json.loads(result.stdout)
                except json.JSONDecodeError:
                    pass

            # Read insights_sessions.json
            result = self._run_git("show", f"{STATE_REF}:{STATE_DIR}/insights_sessions.json", check=False)
            if result.returncode == 0:
                try:
                    project_data["insightsSessions"] = json.loads(result.stdout)
                except json.JSONDecodeError:
                    pass

            # Read file_timelines.json
            result = self._run_git("show", f"{STATE_REF}:{STATE_DIR}/file_timelines.json", check=False)
            if result.returncode == 0:
                try:
                    project_data["fileTimelines"] = json.loads(result.stdout)
                except json.JSONDecodeError:
                    pass

            print(f"[GitState] Imported {len(tasks)} tasks and {len(specs)} specs from state ref")
            return {"tasks": tasks, "specs": specs, "projectData": project_data}

        except Exception as e:
            print(f"[GitState] Error importing state: {e}")
            import traceback
            traceback.print_exc()
            return None

    def push_state(self, remote: str = "origin") -> bool:
        """Push the state ref to a remote."""
        if not self._state_ref_exists():
            print(f"[GitState] No state ref to push")
            return False

        try:
            # Push hidden ref to same location on remote
            self._run_git("push", remote, f"{STATE_REF}:{STATE_REF}", "--force")
            print(f"[GitState] Pushed state ref to {remote}")
            return True
        except subprocess.CalledProcessError as e:
            print(f"[GitState] Error pushing state: {e}")
            return False

    def pull_state(self, remote: str = "origin") -> bool:
        """Pull the state ref from a remote."""
        try:
            # Fetch hidden ref from remote
            self._run_git("fetch", remote, f"{STATE_REF}:{STATE_REF}", check=False)
            print(f"[GitState] Pulled state ref from {remote}")
            return True
        except subprocess.CalledProcessError as e:
            print(f"[GitState] Error pulling state: {e}")
            return False


def collect_spec_data_from_db(spec_id: str) -> Dict[str, Any]:
    """
    Collect spec data from database for export.

    Args:
        spec_id: Spec ID to collect

    Returns:
        Dictionary of filename -> content for git state export
    """
    from .database import SpecService

    spec = SpecService.get_by_id(spec_id, include_logs=False)
    if not spec:
        return {}

    # Map database fields to filenames for state branch
    spec_data = {}

    if spec.get("specMarkdown"):
        spec_data["spec.md"] = spec["specMarkdown"]
    if spec.get("taskMarkdown"):
        spec_data["task.md"] = spec["taskMarkdown"]
    if spec.get("implementationPlan"):
        spec_data["implementation_plan.json"] = spec["implementationPlan"]
    if spec.get("requirements"):
        spec_data["requirements.json"] = spec["requirements"]
    if spec.get("context"):
        spec_data["context.json"] = spec["context"]
    if spec.get("complexityAssessment"):
        spec_data["complexity_assessment.json"] = spec["complexityAssessment"]
    if spec.get("reviewState"):
        spec_data["review_state.json"] = spec["reviewState"]
    if spec.get("qaReport"):
        spec_data["qa_report.md"] = spec["qaReport"]
    if spec.get("memory"):
        spec_data["memory.json"] = spec["memory"]

    return spec_data


def restore_spec_data_to_db(spec_id: str, spec_data: Dict[str, Any]) -> bool:
    """
    Restore spec data from git state to database.

    Args:
        spec_id: Spec ID to restore
        spec_data: Dictionary of filename -> content from git state

    Returns:
        True if restore successful
    """
    from .database import SpecService

    # Map filenames back to database fields
    db_data = {"id": spec_id, "taskId": spec_id}

    field_mapping = {
        "spec.md": "specMarkdown",
        "task.md": "taskMarkdown",
        "implementation_plan.json": "implementationPlan",
        "requirements.json": "requirements",
        "context.json": "context",
        "complexity_assessment.json": "complexityAssessment",
        "review_state.json": "reviewState",
        "qa_report.md": "qaReport",
        "memory.json": "memory",
    }

    for filename, field_name in field_mapping.items():
        if filename in spec_data:
            db_data[field_name] = spec_data[filename]

    try:
        SpecService.upsert(spec_id, db_data)
        return True
    except Exception as e:
        print(f"[GitState] Error restoring spec {spec_id} to DB: {e}")
        return False


# =============================================================================
# Project Data Helpers
# =============================================================================

def restore_project_data_to_db(project_id: str, project_data: Dict[str, Any]) -> bool:
    """
    Restore project data from git state to database.

    Args:
        project_id: Project ID
        project_data: Dictionary with claudeSettings, projectIndex, etc.

    Returns:
        True if restore successful
    """
    from .database import ProjectService

    try:
        updates = {}

        # Restore claude settings
        if project_data.get("claudeSettings"):
            project = ProjectService.get_by_id(project_id)
            if project:
                settings = project.get("settings", {})
                settings["claudeSettings"] = project_data["claudeSettings"]
                updates["settings"] = settings

        # Restore project index
        if project_data.get("projectIndex"):
            updates["projectIndex"] = project_data["projectIndex"]

        # Restore insights sessions
        if project_data.get("insightsSessions"):
            updates["insightsSessions"] = project_data["insightsSessions"]

        # Restore file timelines
        if project_data.get("fileTimelines"):
            updates["fileTimelines"] = project_data["fileTimelines"]

        if updates:
            ProjectService.update(project_id, updates)
            print(f"[GitState] Restored project data for {project_id}")
            return True

        return False
    except Exception as e:
        print(f"[GitState] Error restoring project data: {e}")
        return False


def save_claude_settings(project_id: str, settings: Dict[str, Any]) -> bool:
    """
    Save claude settings to the database.

    Args:
        project_id: Project ID
        settings: Claude settings dict (contents of .claude_settings.json)

    Returns:
        True if save successful
    """
    from .database import ProjectService

    try:
        project = ProjectService.get_by_id(project_id)
        if not project:
            return False

        current_settings = project.get("settings", {})
        current_settings["claudeSettings"] = settings
        ProjectService.update(project_id, {"settings": current_settings})
        return True
    except Exception as e:
        print(f"[GitState] Error saving claude settings: {e}")
        return False


def load_claude_settings(project_id: str) -> Optional[Dict[str, Any]]:
    """
    Load claude settings from the database.

    Args:
        project_id: Project ID

    Returns:
        Claude settings dict or None if not found
    """
    from .database import ProjectService

    try:
        project = ProjectService.get_by_id(project_id)
        if not project:
            return None

        settings = project.get("settings", {})
        return settings.get("claudeSettings")
    except Exception as e:
        print(f"[GitState] Error loading claude settings: {e}")
        return None


def migrate_claude_settings_file(project_path: str, project_id: str) -> bool:
    """
    Migrate .claude_settings.json from flat file to database.

    Args:
        project_path: Path to project directory
        project_id: Project ID in database

    Returns:
        True if migration successful
    """
    settings_file = Path(project_path) / ".claude_settings.json"
    if not settings_file.exists():
        return False

    try:
        settings = json.loads(settings_file.read_text())
        if save_claude_settings(project_id, settings):
            print(f"[GitState] Migrated claude settings for project {project_id}")
            return True
    except Exception as e:
        print(f"[GitState] Error migrating claude settings: {e}")

    return False


# Keep legacy functions for backwards compatibility during migration
def collect_spec_data(project_path: Path, spec_id: str) -> Dict[str, Any]:
    """
    DEPRECATED: Use collect_spec_data_from_db instead.
    Collect spec data files for export from flat files.
    """
    # First try database
    db_data = collect_spec_data_from_db(spec_id)
    if db_data:
        return db_data

    # Fall back to flat files
    spec_data = {}
    spec_dir = project_path / ".auto-claude" / "specs" / spec_id

    if not spec_dir.exists():
        spec_dir = project_path / ".worktrees" / spec_id / ".auto-claude" / "specs" / spec_id

    if not spec_dir.exists():
        return spec_data

    files_to_collect = [
        "spec.md",
        "requirements.json",
        "implementation_plan.json",
        "review_state.json",
        "complexity_assessment.json",
        "context.json"
    ]

    for filename in files_to_collect:
        filepath = spec_dir / filename
        if filepath.exists():
            try:
                content = filepath.read_text()
                if filename.endswith(".json"):
                    content = json.loads(content)
                spec_data[filename] = content
            except Exception as e:
                print(f"[GitState] Error reading {filepath}: {e}")

    return spec_data


def restore_spec_data(project_path: Path, spec_id: str, spec_data: Dict[str, Any]) -> bool:
    """
    Restore spec data - now writes to database instead of flat files.
    """
    # Write to database
    if restore_spec_data_to_db(spec_id, spec_data):
        print(f"[GitState] Restored spec {spec_id} to database")
        return True

    # Legacy: write to flat files as fallback
    spec_dir = project_path / ".auto-claude" / "specs" / spec_id
    spec_dir.mkdir(parents=True, exist_ok=True)

    try:
        for filename, content in spec_data.items():
            filepath = spec_dir / filename
            if isinstance(content, dict):
                filepath.write_text(json.dumps(content, indent=2))
            else:
                filepath.write_text(str(content))
        return True
    except Exception as e:
        print(f"[GitState] Error restoring spec {spec_id}: {e}")
        return False
