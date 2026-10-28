# Handoff Report — Game Loop & Interpolation Subsystem Architecture

**Agent**: `teamwork_explorer_m2_1`  
**Date**: 2026-10-27T23:40:00Z  
**Target Milestone**: Milestone 2 (Core Architecture & Simulation Engine)  
**Deliverable Document**: `m2_loop_spec.md`

---

## 1. Observation

1. **`ORIGINAL_REQUEST.md` (lines 16-18)**:
   > "R1. Standalone TypeScript Engine and Rendering Architecture: Build an independent game engine using strict TypeScript, PixiJS 8, and Vite, featuring a single authoritative fixed-timestep simulation game loop (60 Hz) decoupled from variable rendering frame rates..."

2. **`PROJECT.md` (lines 50-51)**:
   > "| 4 | Decoupled 60Hz Fixed Simulation Loop | Fixed timestep (16.667ms) accumulator, 50ms delta clamp, 100ms / 5-step spiral-of-death guard | M2 |"
   > "| 5 | Alpha Transform Interpolation | Interpolation factor alpha = accumulator / fixedStep for jitter-free rendering across 60Hz–240Hz+ displays | M2 |"

3. **`tests/e2e/tier1-feature/engine-boot-menu.spec.ts` (lines 41-82)**:
   - `T1.1.2`: Requires `engine.isRunning === true`, `engine.targetFps === 60`, `engine.fixedDeltaMs` close to `16.667`, and stepCount advancing proportionally in 250ms (expected 10 to 25 steps).
   - `T1.1.3`: Requires `pauseSimulation()` to freeze `engine.stepCount`, and `resumeSimulation()` to resume advancing `stepCount` without jumping forward.

4. **`tests/e2e/tier2-boundary/boundary-simulation-movement.spec.ts` (lines 70-87)**:
   - `T2.2.4`: Long frame delay (e.g. 2000ms freeze) must clamp delta time to 50ms, prevent freezing or crash, and maintain `afterState.engine.accumulatorMs <= 100`.

5. **`tests/e2e/helpers/types.ts` (lines 71-82, 169-187)**:
   - `EngineState` requires fields: `isRunning`, `isPaused`, `targetFps`, `actualFps`, `fixedDeltaMs`, `accumulatorMs`, `stepCount`, `canvasWidth`, `canvasHeight`, `pixelRatio`.
   - `GameDiagnosticsGateway` requires: `stepSimulation(fixedDeltaSec?: number)`, `pauseSimulation()`, `resumeSimulation()`.

6. **`vitest.config.ts` (lines 11-16)**:
   - Vitest test environment is configured to `node`, meaning `window` and `window.requestAnimationFrame` are not present by default during unit test execution.

---

## 2. Logic Chain

1. **Decoupled Timing Necessity (referencing Obs 1, 2, 3)**:
   Modern displays run at 60Hz, 120Hz, 144Hz, or 240Hz. Coupling simulation ticks to `requestAnimationFrame` would cause physical movement, stamina, and combat to scale with the refresh rate. Therefore, authoritative simulation must run in a fixed-step loop at 60Hz (`1000/60 = 16.6667ms`), and rendering must interpolate position via `alpha = accumulator / fixedStepMs`.

2. **Spiral of Death & Clamping Defense (referencing Obs 2, 4)**:
   When tabs are hidden or during garbage collection pauses, frame deltas exceed hundreds of milliseconds. Clamping raw frame delta to `[0.1, 50.0]` ms prevents large spikes. Inside the frame, capping fixed simulation updates to `MAX_FIXED_STEPS_PER_FRAME = 5` and dropping accumulator backlogs when `accumulatorMs > 100` guarantees that CPU execution time per frame remains bounded and `accumulatorMs <= 100`, satisfying `T2.2.4`.

3. **Lifecycle State Transition Integrity (referencing Obs 3, 5)**:
   Pausing freezes the accumulator and fixed updates so `stepCount` does not increment while paused. Resuming resets the timing baseline (`lastTimeMs = performance.now()`) so the elapsed pause duration does not flood the accumulator upon unpausing.

4. **Headless Execution Compatibility (referencing Obs 6)**:
   Because Vitest runs in Node.js, `GameLoop` must not fail when `window.requestAnimationFrame` is undefined. It provides:
   - Fallback timer scheduling (`setTimeout`) when RAF is absent.
   - Deterministic headless APIs: `step(customDeltaMs)` and `simulateTicks(count)`, allowing fast, deterministic headless unit and integration testing.

5. **Entity Alpha Interpolation (referencing Obs 1, 2)**:
   Between 60Hz ticks, entities have `(prevX, prevY)` and current `(x, y)`. During the render phase, visual coordinates are calculated as `renderX = prevX + (x - prevX) * alpha`, with `snapEntity()` provided for instantaneous position resetting during teleports or respawns.

---

## 3. Caveats

1. **Renderer Canvas Dimensions**: `GameLoop` manages the timing loop and telemetry (`EngineState.isRunning`, `isPaused`, `targetFps`, `actualFps`, `fixedDeltaMs`, `accumulatorMs`, `stepCount`). The canvas dimensions (`canvasWidth`, `canvasHeight`, `pixelRatio`) are owned by the PixiJS renderer (Milestone 3) and composed into the diagnostics gateway.
2. **Subsystem Coordination**: Milestones 2.2 (`EventBus`) and 2.3 (`InputManager`, `SpatialHashGrid`) run in parallel. `GameLoop` is intentionally designed with zero external dependencies to ensure immediate standalone testability and zero merge conflicts.

---

## 4. Conclusion

The architecture specification and code blueprints in `m2_loop_spec.md` provide an authoritative, hardened, and test-ready design for:
- `src/core/loop/types.ts`: All constants, interfaces, and stats schemas.
- `src/core/loop/GameLoop.ts`: 60Hz accumulator, [0.1, 50]ms clamping, spiral-of-death guard (5 steps / 100ms cap), alpha calculation, lifecycle methods, and headless APIs.
- `src/core/loop/Interpolation.ts`: In-place lerp utilities, entity position interpolation, teleport snapping, and angular shortest-path wrapping.
- Complete Vitest test specifications for `GameLoop.test.ts` and `Interpolation.test.ts`.

All acceptance criteria and E2E diagnostic contracts (`T1.1.2`, `T1.1.3`, `T2.2.4`) are strictly satisfied.

---

## 5. Verification Method

1. **Specification Review**:
   - Inspect `/home/k9-vortex/Development/2-TypeScript/18-Forest RPG v2/.agents/teamwork/teamwork_explorer_m2_1/m2_loop_spec.md`.
2. **Downstream Implementation Verification**:
   When the implementer places the files in `src/core/loop/` and `tests/unit/core/`:
   ```bash
   npm run typecheck
   npm run lint
   npm test
   ```
3. **Invalidation Conditions**:
   - If `FIXED_STEP_SEC` or `FIXED_STEP_MS` deviates from 60Hz (`1/60s`, `16.667ms`).
   - If frame delta clamp does not reject values outside `[0.1, 50.0]`.
   - If accumulator backlog exceeds 100ms after freeze.
   - If unit tests fail in headless Node.js without DOM.
