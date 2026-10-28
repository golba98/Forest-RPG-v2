import { Tile } from '../../types/tiles';
import type { PerlinNoise } from '../Noise';
import type { Rng } from '../Rng';
import type { ClearArea, GenGrid } from './GenGrid';

const NOISE_FOREST_SCALE = 0.12;
const NOISE_FOREST_EDGE = 0.8;
const NOISE_FOREST_WOBBLE = 0.3;
const SCATTER_FOREST_PROB = 0.18;

export type TerrainStyle = 'noise' | 'scatter';

export function computeClearArea(width: number, height: number, rng: Rng): ClearArea {
  const centerX = width / 2;
  const centerY = height / 2;
  const ratio = 0.75 + rng.nextFloat() * 0.15;
  const clearW = width * ratio;
  const clearH = height * ratio;
  return {
    centerX,
    centerY,
    width: clearW,
    height: clearH,
    startX: centerX - clearW / 2,
    endX: centerX + clearW / 2,
    startY: centerY - clearH / 2,
    endY: centerY + clearH / 2,
  };
}

/**
 * Part 1: 50/50 between a noise forest (elliptical grass interior with a
 * wobbly forest rim) and a uniform scatter of trees around the clear area.
 */
export function fillBaseTerrain(
  grid: GenGrid,
  clear: ClearArea,
  rng: Rng,
  noise: PerlinNoise
): TerrainStyle {
  const style: TerrainStyle = rng.nextFloat() < 0.5 ? 'noise' : 'scatter';
  if (style === 'noise') {
    applyNoiseForest(grid, noise);
  } else {
    applyScatterForest(grid, clear, rng);
  }
  return style;
}

function applyNoiseForest(grid: GenGrid, noise: PerlinNoise): void {
  const radiusX = grid.width / 2;
  const radiusY = grid.height / 2;
  for (let y = 0; y < grid.height; y++) {
    for (let x = 0; x < grid.width; x++) {
      const dist = Math.hypot((x - radiusX) / radiusX, (y - radiusY) / radiusY);
      const wobble = (noise.noise2(x * NOISE_FOREST_SCALE, y * NOISE_FOREST_SCALE) - 0.5) * NOISE_FOREST_WOBBLE;
      grid.set(x, y, dist + wobble > NOISE_FOREST_EDGE ? Tile.FOREST : Tile.GRASS);
    }
  }
}

function applyScatterForest(grid: GenGrid, clear: ClearArea, rng: Rng): void {
  const halfW = clear.width / 2;
  const halfH = clear.height / 2;
  for (let y = 0; y < grid.height; y++) {
    for (let x = 0; x < grid.width; x++) {
      // Inclusive bounds here (legacy scatter used <=, unlike the strict clear-rect test).
      const inClear =
        x >= clear.centerX - halfW && x <= clear.centerX + halfW && y >= clear.centerY - halfH && y <= clear.centerY + halfH;
      if (inClear) {
        grid.set(x, y, Tile.GRASS);
      } else {
        grid.set(x, y, rng.nextFloat() < SCATTER_FOREST_PROB ? Tile.FOREST : Tile.GRASS);
      }
    }
  }
}

/** Solid BORDER ring around the whole map (V2 addition; legacy relied on bounds checks). */
export function applyBorderRing(grid: GenGrid): void {
  const { width, height } = grid;
  for (let x = 0; x < width; x++) {
    grid.set(x, 0, Tile.BORDER);
    grid.set(x, height - 1, Tile.BORDER);
  }
  for (let y = 0; y < height; y++) {
    grid.set(0, y, Tile.BORDER);
    grid.set(width - 1, y, Tile.BORDER);
  }
}
