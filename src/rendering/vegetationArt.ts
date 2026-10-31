import { Tile } from '../types/tiles';
import type { PropKind, WorldData, WorldProp } from '../types/world';

/** Native source pixels. Full provenance and licence ship alongside the atlases. */
export interface VegetationFrame {
  readonly atlas: 'lpc_trees' | 'lpc_plants';
  readonly rect: { readonly x: number; readonly y: number; readonly w: number; readonly h: number };
  /** Ground contact, in pixels from the source rectangle's top-left. */
  readonly root: readonly [number, number];
}
const tree = (
  x: number,
  y: number,
  w: number,
  h: number,
  rootX: number,
  rootY: number,
): VegetationFrame => ({ atlas: 'lpc_trees', rect: { x, y, w, h }, root: [rootX, rootY] });
const plant = (x: number, y: number, rootY = 30): VegetationFrame => ({
  atlas: 'lpc_plants',
  rect: { x, y, w: 32, h: 32 },
  root: [16, rootY],
});

export const VEGETATION = {
  young: tree(0, 0, 64, 64, 32, 60),
  tall: tree(384, 0, 64, 96, 32, 90),
  broad: tree(160, 224, 96, 128, 48, 118),
  // A complete, smaller source tree, never a downsampled mature crown.
  compact: tree(64, 0, 64, 64, 32, 62),
  pink: plant(352, 192),
  yellow: plant(416, 32),
  flowers: plant(0, 96),
  fern: plant(352, 384),
  grass: plant(0, 320),
  mushrooms: plant(0, 576),
  bush: plant(448, 864),
  smallBush: plant(416, 864),
  log: plant(160, 832),
  stump: plant(32, 768),
  upright: plant(0, 768),
} as const;

export const DECOR_VEGETATION: Readonly<Partial<Record<PropKind, VegetationFrame>>> = {
  flower_pink: VEGETATION.pink,
  flower_yellow: VEGETATION.yellow,
  flower_clump: VEGETATION.flowers,
  bush_small: VEGETATION.smallBush,
  bush_obstacle: VEGETATION.bush,
  log_horizontal: VEGETATION.log,
  log_vertical: VEGETATION.upright,
  log_stump: VEGETATION.stump,
};

export function nearRiver(world: WorldData, x: number, y: number): boolean {
  for (let dy = -3; dy <= 3; dy++)
    for (let dx = -3; dx <= 3; dx++) {
      const tx = x + dx,
        ty = y + dy;
      if (
        tx >= 0 &&
        ty >= 0 &&
        tx < world.meta.width &&
        ty < world.meta.height &&
        world.tiles[ty * world.meta.width + tx] === Tile.RIVER
      )
        return true;
    }
  return false;
}

/** Selection never consumes simulation RNG or changes saved prop identity/position. */
export function vegetationFor(prop: WorldProp, world: WorldData): VegetationFrame | null {
  const hash = (Math.imul(prop.tileX, 17) ^ Math.imul(prop.tileY, 31)) >>> 0;
  switch (prop.kind) {
    case 'tree':
      if (world.meta.generatorVersion < 12) return hash % 2 ? VEGETATION.compact : VEGETATION.young;
      if (nearRiver(world, prop.tileX, prop.tileY)) return VEGETATION.broad;
      return [VEGETATION.tall, VEGETATION.broad, VEGETATION.young][hash % 3] ?? VEGETATION.young;
    case 'flower_clump':
      if (nearRiver(world, prop.tileX, prop.tileY)) return VEGETATION.fern;
      return (
        [VEGETATION.flowers, VEGETATION.grass, VEGETATION.mushrooms][hash % 3] ?? VEGETATION.flowers
      );
    default:
      return DECOR_VEGETATION[prop.kind] ?? null;
  }
}
