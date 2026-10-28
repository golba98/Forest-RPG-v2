import { describe, expect, it } from 'vitest';
import { Simulation } from '../../../src/simulation/Simulation';
import { IDLE_INTENT } from '../../../src/types/entities';
import { Tile } from '../../../src/types/tiles';
import {
  canOccupy,
  moveWithCollision,
  invalidatePropIndex,
} from '../../../src/systems/CollisionSystem';
import { makeWorld } from '../game/fakes';

const directions = [
  [0, -1],
  [-1, 0],
  [0, 1],
  [1, 0],
  [-1, -1],
  [1, -1],
  [-1, 1],
  [1, 1],
] as const;
describe('authoritative collision', () => {
  for (const [dx, dy] of directions)
    for (const fps of [30, 60, 144])
      it(`blocks hills ${dx},${dy} at ${fps}Hz, with sprint and jump`, () => {
        const world = { ...makeWorld(), spawn: { x: 1, y: 1 } };
        world.tiles[4 * 8 + 4] = Tile.PLATEAU;
        const s = new Simulation();
        s.loadWorld(world);
        s.setPlayerPosition(4.5 - dx * 1.2, 4.5 - dy * 1.2);
        for (let i = 0; i < fps; i++) {
          s.step(1 / fps, { ...IDLE_INTENT, moveX: dx, moveY: dy, sprint: true, jump: i === 0 });
          expect(canOccupy(world, s.player.x, s.player.y, 0.3)).toBe(true);
        }
        expect(dx === 0 || Math.sign(s.player.x - 4.5) !== Math.sign(dx)).toBe(true);
        expect(dy === 0 || Math.sign(s.player.y - 4.5) !== Math.sign(dy)).toBe(true);
      });
  it('allows exact contact without granting a hill exemption', () => {
    const w = makeWorld();
    for (let y = 0; y < 8; y++) w.tiles[y * 8 + 5] = Tile.HILL_W;
    const s = new Simulation();
    s.loadWorld(w);
    s.setPlayerPosition(4.7, 4.5);
    expect(canOccupy(w, 4.7, 4.5, 0.3)).toBe(true);
    for (let i = 0; i < 30; i++) s.step(1 / 60, { ...IDLE_INTENT, moveX: 1, moveY: -1 });
    expect(s.player.x).toBeCloseTo(4.7);
    expect(s.player.y).toBeLessThan(4.5);
  });
  it('prevents diagonal corner cutting and huge-delta tunnelling', () => {
    const w = makeWorld();
    w.tiles[3 * 8 + 4] = Tile.CLIFF;
    w.tiles[4 * 8 + 3] = Tile.CLIFF;
    const s = new Simulation();
    s.loadWorld(w);
    s.setPlayerPosition(3.5, 3.5);
    moveWithCollision(w, s.player, 100, 100);
    expect(s.player.x).toBeCloseTo(3.7);
    expect(s.player.y).toBeCloseTo(3.7);
    expect(canOccupy(w, s.player.x, s.player.y, 0.3)).toBe(true);
  });
  it('uses tree trunks and solid boulders independently of legacy decoration flags', () => {
    const w = {
      ...makeWorld(),
      props: [
        { id: 1, kind: 'tree' as const, tileX: 3, tileY: 3, solid: true },
        { id: 2, kind: 'rock_boulder' as const, tileX: 5, tileY: 3, solid: false },
      ],
    };
    expect(canOccupy(w, 3.5, 3.2, 0.1)).toBe(true);
    expect(canOccupy(w, 3.5, 3.8, 0.1)).toBe(false);
    expect(canOccupy(w, 5.5, 3.7, 0.3)).toBe(false);
    for (const [dx, dy] of directions) {
      const s = new Simulation();
      s.loadWorld(w);
      s.setPlayerPosition(5.5 - dx * 1.2, 3.7 - dy * 1.2);
      moveWithCollision(w, s.player, dx * 2, dy * 2);
      expect(canOccupy(w, s.player.x, s.player.y, 0.3)).toBe(true);
    }
    w.props.splice(1, 1);
    invalidatePropIndex(w);
    expect(canOccupy(w, 5.5, 3.7, 0.3)).toBe(true);
  });
  it('preserves bridges and decoration while ground enemies respect rivers', () => {
    const w = makeWorld();
    for (let y = 0; y < 8; y++) w.tiles[y * 8 + 4] = Tile.RIVER;
    w.tiles[4 * 8 + 4] = Tile.RAMP;
    expect(canOccupy(w, 4.5, 3.5, 0.3)).toBe(true);
    expect(canOccupy(w, 4.5, 3.5, 0.3, 'groundEnemy')).toBe(false);
    const s = new Simulation();
    s.loadWorld(w);
    s.setPlayerPosition(3.5, 4.5);
    moveWithCollision(w, s.player, 2, 0, 'groundEnemy');
    expect(s.player.x).toBeCloseTo(5.5);
  });
  it('gives equivalent collision results for different timestep partitions', () => {
    const w = makeWorld();
    for (let y = 0; y < 8; y++) w.tiles[y * 8 + 5] = Tile.CLIFF;
    const results = [];
    for (const steps of [1, 30, 60, 144]) {
      const s = new Simulation();
      s.loadWorld(w);
      s.setPlayerPosition(3.5, 3.5);
      for (let i = 0; i < steps; i++) moveWithCollision(w, s.player, 4 / steps, 2 / steps);
      results.push([s.player.x, s.player.y]);
    }
    for (const result of results) {
      expect(result[0]).toBeCloseTo(4.7);
      expect(result[1]).toBeCloseTo(5.5);
    }
  });
});

it('keeps swept motion outside solids over seeded arbitrary angles and frame spikes', async () => {
  const { Rng } = await import('../../../src/world/Rng');
  const rng = new Rng(20261028);
  const w = {
    ...makeWorld(),
    meta: { ...makeWorld().meta, width: 24, height: 24 },
    tiles: new Uint8Array(576).fill(Tile.GRASS),
    spawn: { x: 2, y: 2 },
  };
  for (let y = 0; y < 24; y++)
    for (let x = 0; x < 24; x++)
      if (x === 0 || y === 0 || x === 23 || y === 23 || (x > 4 && y > 4 && rng.nextFloat() < 0.22))
        w.tiles[y * 24 + x] = Tile.CLIFF;
  const s = new Simulation();
  s.loadWorld(w);
  for (const profile of ['player', 'groundEnemy', 'ghost'] as const) {
    s.setPlayerPosition(2.5, 2.5);
    for (let i = 0; i < 1000; i++) {
      const dx = (rng.nextFloat() - 0.5) * 16,
        dy = (rng.nextFloat() - 0.5) * 16;
      moveWithCollision(w, s.player, dx, dy, profile);
      expect(
        canOccupy(w, s.player.x, s.player.y, 0.3, profile),
        `${profile} step ${i}: ${s.player.x},${s.player.y}, input ${dx},${dy}`,
      ).toBe(true);
    }
  }
});
