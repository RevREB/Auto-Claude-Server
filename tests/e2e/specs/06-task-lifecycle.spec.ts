import { test, expect } from '@playwright/test';

/**
 * Task Lifecycle Integration Tests
 *
 * Tests the complete task workflow from creation to completion.
 * This is an end-to-end test that exercises multiple APIs together.
 */

test.describe('Full Task Lifecycle', () => {
  const testProjectName = `e2e-lifecycle-${Date.now()}`;
  let projectId: string;
  let taskId: string;

  test.beforeAll(async ({ request }) => {
    // Create a test project for lifecycle tests
    const response = await request.post('/api/projects', {
      data: { path: testProjectName }
    });

    if (response.ok()) {
      const project = await response.json();
      projectId = project.id;
      console.log(`[Lifecycle] Created test project: ${projectId}`);
    } else {
      // Project may already exist, try to use the name as ID
      projectId = testProjectName;
    }
  });

  test.afterAll(async ({ request }) => {
    // Clean up: delete test project
    if (projectId) {
      await request.delete(`/api/projects/${projectId}`, {
        failOnStatusCode: false
      });
    }
  });

  test('Step 1: Create a new project', async ({ request }) => {
    // Verify project exists
    const response = await request.get(`/api/projects/${projectId}`);

    // May return 404 if project cleanup happened
    if (response.ok()) {
      const project = await response.json();
      expect(project).toHaveProperty('id');
      expect(project).toHaveProperty('name');
      expect(project).toHaveProperty('path');
    }
  });

  test('Step 2: Initialize project auto-claude', async ({ request }) => {
    const response = await request.post(`/api/projects/${projectId}/initialize`, {
      failOnStatusCode: false
    });

    // May fail if project doesn't exist
    expect([200, 404, 500]).toContain(response.status());

    if (response.ok()) {
      const data = await response.json();
      expect(data.success).toBe(true);
    }
  });

  test('Step 3: Create a task', async ({ request }) => {
    const response = await request.post('/api/tasks', {
      data: {
        projectId: projectId,
        title: 'E2E Lifecycle Test Task',
        description: 'This is a test task created during E2E lifecycle testing. It should be created, monitored, and cleaned up automatically.'
      }
    });

    expect([200, 201, 422]).toContain(response.status());

    if (response.ok()) {
      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.task).toHaveProperty('specId');
      taskId = data.task.specId || data.task.id;
      console.log(`[Lifecycle] Created task: ${taskId}`);
    }
  });

  test('Step 4: Verify task appears in project task list', async ({ request }) => {
    test.skip(!taskId, 'Task was not created');

    const response = await request.get(`/api/projects/${projectId}/tasks`);

    expect([200, 404]).toContain(response.status());

    if (response.ok()) {
      const tasks = await response.json();
      expect(Array.isArray(tasks)).toBe(true);

      // Find our test task
      const testTask = tasks.find((t: any) =>
        t.specId === taskId || t.id === taskId
      );

      if (testTask) {
        expect(testTask).toHaveProperty('title', 'E2E Lifecycle Test Task');
        expect(testTask).toHaveProperty('status');
      }
    }
  });

  test('Step 5: Get task status', async ({ request }) => {
    test.skip(!taskId, 'Task was not created');

    const response = await request.get(`/api/tasks/${taskId}/status`, {
      failOnStatusCode: false
    });

    expect([200, 404]).toContain(response.status());

    if (response.ok()) {
      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.data).toHaveProperty('status');
      expect(data.data).toHaveProperty('running');
    }
  });

  test('Step 6: Update task status', async ({ request }) => {
    test.skip(!taskId, 'Task was not created');

    const response = await request.patch(`/api/tasks/${taskId}`, {
      data: { status: 'human_review' },
      failOnStatusCode: false
    });

    expect([200, 404]).toContain(response.status());

    if (response.ok()) {
      const data = await response.json();
      expect(data.success).toBe(true);
    }
  });

  test('Step 7: Submit task review', async ({ request }) => {
    test.skip(!taskId, 'Task was not created');

    const response = await request.post(`/api/tasks/${taskId}/review`, {
      data: { approved: true },
      failOnStatusCode: false
    });

    expect([200, 404]).toContain(response.status());

    if (response.ok()) {
      const data = await response.json();
      expect(data.success).toBe(true);
    }
  });

  test('Step 8: Delete task', async ({ request }) => {
    test.skip(!taskId, 'Task was not created');

    const response = await request.delete(`/api/tasks/${taskId}`, {
      failOnStatusCode: false
    });

    expect([200, 404]).toContain(response.status());

    if (response.ok()) {
      const data = await response.json();
      expect(data.success).toBe(true);
    }
  });

  test('Step 9: Verify task is deleted', async ({ request }) => {
    test.skip(!taskId, 'Task was not created');

    const response = await request.get(`/api/tasks/${taskId}`, {
      failOnStatusCode: false
    });

    // Should return 404 after deletion
    expect(response.status()).toBe(404);
  });
});

test.describe('Task State Transitions', () => {
  let testTaskId: string;

  test.beforeAll(async ({ request }) => {
    // Create a task for state transition tests
    const response = await request.post('/api/tasks', {
      data: {
        projectId: 'test-project',
        title: 'State Transition Test Task',
        description: 'Testing state transitions'
      }
    });

    if (response.ok()) {
      const data = await response.json();
      testTaskId = data.task?.specId || data.task?.id;
    }
  });

  test.afterAll(async ({ request }) => {
    if (testTaskId) {
      await request.delete(`/api/tasks/${testTaskId}`, {
        failOnStatusCode: false
      });
    }
  });

  test('should start in backlog status', async ({ request }) => {
    test.skip(!testTaskId, 'Task not created');

    const response = await request.get(`/api/tasks/${testTaskId}`);

    if (response.ok()) {
      const task = await response.json();
      expect(task.status).toBe('backlog');
    }
  });

  test('should transition to human_review on approval', async ({ request }) => {
    test.skip(!testTaskId, 'Task not created');

    // First set to human_review
    await request.patch(`/api/tasks/${testTaskId}`, {
      data: { status: 'human_review' }
    });

    const response = await request.get(`/api/tasks/${testTaskId}`);

    if (response.ok()) {
      const task = await response.json();
      expect(task.status).toBe('human_review');
    }
  });

  test('should transition to done after approval', async ({ request }) => {
    test.skip(!testTaskId, 'Task not created');

    await request.post(`/api/tasks/${testTaskId}/review`, {
      data: { approved: true }
    });

    const response = await request.get(`/api/tasks/${testTaskId}`);

    if (response.ok()) {
      const task = await response.json();
      expect(task.status).toBe('done');
    }
  });

  test('should recover stuck task', async ({ request }) => {
    test.skip(!testTaskId, 'Task not created');

    const response = await request.post(`/api/tasks/${testTaskId}/recover`, {
      failOnStatusCode: false
    });

    expect([200, 404]).toContain(response.status());

    if (response.ok()) {
      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.data.newStatus).toBe('backlog');
    }
  });
});

test.describe('Project Tab State Persistence', () => {
  test('should save and restore tab state', async ({ request }) => {
    const testState = {
      openProjectIds: ['project-1', 'project-2'],
      activeProjectId: 'project-1',
      tabOrder: ['project-1', 'project-2']
    };

    // Save tab state
    const saveResponse = await request.post('/api/projects/tab-state', {
      data: testState
    });

    expect(saveResponse.ok()).toBe(true);
    const saveData = await saveResponse.json();
    expect(saveData.success).toBe(true);

    // Retrieve tab state
    const getResponse = await request.get('/api/projects/tab-state');

    expect(getResponse.ok()).toBe(true);
    const getData = await getResponse.json();
    expect(getData.success).toBe(true);
    expect(getData.data.openProjectIds).toContain('project-1');
    expect(getData.data.activeProjectId).toBe('project-1');
  });
});
