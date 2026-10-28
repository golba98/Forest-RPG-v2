# Forest RPG V2: continuation handoff

> Written 2026-10-28 by the previous Team Lead session (Claude Code). Read this whole file before you change anything.
> The four sub-agents were stopped on request. Their partial work is saved on local branches (see §4).

## 1. Mission (short version)
Build **Forest RPG V2**: a playable, production-quality 2D pixel-art RPG in **strict TypeScript + PixiJS 8 + Vite**. It is the successor to the user's university JavaScript game. There are four phases, each with a gate (typecheck, lint, test, build, browser check) and a commit:

1. **Engine foundation + playable vertical slice**: terrain renders, player moves, camera follows, pause/resize work.
2. **Pixel-art presentation**: depth-sorted sprites, animations, lighting, weather, HUD, menus, settings.
3. **Full RPG systems**: combat, AI, progression, inventory, portals, tutorial, terminal, save/load plus legacy adapter.
4. **Performance, e2e testing, docs, Cloudflare deploy config.**

Fill in the final report table from the original request (§8 of the user's mission prompt). It needs PASS/PARTIAL/FAIL per phase, real numbers only, and branch and commit hashes.

### Non-negotiable rules
- **Original project is READ-ONLY:** `/home/k9-vortex/Development/1-JavaScript/3-Game Development`. Never write, build, install or run git write commands there.
  - Its HEAD must stay `795aa547f879cba07add1fe7ee8f2071f7034b90` with a clean `git status` (verified clean at handoff).
  - Re-check at every gate: `git -C "<legacy>" status --porcelain` must print nothing.
- All work goes in `/home/k9-vortex/Development/2-TypeScript/18-Forest RPG v2`.
- Branch: **`feat/forest-rpg-v2-foundation`**. Make logical commits. **Never push, merge to main or deploy.** There is an `origin` remote; leave it alone.
- No React/Vue/Angular, no p5.js, and no new dependencies without a real reason.
- Don't commit `.agents/` or `NEXT_STEPS_HANDOFF_REPORT.md`. They are the user's earlier planning artifacts; leave them untracked and don't delete them.
- Never claim unfinished work is done, and never invent benchmark numbers.

### User decisions already made
- **Continuous 8-direction movement** with AABB-vs-tile collision. Legacy tile-step hops are dropped. Speeds are tuned to the legacy feel.
- Music was transcoded to **OGG + MP3 fallback** and the menu video to **WebM** (`scripts/transcode-media.sh`, which only reads from the legacy repo). This is already done and committed.

## 2. Current state of the main branch (all green at `8f69812`)
```
8f69812 feat(game): composition root, scene state machine, intent mapping, diagnostics
705340a chore: ignore local agent worktrees in lint and git
b34b8f4 feat(input): gameplay input gating and system key actions
16ef38d feat(contracts): shared simulation, world, entity, render and diagnostics types
dc8e029 chore: V2 baseline — tooling, assets, audio, core engine (M2 gate fixes)
faa6f93 first commit
```
At `8f69812`, `npm run typecheck`, `npm run lint` and `npm test` (**143 tests**) all pass. `npm run build` passed at the baseline. `src/main.ts` is still the old stub that only runs `Application.init`, so **nothing playable runs in the browser yet.**

### What exists
| Area | Files | Notes |
|---|---|---|
| Tooling | `package.json`, `tsconfig.json` (strict, `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`), `vite.config.ts`, `vitest.config.ts` (node env; DOM tests use `// @vitest-environment happy-dom`), `eslint.config.js`, `playwright.config.ts` (preview on :4173) | pixi.js **8.22.0**, Playwright 1.64 (Chromium and Firefox cached) |
| Core engine | `src/core/` | `GameLoop` (60 Hz fixed step, interpolation alpha, pause/resume, new `setMaxFps` limiter), `EventBus` + typed `GameEvents` (`src/core/events/types.ts`), `ServiceContainer`, `InputManager` (new `setEnabled()` gating, ignores editable targets, does not prevent Tab), `SpatialHashGrid`, `Vector2`, `AABB` |
| Input actions | `src/core/input/types.ts` | Added `fullscreen` (F), `regenerateWorld` (P), `characterMenu` (C/I), `toggleMinimap` (M). **The magic bolt moved from E to R**: in the legacy game the E spell never fired because the E "cut" (attack) binding took priority. |
| Audio | `src/audio/` | `SoundSynthesizer` (procedural SFX), `MusicPlayer` (picks `.ogg`, falls back to `.mp3` via `canPlayType`), `AudioBridge` |
| **Contracts** | `src/types/{tiles,world,entities,render,simulation,diagnostics}.ts`, `src/config/GameConfig.ts` | **Implement against these.** Tile IDs equal the legacy IDs. `WorldData` holds a row-major `Uint8Array`. `Entity` is a discriminated union. `PlayerIntent` is how input reaches the simulation. The renderer consumes `RenderSnapshot`; `IRenderer` and `ISimulation` are the two boundaries. The `window.__GAME__` contract lives in `diagnostics.ts`, and `tests/e2e/helpers/types.ts` re-exports it. |
| Game layer | `src/game/{Game,IntentMapper,LaunchParams,Diagnostics}.ts` | `Game` is the composition root, built on interfaces only: `boot()` → `startNewGame({tutorial,seed,difficulty,level})` / `loadWorld` / `regenerateWorld` / `pause` / `resume` / `endRun` / `returnToMenu` / `toggleFullscreen` / `setMaxFps`. Scenes: `loading/menu/playing/paused/gameover/victory/error`. `GameShell` provides optional UI hooks. `IntentMapper` latches key taps so each press fires in exactly one fixed step. `createDiagnostics()` builds `window.__GAME__`. `LaunchParams` reads `?seed= &tutorial= &difficulty= &debug=1 &autostart=1`. |
| Game tests | `tests/unit/game/` | `fakes.ts` provides FakeRenderer, FakeSimulation and FakeWorldFactory; reuse them. |
| ESLint guard | `eslint.config.js` | `src/{config,types,world,entities,systems,simulation,persistence}` may **not** import `pixi.js` or rendering/ui/animation code. The simulation must stay headless. |
| Assets | `public/assets/**`, manifest `public/assets/manifests/asset_manifest.json` (bundles `boot`, `world`, `entities`; audio and video entries were removed because Pixi doesn't load them) | Logical tile = **32 px**. Player frames are about 20×23 px per direction-sheet; enemy frames are 32×32 with 4 direction rows; portal frames are 256×256. |
| e2e suites | `tests/e2e/**` (written opaque-box earlier, never run against a real game) | Known bug: the `GameDriver` default `baseUrl` is 5173 but preview serves 4173. Switch to relative `page.goto('/?…&debug=1')`. Expect conflicts with continuous movement. |

### Useful references (untracked, don't commit)
- `.agents/teamwork/survey_spec_miner_1/legacy_game_spec.md`: mined legacy balance numbers, tile IDs, AI, world-gen pipeline, save schema, terminal commands. Use it as the spec, but verify against the legacy source.
- `.agents/teamwork/survey_explorer_arch_1/architecture_and_assets_survey.md`
- Approved plan: `/home/k9-vortex/.claude/plans/pasted-content-id-7bb4-forest-squishy-cerf.md`

## 3. Architecture decisions (keep them)
- **Units:** the simulation works in tile units (floats), with `x,y` plus `prevX,prevY` for render interpolation. Legacy per-frame rates are converted at 60 FPS (for example mana 0.05/frame = 3/s).
- **Rendering:** the renderer never makes gameplay decisions. `Game.renderFrame` calls `renderer.render(sim.buildRenderSnapshot(), alpha, dt)`. Pixi's ticker must **not** drive frames; `GameLoop` does.
- **Menus:** menus, settings and the terminal are **DOM overlays**, which gives accessibility, crisp text and `data-testid` hooks for Playwright. The HUD and minimap are drawn in Pixi's `uiLayer`.
- **Pixel art:** `TextureSource.defaultOptions.scaleMode = 'nearest'` set before any load; `roundPixels`; integer camera zoom ('auto' ≈ 2× at 1080p, 3× at 1440p, 4× at 4K); camera snapped to whole pixels.
- **Debug:** `window.__GAME__` and cheat terminal commands only in dev or with `?debug=1`.
- **Input:** gameplay input is enabled only in the `playing` scene. Escape-to-resume is a DOM keydown handler in `Game.boot()`; menus that consume Escape call `preventDefault()`.

## 4. Partial agent work saved on local branches (NOT merged)
Each sub-agent worked in a git worktree under `.claude/worktrees/` (gitignored). Their work is committed on these **local branches**:

| Branch | Commit | Contents | State |
|---|---|---|---|
| `worktree-agent-a31da5925bb72073b` | `c7fef7a` | **Animation** (Visual/UI agent): `src/animation/AnimationDefs.ts`, `resolveSpriteFrame.ts`, `index.ts` and 30 unit tests | ✅ Finished slice. Typecheck clean, 30/30 tests pass. **Merge first.** The DOM menus, `SettingsStore` and `AudioPresenter` were never started. |
| `worktree-agent-a99e9eb9c4447a6cb` | `51af36b` (WIP) | **World generation** (Gameplay agent): `src/world/{Rng,Noise,TileMap,pathfinding,WorldGenerator,TutorialMap}.ts`, `src/world/generation/{GenGrid,baseTerrain,rivers,bridges,hills,placement}.ts` (~1,480 lines) | ⚠️ Unverified. **2 type errors** in `generation/hills.ts:34,38` (`Uint8Array<ArrayBufferLike>` vs `Uint8Array<ArrayBuffer>`; use `new Uint8Array(...)` copies or widen the type). **No tests.** `MovementSystem`, `CollisionSystem` and `src/simulation/Simulation.ts` were never written. |
| `worktree-agent-af0cf6f733dab9ac2` | `79a318d` (WIP) | **Rendering** (pure helpers only): `src/rendering/{Camera,chunkMath,assetCatalog,terrainArt,spriteFrames,TextureStore}.ts` | ⚠️ Typecheck clean, **no tests**, unverified. `PixiRenderer`, `Layers`, `ChunkedTerrainRenderer` and `EntityRenderer` were never written. |
| `worktree-agent-ae198c9e4588746d5` | `261efbd` (WIP) | **Infra/QA**: `tests/fixtures/legacy/` (copies of legacy `active_map.json`, an 8×8 default map, settings and keybind fixtures) | ✅ Data only. No docs, prettier, wrangler or e2e driver fix yet. |

To merge, from the main checkout on `feat/forest-rpg-v2-foundation`:
```bash
git merge --no-ff worktree-agent-a31da5925bb72073b   # animation (clean)
git merge --no-ff worktree-agent-ae198c9e4588746d5   # fixtures
git merge --no-ff worktree-agent-a99e9eb9c4447a6cb   # world gen WIP: fix hills.ts type errors, add tests
git merge --no-ff worktree-agent-af0cf6f733dab9ac2   # rendering WIP: review, add tests
```
These branches fork from `16ef38d`, before the game layer. The other branches add only new directories, so conflicts are unlikely. Review the WIP code before trusting it. Once merged, remove the worktrees with `git worktree remove <path>` (the branches remain).

## 5. Next steps (in order)

### Phase 1: finish the vertical slice
1. Merge the branches in §4. Fix `hills.ts`. Make typecheck, lint and test green.
2. **World tests** (`tests/unit/world/`):
   - The same seed produces identical output; different seeds produce different output.
   - The BORDER ring is solid.
   - Every walkable tile, every coin and the portal are reachable from spawn (`floodFill`).
   - Enemy counts match the difficulty.
   - Log the generation time for 150×150; the target is under 250 ms.
   - Tutorial layout matches the legacy game: spawn (3,15), dummy beetle (5,5) with 5 HP, coins at (15,5), (16,4), (14,6), portal at (17,3).
3. **`src/systems/MovementSystem.ts` + `CollisionSystem.ts`:**
   - Normalised 8-direction movement; `GAME_CONFIG.player.walkSpeed` 6.25 and `sprintSpeed` 8.5 tiles/s. The legacy cadence was a 160 ms walk step / 150 ms sprint step; check feel.
   - River `speedMultiplier`.
   - Stamina drain 100/3 per s, regen 12/s, 4 s lockout at 0.
   - `facing` and `anim` (idle/walk/run), and `prevX/prevY` set every step.
   - Axis-separated AABB collision against solid tiles and solid props, sliding along walls, no tunnelling.
4. **`src/simulation/Simulation.ts implements ISimulation`:**
   - Spawns the player plus idle enemies, pickups and portal from `WorldData`.
   - Day clock: 480 s, start around 0.3.
   - `buildRenderSnapshot()`: `spriteKey` is `'player'`, the enemy type, the pickup type or `'portal'`; darkness follows time of day; a torch light source.
   - Debug hooks.
5. **`src/rendering/PixiRenderer.ts implements IRenderer`**, plus `Layers`, `ChunkedTerrainRenderer` (16×16-tile chunks, `cacheAsTexture`, culling, `invalidateTile`, `destroy` frees textures) and `EntityRenderer` (one pooled sprite per id, foot anchor, `zIndex` = foot y, interpolation by alpha). Use the merged `Camera`/`TextureStore`/`chunkMath` and `resolveSpriteFrame` from `src/animation` for frames. Read the real v8 API in `node_modules/pixi.js/lib/**/*.d.ts`.
6. **`src/main.ts`:**
   - Construct `EventBus`, `InputManager`, `PixiRenderer`, `Simulation`, and a `WorldFactory` (`generateWorld`, `generateTutorialWorld`).
   - Build `new Game({...})`, `await game.boot()`, then `startNewGame()`. Until menus exist, autostart; later only with `?autostart=1`.
   - Install `window.__GAME__ = createDiagnostics(...)` when `params.debug`.
   - Show load progress and errors in the existing `#loading-screen` in `index.html`.
   - Make the canvas fill the window.
7. Fix the e2e driver `baseUrl`. Add a smoke e2e: boot with `?debug=1&autostart=1&seed=123`, hold W, assert the player moved, press Escape, assert paused, resize, check for no console errors.
8. **Gate 1**: typecheck, lint, test, build, `npx playwright test tests/e2e/smoke.spec.ts`, a manual browser screenshot, and a clean legacy repo. Commit.

### Phase 2
Tall depth-sorted trees and props, enemy and player animations wired via `resolveSpriteFrame`, `Lighting` (480 s cycle, one multiply overlay, torch 520 → 230 px), `WeatherRenderer` (clouds, leaves, rain, starfield above darkness 0.6) with quality settings, Pixi HUD (hearts, mana/stamina/XP bars, coins, potions, 120 px minimap, compass), DOM menus (Loading, Main, Pause, Settings, GameOver, Victory, all keyboard-navigable with `data-testid`s), `SettingsStore` (key `forestrpg.v2.settings`, one-time migration from legacy `game.settings`), `AudioPresenter` (EventBus → `src/audio`). Wire `GameShell` hooks. Check 1080p, 1440p and 4K.

### Phase 3
Implement the following, with numbers from the legacy spec and `GAME_CONFIG`:
- **Combat:**
  - 3-hit combo inside an 800 ms window; the 3rd hit does `floor(d*1.5)+1`.
  - Hit cone plus auto-radius; knockback.
  - Wall-crush SPLAT (beetle and ghost immune).
  - Q spin (30 mana); R bolt (20 mana).
  - I-frames.
- **AI:** Mantis, Maggot (acid projectile), Beetle boss (lunge, BFS, unstuck teleport), Ghost (night only, phases, despawns at dawn).
- **Progression:** XP 100×1.5ⁿ; stat points (+1 HP up to a cap of 20, +1 damage, +25 mana, +20 stamina).
- **Items:** potions on keys 1 and 2; regen; 40% loot drop chance (60% health / 40% speed); flower cutting.
- **Portal and flow:** portal activates when all coins are collected and every non-ghost enemy is dead; victory, game over, restart; tutorial step machine.
- **Terminal:** typed command registry (`/kill all|boss`, `/collect all`, `/scan boss`, `/locate boss`, `/spawn boss|ghost`, `/give`, `/time`, `/health`, `/tutorial welcome|reset`, `/clear`, `/exit`, `/help`).
- **Saves:** `src/persistence` SaveSchema v2 with validation, SaveManager (autosave, slots, export/import), and a LegacySaveAdapter tested against `tests/fixtures/legacy/`.

### Phase 4
Profile, then optimise. Benchmarks: world-gen time; frame time p50/p95/p99 at 1080p, 1440p and 4K; heap over 20 regenerations; simulation-rate correctness at 60/120/144/170/240 Hz. Tier-1/2 e2e on Chromium and Firefox. Docs: README, `docs/{architecture,rendering,world-generation,gameplay-systems,save-format,performance,testing,original-game-audit,feature-parity,deployment}.md`. Cloudflare `wrangler.jsonc` (assets from `./dist`, SPA fallback, no deploy). Prettier config plus a `format` script. Final report.

## 6. Verification commands
```bash
cd "/home/k9-vortex/Development/2-TypeScript/18-Forest RPG v2"
npm run typecheck && npm run lint && npm test && npm run build
npx playwright test                      # serves the preview build on :4173
git -C "/home/k9-vortex/Development/1-JavaScript/3-Game Development" status --porcelain   # must be empty
git -C "/home/k9-vortex/Development/1-JavaScript/3-Game Development" rev-parse HEAD       # 795aa547f879…
```

## 7. Gotchas found so far
- In the legacy game, E is "cut" (melee) and its handler runs first, so the E spell was unreachable. V2 puts the bolt on **R**.
- `InputManager`'s just-pressed flags last one render frame. Always use `IntentMapper` (`collect` / `nextIntent` / `endFrame`) to feed the simulation, or taps get dropped or doubled.
- While paused, `GameLoop` calls `onRender` with alpha 0. `Game` keeps the last alpha so sprites don't snap back.
- `tsconfig` includes `tests/**`, so the e2e specs must typecheck too.
- ESLint also scans `.claude/worktrees` unless it is ignored (already ignored).
- The TS 5.7+ `Uint8Array<ArrayBuffer>` generic causes friction with `Uint8Array` copies (see the `hills.ts` errors).
