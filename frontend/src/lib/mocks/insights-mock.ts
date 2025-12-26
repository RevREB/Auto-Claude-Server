/**
 * Insights operations - calls backend via WebSocket
 */

import { wsService } from '../websocket-service';
import type { InsightsModelConfig, TaskMetadata } from '../../../shared/types';

export const insightsMock = {
  getInsightsSession: async (projectId: string) => {
    try {
      const data = await wsService.send('insights.getSession', { projectId });
      return { success: true, data };
    } catch (error) {
      console.error('[Insights] getInsightsSession error:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Failed to get session' };
    }
  },

  listInsightsSessions: async (projectId: string) => {
    try {
      const data = await wsService.send('insights.listSessions', { projectId });
      return { success: true, data };
    } catch (error) {
      console.error('[Insights] listInsightsSessions error:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Failed to list sessions' };
    }
  },

  newInsightsSession: async (projectId: string) => {
    try {
      const data = await wsService.send('insights.newSession', { projectId });
      return { success: true, data };
    } catch (error) {
      console.error('[Insights] newInsightsSession error:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Failed to create session' };
    }
  },

  switchInsightsSession: async (projectId: string, sessionId: string) => {
    try {
      const data = await wsService.send('insights.switchSession', { projectId, sessionId });
      return { success: true, data };
    } catch (error) {
      console.error('[Insights] switchInsightsSession error:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Failed to switch session' };
    }
  },

  deleteInsightsSession: async (projectId: string, sessionId: string) => {
    try {
      await wsService.send('insights.deleteSession', { projectId, sessionId });
      return { success: true };
    } catch (error) {
      console.error('[Insights] deleteInsightsSession error:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Failed to delete session' };
    }
  },

  renameInsightsSession: async (projectId: string, sessionId: string, newTitle: string) => {
    try {
      await wsService.send('insights.renameSession', { projectId, sessionId, newTitle });
      return { success: true };
    } catch (error) {
      console.error('[Insights] renameInsightsSession error:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Failed to rename session' };
    }
  },

  updateInsightsModelConfig: async (projectId: string, sessionId: string, modelConfig: InsightsModelConfig) => {
    try {
      await wsService.send('insights.updateModelConfig', { projectId, sessionId, modelConfig });
      return { success: true };
    } catch (error) {
      console.error('[Insights] updateInsightsModelConfig error:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Failed to update model config' };
    }
  },

  sendInsightsMessage: (projectId: string, message: string, modelConfig?: InsightsModelConfig) => {
    // Fire and forget - response comes via streaming events
    wsService.send('insights.sendMessage', { projectId, message, modelConfig }).catch(error => {
      console.error('[Insights] sendInsightsMessage error:', error);
    });
  },

  clearInsightsSession: async (projectId: string, sessionId?: string) => {
    try {
      await wsService.send('insights.clearSession', { projectId, sessionId });
      return { success: true };
    } catch (error) {
      console.error('[Insights] clearInsightsSession error:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Failed to clear session' };
    }
  },

  createTaskFromInsights: async (projectId: string, sessionId: string, messageId: string, title: string, description: string, metadata?: TaskMetadata) => {
    try {
      const data = await wsService.send('insights.createTask', { projectId, sessionId, messageId, title, description, metadata });
      if (data.success && data.task) {
        return { success: true, data: data.task };
      }
      return { success: false, error: data.error || 'Failed to create task' };
    } catch (error) {
      console.error('[Insights] createTaskFromInsights error:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Failed to create task' };
    }
  },

  // Event subscription methods
  // Use the wildcard '*' handler to catch all events, then filter by pattern
  onInsightsStreamChunk: (callback: (projectId: string, chunk: unknown) => void) => {
    // Subscribe to all events and filter for insights chunks
    const handler = (event: { event: string; data: unknown }) => {
      // Parse project ID from event name: insights.{projectId}.chunk
      const match = event.event?.match(/^insights\.(.+)\.chunk$/);
      if (match) {
        const projectId = match[1];
        callback(projectId, event.data);
      }
    };

    // Use wildcard subscription
    return wsService.on('*', handler);
  },

  onInsightsStatus: (callback: (projectId: string, status: unknown) => void) => {
    const handler = (event: { event: string; data: unknown }) => {
      const match = event.event?.match(/^insights\.(.+)\.status$/);
      if (match) {
        const projectId = match[1];
        callback(projectId, event.data);
      }
    };

    return wsService.on('*', handler);
  },

  onInsightsError: (callback: (projectId: string, error: string) => void) => {
    const handler = (event: { event: string; data: { error?: string } }) => {
      const match = event.event?.match(/^insights\.(.+)\.error$/);
      if (match) {
        const projectId = match[1];
        callback(projectId, event.data?.error || 'Unknown error');
      }
    };

    return wsService.on('*', handler);
  }
};
