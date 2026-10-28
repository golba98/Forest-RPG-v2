import type { EntityBase } from '../types/entities';
import type { WorldData, WorldProp } from '../types/world';
import { TILE_PROPERTIES, isHillTile, Tile, type TileId } from '../types/tiles';

const solidPropIndex = new WeakMap<WorldData, Map<number, readonly WorldProp[]>>();
function indexedProps(world: WorldData): Map<number, readonly WorldProp[]> {
  const cached = solidPropIndex.get(world); if (cached) return cached;
  const index = new Map<number, WorldProp[]>();
  for (const prop of world.props) if (prop.solid) {
    const key = prop.tileY * world.meta.width + prop.tileX;
    const cell = index.get(key) ?? []; cell.push(prop); index.set(key, cell);
  }
  solidPropIndex.set(world, index); return index;
}
/** Call after changing the world's static prop list. */
export function invalidatePropIndex(world: WorldData): void { solidPropIndex.delete(world); }

export function canOccupy(world: WorldData, x: number, y: number, half: number, allowHills = false, jumpOverProps = false): boolean {
  const { width, height } = world.meta;
  for (let ty = Math.floor(y - half); ty <= Math.floor(y + half); ty++) {
    for (let tx = Math.floor(x - half); tx <= Math.floor(x + half); tx++) {
      const tile = world.tiles[ty * width + tx] as TileId;
      const hill = isHillTile(tile) || tile === Tile.CLIFF || tile === Tile.PLATEAU;
      if (tx < 0 || ty < 0 || tx >= width || ty >= height ||
        ((TILE_PROPERTIES[tile]?.solid ?? true) && !(allowHills && hill))) return false;
    }
  }
  const index = indexedProps(world);
  for (let ty = Math.floor(y - half); ty <= Math.floor(y + half); ty++) for (let tx = Math.floor(x - half); tx <= Math.floor(x + half); tx++) {
    for (const p of index.get(ty * width + tx) ?? []) {
      if (!(jumpOverProps && p.kind !== 'tree') && Math.abs(x - p.tileX - 0.5) < half + 0.5 && Math.abs(y - p.tileY - 0.5) < half + 0.5) return false;
    }
  }
  return true;
}

export function moveWithCollision(world: WorldData, entity: EntityBase, dx: number, dy: number, allowHills = false, jumpOverProps = false): void {
  const steps = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) / 0.2));
  for (let i = 0; i < steps; i++) {
    if (canOccupy(world, entity.x + dx / steps, entity.y, entity.halfSize, allowHills, jumpOverProps)) entity.x += dx / steps;
    if (canOccupy(world, entity.x, entity.y + dy / steps, entity.halfSize, allowHills, jumpOverProps)) entity.y += dy / steps;
  }
}
