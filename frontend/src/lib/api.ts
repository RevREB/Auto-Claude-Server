/**
 * Clean API service for frontend-backend communication.
 * Direct WebSocket calls - no Electron abstraction.
 */

import { wsService } from './websocket-service';

// ============================================================================
// TASKS API
// ============================================================================

export const tasksApi = {
  list: async (projectId: string) => {
    return wsService.send('tasks.list', { projectId });
  },

  create: async (projectId: string, title: string, description: string) => {
    return wsService.send('tasks.create', { projectId, title, description });
  },

  update: async (taskId: string, updates: { title?: string; description?: string }) => {
    return wsService.send('tasks.update', { taskId, ...updates });
  },

  delete: async (taskId: string) => {
    return wsService.send('tasks.delete', { taskId });
  },

  start: async (taskId: string) => {
    return wsService.send('tasks.start', { taskId });
  },

  stop: async (taskId: string) => {
    return wsService.send('tasks.stop', { taskId });
  },

  getLogs: async (projectId: string, specId: string) => {
    return wsService.send('tasks.getLogs', { projectId, specId });
  },

  checkRunning: async (taskId: string) => {
    return wsService.send<{ running: boolean }>('tasks.checkRunning', { taskId });
  },

  review: async (taskId: string, approved: boolean, feedback?: string) => {
    return wsService.send('tasks.review', { taskId, approved, feedback });
  },

  recover: async (taskId: string, options?: { targetStatus?: string; autoRestart?: boolean }) => {
    return wsService.send('tasks.recover', { taskId, ...options });
  },

  archive: async (taskIds: string[]) => {
    return wsService.send('tasks.archive', { taskIds });
  },

  unarchive: async (taskIds: string[]) => {
    return wsService.send('tasks.unarchive', { taskIds });
  },

  updateStatus: async (taskId: string, status: string) => {
    return wsService.send('tasks.updateStatus', { taskId, status });
  },
};

// ============================================================================
// PROJECTS API
// ============================================================================

export const projectsApi = {
  list: async () => {
    return wsService.send('projects.list', {});
  },

  create: async (path: string, settings?: Record<string, unknown>) => {
    return wsService.send('projects.create', { path, settings });
  },

  delete: async (projectId: string) => {
    return wsService.send('projects.delete', { projectId });
  },

  getDirectory: async (projectId: string, path?: string) => {
    return wsService.send('projects.getDirectory', { projectId, path });
  },

  updateSettings: async (projectId: string, settings: Record<string, unknown>) => {
    return wsService.send('projects.updateSettings', { projectId, settings });
  },

  initialize: async (projectId: string) => {
    return wsService.send('projects.initialize', { projectId });
  },

  getTabState: async () => {
    return wsService.send('projects.getTabState', {});
  },

  saveTabState: async (state: { openProjectIds: string[]; activeProjectId: string | null; tabOrder: string[] }) => {
    return wsService.send('projects.saveTabState', state);
  },

  createFolder: async (location: string, name: string, initGit?: boolean) => {
    return wsService.send('projects.createFolder', { location, name, initGit });
  },

  getDefaultLocation: async () => {
    return wsService.send('projects.getDefaultLocation', {});
  },

  getVersion: async (projectId: string) => {
    return wsService.send('projects.getVersion', { projectId });
  },

  updateAutoBuild: async (projectId: string) => {
    return wsService.send('projects.updateAutoBuild', { projectId });
  },
};

// ============================================================================
// WORKSPACE API (Worktrees for code review)
// ============================================================================

export interface WorktreeStatus {
  exists: boolean;
  branch?: string;
  baseBranch?: string;
  worktreePath?: string;
  commitCount?: number;
  filesChanged?: number;
  additions?: number;
  deletions?: number;
  error?: string;
}

export interface WorktreeFile {
  path: string;
  status: 'added' | 'modified' | 'deleted' | 'renamed';
  additions: number;
  deletions: number;
}

export interface WorktreeDiff {
  files: WorktreeFile[];
  summary: string;
}

export interface MergeResult {
  success: boolean;
  message: string;
  staged?: boolean;
  projectPath?: string;
  suggestedCommitMessage?: string;
}

export interface MergePreview {
  files: string[];
  conflicts: Array<{ file: string; type: string }>;
  summary: {
    totalFiles: number;
    conflictFiles: number;
    totalConflicts: number;
    autoMergeable: number;
  };
  gitConflicts?: {
    hasConflicts: boolean;
    commitsBehind: number;
    conflictingFiles: string[];
  };
  uncommittedChanges?: {
    hasChanges: boolean;
    files: string[];
    count: number;
  } | null;
}

export const workspaceApi = {
  getStatus: async (taskId: string): Promise<WorktreeStatus> => {
    console.log('[workspaceApi] getStatus called:', taskId);
    const result = await wsService.send<WorktreeStatus>('workspace.getStatus', { taskId });
    console.log('[workspaceApi] getStatus result:', result);
    return result;
  },

  getDiff: async (taskId: string): Promise<WorktreeDiff> => {
    console.log('[workspaceApi] getDiff called:', taskId);
    const result = await wsService.send<WorktreeDiff>('workspace.getDiff', { taskId });
    console.log('[workspaceApi] getDiff result:', result);
    return result;
  },

  merge: async (taskId: string, options?: { noCommit?: boolean }): Promise<MergeResult> => {
    console.log('[workspaceApi] merge called:', taskId, options);
    const result = await wsService.send<MergeResult>('workspace.merge', { taskId, ...options });
    console.log('[workspaceApi] merge result:', result);
    return result;
  },

  mergePreview: async (taskId: string): Promise<{ success: boolean; message: string; preview: MergePreview }> => {
    console.log('[workspaceApi] mergePreview called:', taskId);
    const result = await wsService.send<{ success: boolean; message: string; preview: MergePreview }>('workspace.mergePreview', { taskId });
    console.log('[workspaceApi] mergePreview result:', result);
    return result;
  },

  discard: async (taskId: string): Promise<{ success: boolean; message: string }> => {
    console.log('[workspaceApi] discard called:', taskId);
    const result = await wsService.send<{ success: boolean; message: string }>('workspace.discard', { taskId });
    console.log('[workspaceApi] discard result:', result);
    return result;
  },

  list: async (projectId: string): Promise<{ worktrees: Array<{ id: string; path: string }> }> => {
    console.log('[workspaceApi] list called:', projectId);
    const result = await wsService.send<{ worktrees: Array<{ id: string; path: string }> }>('workspace.list', { projectId });
    console.log('[workspaceApi] list result:', result);
    return result;
  },
};

// ============================================================================
// SETTINGS API
// ============================================================================

export const settingsApi = {
  get: async () => {
    return wsService.send('settings.get', {});
  },

  update: async (settings: Record<string, unknown>) => {
    return wsService.send('settings.update', settings);
  },
};

// ============================================================================
// GIT API
// ============================================================================

export const gitApi = {
  status: async (projectId: string) => {
    return wsService.send('git.status', { projectId });
  },

  branches: async (projectId: string) => {
    return wsService.send('git.branches', { projectId });
  },

  currentBranch: async (projectId: string) => {
    return wsService.send('git.currentBranch', { projectId });
  },

  mainBranch: async (projectId: string) => {
    return wsService.send('git.mainBranch', { projectId });
  },

  initialize: async (projectId: string) => {
    return wsService.send('git.initialize', { projectId });
  },

  skipSetup: async (projectId: string) => {
    return wsService.send('git.skipSetup', { projectId });
  },
};

// ============================================================================
// PROFILES API
// ============================================================================

export const profilesApi = {
  list: async () => {
    return wsService.send('profiles.list', {});
  },

  create: async (profile: Record<string, unknown>) => {
    return wsService.send('profiles.create', profile);
  },

  delete: async (profileId: string) => {
    return wsService.send('profiles.delete', { profileId });
  },

  activate: async (profileId: string) => {
    return wsService.send('profiles.activate', { profileId });
  },

  setToken: async (profileId: string, token: string, email?: string) => {
    return wsService.send('profiles.setToken', { profileId, token, email });
  },

  getUsage: async (profileId: string) => {
    return wsService.send('profiles.getUsage', { profileId });
  },

  refreshUsage: async (profileId: string) => {
    return wsService.send('profiles.refreshUsage', { profileId });
  },

  getAutoSwitchSettings: async () => {
    return wsService.send('profiles.getAutoSwitchSettings', {});
  },

  updateAutoSwitchSettings: async (settings: Record<string, unknown>) => {
    return wsService.send('profiles.updateAutoSwitchSettings', settings);
  },
};

// ============================================================================
// OAUTH API
// ============================================================================

export const oauthApi = {
  initiate: async (profileId: string) => {
    return wsService.send('oauth.initiate', { profileId });
  },

  status: async (profileId: string) => {
    return wsService.send('oauth.status', { profileId });
  },
};

// ============================================================================
// GITHUB API
// ============================================================================

export const githubApi = {
  authStatus: async () => {
    return wsService.send('github.authStatus', {});
  },

  login: async (token: string) => {
    return wsService.send('github.login', { token });
  },

  logout: async () => {
    return wsService.send('github.logout', {});
  },
};

// ============================================================================
// MERGE API (Hierarchical Branch Model)
// ============================================================================

export interface MergeConflict {
  file: string;
  conflictType: string;
  canAutoResolve: boolean;
}

export interface MergeOperationResult {
  success: boolean;
  message: string;
  commitSha?: string;
  mergedFiles?: string[];
  hadConflicts?: boolean;
  conflicts?: MergeConflict[];
}

export interface MergePreviewResult {
  success: boolean;
  canMerge?: boolean;
  sourceBranch?: string;
  targetBranch?: string;
  commitsAhead?: number;
  filesChanged?: number;
  additions?: number;
  deletions?: number;
  conflicts?: MergeConflict[];
  changedFiles?: Array<{ path: string; additions: number; deletions: number; status: string }>;
  error?: string;
}

export interface MergeStatusResult {
  success: boolean;
  branchExists?: boolean;
  featureBranch?: string;
  canMergeToDev?: boolean;
  commitsAhead?: number;
  filesChanged?: number;
  additions?: number;
  deletions?: number;
  hasConflicts?: boolean;
  error?: string;
}

export interface FeatureBranch {
  name: string;
  taskId: string;
  isSubtask: boolean;
}

export const mergeApi = {
  // Merge a subtask into its parent feature branch
  mergeSubtask: async (taskId: string, subtaskId: string, options?: { noCommit?: boolean; message?: string }): Promise<MergeOperationResult> => {
    return wsService.send<MergeOperationResult>('merge.subtask', { taskId, subtaskId, ...options });
  },

  // Merge a feature branch into dev
  mergeFeatureToDev: async (taskId: string, options?: { noCommit?: boolean; message?: string }): Promise<MergeOperationResult> => {
    return wsService.send<MergeOperationResult>('merge.featureToDev', { taskId, ...options });
  },

  // Preview a merge operation
  preview: async (taskId: string, sourceBranch?: string, targetBranch?: string): Promise<MergePreviewResult> => {
    return wsService.send<MergePreviewResult>('merge.preview', { taskId, sourceBranch, targetBranch });
  },

  // Get merge status for a task
  status: async (taskId: string): Promise<MergeStatusResult> => {
    return wsService.send<MergeStatusResult>('merge.status', { taskId });
  },

  // Ensure dev branch exists
  ensureDevBranch: async (projectId: string, baseBranch?: string): Promise<{ success: boolean; message?: string; error?: string }> => {
    return wsService.send('merge.ensureDevBranch', { projectId, baseBranch });
  },

  // Create a feature branch for a task
  createFeatureBranch: async (taskId: string, baseBranch?: string): Promise<{ success: boolean; branchName?: string; message?: string; error?: string }> => {
    return wsService.send('merge.createFeatureBranch', { taskId, baseBranch });
  },

  // List all feature branches for a project
  listFeatureBranches: async (projectId: string): Promise<{ success: boolean; branches: FeatureBranch[]; hasDevBranch?: boolean; error?: string }> => {
    return wsService.send('merge.listFeatureBranches', { projectId });
  },
};

// ============================================================================
// RELEASE API (Version Management)
// ============================================================================

export interface Release {
  version: string;
  branch: string;
  status: 'candidate' | 'promoted' | 'abandoned';
  tag?: string;
  releaseNotes?: string;
  tasks?: string[];
  commit?: {
    sha: string;
    date: string;
    message: string;
  };
}

export interface VersionInfo {
  current: string;
  next: string;
  bumpType: 'major' | 'minor' | 'patch';
  breakingChanges: string[];
  features: string[];
  fixes: string[];
}

export const releaseApi = {
  // List all releases for a project
  list: async (projectId: string): Promise<{ success: boolean; releases: Release[]; error?: string }> => {
    return wsService.send('release.list', { projectId });
  },

  // Get details of a specific release
  get: async (projectId: string, version: string): Promise<{ success: boolean; release?: Release; error?: string }> => {
    return wsService.send('release.get', { projectId, version });
  },

  // Create a new release candidate
  create: async (projectId: string, version: string, options?: { releaseNotes?: string; taskIds?: string[] }): Promise<{ success: boolean; release?: Partial<Release>; message?: string; error?: string }> => {
    return wsService.send('release.create', { projectId, version, ...options });
  },

  // Promote a release to main
  promote: async (projectId: string, version: string, options?: { createTag?: boolean; backMerge?: boolean }): Promise<{ success: boolean; tag?: string; commitSha?: string; message?: string; error?: string }> => {
    return wsService.send('release.promote', { projectId, version, ...options });
  },

  // Abandon a release
  abandon: async (projectId: string, version: string, deleteBranch?: boolean): Promise<{ success: boolean; message?: string; error?: string }> => {
    return wsService.send('release.abandon', { projectId, version, deleteBranch });
  },

  // Generate changelog for a release
  generateChangelog: async (projectId: string, version: string, taskIds: string[]): Promise<{ success: boolean; changelog?: string; error?: string }> => {
    return wsService.send('release.generateChangelog', { projectId, version, taskIds });
  },

  // Get current version
  currentVersion: async (projectId: string): Promise<{ success: boolean; version?: string; error?: string }> => {
    return wsService.send('version.current', { projectId });
  },

  // Calculate next version
  nextVersion: async (projectId: string, taskIds?: string[]): Promise<{ success: boolean; error?: string } & Partial<VersionInfo>> => {
    return wsService.send('version.next', { projectId, taskIds });
  },
};

// ============================================================================
// COMBINED API EXPORT
// ============================================================================

export const api = {
  tasks: tasksApi,
  projects: projectsApi,
  workspace: workspaceApi,
  settings: settingsApi,
  git: gitApi,
  profiles: profilesApi,
  oauth: oauthApi,
  github: githubApi,
  merge: mergeApi,
  release: releaseApi,
};

export default api;
