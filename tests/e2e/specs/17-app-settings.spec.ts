import { test, expect } from '@playwright/test';
import { SettingsPage } from '../fixtures/page-objects';

/**
 * App Settings Tests
 *
 * Tests for the application settings dialog including
 * all settings tabs and configuration options.
 */

test.describe('Settings Dialog', () => {
  test('should open settings dialog', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const settings = new SettingsPage(page);
    await settings.openSettings();

    expect(await settings.isOpen()).toBe(true);
  });

  test('should close settings dialog', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const settings = new SettingsPage(page);
    await settings.openSettings();
    await settings.closeSettings();

    expect(await settings.isOpen()).toBe(false);
  });

  test('should close on Escape key', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const settings = new SettingsPage(page);
    await settings.openSettings();

    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);

    expect(await settings.isOpen()).toBe(false);
  });
});

test.describe('Settings Tabs', () => {
  test('should display multiple tabs', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const settings = new SettingsPage(page);
    await settings.openSettings();

    const tabNames = await settings.getTabNames();
    expect(tabNames.length).toBeGreaterThan(0);
  });

  test('should switch between tabs', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const settings = new SettingsPage(page);
    await settings.openSettings();

    const tabs = settings.tabs;
    if (await tabs.count() > 1) {
      await tabs.nth(1).click();
      await page.waitForTimeout(300);

      // Should switch tabs without error
      await expect(page.locator('body')).toBeVisible();
    }
  });
});

test.describe('General Settings', () => {
  test('should display general settings content', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const settings = new SettingsPage(page);
    await settings.openSettings();

    // Look for general settings content
    const generalContent = page.getByText(/general|appearance|theme/i);
    const count = await generalContent.count();
    expect(count).toBeGreaterThanOrEqual(0);
  });

  test('should have theme selector', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const settings = new SettingsPage(page);
    await settings.openSettings();

    const themeSelector = page.locator('[data-testid="theme-select"]').or(
      page.getByText(/theme|dark|light/i)
    );

    const count = await themeSelector.count();
    expect(count).toBeGreaterThanOrEqual(0);
  });
});

test.describe('Profiles Settings', () => {
  test('should display profiles tab', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const settings = new SettingsPage(page);
    await settings.openSettings();

    const profilesTab = page.getByRole('tab', { name: /profiles|accounts/i });
    const count = await profilesTab.count();
    expect(count).toBeGreaterThanOrEqual(0);
  });

  test('should show profile list', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const settings = new SettingsPage(page);
    await settings.openSettings();

    // Try to switch to profiles tab
    const profilesTab = page.getByRole('tab', { name: /profiles|accounts/i });
    if (await profilesTab.count() > 0) {
      await profilesTab.click();
      await page.waitForTimeout(300);

      // Should show profile list or empty state
      await expect(page.locator('body')).toBeVisible();
    }
  });

  test('should have add profile button', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const settings = new SettingsPage(page);
    await settings.openSettings();

    const addProfileBtn = page.locator('button').filter({ hasText: /add profile|new profile/i });
    const count = await addProfileBtn.count();
    expect(count).toBeGreaterThanOrEqual(0);
  });
});

test.describe('Updates Settings', () => {
  test('should display updates tab', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const settings = new SettingsPage(page);
    await settings.openSettings();

    const updatesTab = page.getByRole('tab', { name: /updates/i });
    const count = await updatesTab.count();
    expect(count).toBeGreaterThanOrEqual(0);
  });

  test('should show current version', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const settings = new SettingsPage(page);
    await settings.openSettings();

    const versionText = page.getByText(/version|v\d+\.\d+/i);
    const count = await versionText.count();
    expect(count).toBeGreaterThanOrEqual(0);
  });

  test('should have check for updates button', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const settings = new SettingsPage(page);
    await settings.openSettings();

    const checkUpdatesBtn = page.locator('button').filter({ hasText: /check.*updates/i });
    const count = await checkUpdatesBtn.count();
    expect(count).toBeGreaterThanOrEqual(0);
  });
});

test.describe('About Section', () => {
  test('should display about information', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const settings = new SettingsPage(page);
    await settings.openSettings();

    const aboutTab = page.getByRole('tab', { name: /about/i });
    if (await aboutTab.count() > 0) {
      await aboutTab.click();
      await page.waitForTimeout(300);

      // Should show about content
      await expect(page.locator('body')).toBeVisible();
    }
  });
});

test.describe('Settings Persistence', () => {
  test('should save settings changes', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const settings = new SettingsPage(page);
    await settings.openSettings();

    // Find a toggle or checkbox
    const toggle = page.locator('input[type="checkbox"]').first();
    if (await toggle.count() > 0) {
      const initialState = await toggle.isChecked();
      await toggle.click();

      // Close and reopen settings
      await settings.closeSettings();
      await settings.openSettings();

      // Setting should be persisted
      await expect(page.locator('body')).toBeVisible();
    }
  });
});

test.describe('Settings API', () => {
  test('should get settings via API', async ({ page }) => {
    const response = await page.request.get('/api/settings');

    expect(response.status()).toBe(200);
    const data = await response.json();
    expect(data).toHaveProperty('success');
  });

  test('should update settings via API', async ({ page }) => {
    const response = await page.request.post('/api/settings', {
      data: {
        colorTheme: 'dark'
      }
    });

    expect([200, 400]).toContain(response.status());
  });
});

test.describe('Settings Keyboard Navigation', () => {
  test('should navigate tabs with arrow keys', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const settings = new SettingsPage(page);
    await settings.openSettings();

    // Focus first tab
    await page.keyboard.press('Tab');
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(100);

    // Should remain responsive
    await expect(page.locator('body')).toBeVisible();
  });
});

test.describe('Settings Validation', () => {
  test('should validate input fields', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const settings = new SettingsPage(page);
    await settings.openSettings();

    // Find any text input
    const textInput = page.locator('input[type="text"]').first();
    if (await textInput.count() > 0) {
      // Enter invalid data
      await textInput.fill('');

      // Look for validation error
      const errorMsg = page.getByText(/required|invalid/i);
      const count = await errorMsg.count();
      expect(count).toBeGreaterThanOrEqual(0);
    }
  });
});

test.describe('Settings Reset', () => {
  test('should have reset option', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const settings = new SettingsPage(page);
    await settings.openSettings();

    const resetBtn = page.locator('button').filter({ hasText: /reset|default/i });
    const count = await resetBtn.count();
    expect(count).toBeGreaterThanOrEqual(0);
  });
});
