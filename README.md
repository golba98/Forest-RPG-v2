# Forest RPG V2

**Explore the forest. Survive the night. Open the next portal.**

![Version 2.0.0](https://img.shields.io/badge/version-2.0.0-527a38)
![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178c6?logo=typescript&logoColor=white)
![PixiJS 8](https://img.shields.io/badge/PixiJS-8-e72264)
![Vite 7](https://img.shields.io/badge/Vite-7-646cff?logo=vite&logoColor=white)

Forest RPG V2 is a browser-based pixel-art action RPG built with TypeScript, PixiJS 8, and Vite. Explore seeded woodland, cross rivers and hilltops, fight the creatures that inhabit the forest, and build your character as you travel between worlds. Collect the coins and defeat the non-ghost enemies to unlock each world's portal.

**Tags:** `pixel-art` · `action-rpg` · `procedural-generation` · `browser-game` · `typescript` · `pixijs` · `vite`

[Get started](#get-started) · [Controls](#controls) · [Development](#development) · [Documentation](#documentation) · [Credits](#credits)

![Forest gameplay with pixel-art trees, flowers, a grove stump, the player, and a minimap](docs/qa/evidence/grove-art/after/chromium-seed-42.png)

_A daytime woodland scene from the existing seed-42 gameplay captures._

## Features

- **Seeded worlds:** Explore forests with rivers, woodland bridges, cliffs, stairs, and walkable hilltops.
- **Changing conditions:** Day and night, clouds, rain, wet ground, and puddles change the forest's appearance; water and mud affect movement, and ghosts appear at night.
- **Active combat:** Use a three-hit melee combo, a spinning attack, and magic bolts against enemies with distinct behaviors, including mantises, ranged maggots, beetle bosses, and ghosts.
- **Character progression:** Earn XP, level up, and spend stat points on health, damage, mana, or stamina. Collect health and speed potions along the way.
- **World progression:** Unlock portals and carry your character's progression and inventory into the next world.
- **Training and settings:** Learn in the opening training glade, replay or disable the tutorial, and remap gameplay controls.
- **Local saves:** Continue a saved game or export and import a save file. Compatible original-game autosaves can also be migrated.

## Get started

### Requirements

- Node.js `^20.19.0`, `^22.12.0`, or `>=24.0.0`.
- npm `>=10.0.0`.
- A browser with WebGL support.

From the `18-Forest RPG v2` project folder:

```sh
npm ci
npm run dev
```

Open **[localhost:3000](http://localhost:3000)**. The first visit introduces the controls in a training glade.

### Production build

```sh
npm run build
npm run preview
```

The build runs TypeScript checks and writes the static site to `dist/`. Preview it at **[localhost:4173](http://localhost:4173)**. Gameplay runs in the browser without a backend or database. See the [hosting notes](docs/deployment.md) for static-host configuration.

## Controls

Default keyboard and mouse bindings:

| Action                | Control                |
| --------------------- | ---------------------- |
| Move                  | WASD or arrow keys     |
| Sprint / dash         | Shift                  |
| Jump                  | Space                  |
| Melee attack          | E or left mouse button |
| Spin attack           | Q                      |
| Magic bolt            | R                      |
| Interact              | G                      |
| Health potion         | 1                      |
| Speed potion          | 2                      |
| Character progression | C or I                 |
| Toggle minimap        | M                      |
| Fullscreen            | F                      |
| Pause                 | Escape                 |

Gameplay controls can be remapped in settings. Spin attacks and magic bolts consume mana; sprinting uses stamina.

## Saves

Save from the pause menu and choose **Continue** from the main menu to resume. Progress and settings are stored locally in the current browser.

Export a save to keep a separate copy or move it to another browser, then use import to load it. Clearing browser storage can remove local progress. Saves restore the world and character state, but do not preserve every transient combat or pathfinding timer.

See the [save format](docs/save-format.md) for validation rules and legacy-save compatibility.

## Development

| Command                 | Purpose                                    |
| ----------------------- | ------------------------------------------ |
| `npm run dev`           | Start the Vite development server          |
| `npm run typecheck`     | Check TypeScript without generating output |
| `npm run lint`          | Run ESLint                                 |
| `npm test`              | Run unit and integration tests with Vitest |
| `npm run test:watch`    | Run Vitest in watch mode                   |
| `npm run test:coverage` | Generate test coverage                     |
| `npm run build`         | Typecheck and build the production site    |
| `npm run preview`       | Serve the production build locally         |
| `npm run test:e2e`      | Run Playwright browser tests               |
| `npm run benchmark`     | Run Vitest benchmarks                      |
| `npm run format:check`  | Check formatting with Prettier             |

For browser tests, install the matching browsers and build first. Playwright starts the production preview on port 4173 and runs against Chromium and Firefox:

```sh
npx playwright install chromium firefox
npm run build
npm run test:e2e
```

### Diagnostics

Open a repeatable local session with a fixed seed:

```text
http://localhost:3000/?debug=1&autostart=1&seed=123
```

Add `&tutorial=1` to start in the training glade. In a diagnostic session, open the command terminal with F2 or the backtick key and enter `/help` for available commands. See [testing](docs/testing.md) for browser configuration, focused suites, and recorded validation results.

## Documentation

| Guide                                                  | Contents                                           |
| ------------------------------------------------------ | -------------------------------------------------- |
| [Architecture](docs/architecture.md)                   | Engine structure and system boundaries             |
| [Gameplay](docs/gameplay-systems.md)                   | Movement, combat, enemies, and progression         |
| [World generation](docs/world-generation.md)           | Seeded terrain, placement, and landscape rules     |
| [Rendering](docs/rendering.md)                         | Pixel art, layers, effects, and rendering behavior |
| [Save format](docs/save-format.md)                     | Persistence, imports, and compatibility            |
| [Testing](docs/testing.md)                             | Automated checks and browser workflows             |
| [Performance](docs/performance.md)                     | Measurements and their limitations                 |
| [Deployment](docs/deployment.md)                       | Static hosting and build configuration             |
| [Implementation status](docs/implementation-status.md) | Completed work and remaining validation            |
| [Feature parity](docs/feature-parity.md)               | Differences from the original game                 |

## Contributing

`18-Forest RPG v2` is the canonical project folder. Keep all changes here. Do not create sibling copies, alternate project folders, or Git worktrees, including nested worktrees, unless explicitly requested by the project owner. Use branches in this folder when needed. See [AGENTS.md](AGENTS.md) for workspace instructions.

Before submitting code changes, run typecheck, lint, relevant tests, and the production build. Include browser checks when changing gameplay or rendering.

## Credits

Ghost-grove artwork uses **[LPC Flowers / Plants / Fungi / Wood](https://opengameart.org/content/lpc-flowers-plants-fungi-wood)** by bluecarrot16 and contributors, licensed under **CC BY-SA 3.0**. Adaptations include native-resolution sprite crops with transparent padding for grove stumps and mushrooms.

See the [complete credits and adaptation notice](public/assets/licenses/grove/NOTICE.txt) and [supplied contributor credits](public/assets/licenses/grove/CREDITS-plants.txt) for attribution and source details. This artwork license applies to those assets.
