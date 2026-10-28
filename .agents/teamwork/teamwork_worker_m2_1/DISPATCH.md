# Dispatch: teamwork_worker_m2_1

## Task Objective
Implement the complete Milestone 2: Core Architecture & Simulation Engine for Forest RPG V2 according to the architecture blueprints and specifications provided by the three M2 explorers:
1. `src/core/loop/`:
   - Specifications: `/home/k9-vortex/Development/2-TypeScript/18-Forest RPG v2/.agents/teamwork/teamwork_explorer_m2_1/m2_loop_spec.md`
   - Files: `types.ts`, `GameLoop.ts`, `Interpolation.ts`
   - Invariants: 60Hz fixed simulation timestep (`FIXED_STEP_SEC = 1/60`, `FIXED_STEP_MS = 1000/60`), delta clamp `[0.1, 50.0]`, spiral-of-death guard (max 5 steps per frame, drop backlog when accumulator > 100ms), alpha interpolation calculation, lifecycle control (`start`, `stop`, `pause`, `resume` with timing baseline reset), headless stepping APIs (`step(customDeltaMs)`, `simulateTicks(count)`), `EngineState` telemetry diagnostics.
2. `src/core/events/`:
   - Specifications: `/home/k9-vortex/Development/2-TypeScript/18-Forest RPG v2/.agents/teamwork/teamwork_explorer_m2_2/m2_events_di_spec.md`
   - Files: `types.ts`, `EventBus.ts`
   - Invariants: Strongly-typed `GameEvents` dictionary mapping Player, Entity, World, Combat, UI, Terminal, and Audio events; methods `on`, `off`, `emit`, `once`, `clear`; per-listener error boundary (`try...catch`) so listener errors never crash the simulation loop; snapshot iteration (`Array.from(handlers)`) protecting against re-entrancy mutations; unsubscribe closures.
3. `src/core/di/`:
   - Specifications: `/home/k9-vortex/Development/2-TypeScript/18-Forest RPG v2/.agents/teamwork/teamwork_explorer_m2_2/m2_events_di_spec.md`
   - Files: `types.ts`, `tokens.ts`, `ServiceContainer.ts`
   - Invariants: Zero-dependency token-based dependency injection (`ServiceToken<T>`), singleton and transient lifecycles, circular dependency detection with formatted cycle error graph (`A -> B -> A`), child container scoping.
4. `src/core/math/`:
   - Specifications: `/home/k9-vortex/Development/2-TypeScript/18-Forest RPG v2/.agents/teamwork/teamwork_explorer_m2_3/m2_input_spatial_spec.md`
   - Files: `Vector2.ts` (expand existing class with `sub`, `scale`, `normalize`, `clone`, `set`, `lengthSq`, `distanceToSq`, `dot` while preserving backward compatibility with `smoke.test.ts`), `AABB.ts` (2D bounding box with getters, factories `fromCorners`, `fromCenter`, `containsPoint`, `intersectsAABB`, `intersectsCircle`, `expand`).
5. `src/core/input/`:
   - Specifications: `/home/k9-vortex/Development/2-TypeScript/18-Forest RPG v2/.agents/teamwork/teamwork_explorer_m2_3/m2_input_spatial_spec.md`
   - Files: `types.ts`, `InputManager.ts`
   - Invariants: Action bindings for all game inputs (movement, sprint, jump, dash, melee attack, Q/E skills, 1/2 potions, pause, terminal toggle); dual-code translation (modern string `code` like `'KeyW'`, legacy numeric `keyCode` like `87`, mouse buttons `0`, `1`, `2`); `localStorage` persistence with `'playerKeybinds'`; zero-allocation edge latching (`isActionActive`, `isActionJustPressed`, `isActionJustReleased`, `clearFrameState()`); headless simulation API (`simulateKeyDown`, `simulateKeyUp`, `simulateMouseMove`, etc.).
6. `src/core/spatial/`:
   - Specifications: `/home/k9-vortex/Development/2-TypeScript/18-Forest RPG v2/.agents/teamwork/teamwork_explorer_m2_3/m2_input_spatial_spec.md`
   - Files: `types.ts`, `SpatialHashGrid.ts`
   - Invariants: Configurable cell size (default 64px or 128px) partitioning the 4800x4800px world; multi-cell entity registration across all spanned cells `[minCX..maxCX] x [minCY..maxCY]`; `insert`, `update`, `remove`, `clear`; query deduplication; two-phase `queryRadius` (AABB broadphase circumscribing circle + `AABB.intersectsCircle` narrowphase); `queryAABB`; `queryPoint`.
7. `src/core/index.ts`:
   - Unified barrel export for all core systems.
8. Unit tests in `tests/unit/core/`:
   - Implement comprehensive Vitest test suites as specified in the 3 explorer blueprints:
     - `tests/unit/core/GameLoop.test.ts`
     - `tests/unit/core/Interpolation.test.ts`
     - `tests/unit/core/EventBus.test.ts`
     - `tests/unit/core/ServiceContainer.test.ts`
     - `tests/unit/core/Vector2.test.ts`
     - `tests/unit/core/AABB.test.ts`
     - `tests/unit/core/InputManager.test.ts`
     - `tests/unit/core/SpatialHashGrid.test.ts`

## Mandatory Integrity Warning
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

## Verification Requirements
Run and ensure the following all pass cleanly with zero errors:
1. `npm run typecheck`
2. `npm run lint`
3. `npm test`
4. `npm run build`
Record the exact command outputs in your `handoff.md`.
