import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { ForestGenerator } from '../../../../src/world/infinite/ForestGenerator';
import { infiniteDescriptor } from '../../../../src/world/infinite/InfiniteSession';
import {
  elevationMask,
  isRaisedSurface,
  stairsDirection,
} from '../../../../src/world/ElevationTopology';
import { hasClearPath } from '../../../../src/systems/CollisionSystem';
import { PLAYER_FOOTPRINT } from '../../../../src/systems/EntityFootprint';
import { Tile } from '../../../../src/types/tiles';
import type { WorldData } from '../../../../src/types/world';

const generator = (seed: number, version = 15) =>
  new ForestGenerator(
    infiniteDescriptor({
      seed,
      generatorVersion: version,
      level: 1,
      difficulty: 'normal',
    }),
  );
function patch(g: ForestGenerator, x: number, y: number, size = 128): WorldData {
  const ox = x - size / 2,
    oy = y - size / 2,
    tiles = new Uint8Array(size * size);
  for (let py = 0; py < size; py++)
    for (let px = 0; px < size; px++) tiles[py * size + px] = g.tileAt(ox + px, oy + py);
  const props: WorldData['props'][number][] = [];
  for (let cy = Math.floor(oy / 32); cy <= Math.floor((oy + size - 1) / 32); cy++)
    for (let cx = Math.floor(ox / 32); cx <= Math.floor((ox + size - 1) / 32); cx++)
      props.push(
        ...g
          .generate({ x: cx, y: cy })
          .props.map((p) => ({ ...p, tileX: p.tileX - ox, tileY: p.tileY - oy })),
      );
  return {
    meta: {
      seed: g.descriptor.seed,
      generatorVersion: 15,
      width: size,
      height: size,
      level: 1,
      difficulty: 'normal',
      isTutorial: false,
    },
    tiles,
    ...(g.descriptor.generatorVersion >= 16
      ? {
          elevations: Uint8Array.from(tiles, (_, i) =>
            g.heightAt(ox + (i % size), oy + Math.floor(i / size)),
          ),
        }
      : {}),
    props,
    bridges: [],
    encounterSites: [],
    spawn: { x: 64, y: 64 },
    portal: { x: 0, y: 0 },
    enemySpawns: [],
    pickupSpawns: [],
  };
}
describe('biome high ground', () => {
  it('keeps local hill gradients smooth near biome transitions even a billion tiles away', () => {
    const g = generator(42),
      geography = g.geography!;
    let transitions = 0;
    for (const origin of [0, 10000, 1000000000, -1000000000])
      for (let y = -384; y <= 384; y += 8)
        for (let x = -384; x <= 384; x += 8) {
          const a = geography.sample(origin + x, origin + y);
          if (a.blend <= 0.05) continue;
          transitions++;
          const b = geography.sample(origin + x + 1, origin + y);
          expect(Math.abs(a.upland - b.upland), `${origin + x},${origin + y}`).toBeLessThan(0.16);
        }
    expect(transitions).toBeGreaterThan(100);
  });
  it('produces raised land and lowland in every biome across seeds', () => {
    for (const seed of [1, 42, 111, 1337]) {
      const g = generator(seed);
      for (const a of g.geography!.anchors) {
        let land = 0,
          raised = 0,
          edges = 0,
          slopes = 0;
        for (let y = a.y - 64; y < a.y + 64; y++)
          for (let x = a.x - 64; x < a.x + 64; x++) {
            const tile = g.tileAt(x, y);
            if (tile !== Tile.RIVER && tile !== Tile.SHALLOW_WATER) land++;
            if (isRaisedSurface(tile)) raised++;
            if (tile >= Tile.HILL_N && tile <= Tile.HILL_NW) edges++;
            if (tile === Tile.STAIRS) slopes++;
          }
        const label = `${seed}:${a.biome}`;
        expect(raised / land, label).toBeGreaterThan(0.035);
        expect(raised / land, label).toBeLessThan(0.88);
        expect(edges, label).toBeGreaterThan(60);
        expect(slopes, label).toBeGreaterThan(3);
      }
    }
  }, 30000);

  it('provides real swept approaches up and down slopes, and blocks every cliff orientation', () => {
    const g = generator(42),
      directions = { n: [0, -1], e: [1, 0], s: [0, 1], w: [-1, 0] } as const;
    for (const a of g.geography!.anchors) {
      const world = patch(g, a.x, a.y),
        width = world.meta.width;
      const found = new Set<string>(),
        blocked = new Set<string>();
      for (let y = 3; y < width - 3; y++)
        for (let x = 3; x < width - 3; x++) {
          const tile = world.tiles[y * width + x]!;
          if (!isRaisedSurface(tile)) continue;
          const mask = elevationMask(world.tiles, width, width, x, y);
          if (tile === Tile.STAIRS) {
            const dir = stairsDirection(mask),
              [nx, ny] = directions[dir];
            const low = { x: x + 0.5 + nx * 1.5, y: y + 0.5 + ny * 1.5 };
            const high = { x: x + 0.5 - nx * 1.5, y: y + 0.5 - ny * 1.5 };
            for (const profile of ['player', 'groundEnemy'] as const) {
              const footprint = profile === 'player' ? PLAYER_FOOTPRINT : 0.3;
              expect(
                hasClearPath(world, low.x, low.y, high.x, high.y, footprint, profile),
                `${a.biome}:${dir}:${x},${y}`,
              ).toBe(true);
              expect(hasClearPath(world, high.x, high.y, low.x, low.y, footprint, profile)).toBe(
                true,
              );
            }
            found.add(dir);
          } else {
            for (const [dir, [nx, ny]] of Object.entries(directions)) {
              if (
                isRaisedSurface(world.tiles[(y + ny) * width + x + nx]!) ||
                !isRaisedSurface(world.tiles[(y - ny) * width + x - nx]!)
              )
                continue;
              expect(
                hasClearPath(
                  world,
                  x + 0.5 + nx * 1.5,
                  y + 0.5 + ny * 1.5,
                  x + 0.5 - nx * 1.5,
                  y + 0.5 - ny * 1.5,
                  PLAYER_FOOTPRINT,
                ),
              ).toBe(false);
              blocked.add(dir);
            }
          }
        }
      expect([...found].sort(), `slope directions in ${a.biome}`).toEqual(['e', 'n', 's', 'w']);
      expect([...blocked].sort()).toEqual(['e', 'n', 's', 'w']);
    }
  }, 30000);

  it('leaves the five saved v14 landscapes byte-identical', () => {
    const g = generator(42, 14);
    const expected = [
      '9a03c04d062e367750cf5a892e83dde251a0c135f015e27e8c158748c08c9403',
      'c727b4bb7413649d69e74aa256a93f6dc07d761922ae8d534bc0fb107716973d',
      '6b345931e344b494720fafb9aaa904228b5860da113ecd0d473f0e1208c8cc7e',
      'e01bf1c314a8bf705e6e2eb62699fb800ac0cea0dfc0971344769d2079aa426d',
      '39001ae8e8b6a40caef374939e187e53c5ee37646b819d2a83fece32b48ea79c',
    ];
    for (const a of g.geography!.anchors) {
      const c = g.generate({ x: Math.floor(a.x / 32), y: Math.floor(a.y / 32) });
      expect(
        createHash('sha256')
          .update(JSON.stringify({ ...c, tiles: Array.from(c.tiles) }))
          .digest('hex'),
      ).toBe(expected[a.biome]);
    }
  });
});

describe('nested terraces', () => {
  it('keeps upper approaches traversable and every tier physically solid', () => {
    const g = generator(42, 16),
      directions = { n: [0, -1], e: [1, 0], s: [0, 1], w: [-1, 0] } as const;
    const tiers = new Set<number>(),
      orientations = new Set<string>();
    for (const a of g.geography!.anchors) {
      const w = patch(g, a.x, a.y, 192),
        size = w.meta.width;
      let upper = 0;
      for (let y = 3; y < size - 3; y++)
        for (let x = 3; x < size - 3; x++) {
          const i = y * size + x,
            h = w.elevations![i]!;
          if (h < 2) continue;
          upper++;
          const mask = elevationMask(w.tiles, size, size, x, y, w.elevations);
          if (w.tiles[i] === Tile.STAIRS) {
            tiers.add(h);
            const dir = stairsDirection(mask);
            orientations.add(dir);
            const [nx, ny] = directions[dir];
            for (const profile of ['player', 'groundEnemy'] as const) {
              const footprint = profile === 'player' ? PLAYER_FOOTPRINT : 0.3;
              for (const sign of [-1, 1])
                expect(
                  hasClearPath(
                    w,
                    x + 0.5 + nx * 1.5 * sign,
                    y + 0.5 + ny * 1.5 * sign,
                    x + 0.5 - nx * 1.5 * sign,
                    y + 0.5 - ny * 1.5 * sign,
                    footprint,
                    profile,
                  ),
                  `${a.biome}:${h}:${dir}:${x},${y}`,
                ).toBe(true);
            }
          } else
            for (const [nx, ny] of Object.values(directions)) {
              if (w.elevations![(y + ny) * size + x + nx]! >= h) continue;
              expect(
                hasClearPath(
                  w,
                  x + 0.5 + nx * 1.5,
                  y + 0.5 + ny * 1.5,
                  x + 0.5 - nx * 1.5,
                  y + 0.5 - ny * 1.5,
                  PLAYER_FOOTPRINT,
                ),
                `${a.biome}:wall:${h}:${x},${y}`,
              ).toBe(false);
            }
          for (const [nx, ny] of Object.values(directions))
            expect(Math.abs(h - w.elevations![(y + ny) * size + x + nx]!)).toBeLessThanOrEqual(1);
        }
      expect(upper, `nested terrain in biome ${a.biome}`).toBeGreaterThan(0);
    }
    expect([...tiers].sort()).toEqual([2, 3]);
    expect([...orientations].sort()).toEqual(['e', 'n', 's', 'w']);
  }, 60000);
  it('reproduces heights in either visitation order at signed and very large coordinates', () => {
    for (const seed of [1, 42, 1337]) {
      const a = generator(seed, 16),
        b = generator(seed, 16);
      const points = [
        [0, 0],
        [150, 150],
        [500, 500],
        [2000, 2000],
        [10000, 10000],
        [-2000, -2000],
        [-10000, 10000],
        [1000000000, -1000000000],
      ];
      const first = points.map(([x, y]) =>
        a.generate({ x: Math.floor(x! / 32), y: Math.floor(y! / 32) }),
      );
      for (const c of first.reverse()) expect(b.generate(c.address)).toEqual(c);
    }
  }, 30000);
});

it('keeps v15 terrain and object baselines frozen', () => {
  const g = generator(42, 15);
  const hashes = [
    '159be53b2c1902f50ea844281d90374beb338c2d7099de75d2a318b61a44c540',
    '4813e59d1ff8dbcc6ff8a714470b5e4a8e3b34ac5f96ffc4347a9c79cc99d37c',
    '2b8a0f2e7ce6f047078ee0e7c2d70b09ad5f79e262fcd1d699c33aca898c4d13',
    'dba64ea4a8875a97e9f890cae3ab868abc4b412daa70ac8922c780d7c9f98447',
    'c8a295d6ebc0fe5feebb879a03f490ccbf9474b458ac727db2c136caed150fac',
  ];
  for (const a of g.geography!.anchors) {
    const c = g.generate({ x: Math.floor(a.x / 32), y: Math.floor(a.y / 32) });
    expect(
      createHash('sha256')
        .update(JSON.stringify({ ...c, tiles: Array.from(c.tiles) }))
        .digest('hex'),
    ).toBe(hashes[a.biome]);
  }
});

it('uses relative cliff masks and stair openings at every height in all four directions', async () => {
  const { makeWorld } = await import('../../game/fakes');
  for (const tier of [1, 2, 3])
    for (const [nx, ny] of [
      [0, -1],
      [1, 0],
      [0, 1],
      [-1, 0],
    ]) {
      const world = { ...makeWorld(), elevations: new Uint8Array(64) };
      for (let y = 0; y < 8; y++)
        for (let x = 0; x < 8; x++) {
          const high = (x - 3) * nx! + (y - 3) * ny! <= 0,
            level = high ? tier : tier - 1;
          world.elevations[y * 8 + x] = level;
          world.tiles[y * 8 + x] = level ? Tile.PLATEAU : Tile.GRASS;
        }
      const low = { x: 3.5 + nx! * 1.4, y: 3.5 + ny! * 1.4 },
        high = { x: 3.5 - nx! * 1.4, y: 3.5 - ny! * 1.4 };
      expect(hasClearPath(world, low.x, low.y, high.x, high.y, PLAYER_FOOTPRINT)).toBe(false);
      world.tiles[3 * 8 + 3] = Tile.STAIRS;
      for (const profile of ['player', 'groundEnemy'] as const) {
        const footprint = profile === 'player' ? PLAYER_FOOTPRINT : 0.3;
        expect(hasClearPath(world, low.x, low.y, high.x, high.y, footprint, profile)).toBe(true);
        expect(hasClearPath(world, high.x, high.y, low.x, low.y, footprint, profile)).toBe(true);
      }
    }
});

it('retains cliff collision after a material-only edit on an upper terrace', async () => {
  const { makeWorld } = await import('../../game/fakes');
  const { describeTerrain } = await import('../../../../src/world/TerrainTopology');
  const world = { ...makeWorld(), elevations: new Uint8Array(64) };
  for (let y = 0; y < 8; y++)
    for (let x = 0; x < 8; x++) {
      world.elevations[y * 8 + x] = x >= 4 ? 2 : 1;
      world.tiles[y * 8 + x] = Tile.PLATEAU;
    }
  world.tiles[3 * 8 + 4] = Tile.MUD;
  expect(describeTerrain(world, 4, 3).elevation).toBe(2);
  expect(hasClearPath(world, 3.5, 3.5, 5.5, 3.5, PLAYER_FOOTPRINT)).toBe(false);
});

it('preserves the legacy solid CLIFF description', async () => {
  const { makeWorld } = await import('../../game/fakes');
  const { describeTerrain } = await import('../../../../src/world/TerrainTopology');
  const world = makeWorld();
  world.tiles[27] = Tile.CLIFF;
  expect(describeTerrain(world, 3, 3)).toMatchObject({ elevation: 1, walkable: false });
});
