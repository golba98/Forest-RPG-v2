import sharp from 'sharp';
import { expect, it } from 'vitest';
import { InputManager } from '../../../src/core/input/InputManager';
import { IntentMapper } from '../../../src/game/IntentMapper';
import { Simulation } from '../../../src/simulation/Simulation';
import { EntityAnimator } from '../../../src/rendering/EntityAnimator';
import { resolveSpriteFrame } from '../../../src/animation/resolveSpriteFrame';
import { Tile } from '../../../src/types/tiles';
import { makeWorld } from '../game/fakes';

const cases = [
  ['NW', ['KeyW', 'KeyA'], 'northwest', -1, -1],
  ['NE', ['KeyW', 'KeyD'], 'northeast', 1, -1],
  ['SW', ['KeyS', 'KeyA'], 'southwest', -1, 1],
  ['SE', ['KeyS', 'KeyD'], 'southeast', 1, 1],
  ['N', ['KeyW'], 'north', 0, -1],
  ['S', ['KeyS'], 'south', 0, 1],
  ['W', ['KeyA'], 'west', -1, 0],
  ['E', ['KeyD'], 'east', 1, 0],
] as const;

for (const [facing, keys, suffix, dx, dy] of cases)
  it(`${facing} running and walk/idle transitions keep the movement-facing artwork`, () => {
    const s = new Simulation();
    const world = makeWorld();
    s.loadWorld({
      ...world,
      meta: { ...world.meta, width: 40, height: 40 },
      tiles: new Uint8Array(1600).fill(Tile.GRASS),
      portal: { x: 38, y: 38 },
    });
    s.setPlayerPosition(20.5, 20.5);
    const input = new InputManager();
    const mapper = new IntentMapper();
    const animator = new EntityAnimator();
    const step = () => {
      s.step(1 / 60, mapper.nextIntent(input));
      input.clearFrameState();
      mapper.endFrame();
      animator.beginFrame();
      const view = s.buildRenderSnapshot().entities.find((e) => e.id === s.player.id)!;
      return resolveSpriteFrame(animator.resolve(view, 1000 / 60));
    };
    // Exercise both orders and more than one complete six-frame run cycle.
    for (const order of [keys, [...keys].reverse()]) {
      s.setPlayerPosition(20.5, 20.5);
      for (const key of order) {
        input.simulateKeyDown(key);
        step();
      }
      expect(step().textureAlias).toBe(`player_walk_${suffix}`);
      input.simulateKeyDown('ShiftLeft');
      const seen = new Set<number>();
      for (let i = 0; i < 50; i++) {
        const frame = step();
        expect(s.player.facing).toBe(facing);
        expect(s.player.anim).toBe('run');
        expect(frame.textureAlias).toBe(`player_run_${suffix}`);
        expect(frame.flipX).toBe(facing === 'SW');
        seen.add(frame.frame.x);
      }
      expect(seen.size).toBe(6);
      expect(Math.sign(s.player.x - 20.5)).toBe(dx);
      expect(Math.sign(s.player.y - 20.5)).toBe(dy);
      input.simulateKeyUp('ShiftLeft');
      expect(step().textureAlias).toBe(`player_walk_${suffix}`);
      for (const key of keys) input.simulateKeyUp(key);
      const idle = step();
      expect(idle.textureAlias).toBe(`player_idle_${suffix}`);
      expect(idle.flipX).toBe(false);
    }
  });

it('documents the duplicated source pixels requiring the southwest run correction', async () => {
  const root = 'public/assets/images/characters/player/run/run_';
  const sw = await sharp(`${root}southwest.png`).raw().toBuffer();
  const se = await sharp(`${root}southeast.png`).raw().toBuffer();
  expect(sw.equals(se)).toBe(true);
  // If the source is replaced with proper SW art, remove its runtime flip too.
  for (let frame = 0; frame < 6; frame++) {
    const view = { spriteKey: 'player', anim: 'run' as const, animTimeMs: frame * 112.5 };
    const left = resolveSpriteFrame({ ...view, facing: 'SW' });
    const right = resolveSpriteFrame({ ...view, facing: 'SE' });
    expect(left.frame).toEqual(right.frame);
    expect(left.flipX).not.toBe(right.flipX);
  }
});
