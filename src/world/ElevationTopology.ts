import { Tile, isHillTile, type TileId } from '../types/tiles';

export const NB = { N: 1, NE: 2, E: 4, SE: 8, S: 16, SW: 32, W: 64, NW: 128 } as const;
const OFFSETS = [
  [0, -1],
  [1, -1],
  [1, 0],
  [1, 1],
  [0, 1],
  [-1, 1],
  [-1, 0],
  [-1, -1],
] as const;

export function isRaisedSurface(tile: number): boolean {
  return isHillTile(tile as TileId) || tile === Tile.PLATEAU || tile === Tile.STAIRS;
}

/** Out-of-bounds is low ground; always use final saved cells rather than legacy edge IDs. */
export function elevationMask(
  tiles: ArrayLike<number>,
  width: number,
  height: number,
  x: number,
  y: number,
): number {
  let mask = 0;
  OFFSETS.forEach(([dx, dy], i) => {
    const nx = x + dx,
      ny = y + dy;
    if (
      nx >= 0 &&
      ny >= 0 &&
      nx < width &&
      ny < height &&
      isRaisedSurface(tiles[ny * width + nx] ?? 0)
    )
      mask |= 1 << i;
  });
  return mask;
}

export function reduceMask(mask: number): number {
  let r = mask & (NB.N | NB.E | NB.S | NB.W);
  if (mask & NB.NE && mask & NB.N && mask & NB.E) r |= NB.NE;
  if (mask & NB.SE && mask & NB.S && mask & NB.E) r |= NB.SE;
  if (mask & NB.SW && mask & NB.S && mask & NB.W) r |= NB.SW;
  if (mask & NB.NW && mask & NB.N && mask & NB.W) r |= NB.NW;
  return r;
}

export function stairsDirection(mask: number): 'n' | 'e' | 's' | 'w' {
  return !(mask & NB.S) ? 's' : !(mask & NB.N) ? 'n' : !(mask & NB.E) ? 'e' : 'w';
}
