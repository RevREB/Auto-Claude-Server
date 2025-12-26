"""
Context WebSocket handlers.

Handles project context, memory status, and project indexing.
"""

import json
import subprocess
from pathlib import Path
from typing import Any, Dict, List, Optional


def register_context_handlers(ws_manager, api_main):
    """Register context-related WebSocket handlers."""

    async def context_get_project(conn_id: str, payload: dict) -> dict:
        """Get project context including index and memory status."""
        project_id = payload.get("projectId")

        if not project_id or project_id not in api_main.projects:
            return {
                "projectIndex": None,
                "memoryStatus": None,
                "memoryState": None,
                "recentMemories": [],
                "isLoading": False
            }

        project = api_main.projects[project_id]
        project_path = Path(project.path)

        # Load project index if it exists
        project_index = None
        index_file = project_path / ".auto-claude" / "project_index.json"
        if index_file.exists():
            try:
                with open(index_file) as f:
                    project_index = json.load(f)
            except Exception:
                pass

        # Check memory status (Graphiti MCP)
        import os
        graphiti_enabled = bool(os.environ.get("GRAPHITI_MCP_URL"))

        memory_status = {
            "enabled": graphiti_enabled,
            "available": graphiti_enabled,
            "reason": "Graphiti MCP available" if graphiti_enabled else "Graphiti MCP not configured"
        }

        return {
            "projectIndex": project_index,
            "memoryStatus": memory_status,
            "memoryState": None,
            "recentMemories": [],
            "isLoading": False
        }

    async def context_refresh_index(conn_id: str, payload: dict) -> dict:
        """Refresh the project index by re-analyzing the codebase."""
        project_id = payload.get("projectId")

        if not project_id or project_id not in api_main.projects:
            return {"success": False, "error": "Project not found"}

        project = api_main.projects[project_id]
        project_path = Path(project.path)

        try:
            # Run the indexer if available
            indexer_path = Path("/app/auto-claude/prompts_pkg/project_context.py")
            if not indexer_path.exists():
                indexer_path = Path(__file__).parent.parent / "auto-claude" / "prompts_pkg" / "project_context.py"

            if indexer_path.exists():
                result = subprocess.run(
                    ["python3", "-c", f"""
import sys
sys.path.insert(0, '{indexer_path.parent.parent}')
from prompts_pkg.project_context import create_project_index
index = create_project_index('{project_path}')
import json
print(json.dumps(index, default=str))
"""],
                    capture_output=True,
                    text=True,
                    timeout=120,
                    cwd=str(project_path)
                )

                if result.returncode == 0:
                    try:
                        # Save the index
                        index_data = json.loads(result.stdout)
                        index_file = project_path / ".auto-claude" / "project_index.json"
                        index_file.parent.mkdir(parents=True, exist_ok=True)
                        with open(index_file, "w") as f:
                            json.dump(index_data, f, indent=2)
                        return {"success": True, "data": index_data}
                    except json.JSONDecodeError:
                        pass

            # Fallback: create basic index
            basic_index = _create_basic_index(project_path)
            index_file = project_path / ".auto-claude" / "project_index.json"
            index_file.parent.mkdir(parents=True, exist_ok=True)
            with open(index_file, "w") as f:
                json.dump(basic_index, f, indent=2)

            return {"success": True, "data": basic_index}

        except Exception as e:
            return {"success": False, "error": str(e)}

    async def context_get_memory_status(conn_id: str, payload: dict) -> dict:
        """Get memory system status."""
        import os
        graphiti_enabled = bool(os.environ.get("GRAPHITI_MCP_URL"))

        return {
            "enabled": graphiti_enabled,
            "available": graphiti_enabled,
            "reason": "Graphiti MCP available" if graphiti_enabled else "Graphiti MCP not configured"
        }

    async def context_search_memories(conn_id: str, payload: dict) -> List[dict]:
        """Search memories in the knowledge graph."""
        project_id = payload.get("projectId")
        query = payload.get("query", "")

        # Memory search requires Graphiti MCP which is handled by the Claude agent
        # For now, return empty results
        return []

    async def context_get_recent_memories(conn_id: str, payload: dict) -> List[dict]:
        """Get recent memories from the knowledge graph."""
        project_id = payload.get("projectId")
        limit = payload.get("limit", 10)

        # Memory retrieval requires Graphiti MCP
        return []

    # Register handlers
    handlers = {
        "context.getProject": context_get_project,
        "context.refreshIndex": context_refresh_index,
        "context.getMemoryStatus": context_get_memory_status,
        "context.searchMemories": context_search_memories,
        "context.getRecentMemories": context_get_recent_memories,
    }

    for action, handler in handlers.items():
        ws_manager.register_handler(action, handler)

    print(f"[Context] Registered {len(handlers)} handlers")


def _create_basic_index(project_path: Path) -> dict:
    """Create a basic project index by scanning the directory."""
    index = {
        "projectName": project_path.name,
        "projectPath": str(project_path),
        "languages": [],
        "frameworks": [],
        "files": {
            "total": 0,
            "byExtension": {}
        },
        "directories": [],
        "hasGit": (project_path / ".git").exists(),
        "hasPackageJson": (project_path / "package.json").exists(),
        "hasPyproject": (project_path / "pyproject.toml").exists(),
        "hasCargoToml": (project_path / "Cargo.toml").exists()
    }

    # Count files by extension
    extensions = {}
    try:
        for item in project_path.rglob("*"):
            if item.is_file() and not any(
                p.startswith(".") or p == "node_modules"
                for p in item.relative_to(project_path).parts
            ):
                ext = item.suffix.lower() or "no_extension"
                extensions[ext] = extensions.get(ext, 0) + 1
                index["files"]["total"] += 1
    except Exception:
        pass

    index["files"]["byExtension"] = extensions

    # Detect languages
    lang_map = {
        ".py": "Python",
        ".js": "JavaScript",
        ".ts": "TypeScript",
        ".tsx": "TypeScript",
        ".jsx": "JavaScript",
        ".rs": "Rust",
        ".go": "Go",
        ".java": "Java",
        ".rb": "Ruby",
        ".php": "PHP"
    }

    for ext, lang in lang_map.items():
        if ext in extensions and lang not in index["languages"]:
            index["languages"].append(lang)

    # Detect frameworks
    if (project_path / "package.json").exists():
        try:
            with open(project_path / "package.json") as f:
                pkg = json.load(f)
                deps = {**pkg.get("dependencies", {}), **pkg.get("devDependencies", {})}
                if "react" in deps:
                    index["frameworks"].append("React")
                if "vue" in deps:
                    index["frameworks"].append("Vue")
                if "angular" in deps:
                    index["frameworks"].append("Angular")
                if "next" in deps:
                    index["frameworks"].append("Next.js")
                if "express" in deps:
                    index["frameworks"].append("Express")
                if "electron" in deps:
                    index["frameworks"].append("Electron")
        except Exception:
            pass

    return index
