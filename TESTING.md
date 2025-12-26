# Auto-Claude Docker - Testing Guide

Comprehensive testing infrastructure for Auto-Claude Docker, including E2E, API, and component tests.

## Quick Start

### Run All Tests
```bash
./tests/run-all-tests.sh
```

### Run Specific Test Suites
```bash
# E2E tests only
./tests/run-e2e-tests.sh

# Backend API tests only
./tests/run-backend-tests.sh

# With custom pytest arguments
./tests/run-backend-tests.sh -v -k test_projects
```

## Test Architecture

```
tests/
├── e2e/                          # End-to-end tests (Playwright)
│   ├── specs/                    # Test specifications
│   │   ├── 01-authentication.spec.ts
│   │   ├── 02-project-management.spec.ts
│   │   ├── 03-task-management.spec.ts
│   │   └── 04-api-integration.spec.ts
│   ├── fixtures/                 # Test helpers
│   ├── playwright.config.ts      # Playwright configuration
│   └── package.json
│
├── backend/                      # Backend API tests (pytest)
│   ├── test_api/                 # API endpoint tests
│   │   ├── test_health.py
│   │   ├── test_projects.py
│   │   └── test_tasks.py
│   ├── test_git/                 # Git operations tests
│   │   └── test_git_operations.py
│   ├── test_github/              # GitHub integration tests
│   │   └── test_github_auth.py
│   ├── conftest.py               # pytest fixtures
│   ├── pytest.ini                # pytest configuration
│   └── requirements.txt
│
├── run-all-tests.sh              # Master test runner
├── run-e2e-tests.sh              # E2E test runner
└── run-backend-tests.sh          # Backend test runner
```

## Test Types

### 1. E2E Tests (Playwright)

Tests complete user workflows through the browser.

**Covers:**
- Authentication flows (Claude, GitHub)
- Project creation and management
- Task creation and lifecycle
- Git integration
- Real-time WebSocket updates
- API error handling

**Run:**
```bash
cd tests/e2e
npm install
npm test

# UI mode (interactive)
npm run test:ui

# Specific browser
npm run test:chromium
npm run test:firefox
npm run test:webkit

# Debug mode
npm run test:debug
```

**View Results:**
```bash
npm run report
```

### 2. Backend API Tests (pytest)

Tests all backend REST API endpoints.

**Covers:**
- Health checks
- Project CRUD operations
- Task management
- Git operations (init, status, commit)
- GitHub authentication
- Input validation
- Security (XSS, SQL injection, path traversal)
- Error handling

**Run:**
```bash
cd tests/backend
pip install -r requirements.txt
pytest

# Verbose output
pytest -v

# With coverage
pytest --cov=../../backend/api --cov-report=html

# Specific tests
pytest test_api/test_projects.py
pytest test_api/test_projects.py::TestProjectsEndpoints::test_create_project_success

# By marker
pytest -m unit          # Unit tests only
pytest -m integration   # Integration tests only
pytest -m "not slow"    # Skip slow tests
```

**View Coverage:**
```bash
open htmlcov/index.html
```

### 3. Frontend Component Tests (Vitest)

Unit tests for React components (if needed).

**Run:**
```bash
cd frontend
npm run test

# Watch mode
npm run test:watch

# Coverage
npm run test:coverage
```

## Docker Test Environment

The `docker-compose.test.yml` creates an isolated test environment:

- **backend-test**: Backend API server for testing
- **frontend-test**: Frontend server for testing
- **redis-test**: Redis instance for testing
- **playwright-tests**: Playwright test runner
- **backend-tests**: Pytest test runner

**Start Test Environment:**
```bash
docker-compose -f docker-compose.test.yml up -d
```

**Run Tests in Docker:**
```bash
# E2E tests
docker-compose -f docker-compose.test.yml run --rm playwright-tests

# Backend tests
docker-compose -f docker-compose.test.yml run --rm backend-tests

# Custom pytest args
docker-compose -f docker-compose.test.yml run --rm backend-tests \
  sh -c "pip install -q -r /app/tests/requirements.txt && pytest -v -k test_git"
```

**Cleanup:**
```bash
docker-compose -f docker-compose.test.yml down -v
```

## CI/CD Integration

### GitHub Actions

The project includes a comprehensive CI/CD pipeline in `.github/workflows/tests.yml`:

**Jobs:**
1. **backend-tests**: Run pytest suite
2. **e2e-tests**: Run Playwright suite
3. **security-scan**: Trivy vulnerability scanning
4. **lint**: Code quality checks (Black, Flake8, ESLint)
5. **build**: Docker image builds
6. **test-summary**: Overall results

**Triggers:**
- Push to `main` or `develop`
- Pull requests
- Manual workflow dispatch

**View Results:**
- Go to GitHub Actions tab
- Download test artifacts for detailed reports

### Local CI Simulation

Simulate CI environment locally:

```bash
# Use CI flag
CI=true ./tests/run-all-tests.sh

# Or run individual jobs
docker-compose -f docker-compose.test.yml run --rm \
  -e CI=true playwright-tests
```

## Writing Tests

### E2E Test Example

```typescript
import { test, expect } from '@playwright/test';

test('user can create a project', async ({ page }) => {
  await page.goto('/');

  // Click create project
  await page.getByRole('button', { name: /create project/i }).click();

  // Fill form
  await page.locator('input[name="name"]').fill('My Test Project');

  // Submit
  await page.getByRole('button', { name: /create/i }).click();

  // Verify
  await expect(page.getByText('My Test Project')).toBeVisible();
});
```

### Backend Test Example

```python
def test_create_project_success(client: TestClient):
    """Test POST /api/projects with valid data"""
    response = client.post("/api/projects", json={
        "name": "test-project",
        "location": "/app/projects"
    })

    assert response.status_code == 200
    data = response.json()
    assert data["success"] == True
```

## Test Data Management

### Fixtures

**Playwright:**
- See `tests/e2e/fixtures/test-helpers.ts`
- Provides `TestHelpers`, `TestData`, `ApiClient` classes

**Pytest:**
- See `tests/backend/conftest.py`
- Provides fixtures: `client`, `test_project_data`, `test_task_data`, etc.

### Mocking

**Backend:**
```python
def test_with_mock(mock_subprocess_run):
    # Git commands are mocked
    response = client.post("/api/projects/test/git/initialize")
    assert response.status_code == 200
```

**E2E:**
```typescript
await page.route('**/api/projects', route =>
  route.fulfill({
    status: 200,
    body: JSON.stringify([{ id: '1', name: 'Mock Project' }])
  })
);
```

## Debugging Tests

### Playwright

```bash
# UI mode - interactive debugging
npm run test:ui

# Debug mode - step through tests
PWDEBUG=1 npm test

# Headed mode - see browser
npm run test:headed

# Generate tests from actions
npm run codegen
```

### Pytest

```bash
# Show print statements
pytest -s

# Drop into debugger on failure
pytest --pdb

# Show local variables on failure
pytest -l

# Run last failed tests
pytest --lf

# Verbose traceback
pytest --tb=long
```

### Docker Logs

```bash
# Backend logs
docker-compose -f docker-compose.test.yml logs backend-test

# All logs
docker-compose -f docker-compose.test.yml logs -f

# Follow logs
docker-compose -f docker-compose.test.yml logs -f backend-test
```

## Performance Testing

### Load Testing (Future)

```bash
# Using locust or k6
cd tests/performance
locust -f load_test.py --host=http://localhost:8000
```

### Benchmark Tests

```python
@pytest.mark.benchmark
def test_project_creation_speed(benchmark, client):
    result = benchmark(lambda: client.post("/api/projects", json={...}))
    assert result.status_code == 200
```

## Security Testing

### Automated Scans

- **Trivy**: Container vulnerability scanning (in CI)
- **Bandit**: Python security linting
- **npm audit**: Frontend dependency scanning

### Manual Security Tests

```bash
# Backend security tests
pytest -v -m security tests/backend/

# Run security-focused E2E tests
npm test -- --grep security
```

## Test Coverage Goals

| Component | Target | Current |
|-----------|--------|---------|
| Backend API | 90%+ | TBD |
| Git Operations | 85%+ | TBD |
| GitHub Integration | 85%+ | TBD |
| Frontend Components | 80%+ | TBD |
| E2E Critical Flows | 100% | TBD |

**Check Coverage:**
```bash
# Backend
pytest --cov=backend/api --cov-report=term-missing

# Frontend
npm run test:coverage
```

## Troubleshooting

### Common Issues

**Tests fail with "Connection refused"**
```bash
# Ensure test services are running
docker-compose -f docker-compose.test.yml ps

# Check logs
docker-compose -f docker-compose.test.yml logs backend-test
```

**Playwright tests timeout**
```bash
# Increase timeout in playwright.config.ts
timeout: 60000  # 60 seconds

# Or wait for services manually
timeout 60 bash -c 'until curl -f http://localhost:3001; do sleep 2; done'
```

**Import errors in pytest**
```bash
# Verify PYTHONPATH
export PYTHONPATH=/path/to/backend:$PYTHONPATH

# Or add to conftest.py
sys.path.insert(0, str(backend_path))
```

**Docker build fails**
```bash
# Clean build
docker-compose -f docker-compose.test.yml build --no-cache

# Check disk space
df -h
```

### Reset Test Environment

```bash
# Complete cleanup
docker-compose -f docker-compose.test.yml down -v
docker system prune -f

# Reinstall dependencies
cd tests/e2e && npm install
cd tests/backend && pip install -r requirements.txt
```

## Best Practices

1. **Isolation**: Each test should be independent
2. **Cleanup**: Use fixtures for setup/teardown
3. **Fast**: Keep unit tests fast, mark slow tests
4. **Descriptive**: Clear test names and assertions
5. **DRY**: Use helpers and fixtures to avoid repetition
6. **Realistic**: E2E tests should mimic real user behavior
7. **Security**: Include security-focused test cases
8. **Coverage**: Aim for high coverage, but focus on critical paths

## Resources

- [Playwright Documentation](https://playwright.dev)
- [pytest Documentation](https://docs.pytest.org)
- [FastAPI Testing](https://fastapi.tiangolo.com/tutorial/testing/)
- [Vitest Documentation](https://vitest.dev)

## Contributing

When adding new features:

1. Write tests first (TDD)
2. Ensure all tests pass
3. Update test documentation
4. Check coverage hasn't decreased
5. Add E2E tests for user-facing features

```bash
# Before committing
./tests/run-all-tests.sh
```
