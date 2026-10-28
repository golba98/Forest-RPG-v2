# Forest RPG V2 — Technical Architecture, Asset Migration Strategy, and Subsystem Contracts

**Author**: survey_explorer_arch_1 (teamwork_explorer)  
**Date**: 2026-10-27  
**Status**: Proposal & Technical Specification  
**Target Repository**: `/home/k9-vortex/Development/2-TypeScript/18-Forest RPG v2`  
**Reference Legacy Repository (Read-Only)**: `/home/k9-vortex/Development/1-JavaScript/3-Game Development`

---

## 1. Executive Summary & Architectural Vision

Forest RPG V2 is a standalone, production-quality 2D pixel-art top-down RPG engineered in strict TypeScript and modern PixiJS 8. It replaces the legacy educational p5.js/Pixi 7 hybrid implementation with an decoupled, high-performance, maintainable architecture.

### Key Pillars of V2:
1. **Decoupled Fixed-Timestep Simulation (60 Hz)**: Physics, combat, collision, entity AI, and world state update at an authoritative 60 Hz fixed timestep with accumulator and spiral-of-death clamping. Rendering runs at the native display refresh rate (60 Hz, 120 Hz, 144 Hz, 240 Hz+) using alpha interpolation between previous and current simulation states for stutter-free visuals.
2. **Pure Modern PixiJS 8 Engine**: Complete elimination of p5.js and DOM-based canvas stacking. All rendering—chunked terrain, depth-sorted entities, day/night lighting, weather particles, and pixel-art HUD—is unified inside a single PixiJS 8 WebGL2/WebGPU pipeline with nearest-neighbor texture sampling, high-DPI awareness, and coordinate rounding.
3. **Clean Modular Subsystem Boundaries**: Five distinct subsystems (Core/Integration, Rendering, Gameplay/World, Visual/UI, Infrastructure/QA) interact solely through type-safe interfaces, dependency injection, and a strongly-typed Event Bus. This enables concurrent implementation across specialized agents without code collisions.
4. **Deterministic Procedural World Generation**: Seeded Perlin/simplex noise generation for rivers, bridge placement, terrain clearing, and obstacle decoration, with verified connectivity and spawn safety.
5. **Bidirectional Persistence & Legacy Adapter**: Modern versioned JSON game saves stored in localStorage, paired with a robust legacy save adapter capable of loading legacy `active_map.json` and legacy browser saves without data corruption.
6. **Automated QA & Benchmarking**: Vitest unit/integration suites running in headless Node, Playwright E2E tests validating WebGL rendering and menu/gameplay interaction, and automated performance benchmarking measuring startup latency, generation duration, FPS, and p95/p99 frame pacing.

---

## 2. Legacy Asset Inventory & Migration Strategy

### 2.1 Complete Legacy Asset Catalog (91 Files)
The legacy project at `/home/k9-vortex/Development/1-JavaScript/3-Game Development/assets` contains 91 files totaling approximately 68 MB. A forensic survey of these assets reveals their dimensions, formats, and runtime characteristics:

| Category | File Path | Format & Dimensions | Legacy Usage & Characteristics |
|---|---|---|---|
| **Background / Menu** | `1-Background/1-Menu/Background.png` | PNG (640x360) | Menu background splash |
| | `1-Background/1-Menu/Settings_Background.png` | PNG (111x231) | Settings dialog backdrop |
| | `1-Background/1-Menu/Menu_Vid.mp4` | MP4 (19.2 MB) | Optional animated menu background |
| **Terrain (Forest)** | `1-Background/2-Game/1-Forest/tile_1.png` | PNG (31x31) | Primary grass tile (Note: 31x31 px, not 32x32) |
| | `1-Background/2-Game/1-Forest/water_1.png` | PNG (105x100) | River/water texture |
| | `1-Background/2-Game/1-Forest/tree_1.png` | PNG (239x286) | Large tree canopy overlay |
| | `1-Background/2-Game/1-Forest/bridge_1.png` | PNG (1024x1024) | High-res bridge/ramp/wood overlay |
| | `1-Background/2-Game/1-Forest/1-hill_{dir}.png` (8 files: east, north, northeast, northwest, south, southeast, southwest, west) | PNG (34x92 to 96x33) | Elevation cliff edges. **Warning**: Contains bright green/white chroma backgrounds in legacy |
| **Player Character** | `2-Characters/1-Idle/idle_sheet_{dir}.png` (8 directions) | PNG (80x18 to 80x23) | 4 frames per sheet (20 px frame width), 8 cardinal & diagonal directions |
| | `2-Characters/2-Walking/walk_sheet_{dir}.png` (8 directions) | PNG (80x19 to 80x22) | 4 frames per sheet (20 px frame width), 8 directions |
| | `2-Characters/3-Running/run_sheet_{dir}.png` (8 directions) | PNG (120x18 to 120x22) | 6 frames per sheet (20 px frame width), 8 directions (filename has inconsistent underscores e.g. `run_sheet_north_east.png`) |
| | `2-Characters/4-Jumping/jump_sheet_{dir}.png` (8 directions) | PNG (100x20 to 100x21) | 5 frames per sheet (20 px frame width), 8 directions |
| | `2-Characters/6-Attack/attack_{dir}.png` (7 files: north, north_east, north_west, south, south_east, south_west, west) | PNG (446x92 to 446x121) | 4 frames per sheet (~111.5 px frame width). **Critical flaw**: `attack_east.png` does NOT exist in legacy! |
| **Enemies & Combat** | `2-Characters/5-Enemies/MantisMove.png` | PNG (128x128) | 4 cols x 4 rows (32x32 frames), directions SEWN |
| | `2-Characters/5-Enemies/MantisAttack.png` | PNG (224x128) | 7 cols x 4 rows (32x32 frames), directions SEWN |
| | `2-Characters/5-Enemies/BeetleMove.png` | PNG (128x128) | 4 cols x 4 rows (32x32 frames), directions NSEW |
| | `2-Characters/5-Enemies/BeetleAttack.png` | PNG (192x128) | 6 cols x 4 rows (32x32 frames), directions NSEW |
| | `2-Characters/5-Enemies/MaggotWalk.png` | PNG (128x128) | 4 cols x 4 rows (32x32 frames), directions NSEW |
| | `2-Characters/5-Enemies/MaggotSpit.png` | PNG (224x128) | 7 cols x 4 rows (32x32 frames), directions NSEW |
| | `2-Characters/5-Enemies/GhostMove.png` | PNG (1406x1536) | High-res sheet (3 cols x 4 rows). Scaled down at runtime |
| | `2-Characters/5-Enemies/GhostAttack.png` | PNG (1984x2168) | High-res sheet (3 cols x 4 rows). Scaled down at runtime |
| | `2-Characters/5-Enemies/AcidBlob.png` | PNG (224x128) | Acid projectile animation |
| | `2-Characters/5-Enemies/AcidSplat.png` | PNG (384x64) | Acid ground splat on projectile hit / death |
| | `2-Characters/5-Enemies/EggCluster.png` | PNG (32x32) | Static egg / powerup pickup |
| | `2-Characters/5-Enemies/Eggsplosion.png` | PNG (128x64) | Maggot / beetle death explosion |
| **Objects & Decor** | `5-Objects/cloud_{1-4}.png` (4 files) | PNG (41x26 to 70x38) | Drifting cloud sprites |
| | `5-Objects/1-More/bush_small_1.png` | PNG (16x48) | Walkable decorative bush |
| | `5-Objects/1-More/bush_upward_1.png` | PNG (32x32) | Obstacle bush |
| | `5-Objects/1-More/flower_more_1.png` | PNG (19x17) | Decorative flower clump (cuttable) |
| | `5-Objects/1-More/flower_pink_1.png` | PNG (15x16) | Pink flower (cuttable) |
| | `5-Objects/1-More/flower_yellow.png` | PNG (16x16) | Yellow flower (cuttable) |
| | `5-Objects/1-More/hole_1.png` | PNG (31x18) | Ground hole / ditch |
| | `5-Objects/1-More/log_horizontal_1.png` | PNG (48x33) | Obstacle log |
| | `5-Objects/1-More/log_upward_1.png` | PNG (32x32) | Obstacle log stump |
| | `5-Objects/1-More/log_vertically_1.png` | PNG (32x48) | Obstacle vertical log |
| | `5-Objects/1-More/rock_small_1.png` | PNG (16x17) | Walkable pebble decor |
| | `5-Objects/1-More/rock_upward_1.png` | PNG (32x32) | Obstacle rock boulder |
| | `5-Objects/2-Portal/portal_active_sheet.png` | PNG (1536x256) | 6 frames of 256x256, active spinning portal |
| | `5-Objects/2-Portal/portal_inactive_sheet.png` | PNG (1536x256) | 6 frames of 256x256, dormant portal |
| **GUI & Icons** | `3-GUI/Button_BG.png` | PNG (197x44) | 9-slice retro wood/gold button background |
| | `3-GUI/Heart.png` | PNG (23x23) | Player life heart indicator |
| | `3-GUI/font.ttf` | TTF (10.1 KB) | Pixel-art bitmap TTF font |
| | `6-Icons/coin_4_frames.png` | PNG (128x32) | 4 frames of 32x32 spinning gold coin |
| | `6-Icons/forest-rpg-icon.svg` | SVG (873 B) | Vector app icon |
| **Audio** | `8-Music/game_music.wav` | WAV (13.9 MB) | Overworld music loop |
| | `8-Music/menu_music.wav` | WAV (15.2 MB) | Main menu music loop |
| | `9-Sounds/Button_Press.mp3` | MP3 (19.2 KB) | UI button click SFX |

---

### 2.2 Forensic Flaws in Legacy Assets & V2 Remediation Plan

Our examination of `src/game/game-assets.js` and `game-movement.js` uncovered five critical quirks in legacy assets:

1. **Hill Tiles Chroma Background Bug**:
   - *Legacy Observation*: In `game-assets.js` lines 11-23, the original code had to manually iterate raw image pixels on startup and delete pixels where `(r > 240 && g > 240 && b > 240)` or `(g > 100 && r < 80 && b < 80)` because the source PNGs had green-screen / white backgrounds.
   - *V2 Solution*: Clean the transparency in the imported PNG assets once during migration into `public/assets/images/terrain/hills/`. No runtime pixel manipulation overhead in PixiJS.
2. **Missing `attack_east.png`**:
   - *Legacy Observation*: `attack_east.png` is absent from disk. In `game-movement.js` line 701-711, `attack_west.png` was actually drawn facing East! To attack West, legacy flipped the sprite horizontally (`scale(-1, 1)`), and to attack East, it rendered `attack_west.png` without flipping.
   - *V2 Solution*: In the V2 asset pipeline, generate a normalized `attack_e.png` and `attack_w.png` or programmatically register both in the animation manifest using PixiJS `Texture` coordinate mirroring.
3. **Missing Item Textures (Chest, Potions)**:
   - *Legacy Observation*: `createChestGraphics()`, `createPotionGraphics()`, and `createSpeedPotionGraphics()` were drawn in code using p5 2D vector primitives (`rect`, `ellipse`, `arc`) because no sprite images existed.
   - *V2 Solution*: Provide dedicated 32x32 pixel-art textures in `public/assets/images/items/` (`chest.png`, `potion_health.png`, `potion_speed.png`), with an optional procedural fallback using HTML5 canvas / Pixi Graphics for hermetic testing.
4. **Ghost Sprite Resolution Discrepancy**:
   - *Legacy Observation*: `GhostMove.png` is 1406x1536 and `GhostAttack.png` is 1984x2168. In legacy, `game-assets.js` performed a synchronous CPU downscale to 64px height.
   - *V2 Solution*: Pre-downscale the ghost sprites into clean 64x64 or 32x32 frames in `public/assets/images/characters/enemies/ghost_*.png` to eliminate texture memory waste (saving ~3 MB VRAM) and prevent GPU texture bandwidth bottlenecks.
5. **Missing Combat & World Sound Effects**:
   - *Legacy Observation*: The legacy game had zero sound effects other than `Button_Press.mp3`. Combat was silent!
   - *V2 Solution*: Implement a procedural Web Audio Sound FX synthesizer (`SoundSynthesizer.ts`) using standard `OscillatorNode`, `GainNode`, and noise buffers to produce rich 16-bit sound effects without downloading additional audio files:
     - `swing`: Fast noise sweep with exponential pitch drop (50 ms).
     - `hit`: Low square punch with quick decay (80 ms).
     - `hurt`: Downward frequency chirp (120 ms).
     - `coin`: Pure dual-sine arpeggio (B5 -> E6, 100 ms).
     - `potion`: Ascending bubble chime (150 ms).
     - `levelUp`: Victorious brass-style chord arpeggio (400 ms).
     - `portal`: Low frequency pulsating drone.

---

### 2.3 Target Asset Directory Layout (`public/assets/`)

```text
public/assets/
├── audio/
│   ├── music/
│   │   ├── game_music.wav          # Overworld background music
│   │   └── menu_music.wav          # Main menu background music
│   └── sfx/
│       └── button_press.mp3        # UI click sound
├── fonts/
│   └── pixel_font.ttf              # Pixel HUD font
├── images/
│   ├── background/
│   │   ├── menu_bg.png             # 640x360 menu splash
│   │   └── settings_bg.png         # Settings panel background
│   ├── characters/
│   │   ├── player/
│   │   │   ├── idle/               # 8 directions: idle_{e,n,ne,nw,s,se,sw,w}.png (4 frames)
│   │   │   ├── walk/               # 8 directions: walk_{e,n,ne,nw,s,se,sw,w}.png (4 frames)
│   │   │   ├── run/                # 8 directions: run_{e,n,ne,nw,s,se,sw,w}.png (6 frames)
│   │   │   ├── jump/               # 8 directions: jump_{e,n,ne,nw,s,se,sw,w}.png (5 frames)
│   │   │   └── attack/             # 8 directions: attack_{e,n,ne,nw,s,se,sw,w}.png (4 frames)
│   │   └── enemies/
│   │       ├── mantis_move.png     # 128x128 (4x4)
│   │       ├── mantis_attack.png   # 224x128 (7x4)
│   │       ├── beetle_move.png     # 128x128 (4x4)
│   │       ├── beetle_attack.png   # 192x128 (6x4)
│   │       ├── maggot_walk.png     # 128x128 (4x4)
│   │       ├── maggot_spit.png     # 224x128 (7x4)
│   │       ├── ghost_move.png      # Pre-scaled pixel sheet
│   │       ├── ghost_attack.png    # Pre-scaled pixel sheet
│   │       ├── acid_blob.png       # 224x128
│   │       ├── acid_splat.png      # 384x64
│   │       ├── egg_cluster.png     # 32x32
│   │       └── eggsplosion.png     # 128x64
│   ├── items/
│   │   ├── chest.png               # 32x32 pixel treasure chest
│   │   ├── potion_health.png       # 32x32 red health potion
│   │   ├── potion_speed.png        # 32x32 cyan speed potion
│   │   └── coin_anim.png           # 128x32 (4 frames of 32x32)
│   ├── objects/
│   │   ├── portal_active.png       # 1536x256 (6 frames of 256x256)
│   │   ├── portal_inactive.png     # 1536x256 (6 frames of 256x256)
│   │   ├── clouds/                 # cloud_1.png through cloud_4.png
│   │   └── decor/                  # bushes, flowers, logs, rocks, hole
│   ├── terrain/
│   │   ├── grass.png               # 32x32 seamless grass tile
│   │   ├── water.png               # 32x32 river tile
│   │   ├── tree.png                # 239x286 large canopy overlay
│   │   ├── bridge.png              # Bridge plank texture
│   │   └── hills/                  # 8 clean alpha directional cliff edges
│   └── ui/
│       ├── button_bg.png           # 197x44 button border
│       ├── heart.png               # 23x23 health heart
│       └── icon.svg                # Favicon / app icon
└── manifests/
    └── asset_manifest.json         # PixiJS Assets bundle manifest
```

---

## 3. Decoupled Game Loop & Timing Architecture

### 3.1 The Frame Decoupling Challenge
In high-end displays (120Hz, 144Hz, 165Hz, 240Hz, or FreeSync/G-Sync), driving physics or gameplay updates from `requestAnimationFrame` causes either:
- Entity movement and physics running 2x to 4x faster than intended.
- Numerical integration errors and physics tunneling when delta-time fluctuates.
- Conversely, on 30Hz or tab throttle, large frame steps skip collision checks.

### 3.2 Fixed-Timestep Simulation with Accumulator & Alpha Interpolation
The Forest RPG V2 engine implements the canonical **Fix Your Timestep** algorithm:
- Authoritative simulation runs at a constant **60 Hz** (`FIXED_TIMESTEP = 1 / 60 ≈ 0.016667 s`, `16.667 ms`).
- The rendering loop runs on `requestAnimationFrame` at whatever rate the user's monitor supports.
- A spiral-of-death clamp caps `maxDeltaTime = 0.1 s` (100 ms) so browser tab backgrounding does not induce freeze loops.

```
+-------------------------------------------------------------------------+
| Browser requestAnimationFrame (Variable: 60Hz, 144Hz, 240Hz, etc.)       |
+-------------------------------------------------------------------------+
                                     |
                                     v
                      elapsed = min(now - lastTime, 0.1)
                                     |
                                     v
                       accumulator += elapsed
                                     |
            +------------------------+------------------------+
            |                                                 |
            v                                                 v
  while (accumulator >= 1/60s)                      accumulator < 1/60s
  +-------------------------------------+                     |
  | 1. snapshotPreviousState()          |                     |
  | 2. simulation.update(1/60s)         |                     |
  |    - Collision detection            |                     |
  |    - Player & enemy movement        |                     |
  |    - Combat & projectile ticks      |                     |
  |    - Day/Night simulation clock     |                     |
  | 3. accumulator -= 1/60s             |                     |
  +-------------------------------------+                     |
            |                                                 |
            +------------------------+------------------------+
                                     |
                                     v
                       alpha = accumulator / (1/60s)
                                     |
                                     v
                     renderer.render(gameState, alpha)
                                     |
         +---------------------------+---------------------------+
         |                                                       |
         v                                                       v
  For all visible entities:                             Camera Tracking:
  renderX = prevX + (currX - prevX) * alpha             camX = lerp(camPrev, camCurr, alpha)
  renderY = prevY + (currY - prevY) * alpha
```

### 3.3 Simulation Hermeticity
The simulation loop is pure TypeScript and has **zero dependencies on the DOM, WebGL, or PixiJS**.
- This enables **sub-millisecond unit testing** in Vitest: we can simulate 10,000 steps of combat, AI pathfinding, or world exploration in Node.js in under 100 ms without initializing a browser canvas.

---

## 4. Modern PixiJS 8 Patterns & Best Practices

### 4.1 Application Initialization in PixiJS 8
PixiJS 8 introduces an asynchronous initialization paradigm and replaces `app.view` with `app.canvas`:

```typescript
import { Application, Container, TextureSource } from 'pixi.js';

// Global scale mode for pixel-art: nearest-neighbor prevents sprite blur
TextureSource.defaultOptions.scaleMode = 'nearest';

export async function createPixiApplication(canvas: HTMLCanvasElement): Promise<Application> {
  const app = new Application();
  await app.init({
    canvas,
    resizeTo: window,
    resolution: Math.min(window.devicePixelRatio || 1, 2),
    autoDensity: true,
    antialias: false,
    roundPixels: true,
    backgroundColor: 0x0a1f04,
    preference: 'webgl', // WebGL2/WebGL1 provides reliable headless test execution
  });
  
  // Explicitly manage ticker: stop default autostart to align with our decoupled loop
  app.ticker.stop();
  return app;
}
```

### 4.2 Scene Graph & Container Hierarchy
To support depth sorting, viewport culling, and day/night ambient lighting, the scene graph is partitioned into explicit layers:

```
app.stage
├── worldContainer (Transformed by Camera: translation (-camX, -camY) and scale (zoom))
│   ├── terrainLayer (Chunked containers, 16x16 tiles per chunk)
│   ├── groundDecorLayer (Foliage, pebbles, cut grass, water ripples)
│   ├── entityLayer (sortableChildren = true; sorted every render by zIndex = Math.floor(renderY))
│   │   ├── droppedItems (coins, potion bottles)
│   │   ├── portalSprite
│   │   ├── enemies (mantis, maggot, beetle, ghost)
│   │   ├── playerSprite
│   │   ├── projectiles (acid blobs)
│   │   └── treeCanopies (upper overlays sorted with player to allow walking behind trunks)
│   ├── weatherWorldLayer (falling leaves, drifting rain streaks)
│   └── lightingWorldLayer (multiplicative night mask with point light cutouts)
└── uiStage (Screen-space container; unaffected by camera world transforms)
    ├── hudContainer (Hearts, Stamina bar, Mana bar, Level/XP gauge, Gold counter)
    ├── floatingTextContainer (Damage numbers, XP popups)
    ├── dialogContainer (Tutorial bubbles, story prompts)
    ├── modalMenuContainer (Inventory, Level Up, Pause, Settings)
    └── debugTerminalContainer (In-game command console)
```

### 4.3 Viewport Culling & Chunked Terrain
- In legacy, the entire 150x150 map (4800x4800 px) was rendered to a gigantic offscreen canvas and sliced into 2048px textures, wasting memory.
- In V2, the world is divided into **16x16 tile chunks** (512x512 px at 32px/tile). For a 150x150 world, that is approximately 10x10 = 100 chunks.
- During `camera.update()`, we compute the visible camera bounding box:
  ```typescript
  const visibleBounds = camera.getViewportBounds();
  for (const chunk of chunkGrid) {
    chunk.container.visible = rectIntersects(chunk.bounds, visibleBounds);
  }
  ```
- Only ~6 to 12 chunks are rendered at any time. GPU draw calls and vertex uploads are reduced by over 85%.

### 4.4 Depth Sorting
Top-down RPGs require entities with higher Y positions (lower on the screen) to render in front of entities with lower Y positions.
- In PixiJS 8, `entityLayer.sortableChildren = true`.
- During interpolation, each visible entity updates its `zIndex`:
  ```typescript
  sprite.zIndex = Math.floor(interpolatedY + entity.depthOffset);
  ```
- Tree sprites have their anchor set near the base of the trunk (`anchor.set(0.5, 0.85)`). When the player walks above the base, they render behind the tree; when they walk below the base, they render in front of the foliage.

### 4.5 Ambient Day/Night Lighting Transitions
- The simulation tracks continuous day time `timeOfDay ∈ [0.0, 1.0)` (0.0 = Midnight, 0.25 = Dawn, 0.5 = Noon, 0.75 = Dusk).
- Lighting is rendered via a full-screen ambient quad in `lightingWorldLayer` using `blendMode = 'multiply'`:
  - Noon: `#ffffff` (transparent white; 100% full brightness).
  - Dusk: `#f09040` (warm orange-amber twilight).
  - Midnight: `#161c3a` (deep navy blue night).
  - Dawn: `#e89a6b` (soft rose-gold sunrise).
- **Point Lights & Lanterns**: Point lights (portal glow, player lantern, campfire) are rendered into the ambient quad or an ambient render texture with `blendMode = 'add'` or `'erase'` to reveal warm, illuminated circles in the darkness.

---

## 5. Subsystem Boundaries & TypeScript Interface Contracts

To enable Team Lead and Agents 1 through 4 to work concurrently with zero merge conflicts, the codebase is structured around five standalone modules with formal interface contracts:

```
src/
├── core/             # Team Lead: Engine, Loop, State, EventBus, DI
├── rendering/        # Agent 1: PixiJS 8, Camera, Culling, Chunked Terrain, Lighting
├── world/            # Agent 2: Procedural Generator, Collision, Entities, AI, Combat, Saves
├── ui/               # Agent 3: HUD, Menus, Dialogs, Terminal, Sprite Animations
└── infra/            # Agent 4: Config, Audio Synth, Storage, Benchmarking
```

### 5.1 Common Primitives (`src/core/types.ts`)

```typescript
export interface Vector2 {
  x: number;
  y: number;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type Direction = 'N' | 'NE' | 'E' | 'SE' | 'S' | 'SW' | 'W' | 'NW';

export enum TileType {
  EMPTY = 0,
  GRASS = 1,
  FOREST = 2,
  WATER = 11,
  BORDER = 12,
  HILL_NORTH = 13,
  HILL_NORTHEAST = 14,
  HILL_EAST = 15,
  HILL_SOUTHEAST = 16,
  HILL_SOUTH = 17,
  HILL_SOUTHWEST = 18,
  HILL_WEST = 19,
  HILL_NORTHWEST = 20,
  BRIDGE = 30,
  RAMP = 31,
  LOG = 32,
  FLOWER = 33,
  PEBBLE = 34,
}
```

---

### 5.2 Subsystem 1: Core & Architecture (Team Lead)
Responsible for engine lifecycle, game state management, type-safe event broadcasting, and service discovery.

```typescript
// src/core/events.ts
export interface GameEvents {
  // Lifecycle
  'game:started': { seed: number; mode: 'new' | 'loaded' };
  'game:paused': { paused: boolean };
  'game:over': { victory: boolean; score: number };
  
  // Player state
  'player:damaged': { amount: number; currentHealth: number; maxHealth: number; source: string };
  'player:healed': { amount: number; currentHealth: number };
  'player:manaChanged': { currentMana: number; maxMana: number };
  'player:staminaChanged': { currentStamina: number; maxStamina: number };
  'player:levelUp': { newLevel: number; statPoints: number };
  'player:xpGained': { amount: number; currentXp: number; nextLevelXp: number };
  'player:coinCollected': { value: number; totalCoins: number };
  
  // World & Combat
  'entity:spawned': { id: string; type: string; position: Vector2 };
  'entity:damaged': { id: string; amount: number; currentHealth: number; position: Vector2 };
  'entity:died': { id: string; type: string; position: Vector2; killerId: string };
  'combat:text': { text: string; position: Vector2; color: string };
  'weather:changed': { type: 'clear' | 'rain' | 'storm' | 'fog'; intensity: number };
  'time:changed': { timeOfDay: number; isNight: boolean };
  
  // UI & Diagnostics
  'ui:menuToggled': { menuId: string; open: boolean };
  'terminal:command': { command: string; args: string[] };
}

export interface IEventBus {
  emit<K extends keyof GameEvents>(event: K, payload: GameEvents[K]): void;
  on<K extends keyof GameEvents>(event: K, handler: (payload: GameEvents[K]) => void): () => void;
  off<K extends keyof GameEvents>(event: K, handler: (payload: GameEvents[K]) => void): void;
  clear(): void;
}

// src/core/services.ts
export interface IServiceRegistry {
  register<T>(token: string, instance: T): void;
  get<T>(token: string): T;
  has(token: string): boolean;
}

// src/core/engine.ts
export interface IGameEngine {
  readonly eventBus: IEventBus;
  readonly services: IServiceRegistry;
  init(): Promise<void>;
  start(): void;
  stop(): void;
  pause(): void;
  resume(): void;
}
```

---

### 5.3 Subsystem 2: Rendering Engine (Agent 1)
Responsible for PixiJS 8 rendering, viewport culling, camera mechanics, chunked tile rendering, lighting, and weather VFX.

```typescript
// src/rendering/interfaces.ts
import { Container } from 'pixi.js';
import { Rect, Vector2 } from '../core/types';

export interface ICamera {
  readonly position: Vector2;
  readonly zoom: number;
  readonly viewportBounds: Rect;
  
  follow(target: Vector2, lerp?: number): void;
  setZoom(zoom: number): void;
  shake(intensity: number, durationMs: number): void;
  screenToWorld(screenPos: Vector2): Vector2;
  worldToScreen(worldPos: Vector2): Vector2;
  update(dt: number): void;
}

export interface ITerrainRenderer {
  init(width: number, height: number, cellSize: number): Promise<void>;
  updateChunks(visibleBounds: Rect): void;
  setTile(x: number, y: number, tileType: number): void;
  destroy(): void;
}

export interface ILightingSystem {
  setTimeOfDay(time: number): void; // 0.0 to 1.0
  addPointLight(id: string, pos: Vector2, radius: number, color: number, intensity: number): void;
  removePointLight(id: string): void;
  update(dt: number, camera: ICamera): void;
}

export interface IWeatherSystem {
  setWeather(type: 'clear' | 'rain' | 'storm' | 'fog', intensity: number): void;
  update(dt: number, camera: ICamera): void;
}

export interface IRenderEngine {
  readonly stage: Container;
  readonly camera: ICamera;
  readonly terrain: ITerrainRenderer;
  readonly lighting: ILightingSystem;
  readonly weather: IWeatherSystem;
  
  init(canvas: HTMLCanvasElement): Promise<void>;
  render(alpha: number): void;
  resize(width: number, height: number): void;
  destroy(): void;
}
```

---

### 5.4 Subsystem 3: Gameplay & World Systems (Agent 2)
Responsible for procedural generation, top-down collision physics, player state, enemy AI state machines, combat math, and persistence.

```typescript
// src/world/interfaces.ts
import { Direction, Rect, TileType, Vector2 } from '../core/types';

export interface IWorldGenerator {
  generate(seed: number, width: number, height: number): {
    tiles: Uint8Array;
    spawnPoint: Vector2;
    portalPosition: Vector2;
    enemySpawns: Array<{ type: string; x: number; y: number }>;
  };
}

export interface ICollisionSystem {
  isWalkable(tileX: number, tileY: number): boolean;
  checkCircleCollision(pos: Vector2, radius: number): boolean;
  resolveMovement(from: Vector2, to: Vector2, radius: number): Vector2;
  raycast(from: Vector2, to: Vector2): { hit: boolean; point?: Vector2 };
}

export interface IPlayerEntity {
  id: string;
  position: Vector2;
  previousPosition: Vector2;
  velocity: Vector2;
  direction: Direction;
  health: number;
  maxHealth: number;
  mana: number;
  maxMana: number;
  stamina: number;
  maxStamina: number;
  level: number;
  xp: number;
  gold: number;
  isAttacking: boolean;
  isSprinting: boolean;
  
  move(inputX: number, inputY: number, sprint: boolean): void;
  attack(): boolean;
  castSpell(): boolean;
  takeDamage(amount: number, source: string): void;
  gainXp(amount: number): void;
}

export type EnemyStateType = 'idle' | 'patrol' | 'chase' | 'attack' | 'flee' | 'hurt' | 'dead';

export interface IEnemyEntity {
  id: string;
  type: 'mantis' | 'maggot' | 'beetle' | 'ghost';
  position: Vector2;
  previousPosition: Vector2;
  direction: Direction;
  health: number;
  maxHealth: number;
  state: EnemyStateType;
  target?: Vector2;
  
  updateAI(dt: number, playerPos: Vector2, collision: ICollisionSystem): void;
  takeDamage(amount: number, knockbackDir: Vector2): void;
}

export interface ISaveDataV2 {
  version: 2;
  timestamp: number;
  seed: number;
  player: {
    x: number;
    y: number;
    health: number;
    maxHealth: number;
    mana: number;
    stamina: number;
    level: number;
    xp: number;
    gold: number;
    inventory: Record<string, number>;
  };
  world: {
    width: number;
    height: number;
    modifiedTiles: Array<{ x: number; y: number; tile: number }>;
    portalActive: boolean;
  };
  enemies: Array<{
    type: string;
    x: number;
    y: number;
    health: number;
  }>;
}

export interface ISaveManager {
  saveGame(slot?: string): Promise<boolean>;
  loadGame(slot?: string): Promise<ISaveDataV2 | null>;
  importLegacySave(legacyJson: string | object): ISaveDataV2;
}
```

---

### 5.5 Subsystem 4: Visual Design & UI (Agent 3)
Responsible for pixel-art HUD, responsive modal overlays, in-game terminal, and sprite animation state handling.

```typescript
// src/ui/interfaces.ts
import { Container } from 'pixi.js';
import { Vector2 } from '../core/types';

export interface IHUD {
  setHealth(current: number, max: number): void;
  setMana(current: number, max: number): void;
  setStamina(current: number, max: number): void;
  setXp(current: number, next: number, level: number): void;
  setGold(amount: number): void;
  showDamageIndicator(worldPos: Vector2, amount: number, isCrit: boolean): void;
  update(dt: number): void;
}

export interface IUIManager {
  readonly rootContainer: Container;
  
  showHUD(visible: boolean): void;
  openInventory(): void;
  openLevelUp(): void;
  openSettings(): void;
  showDialog(speaker: string, text: string, options?: string[]): Promise<number>;
  toggleDebugTerminal(): void;
}

export interface IDebugTerminal {
  isOpen: boolean;
  registerCommand(command: string, handler: (args: string[]) => string | void): void;
  execute(commandLine: string): string;
}

export interface ISpriteAnimator {
  play(action: 'idle' | 'walk' | 'run' | 'jump' | 'attack', direction: string): void;
  getCurrentFrame(): { x: number; y: number; width: number; height: number };
  update(dt: number): void;
}
```

---

### 5.6 Subsystem 5: Infrastructure & Quality Assurance (Agent 4)
Responsible for build configuration, automated testing, audio generation, and reproducible benchmarks.

```typescript
// src/infra/interfaces.ts
export interface IBenchmarkReport {
  timestamp: string;
  engineStartupTimeMs: number;
  worldGenDurationMs: number;
  averageFps: number;
  p95FrameTimeMs: number;
  p99FrameTimeMs: number;
  minFps: number;
  maxFps: number;
  jsHeapUsedBytes: number;
}

export interface IBenchmarkRunner {
  runBenchmark(durationSeconds: number): Promise<IBenchmarkReport>;
}

export interface ISoundSynthesizer {
  playSwing(): void;
  playHit(): void;
  playPlayerHurt(): void;
  playCoin(): void;
  playPotion(): void;
  playLevelUp(): void;
  playPortal(): void;
}
```

---

## 6. Persistence & Legacy Save Adapter Specification

### 6.1 Legacy Save Format (`active_map.json` & localStorage)
Our survey of `/home/k9-vortex/Development/1-JavaScript/3-Game Development/maps/active_map.json` and `game-globals.js` confirmed the exact legacy schema:
```json
{
  "persistentGameId": "server_default_1765159366471",
  "timestamp": 1788878021375,
  "logicalW": 150,
  "logicalH": 150,
  "cellSize": 32,
  "mapStates": [ 2, 2, 1, 1, ... ],  // 22,500 Uint8 elements (1=grass, 2=forest, 11=river, 13-20=hills, 103=coin)
  "terrainLayer": [ 2, 2, 1, 1, ... ],
  "treeObjects": [],
  "portalPos": { "x": 75, "y": 75 },
  "isPortalActive": false,
  "enemies": [
    { "type": "maggot", "x": 83, "y": 89, "health": 2, "maxHealth": 2, "direction": "S", "moveTimer": 0 },
    { "type": "mantis", "x": 118, "y": 60, "health": 3, "maxHealth": 3, "direction": "S", "moveTimer": 0 }
  ]
}
```
And legacy `localStorage` keys:
- `game.settings` / `menuSettings`: JSON string of `{ masterVol, musicVol, sfxVol, targetFps, ... }`
- `tutorialComplete`: `"true"` | `"false"`
- `hasShownWelcomeTutorial`: `"true"` | `"false"`

### 6.2 Legacy Save Adapter Implementation Plan
The `LegacySaveAdapter` implements a deterministic transformation:
1. **Header Validation**: Checks if payload contains `logicalW` and `mapStates` array of length `logicalW * logicalH`.
2. **Tile ID Normalization**: Converts legacy enum values:
   - `1` -> `TileType.GRASS`
   - `2` -> `TileType.FOREST`
   - `11` -> `TileType.WATER`
   - `13..20` -> `TileType.HILL_*`
   - `103` (Coin) -> Extracted to initial dropped item list.
3. **Enemy Translation**: Maps legacy enemy objects directly to V2 entity schemas, preserving exact `(x, y)` tile positions and health percentages.
4. **Player Position Recovery**: If legacy save lacks explicit player coordinates, extracts player spawn from the designated clear zone (`centerX = 75, centerY = 75` or nearest safe grass tile).
5. **Round-Trip Test Case**: Agent 4 will include `active_map.json` fixture in `tests/fixtures/legacy_save.json` and assert that the legacy adapter successfully transforms it into valid V2 state with zero data loss.

---

## 7. Implementation Roadmap & Subsystem Workstreams

```
+-------------------------------------------------------------------------+
| Phase 0: Workspace & Infrastructure Bootstrap (Agent 4 + Team Lead)     |
| - package.json, strict tsconfig.json, vite.config.ts                    |
| - Vitest test harness and Playwright configuration                     |
| - Asset directory structure setup under public/assets/                  |
+-------------------------------------------------------------------------+
                                     |
         +---------------------------+---------------------------+
         |                                                       |
         v                                                       v
+-------------------------------+               +-------------------------------+
| Stream A: Engine & Rendering  |               | Stream B: World & Gameplay    |
| (Team Lead & Agent 1)         |               | (Agent 2 & Agent 3)           |
| - EventBus & ServiceRegistry  |               | - Seeded World Generator      |
| - Fixed 60Hz Loop with Alpha  |               | - Top-down Collision Physics  |
| - PixiJS 8 Application Bootstrap |           | - Player & Enemy AI Machines  |
| - 2D Camera & Viewport Culling|               | - Combat & Leveling Formulas  |
| - Chunked Terrain & Depth Sort|               | - Pixel HUD & Menus           |
| - Day/Night & Weather FX      |               | - Debug Terminal & Sound Synth|
+-------------------------------+               +-------------------------------+
                                     |
                                     v
+-------------------------------------------------------------------------+
| Phase 3: Integration & Persistence (Team Lead + Agent 2 + Agent 3)      |
| - Connect UI, Gameplay, and Rendering via Event Bus                     |
| - Versioned SaveManager & LegacySaveAdapter with test fixtures         |
| - Tutorial and victory portal flow integration                          |
+-------------------------------------------------------------------------+
                                     |
                                     v
+-------------------------------------------------------------------------+
| Phase 4: Verification, Benchmarking, & Polish (Agent 4 & Sentinel)     |
| - Full Vitest unit/integration suite passes 100%                       |
| - Playwright browser E2E test runs (menu, game boot, headless WebGL)   |
| - Automated 60 FPS / frame pacing benchmark execution                   |
| - Technical documentation in docs/ and feature parity verification     |
+-------------------------------------------------------------------------+
```

---

## 8. Summary of Verifiable Contracts & Invariants

1. **Strict TypeScript Integrity**: Zero `any` casts in core interfaces. Zero type errors under `tsc --noEmit`.
2. **Hermetic Simulation**: Simulation systems can run entirely headless inside Node.js Vitest tests without DOM, WebGL, or window references.
3. **Display Independence**: Simulation math (speed, damage rate, animation ticks) is invariant to display refresh rates (60Hz vs 144Hz vs 240Hz).
4. **Memory & GPU Efficiency**: Maximum active texture chunks capped at visible camera bounds. Zero per-frame memory allocation in the render loop.
5. **Safety Compliance**: Zero files created, modified, or deleted in the read-only `/home/k9-vortex/Development/1-JavaScript/3-Game Development` directory.
