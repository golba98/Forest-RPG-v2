import { entityFootprint } from '../../../src/systems/EntityFootprint';
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
      it(`blocks walking into a cliff edge ${dx},${dy} at ${fps}Hz, with sprint`, () => {
        const world = { ...makeWorld(), spawn: { x: 1, y: 1 } };
        world.tiles[4 * 8 + 4] = Tile.HILL_S;
        const s = new Simulation();
        s.loadWorld(world);
        s.setPlayerPosition(4.5 - dx * 1.2, 4.5 - dy * 1.2);
        for (let i = 0; i < fps; i++) {
          s.step(1 / fps, { ...IDLE_INTENT, moveX: dx, moveY: dy, sprint: true });
          expect(canOccupy(world, s.player.x, s.player.y, entityFootprint(s.player))).toBe(true);
        }
        // Rounded corners permit legitimate sliding around an isolated cell.
        // Every intermediate footprint above must still remain outside solids.
        if (!dx || !dy) {
          expect(dx === 0 || Math.sign(s.player.x - 4.5) !== Math.sign(dx)).toBe(true);
          expect(dy === 0 || Math.sign(s.player.y - 4.5) !== Math.sign(dy)).toBe(true);
        }
      });
  it('lets a jump carry the player over a cliff edge onto the hill top', () => {
    const w = makeWorld();
    for (let y = 0; y < 8; y++) {
      w.tiles[y * 8 + 4] = Tile.HILL_W;
      for (let x = 5; x < 8; x++) w.tiles[y * 8 + x] = Tile.PLATEAU;
    }
    const s = new Simulation();
    s.loadWorld(w);
    s.setPlayerPosition(3.5, 4.5);
    s.step(1 / 60, { ...IDLE_INTENT, jump: true, moveX: 1 });
    for (let i = 0; i < 40; i++) s.step(1 / 60, { ...IDLE_INTENT, moveX: 1 });
    expect(s.player.isJumping).toBe(false);
    expect(s.player.x).toBeGreaterThan(5.3);
    expect(canOccupy(w, s.player.x, s.player.y, entityFootprint(s.player))).toBe(true);
  });
  it('treats hill tops and stairs as walkable ground', () => {
    const w = makeWorld();
    for (let y = 0; y < 8; y++) w.tiles[y * 8 + 4] = Tile.HILL_W;
    w.tiles[4 * 8 + 4] = Tile.STAIRS;
    for (let y = 0; y < 8; y++) for (let x = 5; x < 8; x++) w.tiles[y * 8 + x] = Tile.PLATEAU;
    const s = new Simulation();
    s.loadWorld(w);
    s.setPlayerPosition(3.5, 4.5);
    for (let i = 0; i < 40; i++) s.step(1 / 60, { ...IDLE_INTENT, moveX: 1 });
    expect(s.player.x).toBeGreaterThan(6);
    expect(canOccupy(w, 6.5, 2.5, 0.3, 'groundEnemy')).toBe(true);
  });
  it('stops a player walking south into a tree at the top of its canopy', () => {
    const w = {
      ...makeWorld(),
      props: [{ id: 1, kind: 'tree' as const, tileX: 4, tileY: 5, solid: true }],
    };
    const s = new Simulation();
    s.loadWorld(w);
    s.setPlayerPosition(4.5, 1.5);
    for (let i = 0; i < 60; i++) s.step(1 / 60, { ...IDLE_INTENT, moveY: 1 });
    // Canopy row starts at y = 4.4; the player's box (half 0.3) stops above it.
    expect(s.player.y).toBeLessThanOrEqual(4.1 + 1e-6);
  });
  it('allows exact contact without granting a hill exemption', () => {
    const w = makeWorld();
    for (let y = 0; y < 8; y++) w.tiles[y * 8 + 5] = Tile.HILL_W;
    const s = new Simulation();
    s.loadWorld(w);
    s.setPlayerPosition(4.7, 4.5);
    expect(canOccupy(w, 4.7, 4.5, 0.3)).toBe(true);
    for (let i = 0; i < 30; i++) s.step(1 / 60, { ...IDLE_INTENT, moveX: 1, moveY: -1 });
    expect(s.player.x).toBeCloseTo(4.78);
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
    expect(s.player.x).toBeCloseTo(3.78);
    expect(s.player.y).toBeCloseTo(3.6875);
    expect(canOccupy(w, s.player.x, s.player.y, entityFootprint(s.player))).toBe(true);
  });
  it('uses tree bodies and solid boulders independently of legacy decoration flags', () => {
    const w = {
      ...makeWorld(),
      props: [
        { id: 1, kind: 'tree' as const, tileX: 3, tileY: 3, solid: true },
        { id: 2, kind: 'rock_boulder' as const, tileX: 5, tileY: 3, solid: false },
      ],
    };
    // Trunk tile and the canopy row above it block; above the canopy is open.
    expect(canOccupy(w, 3.5, 2.2, 0.1)).toBe(true);
    expect(canOccupy(w, 3.5, 2.8, 0.1)).toBe(false);
    expect(canOccupy(w, 3.5, 3.8, 0.1)).toBe(false);
    expect(canOccupy(w, 5.5, 3.7, 0.3)).toBe(false);
    for (const [dx, dy] of directions) {
      const s = new Simulation();
      s.loadWorld(w);
      s.setPlayerPosition(5.5 - dx * 1.2, 3.7 - dy * 1.2);
      moveWithCollision(w, s.player, dx * 2, dy * 2);
      expect(canOccupy(w, s.player.x, s.player.y, entityFootprint(s.player))).toBe(true);
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
      expect(result[0]).toBeCloseTo(4.78);
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
        canOccupy(w, s.player.x, s.player.y, entityFootprint(s.player), profile),
        `${profile} step ${i}: ${s.player.x},${s.player.y}, input ${dx},${dy}`,
      ).toBe(true);
    }
  }
});
