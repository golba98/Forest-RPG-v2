import { Tile } from '../types/tiles';
import type { WorldData } from '../types/world';

/** A forest tree whose trunk stands on tile (x, y); its canopy covers the body below. */
export interface TreePlacement {
  readonly x: number;
  readonly y: number;
}

/**
 * Tiles visibly covered by a tree on (tx, ty): the 64×64 sprite is drawn
 * bottom-centred on the trunk tile, so its body spans columns tx-1..tx+1
 * (the side columns at least half) and rows ty-1..ty.
 */
export function treeBodyContains(tree: TreePlacement, x: number, y: number): boolean {
  return x >= tree.x - 1 && x <= tree.x + 1 && y >= tree.y - 1 && y <= tree.y;
}

function isForest(tile: number | undefined): boolean {
  return tile === Tile.FOREST || tile === Tile.BORDER;
}

/**
 * Chooses forest tree positions so every solid FOREST/BORDER tile is covered
 * by a tree body, with every trunk on a solid forest tile.
 *
 * The base layout keeps the legacy 2-tile spacing (a trunk on every even
 * x/y forest tile). That layout alone left the last odd row/column of a
 * forest region, and 1-tile pockets at odd coordinates, uncovered: grass that
 * blocked the player like an invisible wall. Filler trees are added on those
 * tiles. Collision is unchanged.
 */
export function planForestTrees(world: Pick<WorldData, 'meta' | 'tiles'>): TreePlacement[] {
  const { width, height } = world.meta;
  const trees: TreePlacement[] = [];
  const covered = new Uint8Array(width * height);
  const cover = (tx: number, ty: number) => {
    for (let y = Math.max(0, ty - 1); y <= ty; y++) {
      for (let x = Math.max(0, tx - 1); x <= Math.min(width - 1, tx + 1); x++) covered[y * width + x] = 1;
    }
  };
  for (let y = 0; y < height; y += 2) {
    for (let x = 0; x < width; x += 2) {
      if (!isForest(world.tiles[y * width + x])) continue;
      trees.push({ x, y });
      cover(x, y);
    }
  }
  // Bottom-up so a filler's canopy also covers the uncovered tile above it.
  for (let y = height - 1; y >= 0; y--) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      if (covered[i] === 1 || !isForest(world.tiles[i])) continue;
      trees.push({ x, y });
      cover(x, y);
    }
  }
  return trees;
}
