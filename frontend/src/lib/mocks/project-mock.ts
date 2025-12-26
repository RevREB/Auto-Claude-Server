/**
 * Project API implementation using WebSocket
 */

import { wsApi } from '../websocket-service';
import { DEFAULT_PROJECT_SETTINGS } from '../../../shared/constants';

export const projectMock = {
  addProject: async (projectPath: string) => {
    try {
      console.log('[Project WS] Adding project:', projectPath);
      const data = await wsApi.projects.create(projectPath, DEFAULT_PROJECT_SETTINGS);
      console.log('[Project WS] Project added:', data);
      return { success: true, data };
    } catch (error) {
      console.error('[Project WS] Error adding project:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'WebSocket error'
      };
    }
  },

  removeProject: async (projectId: string) => {
    try {
      console.log('[Project WS] Removing project:', projectId);
      await wsApi.projects.delete(projectId);
      console.log('[Project WS] Project removed');
      return { success: true };
    } catch (error) {
      console.error('[Project WS] Error removing project:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'WebSocket error'
      };
    }
  },

  getProjects: async () => {
    try {
      console.log('[Project WS] Fetching projects');
      const data = await wsApi.projects.list();
      console.log('[Project WS] Projects fetched:', Array.isArray(data) ? data.length : 0, 'projects');
      return { success: true, data };
    } catch (error) {
      console.error('[Project WS] Error fetching projects:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'WebSocket error'
      };
    }
  },

  updateProjectSettings: async (projectId: string, settings: any) => {
    try {
      console.log('[Project WS] Updating project settings:', projectId);
      await wsApi.projects.updateSettings(projectId, settings);
      console.log('[Project WS] Settings updated');
      return { success: true };
    } catch (error) {
      console.error('[Project WS] Error updating settings:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'WebSocket error'
      };
    }
  },

  initializeProject: async (projectId: string) => {
    try {
      console.log('[Project WS] Initializing project:', projectId);
      const data = await wsApi.projects.initialize(projectId);
      console.log('[Project WS] Project initialized:', data);
      return { success: true, data };
    } catch (error) {
      console.error('[Project WS] Error initializing project:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'WebSocket error'
      };
    }
  },

  updateProjectAutoBuild: async (projectId: string) => {
    try {
      console.log('[Project WS] Updating auto-build:', projectId);
      const data = await wsApi.projects.updateAutoBuild(projectId);
      console.log('[Project WS] Auto-build updated:', data);
      return { success: true, data };
    } catch (error) {
      console.error('[Project WS] Error updating auto-build:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'WebSocket error'
      };
    }
  },

  checkProjectVersion: async (projectId: string) => {
    try {
      console.log('[Project WS] Checking version:', projectId);
      const data = await wsApi.projects.getVersion(projectId);
      return { success: true, data };
    } catch (error) {
      console.error('[Project WS] Error checking version:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'WebSocket error'
      };
    }
  },

  getTabState: async () => {
    try {
      console.log('[Project WS] Fetching tab state');
      const data = await wsApi.projects.getTabState();
      return { success: true, data };
    } catch (error) {
      console.error('[Project WS] Error fetching tab state:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'WebSocket error'
      };
    }
  },

  saveTabState: async (state: { openProjectIds: string[]; activeProjectId: string | null; tabOrder: string[] }) => {
    try {
      console.log('[Project WS] Saving tab state');
      await wsApi.projects.saveTabState(state);
      console.log('[Project WS] Tab state saved');
      return { success: true };
    } catch (error) {
      console.error('[Project WS] Error saving tab state:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'WebSocket error'
      };
    }
  },

  // Dialog operations - these need user interaction, so they remain client-side
  selectDirectory: async () => {
    return prompt('Enter project path:', '/path/to/project');
  },

  cloneGitRepo: async (url: string, name?: string) => {
    try {
      console.log('[Project WS] Cloning git repo:', url, name);
      const data = await wsApi.git.clone(url, name);
      console.log('[Project WS] Repo cloned:', data);
      return { success: true, data };
    } catch (error) {
      console.error('[Project WS] Error cloning repo:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'WebSocket error'
      };
    }
  },

  createProjectFolder: async (location: string, name: string, initGit: boolean) => {
    try {
      console.log('[Project WS] Creating folder:', { location, name, initGit });
      const data = await wsApi.projects.createFolder(location, name, initGit);
      console.log('[Project WS] Folder created:', data);
      return { success: true, data };
    } catch (error) {
      console.error('[Project WS] Error creating folder:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'WebSocket error'
      };
    }
  },

  getDefaultProjectLocation: async () => {
    try {
      console.log('[Project WS] Getting default location');
      const data = await wsApi.projects.getDefaultLocation();
      return data.location || '/projects';
    } catch (error) {
      console.error('[Project WS] Error getting default location:', error);
      return '/projects';
    }
  },

  listDirectory: async (projectId: string, path?: string) => {
    try {
      console.log('[Project WS] Listing directory:', projectId, path);
      const data = await wsApi.projects.getDirectory(projectId, path);
      return { success: true, data };
    } catch (error) {
      console.error('[Project WS] Error listing directory:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'WebSocket error'
      };
    }
  },

  // Git operations
  getGitBranches: async (projectId: string) => {
    try {
      console.log('[Project WS] Getting git branches:', projectId);
      const data = await wsApi.git.branches(projectId);
      return { success: true, data: data.branches };
    } catch (error) {
      console.error('[Project WS] Error getting branches:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'WebSocket error'
      };
    }
  },

  getCurrentGitBranch: async (projectId: string) => {
    try {
      console.log('[Project WS] Getting current branch:', projectId);
      const data = await wsApi.git.currentBranch(projectId);
      return { success: true, data: data.branch };
    } catch (error) {
      console.error('[Project WS] Error getting current branch:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'WebSocket error'
      };
    }
  },

  detectMainBranch: async (projectId: string) => {
    try {
      console.log('[Project WS] Detecting main branch:', projectId);
      const data = await wsApi.git.mainBranch(projectId);
      return { success: true, data: data.branch };
    } catch (error) {
      console.error('[Project WS] Error detecting main branch:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'WebSocket error'
      };
    }
  },

  checkGitStatus: async (projectId: string) => {
    try {
      console.log('[Project WS] Checking git status:', projectId);
      const data = await wsApi.git.status(projectId);
      return { success: true, data };
    } catch (error) {
      console.error('[Project WS] Error checking git status:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'WebSocket error'
      };
    }
  },

  initializeGit: async (projectId: string) => {
    try {
      console.log('[Project WS] Initializing git:', projectId);
      const data = await wsApi.git.initialize(projectId);
      console.log('[Project WS] Git initialized');
      return { success: true, data };
    } catch (error) {
      console.error('[Project WS] Error initializing git:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'WebSocket error'
      };
    }
  },

  skipGitSetup: async (projectId: string) => {
    try {
      console.log('[Project WS] Skipping git setup:', projectId);
      const data = await wsApi.git.skipSetup(projectId);
      console.log('[Project WS] Git setup skipped');
      return { success: true, data };
    } catch (error) {
      console.error('[Project WS] Error skipping git setup:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'WebSocket error'
      };
    }
  },

  // Branch model operations
  detectBranchModel: async (projectId: string) => {
    try {
      console.log('[Project WS] Detecting branch model:', projectId);
      const data = await wsApi.branchModel.detect(projectId);
      return { success: true, data };
    } catch (error) {
      console.error('[Project WS] Error detecting branch model:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'WebSocket error'
      };
    }
  },

  getBranchModelStatus: async (projectId: string) => {
    try {
      console.log('[Project WS] Getting branch model status:', projectId);
      const data = await wsApi.branchModel.status(projectId);
      return { success: true, data };
    } catch (error) {
      console.error('[Project WS] Error getting branch model status:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'WebSocket error'
      };
    }
  },

  previewBranchModelMigration: async (projectId: string) => {
    try {
      console.log('[Project WS] Previewing branch model migration:', projectId);
      const data = await wsApi.branchModel.migratePreview(projectId);
      return { success: true, data };
    } catch (error) {
      console.error('[Project WS] Error previewing migration:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'WebSocket error'
      };
    }
  },

  migrateBranchModel: async (projectId: string) => {
    try {
      console.log('[Project WS] Migrating branch model:', projectId);
      const data = await wsApi.branchModel.migrate(projectId);
      console.log('[Project WS] Branch model migrated:', data);
      return { success: true, data };
    } catch (error) {
      console.error('[Project WS] Error migrating branch model:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'WebSocket error'
      };
    }
  },

  validateBranchName: async (projectId: string, branchName: string) => {
    try {
      const data = await wsApi.branchModel.validate(projectId, branchName);
      return { success: true, data };
    } catch (error) {
      console.error('[Project WS] Error validating branch name:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'WebSocket error'
      };
    }
  },

  getBranchHierarchy: async (projectId: string) => {
    try {
      const data = await wsApi.branchModel.hierarchy(projectId);
      return { success: true, data };
    } catch (error) {
      console.error('[Project WS] Error getting branch hierarchy:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'WebSocket error'
      };
    }
  },

  createFeatureBranch: async (projectId: string, taskId: string, baseBranch?: string) => {
    try {
      const data = await wsApi.branchModel.createFeature(projectId, taskId, baseBranch);
      return { success: true, data };
    } catch (error) {
      console.error('[Project WS] Error creating feature branch:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'WebSocket error'
      };
    }
  },

  createReleaseBranch: async (projectId: string, version: string, baseBranch?: string) => {
    try {
      const data = await wsApi.branchModel.createRelease(projectId, version, baseBranch);
      return { success: true, data };
    } catch (error) {
      console.error('[Project WS] Error creating release branch:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'WebSocket error'
      };
    }
  },

  createHotfixBranch: async (projectId: string, name: string, tag: string) => {
    try {
      const data = await wsApi.branchModel.createHotfix(projectId, name, tag);
      return { success: true, data };
    } catch (error) {
      console.error('[Project WS] Error creating hotfix branch:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'WebSocket error'
      };
    }
  }
};
