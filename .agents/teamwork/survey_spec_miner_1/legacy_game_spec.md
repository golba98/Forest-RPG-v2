# Forest RPG Legacy Game Specification & Feature Inventory

Authoritative specification mined from `/home/k9-vortex/Development/1-JavaScript/3-Game Development` on 2026-10-27.
This document serves as the ground-truth specification for developing **Forest RPG V2** in TypeScript with PixiJS 8.

---

## 1. Executive Summary & Inventory Tables

### Features Discovered

| # | Category | Feature | Description | Inputs | Outputs | Error Behavior | Discovered Via |
|---|----------|---------|-------------|--------|---------|----------------|----------------|
| 1 | Architecture | Dual Render Backend | Hybrid rendering supporting WebGL via PixiJS 7.4.3 or Canvas2D via p5.js | `renderBackend` URL param or localStorage key (`'pixi'` or `'p5'`) | Initialized Pixi canvas or p5 Canvas2D | Fallback to Canvas2D on WebGL context failure | `game-globals.js`, `pixi-app.js` |
| 2 | Architecture | Paced Simulation Loop | Clamped delta time with fixed simulation accumulator to prevent spiral-of-death | Frame timestamps (`performance.now()`) | Clamped delta ms (`gameDelta`), step iterations | Clamps dt to max 50ms, max 5 fixed steps per frame | `game-loop.js` |
| 3 | Architecture | Camera System | Smooth 2D tracking with lerp, bounds clamping, and directional impulse shake | Target coordinates (`playerPosition`), shake impulses | Viewport camera offset (`smoothCamX`, `smoothCamY`), shake offset | Clamps to world bounds; settles impulses over duration | `camera-shake.js`, `game-core.js` |
| 4 | Architecture | Coordinate Grid | Fixed tile grid system with 32x32px cell dimensions across a 150x150 tile world | Logical tile coordinates (x, y) | Screen pixel coordinates (x * 32, y * 32) | Out-of-bounds coordinates clamped to [0, logicalW-1] | `game-globals.js` |
| 5 | Player | 8-Directional Movement | Tile-based player movement with smooth visual interpolation and input buffering | Key inputs (WASD / Arrow keys), invertYAxis setting | Position updates (`playerPosition`), interpolated render coords (`renderX`, `renderY`) | Impassable tiles block movement; buffered input queued | `game-movement.js`, `input-state.js` |
| 6 | Player | Sprint Mechanic | Consumes stamina over time to increase move duration and animation speed | Shift key held down | `sprintActive`, `sprintRemainingMs` reduction | Exhaustion locks sprint for 4000ms cooldown | `game-movement.js` |
| 7 | Player | Dash Ability | Fast 1-tile dash triggered by Shift + movement key | Shift + direction press | `isDashing = true`, 50ms move duration | 1000ms cooldown (`dashCooldown`) | `game-movement.js` |
| 8 | Player | Jump Physics | 5-frame parabolic arc allowing passage over hills and decorative obstacles | Space key press | `isJumping = true`, y-offset parabola (48px peak) | Blocks input until jump completes (500ms) | `game-movement.js`, `game-input.js` |
| 9 | Player | Health & Regeneration | 7 base HP; passive regeneration after 6s of taking no damage (1 HP every 4s) | Damage events, elapsed delta time | `playerHealth`, `playerHealthRegenAccumulator` | Clamped to [0, maxHealth] (max upgraded cap 20) | `game-core.js`, `game-combat.js` |
| 10 | Player | Mana & Regeneration | 100 base mana; continuous regeneration of 0.05 per frame (~3.0/sec at 60fps) | Skill execution, elapsed delta time | `playerMana` | Clamped to [0, maxMana] | `game-core.js`, `game-input.js` |
| 11 | Combat | Melee Combo Attack | 3-hit attack chain with directional hitboxes; 3rd hit deals critical 1.5x damage + 1 | Left-click or Key E (Cut keybind) | Hurt state, enemy HP deduction, knockback, screen shake | Attack fails if insufficient stamina (12 stamina cost) | `game-movement.js`, `game-input.js` |
| 12 | Combat | Environmental Cut | Melee attack sweeps through front tile; cuts flower tiles into grass with loot roll | Melee attack in front of flower tile | Flower becomes grass, 10% coin drop, 15% health drop | No effect on solid tiles or empty grass | `game-movement.js` |
| 13 | Combat | Skill: Spin Attack | AoE whirlwind attack in a 3.5-tile radius around player; deals 2x base damage | Key Q press | 30 Mana consumed, radial knockback, camera shake | Fails with floating "Need Mana!" if mana < 30 | `game-input.js` |
| 14 | Combat | Skill: Magic Projectile | Linear ranged projectile in facing direction; deals 1x base damage on contact | Key E press | 20 Mana consumed, projectile spawn (60 frames life) | Fails with floating "Need Mana!" if mana < 20 | `game-input.js` |
| 15 | Combat | Damage & Armor Calc | Centralized player damage resolution applying armor defense, i-frames, and shake | Damage amount, direction, attacker position | `playerHealth` reduced, hurt timer set, shake kick | Invulnerability window (playerHurtTimer > 0) negates damage | `game-combat.js` |
| 16 | Combat | Crush Execution | Knocking an enemy into solid terrain/cliffs instakills them | Melee or knockback into solid tile | Enemy HP set to 0, splat VFX, "SPLAT" damage text | Beetle boss and Ghost resist knockback/crush | `game-movement.js`, `game-enemies.js` |
| 17 | Progression | RPG Leveling & Stats | Defeating enemies awards XP; level-up provides stat points for character customization | Enemy death XP rewards | `playerLevel++`, `statPoints++`, `xpToNextLevel` * 1.5 | Clamped stat upgrades (max health capped at 20) | `game-movement.js`, `game-ui.js` |
| 18 | Inventory | Item & Potion Usage | Consumable inventory slots (Slot 1: Health Potion +2 HP; Slot 2: Speed Potion 8s) | Number keys '1' and '2' | Inventory count decrement, player buff / health gain | Keypress ignored if inventory count is 0 or HP full | `game-input.js` |
| 19 | Enemies | Mantis (Melee) | Melee chaser; panics and flees when reduced to 1 HP | Player proximity (8 tiles aggro) | 1 Damage, 0.8 knockback, 600ms i-frames | Flees opposite player for 4000ms upon reaching 1 HP | `game-enemies.js` |
| 20 | Enemies | Maggot (Ranged) | Ranged spitter firing acid blobs; panics and flees when reduced to 1 HP | Player proximity (10 notice, 6 attack) | Acid blob projectile (0.15 speed, 10 tile range, 1 dmg) | Flees away from player for 4000ms upon reaching 1 HP | `game-enemies.js` |
| 21 | Enemies | Beetle (Boss) | Heavy elite boss; lunges forward during attacks, teleports if stuck > 40 tiles | Always aggressive; hunts player | 1 + floor(level/3) damage, 1.5 knockback, 800ms i-frames | Resists knockback and crush; auto-unstuck nudge/teleport | `game-enemies.js` |
| 22 | Enemies | Ghost (Night Elite) | Nocturnal apparition that phases through trees/props and emits blue point-light | Night phase of weather cycle | 1 Damage, 0.6 knockback, blue glow light | Despawns at dawn; does not block victory condition | `game-enemies.js`, `game-weather.js` |
| 23 | World Gen | Noise Forest & Scatter | Generates terrain using Perlin noise (scale 0.12) or randomized scatter | Procedural seed / Math.random | `mapStates` Uint8Array with GRASS and FOREST tiles | Protected spawn clear zone is guaranteed grass | `game-map.js` |
| 24 | World Gen | River & Bridge System | Meandering river carved by drunken walk; automatic bridge placement restores connectivity | Map dimensions, clear zone bounds | RIVER tiles, RAMP bridge tiles, LOG clearings | Flood-fill verification repairs isolated landmasses | `game-map.js` |
| 25 | World Gen | Cellular Automata Hills | Cliff and hill formation using noise + 5 CA smoothing iterations + pruning | Map dimensions, noise seed | 8 directional HILL tiles (`HILL_NORTH`..`NORTHWEST`) | Pruning removes isolated hill tips and thin bars | `game-map.js` |
| 26 | World Gen | Reachability Pruning | BFS flood fill from spawn; converts all unreachable walkable tiles to FOREST | Spawn position, mapStates | Pruned mapStates | Ensures 100% navigable world geometry | `game-map.js` |
| 27 | Weather | Day/Night Cycle | 480-second continuous temporal cycle with Dawn, Day, Sunset, Dusk, Night phases | Elapsed delta time | `WeatherSystem.currentColor`, darkness overlay | Star field (500 stars) renders when darkness > 60 | `game-weather.js` |
| 28 | Weather | Dynamic Lighting | Screen-space light sources (torch, ghost glow, fireflies) punched into darkness overlay | Light descriptors (x, y, radius, color, intensity) | Radial gradients with composite erase | Torch radius contracts from 520px (day) to 230px (night) | `game-weather.js`, `renderer.js` |
| 29 | Tutorial | Training Glade Sequence | 20x20 glade teaching Movement, Sprint, Combat (dummy), Coins, and Portal | Player position and actions | Step advancement (0 to 4), HUD instructions | Cannot leave glade until tutorial complete | `game-tutorial.js` |
| 30 | Progression | Victory & Portal Entry | Clearing all coins and non-ghost enemies activates exit portal to advance world | Coin collection, enemy defeat, portal entry | `currentLevel++`, new procedural map generation | Portal entry ignored if portal is inactive | `game-core.js`, `game-ui.js` |
| 31 | Progression | Game Over & Respawn | Zero health triggers death overlay; restart respawns player and initial mobs | `playerHealth <= 0` | Death screen, score display, state reset | Restart preserves world seed and respawns initial mob set | `game-core.js`, `game-ui.js` |
| 32 | Persistence | Versioned Save & Adapter | LocalStorage and JSON serialization storing world grid, props, player, and enemies | Save trigger (autosave, manual, server sync) | JSON payload in localStorage (`autosave_map`) | Strict schema validator rejects corrupt or oversized saves | `game-io.js`, `map_server.js` |
| 33 | UI / HUD | Responsive HUD & Compass | Player vitals, gold, inventory, minimap, day/night clock, and objective compass | Player stats, active coins, enemies, portal | Rendered HUD overlays with responsive scaling | Compass clamps to safe bounds without flipping | `game-hud.js` |
| 34 | Terminal | In-game Debug Console | Quake-style cheat console opened with F2 or Backquote for testing/debugging | Command string input | Command execution, formatted console output | Invalid commands output syntax error hint | `game-terminal.js` |

---

### Edge Cases Observed

| # | Feature | Input | Observed Behavior |
|---|---------|-------|-------------------|
| 1 | Simulation Loop | Browser tab inactive / GC pause (dt > 50ms) | `GameLoop.clampDelta()` clamps dt to 50ms (20fps floor), avoiding entity teleportation or physics breakdown. |
| 2 | Simulation Loop | Accumulator backlog > 5 fixed steps (spiral of death) | Backlog dropped immediately: `this._accumulator = 0`. Drops frames instead of compounding delay. |
| 3 | Combat | Melee attack against Beetle Boss | Beetle boss resists knockback (`resisted: true`) and is immune to solid-tile crush execution. |
| 4 | Combat | Player damaged while invulnerable (`playerHurtTimer > 0`) | `GameCombat.applyPlayerDamage()` returns `{ applied: false, damage: 0 }`. |
| 5 | Combat | Player attack with insufficient stamina | `startPlayerAttack()` aborts silently with verbose log, consuming no stamina and triggering no animation. |
| 6 | Movement | Key pressed and released between frames at low FPS | `InputState` latches key events via window capture listeners so quick taps are never dropped. |
| 7 | Movement | Diagonal step input | Step duration scaled by 1.22x factor (`DIAGONAL_MOVE_TIME_FACTOR`) to maintain uniform perceived speed. |
| 8 | Movement | Water navigation (River tiles) | Player speed slowed by 1.5x multiplier; player sprite visually clipped to top 75%; water ripples spawn every 300ms. |
| 9 | Enemies | Night ghosts present at dawn transition | Ghosts instantly vanish (`health = 0`) with floating damage text "vanished". |
| 10 | Enemies | Ghost enemies alive during victory check | `hasRemainingVictoryEnemies()` explicitly filters out ghosts (`enemy.type !== 'ghost'`). Ghosts do NOT block level victory. |
| 11 | World Gen | River isolates a landmass from spawn point | `carveRiversMaybeThrough` runs up to 5-6 BFS passes and lays RAMP bridge tiles across river bottlenecks to restore pathing. |
| 12 | World Gen | Decorative props placed over portal or blocking path | `pruneUnreachable` and `generateMap_Part2` flood fill verify reachability; any obstacle props blocking objectives are purged. |
| 13 | World Gen | Exception thrown during world generation | `generateMap()` retries once with a fresh seed; if it fails again, triggers `failGameLoading()` with Retry overlay. |
| 14 | Persistence | Save file loaded with wrong `persistentGameId` | `loadMapFromStorage()` rejects save and generates a fresh world to prevent cross-session state corruption. |
| 15 | Persistence | LocalStorage disabled / private browsing quota exceeded | `localStorageAvailable` set to `false`; saves fall back gracefully to in-memory runtime without throwing unhandled errors. |
| 16 | HUD Compass | Objective is directly coincident with player position | Distance = 0; marker is hidden to prevent zero-division NaN or flickering. |
| 17 | Audio | Browser blocks audio autoplay before user interaction | `userStartAudio()` and window click listener unlock AudioContext seamlessly upon first interaction. |

---

## 2. Game Architecture & Simulation Loop

### 2.1 Engine Technology & Dependencies
- **Original Engine:** Custom JavaScript with global namespace (`window.*`), utilizing p5.js (v1.6.0) for canvas/math/audio and PixiJS (v7.4.3) for WebGL batch rendering.
- **Dependency Flow:** Ordered `<script>` tags in `game.html` serve as the dependency graph. No module bundler was used in legacy.
- **Render Modes:**
  - `pixi`: WebGL canvas (`#pixi-canvas`) renders chunked terrain and batched entities; p5 canvas sits directly on top as a transparent 2D overlay for HUD, weather, and input.
  - `p5`: Pure HTML5 Canvas2D fallback rendering everything on a single p5 canvas.
  - Render mode toggled via `localStorage.getItem('renderBackend')` or URL parameter `?renderBackend=p5`.

### 2.2 Game Loop & Fixed Timestep Architecture
The legacy engine separates frame pacing from rendering:
1. **Delta Clamping:**
   - Nominal frame time: `FRAME_TIME_MS = 16.67ms` (60 Hz).
   - Maximum allowed frame delta: `MAX_FRAME_MS = 50ms`.
   - Clamped delta stored in global `gameDelta = GameLoop.clampDelta(deltaTime)`.
2. **Fixed-Step Accumulator:**
   - Timestep: `FIXED_STEP_MS = 16.667ms`.
   - Max catch-up steps: `MAX_FIXED_STEPS = 5`.
   - Spiral-of-death guard: if accumulator exceeds `5 * FIXED_STEP_MS`, accumulator is zeroed.
3. **Frame Rate Targets:**
   - Supported options: `60` (default), `120`, `144`, `165`, `240`, `unlimited` (targetFps = 0).
   - Under Pixi unlimited mode, Pixi ticker maxFPS is set to 0 and loop period is decoupled from requestAnimationFrame.

### 2.3 World & Camera Coordinate System
- **Tile Dimensions:** 32x32 pixels (`cellSize = 32`).
- **Map Dimensions:** Fixed 150 tiles wide by 150 tiles high (`logicalW = 150`, `logicalH = 150`). Total world area = 4800 x 4800 pixels.
- **Camera Tracking:**
  - Follow smoothing weight: `CAMERA_FOLLOW_SMOOTHING = 0.12` (exponential lerp toward player center).
  - Target: `camX = playerRenderX * cellSize - screenWidth / (2 * gameScale)`.
  - World coordinate bounds clamping: camera position clamped so viewport does not extend beyond world boundaries.
- **Viewport Culling (`isInView`):**
  - All entities, trees, and props test bounding boxes against padded viewport `[viewLeft, viewTop, viewRight, viewBottom]`. Entities outside are skipped during render.

---

## 3. Entities & Character Systems

### 3.1 Player Character

#### Base Attributes & Upgrades
| Attribute | Base Value | Upgrade Step | Hard Cap | Notes |
|-----------|------------|--------------|----------|-------|
| Health (`playerHealth`) | 7 HP | +1 per stat point | 20 HP | Regenerates out of combat |
| Max Health (`maxHealth`) | 7 HP | +1 per stat point | 20 HP | Displays warning toast when maxed |
| Mana (`playerMana`) | 100 | +25 per stat point | Uncapped | Regens 0.05/frame (~3.0/s) |
| Max Mana (`maxMana`) | 100 | +25 per stat point | Uncapped | |
| Stamina (`playerMaxStamina`) | 100 | +20 per stat point | Uncapped | Determines sprint duration pool |
| Base Damage (`playerBaseDamage`)| 1 | +1 per stat point | Uncapped | Added to weapon damage |

#### Movement & Timing Parameters
- **Normal Walk Duration:** `BASE_MOVE_DURATION_MS = 100ms` (cooldown `160ms`).
- **Sprint Duration:** `SPRINT_MOVE_DURATION_MS = 75ms` (cooldown `150ms`).
- **Dash Duration:** 50ms per tile (`DASH_DURATION = 200ms`, cooldown `1000ms`).
- **Diagonal Movement:** Step duration scaled by `1.22x` (`DIAGONAL_MOVE_TIME_FACTOR`).
- **River Slowdown:** Speed multiplier `1.5x` (`RIVER_SPEED_MULTIPLIER`) on water tiles.
- **Sensitivity Scaling:** Slider (1–10, center 5) modifies speed by `±6%` per unit (`SENSITIVITY_SCALE = 0.06`).
- **Input Buffer Threshold:** `MOVE_BUFFER_PROGRESS = 0.45` (accepts next directional command at 45% completion of current step).

#### Player Actions & Animations
- **Directions:** 8 cardinal and diagonal directions (`N`, `NE`, `E`, `SE`, `S`, `SW`, `W`, `NW`).
- **Idle Animation:** 4 columns per sheet (`IDLE_SHEET_COLS = 4`), animation speed 150ms.
- **Walk Animation:** 4 columns per sheet (`WALK_SHEET_COLS = 4`), speed dynamically scales with move duration.
- **Run Animation:** 6 columns per sheet (`RUN_SHEET_COLS = 6`).
- **Jump Animation:** 5 columns per sheet (`JUMP_FRAME_COUNT = 5`, 100ms/frame, total 500ms). Parabolic arc: `sin(progress * PI) * cellSize * 1.5`.
- **Attack Animation:** 4 columns per sheet (`ATTACK_MAX_FRAMES = 4`, 80ms/frame). Damage registered on frames 1 and 2.

### 3.2 Enemy Bestiary & AI Behaviors

```
+----------------------------------------------------------------------------------------------------+
|                                    ENEMY SPECIFICATION MATRIX                                      |
+---------+----------+--------+--------+--------+--------+--------+----------------------------------+
| Type    | Category | HP     | Damage | Speed  | Range  | XP     | Special Mechanics                |
+---------+----------+--------+--------+--------+--------+--------+----------------------------------+
| Mantis  | Melee    | 3 +    | 1      | 400ms/ | 1.5    | 30 +   | Panics & flees at 1 HP (4s);     |
|         |          | lvl/2  |        | step   | tiles  | 2*lvl  | crushable against solid tiles    |
+---------+----------+--------+--------+--------+--------+--------+----------------------------------+
| Maggot  | Ranged   | 2 +    | 1      | 600ms/ | 6.0    | 20 +   | Fires Acid Blob projectile;      |
|         |          | lvl/3  |        | step   | tiles  | 2*lvl  | panics & flees at 1 HP (4s)      |
+---------+----------+--------+--------+--------+--------+--------+----------------------------------+
| Beetle  | Boss     | 15 +   | 1 +    | 0.04   | 1.4    | 500    | Lunge attack (4 frames); unstuck |
|         |          | 5*(L-1)| lvl/3  | close  | tiles  |        | teleport; immune to knock/crush  |
+---------+----------+--------+--------+--------+--------+--------+----------------------------------+
| Ghost   | Night    | 4 +    | 1      | 350ms/ | 1.3    | 40 +   | Nocturnal (despawns dawn); phases|
|         | Elite    | lvl/2  |        | step   | tiles  | 3*lvl  | through trees; emits blue light  |
+---------+----------+--------+--------+--------+--------+--------+----------------------------------+
```

#### Detailed Enemy Behaviors:
1. **Mantis:**
   - Aggro range: 8 tiles.
   - Attack animation: 7 frames (100ms/frame), damage checked on frame 4. Melee hit radius: 1.5 tiles.
   - Knockback dealt to player: 0.8 tiles. Invulnerability: 600ms.
   - Panic State: Triggers when HP drops to 1. Flees in exact opposite vector from player for 4000ms.
   - Idle Wander: 2% probability per frame, pause 1000–3000ms between wander steps.
   - Death Splat: 'acid' sprite.
2. **Maggot:**
   - Notice range: 10 tiles; attack range: 6 tiles.
   - Attack animation: 7 frames (120ms/frame), projectile spawns on frame 4.
   - Projectile (Acid Blob): Speed 0.15 tiles/frame, max travel distance 10 tiles, hit radius 0.6 tiles, damage 1, knockback 0.5 tiles.
   - Panic State: Flees via BFS pathfinding away from player for 4000ms when at 1 HP.
   - Idle Wander: 1% probability per frame, pause 1500–4500ms.
   - Death Splat: 'egg' sprite.
3. **Beetle (Boss):**
   - Always aggressive; hunts player across entire world from spawn.
   - Movement: Direct path within 8 tiles; BFS pathfinding (up to 40 nodes) beyond 8 tiles; wall-sliding fallback.
   - Speeds: Close speed 0.04 tiles/frame (< 6 tiles away); Far speed 0.03 tiles/frame.
   - Lunge Attack: During opening 4 frames of attack animation, surges forward at 0.03 tiles/frame.
   - Attack timing: 6 frames (100ms/frame), damage frame 4, cooldown 1200ms. Hit range: 1.8 tiles.
   - Knockback dealt to player: 1.5 tiles (fallback 0.5 tiles), screen shake magnitude 6, duration 150ms, i-frames 800ms.
   - Anti-Stuck Teleport: If distance to player > 40 tiles for > 5000ms, teleports to random non-solid position within radius 15 of player. If stuck locally (< 0.01 dist change for > 3000ms), nudges 2 tiles.
   - Crush & Knockback Immunity: Large size prevents crush instakill and resists player knockback.
4. **Ghost:**
   - Spawns exclusively during Night phase (`WeatherSystem.cycle < 0.20` or `>= 0.90`).
   - Spawn counts: Easy: 2, Normal: 4, Hard: 8.
   - Aggro range: 10 tiles, attack range: 1.3 tiles, cooldown 1800ms.
   - Phasing Movement: Ignores obstacles, cliffs, and trees (only blocked by RIVER and map boundaries).
   - Visual: Oscillating alpha `140 ± 40` (clamped [40, 220]) with 2000ms sine cycle.
   - Point Light: Emits radial light at screen position with radius 50px, intensity 0.12, color `[100, 180, 255]`.
   - Dawn Despawn: Instantly destroyed when day breaks; does not count against level victory.

---

## 4. Combat Formulas & Progression Mechanics

### 4.1 Damage & Melee Hit Calculation
```
Player Melee Attack:
  Damage = playerBaseDamage + (equipment.weapon ? equipment.weapon.damage : 0)
  If comboCount == 2 (3rd consecutive hit within 800ms):
    Critical Damage = floor(Damage * 1.5) + 1
    Screen Shake Kick = 2.5 magnitude, 110ms duration
  Else:
    Screen Shake Kick = 1.5 magnitude, 110ms duration

Hit Registration:
  Regular Enemies: Auto-hit radius = 0.7 tiles, Attack range = 1.8 tiles, Angle tolerance = 1.2 rad
  Beetle Boss:     Auto-hit radius = 2.0 tiles, Attack range = 3.0 tiles, Angle tolerance = 2.5 rad
  Target hit if dist < autoHitRadius OR (dist < attackRange AND angleMatchesDirection)

Knockback & Crush:
  Enemy knocked back 0.6 tiles in attack vector.
  If enemy lands on solid tile (cliff/obstacle):
    If enemy is NOT Beetle or Ghost:
      enemy.health = 0
      Spawn damage text: "SPLAT"
      Trigger death splat VFX
```

### 4.2 Player Damage & Defense Formula
```
Incoming Attack to Player:
  If playerHurtTimer > 0: Reject damage (invulnerable)
  Raw Damage = attacker.damage
  If equipment.armor:
    Net Damage = max(1, Raw Damage - equipment.armor.defense)
  Else:
    Net Damage = max(0, Raw Damage)

  playerHealth = max(0, playerHealth - Net Damage)
  playerHurtTimer = attack.invulnerabilityMs (Standard: 600ms, Boss: 800ms)
  CameraShake.kick(dx, dy, magnitude, duration)
```

### 4.3 Skills & Magic System
- **AoE Spin Attack (Key Q):**
  - Mana cost: 30 mana (`playerMana >= 30`).
  - Range: Radial radius `d <= 3.5` tiles from player.
  - Damage: `playerBaseDamage * 2`.
  - Enemy hurt timer: 300ms; Radial knockback: 1.5 tiles (crush disabled).
  - Feedback: Camera shake (magnitude 2.5, duration 140ms); text: `"SPIN HIT: N!"` or `"SWOOSH"`.
- **Ranged Projectile (Key E):**
  - Mana cost: 20 mana (`playerMana >= 20`).
  - Speed: 0.25 tiles per frame. Lifetime: 60 frames.
  - Collision: Wall/edge destroys projectile; Enemy collision (`d <= 0.8` tiles) deals `playerBaseDamage` and 200ms hurt timer.

### 4.4 XP & Level-Up Progression
- **XP Threshold Formula:**
  - Level 1: `xpToNextLevel = 100`.
  - Level-Up Condition: `playerXP >= xpToNextLevel`.
  - Multiplier on Level-Up: `xpToNextLevel = Math.floor(xpToNextLevel * 1.5)`.
  - Overflow Handling: `playerXP -= xpToNextLevel; playerLevel++; statPoints++;`.
- **XP Rewards from Enemies:**
  - Mantis: `30 + (playerLevel * 2)`.
  - Maggot: `20 + (playerLevel * 2)`.
  - Beetle Boss: `500` flat XP.
  - Ghost: `40 + (playerLevel * 3)`.

### 4.5 Loot & Drop Tables
- **Enemy Defeat Drops:**
  - Drop Probability: `LOOT_DROP_CHANCE = 0.40` (40% chance upon defeat).
  - Drop Selection: `60% Health Potion` (`TILE_TYPES.HEALTH`), `40% Speed Potion` (`TILE_TYPES.POWERUP`).
  - Drop Placement: Nearest grass/flower tile within radius 2 (`placePotionDropNear`).
- **Environmental Cutting Drops (Cutting Flowers):**
  - Coin Drop Chance: `10%` (`TILE_TYPES.COIN`).
  - Health Potion Chance: `15%` (`TILE_TYPES.HEALTH`).

---

## 5. World Generation & Map Systems

### 5.1 Procedural Pipeline Sequence
1. **Part 1 (Base Terrain):**
   - 50% chance: Perlin noise terrain (`noiseScale = 0.12`). Center clear zone protected. Outer radius > 0.80 becomes FOREST, inner becomes GRASS.
   - 50% chance: Random scatter terrain (`SCATTER_FOREST_PROB = 0.18`), protecting center clear zone.
2. **Part 2 (Rivers & Carving):**
   - Main River: Edge-to-edge drunken walk spanning 150 steps with variable radius `0.8 + noise * 1.0` tiles.
   - Branches: 2–3 secondary rivers branching off main river.
   - Player Clear River: Secondary branch carved through player clear zone. Safe radius around spawn converted to `TILE_TYPES.LOG` (walkable wooden logs).
   - Diagonal Smoothing & Tip Rounding: Removes checkerboard gaps and single-pixel river tips.
   - Bridge Placement: Flood-fill detects cut-off landmasses and places `TILE_TYPES.RAMP` bridges across rivers (up to 5 iterations).
3. **Part 3 (Cellular Automata Hills):**
   - Noise generation (`scale = 0.035, threshold = 0.48`).
   - 5 smoothing iterations: birth if neighbors >= 5, survive if neighbors >= 4.
   - 8 pruning passes: removes isolated tips (< 2 neighbors) and 1-tile thin bars.
   - Directional Hill Autotiling: Maps cardinal neighbors to 8 directional cliff tiles.
4. **Part 4 (Unreachable Pruning):**
   - BFS flood fill from spawn (75, 75); all non-solid tiles disconnected from spawn converted to FOREST.
5. **Part 5 (Portal & Objective Spawning):**
   - Portal: Outward spiral search from map center (75, 75) for nearest grass tile > 3 tiles from spawn.
   - Decorative Props: Flowers, bushes, logs, rocks placed across grass tiles. If blocking props isolate portal or coins, they are removed.
   - Enemies: Easy: 6, Normal: 12, Hard: 24. Even split between Mantis and Maggot, plus 1 guaranteed Beetle Boss.
   - Coins: 20 collectible coins scattered across reachable grass tiles.

### 5.2 Tile Type ID Registry
```javascript
const TILE_TYPES = Object.freeze({
  GRASS: 1,             // Walkable ground
  FOREST: 2,            // Solid tree obstacle
  MOB: 3,               // Enemy collision marker

  CHEST: 100,           // Interactable chest
  HEALTH: 101,          // Health potion pickup (+1 potion)
  POWERUP: 102,         // Speed boost pickup (+1 speed)
  COIN: 103,            // Gold coin pickup (+10 gold)

  CLIFF: 6,             // Generic hill/cliff (solid)
  RAMP: 7,              // Bridge / ramp over river (walkable)
  LOG: 8,               // Fallen log / river crossing (walkable)
  FLOWERS: 9,           // Cuttable flower patch (walkable)
  CAVE: 10,             // Cave entrance (solid)
  RIVER: 11,            // Water hazard (slows player, impassable to mobs)
  BORDER: 12,           // Map border barrier (solid)

  // Directional Hill / Cliff Boundaries (Solid):
  HILL_NORTH: 13,
  HILL_NORTHEAST: 14,
  HILL_EAST: 15,
  HILL_SOUTHEAST: 16,
  HILL_SOUTH: 17,
  HILL_SOUTHWEST: 18,
  HILL_WEST: 19,
  HILL_NORTHWEST: 20,
});
```

---

## 6. Progression, Tutorial & Lifecycle

### 6.1 Tutorial Sequence (Training Glade)
- **Map:** Dedicated 20x20 glade (`TUTORIAL_MAP_W = 20, TUTORIAL_MAP_H = 20`), surrounded by forest with internal dividing walls.
- **Lighting:** Locked to daylight only; weather cycle disabled.
- **Entities:**
  - Player spawn: tile (3, 15).
  - Training Dummy: Passive Beetle (`aggro = false`, HP = 5) at tile (5, 5).
  - Collectible Coins: 3 coins at (15, 5), (16, 4), (14, 6).
  - Exit Portal: Inactive portal at tile (17, 3).
- **Phased Steps:**
  - Step 0 (`MOVE`): WASD prompt; player moves north through wall gap at tile (5, 10).
  - Step 1 (`SPRINT`): Shift prompt; advances upon sprint detection or 6000ms timeout.
  - Step 2 (`COMBAT`): Left-click / E prompt; player attacks and defeats the 5 HP dummy beetle.
  - Step 3 (`COINS`): Collect coins prompt; player collects all 3 coins. Portal activates!
  - Step 4 (`PORTAL`): Enter portal prompt; player steps onto portal (17, 3).
- **Completion:** Exiting portal sets `localStorage.setItem("tutorialComplete", "true")`, sets `isTutorialMap = false`, and loads procedurally generated Level 1.

### 6.2 Victory & Loss Conditions
- **Level Victory:**
  - Condition: `!isTutorialMap && !hasRemainingVictoryEnemies() && !hasAnyCoins() && !victoryShown`.
  - Non-ghost enemies must all be defeated (`hasRemainingVictoryEnemies()` checks `type !== 'ghost'`).
  - All 20 coins must be collected.
  - Trigger: Activates portal (`isPortalActive = true`), locks movement, displays Victory screen with final score.
  - Portal Transition: Walking onto portal (`dist < 0.8`) triggers `currentLevel++`, toasts `"World Cleared!"`, and generates the next level.
- **Defeat (Game Over):**
  - Condition: `playerHealth <= 0`.
  - Trigger: Shows Game Over modal with score, "Restart", and "Exit to Menu".
  - Restart Action: Restores `playerHealth = maxHealth`, repositions player to `initialSpawnPosition`, respawns initial enemy positions from `initialEnemies`, clears projectiles.

---

## 7. Persistence & Legacy Save Schema

### 7.1 LocalStorage Key Inventory
| Key | Type | Description | Sample Value |
|-----|------|-------------|--------------|
| `persistentGameId` | string | Session / world identifier | `"game_1765159366471_abc123def"` |
| `tutorialComplete` | string | Flag indicating training was passed | `"true"` or `"false"` |
| `hasShownWelcomeTutorial` | string | Flag for welcome dialog | `"true"` or `"false"` |
| `renderBackend` | string | Active rendering technology | `"pixi"` or `"p5"` |
| `game.settings` | JSON string | Serialized user settings | See settings schema below |
| `menuSettings` | JSON string | Legacy settings fallback key | Same schema as `game.settings` |
| `playerKeybinds` | JSON string | Keycode mapping | `{"moveUp":87,"moveDown":83,...}` |
| `autosave_map` | JSON string | Full serialized map payload | See map payload schema below |
| `saved_map_<timestamp>` | JSON string | Named manual save slot | See map payload schema below |

### 7.2 Map Save Payload Schema (active_map.json)

There are two valid variants of map payloads encountered in the legacy game:
1. **Full Procedural Save Payload (Runtime Generated / Autosave):** 150x150 grid (22,500 tiles), containing enemies, playerPosition, portal, props, and terrain layers.
2. **Server Default Initial Payload (`defaultActiveMapPayload` in `map_server.js`):** 8x8 grid (64 tiles of all 1s), empty treeObjects/enemies, used as a minimal bootstrap when no map file exists.

#### Full Procedural Save Schema (Sample):
```json
{
  "persistentGameId": "server_default_1765159366471",
  "timestamp": 1788878021375,
  "logicalW": 150,
  "logicalH": 150,
  "cellSize": 32,
  "mapStates": [ 1, 1, 2, ... ],
  "terrainLayer": [ 1, 1, 1, ... ],
  "treeObjects": [
    { "x": 42, "y": 88 }
  ],
  "decorativeObjects": [
    { "id": "bush_small_1", "type": "walkable", "tileX": 12, "tileY": 14 }
  ],
  "playerPosition": {
    "x": 75,
    "y": 75
  },
  "portalPos": {
    "x": 75,
    "y": 75
  },
  "isPortalActive": false,
  "enemies": [
    {
      "type": "mantis",
      "x": 118,
      "y": 60,
      "health": 3,
      "maxHealth": 3,
      "direction": "S",
      "moveTimer": 0
    },
    {
      "type": "maggot",
      "x": 83,
      "y": 89,
      "health": 2,
      "maxHealth": 2,
      "direction": "S",
      "moveTimer": 0
    },
    {
      "type": "beetle",
      "x": 87,
      "y": 88,
      "health": 15,
      "maxHealth": 15,
      "direction": "S"
    }
  ]
}
```

### 7.3 Settings Schema (`game.settings`)
```json
{
  "v": 1,
  "masterVol": 0.8,
  "musicVol": 0.6,
  "sfxVol": 0.7,
  "textSizeSetting": 75,
  "uiScale": 75,
  "difficulty": "normal",
  "fpsMode": "60",
  "targetFps": 60,
  "performanceOverlay": false,
  "performanceOverlayEnabled": false,
  "sensitivitySetting": 5,
  "invertYAxis": false,
  "hudEnabled": true,
  "showHUD": true,
  "showTutorialsSetting": true,
  "showTutorials": true,
  "colorModeSetting": "None",
  "languageSetting": "English",
  "showStars": true,
  "screenShakeEnabled": true,
  "showParticles": true,
  "showFireflyLighting": true
}
```

### 7.4 Save Adapter Requirements for Forest RPG V2
To achieve 100% legacy save compatibility:
1. Parse legacy `mapStates` and `terrainLayer` arrays (length = 22,500 = 150x150).
2. Translate integer tile IDs (1 = Grass, 2 = Forest, 11 = River, 7 = Bridge/Ramp, 103 = Coin, etc.).
3. Deserialise enemy list: restore types (`mantis`, `maggot`, `beetle`), positions (x, y), current HP, and max HP.
4. Restore `playerPosition` or calculate nearest safe flood-fill start if missing or blocked.
5. Rebuild coin list from `TILE_TYPES.COIN` occurrences in `mapStates`.
6. Restore `portalPos` and `isPortalActive` status.
7. Reject invalid payloads (dimensions != 150x150, invalid tile IDs, out-of-bounds coordinates).

---

## 8. Asset & Audio Inventory

### 8.1 Visual Sprites & Sheets
| Asset Path | Frame Spec | Usage |
|------------|------------|-------|
| `assets/1-Background/2-Game/1-Forest/tile_1.png` | 64x64 static | Grass base tile |
| `assets/1-Background/2-Game/1-Forest/tree_1.png` | Static tree | Forest canopy and tree overlay |
| `assets/1-Background/2-Game/1-Forest/water_1.png` | Static water | River water tile |
| `assets/1-Background/2-Game/1-Forest/bridge_1.png`| Static bridge | Wooden bridge / ramp tile |
| `assets/1-Background/2-Game/1-Forest/1-hill_*.png`| 8 directional tiles | North, NE, East, SE, South, SW, West, NW cliffs |
| `assets/2-Characters/1-Idle/idle_sheet_*.png` | 4 frames / row | Player 8-direction idle animation |
| `assets/2-Characters/2-Walking/walk_sheet_*.png`| 4 frames / row | Player 8-direction walk animation |
| `assets/2-Characters/3-Running/run_sheet_*.png` | 6 frames / row | Player 8-direction sprint animation |
| `assets/2-Characters/4-Jumping/jump_sheet_*.png`| 5 frames / row | Player 8-direction jump animation |
| `assets/2-Characters/6-Attack/attack_*.png` | 4 frames / row | Player melee punch (West is mirrored for East) |
| `assets/2-Characters/5-Enemies/MantisMove.png` | 4x4 frames (S,E,W,N)| Mantis walk animation |
| `assets/2-Characters/5-Enemies/MantisAttack.png`| 7x4 frames | Mantis attack animation |
| `assets/2-Characters/5-Enemies/MaggotWalk.png` | 4x4 frames (S,W,E,N)| Maggot walk animation |
| `assets/2-Characters/5-Enemies/MaggotSpit.png` | 7x4 frames | Maggot spit attack animation |
| `assets/2-Characters/5-Enemies/BeetleMove.png` | 4x4 frames (32x32) | Boss Beetle walk animation |
| `assets/2-Characters/5-Enemies/BeetleAttack.png`| 6x4 frames (32x32) | Boss Beetle lunge attack animation |
| `assets/2-Characters/5-Enemies/GhostMove.png` | 3x4 frames (S,N,E,W)| Ghost walk animation |
| `assets/2-Characters/5-Enemies/GhostAttack.png` | 3x4 frames | Ghost attack animation |
| `assets/2-Characters/5-Enemies/AcidBlob.png` | 7x4 frames | Maggot acid projectile |
| `assets/2-Characters/5-Enemies/AcidSplat.png` | Static VFX | Acid death splat |
| `assets/2-Characters/5-Enemies/Eggsplosion.png`| Static VFX | Beetle/maggot death splat |
| `assets/2-Characters/5-Enemies/EggCluster.png` | Static item | Speed potion pickup |
| `assets/5-Objects/2-Portal/portal_active_sheet.png` | 6 frames | Active portal animation |
| `assets/5-Objects/2-Portal/portal_inactive_sheet.png` | 6 frames | Inactive portal animation |
| `assets/6-Icons/coin_4_frames.png` | 4 frames | Spinning coin animation |
| `assets/3-GUI/Heart.png` | Static icon | Health heart indicator |
| `assets/3-GUI/Button_BG.png` | 9-slice / texture | Golden medieval UI panel / button texture |
| `assets/3-GUI/font.ttf` | TTF Font | PixelGameFont retro typeface |
| `assets/5-Objects/cloud_1..4.png` | 4 cloud images | Ambient parallax cloud sprites |
| `assets/5-Objects/1-More/*.png` | 11 decorative props| Flowers, bushes, logs, rocks, hole |

### 8.2 Audio & Music
- **Music:**
  - `assets/8-Music/game_music.wav`: Ambient exploration background music (looped).
  - `assets/8-Music/menu_music.wav`: Main menu background music.
- **Sound Effects:**
  - `assets/9-Sounds/Button_Press.mp3`: Click SFX for buttons, inventory use, and projectile casting.
- **Audio Channels & Mixers:**
  - Master volume (`masterVol`), Music volume (`musicVol`), SFX volume (`sfxVol`).
  - Net music volume: `musicVol * masterVol`.
  - Autoplay recovery: AudioContext resume triggered on first canvas interaction or keypress.

---

## 9. In-Game Debug Console Commands

Console opened via `F2`, `Backquote` (`~`), or `Ctrl + '`.
| Command | Arguments | Effect |
|---------|-----------|--------|
| `/kill all` | none | Purges all enemies on the current map |
| `/kill boss` | none | Instantly eliminates the Beetle Boss |
| `/collect all` | none | Collects all coins on the map into score |
| `/scan boss` | none | Checks if Beetle Boss is alive and outputs HP |
| `/locate boss` | none | Outputs Beetle Boss tile coordinates and distance |
| `/spawn boss` | none | Spawns a Beetle Boss 10 tiles away from player |
| `/spawn ghost` | none | Spawns a Ghost 10 tiles away from player |
| `/give [potion\|speed\|all]` | Item name | Grants health potion, speed potion, or package |
| `/time [dawn\|day\|dusk\|night]` | Phase | Smoothly shifts temporal lighting phase |
| `/health [amount]` | Number | Sets maxHealth and playerHealth to specified value |
| `/tutorial reset` | none | Resets tutorial flags and loads Training Glade |
| `/clear` | none | Clears terminal history buffer |
| `/exit` | none | Closes debug terminal interface |

---

*Specification verified against source code, active map files, and 44 passing automated contract tests in the legacy repository.*
