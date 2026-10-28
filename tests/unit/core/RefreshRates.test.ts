import { describe, expect, it } from 'vitest';
import { GameLoop } from '../../../src/core/loop/GameLoop';
describe('simulation rate across display refresh rates', () => {
  for (const hz of [60, 120, 144, 170, 240]) it(`keeps 10 seconds of fixed simulation at ${hz} Hz`, () => {
    let elapsed = 0;
    const loop = new GameLoop({ onFixedUpdate: dt => { elapsed += dt; }, onRender: () => {} });
    loop.start(); loop.tick(0);
    for (let frame = 1; frame <= hz * 10; frame++) loop.tick(frame * 1000 / hz);
    loop.stop(); expect(elapsed).toBeCloseTo(10, 4);
  });
});
