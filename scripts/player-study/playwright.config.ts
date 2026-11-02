import { defineConfig } from '@playwright/test';
import path from 'node:path';
import base from '../../playwright.config';

process.env.PLAYER_ART_STUDY = '1';
export default defineConfig({
  ...base,
  testDir: path.resolve('tests/e2e'),
  testMatch: 'player-study.spec.ts',
  outputDir: path.resolve('artifacts/player-rework/browser'),
  reporter: [['list']],
  use: { ...base.use, baseURL: 'http://localhost:4328' },
  webServer: {
    cwd: path.resolve('.'), command: 'npx vite --config scripts/player-study/vite.config.mjs',
    url: 'http://localhost:4328', reuseExistingServer: true, timeout: 120_000,
  },
});
