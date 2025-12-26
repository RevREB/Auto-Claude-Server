/**
 * URL utilities for auto-detecting API and WebSocket endpoints.
 * Works in both development (localhost:8000) and production (same origin).
 */

/**
 * Get the base API URL.
 * - In production: uses current origin (relative URLs)
 * - In development: uses VITE_API_URL or localhost:8000
 */
export function getApiUrl(): string {
  // Check for explicit env override
  if (import.meta.env.VITE_API_URL) {
    return import.meta.env.VITE_API_URL;
  }

  // In production (served by nginx on same origin), use empty string for relative URLs
  if (typeof window !== 'undefined' && window.location.hostname !== 'localhost') {
    return '';
  }

  // Development fallback
  return 'http://localhost:8000';
}

/**
 * Get the WebSocket URL.
 * - In production: derives from current origin (wss:// for https://, ws:// for http://)
 * - In development: uses VITE_WS_URL or localhost:8000
 */
export function getWsUrl(): string {
  // Check for explicit env override
  if (import.meta.env.VITE_WS_URL) {
    return import.meta.env.VITE_WS_URL;
  }

  // Auto-detect from window.location
  if (typeof window !== 'undefined') {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host;

    // In production (not localhost), use current host
    if (window.location.hostname !== 'localhost') {
      return `${protocol}//${host}`;
    }
  }

  // Development fallback
  return 'ws://localhost:8000';
}

/**
 * Convert an HTTP URL to WebSocket URL.
 * http:// -> ws://
 * https:// -> wss://
 */
export function httpToWs(url: string): string {
  return url.replace(/^http/, 'ws');
}

// Export singleton instances for convenience
export const API_URL = getApiUrl();
export const WS_URL = getWsUrl();
