import { Page } from '@playwright/test';

/**
 * Test helper functions for common operations
 */

export class TestHelpers {
  constructor(private page: Page) {}

  /**
   * Navigate to settings page
   */
  async goToSettings() {
    await this.page.goto('/settings');
    await this.page.waitForLoadState('networkidle');
  }

  /**
   * Create a test project
   */
  async createProject(name: string) {
    const createButton = this.page.getByRole('button', { name: /add project|create project|new project/i });
    await createButton.click();

    const nameInput = this.page.locator('input[name="name"]').or(this.page.locator('input[placeholder*="name"]'));
    await nameInput.fill(name);

    await this.page.getByRole('button', { name: /create|submit/i }).click();
    await this.page.waitForTimeout(2000);
  }

  /**
   * Create a test task
   */
  async createTask(title: string, description: string) {
    const createTaskButton = this.page.getByRole('button', { name: /create task|new task|add task/i });
    await createTaskButton.click();

    const titleInput = this.page.locator('input[name="title"]').or(this.page.locator('input[placeholder*="title"]'));
    await titleInput.fill(title);

    const descInput = this.page.locator('textarea[name="description"]').or(this.page.locator('textarea[placeholder*="description"]'));
    await descInput.fill(description);

    await this.page.getByRole('button', { name: /create|submit/i }).click();
    await this.page.waitForTimeout(2000);
  }

  /**
   * Wait for API response
   */
  async waitForApiResponse(urlPattern: string, timeout = 5000) {
    return await this.page.waitForResponse(
      response => response.url().includes(urlPattern) && response.status() === 200,
      { timeout }
    );
  }

  /**
   * Check if element exists
   */
  async elementExists(selector: string): Promise<boolean> {
    return (await this.page.locator(selector).count()) > 0;
  }

  /**
   * Get console errors
   */
  async getConsoleErrors(): Promise<string[]> {
    const errors: string[] = [];

    this.page.on('console', msg => {
      if (msg.type() === 'error') {
        errors.push(msg.text());
      }
    });

    return errors;
  }

  /**
   * Mock API response
   */
  async mockApiResponse(urlPattern: string, responseData: any, status = 200) {
    await this.page.route(`**${urlPattern}**`, route =>
      route.fulfill({
        status,
        contentType: 'application/json',
        body: JSON.stringify(responseData)
      })
    );
  }

  /**
   * Clean up test data (call after tests)
   */
  async cleanup() {
    // Add cleanup logic here if needed
  }
}

/**
 * Test data generators
 */
export class TestData {
  static randomProjectName(): string {
    return `test-project-${Date.now()}-${Math.random().toString(36).substring(7)}`;
  }

  static randomTaskTitle(): string {
    return `Test Task ${Date.now()}`;
  }

  static randomEmail(): string {
    return `test-${Date.now()}@example.com`;
  }

  static mockProject(overrides = {}) {
    return {
      id: `proj-${Date.now()}`,
      name: this.randomProjectName(),
      path: '/app/projects/test-project',
      created_at: new Date().toISOString(),
      ...overrides
    };
  }

  static mockTask(overrides = {}) {
    return {
      spec_id: `task-${Date.now()}`,
      title: this.randomTaskTitle(),
      description: 'Test task description',
      status: 'planning',
      project_id: 'proj-123',
      ...overrides
    };
  }
}

/**
 * API client for direct API testing
 */
export class ApiClient {
  constructor(private baseUrl: string = 'http://localhost:8000') {}

  async get(endpoint: string) {
    const response = await fetch(`${this.baseUrl}${endpoint}`);
    return {
      status: response.status,
      ok: response.ok,
      data: await response.json().catch(() => null)
    };
  }

  async post(endpoint: string, data: any) {
    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    return {
      status: response.status,
      ok: response.ok,
      data: await response.json().catch(() => null)
    };
  }

  async delete(endpoint: string) {
    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      method: 'DELETE'
    });
    return {
      status: response.status,
      ok: response.ok,
      data: await response.json().catch(() => null)
    };
  }
}
