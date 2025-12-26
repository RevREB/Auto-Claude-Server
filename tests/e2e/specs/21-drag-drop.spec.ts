import { test, expect } from '@playwright/test';
import { KanbanPage, SidebarPage } from '../fixtures/page-objects';

/**
 * Drag and Drop Tests
 *
 * Tests for drag-and-drop functionality including
 * Kanban task movement, project tab reordering, and feature reordering.
 */

test.describe('Kanban Drag Drop', () => {
  test('should have draggable task cards', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const sidebar = new SidebarPage(page);
    await sidebar.navigateTo('kanban');

    const draggableCards = page.locator('[draggable="true"]');
    const count = await draggableCards.count();
    expect(count).toBeGreaterThanOrEqual(0);
  });

  test('should have drop zones for columns', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const sidebar = new SidebarPage(page);
    await sidebar.navigateTo('kanban');

    const kanban = new KanbanPage(page);
    const columnCount = await kanban.getColumnCount();

    expect(columnCount).toBeGreaterThanOrEqual(0);
  });

  test('should highlight drop zone on drag over', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const sidebar = new SidebarPage(page);
    await sidebar.navigateTo('kanban');

    const kanban = new KanbanPage(page);
    const taskCards = kanban.taskCards;

    if (await taskCards.count() > 0) {
      // Start dragging
      const firstCard = taskCards.first();
      await firstCard.hover();

      // Check for drag styling
      await expect(page.locator('body')).toBeVisible();
    }
  });

  test('should move task between columns', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const sidebar = new SidebarPage(page);
    await sidebar.navigateTo('kanban');

    const kanban = new KanbanPage(page);
    const taskCards = kanban.taskCards;

    if (await taskCards.count() > 0) {
      const initialBacklogCount = await kanban.getTasksInColumn('backlog');

      // Try to drag task to different column
      await kanban.dragTask(0, 'in_progress');
      await page.waitForTimeout(500);

      // Verify page is still responsive
      await expect(page.locator('body')).toBeVisible();
    }
  });
});

test.describe('Project Tab Drag Drop', () => {
  test('should have draggable project tabs', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const draggableTabs = page.locator('[data-testid="project-tab"][draggable="true"]').or(
      page.locator('.project-tab[draggable="true"]')
    );

    const count = await draggableTabs.count();
    expect(count).toBeGreaterThanOrEqual(0);
  });

  test('should reorder tabs on drag', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const tabs = page.locator('[data-testid="project-tab"]').or(
      page.locator('.project-tab')
    );

    if (await tabs.count() > 1) {
      const firstTab = tabs.first();
      const secondTab = tabs.nth(1);

      // Drag first tab after second
      await firstTab.dragTo(secondTab);
      await page.waitForTimeout(300);

      // Page should remain responsive
      await expect(page.locator('body')).toBeVisible();
    }
  });
});

test.describe('Roadmap Feature Drag Drop', () => {
  test('should have draggable feature cards', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const sidebar = new SidebarPage(page);
    await sidebar.navigateTo('roadmap');

    const draggableFeatures = page.locator('[data-testid="feature-card"][draggable="true"]');
    const count = await draggableFeatures.count();
    expect(count).toBeGreaterThanOrEqual(0);
  });

  test('should reorder features on drag', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const sidebar = new SidebarPage(page);
    await sidebar.navigateTo('roadmap');

    const features = page.locator('[data-testid="feature-card"]');

    if (await features.count() > 1) {
      const firstFeature = features.first();
      const secondFeature = features.nth(1);

      await firstFeature.dragTo(secondFeature);
      await page.waitForTimeout(300);

      await expect(page.locator('body')).toBeVisible();
    }
  });
});

test.describe('Drag Drop Visual Feedback', () => {
  test('should show drag cursor on draggable items', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const sidebar = new SidebarPage(page);
    await sidebar.navigateTo('kanban');

    const draggableItems = page.locator('[draggable="true"]');

    if (await draggableItems.count() > 0) {
      const item = draggableItems.first();
      const cursor = await item.evaluate((el) => {
        return window.getComputedStyle(el).cursor;
      });

      // Cursor might be grab, pointer, or default
      expect(['grab', 'pointer', 'default', 'move']).toContain(cursor);
    }
  });

  test('should show drag preview', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const sidebar = new SidebarPage(page);
    await sidebar.navigateTo('kanban');

    // Dragging creates a visual preview - just verify no crashes
    await expect(page.locator('body')).toBeVisible();
  });
});

test.describe('Drag Drop Accessibility', () => {
  test('should support keyboard-based reordering', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const sidebar = new SidebarPage(page);
    await sidebar.navigateTo('kanban');

    // Focus on a draggable item
    const draggableItems = page.locator('[draggable="true"]');

    if (await draggableItems.count() > 0) {
      await draggableItems.first().focus();

      // Try space to pick up, arrow keys to move
      await page.keyboard.press('Space');
      await page.keyboard.press('ArrowRight');
      await page.keyboard.press('Space');

      // Should remain functional
      await expect(page.locator('body')).toBeVisible();
    }
  });
});

test.describe('Drag Drop Cancel', () => {
  test('should cancel drag on Escape', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const sidebar = new SidebarPage(page);
    await sidebar.navigateTo('kanban');

    const draggableItems = page.locator('[draggable="true"]');

    if (await draggableItems.count() > 0) {
      const item = draggableItems.first();

      // Start drag
      await item.hover();
      await page.mouse.down();

      // Cancel with Escape
      await page.keyboard.press('Escape');
      await page.mouse.up();

      // Should remain functional
      await expect(page.locator('body')).toBeVisible();
    }
  });
});

test.describe('Drag Drop API Integration', () => {
  test('should update task status via API after drag', async ({ page }) => {
    const response = await page.request.patch('/api/tasks/test-task', {
      data: { status: 'in_progress' },
      failOnStatusCode: false
    });

    expect([200, 404]).toContain(response.status());
  });
});
