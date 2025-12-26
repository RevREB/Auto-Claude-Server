/**
 * Roadmap operations - calls backend via WebSocket
 */

import { wsService } from '../websocket-service';

export const roadmapMock = {
  getRoadmap: async (projectId: string) => {
    try {
      const data = await wsService.send('roadmap.get', { projectId });
      return { success: true, data };
    } catch (error) {
      console.error('[Roadmap] getRoadmap error:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Failed to get roadmap' };
    }
  },

  generateRoadmap: (projectId: string, options?: Record<string, unknown>) => {
    wsService.send('roadmap.generate', { projectId, options }).catch(error => {
      console.error('[Roadmap] generateRoadmap error:', error);
    });
  },

  refreshRoadmap: (projectId: string) => {
    wsService.send('roadmap.refresh', { projectId }).catch(error => {
      console.error('[Roadmap] refreshRoadmap error:', error);
    });
  },

  updateFeatureStatus: async (projectId: string, featureId: string, status: string) => {
    try {
      await wsService.send('roadmap.updateFeatureStatus', { projectId, featureId, status });
      return { success: true };
    } catch (error) {
      console.error('[Roadmap] updateFeatureStatus error:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Failed to update status' };
    }
  },

  convertFeatureToSpec: async (projectId: string, featureId: string) => {
    try {
      const data = await wsService.send('roadmap.convertToTask', { projectId, featureId });
      return { success: true, data };
    } catch (error) {
      console.error('[Roadmap] convertFeatureToSpec error:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Failed to convert feature' };
    }
  },

  // Roadmap Event Listeners
  onRoadmapProgress: (callback: (projectId: string, data: unknown) => void) => {
    const handler = (event: { event: string; data: unknown }) => {
      const match = event.event?.match(/^roadmap\.(.+)\.progress$/);
      if (match) {
        callback(match[1], event.data);
      }
    };
    return wsService.on('*', handler);
  },

  onRoadmapComplete: (callback: (projectId: string, data: unknown) => void) => {
    const handler = (event: { event: string; data: unknown }) => {
      const match = event.event?.match(/^roadmap\.(.+)\.complete$/);
      if (match) {
        callback(match[1], event.data);
      }
    };
    return wsService.on('*', handler);
  },

  onRoadmapError: (callback: (projectId: string, error: string) => void) => {
    const handler = (event: { event: string; data: { error?: string } }) => {
      const match = event.event?.match(/^roadmap\.(.+)\.error$/);
      if (match) {
        callback(match[1], event.data?.error || 'Unknown error');
      }
    };
    return wsService.on('*', handler);
  }
};
