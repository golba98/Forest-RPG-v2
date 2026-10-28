import { Tile } from '../../src/types/tiles';
import { WORLD_GENERATOR_VERSION, type WorldBridge, type WorldData } from '../../src/types/world';
import { GenGrid } from '../../src/world/generation/GenGrid';

export function bridgeFixture(
  orientation: WorldBridge['orientation'] = 'horizontal',
  span = 3,
): { world: WorldData; grid: GenGrid; bridge: WorldBridge } {
  const grid = new GenGrid(48, 48, Tile.GRASS);
  for (let i = 0; i < 48; i++) {
    grid.set(i, 0, Tile.BORDER);
    grid.set(i, 47, Tile.BORDER);
    grid.set(0, i, Tile.BORDER);
    grid.set(47, i, Tile.BORDER);
  }
  const horizontal = orientation === 'horizontal';
  for (let a = 21; a < 21 + span; a++)
    for (let b = 1; b < 47; b++) grid.set(horizontal ? a : b, horizontal ? b : a, Tile.RIVER);
  const bridge: WorldBridge = {
    id: 0,
    x: horizontal ? 20 : 18,
    y: horizontal ? 18 : 20,
    orientation,
    span,
    variant: 2,
  };
  const world: WorldData = {
    meta: {
      seed: 123,
      generatorVersion: WORLD_GENERATOR_VERSION,
      width: 48,
      height: 48,
      isTutorial: false,
      level: 1,
      difficulty: 'normal',
    },
    tiles: grid.tiles,
    props: [],
    bridges: [bridge],
    spawn: { x: 8, y: 8 },
    portal: { x: 35, y: 35 },
    enemySpawns: [],
    pickupSpawns: [],
  };
  return { world, grid, bridge };
}
