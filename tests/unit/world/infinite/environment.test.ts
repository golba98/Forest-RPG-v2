import { it, expect } from 'vitest';
import { ForestGenerator } from '../../../../src/world/infinite/ForestGenerator';
import { bridgeGeometry } from '../../../../src/world/BridgeGeometry';
import { canOccupy, hasClearPath } from '../../../../src/systems/CollisionSystem';
import { hasHilltopClearance } from '../../../../src/world/HilltopObjects';
import type { WorldData } from '../../../../src/types/world';
import { Tile } from '../../../../src/types/tiles';
const descriptor = {
  id: 'environment',
  seed: 42,
  generatorVersion: 13,
  biomeVersion: 1,
  chunkSize: 32,
  level: 1,
  difficulty: 'normal',
} as const;
it.each([13, 14, 15, 16] as const)(
  'v%i keeps cells and object identities independent of partition size',
  (version) => {
    const versioned = {
      ...descriptor,
      generatorVersion: version,
      biomeVersion: version === 13 ? (1 as const) : (2 as const),
    };
    const small = new ForestGenerator(versioned),
      large = new ForestGenerator({ ...versioned, chunkSize: 64 });
    const chunks = [
      small.generate({ x: -2, y: -2 }),
      small.generate({ x: -1, y: -2 }),
      small.generate({ x: -2, y: -1 }),
      small.generate({ x: -1, y: -1 }),
    ];
    const combined = large.generate({ x: -1, y: -1 });
    expect(
      chunks.flatMap((c) => c.props).sort((a, b) => String(a.id).localeCompare(String(b.id))),
    ).toEqual([...combined.props].sort((a, b) => String(a.id).localeCompare(String(b.id))));
    for (let y = 0; y < 64; y++)
      for (let x = 0; x < 64; x++) {
        const chunk = chunks[Math.floor(y / 32) * 2 + Math.floor(x / 32)]!;
        expect(chunk.tiles[(y % 32) * 32 + (x % 32)]).toBe(combined.tiles[y * 64 + x]);
        expect(chunk.elevations?.[(y % 32) * 32 + (x % 32)]).toBe(combined.elevations?.[y * 64 + x]);
      }
  },
);
it('retains real bridge decks, rails and continuously swept hilltop bypasses', () => {
  const g = new ForestGenerator(descriptor),
    size = 192,
    origin = -96,
    tiles = new Uint8Array(size * size),
    props: WorldData['props'][number][] = [],
    bridges: NonNullable<WorldData['bridges']>[number][] = [];
  for (let cy = -3; cy < 3; cy++)
    for (let cx = -3; cx < 3; cx++) {
      const c = g.generate({ x: cx, y: cy });
      for (let y = 0; y < 32; y++)
        for (let x = 0; x < 32; x++)
          tiles[(cy * 32 + y - origin) * size + cx * 32 + x - origin] = c.tiles[y * 32 + x]!;
      props.push(
        ...c.props.map((p) => ({ ...p, tileX: p.tileX - origin, tileY: p.tileY - origin })),
      );
      bridges.push(...c.bridges.map((b) => ({ ...b, x: b.x - origin, y: b.y - origin })));
    }
  const world: WorldData = {
    meta: {
      seed: 42,
      width: size,
      height: size,
      generatorVersion: 13,
      isTutorial: false,
      level: 1,
      difficulty: 'normal',
    },
    tiles,
    props,
    bridges,
    encounterSites: [],
    spawn: { x: 96, y: 96 },
    portal: { x: 100, y: 100 },
    enemySpawns: [],
    pickupSpawns: [],
  };
  expect(bridges.length).toBeGreaterThan(0);
  for (const bridge of bridges) {
    const deck = bridgeGeometry(bridge).deck;
    if (deck.minX < 3 || deck.minY < 3 || deck.maxX > size - 3 || deck.maxY > size - 3) continue;
    const horizontal = bridge.orientation === 'horizontal',
      x = (deck.minX + deck.maxX) / 2,
      y = (deck.minY + deck.maxY) / 2;
    expect(canOccupy(world, x, y, 0.3, 'groundEnemy')).toBe(true);
    const a = horizontal ? { x: deck.minX + 0.4, y } : { x, y: deck.minY + 0.4 },
      b = horizontal ? { x: deck.maxX - 0.4, y } : { x, y: deck.maxY - 0.4 };
    expect(hasClearPath(world, a.x, a.y, b.x, b.y, 0.3, 'groundEnemy')).toBe(true);
  }
  for (const rock of props.filter((p) => p.hilltop))
    expect(hasHilltopClearance({ ...world, props: props.filter((p) => p !== rock) }, rock)).toBe(
      true,
    );
  expect([...tiles].includes(Tile.RIVER)).toBe(true);
}, 30000);
it('prepares bounded starting objectives for many seeds and preserves the safe spawn', () => {
  for (const seed of [
    0,
    1,
    2,
    42,
    123,
    1337,
    4294967295,
    ...Array.from({ length: 20 }, (_, i) => i + 100),
  ]) {
    const g = new ForestGenerator({ ...descriptor, seed });
    expect([Tile.GRASS, Tile.FLOWERS, Tile.MUD]).toContain(g.tileAt(0, 0));
    expect(g.starting.coins).toHaveLength(20);
  }
});
