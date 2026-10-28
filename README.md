# Forest RPG V2

A browser-based pixel-art RPG built with strict TypeScript, PixiJS 8 and Vite. Explore seeded forests, fight their inhabitants, collect coins and open the portal to the next world. A training glade introduces the controls on the first visit; it can be replayed or disabled in settings.

Use Node 20+ and npm 10+:

```sh
npm install
npm run dev
```

Move with WASD or the arrow keys, sprint with Shift, jump with Space, attack with E or left click, spin with Q, cast a bolt with R, use potions with 1 and 2, and pause with Escape. C or I opens character progression; M toggles the minimap. Controls can be remapped in settings.

Save from the pause menu, continue from the main menu, or export and import a save. Progress and settings are stored locally in the browser. The game can also offer a compatible original-game autosave for migration.

```sh
npm run typecheck
npm run lint
npm test
npm run build
npm run test:e2e
npm run benchmark
```

Playwright serves the production build on port 4173, so run the build first. To open a deterministic diagnostic session locally, use `/?debug=1&autostart=1&seed=123`; add `tutorial=1` for the training glade. Diagnostics and the command terminal are available in development or with `debug=1`.

See [implementation status](docs/implementation-status.md), [architecture](docs/architecture.md), [gameplay](docs/gameplay-systems.md), [testing](docs/testing.md), [performance](docs/performance.md), and [deployment](docs/deployment.md). This project has not been deployed.
