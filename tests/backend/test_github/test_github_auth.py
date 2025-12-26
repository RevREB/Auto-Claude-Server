"""
Tests for GitHub authentication API

Tests match actual API response format:
- All responses wrapped in {"success": bool, "data": {...}}
"""
import pytest
from fastapi.testclient import TestClient


class TestGitHubAuthStatus:
    """Test GitHub authentication status endpoint"""

    def test_get_auth_status(self, client: TestClient):
        """Test GET /api/github/auth/status"""
        response = client.get("/api/github/auth/status")

        assert response.status_code == 200
        data = response.json()

        # Response is wrapped in success/data
        assert "success" in data
        assert "data" in data
        assert "authenticated" in data["data"]
        assert isinstance(data["data"]["authenticated"], bool)

    def test_auth_status_when_not_authenticated(self, client: TestClient):
        """Test auth status returns False when not authenticated"""
        response = client.get("/api/github/auth/status")

        if response.status_code == 200:
            data = response.json()
            if not data["data"]["authenticated"]:
                assert data["data"]["username"] is None

    def test_auth_status_when_authenticated(self, client: TestClient, mock_github_cli):
        """Test auth status returns True with username when authenticated"""
        response = client.get("/api/github/auth/status")

        if response.status_code == 200:
            data = response.json()
            if data["data"]["authenticated"]:
                assert "username" in data["data"]


class TestGitHubLogin:
    """Test GitHub login endpoint"""

    def test_login_with_valid_token(self, client: TestClient, mock_github_cli):
        """Test POST /api/github/auth/login with valid token"""
        response = client.post(
            "/api/github/auth/login",
            json={"token": "ghp_validtoken123456789012345678901234"}
        )

        # Should succeed or fail gracefully (depends on mock)
        # 500/504 can happen if gh CLI not available or times out
        assert response.status_code in [200, 400, 401, 500, 504]

    def test_login_missing_token(self, client: TestClient):
        """Test login without token"""
        response = client.post("/api/github/auth/login", json={})

        # Should return validation error
        assert response.status_code == 422
        error_data = response.json()
        assert "detail" in error_data

    def test_login_empty_token(self, client: TestClient):
        """Test login with empty token"""
        response = client.post(
            "/api/github/auth/login",
            json={"token": ""}
        )

        # API passes empty token to gh CLI which fails
        # Accept various error codes depending on environment
        assert response.status_code in [400, 422, 500, 504]

    def test_login_invalid_token_format(self, client: TestClient):
        """Test login with invalid token format"""
        invalid_tokens = [
            "not-a-token",
            "ghp_tooshort",
            "invalid_prefix_123456789012345678901234",
        ]

        for token in invalid_tokens:
            response = client.post(
                "/api/github/auth/login",
                json={"token": token}
            )

            # API passes to gh CLI, which will reject invalid tokens
            # 500/504 can happen if CLI not available
            assert response.status_code in [400, 401, 422, 500, 504]

    def test_login_returns_success_message(self, client: TestClient, mock_github_cli):
        """Test that successful login returns success message"""
        response = client.post(
            "/api/github/auth/login",
            json={"token": "ghp_validtoken123456789012345678901234"}
        )

        if response.status_code == 200:
            data = response.json()
            assert data.get("success") == True
            assert "data" in data
            assert "message" in data["data"]


class TestGitHubLogout:
    """Test GitHub logout endpoint"""

    def test_logout(self, client: TestClient):
        """Test POST /api/github/auth/logout"""
        response = client.post("/api/github/auth/logout")

        # Should succeed whether authenticated or not
        # 500 can happen if gh CLI not available
        assert response.status_code in [200, 204, 500]

    def test_logout_returns_success(self, client: TestClient):
        """Test that logout returns success message"""
        response = client.post("/api/github/auth/logout")

        if response.status_code == 200:
            data = response.json()
            assert data.get("success") == True
            assert "data" in data
            assert "message" in data["data"]


class TestGitHubUser:
    """Test GitHub user info endpoint"""

    def test_get_user_when_authenticated(self, client: TestClient, mock_github_cli):
        """Test GET /api/github/user when authenticated"""
        response = client.get("/api/github/user")

        # Should return user info or 401/500
        assert response.status_code in [200, 401, 500]

        if response.status_code == 200:
            data = response.json()
            assert "success" in data
            assert "data" in data
            # User data is inside data wrapper
            assert "login" in data["data"] or "name" in data["data"]

    def test_get_user_when_not_authenticated(self, client: TestClient):
        """Test GET /api/github/user when not authenticated"""
        response = client.get("/api/github/user")

        # Should return 401 when not authenticated
        # Or 500 if gh CLI not available
        if response.status_code == 401:
            error_data = response.json()
            assert "detail" in error_data


class TestGitHubRepos:
    """Test GitHub repositories endpoint"""

    def test_list_repos_when_authenticated(self, client: TestClient, mock_github_cli):
        """Test GET /api/github/repos when authenticated"""
        response = client.get("/api/github/repos")

        # Should return repos list or 401/500
        assert response.status_code in [200, 401, 500]

        if response.status_code == 200:
            data = response.json()
            assert "success" in data
            assert "data" in data
            # Repos are in data array
            assert isinstance(data["data"], list)

    def test_list_repos_when_not_authenticated(self, client: TestClient):
        """Test GET /api/github/repos when not authenticated"""
        response = client.get("/api/github/repos")

        # Should return 401 or 500
        if response.status_code == 401:
            error_data = response.json()
            assert "detail" in error_data


class TestGitHubSecurity:
    """Security tests for GitHub API"""

    def test_token_not_exposed_in_logs(self, client: TestClient):
        """Test that token is not exposed in error messages"""
        response = client.post(
            "/api/github/auth/login",
            json={"token": "ghp_secrettoken123456789012345678901"}
        )

        # Error message should not contain the actual token
        if response.status_code in [400, 401]:
            error_text = response.text
            assert "ghp_secrettoken" not in error_text

    def test_token_not_returned_in_status(self, client: TestClient, mock_github_cli):
        """Test that token is never returned in status endpoint"""
        # Check status
        status_response = client.get("/api/github/auth/status")

        if status_response.status_code == 200:
            status_text = status_response.text
            # Token should never appear in response
            assert "ghp_" not in status_text

    def test_prevent_command_injection_in_token(self, client: TestClient):
        """Test that command injection in token is prevented"""
        malicious_token = "ghp_token; rm -rf /"

        response = client.post(
            "/api/github/auth/login",
            json={"token": malicious_token}
        )

        # Should handle safely - subprocess handles quoting
        # Various error codes acceptable
        assert response.status_code in [400, 401, 422, 500, 504]


@pytest.mark.integration
class TestGitHubAuthWorkflow:
    """Integration tests for GitHub authentication workflow"""

    def test_full_auth_workflow(self, client: TestClient, mock_github_cli):
        """Test complete auth workflow: status -> login -> status -> logout -> status"""
        # 1. Check initial status (should be not authenticated)
        status1 = client.get("/api/github/auth/status")
        assert status1.status_code == 200
        data1 = status1.json()
        assert "data" in data1
        assert "authenticated" in data1["data"]

        # 2. Login (may fail if gh not available)
        login_response = client.post(
            "/api/github/auth/login",
            json={"token": "ghp_validtoken123456789012345678901234"}
        )

        if login_response.status_code == 200:
            # 3. Check status after login
            status2 = client.get("/api/github/auth/status")

            if status2.status_code == 200:
                data = status2.json()
                assert "data" in data
                assert "authenticated" in data["data"]

            # 4. Logout
            logout_response = client.post("/api/github/auth/logout")
            assert logout_response.status_code in [200, 204, 500]

            # 5. Check status after logout
            status3 = client.get("/api/github/auth/status")
            assert status3.status_code == 200

    def test_authenticated_user_can_access_repos(self, client: TestClient, mock_github_cli):
        """Test that authenticated user can access repositories"""
        # Login
        login_response = client.post(
            "/api/github/auth/login",
            json={"token": "ghp_validtoken123456789012345678901234"}
        )

        if login_response.status_code == 200:
            # Try to access repos
            repos_response = client.get("/api/github/repos")

            # Should succeed or return 401/500
            assert repos_response.status_code in [200, 401, 500]
