import { defineConfig } from '@playwright/test';
import base from './playwright.config';

/** Mandatory gameplay checks; historical art-study capture suites are opt-in. */
export default defineConfig(base, {
  testMatch: [
    'player-appearance.spec.ts',
    'player-directions.spec.ts',
    'player-blink.spec.ts',
    'player-flow.spec.ts',
    'world-library.spec.ts',
    'biome-walk.spec.ts',
    'biome-hills.spec.ts',
    'infinite-world.spec.ts',
    'infinite-persistence.spec.ts',
    'infinite-archive.spec.ts',
    'infinite-compatibility.spec.ts',
    'infinite-progression.spec.ts',
    'bridges.spec.ts',
    'world-art-loot.spec.ts',
    'save-flow.spec.ts',
    'startup.spec.ts',
  ],
  fullyParallel: false,
  workers: process.env.CI ? 1 : 2,
});
