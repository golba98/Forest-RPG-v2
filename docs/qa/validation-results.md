# Gameplay repair validation

Validation date: 2026-10-28. Worktree `../18-Forest RPG v2-codex-gameplay`, branch `codex/gameplay-repair`, based on `0596ad9`.

## Commands and results

| Check | Result |
| --- | --- |
| `npm run typecheck` | PASS, TypeScript strict mode |
| `npm run lint` | PASS, no warnings |
| `npm test` | PASS, 258 tests across 28 files, including both existing integration stress suites |
| `npm run build` | PASS; existing Pixi chunk-size advisory remains |
| `PLAYWRIGHT_BASE_URL=http://127.0.0.1:4175 npx playwright test --workers=2 --reporter=json` | 139 passed, 21 failed, 0 skipped across Firefox and Chromium |
| New `gameplay-repair.spec.ts` scenarios | All 8 passed (4 per browser) |
| Updated hill/collision/border and deterministic crush browser cases | Passed in both browsers |
| `npm run benchmark -- tests/benchmarks/world.bench.ts` | 67 samples; mean 45.25 ms, range 32.05–70.11 ms for normal 150×150 worlds; measured while browser tests were active |
| `git diff --check` | PASS |

No unit/integration or browser tests were skipped. The full browser suite exits nonzero; it is not reported as green. An expected audio-denial error is printed by the passing audio failure-handling unit test.

Production build was served by Vite preview at port 4175. Browser movement used real keys; fixture construction, objective completion and regeneration setup used the debug/save interfaces as described in the recording review. Screenshots were inspected, including actual seed 123 lower hills. Headed human playtesting was not performed.

## Remaining browser failures

Re-ran the affected suites against the untouched foundation branch, using its original source through the Vite development server at port 4174. Baseline comparison: 29 Firefox cases yielded 19 passes/10 failures; an additional 15 yielded 12 passes/3 failures. Every remaining final failure title appears in those baseline failures. This establishes pre-existing test/implementation mismatches; it does not assert that every failing assertion is a desirable product contract.

The initial full repair run had 130 passes/30 failures, including obsolete hill-jumping expectations and nondeterministic collision/crush fixtures. Updated only tests directly affected by this repair: impassable jumps, safe physical boundary positions, and deterministic crush geometry. Final full run: **139 passes/21 failures**.

| Existing test | Browser failures | Actual mismatch |
| --- | --- | --- |
| T1.2.1 directional movement | 2 | Expects exact tile snapping from timed key input; V2 uses continuous motion |
| T1.2.3 stamina exhaustion | 2 | Expects stamina to remain exactly zero while regeneration is active |
| T1.2.4 dash | 2 | Expects an immediate exact one-tile displacement from a short key tap |
| T1.2.5 jump | 2 | Expects horizontal input to be locked throughout a jump; existing V2 allows movement |
| T1.4.5 flower interaction | 2 | Calls unimplemented diagnostic commands instead of setting up and striking flowers; simulation flower regression passes |
| T1.4.9 terminal help | 2 | Requires unsupported `/god` in help |
| T2.3.2 player death | 2 | Expects `game_over`/`death`, while the actual scene identifier is `gameover` |
| T2.3.3 zero mana | 2 | Expects exactly zero after real simulation time despite mana regeneration |
| T2.3.4 invulnerability | 2 | Starts by demanding 10 HP from `/health 10` although max HP is 7, before testing damage |
| T2.2.3 zero stamina | 2 | Same zero-regeneration assumption as T1.2.3 |
| T2.2.5 opposing inputs | 1 (Firefox) | Separately dispatched keydowns can allow one simulation step before both keys are held |

These cases remain visible failures rather than being skipped, weakened, or supported by unrelated new debug commands. [Machine-readable summary](evidence/validation-summary.json) includes exact final errors, projects and baseline comparison results. Full local Playwright artifacts remain in `test-results/`; that directory is intentionally untracked.

## Changes and boundaries

- Authoritative semantic object footprints, swept contact/sliding, internal tile-face handling, and explicit player/ground-enemy/ghost/jumping traversal profiles.
- Version 4 generation protects river crossings, refreshes hill edge classifications, exposes concave/convex metadata, prevents decorative overlap, and validates physical objective routes. Generation regression covers 100 seeds plus forced lower-boundary geometry; no arbitrary hill filling was added.
- Ground enemies share bounded A*, cached clearance, route retry/backoff, target memory, return behavior, separation and telegraphed single-event attacks. Boss teleportation was removed. Ghost phasing is intentional and bounded.
- Portal eligibility, completion latch, approach reaction and one transition claim are simulation-owned. Persistence restores appropriate portal state, imports legacy object semantics and repairs invalid actor positions before replacing the run.
- On-demand diagnostics and compatible typed renderer fields/events are documented in the renderer team handoff. No rendering, UI, pixel asset, or visual transition files were changed.

the renderer's outstanding visual work includes plateau appearance, full edge/corner art and reaction animation consumption. The original recording's seed and keyboard input remain unknown. The original university project was not modified. Work remains isolated; no push, merge or deployment occurred.
