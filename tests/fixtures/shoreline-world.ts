import { Tile } from '../../src/types/tiles';
import { WORLD_GENERATOR_VERSION, type WorldData } from '../../src/types/world';

/** The standing-at-lip QA plateau, with water at the foot of its south face. */
export function shorelineFixture(): WorldData {
  const tiles = new Uint8Array(24 * 24).fill(Tile.GRASS);
  for (let y = 5; y <= 17; y++) for (let x = 5; x <= 17; x++) tiles[y * 24 + x] = Tile.PLATEAU;
  for (let y = 18; y < 24; y++) for (let x = 0; x < 24; x++) tiles[y * 24 + x] = Tile.RIVER;
  tiles[10 * 24 + 5] = Tile.STAIRS;
  return {
    meta: {
      seed: 123,
      generatorVersion: WORLD_GENERATOR_VERSION,
      width: 24,
      height: 24,
      isTutorial: false,
      level: 1,
      difficulty: 'normal',
    },
    tiles,
    props: [],
    bridges: [],
    spawn: { x: 12, y: 12 },
    portal: { x: 21, y: 21 },
    enemySpawns: [],
    pickupSpawns: [{ x: 20, y: 21, type: 'coin' }],
  };
}
