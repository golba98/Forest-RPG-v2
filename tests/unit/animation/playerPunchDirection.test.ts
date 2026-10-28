import { describe, expect, it } from 'vitest';
import { InputManager } from '../../../src/core/input/InputManager';
import { IntentMapper } from '../../../src/game/IntentMapper';
import { Simulation } from '../../../src/simulation/Simulation';
import { EntityAnimator } from '../../../src/rendering/EntityAnimator';
import { resolveSpriteFrame } from '../../../src/animation/resolveSpriteFrame';
import { IDLE_INTENT, type EnemyEntity } from '../../../src/types/entities';
import { Tile } from '../../../src/types/tiles';
import { makeWorld } from '../game/fakes';

const diagonals = [
  { facing: 'NW', keys: ['KeyW', 'KeyA'], suffix: 'northeast', dx: -1, dy: -1 },
  { facing: 'NE', keys: ['KeyW', 'KeyD'], suffix: 'northwest', dx: 1, dy: -1 },
  { facing: 'SW', keys: ['KeyS', 'KeyA'], suffix: 'southeast', dx: -1, dy: 1 },
  { facing: 'SE', keys: ['KeyS', 'KeyD'], suffix: 'southwest', dx: 1, dy: 1 },
] as const;

function setup() {
  const simulation = new Simulation();
  const world = makeWorld();
  simulation.loadWorld({ ...world, meta: { ...world.meta, width: 40, height: 40 },
    tiles: new Uint8Array(1600).fill(Tile.GRASS), portal: { x: 38, y: 38 } });
  simulation.setPlayerPosition(20.5, 20.5);
  const input = new InputManager();
  const mapper = new IntentMapper();
  const animator = new EntityAnimator();
  const step = () => {
    simulation.step(1 / 60, mapper.nextIntent(input));
    input.clearFrameState(); mapper.endFrame(); animator.beginFrame();
    const view = simulation.buildRenderSnapshot().entities.find(e => e.id === simulation.player.id)!;
    return resolveSpriteFrame(animator.resolve(view, 1000 / 60));
  };
  const frames = (n: number) => { for (let i = 0; i < n; i++) step(); };
  return { simulation, input, step, frames };
}

describe('player punch direction through input, simulation and animation', () => {
  for (const d of diagonals) {
    for (const keys of [d.keys, [...d.keys].reverse()]) {
      it(`${keys.join(' then ')} keeps ${d.facing} through repeated and idle punches`, () => {
        const { simulation: s, input, step, frames } = setup();
        for (const key of keys) { input.simulateKeyDown(key); step(); }
        for (let punch = 0; punch < 3; punch++) {
          s.setPlayerPosition(20.5, 20.5);
          input.simulateKeyDown('KeyE');
          const ref = step();
          expect(s.player.facing).toBe(d.facing);
          expect(s.player.anim).toBe('attack');
          expect(ref.textureAlias).toBe(`player_attack_${d.suffix}`);
          expect(ref.flipX).toBe(false);
          input.simulateKeyUp('KeyE'); frames(23);
          expect(s.player.anim).toBe('walk');
          expect(Math.sign(s.player.x - 20.5)).toBe(d.dx);
          expect(Math.sign(s.player.y - 20.5)).toBe(d.dy);
        }
        for (const key of keys) input.simulateKeyUp(key);
        step(); expect(s.player.anim).toBe('idle');
        expect(s.player.facing).toBe(d.facing);
        input.simulateKeyDown('KeyE');
        expect(step().textureAlias).toBe(`player_attack_${d.suffix}`);
        expect(s.player.facing).toBe(d.facing);
      });
    }

    it(`${d.facing} damages the intended diagonal rather than its horizontal mirror`, () => {
      const { simulation: s, input, step, frames } = setup();
      for (const key of d.keys) input.simulateKeyDown(key);
      step();
      for (const key of d.keys) input.simulateKeyUp(key);
      const target = (dx: number) => {
        const id = s.spawnEnemy('mantis', s.player.x + dx, s.player.y + d.dy * Math.SQRT1_2 * 1.4);
        const e = s.getEntities().find(e => e.id === id) as EnemyEntity;
        e.aggressive = false;
        return e;
      };
      const ahead = target(d.dx * Math.SQRT1_2 * 1.4);
      const mirror = target(-d.dx * Math.SQRT1_2 * 1.4);
      const health = ahead.health;
      input.simulateKeyDown('KeyE');
      expect(step().textureAlias).toBe(`player_attack_${d.suffix}`);
      frames(5); expect(ahead.health).toBe(health); // Before the 120 ms strike.
      frames(3); expect(ahead.health).toBeLessThan(health);
      expect(mirror.health).toBe(health);
      expect(s.player.facing).toBe(d.facing);
    });
  }

  it('follows changes between left and right diagonals during the same attack', () => {
    const { simulation: s, input, step } = setup();
    input.simulateKeyDown('KeyW'); input.simulateKeyDown('KeyA');
    input.simulateKeyDown('KeyE'); step();
    for (const [vertical, horizontal, facing, suffix] of [
      ['KeyW', 'KeyD', 'NE', 'northwest'], ['KeyS', 'KeyA', 'SW', 'southeast'],
      ['KeyS', 'KeyD', 'SE', 'southwest'], ['KeyW', 'KeyA', 'NW', 'northeast'],
    ] as const) {
      for (const key of ['KeyW', 'KeyA', 'KeyS', 'KeyD']) input.simulateKeyUp(key);
      input.simulateKeyDown(vertical); input.simulateKeyDown(horizontal);
      const ref = step();
      expect(s.player.anim).toBe('attack');
      expect(s.player.facing).toBe(facing);
      expect(ref.textureAlias).toBe(`player_attack_${suffix}`);
      expect(ref.flipX).toBe(false);
    }
  });

  it('keeps idle aim assist when a target steps beside the player', () => {
    const { simulation: s } = setup();
    s.player.facing = 'S';
    s.spawnEnemy('mantis', s.player.x + 1.2, s.player.y);
    s.step(1 / 60, { ...IDLE_INTENT, attack: true });
    expect(s.player.facing).toBe('E');
    const view = s.buildRenderSnapshot().entities.find(e => e.id === s.player.id)!;
    expect(resolveSpriteFrame(view).textureAlias).toBe('player_attack_east');
  });
});
