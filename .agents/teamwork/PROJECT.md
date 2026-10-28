# Project: Forest RPG V2

## Architecture
Forest RPG V2 is a standalone, modern, production-quality 2D pixel-art RPG built with strict TypeScript, PixiJS 8, and Vite. The system is designed with strict separation between simulation logic, rendering presentation, user interface, and persistence, coordinated through an authoritative fixed-timestep loop and a decoupled event bus.

```
+---------------------------------------------------------------------------------------+
|                                    Forest RPG V2                                      |
+---------------------------------------------------------------------------------------+
|  Infrastructure & Tooling (Vite 5+, Strict TS, Vitest, Playwright, Retro Synthesizer)  |
+---------------------------------------------------------------------------------------+
|  Core Simulation (60 Hz Fixed Timestep Accumulator, EventBus, InputSystem, SpatialGrid) |
+---------------------------------------------------------------------------------------+
|  Gameplay & World Systems                                                             |
|  - Deterministic Procedural World Gen (Noise, Drunken-Walk Rivers, Bridges, CA Hills)   |
|  - Top-down Collision & Spatial Partitioning                                          |
|  - Player Simulation (8-dir movement, sprint, stamina, mana, jump arc, dash)          |
|  - Bestiary & AI State Machines (Mantis, Maggot, Beetle Boss, Ghost Elite)            |
|  - Real-Time Combat (3-hit combo, critical 3rd, knockback, wall crush SPLAT, Q/E)     |
|  - Progression, Loot Drops, Environmental Cutting, Tutorial Glade, Victory Sequence   |
|  - Versioned JSON Persistence & Legacy Save Adapter (maps/active_map.json format)     |
+---------------------------------------------------------------------------------------+
|  Rendering Engine (PixiJS 8)                                                          |
|  - Nearest-Neighbor Texture Sampling & High-DPI Auto-Density                          |
|  - 16x16 Tile Chunk Containers with Camera Viewport Culling (>85% draw-call savings)  |
|  - Depth-Sorted Entity Layer (sortableChildren, zIndex = interpolatedY)               |
|  - 2D Smooth Camera (Lerp follow 0.12, bounding clamp, zoom, directional shake)       |
|  - Multiplicative Day/Night Ambient Quad & Torch / Portal Circular Cutout Lights       |
|  - Ambient Weather Particle System (Falling leaves, rain, night stars)                |
+---------------------------------------------------------------------------------------+
|  Visual Design & UI                                                                   |
|  - Typed Sprite Animation Framework (8-dir idle/walk/run/jump/attack, mirror E/W)     |
|  - Pixel-Art HUD (Hearts, Mana, Stamina, Level, XP bar, Coins, Minimap)               |
|  - Responsive Screen Layout (1080p, 1440p, 4K adaptive scaling)                       |
|  - Game Menus (Main Menu, Pause, Settings, Game Over, Victory Fanfare)                |
|  - In-Game Debug Terminal Console (Command parser, autocomplete, history)             |
+---------------------------------------------------------------------------------------+
```

---

## Feature Inventory
Every feature identified during Phase 0 Survey is inventoried and mapped to an implementation milestone below.

| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| 1 | Modern TypeScript & Tooling Scaffold | Root package.json, strict tsconfig, vite.config, vitest.config, playwright.config, eslint.config | M1 | survey_explorer_target_1 |
| 2 | Asset Sanitization Pipeline | Clean alpha PNGs for 8 cliff tiles (removing legacy chroma green-screen), 32x32 pixel potion/chest icons | M1 | survey_explorer_arch_1 |
| 3 | Audio Assets & Retro Web Audio Synthesizer | Static music loading, procedural Web Audio SFX (swings, hits, player hurt, coin chime, potion sip, fanfare) | M1 | survey_explorer_arch_1 |
| 4 | Decoupled 60Hz Fixed Simulation Loop | Fixed timestep (16.667ms) accumulator, 50ms delta clamp, 100ms / 5-step spiral-of-death guard | M2 | survey_spec_miner_1 §1 |
| 5 | Alpha Transform Interpolation | Interpolation factor `alpha = accumulator / fixedStep` for jitter-free rendering across 60Hz–240Hz+ displays | M2 | survey_explorer_arch_1 §3 |
| 6 | Core Event Bus & Service Container | Strongly-typed pub/sub event bus (`GameEvents`) and lightweight dependency injection container | M2 | survey_explorer_arch_1 §2 |
| 7 | Keyboard & Mouse Input Manager | Keybind remapping, WASD/arrows, Shift sprint/dash, Space jump, 1/2 potions, Q/E skills, `~` console | M2 | survey_spec_miner_1 §3 |
| 8 | 2D Geometry & Spatial Grid | Vector2 math, AABB bounding boxes, raycasts, spatial hash grid for collision and entity proximity | M2 | survey_explorer_arch_1 §2 |
| 9 | PixiJS 8 Application & Renderer Init | Async `Application.init`, canvas binding, `scaleMode: 'nearest'`, `roundPixels: true`, high-DPI `autoDensity` | M3 | survey_explorer_arch_1 §3 |
| 10 | 2D Smooth Tracking Camera | Smooth player lerp (0.12), world bounding clamp, screen/world coordinate conversions, directional shake | M3 | survey_spec_miner_1 §1 |
| 11 | Chunked Terrain & Viewport Culling | 16x16 tile chunk containers (512x512px), dynamic viewport culling (`visible = inCameraBounds`) | M3 | survey_explorer_arch_1 §3 |
| 12 | Depth-Sorted Entity Layer | Top-down RPG Y-sorting via `sortableChildren = true` and `zIndex = Math.floor(interpolatedY)` | M3 | survey_explorer_arch_1 §3 |
| 13 | Day/Night Lighting System | 480s cycle (Night, Dawn, Day, Dusk), multiplicative ambient quad, contracting player torch & portal glow | M3 | survey_spec_miner_1 §5 |
| 14 | Ambient Weather Particles | Procedural falling leaves, rain drops, night starfield (>500 stars when darkness alpha > 60) | M3 | survey_spec_miner_1 §5 |
| 15 | Deterministic Procedural World Gen | 150x150 Perlin noise + drunken-walk rivers + auto-bridges + CA hills + flood-fill reachability pruning | M4 | survey_spec_miner_1 §4 |
| 16 | Dedicated 20x20 Training Glade | Isolated tutorial map with dummy beetle (5 HP), 3 coins, exit portal, and step-by-step guidance | M4 | survey_spec_miner_1 §6 |
| 17 | Top-Down Collision & Physics | Tile collision (solid hills, water, trees), entity pushback, AABB queries, leap over obstacles | M4 | survey_spec_miner_1 §3 |
| 18 | Player Mechanics & Stats | 7 base HP (max 20), 100 mana (regens 3/s), 100 stamina (sprint drain, 4s cooldown), dash, 48px jump arc | M4 | survey_spec_miner_1 §3 |
| 19 | Out-of-Combat Health & Mana Regen | +1 HP every 4000ms after 6000ms without damage; continuous mana regen | M4 | survey_spec_miner_1 §3 |
| 20 | Melee Combat System | 3-hit combo in 800ms window, critical 3rd hit (1.5x + 1, shake 2.5), knockback, wall crush SPLAT | M4 | survey_spec_miner_1 §3 |
| 21 | Skills: AoE Spin Attack & Projectile | Key Q: 30 mana, 3.5 radius, 2x damage, 1.5 radial knockback; Key E: 20 mana, 0.25 speed magic bolt | M4 | survey_spec_miner_1 §3 |
| 22 | Armor & Damage Calculations | `damage = max(1, rawDamage - armor.defense)`, i-frames (600ms player/regular, 800ms boss) | M4 | survey_spec_miner_1 §3 |
| 23 | Bestiary: Mantis AI | Melee mob, 3+floor(lvl/2) HP, 1 dmg, 1.5 range, 0.8 knockback, panic flee at 1 HP for 4s, crushable | M4 | survey_spec_miner_1 §2 |
| 24 | Bestiary: Maggot AI | Ranged mob, 2+floor(lvl/3) HP, acid spit projectile (0.15 speed, 10 range, 1 dmg), panic flee at 1 HP | M4 | survey_spec_miner_1 §2 |
| 25 | Bestiary: Beetle Boss AI | Boss mob, 15+(lvl-1)*5 HP, lunge attack, shake 6, 800ms i-frames, anti-stuck teleport/nudge, crush immune | M4 | survey_spec_miner_1 §2 |
| 26 | Bestiary: Ghost Elite AI | Night-only spawn, phases through trees/walls, oscillating alpha (140±40), blue glow, dawn despawn | M4 | survey_spec_miner_1 §2 |
| 27 | XP, Leveling & Stat Distribution | 100 base XP scaling 1.5x/level; stat allocation (+1 HP, +1 Dmg, +25 Mana, +20 Stamina) | M4 | survey_spec_miner_1 §3 |
| 28 | Environmental Interaction | Melee attack sweeps cut flower patches to grass, dropping 10% coins and 15% health potions | M4 | survey_spec_miner_1 §3 |
| 29 | Loot Drops & Consumables | 40% enemy potion drop (60% HP, 40% speed); Key 1 consumes HP (+2), Key 2 consumes speed (8s buff) | M4 | survey_spec_miner_1 §3 |
| 30 | Level Progression & Victory | All 20 coins + all non-ghost enemies defeated activates exit portal -> currentLevel++ | M4 | survey_spec_miner_1 §6 |
| 31 | Versioned JSON Persistence | Robust JSON save/load in localStorage with schema versioning and corruption recovery | M4 | survey_spec_miner_1 §7 |
| 32 | Legacy Save File Adapter | 100% faithful parser for legacy `maps/active_map.json` and legacy localStorage keys | M4 | survey_spec_miner_1 §7 |
| 33 | Typed Sprite Animation Framework | 8-directional idle, walk, run, jump, attack animation controller with horizontal texture mirroring | M5 | survey_explorer_arch_1 §2 |
| 34 | Pixel-Art HUD System | Hearts, Mana bar, Stamina bar, Level & XP bar, Coin counter, Minimap / navigation arrows | M5 | survey_spec_miner_1 §2 |
| 35 | Responsive Layout & Resolution Adaptation | Adaptive integer / aspect-ratio scaling for 1080p, 1440p, 4K displays | M5 | survey_explorer_target_1 §3 |
| 36 | Menu Systems | Main Menu, Pause Menu, Audio/Controls/FPS Settings, Game Over screen, Victory fanfare | M5 | survey_spec_miner_1 §1 |
| 37 | In-Game Debug Terminal Console | Command parser (`/help`, `/god`, `/heal`, `/spawn`, `/tp`, `/noclip`, `/time`, `/xp`, `/killall`), history | M5 | survey_spec_miner_1 §1 |
| 38 | System Integration & Game Lifecycle | Full glue wiring: Core Engine, World, Renderer, Audio, UI into seamless production game | M6 | ORIGINAL_REQUEST |
| 39 | E2E Automated Test Suite Pass | 100% pass on all Tier 1-4 E2E test cases published in `TEST_READY.md` | M6 | ORIGINAL_REQUEST §R4 |
| 40 | Tier 5 Adversarial Coverage Hardening | White-box stress testing, memory leak detection, frame budget stability (stable 60 FPS) | M6 | ORIGINAL_REQUEST §R4 |
| 41 | Performance Benchmarking Harness | Measurement & reporting of boot time, world gen time, avg FPS, p95/p99 frame times | M6 | ORIGINAL_REQUEST §R4 |
| 42 | Technical Documentation Suite | Comprehensive guides in `docs/` (Architecture, Rendering, World Gen, Gameplay, Saves, Benchmarks) | M6 | ORIGINAL_REQUEST §R4 |

---

## Milestones

| # | Name | Scope | Assigned Sub-Orchestrator | Dependencies | Status |
|---|------|-------|--------------------------|--------------|--------|
| M1 | Infrastructure & Quality Assurance | Package configs, strict tsconfig, Vite, Vitest, Playwright, asset pipeline, Web Audio retro synthesizer | sub_orch_m1 | none | DONE |
| M2 | Core Architecture & Simulation Engine | 60Hz fixed simulation loop, accumulator, event bus, DI container, input manager, spatial grid | sub_orch_m2 | M1 | PLANNED |
| M3 | PixiJS 8 Rendering & Presentation | PixiJS 8 app, 2D camera system, 16x16 chunked terrain with culling, depth sorting, day/night, weather | sub_orch_m3 | M1, M2 | PLANNED |
| M4 | Gameplay, World Systems & Persistence | Procedural generation, collisions, player mechanics, bestiary AI, combat, leveling, persistence & legacy adapter | sub_orch_m4 | M1, M2 | PLANNED |
| M5 | Visual Design, UI & Debug Console | Sprite animation framework, pixel HUD, menus, responsive scaling, in-game debug terminal | sub_orch_m5 | M1, M2, M3, M4 | PLANNED |
| M6 | System Integration, E2E Pass & Hardening | Glue assembly, 100% E2E test pass, Tier 5 adversarial hardening, benchmarks, docs | sub_orch_m6 | M1, M2, M3, M4, M5, E2E Track | PLANNED |
| E2E | E2E Testing Track | Independent opaque-box test infra, test cases (Tiers 1-4), publishes TEST_READY.md | sub_orch_e2e | M1 | PLANNED |

---

## Interface Contracts

### 1. Core ↔ Rendering (`src/core/types.ts` & `src/rendering/types.ts`)
- `IRenderableEntity`: `{ id: string; x: number; y: number; prevX: number; prevY: number; width: number; height: number; spriteKey: string; animationState: string; zIndex: number; visible: boolean; }`
- `ICameraTarget`: `{ x: number; y: number; }`
- `IRenderingEngine`:
  - `init(canvas: HTMLCanvasElement): Promise<void>`
  - `render(alpha: number, cameraTarget: ICameraTarget, worldState: IWorldRenderState): void`
  - `triggerCameraShake(magnitude: number, durationMs: number): void`
  - `setLightingTime(cycleRatio: number): void`
  - `resize(width: number, height: number): void`

### 2. Core ↔ World & Gameplay (`src/core/types.ts` & `src/gameplay/types.ts`)
- `ISimulationSystem`:
  - `update(fixedDeltaSec: number): void`
- `IWorldSystem`:
  - `generateWorld(seed: number, isTutorial?: boolean): IWorldData`
  - `getTileAt(x: number, y: number): TileType`
  - `isTileSolid(x: number, y: number): boolean`
  - `queryEntitiesInRadius(x: number, y: number, radius: number): IEntity[]`
- `ICombatSystem`:
  - `executeMeleeAttack(attacker: IEntity): AttackResult`
  - `executeSkill(skillId: string, attacker: IEntity, targetPos: Vector2): SkillResult`
  - `dealDamage(target: IEntity, amount: number, source: IEntity, knockbackDir?: Vector2): DamageResult`

### 3. Core ↔ UI & Debug Terminal (`src/ui/types.ts`)
- `IUIManager`:
  - `updateHUD(playerStats: IPlayerStats, worldInfo: IWorldInfo): void`
  - `showMenu(menuId: string): void`
  - `hideMenu(menuId: string): void`
  - `toggleTerminal(): void`
- `IDebugTerminal`:
  - `registerCommand(command: IDebugCommand): void`
  - `executeCommand(rawText: string): string`

### 4. Persistence ↔ World & Player (`src/persistence/types.ts`)
- `ISaveManager`:
  - `saveGame(slot: string): boolean`
  - `loadGame(slot: string): ISavePayload | null`
  - `loadLegacySave(rawPayload: unknown): ISavePayload`

---

## Code Layout
```
/home/k9-vortex/Development/2-TypeScript/18-Forest RPG v2/
|-- package.json
|-- tsconfig.json
|-- tsconfig.node.json
|-- vite.config.ts
|-- vitest.config.ts
|-- playwright.config.ts
|-- eslint.config.js
|-- index.html
|-- public/
|   `-- assets/
|       |-- images/
|       |   |-- characters/
|       |   |-- terrain/
|       |   |-- items/
|       |   `-- ui/
|       `-- audio/
|           |-- music/
|           `-- sfx/
|-- src/
|   |-- core/             # Fixed loop, EventBus, DI container, Input, Math, SpatialGrid
|   |-- rendering/        # PixiJS 8 app, Camera, Chunked terrain, Depth sorting, Lighting, Weather
|   |-- gameplay/         # World gen, Physics/Collisions, Player, Bestiary AI, Combat, Leveling
|   |-- ui/               # Pixel-art HUD, Menus, Sprite animations, Debug terminal
|   |-- persistence/      # Versioned JSON save manager, Legacy save adapter
|   |-- audio/            # Retro Web Audio Synthesizer, Music controller
|   |-- main.ts           # Application bootstrap & orchestrator
|   `-- types/            # Shared contracts and type definitions
|-- tests/
|   |-- unit/             # Vitest unit test suites
|   |-- integration/      # Vitest integration test suites
|   |-- benchmarks/       # Performance & frame-time benchmark harness
|   `-- e2e/              # Playwright browser test suites (Tiers 1-4)
`-- docs/
    |-- architecture.md
    |-- rendering.md
    |-- world-generation.md
    |-- gameplay-systems.md
    |-- persistence-and-legacy-saves.md
    |-- performance-benchmarks.md
    `-- legacy-parity-audit.md
```
