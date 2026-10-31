# Directional movement and punch verification

Verified on 2026-10-31 against baseline `58baaf8`. The punch now locks its direction at initiation. Movement keys determine the direction when their resolved vector is nonzero, including blocked movement; stationary punches retain enemy aim assist. Turning or casting a bolt during a punch does not steer its animation or strike.

**Root cause and reproduction**

On the baseline, hold W+A with a visible enemy southeast within the 1.8-tile melee reach and no enemy inside the northwest facing cone, then press E. Movement sets `player.facing` to NW, but `EncounterSystem.step` unconditionally calls `aimAt` at attack initiation (`EncounterSystem.ts`, baseline lines 107–110). That call changes the same field to SE. The first displayed punch therefore uses `player_attack_southwest`, the artwork that actually faces southeast. The next movement step writes NW again and the same punch changes to `player_attack_northeast`. Browser inspection recorded positive horizontal/world scale and zero rotation in both frames.

The strike at 120 ms also read the mutable `player.facing` (baseline line 118), while the slash effect captured the initial direction. Movement, bolt aim, sprite selection, strike geometry and the effect could consequently disagree. The failure depends on enemy geometry and which simulation steps are presented, explaining its intermittent appearance. An existing regression test explicitly required changing directional sheets mid-punch; it now requires locking.

The attack filenames' horizontal inversion is real and was already compensated correctly in `AnimationDefs`. Its mappings and all production art are unchanged. The separate report of W+A movement resembling W+D was not reproduced: all eight movement vectors and their rendered walk/run artwork passed independent checks. No special W+A/W+D correction was added.

**Implementation and changed files**

| Files | Change |
| --- | --- |
| `src/core/math/Direction.ts` | Shared compass resolver and normalized vectors; stopped input retains facing. |
| `src/systems/MovementSystem.ts` | Uses the resolver and returns locomotion animation intent; preserves physics and collision. |
| `src/systems/EncounterSystem.ts` | Owns transient locked attack direction, elapsed time, damage and consumed strike; moving input takes priority over melee assistance. Both hit cones and flower cutting use the locked vector. |
| `src/simulation/Simulation.ts` | Supplies effective/inverted input consistently, selects the final player animation once, supplies combat facing to rendering, and clears transient attacks on restore. Explicit player clock origin prevents presentation from delaying a clip when early frames were skipped. |
| `src/main.ts`, `src/game/Diagnostics.ts`, `src/types/diagnostics.ts` | Swing feedback uses combat direction; diagnostics expose `attackDirection` separately from current player facing. |
| `src/types/entities.ts`, `src/types/simulation.ts`, `src/types/render.ts` | Add the read-only attack view/accessor and document presentation facing. No save-format change. |
| `src/rendering/PixiRenderer.ts`, `src/rendering/DebugOverlay.ts` | Impact holds cannot retain another clip/facing or a prior swing. Debug data describes the actual displayed texture/frame and transform. |
| `tests/unit/core/Direction.test.ts`, `tests/unit/animation/playerPunchDirection.test.ts`, `tests/unit/persistence/saves.test.ts`, `tests/unit/game/fakes.ts` | Resolver, input/combat/render transitions, timing schedules, movement speed, directional strikes/cutting and save-restore regressions; updated simulation fake. |
| `tests/e2e/player-directions.spec.ts` | Real keyboard/mouse gameplay, actual texture/transforms and canvas pixels, all eight directions, all four punch frames, reversals, repeated inputs, aim assist and impacts. |
| `tests/e2e/tier1-feature/combat-abilities-bestiary.spec.ts` | Combo-reset test waits for the next fixed step to accept the click before asserting combo state. |
| `docs/testing.md`, this report and `docs/qa/evidence/player-directions/` | Commands, results and retained visual evidence. |

The existing 120 ms strike, nominal 360 ms attack, 320 ms four-frame clip, stamina costs, combo rules, automatic close-range hit radius and line-of-sight checks remain. Movement can turn during an attack; its animation resumes with the latest facing afterward. Attack presses during a swing remain ignored, with no input queue. A loaded mid-attack save cancels its transient swing and pending strike.

**Testing and results**

| Check | Result |
| --- | --- |
| `npm run typecheck`, `npm run lint`, `git diff --check` | Passed. |
| `npm run build` | Passed; existing large-Pixi-chunk advisory remains. |
| `npm test -- --maxWorkers=2 --testTimeout=60000` | **665 passed across 56 files**, including 160 input/combat/animation cases and nine direction-helper cases. Baseline had 509 tests. |
| `npx playwright test tests/e2e/player-directions.spec.ts --repeat-each=2 --workers=2` | **88 passed**, zero retries/failures: all 44 Chromium/Firefox cases passed twice. |
| Stabilized combo-reset browser case, six repeats per browser | **12 passed**. |
| West-direction stress after clock setup synchronization | **12 passed** in Firefox. |
| Additional live gameplay without the controlled clock | **35 Chromium + 34 Firefox attack frames**, zero mismatches while movement alternated through NW, NE, SE and SW. See [live samples](evidence/player-directions/live-frame-check.json). |
| Complete browser suite, before the final test synchronization corrections | **260 passed / 36 failed / 296 total**. Of the failures, **34 were independently reproduced on unchanged `58baaf8`**. The other two were the pixel capture and immediate combo assertion described below; their final retests pass. |

The 34 confirmed baseline failures concern old grid-step/dash/jump/collider expectations, regenerated stamina/mana sampled as exactly zero, legacy terminal commands, boss/ghost spawning, game-over naming and invulnerability assumptions. Their per-case identities and baseline confirmation are retained in [validation-summary.json](evidence/player-directions/validation-summary.json). These unrelated gameplay contracts were not changed.

The early pixel check had a west-running sample mismatch; the failure screenshot itself matched the correct west run frame. The test now commits the paused WebGL frame before sampling canvas pixels, and leaves adequate time between clock setup calls to avoid `pauseAt` targeting the past on a busy host. The final 88-run suite passes with the same pixel threshold. The legacy combo assertion read immediately after mouseup, before a fixed step necessarily consumed the input; it now polls for acceptance before testing the unchanged 800 ms reset. The entire 296-case suite was not repeated after these test-only corrections.

Tests exercise cardinal/diagonal movement and attacks, both diagonal key orders, release/reversal transitions, every pair of start/next movement directions, repeated punches, rejected mid-swing taps, stationary and moving aim, a simultaneous bolt, inverted Y, insufficient stamina, blocked movement, directional damage/cutting, one consumed strike, large deltas, skipped early animation frames, zero-step/catch-up frames and 30/60/144/240 Hz presentation schedules. Existing combat, collision, bridge, ledge, enemy encounter, save/load, impact and visual-effect tests were included in the full runs.

**Visual verification**

The galleries were assembled from actual gameplay screenshots of the production bundle. Rows are N, NE, E, SE, S, SW, W, NW; columns are walk, run, punch frames 0–3 and a stationary punch. Canvas checks compare opaque player pixels against independently selected source PNGs, and assert source rectangles and positive, unrotated sprite/world transforms. Both galleries were inspected visually.

- [Chromium: all eight directions and four punch frames](evidence/player-directions/chromium-eight-directions.png)
- [Firefox: all eight directions and four punch frames](evidence/player-directions/firefox-eight-directions.png)
- [Before: opposite first punch, then reversal on the next step](evidence/player-directions/before-opposite-punch.png)
- [After: first northwest punch with a southeast enemy](evidence/player-directions/after-northwest-punch.png)

**Limits**

The inherited full browser suite remains red for the 34 confirmed baseline cases. The movement-only visual swap was not independently reproduced. Visual coverage uses deterministic scenes and the installed Chromium/Firefox environments, plus the live-frame check; it cannot exhaust all hardware, keyboard rollover behavior or generated scenes. No production graphics/assets, commits, pushes or deployments were changed or performed.
