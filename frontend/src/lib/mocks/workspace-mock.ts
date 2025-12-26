/**
 * Workspace management operations via WebSocket
 */

import { wsApi } from '../websocket-service';

export const workspaceMock = {
  getWorktreeStatus: async (taskId: string) => {
    try {
      console.log('[Workspace WS] Getting worktree status:', taskId);
      const data = await wsApi.workspace.getStatus(taskId);
      return { success: true, data };
    } catch (error) {
      console.error('[Workspace WS] Error getting worktree status:', error);
      return {
        success: false,
        data: { exists: false },
        error: error instanceof Error ? error.message : 'WebSocket error'
      };
    }
  },

  getWorktreeDiff: async (taskId: string) => {
    try {
      console.log('[Workspace WS] Getting worktree diff:', taskId);
      const data = await wsApi.workspace.getDiff(taskId);
      return { success: true, data };
    } catch (error) {
      console.error('[Workspace WS] Error getting worktree diff:', error);
      return {
        success: false,
        data: { files: [], summary: 'Error loading diff' },
        error: error instanceof Error ? error.message : 'WebSocket error'
      };
    }
  },

  mergeWorktree: async (taskId: string, options?: { noCommit?: boolean }) => {
    console.warn('[Workspace WS] === mergeWorktree CALLED ===', { taskId, options });
    try {
      console.warn('[Workspace WS] Calling wsApi.workspace.merge...');
      const data = await wsApi.workspace.merge(taskId, options);
      console.warn('[Workspace WS] wsApi.workspace.merge returned:', data);
      return { success: true, data };
    } catch (error) {
      console.error('[Workspace WS] Error merging worktree:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'WebSocket error'
      };
    }
  },

  mergeWorktreePreview: async (taskId: string) => {
    try {
      console.log('[Workspace WS] Getting merge preview:', taskId);
      const data = await wsApi.workspace.mergePreview(taskId);
      return { success: true, data };
    } catch (error) {
      console.error('[Workspace WS] Error getting merge preview:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'WebSocket error'
      };
    }
  },

  discardWorktree: async (taskId: string) => {
    try {
      console.log('[Workspace WS] Discarding worktree:', taskId);
      const data = await wsApi.workspace.discard(taskId);
      return { success: true, data };
    } catch (error) {
      console.error('[Workspace WS] Error discarding worktree:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'WebSocket error'
      };
    }
  },

  listWorktrees: async (projectId: string) => {
    try {
      console.log('[Workspace WS] Listing worktrees:', projectId);
      const data = await wsApi.workspace.list(projectId);
      return { success: true, data };
    } catch (error) {
      console.error('[Workspace WS] Error listing worktrees:', error);
      return {
        success: false,
        data: { worktrees: [] },
        error: error instanceof Error ? error.message : 'WebSocket error'
      };
    }
  }
};
