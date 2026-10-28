import { describe, expect, it } from 'vitest';
import { generateWorld } from '../../../src/world/WorldGenerator';
import { ENEMY_SPACING_TIERS } from '../../../src/world/generation/placement';

const LOOSEST = ENEMY_SPACING_TIERS[ENEMY_SPACING_TIERS.length - 1] ?? [6, 2];
const STRICTEST = ENEMY_SPACING_TIERS[0] ?? [12, 4];

describe('enemy spawn spacing', () => {
  const seeds = [1, 7, 42, 123, 456, 999, 1337, 2024, 4242, 9001, 31337, 555, 77, 88, 314, 2718, 1618, 6, 60, 600];
  for (const difficulty of ['easy', 'normal', 'hard'] as const) {
    it(`keeps the pack and the boss away from the player and spread out (${difficulty})`, () => {
      const [, gap] = LOOSEST;
      for (const seed of seeds) {
        const w = generateWorld({ seed, level: 1, difficulty });
        const dist = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);
        const boss = w.encounterSites?.find((e) => e.kind === 'nest');
        expect(boss, `seed ${seed}`).toBeDefined();
        if (boss) expect(dist(boss, { x: w.spawn.x + 0.5, y: w.spawn.y + 0.5 }), `boss seed ${seed}`).toBeGreaterThanOrEqual(24);
        const pack = w.enemySpawns.filter((e) => e.type !== 'beetle');
        // Cramped start islands push the extra enemies across rivers instead of
        // closer to the player, so every enemy keeps the full distance.
        for (const e of pack) expect(dist(e, w.spawn), `enemy seed ${seed}`).toBeGreaterThanOrEqual(STRICTEST[0]);
        for (let i = 0; i < pack.length; i++)
          for (let j = i + 1; j < pack.length; j++) expect(dist(pack[i]!, pack[j]!), `gap seed ${seed}`).toBeGreaterThanOrEqual(gap);
      }
    });
  }
});
