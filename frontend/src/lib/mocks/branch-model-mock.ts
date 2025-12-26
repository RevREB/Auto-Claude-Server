/**
 * Branch Model operations - calls backend via WebSocket
 */

import { wsService } from '../websocket-service';

export type BranchModelType = 'unknown' | 'flat' | 'worktree' | 'hierarchical';

export interface BranchModelStatus {
  model: BranchModelType;
  mainBranch: string | null;
  devBranch: string | null;
  releaseBranches: string[];
  featureBranches: string[];
  worktreeBranches: string[];
  issues: string[];
  canMigrate: boolean;
  migrationSteps: string[];
}

export interface BranchModelDetectResult {
  success: boolean;
  model?: BranchModelType;
  needsMigration?: boolean;
  message?: string;
  status?: BranchModelStatus;
  error?: string;
}

export interface BranchModelMigrateResult {
  success: boolean;
  model?: BranchModelType;
  branchesCreated?: string[];
  branchesRenamed?: string[];
  errors?: string[];
  warnings?: string[];
  error?: string;
}

export interface BranchModelMigratePreviewResult {
  success: boolean;
  preview?: string;
  branchesToCreate?: string[];
  branchesToRename?: string[];
  warnings?: string[];
  error?: string;
}

export interface BranchModelValidateResult {
  success: boolean;
  valid?: boolean;
  error?: string;
  mergeTarget?: string | null;
}

export interface BranchHierarchy {
  main: string | null;
  releases: string[];
  dev: string | null;
  features: Record<string, string[]>;
}

export interface BranchModelHierarchyResult {
  success: boolean;
  hierarchy?: BranchHierarchy;
  error?: string;
}

export interface CreateBranchResult {
  success: boolean;
  branchName?: string;
  error?: string;
}

export const branchModelMock = {
  /**
   * Detect the current branch model for a project
   */
  detect: async (projectId: string): Promise<BranchModelDetectResult> => {
    try {
      const data = await wsService.send('branchModel.detect', { projectId });
      return data as BranchModelDetectResult;
    } catch (error) {
      console.error('[BranchModel] detect error:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Failed to detect branch model' };
    }
  },

  /**
   * Get detailed branch model status
   */
  getStatus: async (projectId: string): Promise<{ success: boolean; status?: BranchModelStatus; statusText?: string; error?: string }> => {
    try {
      const data = await wsService.send('branchModel.status', { projectId });
      return data;
    } catch (error) {
      console.error('[BranchModel] getStatus error:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Failed to get status' };
    }
  },

  /**
   * Preview migration changes without applying them
   */
  migratePreview: async (projectId: string): Promise<BranchModelMigratePreviewResult> => {
    try {
      const data = await wsService.send('branchModel.migratePreview', { projectId });
      return data as BranchModelMigratePreviewResult;
    } catch (error) {
      console.error('[BranchModel] migratePreview error:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Failed to preview migration' };
    }
  },

  /**
   * Migrate to hierarchical branch model
   */
  migrate: async (projectId: string): Promise<BranchModelMigrateResult> => {
    try {
      const data = await wsService.send('branchModel.migrate', { projectId });
      return data as BranchModelMigrateResult;
    } catch (error) {
      console.error('[BranchModel] migrate error:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Failed to migrate' };
    }
  },

  /**
   * Validate a branch name against the hierarchical model
   */
  validate: async (projectId: string, branchName: string): Promise<BranchModelValidateResult> => {
    try {
      const data = await wsService.send('branchModel.validate', { projectId, branchName });
      return data as BranchModelValidateResult;
    } catch (error) {
      console.error('[BranchModel] validate error:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Failed to validate' };
    }
  },

  /**
   * Get the branch hierarchy tree
   */
  getHierarchy: async (projectId: string): Promise<BranchModelHierarchyResult> => {
    try {
      const data = await wsService.send('branchModel.hierarchy', { projectId });
      return data as BranchModelHierarchyResult;
    } catch (error) {
      console.error('[BranchModel] getHierarchy error:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Failed to get hierarchy' };
    }
  },

  /**
   * Create a feature branch for a task
   */
  createFeature: async (projectId: string, taskId: string, baseBranch?: string): Promise<CreateBranchResult> => {
    try {
      const data = await wsService.send('branchModel.createFeature', {
        projectId,
        taskId,
        baseBranch: baseBranch || 'dev'
      });
      return data as CreateBranchResult;
    } catch (error) {
      console.error('[BranchModel] createFeature error:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Failed to create feature branch' };
    }
  },

  /**
   * Create a subtask branch
   */
  createSubtask: async (projectId: string, taskId: string, subtaskId: string): Promise<CreateBranchResult> => {
    try {
      const data = await wsService.send('branchModel.createSubtask', { projectId, taskId, subtaskId });
      return data as CreateBranchResult;
    } catch (error) {
      console.error('[BranchModel] createSubtask error:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Failed to create subtask branch' };
    }
  },

  /**
   * Create a release branch
   */
  createRelease: async (projectId: string, version: string, baseBranch?: string): Promise<CreateBranchResult> => {
    try {
      const data = await wsService.send('branchModel.createRelease', {
        projectId,
        version,
        baseBranch: baseBranch || 'dev'
      });
      return data as CreateBranchResult;
    } catch (error) {
      console.error('[BranchModel] createRelease error:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Failed to create release branch' };
    }
  },

  /**
   * Create a hotfix branch from a tag
   */
  createHotfix: async (projectId: string, name: string, tag: string): Promise<CreateBranchResult> => {
    try {
      const data = await wsService.send('branchModel.createHotfix', { projectId, name, tag });
      return data as CreateBranchResult;
    } catch (error) {
      console.error('[BranchModel] createHotfix error:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Failed to create hotfix branch' };
    }
  },

  /**
   * Subscribe to branch model events for a project
   */
  onBranchModelChange: (projectId: string, callback: (data: { action: string; [key: string]: unknown }) => void) => {
    const handler = (event: { event: string; data: unknown }) => {
      if (event.event === `project.${projectId}.branchModel`) {
        callback(event.data as { action: string; [key: string]: unknown });
      }
    };

    return wsService.on('*', handler);
  },
};
