# Directional stability and browser regression verification

Work is isolated on `fix/directional-stability` in the sibling `18-Forest RPG v2-directional-stability` worktree. The shared checkpoint is `1b58cbac0496d0146923abbbe5e2c6447d9ed66e`, parent `58baaf8`. It contains the reviewed punch changes and their evidence. The original working tree and index were preserved. No world-art/economy/chest assets were edited, and nothing was pushed, merged or deployed.

The [previous investigation](player-directions.md) remains historical evidence. Its 34 inherited failures and two subsequently repaired synchronization failures are individually classified in [historical-failures.json](evidence/directional-stability/historical-failures.json).

## Causes and implementation

`EncounterSystem.aimAt` used to write `player.facing`. A running W+A+Shift player casting R with a southeast target consequently retained northwest velocity but displayed southeast for one step. Target selection now only returns a target; bolts calculate their own vector and facing. Only stationary casts update resting facing. The earlier locked punch direction and strike cone remain authoritative through movement reversals, release, ranged casts and damage.

The old renderer detected swings from an animation-clock decrease and counted combos using presentation time. It could miss a new swing if the previous swing ended and another advanced between rendered frames. Each accepted punch now gets a monotonic swing ID and simulation-owned combo step, carried by the read-only attack view and render snapshot. Impact holds recognize new player swings by ID.

The slash follows the player's interpolated origin, with the existing 12-pixel upward offset. Its locked direction, combo appearance and 170 ms lifetime come from the attack state; it no longer starts a fresh cosmetic clock when first observed. A first observation after expiration produces no slash. Read-only diagnostics report the actual slash ID, combo, origin, angle and age, plus displayed sprite position. No save fields or bindings changed.

The complete visual review also demonstrated a separate artwork defect: all six southwest running frames face southeast. `run_southwest.png` and `run_southeast.png` have the identical SHA-256 `7890251d798a551037254302d66e11ab782d8efe1800bb710f7ef6f013d05fbc`. `AnimationDefs` now selects the southeast strip for southwest running with a per-frame horizontal mirror. Frame order, timing, scale magnitude, anchor and all PNGs remain unchanged. Earlier pixel checks could match the incorrectly named source PNG; reviewing every source frame revealed the duplication. The tests now require this one negative horizontal transform and compare against independently mirrored reference pixels. Idle, walk, other running directions and punch mappings remain unchanged. See the [source-strip audit](evidence/directional-stability/source-run-art-audit.png) and [before gallery](evidence/directional-stability/before-all-frames.png).

## Changed files

| Files | Purpose |
| --- | --- |
| `src/systems/EncounterSystem.ts`, `src/types/entities.ts` | Independent bolt aim; detached attack view with swing identity and combo. |
| `src/simulation/Simulation.ts`, `src/types/render.ts`, `src/main.ts` | Carry authoritative attack state into presentation and swing feedback. |
| `src/rendering/PixiRenderer.ts`, `src/rendering/effects/EffectsLayer.ts`, `src/rendering/DebugOverlay.ts` | Identify new swings, attach slash origin, honor simulation age and expose actual diagnostics. Remove the obsolete renderer-timed slash path. |
| `src/animation/AnimationDefs.ts` | Mirror the demonstrated duplicated SW running frames. |
| `tests/unit/animation/{playerPunchDirection,resolveSpriteFrame}.test.ts`, `tests/unit/rendering/EffectsLayer.test.ts` | Direction/aim/identity/schedule and mirror regressions. |
| `tests/e2e/player-directions.spec.ts`, `tests/e2e/helpers/{directional-fixture,encounter-contract,game-driver}.ts` | Full-frame pixel audit, deterministic validated fixtures, controlled and live input traces. |
| Five Tier 1/2 gameplay specs | Replace inherited assumptions with the current contracts listed below; retain all cases. |
| `playwright.config.ts`, `scripts/directional-gallery.mjs`, `docs/testing.md`, this report and evidence | Isolated port ownership, reproducible screenshot galleries, execution and integration records. |

## Historical test repairs

| Cases (both browsers) | Code-supported contract and replacement |
| --- | --- |
| T1.2.1, T1.2.4 | Continuous normalized movement; 200 ms dash, 1000 ms cooldown. Check displacement against fixed steps and real dash states. |
| T1.2.5 | 500 ms steerable jump. Check northward flight, eastward redirection, then landing. |
| T1.2.6, T2.2.1–2 | Physical footbox has half-width .22, half-height .10 and vertical offset .2125. Check its edges against solid border contact. |
| T1.2.3, T2.2.3 | Stamina regenerates during the four-second sprint lockout. Check bounded resources, disabled sprint, recovery, then successful sprint. |
| T2.2.5 | Measure cancellation while both opposing keys are held, before either release. |
| T2.3.3 | Rejected skills preserve regenerating mana. Check resource accounting, unchanged enemy health and absence of projectiles. |
| T2.3.2 | The actual scene name is `gameover`. Assert it and movement lock. |
| T2.3.4 | `/damage_player` is unsupported. Two ordinary attackers exercise the 800 ms hurt window and later successful damage. |
| T1.3.8, T2.3.5 | Forest boss spawn is staged. Check warning, emergence immunity, fighting, then a successful melee hit at a wall with unchanged boss position. `/push_enemy` is unsupported. |
| T1.3.9 | Grove ghosts form, persist across dawn and enter cooldown after defeat. |
| T1.4.5 | `/set_tile` and `/get_tile` are unsupported; 100 ms precedes the 120 ms strike. Load validated flower geometry, attack through keyboard input and verify before/after tiles. |
| T1.4.9 | `/god` is unsupported. Exercise supported help, teleport, inventory and stamina commands through the actual terminal input. |

## Validation

The original installed dependencies were Vite 7.3.7 and Vitest 4.1.12. Dependencies were installed independently with `npm ci`: Vite 5.4.21, Vitest 2.1.9 and Playwright 1.64.1. The locked baseline build passed, and 665 unit/integration tests passed in 56 files. This was independently reconfirmed from an immutable `git archive` of the checkpoint after implementation, reusing the same locked dependency installation; see the [checkpoint log](evidence/directional-stability/unit-checkpoint.txt) and [final unit log](evidence/directional-stability/unit-final.txt). The historical Vitest command with only `--maxWorkers=2` fails on this locked version because default minimum workers exceeds maximum workers; specify both `--minWorkers=1 --maxWorkers=2`.

An exploratory full-browser baseline was interrupted after 47 passes and four Firefox world-generation timeouts; 245 unrun cases are reported as skipped by interruption. This is not a completed baseline or a green suite. The first focused run later ended with SIGTERM without a completed report. Some subsequent exploratory runs were deliberately stopped for identified test repairs; none is counted as one of the final complete-suite runs. A frozen-clock busy-loop test was replaced with a five-second `fastForward` gap, checking at most three catch-up steps, exact displacement, accumulator bounds and resumed movement. Two consecutive complete final runs each passed all 306 tests, with zero skipped, failed or flaky cases and retries disabled. All 34 inherited failing browser cases now pass under their current gameplay contracts; no inherited browser failure remains unresolved.

| Final check | Result |
| --- | --- |
| Unit/integration | **713 passed, 56 files**. |
| Typecheck, lint, diff whitespace check | Passed. |
| Production build | Passed; existing large-Pixi-chunk advisory only. |
| Complete browser run 1 | **306 passed** (153 Firefox + 153 Chromium), no skips/failures/flakiness; retries 0. |
| Complete browser run 2 | **306 passed** (153 Firefox + 153 Chromium), no skips/failures/flakiness; retries 0. |

Exact timestamps, durations, commands and every executed case are in [validation-summary.json](evidence/directional-stability/validation-summary.json). The two complete runs account for **612 browser passes**. No cases were skipped and no visual threshold was reduced.

The preview and browser tests both use `http://localhost:4311`, with `--strictPort` and server reuse disabled. Reports/builds stay in this worktree. Verification commands:

```sh
npm ci
npm run typecheck
npm run lint
npm test -- --minWorkers=1 --maxWorkers=2 --testTimeout=60000
npm run build
npx playwright test --workers=2 --retries=0
```

Coverage adds all 16 held-key combinations for WASD and arrows, diagonal transitions, eight-direction bolts, stationary assistance, stable combo identity, missed observations, pause/resume and ten seeded traces per 30/60/144/240 Hz schedule. The pixel audit compares each idle/walk/run frame and each punch frame with independently selected source PNGs, requiring the reviewed transform signs (only SW run is mirrored), zero rotation and zero off-diagonal transform terms and the unchanged >80% opaque-pixel match threshold. The audit covers 144 distinct direction/frame combinations per browser. Both controlled-clock and ten-repeat live RAF scenarios exercise movement and bolts; the slash test repeats ten times per browser and checks origin, angle, combo, ID, pause/resume and expiration. Damage, death, inverted Y and mid-swing save/reload are covered separately.

The exact deterministic input schedules and seeds are retained in [input-traces.json](evidence/directional-stability/input-traces.json). Reproduce the visual galleries with `node scripts/directional-gallery.mjs test-results/complete-2`.

## Visual evidence and traces

- [Before: running W+A+Shift+R displays southeast for one step](evidence/directional-stability/before-running-bolt.png).
- [Before: all frames, including the incorrect SW run row](evidence/directional-stability/before-all-frames.png).
- [After: Chromium, all 144 direction/frame combinations](evidence/directional-stability/chromium-all-frames.png).
- [After: Firefox, all 144 direction/frame combinations](evidence/directional-stability/firefox-all-frames.png).
- Live RAF observations: [Chromium](evidence/directional-stability/chromium-live-traces.json), [Firefox](evidence/directional-stability/firefox-live-traces.json). Each browser records 50 running samples and ten locked-punch observations over ten iterations, without installing the controlled clock.
- [Exploratory failures and interrupted runs](evidence/directional-stability/exploratory-runs.json). Frame-boundary sampling, fixed-step accounting, health clamping and IEEE signed-zero assertions were corrected without relaxing pixel matching or gameplay outcomes.

The galleries were assembled from actual gameplay screenshots and visually inspected. Columns show idle 0–3, walk 0–3, run 0–5 and punch 0–3; rows show N, NE, E, SE, S, SW, W and NW. Each source frame is independently selected in the pixel tests. The source run-strip audit establishes the duplicated southwest art; no new defect was demonstrated in the other reviewed locomotion frames.

## Scope and remaining limits

The movement-only report remains unproven; the independently reproduced bolt-facing write does not establish its cause. The only new animation mapping change is the demonstrated six-frame SW running defect. Deterministic traces cannot exhaust hardware keyboard rollover, GPU differences or all generated worlds.

## Local integration handoff

The reviewed implementation commit is `34340afefc92706c46289d3b0ba277b26dc68db7`, following checkpoint `1b58cbac0496d0146923abbbe5e2c6447d9ed66e`. The [integration manifest](directional-integration.json) records both SHAs, the original base, integration order, changed files, shared-file notes and exact validation commands. The report/evidence follow as a documentation-only commit. Use the isolated branch for review; the original checkout still contains its pre-existing uncommitted work. Nothing was pushed, merged or deployed.
