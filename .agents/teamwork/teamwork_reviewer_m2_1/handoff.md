# Handoff Report: Reviewer 1 — Milestone 2 Core Architecture & Simulation Engine

**Agent**: `teamwork_reviewer_m2_1`  
**Role**: reviewer, critic  
**Working Directory**: `/home/k9-vortex/Development/2-TypeScript/18-Forest RPG v2/.agents/teamwork/teamwork_reviewer_m2_1/`  
**Timestamp**: 2026-10-28T02:08:00Z  
**Verdict**: **REQUEST_CHANGES**

---

## 1. Observation

1. **Verification Command Results**:
   - `npm run typecheck`:
     ```
     > forest-rpg-v2@2.0.0 typecheck
     > tsc --noEmit
     (exit code 0)
     ```
   - `npm run lint`:
     ```
     > forest-rpg-v2@2.0.0 lint
     > eslint .
     (exit code 0)
     ```
   - `npm test`:
     ```
     > forest-rpg-v2@2.0.0 test
     > vitest run

     FAIL  tests/integration/m2_challenger_stress.test.ts > Milestone 2 Challenger Stress & Adversarial Suite > Timing & Lifecycle Invariant Stress > maintains microsecond precision and zero drift over 10,000 steps with fractional deltas
     AssertionError: expected 0.09999999978175111 to be close to +0, received difference is 0.09999999978175111, but expected 0.005
      ❯ tests/integration/m2_challenger_stress.test.ts:291:52
         289|       // Tick count must match simulated 1000 frames exactly (1000 ticks)
         290|       expect(tickCount).toBe(1000);
         291|       expect(longRunLoop.getStats().accumulatorMs).toBeCloseTo(0, 2);
            |                                                    ^
         292|       longRunLoop.stop();
         293|     });

      Test Files  1 failed | 10 passed (11)
           Tests  1 failed | 94 passed (95)
     (exit code 1)
     ```
   - `npm run build`:
     ```
     > forest-rpg-v2@2.0.0 build
     > tsc --noEmit && vite build
     vite v5.4.21 building for production...
     ✓ 730 modules transformed.
     dist/index.html                         2.58 kB │ gzip:   1.07 kB
     dist/assets/webworkerAll-DSxagEDM.js    0.13 kB │ gzip:   0.14 kB
     dist/assets/browserAll-BQbjX5eA.js      0.22 kB │ gzip:   0.19 kB
     dist/assets/index-CBeOImw-.js           1.32 kB │ gzip:   0.76 kB
     dist/assets/pixi-BzE_xdxT.js          519.07 kB │ gzip: 148.10 kB
     ✓ built in 2.20s
     (exit code 0)
     ```
   - Legacy Repository Clean Boundary:
     `git -C "/home/k9-vortex/Development/1-JavaScript/3-Game Development" status`
     ```
     On branch master
     Your branch is up to date with 'origin/master'.
     nothing to commit, working tree clean
     (exit code 0)
     ```

2. **Source Code Observations in `src/core/loop/GameLoop.ts` (lines 161–194)**:
   ```typescript
   161:   public tick(currentTimeMs?: number): void {
   162:     if (!this._isRunning) return;
   163: 
   164:     const now = currentTimeMs ?? this.now();
   165:     if (this.firstTickPending || this.resumeBaselinePending) {
   166:       this.lastTimeMs = now;
   167:       this.fpsWindowStartMs = now;
   168:       this.firstTickPending = false;
   169:       this.resumeBaselinePending = false;
   170:     }
   171: 
   172:     const rawDeltaMs = now - this.lastTimeMs;
   173:     this.lastTimeMs = now;
   174: 
   175:     // 1. Clamp frame delta to [minDeltaMs, maxDeltaMs]
   176:     const clampedDeltaMs = Math.max(this.minDeltaMs, Math.min(this.maxDeltaMs, rawDeltaMs));
   177:     this.lastFrameDeltaMs = clampedDeltaMs;
   ...
   192:     this.wallTimeMs += clampedDeltaMs;
   193:     this.accumulatorMs += clampedDeltaMs;
   ```
   When `firstTickPending` or `resumeBaselinePending` is true:
   Line 166 sets `this.lastTimeMs = now`.
   Line 172 calculates `rawDeltaMs = now - this.lastTimeMs` which evaluates to `0`.
   Line 176 clamps `rawDeltaMs` using `Math.max(this.minDeltaMs, ...)` where `this.minDeltaMs = 0.1`.
   Consequently, `clampedDeltaMs = 0.1`.
   Line 193 executes `this.accumulatorMs += 0.1`.
   A phantom delta of `0.1ms` is added to `accumulatorMs` whenever a baseline sync occurs (at startup and on every `resume()`).

3. **Source Code Observations in `src/core/events/EventBus.ts` (lines 116–138)**:
   ```typescript
   125:     const snapshot = Array.from(handlers);
   126: 
   127:     for (let i = 0; i < snapshot.length; i++) {
   128:       const handler = snapshot[i];
   129:       if (!handler) continue;
   130: 
   131:       try {
   132:         handler(payload);
   133:       } catch (err: unknown) {
   134:         this.errorHandler(err, event as keyof GameEvents, payload);
   135:       }
   136:     }
   ```
   If listener A in `snapshot` unregisters listener B (where B appears later in `snapshot`), B still executes in the current dispatch iteration because `snapshot` contains B and line 129 does not check whether `handlers.has(handler)`.

4. **Source Code Observations in `tests/unit/core/GameLoop.test.ts` (lines 64–85)**:
   ```typescript
   78:     trackingLoop.tick(1000);
   79:     trackingLoop.tick(1050); // +50ms (clamped)
   80:     trackingLoop.tick(1100); // +50ms (clamped)
   81: 
   82:     expect(tickCount).toBeLessThanOrEqual(10);
   83:     expect(trackingLoop.currentAccumulatorMs).toBeLessThanOrEqual(100);
   ```
   In this unit test, `tick(1050)` adds 50ms and drains 3 ticks (50ms), leaving 0.1ms. `tick(1100)` adds 50ms and drains 3 ticks (50ms), leaving 0.1ms. The accumulator never exceeds 100ms; therefore, line 211 of `GameLoop.ts` (`this.droppedFramesCount++`) is never triggered or asserted in this unit test.

---

## 2. Logic Chain

1. **Test Failure and Invalidation (referencing Obs 1)**:
   - The test runner command `npm test` failed with exit code 1 due to `tests/integration/m2_challenger_stress.test.ts`.
   - The failure is deterministic and directly attributable to an invariant violation in `GameLoop.ts`.
   - Under project and workflow guidelines, a non-zero test suite exit code invalidates immediate approval.

2. **Root Cause Analysis of Phantom Accumulator Accumulation (referencing Obs 1, 2)**:
   - In `GameLoop.tick()`, the baseline sync logic for `firstTickPending` and `resumeBaselinePending` updates `this.lastTimeMs = now`, resulting in `rawDeltaMs = 0`.
   - Because `MIN_DELTA_MS = 0.1`, `Math.max(0.1, 0)` forces `clampedDeltaMs = 0.1`.
   - Adding `0.1ms` to `accumulatorMs` introduces phantom elapsed time when zero wall time has actually passed.
   - In 60Hz simulations where each wall frame exactly equals `1000/60 ms`, this `0.1ms` residue is never drained because each subsequent frame adds `16.6667ms` and subtracts `16.6667ms`. Thus, `accumulatorMs` remains permanently offset by `~0.1ms`.
   - Moreover, each invocation of `pause()` and `resume()` injects an additional `0.1ms` of unearned accumulator time. Over 160 pause cycles, this produces a full phantom physics step (16.67ms).
   - Fix direction: On ticks where `this.firstTickPending || this.resumeBaselinePending` is true, the loop should establish the baseline without accumulating delta time into `this.accumulatorMs` (e.g. setting `clampedDeltaMs = 0` or returning early).

3. **EventBus Re-entrancy Semantics (referencing Obs 3)**:
   - `EventBus` snapshot iteration correctly prevents iteration crashes and infinite loops when listeners register new listeners or unsubscribe during emission.
   - However, if handler 1 unsubscribes handler 2 during emit, handler 2 still fires once in the current wave because it was captured in `snapshot`. Checking `if (!this.listeners.get(event)?.has(handler)) continue;` inside the loop would provide strict immediate deregistration.

4. **Integrity Assessment**:
   - No hardcoded test results were detected.
   - No facades, dummy stubs, or unauthorized external library delegates were found.
   - All core simulation logic (fixed step accumulator, interpolation, event bus) is genuine, modular, and written to strict TypeScript standards.
   - Legacy workspace `/home/k9-vortex/Development/1-JavaScript/3-Game Development` is 100% clean and untouched.

---

## 3. Caveats

1. **PixiJS Rendering Integration**: `GameLoop` callbacks (`onFixedUpdate`, `onRender`) were tested with Vitest mocks and headless stepping. Full PixiJS ticker and WebGL canvas synchronization is scoped to Milestone 3.
2. **AudioBridge AudioContext**: AudioBridge compatibility was confirmed with `EventBus`. Actual Web Audio node execution in headless environments is mocked via Vitest DOM mocks.

---

## 4. Conclusion

**Verdict: REQUEST_CHANGES**

Milestone 2 shows high-quality architectural design, excellent TypeScript strictness, and genuine implementation across both the fixed-timestep loop and event bus. However, changes are required before Milestone 2 can be approved:

### Required Changes:
1. **[Major] Fix Phantom Delta Accumulation on Timing Baseline Reset in `src/core/loop/GameLoop.ts`**:
   - Location: `src/core/loop/GameLoop.ts:165–177`
   - Problem: When `firstTickPending` or `resumeBaselinePending` is processed, `rawDeltaMs` becomes 0, which gets clamped to `0.1ms` and added to `accumulatorMs`.
   - Required Fix: For the baseline reset tick, ensure `clampedDeltaMs = 0` (or return early after resetting timestamps), avoiding phantom accumulator drift. This will fix the failure in `tests/integration/m2_challenger_stress.test.ts`.

2. **[Minor] Add Unit Test for Accumulator Backlog Drop (>100ms) in `tests/unit/core/GameLoop.test.ts`**:
   - Location: `tests/unit/core/GameLoop.test.ts:64–85`
   - Problem: The test does not configure parameters that cause `accumulatorMs > maxAccumulatorBacklogMs`, leaving line 211 untested in the unit suite.
   - Suggestion: Add an explicit test case with `maxStepsPerFrame: 1` and `maxAccumulatorBacklogMs: 30` (or similar) to directly verify `droppedFramesCount++` and backlog drop.

3. **[Minor] Immediate Re-entrancy Unsubscribe Guard in `src/core/events/EventBus.ts`**:
   - Location: `src/core/events/EventBus.ts:127–130`
   - Suggestion: Check `if (!this.listeners.get(event)?.has(handler)) continue;` to ensure listeners unsubscribed mid-dispatch do not fire in the current wave.

---

## 5. Verification Method

To independently verify the resolution of these findings:

1. **Run Full Test Suite**:
   ```bash
   npm test
   ```
   *Expected: Exit code 0, 11 test files passed, 95 tests passed.*

2. **Run Strict Typecheck**:
   ```bash
   npm run typecheck
   ```
   *Expected: Exit code 0, 0 compiler errors.*

3. **Run Linter**:
   ```bash
   npm run lint
   ```
   *Expected: Exit code 0, 0 ESLint warnings or errors.*

4. **Run Production Build**:
   ```bash
   npm run build
   ```
   *Expected: Exit code 0, successful Vite bundle generation.*

5. **Verify Legacy Boundary**:
   ```bash
   git -C "/home/k9-vortex/Development/1-JavaScript/3-Game Development" status
   ```
   *Expected: Clean working tree, 0 untracked or modified files.*
