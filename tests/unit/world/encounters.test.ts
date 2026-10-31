import { expect, it } from 'vitest';
import { generateWorld } from '../../../src/world/WorldGenerator';
import { canOccupy, hasClearPath } from '../../../src/systems/CollisionSystem';
import { bridgeReservations, boundsOverlap } from '../../../src/world/BridgeGeometry';
import { siteBounds, prepareEncounterWorld } from '../../../src/world/EncounterPlacement';
import { floodFill } from '../../../src/world/pathfinding';
import { Tile } from '../../../src/types/tiles';
import { encounterFixture } from '../../fixtures/encounter-world';

for (const width of [32, 48, 150])
  it(`places one safe nest and deterministic limited groves on ${width}x${width} maps`, () => {
    for (const seed of [1, 42, 123, 456, 1337]) {
      const w = generateWorld({ seed, level: 1, difficulty: 'normal', width, height: width });
      expect(w.encounterSites?.filter((s) => s.kind === 'nest')).toHaveLength(1);
      const nest = w.encounterSites!.find((s) => s.kind === 'nest')!;
      expect(w.enemySpawns.every((e) => e.type === 'mantis' || e.type === 'maggot')).toBe(true);
      expect(Math.hypot(nest.x - w.spawn.x - 0.5, nest.y - w.spawn.y - 0.5)).toBeGreaterThanOrEqual(
        width >= 80 ? 24 : 12,
      );
      const reached = floodFill(w.meta, w.spawn, (x, y) =>
        canOccupy(w, x + 0.5, y + 0.5, 0.3, 'groundEnemy'),
      );
      expect(reached[Math.floor(nest.y) * width + Math.floor(nest.x)]).toBe(1);
      const area = siteBounds(nest);
      for (let y = area.minY; y < area.maxY; y++)
        for (let x = area.minX; x < area.maxX; x++) {
          expect([Tile.GRASS, Tile.MUD, Tile.FLOWERS]).toContain(w.tiles[y * width + x]);
          expect(canOccupy(w, x + 0.5, y + 0.5, 0.3, 'groundEnemy')).toBe(true);
        }
      const exits = [
        [0, -6],
        [6, 0],
        [0, 6],
        [-6, 0],
      ].filter(([dx, dy]) =>
        hasClearPath(w, nest.x, nest.y, nest.x + dx!, nest.y + dy!, 0.3, 'groundEnemy'),
      );
      expect(exits.length).toBeGreaterThanOrEqual(2);
      expect(
        w.bridges?.some((b) => bridgeReservations(b).some((r) => boundsOverlap(r, area))),
      ).toBe(false);
      const groves = w.encounterSites!.filter((s) => s.kind === 'grove');
      expect(groves.length).toBeLessThanOrEqual(4);
      if (width === 150) expect(groves).toHaveLength(3);
      for (const grove of groves) {
        expect(canOccupy(w, grove.x, grove.y, 0.3, 'groundEnemy')).toBe(true);
        expect(Math.hypot(grove.x - nest.x, grove.y - nest.y)).toBeGreaterThanOrEqual(24);
      }
      expect(w).toEqual(
        generateWorld({ seed, level: 1, difficulty: 'normal', width, height: width }),
      );
    }
  }, 30000);

it('initialises old encounter sites conservatively without modifying tiles or props', () => {
  const world = encounterFixture();
  const { encounterSites: _sites, ...old } = world;
  old.meta = { ...world.meta, generatorVersion: 7 };
  const tiles = old.tiles.slice(),
    props = structuredClone(old.props);
  const prepared = prepareEncounterWorld(old);
  expect(prepared.encounterSites?.some((s) => s.kind === 'nest')).toBe(true);
  expect(old.tiles).toEqual(tiles);
  expect(prepared.tiles).toEqual(tiles);
  expect(prepared.props).toEqual(props);
  expect(prepareEncounterWorld(prepared)).toBe(prepared);
});
