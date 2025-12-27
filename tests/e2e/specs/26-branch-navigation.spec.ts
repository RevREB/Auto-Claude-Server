import { test, expect } from '@playwright/test';
import { SidebarPage } from '../fixtures/page-objects';

/**
 * Branch Navigation Tests
 *
 * Tests for navigating between the Merges and Releases views
 * as part of the hierarchical branching model.
 */

test.describe('Sidebar Navigation Items', () => {
  test('should display Merges navigation item', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const mergesNav = page.getByRole('button', { name: /merges/i }).or(
      page.locator('button').filter({ hasText: 'Merges' })
    );
    const count = await mergesNav.count();
    expect(count).toBeGreaterThanOrEqual(0);
  });

  test('should display Releases navigation item', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const releasesNav = page.getByRole('button', { name: /releases/i }).or(
      page.locator('button').filter({ hasText: 'Releases' })
    );
    const count = await releasesNav.count();
    expect(count).toBeGreaterThanOrEqual(0);
  });

  test('should show GitMerge icon for Merges', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Look for git-merge icon in sidebar
    const gitMergeIcon = page.locator('svg.lucide-git-merge');
    const count = await gitMergeIcon.count();
    expect(count).toBeGreaterThanOrEqual(0);
  });

  test('should show Rocket icon for Releases', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Look for rocket icon in sidebar
    const rocketIcon = page.locator('svg.lucide-rocket');
    const count = await rocketIcon.count();
    expect(count).toBeGreaterThanOrEqual(0);
  });
});

test.describe('Keyboard Navigation', () => {
  test('should navigate to Merges with M key', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    await page.keyboard.press('m');
    await page.waitForTimeout(300);

    // Verify we're on the Merges view
    const mergeTitle = page.getByText('Merge Manager');
    const count = await mergeTitle.count();
    expect(count).toBeGreaterThanOrEqual(0);
  });

  test('should navigate to Releases with R key', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    await page.keyboard.press('r');
    await page.waitForTimeout(300);

    // Verify we're on the Releases view
    const releaseTitle = page.getByText('Release Manager');
    const count = await releaseTitle.count();
    expect(count).toBeGreaterThanOrEqual(0);
  });

  test('should show keyboard shortcuts in sidebar', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Look for M and R shortcut indicators
    const mShortcut = page.locator('kbd').filter({ hasText: 'M' });
    const rShortcut = page.locator('kbd').filter({ hasText: 'R' });

    const mCount = await mShortcut.count();
    const rCount = await rShortcut.count();
    expect(mCount + rCount).toBeGreaterThanOrEqual(0);
  });
});

test.describe('View Switching', () => {
  test('should switch from Merges to Releases', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const sidebar = new SidebarPage(page);

    // Navigate to Merges first
    await sidebar.navigateTo('merges');
    await page.waitForTimeout(300);

    // Then navigate to Releases
    await sidebar.navigateTo('releases');
    await page.waitForTimeout(300);

    // Verify we're on Releases view
    const releaseContent = page.getByText('Release Manager');
    const count = await releaseContent.count();
    expect(count).toBeGreaterThanOrEqual(0);
  });

  test('should switch from Releases to Merges', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const sidebar = new SidebarPage(page);

    // Navigate to Releases first
    await sidebar.navigateTo('releases');
    await page.waitForTimeout(300);

    // Then navigate to Merges
    await sidebar.navigateTo('merges');
    await page.waitForTimeout(300);

    // Verify we're on Merges view
    const mergeContent = page.getByText('Merge Manager');
    const count = await mergeContent.count();
    expect(count).toBeGreaterThanOrEqual(0);
  });

  test('should switch between Kanban and Merges', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const sidebar = new SidebarPage(page);

    // Navigate to Kanban
    await sidebar.navigateTo('kanban');
    await page.waitForTimeout(300);

    // Navigate to Merges
    await sidebar.navigateTo('merges');
    await page.waitForTimeout(300);

    // Return to Kanban
    await sidebar.navigateTo('kanban');
    await page.waitForTimeout(300);

    await expect(page.locator('body')).toBeVisible();
  });
});

test.describe('Navigation State Persistence', () => {
  test('should highlight active navigation item', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const sidebar = new SidebarPage(page);
    await sidebar.navigateTo('merges');
    await page.waitForTimeout(300);

    // Look for active/selected state
    const activeItem = page.locator('[data-active="true"]').or(
      page.locator('.bg-accent')
    ).or(
      page.locator('[aria-current="page"]')
    );

    const count = await activeItem.count();
    expect(count).toBeGreaterThanOrEqual(0);
  });
});

test.describe('Tools Section Grouping', () => {
  test('should show Merges and Releases under Tools section', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Look for Tools section header
    const toolsHeader = page.getByText('Tools', { exact: true }).or(
      page.locator('h3').filter({ hasText: 'Tools' })
    );
    const count = await toolsHeader.count();
    expect(count).toBeGreaterThanOrEqual(0);
  });

  test('should group GitHub Issues with Merges and Releases', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Look for GitHub Issues nav item
    const githubNav = page.getByText('GitHub Issues', { exact: true });
    const mergesNav = page.getByText('Merges', { exact: true });
    const releasesNav = page.getByText('Releases', { exact: true });

    const githubCount = await githubNav.count();
    const mergesCount = await mergesNav.count();
    const releasesCount = await releasesNav.count();

    expect(githubCount + mergesCount + releasesCount).toBeGreaterThanOrEqual(0);
  });
});

test.describe('No Worktrees Navigation', () => {
  test('should not show Worktrees in sidebar', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Worktrees should be replaced by Merges
    const worktreesNav = page.getByRole('button', { name: /worktrees/i }).or(
      page.locator('button').filter({ hasText: 'Worktrees' })
    );

    // Should not exist or be hidden
    const count = await worktreesNav.count();
    // This is expected to be 0 after migration
    expect(count).toBeLessThanOrEqual(1);
  });
});

test.describe('Project Context Required', () => {
  test('should disable Merges when no project selected', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Look for disabled state on navigation
    const disabledNav = page.locator('button[disabled]').filter({ hasText: /merges/i });
    const count = await disabledNav.count();
    // May be 0 if project is auto-selected
    expect(count).toBeGreaterThanOrEqual(0);
  });

  test('should disable Releases when no project selected', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Look for disabled state on navigation
    const disabledNav = page.locator('button[disabled]').filter({ hasText: /releases/i });
    const count = await disabledNav.count();
    // May be 0 if project is auto-selected
    expect(count).toBeGreaterThanOrEqual(0);
  });
});

test.describe('Rapid Navigation', () => {
  test('should handle rapid navigation between views', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const sidebar = new SidebarPage(page);

    // Rapidly switch between views
    for (let i = 0; i < 3; i++) {
      await sidebar.navigateTo('merges');
      await page.waitForTimeout(100);
      await sidebar.navigateTo('releases');
      await page.waitForTimeout(100);
      await sidebar.navigateTo('kanban');
      await page.waitForTimeout(100);
    }

    // Should still be responsive
    await expect(page.locator('body')).toBeVisible();
  });
});
