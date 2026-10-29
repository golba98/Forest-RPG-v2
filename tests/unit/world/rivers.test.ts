import { describe, expect, it } from 'vitest';
import { Tile } from '../../../src/types/tiles';
import { GenGrid } from '../../../src/world/generation/GenGrid';
import { strokeRiver, smoothRiverDiagonals } from '../../../src/world/generation/rivers';
import { riverDefects, RiverField } from '../../../src/world/RiverTopology';
import { generateWorld } from '../../../src/world/WorldGenerator';
import { repairSavedRivers } from '../../../src/world/RepairRivers';
import { bridgeFixture } from '../../fixtures/bridge-world';
import { restoreSpawnClearing } from '../../../src/world/generation/placement';

it('strokes a continuous band through diagonal bends and chunk edges', () => {
  const grid = new GenGrid(48, 48, Tile.GRASS);
  strokeRiver(grid, [
    { x: 3.5, y: 3.5 },
    { x: 20.5, y: 20.5 },
    { x: 40.5, y: 14.5 },
  ]);
  const world = { tiles: grid.tiles, meta: { width: 48, height: 48 } };
  expect(riverDefects(world)).toEqual([]);
  const field = new RiverField(world);
  for (const [x, y] of [
    [15, 15],
    [16, 16],
    [19, 19],
    [20, 20],
  ]) {
    expect(grid.get(x!, y!)).toBe(Tile.RIVER);
    expect(field.depth[y! * 48 + x!]!).toBeGreaterThanOrEqual(1);
  }
});
it('repairs diagonals inside the central clearing and never deletes water during spawn restoration', () => {
  const g = new GenGrid(48, 48, Tile.GRASS);
  g.set(14, 16, Tile.RIVER);
  g.set(15, 17, Tile.RIVER);
  smoothRiverDiagonals(g);
  expect(g.get(15, 16)).toBe(Tile.RIVER);
  expect(g.get(14, 17)).toBe(Tile.RIVER);
  g.set(24, 24, Tile.RIVER);
  restoreSpawnClearing(g, { x: 24, y: 24 });
  expect(g.get(24, 24)).toBe(Tile.RIVER);
});
it('final selected seeds contain no corner contacts or isolated river cells', () => {
  for (const seed of [42, 123, 1, 1337]) {
    const w = generateWorld({ seed, level: 1, difficulty: 'normal' });
    expect(riverDefects(w), `seed ${seed}`).toEqual([]);
    const width = w.meta.width;
    for (let y = 1; y < w.meta.height - 1; y++)
      for (let x = 1; x < width - 1; x++) {
        const i = y * width + x;
        if (w.tiles[i] === Tile.RIVER)
          expect(
            [i - 1, i + 1, i - width, i + width].some((n) => w.tiles[n] === Tile.RIVER),
            `${seed}: ${x},${y}`,
          ).toBe(true);
      }
  }
}, 15000);

describe('saved channel repair', () => {
  function fixture() {
    const { world } = bridgeFixture();
    return { ...world, meta: { ...world.meta, generatorVersion: 8 } };
  }
  it('repairs safe local contacts once while keeping ponds, islands and bridge terrain', () => {
    const w = fixture();
    w.tiles[10 * 48 + 12] = Tile.RIVER;
    w.tiles[11 * 48 + 13] = Tile.RIVER;
    for (let y = 32; y <= 36; y++) for (let x = 4; x <= 8; x++) w.tiles[y * 48 + x] = Tile.RIVER;
    w.tiles[34 * 48 + 6] = Tile.GRASS;
    const repaired = repairSavedRivers(w, []);
    expect(repaired.tiles[10 * 48 + 13]).toBe(Tile.RIVER);
    expect(repaired.tiles[11 * 48 + 12]).toBe(Tile.RIVER);
    expect(repaired.tiles[34 * 48 + 6]).toBe(Tile.GRASS);
    expect(repaired.bridges).toBe(w.bridges);
    expect(repaired.tiles.slice(18 * 48 + 21, 18 * 48 + 24)).toEqual(
      w.tiles.slice(18 * 48 + 21, 18 * 48 + 24),
    );
    expect(repairSavedRivers(repaired, [])).toBe(repaired);
  });
  it('reports protected scenery and never mutates the original terrain', () => {
    const w = fixture();
    w.tiles[10 * 48 + 12] = Tile.RIVER;
    w.tiles[11 * 48 + 13] = Tile.RIVER;
    const blocked = {
      ...w,
      props: [{ id: 100, kind: 'rock_boulder' as const, tileX: 13, tileY: 10, solid: true }],
    };
    const before = blocked.tiles.slice(),
      result = repairSavedRivers(blocked, []);
    expect(result.tiles).toEqual(before);
    expect(blocked.tiles).toEqual(before);
    expect(result.meta.riverRepairSkipped).toContainEqual({ x: 12, y: 10 });
    expect(result.props).toBe(blocked.props);
  });
});

it('new bank soil stays next to actual water instead of spreading square patches inland', async () => {
  const { placeMud } = await import('../../../src/world/generation/mud');
  const { Rng } = await import('../../../src/world/Rng');
  const { world, grid } = bridgeFixture();
  placeMud(grid, world.spawn, new Rng(5), world.bridges);
  for (let y = 1; y < grid.height - 1; y++)
    for (let x = 1; x < grid.width - 1; x++)
      if (grid.get(x, y) === Tile.MUD)
        expect(grid.neighbors8(x, y).some((p) => grid.get(p.x, p.y) === Tile.RIVER)).toBe(true);
});
