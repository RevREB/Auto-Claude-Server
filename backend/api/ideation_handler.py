"""
Ideation WebSocket handlers.

Handles AI-powered idea generation and management.
"""

import asyncio
import json
import os
import uuid
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional


# In-memory storage for ideation data (per-project)
_ideation_store: Dict[str, dict] = {}

# Active ideation processes
_active_ideation: Dict[str, asyncio.subprocess.Process] = {}


def _get_ideation_file(project_path: str) -> Path:
    """Get the path to the ideation file for a project."""
    return Path(project_path) / ".auto-claude" / "ideation.json"


def _load_ideation(project_id: str, project_path: str) -> Optional[dict]:
    """Load ideation from disk for a project."""
    if project_id in _ideation_store:
        return _ideation_store[project_id]

    ideation_file = _get_ideation_file(project_path)
    if ideation_file.exists():
        try:
            with open(ideation_file) as f:
                ideation = json.load(f)
                _ideation_store[project_id] = ideation
                return ideation
        except Exception as e:
            print(f"[Ideation] Error loading ideation: {e}")

    return None


def _save_ideation(project_id: str, project_path: str, ideation: dict):
    """Save ideation to disk for a project."""
    _ideation_store[project_id] = ideation

    ideation_file = _get_ideation_file(project_path)
    ideation_file.parent.mkdir(parents=True, exist_ok=True)

    try:
        with open(ideation_file, "w") as f:
            json.dump(ideation, f, indent=2, default=str)
    except Exception as e:
        print(f"[Ideation] Error saving ideation: {e}")


def register_ideation_handlers(ws_manager, api_main):
    """Register ideation-related WebSocket handlers."""

    async def ideation_get(conn_id: str, payload: dict) -> Optional[dict]:
        """Get ideation data for a project."""
        project_id = payload.get("projectId")
        if not project_id or project_id not in api_main.projects:
            return None

        project = api_main.projects[project_id]
        return _load_ideation(project_id, project.path)

    async def ideation_generate(conn_id: str, payload: dict) -> dict:
        """Generate ideas using AI analysis."""
        project_id = payload.get("projectId")
        idea_types = payload.get("ideaTypes", ["features", "improvements", "bugs"])

        if not project_id or project_id not in api_main.projects:
            return {"success": False, "error": "Project not found"}

        project = api_main.projects[project_id]

        # Start async ideation generation
        asyncio.create_task(
            _run_ideation_generation(
                ws_manager, conn_id, project_id, project.path, idea_types
            )
        )

        return {"success": True, "message": "Ideation generation started"}

    async def ideation_refresh(conn_id: str, payload: dict) -> dict:
        """Refresh ideation by re-analyzing the codebase."""
        project_id = payload.get("projectId")

        if not project_id or project_id not in api_main.projects:
            return {"success": False, "error": "Project not found"}

        project = api_main.projects[project_id]

        # Clear cached ideation
        if project_id in _ideation_store:
            del _ideation_store[project_id]

        # Start fresh generation
        asyncio.create_task(
            _run_ideation_generation(
                ws_manager, conn_id, project_id, project.path, ["features", "improvements", "bugs"]
            )
        )

        return {"success": True, "message": "Ideation refresh started"}

    async def ideation_stop(conn_id: str, payload: dict) -> dict:
        """Stop ongoing ideation generation."""
        project_id = payload.get("projectId")

        if project_id in _active_ideation:
            process = _active_ideation[project_id]
            process.terminate()
            del _active_ideation[project_id]

        await ws_manager.send_event(conn_id, f"ideation.{project_id}.stopped", {})

        return {"success": True}

    async def ideation_update_status(conn_id: str, payload: dict) -> dict:
        """Update the status of an idea."""
        project_id = payload.get("projectId")
        idea_id = payload.get("ideaId")
        status = payload.get("status")

        if not project_id or project_id not in api_main.projects:
            return {"success": False, "error": "Project not found"}

        project = api_main.projects[project_id]
        ideation = _load_ideation(project_id, project.path)

        if not ideation:
            return {"success": False, "error": "Ideation data not found"}

        # Find and update the idea
        updated = False
        for idea in ideation.get("ideas", []):
            if idea.get("id") == idea_id:
                idea["status"] = status
                idea["updatedAt"] = datetime.now().isoformat()
                updated = True
                break

        if updated:
            ideation["updatedAt"] = datetime.now().isoformat()
            _save_ideation(project_id, project.path, ideation)
            return {"success": True}

        return {"success": False, "error": "Idea not found"}

    async def ideation_convert_to_task(conn_id: str, payload: dict) -> dict:
        """Convert an idea to a task."""
        project_id = payload.get("projectId")
        idea_id = payload.get("ideaId")

        if not project_id or project_id not in api_main.projects:
            return {"success": False, "error": "Project not found"}

        project = api_main.projects[project_id]
        ideation = _load_ideation(project_id, project.path)

        if not ideation:
            return {"success": False, "error": "Ideation data not found"}

        # Find the idea
        idea = None
        for i in ideation.get("ideas", []):
            if i.get("id") == idea_id:
                idea = i
                break

        if not idea:
            return {"success": False, "error": "Idea not found"}

        # Create task via existing task creation logic
        from .main import TaskCreateRequest

        task_request = TaskCreateRequest(
            projectId=project_id,
            title=idea.get("title", "Idea from ideation"),
            description=idea.get("description", "")
        )

        result = await api_main.create_task(task_request)

        if "task" in result:
            # Update idea status
            idea["status"] = "converted"
            idea["taskId"] = result["task"]["id"]
            idea["updatedAt"] = datetime.now().isoformat()
            _save_ideation(project_id, project.path, ideation)

            return {"success": True, "data": result["task"]}

        return {"success": False, "error": "Failed to create task"}

    async def ideation_dismiss(conn_id: str, payload: dict) -> dict:
        """Dismiss an idea."""
        project_id = payload.get("projectId")
        idea_id = payload.get("ideaId")

        if not project_id or project_id not in api_main.projects:
            return {"success": False, "error": "Project not found"}

        project = api_main.projects[project_id]
        ideation = _load_ideation(project_id, project.path)

        if not ideation:
            return {"success": False, "error": "Ideation data not found"}

        # Find and dismiss the idea
        for idea in ideation.get("ideas", []):
            if idea.get("id") == idea_id:
                idea["status"] = "dismissed"
                idea["updatedAt"] = datetime.now().isoformat()
                ideation["updatedAt"] = datetime.now().isoformat()
                _save_ideation(project_id, project.path, ideation)
                return {"success": True}

        return {"success": False, "error": "Idea not found"}

    async def ideation_dismiss_all(conn_id: str, payload: dict) -> dict:
        """Dismiss all ideas."""
        project_id = payload.get("projectId")

        if not project_id or project_id not in api_main.projects:
            return {"success": False, "error": "Project not found"}

        project = api_main.projects[project_id]
        ideation = _load_ideation(project_id, project.path)

        if not ideation:
            return {"success": True}  # Nothing to dismiss

        for idea in ideation.get("ideas", []):
            if idea.get("status") not in ["dismissed", "converted"]:
                idea["status"] = "dismissed"
                idea["updatedAt"] = datetime.now().isoformat()

        ideation["updatedAt"] = datetime.now().isoformat()
        _save_ideation(project_id, project.path, ideation)

        return {"success": True}

    async def ideation_archive(conn_id: str, payload: dict) -> dict:
        """Archive an idea."""
        project_id = payload.get("projectId")
        idea_id = payload.get("ideaId")

        if not project_id or project_id not in api_main.projects:
            return {"success": False, "error": "Project not found"}

        project = api_main.projects[project_id]
        ideation = _load_ideation(project_id, project.path)

        if not ideation:
            return {"success": False, "error": "Ideation data not found"}

        for idea in ideation.get("ideas", []):
            if idea.get("id") == idea_id:
                idea["status"] = "archived"
                idea["updatedAt"] = datetime.now().isoformat()
                ideation["updatedAt"] = datetime.now().isoformat()
                _save_ideation(project_id, project.path, ideation)
                return {"success": True}

        return {"success": False, "error": "Idea not found"}

    async def ideation_delete(conn_id: str, payload: dict) -> dict:
        """Delete an idea."""
        project_id = payload.get("projectId")
        idea_id = payload.get("ideaId")

        if not project_id or project_id not in api_main.projects:
            return {"success": False, "error": "Project not found"}

        project = api_main.projects[project_id]
        ideation = _load_ideation(project_id, project.path)

        if not ideation:
            return {"success": False, "error": "Ideation data not found"}

        ideas = ideation.get("ideas", [])
        ideation["ideas"] = [i for i in ideas if i.get("id") != idea_id]
        ideation["updatedAt"] = datetime.now().isoformat()
        _save_ideation(project_id, project.path, ideation)

        return {"success": True}

    async def ideation_delete_multiple(conn_id: str, payload: dict) -> dict:
        """Delete multiple ideas."""
        project_id = payload.get("projectId")
        idea_ids = payload.get("ideaIds", [])

        if not project_id or project_id not in api_main.projects:
            return {"success": False, "error": "Project not found"}

        project = api_main.projects[project_id]
        ideation = _load_ideation(project_id, project.path)

        if not ideation:
            return {"success": False, "error": "Ideation data not found"}

        idea_ids_set = set(idea_ids)
        ideas = ideation.get("ideas", [])
        ideation["ideas"] = [i for i in ideas if i.get("id") not in idea_ids_set]
        ideation["updatedAt"] = datetime.now().isoformat()
        _save_ideation(project_id, project.path, ideation)

        return {"success": True}

    # Register handlers
    handlers = {
        "ideation.get": ideation_get,
        "ideation.generate": ideation_generate,
        "ideation.refresh": ideation_refresh,
        "ideation.stop": ideation_stop,
        "ideation.updateStatus": ideation_update_status,
        "ideation.convertToTask": ideation_convert_to_task,
        "ideation.dismiss": ideation_dismiss,
        "ideation.dismissAll": ideation_dismiss_all,
        "ideation.archive": ideation_archive,
        "ideation.delete": ideation_delete,
        "ideation.deleteMultiple": ideation_delete_multiple,
    }

    for action, handler in handlers.items():
        ws_manager.register_handler(action, handler)

    print(f"[Ideation] Registered {len(handlers)} handlers")


async def _run_ideation_generation(
    ws_manager, conn_id: str, project_id: str, project_path: str, idea_types: List[str]
):
    """Run AI-powered ideation generation."""
    try:
        await ws_manager.send_event(conn_id, f"ideation.{project_id}.progress", {
            "stage": "starting",
            "message": "Starting idea generation..."
        })

        # Get the ideation runner path
        runner_path = Path("/app/auto-claude/runners/ideation_runner.py")
        if not runner_path.exists():
            # Development fallback
            runner_path = Path(__file__).parent.parent / "auto-claude" / "runners" / "ideation_runner.py"

        if not runner_path.exists():
            # Generate sample ideas without AI
            await _generate_sample_ideas(ws_manager, conn_id, project_id, project_path, idea_types)
            return

        # Run the ideation runner
        cmd = [
            "python3", str(runner_path),
            "--project-dir", project_path,
            "--types", ",".join(idea_types)
        ]

        process = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            cwd=project_path
        )

        _active_ideation[project_id] = process

        # Stream output
        ideas = []
        current_type = None

        while True:
            line = await process.stdout.readline()
            if not line:
                break

            text = line.decode('utf-8').strip()

            # Check for markers
            if text.startswith("__TYPE__:"):
                current_type = text[9:].strip()
                await ws_manager.send_event(conn_id, f"ideation.{project_id}.progress", {
                    "stage": "generating",
                    "message": f"Generating {current_type} ideas...",
                    "type": current_type
                })
            elif text.startswith("__IDEA__:"):
                try:
                    idea_data = json.loads(text[9:])
                    idea = {
                        "id": f"idea-{uuid.uuid4().hex[:8]}",
                        "type": current_type or "feature",
                        "title": idea_data.get("title", "Untitled"),
                        "description": idea_data.get("description", ""),
                        "priority": idea_data.get("priority", "medium"),
                        "effort": idea_data.get("effort", "medium"),
                        "status": "new",
                        "createdAt": datetime.now().isoformat(),
                        "updatedAt": datetime.now().isoformat()
                    }
                    ideas.append(idea)

                    # Send individual idea event
                    await ws_manager.send_event(conn_id, f"ideation.{project_id}.log", {
                        "idea": idea
                    })
                except json.JSONDecodeError:
                    pass
            elif text.startswith("__TYPE_COMPLETE__:"):
                type_name = text[18:].strip()
                await ws_manager.send_event(conn_id, f"ideation.{project_id}.typeComplete", {
                    "type": type_name
                })

        await process.wait()

        # Clean up
        if project_id in _active_ideation:
            del _active_ideation[project_id]

        # Save ideation data
        ideation = {
            "id": f"ideation-{uuid.uuid4().hex[:8]}",
            "projectId": project_id,
            "ideas": ideas,
            "createdAt": datetime.now().isoformat(),
            "updatedAt": datetime.now().isoformat()
        }
        _save_ideation(project_id, project_path, ideation)

        await ws_manager.send_event(conn_id, f"ideation.{project_id}.complete", {
            "ideation": ideation
        })

    except Exception as e:
        print(f"[Ideation] Generation error: {e}")
        import traceback
        traceback.print_exc()
        await ws_manager.send_event(conn_id, f"ideation.{project_id}.error", {
            "error": str(e)
        })


async def _generate_sample_ideas(
    ws_manager, conn_id: str, project_id: str, project_path: str, idea_types: List[str]
):
    """Generate sample ideas without AI."""
    now = datetime.now().isoformat()

    ideas = []

    if "features" in idea_types:
        ideas.extend([
            {
                "id": f"idea-{uuid.uuid4().hex[:8]}",
                "type": "feature",
                "title": "Add comprehensive test coverage",
                "description": "Implement unit and integration tests for core functionality",
                "priority": "high",
                "effort": "high",
                "status": "new",
                "createdAt": now,
                "updatedAt": now
            },
            {
                "id": f"idea-{uuid.uuid4().hex[:8]}",
                "type": "feature",
                "title": "Add API documentation",
                "description": "Generate OpenAPI/Swagger documentation for all endpoints",
                "priority": "medium",
                "effort": "medium",
                "status": "new",
                "createdAt": now,
                "updatedAt": now
            }
        ])

    if "improvements" in idea_types:
        ideas.extend([
            {
                "id": f"idea-{uuid.uuid4().hex[:8]}",
                "type": "improvement",
                "title": "Optimize database queries",
                "description": "Add indexes and optimize N+1 queries",
                "priority": "medium",
                "effort": "medium",
                "status": "new",
                "createdAt": now,
                "updatedAt": now
            }
        ])

    if "bugs" in idea_types:
        ideas.extend([
            {
                "id": f"idea-{uuid.uuid4().hex[:8]}",
                "type": "bug",
                "title": "Fix error handling edge cases",
                "description": "Review and improve error handling throughout the codebase",
                "priority": "high",
                "effort": "low",
                "status": "new",
                "createdAt": now,
                "updatedAt": now
            }
        ])

    ideation = {
        "id": f"ideation-{uuid.uuid4().hex[:8]}",
        "projectId": project_id,
        "ideas": ideas,
        "createdAt": now,
        "updatedAt": now
    }
    _save_ideation(project_id, project_path, ideation)

    await ws_manager.send_event(conn_id, f"ideation.{project_id}.complete", {
        "ideation": ideation
    })
