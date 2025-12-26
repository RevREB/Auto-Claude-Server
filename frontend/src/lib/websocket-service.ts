/**
 * Unified WebSocket service for all frontend-backend communication.
 * Replaces REST API calls with WebSocket commands.
 *
 * Protocol:
 * - Request:  {"id": "uuid", "type": "command", "action": "namespace.method", "payload": {...}}
 * - Response: {"id": "uuid", "type": "response", "success": true/false, "data": {...}, "error": "..."}
 * - Event:    {"type": "event", "event": "namespace.eventName", "data": {...}}
 */

import { WS_URL } from './url-utils';

type EventHandler = (data: any) => void;
type ResponseHandler = { resolve: (data: any) => void; reject: (error: Error) => void };

class WebSocketService {
  private ws: WebSocket | null = null;
  private url: string;
  private pendingRequests: Map<string, ResponseHandler> = new Map();
  private eventHandlers: Map<string, Set<EventHandler>> = new Map();
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 10;
  private reconnectDelay = 1000;
  private isConnecting = false;
  private connectionPromise: Promise<void> | null = null;
  private messageQueue: Array<{ message: string; resolve: () => void }> = [];
  private reconnectCallbacks: Set<() => void> = new Set();
  private wasConnected = false;

  constructor() {
    this.url = `${WS_URL}/ws/app`;
  }

  /**
   * Register a callback to be called when WebSocket reconnects.
   * Useful for re-fetching state after connection loss.
   */
  onReconnect(callback: () => void): () => void {
    this.reconnectCallbacks.add(callback);
    return () => this.reconnectCallbacks.delete(callback);
  }

  /**
   * Connect to the WebSocket server.
   */
  async connect(): Promise<void> {
    if (this.ws?.readyState === WebSocket.OPEN) {
      return;
    }

    if (this.isConnecting && this.connectionPromise) {
      return this.connectionPromise;
    }

    this.isConnecting = true;
    this.connectionPromise = new Promise((resolve, reject) => {
      console.log('[WS] Connecting to:', this.url);

      this.ws = new WebSocket(this.url);

      this.ws.onopen = () => {
        const isReconnect = this.wasConnected;
        console.log('[WS] Connected', isReconnect ? '(reconnect)' : '(initial)');
        this.isConnecting = false;
        this.wasConnected = true;
        this.reconnectAttempts = 0;

        // Re-send all subscriptions to server
        this.eventHandlers.forEach((_, event) => {
          if (event !== '*' && this.ws?.readyState === WebSocket.OPEN) {
            console.log('[WS] Re-subscribing to:', event);
            this.ws.send(JSON.stringify({
              type: 'subscribe',
              event,
            }));
          }
        });

        // Process queued messages
        while (this.messageQueue.length > 0) {
          const item = this.messageQueue.shift();
          if (item && this.ws?.readyState === WebSocket.OPEN) {
            this.ws.send(item.message);
            item.resolve();
          }
        }

        // Trigger reconnect callbacks to refetch state
        if (isReconnect) {
          console.log('[WS] Triggering reconnect callbacks');
          this.reconnectCallbacks.forEach((cb) => {
            try {
              cb();
            } catch (err) {
              console.error('[WS] Reconnect callback error:', err);
            }
          });
        }

        resolve();
      };

      this.ws.onclose = (event) => {
        console.log('[WS] Disconnected:', event.code, event.reason);
        this.isConnecting = false;
        this.ws = null;

        // Reject pending requests
        this.pendingRequests.forEach((handler, id) => {
          handler.reject(new Error('WebSocket disconnected'));
        });
        this.pendingRequests.clear();

        // Attempt reconnection
        if (this.reconnectAttempts < this.maxReconnectAttempts) {
          this.reconnectAttempts++;
          const delay = this.reconnectDelay * Math.min(this.reconnectAttempts, 5);
          console.log(`[WS] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`);
          setTimeout(() => this.connect(), delay);
        }
      };

      this.ws.onerror = (error) => {
        console.error('[WS] Error:', error);
        this.isConnecting = false;
        reject(error);
      };

      this.ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          this.handleMessage(message);
        } catch (err) {
          console.error('[WS] Failed to parse message:', err);
        }
      };
    });

    return this.connectionPromise;
  }

  /**
   * Handle incoming WebSocket messages.
   */
  private handleMessage(message: any): void {
    if (message.type === 'response') {
      // Handle command response
      const handler = this.pendingRequests.get(message.id);
      if (handler) {
        this.pendingRequests.delete(message.id);
        if (message.success) {
          handler.resolve(message.data);
        } else {
          handler.reject(new Error(message.error || 'Request failed'));
        }
      }
    } else if (message.type === 'event') {
      // Handle event broadcast
      const handlers = this.eventHandlers.get(message.event);
      if (handlers) {
        handlers.forEach((handler) => {
          try {
            handler(message.data);
          } catch (err) {
            console.error(`[WS] Event handler error for ${message.event}:`, err);
          }
        });
      }

      // Also notify wildcard handlers
      const wildcardHandlers = this.eventHandlers.get('*');
      if (wildcardHandlers) {
        wildcardHandlers.forEach((handler) => {
          try {
            handler({ event: message.event, data: message.data });
          } catch (err) {
            console.error('[WS] Wildcard handler error:', err);
          }
        });
      }
    }
  }

  /**
   * Send a command to the backend.
   */
  async send<T = any>(action: string, payload: Record<string, any> = {}): Promise<T> {
    await this.connect();

    const id = crypto.randomUUID();
    const message = JSON.stringify({
      id,
      type: 'command',
      action,
      payload,
    });

    return new Promise((resolve, reject) => {
      // Set up timeout
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(new Error(`Request timeout: ${action}`));
      }, 30000);

      this.pendingRequests.set(id, {
        resolve: (data: T) => {
          clearTimeout(timeout);
          resolve(data);
        },
        reject: (error: Error) => {
          clearTimeout(timeout);
          reject(error);
        },
      });

      if (this.ws?.readyState === WebSocket.OPEN) {
        this.ws.send(message);
      } else {
        // Queue message for when connection is established
        this.messageQueue.push({
          message,
          resolve: () => {},
        });
      }
    });
  }

  /**
   * Subscribe to an event type.
   */
  on(event: string, handler: EventHandler): () => void {
    const isNewSubscription = !this.eventHandlers.has(event);
    if (isNewSubscription) {
      this.eventHandlers.set(event, new Set());
    }
    this.eventHandlers.get(event)!.add(handler);

    // Subscribe on server if connected, or connect and it will subscribe on open
    if (this.ws?.readyState === WebSocket.OPEN) {
      if (isNewSubscription) {
        console.log('[WS] Subscribing to:', event);
        this.ws.send(JSON.stringify({
          type: 'subscribe',
          event,
        }));
      }
    } else {
      // Trigger connection - subscriptions will be sent on open
      this.connect();
    }

    // Return unsubscribe function
    return () => {
      this.eventHandlers.get(event)?.delete(handler);
      if (this.eventHandlers.get(event)?.size === 0) {
        this.eventHandlers.delete(event);
        if (this.ws?.readyState === WebSocket.OPEN) {
          this.ws.send(JSON.stringify({
            type: 'unsubscribe',
            event,
          }));
        }
      }
    };
  }

  /**
   * Subscribe to an event type once.
   */
  once(event: string, handler: EventHandler): () => void {
    const wrappedHandler = (data: any) => {
      unsubscribe();
      handler(data);
    };
    const unsubscribe = this.on(event, wrappedHandler);
    return unsubscribe;
  }

  /**
   * Disconnect from the WebSocket server.
   */
  disconnect(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  /**
   * Check if connected.
   */
  get isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }
}

// Singleton instance
export const wsService = new WebSocketService();

// ============================================================================
// API Methods - Drop-in replacements for REST calls
// ============================================================================

export const wsApi = {
  // =========================================================================
  // TASKS
  // =========================================================================
  tasks: {
    list: (projectId: string) =>
      wsService.send('tasks.list', { projectId }),

    create: (projectId: string, title: string, description: string) =>
      wsService.send('tasks.create', { projectId, title, description }),

    update: (taskId: string, updates: { title?: string; description?: string }) =>
      wsService.send('tasks.update', { taskId, ...updates }),

    delete: (taskId: string) =>
      wsService.send('tasks.delete', { taskId }),

    start: (taskId: string) =>
      wsService.send('tasks.start', { taskId }),

    stop: (taskId: string) =>
      wsService.send('tasks.stop', { taskId }),

    getLogs: (projectId: string, specId: string) =>
      wsService.send('tasks.getLogs', { projectId, specId }),

    checkRunning: (taskId: string) =>
      wsService.send<{ running: boolean }>('tasks.checkRunning', { taskId }),

    review: (taskId: string, approved: boolean, feedback?: string) =>
      wsService.send('tasks.review', { taskId, approved, feedback }),

    recover: (taskId: string, options?: { targetStatus?: string; autoRestart?: boolean }) =>
      wsService.send('tasks.recover', { taskId, ...options }),

    archive: (taskIds: string[]) =>
      wsService.send('tasks.archive', { taskIds }),

    unarchive: (taskIds: string[]) =>
      wsService.send('tasks.unarchive', { taskIds }),

    updateStatus: (taskId: string, status: string) =>
      wsService.send('tasks.updateStatus', { taskId, status }),
  },

  // =========================================================================
  // PROJECTS
  // =========================================================================
  projects: {
    list: () =>
      wsService.send('projects.list', {}),

    create: (path: string, settings?: Record<string, any>) =>
      wsService.send('projects.create', { path, settings }),

    delete: (projectId: string) =>
      wsService.send('projects.delete', { projectId }),

    getDirectory: (projectId: string, path?: string) =>
      wsService.send('projects.getDirectory', { projectId, path }),

    updateSettings: (projectId: string, settings: Record<string, any>) =>
      wsService.send('projects.updateSettings', { projectId, settings }),

    initialize: (projectId: string) =>
      wsService.send('projects.initialize', { projectId }),

    getTabState: () =>
      wsService.send('projects.getTabState', {}),

    saveTabState: (state: { openProjectIds: string[]; activeProjectId: string | null; tabOrder: string[] }) =>
      wsService.send('projects.saveTabState', state),

    createFolder: (location: string, name: string, initGit?: boolean) =>
      wsService.send('projects.createFolder', { location, name, initGit }),

    getDefaultLocation: () =>
      wsService.send('projects.getDefaultLocation', {}),

    getVersion: (projectId: string) =>
      wsService.send('projects.getVersion', { projectId }),

    updateAutoBuild: (projectId: string) =>
      wsService.send('projects.updateAutoBuild', { projectId }),
  },

  // =========================================================================
  // SETTINGS
  // =========================================================================
  settings: {
    get: () =>
      wsService.send('settings.get', {}),

    update: (settings: Record<string, any>) =>
      wsService.send('settings.update', settings),
  },

  // =========================================================================
  // GIT
  // =========================================================================
  git: {
    status: (projectId: string) =>
      wsService.send('git.status', { projectId }),

    branches: (projectId: string) =>
      wsService.send('git.branches', { projectId }),

    currentBranch: (projectId: string) =>
      wsService.send('git.currentBranch', { projectId }),

    mainBranch: (projectId: string) =>
      wsService.send('git.mainBranch', { projectId }),

    initialize: (projectId: string) =>
      wsService.send('git.initialize', { projectId }),

    skipSetup: (projectId: string) =>
      wsService.send('git.skipSetup', { projectId }),

    clone: (url: string, name?: string, targetDir?: string) =>
      wsService.send('git.clone', { url, name, targetDir }),
  },

  // =========================================================================
  // PROFILES
  // =========================================================================
  profiles: {
    list: () =>
      wsService.send('profiles.list', {}),

    create: (profile: Record<string, any>) =>
      wsService.send('profiles.create', profile),

    delete: (profileId: string) =>
      wsService.send('profiles.delete', { profileId }),

    activate: (profileId: string) =>
      wsService.send('profiles.activate', { profileId }),

    setToken: (profileId: string, token: string, email?: string) =>
      wsService.send('profiles.setToken', { profileId, token, email }),

    getUsage: (profileId: string) =>
      wsService.send('profiles.getUsage', { profileId }),

    refreshUsage: (profileId: string) =>
      wsService.send('profiles.refreshUsage', { profileId }),

    getAutoSwitchSettings: () =>
      wsService.send('profiles.getAutoSwitchSettings', {}),

    updateAutoSwitchSettings: (settings: Record<string, any>) =>
      wsService.send('profiles.updateAutoSwitchSettings', settings),
  },

  // =========================================================================
  // OAUTH
  // =========================================================================
  oauth: {
    initiate: (profileId: string) =>
      wsService.send('oauth.initiate', { profileId }),

    status: (profileId: string) =>
      wsService.send('oauth.status', { profileId }),
  },

  // =========================================================================
  // GITHUB
  // =========================================================================
  github: {
    authStatus: () =>
      wsService.send('github.authStatus', {}),

    login: (token: string) =>
      wsService.send('github.login', { token }),

    logout: () =>
      wsService.send('github.logout', {}),
  },

  // =========================================================================
  // WORKSPACE (Worktrees)
  // =========================================================================
  workspace: {
    getStatus: (taskId: string) =>
      wsService.send('workspace.getStatus', { taskId }),

    getDiff: (taskId: string) =>
      wsService.send('workspace.getDiff', { taskId }),

    merge: (taskId: string, options?: { noCommit?: boolean }) => {
      console.warn('[wsApi.workspace.merge] Called with:', { taskId, options });
      return wsService.send('workspace.merge', { taskId, ...options });
    },

    mergePreview: (taskId: string) =>
      wsService.send('workspace.mergePreview', { taskId }),

    discard: (taskId: string) =>
      wsService.send('workspace.discard', { taskId }),

    list: (projectId: string) =>
      wsService.send('workspace.list', { projectId }),
  },

  // =========================================================================
  // BRANCH MODEL
  // =========================================================================
  branchModel: {
    detect: (projectId: string) =>
      wsService.send('branchModel.detect', { projectId }),

    status: (projectId: string) =>
      wsService.send('branchModel.status', { projectId }),

    migratePreview: (projectId: string) =>
      wsService.send('branchModel.migratePreview', { projectId }),

    migrate: (projectId: string) =>
      wsService.send('branchModel.migrate', { projectId }),

    validate: (projectId: string, branchName: string) =>
      wsService.send('branchModel.validate', { projectId, branchName }),

    hierarchy: (projectId: string) =>
      wsService.send('branchModel.hierarchy', { projectId }),

    createFeature: (projectId: string, taskId: string, baseBranch?: string) =>
      wsService.send('branchModel.createFeature', { projectId, taskId, baseBranch }),

    createSubtask: (projectId: string, taskId: string, subtaskId: string) =>
      wsService.send('branchModel.createSubtask', { projectId, taskId, subtaskId }),

    createRelease: (projectId: string, version: string, baseBranch?: string) =>
      wsService.send('branchModel.createRelease', { projectId, version, baseBranch }),

    createHotfix: (projectId: string, name: string, tag: string) =>
      wsService.send('branchModel.createHotfix', { projectId, name, tag }),
  },
};

// Export types
export type WsApi = typeof wsApi;
