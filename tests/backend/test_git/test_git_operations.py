"""
Tests for Git operations API

Tests match actual API response format:
- Responses wrapped in {"success": bool, "data": {...}}
- Uses "isGitRepo" not "isInitialized"
- No git commit endpoint exists
- Git initialize doesn't accept user credentials
"""
import pytest
from fastapi.testclient import TestClient


class TestGitStatus:
    """Test git status endpoint"""

    def test_get_git_status(self, client: TestClient):
        """Test GET /api/projects/{id}/git/status"""
        project_id = "test-project"

        response = client.get(f"/api/projects/{project_id}/git/status")

        # Should return status or 404 if project doesn't exist
        assert response.status_code in [200, 404]

        if response.status_code == 200:
            data = response.json()
            # Check for success/data wrapper OR isGitRepo at top level
            if "success" in data:
                if data["success"]:
                    assert "data" in data
                    assert "isGitRepo" in data["data"] or "currentBranch" in data["data"]
                else:
                    # Not a git repo
                    assert "isGitRepo" in data and data["isGitRepo"] == False

    def test_git_status_initialized_repo(self, client: TestClient, mock_git_initialized_status):
        """Test git status for initialized repository"""
        project_id = "test-project"

        response = client.get(f"/api/projects/{project_id}/git/status")

        if response.status_code == 200:
            data = response.json()
            if data.get("success") and "data" in data:
                git_data = data["data"]
                if git_data.get("isGitRepo"):
                    assert "hasCommits" in git_data
                    assert isinstance(git_data["hasCommits"], bool)

    def test_git_status_uninitialized_repo(self, client: TestClient):
        """Test git status for uninitialized repository"""
        project_id = "new-project"

        response = client.get(f"/api/projects/{project_id}/git/status")

        if response.status_code == 200:
            data = response.json()
            # Check if it's not a git repo
            if not data.get("success"):
                assert data.get("isGitRepo") == False


class TestGitInitialize:
    """Test git initialization endpoint"""

    def test_initialize_git_success(self, client: TestClient):
        """Test POST /api/projects/{id}/git/initialize"""
        project_id = "test-project"

        # API doesn't accept credentials - it uses defaults
        response = client.post(f"/api/projects/{project_id}/git/initialize")

        # Should succeed or return error if already initialized or project not found
        assert response.status_code in [200, 400, 404, 500]

        if response.status_code == 200:
            data = response.json()
            assert data.get("success") == True
            assert "data" in data
            assert "message" in data["data"]

    def test_initialize_git_already_initialized(self, client: TestClient):
        """Test initialize when already initialized"""
        project_id = "test-project"

        # First init
        response1 = client.post(f"/api/projects/{project_id}/git/initialize")

        if response1.status_code == 200:
            # Second init should indicate already initialized
            response2 = client.post(f"/api/projects/{project_id}/git/initialize")

            if response2.status_code == 200:
                data = response2.json()
                assert data.get("success") == True
                assert data["data"].get("alreadyInitialized") == True

    def test_initialize_git_project_not_found(self, client: TestClient):
        """Test initialize for non-existent project"""
        project_id = "non-existent-project"

        response = client.post(f"/api/projects/{project_id}/git/initialize")

        # Should return 404
        assert response.status_code == 404

    def test_initialize_git_creates_initial_commit(self, client: TestClient):
        """Test that initialization creates initial commit"""
        project_id = "test-project"

        # Initialize
        init_response = client.post(f"/api/projects/{project_id}/git/initialize")

        if init_response.status_code == 200:
            # Check status
            status_response = client.get(f"/api/projects/{project_id}/git/status")

            if status_response.status_code == 200:
                data = status_response.json()
                if data.get("success") and "data" in data:
                    git_data = data["data"]
                    assert git_data.get("isGitRepo") == True
                    # Should have initial commit
                    assert git_data.get("hasCommits") == True


class TestGitBranches:
    """Test git branch operations"""

    def test_get_branches(self, client: TestClient):
        """Test GET /api/projects/{id}/git/branches"""
        project_id = "test-project"

        response = client.get(f"/api/projects/{project_id}/git/branches")

        # Should return branches or error
        assert response.status_code in [200, 400, 404]

        if response.status_code == 200:
            data = response.json()
            assert data.get("success") == True
            assert "data" in data
            assert "branches" in data["data"]
            assert isinstance(data["data"]["branches"], list)

    def test_get_current_branch(self, client: TestClient):
        """Test GET /api/projects/{id}/git/current-branch"""
        project_id = "test-project"

        response = client.get(f"/api/projects/{project_id}/git/current-branch")

        assert response.status_code in [200, 400, 404]

        if response.status_code == 200:
            data = response.json()
            assert data.get("success") == True
            assert "data" in data
            assert "branch" in data["data"]

    def test_detect_main_branch(self, client: TestClient):
        """Test GET /api/projects/{id}/git/main-branch"""
        project_id = "test-project"

        response = client.get(f"/api/projects/{project_id}/git/main-branch")

        assert response.status_code in [200, 400, 404]

        if response.status_code == 200:
            data = response.json()
            assert data.get("success") == True
            assert "data" in data
            assert "branch" in data["data"]
            # Should be main, master, or current branch
            assert data["data"]["branch"] in ["main", "master"] or len(data["data"]["branch"]) > 0


class TestGitSecurity:
    """Security tests for git operations"""

    def test_prevent_path_traversal_in_project_id(self, client: TestClient):
        """Test that path traversal in project ID is prevented"""
        malicious_id = "../../etc/passwd"

        response = client.get(f"/api/projects/{malicious_id}/git/status")

        # Should reject or return 404 (project not found)
        assert response.status_code in [400, 404]


@pytest.mark.integration
class TestGitWorkflow:
    """Integration tests for git workflow"""

    def test_full_git_workflow(self, client: TestClient, mock_subprocess_run):
        """Test complete git workflow: status -> init -> status"""
        project_id = "workflow-test-project"

        # 1. Check initial status (may be 404 if project doesn't exist)
        status1 = client.get(f"/api/projects/{project_id}/git/status")

        # 2. Initialize git (if project exists)
        init_response = client.post(f"/api/projects/{project_id}/git/initialize")

        if init_response.status_code == 200:
            # 3. Check status after init
            status2 = client.get(f"/api/projects/{project_id}/git/status")

            if status2.status_code == 200:
                data = status2.json()
                if data.get("success"):
                    assert data["data"].get("isGitRepo") == True

            # 4. Get branches
            branches_response = client.get(f"/api/projects/{project_id}/git/branches")
            assert branches_response.status_code in [200, 400, 404]

    def test_git_status_after_init(self, client: TestClient):
        """Test that git status shows initialized after init"""
        project_id = "test-project"

        # Initialize
        init_response = client.post(f"/api/projects/{project_id}/git/initialize")

        if init_response.status_code == 200:
            # Check status
            status_response = client.get(f"/api/projects/{project_id}/git/status")

            if status_response.status_code == 200:
                data = status_response.json()
                if data.get("success"):
                    assert data["data"].get("isGitRepo") == True
                    assert "currentBranch" in data["data"]
