# Backend API Tests

Comprehensive test suite for Auto-Claude Docker backend API using pytest.

## Setup

```bash
cd tests/backend
pip install -r requirements.txt
```

## Running Tests

### Run all tests
```bash
pytest
```

### Run with verbose output
```bash
pytest -v
```

### Run specific test file
```bash
pytest test_api/test_projects.py
```

### Run specific test class
```bash
pytest test_api/test_projects.py::TestProjectsEndpoints
```

### Run specific test
```bash
pytest test_api/test_projects.py::TestProjectsEndpoints::test_get_projects_returns_list
```

### Run tests by marker
```bash
# Run only unit tests
pytest -m unit

# Run only integration tests
pytest -m integration

# Skip slow tests
pytest -m "not slow"

# Run security tests
pytest -m security
```

### Run with coverage
```bash
pytest --cov=../../backend/api --cov-report=html
```

### Run in parallel (faster)
```bash
pytest -n auto
```

## Test Organization

```
test_api/
├── test_health.py          # Health check endpoint tests
├── test_projects.py        # Project management tests
└── test_tasks.py           # Task management tests

test_git/
└── test_git_operations.py  # Git operations tests

test_github/
└── test_github_auth.py     # GitHub authentication tests
```

## Writing Tests

### Basic Test Structure

```python
def test_example(client: TestClient):
    """Test description"""
    response = client.get("/api/endpoint")

    assert response.status_code == 200
    data = response.json()
    assert "key" in data
```

### Using Fixtures

```python
def test_with_fixture(client: TestClient, test_project_data):
    """Test with predefined data"""
    response = client.post("/api/projects", json=test_project_data)
    assert response.status_code == 200
```

### Parametrized Tests

```python
@pytest.mark.parametrize("input,expected", [
    ("valid", 200),
    ("invalid", 400),
])
def test_multiple_cases(client: TestClient, input, expected):
    response = client.post("/api/endpoint", json={"data": input})
    assert response.status_code == expected
```

### Integration Tests

```python
@pytest.mark.integration
def test_full_workflow(client: TestClient):
    """Test complete user workflow"""
    # Create
    create_response = client.post("/api/projects", json={...})
    project_id = create_response.json()["id"]

    # Read
    get_response = client.get(f"/api/projects/{project_id}")
    assert get_response.status_code == 200
```

## Available Fixtures

See `conftest.py` for all available fixtures:

- `client`: FastAPI TestClient
- `api_url`: Base API URL
- `test_project_data`: Sample project data
- `test_task_data`: Sample task data
- `mock_git_initialized_status`: Mock git status (initialized)
- `mock_git_uninitialized_status`: Mock git status (not initialized)
- `mock_github_auth_status`: Mock GitHub auth status
- `temp_project_dir`: Temporary project directory
- `git_initialized_project`: Project with git initialized
- `mock_subprocess_run`: Mock subprocess for git commands
- `mock_github_cli`: Mock GitHub CLI commands

## Debugging Tests

### Run with print statements
```bash
pytest -s
```

### Drop into debugger on failure
```bash
pytest --pdb
```

### Show local variables on failure
```bash
pytest -l
```

### Run only failed tests from last run
```bash
pytest --lf
```

## CI/CD Integration

### GitHub Actions Example

```yaml
- name: Run backend tests
  run: |
    cd tests/backend
    pip install -r requirements.txt
    pytest --cov --cov-report=xml
```

### Docker Test Runner

```bash
docker-compose -f docker-compose.test.yml run --rm backend-tests
```

## Test Coverage Goals

- API Endpoints: 90%+
- Git Operations: 85%+
- GitHub Integration: 85%+
- Error Handling: 80%+

## Common Issues

### Import Errors
Make sure backend path is correct in `conftest.py`:
```python
backend_path = Path(__file__).parent.parent.parent / "backend"
```

### Fixture Not Found
Check that fixture is defined in `conftest.py` or test file.

### Tests Pass Locally But Fail in CI
Ensure all dependencies are in `requirements.txt` and environment variables are set.
