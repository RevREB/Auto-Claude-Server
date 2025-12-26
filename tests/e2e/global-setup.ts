/**
 * Global setup for E2E tests
 * Runs before all tests to ensure services are healthy
 */

import { FullConfig } from '@playwright/test';

// In Docker test environment, services are on internal network
// When running from playwright-tests container, use service names
// When running locally, use localhost with mapped ports
const isDocker = process.env.CI === 'true' || process.env.DOCKER_TEST === 'true';
const BACKEND_URL = process.env.API_URL || (isDocker ? 'http://backend-test:8000' : 'http://localhost:8001');
const FRONTEND_URL = process.env.BASE_URL || (isDocker ? 'http://frontend-test:80' : 'http://localhost:3001');
const MAX_RETRIES = 30;
const RETRY_DELAY = 2000;

async function waitForService(url: string, name: string): Promise<boolean> {
  console.log(`[Setup] Waiting for ${name} at ${url}...`);

  for (let i = 0; i < MAX_RETRIES; i++) {
    try {
      const response = await fetch(url, {
        method: 'GET',
        signal: AbortSignal.timeout(5000)
      });

      if (response.ok || response.status === 200) {
        console.log(`[Setup] ✓ ${name} is ready (status: ${response.status})`);
        return true;
      }
    } catch (error) {
      // Service not ready yet
    }

    if (i < MAX_RETRIES - 1) {
      console.log(`[Setup] ${name} not ready, retrying in ${RETRY_DELAY/1000}s... (${i + 1}/${MAX_RETRIES})`);
      await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
    }
  }

  console.error(`[Setup] ✗ ${name} failed to become ready after ${MAX_RETRIES} attempts`);
  return false;
}

async function globalSetup(config: FullConfig) {
  console.log('\n========================================');
  console.log('E2E Test Suite - Pre-flight Health Check');
  console.log('========================================\n');

  // Check backend health
  const backendReady = await waitForService(`${BACKEND_URL}/health`, 'Backend API');
  if (!backendReady) {
    throw new Error('Backend API is not healthy. Please ensure Docker containers are running.');
  }

  // Check frontend health
  const frontendReady = await waitForService(FRONTEND_URL, 'Frontend');
  if (!frontendReady) {
    throw new Error('Frontend is not healthy. Please ensure Docker containers are running.');
  }

  // Verify backend API root responds correctly
  try {
    const apiResponse = await fetch(`${BACKEND_URL}/`);
    const apiData = await apiResponse.json();
    console.log(`[Setup] ✓ Backend API version: ${apiData.version || 'unknown'}`);
  } catch (error) {
    console.warn('[Setup] ⚠ Could not verify API version');
  }

  // Create a test project for E2E tests
  try {
    const projectResponse = await fetch(`${BACKEND_URL}/api/projects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: 'e2e-test-project' })
    });

    if (projectResponse.ok) {
      console.log('[Setup] ✓ Test project created/exists');
    }
  } catch (error) {
    console.warn('[Setup] ⚠ Could not create test project (may already exist)');
  }

  console.log('\n[Setup] ✓ All services healthy - starting tests\n');
}

export default globalSetup;
