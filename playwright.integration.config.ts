import { defineConfig } from '@playwright/test';
import config from './playwright.world-art.config';
export default defineConfig({
  ...config,
  testMatch: ['landscape.spec.ts', 'player-running.spec.ts', 'visual-rendering.spec.ts'],
  use: { ...config.use, baseURL: 'http://localhost:4186' },
  webServer: {
    command: 'npm run preview -- --port 4186 --strictPort',
    port: 4186,
    reuseExistingServer: false,
  },
});
