"""
Merge Handler - WebSocket handlers for merge operations.

Provides real-time merge functionality for the hierarchical branching model.
"""

import sys
from pathlib import Path
from typing import Any, Dict
from dataclasses import asdict

# Add auto-claude directory to path for imports
# The directory has a hyphen which Python can't import directly
_auto_claude_path = Path(__file__).parent.parent / "auto-claude"
if str(_auto_claude_path) not in sys.path:
    sys.path.insert(0, str(_auto_claude_path))


def register_merge_handlers(ws_manager, api_main):
    """Register merge-related WebSocket handlers."""

    async def merge_subtask(conn_id: str, payload: dict) -> dict:
        """Merge a subtask branch into its parent feature branch."""
        from core.merge_manager import get_merge_manager

        task_id = payload.get("taskId")
        subtask_id = payload.get("subtaskId")
        no_commit = payload.get("noCommit", False)
        message = payload.get("message")

        if not task_id or not subtask_id:
            return {"success": False, "error": "taskId and subtaskId required"}

        # Get task to find project
        if task_id not in api_main.tasks:
            return {"success": False, "error": "Task not found"}

        task = api_main.tasks[task_id]
        project = api_main.projects.get(task.project_id)
        if not project:
            return {"success": False, "error": "Project not found"}

        try:
            manager = get_merge_manager(project.path)
            result = manager.merge_subtask(task_id, subtask_id, no_commit, message)

            # Update subtask status in database if successful
            if result.success:
                from .database import SubtaskService
                SubtaskService.update(subtask_id, {
                    "status": "merged",
                    "merged_at": __import__("datetime").datetime.utcnow()
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
            return {"success": False, "error": str(e)}

    async def merge_feature_to_dev(conn_id: str, payload: dict) -> dict:
        """Merge a feature branch into dev."""
        from core.merge_manager import get_merge_manager

        task_id = payload.get("taskId")
        no_commit = payload.get("noCommit", False)
        message = payload.get("message")

        if not task_id:
            return {"success": False, "error": "taskId required"}

        # Get task to find project
        if task_id not in api_main.tasks:
            return {"success": False, "error": "Task not found"}

        task = api_main.tasks[task_id]
        project = api_main.projects.get(task.project_id)
        if not project:
            return {"success": False, "error": "Project not found"}

        try:
            manager = get_merge_manager(project.path)
            result = manager.merge_feature_to_dev(task_id, no_commit, message)

            # Update task status in database if successful
            if result.success:
                from .database import TaskService
                from datetime import datetime
                TaskService.update(task_id, {
                    "merged_to_dev_at": datetime.utcnow()
                })

                # Also update in-memory task
                task.status = "done"
                api_main._save_tasks()

                # Broadcast task update
                await ws_manager.broadcast_event(f"project.{task.project_id}.tasks", {
                    "action": "updated",
                    "task": {
                        "id": task_id,
                        "specId": task.spec_id,
                        "projectId": task.project_id,
                        "status": task.status,
                        "title": task.title,
                        "mergedToDev": True
                    }
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
            return {"success": False, "error": str(e)}

    async def merge_preview(conn_id: str, payload: dict) -> dict:
        """Preview what a merge would do without actually merging."""
        from core.merge_manager import get_merge_manager

        task_id = payload.get("taskId")
        source_branch = payload.get("sourceBranch")
        target_branch = payload.get("targetBranch")

        if not task_id:
            return {"success": False, "error": "taskId required"}

        # Get task to find project
        if task_id not in api_main.tasks:
            return {"success": False, "error": "Task not found"}

        task = api_main.tasks[task_id]
        project = api_main.projects.get(task.project_id)
        if not project:
            return {"success": False, "error": "Project not found"}

        # Default branches based on task
        if not source_branch:
            source_branch = f"feature/{task_id}"
        if not target_branch:
            target_branch = "dev"

        try:
            manager = get_merge_manager(project.path)
            preview = manager.preview_merge(source_branch, target_branch)

            return {
                "success": True,
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
        except Exception as e:
            return {"success": False, "error": str(e)}

    async def merge_status(conn_id: str, payload: dict) -> dict:
        """Get merge status for a task."""
        from core.merge_manager import get_merge_manager

        task_id = payload.get("taskId")

        if not task_id:
            return {"success": False, "error": "taskId required"}

        # Get task to find project
        if task_id not in api_main.tasks:
            return {"success": False, "error": "Task not found"}

        task = api_main.tasks[task_id]
        project = api_main.projects.get(task.project_id)
        if not project:
            return {"success": False, "error": "Project not found"}

        try:
            manager = get_merge_manager(project.path)
            feature_branch = f"feature/{task_id}"

            # Check if feature branch exists
            branch_exists = manager._branch_exists(feature_branch, remote=True)

            # Get stats against dev
            if branch_exists:
                preview = manager.preview_merge(feature_branch, "dev")
                return {
                    "success": True,
                    "branchExists": True,
                    "featureBranch": feature_branch,
                    "canMergeToDev": preview.can_merge,
                    "commitsAhead": preview.commits_ahead,
                    "filesChanged": preview.files_changed,
                    "additions": preview.additions,
                    "deletions": preview.deletions,
                    "hasConflicts": len(preview.conflicts) > 0
                }
            else:
                return {
                    "success": True,
                    "branchExists": False,
                    "featureBranch": feature_branch
                }
        except Exception as e:
            return {"success": False, "error": str(e)}

    async def ensure_dev_branch(conn_id: str, payload: dict) -> dict:
        """Ensure dev branch exists for a project."""
        from core.merge_manager import get_merge_manager

        print(f"[MergeHandler] ensure_dev_branch called with payload: {payload}")

        project_id = payload.get("projectId")
        base_branch = payload.get("baseBranch", "main")

        if not project_id:
            print("[MergeHandler] ensure_dev_branch: projectId required")
            return {"success": False, "error": "projectId required"}

        project = api_main.projects.get(project_id)
        if not project:
            print(f"[MergeHandler] ensure_dev_branch: Project not found: {project_id}")
            return {"success": False, "error": "Project not found"}

        print(f"[MergeHandler] ensure_dev_branch: Creating dev branch for project at {project.path}")

        try:
            manager = get_merge_manager(project.path)
            success = manager.ensure_dev_branch(base_branch)

            print(f"[MergeHandler] ensure_dev_branch: Result = {success}")

            return {
                "success": success,
                "message": "Dev branch ready" if success else "Failed to create dev branch"
            }
        except Exception as e:
            print(f"[MergeHandler] ensure_dev_branch: Exception: {e}")
            return {"success": False, "error": str(e)}

    async def create_feature_branch(conn_id: str, payload: dict) -> dict:
        """Create a feature branch for a task."""
        from core.merge_manager import get_merge_manager

        task_id = payload.get("taskId")
        base_branch = payload.get("baseBranch", "dev")

        if not task_id:
            return {"success": False, "error": "taskId required"}

        # Get task to find project
        if task_id not in api_main.tasks:
            return {"success": False, "error": "Task not found"}

        task = api_main.tasks[task_id]
        project = api_main.projects.get(task.project_id)
        if not project:
            return {"success": False, "error": "Project not found"}

        try:
            manager = get_merge_manager(project.path)
            branch_name = manager.create_feature_branch(task_id, base_branch)

            if branch_name:
                # Update task with feature branch
                from .database import TaskService
                TaskService.update(task_id, {"feature_branch": branch_name})

                return {
                    "success": True,
                    "branchName": branch_name,
                    "message": f"Created branch {branch_name}"
                }
            else:
                return {"success": False, "error": "Failed to create feature branch"}
        except Exception as e:
            return {"success": False, "error": str(e)}

    async def list_feature_branches(conn_id: str, payload: dict) -> dict:
        """List all feature branches for a project."""
        import subprocess

        project_id = payload.get("projectId")

        if not project_id:
            return {"success": False, "error": "projectId required"}

        project = api_main.projects.get(project_id)
        if not project:
            return {"success": False, "error": "Project not found"}

        try:
            # Check if dev branch exists
            dev_result = subprocess.run(
                ["git", "ls-remote", "--heads", "origin", "dev"],
                cwd=project.path,
                capture_output=True,
                text=True
            )
            has_dev_branch = bool(dev_result.stdout.strip())

            # Get all branches matching feature/*
            result = subprocess.run(
                ["git", "branch", "-r", "--list", "origin/feature/*"],
                cwd=project.path,
                capture_output=True,
                text=True
            )

            branches = []
            if result.returncode == 0:
                for line in result.stdout.strip().split("\n"):
                    if line:
                        branch = line.strip().replace("origin/", "")
                        # Extract task ID from branch name
                        parts = branch.replace("feature/", "").split("/")
                        task_id = parts[0] if parts else ""

                        branches.append({
                            "name": branch,
                            "taskId": task_id,
                            "isSubtask": len(parts) > 1
                        })

            return {
                "success": True,
                "branches": branches,
                "hasDevBranch": has_dev_branch
            }
        except Exception as e:
            return {"success": False, "error": str(e)}

    # Register handlers
    handlers = {
        "merge.subtask": merge_subtask,
        "merge.featureToDev": merge_feature_to_dev,
        "merge.preview": merge_preview,
        "merge.status": merge_status,
        "merge.ensureDevBranch": ensure_dev_branch,
        "merge.createFeatureBranch": create_feature_branch,
        "merge.listFeatureBranches": list_feature_branches,
    }

    for action, handler in handlers.items():
        ws_manager.register_handler(action, handler)

    print(f"[WS] Registered {len(handlers)} merge handlers")
