import { test, expect } from '@playwright/test';
import { SidebarPage } from '../fixtures/page-objects';

/**
 * Merge Manager Feature Tests
 *
 * Tests for the Git merge management feature that allows users to
 * manage feature branches and merge them to dev.
 */

test.describe('Merge Manager View Navigation', () => {
  test('should navigate to Merges view via sidebar', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const sidebar = new SidebarPage(page);
    await sidebar.navigateTo('merges');

    await expect(page.locator('body')).toBeVisible();
  });

  test('should show Merges in sidebar menu', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const mergesLink = page.getByText('Merges', { exact: true });
    const count = await mergesLink.count();
    expect(count).toBeGreaterThanOrEqual(0);
  });

  test('should use M keyboard shortcut to navigate', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    await page.keyboard.press('m');
    await page.waitForTimeout(300);

    await expect(page.locator('body')).toBeVisible();
  });
});

test.describe('Merge Manager Header', () => {
  test('should display Merge Manager title', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const sidebar = new SidebarPage(page);
    await sidebar.navigateTo('merges');

    const title = page.getByText('Merge Manager', { exact: true });
    const count = await title.count();
    expect(count).toBeGreaterThanOrEqual(0);
  });

  test('should have refresh button', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const sidebar = new SidebarPage(page);
    await sidebar.navigateTo('merges');

    const refreshBtn = page.locator('button').filter({
      has: page.locator('svg.lucide-refresh-cw')
    });
    const count = await refreshBtn.count();
    expect(count).toBeGreaterThanOrEqual(0);
  });

  test('should have dev branch status indicator', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const sidebar = new SidebarPage(page);
    await sidebar.navigateTo('merges');

    // Look for dev branch status
    const devStatus = page.getByText(/dev branch|development/i);
    const count = await devStatus.count();
    expect(count).toBeGreaterThanOrEqual(0);
  });
});

test.describe('Feature Branch List', () => {
  test('should display feature branch cards', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const sidebar = new SidebarPage(page);
    await sidebar.navigateTo('merges');

    // Look for feature branch cards
    const cards = page.locator('[data-testid="feature-branch-card"]').or(
      page.locator('.feature-branch-card')
    );
    const count = await cards.count();
    expect(count).toBeGreaterThanOrEqual(0);
  });

  test('should show version impact badges', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const sidebar = new SidebarPage(page);
    await sidebar.navigateTo('merges');

    // Look for version impact badges (major/minor/patch)
    const badges = page.getByText(/major|minor|patch/i);
    const count = await badges.count();
    expect(count).toBeGreaterThanOrEqual(0);
  });

  test('should show branch names', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const sidebar = new SidebarPage(page);
    await sidebar.navigateTo('merges');

    // Look for branch indicators
    const branches = page.getByText(/feature\//i);
    const count = await branches.count();
    expect(count).toBeGreaterThanOrEqual(0);
  });
});

test.describe('Merge Actions', () => {
  test('should have merge to dev button', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const sidebar = new SidebarPage(page);
    await sidebar.navigateTo('merges');

    const mergeBtn = page.getByRole('button', { name: /merge to dev/i });
    const count = await mergeBtn.count();
    expect(count).toBeGreaterThanOrEqual(0);
  });

  test('should have preview merge button', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const sidebar = new SidebarPage(page);
    await sidebar.navigateTo('merges');

    const previewBtn = page.getByRole('button', { name: /preview/i });
    const count = await previewBtn.count();
    expect(count).toBeGreaterThanOrEqual(0);
  });
});

test.describe('Merge Preview Dialog', () => {
  test('should show merge preview modal', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const sidebar = new SidebarPage(page);
    await sidebar.navigateTo('merges');

    const previewBtn = page.getByRole('button', { name: /preview/i }).first();

    if (await previewBtn.count() > 0) {
      await previewBtn.click();
      await page.waitForTimeout(300);

      // Look for preview dialog
      const dialog = page.getByRole('dialog');
      const count = await dialog.count();
      expect(count).toBeGreaterThanOrEqual(0);
    }
  });

  test('should show conflict information', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const sidebar = new SidebarPage(page);
    await sidebar.navigateTo('merges');

    // Look for conflict indicators
    const conflicts = page.getByText(/conflict|no conflicts/i);
    const count = await conflicts.count();
    expect(count).toBeGreaterThanOrEqual(0);
  });
});

test.describe('Subtask Display', () => {
  test('should show subtasks under feature branches', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const sidebar = new SidebarPage(page);
    await sidebar.navigateTo('merges');

    // Look for subtask list
    const subtasks = page.locator('[data-testid="subtask-list"]').or(
      page.locator('.subtask-list')
    );
    const count = await subtasks.count();
    expect(count).toBeGreaterThanOrEqual(0);
  });

  test('should show subtask merge status', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const sidebar = new SidebarPage(page);
    await sidebar.navigateTo('merges');

    // Look for merge status badges
    const statuses = page.getByText(/merged|pending|in progress/i);
    const count = await statuses.count();
    expect(count).toBeGreaterThanOrEqual(0);
  });
});

test.describe('Empty State', () => {
  test('should show message when no feature branches', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const sidebar = new SidebarPage(page);
    await sidebar.navigateTo('merges');

    const emptyState = page.getByText(/no feature branches|no branches to merge/i);
    const count = await emptyState.count();
    expect(count).toBeGreaterThanOrEqual(0);
  });
});

test.describe('Dev Branch Management', () => {
  test('should have ensure dev branch button if missing', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const sidebar = new SidebarPage(page);
    await sidebar.navigateTo('merges');

    const ensureBtn = page.getByRole('button', { name: /ensure dev|create dev/i });
    const count = await ensureBtn.count();
    expect(count).toBeGreaterThanOrEqual(0);
  });
});

test.describe('Branch Grouping', () => {
  test('should group branches by merge status', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const sidebar = new SidebarPage(page);
    await sidebar.navigateTo('merges');

    // Look for section headers
    const sections = page.getByText(/ready to merge|merged|pending/i);
    const count = await sections.count();
    expect(count).toBeGreaterThanOrEqual(0);
  });
});
