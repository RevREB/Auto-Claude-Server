/**
 * API Client for Auto-Claude Web App
 * Replaces Electron IPC with REST/WebSocket calls
 */

import { API_URL, WS_URL } from '../lib/url-utils';

// ============================================================================
// REST API Client
// ============================================================================

class APIClient {
  private baseURL: string;

  constructor(baseURL: string = API_URL) {
    this.baseURL = baseURL;
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const url = `${this.baseURL}${endpoint}`;
    
    const response = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });

    if (!response.ok) {
      throw new Error(`API Error: ${response.statusText}`);
    }

    return response.json();
  }

  // Projects
  async getProjects() {
    return this.request('/api/projects');
  }

  async createProject(project: any) {
    return this.request('/api/projects', {
      method: 'POST',
      body: JSON.stringify(project),
    });
  }

  async getProject(projectId: string) {
    return this.request(`/api/projects/${projectId}`);
  }

  // Tasks
  async getTasks(projectId: string) {
    return this.request(`/api/projects/${projectId}/tasks`);
  }

  async createTask(task: any) {
    return this.request('/api/tasks', {
      method: 'POST',
      body: JSON.stringify(task),
    });
  }

  async getTask(specId: string) {
    return this.request(`/api/tasks/${specId}`);
  }

  async updateTask(specId: string, updates: any) {
    return this.request(`/api/tasks/${specId}`, {
      method: 'PATCH',
      body: JSON.stringify(updates),
    });
  }

  // Build Management
  async startBuild(buildRequest: any) {
    return this.request('/api/build/start', {
      method: 'POST',
      body: JSON.stringify(buildRequest),
    });
  }

  async stopBuild(specId: string) {
    return this.request(`/api/build/${specId}/stop`, {
      method: 'POST',
    });
  }

  async getBuildStatus(specId: string) {
    return this.request(`/api/build/${specId}/status`);
  }

  // Spec Creation
  async createSpec(projectPath: string, description: string) {
    return this.request('/api/spec/create', {
      method: 'POST',
      body: JSON.stringify({ project_path: projectPath, description }),
    });
  }

  // File System
  async getProjectFiles(projectId: string) {
    return this.request(`/api/files/${projectId}`);
  }

  async getProjectContext(projectId: string) {
    return this.request(`/api/context/${projectId}`);
  }
}

// ============================================================================
// WebSocket Manager
// ============================================================================

type MessageHandler = (data: any) => void;

class WebSocketManager {
  private ws: WebSocket | null = null;
  private handlers: Map<string, MessageHandler[]> = new Map();
  private reconnectInterval: number = 5000;
  private reconnectTimer: NodeJS.Timeout | null = null;

  connect(endpoint: string) {
    const url = `${WS_URL}${endpoint}`;
    
    this.ws = new WebSocket(url);

    this.ws.onopen = () => {
      console.log(`WebSocket connected: ${endpoint}`);
      if (this.reconnectTimer) {
        clearTimeout(this.reconnectTimer);
        this.reconnectTimer = null;
      }
    };

    this.ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        this.handleMessage(data);
      } catch (err) {
        console.error('Failed to parse WebSocket message:', err);
      }
    };

    this.ws.onerror = (error) => {
      console.error('WebSocket error:', error);
    };

    this.ws.onclose = () => {
      console.log('WebSocket closed, attempting reconnect...');
      this.reconnectTimer = setTimeout(() => {
        this.connect(endpoint);
      }, this.reconnectInterval);
    };
  }

  private handleMessage(data: any) {
    const type = data.type;
    const handlers = this.handlers.get(type) || [];
    handlers.forEach(handler => handler(data));
  }

  on(type: string, handler: MessageHandler) {
    if (!this.handlers.has(type)) {
      this.handlers.set(type, []);
    }
    this.handlers.get(type)!.push(handler);
  }

  off(type: string, handler: MessageHandler) {
    const handlers = this.handlers.get(type) || [];
    const index = handlers.indexOf(handler);
    if (index > -1) {
      handlers.splice(index, 1);
    }
  }

  send(data: any) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
    } else {
      console.error('WebSocket not connected');
    }
  }

  disconnect() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }
}

// ============================================================================
// Build Progress WebSocket
// ============================================================================

export class BuildProgressMonitor {
  private wsManager: WebSocketManager;
  private specId: string;

  constructor(specId: string) {
    this.specId = specId;
    this.wsManager = new WebSocketManager();
  }

  start(
    onOutput: (output: string) => void,
    onComplete: (exitCode: number) => void
  ) {
    this.wsManager.connect(`/ws/build/${this.specId}`);

    this.wsManager.on('build_output', (data) => {
      onOutput(data.output);
    });

    this.wsManager.on('build_complete', (data) => {
      onComplete(data.exit_code);
      this.stop();
    });
  }

  stop() {
    this.wsManager.disconnect();
  }
}

// ============================================================================
// Terminal WebSocket
// ============================================================================

export class TerminalSession {
  private wsManager: WebSocketManager;
  private sessionId: string;

  constructor(sessionId: string) {
    this.sessionId = sessionId;
    this.wsManager = new WebSocketManager();
  }

  start(onData: (data: string) => void) {
    this.wsManager.connect(`/ws/terminal/${this.sessionId}`);

    this.wsManager.on('output', (data) => {
      onData(data.content);
    });
  }

  sendInput(input: string) {
    this.wsManager.send({
      type: 'input',
      content: input,
    });
  }

  stop() {
    this.wsManager.disconnect();
  }
}

// ============================================================================
// Migration Helper: Electron IPC -> Web API
// ============================================================================

/**
 * Adapter to maintain compatibility with existing Electron IPC code
 * 
 * Old code:
 *   window.electron.ipcRenderer.send('start-build', data)
 * 
 * New code (using this adapter):
 *   window.api.startBuild(data)
 */
export class ElectronCompatibilityAdapter {
  private api: APIClient;

  constructor() {
    this.api = new APIClient();
  }

  // Simulate Electron IPC for existing code
  async send(channel: string, ...args: any[]) {
    switch (channel) {
      case 'start-build':
        return this.api.startBuild(args[0]);
      
      case 'stop-build':
        return this.api.stopBuild(args[0]);
      
      case 'create-project':
        return this.api.createProject(args[0]);
      
      case 'create-task':
        return this.api.createTask(args[0]);
      
      default:
        console.warn(`Unhandled IPC channel: ${channel}`);
    }
  }

  async invoke(channel: string, ...args: any[]) {
    switch (channel) {
      case 'get-projects':
        return this.api.getProjects();
      
      case 'get-project':
        return this.api.getProject(args[0]);
      
      case 'get-tasks':
        return this.api.getTasks(args[0]);
      
      case 'get-task':
        return this.api.getTask(args[0]);
      
      case 'build-status':
        return this.api.getBuildStatus(args[0]);
      
      default:
        console.warn(`Unhandled IPC invoke: ${channel}`);
    }
  }
}

// ============================================================================
// Exports
// ============================================================================

export const api = new APIClient();
export const electronAdapter = new ElectronCompatibilityAdapter();

// Attach to window for compatibility
if (typeof window !== 'undefined') {
  (window as any).api = api;
  (window as any).electron = {
    ipcRenderer: electronAdapter,
  };
}

export default api;
