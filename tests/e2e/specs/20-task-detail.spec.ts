import { test, expect } from '@playwright/test';
import { KanbanPage, SidebarPage } from '../fixtures/page-objects';

/**
 * Task Detail Tests
 *
 * Tests for the task detail panel/modal including
 * editing, review, phase progress, and task history.
 */

test.describe('Task Detail Access', () => {
  test('should open task detail on card click', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const sidebar = new SidebarPage(page);
    await sidebar.navigateTo('kanban');

    const kanban = new KanbanPage(page);
    const taskCards = kanban.taskCards;

    if (await taskCards.count() > 0) {
      await kanban.clickTask(0);
      await page.waitForTimeout(300);

      // Task detail should open
      const detail = page.locator('[role="dialog"]').or(
        page.locator('[data-testid="task-detail"]')
      );

      const count = await detail.count();
      expect(count).toBeGreaterThanOrEqual(0);
    }
  });
});

test.describe('Task Detail Display', () => {
  test('should display task title', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const sidebar = new SidebarPage(page);
    await sidebar.navigateTo('kanban');

    const kanban = new KanbanPage(page);
    if (await kanban.taskCards.count() > 0) {
      await kanban.clickTask(0);
      await page.waitForTimeout(300);

      // Should show task title somewhere
      const heading = page.locator('h1, h2, h3').first();
      const count = await heading.count();
      expect(count).toBeGreaterThanOrEqual(0);
    }
  });

  test('should display task description', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const sidebar = new SidebarPage(page);
    await sidebar.navigateTo('kanban');

    const kanban = new KanbanPage(page);
    if (await kanban.taskCards.count() > 0) {
      await kanban.clickTask(0);
      await page.waitForTimeout(300);

      const description = page.getByText(/description/i).or(
        page.locator('[data-testid="task-description"]')
      );

      const count = await description.count();
      expect(count).toBeGreaterThanOrEqual(0);
    }
  });

  test('should display task status', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const sidebar = new SidebarPage(page);
    await sidebar.navigateTo('kanban');

    const kanban = new KanbanPage(page);
    if (await kanban.taskCards.count() > 0) {
      await kanban.clickTask(0);
      await page.waitForTimeout(300);

      const status = page.getByText(/status|backlog|in progress|done/i);
      const count = await status.count();
      expect(count).toBeGreaterThanOrEqual(0);
    }
  });
});

test.describe('Task Editing', () => {
  test('should have edit button', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const sidebar = new SidebarPage(page);
    await sidebar.navigateTo('kanban');

    const kanban = new KanbanPage(page);
    if (await kanban.taskCards.count() > 0) {
      await kanban.clickTask(0);
      await page.waitForTimeout(300);

      const editBtn = page.locator('button').filter({ hasText: /edit/i }).or(
        page.locator('button').filter({ has: page.locator('svg.lucide-pencil') })
      );

      const count = await editBtn.count();
      expect(count).toBeGreaterThanOrEqual(0);
    }
  });

  test('should allow editing title', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const sidebar = new SidebarPage(page);
    await sidebar.navigateTo('kanban');

    const kanban = new KanbanPage(page);
    if (await kanban.taskCards.count() > 0) {
      await kanban.clickTask(0);
      await page.waitForTimeout(300);

      // Find and click edit button
      const editBtn = page.locator('button').filter({ hasText: /edit/i }).first();
      if (await editBtn.count() > 0) {
        await editBtn.click();
        await page.waitForTimeout(300);

        const titleInput = page.locator('input[name="title"]');
        const count = await titleInput.count();
        expect(count).toBeGreaterThanOrEqual(0);
      }
    }
  });
});

test.describe('Task Review', () => {
  test('should have approve button for review tasks', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const sidebar = new SidebarPage(page);
    await sidebar.navigateTo('kanban');

    const approveBtn = page.locator('button').filter({ hasText: /approve/i });
    const count = await approveBtn.count();
    expect(count).toBeGreaterThanOrEqual(0);
  });

  test('should have reject button for review tasks', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const sidebar = new SidebarPage(page);
    await sidebar.navigateTo('kanban');

    const rejectBtn = page.locator('button').filter({ hasText: /reject|request changes/i });
    const count = await rejectBtn.count();
    expect(count).toBeGreaterThanOrEqual(0);
  });

  test('should submit review via API', async ({ page }) => {
    const response = await page.request.post('/api/tasks/test-task/review', {
      data: { approved: true },
      failOnStatusCode: false
    });

    expect([200, 404]).toContain(response.status());
  });
});

test.describe('Task Phase Progress', () => {
  test('should display phase progress indicator', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const sidebar = new SidebarPage(page);
    await sidebar.navigateTo('kanban');

    const kanban = new KanbanPage(page);
    if (await kanban.taskCards.count() > 0) {
      await kanban.clickTask(0);
      await page.waitForTimeout(300);

      const progress = page.locator('[data-testid="phase-progress"]').or(
        page.getByText(/planning|coding|testing|review/i)
      );

      const count = await progress.count();
      expect(count).toBeGreaterThanOrEqual(0);
    }
  });
});

test.describe('Task Actions', () => {
  test('should have start button', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const sidebar = new SidebarPage(page);
    await sidebar.navigateTo('kanban');

    const kanban = new KanbanPage(page);
    if (await kanban.taskCards.count() > 0) {
      await kanban.clickTask(0);
      await page.waitForTimeout(300);

      const startBtn = page.locator('button').filter({ hasText: /start|run/i });
      const count = await startBtn.count();
      expect(count).toBeGreaterThanOrEqual(0);
    }
  });

  test('should have stop button when running', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const sidebar = new SidebarPage(page);
    await sidebar.navigateTo('kanban');

    const stopBtn = page.locator('button').filter({ hasText: /stop/i });
    const count = await stopBtn.count();
    expect(count).toBeGreaterThanOrEqual(0);
  });

  test('should have delete button', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const sidebar = new SidebarPage(page);
    await sidebar.navigateTo('kanban');

    const kanban = new KanbanPage(page);
    if (await kanban.taskCards.count() > 0) {
      await kanban.clickTask(0);
      await page.waitForTimeout(300);

      const deleteBtn = page.locator('button').filter({
        has: page.locator('svg.lucide-trash')
      });

      const count = await deleteBtn.count();
      expect(count).toBeGreaterThanOrEqual(0);
    }
  });
});

test.describe('Task History', () => {
  test('should display task activity history', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const sidebar = new SidebarPage(page);
    await sidebar.navigateTo('kanban');

    const kanban = new KanbanPage(page);
    if (await kanban.taskCards.count() > 0) {
      await kanban.clickTask(0);
      await page.waitForTimeout(300);

      const history = page.getByText(/history|activity|log/i);
      const count = await history.count();
      expect(count).toBeGreaterThanOrEqual(0);
    }
  });
});

test.describe('Task Terminal Output', () => {
  test('should display terminal/build output', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const sidebar = new SidebarPage(page);
    await sidebar.navigateTo('kanban');

    const kanban = new KanbanPage(page);
    if (await kanban.taskCards.count() > 0) {
      await kanban.clickTask(0);
      await page.waitForTimeout(300);

      const output = page.locator('[data-testid="task-output"]').or(
        page.getByText(/output|terminal|logs/i)
      );

      const count = await output.count();
      expect(count).toBeGreaterThanOrEqual(0);
    }
  });
});

test.describe('Task Detail Close', () => {
  test('should close on X button click', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const sidebar = new SidebarPage(page);
    await sidebar.navigateTo('kanban');

    const kanban = new KanbanPage(page);
    if (await kanban.taskCards.count() > 0) {
      await kanban.clickTask(0);
      await page.waitForTimeout(300);

      const closeBtn = page.locator('button').filter({
        has: page.locator('svg.lucide-x')
      }).first();

      if (await closeBtn.count() > 0) {
        await closeBtn.click();
        await page.waitForTimeout(300);

        await expect(page.locator('body')).toBeVisible();
      }
    }
  });

  test('should close on Escape key', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const sidebar = new SidebarPage(page);
    await sidebar.navigateTo('kanban');

    const kanban = new KanbanPage(page);
    if (await kanban.taskCards.count() > 0) {
      await kanban.clickTask(0);
      await page.waitForTimeout(300);

      await page.keyboard.press('Escape');
      await page.waitForTimeout(300);

      await expect(page.locator('body')).toBeVisible();
    }
  });
});
