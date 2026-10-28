import { AABB } from '../math/AABB';
import { Vector2 } from '../math/Vector2';
import {
  ISpatialEntity,
  ISpatialHashGrid,
  EntityCellSpan,
  SpatialGridStats,
} from './types';

export class SpatialHashGrid<T extends ISpatialEntity> implements ISpatialHashGrid<T> {
  public readonly cellSize: number;

  // Spatial cells: "cx,cy" -> Set of entities
  private _cells: Map<string, Set<T>> = new Map();

  // Track entity cell span for O(1) update and removal
  private _entitySpans: Map<string | number, EntityCellSpan> = new Map();

  // Primary entity map: id -> entity
  private _entities: Map<string | number, T> = new Map();

  constructor(cellSize = 64) {
    if (cellSize <= 0) {
      throw new Error(`SpatialHashGrid cellSize must be > 0, got ${cellSize}`);
    }
    this.cellSize = cellSize;
  }

  // =========================================================================
  // Mutation API: insert, update, remove, clear
  // =========================================================================

  public insert(entity: T): void {
    const id = entity.id;
    if (this._entities.has(id)) {
      this.update(entity);
      return;
    }

    const aabb = entity.getAABB();
    const span = this._calculateSpan(aabb);

    this._entities.set(id, entity);
    this._entitySpans.set(id, span);

    this._addToCells(entity, span);
  }

  public update(entity: T): void {
    const id = entity.id;
    const oldSpan = this._entitySpans.get(id);

    if (!oldSpan) {
      this.insert(entity);
      return;
    }

    const aabb = entity.getAABB();
    const newSpan = this._calculateSpan(aabb);

    // The stored reference may differ from `entity` (same id, new object)
    const existingRef = this._entities.get(id) ?? entity;
    this._entities.set(id, entity);

    // Fast path: entity stayed within the exact same cell bounds
    if (
      oldSpan.minCX === newSpan.minCX &&
      oldSpan.maxCX === newSpan.maxCX &&
      oldSpan.minCY === newSpan.minCY &&
      oldSpan.maxCY === newSpan.maxCY
    ) {
      if (existingRef !== entity) {
        this._removeFromCells(existingRef, oldSpan);
        this._addToCells(entity, newSpan);
      }
      return;
    }

    // Remove old reference from old cells and add new reference to new cells
    this._removeFromCells(existingRef, oldSpan);
    this._entitySpans.set(id, newSpan);
    this._addToCells(entity, newSpan);
  }

  public remove(entity: T): boolean {
    const id = entity.id;
    const span = this._entitySpans.get(id);
    if (!span) return false;

    this._removeFromCells(this._entities.get(id) ?? entity, span);
    this._entitySpans.delete(id);
    this._entities.delete(id);
    return true;
  }

  public clear(): void {
    this._cells.clear();
    this._entitySpans.clear();
    this._entities.clear();
  }

  public has(entity: T): boolean {
    return this._entities.has(entity.id);
  }

  // =========================================================================
  // Spatial Query API
  // =========================================================================

  /**
   * Queries all entities whose bounding box intersects the given AABB bounds.
   * Multi-cell spanning entities are automatically deduplicated.
   */
  public queryAABB(bounds: AABB, filter?: (entity: T) => boolean): T[] {
    const span = this._calculateSpan(bounds);
    const resultSet = new Set<T>();

    for (let cx = span.minCX; cx <= span.maxCX; cx++) {
      for (let cy = span.minCY; cy <= span.maxCY; cy++) {
        const key = this._cellKey(cx, cy);
        const cell = this._cells.get(key);
        if (!cell || cell.size === 0) continue;

        for (const entity of cell) {
          if (resultSet.has(entity)) continue;

          if (bounds.intersects(entity.getAABB())) {
            if (!filter || filter(entity)) {
              resultSet.add(entity);
            }
          }
        }
      }
    }

    return Array.from(resultSet);
  }

  /**
   * Queries all entities located within a radial distance from center.
   * Broad-phase evaluates bounding box around circle; narrow-phase tests circle-AABB intersection.
   */
  public queryRadius(center: Vector2, radius: number, filter?: (entity: T) => boolean): T[] {
    if (radius <= 0) return [];

    // Broad-phase: construct AABB circumscribing the circle
    const broadAABB = AABB.fromCenterSize(center.x, center.y, radius * 2, radius * 2);
    const span = this._calculateSpan(broadAABB);
    const resultSet = new Set<T>();

    for (let cx = span.minCX; cx <= span.maxCX; cx++) {
      for (let cy = span.minCY; cy <= span.maxCY; cy++) {
        const key = this._cellKey(cx, cy);
        const cell = this._cells.get(key);
        if (!cell || cell.size === 0) continue;

        for (const entity of cell) {
          if (resultSet.has(entity)) continue;

          // Narrow-phase circle-AABB intersection test
          if (entity.getAABB().intersectsCircle(center, radius)) {
            if (!filter || filter(entity)) {
              resultSet.add(entity);
            }
          }
        }
      }
    }

    return Array.from(resultSet);
  }

  /**
   * Queries all entities whose AABB contains the specified point.
   */
  public queryPoint(point: Vector2, filter?: (entity: T) => boolean): T[] {
    const cx = Math.floor(point.x / this.cellSize);
    const cy = Math.floor(point.y / this.cellSize);
    const key = this._cellKey(cx, cy);
    const cell = this._cells.get(key);
    if (!cell || cell.size === 0) return [];

    const results: T[] = [];
    for (const entity of cell) {
      if (entity.getAABB().containsPoint(point)) {
        if (!filter || filter(entity)) {
          results.push(entity);
        }
      }
    }
    return results;
  }

  // =========================================================================
  // Diagnostics & Statistics
  // =========================================================================

  public getStats(): SpatialGridStats {
    let occupiedCellCount = 0;
    let maxEntitiesPerCell = 0;
    let totalCellEntries = 0;

    for (const cell of this._cells.values()) {
      const size = cell.size;
      if (size > 0) {
        occupiedCellCount++;
        totalCellEntries += size;
        if (size > maxEntitiesPerCell) {
          maxEntitiesPerCell = size;
        }
      }
    }

    return {
      cellSize: this.cellSize,
      entityCount: this._entities.size,
      occupiedCellCount,
      maxEntitiesPerCell,
      avgEntitiesPerCell: occupiedCellCount > 0 ? totalCellEntries / occupiedCellCount : 0,
    };
  }

  // =========================================================================
  // Private Coordinate Math & Cell Management
  // =========================================================================

  private _cellKey(cx: number, cy: number): string {
    return `${cx},${cy}`;
  }

  private _calculateSpan(aabb: AABB): EntityCellSpan {
    return {
      minCX: Math.floor(aabb.minX / this.cellSize),
      maxCX: Math.floor(aabb.maxX / this.cellSize),
      minCY: Math.floor(aabb.minY / this.cellSize),
      maxCY: Math.floor(aabb.maxY / this.cellSize),
    };
  }

  private _addToCells(entity: T, span: EntityCellSpan): void {
    for (let cx = span.minCX; cx <= span.maxCX; cx++) {
      for (let cy = span.minCY; cy <= span.maxCY; cy++) {
        const key = this._cellKey(cx, cy);
        let cell = this._cells.get(key);
        if (!cell) {
          cell = new Set();
          this._cells.set(key, cell);
        }
        cell.add(entity);
      }
    }
  }

  private _removeFromCells(entity: T, span: EntityCellSpan): void {
    for (let cx = span.minCX; cx <= span.maxCX; cx++) {
      for (let cy = span.minCY; cy <= span.maxCY; cy++) {
        const key = this._cellKey(cx, cy);
        const cell = this._cells.get(key);
        if (cell) {
          cell.delete(entity);
          if (cell.size === 0) {
            this._cells.delete(key);
          }
        }
      }
    }
  }
}
