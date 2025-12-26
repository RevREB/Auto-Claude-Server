/**
 * Task API implementation using WebSocket
 */

import { wsApi, wsService } from '../websocket-service';
import type { TaskRecoveryOptions } from '../../../shared/types';

// Store event listeners by task ID
interface TaskListeners {
  progress?: (data: any) => void;
  error?: (error: any) => void;
  log?: (log: string) => void;
  statusChange?: (status: string) => void;
  executionProgress?: (data: any) => void;
  logsChanged?: () => void;
  logsStream?: (log: string) => void;
}
const eventListeners = new Map<string, TaskListeners>();

// Track task subscriptions
const taskSubscriptions = new Map<string, () => void>();

// Set up task event handling
function setupTaskEventHandling(taskId: string): void {
  // Don't create duplicate subscriptions
  if (taskSubscriptions.has(taskId)) {
    return;
  }

  const unsubscribe = wsService.on(`task.${taskId}`, (data) => {
    const listeners = eventListeners.get(taskId);
    if (!listeners) return;

    console.log('[Task WS] Event for task:', taskId, data.type || data.event);

    switch (data.type || data.event) {
      case 'progress':
        listeners.progress?.(data.data || data);
        break;
      case 'log':
        listeners.log?.(data.data || data);
        listeners.logsStream?.(data.data || data);
        listeners.logsChanged?.();
        break;
      case 'status':
        listeners.statusChange?.(data.data || data);
        break;
      case 'execution_progress':
        listeners.executionProgress?.(data.data || data);
        break;
      case 'error':
        listeners.error?.(data.data || data);
        break;
      case 'complete':
        listeners.statusChange?.(data.status || 'human_review');
        break;
    }
  });

  taskSubscriptions.set(taskId, unsubscribe);
}

// Clean up task event handling
function cleanupTaskEventHandling(taskId: string): void {
  const unsubscribe = taskSubscriptions.get(taskId);
  if (unsubscribe) {
    unsubscribe();
    taskSubscriptions.delete(taskId);
  }
}

export const taskMock = {
  getTasks: async (projectId: string) => {
    try {
      console.log('[Task WS] Fetching tasks for project:', projectId);
      const data = await wsApi.tasks.list(projectId);
      console.log('[Task WS] Tasks fetched:', Array.isArray(data) ? data.length : 0, 'tasks');
      return { success: true, data };
    } catch (error) {
      console.error('[Task WS] Error fetching tasks:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'WebSocket error'
      };
    }
  },

  createTask: async (projectId: string, title: string, description: string) => {
    try {
      console.log('[Task WS] Creating task:', { projectId, title });
      const data = await wsApi.tasks.create(projectId, title, description);
      console.log('[Task WS] Task created:', data);
      return { success: true, data: data.task || data };
    } catch (error) {
      console.error('[Task WS] Error creating task:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'WebSocket error'
      };
    }
  },

  deleteTask: async (taskId: string) => {
    try {
      console.log('[Task WS] Deleting task:', taskId);
      cleanupTaskEventHandling(taskId);
      await wsApi.tasks.delete(taskId);
      console.log('[Task WS] Task deleted');
      return { success: true };
    } catch (error) {
      console.error('[Task WS] Error deleting task:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'WebSocket error'
      };
    }
  },

  updateTask: async (taskId: string, updates: { title?: string; description?: string }) => {
    try {
      console.log('[Task WS] Updating task:', taskId, updates);
      const data = await wsApi.tasks.update(taskId, updates);
      console.log('[Task WS] Task updated:', data);
      return { success: true, data: data.task || data };
    } catch (error) {
      console.error('[Task WS] Error updating task:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'WebSocket error'
      };
    }
  },

  startTask: async (taskId: string) => {
    try {
      console.log('[Task WS] Starting task:', taskId);
      setupTaskEventHandling(taskId);
      const data = await wsApi.tasks.start(taskId);
      console.log('[Task WS] Task started');
      return { success: true, data };
    } catch (error) {
      console.error('[Task WS] Error starting task:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'WebSocket error'
      };
    }
  },

  stopTask: async (taskId: string) => {
    try {
      console.log('[Task WS] Stopping task:', taskId);
      await wsApi.tasks.stop(taskId);
      console.log('[Task WS] Task stopped');
      return { success: true };
    } catch (error) {
      console.error('[Task WS] Error stopping task:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'WebSocket error'
      };
    }
  },

  submitReview: async (taskId: string, approved: boolean, feedback?: string) => {
    try {
      console.log('[Task WS] Submitting review:', taskId, { approved, feedback });
      await wsApi.tasks.review(taskId, approved, feedback);
      console.log('[Task WS] Review submitted');
      return { success: true };
    } catch (error) {
      console.error('[Task WS] Error submitting review:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'WebSocket error'
      };
    }
  },

  archiveTasks: async (taskIds: string[]) => {
    try {
      console.log('[Task WS] Archiving tasks:', taskIds);
      await wsApi.tasks.archive(taskIds);
      console.log('[Task WS] Tasks archived');
      return { success: true, data: true };
    } catch (error) {
      console.error('[Task WS] Error archiving tasks:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'WebSocket error'
      };
    }
  },

  unarchiveTasks: async (taskIds: string[]) => {
    try {
      console.log('[Task WS] Unarchiving tasks:', taskIds);
      await wsApi.tasks.unarchive(taskIds);
      console.log('[Task WS] Tasks unarchived');
      return { success: true, data: true };
    } catch (error) {
      console.error('[Task WS] Error unarchiving tasks:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'WebSocket error'
      };
    }
  },

  updateTaskStatus: async (taskId: string, status: string) => {
    try {
      console.log('[Task WS] Updating task status:', taskId, status);
      await wsApi.tasks.updateStatus(taskId, status);
      console.log('[Task WS] Task status updated');
      return { success: true };
    } catch (error) {
      console.error('[Task WS] Error updating task status:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'WebSocket error'
      };
    }
  },

  recoverStuckTask: async (taskId: string, options?: TaskRecoveryOptions) => {
    try {
      console.log('[Task WS] Recovering stuck task:', taskId, options);
      const data = await wsApi.tasks.recover(taskId, options);
      console.log('[Task WS] Task recovered:', data);
      return { success: true, data };
    } catch (error) {
      console.error('[Task WS] Error recovering task:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'WebSocket error'
      };
    }
  },

  checkTaskRunning: async (taskId: string) => {
    try {
      console.log('[Task WS] Checking if task is running:', taskId);
      const data = await wsApi.tasks.checkRunning(taskId);
      return { success: true, data: data.running };
    } catch (error) {
      console.error('[Task WS] Error checking task status:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'WebSocket error'
      };
    }
  },

  getTaskLogs: async (projectId: string, specId: string) => {
    try {
      console.log('[Task WS] Fetching task logs:', projectId, specId);
      const data = await wsApi.tasks.getLogs(projectId, specId);
      return { success: true, data };
    } catch (error) {
      console.error('[Task WS] Error fetching task logs:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'WebSocket error'
      };
    }
  },

  watchTaskLogs: async (projectId: string, specId: string) => {
    console.log('[Task WS] Watching task logs:', projectId, specId);
    setupTaskEventHandling(specId);
    return { success: true };
  },

  unwatchTaskLogs: async (specId: string) => {
    console.log('[Task WS] Unwatching task logs:', specId);
    // Don't cleanup here - keep connection for status updates
    return { success: true };
  },

  // Event Listeners
  onTaskProgress: (taskId: string, callback: (data: any) => void) => {
    const listeners = eventListeners.get(taskId) || {};
    listeners.progress = callback;
    eventListeners.set(taskId, listeners);
    setupTaskEventHandling(taskId);
    return () => {
      const current = eventListeners.get(taskId);
      if (current) {
        delete current.progress;
        eventListeners.set(taskId, current);
      }
    };
  },

  onTaskError: (taskId: string, callback: (error: any) => void) => {
    const listeners = eventListeners.get(taskId) || {};
    listeners.error = callback;
    eventListeners.set(taskId, listeners);
    setupTaskEventHandling(taskId);
    return () => {
      const current = eventListeners.get(taskId);
      if (current) {
        delete current.error;
        eventListeners.set(taskId, current);
      }
    };
  },

  onTaskLog: (taskId: string, callback: (log: string) => void) => {
    const listeners = eventListeners.get(taskId) || {};
    listeners.log = callback;
    eventListeners.set(taskId, listeners);
    setupTaskEventHandling(taskId);
    return () => {
      const current = eventListeners.get(taskId);
      if (current) {
        delete current.log;
        eventListeners.set(taskId, current);
      }
    };
  },

  onTaskStatusChange: (taskId: string, callback: (status: string) => void) => {
    const listeners = eventListeners.get(taskId) || {};
    listeners.statusChange = callback;
    eventListeners.set(taskId, listeners);
    setupTaskEventHandling(taskId);
    return () => {
      const current = eventListeners.get(taskId);
      if (current) {
        delete current.statusChange;
        eventListeners.set(taskId, current);
      }
    };
  },

  onTaskExecutionProgress: (taskId: string, callback: (data: any) => void) => {
    const listeners = eventListeners.get(taskId) || {};
    listeners.executionProgress = callback;
    eventListeners.set(taskId, listeners);
    setupTaskEventHandling(taskId);
    return () => {
      const current = eventListeners.get(taskId);
      if (current) {
        delete current.executionProgress;
        eventListeners.set(taskId, current);
      }
    };
  },

  onTaskLogsChanged: (callback: (specId: string, logs: any) => void) => {
    // Global listener for log changes - subscribe to WebSocket events
    const unsubscribe = wsService.on('task.logs.changed', (data) => {
      callback(data.specId, data.logs);
    });
    return unsubscribe;
  },

  onTaskLogsStream: (callback: (specId: string, chunk: any) => void) => {
    // Global listener for log stream - subscribe to WebSocket events
    const unsubscribe = wsService.on('task.logs.stream', (data) => {
      callback(data.specId, data.chunk);
    });
    return unsubscribe;
  }
};
