import type { PropKind, WorldProp } from '../types/world';
import { isRaisedSurface, reduceMask } from './ElevationTopology';
import { hashTile } from './TileHash';

// Keep the original order/hash: saved terrain reproduces these decorations
// from coordinates, not from a random stream or the generator version.
const DECOR: readonly PropKind[] = [
  'bush_small',
  'flower_yellow',
  'flower_pink',
  'rock_pebble',
  'flower_clump',
  'rock_boulder',
];
export function plateauDecoration(tile: number, x: number, y: number, mask: number) {
  const h = hashTile(x, y);
  if (!isRaisedSurface(tile) || reduceMask(mask) !== 255 || (h >>> 12) % 100 >= 7) return null;
  return {
    kind: DECOR[(h >>> 4) % DECOR.length] ?? 'rock_pebble',
    offsetX: ((h >>> 20) % 9) - 4,
    offsetY: ((h >>> 24) % 7) - 3,
  };
}

/** The existing boulder asset is 32×32. Match terrainArt's clamped, rounded fit. */
export function hilltopSpritePlacement(source: NonNullable<WorldProp['hilltop']>) {
  const h = hashTile(source.sourceX, source.sourceY);
  const scale = 0.9,
    jitterX = ((h >>> 20) % 9) - 4,
    jitterY = ((h >>> 24) % 7) - 3;
  const snap = (jitter: number) => Math.round(Math.min(Math.max(1.6 + jitter, 0), 3.2)) / 32;
  return { scale, offsetX: snap(jitterX), offsetY: snap(jitterY), jitterX, jitterY };
}
