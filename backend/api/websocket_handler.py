"""
Unified WebSocket handler for all frontend-backend communication.
Handles commands, responses, and real-time events.

Protocol:
- Request:  {"id": "uuid", "type": "command", "action": "namespace.method", "payload": {...}}
- Response: {"id": "uuid", "type": "response", "success": true/false, "data": {...}, "error": "..."}
- Event:    {"type": "event", "event": "namespace.eventName", "data": {...}}
"""

from fastapi import WebSocket, WebSocketDisconnect
from typing import Dict, Any, Callable, Optional
import json
import asyncio
import traceback
import subprocess
from datetime import datetime
from pathlib import Path
from pydantic import BaseModel


def serialize_for_json(obj: Any) -> Any:
    """Convert Pydantic models and other objects to JSON-serializable format."""
    if obj is None:
        return None
    if isinstance(obj, BaseModel):
        return obj.model_dump()
    if isinstance(obj, datetime):
        return obj.isoformat()
    if isinstance(obj, list):
        return [serialize_for_json(item) for item in obj]
    if isinstance(obj, dict):
        return {k: serialize_for_json(v) for k, v in obj.items()}
    return obj


class WebSocketManager:
    """Manages WebSocket connections and message routing."""

    def __init__(self):
        self.connections: Dict[str, WebSocket] = {}
        self.handlers: Dict[str, Callable] = {}
        self.subscriptions: Dict[str, set] = {}  # event_type -> set of connection_ids

    def register_handler(self, action: str, handler: Callable):
        """Register a handler for a specific action."""
        self.handlers[action] = handler

    async def connect(self, websocket: WebSocket, connection_id: str):
        """Accept a new WebSocket connection."""
        await websocket.accept()
        self.connections[connection_id] = websocket
        print(f"[WS] Client connected: {connection_id}")

    def disconnect(self, connection_id: str):
        """Remove a WebSocket connection."""
        if connection_id in self.connections:
            del self.connections[connection_id]
        # Remove from all subscriptions
        for subs in self.subscriptions.values():
            subs.discard(connection_id)
        print(f"[WS] Client disconnected: {connection_id}")

    def subscribe(self, connection_id: str, event_type: str):
        """Subscribe a connection to an event type."""
        if event_type not in self.subscriptions:
            self.subscriptions[event_type] = set()
        self.subscriptions[event_type].add(connection_id)

    def unsubscribe(self, connection_id: str, event_type: str):
        """Unsubscribe a connection from an event type."""
        if event_type in self.subscriptions:
            self.subscriptions[event_type].discard(connection_id)

    async def send_response(self, websocket: WebSocket, request_id: str, success: bool,
                           data: Any = None, error: str = None):
        """Send a response to a specific request."""
        response = {
            "id": request_id,
            "type": "response",
            "success": success
        }
        if data is not None:
            response["data"] = serialize_for_json(data)
        if error is not None:
            response["error"] = error
        # Use custom JSON serialization to handle datetime, etc.
        await websocket.send_text(json.dumps(response, default=str))

    async def broadcast_event(self, event_type: str, data: Any):
        """Broadcast an event to all subscribed connections."""
        # Collect all subscribers: exact match + wildcard '*' subscribers
        all_subscribers = set()
        if event_type in self.subscriptions:
            all_subscribers.update(self.subscriptions[event_type])
        if '*' in self.subscriptions:
            all_subscribers.update(self.subscriptions['*'])

        if not all_subscribers:
            return

        dead_connections = []
        for conn_id in all_subscribers:
            if conn_id in self.connections:
                try:
                    event_msg = {
                        "type": "event",
                        "event": event_type,
                        "data": serialize_for_json(data)
                    }
                    await self.connections[conn_id].send_text(json.dumps(event_msg, default=str))
                except Exception as e:
                    dead_connections.append(conn_id)
            else:
                dead_connections.append(conn_id)

        # Clean up dead connections
        for conn_id in dead_connections:
            self.disconnect(conn_id)

    async def send_event(self, connection_id: str, event_type: str, data: Any):
        """Send an event to a specific connection."""
        if connection_id in self.connections:
            try:
                event_msg = {
                    "type": "event",
                    "event": event_type,
                    "data": serialize_for_json(data)
                }
                await self.connections[connection_id].send_text(json.dumps(event_msg, default=str))
            except Exception:
                self.disconnect(connection_id)

    async def broadcast_to_all(self, event_type: str, data: Any):
        """Broadcast an event to ALL connected clients (not just subscribed ones)."""
        dead_connections = []
        event_msg = {
            "type": "event",
            "event": event_type,
            "data": serialize_for_json(data)
        }
        msg_text = json.dumps(event_msg, default=str)

        for conn_id, websocket in list(self.connections.items()):
            try:
                await websocket.send_text(msg_text)
            except Exception:
                dead_connections.append(conn_id)

        # Clean up dead connections
        for conn_id in dead_connections:
            self.disconnect(conn_id)

    async def handle_message(self, websocket: WebSocket, connection_id: str, message: dict):
        """Route an incoming message to the appropriate handler."""
        msg_type = message.get("type")
        print(f"[WS] Received message type={msg_type}: {message.get('action', message.get('event', 'N/A'))}")

        if msg_type == "command":
            action = message.get("action")
            request_id = message.get("id", "unknown")
            payload = message.get("payload", {})

            if action in self.handlers:
                try:
                    print(f"[WS] Handling {action} with payload: {payload}")
                    result = await self.handlers[action](connection_id, payload)
                    print(f"[WS] {action} returned: {type(result).__name__}")
                    await self.send_response(websocket, request_id, True, result)
                except Exception as e:
                    print(f"[WS] Error handling {action}: {e}")
                    traceback.print_exc()
                    await self.send_response(websocket, request_id, False, error=str(e))
            else:
                print(f"[WS] Unknown action: {action}")
                await self.send_response(websocket, request_id, False,
                                        error=f"Unknown action: {action}")

        elif msg_type == "subscribe":
            event_type = message.get("event")
            if event_type:
                print(f"[WS] Subscribe request: {connection_id} -> {event_type}")
                self.subscribe(connection_id, event_type)
                print(f"[WS] Subscriptions now: {dict((k, list(v)) for k, v in self.subscriptions.items())}")
                await self.send_response(websocket, message.get("id", ""), True,
                                        {"subscribed": event_type})

        elif msg_type == "unsubscribe":
            event_type = message.get("event")
            if event_type:
                self.unsubscribe(connection_id, event_type)
                await self.send_response(websocket, message.get("id", ""), True,
                                        {"unsubscribed": event_type})


# Global manager instance
ws_manager = WebSocketManager()


def register_handlers(app_state: dict):
    """Register all command handlers with access to app state."""

    # Import here to avoid circular imports
    from . import main as api_main

    # =========================================================================
    # TASKS
    # =========================================================================

    async def tasks_list(conn_id: str, payload: dict) -> list:
        """List tasks for a project."""
        project_id = payload.get("projectId")
        if not project_id:
            raise ValueError("projectId required")

        # Reuse the REST endpoint logic
        result = await api_main.list_tasks(project_id)
        return result

    async def tasks_create(conn_id: str, payload: dict) -> dict:
        """Create a new task."""
        from .main import TaskCreateRequest
        request = TaskCreateRequest(**payload)
        result = await api_main.create_task(request)
        # Broadcast task created event
        await ws_manager.broadcast_event(f"project.{payload['projectId']}.tasks", {
            "action": "created",
            "task": result.get("task")
        })
        return result

    async def tasks_update(conn_id: str, payload: dict) -> dict:
        """Update a task."""
        task_id = payload.get("taskId")
        updates = {k: v for k, v in payload.items() if k != "taskId"}
        result = await api_main.update_task(task_id, updates)
        return result

    async def tasks_delete(conn_id: str, payload: dict) -> dict:
        """Delete a task."""
        task_id = payload.get("taskId")

        # Get project_id before deletion
        project_id = None
        if task_id in api_main.tasks:
            project_id = api_main.tasks[task_id].project_id

        result = await api_main.delete_task(task_id)

        # Broadcast task deletion
        if project_id:
            await ws_manager.broadcast_event(f"project.{project_id}.tasks", {
                "action": "deleted",
                "taskId": task_id
            })

        return result

    async def tasks_start(conn_id: str, payload: dict) -> dict:
        """Start a task."""
        task_id = payload.get("taskId")
        result = await api_main.start_task(task_id)
        # Auto-subscribe to task events
        ws_manager.subscribe(conn_id, f"task.{task_id}")

        # Broadcast task status change to in_progress
        if task_id in api_main.tasks:
            task = api_main.tasks[task_id]
            await ws_manager.broadcast_event(f"project.{task.project_id}.tasks", {
                "action": "updated",
                "task": {
                    "id": task_id,
                    "specId": task.spec_id,
                    "projectId": task.project_id,
                    "status": task.status,
                    "title": task.title
                }
            })

        return result.get("data", result)

    async def tasks_stop(conn_id: str, payload: dict) -> dict:
        """Stop a task."""
        task_id = payload.get("taskId")
        result = await api_main.stop_task(task_id)

        # Broadcast task status change back to backlog
        if task_id in api_main.tasks:
            task = api_main.tasks[task_id]
            await ws_manager.broadcast_event(f"project.{task.project_id}.tasks", {
                "action": "updated",
                "task": {
                    "id": task_id,
                    "specId": task.spec_id,
                    "projectId": task.project_id,
                    "status": task.status,
                    "title": task.title
                }
            })

        return result

    async def tasks_get_logs(conn_id: str, payload: dict) -> dict:
        """Get task logs."""
        project_id = payload.get("projectId")
        spec_id = payload.get("specId")
        # The backend get_task_logs uses task_id which is the same as spec_id
        result = await api_main.get_task_logs(spec_id)
        return result.get("data", {})

    async def tasks_check_running(conn_id: str, payload: dict) -> dict:
        """Check if task is running."""
        task_id = payload.get("taskId")
        result = await api_main.is_task_running(task_id)
        return result.get("data", {})

    async def tasks_review(conn_id: str, payload: dict) -> dict:
        """Submit task review."""
        task_id = payload.get("taskId")
        review_data = {
            "approved": payload.get("approved", False),
            "feedback": payload.get("feedback")
        }
        result = await api_main.submit_task_review(task_id, review_data)

        # Broadcast task status change
        if task_id in api_main.tasks:
            task = api_main.tasks[task_id]
            await ws_manager.broadcast_event(f"project.{task.project_id}.tasks", {
                "action": "updated",
                "task": {
                    "id": task_id,
                    "specId": task.spec_id,
                    "projectId": task.project_id,
                    "status": task.status,
                    "title": task.title,
                    "description": task.description  # Include updated description with feedback
                }
            })

        return result

    async def tasks_recover(conn_id: str, payload: dict) -> dict:
        """Recover stuck task."""
        task_id = payload.get("taskId")
        # recover_task only takes task_id in current implementation
        result = await api_main.recover_task(task_id)

        # Broadcast task status change
        if task_id in api_main.tasks:
            task = api_main.tasks[task_id]
            await ws_manager.broadcast_event(f"project.{task.project_id}.tasks", {
                "action": "updated",
                "task": {
                    "id": task_id,
                    "specId": task.spec_id,
                    "projectId": task.project_id,
                    "status": task.status,
                    "title": task.title
                }
            })

        return result.get("data", result)

    async def tasks_archive(conn_id: str, payload: dict) -> dict:
        """Archive tasks."""
        task_ids = payload.get("taskIds", [])

        class ArchiveRequest:
            def __init__(self, taskIds):
                self.taskIds = taskIds

        request = ArchiveRequest(task_ids)
        result = await api_main.archive_tasks(request)
        return result.get("data", result)

    async def tasks_unarchive(conn_id: str, payload: dict) -> dict:
        """Unarchive tasks."""
        task_ids = payload.get("taskIds", [])

        class UnarchiveRequest:
            def __init__(self, taskIds):
                self.taskIds = taskIds

        request = UnarchiveRequest(task_ids)
        result = await api_main.unarchive_tasks(request)
        return result.get("data", result)

    async def tasks_update_status(conn_id: str, payload: dict) -> dict:
        """Update task status."""
        task_id = payload.get("taskId")
        status = payload.get("status")

        class StatusRequest:
            def __init__(self, status):
                self.status = status

        request = StatusRequest(status)
        result = await api_main.update_task_status(task_id, request)
        return result

    # =========================================================================
    # PROJECTS
    # =========================================================================

    async def projects_list(conn_id: str, payload: dict) -> list:
        """List all projects."""
        result = await api_main.list_projects()
        return result

    async def projects_create(conn_id: str, payload: dict) -> dict:
        """Create/add a project."""
        from .main import ProjectCreateRequest
        request = ProjectCreateRequest(**payload)
        result = await api_main.create_project(request)
        return result

    async def projects_delete(conn_id: str, payload: dict) -> dict:
        """Delete a project."""
        project_id = payload.get("projectId")
        result = await api_main.delete_project(project_id)
        return result

    async def projects_get_directory(conn_id: str, payload: dict) -> dict:
        """List directory contents."""
        project_id = payload.get("projectId")
        path = payload.get("path", "")
        result = await api_main.list_project_directory(project_id, path)
        return result.get("data", result)

    async def projects_update_settings(conn_id: str, payload: dict) -> dict:
        """Update project settings."""
        project_id = payload.get("projectId")
        settings = payload.get("settings", {})

        class SettingsRequest:
            def __init__(self, settings):
                self.settings = settings

        request = SettingsRequest(settings)
        result = await api_main.update_project_settings(project_id, request)
        return result

    async def projects_initialize(conn_id: str, payload: dict) -> dict:
        """Initialize auto-claude in project."""
        project_id = payload.get("projectId")
        if not project_id:
            return {"success": False, "error": "projectId is required"}

        try:
            result = await api_main.initialize_project(project_id)
            # Ensure success field is always present
            if "success" not in result:
                result["success"] = True
            return result
        except Exception as e:
            print(f"[WS] projects.initialize error: {e}")
            return {"success": False, "error": str(e)}

    async def projects_get_tab_state(conn_id: str, payload: dict) -> dict:
        """Get tab state."""
        result = await api_main.get_tab_state()
        return result.get("data", result)

    async def projects_save_tab_state(conn_id: str, payload: dict) -> dict:
        """Save tab state."""
        from .main import TabState
        request = TabState(**payload)
        result = await api_main.save_tab_state_endpoint(request)
        return result

    async def projects_create_folder(conn_id: str, payload: dict) -> dict:
        """Create project folder."""
        from .main import ProjectCreateFolderRequest
        request = ProjectCreateFolderRequest(**payload)
        result = await api_main.create_project_folder(request)
        return result.get("data", result)

    async def projects_get_default_location(conn_id: str, payload: dict) -> dict:
        """Get default project location."""
        result = await api_main.get_default_project_location()
        return result

    async def projects_get_version(conn_id: str, payload: dict) -> dict:
        """Get auto-claude version."""
        project_id = payload.get("projectId")
        result = await api_main.check_project_version(project_id)
        return result.get("data", result)

    async def projects_update_auto_build(conn_id: str, payload: dict) -> dict:
        """Update auto-build."""
        project_id = payload.get("projectId")
        result = await api_main.update_project_auto_build(project_id)
        return result.get("data", result)

    # =========================================================================
    # SETTINGS
    # =========================================================================

    async def settings_get(conn_id: str, payload: dict) -> dict:
        """Get app settings."""
        result = await api_main.get_settings()
        return result

    async def settings_update(conn_id: str, payload: dict) -> dict:
        """Update app settings."""
        result = await api_main.update_settings(payload)
        return result

    # =========================================================================
    # GIT
    # =========================================================================

    async def git_status(conn_id: str, payload: dict) -> dict:
        """Get git status."""
        from .git import get_git_status
        project_id = payload.get("projectId")
        result = await get_git_status(project_id)
        return result.get("data", result)

    async def git_branches(conn_id: str, payload: dict) -> dict:
        """List git branches."""
        from .git import get_branches
        project_id = payload.get("projectId")
        result = await get_branches(project_id)
        return result.get("data", result)

    async def git_current_branch(conn_id: str, payload: dict) -> dict:
        """Get current branch."""
        from .git import get_current_branch
        project_id = payload.get("projectId")
        result = await get_current_branch(project_id)
        return result.get("data", result)

    async def git_main_branch(conn_id: str, payload: dict) -> dict:
        """Get main branch."""
        from .git import get_main_branch
        project_id = payload.get("projectId")
        result = await get_main_branch(project_id)
        return result.get("data", result)

    async def git_initialize(conn_id: str, payload: dict) -> dict:
        """Initialize git repo."""
        from .git import initialize_git
        project_id = payload.get("projectId")
        result = await initialize_git(project_id)
        return result.get("data", result)

    async def git_skip_setup(conn_id: str, payload: dict) -> dict:
        """Skip git setup."""
        from .git import skip_git_setup
        project_id = payload.get("projectId")
        result = await skip_git_setup(project_id)
        return result.get("data", result)

    async def git_clone(conn_id: str, payload: dict) -> dict:
        """Clone a git repository and create a project for it."""
        import subprocess
        import os

        url = payload.get("url")
        target_dir = "/projects"  # Always use the projects directory
        project_name = payload.get("name")

        if not url:
            return {"success": False, "error": "Git URL is required"}

        # Extract repo name from URL if not provided
        if not project_name:
            # Handle various URL formats
            # https://github.com/user/repo.git -> repo
            # git@github.com:user/repo.git -> repo
            if url.endswith(".git"):
                url_part = url[:-4]
            else:
                url_part = url
            project_name = url_part.split("/")[-1].split(":")[-1]

        # Sanitize project name
        project_name = project_name.strip().replace(" ", "-")

        # Full path for the cloned repo
        clone_path = os.path.join(target_dir, project_name)

        # Check if directory already exists
        if os.path.exists(clone_path):
            return {"success": False, "error": f"A project with this name already exists"}

        # Ensure target directory exists
        os.makedirs(target_dir, exist_ok=True)

        try:
            # Set up gh as git credential helper for private repos
            subprocess.run(
                ["gh", "auth", "setup-git"],
                capture_output=True,
                text=True,
                timeout=30
            )

            # Clone the repository
            result = subprocess.run(
                ["git", "clone", url, clone_path],
                capture_output=True,
                text=True,
                timeout=300  # 5 minute timeout
            )

            if result.returncode != 0:
                error_msg = result.stderr.strip() or "Git clone failed"
                if "could not read Username" in error_msg:
                    error_msg = "Authentication failed. Please ensure you're logged in with GitHub and have access to this repository."
                elif "Repository not found" in error_msg:
                    error_msg = "Repository not found. Please check the URL and ensure you have access."
                return {"success": False, "error": error_msg}

            # Now create the project entry
            from .main import ProjectCreateRequest, create_project
            from .git import detect_main_branch

            # Create project with default settings
            project_request = ProjectCreateRequest(path=clone_path, settings={})
            project = await create_project(project_request)

            # Detect and set main branch
            try:
                main_branch_result = await detect_main_branch(project["id"])
                if main_branch_result.get("success") and main_branch_result.get("data", {}).get("branch"):
                    # Update project settings with main branch
                    project_id = project["id"]
                    if project_id in api_main.projects:
                        api_main.projects[project_id].settings["mainBranch"] = main_branch_result["data"]["branch"]
                        api_main._save_projects()
            except Exception as e:
                print(f"[git.clone] Failed to detect main branch: {e}")

            # Try to import state from git state branch first
            try:
                if api_main._import_project_state(project["id"]):
                    print(f"[git.clone] Imported state from git state branch")
                else:
                    # Fall back to syncing tasks from disk
                    api_main._sync_tasks_from_disk()
                    print(f"[git.clone] Synced tasks from disk (no state branch)")
            except Exception as e:
                print(f"[git.clone] Failed to import/sync tasks: {e}")
                # Try disk sync as fallback
                try:
                    api_main._sync_tasks_from_disk()
                except:
                    pass

            # Check branch model and suggest migration if needed
            branch_model_info = None
            try:
                from core.branch_migration import BranchMigrationChecker
                checker = BranchMigrationChecker(Path(clone_path))
                check_result = checker.check()
                branch_model_info = {
                    "model": check_result.current_model.value,
                    "needsMigration": check_result.needs_migration,
                    "message": check_result.message,
                }
                print(f"[git.clone] Branch model check for {clone_path}:")
                print(f"  Model: {check_result.current_model.value}")
                print(f"  Needs migration: {check_result.needs_migration}")
                print(f"  Main: {check_result.status.main_branch}")
                print(f"  Dev: {check_result.status.dev_branch}")
                print(f"  Worktree branches: {check_result.status.worktree_branches}")
            except Exception as e:
                print(f"[git.clone] Failed to check branch model: {e}")
                import traceback
                traceback.print_exc()

            return {
                "success": True,
                "project": project,
                "message": f"Successfully cloned {url}",
                "branchModel": branch_model_info,
            }
        except subprocess.TimeoutExpired:
            # Clean up partial clone
            if os.path.exists(clone_path):
                import shutil
                shutil.rmtree(clone_path, ignore_errors=True)
            return {"success": False, "error": "Clone operation timed out after 5 minutes"}
        except Exception as e:
            # Clean up partial clone
            if os.path.exists(clone_path):
                import shutil
                shutil.rmtree(clone_path, ignore_errors=True)
            return {"success": False, "error": str(e)}

    # =========================================================================
    # PROFILES
    # =========================================================================

    async def profiles_list(conn_id: str, payload: dict) -> dict:
        """List profiles."""
        from .profiles import get_profiles
        result = await get_profiles()
        return result

    async def profiles_create(conn_id: str, payload: dict) -> dict:
        """Create/update profile."""
        from .profiles import save_profile, ProfileData
        profile = ProfileData(**payload)
        result = await save_profile(profile)
        return result.get("data", result)

    async def profiles_delete(conn_id: str, payload: dict) -> dict:
        """Delete profile."""
        from .profiles import delete_profile
        profile_id = payload.get("profileId")
        result = await delete_profile(profile_id)
        return result

    async def profiles_activate(conn_id: str, payload: dict) -> dict:
        """Activate profile."""
        from .profiles import activate_profile
        profile_id = payload.get("profileId")
        result = await activate_profile(profile_id)
        return result

    async def profiles_set_token(conn_id: str, payload: dict) -> dict:
        """Set profile token."""
        from .profiles import set_profile_token
        profile_id = payload.get("profileId")

        class TokenRequest:
            def __init__(self, token, email=None):
                self.token = token
                self.email = email

        request = TokenRequest(payload.get("token"), payload.get("email"))
        result = await set_profile_token(profile_id, request)
        return result

    async def profiles_get_usage(conn_id: str, payload: dict) -> dict:
        """Get profile usage."""
        from .profiles import get_profile_usage
        profile_id = payload.get("profileId")
        result = await get_profile_usage(profile_id)
        return result.get("data", result)

    async def profiles_refresh_usage(conn_id: str, payload: dict) -> dict:
        """Refresh profile usage."""
        from .profiles import refresh_usage
        profile_id = payload.get("profileId")
        result = await refresh_usage(profile_id)
        return result.get("data", result)

    async def profiles_get_auto_switch_settings(conn_id: str, payload: dict) -> dict:
        """Get auto-switch settings."""
        from .profiles import get_auto_switch_settings
        result = await get_auto_switch_settings()
        return result.get("data", result)

    async def profiles_update_auto_switch_settings(conn_id: str, payload: dict) -> dict:
        """Update auto-switch settings."""
        from .profiles import update_auto_switch_settings
        result = await update_auto_switch_settings(payload)
        return result

    # =========================================================================
    # OAUTH
    # =========================================================================

    async def oauth_initiate(conn_id: str, payload: dict) -> dict:
        """Initiate OAuth flow."""
        from .oauth import initiate_oauth
        profile_id = payload.get("profileId")
        result = await initiate_oauth(profile_id)
        return result

    async def oauth_status(conn_id: str, payload: dict) -> dict:
        """Check OAuth status."""
        from .oauth import check_oauth_status
        profile_id = payload.get("profileId")
        result = await check_oauth_status(profile_id)
        return result

    # =========================================================================
    # GITHUB
    # =========================================================================

    async def github_auth_status(conn_id: str, payload: dict) -> dict:
        """Check GitHub auth status."""
        from .github_auth import get_auth_status
        result = await get_auth_status()
        return result.get("data", result)

    async def github_login(conn_id: str, payload: dict) -> dict:
        """Login with GitHub token."""
        from .github_auth import github_login, GitHubLoginRequest
        request = GitHubLoginRequest(token=payload.get("token"))
        result = await github_login(request)
        return result.get("data", result)

    async def github_logout(conn_id: str, payload: dict) -> dict:
        """Logout from GitHub."""
        from .github_auth import github_logout
        result = await github_logout()
        return result.get("data", result)

    async def github_check_cli(conn_id: str, payload: dict) -> dict:
        """Check if gh CLI is installed."""
        try:
            result = subprocess.run(
                ["gh", "--version"],
                capture_output=True,
                text=True,
                timeout=10
            )
            if result.returncode == 0:
                # Parse version from output like "gh version 2.83.2 (2024-xx-xx)"
                version_line = result.stdout.strip().split('\n')[0]
                version = version_line.split()[2] if len(version_line.split()) >= 3 else None
                return {"installed": True, "version": version}
            return {"installed": False}
        except FileNotFoundError:
            return {"installed": False}
        except Exception as e:
            print(f"[WS] Error checking gh CLI: {e}")
            return {"installed": False}

    async def github_check_auth(conn_id: str, payload: dict) -> dict:
        """Check if user is authenticated with gh CLI."""
        try:
            result = subprocess.run(
                ["gh", "auth", "status"],
                capture_output=True,
                text=True,
                timeout=10
            )
            if result.returncode == 0:
                # Parse username from output
                output = result.stdout + result.stderr
                # Look for "Logged in to github.com account username"
                import re
                match = re.search(r'Logged in to [^\s]+ account ([^\s(]+)', output)
                username = match.group(1) if match else None
                return {"authenticated": True, "username": username}
            return {"authenticated": False}
        except FileNotFoundError:
            return {"authenticated": False, "error": "gh CLI not installed"}
        except Exception as e:
            print(f"[WS] Error checking gh auth: {e}")
            return {"authenticated": False, "error": str(e)}

    # Store background auth processes
    _gh_auth_processes: dict = {}

    async def github_start_auth(conn_id: str, payload: dict) -> dict:
        """Start GitHub OAuth flow using gh CLI device flow."""
        import re
        import os
        import pty
        import select as sel

        try:
            # First check if already authenticated
            auth_check = subprocess.run(
                ["gh", "auth", "status"],
                capture_output=True,
                text=True,
                timeout=10
            )
            if auth_check.returncode == 0:
                print("[WS] GitHub already authenticated")
                return {"success": True, "message": "Already authenticated"}

            # Use PTY to capture interactive output from gh auth login
            # gh CLI needs a TTY to output the device code
            master_fd, slave_fd = pty.openpty()

            process = subprocess.Popen(
                ["gh", "auth", "login", "--git-protocol", "https"],
                stdin=slave_fd,
                stdout=slave_fd,
                stderr=slave_fd,
                text=False,  # Binary mode for PTY
                env={**os.environ, "TERM": "dumb"}
            )

            os.close(slave_fd)  # Close slave in parent

            # Store process for later cleanup
            _gh_auth_processes[conn_id] = {"process": process, "master_fd": master_fd}

            # Read output from PTY
            device_code = None
            auth_url = "https://github.com/login/device"
            output = b""

            # Read with timeout - device code should appear within a few seconds
            start_time = asyncio.get_event_loop().time()
            while asyncio.get_event_loop().time() - start_time < 5:
                # Check if there's data to read
                readable, _, _ = sel.select([master_fd], [], [], 0.5)
                if readable:
                    try:
                        chunk = os.read(master_fd, 4096)
                        if chunk:
                            output += chunk
                            print(f"[WS] gh output chunk: {chunk[:200]}")

                            # Check if we have the device code
                            output_str = output.decode('utf-8', errors='ignore')
                            code_match = re.search(r'\b([A-Z0-9]{4}-[A-Z0-9]{4})\b', output_str)
                            if code_match:
                                device_code = code_match.group(1)
                                print(f"[WS] Found device code: {device_code}")
                                break
                    except OSError:
                        break
                await asyncio.sleep(0.1)

            output_str = output.decode('utf-8', errors='ignore')
            print(f"[WS] gh auth full output: {output_str[:500]}")

            if device_code:
                # Start background task to monitor for completion
                asyncio.create_task(_monitor_gh_auth(conn_id, process, master_fd))

                return {
                    "success": False,  # Not yet complete, user needs to enter code
                    "deviceCode": device_code,
                    "authUrl": auth_url,
                    "browserOpened": False,
                    "message": "Enter the code at GitHub to authenticate"
                }
            else:
                # Kill the process if we couldn't get a device code
                process.terminate()
                os.close(master_fd)
                return {
                    "success": False,
                    "error": "Could not get device code from gh CLI. Try refreshing and authenticating again.",
                    "authUrl": auth_url,
                    "fallbackUrl": auth_url
                }

        except FileNotFoundError:
            return {"success": False, "error": "gh CLI not installed"}
        except Exception as e:
            print(f"[WS] Error starting gh auth: {e}")
            import traceback
            traceback.print_exc()
            return {"success": False, "error": str(e)}

    async def _monitor_gh_auth(conn_id: str, process, master_fd: int):
        """Monitor gh auth process and broadcast when complete."""
        import os
        import select as sel

        try:
            # Wait for process to complete (user entering code at GitHub)
            while process.poll() is None:
                # Drain any remaining output
                readable, _, _ = sel.select([master_fd], [], [], 1.0)
                if readable:
                    try:
                        os.read(master_fd, 4096)
                    except OSError:
                        break
                await asyncio.sleep(1)

            os.close(master_fd)

            # Check if auth succeeded
            result = subprocess.run(
                ["gh", "auth", "status"],
                capture_output=True,
                text=True,
                timeout=10
            )

            if result.returncode == 0:
                print(f"[WS] GitHub auth completed for {conn_id}")
                # Broadcast success event
                await ws_manager.broadcast_event("github.authComplete", {
                    "success": True,
                    "message": "GitHub authentication completed"
                })
            else:
                print(f"[WS] GitHub auth failed for {conn_id}")
                await ws_manager.broadcast_event("github.authComplete", {
                    "success": False,
                    "error": "Authentication was not completed"
                })

        except Exception as e:
            print(f"[WS] Error monitoring gh auth: {e}")

        # Cleanup
        if conn_id in _gh_auth_processes:
            del _gh_auth_processes[conn_id]

    async def github_get_token(conn_id: str, payload: dict) -> dict:
        """Get GitHub token from gh CLI."""
        try:
            result = subprocess.run(
                ["gh", "auth", "token"],
                capture_output=True,
                text=True,
                timeout=10
            )
            if result.returncode == 0:
                token = result.stdout.strip()
                return {"token": token} if token else {"error": "No token found"}
            return {"error": result.stderr or "Failed to get token"}
        except FileNotFoundError:
            return {"error": "gh CLI not installed"}
        except Exception as e:
            print(f"[WS] Error getting gh token: {e}")
            return {"error": str(e)}

    # =========================================================================
    # INFRASTRUCTURE (Ollama, etc.)
    # =========================================================================

    async def infrastructure_check_ollama(conn_id: str, payload: dict) -> dict:
        """Check if Ollama is running and list available models."""
        import httpx
        import os

        # Use env var or default - backend connects to ollama container
        base_url = os.environ.get("OLLAMA_BASE_URL", "http://ollama:11434")

        try:
            async with httpx.AsyncClient(timeout=5.0) as client:
                # Check if Ollama is running
                resp = await client.get(f"{base_url}/api/tags")
                if resp.status_code == 200:
                    data = resp.json()
                    models = data.get("models", [])

                    # Filter for embedding models
                    embedding_models = []
                    for model in models:
                        name = model.get("name", "")
                        # Common embedding model patterns
                        if any(x in name.lower() for x in ["embed", "nomic", "bge", "e5", "gte"]):
                            embedding_models.append({
                                "name": name,
                                "size": model.get("size", 0),
                                "family": model.get("details", {}).get("family", "unknown")
                            })

                    return {
                        "running": True,
                        "baseUrl": base_url,
                        "models": models,
                        "embeddingModels": embedding_models
                    }
                else:
                    return {
                        "running": False,
                        "message": f"Ollama returned status {resp.status_code}"
                    }
        except Exception as e:
            print(f"[Infrastructure] Ollama check failed: {e}")
            return {
                "running": False,
                "message": f"Cannot connect to Ollama at {base_url}: {str(e)}"
            }

    async def infrastructure_pull_ollama_model(conn_id: str, payload: dict) -> dict:
        """Pull (download) an Ollama model with streaming progress."""
        import httpx
        import os
        import json as json_module

        model_name = payload.get("modelName")
        if not model_name:
            return {"success": False, "error": "modelName required"}

        base_url = os.environ.get("OLLAMA_BASE_URL", "http://ollama:11434")
        print(f"[Infrastructure] Pulling Ollama model: {model_name}")

        async def pull_with_progress():
            try:
                async with httpx.AsyncClient(timeout=httpx.Timeout(600.0, connect=10.0)) as client:
                    async with client.stream(
                        "POST",
                        f"{base_url}/api/pull",
                        json={"name": model_name, "stream": True}
                    ) as resp:
                        if resp.status_code != 200:
                            error_msg = await resp.aread()
                            await ws_manager.broadcast_event("ollama.pull.error", {
                                "model": model_name,
                                "error": error_msg.decode()
                            })
                            return

                        async for line in resp.aiter_lines():
                            if line:
                                try:
                                    progress = json_module.loads(line)
                                    # Broadcast progress to frontend
                                    await ws_manager.broadcast_event("ollama.pull.progress", {
                                        "model": model_name,
                                        "status": progress.get("status", ""),
                                        "digest": progress.get("digest", ""),
                                        "total": progress.get("total", 0),
                                        "completed": progress.get("completed", 0)
                                    })

                                    # Check if complete
                                    if progress.get("status") == "success":
                                        print(f"[Infrastructure] Successfully pulled model: {model_name}")
                                        await ws_manager.broadcast_event("ollama.pull.complete", {
                                            "model": model_name,
                                            "success": True
                                        })
                                except json_module.JSONDecodeError:
                                    pass
            except Exception as e:
                print(f"[Infrastructure] Error pulling model: {e}")
                await ws_manager.broadcast_event("ollama.pull.error", {
                    "model": model_name,
                    "error": str(e)
                })

        # Start the pull in background and return immediately
        asyncio.create_task(pull_with_progress())

        return {
            "success": True,
            "status": "started",
            "message": f"Started pulling {model_name}. Progress will be streamed via WebSocket events."
        }

    async def infrastructure_list_ollama_embeddings(conn_id: str, payload: dict) -> dict:
        """List Ollama embedding models."""
        import httpx
        import os

        base_url = os.environ.get("OLLAMA_BASE_URL", "http://ollama:11434")

        try:
            async with httpx.AsyncClient(timeout=5.0) as client:
                resp = await client.get(f"{base_url}/api/tags")
                if resp.status_code == 200:
                    data = resp.json()
                    models = data.get("models", [])

                    # Filter for embedding models
                    embedding_models = []
                    for model in models:
                        name = model.get("name", "")
                        if any(x in name.lower() for x in ["embed", "nomic", "bge", "e5", "gte"]):
                            embedding_models.append({
                                "name": name,
                                "size": model.get("size", 0),
                                "family": model.get("details", {}).get("family", "unknown")
                            })

                    return {"embedding_models": embedding_models, "count": len(embedding_models)}
                else:
                    return {"embedding_models": [], "count": 0}
        except Exception as e:
            print(f"[Infrastructure] Error listing embedding models: {e}")
            return {"embedding_models": [], "count": 0}

    # =========================================================================
    # WORKSPACE (Worktrees)
    # =========================================================================

    async def workspace_get_status(conn_id: str, payload: dict) -> dict:
        """Get worktree status for a task."""
        task_id = payload.get("taskId")
        if not task_id:
            raise ValueError("taskId required")

        # Find the task to get project info
        if task_id not in api_main.tasks:
            return {"exists": False}

        task = api_main.tasks[task_id]
        project_id = task.project_id

        if project_id not in api_main.projects:
            return {"exists": False}

        project = api_main.projects[project_id]
        project_path = Path(project.path)
        worktree_path = project_path / ".worktrees" / task_id

        if not worktree_path.exists():
            return {"exists": False}

        # Get git info from the worktree
        import subprocess

        try:
            # Get branch name
            branch_result = subprocess.run(
                ["git", "rev-parse", "--abbrev-ref", "HEAD"],
                cwd=str(worktree_path),
                capture_output=True,
                text=True
            )
            branch = branch_result.stdout.strip() if branch_result.returncode == 0 else "unknown"

            # Get diff stats
            diff_result = subprocess.run(
                ["git", "diff", "--stat", "HEAD~1..HEAD"],
                cwd=str(worktree_path),
                capture_output=True,
                text=True
            )

            # Detect base branch (main or master)
            base_branch = "main"
            for try_branch in ["main", "master"]:
                check = subprocess.run(
                    ["git", "rev-parse", "--verify", try_branch],
                    cwd=str(worktree_path),
                    capture_output=True,
                    text=True
                )
                if check.returncode == 0:
                    base_branch = try_branch
                    break

            # Count commits ahead of base branch
            commit_result = subprocess.run(
                ["git", "rev-list", "--count", f"{base_branch}..HEAD"],
                cwd=str(worktree_path),
                capture_output=True,
                text=True
            )
            commit_count = int(commit_result.stdout.strip()) if commit_result.returncode == 0 else 0

            # Get file change counts
            shortstat = subprocess.run(
                ["git", "diff", "--shortstat", f"{base_branch}..HEAD"],
                cwd=str(worktree_path),
                capture_output=True,
                text=True
            )

            files_changed = 0
            additions = 0
            deletions = 0

            if shortstat.returncode == 0 and shortstat.stdout.strip():
                import re
                stat_line = shortstat.stdout.strip()
                files_match = re.search(r"(\d+) files? changed", stat_line)
                add_match = re.search(r"(\d+) insertions?", stat_line)
                del_match = re.search(r"(\d+) deletions?", stat_line)

                if files_match:
                    files_changed = int(files_match.group(1))
                if add_match:
                    additions = int(add_match.group(1))
                if del_match:
                    deletions = int(del_match.group(1))

            return {
                "exists": True,
                "branch": branch,
                "baseBranch": base_branch,
                "worktreePath": str(worktree_path),
                "commitCount": commit_count,
                "filesChanged": files_changed,
                "additions": additions,
                "deletions": deletions
            }
        except Exception as e:
            print(f"[Workspace] Error getting worktree status: {e}")
            return {"exists": True, "branch": "unknown", "error": str(e)}

    async def workspace_get_diff(conn_id: str, payload: dict) -> dict:
        """Get file diff for a worktree."""
        task_id = payload.get("taskId")
        if not task_id or task_id not in api_main.tasks:
            return {"files": [], "summary": "Task not found"}

        task = api_main.tasks[task_id]
        project = api_main.projects.get(task.project_id)
        if not project:
            return {"files": [], "summary": "Project not found"}

        worktree_path = Path(project.path) / ".worktrees" / task_id
        if not worktree_path.exists():
            return {"files": [], "summary": "Worktree not found"}

        import subprocess
        try:
            # Detect base branch
            base_branch = "main"
            for try_branch in ["main", "master"]:
                check = subprocess.run(
                    ["git", "rev-parse", "--verify", try_branch],
                    cwd=str(worktree_path),
                    capture_output=True,
                    text=True
                )
                if check.returncode == 0:
                    base_branch = try_branch
                    break

            result = subprocess.run(
                ["git", "diff", "--numstat", f"{base_branch}..HEAD"],
                cwd=str(worktree_path),
                capture_output=True,
                text=True
            )

            files = []
            if result.returncode == 0:
                for line in result.stdout.strip().split("\n"):
                    if line:
                        parts = line.split("\t")
                        if len(parts) >= 3:
                            additions = int(parts[0]) if parts[0] != "-" else 0
                            deletions = int(parts[1]) if parts[1] != "-" else 0
                            path = parts[2]
                            status = "modified"
                            if additions > 0 and deletions == 0:
                                status = "added"
                            elif deletions > 0 and additions == 0:
                                status = "deleted"
                            files.append({
                                "path": path,
                                "status": status,
                                "additions": additions,
                                "deletions": deletions
                            })

            total_additions = sum(f["additions"] for f in files)
            total_deletions = sum(f["deletions"] for f in files)
            summary = f"{len(files)} files changed, +{total_additions} -{total_deletions}"

            return {"files": files, "summary": summary}
        except Exception as e:
            return {"files": [], "summary": f"Error: {e}"}

    async def workspace_merge(conn_id: str, payload: dict) -> dict:
        """Merge worktree changes into main branch."""
        task_id = payload.get("taskId")
        no_commit = payload.get("noCommit", False)

        if not task_id or task_id not in api_main.tasks:
            raise ValueError("Task not found")

        task = api_main.tasks[task_id]
        project = api_main.projects.get(task.project_id)
        if not project:
            raise ValueError("Project not found")

        worktree_path = Path(project.path) / ".worktrees" / task_id
        if not worktree_path.exists():
            raise ValueError("Worktree not found")

        import subprocess
        try:
            # Get the branch name from worktree
            branch_result = subprocess.run(
                ["git", "rev-parse", "--abbrev-ref", "HEAD"],
                cwd=str(worktree_path),
                capture_output=True,
                text=True
            )
            branch = branch_result.stdout.strip()

            # Merge into main from the project root
            project_path = Path(project.path)

            if no_commit:
                # Stage only - merge with --no-commit
                merge_result = subprocess.run(
                    ["git", "merge", "--no-commit", "--no-ff", branch],
                    cwd=str(project_path),
                    capture_output=True,
                    text=True
                )
            else:
                # Full merge
                merge_result = subprocess.run(
                    ["git", "merge", "--no-ff", branch, "-m", f"Merge task: {task.title}"],
                    cwd=str(project_path),
                    capture_output=True,
                    text=True
                )

            if merge_result.returncode != 0:
                return {
                    "success": False,
                    "message": f"Merge failed: {merge_result.stderr}"
                }

            # Update task status
            if no_commit:
                # Stage only - mark as staged in main project
                task.staged_in_main_project = True
            else:
                # Full merge - mark as done
                task.status = "done"
            api_main._save_tasks()

            # Broadcast task update to all connected clients
            await ws_manager.broadcast_event(f"project.{task.project_id}.tasks", {
                "action": "updated",
                "task": task.to_dict() if hasattr(task, 'to_dict') else {
                    "id": task.id,
                    "projectId": task.project_id,
                    "status": task.status,
                    "title": task.title,
                    "stagedInMainProject": getattr(task, 'staged_in_main_project', False)
                }
            })

            return {
                "success": True,
                "message": "Merge completed successfully" if not no_commit else "Changes staged successfully",
                "staged": no_commit,
                "projectPath": str(project_path)
            }
        except Exception as e:
            return {"success": False, "message": str(e)}

    async def workspace_merge_preview(conn_id: str, payload: dict) -> dict:
        """Preview merge conflicts."""
        task_id = payload.get("taskId")
        if not task_id or task_id not in api_main.tasks:
            return {"success": False, "message": "Task not found"}

        task = api_main.tasks[task_id]
        project = api_main.projects.get(task.project_id)
        if not project:
            return {"success": False, "message": "Project not found"}

        # For now, return a simple preview
        worktree_path = Path(project.path) / ".worktrees" / task_id
        if not worktree_path.exists():
            return {"success": False, "message": "Worktree not found"}

        return {
            "success": True,
            "message": "Preview generated",
            "preview": {
                "files": [],
                "conflicts": [],
                "summary": {
                    "totalFiles": 0,
                    "conflictFiles": 0,
                    "totalConflicts": 0,
                    "autoMergeable": 0
                }
            }
        }

    async def workspace_discard(conn_id: str, payload: dict) -> dict:
        """Discard worktree changes."""
        task_id = payload.get("taskId")
        if not task_id or task_id not in api_main.tasks:
            raise ValueError("Task not found")

        task = api_main.tasks[task_id]
        project = api_main.projects.get(task.project_id)
        if not project:
            raise ValueError("Project not found")

        worktree_path = Path(project.path) / ".worktrees" / task_id
        if worktree_path.exists():
            import shutil
            shutil.rmtree(worktree_path)

        # Update task status back to backlog
        task.status = "backlog"
        api_main._save_tasks()

        return {"success": True, "message": "Worktree discarded"}

    async def workspace_list(conn_id: str, payload: dict) -> dict:
        """List all worktrees for a project."""
        project_id = payload.get("projectId")
        if not project_id or project_id not in api_main.projects:
            return {"worktrees": []}

        project = api_main.projects[project_id]
        worktrees_dir = Path(project.path) / ".worktrees"

        worktrees = []
        if worktrees_dir.exists():
            for wt in worktrees_dir.iterdir():
                if wt.is_dir() and not wt.name.startswith("."):
                    worktrees.append({
                        "id": wt.name,
                        "path": str(wt)
                    })

        return {"worktrees": worktrees}

    # Register all handlers
    handlers = {
        # Tasks
        "tasks.list": tasks_list,
        "tasks.create": tasks_create,
        "tasks.update": tasks_update,
        "tasks.delete": tasks_delete,
        "tasks.start": tasks_start,
        "tasks.stop": tasks_stop,
        "tasks.getLogs": tasks_get_logs,
        "tasks.checkRunning": tasks_check_running,
        "tasks.review": tasks_review,
        "tasks.recover": tasks_recover,
        "tasks.archive": tasks_archive,
        "tasks.unarchive": tasks_unarchive,
        "tasks.updateStatus": tasks_update_status,

        # Projects
        "projects.list": projects_list,
        "projects.create": projects_create,
        "projects.delete": projects_delete,
        "projects.getDirectory": projects_get_directory,
        "projects.updateSettings": projects_update_settings,
        "projects.initialize": projects_initialize,
        "projects.getTabState": projects_get_tab_state,
        "projects.saveTabState": projects_save_tab_state,
        "projects.createFolder": projects_create_folder,
        "projects.getDefaultLocation": projects_get_default_location,
        "projects.getVersion": projects_get_version,
        "projects.updateAutoBuild": projects_update_auto_build,

        # Settings
        "settings.get": settings_get,
        "settings.update": settings_update,

        # Git
        "git.status": git_status,
        "git.branches": git_branches,
        "git.currentBranch": git_current_branch,
        "git.mainBranch": git_main_branch,
        "git.initialize": git_initialize,
        "git.skipSetup": git_skip_setup,
        "git.clone": git_clone,

        # Profiles
        "profiles.list": profiles_list,
        "profiles.create": profiles_create,
        "profiles.delete": profiles_delete,
        "profiles.activate": profiles_activate,
        "profiles.setToken": profiles_set_token,
        "profiles.getUsage": profiles_get_usage,
        "profiles.refreshUsage": profiles_refresh_usage,
        "profiles.getAutoSwitchSettings": profiles_get_auto_switch_settings,
        "profiles.updateAutoSwitchSettings": profiles_update_auto_switch_settings,

        # OAuth
        "oauth.initiate": oauth_initiate,
        "oauth.status": oauth_status,

        # GitHub
        "github.authStatus": github_auth_status,
        "github.login": github_login,
        "github.logout": github_logout,
        "github.checkCli": github_check_cli,
        "github.checkAuth": github_check_auth,
        "github.startAuth": github_start_auth,
        "github.getToken": github_get_token,

        # Infrastructure
        "infrastructure.checkOllama": infrastructure_check_ollama,
        "infrastructure.pullOllamaModel": infrastructure_pull_ollama_model,
        "infrastructure.listOllamaEmbeddings": infrastructure_list_ollama_embeddings,

        # Workspace
        "workspace.getStatus": workspace_get_status,
        "workspace.getDiff": workspace_get_diff,
        "workspace.merge": workspace_merge,
        "workspace.mergePreview": workspace_merge_preview,
        "workspace.discard": workspace_discard,
        "workspace.list": workspace_list,
    }

    for action, handler in handlers.items():
        ws_manager.register_handler(action, handler)

    print(f"[WS] Registered {len(handlers)} command handlers")

    # =========================================================================
    # FEATURE HANDLERS - Register after other handlers (uses streaming)
    # =========================================================================
    from .insights_handler import register_insights_handlers
    from .changelog_handler import register_changelog_handlers
    from .roadmap_handler import register_roadmap_handlers
    from .context_handler import register_context_handlers
    from .ideation_handler import register_ideation_handlers
    from .github_integration_handler import register_github_integration_handlers
    from .branch_model_handler import register_branch_model_handlers

    register_insights_handlers(ws_manager, api_main)
    register_changelog_handlers(ws_manager, api_main)
    register_roadmap_handlers(ws_manager, api_main)
    register_context_handlers(ws_manager, api_main)
    register_ideation_handlers(ws_manager, api_main)
    register_github_integration_handlers(ws_manager, api_main)
    register_branch_model_handlers(ws_manager, api_main)
