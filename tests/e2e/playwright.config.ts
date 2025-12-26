import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright configuration for Auto-Claude E2E tests
 * Optimized for Docker containerized environment
 */
export default defineConfig({
  testDir: './specs',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,

  // Global setup runs health checks before tests
  globalSetup: require.resolve('./global-setup'),

  // Test timeout - longer for integration tests
  timeout: 60000,
  expect: {
    timeout: 10000,
  },

  // Output directory for test artifacts (screenshots, traces)
  outputDir: 'test-artifacts',

  reporter: [
    ['html', { outputFolder: 'test-results/html' }],
    ['json', { outputFile: 'test-results/results.json' }],
    ['list']
  ],

  use: {
    baseURL: process.env.BASE_URL || 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    // API request context for backend calls
    extraHTTPHeaders: {
      'Accept': 'application/json',
    },
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
    },
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
    },
    // Mobile testing
    {
      name: 'Mobile Chrome',
      use: { ...devices['Pixel 5'] },
    },
  ],

  // Web server configuration for local development
  webServer: process.env.CI ? undefined : {
    command: 'docker-compose up',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 120 * 1000,
  },
});
