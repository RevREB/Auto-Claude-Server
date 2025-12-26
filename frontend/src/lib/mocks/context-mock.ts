/**
 * Context operations - calls backend via WebSocket
 */

import { wsService } from '../websocket-service';

export const contextMock = {
  getProjectContext: async (projectId: string) => {
    try {
      const data = await wsService.send('context.getProject', { projectId });
      return { success: true, data };
    } catch (error) {
      console.error('[Context] getProjectContext error:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Failed to get context' };
    }
  },

  refreshProjectIndex: async (projectId: string) => {
    try {
      const data = await wsService.send('context.refreshIndex', { projectId });
      return { success: true, data };
    } catch (error) {
      console.error('[Context] refreshProjectIndex error:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Failed to refresh index' };
    }
  },

  getMemoryStatus: async (projectId: string) => {
    try {
      const data = await wsService.send('context.getMemoryStatus', { projectId });
      return { success: true, data };
    } catch (error) {
      console.error('[Context] getMemoryStatus error:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Failed to get memory status' };
    }
  },

  searchMemories: async (projectId: string, query: string) => {
    try {
      const data = await wsService.send('context.searchMemories', { projectId, query });
      return { success: true, data };
    } catch (error) {
      console.error('[Context] searchMemories error:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Failed to search memories' };
    }
  },

  getRecentMemories: async (projectId: string, limit?: number) => {
    try {
      const data = await wsService.send('context.getRecentMemories', { projectId, limit });
      return { success: true, data };
    } catch (error) {
      console.error('[Context] getRecentMemories error:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Failed to get memories' };
    }
  }
};
