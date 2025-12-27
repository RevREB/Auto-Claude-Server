"""
Release Handler - WebSocket handlers for release management.

Provides real-time release functionality for the hierarchical branching model.
"""

from pathlib import Path
from typing import Any, Dict
from dataclasses import asdict


def register_release_handlers(ws_manager, api_main):
    """Register release-related WebSocket handlers."""

    async def release_list(conn_id: str, payload: dict) -> dict:
        """List all releases for a project."""
        project_id = payload.get("projectId")

        if not project_id:
            return {"success": False, "error": "projectId required"}

        project = api_main.projects.get(project_id)
        if not project:
            return {"success": False, "error": "Project not found"}

        try:
            import sys
            auto_claude_path = Path("/app/auto-claude")
            if str(auto_claude_path) not in sys.path:
                sys.path.insert(0, str(auto_claude_path))

            from core.release_manager import get_release_manager

            manager = get_release_manager(project.path)
            releases = manager.list_releases()

            return {
                "success": True,
                "releases": releases
            }
        except Exception as e:
            return {"success": False, "error": str(e)}

    async def release_get(conn_id: str, payload: dict) -> dict:
        """Get details of a specific release."""
        project_id = payload.get("projectId")
        version = payload.get("version")

        if not project_id or not version:
            return {"success": False, "error": "projectId and version required"}

        project = api_main.projects.get(project_id)
        if not project:
            return {"success": False, "error": "Project not found"}

        try:
            import sys
            auto_claude_path = Path("/app/auto-claude")
            if str(auto_claude_path) not in sys.path:
                sys.path.insert(0, str(auto_claude_path))

            from core.release_manager import get_release_manager

            manager = get_release_manager(project.path)
            release = manager.get_release(version)

            if release:
                return {"success": True, "release": release}
            else:
                return {"success": False, "error": "Release not found"}
        except Exception as e:
            return {"success": False, "error": str(e)}

    async def release_create(conn_id: str, payload: dict) -> dict:
        """Create a new release candidate."""
        project_id = payload.get("projectId")
        version = payload.get("version")
        release_notes = payload.get("releaseNotes")
        task_ids = payload.get("taskIds", [])

        if not project_id or not version:
            return {"success": False, "error": "projectId and version required"}

        project = api_main.projects.get(project_id)
        if not project:
            return {"success": False, "error": "Project not found"}

        # Get task data
        tasks = []
        for task_id in task_ids:
            if task_id in api_main.tasks:
                task = api_main.tasks[task_id]
                tasks.append({
                    "id": task_id,
                    "title": task.title,
                    "description": task.description,
                    "version_impact": getattr(task, "version_impact", "patch"),
                    "is_breaking": getattr(task, "is_breaking", False)
                })

        try:
            import sys
            auto_claude_path = Path("/app/auto-claude")
            if str(auto_claude_path) not in sys.path:
                sys.path.insert(0, str(auto_claude_path))

            from core.release_manager import get_release_manager

            manager = get_release_manager(project.path)
            result = manager.create_release(version, tasks, release_notes)

            if result.success:
                # Update tasks with release version in database
                from .database import TaskService, ReleaseService
                from datetime import datetime

                # Create release record
                ReleaseService.create({
                    "version": version,
                    "branch_name": f"release/{version}",
                    "status": "candidate",
                    "release_notes": release_notes or result.release.release_notes,
                    "created_at": datetime.utcnow()
                })

                # Associate tasks with release
                for task_id in task_ids:
                    TaskService.update(task_id, {"release_version": version})
                    ReleaseService.add_task(version, task_id)

                return {
                    "success": True,
                    "message": result.message,
                    "release": {
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

    async def release_promote(conn_id: str, payload: dict) -> dict:
        """Promote a release to main."""
        project_id = payload.get("projectId")
        version = payload.get("version")
        create_tag = payload.get("createTag", True)
        back_merge = payload.get("backMerge", True)

        if not project_id or not version:
            return {"success": False, "error": "projectId and version required"}

        project = api_main.projects.get(project_id)
        if not project:
            return {"success": False, "error": "Project not found"}

        try:
            import sys
            auto_claude_path = Path("/app/auto-claude")
            if str(auto_claude_path) not in sys.path:
                sys.path.insert(0, str(auto_claude_path))

            from core.release_manager import get_release_manager

            manager = get_release_manager(project.path)
            result = manager.promote_to_main(version, create_tag, back_merge)

            if result.success:
                # Update release status in database
                from .database import ReleaseService
                from datetime import datetime

                ReleaseService.update(version, {
                    "status": "promoted",
                    "promoted_at": datetime.utcnow()
                })

                # Broadcast release promoted event
                await ws_manager.broadcast_event(f"project.{project_id}.releases", {
                    "action": "promoted",
                    "version": version,
                    "tag": result.tag
                })

                return {
                    "success": True,
                    "message": result.message,
                    "tag": result.tag,
                    "commitSha": result.commit_sha
                }
            else:
                return {"success": False, "error": result.message}
        except Exception as e:
            return {"success": False, "error": str(e)}

    async def release_abandon(conn_id: str, payload: dict) -> dict:
        """Abandon a release candidate."""
        project_id = payload.get("projectId")
        version = payload.get("version")
        delete_branch = payload.get("deleteBranch", True)

        if not project_id or not version:
            return {"success": False, "error": "projectId and version required"}

        project = api_main.projects.get(project_id)
        if not project:
            return {"success": False, "error": "Project not found"}

        try:
            import sys
            auto_claude_path = Path("/app/auto-claude")
            if str(auto_claude_path) not in sys.path:
                sys.path.insert(0, str(auto_claude_path))

            from core.release_manager import get_release_manager

            manager = get_release_manager(project.path)
            result = manager.abandon_release(version, delete_branch)

            if result.success:
                # Update release status in database
                from .database import ReleaseService

                ReleaseService.update(version, {"status": "abandoned"})

                return {"success": True, "message": result.message}
            else:
                return {"success": False, "error": result.message}
        except Exception as e:
            return {"success": False, "error": str(e)}

    async def version_current(conn_id: str, payload: dict) -> dict:
        """Get the current version for a project."""
        project_id = payload.get("projectId")

        if not project_id:
            return {"success": False, "error": "projectId required"}

        project = api_main.projects.get(project_id)
        if not project:
            return {"success": False, "error": "Project not found"}

        try:
            import sys
            auto_claude_path = Path("/app/auto-claude")
            if str(auto_claude_path) not in sys.path:
                sys.path.insert(0, str(auto_claude_path))

            from core.release_manager import get_release_manager

            manager = get_release_manager(project.path)
            version = manager.get_current_version()

            return {
                "success": True,
                "version": version or "0.0.0"
            }
        except Exception as e:
            return {"success": False, "error": str(e)}

    async def version_next(conn_id: str, payload: dict) -> dict:
        """Calculate the next version for a project."""
        project_id = payload.get("projectId")
        task_ids = payload.get("taskIds", [])

        if not project_id:
            return {"success": False, "error": "projectId required"}

        project = api_main.projects.get(project_id)
        if not project:
            return {"success": False, "error": "Project not found"}

        # Get task data
        tasks = []
        for task_id in task_ids:
            if task_id in api_main.tasks:
                task = api_main.tasks[task_id]
                tasks.append({
                    "id": task_id,
                    "title": task.title,
                    "description": task.description,
                    "version_impact": getattr(task, "version_impact", "patch"),
                    "is_breaking": getattr(task, "is_breaking", False)
                })

        try:
            import sys
            auto_claude_path = Path("/app/auto-claude")
            if str(auto_claude_path) not in sys.path:
                sys.path.insert(0, str(auto_claude_path))

            from core.release_manager import get_release_manager

            manager = get_release_manager(project.path)
            result = manager.get_next_version(tasks)

            return {
                "success": True,
                **result
            }
        except Exception as e:
            return {"success": False, "error": str(e)}

    async def release_generate_changelog(conn_id: str, payload: dict) -> dict:
        """Generate changelog for a release."""
        project_id = payload.get("projectId")
        version = payload.get("version")
        task_ids = payload.get("taskIds", [])

        if not project_id or not version:
            return {"success": False, "error": "projectId and version required"}

        project = api_main.projects.get(project_id)
        if not project:
            return {"success": False, "error": "Project not found"}

        # Get task data
        tasks = []
        for task_id in task_ids:
            if task_id in api_main.tasks:
                task = api_main.tasks[task_id]
                tasks.append({
                    "id": task_id,
                    "title": task.title,
                    "description": task.description,
                    "version_impact": getattr(task, "version_impact", "patch"),
                    "is_breaking": getattr(task, "is_breaking", False)
                })

        try:
            import sys
            auto_claude_path = Path("/app/auto-claude")
            if str(auto_claude_path) not in sys.path:
                sys.path.insert(0, str(auto_claude_path))

            from core.release_manager import get_release_manager

            manager = get_release_manager(project.path)
            changelog = manager.generate_changelog(version, tasks)

            return {
                "success": True,
                "changelog": changelog
            }
        except Exception as e:
            return {"success": False, "error": str(e)}

    # Register handlers
    handlers = {
        "release.list": release_list,
        "release.get": release_get,
        "release.create": release_create,
        "release.promote": release_promote,
        "release.abandon": release_abandon,
        "release.generateChangelog": release_generate_changelog,
        "version.current": version_current,
        "version.next": version_next,
    }

    for action, handler in handlers.items():
        ws_manager.register_handler(action, handler)

    print(f"[WS] Registered {len(handlers)} release handlers")
