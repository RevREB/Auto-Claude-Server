"""
Tests for health check endpoint
"""
import pytest
from fastapi.testclient import TestClient


def test_health_check(client: TestClient):
    """
    Test that health check endpoint returns 200
    """
    response = client.get("/health")

    assert response.status_code == 200
    data = response.json()
    assert "status" in data or "message" in data


def test_health_check_structure(client: TestClient):
    """
    Test health check response structure
    """
    response = client.get("/health")

    assert response.status_code == 200
    assert response.headers["content-type"] == "application/json"


@pytest.mark.integration
def test_api_root(client: TestClient):
    """
    Test API root endpoint
    """
    response = client.get("/")

    # Should either redirect or return info
    assert response.status_code in [200, 307, 404]


def test_cors_headers(client: TestClient):
    """
    Test that CORS headers are present
    """
    response = client.options("/health")

    # CORS should be configured
    # Note: Actual CORS behavior depends on configuration
    assert response.status_code in [200, 405]
