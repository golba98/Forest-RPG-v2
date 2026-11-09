# Development

Forest RPG V2 uses strict TypeScript, PixiJS 8, and Vite. Simulation and persistence are independent of rendering; menus and settings use DOM overlays.

## Local setup

Use Node.js `^20.19.0`, `^22.12.0`, or `>=24.0.0` and npm `>=10.0.0`.

```sh
git clone https://github.com/golba98/Forest-RPG-v2.git
cd Forest-RPG-v2
npm ci
npm run dev
```

The development server runs at [localhost:3000](http://localhost:3000).

## Commands

| Command                        | Purpose                                                         |
| ------------------------------ | --------------------------------------------------------------- |
| `npm run dev`                  | Start the development server                                    |
| `npm run typecheck`            | Check TypeScript without generating output                      |
| `npm run lint`                 | Run ESLint                                                      |
| `npm test`                     | Run unit and integration tests                                  |
| `npm run test:watch`           | Watch unit and integration tests                                |
| `npm run test:coverage`        | Generate test coverage                                          |
| `npm run build`                | Typecheck and build the static site in `dist/`                  |
| `npm run preview`              | Serve `dist/` at localhost:4173                                 |
| `npm run test:e2e`             | Run Playwright browser tests                                    |
| `npm run test:critical`        | Run mandatory character, world and save checks                  |
| `npm run check:player`         | Verify all approved character files                             |
| `npm run test:workflow`        | Verify PR diff protection                                       |
| `npm run benchmark`            | Run Vitest benchmarks                                           |
| `npm run test:tooling`         | Test staging guards, formatter selection and profile statistics |
| `npm run check:unused`         | Detect unused files, exports and dependencies                   |
| `npm run check:cycles`         | Detect runtime import cycles                                    |
| `npm run format:changed`       | Format changed eligible files                                   |
| `npm run format:check:changed` | Check changed eligible files                                    |
| `npm run format:check`         | Inspect repository-wide formatting debt                         |

Before submitting code changes, run typecheck, lint, relevant tests, and the production build. Use browser checks for gameplay and rendering changes. Check formatting and relative links for documentation changes.

Follow the [safe integration workflow](safe-integration.md) before switching branches or preparing a PR. The canonical player is protected by `npm run check:player`; run `npm run test:workflow` and `npm run test:critical` before integrating gameplay work. A feature-branch PR merge does not establish that its content reached `main`.

### Browser tests

Install the matching browsers and build first. Playwright starts the production preview on port 4311 and runs Chromium and Firefox:

```sh
npx playwright install chromium firefox
npm run build
npm run test:e2e
```

See [testing](../testing.md) for focused suites, browser configuration, and output locations.

## Diagnostics

Open a repeatable local session with a fixed seed:

```text
http://localhost:3000/?debug=1&autostart=1&seed=123
```

Add `&tutorial=1` to start in the training glade. In a diagnostic session, open the terminal with F2 or the backtick key and enter `/help` for the available commands. Diagnostic interfaces are described in [architecture](../architecture.md).

## Technical guides

| Guide                                                | Contents                                       |
| ---------------------------------------------------- | ---------------------------------------------- |
| [Architecture](../architecture.md)                   | Engine structure and system boundaries         |
| [Gameplay](../gameplay-systems.md)                   | Movement, combat, enemies, and progression     |
| [World generation](../world-generation.md)           | Seeded terrain, placement, and landscape rules |
| [Rendering](../rendering.md)                         | Pixel art, layers, and effects                 |
| [Save format](../save-format.md)                     | Persistence, imports, and compatibility        |
| [Performance](../performance.md)                     | Measurements and limitations                   |
| [Deployment](../deployment.md)                       | Static hosting and build configuration         |
| [Implementation status](../implementation-status.md) | Current capabilities and remaining review      |
| [Feature parity](../feature-parity.md)               | Differences from the original game             |

## Scripts and generated output

| Script group                                                                       | Purpose                                                                                           |
| ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `scripts/assets/prepare-{grove,nest,environment}-assets.mjs`                       | Reproduce shipped environment assets from retained sources                                        |
| `scripts/assets/build-{hill-tileset,upland-art,rock-sprites}.mjs`                  | Generate terrain and object art                                                                   |
| `scripts/assets/sanitize-assets.js`                                                | Stage historical legacy migration output for review                                               |
| `scripts/assets/transcode-media.sh`                                                | Reproduce compressed shipped audio and video                                                      |
| `scripts/player-art/`                                                              | Stage historical player art imports and sheet preparation; approved face pack has checksum guards |
| `scripts/qa/profile-landscape.mjs`                                                 | Profile generation; fixture regeneration requires explicit `--capture-baseline`                   |
| `scripts/qa/profile-{browser,infinite-world,surface-weather,world-visibility}.mjs` | Measure browser cadence, residency or weather                                                     |
| `scripts/qa/capture-*.mjs`, `scripts/qa/directional-gallery.mjs`                   | Produce local QA captures and galleries                                                           |

Environment asset reproduction intentionally changes shipped files; ordinary tests and captures should not. Historical player generators and the legacy sanitizer stage into ignored `artifacts/` by default and reject destinations overlapping source code, production assets, source artwork or fixtures. Pass an explicit staging directory as the first argument when needed; promote generated artwork only through a reviewed change. Browser/profiling scripts may require a running production preview; see [testing](../testing.md) and [performance](../performance.md) for prerequisites and options.

`dist/`, `coverage/`, `test-results/`, `playwright-report/`, `artifacts/` and caches are ignored. Put temporary drafts and handoffs in ignored `docs/tmp/`; see the [note guidance](notes/README.md). Maintained documentation, regression fixtures, asset sources and curated `docs/images/` stay tracked.

## Directory map

| Location                                        | Contents                                                              |
| ----------------------------------------------- | --------------------------------------------------------------------- |
| `src/game/`, `src/core/`                        | Composition, scenes, loop, input and shared services                  |
| `src/simulation/`, `src/systems/`, `src/world/` | Headless simulation, rules and world generation                       |
| `src/rendering/`, `src/animation/`              | Pixi views, effects, geometry and animation                           |
| `src/ui/`, `src/audio/`, `src/persistence/`     | DOM shell, audio and saves/settings                                   |
| `src/types/`, `src/config/`                     | Shared interfaces and configuration                                   |
| `tests/`                                        | Unit, integration, browser and benchmark suites, helpers and fixtures |
| `public/assets/`                                | Shipped images, audio, manifests and licenses                         |
| `scripts/assets/`, `scripts/player-art/`        | Environment production and historical player preparation              |
| `scripts/qa/`, `scripts/performance/`           | Browser captures, focused profiles and extended performance lab       |
| `scripts/regression/`                           | Approved-player and integration protection                            |
| `docs/`                                         | Maintained technical guides, source attribution and curated images    |

Before submitting, inspect `git status --short` and `git diff --check`. A normal test run should not modify documentation or tracked images. Keep generated output out of commits; move only deliberately selected documentation images into `docs/images/`.

### Environment art reproduction

The coordinated biome assets have retained sources and an inventory. Rebuild the
additional rocks without replacing the originals, then prepare the tree/plant,
ground and relief packs:

```sh
node scripts/assets/build-rock-sprites.mjs --environment
node scripts/assets/prepare-environment-assets.mjs
```

Review changed images at native scale and run the environment-asset validation
and biome browser gallery. See [asset production](../assets/replacements.md) and
[rendering](../rendering.md) for metadata, attribution and runtime ownership.
