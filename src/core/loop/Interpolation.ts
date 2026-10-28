import { Vector2 } from '../math/Vector2';
import { IInterpolatable } from './types';

/**
 * Forest RPG V2 — Alpha Interpolation Utilities
 * Provides zero-allocation interpolation functions for entities, coordinates, and angles.
 */
export class Interpolation {
  /**
   * Linear interpolation between two scalar values.
   */
  public static lerp(prev: number, curr: number, alpha: number): number {
    return prev + (curr - prev) * alpha;
  }

  /**
   * Linear interpolation between two 2D vectors.
   * Modifies out vector in-place if provided to avoid GC pressure in hot render loops.
   */
  public static lerpVector2(
    prev: { x: number; y: number },
    curr: { x: number; y: number },
    alpha: number,
    out?: { x: number; y: number }
  ): { x: number; y: number } {
    const rx = prev.x + (curr.x - prev.x) * alpha;
    const ry = prev.y + (curr.y - prev.y) * alpha;

    if (out) {
      out.x = rx;
      out.y = ry;
      return out;
    }
    return new Vector2(rx, ry);
  }

  /**
   * Interpolates an entity implementing IInterpolatable.
   * Computes renderX and renderY in-place.
   */
  public static interpolateEntity(entity: IInterpolatable, alpha: number): void {
    entity.renderX = entity.prevX + (entity.x - entity.prevX) * alpha;
    entity.renderY = entity.prevY + (entity.y - entity.prevY) * alpha;
  }

  /**
   * Snaps interpolation state immediately (used on teleport, respawn, or spawn).
   * Prevents sprite stretching/streaking across the map.
   */
  public static snapEntity(entity: IInterpolatable): void {
    entity.prevX = entity.x;
    entity.prevY = entity.y;
    entity.renderX = entity.x;
    entity.renderY = entity.y;
  }

  /**
   * Shortest-path angular interpolation in radians normalized to [0, 2π).
   * Handles 0/2π wrapping correctly without spinning 360 degrees.
   */
  public static lerpAngle(prevRad: number, currRad: number, alpha: number): number {
    let diff = (currRad - prevRad) % (2 * Math.PI);
    if (diff < -Math.PI) diff += 2 * Math.PI;
    if (diff > Math.PI) diff -= 2 * Math.PI;
    let res = (prevRad + diff * alpha) % (2 * Math.PI);
    if (res < 0) res += 2 * Math.PI;
    return res;
  }
}
