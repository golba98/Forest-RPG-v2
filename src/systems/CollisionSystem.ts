import type { EntityBase } from '../types/entities';
import type { WorldData } from '../types/world';
import { TILE_PROPERTIES, type TileId } from '../types/tiles';

export function canOccupy(world: WorldData, x: number, y: number, half: number): boolean {
  const { width, height } = world.meta;
  for (let ty = Math.floor(y - half); ty <= Math.floor(y + half); ty++) {
    for (let tx = Math.floor(x - half); tx <= Math.floor(x + half); tx++) {
      if (tx < 0 || ty < 0 || tx >= width || ty >= height ||
        (TILE_PROPERTIES[world.tiles[ty * width + tx] as TileId]?.solid ?? true)) return false;
    }
  }
  return !world.props.some(p => p.solid && Math.abs(x - p.tileX - 0.5) < half + 0.5 && Math.abs(y - p.tileY - 0.5) < half + 0.5);
}

export function moveWithCollision(world: WorldData, entity: EntityBase, dx: number, dy: number): void {
  const steps = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) / 0.2));
  for (let i = 0; i < steps; i++) {
    if (canOccupy(world, entity.x + dx / steps, entity.y, entity.halfSize)) entity.x += dx / steps;
    if (canOccupy(world, entity.x, entity.y + dy / steps, entity.halfSize)) entity.y += dy / steps;
  }
}
