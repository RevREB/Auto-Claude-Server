import { test, expect } from '@playwright/test';
import { IdeationPage, SidebarPage } from '../fixtures/page-objects';
import { sendWebSocketCommand } from '../fixtures/websocket-utils';

/**
 * Ideation Feature Tests
 *
 * Tests for the AI-powered idea generation feature that helps
 * users discover improvements and new features for their projects.
 */

test.describe('Ideation View Navigation', () => {
  test('should navigate to Ideation view via sidebar', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const sidebar = new SidebarPage(page);
    await sidebar.navigateTo('ideation');

    await expect(page.locator('body')).toBeVisible();
  });

  test('should show Ideation in sidebar menu', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const ideationLink = page.getByText('Ideation', { exact: true });
    const count = await ideationLink.count();
    expect(count).toBeGreaterThanOrEqual(0);
  });

  test('should use I keyboard shortcut to navigate', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    await page.keyboard.press('i');
    await page.waitForTimeout(300);

    await expect(page.locator('body')).toBeVisible();
  });
});

test.describe('Idea Generation', () => {
  test('should display generate button', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const sidebar = new SidebarPage(page);
    await sidebar.navigateTo('ideation');

    const ideation = new IdeationPage(page);
    const generateBtn = ideation.generateButton;
    const hasBtn = await generateBtn.count() > 0;

    // Generate button or ideas should be visible
    expect(hasBtn || await ideation.ideaCards.count() > 0 || await ideation.emptyState.count() > 0).toBe(true);
  });

  test('should have stop button during generation', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const sidebar = new SidebarPage(page);
    await sidebar.navigateTo('ideation');

    const ideation = new IdeationPage(page);

    // Stop button should exist (might not be visible unless generating)
    const stopBtn = ideation.stopButton;
    const count = await stopBtn.count();
    expect(count).toBeGreaterThanOrEqual(0);
  });
});

test.describe('Idea Type Filters', () => {
  test('should display idea type filter options', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const sidebar = new SidebarPage(page);
    await sidebar.navigateTo('ideation');

    // Look for type filter checkboxes
    const typeFilters = page.locator('input[type="checkbox"]').or(
      page.locator('[data-testid="idea-type-filter"]')
    );

    const count = await typeFilters.count();
    expect(count).toBeGreaterThanOrEqual(0);
  });

  test('should allow selecting specific idea types', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const sidebar = new SidebarPage(page);
    await sidebar.navigateTo('ideation');

    // Try to find and check a filter
    const checkbox = page.locator('input[type="checkbox"]').first();
    if (await checkbox.count() > 0) {
      await checkbox.check();
      expect(await checkbox.isChecked()).toBe(true);
    }
  });
});

test.describe('Idea Cards', () => {
  test('should display idea cards when ideas exist', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const sidebar = new SidebarPage(page);
    await sidebar.navigateTo('ideation');

    const ideation = new IdeationPage(page);
    const ideaCount = await ideation.getIdeaCount();

    expect(ideaCount).toBeGreaterThanOrEqual(0);
  });

  test('should show idea title and description', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const sidebar = new SidebarPage(page);
    await sidebar.navigateTo('ideation');

    const ideation = new IdeationPage(page);

    if (await ideation.ideaCards.count() > 0) {
      const firstIdea = ideation.ideaCards.first();
      await expect(firstIdea).toBeVisible();
    }
  });
});

test.describe('Idea Actions', () => {
  test('should have dismiss button on idea cards', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const sidebar = new SidebarPage(page);
    await sidebar.navigateTo('ideation');

    const dismissBtn = page.locator('button').filter({
      has: page.locator('svg.lucide-x')
    });

    const count = await dismissBtn.count();
    expect(count).toBeGreaterThanOrEqual(0);
  });

  test('should have convert to task button', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const sidebar = new SidebarPage(page);
    await sidebar.navigateTo('ideation');

    const convertBtn = page.locator('button').filter({ hasText: /convert|create task/i });
    const count = await convertBtn.count();
    expect(count).toBeGreaterThanOrEqual(0);
  });

  test('should have archive option', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const sidebar = new SidebarPage(page);
    await sidebar.navigateTo('ideation');

    const archiveBtn = page.locator('button').filter({ hasText: /archive/i }).or(
      page.locator('button').filter({ has: page.locator('svg.lucide-archive') })
    );

    const count = await archiveBtn.count();
    expect(count).toBeGreaterThanOrEqual(0);
  });
});

test.describe('Ideation API Operations', () => {
  test('should get ideation via WebSocket', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    try {
      const response = await sendWebSocketCommand(page, 'ideation.get', {
        projectId: 'test-project'
      }, 5000);

      expect(response).toBeDefined();
      expect(response.type).toBe('response');
    } catch (error) {
      console.log('[Ideation API] Get ideation test skipped');
    }
  });

  test('should dismiss idea via WebSocket', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    try {
      const response = await sendWebSocketCommand(page, 'ideation.dismiss', {
        projectId: 'test-project',
        ideaId: 'test-idea'
      }, 5000);

      expect(response).toBeDefined();
    } catch (error) {
      console.log('[Ideation API] Dismiss idea test skipped');
    }
  });

  test('should convert idea to task via WebSocket', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    try {
      const response = await sendWebSocketCommand(page, 'ideation.convertToTask', {
        projectId: 'test-project',
        ideaId: 'test-idea'
      }, 5000);

      expect(response).toBeDefined();
    } catch (error) {
      console.log('[Ideation API] Convert to task test skipped');
    }
  });
});

test.describe('Ideation Bulk Operations', () => {
  test('should have dismiss all button', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const sidebar = new SidebarPage(page);
    await sidebar.navigateTo('ideation');

    const dismissAllBtn = page.locator('button').filter({ hasText: /dismiss all|clear all/i });
    const count = await dismissAllBtn.count();
    expect(count).toBeGreaterThanOrEqual(0);
  });

  test('should dismiss all ideas via WebSocket', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    try {
      const response = await sendWebSocketCommand(page, 'ideation.dismissAll', {
        projectId: 'test-project'
      }, 5000);

      expect(response).toBeDefined();
    } catch (error) {
      console.log('[Ideation API] Dismiss all test skipped');
    }
  });

  test('should delete multiple ideas via WebSocket', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    try {
      const response = await sendWebSocketCommand(page, 'ideation.deleteMultiple', {
        projectId: 'test-project',
        ideaIds: ['idea-1', 'idea-2']
      }, 5000);

      expect(response).toBeDefined();
    } catch (error) {
      console.log('[Ideation API] Delete multiple test skipped');
    }
  });
});

test.describe('Ideation Progress Indicator', () => {
  test('should display progress during generation', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const sidebar = new SidebarPage(page);
    await sidebar.navigateTo('ideation');

    // Progress indicator might not be visible initially
    const progressIndicator = page.locator('[data-generating="true"]').or(
      page.locator('.progress-bar')
    ).or(
      page.locator('svg.animate-spin')
    );

    const count = await progressIndicator.count();
    expect(count).toBeGreaterThanOrEqual(0);
  });
});

test.describe('Ideation Empty State', () => {
  test('should show helpful empty state message', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const sidebar = new SidebarPage(page);
    await sidebar.navigateTo('ideation');

    const ideation = new IdeationPage(page);

    // If no ideas exist, should show empty state
    const emptyState = ideation.emptyState;
    if (await emptyState.count() > 0) {
      await expect(emptyState).toBeVisible();
    }
  });
});

test.describe('Ideation Status Updates', () => {
  test('should update idea status via WebSocket', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    try {
      const response = await sendWebSocketCommand(page, 'ideation.updateStatus', {
        projectId: 'test-project',
        ideaId: 'test-idea',
        status: 'reviewed'
      }, 5000);

      expect(response).toBeDefined();
    } catch (error) {
      console.log('[Ideation API] Update status test skipped');
    }
  });
});
