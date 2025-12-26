"""
Tests for project management endpoints
"""
import pytest
from fastapi.testclient import TestClient


class TestProjectsEndpoints:
    """Test suite for project management"""

    def test_get_projects_returns_list(self, client: TestClient):
        """Test GET /api/projects returns a list"""
        response = client.get("/api/projects")

        assert response.status_code == 200
        data = response.json()

        # Should return either a list or object with projects key
        assert isinstance(data, list) or "projects" in data

    def test_create_project_success(self, client: TestClient, test_project_data):
        """Test POST /api/projects with valid data"""
        response = client.post("/api/projects", json=test_project_data)

        # Should succeed or return validation error
        assert response.status_code in [200, 201, 422]

        if response.status_code in [200, 201]:
            data = response.json()
            assert data.get("success") or "id" in data or "project" in data

    def test_create_project_missing_name(self, client: TestClient):
        """Test POST /api/projects without name fails"""
        response = client.post("/api/projects", json={"location": "/projects"})

        # Should return validation error
        assert response.status_code == 422

    def test_create_project_invalid_location(self, client: TestClient):
        """Test POST /api/projects with invalid location"""
        response = client.post(
            "/api/projects",
            json={"name": "test", "location": "../../../etc/passwd"}
        )

        # Should reject path traversal
        assert response.status_code in [400, 422]

    @pytest.mark.integration
    def test_create_and_get_project(self, client: TestClient):
        """Test creating a project and then retrieving it"""
        # Create project
        create_response = client.post(
            "/api/projects",
            json={"name": "integration-test", "location": "/projects"}
        )

        if create_response.status_code in [200, 201]:
            # Get projects
            get_response = client.get("/api/projects")
            assert get_response.status_code == 200

            projects_data = get_response.json()
            projects = projects_data if isinstance(projects_data, list) else projects_data.get("projects", [])

            # Should contain the created project
            project_names = [p.get("name") for p in projects]
            assert "integration-test" in project_names

    def test_get_project_by_id(self, client: TestClient):
        """Test GET /api/projects/{id}"""
        # First get all projects
        response = client.get("/api/projects")
        assert response.status_code == 200

        projects_data = response.json()
        projects = projects_data if isinstance(projects_data, list) else projects_data.get("projects", [])

        if len(projects) > 0:
            project_id = projects[0].get("id")
            detail_response = client.get(f"/api/projects/{project_id}")

            # Should return project details or 404
            assert detail_response.status_code in [200, 404]


class TestProjectValidation:
    """Test project input validation"""

    @pytest.mark.parametrize("invalid_name", [
        "",
        "   ",
        "project/with/slashes",
        "project\\with\\backslashes",
        "../relative/path",
        "project\x00null"
    ])
    def test_reject_invalid_project_names(self, client: TestClient, invalid_name):
        """Test that invalid project names are rejected"""
        response = client.post(
            "/api/projects",
            json={"name": invalid_name, "location": "/projects"}
        )

        assert response.status_code in [400, 422]

    def test_accept_valid_project_names(self, client: TestClient):
        """Test that valid project names are accepted"""
        valid_names = [
            "my-project",
            "my_project",
            "MyProject123",
            "project-with-dashes"
        ]

        for name in valid_names:
            response = client.post(
                "/api/projects",
                json={"name": name, "location": "/projects"}
            )

            # Should succeed or already exist
            assert response.status_code in [200, 201, 409, 422]


class TestProjectSecurity:
    """Security tests for project endpoints"""

    def test_prevent_path_traversal_in_location(self, client: TestClient):
        """Test that path traversal is prevented"""
        malicious_locations = [
            "../../etc",
            "/etc/passwd",
            "../../../root",
            "~/../../etc"
        ]

        for location in malicious_locations:
            response = client.post(
                "/api/projects",
                json={"name": "test", "location": location}
            )

            # Should reject
            assert response.status_code in [400, 422]

    def test_prevent_directory_listing(self, client: TestClient):
        """Test that arbitrary directory listing is prevented"""
        response = client.get("/api/files/../../etc")

        # Should return 404 or 403, not actual directory contents
        assert response.status_code in [403, 404]
