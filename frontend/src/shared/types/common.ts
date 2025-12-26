/**
 * Common utility types shared across the application
 */

// API Result Types
export interface ApiResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}
