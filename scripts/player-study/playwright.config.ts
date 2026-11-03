import { defineConfig } from '@playwright/test';
import path from 'node:path';
import base from '../../playwright.config';

process.env.PLAYER_FLOW_REVIEW = '1';
export default defineConfig({
  ...base,
  testDir: path.resolve('tests/e2e'),
  testMatch: ['player-flow-review.spec.ts', 'player-blink-review.spec.ts'],
  outputDir: path.resolve('artifacts/player-approved/browser'),
  reporter: [['list']],
  use: { ...base.use, baseURL: 'http://localhost:4330' },
  webServer: {
    cwd: path.resolve('.'),
    command: 'npx vite --config scripts/player-study/recovery.vite.mjs',
    url: 'http://localhost:4330',
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
