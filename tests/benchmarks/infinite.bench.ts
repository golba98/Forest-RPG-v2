import { bench, describe } from 'vitest';
import { ForestGenerator } from '../../src/world/infinite/ForestGenerator';
describe('streamed forest complete generation', () => {
  for (const chunkSize of [32, 64] as const) {
    const generator = new ForestGenerator({
      id: `bench-${chunkSize}`,
      seed: 42,
      generatorVersion: 13,
      biomeVersion: 1,
      chunkSize,
      level: 1,
      difficulty: 'normal',
    });
    let x = 0;
    bench(
      `${chunkSize}x${chunkSize}`,
      () => {
        generator.generate({ x: x++, y: -3 });
      },
      { time: 1500, iterations: 10 },
    );
  }
});
