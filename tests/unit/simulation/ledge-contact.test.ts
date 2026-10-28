import { describe, expect, it } from 'vitest';
import { Simulation } from '../../../src/simulation/Simulation';
import { IDLE_INTENT } from '../../../src/types/entities';
import { Tile } from '../../../src/types/tiles';
import { canOccupy, moveWithCollision, queryColliders } from '../../../src/systems/CollisionSystem';
import { entityFootprint, PLAYER_FOOTPRINT } from '../../../src/systems/EntityFootprint';
import { hillCollisionBounds } from '../../../src/world/HillCollisionGeometry';
import { makeWorld } from '../game/fakes';
function hill() {
  const world = {
    ...makeWorld(),
    meta: { ...makeWorld().meta, width: 16, height: 16 },
    tiles: new Uint8Array(256).fill(Tile.GRASS),
    spawn: { x: 6, y: 6 },
  };
  for (let y = 4; y <= 10; y++)
    for (let x = 4; x <= 10; x++) world.tiles[y * 16 + x] = Tile.PLATEAU;
  world.tiles[7 * 16 + 4] = Tile.STAIRS;
  const s = new Simulation();
  s.loadWorld(world);
  s.setPlayerPosition(7.5, 7);
  return s;
}

describe('walking on the actual hill rim', () => {
  for (const fps of [30, 60, 144])
    for (const [dx, dy, expected] of [
      [0, 1, 10 + 12 / 32 - (PLAYER_FOOTPRINT.offsetY + PLAYER_FOOTPRINT.halfHeight)],
      [0, -1, 4 + 1 / 32 - PLAYER_FOOTPRINT.offsetY + PLAYER_FOOTPRINT.halfHeight],
      [1, 0, 11 - 6 / 32 - PLAYER_FOOTPRINT.halfWidth],
      [-1, 0, 4 + 6 / 32 + PLAYER_FOOTPRINT.halfWidth],
    ] as const) {
      it(`stops at the visible rim ${dx},${dy}, ${fps}Hz without pushing back`, () => {
        const s = hill();
        if (dx < 0) s.setPlayerPosition(7.5, 6.5);
        for (let i = 0; i < fps * 2; i++) s.step(1 / fps, { ...IDLE_INTENT, moveX: dx, moveY: dy });
        expect(dx ? s.player.x : s.player.y).toBeCloseTo(expected, 7);
        expect(canOccupy(s.world, s.player.x, s.player.y, entityFootprint(s.player))).toBe(true);
        const stopped = { x: s.player.x, y: s.player.y };
        for (let i = 0; i < fps; i++) s.step(1 / fps, { ...IDLE_INTENT });
        expect(s.player.x).toBe(stopped.x);
        expect(s.player.y).toBe(stopped.y);
      });
    }
  it('slides along the south edge with sprint and frame spikes', () => {
    for (const steps of [1, 30, 60, 144]) {
      const s = hill();
      s.setPlayerPosition(6, 9.9);
      for (let i = 0; i < steps; i++) moveWithCollision(s.world, s.player, 3 / steps, 3 / steps);
      expect(s.player.x).toBeCloseTo(9);
      expect(s.player.y).toBeCloseTo(10.0625);
    }
  });
  it('keeps the raised rim walkable while the face remains solid', () => {
    const s = hill();
    expect(canOccupy(s.world, 7.5, 10, PLAYER_FOOTPRINT)).toBe(true);
    expect(canOccupy(s.world, 7.5, 10.4, PLAYER_FOOTPRINT)).toBe(false);
    expect(
      queryColliders(s.world, { minX: 7, minY: 10, maxX: 8, maxY: 11 }).some(
        (c) => c.source === 'cliff' && c.minY === 10.375,
      ),
    ).toBe(true);
  });
  it('preserves stairs as a ground-to-top route and jumps across the drop', () => {
    const s = hill();
    s.setPlayerPosition(2.5, 7.1);
    for (let i = 0; i < 60; i++) s.step(1 / 60, { ...IDLE_INTENT, moveX: 1 });
    expect(s.player.x).toBeGreaterThan(6);
    s.setPlayerPosition(7.5, 10);
    s.step(1 / 60, { ...IDLE_INTENT, jump: true, moveY: 1 });
    for (let i = 0; i < 35; i++) s.step(1 / 60, { ...IDLE_INTENT, moveY: 1 });
    expect(s.player.y).toBeGreaterThan(11);
    expect(s.player.isJumping).toBe(false);
  });
  it('closes every rounded corner against sprint diagonals', () => {
    for (const [dx, dy] of [
      [-1, -1],
      [1, -1],
      [-1, 1],
      [1, 1],
    ] as const) {
      const s = hill();
      s.setPlayerPosition(7.5, 7);
      for (let i = 0; i < 120; i++) {
        s.step(1 / 60, { ...IDLE_INTENT, moveX: dx, moveY: dy, sprint: true });
        expect(canOccupy(s.world, s.player.x, s.player.y, PLAYER_FOOTPRINT)).toBe(true);
      }
      expect(s.player.x).toBeGreaterThan(4);
      expect(s.player.x).toBeLessThan(11);
      expect(s.player.y).toBeGreaterThan(3.5);
      expect(s.player.y).toBeLessThan(10.5);
    }
  });
  it('keeps feet out of painted side rims along a diagonal staircase edge', () => {
    // Hill top where x + y <= 12: every edge cell is a step with an exposed east side.
    const world = {
      ...makeWorld(),
      meta: { ...makeWorld().meta, width: 16, height: 16 },
      tiles: new Uint8Array(256).fill(Tile.GRASS),
      spawn: { x: 4, y: 4 },
    };
    for (let y = 0; y < 16; y++)
      for (let x = 0; x < 16; x++) if (x + y <= 12) world.tiles[y * 16 + x] = Tile.PLATEAU;
    const f = PLAYER_FOOTPRINT;
    const sideRim = 6 / 32;
    for (const fps of [30, 60, 144])
      for (const [dx, dy] of [
        [1, 0],
        [1, -1],
        [1, 1],
      ] as const) {
        const s = new Simulation();
        s.loadWorld(world);
        s.setPlayerPosition(6.4, 6 + 6 / 32 - f.offsetY);
        for (let i = 0; i < fps * 2; i++) {
          s.step(1 / fps, { ...IDLE_INTENT, moveX: dx, moveY: dy, sprint: true });
          expect(canOccupy(s.world, s.player.x, s.player.y, f)).toBe(true);
          const minY = s.player.y + f.offsetY - f.halfHeight,
            maxY = s.player.y + f.offsetY + f.halfHeight,
            maxX = s.player.x + f.offsetX + f.halfWidth;
          for (let row = Math.floor(minY); row <= Math.floor(maxY); row++) {
            const step = 12 - row; // raised edge cell on this row; its east side is exposed
            if (maxX > step && maxX < step + 1 + sideRim)
              expect(maxX).toBeLessThanOrEqual(step + 1 - sideRim + 1e-9);
          }
        }
      }
    const s = new Simulation();
    s.loadWorld(world);
    s.setPlayerPosition(6.4, 6 + 6 / 32 - f.offsetY);
    for (let i = 0; i < 120; i++) s.step(1 / 60, { ...IDLE_INTENT, moveX: 1 });
    expect(s.player.x).toBeCloseTo(7 - sideRim - f.halfWidth, 7);
  });
  it('emits valid bounded geometry for all adjacency masks', () => {
    for (let mask = 0; mask < 256; mask++) {
      for (const b of hillCollisionBounds(Tile.HILL_N, mask)) {
        expect(b.minX).toBeGreaterThanOrEqual(0);
        expect(b.minY).toBeGreaterThanOrEqual(0);
        expect(b.maxX).toBeLessThanOrEqual(1);
        expect(b.maxY).toBeLessThanOrEqual(1);
        expect(b.maxX).toBeGreaterThan(b.minX);
        expect(b.maxY).toBeGreaterThan(b.minY);
      }
      expect(hillCollisionBounds(Tile.STAIRS, mask)).toHaveLength(0);
    }
  });
  it('restores a valid position saved on the rim without relocating it', () => {
    const s = hill();
    s.setPlayerPosition(7.5, 10.0625);
    const entities = structuredClone([...s.getEntities()]);
    s.loadWorld(s.world);
    s.restoreEntities(entities, 0.3, 0, 0);
    expect(s.player.x).toBe(7.5);
    expect(s.player.y).toBe(10.0625);
  });
});
