# FOREST RPG V2 — AGENT HANDOFF & NEXT STEPS EXECUTION GUIDE

> **Author**: Lead Software Engineer / Coordination Team  
> **Date**: October 28, 2026  
> **Workspace Root**: `/home/k9-vortex/Development/2-TypeScript/18-Forest RPG v2`  
> **Legacy Reference (STRICTLY READ-ONLY)**: `/home/k9-vortex/Development/1-JavaScript/3-Game Development`

---

## 1. Executive Summary & Non-Negotiable Directives

This document is the definitive handoff specification for any incoming AI agent or software engineer taking over the development of **Forest RPG V2**.

### 1.1 Core Safety Directives
1. **Strictly Read-Only Legacy Repository**:  
   The original university project at `/home/k9-vortex/Development/1-JavaScript/3-Game Development` is **100% READ ONLY**.
   - NEVER edit, delete, create, or modify any file inside that directory.
   - NEVER run build commands, npm install, or git commands that write to it.
   - All new development must occur strictly in `/home/k9-vortex/Development/2-TypeScript/18-Forest RPG v2`.
2. **Quality Gates**:
   - `npm run typecheck` (strict TypeScript, zero errors).
   - `npm run lint` (ESLint 9, zero warnings/errors).
   - `npm test` (Vitest unit and integration suites, 100% pass rate).
   - `npm run build` (Vite production bundle generated in `dist/`).
3. **No External Framework Dependencies**:
   - Do NOT introduce React, Vue, Angular, or p5.js.
   - Use strict TypeScript, PixiJS 8, Vite, Vitest, and Playwright.

---

## 2. Project State & Architecture Summary

### 2.1 Current Completion Status

| Milestone | Scope | Status | Notes |
|---|---|---|---|
| **Phase 0** | Codebase Survey & Specs | **COMPLETED** | Produced authoritative `.agents/teamwork/PROJECT.md`, `TEST_INFRA.md`, and `legacy_game_spec.md`. |
| **Milestone 1** | Tooling, Assets & Audio Synthesizer | **COMPLETED & CERTIFIED** | Vite, strict TS, ESLint, Playwright, asset pipeline (`public/assets/manifests/asset_manifest.json`), zero-dependency retro Web Audio synthesizer (`SoundSynthesizer.ts`, `MusicPlayer.ts`). Gate 1 passed. |
| **Milestone 2** | Core Architecture & Simulation Engine | **IN PROGRESS (Iteration 2)** | 60Hz fixed accumulator loop (`GameLoop.ts`), alpha interpolation (`Interpolation.ts`), EventBus (`EventBus.ts`), DI container (`ServiceContainer.ts`), InputManager (`InputManager.ts`), SpatialHashGrid (`SpatialHashGrid.ts`). **107/107 tests passing**. Requires addressing 4 reviewer gate findings (detailed below). |
| **Milestone 3** | PixiJS 8 Rendering & Presentation | **READY TO IMPLEMENT** | Chunked terrain renderer (16x16), 2D camera with lerp and shake, depth sorting, day/night lighting, weather particles. |
| **Milestone 4** | Gameplay, World Systems & Persistence | **PLANNED** | Seeded procedural generation, collisions, player stats/mechanics, combat combo & skills, bestiary AI (Mantis, Maggot, Beetle Boss, Ghost), JSON save + legacy adapter. |
| **Milestone 5** | Visual Design, UI & Debug Terminal | **PLANNED** | Sprite animation state machine, pixel-art HUD, menu system, debug console (`/god`, `/heal`, etc.). |
| **Milestone 6** | Full Integration, E2E & Hardening | **PLANNED** | Glue wiring into `src/main.ts`, Playwright Tier 1–4 runs, performance benchmarks (stable 60 FPS), and documentation. |

### 2.2 Health Check Commands
Verify the current repository baseline before making edits:
```bash
cd "/home/k9-vortex/Development/2-TypeScript/18-Forest RPG v2"
npm run typecheck    # Must output 0 errors
npm run lint         # Must output 0 warnings/errors
npm test             # Must pass 12 test suites / 107 tests
npm run build        # Must cleanly produce dist/
```

---

## 3. Immediate Priority: Complete Milestone 2 (Iteration 2)

Milestone 2 Iteration 1 completed the core simulation code, but the adversarial gate review issued `REQUEST_CHANGES` on 4 specific edge cases. Resolving these 4 issues will immediately certify Milestone 2 and unlock Milestone 3.

### Issue 1: Phantom Delta Accumulation on Timing Baseline Reset
- **File**: `src/core/loop/GameLoop.ts` (lines 165–177)
- **Problem**: When `firstTickPending` or `resumeBaselinePending` is true, `lastTimeMs` is set to `now`, making `rawDeltaMs = 0`. However, line 176 clamps `rawDeltaMs` using `Math.max(this.minDeltaMs, ...)`, where `minDeltaMs = 0.1`. Consequently, a phantom `0.1ms` is added to `accumulatorMs` whenever baseline sync occurs (at startup and on every `resume()`).
- **Remediation**:
  In `src/core/loop/GameLoop.ts`:
  ```typescript
  const now = currentTimeMs ?? this.now();
  let isBaselineReset = false;
  if (this.firstTickPending || this.resumeBaselinePending) {
    this.lastTimeMs = now;
    this.fpsWindowStartMs = now;
    this.firstTickPending = false;
    this.resumeBaselinePending = false;
    isBaselineReset = true;
  }

  const rawDeltaMs = now - this.lastTimeMs;
  this.lastTimeMs = now;

  // 1. Clamp frame delta to [minDeltaMs, maxDeltaMs]; on baseline reset, delta is 0
  const clampedDeltaMs = isBaselineReset ? 0 : Math.max(this.minDeltaMs, Math.min(this.maxDeltaMs, rawDeltaMs));
  this.lastFrameDeltaMs = clampedDeltaMs;
  ```
  In `tests/integration/m2_challenger_stress.test.ts` (line 294):
  Update `expect(longRunLoop.getStats().accumulatorMs).toBeCloseTo(0, 2);` to assert true 0-drift.
  In `tests/unit/core/GameLoop.test.ts`:
  Add a test verifying accumulator backlog drop when accumulator exceeds `maxAccumulatorBacklogMs` (asserting `droppedFramesCount++`).

---

### Issue 2: Storage Persistence Facade Test & Keybind Replacement
- **Files**: `src/core/input/InputManager.ts` (lines 269–297) & `tests/unit/core/InputManager.test.ts` (lines 77–86)
- **Problem**:
  1. In `src/core/input/InputManager.ts`: `loadFromStorage()` calls `this.bindAction(action, code)`. Because the constructor already populates `DEFAULT_KEYBINDS`, loaded keys are merely appended rather than replacing defaults. Default bindings cannot be unbound.
  2. In `tests/unit/core/InputManager.test.ts`: The test named `'persists and restores keybinds from storage'` called only `setKeybinds()` in memory, never exercising `saveToStorage()` or `loadFromStorage()`.
- **Remediation**:
  1. In `src/core/input/InputManager.ts` inside `loadFromStorage()`:
     When an action from storage is processed, clear its existing bindings first:
     ```typescript
     // Clear existing bindings for this action so loaded bindings replace defaults
     this._bindings.set(action, new Set());
     ```
  2. In `tests/unit/core/InputManager.test.ts`:
     Rewrite the test to mock `localStorage`, execute `input.saveToStorage()`, create a fresh `new InputManager()`, execute `input.loadFromStorage()`, and verify that custom keys are bound while overridden default keys are removed.

---

### Issue 3: Entity Reference Stale Leak in `SpatialHashGrid`
- **File**: `src/core/spatial/SpatialHashGrid.ts` (lines 49–75 and 246–259)
- **Problem**: In `update(entity)`, `_removeFromCells(entity, oldSpan)` calls `cell.delete(entity)` using object reference equality. If an entity with the same `id` is updated with a new object reference (common in top-down immutability or respawns), the old reference is never deleted from old cells. Furthermore, `this._entities.set(id, entity)` is never called in `update()`.
- **Remediation**:
  In `src/core/spatial/SpatialHashGrid.ts`:
  ```typescript
  public update(entity: T): void {
    const id = entity.id;
    const oldSpan = this._entitySpans.get(id);

    if (!oldSpan) {
      this.insert(entity);
      return;
    }

    const aabb = entity.getAABB();
    const newSpan = this._calculateSpan(aabb);

    // Update entity reference in registry
    const existingRef = this._entities.get(id) ?? entity;
    this._entities.set(id, entity);

    // Fast path: entity stayed within the exact same cell bounds
    if (
      oldSpan.minCX === newSpan.minCX &&
      oldSpan.maxCX === newSpan.maxCX &&
      oldSpan.minCY === newSpan.minCY &&
      oldSpan.maxCY === newSpan.maxCY
    ) {
      // If reference changed, replace it in current cells
      if (existingRef !== entity) {
        this._removeFromCells(existingRef, oldSpan);
        this._addToCells(entity, newSpan);
      }
      return;
    }

    // Remove old reference from old cells and add new reference to new cells
    this._removeFromCells(existingRef, oldSpan);
    this._entitySpans.set(id, newSpan);
    this._addToCells(entity, newSpan);
  }
  ```
  Add a unit test in `tests/unit/core/SpatialHashGrid.test.ts` asserting that updating an entity ID with a new object reference removes the old object from previous cells.

---

### Issue 4: Hierarchical DI Container Singleton Isolation & AABB Negative Radius
- **Files**: `src/core/di/ServiceContainer.ts` (lines 70–94) & `src/core/math/AABB.ts` (line 125)
- **Problem**:
  1. In `ServiceContainer.ts`: When a child container resolves a parent singleton before the parent has resolved it, `descriptor.factory(this)` runs with `this = child`. If the child has overrides, the child overrides pollute the parent's singleton instance.
  2. In `AABB.ts`: In `intersectsCircle(center, radius)`, `radius * radius` turns negative radii positive, returning `true` for impossible negative radii.
- **Remediation**:
  1. In `src/core/di/ServiceContainer.ts`:
     When resolving a service not registered locally in `this.descriptors`, delegate resolution to the parent container:
     ```typescript
     const local = this.descriptors.get(token) as ServiceDescriptor<T> | undefined;
     if (!local && this.parent) {
       return this.parent.resolve(token);
     }
     ```
  2. In `src/core/math/AABB.ts`:
     Add at line 125:
     ```typescript
     if (radius < 0) return false;
     ```

---

## 4. Next Implementation Roadmap

Once Milestone 2 is verified, implement Milestones 3 through 6 following the architectural blueprints established in `.agents/teamwork/PROJECT.md`.

```
Milestone 2 (Core Engine) --> Milestone 3 (PixiJS 8 Rendering) --> Milestone 4 (Gameplay & AI)
                                                                            |
Milestone 6 (E2E & Hardening) <-- Milestone 5 (UI, HUD & Console) <----------+
```

---

### Milestone 3: PixiJS 8 Rendering & Presentation Pipeline

Target directory: `src/rendering/`

#### 1. Renderer Architecture (`src/rendering/Renderer.ts`)
- Use PixiJS 8 `Application` with asynchronous `app.init({ canvas, width, height, resolution, autoDensity: true, roundPixels: true })`.
- Configure texture sampling to nearest-neighbor (`scaleMode: 'nearest'`) to ensure crisp pixel art with zero blurring or texture bleeding.
- Implement structured scene layers using PixiJS `Container`s:
  - `backgroundLayer`: Terrain and ground decorations.
  - `entityLayer`: Characters, enemies, pickups (`sortableChildren = true`, sorted by `zIndex = Math.floor(interpolatedY)`).
  - `effectsLayer`: Combat slashes, particles, magic bolts.
  - `lightingLayer`: Multiplicative day/night ambient overlay with cutout lights.
  - `uiLayer`: Fixed-screen HUD and modal dialogs.

#### 2. Smooth 2D Tracking Camera (`src/rendering/Camera.ts`)
- Track target entity with exponential smoothing / lerp factor: `0.12`.
- World bounds clamping: ensure camera viewport never exposes empty space outside the tile map.
- Coordinate transformations:
  - `worldToScreen(worldPos: Vector2): Vector2`
  - `screenToWorld(screenPos: Vector2): Vector2`
- Directional camera shake: `shake(magnitude: number, durationMs: number)` with exponential decay for combat impacts (critical hit: 2.5px, beetle slam: 6.0px).

#### 3. Chunked Terrain Rendering (`src/rendering/ChunkedTerrainRenderer.ts`)
- Partition the 150x150 tile map into 16x16 tile chunks (512x512 pixels).
- Each chunk renders to its own `Container`.
- Viewport culling: only chunks intersecting the camera bounding box have `chunk.visible = true`. This delivers >85% draw-call reduction on large maps.

#### 4. Dynamic Day/Night Lighting (`src/rendering/LightingSystem.ts`)
- 480-second continuous cycle: Day -> Dusk -> Night -> Dawn.
- Night ambient darkness quad using multiplicative blending (`blendMode = 'multiply'`).
- Local light cutouts: Player torch and activated portals draw radial cutout masks into the ambient quad.

#### 5. Weather Particle Effects (`src/rendering/WeatherRenderer.ts`)
- Procedural particle emitters for:
  - Falling forest leaves (wind velocity, sway sine wave).
  - Rain particles (angled streaks, ground splash rings).
  - Night sky starfield (>500 twinkling points when darkness alpha > 60).

---

### Milestone 4: Gameplay, World Systems, AI & Persistence

Target directory: `src/gameplay/` and `src/persistence/`

#### 1. Deterministic Procedural World Generation (`src/gameplay/world/`)
- Pure TypeScript implementation decoupled from PixiJS.
- Seeded pseudo-random number generator (PRNG) guaranteeing identical worlds for identical seeds.
- Pipeline:
  1. Perlin noise terrain elevation (Grass, Hills, Cliffs).
  2. Drunken-walk river carving connecting opposite map edges.
  3. Automatic wooden bridge placement where pathways cross water.
  4. Cellular automata smoothing for natural tree clusters and hill formations.
  5. Flood-fill reachability validation ensuring player spawn, coins, and exit portal are fully connected.
  6. Dedicated 20x20 Training Glade (tutorial map) with dummy beetle (5 HP), 3 tutorial coins, and exit portal.

#### 2. Player Simulation & Mechanics (`src/gameplay/entities/Player.ts`)
- 8-directional movement with normalized diagonal velocity.
- Sprinting & Stamina: 100 max stamina. Sprint drains 25/s; 4s recovery cooldown after depletion.
- Jump arc: 48px parabolic Z-axis jump allowing player to hop over obstacles and rivers.
- Stats & Regeneration: 7 base HP (max 20), 100 mana. Out-of-combat health regen (+1 HP every 4s after 6s without taking damage). Continuous mana regen (3 mana/s).
- Level progression: 100 base XP scaling 1.5x per level. Stat point distribution on level up (+1 Max HP, +1 Damage, +25 Mana, +20 Stamina).

#### 3. Combat System & Abilities (`src/gameplay/combat/`)
- **Melee 3-Hit Combo**:
  - Attacks within an 800ms combo window progress: Hit 1 -> Hit 2 -> Hit 3 (Finisher).
  - 3rd Hit is a critical finisher: `1.5x damage + 1`, radial knockback, and 2.5px camera shake.
  - Wall Crush SPLAT: Knocking an enemy into solid terrain/cliffs causes bonus collision damage.
- **Skills**:
  - `Q` — AoE Spin Attack: 30 mana, 3.5-tile radius, 2x damage, omnidirectional knockback.
  - `E` — Magic Bolt: 20 mana, fast projectile, travels 12 tiles or until impact.
- **Environmental Cutting**: Melee swings cut flower patches to grass, with a 10% chance to drop coins and 15% chance to drop health potions.

#### 4. Bestiary AI State Machines (`src/gameplay/ai/`)
- **Mantis (Melee Mob)**: 3 + floor(lvl/2) HP, 1 damage. Chases player in detection range (6 tiles). Flees in panic when HP drops to 1 for 4s.
- **Maggot (Ranged Mob)**: 2 + floor(lvl/3) HP. Fires green acid spit projectile (speed 0.15, range 10, 1 damage). Keeps distance from player; flees at 1 HP.
- **Beetle Boss (Elite Mob)**: 15 + (lvl-1)*5 HP. Powerful charge/lunge attack (6px camera shake). 800ms invulnerability frames. Immune to wall-crush. Unstuck anti-jitter nudging.
- **Ghost (Night-Only Elite)**: Spawns only during night cycle. Phases through solid terrain and trees. Oscillating transparency (`alpha = 140 ± 40`). Despawns at dawn.

#### 5. Persistence & Legacy Save Adapter (`src/persistence/`)
- Modern versioned JSON storage in `localStorage`:
  ```json
  {
    "version": 2,
    "seed": 123456,
    "currentLevel": 1,
    "player": { "x": 120, "y": 85, "hp": 7, "mana": 100, "stamina": 100, "xp": 45, "level": 1, "coins": 5 },
    "world": { "tiles": "...", "cutFlowers": [...] },
    "enemies": [...]
  }
  ```
- **Legacy Save Adapter (`LegacySaveAdapter.ts`)**:
  - Must parse original university JSON files (`maps/active_map.json`) and legacy `forest_rpg_*` localStorage keys.
  - Transcode legacy grid arrays and entity structures into modern V2 types without data loss.

---

### Milestone 5: Visual Design, User Interface & Debug Terminal

Target directory: `src/ui/`

#### 1. Sprite Animation State Machine (`src/ui/animations/`)
- Typed states: `Idle`, `Walk`, `Run`, `Jump`, `Attack`, `Hurt`, `Death`.
- 8-directional support with horizontal texture flipping for East/West mirroring.
- Animation timing decoupled from rendering FPS using accumulated simulation ticks.

#### 2. Pixel-Art HUD (`src/ui/hud/HUD.ts`)
- Heart icons for health, blue bar for mana, green bar for stamina.
- Coin counter with spinning gold coin sprite.
- Minimap: 120x120px radar display showing terrain contours, player (green dot), enemies (red dots), and active portal (purple pulsing marker).
- Tutorial banner: contextual instructions for movement, sprint, attacking, and glade objectives.

#### 3. Menu Systems (`src/ui/menus/`)
- Main Menu (New Game, Continue/Load, Settings, Tutorial Glade).
- Pause Menu (`Escape` key trigger, resume, audio sliders, save & quit).
- Settings Menu (Master, Music, SFX volume sliders; FPS limiter: 60/120/Unlimited; Fullscreen toggle).
- Game Over screen (Restart from level checkpoint) & Victory Fanfare screen.

#### 4. In-Game Debug Terminal Console (`src/ui/terminal/DebugTerminal.ts`)
- Toggled with backtick / tilde (`` ` ``) key.
- Commands:
  - `/help`: List all available commands.
  - `/god`: Toggle invulnerability and infinite stamina/mana.
  - `/heal`: Restore full health, mana, and stamina.
  - `/spawn <enemy_type> [count]`: Spawn Mantis, Maggot, Beetle, or Ghost.
  - `/tp <x> <y>`: Instantly teleport player to world coordinates.
  - `/noclip`: Toggle collision passing through solid tiles.
  - `/time <day|dusk|night|dawn>`: Jump day/night cycle to specific phase.
  - `/xp <amount>`: Grant player XP points.
  - `/killall`: Instantly defeat all active enemies in the world.

---

### Milestone 6: System Integration, E2E Automation, Hardening & Docs

Target directory: Root, `tests/e2e/`, `tests/benchmarks/`, and `docs/`

#### 1. System Integration (`src/main.ts` & `src/game/Game.ts`)
- Wire `GameLoop`, `ServiceContainer`, `EventBus`, `InputManager`, `SpatialHashGrid`, `Renderer`, `World`, and `UI` into a cohesive application lifecycle.
- Provide global diagnostics handle `window.__GAME__` for testing and debugging.

#### 2. E2E Test Suite Pass (Playwright)
The test harness is already prepared in `tests/e2e/`. Run and pass all suites:
- `tests/e2e/smoke.spec.ts` (Application boot).
- `tests/e2e/tier1-feature/engine-boot-menu.spec.ts` (Menu navigation).
- `tests/e2e/tier1-feature/simulation-movement-physics.spec.ts` (Player movement, jump, collision).
- `tests/e2e/tier1-feature/combat-abilities-bestiary.spec.ts` (Attacks, combo, enemy AI).
- `tests/e2e/tier1-feature/world-environment-lifecycle.spec.ts` (World gen, day/night cycle).
- `tests/e2e/tier1-feature/persistence-legacy-saves.spec.ts` (Save/load and legacy parsing).
- `tests/e2e/tier2-boundary/*.spec.ts` (Boundary conditions, window resize, tab visibility switching).

#### 3. Performance Benchmarks (`tests/benchmarks/`)
- Verify targets:
  - Stable 60 FPS under normal world load (150x150 tiles, 50+ active mobs).
  - p95 frame time < 16.6ms; p99 frame time < 20.0ms.
  - World generation time < 250ms for 150x150 map.
  - Zero memory leaks over 20 consecutive world regenerations.

#### 4. Documentation Suite
Create the required technical guides in `docs/`:
- `docs/architecture.md`: Engine loop, DI container, event bus, layer separation.
- `docs/rendering.md`: PixiJS 8 setup, chunked tile rendering, lighting, camera.
- `docs/world-generation.md`: Noise algorithms, river carving, connectivity guarantee.
- `docs/gameplay-systems.md`: Combat formulas, combo timings, bestiary AI behaviors.
- `docs/persistence-and-legacy-saves.md`: JSON schema v2, legacy migration rules.
- `docs/performance-benchmarks.md`: Measured startup, frame times, memory usage.
- `docs/legacy-parity-audit.md`: Feature comparison between JavaScript V1 and TypeScript V2.

---

## 5. Verification Checklist for Each Milestone

Before committing or handoff of any milestone, execute and verify:

```bash
# 1. Typecheck
npm run typecheck

# 2. Linting
npm run lint

# 3. Unit and Integration Tests
npm test

# 4. Production Build
npm run build

# 5. Playwright E2E Tests (when applicable)
npx playwright test

# 6. Legacy Repository Isolation Verification
git -C "/home/k9-vortex/Development/1-JavaScript/3-Game Development" status
# MUST output: "nothing to commit, working tree clean"
```

---

## 6. Key File Index

| File / Directory | Purpose |
|---|---|
| `.agents/teamwork/PROJECT.md` | Master technical specification & feature inventory (192 lines) |
| `.agents/teamwork/TEST_INFRA.md` | Testing strategy, tiers, and verification contracts |
| `.agents/teamwork/survey_spec_miner_1/legacy_game_spec.md` | Reverse-engineered legacy game mechanics & balance formulas |
| `src/core/loop/GameLoop.ts` | Authoritative 60Hz fixed accumulator loop |
| `src/core/events/EventBus.ts` | Strongly-typed event bus |
| `src/core/di/ServiceContainer.ts` | Dependency injection container |
| `src/core/input/InputManager.ts` | Keyboard and action binding manager |
| `src/core/spatial/SpatialHashGrid.ts` | 2D spatial hash grid for collision queries |
| `src/audio/SoundSynthesizer.ts` | Zero-dependency procedural Web Audio sound synthesizer |
| `src/audio/MusicPlayer.ts` | Dual-channel streaming background music player |
| `tests/e2e/helpers/game-driver.ts` | High-level Playwright test driver and diagnostics gateway |
| `public/assets/manifests/asset_manifest.json` | PixiJS 8 asset bundling manifest |

Use this guide as the authoritative technical roadmap to complete **Forest RPG V2**.