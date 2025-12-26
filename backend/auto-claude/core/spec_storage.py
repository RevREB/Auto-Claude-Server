"""
Spec Storage Bridge - Abstracts spec data storage to use database instead of flat files.

This module provides a clean interface for the auto-claude runner to read/write
spec data without knowing about the underlying storage mechanism.
"""

import json
import sys
from pathlib import Path
from typing import Optional, Dict, Any, List
from datetime import datetime

# Add API module to path for database access
_API_DIR = Path(__file__).parent.parent.parent / "api"
if str(_API_DIR) not in sys.path:
    sys.path.insert(0, str(_API_DIR))

from database import SpecService, TaskService


class SpecStorage:
    """
    Storage interface for spec data.
    Replaces flat file I/O with database operations.
    """

    def __init__(self, spec_id: str):
        self.spec_id = spec_id

    # -------------------------------------------------------------------------
    # Spec Document
    # -------------------------------------------------------------------------

    def save_spec_markdown(self, content: str) -> None:
        """Save spec.md content."""
        SpecService.upsert(self.spec_id, {"specMarkdown": content})

    def load_spec_markdown(self) -> Optional[str]:
        """Load spec.md content."""
        spec = SpecService.get_by_id(self.spec_id)
        return spec.get("specMarkdown") if spec else None

    # -------------------------------------------------------------------------
    # Task Markdown
    # -------------------------------------------------------------------------

    def save_task_markdown(self, content: str) -> None:
        """Save task.md content."""
        SpecService.upsert(self.spec_id, {"taskMarkdown": content})

    def load_task_markdown(self) -> Optional[str]:
        """Load task.md content."""
        spec = SpecService.get_by_id(self.spec_id)
        return spec.get("taskMarkdown") if spec else None

    # -------------------------------------------------------------------------
    # Implementation Plan
    # -------------------------------------------------------------------------

    def save_implementation_plan(self, plan: Dict[str, Any]) -> None:
        """Save implementation_plan.json content."""
        SpecService.upsert(self.spec_id, {"implementationPlan": plan})

    def load_implementation_plan(self) -> Optional[Dict[str, Any]]:
        """Load implementation_plan.json content."""
        spec = SpecService.get_by_id(self.spec_id)
        return spec.get("implementationPlan") if spec else None

    # -------------------------------------------------------------------------
    # Requirements
    # -------------------------------------------------------------------------

    def save_requirements(self, requirements: Dict[str, Any]) -> None:
        """Save requirements.json content."""
        SpecService.upsert(self.spec_id, {"requirements": requirements})

    def load_requirements(self) -> Optional[Dict[str, Any]]:
        """Load requirements.json content."""
        spec = SpecService.get_by_id(self.spec_id)
        return spec.get("requirements") if spec else None

    # -------------------------------------------------------------------------
    # Context
    # -------------------------------------------------------------------------

    def save_context(self, context: Dict[str, Any]) -> None:
        """Save context.json content."""
        SpecService.upsert(self.spec_id, {"context": context})

    def load_context(self) -> Optional[Dict[str, Any]]:
        """Load context.json content."""
        spec = SpecService.get_by_id(self.spec_id)
        return spec.get("context") if spec else None

    # -------------------------------------------------------------------------
    # Complexity Assessment
    # -------------------------------------------------------------------------

    def save_complexity_assessment(self, assessment: Dict[str, Any]) -> None:
        """Save complexity_assessment.json content."""
        SpecService.upsert(self.spec_id, {"complexityAssessment": assessment})

    def load_complexity_assessment(self) -> Optional[Dict[str, Any]]:
        """Load complexity_assessment.json content."""
        spec = SpecService.get_by_id(self.spec_id)
        return spec.get("complexityAssessment") if spec else None

    # -------------------------------------------------------------------------
    # Review State
    # -------------------------------------------------------------------------

    def save_review_state(self, state: Dict[str, Any]) -> None:
        """Save review_state.json content."""
        SpecService.upsert(self.spec_id, {"reviewState": state})

    def load_review_state(self) -> Optional[Dict[str, Any]]:
        """Load review_state.json content."""
        spec = SpecService.get_by_id(self.spec_id)
        return spec.get("reviewState") if spec else None

    # -------------------------------------------------------------------------
    # QA Report
    # -------------------------------------------------------------------------

    def save_qa_report(self, report: str) -> None:
        """Save qa_report.md content."""
        SpecService.upsert(self.spec_id, {"qaReport": report})

    def load_qa_report(self) -> Optional[str]:
        """Load qa_report.md content."""
        spec = SpecService.get_by_id(self.spec_id)
        return spec.get("qaReport") if spec else None

    # -------------------------------------------------------------------------
    # Init Script
    # -------------------------------------------------------------------------

    def save_init_script(self, script: str) -> None:
        """Save init.sh content."""
        SpecService.upsert(self.spec_id, {"initScript": script})

    def load_init_script(self) -> Optional[str]:
        """Load init.sh content."""
        spec = SpecService.get_by_id(self.spec_id)
        return spec.get("initScript") if spec else None

    # -------------------------------------------------------------------------
    # Build Progress
    # -------------------------------------------------------------------------

    def save_build_progress(self, progress: str) -> None:
        """Save build-progress.txt content."""
        SpecService.upsert(self.spec_id, {"buildProgress": progress})

    def append_build_progress(self, line: str) -> None:
        """Append a line to build-progress.txt."""
        current = self.load_build_progress() or ""
        self.save_build_progress(current + line + "\n")

    def load_build_progress(self) -> Optional[str]:
        """Load build-progress.txt content."""
        spec = SpecService.get_by_id(self.spec_id)
        return spec.get("buildProgress") if spec else None

    # -------------------------------------------------------------------------
    # Task Logs
    # -------------------------------------------------------------------------

    def save_task_logs(self, logs: Dict[str, Any]) -> None:
        """Save task_logs.json content."""
        SpecService.upsert(self.spec_id, {"taskLogs": logs})

    def load_task_logs(self) -> Optional[Dict[str, Any]]:
        """Load task_logs.json content."""
        spec = SpecService.get_by_id(self.spec_id, include_logs=True)
        return spec.get("taskLogs") if spec else None

    def append_task_log_entry(self, phase: str, entry: Dict[str, Any]) -> None:
        """Append an entry to a phase in task_logs.json."""
        logs = self.load_task_logs() or {"phases": {}}
        if phase not in logs.get("phases", {}):
            logs["phases"][phase] = {"entries": [], "status": "in_progress"}
        logs["phases"][phase]["entries"].append(entry)
        logs["updated_at"] = datetime.now().isoformat()
        self.save_task_logs(logs)

    # -------------------------------------------------------------------------
    # Project Index
    # -------------------------------------------------------------------------

    def save_project_index(self, index: Dict[str, Any]) -> None:
        """Save project_index.json content."""
        SpecService.upsert(self.spec_id, {"projectIndex": index})

    def load_project_index(self) -> Optional[Dict[str, Any]]:
        """Load project_index.json content."""
        spec = SpecService.get_by_id(self.spec_id)
        return spec.get("projectIndex") if spec else None

    # -------------------------------------------------------------------------
    # Memory (combined storage for all memory files)
    # -------------------------------------------------------------------------

    def save_memory(self, memory: Dict[str, Any]) -> None:
        """Save all memory data."""
        SpecService.upsert(self.spec_id, {"memory": memory})

    def load_memory(self) -> Optional[Dict[str, Any]]:
        """Load all memory data."""
        spec = SpecService.get_by_id(self.spec_id)
        return spec.get("memory") if spec else None

    def update_memory_field(self, field: str, value: Any) -> None:
        """Update a specific field in memory."""
        memory = self.load_memory() or {}
        memory[field] = value
        self.save_memory(memory)

    def append_to_memory_list(self, field: str, item: Any) -> None:
        """Append an item to a list field in memory."""
        memory = self.load_memory() or {}
        if field not in memory:
            memory[field] = []
        if isinstance(memory[field], list):
            memory[field].append(item)
        self.save_memory(memory)

    # -------------------------------------------------------------------------
    # Codebase Map (part of memory)
    # -------------------------------------------------------------------------

    def save_codebase_map(self, codebase_map: Dict[str, Any]) -> None:
        """Save codebase_map.json content."""
        self.update_memory_field("codebaseMap", codebase_map)

    def load_codebase_map(self) -> Optional[Dict[str, Any]]:
        """Load codebase_map.json content."""
        memory = self.load_memory()
        return memory.get("codebaseMap") if memory else None

    # -------------------------------------------------------------------------
    # Gotchas (part of memory)
    # -------------------------------------------------------------------------

    def save_gotchas(self, gotchas: List[str]) -> None:
        """Save gotchas list."""
        self.update_memory_field("gotchas", gotchas)

    def append_gotcha(self, gotcha: str) -> None:
        """Append a gotcha (with deduplication)."""
        memory = self.load_memory() or {}
        gotchas = memory.get("gotchas", [])
        gotcha_stripped = gotcha.strip()
        if gotcha_stripped and gotcha_stripped not in gotchas:
            gotchas.append(gotcha_stripped)
            self.update_memory_field("gotchas", gotchas)

    def load_gotchas(self) -> List[str]:
        """Load gotchas list."""
        memory = self.load_memory()
        return memory.get("gotchas", []) if memory else []

    # -------------------------------------------------------------------------
    # Patterns (part of memory)
    # -------------------------------------------------------------------------

    def save_patterns(self, patterns: List[str]) -> None:
        """Save patterns list."""
        self.update_memory_field("patterns", patterns)

    def append_pattern(self, pattern: str) -> None:
        """Append a pattern (with deduplication)."""
        memory = self.load_memory() or {}
        patterns = memory.get("patterns", [])
        pattern_stripped = pattern.strip()
        if pattern_stripped and pattern_stripped not in patterns:
            patterns.append(pattern_stripped)
            self.update_memory_field("patterns", patterns)

    def load_patterns(self) -> List[str]:
        """Load patterns list."""
        memory = self.load_memory()
        return memory.get("patterns", []) if memory else []

    # -------------------------------------------------------------------------
    # Session Insights (part of memory)
    # -------------------------------------------------------------------------

    def save_session_insight(self, session_num: int, insight: Dict[str, Any]) -> None:
        """Save a session insight."""
        memory = self.load_memory() or {}
        if "sessionInsights" not in memory:
            memory["sessionInsights"] = {}
        memory["sessionInsights"][f"session_{session_num:03d}"] = insight
        self.save_memory(memory)

    def load_session_insights(self) -> Dict[str, Dict[str, Any]]:
        """Load all session insights."""
        memory = self.load_memory()
        return memory.get("sessionInsights", {}) if memory else {}

    def load_session_insight(self, session_num: int) -> Optional[Dict[str, Any]]:
        """Load a specific session insight."""
        insights = self.load_session_insights()
        return insights.get(f"session_{session_num:03d}")

    # -------------------------------------------------------------------------
    # Full Spec Load/Save
    # -------------------------------------------------------------------------

    def load_all(self) -> Optional[Dict[str, Any]]:
        """Load all spec data."""
        return SpecService.get_by_id(self.spec_id, include_logs=True)

    def exists(self) -> bool:
        """Check if spec exists in database."""
        return SpecService.get_by_id(self.spec_id) is not None


def get_spec_storage(spec_id: str) -> SpecStorage:
    """Factory function to get a SpecStorage instance."""
    return SpecStorage(spec_id)
