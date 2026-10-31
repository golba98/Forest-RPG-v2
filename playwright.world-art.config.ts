import { defineConfig } from '@playwright/test';
import config from './playwright.config';
export default defineConfig({
  ...config,
  testMatch: ['world-art-loot.spec.ts', 'player-running.spec.ts', 'bridges.spec.ts', 'save-flow.spec.ts'],
  workers: 1,
  timeout: 90000,
  use: { ...config.use, baseURL: 'http://localhost:4183' },
  projects: [
    {
      name: 'chromium',
      use: {
        browserName: 'chromium',
        launchOptions: {
          args: [
            '--no-sandbox',
            '--use-gl=angle',
            '--use-angle=gl',
            '--enable-webgl',
            '--ignore-gpu-blocklist',
          ],
        },
      },
    },
    {
      name: 'firefox',
      use: {
        browserName: 'firefox',
        launchOptions: { args: [], firefoxUserPrefs: { 'media.volume_scale': '0.0' } },
      },
    },
  ],
  webServer: { command: 'npm run preview -- --port 4183', port: 4183, reuseExistingServer: true },
});
