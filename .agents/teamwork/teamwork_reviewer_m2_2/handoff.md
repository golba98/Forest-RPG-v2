# Handoff Report: Milestone 2 Core Architecture & Simulation Engine Review

**Agent**: `teamwork_reviewer_m2_2`  
**Role**: reviewer, critic  
**Working Directory**: `/home/k9-vortex/Development/2-TypeScript/18-Forest RPG v2/.agents/teamwork/teamwork_reviewer_m2_2/`  
**Date**: 2026-10-28T02:07:00Z  
**Target Milestone**: Milestone 2 — Core Architecture & Simulation Engine  
**Verdict**: **REQUEST_CHANGES**

---

## 1. Observation

1. **Test Verification Commands**:
   - `npm run typecheck`:
     ```
     > forest-rpg-v2@2.0.0 typecheck
     > tsc --noEmit
     ```
     Exit code: 0. Zero TypeScript errors.
   - `npm run lint`:
     ```
     > forest-rpg-v2@2.0.0 lint
     > eslint .
     ```
     Exit code: 0. Zero ESLint errors.
   - `npm test`:
     ```
     Test Files  10 passed (10)
          Tests  77 passed (77)
     ```
     Exit code: 0. All 10 test files passed.
   - `npm run build`:
     ```
     > forest-rpg-v2@2.0.0 build
     > tsc --noEmit && vite build
     ✓ 730 modules transformed.
     dist/index.html                         2.58 kB │ gzip:   1.07 kB
     dist/assets/pixi-BzE_xdxT.js          519.07 kB │ gzip: 148.10 kB
     ✓ built in 2.38s
     ```
     Exit code: 0. Bundle generated successfully.
   - Legacy repo check `/home/k9-vortex/Development/1-JavaScript/3-Game Development`:
     `git status` reports working tree clean, zero files modified.

2. **Facade Test in `tests/unit/core/InputManager.test.ts` (lines 77–86)**:
   ```typescript
   77:   it('persists and restores keybinds from storage', () => {
   78:     const customConfig = {
   79:       jump: ['KeyJ', 74],
   80:     };
   81:     input.setKeybinds(customConfig);
   82:     expect(input.isActionActive('jump')).toBe(false);
   83: 
   84:     input.simulateKeyDown('KeyJ');
   85:     expect(input.isActionActive('jump')).toBe(true);
   86:   });
   ```
   The test is named `'persists and restores keybinds from storage'`. However, it never invokes `saveToStorage()` or `loadFromStorage()`, does not mock or access `localStorage`, and only calls in-memory `setKeybinds()`.

3. **Defect in `src/core/input/InputManager.ts` (lines 269–297)**:
   ```typescript
   269:   public loadFromStorage(storageKey = 'playerKeybinds'): boolean {
   270:     if (typeof localStorage === 'undefined') return false;
   271:     try {
   272:       const raw = localStorage.getItem(storageKey);
   273:       if (!raw) return false;
   274:       const parsed = JSON.parse(raw) as Record<string, unknown>;
   275: 
   276:       for (const [key, val] of Object.entries(parsed)) {
   277:         let action: InputAction | null = null;
   278:         if (key === 'cut') action = 'attack';
   279:         else if (key in DEFAULT_KEYBINDS) action = key as InputAction;
   280: 
   281:         if (action) {
   282:           if (Array.isArray(val)) {
   283:             for (const code of val) {
   284:               if (typeof code === 'string' || typeof code === 'number') {
   285:                 this.bindAction(action, code);
   286:               }
   287:             }
   288:           } else if (typeof val === 'number' || typeof val === 'string') {
   289:             this.bindAction(action, val);
   290:           }
   291:         }
   292:       }
   293:       return true;
   294:     } catch {
   295:       return false;
   296:     }
   297:   }
   ```
   `loadFromStorage()` calls `this.bindAction(action, code)` for each loaded binding. Because `new InputManager()` populates `this._bindings` with `DEFAULT_KEYBINDS` on construction, calling `bindAction()` appends loaded keys without clearing the defaults. Consequently, default bindings cannot be rebound or unbound when loading from storage.

4. **Object Identity Leak in `src/core/spatial/SpatialHashGrid.ts` (lines 49–75, 246–259)**:
   ```typescript
   49:   public update(entity: T): void {
   ...
   72:     this._removeFromCells(entity, oldSpan);
   73:     this._entitySpans.set(id, newSpan);
   74:     this._addToCells(entity, newSpan);
   75:   }
   ...
   246:  private _removeFromCells(entity: T, span: EntityCellSpan): void {
   ...
   251:        const cell = this._cells.get(key);
   252:        if (cell) {
   253:          cell.delete(entity);
   ```
   `update(entity)` never updates `this._entities.set(id, entity)`. Furthermore, `_removeFromCells` calls `cell.delete(entity)` using reference equality. If an entity with the same `id` but a different object reference is passed to `update()` or `insert()`, `cell.delete(entity)` fails to remove the old entity reference, leaving orphan ghost entities in old cells while adding the new reference to new cells.

5. **Parent Container Singleton Pollution in `src/core/di/ServiceContainer.ts` (lines 70–94)**:
   ```typescript
   70:     const descriptor = this.findDescriptor<T>(token);
   ...
   83:     this.resolutionStack.push(token);
   84:     try {
   85:       const createdInstance = descriptor.factory(this);
   86: 
   87:       if (descriptor.isSingleton) {
   88:         descriptor.instance = createdInstance;
   89:       }
   90:       return createdInstance;
   ```
   When `child.resolve(parentToken)` is invoked for a parent singleton before the parent has resolved it, `descriptor.factory(this)` runs with `this = child`. If the parent singleton resolves dependencies overridden in the child, the child's overrides are injected, and the resulting instance is cached directly onto the parent descriptor (`descriptor.instance`), corrupting the parent container scope for future parent resolutions.

6. **Negative Radius Math Flaw in `src/core/math/AABB.ts` (lines 125–131)**:
   ```typescript
   125:   public intersectsCircle(center: Vector2 | { x: number; y: number }, radius: number): boolean {
   126:     const closestX = Math.max(this.minX, Math.min(center.x, this.maxX));
   127:     const closestY = Math.max(this.minY, Math.min(center.y, this.maxY));
   128:     const dx = center.x - closestX;
   129:     const dy = center.y - closestY;
   130:     return dx * dx + dy * dy <= radius * radius;
   131:   }
   ```
   If `radius < 0`, `radius * radius` produces a positive number (e.g. `(-5)^2 = 25`), causing geometrically impossible intersections to evaluate as `true`.

---

## 2. Logic Chain

1. **Integrity Violation & Facade Test (referencing Obs 1, Obs 2, Obs 3)**:
   - The task specification and `DISPATCH.md` explicitly required `localStorage` persistence and compatibility verification for `InputManager`.
   - In `tests/unit/core/InputManager.test.ts`, the test titled `'persists and restores keybinds from storage'` called only `input.setKeybinds(customConfig)` and never exercised `saveToStorage()` or `loadFromStorage()`.
   - This test is a facade that asserts memory mutation under the guise of storage persistence.
   - As a direct consequence of this skipped test, a functional defect in `InputManager.loadFromStorage()` went undetected: `loadFromStorage()` calls `this.bindAction()` instead of replacing the binding set for the action. Because `InputManager` initializes with `DEFAULT_KEYBINDS`, loaded bindings are merely appended. For instance, remapping `jump` from `Space` to `KeyJ` results in `{ Space, 32, KeyJ, 74 }`, so the original default keys remain permanently bound.
   - Under the adversarial reviewer guidelines, dummy/facade implementations or shortcuts that bypass intended verification must be classified as an **INTEGRITY VIOLATION**, requiring an explicit `REQUEST_CHANGES` verdict.

2. **Entity Duplication & Ghost Leak in Spatial Grid (referencing Obs 4)**:
   - In `SpatialHashGrid`, entities are keyed in `_entities` and `_entitySpans` by `id: string | number`. However, individual cells store `Set<T>` containing object references.
   - When `update(entity)` executes, it delegates removal to `_removeFromCells(entity, oldSpan)`, calling `cell.delete(entity)`.
   - If an entity is updated using a newly instantiated object (common in modern functional updates, respawning, or deserialized state), `cell.delete` does not find the new reference in the old cell.
   - The old entity instance is never removed from the old cell, the new instance is added to the new cell, and `this._entities` retains the stale object reference because `this._entities.set(id, entity)` is never called in `update()`.
   - This creates an unbounded memory leak and erroneous ghost collisions.

3. **Hierarchical DI Singleton Leaks (referencing Obs 5)**:
   - In `ServiceContainer`, hierarchical child scoping (`createChild()`) is designed to allow child containers to override specific dependencies.
   - When a parent singleton token is resolved through a child container prior to being resolved at the root, the parent's factory is passed the child container (`this`).
   - Any dependency resolved inside the factory will resolve the child's overridden service.
   - When line 88 stores `descriptor.instance = createdInstance`, this child-tainted instance is stored directly in the parent container's descriptor.
   - Any subsequent call to `parent.resolve(token)` or resolution from sibling containers receives the instance bound to the child scope.

4. **Geometric Edge Case (referencing Obs 6)**:
   - In `AABB.intersectsCircle`, computing `dx * dx + dy * dy <= radius * radius` without guarding against `radius < 0` produces false positive intersections when negative radii are passed.

---

## 3. Caveats

1. **GameLoop and EventBus Robustness**:
   - `src/core/loop/GameLoop.ts`, `Interpolation.ts`, and `src/core/events/EventBus.ts` were inspected and verified to be well-engineered, with comprehensive spiral-of-death guards, delta clamping, and re-entrancy safe error boundaries.
2. **Build and Strict TypeScript Compliance**:
   - The project builds cleanly with zero errors across strict compiler options (`noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`).
3. **No Caveats Beyond**:
   - The findings identified below must be addressed before Milestone 2 can be approved.

---

## 4. Conclusion

**Verdict: REQUEST_CHANGES**

Milestone 2 cannot be approved due to a critical integrity violation (facade unit test asserting persistence without invoking storage APIs) hiding a functional keybinding bug in `InputManager.loadFromStorage()`, as well as a major reference leak in `SpatialHashGrid.update()`.

### Summary of Required Changes

1. **[Critical — INTEGRITY VIOLATION] Fix Facade Test & Storage Loading in `InputManager`**:
   - In `src/core/input/InputManager.ts:269-297`: Update `loadFromStorage` so that when keybinds are loaded for an action, existing default bindings for that action are replaced rather than appended to, allowing users to rebind or unbind default keys.
   - In `tests/unit/core/InputManager.test.ts:77-86`: Rewrite the test to mock `localStorage`, execute `saveToStorage()`, instantiate a new `InputManager`, execute `loadFromStorage()`, and verify that custom binds replace defaults.
2. **[Major] Fix Entity Reference Update in `SpatialHashGrid`**:
   - In `src/core/spatial/SpatialHashGrid.ts:49-75`: Ensure `update(entity)` updates `this._entities.set(id, entity)` and that `_removeFromCells` removes the existing entity tracked in `this._entities.get(id)` so that new entity references do not leave ghost entities in old cells.
3. **[Major] Guard Hierarchical Parent Singleton Resolution in `ServiceContainer`**:
   - In `src/core/di/ServiceContainer.ts:83-91`: Ensure parent singletons are resolved with the declaring container context or that singletons resolved from child scopes do not corrupt parent descriptors.
4. **[Minor] Guard Negative Radius in `AABB.intersectsCircle`**:
   - In `src/core/math/AABB.ts:125`: Add `if (radius < 0) return false;`.

---

## 5. Verification Method

To verify the remediation:

1. **Verify Storage Persistence**:
   - Run `npx vitest run tests/unit/core/InputManager.test.ts`
   - Verify that `loadFromStorage` replaces default bindings when custom bindings are saved.
2. **Verify SpatialHashGrid Reference Updates**:
   - Add a test in `tests/unit/core/SpatialHashGrid.test.ts` where an entity with the same `id` is updated with a new object reference at a new position, verifying that the old position query returns empty and `getStats().entityCount` remains 1.
3. **Run Full Project Test Suite**:
   ```bash
   npm run typecheck
   npm run lint
   npm test
   npm run build
   ```
   *Expected: All commands exit with code 0, and all unit tests pass with genuine verification.*
4. **Invalidation Conditions**:
   - Any test named "persists and restores" that fails to invoke persistence methods.
   - Any lingering default keybind after loading a custom keybind from storage.
   - Any ghost duplicate entity in `SpatialHashGrid` when updating by ID.
