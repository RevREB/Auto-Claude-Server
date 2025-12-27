"""
FastAPI backend wrapper for Auto-Claude
Replaces Electron IPC with REST/WebSocket APIs
"""
from contextlib import asynccontextmanager
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional, List, Dict
import asyncio
import json
import subprocess
import os
from pathlib import Path
from datetime import datetime

# Import routers
from .oauth import router as oauth_router
from .pty_terminal import router as terminal_router
from .profiles import router as profiles_router
from .git import router as git_router
from .github_auth import router as github_router
from .websocket_handler import ws_manager, register_handlers
from .profiles import start_usage_collection, stop_usage_collection

# Token refresh background task
_token_refresh_task: asyncio.Task | None = None
TOKEN_REFRESH_INTERVAL_SECONDS = 30 * 60  # 30 minutes
from .database import (
    init_db, migrate_from_json, migrate_spec_files, migrate_all_project_specs,
    ProjectService, TaskService, SettingsService, TabStateService, SpecService,
    SubtaskService, ReleaseService
)
from .git_state import GitStateManager, collect_spec_data, restore_spec_data
import uuid
import traceback
import sys

# Add auto-claude to path FIRST - required for all core module imports
# The directory has a hyphen which Python can't import directly as a package
_AUTO_CLAUDE_DIR = Path(__file__).parent.parent / "auto-claude"
if str(_AUTO_CLAUDE_DIR) not in sys.path:
    sys.path.insert(0, str(_AUTO_CLAUDE_DIR))

# Import CloneManager for isolated task execution (clone-based, not worktrees)
try:
    from core.clone_manager import CloneManager, get_clone_manager
    print("[main.py] CloneManager imported successfully - using clone-based execution")
except ImportError as e:
    # Fallback if running outside container
    print(f"[main.py] CloneManager import failed: {e} - falling back to worktrees")
    CloneManager = None
    get_clone_manager = None


async def _token_refresh_loop():
    """Background task that periodically checks and refreshes OAuth tokens."""
    from core.auth import check_and_refresh_token_proactively

    print(f"[TokenRefresh] Background task started (interval: {TOKEN_REFRESH_INTERVAL_SECONDS}s)")

    # Run initial check on startup
    await asyncio.sleep(5)  # Wait a bit for app to fully start
    try:
        result = check_and_refresh_token_proactively()
        print(f"[TokenRefresh] Initial check: {result}")
    except Exception as e:
        print(f"[TokenRefresh] Initial check error: {e}")

    while True:
        try:
            await asyncio.sleep(TOKEN_REFRESH_INTERVAL_SECONDS)
            result = check_and_refresh_token_proactively()
            print(f"[TokenRefresh] Periodic check: {result}")
        except asyncio.CancelledError:
            print("[TokenRefresh] Background task cancelled")
            break
        except Exception as e:
            print(f"[TokenRefresh] Error in refresh loop: {e}")


async def start_token_refresh_task():
    """Start the background token refresh task."""
    global _token_refresh_task
    if _token_refresh_task is None:
        _token_refresh_task = asyncio.create_task(_token_refresh_loop())
        print("[TokenRefresh] Task started")


async def stop_token_refresh_task():
    """Stop the background token refresh task."""
    global _token_refresh_task
    if _token_refresh_task is not None:
        _token_refresh_task.cancel()
        try:
            await _token_refresh_task
        except asyncio.CancelledError:
            pass
        _token_refresh_task = None
        print("[TokenRefresh] Task stopped")


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Lifespan context manager for startup/shutdown events."""
    # Startup
    print("[App] Initializing database...")
    init_db()
    migrate_from_json()  # Migrate any existing JSON data
    _load_projects_from_db()
    _load_tasks_from_db()
    _sync_tasks_from_disk()  # Discover tasks from spec directories not in DB
    _recover_orphaned_tasks()
    print("[App] Starting background tasks...")
    await start_usage_collection()
    await start_token_refresh_task()
    yield
    # Shutdown
    print("[App] Stopping background tasks...")
    await stop_token_refresh_task()
    await stop_usage_collection()


app = FastAPI(title="Auto-Claude API", lifespan=lifespan)

# Include routers
app.include_router(oauth_router)
app.include_router(terminal_router)
app.include_router(profiles_router)
app.include_router(git_router)
app.include_router(github_router)

# CORS for frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Configure for production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ============================================================================
# Models
# ============================================================================

class Project(BaseModel):
    id: str
    name: str
    path: str
    autoBuildPath: str = ""  # Path to .auto-claude directory, empty if not initialized
    settings: dict = {}  # Project settings
    created_at: datetime
    updated_at: Optional[datetime] = None
    
class Task(BaseModel):
    spec_id: str
    title: str
    description: str
    status: str  # backlog, planning, in_progress, ai_review, human_review, done
    project_id: str

class TaskCreateRequest(BaseModel):
    projectId: str
    title: str
    description: str

def task_to_frontend(task: Task) -> dict:
    """Convert backend Task to frontend format"""
    return {
        "id": task.spec_id,
        "specId": task.spec_id,
        "projectId": task.project_id,
        "title": task.title,
        "description": task.description,
        "status": task.status,
        "subtasks": [],
        "logs": [],
        "createdAt": datetime.now().isoformat(),
        "updatedAt": datetime.now().isoformat()
    }

class BuildRequest(BaseModel):
    spec_id: str
    project_path: str
    auto_merge: bool = False

class ProjectCreateFolderRequest(BaseModel):
    location: str
    name: str
    initGit: bool = False

class ProjectSettingsUpdate(BaseModel):
    settings: dict


class TaskStore:
    """
    Database-backed task store that provides dict-like access.

    Eliminates in-memory caching issues by always reading from/writing to SQLite.
    Provides the same interface as a dict for minimal code changes.
    """

    def __getitem__(self, task_id: str) -> Task:
        """Get task by ID - reads from database."""
        task_data = TaskService.get_by_id(task_id)
        if task_data is None:
            raise KeyError(f"Task {task_id} not found")
        return self._dict_to_task(task_data)

    def __setitem__(self, task_id: str, task: Task):
        """Set/update task - writes to database."""
        existing = TaskService.get_by_id(task_id)
        if existing:
            TaskService.update(task_id, {
                "title": task.title,
                "description": task.description,
                "status": task.status,
                "projectId": task.project_id,
            })
        else:
            TaskService.create({
                "id": task_id,
                "specId": task.spec_id,
                "projectId": task.project_id,
                "title": task.title,
                "description": task.description,
                "status": task.status,
            })

    def __delitem__(self, task_id: str):
        """Delete task from database."""
        TaskService.delete(task_id)

    def __contains__(self, task_id: str) -> bool:
        """Check if task exists in database."""
        return TaskService.get_by_id(task_id) is not None

    def get(self, task_id: str, default=None) -> Optional[Task]:
        """Get task or return default."""
        try:
            return self[task_id]
        except KeyError:
            return default

    def keys(self):
        """Get all task IDs."""
        return [t["id"] for t in TaskService.get_all(include_archived=True)]

    def values(self):
        """Get all tasks."""
        return [self._dict_to_task(t) for t in TaskService.get_all(include_archived=False)]

    def items(self):
        """Get all (task_id, task) pairs."""
        return [(t["id"], self._dict_to_task(t)) for t in TaskService.get_all(include_archived=False)]

    def __len__(self):
        """Count tasks."""
        return len(TaskService.get_all(include_archived=False))

    def __iter__(self):
        """Iterate over task IDs."""
        return iter(self.keys())

    def _dict_to_task(self, task_data: dict) -> Task:
        """Convert database dict to Task object."""
        return Task(
            spec_id=task_data["specId"],
            title=task_data["title"],
            description=task_data.get("description", ""),
            status=task_data["status"],
            project_id=task_data["projectId"]
        )

    def update_status(self, task_id: str, status: str) -> Optional[Task]:
        """Update just the status of a task. Returns updated task or None if not found."""
        task_data = TaskService.get_by_id(task_id)
        if task_data is None:
            return None
        TaskService.update(task_id, {"status": status})
        task_data["status"] = status
        return self._dict_to_task(task_data)

class ProjectCreateRequest(BaseModel):
    path: str
    settings: Optional[dict] = None

class TabState(BaseModel):
    openProjectIds: List[str]
    activeProjectId: Optional[str]
    tabOrder: List[str]

# ============================================================================
# Persistence Functions
# ============================================================================

PROJECTS_FILE = Path("/root/.claude/projects.json")
SETTINGS_FILE = Path("/root/.claude/app-settings.json")
TASKS_FILE = Path("/root/.claude/tasks.json")
TAB_STATE_FILE = Path("/root/.claude/tab-state.json")

# Default app settings
DEFAULT_APP_SETTINGS = {
    "theme": "system",
    "colorTheme": "default",
    "defaultModel": "opus",
    "agentFramework": "auto-claude",
    "autoBuildPath": "/app/auto-claude",  # Path to Auto Claude source files in Docker
    "autoUpdateAutoBuild": True,
    "autoNameTerminals": True,
    "onboardingCompleted": False,
    "notifications": {
        "onTaskComplete": True,
        "onTaskFailed": True,
        "onReviewNeeded": True,
        "sound": False
    },
    "selectedAgentProfile": "auto",
    "changelogFormat": "keep-a-changelog",
    "changelogAudience": "user-facing",
    "changelogEmojiLevel": "none"
}

def _load_settings() -> dict:
    """Load app settings from database"""
    try:
        stored = SettingsService.get_all()
        if stored:
            # Merge with defaults to ensure all fields exist
            return {**DEFAULT_APP_SETTINGS, **stored}
    except Exception as e:
        print(f"[Settings] Error loading settings: {e}")
    return DEFAULT_APP_SETTINGS.copy()

def _save_settings(settings: dict):
    """Save app settings to database"""
    try:
        SettingsService.set_many(settings)
        print(f"[Settings] Saved settings to database")
    except Exception as e:
        print(f"[Settings] Error saving settings: {e}")

def _save_tasks(export_state: bool = False, project_id: str = None):
    """Export task state to git if requested.

    Note: Task data is now automatically persisted to SQLite via TaskStore.
    This function only handles git state export.

    Args:
        export_state: If True, export state to git branch
        project_id: If provided with export_state, only export this project
    """
    # Task data is already in database via TaskStore - no batch save needed
    # Just handle git export if requested
    if export_state:
        try:
            if project_id:
                _export_project_state(project_id)
            else:
                # Export all projects
                for pid in projects:
                    _export_project_state(pid)
        except Exception as e:
            print(f"[Tasks] Error exporting state: {e}")

def _save_task(task: Task):
    """Save a single task to database"""
    try:
        existing = TaskService.get_by_id(task.spec_id)
        if existing:
            TaskService.update(task.spec_id, {
                "title": task.title,
                "description": task.description,
                "status": task.status,
            })
        else:
            TaskService.create({
                "id": task.spec_id,
                "specId": task.spec_id,
                "projectId": task.project_id,
                "title": task.title,
                "description": task.description,
                "status": task.status,
            })
    except Exception as e:
        print(f"[Tasks] Error saving task {task.spec_id}: {e}")


# ============================================================================
# Git State Management
# ============================================================================

# Debounce state exports to avoid too many git commits
_pending_state_exports: Dict[str, float] = {}
_STATE_EXPORT_DEBOUNCE_SECONDS = 5.0

def _export_project_state(project_id: str, force: bool = False):
    """
    Export project state to git state branch.

    Args:
        project_id: Project to export state for
        force: If True, skip debounce check
    """
    import time

    if project_id not in projects:
        print(f"[GitState] Project {project_id} not found")
        return

    # Debounce check
    now = time.time()
    last_export = _pending_state_exports.get(project_id, 0)
    if not force and (now - last_export) < _STATE_EXPORT_DEBOUNCE_SECONDS:
        print(f"[GitState] Debouncing export for {project_id}")
        return

    _pending_state_exports[project_id] = now

    try:
        project = projects[project_id]
        project_path = Path(project.path)

        # Initialize state manager
        state_mgr = GitStateManager(str(project_path))

        # Collect tasks for this project
        project_tasks = []
        for tid, task in tasks.items():
            if task.project_id == project_id:
                project_tasks.append({
                    "id": tid,
                    "specId": task.spec_id,
                    "title": task.title,
                    "description": task.description,
                    "status": task.status,
                    "projectId": project_id
                })

        # Collect spec data for each task
        specs = {}
        for task_data in project_tasks:
            spec_id = task_data["specId"]
            spec_data = collect_spec_data(project_path, spec_id)
            if spec_data:
                specs[spec_id] = spec_data

        # Export to git
        success = state_mgr.export_state(project_tasks, specs)
        if success:
            print(f"[GitState] Exported state for project {project_id}")
        else:
            print(f"[GitState] Failed to export state for project {project_id}")

    except Exception as e:
        print(f"[GitState] Error exporting state for {project_id}: {e}")
        import traceback
        traceback.print_exc()


def _import_project_state(project_id: str) -> bool:
    """
    Import project state from git state branch into database.

    Args:
        project_id: Project to import state for

    Returns:
        True if state was imported
    """
    if project_id not in projects:
        print(f"[GitState] Project {project_id} not found")
        return False

    try:
        project = projects[project_id]
        project_path = Path(project.path)

        # Initialize state manager
        state_mgr = GitStateManager(str(project_path))

        # Import state from git
        state = state_mgr.import_state()
        if not state:
            print(f"[GitState] No state to import for {project_id}")
            return False

        imported_tasks = state.get("tasks", [])
        imported_specs = state.get("specs", {})

        # Import tasks into database
        for task_data in imported_tasks:
            task_id = task_data.get("id", task_data.get("specId"))
            spec_id = task_data.get("specId", task_id)

            # Check if task already exists
            existing = TaskService.get_by_id(task_id)
            if existing:
                # Update existing task
                TaskService.update(task_id, {
                    "title": task_data.get("title", ""),
                    "description": task_data.get("description", ""),
                    "status": task_data.get("status", "backlog"),
                })
            else:
                # Create new task
                TaskService.create({
                    "id": task_id,
                    "specId": spec_id,
                    "projectId": project_id,
                    "title": task_data.get("title", ""),
                    "description": task_data.get("description", ""),
                    "status": task_data.get("status", "backlog"),
                })

            # Add to in-memory cache
            tasks[task_id] = Task(
                spec_id=spec_id,
                title=task_data.get("title", ""),
                description=task_data.get("description", ""),
                status=task_data.get("status", "backlog"),
                project_id=project_id
            )

        # Restore spec files
        for spec_id, spec_data in imported_specs.items():
            restore_spec_data(project_path, spec_id, spec_data)

        print(f"[GitState] Imported {len(imported_tasks)} tasks for {project_id}")
        return True

    except Exception as e:
        print(f"[GitState] Error importing state for {project_id}: {e}")
        import traceback
        traceback.print_exc()
        return False


def schedule_state_export(project_id: str):
    """Schedule a debounced state export for a project."""
    import asyncio

    async def delayed_export():
        await asyncio.sleep(_STATE_EXPORT_DEBOUNCE_SECONDS)
        _export_project_state(project_id, force=True)

    asyncio.create_task(delayed_export())


async def _broadcast_task_event(action: str, task: Task, extra_data: dict = None):
    """Broadcast task event via WebSocket to all connected clients."""
    try:
        from .websocket_handler import ws_manager
        if ws_manager:
            task_data = {
                "id": task.spec_id,
                "specId": task.spec_id,
                "projectId": task.project_id,
                "status": task.status,
                "title": task.title,
                "description": task.description
            }
            if extra_data:
                task_data.update(extra_data)

            # Include subtasks for tasks in ai_review, human_review or done status
            # This prevents the "incomplete" flag in the UI
            if task.status in ("ai_review", "human_review", "done"):
                subtasks = []
                if task.project_id in projects:
                    project_path = projects[task.project_id].path
                    subtasks = _get_subtasks_from_plan(project_path, task.spec_id)

                # If no subtasks found but task is complete, add a placeholder
                # This happens when clone directories are cleaned up
                if not subtasks:
                    subtasks = [{
                        "id": "task-complete",
                        "title": "Task completed",
                        "description": task.title,
                        "status": "completed",
                        "files": []
                    }]

                # Mark all subtasks as completed for finished tasks
                for st in subtasks:
                    st["status"] = "completed"

                task_data["subtasks"] = subtasks
                print(f"[Broadcast] Including {len(subtasks)} subtasks for {task.spec_id}")

            await ws_manager.broadcast_event(
                f"project.{task.project_id}.tasks",
                {"action": action, "task": task_data}
            )
            print(f"[Broadcast] Task {action}: {task.spec_id}")
    except Exception as e:
        print(f"[Broadcast] Error: {e}")

def _broadcast_task_event_sync(action: str, task: Task, extra_data: dict = None):
    """Synchronous wrapper for broadcasting - creates task in event loop."""
    import asyncio
    try:
        loop = asyncio.get_event_loop()
        if loop.is_running():
            asyncio.create_task(_broadcast_task_event(action, task, extra_data))
        else:
            loop.run_until_complete(_broadcast_task_event(action, task, extra_data))
    except Exception as e:
        print(f"[Broadcast] Sync wrapper error: {e}")

def _load_tasks_from_db():
    """No-op: TaskStore now reads directly from database on each access.

    This function is kept for API compatibility but does nothing.
    Tasks are accessed via the global `tasks` TaskStore instance which
    queries SQLite directly, eliminating caching/sync issues.
    """
    # TaskStore reads from database on demand - no preloading needed
    task_count = len(tasks)  # This queries the database
    print(f"[Tasks] TaskStore ready - {task_count} tasks in database")
    return True


def _sync_tasks_from_disk():
    """
    Discover tasks from project spec directories and sync to database.

    This ensures tasks created via CLI or other means are properly tracked.
    Scans each project's .auto-claude/specs/ directory for task specs.
    """
    global tasks
    synced_count = 0

    for project_id, project in projects.items():
        project_path = Path(project.path)
        specs_dir = project_path / ".auto-claude" / "specs"

        if not specs_dir.exists():
            continue

        # Scan all spec directories
        for spec_dir in specs_dir.iterdir():
            if not spec_dir.is_dir():
                continue

            spec_id = spec_dir.name

            # Use composite key to allow same spec_id across different projects
            task_key = f"{project_id}:{spec_id}"

            # Skip if already in database/memory for THIS project
            # Check both composite key (new format) AND legacy spec_id (old format)
            if task_key in tasks:
                continue

            # Also check for legacy entries where id == spec_id
            legacy_task = next(
                (t for t in tasks.values()
                 if t.spec_id == spec_id and t.project_id == project_id),
                None
            )
            if legacy_task:
                continue

            # Try to load task info from spec files
            task_data = _load_task_from_spec_dir(spec_dir, project_id)
            if task_data:
                # Add to database with composite key as id
                try:
                    TaskService.create({
                        "id": task_key,
                        "specId": spec_id,
                        "title": task_data["title"],
                        "description": task_data["description"],
                        "status": task_data["status"],
                        "projectId": project_id,
                    })

                    # Add to in-memory cache with composite key
                    tasks[task_key] = Task(
                        spec_id=spec_id,
                        title=task_data["title"],
                        description=task_data["description"],
                        status=task_data["status"],
                        project_id=project_id
                    )
                    synced_count += 1
                    print(f"[Tasks] Synced from disk: {spec_id[:8]}... ({task_data['status']}) - {task_data['title'][:40]}")
                except Exception as e:
                    print(f"[Tasks] Error syncing task {spec_id}: {e}")

    if synced_count > 0:
        print(f"[Tasks] Synced {synced_count} tasks from disk to database")
    return synced_count


def _load_task_from_spec_dir(spec_dir: Path, project_id: str) -> dict | None:
    """
    Load task information from a spec directory.

    Reads spec.md for title, requirements.json for description,
    and task_logs.json/review_state.json for status.
    """
    spec_id = spec_dir.name

    # Default values
    title = f"Task {spec_id[:8]}"
    description = ""
    status = "backlog"

    # Try to get title from spec.md
    spec_file = spec_dir / "spec.md"
    if spec_file.exists():
        try:
            content = spec_file.read_text()
            # Look for "# Specification: <title>" pattern
            for line in content.split('\n'):
                if line.startswith('# Specification:'):
                    title = line.replace('# Specification:', '').strip()
                    break
                elif line.startswith('# '):
                    title = line.replace('# ', '').strip()
                    break
        except Exception:
            pass

    # Try to get description from requirements.json
    req_file = spec_dir / "requirements.json"
    if req_file.exists():
        try:
            with open(req_file) as f:
                req_data = json.load(f)
                description = req_data.get("task_description", "")
        except Exception:
            pass

    # Determine status from task_logs.json and review_state.json
    logs_file = spec_dir / "task_logs.json"
    review_file = spec_dir / "review_state.json"

    if logs_file.exists():
        try:
            with open(logs_file) as f:
                logs = json.load(f)
            phases = logs.get("phases", {})

            # Check implementation phase first
            impl_phase = phases.get("implementation", {}) or phases.get("coding", {})
            if impl_phase.get("status") == "completed":
                status = "done"
            elif impl_phase.get("status") == "in_progress":
                status = "in_progress"
            elif phases.get("planning", {}).get("status") == "completed":
                # Planning done - check if approved
                if review_file.exists():
                    try:
                        with open(review_file) as f:
                            review = json.load(f)
                        if review.get("approved"):
                            status = "in_progress"  # Ready to implement
                        else:
                            status = "human_review"
                    except Exception:
                        status = "human_review"
                else:
                    status = "human_review"
            elif phases.get("planning", {}).get("status") == "in_progress":
                status = "in_progress"
        except Exception as e:
            print(f"[Tasks] Error reading logs for {spec_id}: {e}")

    return {
        "title": title,
        "description": description,
        "status": status
    }

def _save_tab_state():
    """Save tab state to database"""
    global tab_state
    try:
        if tab_state:
            data = {
                "openProjectIds": tab_state.openProjectIds,
                "activeProjectId": tab_state.activeProjectId,
                "tabOrder": tab_state.tabOrder
            }
        else:
            data = {"openProjectIds": [], "activeProjectId": None, "tabOrder": []}
        TabStateService.save(data)
        print(f"[TabState] Saved tab state to database")
    except Exception as e:
        print(f"[TabState] Error saving tab state: {e}")

def _load_tab_state():
    """Load tab state from database"""
    global tab_state
    try:
        data = TabStateService.get()
        tab_state = TabState(
            openProjectIds=data.get("openProjectIds", []),
            activeProjectId=data.get("activeProjectId"),
            tabOrder=data.get("tabOrder", [])
        )
        print(f"[TabState] Loaded tab state from database")
        return True
    except Exception as e:
        print(f"[TabState] Error loading tab state: {e}")
    return False

def _save_projects():
    """Save all projects to database (batch update from in-memory cache)"""
    try:
        for pid, project in projects.items():
            # Check if project exists in database
            existing = ProjectService.get_by_id(pid)
            project_data = {
                "id": pid,
                "name": project.name,
                "path": project.path,
                "autoBuildPath": project.autoBuildPath,
                "settings": project.settings,
            }
            if existing:
                ProjectService.update(pid, project_data)
            else:
                ProjectService.create(project_data)
        print(f"[Projects] Saved {len(projects)} projects to database")
    except Exception as e:
        print(f"[Projects] Error saving projects: {e}")

def _save_project(project: Project):
    """Save a single project to database"""
    try:
        existing = ProjectService.get_by_id(project.id)
        if existing:
            ProjectService.update(project.id, {
                "name": project.name,
                "path": project.path,
                "autoBuildPath": project.autoBuildPath,
                "settings": project.settings,
            })
        else:
            ProjectService.create({
                "id": project.id,
                "name": project.name,
                "path": project.path,
                "autoBuildPath": project.autoBuildPath,
                "settings": project.settings,
            })
    except Exception as e:
        print(f"[Projects] Error saving project {project.id}: {e}")

def _load_projects_from_db():
    """Load projects from database into in-memory cache"""
    global projects
    try:
        db_projects = ProjectService.get_all()
        projects = {
            p["id"]: Project(
                id=p["id"],
                name=p["name"],
                path=p["path"],
                autoBuildPath=p.get("autoBuildPath", ""),
                settings=p.get("settings", {}),
                created_at=datetime.fromisoformat(p["createdAt"]) if p.get("createdAt") else datetime.now(),
                updated_at=datetime.fromisoformat(p["updatedAt"]) if p.get("updatedAt") else None
            )
            for p in db_projects
        }
        print(f"[Projects] Loaded {len(projects)} projects from database")
        return True
    except Exception as e:
        print(f"[Projects] Error loading projects from database: {e}")
    return False

# ============================================================================
# In-memory storage (loaded from database in lifespan)
# ============================================================================

projects: Dict[str, Project] = {}
tasks = TaskStore()  # Database-backed task store - no more caching issues
active_builds: Dict[str, subprocess.Popen] = {}
tab_state: Optional[TabState] = None

# Note: Data is now loaded in lifespan() via _load_projects_from_db() and _load_tasks_from_db()

def _recover_orphaned_tasks():
    """Reset tasks that are stuck in 'in_progress' on startup.

    Since active_builds is empty at startup, any task showing 'in_progress'
    is orphaned (process was killed) and should be reset to backlog.
    """
    recovered_count = 0
    for task_id, task in tasks.items():
        if task.status == "in_progress":
            print(f"[Tasks] Recovering orphaned task: {task.title} ({task_id[:8]}...)")
            task.status = "backlog"
            # Save directly to database via TaskStore
            tasks[task_id] = task
            recovered_count += 1

    if recovered_count > 0:
        print(f"[Tasks] Recovered {recovered_count} orphaned task(s)")

# Note: _recover_orphaned_tasks() is called in lifespan() after database init

# ============================================================================
# WebSocket Connection Manager
# ============================================================================

class ConnectionManager:
    def __init__(self):
        self.active_connections: Dict[str, WebSocket] = {}

    async def connect(self, websocket: WebSocket, client_id: str):
        await websocket.accept()
        self.active_connections[client_id] = websocket

    def disconnect(self, client_id: str):
        if client_id in self.active_connections:
            del self.active_connections[client_id]

    async def send_message(self, message: dict, client_id: str):
        if client_id in self.active_connections:
            await self.active_connections[client_id].send_json(message)

manager = ConnectionManager()

# ============================================================================
# API Endpoints
# ============================================================================

@app.get("/")
async def root():
    return {"message": "Auto-Claude API", "version": "1.0.0"}

@app.get("/health")
async def health():
    return {"status": "healthy"}

# ============================================================================
# Unified WebSocket Endpoint
# ============================================================================

# Flag to track if handlers are registered
_handlers_registered = False

@app.websocket("/ws/app")
async def websocket_app_endpoint(websocket: WebSocket):
    """
    Unified WebSocket endpoint for all frontend-backend communication.

    Protocol:
    - Request:  {"id": "uuid", "type": "command", "action": "namespace.method", "payload": {...}}
    - Response: {"id": "uuid", "type": "response", "success": true/false, "data": {...}, "error": "..."}
    - Event:    {"type": "event", "event": "namespace.eventName", "data": {...}}
    """
    global _handlers_registered
    if not _handlers_registered:
        register_handlers({})
        _handlers_registered = True

    connection_id = str(uuid.uuid4())
    await ws_manager.connect(websocket, connection_id)

    try:
        while True:
            data = await websocket.receive_text()
            try:
                message = json.loads(data)
                await ws_manager.handle_message(websocket, connection_id, message)
            except json.JSONDecodeError:
                await ws_manager.send_response(websocket, "error", False, error="Invalid JSON")
    except WebSocketDisconnect:
        ws_manager.disconnect(connection_id)
    except Exception as e:
        print(f"[WS] Connection error: {e}")
        traceback.print_exc()
        ws_manager.disconnect(connection_id)

# ============================================================================
# App Settings
# ============================================================================

@app.get("/api/settings")
async def get_settings():
    """Get app settings"""
    settings = _load_settings()
    return settings

@app.patch("/api/settings")
async def update_settings(updates: dict):
    """Update app settings"""
    current = _load_settings()
    # Merge updates into current settings
    merged = {**current, **updates}
    _save_settings(merged)
    return {"success": True}

# Projects
@app.get("/api/projects")
async def list_projects():
    return list(projects.values())

@app.post("/api/projects")
async def create_project(request: ProjectCreateRequest):
    """Create a new project from a path"""
    from pathlib import Path

    # Determine if this is a relative path or absolute path
    project_path = Path(request.path)

    # If it's just a name (relative path), prepend /projects
    if not project_path.is_absolute():
        project_path = Path("/projects") / request.path

    project_name = project_path.name
    project_id = project_name  # Use name as ID for frontend compatibility

    # Create the directory if it doesn't exist
    try:
        project_path.mkdir(parents=True, exist_ok=True)
        print(f"[Projects] Created directory: {project_path}")
    except Exception as e:
        print(f"[Projects] Failed to create directory: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to create project directory: {str(e)}")

    # Check if .auto-claude directory exists
    auto_claude_dir = project_path / ".auto-claude"
    auto_build_path = str(auto_claude_dir) if auto_claude_dir.exists() else ""

    # Create the Project object with the full absolute path
    project = Project(
        id=project_id,
        name=project_name,
        path=str(project_path),  # Store absolute path
        autoBuildPath=auto_build_path,
        settings={},
        created_at=datetime.now(),
        updated_at=datetime.now()
    )

    projects[project_id] = project
    print(f"[Projects] Created project '{project_id}' at {project_path}")

    _save_projects()

    return project

@app.get("/api/projects/default-location")
async def get_default_project_location():
    """Get the default project location for creating new projects"""
    return {
        "location": "/projects"
    }

@app.get("/api/projects/tab-state")
async def get_tab_state():
    """Get the saved tab state"""
    if tab_state is None:
        return {
            "success": True,
            "data": {
                "openProjectIds": [],
                "activeProjectId": None,
                "tabOrder": []
            }
        }

    return {
        "success": True,
        "data": tab_state.dict()
    }

@app.post("/api/projects/tab-state")
async def save_tab_state_endpoint(state: TabState):
    """Save the current tab state"""
    global tab_state
    tab_state = state
    _save_tab_state()

    return {"success": True}

@app.get("/api/projects/{project_id}")
async def get_project(project_id: str):
    if project_id not in projects:
        raise HTTPException(status_code=404, detail="Project not found")
    return projects[project_id]

@app.delete("/api/projects/{project_id}")
async def delete_project(project_id: str):
    """Delete a project and its files from disk"""
    import shutil

    if project_id not in projects:
        raise HTTPException(status_code=404, detail="Project not found")

    project = projects[project_id]
    project_path = Path(project.path)

    # Remove from tracking first
    del projects[project_id]
    _save_projects()

    # Delete project files from disk
    deleted_files = False
    if project_path.exists():
        try:
            shutil.rmtree(project_path)
            deleted_files = True
            print(f"[Projects] Deleted project files: {project_path}")
        except Exception as e:
            print(f"[Projects] Warning: Failed to delete project files at {project_path}: {e}")

    # Also clean up any tasks associated with this project
    global tasks
    tasks_to_remove = [tid for tid, task in tasks.items() if task.project_id == project_id]
    for tid in tasks_to_remove:
        del tasks[tid]
        try:
            TaskService.delete(tid)
        except Exception:
            pass
    if tasks_to_remove:
        print(f"[Projects] Removed {len(tasks_to_remove)} tasks for deleted project")

    return {"success": True, "deletedFiles": deleted_files}

@app.post("/api/projects/create-folder")
async def create_project_folder(request: ProjectCreateFolderRequest):
    """
    Create a new project folder.

    Args:
        request: Location, name, and whether to init git

    Returns:
        Path to the created project
    """
    project_path = Path(request.location) / request.name

    try:
        # Create the directory
        project_path.mkdir(parents=True, exist_ok=True)

        # Initialize git if requested
        if request.initGit:
            subprocess.run(
                ["git", "init"],
                cwd=str(project_path),
                check=True,
                capture_output=True
            )

        return {
            "success": True,
            "data": {
                "path": str(project_path),
                "name": request.name
            }
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to create project folder: {str(e)}")

@app.get("/api/projects/{project_id}/directory")
async def list_project_directory(project_id: str, path: Optional[str] = None):
    """
    List contents of a project directory.

    Args:
        project_id: ID of the project
        path: Optional subdirectory path (relative to project root)

    Returns:
        List of files and directories
    """
    if project_id not in projects:
        raise HTTPException(status_code=404, detail="Project not found")

    project = projects[project_id]
    base_path = Path(project.path)

    # If path is provided, navigate to that subdirectory
    if path:
        target_path = base_path / path
    else:
        target_path = base_path

    if not target_path.exists():
        raise HTTPException(status_code=404, detail="Directory not found")

    if not target_path.is_dir():
        raise HTTPException(status_code=400, detail="Path is not a directory")

    try:
        entries = []
        for item in target_path.iterdir():
            # Skip hidden files (starting with .)
            if item.name.startswith('.'):
                continue

            entry = {
                "name": item.name,
                "path": str(item.relative_to(base_path)),
                "type": "directory" if item.is_dir() else "file",
            }

            if item.is_file():
                entry["size"] = item.stat().st_size

            entries.append(entry)

        # Sort: directories first, then files, alphabetically
        entries.sort(key=lambda x: (x["type"] != "directory", x["name"].lower()))

        return {
            "success": True,
            "data": entries
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to list directory: {str(e)}")

@app.patch("/api/projects/{project_id}/settings")
async def update_project_settings(project_id: str, updates: dict):
    """
    Update project settings.

    Args:
        project_id: ID of the project
        updates: Settings to update

    Returns:
        Success status
    """
    if project_id not in projects:
        raise HTTPException(status_code=404, detail="Project not found")

    # For now, we just accept and ignore settings
    # In production, this would update project configuration
    return {"success": True}

@app.post("/api/projects/{project_id}/initialize")
async def initialize_project(project_id: str):
    """
    Initialize auto-claude for a project.

    This creates the .auto-claude directory, initializes the git state branch,
    and sets up default claude settings in the database.

    Args:
        project_id: ID of the project

    Returns:
        Success status with verification
    """
    print(f"[Init] Starting initialization for project: {project_id}")

    if project_id not in projects:
        print(f"[Init] ERROR: Project not found: {project_id}")
        return {"success": False, "error": f"Project not found: {project_id}"}

    project = projects[project_id]
    project_path = Path(project.path)

    # Verify project path exists
    if not project_path.exists():
        print(f"[Init] ERROR: Project path does not exist: {project_path}")
        return {"success": False, "error": f"Project path does not exist: {project_path}"}

    auto_claude_dir = project_path / ".auto-claude"

    try:
        # Create .auto-claude directory (minimal - all data is in database)
        print(f"[Init] Creating directory: {auto_claude_dir}")
        auto_claude_dir.mkdir(exist_ok=True)

        # Verify directory was created
        if not auto_claude_dir.exists():
            print(f"[Init] ERROR: Failed to create .auto-claude directory")
            return {"success": False, "error": "Failed to create .auto-claude directory"}

        # Initialize git state branch (creates AUTO-CLAUDE-STATE.md and hidden ref)
        state_mgr = GitStateManager(str(project_path))
        state_initialized = state_mgr.init_state_ref()
        print(f"[Init] Git state branch initialized: {state_initialized}")

        # Set up default claude settings in database
        default_claude_settings = {
            "sandbox": {
                "enabled": True,
                "autoAllowBashIfSandboxed": True
            },
            "permissions": {
                "defaultMode": "acceptEdits",
                "allow": [
                    "Read(./**)",
                    "Write(./**)",
                    "Edit(./**)",
                    "Glob(./**)",
                    "Grep(./**)",
                    "Bash(*)"
                ]
            }
        }

        # Update project settings in database and in-memory
        current_settings = project.settings or {}
        current_settings["claudeSettings"] = default_claude_settings
        ProjectService.update(project_id, {"settings": current_settings})
        project.settings = current_settings  # Update in-memory too
        print(f"[Init] Default claude settings saved to database")

        # Update project autoBuildPath
        project.autoBuildPath = str(auto_claude_dir)
        project.updated_at = datetime.now()

        _save_projects()

        print(f"[Init] SUCCESS: Project initialized at {auto_claude_dir}")
        return {
            "success": True,
            "data": {
                "message": "Project initialized successfully",
                "path": str(auto_claude_dir),
                "stateRefInitialized": state_initialized
            }
        }
    except PermissionError as e:
        print(f"[Init] ERROR: Permission denied: {e}")
        return {"success": False, "error": f"Permission denied: {e}"}
    except OSError as e:
        print(f"[Init] ERROR: OS error: {e}")
        return {"success": False, "error": f"Failed to create directories: {e}"}
    except Exception as e:
        print(f"[Init] ERROR: Unexpected error: {e}")
        return {"success": False, "error": f"Failed to initialize project: {str(e)}"}

@app.post("/api/projects/{project_id}/update-auto-build")
async def update_project_auto_build(project_id: str):
    """
    Update the auto-build configuration for a project.

    This would typically pull the latest auto-claude code.
    For now, returns mock success.

    Args:
        project_id: ID of the project

    Returns:
        Success status
    """
    if project_id not in projects:
        raise HTTPException(status_code=404, detail="Project not found")

    return {
        "success": True,
        "data": {
            "message": "Auto-build configuration updated",
            "version": "0.1.0"
        }
    }

@app.get("/api/projects/{project_id}/version")
async def check_project_version(project_id: str):
    """
    Check the auto-claude version for a project.

    Returns the current version and whether an update is available.

    Args:
        project_id: ID of the project

    Returns:
        Version information
    """
    if project_id not in projects:
        raise HTTPException(status_code=404, detail="Project not found")

    return {
        "success": True,
        "data": {
            "currentVersion": "0.1.0",
            "latestVersion": "0.1.0",
            "updateAvailable": False
        }
    }

# Tasks

def _get_subtasks_from_plan(project_path: str, spec_id: str) -> list:
    """Read subtasks from implementation_plan.json"""
    subtasks = []
    try:
        # Build list of paths to check - clone paths first, then project paths
        plan_paths = []

        # Check clone paths first (for clone-based execution)
        clone_base = Path("/tmp/auto-claude")
        if clone_base.exists():
            for clone_dir in clone_base.iterdir():
                if clone_dir.is_dir() and clone_dir.name.startswith(spec_id):
                    # Direct clone path
                    plan_paths.append(clone_dir / ".auto-claude" / "specs" / spec_id / "implementation_plan.json")
                    # Nested worktree in clone
                    plan_paths.append(clone_dir / ".worktrees" / spec_id / ".auto-claude" / "specs" / spec_id / "implementation_plan.json")

        # Fall back to project paths
        plan_paths.extend([
            Path(project_path) / ".worktrees" / spec_id / ".auto-claude" / "specs" / spec_id / "implementation_plan.json",
            Path(project_path) / ".auto-claude" / "specs" / spec_id / "implementation_plan.json",
        ])

        plan_data = None
        for plan_path in plan_paths:
            if plan_path.exists():
                with open(plan_path) as f:
                    plan_data = json.load(f)
                break

        if not plan_data:
            return []

        # Extract subtasks from phases
        for phase in plan_data.get("phases", []):
            for subtask in phase.get("subtasks", []):
                subtasks.append({
                    "id": subtask.get("id", ""),
                    "title": subtask.get("description", ""),
                    "description": subtask.get("description", ""),
                    "status": subtask.get("status", "pending"),
                    "files": subtask.get("files_to_create", []) + subtask.get("files_to_modify", []),
                    "verification": subtask.get("verification", {})
                })
    except Exception as e:
        print(f"[Subtasks] Error reading plan for {spec_id}: {e}")

    return subtasks

def _sync_task_status_from_worktree(task: Task, project_path: str) -> tuple:
    """Sync task status from worktree .auto-claude-status file if it exists.
    Returns (updated_status, subtasks_with_status)"""
    subtasks = []
    try:
        # Find .auto-claude-status file - check clone paths first
        worktree_status_path = None
        clone_base = Path("/tmp/auto-claude")

        if clone_base.exists():
            for clone_dir in clone_base.iterdir():
                if clone_dir.is_dir() and clone_dir.name.startswith(task.spec_id):
                    # Check nested worktree in clone
                    candidate = clone_dir / ".worktrees" / task.spec_id / ".auto-claude-status"
                    if candidate.exists():
                        worktree_status_path = candidate
                        break

        # Fall back to project path
        if not worktree_status_path:
            worktree_status_path = Path(project_path) / ".worktrees" / task.spec_id / ".auto-claude-status"

        if worktree_status_path and worktree_status_path.exists():
            with open(worktree_status_path) as f:
                status_data = json.load(f)

            state = status_data.get("state", "")
            subtasks_info = status_data.get("subtasks", {})

            # Map worktree state to task status
            # Note: Don't override ai_review status - let the AI review process complete
            if state == "complete":
                if subtasks_info.get("failed", 0) > 0:
                    task.status = "human_review"  # Has failures, skip AI review
                elif task.status not in ("ai_review", "human_review", "done"):
                    # Only set to ai_review if not already in review/done states
                    task.status = "ai_review"  # All completed, needs AI review first
            elif state == "running" or subtasks_info.get("in_progress", 0) > 0:
                task.status = "in_progress"

            # Get subtasks from plan and update their status based on completion
            subtasks = _get_subtasks_from_plan(project_path, task.spec_id)
            completed_count = subtasks_info.get("completed", 0)

            # Mark subtasks as completed based on count
            for i, st in enumerate(subtasks):
                if i < completed_count:
                    st["status"] = "completed"
                elif subtasks_info.get("in_progress", 0) > 0 and i == completed_count:
                    st["status"] = "in_progress"

    except Exception as e:
        print(f"[Task Sync] Error syncing status for {task.spec_id}: {e}")

    return subtasks

def _get_execution_progress(project_path: str, spec_id: str) -> dict:
    """Get execution progress by checking spec files and task_logs.json.

    Infers progress from spec directory contents when task_logs.json doesn't exist.
    Checks clone path first for running tasks, then legacy worktree/project paths.
    """
    try:
        # First find the spec directory
        clone_base = Path("/tmp/auto-claude")
        spec_dir = None
        logs_path = None

        if clone_base.exists():
            # Find clone directory for this task
            for clone_dir in clone_base.iterdir():
                if clone_dir.is_dir() and clone_dir.name.startswith(spec_id):
                    # Check direct clone path first
                    candidate_spec = clone_dir / ".auto-claude" / "specs" / spec_id
                    if candidate_spec.exists():
                        spec_dir = candidate_spec
                        logs_path = candidate_spec / "task_logs.json"
                        break
                    # Check nested worktree path (spec_runner creates this)
                    candidate_spec = clone_dir / ".worktrees" / spec_id / ".auto-claude" / "specs" / spec_id
                    if candidate_spec.exists():
                        spec_dir = candidate_spec
                        logs_path = candidate_spec / "task_logs.json"
                        break

        # Fall back to legacy worktree path
        if not spec_dir:
            candidate_spec = Path(project_path) / ".worktrees" / spec_id / ".auto-claude" / "specs" / spec_id
            if candidate_spec.exists():
                spec_dir = candidate_spec
                logs_path = candidate_spec / "task_logs.json"

        # Fall back to project path
        if not spec_dir:
            candidate_spec = Path(project_path) / ".auto-claude" / "specs" / spec_id
            if candidate_spec.exists():
                spec_dir = candidate_spec
                logs_path = candidate_spec / "task_logs.json"

        # If we have task_logs.json, use it
        if logs_path and logs_path.exists():
            with open(logs_path) as f:
                logs_data = json.load(f)

            phases = logs_data.get("phases", {})
            current_phase = "planning"
            completed = 0
            total = 3  # planning, coding, validation

            if isinstance(phases, dict):
                for phase_name, phase_data in phases.items():
                    if isinstance(phase_data, dict):
                        status = phase_data.get("status", "pending")
                        if status == "completed":
                            completed += 1
                        elif status in ["active", "in_progress", "running"]:
                            current_phase = phase_name
            elif isinstance(phases, list):
                completed = len(phases) - 1 if phases else 0
                current_phase = phases[-1] if phases else "planning"

            return {
                "phase": current_phase,
                "completed": completed,
                "total": total,
                "inProgress": 1
            }

        # No task_logs.json - infer progress from spec files
        if spec_dir and spec_dir.exists():
            has_complexity = (spec_dir / "complexity_assessment.json").exists()
            has_impl_plan = (spec_dir / "implementation_plan.json").exists()
            has_spec = (spec_dir / "spec.md").exists()
            has_context = (spec_dir / "context.json").exists()

            # Determine phase based on what files exist
            if has_impl_plan or has_spec:
                # Past planning, now coding
                return {
                    "phase": "coding",
                    "completed": 1,
                    "total": 3,
                    "inProgress": 1
                }
            elif has_complexity or has_context:
                # In planning phase
                return {
                    "phase": "planning",
                    "completed": 0,
                    "total": 3,
                    "inProgress": 1
                }
            else:
                # Just started
                return {
                    "phase": "planning",
                    "completed": 0,
                    "total": 3,
                    "inProgress": 1
                }

        return None
    except Exception:
        return None


@app.get("/api/projects/{project_id}/tasks")
async def list_tasks(project_id: str):
    # Get project path for status sync
    project_path = None
    if project_id in projects:
        project_path = projects[project_id].path

    project_tasks = []
    for t in tasks.values():
        if t.project_id == project_id:
            subtasks = []
            execution_progress = None

            # Sync status from worktree if available
            if project_path:
                subtasks = _sync_task_status_from_worktree(t, project_path)
                # Get execution progress
                if t.status == "in_progress":
                    execution_progress = _get_execution_progress(project_path, t.spec_id)

            # Convert to frontend format with subtasks
            task_data = task_to_frontend(t)

            # For completed tasks, ensure subtasks are present to avoid "incomplete" status
            if t.status in ("ai_review", "human_review", "done"):
                if not subtasks:
                    # Add placeholder when no subtasks found (clone cleaned up)
                    subtasks = [{
                        "id": "task-complete",
                        "title": "Task completed",
                        "description": t.title,
                        "status": "completed",
                        "files": []
                    }]
                else:
                    # Mark all subtasks as completed
                    for st in subtasks:
                        st["status"] = "completed"

            if subtasks:
                task_data["subtasks"] = subtasks
            if execution_progress:
                task_data["executionProgress"] = execution_progress
            project_tasks.append(task_data)

    # Save any status changes
    _save_tasks()

    return project_tasks  # Return array directly, not wrapped

@app.post("/api/tasks")
async def create_task(request: TaskCreateRequest):
    import uuid

    # Generate spec_id
    spec_id = str(uuid.uuid4())

    # Auto-generate title from description if empty
    title = request.title.strip() if request.title else ""
    if not title and request.description:
        # Use first 50 chars of description as title
        title = request.description.strip()[:50]
        if len(request.description) > 50:
            title += "..."

    # Create task with auto-generated fields
    task = Task(
        spec_id=spec_id,
        title=title,
        description=request.description,
        status="backlog",  # Frontend expects: backlog, planning, in_progress, ai_review, human_review, done
        project_id=request.projectId
    )

    tasks[task.spec_id] = task
    _save_task(task)  # Use _save_task for new tasks (handles create vs update)

    # Broadcast task created event
    await _broadcast_task_event("created", task)

    return {"success": True, "task": task_to_frontend(task)}

@app.get("/api/tasks/{spec_id}")
async def get_task(spec_id: str):
    if spec_id not in tasks:
        raise HTTPException(status_code=404, detail="Task not found")
    return task_to_frontend(tasks[spec_id])

@app.patch("/api/tasks/{spec_id}")
async def update_task(spec_id: str, updates: dict):
    if spec_id not in tasks:
        raise HTTPException(status_code=404, detail="Task not found")

    task = tasks[spec_id]
    for key, value in updates.items():
        if hasattr(task, key):
            setattr(task, key, value)

    _save_tasks()

    # Broadcast task updated event
    await _broadcast_task_event("updated", task)

    return {"success": True, "task": task_to_frontend(task)}

@app.post("/api/tasks/{task_id}/start")
async def start_task(task_id: str):
    """Start executing a task - runs the auto-claude spec runner in an isolated clone"""
    if task_id not in tasks:
        raise HTTPException(status_code=404, detail="Task not found")

    task = tasks[task_id]

    # Check if already running
    if task_id in active_builds:
        return {
            "success": False,
            "error": "Task is already running"
        }

    # Get the project
    if task.project_id not in projects:
        raise HTTPException(status_code=404, detail="Project not found")

    project = projects[task.project_id]
    project_path = Path(project.path)

    # Determine the execution path (clone or direct)
    # Use clone-based execution if CloneManager is available
    clone_path = None
    feature_branch = f"feature/{task_id}"

    if get_clone_manager is not None:
        try:
            # Create a clone for isolated task execution
            clone_mgr = get_clone_manager(project_path)

            # Determine base branch (dev if hierarchical model, main otherwise)
            base_branch = "dev"
            try:
                # Check if dev branch exists
                result = subprocess.run(
                    ["git", "rev-parse", "--verify", "dev"],
                    cwd=project_path,
                    capture_output=True,
                    text=True
                )
                if result.returncode != 0:
                    # Fall back to main/master
                    base_branch = "main"
            except Exception:
                base_branch = "main"

            clone_path = clone_mgr.create_clone(task_id, feature_branch, base_branch)
            print(f"[Task Runner] Created clone at {clone_path} on branch {feature_branch}")

            # Store clone info for later reference
            TaskService.update(task_id, {"feature_branch": feature_branch})

        except Exception as e:
            print(f"[Task Runner] Failed to create clone, falling back to direct execution: {e}")
            clone_path = None

    # Use clone path if available, otherwise project path
    execution_path = clone_path if clone_path else project_path

    # Create .auto-claude/specs directory if it doesn't exist
    specs_dir = execution_path / ".auto-claude" / "specs"
    specs_dir.mkdir(parents=True, exist_ok=True)

    # Create spec directory for this task
    spec_dir = specs_dir / task_id
    spec_dir.mkdir(exist_ok=True)

    # Check if plan already exists (from pre-planning phase)
    # Plans are created in project directory during planning phase
    project_spec_dir = project_path / ".auto-claude" / "specs" / task_id
    plan_exists = (project_spec_dir / "implementation_plan.json").exists()
    skip_planning = plan_exists

    # If plan exists and we're using a clone, copy the spec directory to clone
    if plan_exists and clone_path and project_spec_dir != spec_dir:
        import shutil
        print(f"[Task Runner] Plan already exists, copying spec to clone...")
        # Copy all spec files from project to clone
        if project_spec_dir.exists():
            for item in project_spec_dir.iterdir():
                dest = spec_dir / item.name
                if item.is_file():
                    shutil.copy2(item, dest)
                elif item.is_dir():
                    if dest.exists():
                        shutil.rmtree(dest)
                    shutil.copytree(item, dest)
            print(f"[Task Runner] Copied spec from {project_spec_dir} to {spec_dir}")
    elif not plan_exists:
        # Write task description to spec file (only if no plan exists)
        spec_file = spec_dir / "task.md"
        spec_content = f"""# {task.title}

{task.description}
"""
        spec_file.write_text(spec_content)

    # Update task status in database
    task = tasks.update_status(task_id, "in_progress")

    # Clear any stale status files (legacy worktree and clone status)
    for status_dir in [project_path / ".worktrees" / task_id, execution_path]:
        status_path = status_dir / ".auto-claude-status"
        if status_path.exists():
            try:
                status_path.unlink()
                print(f"[Task Runner] Cleared stale status for {task_id}")
            except Exception as e:
                print(f"[Task Runner] Failed to clear status: {e}")

    # Broadcast task started
    await _broadcast_task_event("updated", task, {
        "featureBranch": feature_branch,
        "clonePath": str(clone_path) if clone_path else None
    })

    # Prepare environment
    env = os.environ.copy()

    # Determine which script to run based on whether planning is already done
    if skip_planning:
        # Plan exists - skip to execution phase (run.py)
        run_script_path = Path("/app/auto-claude/run.py")
        cmd = [
            "python3",
            str(run_script_path),
            "--spec", task_id,
            "--project-dir", str(execution_path),
            "--auto-continue",  # Non-interactive mode
        ]
        print(f"[Task Runner] Plan exists, skipping to execution for task {task_id}")
    else:
        # No plan - run full spec_runner.py (planning + execution)
        spec_runner_path = Path("/app/auto-claude/runners/spec_runner.py")
        cmd = [
            "python3",
            str(spec_runner_path),
            "--task", task.description,
            "--project-dir", str(execution_path),
            "--spec-dir", str(spec_dir),
            "--auto-approve",  # Skip human review for automated execution
        ]

    print(f"[Task Runner] Starting task {task_id} in {execution_path}: {' '.join(cmd)}")

    try:
        # Start the process
        proc = subprocess.Popen(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            cwd="/app",
            env=env
        )

        active_builds[task_id] = proc
        print(f"[Task Runner] Process started with PID {proc.pid}")

        # Start background task to monitor the process
        asyncio.create_task(_monitor_task_process(
            task_id,
            proc,
            clone_path=clone_path,
            feature_branch=feature_branch
        ))

        return {
            "success": True,
            "data": {
                "message": "Task started",
                "taskId": task_id,
                "pid": proc.pid,
                "featureBranch": feature_branch,
                "clonePath": str(clone_path) if clone_path else None
            }
        }
    except Exception as e:
        print(f"[Task Runner] Failed to start task: {e}")
        # Clean up clone on failure
        if clone_path and get_clone_manager:
            try:
                clone_mgr = get_clone_manager(project_path)
                clone_mgr.cleanup_clone(task_id)
            except Exception:
                pass
        tasks.update_status(task_id, "backlog")
        raise HTTPException(status_code=500, detail=f"Failed to start task: {str(e)}")


@app.post("/api/tasks/{task_id}/plan")
async def plan_task(task_id: str):
    """Start planning for a task - runs spec_runner in planning-only mode (no build)

    This creates a spec/plan in the background. When complete, task moves to
    human_review with reason='plan_review' for the user to approve before execution.
    """
    if task_id not in tasks:
        raise HTTPException(status_code=404, detail="Task not found")

    task = tasks[task_id]

    # Check if already running
    if task_id in active_builds:
        return {
            "success": False,
            "error": "Task is already running"
        }

    # Check if already planned (has implementation_plan.json)
    if task.project_id in projects:
        project_path = Path(projects[task.project_id].path)
        spec_dir = project_path / ".auto-claude" / "specs" / task_id
        if (spec_dir / "implementation_plan.json").exists():
            return {
                "success": False,
                "error": "Task already has a plan. Use start to execute."
            }

    # Get the project
    if task.project_id not in projects:
        raise HTTPException(status_code=404, detail="Project not found")

    project = projects[task.project_id]
    project_path = Path(project.path)

    # For planning, we don't need a full clone - just work in project directory
    # The plan will be stored in .auto-claude/specs/{task_id}/
    execution_path = project_path

    # Create .auto-claude/specs directory if it doesn't exist
    specs_dir = execution_path / ".auto-claude" / "specs"
    specs_dir.mkdir(parents=True, exist_ok=True)

    # Create spec directory for this task
    spec_dir = specs_dir / task_id
    spec_dir.mkdir(exist_ok=True)

    # Write task description to spec file
    spec_file = spec_dir / "task.md"
    spec_content = f"""# {task.title}

{task.description}
"""
    spec_file.write_text(spec_content)

    # Update task status to planning
    task = tasks.update_status(task_id, "planning")

    # Broadcast task status change
    await _broadcast_task_event("updated", task)

    # Build the command to run spec_runner.py in planning-only mode
    spec_runner_path = Path("/app/auto-claude/runners/spec_runner.py")

    # Prepare environment
    env = os.environ.copy()

    cmd = [
        "python3",
        str(spec_runner_path),
        "--task", task.description,
        "--project-dir", str(execution_path),
        "--spec-dir", str(spec_dir),
        "--no-build",  # Planning only - don't start execution
        "--auto-approve",  # Auto-approve spec so plan gets generated
    ]

    print(f"[Task Planner] Starting planning for task {task_id}: {' '.join(cmd)}")

    try:
        # Start the process
        proc = subprocess.Popen(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            cwd="/app",
            env=env
        )

        active_builds[task_id] = proc
        print(f"[Task Planner] Process started with PID {proc.pid}")

        # Start background task to monitor the planning process
        asyncio.create_task(_monitor_plan_process(task_id, proc))

        return {
            "success": True,
            "data": {
                "message": "Planning started",
                "taskId": task_id,
                "pid": proc.pid
            }
        }
    except Exception as e:
        print(f"[Task Planner] Failed to start planning: {e}")
        tasks.update_status(task_id, "backlog")
        raise HTTPException(status_code=500, detail=f"Failed to start planning: {str(e)}")


async def _monitor_plan_process(task_id: str, proc: subprocess.Popen):
    """Monitor a planning process and update status when complete"""
    import asyncio

    print(f"[Plan Monitor] Started monitoring planning for task {task_id} (PID {proc.pid})")

    poll_count = 0

    # Get project info
    project_path = None
    project_id = None
    if task_id in tasks:
        project_id = tasks[task_id].project_id
        if project_id in projects:
            project_path = projects[project_id].path

    try:
        # Wait for process to complete
        while proc.poll() is None:
            poll_count += 1
            if poll_count % 15 == 0:  # Log every 30 seconds
                print(f"[Plan Monitor] Task {task_id} planning still running (PID {proc.pid})")

            # Broadcast planning progress updates
            if project_path and project_id:
                try:
                    progress = _get_execution_progress(project_path, task_id)
                    if progress:
                        from .websocket_handler import ws_manager
                        if ws_manager:
                            await ws_manager.broadcast_event(
                                f"project.{project_id}.tasks",
                                {
                                    "action": "updated",
                                    "task": {
                                        "id": task_id,
                                        "specId": task_id,
                                        "projectId": project_id,
                                        "status": "planning",
                                        "executionProgress": progress
                                    }
                                }
                            )
                except Exception as e:
                    if poll_count % 15 == 0:
                        print(f"[Plan Monitor] Error reading progress: {e}")

            await asyncio.sleep(2)

        exit_code = proc.returncode
        print(f"[Plan Monitor] Task {task_id} planning completed with exit code {exit_code}")

        # Remove from active builds
        if task_id in active_builds:
            del active_builds[task_id]

        # Update task status based on exit code
        if task_id in tasks:
            if exit_code == 0:
                # Planning succeeded - move to human_review with plan_review reason
                task = tasks[task_id]
                task.status = "human_review"
                task.review_reason = "plan_review"
                tasks[task_id] = task  # Triggers database save
                print(f"[Plan Monitor] Task {task_id} planning complete, moved to human_review (plan_review)")

                # Schedule state export to git
                schedule_state_export(project_id)
            else:
                task = tasks.update_status(task_id, "backlog")  # Failed, needs retry
                print(f"[Plan Monitor] Task {task_id} planning failed, status set to backlog")

            # Broadcast task status change via WebSocket
            try:
                from .websocket_handler import ws_manager
                if ws_manager:
                    task = tasks[task_id]
                    task_data = {
                        "id": task_id,
                        "specId": task.spec_id,
                        "projectId": task.project_id,
                        "status": task.status,
                        "title": task.title,
                    }
                    if hasattr(task, 'review_reason') and task.review_reason:
                        task_data["reviewReason"] = task.review_reason

                    asyncio.create_task(ws_manager.broadcast_event(
                        f"project.{task.project_id}.tasks",
                        {
                            "action": "updated",
                            "task": task_data
                        }
                    ))
            except Exception as e:
                print(f"[Plan Monitor] Failed to broadcast status update: {e}")

    except Exception as e:
        print(f"[Plan Monitor] Error monitoring planning: {e}")
        # Clean up
        if task_id in active_builds:
            del active_builds[task_id]
        try:
            tasks.update_status(task_id, "backlog")
        except Exception:
            pass


async def _monitor_task_process(
    task_id: str,
    proc: subprocess.Popen,
    clone_path: Path = None,
    feature_branch: str = None
):
    """Monitor a running task process and update status when complete"""
    import asyncio

    print(f"[Task Monitor] Started monitoring task {task_id} (PID {proc.pid})")
    if clone_path:
        print(f"[Task Monitor] Clone path: {clone_path}, branch: {feature_branch}")

    poll_count = 0
    last_phase = None

    # Get project path for this task
    project_path = None
    project_id = None
    if task_id in tasks:
        project_id = tasks[task_id].project_id
        if project_id in projects:
            project_path = projects[project_id].path

    try:
        # Wait for process to complete (check every 2 seconds)
        while proc.poll() is None:
            poll_count += 1
            if poll_count % 15 == 0:  # Log every 30 seconds
                print(f"[Task Monitor] Task {task_id} still running (PID {proc.pid})")

            # Poll execution progress from task_logs.json and broadcast updates
            if project_path and project_id:
                try:
                    # Check multiple possible log locations
                    logs_path = None

                    # First check clone path (if using clone-based execution)
                    if clone_path:
                        clone_logs = clone_path / ".auto-claude" / "specs" / task_id / "task_logs.json"
                        if clone_logs.exists():
                            logs_path = clone_logs

                    # Fallback to project path
                    if not logs_path:
                        project_logs = Path(project_path) / ".auto-claude" / "specs" / task_id / "task_logs.json"
                        if project_logs.exists():
                            logs_path = project_logs

                    # Legacy worktree path
                    if not logs_path:
                        worktree_logs = Path(project_path) / ".worktrees" / task_id / ".auto-claude" / "specs" / task_id / "task_logs.json"
                        if worktree_logs.exists():
                            logs_path = worktree_logs

                    if logs_path and logs_path.exists():
                        with open(logs_path) as f:
                            logs_data = json.load(f)

                        phases = logs_data.get("phases", {})
                        current_phase = "planning"
                        completed_phases = 0
                        total_phases = len(phases) if isinstance(phases, dict) else 3

                        if isinstance(phases, dict):
                            for phase_name, phase_data in phases.items():
                                if isinstance(phase_data, dict):
                                    phase_status = phase_data.get("status", "pending")
                                    if phase_status == "completed":
                                        completed_phases += 1
                                    elif phase_status in ["in_progress", "running"]:
                                        current_phase = phase_name
                        elif isinstance(phases, list):
                            total_phases = 3
                            completed_phases = len(phases) - 1 if phases else 0
                            current_phase = phases[-1] if phases else "planning"

                        # Broadcast if phase changed
                        if current_phase != last_phase:
                            last_phase = current_phase
                            print(f"[Task Monitor] Task {task_id} phase: {current_phase}")

                            from .websocket_handler import ws_manager
                            if ws_manager:
                                await ws_manager.broadcast_event(
                                    f"project.{project_id}.tasks",
                                    {
                                        "action": "updated",
                                        "task": {
                                            "id": task_id,
                                            "specId": task_id,
                                            "projectId": project_id,
                                            "status": "in_progress",
                                            "executionProgress": {
                                                "phase": current_phase,
                                                "completed": completed_phases,
                                                "total": max(total_phases, 3),
                                                "inProgress": 1
                                            }
                                        }
                                    }
                                )
                except Exception as e:
                    if poll_count % 15 == 0:  # Only log errors occasionally
                        print(f"[Task Monitor] Error reading progress: {e}")

            await asyncio.sleep(2)

        exit_code = proc.returncode
        print(f"[Task Monitor] Task {task_id} completed with exit code {exit_code}")

        # If using clone-based execution, push the branch to remote
        if clone_path and get_clone_manager and project_path:
            try:
                clone_mgr = get_clone_manager(project_path)
                if exit_code == 0:
                    # Task succeeded - push the branch
                    push_success = clone_mgr.push_branch(task_id)
                    if push_success:
                        print(f"[Task Monitor] Pushed branch {feature_branch} to remote")
                    else:
                        print(f"[Task Monitor] Warning: Failed to push branch {feature_branch}")
                else:
                    # Task failed - clean up the clone
                    clone_mgr.cleanup_clone(task_id)
                    print(f"[Task Monitor] Cleaned up clone after task failure")
            except Exception as push_err:
                print(f"[Task Monitor] Error handling clone after completion: {push_err}")

        # Update task status based on exit code
        if task_id in tasks:
            if exit_code == 0:
                # First set to ai_review, then trigger AI QA validation
                task = tasks.update_status(task_id, "ai_review")
                print(f"[Task Monitor] Task {task_id} status updated to ai_review")

                # Schedule state export to git
                schedule_state_export(project_id)

                # Trigger AI review in the background
                asyncio.create_task(_run_ai_review(task_id, project_id))
            else:
                task = tasks.update_status(task_id, "backlog")  # Failed, needs retry
                print(f"[Task Monitor] Task {task_id} failed, status set to backlog")

            # Broadcast task status change via WebSocket
            try:
                from .websocket_handler import ws_manager
                if ws_manager:
                    # Get project path for subtasks
                    project_path = None
                    if task.project_id in projects:
                        project_path = projects[task.project_id].path

                    # Fetch subtasks from implementation plan
                    subtasks = []
                    if project_path:
                        subtasks = _get_subtasks_from_plan(project_path, task.spec_id)
                        # Mark all as completed if task succeeded
                        if exit_code == 0:
                            for st in subtasks:
                                st["status"] = "completed"

                    task_data = {
                        "id": task_id,
                        "specId": task.spec_id,
                        "projectId": task.project_id,
                        "status": task.status,
                        "title": task.title,
                        "subtasks": subtasks
                    }
                    # Include feature branch info if available
                    if feature_branch:
                        task_data["featureBranch"] = feature_branch

                    asyncio.create_task(ws_manager.broadcast_event(
                        f"project.{task.project_id}.tasks",
                        {
                            "action": "updated",
                            "task": task_data
                        }
                    ))
                    print(f"[Task Monitor] Broadcasted status update for task {task_id} with {len(subtasks)} subtasks")
            except Exception as broadcast_err:
                print(f"[Task Monitor] Failed to broadcast: {broadcast_err}")
        else:
            print(f"[Task Monitor] Warning: Task {task_id} not found in tasks dict")

        # Clean up
        if task_id in active_builds:
            del active_builds[task_id]
            print(f"[Task Monitor] Cleaned up active_builds for task {task_id}")

    except Exception as e:
        print(f"[Task Monitor] Error monitoring task {task_id}: {e}")
        import traceback
        traceback.print_exc()


async def _run_ai_review(task_id: str, project_id: str):
    """
    Run AI QA review on a completed task.

    This triggers the auto-claude QA validation loop which:
    1. Reviews the implementation against acceptance criteria
    2. If issues found, attempts to fix them automatically
    3. Loops until approved or max iterations reached

    Based on the result:
    - QA approved → status moves to human_review
    - QA failed/incomplete → status moves back to in_progress with feedback
    """
    print(f"[AI Review] Starting AI review for task {task_id}")

    try:
        # Get task and project info
        if task_id not in tasks:
            print(f"[AI Review] Task {task_id} not found")
            return

        task = tasks[task_id]

        if project_id not in projects:
            print(f"[AI Review] Project {project_id} not found")
            # Fall back to human_review - use update_status for DB persistence
            task = tasks.update_status(task_id, "human_review")
            if task:
                await _broadcast_task_event("updated", task)
            return

        project = projects[project_id]
        project_path = Path(project.path)

        # Find spec directory - check clone paths first (for clone-based execution)
        spec_dir = None
        clone_base = Path("/tmp/auto-claude")

        if clone_base.exists():
            for clone_dir in clone_base.iterdir():
                if clone_dir.is_dir() and clone_dir.name.startswith(task_id):
                    # Check direct clone path
                    candidate = clone_dir / ".auto-claude" / "specs" / task_id
                    if candidate.exists():
                        spec_dir = candidate
                        break
                    # Check nested worktree path
                    candidate = clone_dir / ".worktrees" / task_id / ".auto-claude" / "specs" / task_id
                    if candidate.exists():
                        spec_dir = candidate
                        break

        # Fall back to project path
        if not spec_dir:
            spec_dir = project_path / ".auto-claude" / "specs" / task.spec_id

        if not spec_dir or not spec_dir.exists():
            print(f"[AI Review] Spec directory not found for task {task_id}")
            # Fall back to human_review - use update_status for DB persistence
            task = tasks.update_status(task_id, "human_review")
            if task:
                await _broadcast_task_event("updated", task)
            return

        # Import QA functions (lazy import to avoid circular deps)
        try:
            from qa_loop import run_qa_validation_loop, should_run_qa
        except ImportError as e:
            print(f"[AI Review] Failed to import QA modules: {e}")
            # Fall back to human_review - use update_status for DB persistence
            task = tasks.update_status(task_id, "human_review")
            if task:
                await _broadcast_task_event("updated", task)
            return

        # Check if QA should run
        if not should_run_qa(spec_dir):
            print(f"[AI Review] QA not needed for task {task_id} (already approved or incomplete)")
            task = tasks.update_status(task_id, "human_review")
            if task:
                await _broadcast_task_event("updated", task)
            return

        # Broadcast that AI review is starting
        await _broadcast_task_event("updated", task)

        # Run the QA validation loop
        print(f"[AI Review] Running QA validation loop for task {task_id}")

        # Get model from settings or use default
        model = "claude-sonnet-4-20250514"  # Default model
        try:
            from .database import SettingsService, get_db_session
            with get_db_session() as db:
                settings = SettingsService.get_all(db)
                if "defaultModel" in settings:
                    model = settings["defaultModel"]
        except Exception as e:
            print(f"[AI Review] Could not get model from settings: {e}")

        # Run QA loop
        try:
            qa_approved = await run_qa_validation_loop(
                project_dir=project_path,
                spec_dir=spec_dir,
                model=model,
                verbose=True,
            )

            if qa_approved:
                print(f"[AI Review] Task {task_id} PASSED QA review")
                task = tasks.update_status(task_id, "human_review")
                # Export state to git on significant status change
                schedule_state_export(project_id)
                if task:
                    await _broadcast_task_event("updated", task)
            else:
                print(f"[AI Review] Task {task_id} FAILED QA review, sending back for fixes")
                # Set back to in_progress with feedback
                task = tasks.update_status(task_id, "in_progress")

                # Add feedback about QA failure
                feedback = "AI QA review found issues that need to be addressed. Check the qa_report.md file in the spec directory for details."

                # Write feedback to HUMAN_INPUT.md for the agent to pick up
                feedback_file = spec_dir / "HUMAN_INPUT.md"
                try:
                    feedback_file.write_text(f"# QA Review Feedback\n\n{feedback}\n\nPlease address the issues found in qa_report.md and complete the fixes.\n")
                    print(f"[AI Review] Wrote feedback to {feedback_file}")
                except Exception as e:
                    print(f"[AI Review] Failed to write feedback: {e}")

                # Broadcast status change
                await _broadcast_task_event("updated", task)

                # Re-start the task to process the QA feedback
                print(f"[AI Review] Restarting task {task_id} to address QA issues")
                # The task will be picked up by the normal task runner

        except Exception as qa_error:
            print(f"[AI Review] QA validation error: {qa_error}")
            import traceback
            traceback.print_exc()
            # Fall back to human_review on error - use update_status for DB persistence
            task = tasks.update_status(task_id, "human_review")
            if task:
                await _broadcast_task_event("updated", task)

    except Exception as e:
        print(f"[AI Review] Error during AI review for task {task_id}: {e}")
        import traceback
        traceback.print_exc()

        # Try to fall back to human_review - use update_status for DB persistence
        task = tasks.update_status(task_id, "human_review")
        if task:
            try:
                await _broadcast_task_event("updated", task)
            except:
                pass


@app.post("/api/tasks/{task_id}/stop")
async def stop_task(task_id: str):
    """Stop a running task"""
    if task_id not in tasks:
        raise HTTPException(status_code=404, detail="Task not found")

    # Stop the build if it's running
    if task_id in active_builds:
        proc = active_builds[task_id]
        try:
            proc.terminate()
            proc.wait(timeout=10)
        except Exception as e:
            print(f"[Task Runner] Error stopping task {task_id}: {e}")
        del active_builds[task_id]

    # Update task status back to backlog
    task = tasks.update_status(task_id, "backlog")

    # Broadcast task stopped
    await _broadcast_task_event("updated", task)

    return {"success": True}


@app.delete("/api/tasks/{task_id}")
async def delete_task(task_id: str):
    """Delete a task"""
    if task_id not in tasks:
        raise HTTPException(status_code=404, detail="Task not found")

    task = tasks[task_id]
    project_id = task.project_id

    # Stop the build if it's running
    if task_id in active_builds:
        proc = active_builds[task_id]
        try:
            proc.terminate()
            proc.wait(timeout=10)
        except Exception:
            pass
        del active_builds[task_id]

    # Remove the task
    del tasks[task_id]
    _save_tasks()

    # Broadcast task deleted
    try:
        from .websocket_handler import ws_manager
        if ws_manager:
            await ws_manager.broadcast_event(
                f"project.{project_id}.tasks",
                {"action": "deleted", "taskId": task_id}
            )
    except Exception as e:
        print(f"[Broadcast] Delete error: {e}")

    print(f"[Tasks] Deleted task {task_id}")
    return {"success": True}


@app.post("/api/tasks/{task_id}/review")
async def submit_task_review(task_id: str, review_data: dict):
    """Submit a review for a task.

    If approved, marks task as done.
    If rejected with feedback, restarts the task with the feedback appended.
    """
    if task_id not in tasks:
        raise HTTPException(status_code=404, detail="Task not found")

    approved = review_data.get("approved", False)
    feedback = review_data.get("feedback", "")
    task = tasks[task_id]

    if approved:
        task.status = "done"
        _save_tasks()
        # Export final state to git
        schedule_state_export(task.project_id)
        await _broadcast_task_event("updated", task)
        return {"success": True}

    # Not approved - restart the task with feedback
    # Append feedback to task description
    if feedback:
        original_desc = task.description
        task.description = f"{original_desc}\n\n---\n**Feedback from review:**\n{feedback}"

    # Set status back to backlog and save to database
    task.status = "backlog"
    tasks[task_id] = task  # Save full task including description update

    # Broadcast before restart (will broadcast again after start)
    await _broadcast_task_event("updated", task)

    # Auto-restart the task
    print(f"[Task Review] Restarting task {task_id} with feedback")
    try:
        result = await start_task(task_id)
        return {"success": True, "restarted": True, "data": result}
    except Exception as e:
        print(f"[Task Review] Failed to restart task: {e}")
        return {"success": True, "restarted": False, "error": str(e)}

@app.post("/api/tasks/archive")
async def archive_tasks(archive_data: dict):
    """Archive completed tasks"""
    task_ids = archive_data.get("taskIds", [])

    # In a real implementation, we'd move these to an archive
    # For now, we'll just mark them somehow

    return {
        "success": True,
        "data": {
            "archived": len(task_ids)
        }
    }

@app.post("/api/tasks/unarchive")
async def unarchive_tasks(unarchive_data: dict):
    """Unarchive tasks"""
    task_ids = unarchive_data.get("taskIds", [])

    return {
        "success": True,
        "data": {
            "unarchived": len(task_ids)
        }
    }

@app.get("/api/tasks/{task_id}/status")
async def get_task_status(task_id: str):
    """Get the current status of a task"""
    if task_id not in tasks:
        raise HTTPException(status_code=404, detail="Task not found")

    task = tasks[task_id]
    is_running = task_id in active_builds

    return {
        "success": True,
        "data": {
            "status": task.status,
            "running": is_running
        }
    }

@app.post("/api/tasks/{task_id}/recover")
async def recover_task(task_id: str):
    """Recover a stuck/failed task"""
    if task_id not in tasks:
        raise HTTPException(status_code=404, detail="Task not found")

    task = tasks[task_id]

    # Don't recover if task is actively running
    if task_id in active_builds:
        return {
            "success": True,
            "data": {
                "message": "Task is still running",
                "newStatus": task.status,
                "autoRestarted": False
            }
        }

    # Reset status to allow retry
    task = tasks.update_status(task_id, "backlog")

    # Broadcast task recovered
    await _broadcast_task_event("updated", task)

    return {
        "success": True,
        "data": {
            "message": "Task recovered and ready to retry",
            "newStatus": "backlog",
            "autoRestarted": False
        }
    }

@app.get("/api/tasks/{task_id}/running")
async def is_task_running(task_id: str):
    """Check if a task is currently running"""
    is_running = task_id in active_builds

    return {
        "success": True,
        "data": {
            "running": is_running
        }
    }

# ============================================================================
# Git State Sync API Endpoints
# ============================================================================

@app.post("/api/projects/{project_id}/state/export")
async def export_project_state_api(project_id: str):
    """Manually export project state to git state branch."""
    if project_id not in projects:
        raise HTTPException(status_code=404, detail="Project not found")

    try:
        _export_project_state(project_id, force=True)
        return {"success": True, "message": f"State exported for {project_id}"}
    except Exception as e:
        return {"success": False, "error": str(e)}


@app.post("/api/projects/{project_id}/state/import")
async def import_project_state_api(project_id: str):
    """Manually import project state from git state branch."""
    if project_id not in projects:
        raise HTTPException(status_code=404, detail="Project not found")

    try:
        success = _import_project_state(project_id)
        if success:
            return {"success": True, "message": f"State imported for {project_id}"}
        else:
            return {"success": False, "error": "No state branch found or import failed"}
    except Exception as e:
        return {"success": False, "error": str(e)}


@app.post("/api/projects/{project_id}/state/push")
async def push_project_state_api(project_id: str):
    """Push project state branch to remote."""
    if project_id not in projects:
        raise HTTPException(status_code=404, detail="Project not found")

    try:
        project = projects[project_id]
        state_mgr = GitStateManager(project.path)

        # Export first to ensure state is current
        _export_project_state(project_id, force=True)

        # Then push
        success = state_mgr.push_state()
        if success:
            return {"success": True, "message": f"State pushed for {project_id}"}
        else:
            return {"success": False, "error": "Failed to push state branch"}
    except Exception as e:
        return {"success": False, "error": str(e)}


@app.post("/api/projects/{project_id}/state/pull")
async def pull_project_state_api(project_id: str):
    """Pull project state branch from remote and import."""
    if project_id not in projects:
        raise HTTPException(status_code=404, detail="Project not found")

    try:
        project = projects[project_id]
        state_mgr = GitStateManager(project.path)

        # Pull from remote
        state_mgr.pull_state()

        # Then import
        success = _import_project_state(project_id)
        if success:
            return {"success": True, "message": f"State pulled and imported for {project_id}"}
        else:
            return {"success": False, "error": "Failed to import after pull"}
    except Exception as e:
        return {"success": False, "error": str(e)}


@app.get("/api/projects/{project_id}/state/status")
async def get_project_state_status(project_id: str):
    """Get the status of the project's git state ref."""
    if project_id not in projects:
        raise HTTPException(status_code=404, detail="Project not found")

    try:
        project = projects[project_id]
        state_mgr = GitStateManager(project.path)

        has_state_ref = state_mgr._state_ref_exists()
        is_git_repo = state_mgr._is_git_repo()

        return {
            "success": True,
            "data": {
                "isGitRepo": is_git_repo,
                "hasStateRef": has_state_ref,
                "stateRef": "refs/auto-claude/state" if has_state_ref else None
            }
        }
    except Exception as e:
        return {"success": False, "error": str(e)}


# ============================================================================
# Spec Data API Endpoints
# ============================================================================

@app.post("/api/projects/{project_id}/specs/migrate")
async def migrate_project_specs(project_id: str):
    """Migrate spec flat files to database for a project."""
    if project_id not in projects:
        raise HTTPException(status_code=404, detail="Project not found")

    try:
        project = projects[project_id]
        count = migrate_all_project_specs(project.path)
        return {"success": True, "message": f"Migrated {count} specs to database"}
    except Exception as e:
        return {"success": False, "error": str(e)}


@app.get("/api/specs/{spec_id}")
async def get_spec(spec_id: str, include_logs: bool = False):
    """Get spec data from database."""
    spec = SpecService.get_by_id(spec_id, include_logs=include_logs)
    if not spec:
        raise HTTPException(status_code=404, detail="Spec not found")
    return {"success": True, "data": spec}


@app.put("/api/specs/{spec_id}")
async def update_spec(spec_id: str, updates: dict):
    """Update spec data in database."""
    spec = SpecService.upsert(spec_id, updates)
    return {"success": True, "data": spec}


@app.get("/api/tasks/{task_id}/spec")
async def get_task_spec(task_id: str, include_logs: bool = False):
    """Get spec data for a task."""
    spec = SpecService.get_by_task_id(task_id, include_logs=include_logs)
    if not spec:
        raise HTTPException(status_code=404, detail="Spec not found for task")
    return {"success": True, "data": spec}


# ============================================================================
# Merge API Endpoints
# ============================================================================

@app.post("/api/subtasks/{subtask_id}/merge")
async def merge_subtask(subtask_id: str, merge_data: dict = {}):
    """
    Merge a subtask branch into its parent feature branch.

    Args:
        subtask_id: Subtask ID
        merge_data: Optional merge options (noCommit, message)

    Returns:
        Merge result
    """
    from dataclasses import asdict

    # Get subtask from database
    subtask = SubtaskService.get_by_id(subtask_id)
    if not subtask:
        raise HTTPException(status_code=404, detail="Subtask not found")

    task_id = subtask.get("task_id")
    if not task_id or task_id not in tasks:
        raise HTTPException(status_code=404, detail="Parent task not found")

    task = tasks[task_id]
    project = projects.get(task.project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    try:
        # Import merge manager
        import sys
        auto_claude_path = Path("/app/auto-claude")
        if str(auto_claude_path) not in sys.path:
            sys.path.insert(0, str(auto_claude_path))

        from core.merge_manager import get_merge_manager

        manager = get_merge_manager(project.path)
        result = manager.merge_subtask(
            task_id,
            subtask_id,
            no_commit=merge_data.get("noCommit", False),
            message=merge_data.get("message")
        )

        # Update subtask status if successful
        if result.success:
            SubtaskService.update(subtask_id, {
                "status": "merged",
                "merged_at": datetime.utcnow()
            })

        return {
            "success": result.success,
            "message": result.message,
            "commitSha": result.commit_sha,
            "mergedFiles": result.merged_files,
            "hadConflicts": result.had_conflicts,
            "conflicts": [asdict(c) for c in result.conflicts] if result.conflicts else []
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/tasks/{task_id}/merge")
async def merge_task_to_dev(task_id: str, merge_data: dict = {}):
    """
    Merge a task's feature branch into dev.

    Args:
        task_id: Task ID
        merge_data: Optional merge options (noCommit, message)

    Returns:
        Merge result
    """
    from dataclasses import asdict

    if task_id not in tasks:
        raise HTTPException(status_code=404, detail="Task not found")

    task = tasks[task_id]
    project = projects.get(task.project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    try:
        import sys
        auto_claude_path = Path("/app/auto-claude")
        if str(auto_claude_path) not in sys.path:
            sys.path.insert(0, str(auto_claude_path))

        from core.merge_manager import get_merge_manager

        manager = get_merge_manager(project.path)
        result = manager.merge_feature_to_dev(
            task_id,
            no_commit=merge_data.get("noCommit", False),
            message=merge_data.get("message")
        )

        # Update task status if successful
        if result.success:
            TaskService.update(task_id, {
                "merged_to_dev_at": datetime.utcnow()
            })
            task.status = "done"
            _save_tasks()

            # Broadcast task update
            await _broadcast_task_event("updated", task, {"mergedToDev": True})

        return {
            "success": result.success,
            "message": result.message,
            "commitSha": result.commit_sha,
            "mergedFiles": result.merged_files,
            "hadConflicts": result.had_conflicts,
            "conflicts": [asdict(c) for c in result.conflicts] if result.conflicts else []
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/tasks/{task_id}/merge-status")
async def get_task_merge_status(task_id: str):
    """
    Get merge status for a task.

    Returns information about the task's feature branch and merge readiness.
    """
    if task_id not in tasks:
        raise HTTPException(status_code=404, detail="Task not found")

    task = tasks[task_id]
    project = projects.get(task.project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    try:
        import sys
        auto_claude_path = Path("/app/auto-claude")
        if str(auto_claude_path) not in sys.path:
            sys.path.insert(0, str(auto_claude_path))

        from core.merge_manager import get_merge_manager

        manager = get_merge_manager(project.path)
        feature_branch = f"feature/{task_id}"

        # Check if feature branch exists
        branch_exists = manager._branch_exists(feature_branch, remote=True)

        if branch_exists:
            # Get merge preview against dev
            preview = manager.preview_merge(feature_branch, "dev")
            return {
                "success": True,
                "data": {
                    "branchExists": True,
                    "featureBranch": feature_branch,
                    "canMergeToDev": preview.can_merge,
                    "commitsAhead": preview.commits_ahead,
                    "filesChanged": preview.files_changed,
                    "additions": preview.additions,
                    "deletions": preview.deletions,
                    "hasConflicts": len(preview.conflicts) > 0
                }
            }
        else:
            return {
                "success": True,
                "data": {
                    "branchExists": False,
                    "featureBranch": feature_branch
                }
            }
    except Exception as e:
        return {"success": False, "error": str(e)}


@app.post("/api/tasks/{task_id}/merge-preview")
async def preview_task_merge(task_id: str, preview_data: dict = {}):
    """
    Preview what merging a task would do.

    Args:
        task_id: Task ID
        preview_data: Optional (sourceBranch, targetBranch)

    Returns:
        Merge preview with changed files, conflicts, etc.
    """
    from dataclasses import asdict

    if task_id not in tasks:
        raise HTTPException(status_code=404, detail="Task not found")

    task = tasks[task_id]
    project = projects.get(task.project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    source_branch = preview_data.get("sourceBranch", f"feature/{task_id}")
    target_branch = preview_data.get("targetBranch", "dev")

    try:
        import sys
        auto_claude_path = Path("/app/auto-claude")
        if str(auto_claude_path) not in sys.path:
            sys.path.insert(0, str(auto_claude_path))

        from core.merge_manager import get_merge_manager

        manager = get_merge_manager(project.path)
        preview = manager.preview_merge(source_branch, target_branch)

        return {
            "success": True,
            "data": {
                "canMerge": preview.can_merge,
                "sourceBranch": preview.source_branch,
                "targetBranch": preview.target_branch,
                "commitsAhead": preview.commits_ahead,
                "filesChanged": preview.files_changed,
                "additions": preview.additions,
                "deletions": preview.deletions,
                "conflicts": [asdict(c) for c in preview.conflicts] if preview.conflicts else [],
                "changedFiles": preview.changed_files
            }
        }
    except Exception as e:
        return {"success": False, "error": str(e)}


@app.post("/api/projects/{project_id}/ensure-dev-branch")
async def ensure_dev_branch(project_id: str, data: dict = {}):
    """
    Ensure the dev branch exists for a project.

    Args:
        project_id: Project ID
        data: Optional (baseBranch)

    Returns:
        Success status
    """
    if project_id not in projects:
        raise HTTPException(status_code=404, detail="Project not found")

    project = projects[project_id]
    base_branch = data.get("baseBranch", "main")

    try:
        import sys
        auto_claude_path = Path("/app/auto-claude")
        if str(auto_claude_path) not in sys.path:
            sys.path.insert(0, str(auto_claude_path))

        from core.merge_manager import get_merge_manager

        manager = get_merge_manager(project.path)
        success = manager.ensure_dev_branch(base_branch)

        return {
            "success": success,
            "message": "Dev branch ready" if success else "Failed to create dev branch"
        }
    except Exception as e:
        return {"success": False, "error": str(e)}


# ============================================================================
# Release API Endpoints
# ============================================================================

@app.get("/api/projects/{project_id}/releases")
async def list_releases(project_id: str):
    """
    List all releases for a project.

    Args:
        project_id: Project ID

    Returns:
        List of releases
    """
    if project_id not in projects:
        raise HTTPException(status_code=404, detail="Project not found")

    project = projects[project_id]

    try:
        import sys
        auto_claude_path = Path("/app/auto-claude")
        if str(auto_claude_path) not in sys.path:
            sys.path.insert(0, str(auto_claude_path))

        from core.release_manager import get_release_manager

        manager = get_release_manager(project.path)
        releases = manager.list_releases()

        return {"success": True, "data": releases}
    except Exception as e:
        return {"success": False, "error": str(e)}


@app.post("/api/projects/{project_id}/releases")
async def create_release(project_id: str, release_data: dict):
    """
    Create a new release candidate.

    Args:
        project_id: Project ID
        release_data: version, releaseNotes, taskIds

    Returns:
        Created release info
    """
    if project_id not in projects:
        raise HTTPException(status_code=404, detail="Project not found")

    project = projects[project_id]
    version = release_data.get("version")
    release_notes = release_data.get("releaseNotes")
    task_ids = release_data.get("taskIds", [])

    if not version:
        raise HTTPException(status_code=400, detail="version required")

    # Get task data
    task_list = []
    for task_id in task_ids:
        if task_id in tasks:
            task = tasks[task_id]
            task_list.append({
                "id": task_id,
                "title": task.title,
                "description": task.description,
                "version_impact": "patch",
                "is_breaking": False
            })

    try:
        import sys
        auto_claude_path = Path("/app/auto-claude")
        if str(auto_claude_path) not in sys.path:
            sys.path.insert(0, str(auto_claude_path))

        from core.release_manager import get_release_manager

        manager = get_release_manager(project.path)
        result = manager.create_release(version, task_list, release_notes)

        if result.success:
            # Create release record in database
            ReleaseService.create({
                "version": version,
                "branch_name": f"release/{version}",
                "status": "candidate",
                "release_notes": release_notes or (result.release.release_notes if result.release else None),
                "created_at": datetime.utcnow()
            })

            # Associate tasks with release
            for task_id in task_ids:
                TaskService.update(task_id, {"release_version": version})
                ReleaseService.add_task(version, task_id)

            return {
                "success": True,
                "data": {
                    "version": version,
                    "branch": f"release/{version}",
                    "status": "candidate",
                    "releaseNotes": result.release.release_notes if result.release else None
                }
            }
        else:
            return {"success": False, "error": result.message}
    except Exception as e:
        return {"success": False, "error": str(e)}


@app.get("/api/releases/{version}")
async def get_release(version: str, project_id: str):
    """
    Get details of a specific release.

    Args:
        version: Version string
        project_id: Project ID (query param)

    Returns:
        Release info
    """
    if project_id not in projects:
        raise HTTPException(status_code=404, detail="Project not found")

    project = projects[project_id]

    try:
        import sys
        auto_claude_path = Path("/app/auto-claude")
        if str(auto_claude_path) not in sys.path:
            sys.path.insert(0, str(auto_claude_path))

        from core.release_manager import get_release_manager

        manager = get_release_manager(project.path)
        release = manager.get_release(version)

        if release:
            # Also get database record for additional info
            db_release = ReleaseService.get_by_version(version)
            if db_release:
                release["releaseNotes"] = db_release.get("release_notes")
                release["tasks"] = ReleaseService.get_tasks(version)

            return {"success": True, "data": release}
        else:
            return {"success": False, "error": "Release not found"}
    except Exception as e:
        return {"success": False, "error": str(e)}


@app.post("/api/releases/{version}/promote")
async def promote_release(version: str, project_id: str, promote_data: dict = {}):
    """
    Promote a release to main.

    Args:
        version: Version to promote
        project_id: Project ID (query param)
        promote_data: createTag, backMerge options

    Returns:
        Promotion result
    """
    if project_id not in projects:
        raise HTTPException(status_code=404, detail="Project not found")

    project = projects[project_id]
    create_tag = promote_data.get("createTag", True)
    back_merge = promote_data.get("backMerge", True)

    try:
        import sys
        auto_claude_path = Path("/app/auto-claude")
        if str(auto_claude_path) not in sys.path:
            sys.path.insert(0, str(auto_claude_path))

        from core.release_manager import get_release_manager

        manager = get_release_manager(project.path)
        result = manager.promote_to_main(version, create_tag, back_merge)

        if result.success:
            # Update database
            ReleaseService.update(version, {
                "status": "promoted",
                "promoted_at": datetime.utcnow()
            })

            return {
                "success": True,
                "data": {
                    "message": result.message,
                    "tag": result.tag,
                    "commitSha": result.commit_sha
                }
            }
        else:
            return {"success": False, "error": result.message}
    except Exception as e:
        return {"success": False, "error": str(e)}


@app.delete("/api/releases/{version}")
async def abandon_release(version: str, project_id: str):
    """
    Abandon a release candidate.

    Args:
        version: Version to abandon
        project_id: Project ID (query param)

    Returns:
        Abandon result
    """
    if project_id not in projects:
        raise HTTPException(status_code=404, detail="Project not found")

    project = projects[project_id]

    try:
        import sys
        auto_claude_path = Path("/app/auto-claude")
        if str(auto_claude_path) not in sys.path:
            sys.path.insert(0, str(auto_claude_path))

        from core.release_manager import get_release_manager

        manager = get_release_manager(project.path)
        result = manager.abandon_release(version)

        if result.success:
            ReleaseService.update(version, {"status": "abandoned"})
            return {"success": True, "data": {"message": result.message}}
        else:
            return {"success": False, "error": result.message}
    except Exception as e:
        return {"success": False, "error": str(e)}


@app.get("/api/projects/{project_id}/version/current")
async def get_current_version(project_id: str):
    """
    Get the current version for a project.

    Args:
        project_id: Project ID

    Returns:
        Current version string
    """
    if project_id not in projects:
        raise HTTPException(status_code=404, detail="Project not found")

    project = projects[project_id]

    try:
        import sys
        auto_claude_path = Path("/app/auto-claude")
        if str(auto_claude_path) not in sys.path:
            sys.path.insert(0, str(auto_claude_path))

        from core.release_manager import get_release_manager

        manager = get_release_manager(project.path)
        version = manager.get_current_version()

        return {"success": True, "data": {"version": version or "0.0.0"}}
    except Exception as e:
        return {"success": False, "error": str(e)}


@app.post("/api/projects/{project_id}/version/next")
async def get_next_version(project_id: str, version_data: dict = {}):
    """
    Calculate the next version based on tasks.

    Args:
        project_id: Project ID
        version_data: taskIds to include

    Returns:
        Version calculation result
    """
    if project_id not in projects:
        raise HTTPException(status_code=404, detail="Project not found")

    project = projects[project_id]
    task_ids = version_data.get("taskIds", [])

    # Get task data
    task_list = []
    for task_id in task_ids:
        if task_id in tasks:
            task = tasks[task_id]
            task_list.append({
                "id": task_id,
                "title": task.title,
                "description": task.description,
                "version_impact": "patch",
                "is_breaking": False
            })

    try:
        import sys
        auto_claude_path = Path("/app/auto-claude")
        if str(auto_claude_path) not in sys.path:
            sys.path.insert(0, str(auto_claude_path))

        from core.release_manager import get_release_manager

        manager = get_release_manager(project.path)
        result = manager.get_next_version(task_list)

        return {"success": True, "data": result}
    except Exception as e:
        return {"success": False, "error": str(e)}


# ============================================================================
# Task Logs
# ============================================================================

@app.get("/api/tasks/{task_id}/logs")
async def get_task_logs(task_id: str):
    """Get logs for a task"""
    if task_id not in tasks:
        raise HTTPException(status_code=404, detail="Task not found")

    task = tasks[task_id]

    # Get project path to find logs
    project_path = None
    if task.project_id in projects:
        project_path = projects[task.project_id].path

    if not project_path:
        return {"success": True, "data": {"phases": {}}}

    # Read task_logs.json
    logs_path = Path(project_path) / ".auto-claude" / "specs" / task_id / "task_logs.json"

    if not logs_path.exists():
        return {"success": True, "data": {"phases": {}}}

    try:
        with open(logs_path) as f:
            logs_data = json.load(f)

        # Return in the format the frontend expects
        return {
            "success": True,
            "data": {
                "phases": logs_data.get("phases", {})
            }
        }
    except Exception as e:
        print(f"[Logs] Error reading logs for task {task_id}: {e}")
        return {"success": True, "data": {"phases": {}}}

# Build Management
@app.post("/api/build/start")
async def start_build(build_req: BuildRequest):
    """Start an autonomous build"""
    spec_id = build_req.spec_id
    
    if spec_id in active_builds:
        raise HTTPException(status_code=400, detail="Build already running")
    
    # Construct Python command
    cmd = [
        "python3", 
        "auto-claude/run.py",
        "--spec", spec_id,
        "--project", build_req.project_path
    ]
    
    if build_req.auto_merge:
        cmd.append("--auto-merge")
    
    # Start process (non-blocking)
    proc = subprocess.Popen(
        cmd,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        cwd="/app"
    )
    
    active_builds[spec_id] = proc
    
    return {
        "success": True,
        "spec_id": spec_id,
        "message": "Build started"
    }

@app.post("/api/build/{spec_id}/stop")
async def stop_build(spec_id: str):
    """Stop a running build"""
    if spec_id not in active_builds:
        raise HTTPException(status_code=404, detail="Build not found")
    
    proc = active_builds[spec_id]
    proc.terminate()
    proc.wait(timeout=10)
    
    del active_builds[spec_id]
    
    return {"success": True, "message": "Build stopped"}

@app.get("/api/build/{spec_id}/status")
async def build_status(spec_id: str):
    """Get build status"""
    is_running = spec_id in active_builds
    
    # Check for completion artifacts
    spec_dir = Path(f"/projects/.auto-claude/specs/{spec_id}")
    status = "unknown"
    
    if spec_dir.exists():
        if (spec_dir / "qa_report.json").exists():
            status = "qa_complete"
        elif (spec_dir / "implementation_plan.json").exists():
            status = "coding"
        elif (spec_dir / "spec.md").exists():
            status = "spec_created"
    
    return {
        "spec_id": spec_id,
        "running": is_running,
        "status": status
    }

# ============================================================================
# WebSocket for Real-time Build Progress
# ============================================================================

@app.websocket("/ws/build/{spec_id}")
async def websocket_build_progress(websocket: WebSocket, spec_id: str):
    """
    Stream real-time build progress to frontend
    Replaces Electron IPC communication
    """
    await manager.connect(websocket, spec_id)

    try:
        # Find the project for this task
        project_path = None
        if spec_id in tasks:
            project_id = tasks[spec_id].project_id
            if project_id in projects:
                project_path = projects[project_id].path

        last_log_count = 0
        last_status = None

        # Monitor task progress by polling task_logs.json
        while True:
            try:
                # Check if task is still running
                is_running = spec_id in active_builds

                # Read status from task_logs.json (primary source of progress)
                if project_path:
                    logs_path = Path(project_path) / ".auto-claude" / "specs" / spec_id / "task_logs.json"
                    if not logs_path.exists():
                        logs_path = Path(project_path) / ".worktrees" / spec_id / ".auto-claude" / "specs" / spec_id / "task_logs.json"

                    if logs_path.exists():
                        with open(logs_path) as f:
                            logs_data = json.load(f)

                        # Determine current phase and status from phases
                        phases = logs_data.get("phases", {})
                        current_phase = "planning"
                        completed_phases = 0
                        total_phases = len(phases) if isinstance(phases, dict) else 0

                        if isinstance(phases, dict):
                            for phase_name, phase_data in phases.items():
                                if isinstance(phase_data, dict):
                                    phase_status = phase_data.get("status", "pending")
                                    if phase_status == "completed":
                                        completed_phases += 1
                                    elif phase_status in ["in_progress", "running"]:
                                        current_phase = phase_name
                        elif isinstance(phases, list):
                            # Phases is a list of phase names that have been started
                            total_phases = 3  # planning, coding, validation
                            completed_phases = len(phases) - 1 if phases else 0
                            current_phase = phases[-1] if phases else "planning"

                        # Send status update if changed
                        status_key = f"{current_phase}_{completed_phases}"
                        if status_key != last_status:
                            last_status = status_key

                            # Always send in_progress while running
                            await manager.send_message({
                                "type": "status",
                                "data": "in_progress"
                            }, spec_id)

                            # Send execution progress to per-task WebSocket
                            await manager.send_message({
                                "type": "execution_progress",
                                "data": {
                                    "phase": current_phase,
                                    "completed": completed_phases,
                                    "total": max(total_phases, 3),
                                    "inProgress": 1 if is_running else 0
                                }
                            }, spec_id)

                            # Also broadcast to project-level subscription for TaskCard updates
                            if spec_id in tasks:
                                task = tasks[spec_id]
                                from .websocket_handler import ws_manager
                                if ws_manager:
                                    await ws_manager.broadcast_event(
                                        f"project.{task.project_id}.tasks",
                                        {
                                            "action": "updated",
                                            "task": {
                                                "id": spec_id,
                                                "specId": spec_id,
                                                "projectId": task.project_id,
                                                "status": "in_progress",
                                                "executionProgress": {
                                                    "phase": current_phase,
                                                    "completed": completed_phases,
                                                    "total": max(total_phases, 3),
                                                    "inProgress": 1 if is_running else 0
                                                }
                                            }
                                        }
                                    )

                        # Get all log entries from phases
                        all_entries = []
                        if isinstance(phases, dict):
                            for phase_data in phases.values():
                                if isinstance(phase_data, dict):
                                    all_entries.extend(phase_data.get("entries", []))

                        # Send new log entries
                        if len(all_entries) > last_log_count:
                            for entry in all_entries[last_log_count:]:
                                log_content = entry.get("content", "") if isinstance(entry, dict) else str(entry)
                                await manager.send_message({
                                    "type": "log",
                                    "data": log_content
                                }, spec_id)
                            last_log_count = len(all_entries)

                # If task completed and no longer running, send final status
                if not is_running:
                    # Check if task is truly done (not just starting)
                    if last_log_count > 0:
                        await manager.send_message({
                            "type": "complete",
                            "data": {"status": "human_review"}
                        }, spec_id)

                        # Update task status
                        if spec_id in tasks:
                            tasks[spec_id].status = "human_review"
                            _save_tasks()
                        break

                await asyncio.sleep(1)  # Poll every second

            except Exception as e:
                print(f"[WebSocket] Error reading task status: {e}")
                await asyncio.sleep(2)

    except WebSocketDisconnect:
        manager.disconnect(spec_id)
        print(f"WebSocket disconnected: {spec_id}")

@app.websocket("/ws/terminal/{session_id}")
async def websocket_terminal(websocket: WebSocket, session_id: str):
    """
    Terminal session WebSocket for Claude Code agents
    """
    await manager.connect(websocket, f"terminal-{session_id}")
    
    try:
        # Handle terminal input/output
        while True:
            data = await websocket.receive_json()
            
            if data.get("type") == "input":
                # Send to Claude Code terminal
                # (Implement terminal multiplexing here)
                pass
                
    except WebSocketDisconnect:
        manager.disconnect(f"terminal-{session_id}")

# ============================================================================
# Spec Runner Integration
# ============================================================================

@app.post("/api/spec/create")
async def create_spec(project_path: str, description: str):
    """Run interactive spec creation"""
    cmd = [
        "python3",
        "auto-claude/spec_runner.py",
        "--project", project_path,
        "--description", description
    ]
    
    proc = subprocess.run(cmd, capture_output=True, text=True)
    
    if proc.returncode == 0:
        # Parse spec ID from output
        spec_id = proc.stdout.strip().split()[-1]
        return {"success": True, "spec_id": spec_id}
    else:
        raise HTTPException(status_code=500, detail=proc.stderr)

# ============================================================================
# File System Operations
# ============================================================================

@app.get("/api/files/{project_id}")
async def list_project_files(project_id: str):
    """List files in project directory"""
    if project_id not in projects:
        raise HTTPException(status_code=404, detail="Project not found")
    
    project = projects[project_id]
    project_path = Path(project.path)
    
    files = []
    for file in project_path.rglob("*"):
        if file.is_file() and not any(p.startswith('.') for p in file.parts):
            files.append({
                "path": str(file.relative_to(project_path)),
                "size": file.stat().st_size
            })
    
    return {"files": files}

@app.get("/api/context/{project_id}")
async def get_project_context(project_id: str):
    """Get Auto-Claude's context understanding of project"""
    if project_id not in projects:
        raise HTTPException(status_code=404, detail="Project not found")
    
    project = projects[project_id]
    context_file = Path(project.path) / ".auto-claude" / "context.json"
    
    if not context_file.exists():
        return {"context": None}
    
    with open(context_file) as f:
        context = json.load(f)
    
    return {"context": context}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
