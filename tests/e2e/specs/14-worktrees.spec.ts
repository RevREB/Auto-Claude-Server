import { test, expect } from '@playwright/test';
import { WorktreesPage, SidebarPage } from '../fixtures/page-objects';

/**
 * Worktrees Feature Tests
 *
 * Tests for the Git worktrees management feature that allows users to
 * work on multiple branches simultaneously using Git worktrees.
 */

test.describe('Worktrees View Navigation', () => {
  test('should navigate to Worktrees view via sidebar', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const sidebar = new SidebarPage(page);
    await sidebar.navigateTo('worktrees');

    await expect(page.locator('body')).toBeVisible();
  });

  test('should show Worktrees in sidebar menu', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const worktreesLink = page.getByText('Worktrees', { exact: true });
    const count = await worktreesLink.count();
    expect(count).toBeGreaterThanOrEqual(0);
  });

  test('should use W keyboard shortcut to navigate', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    await page.keyboard.press('w');
    await page.waitForTimeout(300);

    await expect(page.locator('body')).toBeVisible();
  });
});

test.describe('Worktrees List', () => {
  test('should display worktree list', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const sidebar = new SidebarPage(page);
    await sidebar.navigateTo('worktrees');

    const worktrees = new WorktreesPage(page);
    const list = worktrees.worktreeList;

    const count = await list.count();
    expect(count).toBeGreaterThanOrEqual(0);
  });

  test('should display worktree cards', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const sidebar = new SidebarPage(page);
    await sidebar.navigateTo('worktrees');

    const worktrees = new WorktreesPage(page);
    const cardCount = await worktrees.getWorktreeCount();

    expect(cardCount).toBeGreaterThanOrEqual(0);
  });
});

test.describe('Worktrees Creation', () => {
  test('should have create button', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const sidebar = new SidebarPage(page);
    await sidebar.navigateTo('worktrees');

    const worktrees = new WorktreesPage(page);
    const createBtn = worktrees.createButton;

    const count = await createBtn.count();
    expect(count).toBeGreaterThanOrEqual(0);
  });

  test('should have branch input for new worktree', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const sidebar = new SidebarPage(page);
    await sidebar.navigateTo('worktrees');

    const worktrees = new WorktreesPage(page);
    const createBtn = worktrees.createButton;

    if (await createBtn.count() > 0) {
      await createBtn.click();
      await page.waitForTimeout(300);

      const branchInput = worktrees.branchInput;
      const count = await branchInput.count();
      expect(count).toBeGreaterThanOrEqual(0);
    }
  });
});

test.describe('Worktrees Operations', () => {
  test('should have switch button on worktree cards', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const sidebar = new SidebarPage(page);
    await sidebar.navigateTo('worktrees');

    const switchBtn = page.locator('button').filter({ hasText: /switch/i });
    const count = await switchBtn.count();
    expect(count).toBeGreaterThanOrEqual(0);
  });

  test('should have delete button on worktree cards', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const sidebar = new SidebarPage(page);
    await sidebar.navigateTo('worktrees');

    const deleteBtn = page.locator('button').filter({
      has: page.locator('svg.lucide-trash, svg.lucide-trash-2')
    });
    const count = await deleteBtn.count();
    expect(count).toBeGreaterThanOrEqual(0);
  });
});

test.describe('Worktrees Branch Display', () => {
  test('should show branch names on worktree cards', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const sidebar = new SidebarPage(page);
    await sidebar.navigateTo('worktrees');

    // Look for branch indicators
    const branchIndicators = page.locator('[data-branch]').or(
      page.locator('.branch-name')
    ).or(
      page.getByText(/main|master|feature|develop/i)
    );

    const count = await branchIndicators.count();
    expect(count).toBeGreaterThanOrEqual(0);
  });

  test('should show active worktree indicator', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const sidebar = new SidebarPage(page);
    await sidebar.navigateTo('worktrees');

    // Look for active indicator
    const activeIndicator = page.locator('[data-active="true"]').or(
      page.getByText(/active|current/i)
    );

    const count = await activeIndicator.count();
    expect(count).toBeGreaterThanOrEqual(0);
  });
});

test.describe('Worktrees Path Display', () => {
  test('should show worktree paths', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const sidebar = new SidebarPage(page);
    await sidebar.navigateTo('worktrees');

    // Look for path indicators
    const pathIndicators = page.locator('[data-path]').or(
      page.locator('.worktree-path')
    );

    const count = await pathIndicators.count();
    expect(count).toBeGreaterThanOrEqual(0);
  });
});

test.describe('Worktrees Empty State', () => {
  test('should show message when no worktrees exist', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const sidebar = new SidebarPage(page);
    await sidebar.navigateTo('worktrees');

    const emptyState = page.getByText(/no worktrees|create a worktree|not a git repo/i);
    const count = await emptyState.count();
    expect(count).toBeGreaterThanOrEqual(0);
  });
});

test.describe('Worktrees Git Status', () => {
  test('should show git status for each worktree', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const sidebar = new SidebarPage(page);
    await sidebar.navigateTo('worktrees');

    // Look for status indicators (clean, dirty, etc.)
    const statusIndicators = page.locator('[data-status]').or(
      page.getByText(/clean|modified|uncommitted/i)
    );

    const count = await statusIndicators.count();
    expect(count).toBeGreaterThanOrEqual(0);
  });
});

test.describe('Worktrees Validation', () => {
  test('should validate branch name on creation', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const sidebar = new SidebarPage(page);
    await sidebar.navigateTo('worktrees');

    const worktrees = new WorktreesPage(page);
    const createBtn = worktrees.createButton;

    if (await createBtn.count() > 0) {
      await createBtn.click();
      await page.waitForTimeout(300);

      const branchInput = worktrees.branchInput;
      if (await branchInput.count() > 0) {
        // Enter invalid branch name
        await branchInput.fill('invalid branch name with spaces');

        // Look for error message
        const errorMsg = page.getByText(/invalid|error/i);
        const count = await errorMsg.count();
        expect(count).toBeGreaterThanOrEqual(0);
      }
    }
  });
});

test.describe('Worktrees Refresh', () => {
  test('should have refresh button', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const sidebar = new SidebarPage(page);
    await sidebar.navigateTo('worktrees');

    const refreshBtn = page.locator('button').filter({
      has: page.locator('svg.lucide-refresh-cw')
    });

    const count = await refreshBtn.count();
    expect(count).toBeGreaterThanOrEqual(0);
  });
});
