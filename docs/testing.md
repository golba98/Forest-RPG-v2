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

Playwright screenshots, traces, attachments and videos live under ignored `test-results/`, isolated by test, browser and retry. The HTML report is in ignored `playwright-report/`; open it with `npx playwright show-report`. Both folders may be replaced by the next run.

Visual captures use `VISUAL_PHASE=before|after` to label output filenames. Groves use `GROVE_ART_PHASE`; bank materials use `FOREST_SOIL_PHASE`. The grove `before` mode intentionally captures only the baseline scene and skips post-change assertions. Use a normal run for regression validation.

```sh
VISUAL_PHASE=after npx playwright test tests/e2e/visual-capture.spec.ts --project=chromium
node scripts/directional-gallery.mjs test-results artifacts/directional-gallery chromium
```

Standalone capture scripts default to ignored `artifacts/`. `capture-surface-weather.mjs` supports `FOREST_EVIDENCE_DIR` as an output override, `FOREST_BASELINE_SAVE` for an exported baseline scene, and `BEFORE_URL`/`AFTER_URL` for comparison servers. Start the production preview before running it. Gallery output can be overridden with its second positional argument.

Curated images intentionally used by documentation belong in tracked `docs/images/`; temporary notes belong in ignored `docs/tmp/`. Old investigation reports and bulk captures are available in Git history. Screenshots and passing tests support review but do not establish visual acceptance across every scene, device and seed.
