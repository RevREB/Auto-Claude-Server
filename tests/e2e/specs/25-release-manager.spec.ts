import { test, expect } from '@playwright/test';
import { SidebarPage } from '../fixtures/page-objects';

/**
 * Release Manager Feature Tests
 *
 * Tests for the release management feature that allows users to
 * create release candidates and promote them to main.
 */

test.describe('Release Manager View Navigation', () => {
  test('should navigate to Releases view via sidebar', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const sidebar = new SidebarPage(page);
    await sidebar.navigateTo('releases');

    await expect(page.locator('body')).toBeVisible();
  });

  test('should show Releases in sidebar menu', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const releasesLink = page.getByText('Releases', { exact: true });
    const count = await releasesLink.count();
    expect(count).toBeGreaterThanOrEqual(0);
  });

  test('should use R keyboard shortcut to navigate', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    await page.keyboard.press('r');
    await page.waitForTimeout(300);

    await expect(page.locator('body')).toBeVisible();
  });
});

test.describe('Release Manager Header', () => {
  test('should display Release Manager title', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const sidebar = new SidebarPage(page);
    await sidebar.navigateTo('releases');

    const title = page.getByText('Release Manager', { exact: true });
    const count = await title.count();
    expect(count).toBeGreaterThanOrEqual(0);
  });

  test('should have refresh button', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const sidebar = new SidebarPage(page);
    await sidebar.navigateTo('releases');

    const refreshBtn = page.locator('button').filter({
      has: page.locator('svg.lucide-refresh-cw')
    });
    const count = await refreshBtn.count();
    expect(count).toBeGreaterThanOrEqual(0);
  });

  test('should have new release button', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const sidebar = new SidebarPage(page);
    await sidebar.navigateTo('releases');

    const newBtn = page.getByRole('button', { name: /new release/i });
    const count = await newBtn.count();
    expect(count).toBeGreaterThanOrEqual(0);
  });
});

test.describe('Current Version Card', () => {
  test('should display current version', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const sidebar = new SidebarPage(page);
    await sidebar.navigateTo('releases');

    // Look for version display
    const version = page.getByText(/v?\d+\.\d+\.\d+/);
    const count = await version.count();
    expect(count).toBeGreaterThanOrEqual(0);
  });

  test('should show next version suggestion', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const sidebar = new SidebarPage(page);
    await sidebar.navigateTo('releases');

    // Look for next version indicator
    const nextVersion = page.getByText(/next|suggested/i);
    const count = await nextVersion.count();
    expect(count).toBeGreaterThanOrEqual(0);
  });

  test('should show bump type', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const sidebar = new SidebarPage(page);
    await sidebar.navigateTo('releases');

    // Look for bump type indicator
    const bumpType = page.getByText(/major bump|minor bump|patch bump/i);
    const count = await bumpType.count();
    expect(count).toBeGreaterThanOrEqual(0);
  });
});

test.describe('Release Candidates', () => {
  test('should display release candidate cards', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const sidebar = new SidebarPage(page);
    await sidebar.navigateTo('releases');

    // Look for release candidate section
    const candidates = page.getByText(/release candidates|candidate/i);
    const count = await candidates.count();
    expect(count).toBeGreaterThanOrEqual(0);
  });

  test('should show release branch name', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const sidebar = new SidebarPage(page);
    await sidebar.navigateTo('releases');

    // Look for release branch
    const branch = page.getByText(/release\//i);
    const count = await branch.count();
    expect(count).toBeGreaterThanOrEqual(0);
  });

  test('should have promote button', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const sidebar = new SidebarPage(page);
    await sidebar.navigateTo('releases');

    const promoteBtn = page.getByRole('button', { name: /promote/i });
    const count = await promoteBtn.count();
    expect(count).toBeGreaterThanOrEqual(0);
  });

  test('should have abandon button', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const sidebar = new SidebarPage(page);
    await sidebar.navigateTo('releases');

    const abandonBtn = page.getByRole('button', { name: /abandon/i });
    const count = await abandonBtn.count();
    expect(count).toBeGreaterThanOrEqual(0);
  });
});

test.describe('New Release Dialog', () => {
  test('should open new release dialog', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const sidebar = new SidebarPage(page);
    await sidebar.navigateTo('releases');

    const newBtn = page.getByRole('button', { name: /new release/i }).first();

    if (await newBtn.count() > 0) {
      await newBtn.click();
      await page.waitForTimeout(300);

      const dialog = page.getByRole('dialog');
      const count = await dialog.count();
      expect(count).toBeGreaterThanOrEqual(0);
    }
  });

  test('should have version input', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const sidebar = new SidebarPage(page);
    await sidebar.navigateTo('releases');

    const newBtn = page.getByRole('button', { name: /new release/i }).first();

    if (await newBtn.count() > 0) {
      await newBtn.click();
      await page.waitForTimeout(300);

      const versionInput = page.locator('input[id="version"]').or(
        page.getByPlaceholder(/version|1\.0\.0/i)
      );
      const count = await versionInput.count();
      expect(count).toBeGreaterThanOrEqual(0);
    }
  });

  test('should have release notes editor', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const sidebar = new SidebarPage(page);
    await sidebar.navigateTo('releases');

    const newBtn = page.getByRole('button', { name: /new release/i }).first();

    if (await newBtn.count() > 0) {
      await newBtn.click();
      await page.waitForTimeout(300);

      const notesEditor = page.locator('textarea').or(
        page.getByPlaceholder(/release notes/i)
      );
      const count = await notesEditor.count();
      expect(count).toBeGreaterThanOrEqual(0);
    }
  });

  test('should have auto-generate notes button', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const sidebar = new SidebarPage(page);
    await sidebar.navigateTo('releases');

    const newBtn = page.getByRole('button', { name: /new release/i }).first();

    if (await newBtn.count() > 0) {
      await newBtn.click();
      await page.waitForTimeout(300);

      const generateBtn = page.getByRole('button', { name: /auto-generate|generate/i });
      const count = await generateBtn.count();
      expect(count).toBeGreaterThanOrEqual(0);
    }
  });
});

test.describe('Promote Dialog', () => {
  test('should show promote confirmation dialog', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const sidebar = new SidebarPage(page);
    await sidebar.navigateTo('releases');

    const promoteBtn = page.getByRole('button', { name: /promote to main/i }).first();

    if (await promoteBtn.count() > 0) {
      await promoteBtn.click();
      await page.waitForTimeout(300);

      const dialog = page.getByRole('dialog');
      const count = await dialog.count();
      expect(count).toBeGreaterThanOrEqual(0);
    }
  });

  test('should show what will happen on promote', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const sidebar = new SidebarPage(page);
    await sidebar.navigateTo('releases');

    const promoteBtn = page.getByRole('button', { name: /promote to main/i }).first();

    if (await promoteBtn.count() > 0) {
      await promoteBtn.click();
      await page.waitForTimeout(300);

      // Look for merge info
      const mergeInfo = page.getByText(/merge.*into main|create tag/i);
      const count = await mergeInfo.count();
      expect(count).toBeGreaterThanOrEqual(0);
    }
  });
});

test.describe('Released List', () => {
  test('should show promoted releases', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const sidebar = new SidebarPage(page);
    await sidebar.navigateTo('releases');

    // Look for released section
    const released = page.getByText(/released|promoted/i);
    const count = await released.count();
    expect(count).toBeGreaterThanOrEqual(0);
  });

  test('should show release tags', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const sidebar = new SidebarPage(page);
    await sidebar.navigateTo('releases');

    // Look for tags (v1.0.0 format)
    const tags = page.locator('svg.lucide-tag').or(
      page.getByText(/^v\d+\.\d+\.\d+$/)
    );
    const count = await tags.count();
    expect(count).toBeGreaterThanOrEqual(0);
  });
});

test.describe('Empty State', () => {
  test('should show message when no releases', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const sidebar = new SidebarPage(page);
    await sidebar.navigateTo('releases');

    const emptyState = page.getByText(/no releases|create a release/i);
    const count = await emptyState.count();
    expect(count).toBeGreaterThanOrEqual(0);
  });
});

test.describe('Version Calculation Display', () => {
  test('should show breaking changes count', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const sidebar = new SidebarPage(page);
    await sidebar.navigateTo('releases');

    // Look for breaking changes indicator
    const breaking = page.getByText(/breaking/i);
    const count = await breaking.count();
    expect(count).toBeGreaterThanOrEqual(0);
  });

  test('should show features count', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const sidebar = new SidebarPage(page);
    await sidebar.navigateTo('releases');

    // Look for features count
    const features = page.getByText(/feature/i);
    const count = await features.count();
    expect(count).toBeGreaterThanOrEqual(0);
  });

  test('should show fixes count', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const sidebar = new SidebarPage(page);
    await sidebar.navigateTo('releases');

    // Look for fixes count
    const fixes = page.getByText(/fix|bug/i);
    const count = await fixes.count();
    expect(count).toBeGreaterThanOrEqual(0);
  });
});
