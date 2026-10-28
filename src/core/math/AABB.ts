import { Vector2 } from './Vector2';

/**
 * 2D Axis-Aligned Bounding Box (AABB) represented by min and max corners.
 */
export class AABB {
  public minX: number;
  public minY: number;
  public maxX: number;
  public maxY: number;

  constructor(minX: number, minY: number, maxX: number, maxY: number) {
    this.minX = Math.min(minX, maxX);
    this.minY = Math.min(minY, maxY);
    this.maxX = Math.max(minX, maxX);
    this.maxY = Math.max(minY, maxY);
  }

  // =========================================================================
  // Factory Methods
  // =========================================================================

  public static fromMinMax(minX: number, minY: number, maxX: number, maxY: number): AABB {
    return new AABB(minX, minY, maxX, maxY);
  }

  public static fromBounds(x: number, y: number, width: number, height: number): AABB {
    return new AABB(x, y, x + width, y + height);
  }

  public static fromCenterSize(centerX: number, centerY: number, width: number, height: number): AABB {
    const halfW = width * 0.5;
    const halfH = height * 0.5;
    return new AABB(centerX - halfW, centerY - halfH, centerX + halfW, centerY + halfH);
  }

  public static fromPoints(points: Vector2[]): AABB {
    const firstPoint = points[0];
    if (!firstPoint) {
      return new AABB(0, 0, 0, 0);
    }
    let minX = firstPoint.x;
    let minY = firstPoint.y;
    let maxX = firstPoint.x;
    let maxY = firstPoint.y;
    for (let i = 1; i < points.length; i++) {
      const p = points[i];
      if (p) {
        if (p.x < minX) minX = p.x;
        if (p.x > maxX) maxX = p.x;
        if (p.y < minY) minY = p.y;
        if (p.y > maxY) maxY = p.y;
      }
    }
    return new AABB(minX, minY, maxX, maxY);
  }

  // =========================================================================
  // Getters & Properties
  // =========================================================================

  public get min(): Vector2 {
    return new Vector2(this.minX, this.minY);
  }

  public get max(): Vector2 {
    return new Vector2(this.maxX, this.maxY);
  }

  public get center(): Vector2 {
    return new Vector2((this.minX + this.maxX) * 0.5, (this.minY + this.maxY) * 0.5);
  }

  public get width(): number {
    return this.maxX - this.minX;
  }

  public get height(): number {
    return this.maxY - this.minY;
  }

  public get halfWidth(): number {
    return (this.maxX - this.minX) * 0.5;
  }

  public get halfHeight(): number {
    return (this.maxY - this.minY) * 0.5;
  }

  // =========================================================================
  // Geometric Intersection & Containment Queries
  // =========================================================================

  public intersects(other: AABB): boolean {
    return !(
      this.maxX < other.minX ||
      this.minX > other.maxX ||
      this.maxY < other.minY ||
      this.minY > other.maxY
    );
  }

  public containsPoint(point: Vector2 | { x: number; y: number }): boolean {
    return (
      point.x >= this.minX &&
      point.x <= this.maxX &&
      point.y >= this.minY &&
      point.y <= this.maxY
    );
  }

  public containsAABB(other: AABB): boolean {
    return (
      other.minX >= this.minX &&
      other.maxX <= this.maxX &&
      other.minY >= this.minY &&
      other.maxY <= this.maxY
    );
  }

  /**
   * Tests whether this AABB intersects a circle centered at (center.x, center.y) with radius.
   * Uses clamped squared Euclidean distance algorithm.
   */
  public intersectsCircle(center: Vector2 | { x: number; y: number }, radius: number): boolean {
    if (radius < 0) return false;
    const closestX = Math.max(this.minX, Math.min(center.x, this.maxX));
    const closestY = Math.max(this.minY, Math.min(center.y, this.maxY));
    const dx = center.x - closestX;
    const dy = center.y - closestY;
    return dx * dx + dy * dy <= radius * radius;
  }

  public expand(margin: number): AABB {
    return new AABB(
      this.minX - margin,
      this.minY - margin,
      this.maxX + margin,
      this.maxY + margin
    );
  }

  public expandInPlace(margin: number): this {
    this.minX -= margin;
    this.minY -= margin;
    this.maxX += margin;
    this.maxY += margin;
    return this;
  }

  public clone(): AABB {
    return new AABB(this.minX, this.minY, this.maxX, this.maxY);
  }

  public union(other: AABB): AABB {
    return new AABB(
      Math.min(this.minX, other.minX),
      Math.min(this.minY, other.minY),
      Math.max(this.maxX, other.maxX),
      Math.max(this.maxY, other.maxY)
    );
  }

  public intersection(other: AABB): AABB | null {
    if (!this.intersects(other)) return null;
    return new AABB(
      Math.max(this.minX, other.minX),
      Math.max(this.minY, other.minY),
      Math.min(this.maxX, other.maxX),
      Math.min(this.maxY, other.maxY)
    );
  }

  public set(minX: number, minY: number, maxX: number, maxY: number): this {
    this.minX = Math.min(minX, maxX);
    this.minY = Math.min(minY, maxY);
    this.maxX = Math.max(minX, maxX);
    this.maxY = Math.max(minY, maxY);
    return this;
  }
}
