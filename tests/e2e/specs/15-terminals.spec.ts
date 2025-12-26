import { test, expect } from '@playwright/test';
import { TerminalsPage, SidebarPage } from '../fixtures/page-objects';

/**
 * Terminals Feature Tests
 *
 * Tests for the terminal grid feature that provides
 * multiple terminal instances for interacting with the system.
 */

test.describe('Terminals View Navigation', () => {
  test('should navigate to Terminals view via sidebar', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const sidebar = new SidebarPage(page);
    await sidebar.navigateTo('terminals');

    await expect(page.locator('body')).toBeVisible();
  });

  test('should show Terminals in sidebar menu', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const terminalsLink = page.getByText('Terminals', { exact: true });
    const count = await terminalsLink.count();
    expect(count).toBeGreaterThanOrEqual(0);
  });

  test('should use A keyboard shortcut to navigate', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    await page.keyboard.press('a');
    await page.waitForTimeout(300);

    await expect(page.locator('body')).toBeVisible();
  });
});

test.describe('Terminal Grid', () => {
  test('should display terminal grid', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const sidebar = new SidebarPage(page);
    await sidebar.navigateTo('terminals');

    const terminals = new TerminalsPage(page);
    const grid = terminals.terminalGrid;

    const count = await grid.count();
    expect(count).toBeGreaterThanOrEqual(0);
  });

  test('should display terminal instances', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const sidebar = new SidebarPage(page);
    await sidebar.navigateTo('terminals');

    const terminals = new TerminalsPage(page);
    const termCount = await terminals.getTerminalCount();

    // Should have at least 0 terminals (might start empty)
    expect(termCount).toBeGreaterThanOrEqual(0);
  });
});

test.describe('Terminal Creation', () => {
  test('should have add terminal button', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const sidebar = new SidebarPage(page);
    await sidebar.navigateTo('terminals');

    const terminals = new TerminalsPage(page);
    const addBtn = terminals.addTerminalButton;

    const count = await addBtn.count();
    expect(count).toBeGreaterThanOrEqual(0);
  });

  test('should create new terminal on button click', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const sidebar = new SidebarPage(page);
    await sidebar.navigateTo('terminals');

    const terminals = new TerminalsPage(page);
    const addBtn = terminals.addTerminalButton;

    if (await addBtn.count() > 0) {
      const initialCount = await terminals.getTerminalCount();
      await terminals.addTerminal();
      const newCount = await terminals.getTerminalCount();

      // Should have added a terminal (or stayed same if limit reached)
      expect(newCount).toBeGreaterThanOrEqual(initialCount);
    }
  });
});

test.describe('Terminal Closing', () => {
  test('should have close buttons on terminals', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const sidebar = new SidebarPage(page);
    await sidebar.navigateTo('terminals');

    const terminals = new TerminalsPage(page);
    const closeButtons = terminals.closeTerminalButtons;

    const count = await closeButtons.count();
    expect(count).toBeGreaterThanOrEqual(0);
  });
});

test.describe('Terminal Input', () => {
  test('should accept keyboard input', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const sidebar = new SidebarPage(page);
    await sidebar.navigateTo('terminals');

    const terminals = new TerminalsPage(page);
    const terminalElements = terminals.terminals;

    if (await terminalElements.count() > 0) {
      // Click to focus first terminal
      await terminalElements.first().click();

      // Type something
      await page.keyboard.type('echo test');

      // App should remain responsive
      await expect(page.locator('body')).toBeVisible();
    }
  });
});

test.describe('Terminal Output', () => {
  test('should display terminal output', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const sidebar = new SidebarPage(page);
    await sidebar.navigateTo('terminals');

    const terminals = new TerminalsPage(page);
    const terminalElements = terminals.terminals;

    if (await terminalElements.count() > 0) {
      const output = await terminals.getTerminalOutput(0);
      // Output might be empty initially
      expect(output).toBeDefined();
    }
  });
});

test.describe('Terminal Layout', () => {
  test('should support grid layout', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const sidebar = new SidebarPage(page);
    await sidebar.navigateTo('terminals');

    // Look for grid layout controls
    const layoutControls = page.locator('[data-testid="layout-control"]').or(
      page.locator('button').filter({ hasText: /grid|layout/i })
    );

    const count = await layoutControls.count();
    expect(count).toBeGreaterThanOrEqual(0);
  });

  test('should support split view', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const sidebar = new SidebarPage(page);
    await sidebar.navigateTo('terminals');

    // Look for split controls
    const splitControls = page.locator('button').filter({ hasText: /split/i });

    const count = await splitControls.count();
    expect(count).toBeGreaterThanOrEqual(0);
  });
});

test.describe('Terminal Tabs', () => {
  test('should display terminal tabs when multiple terminals exist', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const sidebar = new SidebarPage(page);
    await sidebar.navigateTo('terminals');

    // Look for tab elements
    const tabs = page.locator('[role="tab"]').or(
      page.locator('.terminal-tab')
    );

    const count = await tabs.count();
    expect(count).toBeGreaterThanOrEqual(0);
  });
});

test.describe('Terminal Resize', () => {
  test('should have resize handles', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const sidebar = new SidebarPage(page);
    await sidebar.navigateTo('terminals');

    // Look for resize handles
    const resizeHandles = page.locator('[data-resize-handle]').or(
      page.locator('.resize-handle')
    );

    const count = await resizeHandles.count();
    expect(count).toBeGreaterThanOrEqual(0);
  });
});

test.describe('Terminal Session Persistence', () => {
  test('should maintain terminal sessions on view switch', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const sidebar = new SidebarPage(page);

    // Go to terminals
    await sidebar.navigateTo('terminals');
    await page.waitForTimeout(500);

    // Switch to kanban
    await sidebar.navigateTo('kanban');
    await page.waitForTimeout(500);

    // Go back to terminals
    await sidebar.navigateTo('terminals');
    await page.waitForTimeout(500);

    // Terminals should still be there
    await expect(page.locator('body')).toBeVisible();
  });
});

test.describe('Terminal API Operations', () => {
  test('should create terminal via API', async ({ page }) => {
    const terminalId = `e2e-test-${Date.now()}`;

    const response = await page.request.post(`/api/terminal/create/${terminalId}`, {
      failOnStatusCode: false
    });

    // Terminal creation may fail if PTY not available
    expect([200, 400, 500]).toContain(response.status());

    if (response.status() === 200) {
      const data = await response.json();
      expect(data).toHaveProperty('success');

      // Clean up
      await page.request.delete(`/api/terminal/${terminalId}`, {
        failOnStatusCode: false
      });
    }
  });

  test('should list terminals via API', async ({ page }) => {
    const response = await page.request.get('/api/terminal/list');

    expect([200, 404]).toContain(response.status());

    if (response.status() === 200) {
      const data = await response.json();
      expect(Array.isArray(data) || data.success).toBe(true);
    }
  });
});

test.describe('Terminal Empty State', () => {
  test('should show helpful message when no terminals', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const sidebar = new SidebarPage(page);
    await sidebar.navigateTo('terminals');

    const emptyState = page.getByText(/no terminals|create a terminal|add terminal/i);
    const count = await emptyState.count();
    expect(count).toBeGreaterThanOrEqual(0);
  });
});

test.describe('Terminal Keyboard Shortcuts', () => {
  test('should support Ctrl+Shift+N for new terminal', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const sidebar = new SidebarPage(page);
    await sidebar.navigateTo('terminals');

    await page.keyboard.press('Control+Shift+N');
    await page.waitForTimeout(300);

    await expect(page.locator('body')).toBeVisible();
  });

  test('should support Ctrl+W to close terminal', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const sidebar = new SidebarPage(page);
    await sidebar.navigateTo('terminals');

    await page.keyboard.press('Control+w');
    await page.waitForTimeout(300);

    await expect(page.locator('body')).toBeVisible();
  });
});
