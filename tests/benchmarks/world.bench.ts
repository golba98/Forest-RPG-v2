import { bench, describe } from 'vitest';
import { generateWorld } from '../../src/world/WorldGenerator';
describe('150x150 world generation', () => {
  let seed = 100;
  bench('normal difficulty with varying seeds', () => {
    generateWorld({ seed: seed++, level: 1, difficulty: 'normal' });
  }, { time: 3000, iterations: 10 });
});
