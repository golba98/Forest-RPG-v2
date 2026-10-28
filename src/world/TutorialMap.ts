import { GAME_CONFIG } from '../config/GameConfig';
import { Tile } from '../types/tiles';
import { WORLD_GENERATOR_VERSION } from '../types/world';
import type { PickupSpawn, TilePoint, WorldData } from '../types/world';
import { GenGrid } from './generation/GenGrid';

/** Layout constants from legacy `game-tutorial.js`. */
export const TUTORIAL_LAYOUT = {
  wallY: 10,
  wallX: 10,
  gapXs: [5, 15],
  spawn: { x: 3, y: 15 },
  dummy: { x: 5, y: 5, maxHealth: 5 },
  coins: [
    { x: 15, y: 5 },
    { x: 16, y: 4 },
    { x: 14, y: 6 },
  ],
  portal: { x: 17, y: 3 },
} as const;

/**
 * The 20×20 Training Glade: forest-ringed, split by a horizontal tree wall
 * at y=10 (gaps at x=5 and x=15) and a vertical wall at x=10 in the bottom
 * half. Fixed layout, no randomness, no props.
 */
export function generateTutorialWorld(): WorldData {
  const width = GAME_CONFIG.world.tutorialWidth;
  const height = GAME_CONFIG.world.tutorialHeight;
  const grid = new GenGrid(width, height, Tile.GRASS);
  const L = TUTORIAL_LAYOUT;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (x === 0 || y === 0 || x === width - 1 || y === height - 1) grid.set(x, y, Tile.FOREST);
    }
  }
  for (let y = L.wallY; y < height; y++) grid.set(L.wallX, y, Tile.FOREST);
  for (let x = 0; x < width; x++) grid.set(x, L.wallY, Tile.FOREST);
  for (const gapX of L.gapXs) grid.set(gapX, L.wallY, Tile.GRASS);

  const spawn: TilePoint = { x: L.spawn.x, y: L.spawn.y };
  const pickupSpawns: PickupSpawn[] = L.coins.map((c) => ({ type: 'coin', x: c.x, y: c.y }));

  return {
    meta: {
      seed: 0,
      generatorVersion: WORLD_GENERATOR_VERSION,
      width,
      height,
      isTutorial: true,
      level: 0,
      difficulty: 'normal',
    },
    tiles: grid.tiles,
    props: [],
    spawn,
    portal: { x: L.portal.x, y: L.portal.y },
    enemySpawns: [
      { type: 'beetle', x: L.dummy.x, y: L.dummy.y, aggressive: false, maxHealth: L.dummy.maxHealth },
    ],
    pickupSpawns,
  };
}
