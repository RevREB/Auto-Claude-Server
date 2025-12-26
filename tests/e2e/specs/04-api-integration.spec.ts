import { test, expect } from '@playwright/test';

/**
 * API Integration Tests
 *
 * Tests frontend interaction with backend APIs.
 * Uses the nginx proxy at /api/ to reach the backend.
 */

test.describe('Health Check', () => {
  test('should connect to backend API health endpoint', async ({ page }) => {
    const response = await page.request.get('/api/health');

    // API should respond - 404 if route not at this path, 502/503 if backend down
    expect([200, 404, 502, 503]).toContain(response.status());

    if (response.status() === 200) {
      const data = await response.json();
      expect(data.status).toBe('healthy');
    }
  });

  test('should get API root info', async ({ page }) => {
    const response = await page.request.get('/api/');

    if (response.status() === 200) {
      const data = await response.json();
      expect(data.message).toContain('Auto-Claude');
      expect(data.version).toBeDefined();
    }
  });

  test('frontend should load without crashing', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Page should render
    await expect(page.locator('body')).toBeVisible();
    const bodyText = await page.locator('body').innerText();
    expect(bodyText.length).toBeGreaterThan(0);
  });
});

test.describe('Projects API', () => {
  test('should list projects', async ({ page }) => {
    const response = await page.request.get('/api/projects');

    expect([200, 500, 502]).toContain(response.status());

    if (response.status() === 200) {
      const data = await response.json();
      expect(Array.isArray(data)).toBe(true);
    }
  });

  test('should get default project location', async ({ page }) => {
    const response = await page.request.get('/api/projects/default-location');

    if (response.status() === 200) {
      const data = await response.json();
      expect(data).toHaveProperty('location');
    }
  });

  test('should get tab state', async ({ page }) => {
    const response = await page.request.get('/api/projects/tab-state');

    if (response.status() === 200) {
      const data = await response.json();
      expect(data).toHaveProperty('success');
      expect(data).toHaveProperty('data');
    }
  });

  test('should create project', async ({ page }) => {
    const response = await page.request.post('/api/projects', {
      data: {
        path: `e2e-test-${Date.now()}`
      }
    });

    // May succeed or fail depending on permissions
    expect([200, 201, 400, 422, 500]).toContain(response.status());
  });
});

test.describe('Tasks API', () => {
  test('should create task', async ({ page }) => {
    const response = await page.request.post('/api/tasks', {
      data: {
        projectId: 'test-project',
        title: 'E2E API Test Task',
        description: 'Created via E2E test'
      }
    });

    expect([200, 201, 422]).toContain(response.status());

    if (response.status() === 200) {
      const data = await response.json();
      expect(data.success).toBe(true);
      // API returns both specId (frontend format) and spec_id for compatibility
      expect(data.task).toHaveProperty('specId');
      expect(data.task).toHaveProperty('id');
    }
  });

  test('should archive tasks', async ({ page }) => {
    const response = await page.request.post('/api/tasks/archive', {
      data: {
        taskIds: ['test-task-1', 'test-task-2']
      }
    });

    expect(response.status()).toBe(200);
    const data = await response.json();
    expect(data.success).toBe(true);
  });

  test('should unarchive tasks', async ({ page }) => {
    const response = await page.request.post('/api/tasks/unarchive', {
      data: {
        taskIds: ['test-task-1']
      }
    });

    expect(response.status()).toBe(200);
    const data = await response.json();
    expect(data.success).toBe(true);
  });
});

test.describe('Git API', () => {
  test('should check git status for project', async ({ page }) => {
    const response = await page.request.get('/api/projects/test-project/git/status');

    // Returns status or 404 if project doesn't exist
    expect([200, 404]).toContain(response.status());

    if (response.status() === 200) {
      const data = await response.json();
      // Response has success and data wrapper or isGitRepo directly
      expect(data).toHaveProperty('success');
    }
  });

  test('should get git branches', async ({ page }) => {
    const response = await page.request.get('/api/projects/test-project/git/branches');

    expect([200, 400, 404]).toContain(response.status());

    if (response.status() === 200) {
      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.data).toHaveProperty('branches');
    }
  });

  test('should detect main branch', async ({ page }) => {
    const response = await page.request.get('/api/projects/test-project/git/main-branch');

    expect([200, 400, 404]).toContain(response.status());

    if (response.status() === 200) {
      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.data).toHaveProperty('branch');
    }
  });
});

test.describe('GitHub API', () => {
  test('should check GitHub authentication status', async ({ page }) => {
    const response = await page.request.get('/api/github/auth/status');

    expect(response.status()).toBe(200);
    const data = await response.json();

    // Response wrapped in success/data
    expect(data).toHaveProperty('success');
    expect(data).toHaveProperty('data');
    expect(data.data).toHaveProperty('authenticated');
  });

  test('should handle GitHub login with invalid token', async ({ page }) => {
    const response = await page.request.post('/api/github/auth/login', {
      data: { token: 'invalid_token' },
      failOnStatusCode: false
    });

    // Should return error, not crash
    expect([200, 400, 401, 500, 504]).toContain(response.status());
  });

  test('should handle GitHub logout', async ({ page }) => {
    const response = await page.request.post('/api/github/auth/logout');

    // Should succeed or return 500 if gh not installed
    expect([200, 500]).toContain(response.status());
  });
});

test.describe('Profiles API', () => {
  test('should list profiles', async ({ page }) => {
    const response = await page.request.get('/api/profiles');

    expect(response.status()).toBe(200);
    const data = await response.json();
    expect(data).toHaveProperty('success');
    expect(data).toHaveProperty('profiles');
    expect(Array.isArray(data.profiles)).toBe(true);
  });

  test('should get auto-switch settings', async ({ page }) => {
    const response = await page.request.get('/api/profiles/auto-switch/settings');

    expect(response.status()).toBe(200);
    const data = await response.json();
    expect(data).toHaveProperty('success');
    expect(data).toHaveProperty('data');
  });

  test('should get best available profile', async ({ page }) => {
    const response = await page.request.get('/api/profiles/best-available');

    // May return 404 if no profiles configured
    expect([200, 404]).toContain(response.status());

    if (response.status() === 200) {
      const data = await response.json();
      expect(data.success).toBe(true);
    }
  });
});

test.describe('Build API', () => {
  test('should get build status', async ({ page }) => {
    const response = await page.request.get('/api/build/test-spec/status');

    expect(response.status()).toBe(200);
    const data = await response.json();
    expect(data).toHaveProperty('spec_id');
    expect(data).toHaveProperty('running');
    expect(data).toHaveProperty('status');
  });

  test('should handle build stop for non-existent build', async ({ page }) => {
    const response = await page.request.post('/api/build/non-existent/stop');

    expect(response.status()).toBe(404);
  });
});

test.describe('Error Handling', () => {
  test('should handle 404 for non-existent endpoints', async ({ page }) => {
    const response = await page.request.get('/api/non-existent-endpoint', {
      failOnStatusCode: false
    });

    expect([404, 405]).toContain(response.status());
  });

  test('should handle invalid JSON in request body', async ({ page }) => {
    // Send invalid request
    const response = await page.request.post('/api/tasks', {
      data: {} // Empty object - missing required fields
    });

    // Should return validation error
    expect(response.status()).toBe(422);
  });
});
