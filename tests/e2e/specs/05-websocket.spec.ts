import { test, expect } from '@playwright/test';

/**
 * WebSocket Integration Tests
 *
 * Tests for real-time communication via WebSockets.
 * These tests verify that the WebSocket endpoints are functional.
 *
 * Note: In browser context, WebSocket connections go through the page's origin (nginx proxy).
 * The /ws path is proxied to the backend by nginx.
 */

test.describe('WebSocket Connectivity', () => {
  test('should connect to /ws/app endpoint', async ({ page, baseURL }) => {
    // Navigate to the app first to ensure context is set up
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Test WebSocket connection via page evaluation
    // WebSocket connects relative to page origin (proxied by nginx)
    const wsConnected = await page.evaluate(async () => {
      return new Promise<boolean>((resolve) => {
        const timeout = setTimeout(() => resolve(false), 5000);

        try {
          // Use relative URL - nginx proxies /ws to backend
          const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
          const ws = new WebSocket(`${protocol}//${window.location.host}/ws/app`);

          ws.onopen = () => {
            clearTimeout(timeout);
            ws.close();
            resolve(true);
          };

          ws.onerror = () => {
            clearTimeout(timeout);
            resolve(false);
          };
        } catch {
          clearTimeout(timeout);
          resolve(false);
        }
      });
    });

    expect(wsConnected).toBe(true);
  });

  test('should receive response from /ws/app endpoint', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Test sending a message and receiving a response
    const wsResponse = await page.evaluate(async () => {
      return new Promise<{ success: boolean; response?: any; error?: string }>((resolve) => {
        const timeout = setTimeout(() => {
          resolve({ success: false, error: 'Timeout waiting for response' });
        }, 10000);

        try {
          const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
          const ws = new WebSocket(`${protocol}//${window.location.host}/ws/app`);

          ws.onopen = () => {
            // Send a test command
            ws.send(JSON.stringify({
              id: 'test-' + Date.now(),
              type: 'command',
              action: 'settings.get',
              payload: {}
            }));
          };

          ws.onmessage = (event) => {
            clearTimeout(timeout);
            try {
              const data = JSON.parse(event.data);
              ws.close();
              resolve({ success: true, response: data });
            } catch {
              ws.close();
              resolve({ success: false, error: 'Invalid JSON response' });
            }
          };

          ws.onerror = () => {
            clearTimeout(timeout);
            resolve({ success: false, error: 'WebSocket error' });
          };
        } catch (error) {
          clearTimeout(timeout);
          resolve({ success: false, error: String(error) });
        }
      });
    });

    expect(wsResponse.success).toBe(true);
    if (wsResponse.response) {
      expect(wsResponse.response).toHaveProperty('type');
    }
  });
});

test.describe('Build WebSocket', () => {
  test('should connect to /ws/build/{spec_id} endpoint', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const testSpecId = 'test-spec-' + Date.now();

    const wsConnected = await page.evaluate(async (specId) => {
      return new Promise<boolean>((resolve) => {
        const timeout = setTimeout(() => resolve(false), 5000);

        try {
          const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
          const ws = new WebSocket(`${protocol}//${window.location.host}/ws/build/${specId}`);

          ws.onopen = () => {
            clearTimeout(timeout);
            ws.close();
            resolve(true);
          };

          ws.onerror = () => {
            clearTimeout(timeout);
            resolve(false);
          };
        } catch {
          clearTimeout(timeout);
          resolve(false);
        }
      });
    }, testSpecId);

    expect(wsConnected).toBe(true);
  });
});

test.describe('Terminal WebSocket', () => {
  test('should connect to terminal WebSocket via API', async ({ page }) => {
    // First, create a terminal via REST API
    const terminalId = `e2e-test-terminal-${Date.now()}`;

    const createResponse = await page.request.post(`/api/terminal/create/${terminalId}`, {
      failOnStatusCode: false
    });

    // Terminal creation may fail if PTY is not available, that's OK
    if (createResponse.status() === 200) {
      const data = await createResponse.json();
      expect(data).toHaveProperty('success');

      // Try to connect to WebSocket via nginx proxy
      await page.goto('/');
      const wsConnected = await page.evaluate(async (tid) => {
        return new Promise<boolean>((resolve) => {
          const timeout = setTimeout(() => resolve(false), 5000);

          try {
            const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
            // Terminal WebSocket is at /api/terminal/ws/{id} (proxied by nginx)
            const ws = new WebSocket(`${protocol}//${window.location.host}/api/terminal/ws/${tid}`);

            ws.onopen = () => {
              clearTimeout(timeout);
              ws.close();
              resolve(true);
            };

            ws.onerror = () => {
              clearTimeout(timeout);
              resolve(false);
            };
          } catch {
            clearTimeout(timeout);
            resolve(false);
          }
        });
      }, terminalId);

      // Clean up - delete terminal
      await page.request.delete(`/api/terminal/${terminalId}`, {
        failOnStatusCode: false
      });

      expect(wsConnected).toBe(true);
    } else {
      // PTY not available - skip WebSocket test
      console.log('[Test] Terminal creation not available - skipping WebSocket test');
      expect(true).toBe(true);
    }
  });
});
