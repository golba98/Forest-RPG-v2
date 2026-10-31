import { defineConfig } from '@playwright/test';
import config from './playwright.config';
export default defineConfig({
  ...config,
  testMatch: ['player-running.spec.ts'],
  workers: 1,
  timeout: 90000,
  use: { ...config.use, baseURL: 'http://localhost:4183' },
  webServer: { command: 'npm run preview -- --port 4183', port: 4183, reuseExistingServer: true },
});
