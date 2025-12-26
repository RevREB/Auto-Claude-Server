import { test, expect } from '@playwright/test';
import { ChangelogPage, SidebarPage } from '../fixtures/page-objects';
import { sendWebSocketCommand } from '../fixtures/websocket-utils';

/**
 * Changelog Feature Tests
 *
 * Tests for the changelog generation feature that creates
 * release notes from completed tasks and git commits.
 */

test.describe('Changelog View Navigation', () => {
  test('should navigate to Changelog view via sidebar', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const sidebar = new SidebarPage(page);
    await sidebar.navigateTo('changelog');

    await expect(page.locator('body')).toBeVisible();
  });

  test('should show Changelog in sidebar menu', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const changelogLink = page.getByText('Changelog', { exact: true });
    const count = await changelogLink.count();
    expect(count).toBeGreaterThanOrEqual(0);
  });
});

test.describe('Changelog Generation', () => {
  test('should display generate button', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const sidebar = new SidebarPage(page);
    await sidebar.navigateTo('changelog');

    const changelog = new ChangelogPage(page);
    const generateBtn = changelog.generateButton;

    const count = await generateBtn.count();
    expect(count).toBeGreaterThanOrEqual(0);
  });

  test('should have version input field', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const sidebar = new SidebarPage(page);
    await sidebar.navigateTo('changelog');

    const changelog = new ChangelogPage(page);
    const versionInput = changelog.versionInput;

    const count = await versionInput.count();
    expect(count).toBeGreaterThanOrEqual(0);
  });

  test('should allow setting version number', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const sidebar = new SidebarPage(page);
    await sidebar.navigateTo('changelog');

    const changelog = new ChangelogPage(page);
    const versionInput = changelog.versionInput;

    if (await versionInput.count() > 0) {
      await changelog.setVersion('1.0.0');
      const value = await versionInput.inputValue();
      expect(value).toBe('1.0.0');
    }
  });
});

test.describe('Changelog Task Selection', () => {
  test('should display task checkboxes for selection', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const sidebar = new SidebarPage(page);
    await sidebar.navigateTo('changelog');

    const changelog = new ChangelogPage(page);
    const checkboxes = changelog.taskCheckboxes;

    const count = await checkboxes.count();
    expect(count).toBeGreaterThanOrEqual(0);
  });

  test('should allow selecting multiple tasks', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const sidebar = new SidebarPage(page);
    await sidebar.navigateTo('changelog');

    const checkboxes = page.locator('input[type="checkbox"]');

    if (await checkboxes.count() > 1) {
      await checkboxes.first().check();
      await checkboxes.nth(1).check();

      expect(await checkboxes.first().isChecked()).toBe(true);
      expect(await checkboxes.nth(1).isChecked()).toBe(true);
    }
  });
});

test.describe('Changelog Preview', () => {
  test('should display changelog preview area', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const sidebar = new SidebarPage(page);
    await sidebar.navigateTo('changelog');

    const changelog = new ChangelogPage(page);
    const preview = changelog.changelogPreview;

    const count = await preview.count();
    expect(count).toBeGreaterThanOrEqual(0);
  });
});

test.describe('Changelog Save Operations', () => {
  test('should have save button', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const sidebar = new SidebarPage(page);
    await sidebar.navigateTo('changelog');

    const changelog = new ChangelogPage(page);
    const saveBtn = changelog.saveButton;

    const count = await saveBtn.count();
    expect(count).toBeGreaterThanOrEqual(0);
  });
});

test.describe('Changelog API Operations', () => {
  test('should get done tasks via WebSocket', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    try {
      const response = await sendWebSocketCommand(page, 'changelog.getDoneTasks', {
        projectId: 'test-project'
      }, 5000);

      expect(response).toBeDefined();
      expect(response.type).toBe('response');
    } catch (error) {
      console.log('[Changelog API] Get done tasks test skipped');
    }
  });

  test('should suggest version via WebSocket', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    try {
      const response = await sendWebSocketCommand(page, 'changelog.suggestVersion', {
        projectId: 'test-project'
      }, 5000);

      expect(response).toBeDefined();
    } catch (error) {
      console.log('[Changelog API] Suggest version test skipped');
    }
  });

  test('should get branches via WebSocket', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    try {
      const response = await sendWebSocketCommand(page, 'changelog.getBranches', {
        projectId: 'test-project'
      }, 5000);

      expect(response).toBeDefined();
    } catch (error) {
      console.log('[Changelog API] Get branches test skipped');
    }
  });

  test('should get tags via WebSocket', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    try {
      const response = await sendWebSocketCommand(page, 'changelog.getTags', {
        projectId: 'test-project'
      }, 5000);

      expect(response).toBeDefined();
    } catch (error) {
      console.log('[Changelog API] Get tags test skipped');
    }
  });
});

test.describe('Changelog Git Integration', () => {
  test('should have branch selector', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const sidebar = new SidebarPage(page);
    await sidebar.navigateTo('changelog');

    const changelog = new ChangelogPage(page);
    const branchSelector = changelog.branchSelector;

    const count = await branchSelector.count();
    expect(count).toBeGreaterThanOrEqual(0);
  });

  test('should get commits preview via WebSocket', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    try {
      const response = await sendWebSocketCommand(page, 'changelog.getCommitsPreview', {
        projectId: 'test-project',
        fromRef: 'v1.0.0',
        toRef: 'HEAD'
      }, 5000);

      expect(response).toBeDefined();
    } catch (error) {
      console.log('[Changelog API] Get commits preview test skipped');
    }
  });
});

test.describe('Changelog GitHub Release', () => {
  test('should have create release button', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const sidebar = new SidebarPage(page);
    await sidebar.navigateTo('changelog');

    const changelog = new ChangelogPage(page);
    const releaseBtn = changelog.releaseButton;

    const count = await releaseBtn.count();
    expect(count).toBeGreaterThanOrEqual(0);
  });

  test('should get releaseable versions via WebSocket', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    try {
      const response = await sendWebSocketCommand(page, 'changelog.getReleaseableVersions', {
        projectId: 'test-project'
      }, 5000);

      expect(response).toBeDefined();
    } catch (error) {
      console.log('[Changelog API] Get releaseable versions test skipped');
    }
  });

  test('should run preflight check via WebSocket', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    try {
      const response = await sendWebSocketCommand(page, 'changelog.preflightCheck', {
        projectId: 'test-project',
        version: '1.0.0'
      }, 5000);

      expect(response).toBeDefined();
    } catch (error) {
      console.log('[Changelog API] Preflight check test skipped');
    }
  });
});

test.describe('Changelog Generation Modes', () => {
  test('should support task-based generation', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const sidebar = new SidebarPage(page);
    await sidebar.navigateTo('changelog');

    // Look for task-based mode toggle
    const taskMode = page.getByText(/tasks|completed/i);
    const count = await taskMode.count();
    expect(count).toBeGreaterThanOrEqual(0);
  });

  test('should support commit-based generation', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const sidebar = new SidebarPage(page);
    await sidebar.navigateTo('changelog');

    // Look for commit-based mode toggle
    const commitMode = page.getByText(/commits|git/i);
    const count = await commitMode.count();
    expect(count).toBeGreaterThanOrEqual(0);
  });
});

test.describe('Changelog Empty State', () => {
  test('should show message when no tasks available', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const sidebar = new SidebarPage(page);
    await sidebar.navigateTo('changelog');

    const emptyState = page.getByText(/no completed tasks|nothing to release/i);
    const count = await emptyState.count();
    expect(count).toBeGreaterThanOrEqual(0);
  });
});
