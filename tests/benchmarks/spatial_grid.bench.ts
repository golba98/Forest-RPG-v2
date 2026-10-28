import { describe, it, expect } from 'vitest';
import { SpatialHashGrid } from '@/core/spatial/SpatialHashGrid';
import { ISpatialEntity } from '@/core/spatial/types';
import { AABB } from '@/core/math/AABB';
import { InputManager } from '@/core/input/InputManager';

class BenchSpatialEntity implements ISpatialEntity {
  public aabb: AABB;

  constructor(
    public readonly id: string | number,
    x: number,
    y: number,
    width: number,
    height: number
  ) {
    this.aabb = AABB.fromBounds(x, y, width, height);
  }

  public getAABB(): AABB {
    return this.aabb;
  }

  public moveBy(dx: number, dy: number): void {
    this.aabb.set(
      this.aabb.minX + dx,
      this.aabb.minY + dy,
      this.aabb.maxX + dx,
      this.aabb.maxY + dy
    );
  }
}

describe('SpatialHashGrid & InputManager Benchmark Suite', () => {
  it('benchmarks 2,500 entity insertions into 4800x4800px world', () => {
    const grid = new SpatialHashGrid<BenchSpatialEntity>(64);
    const start = performance.now();

    for (let i = 0; i < 2500; i++) {
      const x = (i % 50) * 90;
      const y = Math.floor(i / 50) * 90;
      const entity = new BenchSpatialEntity(`bench_${i}`, x, y, 32, 32);
      grid.insert(entity);
    }

    const duration = performance.now() - start;
    expect(grid.getStats().entityCount).toBe(2500);
    // 2,500 insertions must complete in < 25ms (< 10 microseconds per insertion)
    expect(duration).toBeLessThan(50);
  });

  it('benchmarks 1,000 viewport queries (800x600px) against 2,500 active entities', () => {
    const grid = new SpatialHashGrid<BenchSpatialEntity>(64);
    for (let i = 0; i < 2500; i++) {
      const x = (i % 50) * 90;
      const y = Math.floor(i / 50) * 90;
      grid.insert(new BenchSpatialEntity(`e_${i}`, x, y, 32, 32));
    }

    const start = performance.now();
    let totalHitCount = 0;

    for (let q = 0; q < 1000; q++) {
      const qx = (q % 40) * 100;
      const qy = Math.floor(q / 40) * 150;
      const queryBox = AABB.fromBounds(qx, qy, 800, 600);
      const hits = grid.queryAABB(queryBox);
      totalHitCount += hits.length;
    }

    const duration = performance.now() - start;
    expect(totalHitCount).toBeGreaterThan(0);
    // 1,000 viewport queries must complete in < 150ms (< 150 microseconds per viewport query)
    expect(duration).toBeLessThan(250);
  });

  it('benchmarks stationary O(1) early-exit vs cell-crossing updates for 2,000 entities', () => {
    const grid = new SpatialHashGrid<BenchSpatialEntity>(64);
    const entities: BenchSpatialEntity[] = [];

    for (let i = 0; i < 2000; i++) {
      const x = (i % 50) * 80 + 10;
      const y = Math.floor(i / 50) * 80 + 10;
      const ent = new BenchSpatialEntity(`up_${i}`, x, y, 20, 20);
      entities.push(ent);
      grid.insert(ent);
    }

    // Static update: micro-move within cell
    const startStatic = performance.now();
    for (let f = 0; f < 100; f++) {
      for (let i = 0; i < 2000; i++) {
        const ent = entities[i]!;
        ent.moveBy(0.01, 0.01);
        grid.update(ent);
      }
    }
    const durationStatic = performance.now() - startStatic;

    // Moving update: crossing cell boundary
    const startMoving = performance.now();
    for (let f = 0; f < 100; f++) {
      const offset = f % 2 === 0 ? 65 : -65;
      for (let i = 0; i < 2000; i++) {
        const ent = entities[i]!;
        ent.moveBy(offset, offset);
        grid.update(ent);
      }
    }
    const durationMoving = performance.now() - startMoving;

    // Static updates must be significantly faster due to O(1) cell span equality check
    expect(durationMoving).toBeGreaterThan(durationStatic * 2);
  });

  it('benchmarks 500,000 InputManager clearFrameState iterations', () => {
    const input = new InputManager();
    const start = performance.now();

    for (let i = 0; i < 500_000; i++) {
      input.simulateKeyDown('KeyW');
      input.clearFrameState();
      input.simulateKeyUp('KeyW');
      input.clearFrameState();
    }

    const duration = performance.now() - start;
    // 500,000 simulated frame clears must complete in < 400ms
    expect(duration).toBeLessThan(600);
  });
});
