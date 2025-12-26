/**
 * WebSocket Testing Utilities
 * Provides helpers for testing WebSocket-based features
 */

import { Page } from '@playwright/test';

/**
 * WebSocket message interceptor
 */
export class WebSocketInterceptor {
  private messages: any[] = [];
  private listeners: Map<string, ((data: any) => void)[]> = new Map();

  constructor(private page: Page) {}

  /**
   * Start intercepting WebSocket messages
   */
  async start() {
    await this.page.addInitScript(() => {
      const originalWebSocket = window.WebSocket;

      (window as any).__wsMessages = [];
      (window as any).__wsListeners = {};

      window.WebSocket = class extends originalWebSocket {
        constructor(url: string | URL, protocols?: string | string[]) {
          super(url, protocols);

          this.addEventListener('message', (event) => {
            try {
              const data = JSON.parse(event.data);
              (window as any).__wsMessages.push({
                type: 'received',
                data,
                timestamp: Date.now()
              });

              // Notify listeners
              const eventType = data.type || data.event;
              if (eventType && (window as any).__wsListeners[eventType]) {
                (window as any).__wsListeners[eventType].forEach((cb: Function) => cb(data));
              }
            } catch (e) {
              // Non-JSON message
              (window as any).__wsMessages.push({
                type: 'received',
                data: event.data,
                timestamp: Date.now()
              });
            }
          });

          const originalSend = this.send.bind(this);
          this.send = (data: any) => {
            try {
              const parsed = JSON.parse(data);
              (window as any).__wsMessages.push({
                type: 'sent',
                data: parsed,
                timestamp: Date.now()
              });
            } catch (e) {
              (window as any).__wsMessages.push({
                type: 'sent',
                data,
                timestamp: Date.now()
              });
            }
            originalSend(data);
          };
        }
      };
    });
  }

  /**
   * Get all captured messages
   */
  async getMessages(): Promise<any[]> {
    return await this.page.evaluate(() => (window as any).__wsMessages || []);
  }

  /**
   * Get messages matching a pattern
   */
  async getMessagesByType(type: string): Promise<any[]> {
    const messages = await this.getMessages();
    return messages.filter(m => {
      if (typeof m.data === 'object') {
        return m.data.type === type || m.data.event === type || m.data.action === type;
      }
      return false;
    });
  }

  /**
   * Get sent messages only
   */
  async getSentMessages(): Promise<any[]> {
    const messages = await this.getMessages();
    return messages.filter(m => m.type === 'sent');
  }

  /**
   * Get received messages only
   */
  async getReceivedMessages(): Promise<any[]> {
    const messages = await this.getMessages();
    return messages.filter(m => m.type === 'received');
  }

  /**
   * Clear captured messages
   */
  async clear() {
    await this.page.evaluate(() => {
      (window as any).__wsMessages = [];
    });
  }

  /**
   * Wait for a specific message type
   */
  async waitForMessage(type: string, timeout = 10000): Promise<any> {
    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      const messages = await this.getMessagesByType(type);
      if (messages.length > 0) {
        return messages[messages.length - 1];
      }
      await this.page.waitForTimeout(100);
    }

    throw new Error(`Timeout waiting for WebSocket message of type: ${type}`);
  }

  /**
   * Wait for a streaming response to complete
   */
  async waitForStreamComplete(eventPrefix: string, timeout = 60000): Promise<any[]> {
    const startTime = Date.now();
    const chunks: any[] = [];

    while (Date.now() - startTime < timeout) {
      const messages = await this.getReceivedMessages();

      for (const msg of messages) {
        if (typeof msg.data === 'object') {
          const event = msg.data.event || msg.data.type;
          if (event && event.startsWith(eventPrefix)) {
            chunks.push(msg.data);

            // Check for completion
            if (event.includes('.complete') || event.includes('.done') || event.includes('.error')) {
              return chunks;
            }
          }
        }
      }

      await this.page.waitForTimeout(100);
    }

    return chunks;
  }
}

/**
 * Mock WebSocket responses
 */
export class WebSocketMocker {
  constructor(private page: Page) {}

  /**
   * Mock a WebSocket command response
   */
  async mockResponse(action: string, response: any) {
    await this.page.addInitScript(`
      (function() {
        const mocks = window.__wsMocks || {};
        mocks['${action}'] = ${JSON.stringify(response)};
        window.__wsMocks = mocks;
      })();
    `);

    await this.page.addInitScript(() => {
      const originalWebSocket = window.WebSocket;

      window.WebSocket = class extends originalWebSocket {
        constructor(url: string | URL, protocols?: string | string[]) {
          super(url, protocols);

          const originalSend = this.send.bind(this);
          this.send = (data: any) => {
            try {
              const parsed = JSON.parse(data);
              const mocks = (window as any).__wsMocks || {};

              if (parsed.action && mocks[parsed.action]) {
                // Delay slightly to simulate network
                setTimeout(() => {
                  const event = new MessageEvent('message', {
                    data: JSON.stringify({
                      id: parsed.id,
                      type: 'response',
                      success: true,
                      data: mocks[parsed.action]
                    })
                  });
                  this.dispatchEvent(event);
                }, 50);
              } else {
                originalSend(data);
              }
            } catch (e) {
              originalSend(data);
            }
          };
        }
      };
    });
  }

  /**
   * Mock a streaming response
   */
  async mockStreamingResponse(action: string, chunks: any[], projectId: string) {
    const eventPrefix = action.split('.')[0];

    await this.page.addInitScript(`
      (function() {
        const streamMocks = window.__wsStreamMocks || {};
        streamMocks['${action}'] = {
          chunks: ${JSON.stringify(chunks)},
          projectId: '${projectId}',
          eventPrefix: '${eventPrefix}'
        };
        window.__wsStreamMocks = streamMocks;
      })();
    `);

    await this.page.addInitScript(() => {
      const originalWebSocket = window.WebSocket;

      window.WebSocket = class extends originalWebSocket {
        constructor(url: string | URL, protocols?: string | string[]) {
          super(url, protocols);

          const originalSend = this.send.bind(this);
          this.send = (data: any) => {
            try {
              const parsed = JSON.parse(data);
              const streamMocks = (window as any).__wsStreamMocks || {};

              if (parsed.action && streamMocks[parsed.action]) {
                const mock = streamMocks[parsed.action];

                // Send chunks with delay
                mock.chunks.forEach((chunk: any, index: number) => {
                  setTimeout(() => {
                    const event = new MessageEvent('message', {
                      data: JSON.stringify({
                        type: 'event',
                        event: `${mock.eventPrefix}.${mock.projectId}.chunk`,
                        data: chunk
                      })
                    });
                    this.dispatchEvent(event);

                    // Send complete after last chunk
                    if (index === mock.chunks.length - 1) {
                      setTimeout(() => {
                        const completeEvent = new MessageEvent('message', {
                          data: JSON.stringify({
                            type: 'event',
                            event: `${mock.eventPrefix}.${mock.projectId}.complete`,
                            data: { success: true }
                          })
                        });
                        this.dispatchEvent(completeEvent);
                      }, 50);
                    }
                  }, index * 100);
                });

                // Send initial response
                setTimeout(() => {
                  const responseEvent = new MessageEvent('message', {
                    data: JSON.stringify({
                      id: parsed.id,
                      type: 'response',
                      success: true,
                      data: { started: true }
                    })
                  });
                  this.dispatchEvent(responseEvent);
                }, 10);
              } else {
                originalSend(data);
              }
            } catch (e) {
              originalSend(data);
            }
          };
        }
      };
    });
  }
}

/**
 * Helper to test WebSocket connectivity
 */
export async function testWebSocketConnection(page: Page, wsPath: string = '/ws/app'): Promise<{
  connected: boolean;
  latency?: number;
  error?: string;
}> {
  return await page.evaluate(async (path) => {
    return new Promise<{ connected: boolean; latency?: number; error?: string }>((resolve) => {
      const timeout = setTimeout(() => {
        resolve({ connected: false, error: 'Connection timeout' });
      }, 5000);

      try {
        const startTime = Date.now();
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const ws = new WebSocket(`${protocol}//${window.location.host}${path}`);

        ws.onopen = () => {
          clearTimeout(timeout);
          const latency = Date.now() - startTime;
          ws.close();
          resolve({ connected: true, latency });
        };

        ws.onerror = () => {
          clearTimeout(timeout);
          resolve({ connected: false, error: 'WebSocket error' });
        };
      } catch (error) {
        clearTimeout(timeout);
        resolve({ connected: false, error: String(error) });
      }
    });
  }, wsPath);
}

/**
 * Helper to send a WebSocket command and wait for response
 */
export async function sendWebSocketCommand(
  page: Page,
  action: string,
  payload: any,
  timeout = 10000
): Promise<any> {
  return await page.evaluate(async ({ action, payload, timeout }) => {
    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new Error(`Timeout waiting for response to ${action}`));
      }, timeout);

      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const ws = new WebSocket(`${protocol}//${window.location.host}/ws/app`);

      const messageId = `test-${Date.now()}-${Math.random().toString(36).substring(7)}`;

      ws.onopen = () => {
        ws.send(JSON.stringify({
          id: messageId,
          type: 'command',
          action,
          payload
        }));
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.id === messageId) {
            clearTimeout(timeoutId);
            ws.close();
            resolve(data);
          }
        } catch (e) {
          // Ignore non-JSON messages
        }
      };

      ws.onerror = () => {
        clearTimeout(timeoutId);
        reject(new Error('WebSocket error'));
      };
    });
  }, { action, payload, timeout });
}

// Export utilities
export const WebSocketUtils = {
  WebSocketInterceptor,
  WebSocketMocker,
  testWebSocketConnection,
  sendWebSocketCommand
};
