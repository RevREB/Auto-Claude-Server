"""
Pytest configuration and fixtures for backend API tests
"""
import os
import sys
import pytest
from pathlib import Path
from typing import Generator
from fastapi.testclient import TestClient

# Add backend directory to path
backend_path = Path(__file__).parent.parent.parent / "backend"
sys.path.insert(0, str(backend_path))

# Import the FastAPI app
from api.main import app


@pytest.fixture
def client() -> Generator[TestClient, None, None]:
    """
    FastAPI test client fixture
    """
    with TestClient(app) as test_client:
        yield test_client


@pytest.fixture
def api_url() -> str:
    """
    Base API URL fixture
    """
    return os.getenv("API_URL", "http://localhost:8000")


@pytest.fixture
def test_project_data():
    """
    Sample project data for testing
    """
    return {
        "name": "test-project",
        "location": "/projects"
    }


@pytest.fixture
def test_task_data():
    """
    Sample task data for testing
    """
    return {
        "projectId": "test-project-123",
        "title": "Test Task",
        "description": "This is a test task"
    }


@pytest.fixture
def mock_git_initialized_status():
    """
    Mock git status for initialized repository
    """
    return {
        "isInitialized": True,
        "hasCommits": True,
        "branch": "main",
        "hasRemote": False,
        "ahead": 0,
        "behind": 0,
        "staged": [],
        "modified": [],
        "untracked": []
    }


@pytest.fixture
def mock_git_uninitialized_status():
    """
    Mock git status for uninitialized repository
    """
    return {
        "isInitialized": False,
        "hasCommits": False
    }


@pytest.fixture
def mock_github_auth_status():
    """
    Mock GitHub authentication status
    """
    return {
        "authenticated": True,
        "username": "testuser"
    }


@pytest.fixture(autouse=True)
def reset_test_state():
    """
    Reset any global state before each test
    """
    # Clear any in-memory data structures
    # This runs before each test
    yield
    # Cleanup after test
    pass


@pytest.fixture
def temp_project_dir(tmp_path):
    """
    Create a temporary project directory for testing
    """
    project_dir = tmp_path / "test-project"
    project_dir.mkdir()
    (project_dir / "README.md").write_text("# Test Project\n")
    return project_dir


@pytest.fixture
def git_initialized_project(temp_project_dir):
    """
    Create a temporary project with git initialized
    """
    import subprocess

    # Initialize git
    subprocess.run(["git", "init"], cwd=temp_project_dir, check=True)
    subprocess.run(["git", "config", "user.email", "test@example.com"], cwd=temp_project_dir, check=True)
    subprocess.run(["git", "config", "user.name", "Test User"], cwd=temp_project_dir, check=True)
    subprocess.run(["git", "add", "."], cwd=temp_project_dir, check=True)
    subprocess.run(["git", "commit", "-m", "Initial commit"], cwd=temp_project_dir, check=True)

    return temp_project_dir


class MockSubprocess:
    """
    Mock subprocess for git commands
    """

    def __init__(self, returncode=0, stdout="", stderr=""):
        self.returncode = returncode
        self.stdout = stdout
        self.stderr = stderr


@pytest.fixture
def mock_subprocess_run(monkeypatch):
    """
    Mock subprocess.run for testing git commands
    """
    def _mock_run(cmd, *args, **kwargs):
        # Default successful response
        if "git" in cmd[0]:
            if "status" in cmd:
                return MockSubprocess(0, "On branch main\nnothing to commit", "")
            elif "init" in cmd:
                return MockSubprocess(0, "Initialized empty Git repository", "")
            elif "config" in cmd:
                return MockSubprocess(0, "", "")
            elif "add" in cmd:
                return MockSubprocess(0, "", "")
            elif "commit" in cmd:
                return MockSubprocess(0, "[main abc1234] Initial commit", "")
            elif "rev-list" in cmd:
                return MockSubprocess(0, "abc1234", "")

        return MockSubprocess(0, "", "")

    monkeypatch.setattr("subprocess.run", _mock_run)


@pytest.fixture
def mock_claude_api():
    """
    Mock Claude API responses
    """
    class MockClaudeResponse:
        def __init__(self, content):
            self.content = content
            self.status_code = 200

        def json(self):
            return {"response": self.content}

    return MockClaudeResponse


@pytest.fixture
def mock_github_cli(monkeypatch):
    """
    Mock GitHub CLI commands
    """
    def _mock_gh(cmd, *args, **kwargs):
        if "auth" in cmd and "status" in cmd:
            return MockSubprocess(0, "✓ Logged in to github.com as testuser", "")
        elif "auth" in cmd and "login" in cmd:
            return MockSubprocess(0, "✓ Authentication complete", "")
        elif "api" in cmd and "user" in cmd:
            return MockSubprocess(0, '{"login": "testuser"}', "")

        return MockSubprocess(0, "", "")

    monkeypatch.setattr("subprocess.run", _mock_gh)


# Pytest configuration
def pytest_configure(config):
    """
    Configure pytest
    """
    config.addinivalue_line("markers", "slow: marks tests as slow (deselect with '-m \"not slow\"')")
    config.addinivalue_line("markers", "integration: marks tests as integration tests")
    config.addinivalue_line("markers", "unit: marks tests as unit tests")
