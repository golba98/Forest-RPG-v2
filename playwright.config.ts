import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright E2E configuration for Forest RPG V2.
 * Hardware-accelerated WebGL configuration utilizing host NVIDIA RTX 4080
 * and pre-cached browser binaries in ~/.cache/ms-playwright.
 */
export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30000,
  expect: {
    timeout: 5000,
  },
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [
    ['list'],
    ['html', { open: 'never', outputFolder: 'playwright-report' }],
  ],
  use: {
    baseURL: 'http://localhost:4311',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    viewport: { width: 1280, height: 720 },
    launchOptions: {
      args: [
        '--use-gl=angle',
        '--use-angle=gl',
        '--enable-webgl',
        '--ignore-gpu-blocklist',
        '--enable-gpu-rasterization',
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--mute-audio',
      ],
    },
  },
  projects: [
    { name: 'firefox', use: { ...devices['Desktop Firefox'], launchOptions: { args: [], firefoxUserPrefs: { 'media.volume_scale': '0.0' } } } },
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        // Fall back to system Google Chrome if channel specified
        channel: (process.env.PLAYWRIGHT_CHANNEL as string | undefined) || undefined,
      },
    },
  ],
  // Points to Vite preview server running the production bundle
  webServer: {
    command: 'npm run preview -- --host localhost --port 4311 --strictPort',
    url: 'http://localhost:4311',
    reuseExistingServer: false,
    timeout: 120000,
  },
});
