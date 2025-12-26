# Auto-Claude Docker Testing Guide

## Overview

This directory contains the complete testing infrastructure for Auto-Claude Docker, organized by test type and execution environment.

## Test Structure

```
tests/
├── e2e/                    # End-to-end tests (Playwright)
│   ├── specs/              # Test specifications
│   ├── fixtures/           # Test data and helpers
│   └── playwright.config.ts
├── backend/                # Backend API tests (pytest)
│   ├── test_api/           # API endpoint tests
│   ├── test_git/           # Git operations tests
│   ├── test_github/        # GitHub integration tests
│   ├── conftest.py         # pytest fixtures
│   └── requirements.txt    # Test dependencies
├── frontend/               # Frontend component tests (Vitest)
│   ├── components/         # Component unit tests
│   └── vitest.config.ts
└── docker-compose.test.yml # Test environment
```

## Quick Start

### 1. Run All Tests
```bash
# From project root
./tests/run-all-tests.sh
```

### 2. Run E2E Tests Only
```bash
cd tests/e2e
npm install
npm test
```

### 3. Run Backend Tests Only
```bash
cd tests/backend
pip install -r requirements.txt
pytest -v
```

### 4. Run Frontend Component Tests
```bash
cd frontend
npm run test
```

## Test Environments

### Development Environment
```bash
# Use existing docker-compose.yml
docker-compose up -d
npm run test:e2e
```

### Isolated Test Environment
```bash
# Use separate test containers
docker-compose -f docker-compose.test.yml up -d
npm run test:e2e
```

## Test Coverage

### E2E Tests Cover:
- ✅ Claude OAuth authentication flow
- ✅ GitHub authentication flow
- ✅ Project creation (with and without git)
- ✅ Task creation and management
- ✅ Git setup wizard
- ✅ Settings configuration
- ✅ WebSocket connections
- ✅ Real-time build progress

### Backend Tests Cover:
- ✅ All REST API endpoints
- ✅ Git operations (init, status, commit)
- ✅ GitHub CLI integration
- ✅ Project management
- ✅ Task lifecycle
- ✅ Error handling

### Frontend Tests Cover:
- ✅ Component rendering
- ✅ User interactions
- ✅ State management
- ✅ Form validation
- ✅ API integration

## CI/CD Integration

### GitHub Actions Example
```yaml
name: Tests
on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - name: Run tests
        run: |
          docker-compose -f docker-compose.test.yml up -d
          ./tests/run-all-tests.sh
```

## Writing New Tests

### E2E Test Template
```typescript
import { test, expect } from '@playwright/test';

test('feature description', async ({ page }) => {
  await page.goto('http://localhost:3000');
  // Test steps...
  await expect(page.locator('...')).toBeVisible();
});
```

### Backend Test Template
```python
def test_endpoint_name(client):
    response = client.get("/api/endpoint")
    assert response.status_code == 200
    assert response.json()["key"] == "expected_value"
```

### Frontend Test Template
```typescript
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';

describe('ComponentName', () => {
  it('renders correctly', () => {
    render(<ComponentName />);
    expect(screen.getByText('...')).toBeDefined();
  });
});
```

## Debugging Tests

### E2E Tests
```bash
# Run in UI mode
npm run test:e2e:ui

# Run in debug mode
PWDEBUG=1 npm run test:e2e
```

### Backend Tests
```bash
# Run with verbose output
pytest -vv -s

# Run specific test
pytest tests/test_api/test_projects.py::test_create_project
```

## Performance Testing

See `tests/performance/` for load testing and performance benchmarks.

## Security Testing

See `tests/security/` for security audit scripts and penetration testing scenarios.
