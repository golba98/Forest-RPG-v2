import { describe, expect, it } from 'vitest';
import { planForestTrees, treeBodyContains } from '../../../src/rendering/forestTrees';
import { generateWorld } from '../../../src/world/WorldGenerator';
import { generateTutorialWorld } from '../../../src/world/TutorialMap';
import { Tile } from '../../../src/types/tiles';
import type { WorldData } from '../../../src/types/world';

const isForest = (t: number | undefined) => t === Tile.FOREST || t === Tile.BORDER;

function uncovered(world: WorldData): Array<[number, number]> {
  const trees = planForestTrees(world);
  const { width, height } = world.meta;
  const covered = new Uint8Array(width * height);
  for (const tree of trees) {
    for (let y = tree.y - 1; y <= tree.y; y++) for (let x = tree.x - 1; x <= tree.x + 1; x++) {
      if (x >= 0 && y >= 0 && x < width && y < height && treeBodyContains(tree, x, y)) covered[y * width + x] = 1;
    }
  }
  const missing: Array<[number, number]> = [];
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    if (isForest(world.tiles[y * width + x]) && covered[y * width + x] !== 1) missing.push([x, y]);
  }
  return missing;
}

describe('planForestTrees', () => {
  it('covers every solid forest tile in generated worlds and the tutorial', () => {
    for (const seed of [1, 7, 42, 123, 1337]) expect(uncovered(generateWorld({ seed, level: 1, difficulty: 'normal' }))).toEqual([]);
    expect(uncovered(generateTutorialWorld())).toEqual([]);
  }, 30000);

  it('only puts trunks on solid forest tiles', () => {
    const world = generateWorld({ seed: 42, level: 1, difficulty: 'normal' });
    for (const tree of planForestTrees(world)) expect(isForest(world.tiles[tree.y * world.meta.width + tree.x])).toBe(true);
  });

  it('fills the odd last row the legacy even-grid layout left as an invisible wall', () => {
    const width = 6, height = 5;
    const tiles = new Uint8Array(width * height).fill(Tile.GRASS);
    for (let y = 0; y <= 1; y++) for (let x = 0; x < width; x++) tiles[y * width + x] = Tile.FOREST; // rows 0-1
    const world = { meta: { seed: 0, generatorVersion: 0, width, height, isTutorial: false, level: 1, difficulty: 'normal' as const }, tiles };
    const trees = planForestTrees(world);
    expect(trees.some((t) => t.y === 1)).toBe(true);
    expect(uncovered({ ...world, props: [], spawn: { x: 0, y: 0 }, portal: { x: 0, y: 0 }, enemySpawns: [], pickupSpawns: [] })).toEqual([]);
  });
});
