import type { Direction } from '../events/types';

/** Screen/world coordinates: east is +X, south is +Y. All vectors have unit length. */
export const DIRECTION_VECTORS: Readonly<Record<Direction, readonly [number, number]>> = {
  N: [0, -1],
  NE: [Math.SQRT1_2, -Math.SQRT1_2],
  E: [1, 0],
  SE: [Math.SQRT1_2, Math.SQRT1_2],
  S: [0, 1],
  SW: [-Math.SQRT1_2, Math.SQRT1_2],
  W: [-1, 0],
  NW: [-Math.SQRT1_2, -Math.SQRT1_2],
};

const OCTANTS: readonly Direction[] = ['E', 'SE', 'S', 'SW', 'W', 'NW', 'N', 'NE'];

/** Nearest compass direction; stopped/invalid vectors retain the supplied facing. */
export function directionFromVector(dx: number, dy: number, fallback: Direction = 'S'): Direction {
  if (!Number.isFinite(dx) || !Number.isFinite(dy) || (dx === 0 && dy === 0)) return fallback;
  const octant = Math.round(Math.atan2(dy, dx) / (Math.PI / 4));
  return OCTANTS[(octant + 8) % 8] ?? fallback;
}
