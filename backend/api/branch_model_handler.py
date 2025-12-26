"""
Branch Model WebSocket Handlers
================================

Handles branch model detection, migration, and management via WebSocket.

Actions:
- branchModel.detect: Detect current branch model
- branchModel.status: Get detailed branch status
- branchModel.migrate: Migrate to hierarchical model
- branchModel.migratePreview: Preview migration changes
- branchModel.validate: Validate a branch name
- branchModel.hierarchy: Get branch hierarchy tree
"""

from pathlib import Path
from typing import Any

from core.branch_model import (
    BranchModel,
    BranchModelManager,
    BranchModelStatus,
    MigrationResult,
)
from core.branch_migration import (
    BranchMigrationChecker,
    MigrationCheckResult,
)


def register_branch_model_handlers(ws_manager: Any, api_main: Any):
    """Register branch model handlers with the WebSocket manager."""

    async def branch_model_detect(conn_id: str, payload: dict) -> dict:
        """
        Detect the branch model for a project.

        Returns the current model type and whether migration is needed.
        """
        project_id = payload.get("projectId")
        if not project_id or project_id not in api_main.projects:
            return {"success": False, "error": "Project not found"}

        project = api_main.projects[project_id]
        project_path = Path(project.path)

        try:
            checker = BranchMigrationChecker(project_path)
            check_result = checker.check()

            print(f"[BranchModel] Detect for {project_id}:")
            print(f"  Model: {check_result.current_model.value}")
            print(f"  Needs migration: {check_result.needs_migration}")
            print(f"  Main: {check_result.status.main_branch}")
            print(f"  Dev: {check_result.status.dev_branch}")
            print(f"  Worktree branches: {check_result.status.worktree_branches}")
            print(f"  Feature branches: {check_result.status.feature_branches}")

            return {
                "success": True,
                "model": check_result.current_model.value,
                "needsMigration": check_result.needs_migration,
                "message": check_result.message,
                "status": _serialize_status(check_result.status),
            }
        except Exception as e:
            return {"success": False, "error": str(e)}

    async def branch_model_status(conn_id: str, payload: dict) -> dict:
        """
        Get detailed branch model status.

        Returns full status including all branches, issues, and migration steps.
        """
        project_id = payload.get("projectId")
        if not project_id or project_id not in api_main.projects:
            return {"success": False, "error": "Project not found"}

        project = api_main.projects[project_id]
        project_path = Path(project.path)

        try:
            manager = BranchModelManager(project_path)
            status = manager.detect_model()
            status_text = manager.print_status()

            return {
                "success": True,
                "status": _serialize_status(status),
                "statusText": status_text,
            }
        except Exception as e:
            return {"success": False, "error": str(e)}

    async def branch_model_migrate_preview(conn_id: str, payload: dict) -> dict:
        """
        Preview what migration would do without making changes.
        """
        project_id = payload.get("projectId")
        if not project_id or project_id not in api_main.projects:
            return {"success": False, "error": "Project not found"}

        project = api_main.projects[project_id]
        project_path = Path(project.path)

        try:
            checker = BranchMigrationChecker(project_path)
            preview = checker.get_migration_preview()
            result = checker.manager.migrate_to_hierarchical(dry_run=True)

            print(f"[BranchModel] Migration preview for {project_id}:")
            print(f"  Branches to create: {result.branches_created}")
            print(f"  Branches to rename: {result.branches_renamed}")
            print(f"  Warnings: {result.warnings}")

            return {
                "success": True,
                "preview": preview,
                "branchesToCreate": result.branches_created,
                "branchesToRename": result.branches_renamed,
                "warnings": result.warnings,
            }
        except Exception as e:
            return {"success": False, "error": str(e)}

    async def branch_model_migrate(conn_id: str, payload: dict) -> dict:
        """
        Perform migration to hierarchical branch model.
        """
        project_id = payload.get("projectId")
        if not project_id or project_id not in api_main.projects:
            return {"success": False, "error": "Project not found"}

        project = api_main.projects[project_id]
        project_path = Path(project.path)

        try:
            checker = BranchMigrationChecker(project_path)
            result = checker.migrate()

            # Broadcast migration event
            await ws_manager.broadcast_event(f"project.{project_id}.branchModel", {
                "action": "migrated",
                "model": "hierarchical",
                "branchesCreated": result.branches_created,
                "branchesRenamed": result.branches_renamed,
            })

            return {
                "success": result.success,
                "model": result.model.value,
                "branchesCreated": result.branches_created,
                "branchesRenamed": result.branches_renamed,
                "errors": result.errors,
                "warnings": result.warnings,
            }
        except Exception as e:
            return {"success": False, "error": str(e)}

    async def branch_model_validate(conn_id: str, payload: dict) -> dict:
        """
        Validate a branch name against the hierarchical model.
        """
        project_id = payload.get("projectId")
        branch_name = payload.get("branchName")

        if not branch_name:
            return {"success": False, "error": "branchName required"}

        if not project_id or project_id not in api_main.projects:
            return {"success": False, "error": "Project not found"}

        project = api_main.projects[project_id]
        project_path = Path(project.path)

        try:
            manager = BranchModelManager(project_path)
            is_valid, error = manager.validate_branch_name(branch_name)
            merge_target = manager.get_merge_target(branch_name) if is_valid else None

            return {
                "success": True,
                "valid": is_valid,
                "error": error if not is_valid else None,
                "mergeTarget": merge_target,
            }
        except Exception as e:
            return {"success": False, "error": str(e)}

    async def branch_model_hierarchy(conn_id: str, payload: dict) -> dict:
        """
        Get the branch hierarchy tree.
        """
        project_id = payload.get("projectId")
        if not project_id or project_id not in api_main.projects:
            return {"success": False, "error": "Project not found"}

        project = api_main.projects[project_id]
        project_path = Path(project.path)

        try:
            manager = BranchModelManager(project_path)
            hierarchy = manager.get_branch_hierarchy()

            return {
                "success": True,
                "hierarchy": hierarchy,
            }
        except Exception as e:
            return {"success": False, "error": str(e)}

    async def branch_model_create_feature(conn_id: str, payload: dict) -> dict:
        """
        Create a feature branch for a task.
        """
        project_id = payload.get("projectId")
        task_id = payload.get("taskId")
        base_branch = payload.get("baseBranch", "dev")

        if not task_id:
            return {"success": False, "error": "taskId required"}

        if not project_id or project_id not in api_main.projects:
            return {"success": False, "error": "Project not found"}

        project = api_main.projects[project_id]
        project_path = Path(project.path)

        try:
            manager = BranchModelManager(project_path)
            branch_name = manager.create_feature_branch(task_id, base_branch)

            return {
                "success": True,
                "branchName": branch_name,
            }
        except Exception as e:
            return {"success": False, "error": str(e)}

    async def branch_model_create_subtask(conn_id: str, payload: dict) -> dict:
        """
        Create a subtask branch.
        """
        project_id = payload.get("projectId")
        task_id = payload.get("taskId")
        subtask_id = payload.get("subtaskId")

        if not task_id or not subtask_id:
            return {"success": False, "error": "taskId and subtaskId required"}

        if not project_id or project_id not in api_main.projects:
            return {"success": False, "error": "Project not found"}

        project = api_main.projects[project_id]
        project_path = Path(project.path)

        try:
            manager = BranchModelManager(project_path)
            branch_name = manager.create_subtask_branch(task_id, subtask_id)

            return {
                "success": True,
                "branchName": branch_name,
            }
        except Exception as e:
            return {"success": False, "error": str(e)}

    async def branch_model_create_release(conn_id: str, payload: dict) -> dict:
        """
        Create a release branch.
        """
        project_id = payload.get("projectId")
        version = payload.get("version")
        base_branch = payload.get("baseBranch", "dev")

        if not version:
            return {"success": False, "error": "version required"}

        if not project_id or project_id not in api_main.projects:
            return {"success": False, "error": "Project not found"}

        project = api_main.projects[project_id]
        project_path = Path(project.path)

        try:
            manager = BranchModelManager(project_path)
            branch_name = manager.create_release_branch(version, base_branch)

            return {
                "success": True,
                "branchName": branch_name,
            }
        except Exception as e:
            return {"success": False, "error": str(e)}

    async def branch_model_create_hotfix(conn_id: str, payload: dict) -> dict:
        """
        Create a hotfix branch from a tag.
        """
        project_id = payload.get("projectId")
        name = payload.get("name")
        tag = payload.get("tag")

        if not name or not tag:
            return {"success": False, "error": "name and tag required"}

        if not project_id or project_id not in api_main.projects:
            return {"success": False, "error": "Project not found"}

        project = api_main.projects[project_id]
        project_path = Path(project.path)

        try:
            manager = BranchModelManager(project_path)
            branch_name = manager.create_hotfix_branch(name, tag)

            return {
                "success": True,
                "branchName": branch_name,
            }
        except Exception as e:
            return {"success": False, "error": str(e)}

    # Register handlers
    handlers = {
        "branchModel.detect": branch_model_detect,
        "branchModel.status": branch_model_status,
        "branchModel.migratePreview": branch_model_migrate_preview,
        "branchModel.migrate": branch_model_migrate,
        "branchModel.validate": branch_model_validate,
        "branchModel.hierarchy": branch_model_hierarchy,
        "branchModel.createFeature": branch_model_create_feature,
        "branchModel.createSubtask": branch_model_create_subtask,
        "branchModel.createRelease": branch_model_create_release,
        "branchModel.createHotfix": branch_model_create_hotfix,
    }

    for action, handler in handlers.items():
        ws_manager.register_handler(action, handler)

    print(f"[WS] Registered {len(handlers)} branch model handlers")


def _serialize_status(status: BranchModelStatus) -> dict:
    """Serialize BranchModelStatus to dict for JSON."""
    return {
        "model": status.model.value,
        "mainBranch": status.main_branch,
        "devBranch": status.dev_branch,
        "releaseBranches": status.release_branches,
        "featureBranches": status.feature_branches,
        "worktreeBranches": status.worktree_branches,
        "issues": status.issues,
        "canMigrate": status.can_migrate,
        "migrationSteps": status.migration_steps,
    }
