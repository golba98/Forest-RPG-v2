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

| Command                 | Purpose                                        |
| ----------------------- | ---------------------------------------------- |
| `npm run dev`           | Start the development server                   |
| `npm run typecheck`     | Check TypeScript without generating output     |
| `npm run lint`          | Run ESLint                                     |
| `npm test`              | Run unit and integration tests                 |
| `npm run test:watch`    | Watch unit and integration tests               |
| `npm run test:coverage` | Generate test coverage                         |
| `npm run build`         | Typecheck and build the static site in `dist/` |
| `npm run preview`       | Serve `dist/` at localhost:4173                |
| `npm run test:e2e`      | Run Playwright browser tests                   |
| `npm run benchmark`     | Run Vitest benchmarks                          |
| `npm run format:check`  | Check formatting with Prettier                 |

Before submitting code changes, run typecheck, lint, relevant tests, and the production build. Use browser checks for gameplay and rendering changes. Check formatting and relative links for documentation changes.

### Browser tests

Install the matching browsers and build first. Playwright starts the production preview on port 4173 and runs Chromium and Firefox:

```sh
npx playwright install chromium firefox
npm run build
npm run test:e2e
```

See [testing](../testing.md) for focused suites, browser configuration, and recorded results.

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
| [Implementation status](../implementation-status.md) | Recorded milestones and remaining validation   |
| [Feature parity](../feature-parity.md)               | Differences from the original game             |

## Task notes

Use the [task note format](notes/README.md) when a plan or handoff needs to be saved. Notes live in this tracked documentation tree; maintained technical guides hold lasting system information.
