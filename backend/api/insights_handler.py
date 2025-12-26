"""
Insights WebSocket handlers.

Handles AI-powered codebase Q&A sessions with streaming responses.
Now uses database storage via ProjectService.
"""

import asyncio
import json
import os
import subprocess
import tempfile
import uuid
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional

from .database import ProjectService

# In-memory cache for sessions (per-project)
# Structure: {project_id: {session_id: InsightsSession}}
_sessions_store: Dict[str, Dict[str, dict]] = {}

# Active insights processes
_active_processes: Dict[str, subprocess.Popen] = {}


def _load_sessions(project_id: str, project_path: str) -> Dict[str, dict]:
    """Load sessions from database (with file fallback for migration)."""
    if project_id in _sessions_store:
        return _sessions_store[project_id]

    # Try database first
    try:
        db_sessions = ProjectService.get_insights_sessions(project_id)
        if db_sessions:
            _sessions_store[project_id] = db_sessions
            return db_sessions
    except Exception as e:
        print(f"[Insights] Error loading sessions from DB: {e}")

    # Fall back to file (for migration)
    sessions_file = Path(project_path) / ".auto-claude" / "insights_sessions.json"
    if sessions_file.exists():
        try:
            with open(sessions_file) as f:
                sessions = json.load(f)
                _sessions_store[project_id] = sessions
                # Migrate to database
                ProjectService.save_insights_sessions(project_id, sessions)
                print(f"[Insights] Migrated sessions to database for {project_id}")
                return sessions
        except Exception as e:
            print(f"[Insights] Error loading sessions from file: {e}")

    _sessions_store[project_id] = {}
    return _sessions_store[project_id]


def _save_sessions(project_id: str, project_path: str):
    """Save sessions to database."""
    if project_id not in _sessions_store:
        return

    try:
        ProjectService.save_insights_sessions(project_id, _sessions_store[project_id])
    except Exception as e:
        print(f"[Insights] Error saving sessions to DB: {e}")


def _create_session(project_id: str, project_path: str) -> dict:
    """Create a new insights session."""
    session_id = f"session-{uuid.uuid4().hex[:8]}"
    session = {
        "id": session_id,
        "projectId": project_id,
        "title": "New conversation",
        "messages": [],
        "modelConfig": {
            "model": "claude-sonnet-4-5-20250929",
            "thinkingLevel": "medium"
        },
        "createdAt": datetime.now().isoformat(),
        "updatedAt": datetime.now().isoformat()
    }

    sessions = _load_sessions(project_id, project_path)
    sessions[session_id] = session
    _save_sessions(project_id, project_path)

    return session


def _get_session_summaries(project_id: str, project_path: str) -> List[dict]:
    """Get summaries of all sessions for a project."""
    sessions = _load_sessions(project_id, project_path)
    summaries = []

    for session in sessions.values():
        summaries.append({
            "id": session["id"],
            "projectId": session["projectId"],
            "title": session.get("title", "Untitled"),
            "messageCount": len(session.get("messages", [])),
            "createdAt": session["createdAt"],
            "updatedAt": session["updatedAt"]
        })

    # Sort by updatedAt descending
    summaries.sort(key=lambda x: x["updatedAt"], reverse=True)
    return summaries


def register_insights_handlers(ws_manager, api_main):
    """Register insights-related WebSocket handlers."""

    async def insights_get_session(conn_id: str, payload: dict) -> Optional[dict]:
        """Get current session for a project (most recent or create new)."""
        project_id = payload.get("projectId")
        if not project_id or project_id not in api_main.projects:
            return None

        project = api_main.projects[project_id]
        sessions = _load_sessions(project_id, project.path)

        if sessions:
            # Return most recent session
            latest = max(sessions.values(), key=lambda s: s.get("updatedAt", ""))
            return latest

        # Create new session if none exist
        return _create_session(project_id, project.path)

    async def insights_list_sessions(conn_id: str, payload: dict) -> List[dict]:
        """List all sessions for a project."""
        project_id = payload.get("projectId")
        if not project_id or project_id not in api_main.projects:
            return []

        project = api_main.projects[project_id]
        return _get_session_summaries(project_id, project.path)

    async def insights_new_session(conn_id: str, payload: dict) -> dict:
        """Create a new session."""
        project_id = payload.get("projectId")
        if not project_id or project_id not in api_main.projects:
            raise ValueError("Project not found")

        project = api_main.projects[project_id]
        return _create_session(project_id, project.path)

    async def insights_switch_session(conn_id: str, payload: dict) -> Optional[dict]:
        """Switch to a different session."""
        project_id = payload.get("projectId")
        session_id = payload.get("sessionId")

        if not project_id or project_id not in api_main.projects:
            return None

        project = api_main.projects[project_id]
        sessions = _load_sessions(project_id, project.path)

        return sessions.get(session_id)

    async def insights_delete_session(conn_id: str, payload: dict) -> dict:
        """Delete a session."""
        project_id = payload.get("projectId")
        session_id = payload.get("sessionId")

        if not project_id or project_id not in api_main.projects:
            return {"success": False, "error": "Project not found"}

        project = api_main.projects[project_id]
        sessions = _load_sessions(project_id, project.path)

        if session_id in sessions:
            del sessions[session_id]
            _save_sessions(project_id, project.path)
            return {"success": True}

        return {"success": False, "error": "Session not found"}

    async def insights_rename_session(conn_id: str, payload: dict) -> dict:
        """Rename a session."""
        project_id = payload.get("projectId")
        session_id = payload.get("sessionId")
        new_title = payload.get("newTitle", "").strip()

        if not project_id or project_id not in api_main.projects:
            return {"success": False, "error": "Project not found"}

        if not new_title:
            return {"success": False, "error": "Title is required"}

        project = api_main.projects[project_id]
        sessions = _load_sessions(project_id, project.path)

        if session_id in sessions:
            sessions[session_id]["title"] = new_title
            sessions[session_id]["updatedAt"] = datetime.now().isoformat()
            _save_sessions(project_id, project.path)
            return {"success": True}

        return {"success": False, "error": "Session not found"}

    async def insights_update_model_config(conn_id: str, payload: dict) -> dict:
        """Update model configuration for a session."""
        project_id = payload.get("projectId")
        session_id = payload.get("sessionId")
        model_config = payload.get("modelConfig", {})

        if not project_id or project_id not in api_main.projects:
            return {"success": False, "error": "Project not found"}

        project = api_main.projects[project_id]
        sessions = _load_sessions(project_id, project.path)

        if session_id in sessions:
            sessions[session_id]["modelConfig"] = model_config
            sessions[session_id]["updatedAt"] = datetime.now().isoformat()
            _save_sessions(project_id, project.path)
            return {"success": True}

        return {"success": False, "error": "Session not found"}

    async def insights_clear_session(conn_id: str, payload: dict) -> dict:
        """Clear messages from current session."""
        project_id = payload.get("projectId")
        session_id = payload.get("sessionId")

        if not project_id or project_id not in api_main.projects:
            return {"success": False, "error": "Project not found"}

        project = api_main.projects[project_id]
        sessions = _load_sessions(project_id, project.path)

        if session_id and session_id in sessions:
            sessions[session_id]["messages"] = []
            sessions[session_id]["updatedAt"] = datetime.now().isoformat()
            _save_sessions(project_id, project.path)

        return {"success": True}

    async def insights_send_message(conn_id: str, payload: dict) -> dict:
        """Send a message and stream the response."""
        project_id = payload.get("projectId")
        message = payload.get("message", "").strip()
        model_config = payload.get("modelConfig", {})

        if not project_id or project_id not in api_main.projects:
            return {"success": False, "error": "Project not found"}

        if not message:
            return {"success": False, "error": "Message is required"}

        project = api_main.projects[project_id]
        sessions = _load_sessions(project_id, project.path)

        # Get or create current session
        if not sessions:
            session = _create_session(project_id, project.path)
        else:
            session = max(sessions.values(), key=lambda s: s.get("updatedAt", ""))

        session_id = session["id"]

        # Add user message to session
        user_msg = {
            "id": f"msg-{uuid.uuid4().hex[:8]}",
            "role": "user",
            "content": message,
            "timestamp": datetime.now().isoformat()
        }
        session["messages"].append(user_msg)
        session["updatedAt"] = datetime.now().isoformat()

        # Update title if this is the first message
        if len(session["messages"]) == 1:
            # Use first 50 chars of message as title
            session["title"] = message[:50] + ("..." if len(message) > 50 else "")

        _save_sessions(project_id, project.path)

        # Start async task to run insights runner and stream response
        asyncio.create_task(
            _run_insights_query(
                ws_manager, conn_id, project_id, project.path,
                session_id, message, session["messages"], model_config
            )
        )

        return {"success": True, "sessionId": session_id}

    async def insights_create_task(conn_id: str, payload: dict) -> dict:
        """Create a task from an insights suggestion."""
        project_id = payload.get("projectId")
        session_id = payload.get("sessionId")
        message_id = payload.get("messageId")
        title = payload.get("title", "").strip()
        description = payload.get("description", "").strip()
        metadata = payload.get("metadata", {})

        if not project_id or project_id not in api_main.projects:
            return {"success": False, "error": "Project not found"}

        if not title:
            return {"success": False, "error": "Title is required"}

        project = api_main.projects[project_id]

        # Check if task was already created from this message
        if session_id and message_id:
            sessions = _load_sessions(project_id, project.path)
            if session_id in sessions:
                session = sessions[session_id]
                for msg in session.get("messages", []):
                    if msg.get("id") == message_id and msg.get("taskCreated"):
                        return {"success": False, "error": "Task already created from this message"}

        # Create task via the existing task creation logic
        from .main import TaskCreateRequest

        task_request = TaskCreateRequest(
            projectId=project_id,
            title=title,
            description=description
        )

        result = await api_main.create_task(task_request)

        if "task" in result:
            # Mark the message as having had its task created
            if session_id and message_id:
                sessions = _load_sessions(project_id, project.path)
                if session_id in sessions:
                    session = sessions[session_id]
                    for msg in session.get("messages", []):
                        if msg.get("id") == message_id:
                            msg["taskCreated"] = True
                            msg["createdTaskId"] = result["task"].get("id")
                            break
                    _save_sessions(project_id, project.path)

            # Broadcast task created event
            await ws_manager.broadcast_event(f"project.{project_id}.tasks", {
                "action": "created",
                "task": result["task"]
            })
            return {"success": True, "task": result["task"]}

        return {"success": False, "error": "Failed to create task"}

    # Register handlers
    handlers = {
        "insights.getSession": insights_get_session,
        "insights.listSessions": insights_list_sessions,
        "insights.newSession": insights_new_session,
        "insights.switchSession": insights_switch_session,
        "insights.deleteSession": insights_delete_session,
        "insights.renameSession": insights_rename_session,
        "insights.updateModelConfig": insights_update_model_config,
        "insights.clearSession": insights_clear_session,
        "insights.sendMessage": insights_send_message,
        "insights.createTask": insights_create_task,
    }

    for action, handler in handlers.items():
        ws_manager.register_handler(action, handler)

    print(f"[Insights] Registered {len(handlers)} handlers")


async def _run_insights_query(
    ws_manager,
    conn_id: str,
    project_id: str,
    project_path: str,
    session_id: str,
    message: str,
    history: List[dict],
    model_config: dict
):
    """Run the insights runner and stream response to client."""

    # Get the insights runner path
    # In Docker, this is at /app/auto-claude/runners/insights_runner.py
    runner_path = Path("/app/auto-claude/runners/insights_runner.py")
    if not runner_path.exists():
        # Development fallback
        runner_path = Path(__file__).parent.parent / "auto-claude" / "runners" / "insights_runner.py"

    if not runner_path.exists():
        await ws_manager.send_event(conn_id, f"insights.{project_id}.chunk", {
            "type": "error",
            "error": "Insights runner not found"
        })
        return

    # Write history to temp file to avoid command line length limits
    history_file = None
    try:
        with tempfile.NamedTemporaryFile(mode='w', suffix='.json', delete=False) as f:
            json.dump(history, f)
            history_file = f.name

        # Build command
        model = model_config.get("model", "claude-sonnet-4-5-20250929")
        thinking_level = model_config.get("thinkingLevel", "medium")

        cmd = [
            "python3", str(runner_path),
            "--project-dir", project_path,
            "--message", message,
            "--history-file", history_file,
            "--model", model,
            "--thinking-level", thinking_level
        ]

        print(f"[Insights] Running: {' '.join(cmd[:6])}...")

        # Run the process
        process = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            cwd=project_path
        )

        _active_processes[session_id] = process

        # Stream stdout
        response_text = ""
        suggested_task = None
        tools_used = []

        while True:
            line = await process.stdout.readline()
            if not line:
                break

            text = line.decode('utf-8')

            # Check for special markers
            if text.startswith("__TOOL_START__:"):
                try:
                    tool_data = json.loads(text[15:].strip())
                    tools_used.append(tool_data)
                    await ws_manager.send_event(conn_id, f"insights.{project_id}.chunk", {
                        "type": "tool_start",
                        "tool": tool_data
                    })
                except json.JSONDecodeError:
                    pass
            elif text.startswith("__TOOL_END__:"):
                try:
                    tool_data = json.loads(text[13:].strip())
                    await ws_manager.send_event(conn_id, f"insights.{project_id}.chunk", {
                        "type": "tool_end",
                        "tool": tool_data
                    })
                except json.JSONDecodeError:
                    pass
            elif text.startswith("__TASK_SUGGESTION__:"):
                try:
                    suggested_task = json.loads(text[20:].strip())
                    await ws_manager.send_event(conn_id, f"insights.{project_id}.chunk", {
                        "type": "task_suggestion",
                        "suggestedTask": suggested_task
                    })
                except json.JSONDecodeError:
                    pass
            else:
                # Regular text
                response_text += text
                await ws_manager.send_event(conn_id, f"insights.{project_id}.chunk", {
                    "type": "text",
                    "content": text
                })

        # Wait for process to complete
        await process.wait()

        # Clean up
        if session_id in _active_processes:
            del _active_processes[session_id]

        # Check for errors
        stderr = await process.stderr.read()
        if stderr:
            stderr_text = stderr.decode('utf-8')
            if process.returncode != 0:
                print(f"[Insights] Runner error: {stderr_text}")

        # Save assistant message to session
        if response_text.strip():
            sessions = _load_sessions(project_id, project_path)
            if session_id in sessions:
                assistant_msg = {
                    "id": f"msg-{uuid.uuid4().hex[:8]}",
                    "role": "assistant",
                    "content": response_text.strip(),
                    "timestamp": datetime.now().isoformat(),
                    "toolsUsed": tools_used if tools_used else None,
                    "suggestedTask": suggested_task
                }
                sessions[session_id]["messages"].append(assistant_msg)
                sessions[session_id]["updatedAt"] = datetime.now().isoformat()
                _save_sessions(project_id, project_path)

        # Send done event
        await ws_manager.send_event(conn_id, f"insights.{project_id}.chunk", {
            "type": "done"
        })

    except Exception as e:
        print(f"[Insights] Error running query: {e}")
        import traceback
        traceback.print_exc()
        await ws_manager.send_event(conn_id, f"insights.{project_id}.chunk", {
            "type": "error",
            "error": str(e)
        })
    finally:
        # Clean up temp file
        if history_file and os.path.exists(history_file):
            os.unlink(history_file)
