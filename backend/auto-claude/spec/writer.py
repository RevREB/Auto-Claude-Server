"""
Spec Writing Module
===================

Spec document creation and validation.
Now uses database storage via SpecStorage.
"""

import json
from datetime import datetime
from pathlib import Path
from typing import Optional

# Try to import SpecStorage for database access
try:
    from core.spec_storage import get_spec_storage
    HAS_DB_STORAGE = True
except ImportError:
    HAS_DB_STORAGE = False


def create_minimal_plan(spec_dir: Path, task_description: str) -> Path:
    """Create a minimal implementation plan for simple tasks."""
    spec_id = spec_dir.name

    plan = {
        "spec_name": spec_id,
        "workflow_type": "simple",
        "total_phases": 1,
        "recommended_workers": 1,
        "phases": [
            {
                "phase": 1,
                "name": "Implementation",
                "description": task_description or "Simple implementation",
                "depends_on": [],
                "subtasks": [
                    {
                        "id": "subtask-1-1",
                        "description": task_description or "Implement the change",
                        "service": "main",
                        "status": "pending",
                        "files_to_create": [],
                        "files_to_modify": [],
                        "patterns_from": [],
                        "verification": {
                            "type": "manual",
                            "run": "Verify the change works as expected",
                        },
                    }
                ],
            }
        ],
        "metadata": {
            "created_at": datetime.now().isoformat(),
            "complexity": "simple",
            "estimated_sessions": 1,
        },
    }

    # Save to database
    if HAS_DB_STORAGE:
        try:
            storage = get_spec_storage(spec_id)
            storage.save_implementation_plan(plan)
        except Exception as e:
            print(f"[SpecWriter] DB save failed, falling back to file: {e}")
            # Fall back to file
            spec_dir.mkdir(parents=True, exist_ok=True)
            plan_file = spec_dir / "implementation_plan.json"
            with open(plan_file, "w") as f:
                json.dump(plan, f, indent=2)
            return plan_file
    else:
        # Legacy: write to file
        spec_dir.mkdir(parents=True, exist_ok=True)
        plan_file = spec_dir / "implementation_plan.json"
        with open(plan_file, "w") as f:
            json.dump(plan, f, indent=2)
        return plan_file

    return spec_dir / "implementation_plan.json"  # Return expected path


def get_plan_stats(spec_dir: Path) -> dict:
    """Get statistics from implementation plan if available."""
    spec_id = spec_dir.name
    plan_data = None

    # Try database first
    if HAS_DB_STORAGE:
        try:
            storage = get_spec_storage(spec_id)
            plan_data = storage.load_implementation_plan()
        except Exception:
            pass

    # Fall back to file if not in DB
    if plan_data is None:
        plan_file = spec_dir / "implementation_plan.json"
        if not plan_file.exists():
            return {}
        try:
            with open(plan_file) as f:
                plan_data = json.load(f)
        except Exception:
            return {}

    if not plan_data:
        return {}

    total_subtasks = sum(
        len(p.get("subtasks", [])) for p in plan_data.get("phases", [])
    )
    return {
        "total_subtasks": total_subtasks,
        "total_phases": len(plan_data.get("phases", [])),
    }
