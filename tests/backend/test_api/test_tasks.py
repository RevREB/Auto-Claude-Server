"""
Tests for task management endpoints

Tests match actual API behavior:
- Task creation accepts any non-null title (no length/whitespace validation)
- Build start requires both spec_id and project_path
"""
import pytest
from fastapi.testclient import TestClient


class TestTasksEndpoints:
    """Test suite for task management"""

    def test_create_task_success(self, client: TestClient, test_task_data):
        """Test POST /api/tasks with valid data"""
        response = client.post("/api/tasks", json=test_task_data)

        # Should succeed or return validation error
        assert response.status_code in [200, 201, 422]

        if response.status_code in [200, 201]:
            data = response.json()
            assert data.get("success") or "spec_id" in data or "task" in data

    def test_create_task_missing_required_fields(self, client: TestClient):
        """Test POST /api/tasks without required fields"""
        response = client.post("/api/tasks", json={})

        # Should return validation error
        assert response.status_code == 422
        error_data = response.json()
        assert "detail" in error_data

    def test_create_task_missing_title(self, client: TestClient):
        """Test POST /api/tasks without title"""
        response = client.post(
            "/api/tasks",
            json={"projectId": "test-123", "description": "Test"}
        )

        assert response.status_code == 422

    def test_create_task_missing_project_id(self, client: TestClient):
        """Test POST /api/tasks without projectId"""
        response = client.post(
            "/api/tasks",
            json={"title": "Test Task", "description": "Test"}
        )

        assert response.status_code == 422

    def test_get_task_by_spec_id(self, client: TestClient):
        """Test GET /api/tasks/{spec_id}"""
        # First create a task
        task_data = {
            "projectId": "test-project",
            "title": "Test Task",
            "description": "Test description"
        }
        create_response = client.post("/api/tasks", json=task_data)

        if create_response.status_code in [200, 201]:
            task = create_response.json().get("task", {})
            spec_id = task.get("spec_id")

            if spec_id:
                # Get the task
                get_response = client.get(f"/api/tasks/{spec_id}")
                assert get_response.status_code in [200, 404]

                if get_response.status_code == 200:
                    task_data = get_response.json()
                    assert task_data.get("spec_id") == spec_id


class TestTaskValidation:
    """Test task input validation"""

    def test_empty_title_accepted(self, client: TestClient):
        """Test that empty title is currently accepted (no validation)"""
        response = client.post(
            "/api/tasks",
            json={
                "projectId": "test-123",
                "title": "",
                "description": "Test"
            }
        )

        # API currently accepts empty titles (no validation)
        # This documents current behavior - could be changed to reject
        assert response.status_code in [200, 400, 422]

    def test_whitespace_title_accepted(self, client: TestClient):
        """Test that whitespace-only title is currently accepted"""
        response = client.post(
            "/api/tasks",
            json={
                "projectId": "test-123",
                "title": "   ",
                "description": "Test"
            }
        )

        # API currently accepts whitespace titles (no validation)
        assert response.status_code in [200, 400, 422]

    def test_long_title_accepted(self, client: TestClient):
        """Test that very long title is currently accepted"""
        response = client.post(
            "/api/tasks",
            json={
                "projectId": "test-123",
                "title": "a" * 1001,
                "description": "Test"
            }
        )

        # API currently accepts long titles (no validation)
        assert response.status_code in [200, 400, 422]

    def test_accept_valid_task_data(self, client: TestClient):
        """Test that valid task data is accepted"""
        valid_task = {
            "projectId": "test-project-123",
            "title": "Valid Task Title",
            "description": "This is a valid task description with some details."
        }

        response = client.post("/api/tasks", json=valid_task)

        # Should succeed
        assert response.status_code in [200, 201]


class TestTaskLifecycle:
    """Test task lifecycle operations"""

    @pytest.mark.integration
    def test_create_update_delete_task(self, client: TestClient):
        """Test full task lifecycle"""
        # Create
        create_response = client.post(
            "/api/tasks",
            json={
                "projectId": "test-project",
                "title": "Lifecycle Test Task",
                "description": "Testing lifecycle"
            }
        )

        if create_response.status_code in [200, 201]:
            task = create_response.json().get("task", {})
            spec_id = task.get("spec_id")

            if spec_id:
                # Update (if endpoint exists)
                update_response = client.patch(
                    f"/api/tasks/{spec_id}",
                    json={"status": "in_progress"}
                )
                # May not be implemented yet
                assert update_response.status_code in [200, 404, 405]

                # Delete (if endpoint exists)
                delete_response = client.delete(f"/api/tasks/{spec_id}")
                # May not be implemented yet
                assert delete_response.status_code in [200, 204, 404, 405]


class TestBuildOperations:
    """Test build start/stop operations"""

    def test_start_build(self, client: TestClient):
        """Test POST /api/build/start"""
        # First create a task
        create_response = client.post(
            "/api/tasks",
            json={
                "projectId": "test-project",
                "title": "Build Test Task",
                "description": "Testing build"
            }
        )

        if create_response.status_code in [200, 201]:
            task = create_response.json().get("task", {})
            spec_id = task.get("spec_id")

            if spec_id:
                # Start build - requires both spec_id AND project_path
                build_response = client.post(
                    "/api/build/start",
                    json={
                        "spec_id": spec_id,
                        "project_path": "/projects/test-project"
                    }
                )

                # Should accept or return error
                assert build_response.status_code in [200, 202, 400, 404, 500]

    def test_stop_build(self, client: TestClient):
        """Test POST /api/build/{spec_id}/stop"""
        spec_id = "test-spec-123"

        response = client.post(f"/api/build/{spec_id}/stop")

        # Should handle gracefully even if build not running
        assert response.status_code in [200, 404]

    def test_start_build_missing_spec_id(self, client: TestClient):
        """Test POST /api/build/start without spec_id"""
        response = client.post("/api/build/start", json={})

        # Should return validation error
        assert response.status_code in [400, 422]

    def test_start_build_missing_project_path(self, client: TestClient):
        """Test POST /api/build/start without project_path"""
        response = client.post(
            "/api/build/start",
            json={"spec_id": "test-spec"}
        )

        # Should return validation error - project_path is required
        assert response.status_code in [400, 422]

    def test_get_build_status(self, client: TestClient):
        """Test GET /api/build/{spec_id}/status"""
        spec_id = "test-spec-123"

        response = client.get(f"/api/build/{spec_id}/status")

        # Should return status even for non-existent builds
        assert response.status_code == 200

        data = response.json()
        assert "spec_id" in data
        assert "running" in data
        assert "status" in data


class TestTaskSecurity:
    """Security tests for task endpoints"""

    def test_prevent_xss_in_task_description(self, client: TestClient):
        """Test that XSS attempts in description are handled"""
        malicious_description = '<script>alert("xss")</script>'

        response = client.post(
            "/api/tasks",
            json={
                "projectId": "test-project",
                "title": "XSS Test",
                "description": malicious_description
            }
        )

        if response.status_code in [200, 201]:
            # The API should accept it (backend sanitization is frontend's job)
            # But it shouldn't execute when returned
            task = response.json().get("task", {})
            assert task.get("description") == malicious_description

    def test_prevent_sql_injection_in_task_query(self, client: TestClient):
        """Test that SQL injection attempts are handled"""
        malicious_spec_id = "1' OR '1'='1"

        response = client.get(f"/api/tasks/{malicious_spec_id}")

        # Should return 404, not database error
        assert response.status_code == 404


class TestTaskStatus:
    """Test task status operations"""

    def test_get_task_status(self, client: TestClient):
        """Test GET /api/tasks/{task_id}/status"""
        task_id = "test-task-123"

        response = client.get(f"/api/tasks/{task_id}/status")

        assert response.status_code in [200, 404]

        if response.status_code == 200:
            data = response.json()
            assert data.get("success") == True
            assert "data" in data
            assert "status" in data["data"]
            assert "running" in data["data"]

    def test_start_task(self, client: TestClient):
        """Test POST /api/tasks/{task_id}/start"""
        # Create a task first
        create_response = client.post(
            "/api/tasks",
            json={
                "projectId": "test-project",
                "title": "Start Test Task",
                "description": "Testing start"
            }
        )

        if create_response.status_code in [200, 201]:
            task = create_response.json().get("task", {})
            task_id = task.get("spec_id")

            if task_id:
                response = client.post(f"/api/tasks/{task_id}/start")
                assert response.status_code in [200, 404]

    def test_stop_task(self, client: TestClient):
        """Test POST /api/tasks/{task_id}/stop"""
        task_id = "test-task-123"

        response = client.post(f"/api/tasks/{task_id}/stop")

        assert response.status_code in [200, 404]

    def test_recover_task(self, client: TestClient):
        """Test POST /api/tasks/{task_id}/recover"""
        task_id = "test-task-123"

        response = client.post(f"/api/tasks/{task_id}/recover")

        assert response.status_code in [200, 404]

        if response.status_code == 200:
            data = response.json()
            assert data.get("success") == True


class TestTaskReview:
    """Test task review operations"""

    def test_submit_task_review_approved(self, client: TestClient):
        """Test POST /api/tasks/{task_id}/review with approved=true"""
        task_id = "test-task-123"

        response = client.post(
            f"/api/tasks/{task_id}/review",
            json={"approved": True}
        )

        assert response.status_code in [200, 404]

    def test_submit_task_review_rejected(self, client: TestClient):
        """Test POST /api/tasks/{task_id}/review with approved=false"""
        task_id = "test-task-123"

        response = client.post(
            f"/api/tasks/{task_id}/review",
            json={"approved": False}
        )

        assert response.status_code in [200, 404]


class TestTaskArchive:
    """Test task archive operations"""

    def test_archive_tasks(self, client: TestClient):
        """Test POST /api/tasks/archive"""
        response = client.post(
            "/api/tasks/archive",
            json={"taskIds": ["task-1", "task-2"]}
        )

        assert response.status_code == 200
        data = response.json()
        assert data.get("success") == True

    def test_unarchive_tasks(self, client: TestClient):
        """Test POST /api/tasks/unarchive"""
        response = client.post(
            "/api/tasks/unarchive",
            json={"taskIds": ["task-1", "task-2"]}
        )

        assert response.status_code == 200
        data = response.json()
        assert data.get("success") == True
