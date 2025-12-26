"""
Backend PTY (Pseudo-Terminal) service for web-based terminal access.

Provides WebSocket endpoints for interactive terminal sessions in the backend container.
Used for running commands like `claude setup-token` directly from the web UI.
"""

import asyncio
import os
import pty
import select
import struct
import subprocess
import termios
from typing import Dict

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from fastapi.responses import JSONResponse

router = APIRouter(prefix="/api/terminal", tags=["terminal"])

# Store active PTY sessions
_pty_sessions: Dict[str, dict] = {}


class PTYSession:
    """Manages a PTY session with bidirectional I/O."""

    def __init__(self, session_id: str, command: str = "/bin/bash", cwd: str = None):
        self.session_id = session_id
        self.command = command
        self.cwd = cwd
        self.master_fd = None
        self.slave_fd = None
        self.pid = None
        self.running = False

    def start(self):
        """Fork a PTY and start the shell."""
        # Create PTY pair
        self.pid, self.master_fd = pty.fork()

        if self.pid == 0:
            # Child process - change to working directory if specified
            if self.cwd:
                try:
                    os.chdir(self.cwd)
                except Exception as e:
                    print(f"Warning: Could not change to directory {self.cwd}: {e}")
            # exec the shell
            os.execvp(self.command, [self.command])
        else:
            # Parent process - configure terminal
            self.running = True
            # Set non-blocking mode
            os.set_blocking(self.master_fd, False)

    def resize(self, cols: int, rows: int):
        """Resize the terminal."""
        if self.master_fd:
            winsize = struct.pack("HHHH", rows, cols, 0, 0)
            try:
                import fcntl
                fcntl.ioctl(self.master_fd, termios.TIOCSWINSZ, winsize)
            except Exception as e:
                print(f"Error resizing terminal: {e}")

    def write(self, data: str):
        """Write data to the PTY."""
        if self.master_fd and self.running:
            try:
                os.write(self.master_fd, data.encode())
            except Exception as e:
                print(f"Error writing to PTY: {e}")

    async def read(self):
        """Read data from the PTY (async generator)."""
        while self.running:
            if self.master_fd:
                try:
                    # Check if data is available
                    ready, _, _ = select.select([self.master_fd], [], [], 0.1)
                    if ready:
                        data = os.read(self.master_fd, 1024)
                        if data:
                            yield data.decode('utf-8', errors='replace')
                    else:
                        await asyncio.sleep(0.01)
                except OSError:
                    # PTY closed
                    self.running = False
                    break
            else:
                await asyncio.sleep(0.1)

    def close(self):
        """Close the PTY session."""
        self.running = False
        if self.master_fd:
            try:
                os.close(self.master_fd)
            except Exception:
                pass
        if self.pid:
            try:
                os.kill(self.pid, 15)  # SIGTERM
            except Exception:
                pass


@router.post("/create/{session_id}")
async def create_terminal_session(session_id: str, auto_run: str = None, cwd: str = None, start_claude: bool = False):
    """
    Create a new PTY terminal session.

    Args:
        session_id: Unique identifier for this session
        auto_run: Optional command to run automatically (e.g., "claude setup-token")
        cwd: Working directory to start the terminal in
        start_claude: If True, automatically start the claude CLI after terminal starts

    Returns:
        Success status and WebSocket URL
    """
    if session_id in _pty_sessions:
        return JSONResponse(
            status_code=400,
            content={"error": "Session already exists"}
        )

    # Create PTY session with working directory
    pty_session = PTYSession(session_id, cwd=cwd)
    pty_session.start()

    # If start_claude is True and no auto_run specified, auto-run claude
    # Use --dangerously-skip-permissions since we're in a sandboxed Docker environment
    if start_claude and not auto_run:
        auto_run = "claude --dangerously-skip-permissions"

    # Store session
    _pty_sessions[session_id] = {
        "pty": pty_session,
        "auto_run": auto_run
    }

    return {
        "success": True,
        "session_id": session_id,
        "ws_url": f"/api/terminal/ws/{session_id}"
    }


@router.websocket("/ws/{session_id}")
async def terminal_websocket(websocket: WebSocket, session_id: str):
    """
    WebSocket endpoint for terminal I/O.

    Handles bidirectional communication between web UI and PTY.
    """
    await websocket.accept()

    if session_id not in _pty_sessions:
        await websocket.send_json({"type": "error", "message": "Session not found"})
        await websocket.close()
        return

    session_data = _pty_sessions[session_id]
    pty_session: PTYSession = session_data["pty"]
    auto_run = session_data.get("auto_run")

    # Auto-run command if specified
    if auto_run:
        await asyncio.sleep(0.5)  # Give terminal time to initialize
        # Run command and exit shell when done (triggers terminal close)
        pty_session.write(f"{auto_run}; exit\n")

    # Create tasks for reading and writing
    async def read_from_pty():
        """Read from PTY and send to WebSocket."""
        import re
        import json
        from pathlib import Path

        auth_completed = False

        try:
            async for data in pty_session.read():
                # Send terminal output to client
                await websocket.send_json({
                    "type": "output",
                    "data": data
                })

                # Check for OAuth token in output (sk-ant-oat01-...) - for setup-token mode
                token_match = re.search(r'(sk-ant-oat01-[A-Za-z0-9_-]+)', data)
                if token_match:
                    token = token_match.group(1)
                    # Store token in session for later retrieval
                    session_data["extracted_token"] = token
                    print(f"DEBUG: Extracted token from terminal output: {token[:20]}...")

                    # Also send token directly via WebSocket
                    try:
                        await asyncio.sleep(0.1)
                        await websocket.send_json({
                            "type": "token_extracted",
                            "token": token
                        })
                        print(f"DEBUG: Sent token_extracted message via WebSocket")
                        auth_completed = True
                    except Exception as e:
                        print(f"ERROR: Failed to send token via WebSocket: {e}")

                # Check for claude login completion messages
                # These indicate OAuth login succeeded and token was saved to credentials file
                if not auth_completed and any(phrase in data.lower() for phrase in [
                    "logged in as",
                    "login successful",
                    "successfully authenticated",
                    "authentication successful",
                    "you are now logged in"
                ]):
                    print(f"DEBUG: Detected login success message in output")
                    # Try to read token from credentials file
                    creds_paths = [
                        Path("/root/.claude/.credentials.json"),
                        Path.home() / ".claude" / ".credentials.json",
                    ]
                    for creds_path in creds_paths:
                        if creds_path.exists():
                            try:
                                creds_data = json.loads(creds_path.read_text())
                                # Token can be in different locations depending on auth method
                                token = (
                                    creds_data.get("claudeAiOauth", {}).get("accessToken") or
                                    creds_data.get("oauthAccessToken") or
                                    creds_data.get("accessToken")
                                )
                                if token:
                                    session_data["extracted_token"] = token
                                    print(f"DEBUG: Read token from credentials file: {token[:20]}...")
                                    try:
                                        await asyncio.sleep(0.1)
                                        await websocket.send_json({
                                            "type": "token_extracted",
                                            "token": token
                                        })
                                        await websocket.send_json({
                                            "type": "auth_completed",
                                            "success": True
                                        })
                                        print(f"DEBUG: Sent auth_completed message via WebSocket")
                                        auth_completed = True
                                    except Exception as e:
                                        print(f"ERROR: Failed to send auth message via WebSocket: {e}")
                                    break
                            except Exception as e:
                                print(f"DEBUG: Failed to read credentials from {creds_path}: {e}")

        except Exception as e:
            print(f"Error reading from PTY: {e}")

    async def write_to_pty():
        """Receive from WebSocket and write to PTY."""
        try:
            while True:
                message = await websocket.receive_json()
                msg_type = message.get("type")

                if msg_type == "input":
                    data = message.get("data", "")
                    pty_session.write(data)
                elif msg_type == "resize":
                    cols = message.get("cols", 80)
                    rows = message.get("rows", 24)
                    pty_session.resize(cols, rows)
                elif msg_type == "close":
                    break

        except WebSocketDisconnect:
            pass
        except Exception as e:
            print(f"Error in WebSocket: {e}")

    # Run both tasks concurrently
    try:
        await asyncio.gather(
            read_from_pty(),
            write_to_pty()
        )
    finally:
        # Cleanup
        pty_session.close()
        if session_id in _pty_sessions:
            del _pty_sessions[session_id]


@router.get("/{session_id}/token")
async def get_extracted_token(session_id: str):
    """
    Get the OAuth token that was extracted from terminal output.

    Args:
        session_id: The terminal session ID

    Returns:
        The extracted token if found
    """
    if session_id in _pty_sessions:
        session_data = _pty_sessions[session_id]
        token = session_data.get("extracted_token")

        if token:
            return {
                "success": True,
                "token": token
            }
        else:
            return {
                "success": False,
                "error": "No token found in session output yet"
            }

    return JSONResponse(
        status_code=404,
        content={"error": "Session not found"}
    )


@router.delete("/{session_id}")
async def close_terminal_session(session_id: str):
    """Close a terminal session."""
    if session_id in _pty_sessions:
        session_data = _pty_sessions[session_id]
        pty_session: PTYSession = session_data["pty"]
        pty_session.close()
        del _pty_sessions[session_id]
        return {"success": True}

    return JSONResponse(
        status_code=404,
        content={"error": "Session not found"}
    )


@router.get("/sessions")
async def list_terminal_sessions():
    """List all active terminal sessions."""
    return {
        "sessions": [
            {
                "session_id": sid,
                "running": data["pty"].running
            }
            for sid, data in _pty_sessions.items()
        ]
    }
