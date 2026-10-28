# Forest RPG V2

Strict TypeScript, PixiJS 8 and Vite successor to Forest RPG. The current checkpoint includes depth-sorted forest overlays, the original menu video/art, movement, basic melee/spin/bolt combat, chasing enemies, coin collection and portal activation. Full enemy-specific behavior, save/load and other RPG systems remain incomplete.

Use Node 20+ and npm 10+:

```sh
npm install
npm run dev
```

The main menu offers New Game, Tutorial and Settings. Move with WASD/arrows, sprint with Shift, attack with E/left click, spin with Q, cast a bolt with R, pause with Escape, toggle fullscreen with F, and regenerate with P. `/?debug=1&autostart=1&seed=123` starts a deterministic world with diagnostics. Add `tutorial=1` for the training glade.

```sh
npm run typecheck
npm run lint
npm test
npm run build
npx playwright test tests/e2e/vertical-slice.spec.ts tests/e2e/generated-world.spec.ts tests/e2e/presentation.spec.ts
```

Playwright serves the production build on port 4173, so build first. The older Tier-1/Tier-2 suites describe systems that are still incomplete; the commands above cover the current slice.

Cloudflare Pages build command: `npm run build`. Output directory: `dist`. `wrangler.jsonc` also prepares Workers Static Assets serving `dist` with SPA fallback. No deployment has been performed. See [deployment](docs/deployment.md) and [implementation status](docs/implementation-status.md).
