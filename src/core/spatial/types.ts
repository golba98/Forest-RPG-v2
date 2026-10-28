import { AABB } from '../math/AABB';
import { Vector2 } from '../math/Vector2';

/**
 * Any entity or object that can be tracked in the SpatialHashGrid.
 */
export interface ISpatialEntity {
  id: string | number;
  getAABB(): AABB;
}

/**
 * Internal cell bounds record for an entity.
 */
export interface EntityCellSpan {
  minCX: number;
  maxCX: number;
  minCY: number;
  maxCY: number;
}

/**
 * Performance and diagnostic stats for the spatial grid.
 */
export interface SpatialGridStats {
  cellSize: number;
  entityCount: number;
  occupiedCellCount: number;
  maxEntitiesPerCell: number;
  avgEntitiesPerCell: number;
}

/**
 * Public interface for SpatialHashGrid.
 */
export interface ISpatialHashGrid<T extends ISpatialEntity> {
  readonly cellSize: number;
  insert(entity: T): void;
  update(entity: T): void;
  remove(entity: T): boolean;
  queryAABB(bounds: AABB, filter?: (entity: T) => boolean): T[];
  queryRadius(center: Vector2, radius: number, filter?: (entity: T) => boolean): T[];
  queryPoint(point: Vector2, filter?: (entity: T) => boolean): T[];
  clear(): void;
  has(entity: T): boolean;
  getStats(): SpatialGridStats;
}
