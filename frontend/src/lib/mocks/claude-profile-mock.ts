/**
 * Claude Profile API implementation using WebSocket
 */

import { wsApi, wsService } from '../websocket-service';
import type { ClaudeProfile } from '../../../shared/types';

export const claudeProfileMock = {
  getClaudeProfiles: async () => {
    try {
      console.log('[Profile WS] Fetching profiles');
      const data = await wsApi.profiles.list();
      console.log('[Profile WS] Profiles fetched:', data.profiles?.length || 0);
      return {
        success: true,
        data: {
          profiles: data.profiles || [],
          activeProfileId: data.activeProfileId || (data.profiles?.length > 0 ? data.profiles[0].id : 'default')
        }
      };
    } catch (error) {
      console.error('[Profile WS] Error fetching profiles:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'WebSocket error'
      };
    }
  },

  saveClaudeProfile: async (profile: { id: string; name: string; oauthToken?: string; email?: string; isDefault?: boolean; createdAt?: Date; configDir?: string }) => {
    try {
      console.log('[Profile WS] Saving profile:', profile.id);
      const data = await wsApi.profiles.create(profile);
      console.log('[Profile WS] Profile saved');
      return { success: true, data };
    } catch (error) {
      console.error('[Profile WS] Error saving profile:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'WebSocket error'
      };
    }
  },

  deleteClaudeProfile: async (profileId: string) => {
    try {
      console.log('[Profile WS] Deleting profile:', profileId);
      await wsApi.profiles.delete(profileId);
      console.log('[Profile WS] Profile deleted');
      return { success: true };
    } catch (error) {
      console.error('[Profile WS] Error deleting profile:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'WebSocket error'
      };
    }
  },

  renameClaudeProfile: async (profileId: string, newName: string) => {
    try {
      console.log('[Profile WS] Renaming profile:', profileId, 'to', newName);
      // Use create/update to rename
      await wsApi.profiles.create({ id: profileId, name: newName });
      console.log('[Profile WS] Profile renamed');
      return { success: true };
    } catch (error) {
      console.error('[Profile WS] Error renaming profile:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'WebSocket error'
      };
    }
  },

  setActiveClaudeProfile: async (profileId: string) => {
    try {
      console.log('[Profile WS] Setting active profile:', profileId);
      await wsApi.profiles.activate(profileId);
      console.log('[Profile WS] Active profile set');
      return { success: true };
    } catch (error) {
      console.error('[Profile WS] Error setting active profile:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'WebSocket error'
      };
    }
  },

  switchClaudeProfile: async (profileId: string) => {
    try {
      console.log('[Profile WS] Switching to profile:', profileId);
      await wsApi.profiles.activate(profileId);
      console.log('[Profile WS] Profile switched');
      return { success: true };
    } catch (error) {
      console.error('[Profile WS] Error switching profile:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'WebSocket error'
      };
    }
  },

  initializeClaudeProfile: async (profileId: string) => {
    try {
      console.log('[Profile WS] Initializing OAuth:', profileId);
      const data = await wsApi.oauth.initiate(profileId);
      console.log('[Profile WS] OAuth initiated');
      return {
        success: true,
        data: {
          authUrl: data.auth_url,
          pollUrl: data.poll_url,
          profileId: data.profile_id,
          message: 'Click the link to authenticate with your Claude.ai subscription'
        }
      };
    } catch (error) {
      console.error('[Profile WS] Error initiating OAuth:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'WebSocket error'
      };
    }
  },

  setClaudeProfileToken: async (profileId: string, token: string, email?: string) => {
    try {
      console.log('[Profile WS] Setting profile token:', profileId);
      await wsApi.profiles.setToken(profileId, token, email);
      console.log('[Profile WS] Token set');
      return { success: true };
    } catch (error) {
      console.error('[Profile WS] Error setting token:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'WebSocket error'
      };
    }
  },

  getAutoSwitchSettings: async () => {
    try {
      console.log('[Profile WS] Fetching auto-switch settings');
      const data = await wsApi.profiles.getAutoSwitchSettings();
      return { success: true, data };
    } catch (error) {
      console.error('[Profile WS] Error fetching auto-switch settings:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'WebSocket error'
      };
    }
  },

  updateAutoSwitchSettings: async (settings: any) => {
    try {
      console.log('[Profile WS] Updating auto-switch settings');
      await wsApi.profiles.updateAutoSwitchSettings(settings);
      console.log('[Profile WS] Settings updated');
      return { success: true };
    } catch (error) {
      console.error('[Profile WS] Error updating auto-switch settings:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'WebSocket error'
      };
    }
  },

  fetchClaudeUsage: async (profileId: string) => {
    try {
      console.log('[Profile WS] Fetching usage:', profileId);
      const data = await wsApi.profiles.getUsage(profileId);
      return { success: true, data };
    } catch (error) {
      console.error('[Profile WS] Error fetching usage:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'WebSocket error'
      };
    }
  },

  getBestAvailableProfile: async () => {
    try {
      console.log('[Profile WS] Getting best available profile');
      // For now, return the active profile from the list
      const data = await wsApi.profiles.list();
      const activeProfile = data.profiles?.find((p: any) => p.id === data.activeProfileId) || data.profiles?.[0];
      return { success: true, data: activeProfile };
    } catch (error) {
      console.error('[Profile WS] Error getting best profile:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'WebSocket error'
      };
    }
  },

  onSDKRateLimit: () => () => {},

  retryWithProfile: async (profileId: string) => {
    try {
      console.log('[Profile WS] Retrying with profile:', profileId);
      await wsApi.profiles.activate(profileId);
      return { success: true };
    } catch (error) {
      console.error('[Profile WS] Error retrying with profile:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'WebSocket error'
      };
    }
  },

  requestUsageUpdate: async (profileId?: string) => {
    try {
      const profilesData = await wsApi.profiles.list();
      const activeProfileId = profileId || profilesData.activeProfileId;

      if (!activeProfileId) {
        return { success: false, error: 'No active profile found' };
      }

      // Find the profile to get its name
      const profile = profilesData.profiles?.find((p: { id: string }) => p.id === activeProfileId);
      const profileName = profile?.name || activeProfileId;

      console.log('[Profile WS] Requesting usage update:', activeProfileId);
      const usageData = await wsApi.profiles.refreshUsage(activeProfileId);

      // Transform from ClaudeUsageData format to ClaudeUsageSnapshot format
      const snapshot = {
        sessionPercent: usageData?.sessionUsagePercent ?? 0,
        weeklyPercent: usageData?.weeklyUsagePercent ?? 0,
        sessionResetTime: usageData?.sessionResetTime,
        weeklyResetTime: usageData?.weeklyResetTime,
        profileId: activeProfileId,
        profileName: profileName,
        fetchedAt: new Date(),
      };

      return { success: true, data: snapshot };
    } catch (error) {
      console.error('[Profile WS] Error requesting usage update:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'WebSocket error'
      };
    }
  },

  onUsageUpdated: (callback: (snapshot: any) => void) => {
    // Subscribe to usage.updated events from WebSocket
    return wsService.on('usage.updated', (data: any) => {
      console.log('[Profile WS] Usage update received:', data);
      callback(data);
    });
  },

  onProactiveSwapNotification: () => () => {}
};
