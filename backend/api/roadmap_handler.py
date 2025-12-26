"""
Roadmap WebSocket handlers.

Handles AI-powered roadmap generation and feature management.
"""

import asyncio
import json
import os
import subprocess
import uuid
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional


# In-memory storage for roadmaps (per-project)
_roadmaps_store: Dict[str, dict] = {}


def _get_roadmap_file(project_path: str) -> Path:
    """Get the path to the roadmap file for a project."""
    return Path(project_path) / ".auto-claude" / "roadmap.json"


def _load_roadmap(project_id: str, project_path: str) -> Optional[dict]:
    """Load roadmap from disk for a project."""
    if project_id in _roadmaps_store:
        return _roadmaps_store[project_id]

    roadmap_file = _get_roadmap_file(project_path)
    if roadmap_file.exists():
        try:
            with open(roadmap_file) as f:
                roadmap = json.load(f)
                _roadmaps_store[project_id] = roadmap
                return roadmap
        except Exception as e:
            print(f"[Roadmap] Error loading roadmap: {e}")

    return None


def _save_roadmap(project_id: str, project_path: str, roadmap: dict):
    """Save roadmap to disk for a project."""
    _roadmaps_store[project_id] = roadmap

    roadmap_file = _get_roadmap_file(project_path)
    roadmap_file.parent.mkdir(parents=True, exist_ok=True)

    try:
        with open(roadmap_file, "w") as f:
            json.dump(roadmap, f, indent=2, default=str)
    except Exception as e:
        print(f"[Roadmap] Error saving roadmap: {e}")


def register_roadmap_handlers(ws_manager, api_main):
    """Register roadmap-related WebSocket handlers."""

    async def roadmap_get(conn_id: str, payload: dict) -> Optional[dict]:
        """Get roadmap for a project."""
        project_id = payload.get("projectId")
        if not project_id or project_id not in api_main.projects:
            return None

        project = api_main.projects[project_id]
        return _load_roadmap(project_id, project.path)

    async def roadmap_generate(conn_id: str, payload: dict) -> dict:
        """Generate roadmap using AI analysis."""
        project_id = payload.get("projectId")
        options = payload.get("options", {})

        if not project_id or project_id not in api_main.projects:
            return {"success": False, "error": "Project not found"}

        project = api_main.projects[project_id]

        # Start async roadmap generation
        asyncio.create_task(
            _run_roadmap_generation(
                ws_manager, conn_id, project_id, project.path, options
            )
        )

        return {"success": True, "message": "Roadmap generation started"}

    async def roadmap_refresh(conn_id: str, payload: dict) -> dict:
        """Refresh roadmap by re-analyzing the codebase."""
        project_id = payload.get("projectId")

        if not project_id or project_id not in api_main.projects:
            return {"success": False, "error": "Project not found"}

        project = api_main.projects[project_id]

        # Clear cached roadmap
        if project_id in _roadmaps_store:
            del _roadmaps_store[project_id]

        # Start fresh generation
        asyncio.create_task(
            _run_roadmap_generation(
                ws_manager, conn_id, project_id, project.path, {}
            )
        )

        return {"success": True, "message": "Roadmap refresh started"}

    async def roadmap_update_feature_status(conn_id: str, payload: dict) -> dict:
        """Update the status of a roadmap feature."""
        project_id = payload.get("projectId")
        feature_id = payload.get("featureId")
        status = payload.get("status")

        if not project_id or project_id not in api_main.projects:
            return {"success": False, "error": "Project not found"}

        project = api_main.projects[project_id]
        roadmap = _load_roadmap(project_id, project.path)

        if not roadmap:
            return {"success": False, "error": "Roadmap not found"}

        # Find and update the feature
        updated = False
        for phase in roadmap.get("phases", []):
            for feature in phase.get("features", []):
                if feature.get("id") == feature_id:
                    feature["status"] = status
                    feature["updatedAt"] = datetime.now().isoformat()
                    updated = True
                    break
            if updated:
                break

        if updated:
            roadmap["updatedAt"] = datetime.now().isoformat()
            _save_roadmap(project_id, project.path, roadmap)
            return {"success": True}

        return {"success": False, "error": "Feature not found"}

    async def roadmap_convert_to_task(conn_id: str, payload: dict) -> dict:
        """Convert a roadmap feature to a task."""
        project_id = payload.get("projectId")
        feature_id = payload.get("featureId")

        if not project_id or project_id not in api_main.projects:
            return {"success": False, "error": "Project not found"}

        project = api_main.projects[project_id]
        roadmap = _load_roadmap(project_id, project.path)

        if not roadmap:
            return {"success": False, "error": "Roadmap not found"}

        # Find the feature
        feature = None
        for phase in roadmap.get("phases", []):
            for f in phase.get("features", []):
                if f.get("id") == feature_id:
                    feature = f
                    break
            if feature:
                break

        if not feature:
            return {"success": False, "error": "Feature not found"}

        # Create task via existing task creation logic
        from .main import TaskCreateRequest

        task_request = TaskCreateRequest(
            projectId=project_id,
            title=feature.get("title", "Feature from roadmap"),
            description=feature.get("description", "")
        )

        result = await api_main.create_task(task_request)

        if "task" in result:
            # Update feature status to in_progress
            feature["status"] = "in_progress"
            feature["taskId"] = result["task"]["id"]
            feature["updatedAt"] = datetime.now().isoformat()
            _save_roadmap(project_id, project.path, roadmap)

            return {"success": True, "data": result["task"]}

        return {"success": False, "error": "Failed to create task"}

    # Register handlers
    handlers = {
        "roadmap.get": roadmap_get,
        "roadmap.generate": roadmap_generate,
        "roadmap.refresh": roadmap_refresh,
        "roadmap.updateFeatureStatus": roadmap_update_feature_status,
        "roadmap.convertToTask": roadmap_convert_to_task,
    }

    for action, handler in handlers.items():
        ws_manager.register_handler(action, handler)

    print(f"[Roadmap] Registered {len(handlers)} handlers")


async def _run_roadmap_generation(
    ws_manager, conn_id: str, project_id: str, project_path: str, options: dict
):
    """Run AI-powered roadmap generation."""
    try:
        await ws_manager.send_event(conn_id, f"roadmap.{project_id}.progress", {
            "stage": "analyzing",
            "message": "Analyzing codebase structure..."
        })

        # Get the roadmap runner path
        runner_path = Path("/app/auto-claude/runners/roadmap_runner.py")
        if not runner_path.exists():
            # Development fallback
            runner_path = Path(__file__).parent.parent / "auto-claude" / "runners" / "roadmap_runner.py"

        if not runner_path.exists():
            # Generate a basic roadmap without AI
            await _generate_basic_roadmap(ws_manager, conn_id, project_id, project_path)
            return

        # Run the roadmap runner
        process = await asyncio.create_subprocess_exec(
            "python3", str(runner_path),
            "--project-dir", project_path,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            cwd=project_path
        )

        stdout, stderr = await process.communicate()

        if process.returncode != 0:
            print(f"[Roadmap] Runner error: {stderr.decode()}")
            await _generate_basic_roadmap(ws_manager, conn_id, project_id, project_path)
            return

        # Parse output
        try:
            output = stdout.decode()
            # Try to find JSON in output
            json_start = output.find("{")
            json_end = output.rfind("}") + 1
            if json_start >= 0 and json_end > json_start:
                roadmap_data = json.loads(output[json_start:json_end])
                roadmap = _format_roadmap(project_id, roadmap_data)
                _save_roadmap(project_id, project_path, roadmap)

                await ws_manager.send_event(conn_id, f"roadmap.{project_id}.complete", {
                    "roadmap": roadmap
                })
                return
        except json.JSONDecodeError:
            pass

        # Fallback to basic roadmap
        await _generate_basic_roadmap(ws_manager, conn_id, project_id, project_path)

    except Exception as e:
        print(f"[Roadmap] Generation error: {e}")
        import traceback
        traceback.print_exc()
        await ws_manager.send_event(conn_id, f"roadmap.{project_id}.error", {
            "error": str(e)
        })


async def _generate_basic_roadmap(ws_manager, conn_id: str, project_id: str, project_path: str):
    """Generate a basic roadmap without AI."""
    roadmap = {
        "id": f"roadmap-{uuid.uuid4().hex[:8]}",
        "projectId": project_id,
        "title": "Project Roadmap",
        "description": "Auto-generated roadmap based on project analysis",
        "phases": [
            {
                "id": f"phase-{uuid.uuid4().hex[:8]}",
                "name": "Phase 1: Foundation",
                "description": "Core functionality and infrastructure",
                "features": [],
                "status": "current"
            },
            {
                "id": f"phase-{uuid.uuid4().hex[:8]}",
                "name": "Phase 2: Enhancement",
                "description": "Feature improvements and optimizations",
                "features": [],
                "status": "planned"
            },
            {
                "id": f"phase-{uuid.uuid4().hex[:8]}",
                "name": "Phase 3: Polish",
                "description": "Final polish and documentation",
                "features": [],
                "status": "future"
            }
        ],
        "createdAt": datetime.now().isoformat(),
        "updatedAt": datetime.now().isoformat()
    }

    _save_roadmap(project_id, project_path, roadmap)

    await ws_manager.send_event(conn_id, f"roadmap.{project_id}.complete", {
        "roadmap": roadmap
    })


def _format_roadmap(project_id: str, data: dict) -> dict:
    """Format raw roadmap data into structured format."""
    now = datetime.now().isoformat()

    # Handle both flat features list and phased format
    if "phases" in data:
        phases = []
        for i, phase in enumerate(data["phases"]):
            formatted_features = []
            for j, feature in enumerate(phase.get("features", [])):
                formatted_features.append({
                    "id": feature.get("id", f"feature-{uuid.uuid4().hex[:8]}"),
                    "title": feature.get("title", feature.get("name", "Feature")),
                    "description": feature.get("description", ""),
                    "priority": feature.get("priority", "medium"),
                    "status": feature.get("status", "planned"),
                    "effort": feature.get("effort", "medium"),
                    "createdAt": now,
                    "updatedAt": now
                })
            phases.append({
                "id": phase.get("id", f"phase-{uuid.uuid4().hex[:8]}"),
                "name": phase.get("name", f"Phase {i + 1}"),
                "description": phase.get("description", ""),
                "features": formatted_features,
                "status": "current" if i == 0 else "planned"
            })
    else:
        # Convert flat features list to single phase
        features = data.get("features", [])
        formatted_features = []
        for feature in features:
            formatted_features.append({
                "id": feature.get("id", f"feature-{uuid.uuid4().hex[:8]}"),
                "title": feature.get("title", feature.get("name", "Feature")),
                "description": feature.get("description", ""),
                "priority": feature.get("priority", "medium"),
                "status": feature.get("status", "planned"),
                "effort": feature.get("effort", "medium"),
                "createdAt": now,
                "updatedAt": now
            })
        phases = [{
            "id": f"phase-{uuid.uuid4().hex[:8]}",
            "name": "Features",
            "description": "Project features",
            "features": formatted_features,
            "status": "current"
        }]

    return {
        "id": f"roadmap-{uuid.uuid4().hex[:8]}",
        "projectId": project_id,
        "title": data.get("title", "Project Roadmap"),
        "description": data.get("description", ""),
        "phases": phases,
        "createdAt": now,
        "updatedAt": now
    }
