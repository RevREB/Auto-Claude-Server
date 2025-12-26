/**
 * Changelog operations - calls backend via WebSocket
 */

import { wsService } from '../websocket-service';
import type { Task } from '../../../shared/types';

export const changelogMock = {
  // Changelog Operations
  getChangelogDoneTasks: async (projectId: string, _tasks?: Task[]) => {
    try {
      const data = await wsService.send('changelog.getDoneTasks', { projectId });
      return { success: true, data };
    } catch (error) {
      console.error('[Changelog] getChangelogDoneTasks error:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Failed to get tasks' };
    }
  },

  loadTaskSpecs: async (projectId: string, specIds: string[]) => {
    try {
      const data = await wsService.send('changelog.loadSpecs', { projectId, specIds });
      return { success: true, data };
    } catch (error) {
      console.error('[Changelog] loadTaskSpecs error:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Failed to load specs' };
    }
  },

  generateChangelog: (projectId: string, version: string, taskSpecIds: string[], options?: Record<string, unknown>) => {
    wsService.send('changelog.generate', { projectId, version, taskSpecIds, options }).catch(error => {
      console.error('[Changelog] generateChangelog error:', error);
    });
  },

  saveChangelog: async (projectId: string, content: string, filePath?: string) => {
    try {
      const data = await wsService.send('changelog.save', { projectId, content, filePath });
      return { success: true, data };
    } catch (error) {
      console.error('[Changelog] saveChangelog error:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Failed to save changelog' };
    }
  },

  saveChangelogImage: async (projectId: string, imageData: string, filename: string) => {
    try {
      const data = await wsService.send('changelog.saveImage', { projectId, imageData, filename });
      return { success: true, data };
    } catch (error) {
      console.error('[Changelog] saveChangelogImage error:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Failed to save image' };
    }
  },

  readLocalImage: async (projectId: string, imagePath: string) => {
    try {
      const data = await wsService.send('changelog.readImage', { projectId, imagePath });
      return { success: true, data };
    } catch (error) {
      console.error('[Changelog] readLocalImage error:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Failed to read image' };
    }
  },

  readExistingChangelog: async (projectId: string, filePath?: string) => {
    try {
      const data = await wsService.send('changelog.readExisting', { projectId, filePath });
      return { success: true, data };
    } catch (error) {
      console.error('[Changelog] readExistingChangelog error:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Failed to read changelog' };
    }
  },

  suggestChangelogVersion: async (projectId: string) => {
    try {
      const data = await wsService.send('changelog.suggestVersion', { projectId });
      return { success: true, data };
    } catch (error) {
      console.error('[Changelog] suggestChangelogVersion error:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Failed to suggest version' };
    }
  },

  suggestChangelogVersionFromCommits: async (projectId: string, fromRef?: string, toRef?: string) => {
    try {
      const data = await wsService.send('changelog.suggestVersionFromCommits', { projectId, fromRef, toRef });
      return { success: true, data };
    } catch (error) {
      console.error('[Changelog] suggestChangelogVersionFromCommits error:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Failed to suggest version' };
    }
  },

  getChangelogBranches: async (projectId: string) => {
    try {
      const data = await wsService.send('changelog.getBranches', { projectId });
      return { success: true, data };
    } catch (error) {
      console.error('[Changelog] getChangelogBranches error:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Failed to get branches' };
    }
  },

  getChangelogTags: async (projectId: string) => {
    try {
      const data = await wsService.send('changelog.getTags', { projectId });
      return { success: true, data };
    } catch (error) {
      console.error('[Changelog] getChangelogTags error:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Failed to get tags' };
    }
  },

  getChangelogCommitsPreview: async (projectId: string, fromRef?: string, toRef?: string) => {
    try {
      const data = await wsService.send('changelog.getCommitsPreview', { projectId, fromRef, toRef });
      return { success: true, data };
    } catch (error) {
      console.error('[Changelog] getChangelogCommitsPreview error:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Failed to get commits' };
    }
  },

  // Event listeners using wildcard subscription
  onChangelogGenerationProgress: (callback: (projectId: string, data: unknown) => void) => {
    const handler = (event: { event: string; data: unknown }) => {
      const match = event.event?.match(/^changelog\.(.+)\.progress$/);
      if (match) {
        callback(match[1], event.data);
      }
    };
    return wsService.on('*', handler);
  },

  onChangelogGenerationComplete: (callback: (projectId: string, data: unknown) => void) => {
    const handler = (event: { event: string; data: unknown }) => {
      const match = event.event?.match(/^changelog\.(.+)\.complete$/);
      if (match) {
        callback(match[1], event.data);
      }
    };
    return wsService.on('*', handler);
  },

  onChangelogGenerationError: (callback: (projectId: string, error: string) => void) => {
    const handler = (event: { event: string; data: { error?: string } }) => {
      const match = event.event?.match(/^changelog\.(.+)\.error$/);
      if (match) {
        callback(match[1], event.data?.error || 'Unknown error');
      }
    };
    return wsService.on('*', handler);
  },

  // GitHub Release Operations
  getReleaseableVersions: async (projectId: string) => {
    try {
      const data = await wsService.send('changelog.getReleaseableVersions', { projectId });
      return { success: true, data };
    } catch (error) {
      console.error('[Changelog] getReleaseableVersions error:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Failed to get versions' };
    }
  },

  runReleasePreflightCheck: async (projectId: string, version: string) => {
    try {
      const data = await wsService.send('changelog.preflightCheck', { projectId, version });
      return { success: true, data };
    } catch (error) {
      console.error('[Changelog] runReleasePreflightCheck error:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Failed to run preflight check' };
    }
  },

  createRelease: (projectId: string, version: string, notes?: string, draft?: boolean, prerelease?: boolean) => {
    wsService.send('changelog.createRelease', { projectId, version, notes, draft, prerelease }).catch(error => {
      console.error('[Changelog] createRelease error:', error);
    });
  },

  onReleaseProgress: (callback: (projectId: string, data: unknown) => void) => {
    const handler = (event: { event: string; data: unknown }) => {
      const match = event.event?.match(/^release\.(.+)\.progress$/);
      if (match) {
        callback(match[1], event.data);
      }
    };
    return wsService.on('*', handler);
  },

  onReleaseComplete: (callback: (projectId: string, data: unknown) => void) => {
    const handler = (event: { event: string; data: unknown }) => {
      const match = event.event?.match(/^release\.(.+)\.complete$/);
      if (match) {
        callback(match[1], event.data);
      }
    };
    return wsService.on('*', handler);
  },

  onReleaseError: (callback: (projectId: string, error: string) => void) => {
    const handler = (event: { event: string; data: { error?: string } }) => {
      const match = event.event?.match(/^release\.(.+)\.error$/);
      if (match) {
        callback(match[1], event.data?.error || 'Unknown error');
      }
    };
    return wsService.on('*', handler);
  }
};
