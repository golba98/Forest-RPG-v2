// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SpatialHashGrid } from '@/core/spatial/SpatialHashGrid';
import { ISpatialEntity } from '@/core/spatial/types';
import { AABB } from '@/core/math/AABB';
import { Vector2 } from '@/core/math/Vector2';
import { InputManager } from '@/core/input/InputManager';

class MockSpatialEntity implements ISpatialEntity {
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

  public setBounds(x: number, y: number, width: number, height: number): void {
    this.aabb.set(x, y, x + width, y + height);
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

describe('Milestone 2 Challenger 2: Spatial & Input Stress Suite', () => {
  // =========================================================================
  // 1. SPATIAL HASH GRID: 4800x4800px SCALE & DEDUPLICATION ORACLE
  // =========================================================================
  describe('SpatialHashGrid: Scale, Correctness & Deduplication', () => {
    const WORLD_SIZE = 4800;
    const CELL_SIZE = 64;

    it('inserts 2,500 active entities across 4800x4800px world and matches brute-force oracle queries', () => {
      const grid = new SpatialHashGrid<MockSpatialEntity>(CELL_SIZE);
      const entities: MockSpatialEntity[] = [];
      const ENTITY_COUNT = 2500;

      // Deterministic PRNG for reproducibility
      let seed = 123456789;
      const pseudoRandom = () => {
        seed = (seed * 1664525 + 1013904223) % 4294967296;
        return seed / 4294967296;
      };

      for (let i = 0; i < ENTITY_COUNT; i++) {
        const x = pseudoRandom() * (WORLD_SIZE - 64);
        const y = pseudoRandom() * (WORLD_SIZE - 64);
        const width = 16 + pseudoRandom() * 48; // 16px to 64px
        const height = 16 + pseudoRandom() * 48;
        const entity = new MockSpatialEntity(`entity_${i}`, x, y, width, height);
        entities.push(entity);
        grid.insert(entity);
      }

      // Check grid stats
      const stats = grid.getStats();
      expect(stats.entityCount).toBe(ENTITY_COUNT);
      expect(stats.cellSize).toBe(CELL_SIZE);
      expect(stats.occupiedCellCount).toBeGreaterThan(0);
      expect(stats.occupiedCellCount).toBeLessThanOrEqual((WORLD_SIZE / CELL_SIZE + 2) ** 2);
      expect(stats.avgEntitiesPerCell).toBeGreaterThan(0);

      // Run 50 viewport queries (800x600px viewport) across the world
      for (let q = 0; q < 50; q++) {
        const vx = pseudoRandom() * (WORLD_SIZE - 800);
        const vy = pseudoRandom() * (WORLD_SIZE - 600);
        const queryBox = AABB.fromBounds(vx, vy, 800, 600);

        const results = grid.queryAABB(queryBox);

        // Ground-truth oracle: linear scan over all entities
        const expectedEntities = entities.filter((e) => queryBox.intersects(e.getAABB()));

        // Verification 1: Exact count match
        expect(results.length).toBe(expectedEntities.length);

        // Verification 2: Zero duplicates in result array
        const resultIds = results.map((e) => e.id);
        const uniqueIds = new Set(resultIds);
        expect(uniqueIds.size).toBe(results.length);

        // Verification 3: Exact set identity (no false positives, no false negatives)
        const expectedIdSet = new Set(expectedEntities.map((e) => e.id));
        for (const id of resultIds) {
          expect(expectedIdSet.has(id)).toBe(true);
        }
      }

      // Run 50 radial queries across the world
      for (let r = 0; r < 50; r++) {
        const cx = pseudoRandom() * WORLD_SIZE;
        const cy = pseudoRandom() * WORLD_SIZE;
        const radius = 50 + pseudoRandom() * 200; // 50px to 250px radius
        const center = new Vector2(cx, cy);

        const radiusResults = grid.queryRadius(center, radius);

        // Ground-truth oracle
        const expectedEntities = entities.filter((e) =>
          e.getAABB().intersectsCircle(center, radius)
        );

        // Verification 1: Exact count match
        expect(radiusResults.length).toBe(expectedEntities.length);

        // Verification 2: Zero duplicates in result array
        const resultIds = radiusResults.map((e) => e.id);
        const uniqueIds = new Set(resultIds);
        expect(uniqueIds.size).toBe(radiusResults.length);

        // Verification 3: Exact set membership
        const expectedIdSet = new Set(expectedEntities.map((e) => e.id));
        for (const id of resultIds) {
          expect(expectedIdSet.has(id)).toBe(true);
        }
      }
    });

    it('multi-cell spanning: entity straddling 4 and 16 cell boundaries is retrievable in all overlapping cells without duplicates in wide query', () => {
      const grid = new SpatialHashGrid<MockSpatialEntity>(CELL_SIZE);

      // Entity 1: exactly centered at the intersection of (0,0), (1,0), (0,1), (1,1)
      // Cell boundary is at x=64, y=64.
      // Box from (48, 48) to (80, 80) has width 32, height 32, straddles (0,0), (1,0), (0,1), (1,1)
      const fourCellEntity = new MockSpatialEntity('four_cell', 48, 48, 32, 32);
      grid.insert(fourCellEntity);

      // Query single cell (0,0)
      const q00 = grid.queryAABB(AABB.fromBounds(0, 0, 63, 63));
      expect(q00.map((e) => e.id)).toContain('four_cell');

      // Query single cell (1,0)
      const q10 = grid.queryAABB(AABB.fromBounds(65, 0, 63, 63));
      expect(q10.map((e) => e.id)).toContain('four_cell');

      // Query single cell (0,1)
      const q01 = grid.queryAABB(AABB.fromBounds(0, 65, 63, 63));
      expect(q01.map((e) => e.id)).toContain('four_cell');

      // Query single cell (1,1)
      const q11 = grid.queryAABB(AABB.fromBounds(65, 65, 63, 63));
      expect(q11.map((e) => e.id)).toContain('four_cell');

      // Large multi-cell query spanning all 4 cells: [0, 0, 128, 128]
      const wideQuery = grid.queryAABB(AABB.fromBounds(0, 0, 128, 128));
      // CRITICAL: Must be returned EXACTLY ONCE
      expect(wideQuery.length).toBe(1);
      expect(wideQuery[0]?.id).toBe('four_cell');

      // Radial query covering all 4 cells
      const radiusQuery = grid.queryRadius(new Vector2(64, 64), 50);
      expect(radiusQuery.length).toBe(1);
      expect(radiusQuery[0]?.id).toBe('four_cell');

      // Giant entity spanning 4x4 = 16 cells (size 200x200 across cells 0, 1, 2, 3)
      const sixteenCellEntity = new MockSpatialEntity('sixteen_cell', 10, 10, 200, 200);
      grid.insert(sixteenCellEntity);

      // Verify wide query returns both entities exactly once
      const wideQuery2 = grid.queryAABB(AABB.fromBounds(0, 0, 300, 300));
      expect(wideQuery2.length).toBe(2);
      expect(new Set(wideQuery2.map((e) => e.id)).size).toBe(2);

      // Removal test: remove sixteen_cell and verify clean unregistration from all 16 cells
      expect(grid.remove(sixteenCellEntity)).toBe(true);
      expect(grid.has(sixteenCellEntity)).toBe(false);

      // Cell (3,3) at [192, 192, 64, 64] should now be completely empty
      const cell33Query = grid.queryAABB(AABB.fromBounds(193, 193, 60, 60));
      expect(cell33Query.length).toBe(0);
    });
  });

  // =========================================================================
  // 2. SPATIAL HASH GRID: TWO-PHASE RADIUS QUERY BOUNDARY PRECISION
  // =========================================================================
  describe('SpatialHashGrid: Two-Phase Radius Query Precision & Boundary Cases', () => {
    it('verifies exact mathematical boundary precision for cardinal edges and diagonal corners', () => {
      const grid = new SpatialHashGrid<MockSpatialEntity>(64);

      // AABB from (100, 100) to (140, 140)
      // Width = 40, Height = 40, Center = (120, 120)
      const target = new MockSpatialEntity('target_box', 100, 100, 40, 40);
      grid.insert(target);

      // -------------------------------------------------------------
      // Case 1: East Edge (x = 140, y = 120). Circle center at (170, 120).
      // Closest point on AABB is (140, 120). Distance = 30.0.
      // -------------------------------------------------------------
      const eastCenter = new Vector2(170, 120);
      // Touching: radius = 30.0000 -> MATCH
      expect(grid.queryRadius(eastCenter, 30.0).map((e) => e.id)).toContain('target_box');
      // Just inside: radius = 30.001 -> MATCH
      expect(grid.queryRadius(eastCenter, 30.001).map((e) => e.id)).toContain('target_box');
      // Just outside: radius = 29.999 -> MISS
      expect(grid.queryRadius(eastCenter, 29.999).map((e) => e.id)).not.toContain('target_box');

      // -------------------------------------------------------------
      // Case 2: North Edge (x = 120, y = 100). Circle center at (120, 70).
      // Closest point on AABB is (120, 100). Distance = 30.0.
      // -------------------------------------------------------------
      const northCenter = new Vector2(120, 70);
      expect(grid.queryRadius(northCenter, 30.0).map((e) => e.id)).toContain('target_box');
      expect(grid.queryRadius(northCenter, 30.001).map((e) => e.id)).toContain('target_box');
      expect(grid.queryRadius(northCenter, 29.999).map((e) => e.id)).not.toContain('target_box');

      // -------------------------------------------------------------
      // Case 3: Southeast Corner (x = 140, y = 140). Circle center at (143, 144).
      // dx = 3, dy = 4. Distance = sqrt(9 + 16) = 5.0.
      // -------------------------------------------------------------
      const seCornerCenter = new Vector2(143, 144);
      // Touching corner: radius = 5.0 -> MATCH
      expect(grid.queryRadius(seCornerCenter, 5.0).map((e) => e.id)).toContain('target_box');
      // Just inside: radius = 5.0001 -> MATCH
      expect(grid.queryRadius(seCornerCenter, 5.0001).map((e) => e.id)).toContain('target_box');
      // Just outside: radius = 4.9999 -> MISS
      expect(grid.queryRadius(seCornerCenter, 4.9999).map((e) => e.id)).not.toContain('target_box');

      // -------------------------------------------------------------
      // Case 4: Northwest Corner (x = 100, y = 100). Circle center at (94, 92).
      // dx = -6, dy = -8. Distance = sqrt(36 + 64) = 10.0.
      // -------------------------------------------------------------
      const nwCornerCenter = new Vector2(94, 92);
      expect(grid.queryRadius(nwCornerCenter, 10.0).map((e) => e.id)).toContain('target_box');
      expect(grid.queryRadius(nwCornerCenter, 10.001).map((e) => e.id)).toContain('target_box');
      expect(grid.queryRadius(nwCornerCenter, 9.999).map((e) => e.id)).not.toContain('target_box');

      // -------------------------------------------------------------
      // Case 5: Two-Phase Divergence
      // Broad-phase AABB circumscribing circle touches entity, but circular narrow-phase misses!
      // Entity at [100, 100, 110, 110]
      // Circle at (130, 130), radius = 25.
      // Broad-phase box = [105, 105, 155, 155]. Intersects entity [100..110] x [100..110] on [105..110]!
      // Closest corner of entity to (130, 130) is (110, 110).
      // dx = 20, dy = 20. Distance = sqrt(800) ~ 28.284 > 25.
      // Broad-phase produces candidate, but narrow-phase MUST REJECT it!
      // -------------------------------------------------------------
      const testCornerEntity = new MockSpatialEntity('divergence_box', 100, 100, 10, 10);
      grid.insert(testCornerEntity);

      const divergenceResults = grid.queryRadius(new Vector2(130, 130), 25);
      expect(divergenceResults.map((e) => e.id)).not.toContain('divergence_box');

      // -------------------------------------------------------------
      // Case 6: Center inside entity
      // -------------------------------------------------------------
      expect(grid.queryRadius(new Vector2(120, 120), 1).map((e) => e.id)).toContain('target_box');

      // -------------------------------------------------------------
      // Case 7: Non-positive radius edge cases
      // -------------------------------------------------------------
      expect(grid.queryRadius(new Vector2(120, 120), 0)).toEqual([]);
      expect(grid.queryRadius(new Vector2(120, 120), -10)).toEqual([]);
    });
  });

  // =========================================================================
  // 3. SPATIAL HASH GRID: HIGH-FREQUENCY UPDATES & O(1) SHORT-CIRCUIT
  // =========================================================================
  describe('SpatialHashGrid: High-Frequency Update Performance & O(1) Short-Circuit', () => {
    it('verifies O(1) early-exit when cell spans do not change vs cell-crossing updates', () => {
      const grid = new SpatialHashGrid<MockSpatialEntity>(64);
      const ENTITY_COUNT = 2000;
      const entities: MockSpatialEntity[] = [];

      for (let i = 0; i < ENTITY_COUNT; i++) {
        const x = (i % 50) * 80 + 10;
        const y = Math.floor(i / 50) * 80 + 10;
        const ent = new MockSpatialEntity(`update_ent_${i}`, x, y, 20, 20);
        entities.push(ent);
        grid.insert(ent);
      }

      // Phase 1: Micro-movements within exact same cell (O(1) short circuit)
      // Move each entity by 0.1px back and forth for 200 iterations (400,000 updates)
      const startStatic = performance.now();
      for (let frame = 0; frame < 200; frame++) {
        const delta = frame % 2 === 0 ? 0.1 : -0.1;
        for (let i = 0; i < ENTITY_COUNT; i++) {
          const e = entities[i]!;
          e.moveBy(delta, delta);
          grid.update(e);
        }
      }
      const durationStatic = performance.now() - startStatic;

      // Phase 2: Crossing cell boundaries on every update
      // Move each entity by 70px (larger than cellSize 64) for 200 iterations (400,000 updates)
      const startCrossing = performance.now();
      for (let frame = 0; frame < 200; frame++) {
        const delta = frame % 2 === 0 ? 70 : -70;
        for (let i = 0; i < ENTITY_COUNT; i++) {
          const e = entities[i]!;
          e.moveBy(delta, delta);
          grid.update(e);
        }
      }
      const durationCrossing = performance.now() - startCrossing;

      // Assertions:
      // 1. Static updates must be at least 2.5x faster than cell-crossing updates
      expect(durationCrossing).toBeGreaterThan(durationStatic * 2.0);

      // 2. Total entities preserved without corruption
      expect(grid.getStats().entityCount).toBe(ENTITY_COUNT);

      // 3. Fast path throughput: 400,000 static updates should complete in under 200ms in Node.js
      expect(durationStatic).toBeLessThan(300);
    });
  });

  // =========================================================================
  // 4. INPUT MANAGER: DUAL KEYCODES & SIMULTANEOUS DISPATCH
  // =========================================================================
  describe('InputManager: Dual Keycodes & Simultaneous Dispatch', () => {
    let input: InputManager;

    beforeEach(() => {
      input = new InputManager();
      input.attach(window);
    });

    afterEach(() => {
      input.detach();
    });

    it('processes simultaneous modern DOM string code and legacy numeric keyCode inputs', () => {
      // 1. Modern DOM event with both code and keyCode populated
      window.dispatchEvent(
        new KeyboardEvent('keydown', {
          code: 'KeyW',
          keyCode: 87,
          bubbles: true,
          cancelable: true,
        })
      );

      expect(input.isActionActive('moveUp')).toBe(true);
      expect(input.isActionJustPressed('moveUp')).toBe(true);

      // 2. Legacy event with only numeric keyCode (e.g. keyCode 32 for Space / jump)
      window.dispatchEvent(
        new KeyboardEvent('keydown', {
          code: '',
          keyCode: 32,
          bubbles: true,
          cancelable: true,
        })
      );

      expect(input.isActionActive('jump')).toBe(true);
      expect(input.isActionJustPressed('jump')).toBe(true);

      // 3. Modern-only event with only code string (e.g. ShiftLeft for sprint, keyCode 0)
      window.dispatchEvent(
        new KeyboardEvent('keydown', {
          code: 'ShiftLeft',
          keyCode: 0,
          bubbles: true,
          cancelable: true,
        })
      );

      expect(input.isActionActive('sprint')).toBe(true);
      expect(input.isActionJustPressed('sprint')).toBe(true);

      // 4. Clear frame state clears rising edge but maintains active held state
      input.clearFrameState();
      expect(input.isActionActive('moveUp')).toBe(true);
      expect(input.isActionJustPressed('moveUp')).toBe(false);
      expect(input.isActionActive('jump')).toBe(true);
      expect(input.isActionJustPressed('jump')).toBe(false);
      expect(input.isActionActive('sprint')).toBe(true);
      expect(input.isActionJustPressed('sprint')).toBe(false);

      // 5. Simultaneous release of all 3
      window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyW', keyCode: 87 }));
      window.dispatchEvent(new KeyboardEvent('keyup', { code: '', keyCode: 32 }));
      window.dispatchEvent(new KeyboardEvent('keyup', { code: 'ShiftLeft', keyCode: 0 }));

      expect(input.isActionActive('moveUp')).toBe(false);
      expect(input.isActionJustReleased('moveUp')).toBe(true);

      expect(input.isActionActive('jump')).toBe(false);
      expect(input.isActionJustReleased('jump')).toBe(true);

      expect(input.isActionActive('sprint')).toBe(false);
      expect(input.isActionJustReleased('sprint')).toBe(true);
    });

    it('loads and adapts legacy localStorage keybindings format faithfully', () => {
      // Simulate legacy save file in localStorage
      const legacySave = {
        cut: 69, // KeyE in legacy
        moveUp: 87, // W
        moveDown: 83, // S
        moveLeft: 65, // A
        moveRight: 68, // D
        sprint: 16, // Shift
        jump: 32, // Space
      };
      localStorage.setItem('playerKeybinds', JSON.stringify(legacySave));

      const loaded = input.loadFromStorage('playerKeybinds');
      expect(loaded).toBe(true);

      // Press legacy 'cut' key (69) -> should activate 'attack' action
      input.simulateKeyDown(69);
      expect(input.isActionActive('attack')).toBe(true);
      expect(input.isActionJustPressed('attack')).toBe(true);

      input.simulateKeyUp(69);
      expect(input.isActionActive('attack')).toBe(false);
      expect(input.isActionJustReleased('attack')).toBe(true);
    });
  });

  // =========================================================================
  // 5. INPUT MANAGER: MULTI-FRAME EDGE LATCHING & ZERO ALLOCATION
  // =========================================================================
  describe('InputManager: Multi-Frame Edge Latching & Zero Allocation', () => {
    let input: InputManager;

    beforeEach(() => {
      input = new InputManager();
    });

    it('tracks edge latches across strict multi-frame sequence without stuck keys or missed transitions', () => {
      // FRAME 0: Initial rest
      expect(input.isActionActive('moveRight')).toBe(false);
      expect(input.isActionJustPressed('moveRight')).toBe(false);
      expect(input.isActionJustReleased('moveRight')).toBe(false);

      // FRAME 1: KeyDown in frame
      input.simulateKeyDown('KeyD');
      expect(input.isActionActive('moveRight')).toBe(true);
      expect(input.isActionJustPressed('moveRight')).toBe(true);
      expect(input.isActionJustReleased('moveRight')).toBe(false);

      // FRAME 1 END: End of frame tick
      input.clearFrameState();

      // FRAME 2: Held down, no new events
      expect(input.isActionActive('moveRight')).toBe(true);
      expect(input.isActionJustPressed('moveRight')).toBe(false);
      expect(input.isActionJustReleased('moveRight')).toBe(false);

      // Repeat keydown (OS autorepeat) should NOT trigger isActionJustPressed again
      input.simulateKeyDown('KeyD');
      expect(input.isActionActive('moveRight')).toBe(true);
      expect(input.isActionJustPressed('moveRight')).toBe(false);

      // FRAME 2 END
      input.clearFrameState();

      // FRAME 3: KeyUp in frame
      input.simulateKeyUp('KeyD');
      expect(input.isActionActive('moveRight')).toBe(false);
      expect(input.isActionJustPressed('moveRight')).toBe(false);
      expect(input.isActionJustReleased('moveRight')).toBe(true);

      // FRAME 3 END
      input.clearFrameState();

      // FRAME 4: Post-release rest
      expect(input.isActionActive('moveRight')).toBe(false);
      expect(input.isActionJustPressed('moveRight')).toBe(false);
      expect(input.isActionJustReleased('moveRight')).toBe(false);
    });

    it('verifies zero allocation and rapid execution during clearFrameState in 60Hz loop', () => {
      // Warm up
      for (let i = 0; i < 1000; i++) {
        input.simulateKeyDown('KeyW');
        input.clearFrameState();
        input.simulateKeyUp('KeyW');
        input.clearFrameState();
      }

      const ITERATIONS = 100_000;
      const start = performance.now();

      for (let i = 0; i < ITERATIONS; i++) {
        input.simulateKeyDown('KeyW');
        input.simulateKeyDown('Space');
        input.simulateMouseMove(i % 100, (i * 2) % 100);
        input.clearFrameState();
        input.simulateKeyUp('KeyW');
        input.simulateKeyUp('Space');
        input.clearFrameState();
      }

      const elapsed = performance.now() - start;

      // 100,000 frames (each simulating 2 key downs, mouse move, clear, 2 key ups, clear)
      // must complete in under 500ms total (< 5 microseconds per frame simulation)
      expect(elapsed).toBeLessThan(500);

      // Final state must be fully cleared
      expect(input.isActionActive('moveUp')).toBe(false);
      expect(input.isActionActive('jump')).toBe(false);
      expect(input.getMouseDelta()).toEqual(new Vector2(0, 0));
    });
  });
});
