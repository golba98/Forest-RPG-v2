# Testing

Dependency security update: Vite 7.3.7, Vitest/coverage-v8 4.1.12 and Sharp
0.35.5 replace the audited vulnerable versions; the lockfile is updated together.
Use the Node ranges in `package.json` (20.19+, 22.12+, or 24+). Vitest now uses
at most four workers, and the existing forest-coverage, encounter-generation and
spawn-spacing seed sweeps have explicit 30-second budgets. The new runner
enforces the default five-second timeout on these synchronous sweeps; their
assertions and seed sets are unchanged. Restart an already running Vite server
after installing the updated dependencies.
Validation after this update: 541 unit/integration tests, eight Chromium/Firefox
landscape and portal-asset checks, production build, typecheck, lint and diff
checks passed. Both the full and production-only npm audits report zero
vulnerabilities.

Portal missing-art regression: `tests/e2e/portal-assets.spec.ts` exercises shipped
and older manifests, verifies the portal's actual bound texture is 1312×1199,
checks for checkerboard pixels, reloads saved worlds, and deliberately fails the
image request to verify placeholder diagnostics. The portal-focused run passed
16 Chromium/Firefox cases, including tutorial/normal traversal, portal states,
regeneration and minimap rendering; 17 focused unit tests, typecheck, lint and
build passed. The repaired portal was visually inspected in actual WebGL with
clouds disabled only for the isolated capture at
`docs/qa/evidence/portal-assets/portal-recovered.png`.

Run `npm run typecheck`, `npm run lint`, `npm test` and `npm run build`. The unit and integration suites use Vitest; Playwright exercises the production preview in Chromium and Firefox. Install the matching browsers with `npx playwright install chromium firefox` if needed. Set `PLAYWRIGHT_CHANNEL=chrome` to use installed Google Chrome for the Chromium project.

Directional movement/punch regressions: `tests/unit/core/Direction.test.ts`, `tests/unit/animation/playerPunchDirection.test.ts`, and `tests/e2e/player-directions.spec.ts`. Run the browser matrix with `npx playwright test tests/e2e/player-directions.spec.ts --workers=2` after building. It checks actual gameplay pixels for every direction and punch frame. Punch direction locks at initiation; movement overrides melee aim assist while stationary punches retain assistance. See the [investigation, complete results and screenshot galleries](qa/player-directions.md). On a busy host, `npm test -- --maxWorkers=2 --testTimeout=60000` avoids the baseline world's generation/animation integrity timeout failures without changing checked-in timeouts.

The focused browser coverage includes menu/settings, onboarding, water and jumping, tutorial and regular portals, saves, localization, diagnostics and character progression. The broader inherited Tier 1/2 suite also exists; consult the latest execution results in the implementation status rather than assuming all legacy expectations pass. Browser screenshots are useful for finding visual defects but are not a substitute for interactive design review.

Visual rendering checks live in `tests/e2e/visual-rendering.spec.ts` (renderer counters through `window.__RENDER_DEBUG__`: no placeholder textures, portal state sequence, transition, regeneration, resize, overlay) and `tests/e2e/visual-capture.spec.ts`, which writes deterministic before/after captures: `VISUAL_PHASE=before|after npx playwright test tests/e2e/visual-capture.spec.ts --project=chromium` (see `docs/qa/visual-recording-review.md`).

Terrain weather regressions: `tests/unit/world/rivers.test.ts`, `tests/unit/simulation/surface-moisture.test.ts`, `tests/unit/rendering/weather.test.ts`, and the moisture cases in persistence tests. The existing 100-seed topology sweep now also rejects diagonal-only water contacts. `tests/e2e/surface-weather.spec.ts` covers accumulation, camera movement, reload, drying, puddle footsteps and deck support in both browsers. Fixtures that replace a whole world must remove its previous `runtime.moisture`, just as they remove incompatible encounter runtime.

Run the production preview, then `node scripts/capture-surface-weather.mjs` to capture rain and river evidence. Provide `FOREST_BASELINE_SAVE` for an exported v8 scene, or serve the original build at `BEFORE_URL` (default port 4174) so the script can recreate seed 42. `scripts/profile-surface-weather.mjs` compares that original build with `AFTER_URL` (default port 4173); use `FOREST_PROFILE_OUTPUT` to retain its JSON. See `qa/weather-rivers.md` for actual execution results and capture limitations.

Milestone 1 hilltop objects: `tests/integration/hilltop-objects.test.ts` adds 24 generation/loading and movement regressions, including the actual seed-42 rock at `(70,96)`, ground reference `(87,37)`, eight approach directions, jumping, stairs/elevation, narrow-route rejection, relocation/omission, sprite recipes, and idempotent save conversion with overlapping actors. `tests/e2e/hilltop-objects.spec.ts` checks keyboard movement, depth order, stair access, chunk visibility cycling and repeated saved-world loads in Chromium and Firefox.

The current-checkout baseline reproduced hill pass-through (x=69.5 → 72.3125) while the ground rock stopped at x=86.88. After correction the hill rock stops movement at x=69.96375, retaining its location and artwork. Evidence: [baseline](qa/evidence/hilltop-objects/00-before-hill-pass-through.png), [hill blocking](qa/evidence/hilltop-objects/01-hill-blocked.png), [behind](qa/evidence/hilltop-objects/02-player-behind.png), [in front](qa/evidence/hilltop-objects/03-player-in-front.png), [ground blocking](qa/evidence/hilltop-objects/04-ground-blocked.png), [usable stairs](qa/evidence/hilltop-objects/05-stairs-usable.png), [old-save local recovery](qa/evidence/hilltop-objects/06-old-save-recovered.png). Visual inspection used a 1280×720 viewport and actual WebGL rendering. The reference rock sits on a narrow plateau with usable access on both sides.

Validation: 509 tests across 55 Vitest files passed, including the existing 64 collision/ledge/hill-rendering/stair cases and the 100-seed topology sweep. The production Chromium/Firefox run of hilltop-objects, gameplay-repair, save-flow and ledge-hud passed all 16 browser tests. Build and lint pass; Vite retains the existing large-Pixi-bundle advisory. The renderer caches all terrain chunks and toggles their visibility rather than physically unloading them: coverage verifies leaving/returning and full destruction/rebuild on load. Placement intentionally favors clear access over decoration density and can omit sites a more elaborate global planner might accept. Visual coverage is limited to the captured seed-42 scenes and the existing browser fixtures, not every generated plateau.

Milestone files: added `src/world/HilltopObjects.ts`, `src/world/HilltopDecoration.ts`, `src/world/TileHash.ts`, `tests/integration/hilltop-objects.test.ts`, and `tests/e2e/hilltop-objects.spec.ts`; updated `src/world/ObjectSemantics.ts`, `src/world/WorldGenerator.ts`, `src/types/world.ts`, `src/rendering/terrainArt.ts`, `src/rendering/PixiRenderer.ts`, `src/rendering/DebugOverlay.ts`, `src/simulation/Simulation.ts`, and `src/persistence/SaveManager.ts`. Documentation changes are in `docs/save-format.md`, `docs/rendering.md`, `docs/world-generation.md`, and this file, with screenshots/JSON in `docs/qa/evidence/hilltop-objects/`. Pre-existing weather, river, nest, bridge and gameplay edits were retained. The [seed-42 placement report](qa/evidence/hilltop-objects/placement-report.json) confirms 87 accepted rocks (8 relocated, 0 omitted), identical terrain, existing props, bridges, encounters and spawn plans compared with the captured pre-change checkout.

## Milestone 2 landscape planning and versioning

The untouched checkout was clean at `58baaf8`. Before changing generation or
placement, `scripts/profile-landscape.mjs --capture-baseline` wrote complete v10
world fixtures for seeds **1, 42, 123 and 1337**, level 1, normal difficulty,
150×150. `tests/fixtures/landscape/README.md` records provenance and the capture
contract. Expected worlds are static pre-change artifacts; tests do not generate
their own expected layout. Whole-world equality includes terrain (and therefore
elevation, stairs and water), object IDs/positions/art sources, bridges, spawn
plans, encounter sites and compatibility markers. Derived reservation comparisons
add reconstruction coverage. Transient weather and animation are excluded.

`tests/unit/world/landscape.test.ts` and `tests/integration/landscape.test.ts` add
31 tests: shared surfaces/physical transitions, water under bridge decks and
legacy crossings, exact reservation thresholds, real woodland rejection and
unchanged RNG state, actual hilltop relocation counts, all-cell component IDs
under reversed query/source order, equivalent summit/reservation/clearance
queries after save/reload, partial/repeated conversion, mutation invalidation,
supported versions, missing metadata and explicit unsupported-version rejection.
The existing 24 hilltop-object tests retain blocking, depth/art semantics,
continuous bypass, relocation/omission and overlapping-actor recovery coverage.

Validation passed **540 unit/integration tests across 57 files**, including the
100-seed topology sweep and inherited stress tests. Typecheck, lint, production
build and diff checks pass. Vite retains the existing large-Pixi-bundle advisory.
The full run uses `TMPDIR=/dev/shm npm test`: the initial default-temp run failed
before collecting tests with filesystem error `-122`, resolved by changing only
the temporary-cache location.

The production browser selection passed **52 tests in Chromium and Firefox**:
`landscape`, `hilltop-objects`, `bridges`, `save-flow`, `encounters`,
`surface-weather`, `gameplay-repair`, and `ledge-hud`. The compact terminal
presentation received a subsequent focused two-browser recheck. The new browser
case validates stable shared queries during visibility cycling and full saved-world
reload, bridge water/deck identity, required access, the real debug terminal,
and refusal of a future-generator save. These are visibility/cache-retention
checks and destruction/rebuild on world load, **not physical chunk eviction**.

Visual inspection used actual WebGL, 1280×720, seed 42. Curated captures under
`docs/qa/evidence/landscape/` show the hill scene, behind/in-front overlap, usable
stairs, the restored river/bridge scene, and the compact terminal. Artwork,
palette and pixel scale are unchanged. Structured initial/loaded inspections are
attached to the Playwright case. Visual inspection covers these representative
scenes rather than every seed or region; numeric preservation covers all four
captured worlds. Performance samples and limitations are in `performance.md`.

Milestone 2 intentionally adds no new hill silhouettes, watercourses, permanent
pond stage, woodland distributions or art. `world-generation.md` describes the
shared interfaces and ownership available to Milestone 3.
