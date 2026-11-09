# Testing

## Quick checks

```sh
npm run typecheck
npm run lint
npm test -- --maxWorkers=2
npm run build
```

Vitest runs unit and integration tests. Limiting workers reduces resource contention during world-generation sweeps. Benchmarks run separately with `npm run benchmark`.

## Browser tests

The mandatory gameplay suite uses `npm run test:critical` after a production build. It covers the approved player, all directions and blink states, world-library isolation, biome exploration, streaming compatibility, terrain, bridges and save/reload. `npm run check:player` checks the 989 approved character files; `npm run test:workflow` checks PR diff protection. See the [safe integration guide](development/safe-integration.md) for hosted enforcement and deliberate baseline changes.

Player appearance snapshots live in `tests/fixtures/player-appearance/` and are shared across operating systems by browser. Before comparing a screenshot, the test checks every opaque character pixel against approved native source PNGs and requires the approved frame geometry. Baseline updates require explicit human approval; normal runs never update snapshots. The CI browser configuration uses software WebGL and Xvfb.

Install matching browser binaries once, then build before running Playwright:

```sh
npx playwright install chromium firefox
npm run build
npm run test:e2e -- --workers=2
```

The default configuration starts its own production preview at `http://localhost:4311` with strict port ownership and server reuse disabled. Stop anything already listening there. Set `PLAYWRIGHT_CHANNEL=chrome` to use installed Google Chrome for the Chromium project. The optional running-only configuration uses port 4183 instead.

Use a focused suite while developing:

```sh
npx playwright test tests/e2e/player-directions.spec.ts --project=chromium --workers=1
npx playwright test tests/e2e/grove-art.spec.ts tests/e2e/riverbank-material.spec.ts --workers=2
npx playwright test tests/e2e/visual-rendering.spec.ts tests/e2e/visual-capture.spec.ts --workers=2
```

## Coverage map

| Area                                               | Tests                                                                                                                                      |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Direction, aiming, punch frames and combo identity | `tests/unit/animation/`, `tests/unit/core/Direction.test.ts`, `tests/e2e/player-directions.spec.ts`, `tests/e2e/player-running.spec.ts`    |
| Rendering, minimap, HUD and menu theme             | `tests/unit/rendering/`, `tests/e2e/visual-rendering.spec.ts`, `tests/e2e/menu-theme.spec.ts`, `tests/e2e/ledge-hud.spec.ts`               |
| Terrain, rivers, hill access and placement         | `tests/unit/world/`, `tests/integration/`, `tests/e2e/landscape.spec.ts`, `tests/e2e/hilltop-objects.spec.ts`, `tests/e2e/bridges.spec.ts` |
| Groves, bank materials and weather                 | `tests/e2e/grove-art.spec.ts`, `tests/e2e/riverbank-material.spec.ts`, `tests/e2e/surface-weather.spec.ts`                                 |
| Save/load and compatibility                        | `tests/unit/persistence/`, `tests/e2e/save-flow.spec.ts`, `tests/e2e/tier1-feature/persistence-legacy-saves.spec.ts`                       |
| Broad gameplay and boundaries                      | `tests/e2e/tier1-feature/`, `tests/e2e/tier2-boundary/`                                                                                    |

When a browser fixture replaces an entire world, clear incompatible saved encounter and moisture runtime. Reuse the fixtures and helpers under `tests/fixtures/` and `tests/e2e/helpers/` rather than depending on incidental generated enemy placement.

The landscape JSON files are authoritative regression inputs captured before generation changes, not disposable test output. See their [capture contract](../tests/fixtures/landscape/README.md). Do not regenerate them merely to make a failing assertion pass.

## Woodland artwork and loot

`tests/unit/rendering/vegetationArt.test.ts` checks native source frames and artwork rules. Treasure placement, collection and persistence are covered by `tests/unit/world/treasure.test.ts`, `tests/unit/simulation/loot.test.ts` and persistence tests.

After building, run `npx playwright test tests/e2e/world-art-loot.spec.ts --workers=1` to verify native trees, depth, chest rewards and save/reload in both browsers.

## Captures and reports

World visibility regressions exercise native tree pixels on all four viewport
edges, actual boosted sprint/dash input, diagonal reversals, residency eviction,
save restoration, clouds, resizing and zoom, plus unchanged saved worlds for
seeds 1, 42, 123 and 1337. Bridge and hilltop suites separately retain their
physical traversal, blocking and depth assertions:

```sh
npm run build
npx playwright test tests/e2e/world-visibility.spec.ts tests/e2e/bridges.spec.ts tests/e2e/hilltop-objects.spec.ts --workers=2
```

With a production preview running, capture repeatable scenery/cloud videos and
screenshots, then profile without recording overhead:

```sh
FOREST_BENCH_URL=http://localhost:4173 node scripts/capture-world-visibility.mjs
FOREST_BENCH_URL=http://localhost:4173 node scripts/profile-world-visibility.mjs
```

Both default to ignored `artifacts/world-rendering-persistence/after/`;
`FOREST_EVIDENCE_DIR` selects another destination. The profiler defaults to ten
minutes (`FOREST_PROFILE_MS` overrides it), samples three viewport sizes, then
moves the camera through a fixed seeded world at 180 world pixels/s. Diagnostic
position changes bypass collision and simulation time is frozen; real keyboard
movement and gameplay remain separate browser tests. Post-GC checkpoints and
sampled allocations supplement frame/CPU/resource measurements. GPU figures
count owned chunk textures, not total graphics-driver memory.

Playwright screenshots, traces, attachments and videos live under ignored `test-results/`, isolated by test, browser and retry. The HTML report is in ignored `playwright-report/`; open it with `npx playwright show-report`. Both folders may be replaced by the next run.

Visual captures use `VISUAL_PHASE=before|after` to label output filenames. Groves use `GROVE_ART_PHASE`; bank materials use `FOREST_SOIL_PHASE`. The grove `before` mode intentionally captures only the baseline scene and skips post-change assertions. Use a normal run for regression validation.

```sh
VISUAL_PHASE=after npx playwright test tests/e2e/visual-capture.spec.ts --project=chromium
node scripts/directional-gallery.mjs test-results artifacts/directional-gallery chromium
```

Standalone capture scripts default to ignored `artifacts/`. `capture-surface-weather.mjs` supports `FOREST_EVIDENCE_DIR` as an output override, `FOREST_BASELINE_SAVE` for an exported baseline scene, and `BEFORE_URL`/`AFTER_URL` for comparison servers. Start the production preview before running it. Gallery output can be overridden with its second positional argument.

Curated images intentionally used by documentation belong in tracked `docs/images/`; temporary notes belong in ignored `docs/tmp/`. Old investigation reports and bulk captures are available in Git history. Screenshots and passing tests support review but do not establish visual acceptance across every scene, device and seed.

## Biome landscape checks

`tests/unit/world/biomes.test.ts` covers signed windows, query order, substantial
five-biome cores and persisted generation identities. Save tests reject malformed
v13 environment payloads before replacing the active world. Historical hill and
boulder checks load the captured v10 seed-42 fixture so the `(70,96)` and `(87,37)`
regressions remain meaningful after changing generation.

`tests/e2e/environment-overhaul.spec.ts` uses live generated gameplay for the five
biome captures, sparse/dense/old-growth woodland, clearing, slope, bridge,
transition and chunk-boundary scenes. It checks missing art, resident-cache bounds,
real movement and environment save/reload. Capture files belong in each test's
ignored output folder. Preserve a selected baseline before Playwright clears its
output directory. Run `npm test -- --maxWorkers=1` for a low-contention full suite;
profile separately from browser/test workloads.

The second biome browser case follows a generated 50-tile walking route with real
keyboard input across at least four render chunks. Controlled-clock tests use
`settleEnvironment` after teleports/reloads: asset IO uses real time while RAF uses
the test clock. Engine readiness includes the visible landscape; background
prefetch does not block gameplay. Seed 111 covers an enclosed spawn clearing that
needs its own slope before reachability pruning.

### Environment validation, 2026-11-03

| Command                                                                  | Observed result                                                          |
| ------------------------------------------------------------------------ | ------------------------------------------------------------------------ |
| `npm run typecheck`                                                      | Passed                                                                   |
| `npm run lint`                                                           | 0 errors; 35 warnings                                                    |
| `npm test -- --maxWorkers=1`                                             | 68 files, 796 tests passed                                               |
| `npm run build`                                                          | Passed; existing Pixi bundle-size warning remains                        |
| `npm run benchmark`                                                      | Passed; generation measurements in [performance](performance.md)         |
| `npm run test:e2e -- --workers=4`                                        | 342/344 passed; two presentation timing assertions failed                |
| Focused timing cases, both browsers, five repeats                        | 20/20 passed after bounded timing allowances                             |
| `npm run test:e2e -- tests/e2e/environment-overhaul.spec.ts --workers=2` | 4/4 passed; live gallery, persistence and multi-chunk keyboard traversal |

The two full-run failures sampled a south-facing punch before the next simulation
tick and boss emergence before reload preparation had finished. The presentation
checks now allow one additional frame for the press and a bounded 204 ms phase
allowance; simulation timing remains independently tested. Reproduce the repeated
checks with:

```sh
npm run test:e2e -- tests/e2e/player-directions.spec.ts tests/e2e/encounters.spec.ts --grep 'S movement, all punch frames|native-size nest, occluded crawl' --repeat-each=5 --workers=4
```

The entire browser suite was not rerun again after these test-only changes.
Final gallery/traversal videos are retained locally in `artifacts/environment-final/`;
the [curated gallery](world-generation.md#landscape-gallery) is tracked. Asset
reproduction left 37 shipped/source metadata files byte-identical; original rock
and bridge images also match the baseline. Changed documentation passed formatting
and all 50 checked relative file links resolved. Browser execution used repository
Playwright because the in-app browser service exposed no available browser.

## Player remaster evidence

`player-directions.spec.ts` checks actual canvas pixels, direction locks, all three seventeen-frame combos and fifteen jump poses in each of eight directions. `player-remaster-capture.spec.ts` retains successful live gameplay videos. `player-remaster-scenes.spec.ts` captures identical tree, rock, bridge, shadow and overlap scenes. Run those suites after building, in Chromium and Firefox.

`PLAYER_ART_PHASE=before` on the scenes suite substitutes archived original artwork through Playwright routing; it compares old and new pixels in the same current renderer and scene. It is not an original-build motion recording. Original-build directional captures and live recordings were made separately before integration. The default `after` mode uses production assets without routing.

Use separate output folders when preserving evidence: `npx playwright test tests/e2e/player-remaster-capture.spec.ts --output=artifacts/player-remaster/after/live`. Screenshots retain the game's actual camera scale; enlarged contact sheets are supplementary inspection aids.

### Approved player animation

```sh
node scripts/player-art/face-continuity/pack.mjs
npx vite --config scripts/player-study/recovery.vite.mjs
```

Open `http://localhost:4330/`. The approved character is available at native scale and 4× inspection, with pause, stepping, normal/quarter speed and **Blink now**. Controls cover eight directions, walking/running, jumping, three punches and a connected action sequence.

`playerConsistency.test.ts` verifies the approved source/runtime/export checksums, all 912 native frames against packed PNGs, fixed head geometry and adjacent anchor steps. `playerMotion.test.ts`, `playerNativePresenter.test.ts` and `playerBlink.test.ts` retain the action, facing, transition, occlusion, timing and pause checks. Historical experiments and their asset-dependent tests are in ignored `archive/player-character/` and are not dependencies of the normal test run.

Run production gameplay tests with `player-directions.spec.ts`, `player-fluid.spec.ts`, `player-blink.spec.ts`, `player-flow.spec.ts` and `player-remaster-capture.spec.ts`. These check rendered pixels, eight-direction movement, locked punches, jumps, combos, pauses and live motion. The approved viewer has its own configuration:

```sh
npx playwright test --config scripts/player-study/playwright.config.ts
```

That configuration runs `player-flow-review.spec.ts` and `player-blink-review.spec.ts` against port 4330. It checks approved texture delivery, connected actions and eyelids at normal/quarter speed. The 140% check uses CSS content magnification, not browser UI zoom.

Keep all automated browsers silent, including ad hoc capture scripts: Chromium `--mute-audio`; Firefox `media.volume_scale: '0.0'`. Preserve those settings when overriding launch options. Use `npm test -- --maxWorkers=1` for CPU-heavy world suites when browsers are also active. Keep captures and logs in ignored `artifacts/` or `test-results/`.

## Infinite world verification

`infinite-*.spec.ts` exercises the streamed/default game: negative coordinates,
distant and immutable saves, portable archives and rejected imports, preservation
of finite regions, two-way legacy travel, portal progression, regional-map centering and recorded keyboard navigation.
Existing fixed-layout browser fixtures explicitly request `?world=finite`; they
continue to test the finite compatibility reader, original art, bridges, hills,
controls and old save contracts.

```sh
npm test -- tests/unit/world/infinite
npm run benchmark -- tests/benchmarks/infinite.bench.ts --maxWorkers=1
npm run build
npm run test:e2e -- tests/e2e/infinite-*.spec.ts --workers=2
```

`window.__GAME__.getStreamingDebug()` reports the global player position, local
origin, chunk residency, queue, evictions and preparation state. Diagnostic
`setGlobalPosition(x,y)` prepares distant destinations, while `planTravelPath`
uses physical swept edges for real-keyboard routes. Ordinary movement still uses
the existing input, movement and collision systems.

For extended real-time profiling, run a production preview on port 4175 and then:

```sh
FOREST_BENCH_URL=http://localhost:4175 node scripts/profile-infinite-world.mjs
```

The default is thirty minutes. `FOREST_PROFILE_MS` and `FOREST_PROFILE_OUTPUT`
control duration and the ignored artifact directory. The script records bounded
frame samples, minute-by-minute post-GC heap, owned textures, residency and long
tasks, and screenshots every five minutes. Its camera route bypasses collision
and freezes simulation time; it complements the keyboard/gameplay browser tests.
Forced-GC intervals are excluded from cadence measurements. Read the hardware and
measurement limitations in [performance](performance.md).

## Five-biome streaming and Biome Walk

`biome-walk.spec.ts` uses the real Play menu in Chromium and Firefox. It checks
all five safe landings in one world, movement, adventure-save isolation, signed
runtime travel through ±10,000 and ±1 billion coordinates, revisit identity and
distant save/reload. Its keyboard route crosses the old x=150 edge in both
directions and walks through a forest/meadow transition. `infinite-traversal.spec.ts`
adds repeated ordinary keyboard crossings in every direction. Teleport tests and
diagnostic performance routes are separate from this collision-driven proof.
The asset-failure case blocks the destination tree images, checks that the active
origin and player remain unchanged, then retries successfully after restoring IO.

`multibiome.test.ts` checks eight seeds' regional interiors, 32 starting plans,
coordinate/order determinism, exclusive tree sets, art-reference validation and all
56 approved player hashes. Partition tests compare 32/64-cell chunks. Session tests
preserve edits, collected objectives and actors across eviction for streamed
versions 13, 14 and 15. Compatibility browser tests distinguish frozen finite five-biome saves
from older preserved-region conversion.

```sh
npm test -- tests/unit/world/infinite --maxWorkers=1
npx playwright test tests/e2e/biome-walk.spec.ts tests/e2e/infinite-*.spec.ts --workers=2
```

Raw captures and videos belong in `artifacts/` or `test-results/`. Curated runtime
screenshots are in `docs/images/infinite-biomes/`; the asset preparation script
crops these into the actual menu previews. No browser test writes shipped assets.

### Infinite-biome validation, 2026-11-03

| Command / check                                                 | Observed result                                                                      |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `npm run typecheck`                                             | Passed                                                                               |
| `npm run lint`                                                  | 0 errors; 53 warnings, including non-null assertions                                 |
| `npm test -- --maxWorkers=1`                                    | 85 files; 847 tests passed in 209.69 s                                               |
| `npm run build`                                                 | Passed; Pixi bundle-size warning remains                                             |
| `npx playwright test --workers=2`                               | 416 passed; 32 opt-in review cases skipped; 2 screenshot-timing failures in 22.8 min |
| Final Biome Walk, archive and persistence suites, both browsers | 12 passed in 2.4 min                                                                 |
| Corrected bolt screenshot case, five repeats in each browser    | 10 passed in 50.7 s                                                                  |

The full run's two failures were the same northwest running-bolt comparison in
each browser. The bolt glow still covered some head pixels at the capture instant.
The check now waits 240 ms, including a possible 55 ms impact hold, before comparing
the unchanged source pixels at the unchanged 80% threshold. This is a test timing
correction, not a character or animation change. The 32 skips require the separate
`PLAYER_ART_STUDY`, `PLAYER_ART_FINAL` or `PLAYER_FLOW_REVIEW` development servers.
They are not skipped gameplay tests. No other failures remained in that full run.

The final asset-failure fix stages a distant window before committing its origin.
It was verified after the full run with the complete unit suite and the targeted
browser suites below. The entire browser suite was not repeated after that fix.
An earlier run interrupted during integration is not included in these totals.
The final targeted commands used an isolated production preview on port 4176 via
`artifacts/infinite-check.config.ts`; the normal configuration reproduces them:

```sh
npx playwright test tests/e2e/biome-walk.spec.ts tests/e2e/infinite-persistence.spec.ts tests/e2e/infinite-archive.spec.ts --workers=2
npx playwright test tests/e2e/player-directions.spec.ts --grep 'running bolt keeps northwest' --repeat-each=5 --workers=2
```

Local evidence: `artifacts/infinite-biomes-final-{tests,browser,lint,build}.log`,
`artifacts/infinite-biomes-atomic.log`, and `artifacts/player-bolt-recheck.log`.
Native screenshots of all five biomes, the menu at desktop/mobile sizes, and the
forest/meadow crossing were inspected. The approved character's 56 sheets match
their recorded hashes. Performance measurements and their limits are recorded in
[performance](performance.md#five-biome-infinite-world-2026-11-03).

### Biome hills (generator 15)

`hills.test.ts` samples all five biome interiors across four seeds, verifies local
height continuity at biome junctions near ±1 billion tiles, and sweeps every slope
in five seed-42 regions in both directions with player and ground-enemy footprints.
It checks all four cliff directions and locks five generator-14 chunk hashes so
older worlds cannot silently change. Soil tests check that highland material reaches
the summit rim without painting the cliff face. Asset checks require opaque ramp
openings and illuminated plateau artwork.

`biome-hills.spec.ts` enters each biome through the Play menu, walks up and down a
real slope with keyboard input, verifies the raised surface and adjacent blocking
cliff, and captures the landing and summit. A separate case imports a synthetic
version-14 exploration with a saved mud edit, creates the new landscape, resumes
the old one, and reloads the new one with its own saved inventory intact.

```sh
npm test -- tests/unit/world/infinite/hills.test.ts tests/unit/rendering/soilMaterial.test.ts --maxWorkers=1
npx playwright test tests/e2e/biome-hills.spec.ts tests/e2e/biome-walk.spec.ts tests/e2e/infinite-*.spec.ts tests/e2e/bridges.spec.ts tests/e2e/hilltop-objects.spec.ts --workers=2
```

The generator-15 full unit run (`npm test -- --maxWorkers=1`) completed 86 files
in 220.21 s: **854 passed, one timed out**. The timeout was the existing animation
frame-rectangle sweep's five-second deadline during concurrent host activity.
Its complete file passed unchanged on an immediate serial rerun: **29 passed in
2.64 s**. No animation source or test threshold changed. Typecheck and production
build passed; lint reported **0 errors and 60 warnings**, and the existing Pixi
bundle-size warning remains.

The longer keyboard helper now holds movement keys across 16 ms clock ticks
instead of releasing and re-pressing them each tick. This removes redundant
browser protocol calls while keeping the same route, input mechanism, simulation
steps, position tolerance and collision checks. An earlier Firefox traversal
exceeded its six-minute deadline; the corrected final-build traversal completed
in 2.5 minutes.

The final focused production run passed **46 browser tests in 6.5 minutes** across
Chromium and Firefox: biome hills, Biome Walk, all infinite-world suites, bridges
and the captured seed-42 hill/boulder regression. The entire unrelated browser
suite was not repeated for this hill update. All five entry/summit captures and the
forest/meadow transition were inspected at native resolution. Menu previews were
then refreshed from these captures and checked in both browsers on the rebuilt
bundle. Evidence is under ignored `artifacts/biome-hills/`: `final-unit.log`,
`animation-recheck.log`, `verified-browser.log`, `verified-browser/`, and
`menu-check.log`. The curated gallery is in [world generation](world-generation.md#current-streamed-gallery).

The matching short runtime comparison and its remaining frame spike are documented
in [performance](performance.md#biome-hills-2026-11-03).

### Nested terraces (streamed generator 16)

The terrain checks cover 0–3 height levels, all stair orientations with both player
and enemy footprints, solid relative cliff boundaries, one-tier jump recovery,
material edits, signed/billion-tile coordinates, 32/64 partition equivalence,
eviction/reload and frozen v14/v15 chunk hashes. Actor publication has a regression
guard forbidding synchronous generator queries once baseline chunks are prepared.
The v14 and v15 exploration slots are each resumed with a saved edit in both browsers.

Commands and observations from this implementation:

- `npm run typecheck`, `npm run lint`, `npm run build`: pass; lint reports
  non-null-assertion warnings (62 in the final run), and Vite retains its bundle-size warning.
- `npx vitest run tests/unit/world/infinite/hills.test.ts tests/unit/world/infinite/environment.test.ts tests/unit/world/infinite/session.test.ts tests/unit/rendering/environment-assets.test.ts tests/unit/rendering/soilMaterial.test.ts tests/unit/simulation/movement.test.ts --maxWorkers=2`: 45 passed before the final legacy-CLIFF and publication guards.
- The final hills/session rerun passed 16 tests; the added publication guard also
  passed independently with the same 30-second preparation allowance as the other
  streamed-session tests. Jump and material-edit collision checks are included.
- `npm test -- --maxWorkers=2`: latest full run had 868 passes and four failures.
  Three were 5-second timeouts in the unchanged finite-generation/atlas loops under
  concurrent workstation load. Their two files passed all 10 tests on an isolated
  `--maxWorkers=1 --testTimeout=20000` rerun. The remaining failure is the existing
  approved-character hash fixture in `multibiome.test.ts`, which differs from the
  separate character work. This terrain task does not update or bless that fixture.
- The broad Chromium/Firefox biome, infinite-world and bridge selection passed 44
  cases. Its boundary-walking case paused the test clock during asynchronous chunk
  preparation; Firefox timed out and the matching Chromium case was interrupted.
  The corrected setup keeps timers running during diagnostic positioning. The
  eight-case final hills/boundary rerun passed in both browsers; the four-case
  v14/v15 resume run and six-case post-optimization adventure/persistence run passed.

Captures and logs are under ignored `artifacts/terraces/`; the curated images are
in the [streamed gallery](world-generation.md#current-streamed-gallery). Tests use
actual runtime assets and muted browser launches. The ordinary-walking tests cross
chunk boundaries, the former x=150 edge and a forest/meadow transition; teleports
only establish approaches or test distant residency. These runs do not assert a
new 60-minute active-play performance qualification; see [performance](performance.md).
