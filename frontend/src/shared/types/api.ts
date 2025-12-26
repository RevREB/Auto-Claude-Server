/**
 * Backend API types
 */

import type { ApiResult } from './common';
import type {
  Project,
  ProjectSettings,
  AutoBuildVersionInfo,
  InitializationResult,
  CreateProjectFolderResult,
  FileNode,
  ProjectContextData,
  ProjectIndex,
  GraphitiMemoryStatus,
  ContextSearchResult,
  MemoryEpisode,
  ProjectEnvConfig,
  InfrastructureStatus,
  GraphitiValidationResult,
  GraphitiConnectionTestResult,
  GitStatus
} from './project';
import type {
  Task,
  TaskStatus,
  TaskStartOptions,
  ImplementationPlan,
  ExecutionProgress,
  WorktreeStatus,
  WorktreeDiff,
  WorktreeMergeResult,
  WorktreeDiscardResult,
  WorktreeListResult,
  TaskRecoveryResult,
  TaskRecoveryOptions,
  TaskMetadata,
  TaskLogs,
  TaskLogStreamChunk
} from './task';
import type {
  TerminalCreateOptions,
  TerminalSession,
  TerminalRestoreResult,
  SessionDateInfo,
  SessionDateRestoreResult,
  RateLimitInfo,
  SDKRateLimitInfo,
  RetryWithProfileRequest
} from './terminal';
import type {
  ClaudeProfileSettings,
  ClaudeProfile,
  ClaudeAutoSwitchSettings,
  ClaudeAuthResult,
  ClaudeUsageSnapshot
} from './agent';
import type { AppSettings, SourceEnvConfig, SourceEnvCheckResult, AutoBuildSourceUpdateCheck, AutoBuildSourceUpdateProgress } from './settings';
import type { AppUpdateInfo, AppUpdateProgress, AppUpdateAvailableEvent, AppUpdateDownloadedEvent } from './app-update';
import type {
  ChangelogTask,
  TaskSpecContent,
  ChangelogGenerationRequest,
  ChangelogGenerationResult,
  ChangelogSaveRequest,
  ChangelogSaveResult,
  ChangelogGenerationProgress,
  ExistingChangelog,
  GitBranchInfo,
  GitTagInfo,
  GitCommit,
  GitHistoryOptions,
  BranchDiffOptions,
  ReleaseableVersion,
  ReleasePreflightStatus,
  CreateReleaseRequest,
  CreateReleaseResult,
  ReleaseProgress
} from './changelog';
import type {
  IdeationSession,
  IdeationConfig,
  IdeationStatus,
  IdeationGenerationStatus,
  Idea,
  InsightsSession,
  InsightsSessionSummary,
  InsightsChatStatus,
  InsightsStreamChunk,
  InsightsModelConfig
} from './insights';
import type {
  Roadmap,
  RoadmapFeatureStatus,
  RoadmapGenerationStatus
} from './roadmap';
import type {
  LinearTeam,
  LinearProject,
  LinearIssue,
  LinearImportResult,
  LinearSyncStatus,
  GitHubRepository,
  GitHubIssue,
  GitHubSyncStatus,
  GitHubImportResult,
  GitHubInvestigationResult,
  GitHubInvestigationStatus
} from './integrations';

// Branch model types
export type BranchModelType = 'unknown' | 'flat' | 'worktree' | 'hierarchical';

export interface BranchModelInfo {
  model: BranchModelType;
  needsMigration: boolean;
  message: string;
}

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
  model: BranchModelType;
  needsMigration: boolean;
  message: string;
  status: BranchModelStatus;
}

export interface BranchModelStatusResult {
  status: BranchModelStatus;
  statusText: string;
}

export interface BranchModelMigrateResult {
  model: BranchModelType;
  branchesCreated: string[];
  branchesRenamed: string[];
  errors: string[];
  warnings: string[];
}

export interface BranchModelMigratePreviewResult {
  preview: string;
  branchesToCreate: string[];
  branchesToRename: string[];
  warnings: string[];
}

export interface BranchValidateResult {
  valid: boolean;
  error?: string;
  mergeTarget?: string | null;
}

export interface BranchHierarchy {
  main: string | null;
  releases: string[];
  dev: string | null;
  features: Record<string, string[]>;
}

// Electron API exposed via contextBridge
// Tab state interface (persisted in main process)
export interface TabState {
  openProjectIds: string[];
  activeProjectId: string | null;
  tabOrder: string[];
}

export interface BackendAPI {
  // Project operations
  addProject: (projectPath: string) => Promise<ApiResult<Project>>;
  removeProject: (projectId: string) => Promise<ApiResult>;
  getProjects: () => Promise<ApiResult<Project[]>>;
  updateProjectSettings: (projectId: string, settings: Partial<ProjectSettings>) => Promise<ApiResult>;
  initializeProject: (projectId: string) => Promise<ApiResult<InitializationResult>>;
  updateProjectAutoBuild: (projectId: string) => Promise<ApiResult<InitializationResult>>;
  checkProjectVersion: (projectId: string) => Promise<ApiResult<AutoBuildVersionInfo>>;

  // Tab State (persisted in main process for reliability)
  getTabState: () => Promise<ApiResult<TabState>>;
  saveTabState: (tabState: TabState) => Promise<ApiResult>;

  // Task operations
  getTasks: (projectId: string) => Promise<ApiResult<Task[]>>;
  createTask: (projectId: string, title: string, description: string, metadata?: TaskMetadata) => Promise<ApiResult<Task>>;
  deleteTask: (taskId: string) => Promise<ApiResult>;
  updateTask: (taskId: string, updates: { title?: string; description?: string }) => Promise<ApiResult<Task>>;
  startTask: (taskId: string, options?: TaskStartOptions) => void;
  stopTask: (taskId: string) => void;
  submitReview: (taskId: string, approved: boolean, feedback?: string) => Promise<ApiResult>;
  updateTaskStatus: (taskId: string, status: TaskStatus) => Promise<ApiResult>;
  recoverStuckTask: (taskId: string, options?: TaskRecoveryOptions) => Promise<ApiResult<TaskRecoveryResult>>;
  checkTaskRunning: (taskId: string) => Promise<ApiResult<boolean>>;

  // Workspace management (for human review)
  // Per-spec architecture: Each spec has its own worktree at .worktrees/{spec-name}/
  getWorktreeStatus: (taskId: string) => Promise<ApiResult<WorktreeStatus>>;
  getWorktreeDiff: (taskId: string) => Promise<ApiResult<WorktreeDiff>>;
  mergeWorktree: (taskId: string, options?: { noCommit?: boolean }) => Promise<ApiResult<WorktreeMergeResult>>;
  mergeWorktreePreview: (taskId: string) => Promise<ApiResult<WorktreeMergeResult>>;
  discardWorktree: (taskId: string) => Promise<ApiResult<WorktreeDiscardResult>>;
  listWorktrees: (projectId: string) => Promise<ApiResult<WorktreeListResult>>;

  // Task archive operations
  archiveTasks: (projectId: string, taskIds: string[], version?: string) => Promise<ApiResult<boolean>>;
  unarchiveTasks: (projectId: string, taskIds: string[]) => Promise<ApiResult<boolean>>;

  // Event listeners
  onTaskProgress: (callback: (taskId: string, plan: ImplementationPlan) => void) => () => void;
  onTaskError: (callback: (taskId: string, error: string) => void) => () => void;
  onTaskLog: (callback: (taskId: string, log: string) => void) => () => void;
  onTaskStatusChange: (callback: (taskId: string, status: TaskStatus) => void) => () => void;
  onTaskExecutionProgress: (callback: (taskId: string, progress: ExecutionProgress) => void) => () => void;

  // Terminal operations
  createTerminal: (options: TerminalCreateOptions) => Promise<ApiResult>;
  destroyTerminal: (id: string) => Promise<ApiResult>;
  sendTerminalInput: (id: string, data: string) => void;
  resizeTerminal: (id: string, cols: number, rows: number) => void;
  invokeClaudeInTerminal: (id: string, cwd?: string) => void;
  generateTerminalName: (command: string, cwd?: string) => Promise<ApiResult<string>>;

  // Terminal session management (persistence/restore)
  getTerminalSessions: (projectPath: string) => Promise<ApiResult<TerminalSession[]>>;
  restoreTerminalSession: (session: TerminalSession, cols?: number, rows?: number) => Promise<ApiResult<TerminalRestoreResult>>;
  clearTerminalSessions: (projectPath: string) => Promise<ApiResult>;
  resumeClaudeInTerminal: (id: string, sessionId?: string) => void;
  getTerminalSessionDates: (projectPath?: string) => Promise<ApiResult<SessionDateInfo[]>>;
  getTerminalSessionsForDate: (date: string, projectPath: string) => Promise<ApiResult<TerminalSession[]>>;
  restoreTerminalSessionsFromDate: (date: string, projectPath: string, cols?: number, rows?: number) => Promise<ApiResult<SessionDateRestoreResult>>;
  saveTerminalBuffer: (terminalId: string, serialized: string) => Promise<void>;

  // Terminal event listeners
  onTerminalOutput: (callback: (id: string, data: string) => void) => () => void;
  onTerminalExit: (callback: (id: string, exitCode: number) => void) => () => void;
  onTerminalTitleChange: (callback: (id: string, title: string) => void) => () => void;
  onTerminalClaudeSession: (callback: (id: string, sessionId: string) => void) => () => void;
  onTerminalRateLimit: (callback: (info: RateLimitInfo) => void) => () => void;
  /** Listen for OAuth authentication completion (token is auto-saved to profile, never exposed to frontend) */
  onTerminalOAuthToken: (callback: (info: {
    terminalId: string;
    profileId?: string;
    email?: string;
    success: boolean;
    message?: string;
    detectedAt: string
  }) => void) => () => void;

  // Claude profile management (multi-account support)
  getClaudeProfiles: () => Promise<ApiResult<ClaudeProfileSettings>>;
  saveClaudeProfile: (profile: ClaudeProfile) => Promise<ApiResult<ClaudeProfile>>;
  deleteClaudeProfile: (profileId: string) => Promise<ApiResult>;
  renameClaudeProfile: (profileId: string, newName: string) => Promise<ApiResult>;
  setActiveClaudeProfile: (profileId: string) => Promise<ApiResult>;
  /** Switch terminal to use a different Claude profile (restarts Claude with new config) */
  switchClaudeProfile: (terminalId: string, profileId: string) => Promise<ApiResult>;
  /** Initialize authentication for a Claude profile */
  initializeClaudeProfile: (profileId: string) => Promise<ApiResult>;
  /** Set OAuth token for a profile (used when capturing from terminal) */
  setClaudeProfileToken: (profileId: string, token: string, email?: string) => Promise<ApiResult>;
  /** Get auto-switch settings */
  getAutoSwitchSettings: () => Promise<ApiResult<ClaudeAutoSwitchSettings>>;
  /** Update auto-switch settings */
  updateAutoSwitchSettings: (settings: Partial<ClaudeAutoSwitchSettings>) => Promise<ApiResult>;
  /** Request usage fetch from a terminal (sends /usage command) */
  fetchClaudeUsage: (terminalId: string) => Promise<ApiResult>;
  /** Get the best available profile (for manual switching) */
  getBestAvailableProfile: (excludeProfileId?: string) => Promise<ApiResult<ClaudeProfile | null>>;
  /** Listen for SDK/CLI rate limit events (non-terminal) */
  onSDKRateLimit: (callback: (info: SDKRateLimitInfo) => void) => () => void;
  /** Retry a rate-limited operation with a different profile */
  retryWithProfile: (request: RetryWithProfileRequest) => Promise<ApiResult>;

  // Usage Monitoring (Proactive Account Switching)
  /** Request current usage snapshot */
  requestUsageUpdate: () => Promise<ApiResult<ClaudeUsageSnapshot | null>>;
  /** Listen for usage data updates */
  onUsageUpdated: (callback: (usage: ClaudeUsageSnapshot) => void) => () => void;
  /** Listen for proactive swap notifications */
  onProactiveSwapNotification: (callback: (notification: {
    fromProfile: { id: string; name: string };
    toProfile: { id: string; name: string };
    reason: string;
    usageSnapshot: ClaudeUsageSnapshot;
  }) => void) => () => void;

  // App settings
  getSettings: () => Promise<ApiResult<AppSettings>>;
  saveSettings: (settings: Partial<AppSettings>) => Promise<ApiResult>;

  // Dialog operations
  selectDirectory: () => Promise<string | null>;
  createProjectFolder: (location: string, name: string, initGit: boolean) => Promise<ApiResult<CreateProjectFolderResult>>;
  getDefaultProjectLocation: () => Promise<string | null>;

  // App info
  getAppVersion: () => Promise<string>;

  // Roadmap operations
  getRoadmap: (projectId: string) => Promise<ApiResult<Roadmap | null>>;
  getRoadmapStatus: (projectId: string) => Promise<ApiResult<{ isRunning: boolean }>>;
  saveRoadmap: (projectId: string, roadmap: Roadmap) => Promise<ApiResult>;
  generateRoadmap: (projectId: string, enableCompetitorAnalysis?: boolean, refreshCompetitorAnalysis?: boolean) => void;
  refreshRoadmap: (projectId: string, enableCompetitorAnalysis?: boolean, refreshCompetitorAnalysis?: boolean) => void;
  stopRoadmap: (projectId: string) => Promise<ApiResult>;
  updateFeatureStatus: (
    projectId: string,
    featureId: string,
    status: RoadmapFeatureStatus
  ) => Promise<ApiResult>;
  convertFeatureToSpec: (
    projectId: string,
    featureId: string
  ) => Promise<ApiResult<Task>>;

  // Roadmap event listeners
  onRoadmapProgress: (
    callback: (projectId: string, status: RoadmapGenerationStatus) => void
  ) => () => void;
  onRoadmapComplete: (
    callback: (projectId: string, roadmap: Roadmap) => void
  ) => () => void;
  onRoadmapError: (
    callback: (projectId: string, error: string) => void
  ) => () => void;
  onRoadmapStopped: (
    callback: (projectId: string) => void
  ) => () => void;

  // Context operations
  getProjectContext: (projectId: string) => Promise<ApiResult<ProjectContextData>>;
  refreshProjectIndex: (projectId: string) => Promise<ApiResult<ProjectIndex>>;
  getMemoryStatus: (projectId: string) => Promise<ApiResult<GraphitiMemoryStatus>>;
  searchMemories: (projectId: string, query: string) => Promise<ApiResult<ContextSearchResult[]>>;
  getRecentMemories: (projectId: string, limit?: number) => Promise<ApiResult<MemoryEpisode[]>>;

  // Environment configuration operations
  getProjectEnv: (projectId: string) => Promise<ApiResult<ProjectEnvConfig>>;
  updateProjectEnv: (projectId: string, config: Partial<ProjectEnvConfig>) => Promise<ApiResult>;
  checkClaudeAuth: (projectId: string) => Promise<ApiResult<ClaudeAuthResult>>;
  invokeClaudeSetup: (projectId: string) => Promise<ApiResult<ClaudeAuthResult>>;

  // Memory Infrastructure operations (LadybugDB - no Docker required)
  getMemoryInfrastructureStatus: (dbPath?: string) => Promise<ApiResult<InfrastructureStatus>>;
  listMemoryDatabases: (dbPath?: string) => Promise<ApiResult<string[]>>;
  testMemoryConnection: (dbPath?: string, database?: string) => Promise<ApiResult<GraphitiValidationResult>>;

  // Graphiti validation operations
  validateLLMApiKey: (provider: string, apiKey: string) => Promise<ApiResult<GraphitiValidationResult>>;
  testGraphitiConnection: (config: {
    dbPath?: string;
    database?: string;
    llmProvider: string;
    apiKey: string;
  }) => Promise<ApiResult<GraphitiConnectionTestResult>>;

  // Linear integration operations
  getLinearTeams: (projectId: string) => Promise<ApiResult<LinearTeam[]>>;
  getLinearProjects: (projectId: string, teamId: string) => Promise<ApiResult<LinearProject[]>>;
  getLinearIssues: (projectId: string, teamId?: string, projectId_?: string) => Promise<ApiResult<LinearIssue[]>>;
  importLinearIssues: (projectId: string, issueIds: string[]) => Promise<ApiResult<LinearImportResult>>;
  checkLinearConnection: (projectId: string) => Promise<ApiResult<LinearSyncStatus>>;

  // GitHub integration operations
  getGitHubRepositories: (projectId: string) => Promise<ApiResult<GitHubRepository[]>>;
  getGitHubIssues: (projectId: string, state?: 'open' | 'closed' | 'all') => Promise<ApiResult<GitHubIssue[]>>;
  getGitHubIssue: (projectId: string, issueNumber: number) => Promise<ApiResult<GitHubIssue>>;
  checkGitHubConnection: (projectId: string) => Promise<ApiResult<GitHubSyncStatus>>;
  investigateGitHubIssue: (projectId: string, issueNumber: number, selectedCommentIds?: number[]) => void;
  getIssueComments: (projectId: string, issueNumber: number) => Promise<ApiResult<Array<{ id: number; body: string; user: { login: string; avatar_url?: string }; created_at: string; updated_at: string }>>>;
  importGitHubIssues: (projectId: string, issueNumbers: number[]) => Promise<ApiResult<GitHubImportResult>>;
  createGitHubRelease: (
    projectId: string,
    version: string,
    releaseNotes: string,
    options?: { draft?: boolean; prerelease?: boolean }
  ) => Promise<ApiResult<{ url: string }>>;

  // GitHub OAuth operations (gh CLI)
  checkGitHubCli: () => Promise<ApiResult<{ installed: boolean; version?: string }>>;
  checkGitHubAuth: () => Promise<ApiResult<{ authenticated: boolean; username?: string }>>;
  startGitHubAuth: () => Promise<ApiResult<{
    success: boolean;
    message?: string;
    deviceCode?: string;
    authUrl?: string;
    browserOpened?: boolean;
    fallbackUrl?: string;
  }>>;
  getGitHubToken: () => Promise<ApiResult<{ token: string }>>;
  getGitHubUser: () => Promise<ApiResult<{ username: string; name?: string }>>;
  listGitHubUserRepos: () => Promise<ApiResult<{ repos: Array<{ fullName: string; description: string | null; isPrivate: boolean }> }>>;
  detectGitHubRepo: (projectPath: string) => Promise<ApiResult<string>>;
  getGitHubBranches: (repo: string, token: string) => Promise<ApiResult<string[]>>;
  createGitHubRepo: (
    repoName: string,
    options: { description?: string; isPrivate?: boolean; projectPath: string; owner?: string }
  ) => Promise<ApiResult<{ fullName: string; url: string }>>;
  addGitRemote: (
    projectPath: string,
    repoFullName: string
  ) => Promise<ApiResult<{ remoteUrl: string }>>;
  listGitHubOrgs: () => Promise<ApiResult<{ orgs: Array<{ login: string; avatarUrl?: string }> }>>;

  // GitHub event listeners
  onGitHubInvestigationProgress: (
    callback: (projectId: string, status: GitHubInvestigationStatus) => void
  ) => () => void;
  onGitHubInvestigationComplete: (
    callback: (projectId: string, result: GitHubInvestigationResult) => void
  ) => () => void;
  onGitHubInvestigationError: (
    callback: (projectId: string, error: string) => void
  ) => () => void;

  // Release operations
  getReleaseableVersions: (projectId: string) => Promise<ApiResult<ReleaseableVersion[]>>;
  runReleasePreflightCheck: (projectId: string, version: string) => Promise<ApiResult<ReleasePreflightStatus>>;
  createRelease: (request: CreateReleaseRequest) => void;

  // Release event listeners
  onReleaseProgress: (
    callback: (projectId: string, progress: ReleaseProgress) => void
  ) => () => void;
  onReleaseComplete: (
    callback: (projectId: string, result: CreateReleaseResult) => void
  ) => () => void;
  onReleaseError: (
    callback: (projectId: string, error: string) => void
  ) => () => void;

  // Ideation operations
  getIdeation: (projectId: string) => Promise<ApiResult<IdeationSession | null>>;
  generateIdeation: (projectId: string, config: IdeationConfig) => void;
  refreshIdeation: (projectId: string, config: IdeationConfig) => void;
  stopIdeation: (projectId: string) => Promise<ApiResult>;
  updateIdeaStatus: (projectId: string, ideaId: string, status: IdeationStatus) => Promise<ApiResult>;
  convertIdeaToTask: (projectId: string, ideaId: string) => Promise<ApiResult<Task>>;
  dismissIdea: (projectId: string, ideaId: string) => Promise<ApiResult>;
  dismissAllIdeas: (projectId: string) => Promise<ApiResult>;
  archiveIdea: (projectId: string, ideaId: string) => Promise<ApiResult>;
  deleteIdea: (projectId: string, ideaId: string) => Promise<ApiResult>;
  deleteMultipleIdeas: (projectId: string, ideaIds: string[]) => Promise<ApiResult>;

  // Ideation event listeners
  onIdeationProgress: (
    callback: (projectId: string, status: IdeationGenerationStatus) => void
  ) => () => void;
  onIdeationLog: (
    callback: (projectId: string, log: string) => void
  ) => () => void;
  onIdeationComplete: (
    callback: (projectId: string, session: IdeationSession) => void
  ) => () => void;
  onIdeationError: (
    callback: (projectId: string, error: string) => void
  ) => () => void;
  onIdeationStopped: (
    callback: (projectId: string) => void
  ) => () => void;
  onIdeationTypeComplete: (
    callback: (projectId: string, ideationType: string, ideas: Idea[]) => void
  ) => () => void;
  onIdeationTypeFailed: (
    callback: (projectId: string, ideationType: string) => void
  ) => () => void;

  // Auto Claude source update operations
  checkAutoBuildSourceUpdate: () => Promise<ApiResult<AutoBuildSourceUpdateCheck>>;
  downloadAutoBuildSourceUpdate: () => void;
  getAutoBuildSourceVersion: () => Promise<ApiResult<string>>;

  // Auto Claude source update event listeners
  onAutoBuildSourceUpdateProgress: (
    callback: (progress: AutoBuildSourceUpdateProgress) => void
  ) => () => void;

  // Electron app update operations
  checkAppUpdate: () => Promise<ApiResult<AppUpdateInfo | null>>;
  downloadAppUpdate: () => Promise<ApiResult>;
  installAppUpdate: () => void;

  // Electron app update event listeners
  onAppUpdateAvailable: (
    callback: (info: AppUpdateAvailableEvent) => void
  ) => () => void;
  onAppUpdateDownloaded: (
    callback: (info: AppUpdateDownloadedEvent) => void
  ) => () => void;
  onAppUpdateProgress: (
    callback: (progress: AppUpdateProgress) => void
  ) => () => void;

  // Shell operations
  openExternal: (url: string) => Promise<void>;

  // Auto Claude source environment operations
  getSourceEnv: () => Promise<ApiResult<SourceEnvConfig>>;
  updateSourceEnv: (config: { claudeOAuthToken?: string }) => Promise<ApiResult>;
  checkSourceToken: () => Promise<ApiResult<SourceEnvCheckResult>>;

  // Changelog operations
  getChangelogDoneTasks: (projectId: string, tasks?: Task[]) => Promise<ApiResult<ChangelogTask[]>>;
  loadTaskSpecs: (projectId: string, taskIds: string[]) => Promise<ApiResult<TaskSpecContent[]>>;
  generateChangelog: (request: ChangelogGenerationRequest) => void; // Async with progress events
  saveChangelog: (request: ChangelogSaveRequest) => Promise<ApiResult<ChangelogSaveResult>>;
  readExistingChangelog: (projectId: string) => Promise<ApiResult<ExistingChangelog>>;
  suggestChangelogVersion: (
    projectId: string,
    taskIds: string[]
  ) => Promise<ApiResult<{ version: string; reason: string }>>;
  suggestChangelogVersionFromCommits: (
    projectId: string,
    commits: import('./changelog').GitCommit[]
  ) => Promise<ApiResult<{ version: string; reason: string }>>;

  // Changelog git operations (for git-based changelog generation)
  getChangelogBranches: (projectId: string) => Promise<ApiResult<GitBranchInfo[]>>;
  getChangelogTags: (projectId: string) => Promise<ApiResult<GitTagInfo[]>>;
  getChangelogCommitsPreview: (
    projectId: string,
    options: GitHistoryOptions | BranchDiffOptions,
    mode: 'git-history' | 'branch-diff'
  ) => Promise<ApiResult<GitCommit[]>>;
  saveChangelogImage: (
    projectId: string,
    imageData: string,
    filename: string
  ) => Promise<ApiResult<{ relativePath: string; url: string }>>;
  readLocalImage: (
    projectPath: string,
    relativePath: string
  ) => Promise<ApiResult<string>>;

  // Changelog event listeners
  onChangelogGenerationProgress: (
    callback: (projectId: string, progress: ChangelogGenerationProgress) => void
  ) => () => void;
  onChangelogGenerationComplete: (
    callback: (projectId: string, result: ChangelogGenerationResult) => void
  ) => () => void;
  onChangelogGenerationError: (
    callback: (projectId: string, error: string) => void
  ) => () => void;

  // Insights operations
  getInsightsSession: (projectId: string) => Promise<ApiResult<InsightsSession | null>>;
  sendInsightsMessage: (projectId: string, message: string, modelConfig?: InsightsModelConfig) => void;
  clearInsightsSession: (projectId: string) => Promise<ApiResult>;
  createTaskFromInsights: (
    projectId: string,
    sessionId: string,
    messageId: string,
    title: string,
    description: string,
    metadata?: TaskMetadata
  ) => Promise<ApiResult<Task>>;
  listInsightsSessions: (projectId: string) => Promise<ApiResult<InsightsSessionSummary[]>>;
  newInsightsSession: (projectId: string) => Promise<ApiResult<InsightsSession>>;
  switchInsightsSession: (projectId: string, sessionId: string) => Promise<ApiResult<InsightsSession | null>>;
  deleteInsightsSession: (projectId: string, sessionId: string) => Promise<ApiResult>;
  renameInsightsSession: (projectId: string, sessionId: string, newTitle: string) => Promise<ApiResult>;
  updateInsightsModelConfig: (projectId: string, sessionId: string, modelConfig: InsightsModelConfig) => Promise<ApiResult>;

  // Insights event listeners
  onInsightsStreamChunk: (
    callback: (projectId: string, chunk: InsightsStreamChunk) => void
  ) => () => void;
  onInsightsStatus: (
    callback: (projectId: string, status: InsightsChatStatus) => void
  ) => () => void;
  onInsightsError: (
    callback: (projectId: string, error: string) => void
  ) => () => void;

  // Task logs operations
  getTaskLogs: (projectId: string, specId: string) => Promise<ApiResult<TaskLogs | null>>;
  watchTaskLogs: (projectId: string, specId: string) => Promise<ApiResult>;
  unwatchTaskLogs: (specId: string) => Promise<ApiResult>;

  // Task logs event listeners
  onTaskLogsChanged: (
    callback: (specId: string, logs: TaskLogs) => void
  ) => () => void;
  onTaskLogsStream: (
    callback: (specId: string, chunk: TaskLogStreamChunk) => void
  ) => () => void;

  // File explorer operations
  listDirectory: (dirPath: string) => Promise<ApiResult<FileNode[]>>;

  // Git operations
  getGitBranches: (projectPath: string) => Promise<ApiResult<string[]>>;
  getCurrentGitBranch: (projectPath: string) => Promise<ApiResult<string | null>>;
  detectMainBranch: (projectPath: string) => Promise<ApiResult<string | null>>;
  checkGitStatus: (projectPath: string) => Promise<ApiResult<GitStatus>>;
  initializeGit: (projectPath: string) => Promise<ApiResult<InitializationResult>>;
  skipGitSetup: (projectId: string) => Promise<ApiResult>;
  cloneGitRepo: (url: string, name?: string) => Promise<ApiResult<{ project: Project; message: string; branchModel?: BranchModelInfo }>>;

  // Branch model operations
  detectBranchModel: (projectId: string) => Promise<ApiResult<BranchModelDetectResult>>;
  getBranchModelStatus: (projectId: string) => Promise<ApiResult<BranchModelStatusResult>>;
  migrateBranchModel: (projectId: string) => Promise<ApiResult<BranchModelMigrateResult>>;
  previewBranchModelMigration: (projectId: string) => Promise<ApiResult<BranchModelMigratePreviewResult>>;
  validateBranchName: (projectId: string, branchName: string) => Promise<ApiResult<BranchValidateResult>>;
  getBranchHierarchy: (projectId: string) => Promise<ApiResult<BranchHierarchy>>;
  createFeatureBranch: (projectId: string, taskId: string, baseBranch?: string) => Promise<ApiResult<{ branchName: string }>>;
  createSubtaskBranch: (projectId: string, taskId: string, subtaskId: string) => Promise<ApiResult<{ branchName: string }>>;
  createReleaseBranch: (projectId: string, version: string, baseBranch?: string) => Promise<ApiResult<{ branchName: string }>>;
  createHotfixBranch: (projectId: string, name: string, tag: string) => Promise<ApiResult<{ branchName: string }>>;

  // Ollama model detection operations
  checkOllamaStatus: (baseUrl?: string) => Promise<ApiResult<{
    running: boolean;
    url: string;
    version?: string;
    message?: string;
  }>>;
  listOllamaModels: (baseUrl?: string) => Promise<ApiResult<{
    models: Array<{
      name: string;
      size_bytes: number;
      size_gb: number;
      modified_at: string;
      is_embedding: boolean;
      embedding_dim?: number | null;
      description?: string;
    }>;
    count: number;
  }>>;
  listOllamaEmbeddingModels: (baseUrl?: string) => Promise<ApiResult<{
    embedding_models: Array<{
      name: string;
      embedding_dim: number | null;
      description: string;
      size_bytes: number;
      size_gb: number;
    }>;
    count: number;
  }>>;
  pullOllamaModel: (modelName: string, baseUrl?: string) => Promise<ApiResult<{
    model: string;
    status: 'started' | 'completed' | 'failed';
    message?: string;
    output?: string[];
  }>>;

  // Ollama Pull Progress Event Listeners
  onOllamaPullProgress?: (callback: (data: { model: string; status: string; digest: string; total: number; completed: number }) => void) => (() => void) | undefined;
  onOllamaPullComplete?: (callback: (data: { model: string; success: boolean }) => void) => (() => void) | undefined;
  onOllamaPullError?: (callback: (data: { model: string; error: string }) => void) => (() => void) | undefined;
}

declare global {
  interface Window {
    api: BackendAPI;
    DEBUG: boolean;
  }
}
