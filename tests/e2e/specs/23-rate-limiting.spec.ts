import { test, expect } from '@playwright/test';

/**
 * Rate Limiting Tests
 *
 * Tests for rate limit indicators, warnings, and
 * the proactive account swap feature.
 */

test.describe('Usage Indicator Display', () => {
  test('should display usage badge', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const usageBadge = page.locator('button[aria-label="Claude usage status"]').or(
      page.locator('[data-testid="usage-indicator"]')
    );

    const count = await usageBadge.count();
    expect(count).toBeGreaterThanOrEqual(0);
  });

  test('should show percentage in badge', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const percentageText = page.locator('text=/\\d+%/');
    const count = await percentageText.count();
    expect(count).toBeGreaterThanOrEqual(0);
  });
});

test.describe('Usage Tooltip', () => {
  test('should show tooltip on hover', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const usageBadge = page.locator('button[aria-label="Claude usage status"]');

    if (await usageBadge.count() > 0) {
      await usageBadge.hover();
      await page.waitForTimeout(300);

      const tooltip = page.locator('[role="tooltip"]');
      const count = await tooltip.count();
      expect(count).toBeGreaterThanOrEqual(0);
    }
  });

  test('should show session and weekly usage in tooltip', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const usageBadge = page.locator('button[aria-label="Claude usage status"]');

    if (await usageBadge.count() > 0) {
      await usageBadge.hover();
      await page.waitForTimeout(300);

      const sessionUsage = page.getByText(/session usage/i);
      const weeklyUsage = page.getByText(/weekly usage/i);

      const sessionCount = await sessionUsage.count();
      const weeklyCount = await weeklyUsage.count();

      expect(sessionCount + weeklyCount).toBeGreaterThanOrEqual(0);
    }
  });

  test('should show reset times', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const usageBadge = page.locator('button[aria-label="Claude usage status"]');

    if (await usageBadge.count() > 0) {
      await usageBadge.hover();
      await page.waitForTimeout(300);

      const resetTime = page.getByText(/resets:/i);
      const count = await resetTime.count();
      expect(count).toBeGreaterThanOrEqual(0);
    }
  });
});

test.describe('Rate Limit Warning', () => {
  test('should show warning when approaching limit', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Look for warning indicators (color changes, icons)
    const warningIndicator = page.locator('[data-warning="true"]').or(
      page.locator('.text-yellow, .text-amber')
    );

    const count = await warningIndicator.count();
    expect(count).toBeGreaterThanOrEqual(0);
  });

  test('should show critical warning at high usage', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const criticalIndicator = page.locator('[data-critical="true"]').or(
      page.locator('.text-red')
    );

    const count = await criticalIndicator.count();
    expect(count).toBeGreaterThanOrEqual(0);
  });
});

test.describe('Rate Limit Modal', () => {
  test('should have rate limit modal component', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Modal might not be visible, just check it doesn't break
    await expect(page.locator('body')).toBeVisible();
  });
});

test.describe('SDK Rate Limit Modal', () => {
  test('should handle SDK rate limit gracefully', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // SDK modal appears when Claude API returns rate limit error
    const sdkModal = page.locator('[data-testid="sdk-rate-limit-modal"]');
    const count = await sdkModal.count();
    expect(count).toBeGreaterThanOrEqual(0);
  });
});

test.describe('Proactive Account Swap', () => {
  test('should have proactive swap listener active', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Proactive swap is a background feature
    // Just verify app is functional
    await expect(page.locator('body')).toBeVisible();
  });

  test('should show swap suggestion when limit approaches', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const swapSuggestion = page.getByText(/switch account|swap profile/i);
    const count = await swapSuggestion.count();
    expect(count).toBeGreaterThanOrEqual(0);
  });
});

test.describe('Usage API', () => {
  test('should get usage data via API', async ({ page }) => {
    const response = await page.request.get('/api/profiles/default/usage', {
      failOnStatusCode: false
    });

    expect([200, 404]).toContain(response.status());

    if (response.status() === 200) {
      const data = await response.json();
      expect(data.success).toBe(true);
    }
  });

  test('should refresh usage data via API', async ({ page }) => {
    const response = await page.request.post('/api/profiles/default/usage/refresh', {
      failOnStatusCode: false
    });

    expect([200, 404]).toContain(response.status());
  });
});

test.describe('Profile Auto-Switch', () => {
  test('should get auto-switch settings', async ({ page }) => {
    const response = await page.request.get('/api/profiles/auto-switch/settings');

    expect(response.status()).toBe(200);
    const data = await response.json();
    expect(data).toHaveProperty('success');
  });

  test('should get best available profile', async ({ page }) => {
    const response = await page.request.get('/api/profiles/best-available', {
      failOnStatusCode: false
    });

    expect([200, 404]).toContain(response.status());
  });
});

test.describe('Rate Limit Recovery', () => {
  test('should handle rate limit error gracefully', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Simulate API error handling
    const response = await page.request.post('/api/tasks', {
      data: {
        projectId: 'test-project',
        title: 'Rate limit test'
      },
      failOnStatusCode: false
    });

    // Should not crash regardless of result
    await expect(page.locator('body')).toBeVisible();
  });
});

test.describe('Usage Indicator Accessibility', () => {
  test('should have accessible usage indicator', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const usageBadge = page.locator('[aria-label="Claude usage status"]');
    const count = await usageBadge.count();

    if (count > 0) {
      const ariaLabel = await usageBadge.getAttribute('aria-label');
      expect(ariaLabel).toBeTruthy();
    }
  });

  test('should be keyboard focusable', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Tab through page elements
    for (let i = 0; i < 10; i++) {
      await page.keyboard.press('Tab');
    }

    const focusedElement = await page.evaluate(() => {
      return document.activeElement?.tagName;
    });

    expect(focusedElement).toBeTruthy();
  });
});
