import type { WorldData } from '../../src/types/world';
import { WORLD_GENERATOR_VERSION } from '../../src/types/world';
import { Tile } from '../../src/types/tiles';
import { siteId } from '../../src/world/EncounterPlacement';

export function encounterFixture(seed = 123): WorldData {
  const width = 64,
    tiles = new Uint8Array(width * width).fill(Tile.GRASS);
  for (let n = 0; n < width; n++) {
    tiles[n] = tiles[(width - 1) * width + n] = Tile.BORDER;
    tiles[n * width] = tiles[n * width + width - 1] = Tile.BORDER;
  }
  return {
    meta: {
      seed,
      generatorVersion: WORLD_GENERATOR_VERSION,
      width,
      height: width,
      isTutorial: false,
      level: 1,
      difficulty: 'normal',
    },
    tiles,
    bridges: [],
    props: [{ id: 1, kind: 'tree', tileX: 46, tileY: 46, solid: true }],
    spawn: { x: 30, y: 30 },
    portal: { x: 58, y: 58 },
    enemySpawns: [],
    pickupSpawns: [],
    encounterSites: [
      { id: siteId(seed, 1, 'nest', 0), kind: 'nest', x: 12.5, y: 12.5 },
      { id: siteId(seed, 1, 'grove', 0), kind: 'grove', x: 39.5, y: 39.5 },
      { id: siteId(seed, 1, 'grove', 1), kind: 'grove', x: 43.5, y: 39.5 },
    ],
  };
}
