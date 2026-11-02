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

## Player remaster evidence

`player-directions.spec.ts` checks actual canvas pixels, direction locks, all three nine-frame combos and eight jump poses in each of eight directions. `player-remaster-capture.spec.ts` retains successful live gameplay videos. `player-remaster-scenes.spec.ts` captures identical tree, rock, bridge, shadow and overlap scenes. Run those suites after building, in Chromium and Firefox.

`PLAYER_ART_PHASE=before` on the scenes suite substitutes archived original artwork through Playwright routing; it compares old and new pixels in the same current renderer and scene. It is not an original-build motion recording. Original-build directional captures and live recordings were made separately before integration. The default `after` mode uses production assets without routing.

Use separate output folders when preserving evidence: `npx playwright test tests/e2e/player-remaster-capture.spec.ts --output=artifacts/player-remaster/after/live`. Screenshots retain the game's actual camera scale; enlarged contact sheets are supplementary inspection aids.

### Approved player playback review

```sh
node scripts/prepare-player-remaster.mjs
npx vite --config scripts/player-study/vite.config.mjs
```

Open `http://localhost:4328/scripts/player-study/review.html`. The default artwork is **Approved remaster**, formerly labelled “Rejected remaster”. Switch **Improved flow / Previous timing** to compare playback with identical pixels. Controls cover eight directions, walking/running, jumping and all three punches.

`playerFlow.test.ts` checks all 56 approved file hashes, bounded settling, pause/frozen simulation time, immediate interruption and the exact 120 ms strike / 360 ms attack boundaries. Existing direction tests validate every unchanged drawing with the new pose dwell schedule. Stop assertions allow input collection and rendering to propagate, separately from the 80 ms presentation bound.

`player-flow.spec.ts` verifies the actual delivered PNG hashes, captures matched idle views, and records eight-direction stop/interruption traces. `PLAYER_FLOW_PHASE=before` selects assertions for a separately built previous-playback baseline; it does not alter the production game. `player-remaster-capture.spec.ts` records successful full eight-direction motion and combos. Diagonal key releases occur in one browser turn to avoid an accidental cardinal step between protocol calls.

The historical study and fixed-model unit tests retain their archived assets for comparison; neither requires production to contain those superseded sprites. Run CPU-heavy world tests serially when browsers are also active: `npm test -- --maxWorkers=1` avoids contention without changing test deadlines.

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
