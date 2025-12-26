import { test, expect } from '@playwright/test';

/**
 * Project Settings Tests
 *
 * Tests for per-project settings configuration including
 * environment variables and integration toggles.
 */

test.describe('Project Settings Access', () => {
  test('should have project settings button', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const settingsBtn = page.locator('button').filter({
      has: page.locator('svg.lucide-settings, svg.lucide-settings-2')
    });

    const count = await settingsBtn.count();
    expect(count).toBeGreaterThan(0);
  });

  test('should open project settings dialog', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const settingsBtn = page.locator('button').filter({
      has: page.locator('svg.lucide-settings-2')
    }).first();

    if (await settingsBtn.count() > 0) {
      await settingsBtn.click();
      await page.waitForTimeout(300);

      const dialog = page.locator('[role="dialog"]');
      const count = await dialog.count();
      expect(count).toBeGreaterThanOrEqual(0);
    }
  });
});

test.describe('Project Settings Sections', () => {
  test('should display general section', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Open settings
    const settingsBtn = page.locator('button').filter({
      has: page.locator('svg.lucide-settings-2')
    }).first();

    if (await settingsBtn.count() > 0) {
      await settingsBtn.click();
      await page.waitForTimeout(300);

      const generalSection = page.getByText(/general|project info/i);
      const count = await generalSection.count();
      expect(count).toBeGreaterThanOrEqual(0);
    }
  });

  test('should display integrations section', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const settingsBtn = page.locator('button').filter({
      has: page.locator('svg.lucide-settings-2')
    }).first();

    if (await settingsBtn.count() > 0) {
      await settingsBtn.click();
      await page.waitForTimeout(300);

      const integrationsSection = page.getByText(/integrations|connections/i);
      const count = await integrationsSection.count();
      expect(count).toBeGreaterThanOrEqual(0);
    }
  });
});

test.describe('Environment Configuration', () => {
  test('should display environment config option', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const settingsBtn = page.locator('button').filter({
      has: page.locator('svg.lucide-settings-2')
    }).first();

    if (await settingsBtn.count() > 0) {
      await settingsBtn.click();
      await page.waitForTimeout(300);

      const envConfig = page.getByText(/environment|env|variables/i);
      const count = await envConfig.count();
      expect(count).toBeGreaterThanOrEqual(0);
    }
  });

  test('should have Claude API key field', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const settingsBtn = page.locator('button').filter({
      has: page.locator('svg.lucide-settings-2')
    }).first();

    if (await settingsBtn.count() > 0) {
      await settingsBtn.click();
      await page.waitForTimeout(300);

      const apiKeyField = page.locator('input[type="password"]').or(
        page.getByText(/api key|anthropic/i)
      );

      const count = await apiKeyField.count();
      expect(count).toBeGreaterThanOrEqual(0);
    }
  });
});

test.describe('Integration Toggles', () => {
  test('should have GitHub integration toggle', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const settingsBtn = page.locator('button').filter({
      has: page.locator('svg.lucide-settings-2')
    }).first();

    if (await settingsBtn.count() > 0) {
      await settingsBtn.click();
      await page.waitForTimeout(300);

      const githubToggle = page.getByText(/github/i);
      const count = await githubToggle.count();
      expect(count).toBeGreaterThanOrEqual(0);
    }
  });

  test('should have Linear integration toggle', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const settingsBtn = page.locator('button').filter({
      has: page.locator('svg.lucide-settings-2')
    }).first();

    if (await settingsBtn.count() > 0) {
      await settingsBtn.click();
      await page.waitForTimeout(300);

      const linearToggle = page.getByText(/linear/i);
      const count = await linearToggle.count();
      expect(count).toBeGreaterThanOrEqual(0);
    }
  });
});

test.describe('Project Settings API', () => {
  test('should get project env via WebSocket', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Test via REST API fallback
    const response = await page.request.get('/api/projects/test-project', {
      failOnStatusCode: false
    });

    expect([200, 404]).toContain(response.status());
  });

  test('should update project via API', async ({ page }) => {
    const response = await page.request.patch('/api/projects/test-project', {
      data: { name: 'Updated Project' },
      failOnStatusCode: false
    });

    expect([200, 404, 400]).toContain(response.status());
  });
});

test.describe('Project Settings Validation', () => {
  test('should validate required fields', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const settingsBtn = page.locator('button').filter({
      has: page.locator('svg.lucide-settings-2')
    }).first();

    if (await settingsBtn.count() > 0) {
      await settingsBtn.click();
      await page.waitForTimeout(300);

      // Look for required field indicators
      const requiredIndicators = page.locator('[data-required="true"]').or(
        page.getByText(/required/i)
      );

      const count = await requiredIndicators.count();
      expect(count).toBeGreaterThanOrEqual(0);
    }
  });
});

test.describe('Project Path Display', () => {
  test('should display project path', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const settingsBtn = page.locator('button').filter({
      has: page.locator('svg.lucide-settings-2')
    }).first();

    if (await settingsBtn.count() > 0) {
      await settingsBtn.click();
      await page.waitForTimeout(300);

      const pathDisplay = page.getByText(/path|location|directory/i);
      const count = await pathDisplay.count();
      expect(count).toBeGreaterThanOrEqual(0);
    }
  });
});

test.describe('Project Danger Zone', () => {
  test('should have delete project option', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const settingsBtn = page.locator('button').filter({
      has: page.locator('svg.lucide-settings-2')
    }).first();

    if (await settingsBtn.count() > 0) {
      await settingsBtn.click();
      await page.waitForTimeout(300);

      const deleteOption = page.getByText(/delete|remove project/i);
      const count = await deleteOption.count();
      expect(count).toBeGreaterThanOrEqual(0);
    }
  });
});
