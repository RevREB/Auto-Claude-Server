/**
 * Backend API implementation for terminal operations
 * Connects to real PTY sessions via WebSocket
 */

import { API_URL, httpToWs } from '../url-utils';


// Store WebSocket connections by terminal ID
const wsConnections = new Map<string, WebSocket>();

// Store event listeners by terminal ID (for per-terminal WebSocket dispatching)
interface TerminalListeners {
  output?: (data: string) => void;
  exit?: () => void;
  titleChange?: (title: string) => void;
  claudeSession?: (data: any) => void;
  rateLimit?: (data: any) => void;
  oauthToken?: (token: string) => void;
}
const eventListeners = new Map<string, TerminalListeners>();

// Global event listeners (called with terminal ID)
interface GlobalTerminalListeners {
  output: Set<(id: string, data: string) => void>;
  exit: Set<(id: string, exitCode: number) => void>;
  titleChange: Set<(id: string, title: string) => void>;
  claudeSession: Set<(id: string, sessionId: string) => void>;
  rateLimit: Set<(id: string, data: any) => void>;
  oauthToken: Set<(id: string, token: string) => void>;
}
const globalListeners: GlobalTerminalListeners = {
  output: new Set(),
  exit: new Set(),
  titleChange: new Set(),
  claudeSession: new Set(),
  rateLimit: new Set(),
  oauthToken: new Set(),
};

export const terminalMock = {
  createTerminal: async (options: { id: string; cwd?: string; cols?: number; rows?: number; projectPath?: string; autoRun?: string } | string, autoRun?: string) => {
    try {
      // Handle both object and string signatures
      const terminalId = typeof options === 'string' ? options : options.id;
      const autoRunCommand = typeof options === 'string' ? autoRun : options.autoRun;
      const projectPath = typeof options === 'object' ? options.projectPath : undefined;

      console.log('[Backend API] Creating terminal:', terminalId, 'projectPath:', projectPath);

      // Build query parameters for backend
      const params = new URLSearchParams();
      if (autoRunCommand) {
        params.append('auto_run', autoRunCommand);
      }
      if (projectPath) {
        params.append('cwd', projectPath);
        // Auto-start claude CLI when opening a project terminal
        params.append('start_claude', 'true');
      }

      // Create backend PTY session
      const queryString = params.toString();
      const url = queryString
        ? `${API_URL}/api/terminal/create/${terminalId}?${queryString}`
        : `${API_URL}/api/terminal/create/${terminalId}`;

      const response = await fetch(url, {
        method: 'POST',
      });

      if (!response.ok) {
        const error = await response.json();
        console.error('[Backend API] Failed to create terminal:', error);
        return { success: false, error: error.detail || 'Failed to create terminal' };
      }

      const data = await response.json();
      console.log('[Backend API] Terminal created successfully:', data);

      // Connect WebSocket
      const wsUrl = `${httpToWs(API_URL || window.location.origin)}/api/terminal/ws/${terminalId}`;
      const ws = new WebSocket(wsUrl);

      ws.onopen = () => {
        console.log('[Backend API] WebSocket connected for terminal:', terminalId);
      };

      ws.onmessage = (event) => {
        const message = JSON.parse(event.data);

        // Dispatch to global listeners (with terminal ID)
        if (message.type === 'output') {
          globalListeners.output.forEach(cb => cb(terminalId, message.data));
        } else if (message.type === 'exit') {
          globalListeners.exit.forEach(cb => cb(terminalId, message.exitCode || 0));
        } else if (message.type === 'title_change') {
          globalListeners.titleChange.forEach(cb => cb(terminalId, message.title));
        } else if (message.type === 'claude_session') {
          globalListeners.claudeSession.forEach(cb => cb(terminalId, message.data));
        } else if (message.type === 'rate_limit') {
          globalListeners.rateLimit.forEach(cb => cb(terminalId, message.data));
        } else if (message.type === 'token_extracted') {
          globalListeners.oauthToken.forEach(cb => cb(terminalId, message.token));
        }
      };

      ws.onerror = (error) => {
        console.error('[Backend API] WebSocket error for terminal:', terminalId, error);
      };

      ws.onclose = () => {
        console.log('[Backend API] WebSocket closed for terminal:', terminalId);
        wsConnections.delete(terminalId);
      };

      wsConnections.set(terminalId, ws);

      return { success: true, data };
    } catch (error) {
      console.error('[Backend API] Error creating terminal:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Network error'
      };
    }
  },

  destroyTerminal: async (terminalId: string) => {
    try {
      console.log('[Backend API] Destroying terminal:', terminalId);

      // Close WebSocket if exists
      const ws = wsConnections.get(terminalId);
      if (ws) {
        ws.close();
        wsConnections.delete(terminalId);
      }

      // Clean up listeners
      eventListeners.delete(terminalId);

      // Delete backend session
      const response = await fetch(`${API_URL}/api/terminal/${terminalId}`, {
        method: 'DELETE',
      });

      if (!response.ok && response.status !== 404) {
        const error = await response.json();
        console.error('[Backend API] Failed to destroy terminal:', error);
        return { success: false, error: error.detail || 'Failed to destroy terminal' };
      }

      console.log('[Backend API] Terminal destroyed successfully');
      return { success: true };
    } catch (error) {
      console.error('[Backend API] Error destroying terminal:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Network error'
      };
    }
  },

  sendTerminalInput: (terminalId: string, data: string) => {
    const ws = wsConnections.get(terminalId);
    if (ws && ws.readyState === WebSocket.OPEN) {
      console.log('[Backend API] Sending input to terminal:', terminalId);
      ws.send(JSON.stringify({ type: 'input', data }));
    } else {
      console.warn('[Backend API] Cannot send input - WebSocket not connected:', terminalId);
    }
  },

  resizeTerminal: (terminalId: string, cols: number, rows: number) => {
    const ws = wsConnections.get(terminalId);
    if (ws && ws.readyState === WebSocket.OPEN) {
      console.log('[Backend API] Resizing terminal:', terminalId, { cols, rows });
      ws.send(JSON.stringify({ type: 'resize', cols, rows }));
    } else {
      console.warn('[Backend API] Cannot resize - WebSocket not connected:', terminalId);
    }
  },

  invokeClaudeInTerminal: (terminalId: string, command?: string) => {
    const ws = wsConnections.get(terminalId);
    if (ws && ws.readyState === WebSocket.OPEN) {
      console.log('[Backend API] Invoking Claude in terminal:', terminalId);
      const claudeCommand = command || 'claude';
      ws.send(JSON.stringify({ type: 'input', data: `${claudeCommand}\r` }));
    } else {
      console.warn('[Backend API] Cannot invoke Claude - WebSocket not connected:', terminalId);
    }
  },

  generateTerminalName: async () => ({
    success: true,
    data: `Terminal ${Date.now()}`
  }),

  // Terminal session management
  getTerminalSessions: async () => ({
    success: true,
    data: []
  }),

  restoreTerminalSession: async (session: any, cols?: number, rows?: number) => {
    console.log('[Backend API] Restoring terminal session:', session.id);
    // For now, just create a new terminal with the same ID
    return await terminalMock.createTerminal({
      id: session.id,
      cwd: session.cwd,
      cols,
      rows,
      projectPath: session.projectPath
    });
  },

  clearTerminalSessions: async () => ({ success: true }),

  resumeClaudeInTerminal: (terminalId: string) => {
    console.log('[Backend API] Resuming Claude in terminal:', terminalId);
    // Send Ctrl+C to interrupt current command, then restart
    terminalMock.sendTerminalInput(terminalId, '\x03');
    setTimeout(() => {
      terminalMock.invokeClaudeInTerminal(terminalId);
    }, 100);
  },

  getTerminalSessionDates: async () => ({
    success: true,
    data: []
  }),

  getTerminalSessionsForDate: async () => ({
    success: true,
    data: []
  }),

  restoreTerminalSessionsFromDate: async () => ({
    success: true,
    data: {
      restored: 0,
      failed: 0,
      sessions: []
    }
  }),

  saveTerminalBuffer: async () => {},

  // Terminal Event Listeners (global - callbacks receive terminal ID)
  onTerminalOutput: (callback: (id: string, data: string) => void) => {
    globalListeners.output.add(callback);
    return () => {
      globalListeners.output.delete(callback);
    };
  },

  onTerminalExit: (callback: (id: string, exitCode: number) => void) => {
    globalListeners.exit.add(callback);
    return () => {
      globalListeners.exit.delete(callback);
    };
  },

  onTerminalTitleChange: (callback: (id: string, title: string) => void) => {
    globalListeners.titleChange.add(callback);
    return () => {
      globalListeners.titleChange.delete(callback);
    };
  },

  onTerminalClaudeSession: (callback: (id: string, sessionId: string) => void) => {
    globalListeners.claudeSession.add(callback);
    return () => {
      globalListeners.claudeSession.delete(callback);
    };
  },

  onTerminalRateLimit: (callback: (id: string, data: any) => void) => {
    globalListeners.rateLimit.add(callback);
    return () => {
      globalListeners.rateLimit.delete(callback);
    };
  },

  onTerminalOAuthToken: (callback: (id: string, token: string) => void) => {
    globalListeners.oauthToken.add(callback);
    return () => {
      globalListeners.oauthToken.delete(callback);
    };
  }
};
