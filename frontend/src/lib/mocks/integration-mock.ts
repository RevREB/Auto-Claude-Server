/**
 * Integration operations - calls backend via WebSocket
 */

import { wsService } from '../websocket-service';

export const integrationMock = {
  // Environment Configuration Operations
  getProjectEnv: async (projectId: string) => {
    try {
      const data = await wsService.send('integration.getProjectEnv', { projectId });
      return { success: true, data };
    } catch (error) {
      return {
        success: true,
        data: {
          claudeAuthStatus: 'not_configured' as const,
          linearEnabled: false,
          githubEnabled: false,
          graphitiEnabled: false,
          enableFancyUi: true
        }
      };
    }
  },

  updateProjectEnv: async (projectId: string, env: Record<string, unknown>) => {
    try {
      await wsService.send('integration.updateProjectEnv', { projectId, env });
      return { success: true };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Failed to update env' };
    }
  },

  // Auto-Build Source Environment Operations
  getSourceEnv: async () => {
    try {
      const data = await wsService.send('integration.getSourceEnv', {});
      return { success: true, data };
    } catch (error) {
      return {
        success: true,
        data: {
          hasClaudeToken: true,
          envExists: true,
          sourcePath: '/app/auto-claude'
        }
      };
    }
  },

  updateSourceEnv: async (env: Record<string, unknown>) => {
    try {
      await wsService.send('integration.updateSourceEnv', { env });
      return { success: true };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Failed to update env' };
    }
  },

  checkSourceToken: async () => {
    try {
      const data = await wsService.send('integration.checkSourceToken', {});
      return { success: true, data };
    } catch (error) {
      return { success: true, data: { hasToken: true, sourcePath: '/app/auto-claude' } };
    }
  },

  // Claude Authentication
  checkClaudeAuth: async () => {
    try {
      const data = await wsService.send('integration.checkClaudeAuth', {});
      return { success: true, data };
    } catch (error) {
      return {
        success: true,
        data: { success: false, authenticated: false, error: 'Not available' }
      };
    }
  },

  invokeClaudeSetup: async () => {
    try {
      const data = await wsService.send('integration.invokeClaudeSetup', {});
      return { success: true, data };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to invoke setup'
      };
    }
  },

  // Linear Integration Operations
  getLinearTeams: async () => {
    try {
      const data = await wsService.send('linear.getTeams', {});
      return { success: true, data };
    } catch (error) {
      return { success: true, data: [] };
    }
  },

  getLinearProjects: async (teamId: string) => {
    try {
      const data = await wsService.send('linear.getProjects', { teamId });
      return { success: true, data };
    } catch (error) {
      return { success: true, data: [] };
    }
  },

  getLinearIssues: async (projectId?: string, teamId?: string) => {
    try {
      const data = await wsService.send('linear.getIssues', { projectId, teamId });
      return { success: true, data };
    } catch (error) {
      return { success: true, data: [] };
    }
  },

  importLinearIssues: async (projectId: string, issueIds: string[]) => {
    try {
      const data = await wsService.send('linear.importIssues', { projectId, issueIds });
      return { success: true, data };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Failed to import issues' };
    }
  },

  checkLinearConnection: async () => {
    try {
      const data = await wsService.send('linear.checkConnection', {});
      return { success: true, data };
    } catch (error) {
      return { success: true, data: { connected: false, error: 'Not configured' } };
    }
  },

  // GitHub Integration Operations
  getGitHubRepositories: async () => {
    try {
      const data = await wsService.send('github.getRepositories', {});
      return { success: true, data };
    } catch (error) {
      console.error('[Integration] getGitHubRepositories error:', error);
      return { success: true, data: [] };
    }
  },

  getGitHubIssues: async (projectId?: string, repo?: string, state?: string, labels?: string[]) => {
    try {
      const data = await wsService.send('github.getIssues', { projectId, repo, state, labels });
      return { success: true, data };
    } catch (error) {
      console.error('[Integration] getGitHubIssues error:', error);
      return { success: true, data: [] };
    }
  },

  getGitHubIssue: async (projectId: string, issueNumber: number, repo?: string) => {
    try {
      const data = await wsService.send('github.getIssue', { projectId, issueNumber, repo });
      return { success: true, data };
    } catch (error) {
      console.error('[Integration] getGitHubIssue error:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Failed to get issue' };
    }
  },

  checkGitHubConnection: async () => {
    try {
      const data = await wsService.send('github.checkConnection', {});
      return { success: true, data };
    } catch (error) {
      return { success: true, data: { connected: false, error: 'Not available' } };
    }
  },

  investigateGitHubIssue: (projectId: string, issueNumber: number, repo?: string) => {
    wsService.send('github.investigateIssue', { projectId, issueNumber, repo }).catch(error => {
      console.error('[Integration] investigateGitHubIssue error:', error);
    });
  },

  getIssueComments: async (projectId: string, issueNumber: number, repo?: string) => {
    try {
      const data = await wsService.send('github.getIssueComments', { projectId, issueNumber, repo });
      return { success: true, data };
    } catch (error) {
      console.error('[Integration] getIssueComments error:', error);
      return { success: true, data: [] };
    }
  },

  importGitHubIssues: async (projectId: string, issueNumbers: number[], repo?: string) => {
    try {
      const data = await wsService.send('github.importIssues', { projectId, issueNumbers, repo });
      return { success: true, data };
    } catch (error) {
      console.error('[Integration] importGitHubIssues error:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Failed to import issues' };
    }
  },

  createGitHubRelease: async (projectId: string, version: string, notes?: string, draft?: boolean, prerelease?: boolean) => {
    try {
      const data = await wsService.send('github.createRelease', { projectId, version, notes, draft, prerelease });
      return { success: true, data };
    } catch (error) {
      console.error('[Integration] createGitHubRelease error:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Failed to create release' };
    }
  },

  // GitHub Investigation Event Listeners
  onGitHubInvestigationProgress: (callback: (projectId: string, data: unknown) => void) => {
    const handler = (event: { event: string; data: unknown }) => {
      const match = event.event?.match(/^github\.(.+)\.investigationProgress$/);
      if (match) {
        callback(match[1], event.data);
      }
    };
    return wsService.on('*', handler);
  },

  onGitHubInvestigationComplete: (callback: (projectId: string, data: unknown) => void) => {
    const handler = (event: { event: string; data: unknown }) => {
      const match = event.event?.match(/^github\.(.+)\.investigationComplete$/);
      if (match) {
        callback(match[1], event.data);
      }
    };
    return wsService.on('*', handler);
  },

  onGitHubInvestigationError: (callback: (projectId: string, error: string) => void) => {
    const handler = (event: { event: string; data: { error?: string } }) => {
      const match = event.event?.match(/^github\.(.+)\.investigationError$/);
      if (match) {
        callback(match[1], event.data?.error || 'Unknown error');
      }
    };
    return wsService.on('*', handler);
  },

  // GitHub OAuth Operations (gh CLI) - calls backend via WebSocket
  checkGitHubCli: async () => {
    try {
      const data = await wsService.send('github.checkCli', {});
      return { success: true, data };
    } catch (error) {
      console.error('[Integration] checkGitHubCli error:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Failed to check gh CLI' };
    }
  },

  checkGitHubAuth: async () => {
    try {
      const data = await wsService.send('github.checkAuth', {});
      return { success: true, data };
    } catch (error) {
      console.error('[Integration] checkGitHubAuth error:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Failed to check auth' };
    }
  },

  startGitHubAuth: async () => {
    try {
      const data = await wsService.send('github.startAuth', {});
      return { success: true, data };
    } catch (error) {
      console.error('[Integration] startGitHubAuth error:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Failed to start auth' };
    }
  },

  getGitHubToken: async () => {
    try {
      const data = await wsService.send('github.getToken', {});
      if (data.error) {
        return { success: false, error: data.error };
      }
      return { success: true, data };
    } catch (error) {
      console.error('[Integration] getGitHubToken error:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Failed to get token' };
    }
  },

  getGitHubUser: async () => {
    try {
      const data = await wsService.send('github.getUser', {});
      return { success: true, data };
    } catch (error) {
      console.error('[Integration] getGitHubUser error:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Failed to get user' };
    }
  },

  listGitHubUserRepos: async () => {
    try {
      const data = await wsService.send('github.listUserRepos', {});
      return { success: true, data };
    } catch (error) {
      console.error('[Integration] listGitHubUserRepos error:', error);
      return { success: true, data: { repos: [] } };
    }
  },

  detectGitHubRepo: async (projectId: string) => {
    try {
      const data = await wsService.send('github.detectRepo', { projectId });
      return { success: true, data };
    } catch (error) {
      console.error('[Integration] detectGitHubRepo error:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Failed to detect repo' };
    }
  },

  getGitHubBranches: async (projectId: string, repo?: string) => {
    try {
      const data = await wsService.send('github.getBranches', { projectId, repo });
      return { success: true, data };
    } catch (error) {
      console.error('[Integration] getGitHubBranches error:', error);
      return { success: true, data: [] };
    }
  },

  createGitHubRepo: async (repoName: string, options: { description?: string; isPrivate?: boolean; projectPath: string; owner?: string }) => {
    try {
      const data = await wsService.send('github.createRepo', { repoName, ...options });
      return { success: true, data };
    } catch (error) {
      console.error('[Integration] createGitHubRepo error:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Failed to create repo' };
    }
  },

  addGitRemote: async (projectPath: string, repoFullName: string) => {
    try {
      const data = await wsService.send('github.addRemote', { projectPath, repoFullName });
      return { success: true, data };
    } catch (error) {
      console.error('[Integration] addGitRemote error:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Failed to add remote' };
    }
  },

  listGitHubOrgs: async () => {
    try {
      const data = await wsService.send('github.listOrgs', {});
      return { success: true, data };
    } catch (error) {
      console.error('[Integration] listGitHubOrgs error:', error);
      return { success: true, data: { orgs: [] } };
    }
  }
};
