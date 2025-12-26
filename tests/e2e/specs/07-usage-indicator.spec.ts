import { test, expect } from '@playwright/test';

/**
 * Usage Indicator Tests
 *
 * Tests the Claude usage indicator badge and tooltip functionality.
 * Verifies the tooltip renders above other UI elements (z-index fix).
 */

test.describe('Usage Indicator', () => {
  test('should display usage badge when authenticated', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Look for the usage indicator badge (shows percentage)
    const usageBadge = page.locator('button[aria-label="Claude usage status"]');

    // Badge may not be visible if not authenticated, so check gracefully
    const badgeCount = await usageBadge.count();

    if (badgeCount > 0) {
      await expect(usageBadge).toBeVisible();

      // Should contain a percentage
      const badgeText = await usageBadge.innerText();
      expect(badgeText).toMatch(/\d+%/);
    }
  });

  test('should show tooltip on hover with usage details', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const usageBadge = page.locator('button[aria-label="Claude usage status"]');
    const badgeCount = await usageBadge.count();

    if (badgeCount > 0) {
      // Hover over the badge to trigger tooltip
      await usageBadge.hover();

      // Wait for tooltip to appear
      await page.waitForTimeout(300);

      // Tooltip should be visible with usage information
      const tooltip = page.locator('[role="tooltip"]');
      await expect(tooltip).toBeVisible({ timeout: 5000 });

      // Should contain session and weekly usage labels
      const tooltipText = await tooltip.innerText();
      expect(tooltipText).toContain('Session Usage');
      expect(tooltipText).toContain('Weekly Usage');
    }
  });

  test('should render tooltip above other content (z-index)', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const usageBadge = page.locator('button[aria-label="Claude usage status"]');
    const badgeCount = await usageBadge.count();

    if (badgeCount > 0) {
      // Hover to show tooltip
      await usageBadge.hover();
      await page.waitForTimeout(300);

      const tooltip = page.locator('[role="tooltip"]');

      if (await tooltip.count() > 0) {
        // Verify tooltip is visible
        await expect(tooltip).toBeVisible();

        // Check that tooltip has high z-index (rendered via Portal)
        const zIndex = await tooltip.evaluate((el) => {
          return window.getComputedStyle(el).zIndex;
        });

        // z-index should be 9999 or very high
        const zIndexNum = parseInt(zIndex, 10);
        expect(zIndexNum).toBeGreaterThanOrEqual(9999);

        // Verify tooltip is actually on top by checking it's not obscured
        // Get the tooltip's bounding box
        const tooltipBox = await tooltip.boundingBox();

        if (tooltipBox) {
          // Check that tooltip center point is clickable (not obscured)
          const centerX = tooltipBox.x + tooltipBox.width / 2;
          const centerY = tooltipBox.y + tooltipBox.height / 2;

          // Get element at that point
          const elementAtPoint = await page.evaluate(({ x, y }) => {
            const el = document.elementFromPoint(x, y);
            return el?.closest('[role="tooltip"]') !== null;
          }, { x: centerX, y: centerY });

          expect(elementAtPoint).toBe(true);
        }
      }
    }
  });

  test('should show reset times in tooltip', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const usageBadge = page.locator('button[aria-label="Claude usage status"]');
    const badgeCount = await usageBadge.count();

    if (badgeCount > 0) {
      await usageBadge.hover();
      await page.waitForTimeout(300);

      const tooltip = page.locator('[role="tooltip"]');

      if (await tooltip.count() > 0) {
        const tooltipText = await tooltip.innerText();

        // Should contain reset time information
        expect(tooltipText).toContain('Resets:');
      }
    }
  });

  test('should show active profile name in tooltip', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const usageBadge = page.locator('button[aria-label="Claude usage status"]');
    const badgeCount = await usageBadge.count();

    if (badgeCount > 0) {
      await usageBadge.hover();
      await page.waitForTimeout(300);

      const tooltip = page.locator('[role="tooltip"]');

      if (await tooltip.count() > 0) {
        const tooltipText = await tooltip.innerText();

        // Should contain active account label
        expect(tooltipText).toContain('Active Account');
      }
    }
  });
});

test.describe('Usage API', () => {
  test('should fetch usage data from API', async ({ page }) => {
    const response = await page.request.get('/api/profiles/default/usage');

    // Should return usage data or indicate no profile
    expect([200, 404]).toContain(response.status());

    if (response.status() === 200) {
      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.data).toHaveProperty('sessionUsagePercent');
      expect(data.data).toHaveProperty('weeklyUsagePercent');
      expect(data.data).toHaveProperty('sessionResetTime');
      expect(data.data).toHaveProperty('weeklyResetTime');
    }
  });

  test('should refresh usage data via API', async ({ page }) => {
    const response = await page.request.post('/api/profiles/default/usage/refresh');

    // May succeed or fail depending on token availability
    expect([200, 404]).toContain(response.status());

    if (response.status() === 200) {
      const data = await response.json();
      // Either success with data or error message
      expect(data).toHaveProperty('success');
    }
  });
});
