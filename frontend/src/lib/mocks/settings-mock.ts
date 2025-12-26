/**
 * Settings API implementation using WebSocket
 */

import { wsApi } from '../websocket-service';
import { DEFAULT_APP_SETTINGS } from '../../../shared/constants';
import type { AppSettings } from '../../../shared/types';

export const settingsMock = {
  getSettings: async () => {
    try {
      console.log('[Settings WS] Fetching settings');
      const data = await wsApi.settings.get();
      return { success: true, data: { ...DEFAULT_APP_SETTINGS, ...data } };
    } catch (err) {
      console.error('[Settings WS] Failed to fetch settings:', err);
      return { success: true, data: DEFAULT_APP_SETTINGS };
    }
  },

  saveSettings: async (updates: Partial<AppSettings>) => {
    try {
      console.log('[Settings WS] Saving settings:', Object.keys(updates));
      await wsApi.settings.update(updates);
      return { success: true };
    } catch (err) {
      console.error('[Settings WS] Failed to save settings:', err);
      return { success: false, error: String(err) };
    }
  },

  // App Info
  getAppVersion: async () => '0.1.0-browser',

  // App Update Operations (mock - no updates in browser mode)
  checkAppUpdate: async () => ({ success: true, data: null }),
  downloadAppUpdate: async () => ({ success: true }),
  installAppUpdate: () => { console.warn('[Settings WS] installAppUpdate called'); },

  // App Update Event Listeners (no-op in browser mode)
  onAppUpdateAvailable: () => () => {},
  onAppUpdateDownloaded: () => () => {},
  onAppUpdateProgress: () => () => {}
};
