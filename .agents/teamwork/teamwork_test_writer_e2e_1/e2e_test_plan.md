# E2E Test Plan — Forest RPG V2

**Document Version:** 1.0.0  
**Author:** teamwork_test_writer_e2e_1  
**Target:** Playwright E2E Browser Testing Track & Headless Simulation Harness  
**Authoritative Reference:** `ORIGINAL_REQUEST.md`, `PROJECT.md`, `TEST_INFRA.md`, `legacy_game_spec.md`

---

## 1. Objectives & Scope
The goal of the End-to-End (E2E) testing track is to guarantee 100% opaque-box, requirement-driven verification of Forest RPG V2. The test suite exercises the system exclusively from the user/browser perspective (DOM elements, canvas rendering context, keyboard/pointer event injection, and the public diagnostic gateway `window.__GAME__`).

### Key Principles
1. **Opaque-Box Verification:** Tests assert against user-observable behaviors, contracts, rendering artifacts, and formal state models without internal tight coupling.
2. **Authoritative Expected Output Derivation:** Every expected value (damage formula, XP scaling, tick rate, jump curve, save schema, tile IDs) is derived directly from `PROJECT.md`, `TEST_INFRA.md`, and the ground-truth specification in `legacy_game_spec.md`.
3. **Deterministic Timestep Verification:** Tests verify 60Hz fixed-timestep simulation accumulator pacing, delta time clamping (50ms ceiling), and spiral-of-death drop logic.
4. **Zero Implementation Mutation:** Test code only under `tests/e2e/` — never modify engine source code.

---

## 2. Directory & Architecture Layout
```
tests/e2e/
|-- helpers/
|   |-- types.ts                  # State contracts, snapshot models, driver interfaces
|   |-- game-driver.ts            # High-level Playwright Page driver & test abstraction
|   `-- legacy-fixtures.ts        # Valid/invalid legacy maps, settings & save fixtures
|-- tier1-feature/
|   |-- engine-boot-menu.spec.ts              # F1, F9, F36: Boot, canvas, 60fps ticker, menus, audio
|   |-- simulation-movement-physics.spec.ts   # F1, F11, F12, F13: Move, sprint, jump, collision
|   |-- combat-abilities-bestiary.spec.ts     # F14, F15, F16, F17, F18, F20: Combos, Q/E, AI bestiary
|   |-- world-environment-lifecycle.spec.ts   # F2, F4-8, F10, F19, F21-23: Gen, camera, HUD, victory
|   `-- persistence-legacy-saves.spec.ts      # F24, F25: JSON persistence, legacy active_map.json
`-- tier2-boundary/
    |-- boundary-boot-menu.spec.ts            # Edge resolutions, rapid toggling, missing storage
    |-- boundary-simulation-movement.spec.ts  # Map edges, zero stamina, dt clamping, diagonal scaling
    |-- boundary-combat-ai.spec.ts            # Max HP cap (20), i-frames, death state, flee lock
    `-- boundary-world-persistence.spec.ts    # Save corruption recovery, ID mismatch, terminal stress
```

---

## 3. Tier 1: Feature Coverage Inventory (25 Features × ≥5 Test Cases)

### Feature 1: Standalone TypeScript Engine & Decoupled 60Hz Loop
- **T1.1.1:** Canvas initialization: PixiJS 8 attaches to DOM container `#app canvas` with nearest-neighbor texture sampling and high-DPI awareness.
- **T1.1.2:** 60Hz fixed timestep accumulator: verifies fixed delta step of ~16.667ms per tick over a 60-frame sampling window.
- **T1.1.3:** Frame pacing & delta clamp: verifies that sudden frame delays clamp delta time to 50ms maximum.
- **T1.1.4:** Spiral-of-death backlog guard: verifies accumulator backlog exceeding 5 fixed steps (>100ms) drops excess time rather than freezing.
- **T1.1.5:** Pause & resume: pressing Escape/P pauses accumulator ticks and restores seamlessly upon resume.

### Feature 2: 2D Camera System
- **T1.2.1:** Smooth player tracking: camera smoothly lerps toward player position with factor 0.12.
- **T1.2.2:** World boundary clamping: camera viewport never scrolls past (0, 0) or map width/height boundaries.
- **T1.2.3:** Coordinate conversions: world-to-screen and screen-to-world mappings match tile grid coordinates.
- **T1.2.4:** Directional camera shake: triggered on heavy impacts and decays over duration (e.g. 110ms–150ms).
- **T1.2.5:** Camera zoom: responsive zoom scaling across viewports without subpixel blurring.

### Feature 3: Keyboard Input System & Rebinding
- **T1.3.1:** 8-way directional inputs (WASD and Arrow keys) dispatch correct directional motion.
- **T1.3.2:** Keybind remapping: changing keybinds in settings updates input dispatch mapping.
- **T1.3.3:** Quick key taps: input buffering catches taps during step animations (`MOVE_BUFFER_PROGRESS = 0.45`).
- **T1.3.4:** Skill hotkeys: Q (spin) and E (projectile) trigger ability execution.
- **T1.3.5:** Consumable hotkeys: 1 (health potion) and 2 (speed boost) trigger inventory item consumption.

### Feature 4: High-Fidelity Pixel-Art & Nearest-Neighbor Rendering
- **T1.4.1:** Canvas CSS styling asserts `image-rendering: pixelated` and crisp rendering.
- **T1.4.2:** Pixi texture scaleMode defaults to `nearest` with `roundPixels: true`.
- **T1.4.3:** Asset textures load cleanly with no magenta missing-texture fallbacks.
- **T1.4.4:** Integer scale factors applied on high-resolution displays.
- **T1.4.5:** Cliff and terrain edges render without chroma green-screen fringe or texture bleed.

### Feature 5: Chunked Terrain & Viewport Culling
- **T1.5.1:** 150x150 map partitioned into 16x16 tile chunk containers (512x512px).
- **T1.5.2:** Culling visibility: chunks outside camera frustum have `visible = false`.
- **T1.5.3:** Culling savings: >80% of terrain chunks culled when centered in large maps.
- **T1.5.4:** Chunk boundary traversal: seamless movement across chunk edges with zero visual tearing.
- **T1.5.5:** Chunk dynamic regeneration when environmental tiles change (e.g. cut flowers).

### Feature 6: Depth-Sorted Entity Layers
- **T1.6.1:** Container has `sortableChildren = true`.
- **T1.6.2:** Entity `zIndex` dynamically updates to `Math.floor(interpolatedY)`.
- **T1.6.3:** Walking north behind a tree renders player behind tree canopy.
- **T1.6.4:** Walking south in front of a tree renders player in front of tree trunk.
- **T1.6.5:** Multi-entity overlap (player, enemies, dropped items) sorts accurately by Y coordinate.

### Feature 7: Day/Night Lighting Transitions
- **T1.7.1:** Full 480-second continuous cycle transitions across Dawn, Day, Sunset, Dusk, Night.
- **T1.7.2:** Multiplicative ambient quad darkness level peaks during Night phase.
- **T1.7.3:** Player torch cutout radius contracts dynamically from 520px (day) to 230px (night).
- **T1.7.4:** Light cutout punches circular hole into ambient quad with smooth radial falloff.
- **T1.7.5:** Portal and torch light cutouts blend without color clamping or visual overflow.

### Feature 8: Ambient Weather Particle System
- **T1.8.1:** Falling leaves particle emitter active in forest biomes.
- **T1.8.2:** Rain particle overlay activates dynamically during stormy weather.
- **T1.8.3:** Night starfield (>500 stars) renders when darkness alpha exceeds threshold (>60).
- **T1.8.4:** Particle positions wrap around viewport boundaries without unbounded memory growth.
- **T1.8.5:** Weather settings toggle (particles on/off) enables and disables particle rendering.

### Feature 9: Pixel-Art HUD & Adaptive Scaling
- **T1.9.1:** Health hearts display accurately reflects `playerHealth` / `maxHealth`.
- **T1.9.2:** Mana bar and Stamina bar update values dynamically in real time.
- **T1.9.3:** Coin counter updates immediately when picking up coins.
- **T1.9.4:** Minimap and objective compass track nearest active objective (portal/coins).
- **T1.9.5:** HUD adapts to 1080p, 1440p, and 4K viewports without pixel blur or layout breakages.

### Feature 10: Seeded Procedural World Gen & Connectivity
- **T1.10.1:** Identical seed produces identical map layout, river paths, and obstacle coordinates.
- **T1.10.2:** Main river drunk-walk carves across map from edge to edge.
- **T1.10.3:** Flood-fill detects river bottlenecks and places bridges (RAMP tiles) restoring connectivity.
- **T1.10.4:** Unreachable pruning (BFS) converts unreachable islands to solid forest, ensuring 100% pathing.
- **T1.10.5:** Guaranteed clear spawn glade around player start position.

### Feature 11: Top-Down Collision Detection & Response
- **T1.11.1:** Solid terrain tiles (FOREST, CLIFF, CAVE, BORDER) block player movement.
- **T1.11.2:** Walkable tiles (GRASS, RAMP, LOG, FLOWERS) allow free player movement.
- **T1.11.3:** River water tiles (RIVER) apply 1.5x speed reduction to player.
- **T1.11.4:** Entity-to-entity AABB pushback prevents player and enemies from overlapping.
- **T1.11.5:** Jump arc allows temporary passage over obstacles without getting stuck.

### Feature 12: Player Mechanics & Stats
- **T1.12.1:** Base stats initialize correctly: 7 HP, 100 Mana, 100 Stamina, 1 Base Damage.
- **T1.12.2:** Sprint drains stamina continuously while Shift is held down.
- **T1.12.3:** Out-of-combat health regeneration (+1 HP every 4s after 6s of taking no damage).
- **T1.12.4:** Passive mana regeneration (~3.0 mana/sec continuous).
- **T1.12.5:** Stat point allocation from level-ups correctly increments chosen attribute.

### Feature 13: Player Jump Arc & Dash Mechanics
- **T1.13.1:** Spacebar triggers jump with 5-frame parabolic height curve (48px peak).
- **T1.13.2:** Jump locks directional movement input until arc completes (500ms).
- **T1.13.3:** Jump successfully clears 1-tile wide water or hill obstacles.
- **T1.13.4:** Shift + direction triggers fast 1-tile dash (50ms duration).
- **T1.13.5:** Dash incurs 1000ms cooldown before it can be triggered again.

### Feature 14: Bestiary AI — Mantis (Melee)
- **T1.14.1:** Mantis enters aggro state when player enters 8-tile radius.
- **T1.14.2:** Mantis deals 1 damage with 0.8 knockback on attack frame 4.
- **T1.14.3:** Mantis enters panic flee state when reduced to 1 HP, fleeing opposite player for 4000ms.
- **T1.14.4:** Mantis takes damage and enters 600ms hurt i-frames when attacked.
- **T1.14.5:** Knocking Mantis into solid wall executes crush instakill with "SPLAT" VFX.

### Feature 15: Bestiary AI — Maggot (Ranged)
- **T1.15.1:** Maggot notices player at 10 tiles, engages attack at 6 tiles.
- **T1.15.2:** Maggot fires Acid Blob projectile (speed 0.15, max range 10 tiles).
- **T1.15.3:** Acid blob projectile hitting player deals 1 damage and 0.5 knockback.
- **T1.15.4:** Maggot enters panic flee state via pathfinding for 4000ms when reduced to 1 HP.
- **T1.15.5:** Maggot defeat awards 20 + 2*lvl XP and rolls 40% potion loot table.

### Feature 16: Bestiary AI — Beetle Boss
- **T1.16.1:** Beetle Boss possesses persistent global aggro, hunting player across the entire map.
- **T1.16.2:** Base HP scales as `15 + 5 * (lvl - 1)`.
- **T1.16.3:** Lunge attack surges forward during opening 4 frames of attack animation.
- **T1.16.4:** Beetle Boss is immune to solid-tile crush instakill and resists player knockback.
- **T1.16.5:** Anti-stuck watchdog: teleports to safe spot near player if distance > 40 tiles for > 5000ms.

### Feature 17: Bestiary AI — Ghost (Night Elite)
- **T1.17.1:** Ghost spawns only during night lighting phase.
- **T1.17.2:** Ghost phases freely through solid trees, cliffs, and obstacles.
- **T1.17.3:** Ghost renders with oscillating transparency (sine alpha 140 ± 40) and blue point light.
- **T1.17.4:** Ghost instantly despawns at dawn transition with "vanished" float text.
- **T1.17.5:** Ghost does not block level victory condition (`hasRemainingVictoryEnemies()` filters ghosts).

### Feature 18: Real-Time Combat & Skills
- **T1.18.1:** 3-hit melee combo: hits 1 & 2 deal standard damage; 3rd hit deals `floor(dmg*1.5)+1` critical.
- **T1.18.2:** 3rd combo hit triggers enhanced camera shake (magnitude 2.5 vs 1.5).
- **T1.18.3:** Combo counter resets if next strike is not made within 800ms window.
- **T1.18.4:** Key Q executes AoE Spin Attack: consumes 30 mana, deals 2x damage in 3.5 radius.
- **T1.18.5:** Key E casts Magic Projectile: consumes 20 mana, travels 60 frames, deals base damage on hit.

### Feature 19: Loot Drops, Consumables & Environmental Cut
- **T1.19.1:** Slashing flower tile converts it to grass with 10% coin and 15% potion drop roll.
- **T1.19.2:** Enemy defeat drops consumable potion with 40% probability (60% health, 40% speed).
- **T1.19.3:** Key 1 consumes Health Potion (+2 HP, clamped to maxHealth).
- **T1.19.4:** Key 2 consumes Speed Potion (grants speed boost for 8 seconds).
- **T1.19.5:** Using consumable with 0 count has no effect and emits warning feedback.

### Feature 20: XP Progression & Leveling
- **T1.20.1:** Level 1 requires 100 XP to advance to Level 2.
- **T1.20.2:** Leveling up multiplies next threshold by 1.5x (`xpToNextLevel = Math.floor(xp * 1.5)`).
- **T1.20.3:** Leveling up awards 1 stat allocation point and preserves overflow XP.
- **T1.20.4:** Spending stat point on Health increases maxHealth by 1.
- **T1.20.5:** Spending stat point on Damage increases base damage by 1.

### Feature 21: Tutorial Flow (Training Glade)
- **T1.21.1:** Training Glade loads dedicated 20x20 enclosed glade with daylight lock.
- **T1.21.2:** Step 0 -> Step 1: Moving through north passage advances tutorial to sprint step.
- **T1.21.3:** Step 1 -> Step 2: Sprinting with Shift advances tutorial to combat step.
- **T1.21.4:** Step 2 -> Step 3: Defeating 5 HP training dummy advances to coin collection step.
- **T1.21.5:** Step 3 -> Step 4: Collecting all 3 coins activates exit portal to proceed to Level 1.

### Feature 22: Portal Activation & Victory Sequence
- **T1.22.1:** Exit portal remains inactive until all 20 coins collected AND all non-ghost enemies defeated.
- **T1.22.2:** Portal animates from inactive to active sprite sheet upon fulfilling condition.
- **T1.22.3:** Stepping onto active portal displays Victory screen with final stats.
- **T1.22.4:** Portal interaction increments `currentLevel` and triggers procedural next stage load.
- **T1.22.5:** Stepping onto inactive portal does not trigger transition.

### Feature 23: In-Game Debug Terminal Commands
- **T1.23.1:** Pressing `~` (Backquote) or `F2` toggles terminal overlay and captures input.
- **T1.23.2:** `/kill all` command eliminates all enemies and updates HUD enemy counter.
- **T1.23.3:** `/god` command toggles invulnerability against enemy damage.
- **T1.23.4:** `/tp <x> <y>` teleports player to target coordinates.
- **T1.23.5:** `/time <phase>` transitions ambient lighting immediately to dawn/day/dusk/night.

### Feature 24: Versioned JSON Persistence
- **T1.24.1:** Game saves state to localStorage key `autosave_map` with version header.
- **T1.24.2:** Saved state preserves player coordinates, health, mana, stamina, inventory, level, coins.
- **T1.24.3:** Saved state preserves terrain tile modifications and enemy positions/HP.
- **T1.24.4:** Loading saved state restores identical game world and player parameters.
- **T1.24.5:** User settings persist under `game.settings` across browser reloads.

### Feature 25: Legacy Save Adapter (active_map.json format)
- **T1.25.1:** Successfully parses standard 150x150 legacy map payload with 22,500 tiles.
- **T1.25.2:** Successfully parses minimal 8x8 `defaultActiveMapPayload` fixture from legacy map server.
- **T1.25.3:** Converts legacy integer tile IDs (1=Grass, 2=Forest, 6=Cliff, 7=Ramp, 11=River, 103=Coin) accurately.
- **T1.25.4:** Deserializes legacy enemies (`mantis`, `maggot`, `beetle`) with health and directions intact.
- **T1.25.5:** Restores player position or relocates to nearest safe flood-fill coordinate if blocked.

---

## 4. Tier 2: Boundary & Corner Case Matrix (25 Features × ≥5 Test Cases)

### Boundary Suites
1. **Boot & Menus (`boundary-boot-menu.spec.ts`)**:
   - Empty/missing localStorage keys load default configuration safely.
   - Extremely rapid pause/resume spam (10 toggles in 200ms) leaves loop in correct stable state.
   - Viewport resizing to non-standard aspect ratios (ultra-wide 32:9, vertical 9:16, tiny 320x240).
   - Audio toggles prior to first interaction handle browser autoplay restrictions gracefully.
   - Unknown query string flags and parameters do not crash bootstrap.

2. **Simulation & Movement (`boundary-simulation-movement.spec.ts`)**:
   - Player clamped at extreme world boundaries: (0,0) and (149, 149).
   - Zero stamina: attempting sprint or melee attack aborts cleanly without negative stamina.
   - Jump arc triggered directly against solid wall or map edge lands safely without out-of-bounds clip.
   - Delta time clamping on tab backgrounding: simulated 5000ms delay clamps to 50ms and zeros backlog.
   - Simultaneous conflicting inputs (Up + Down, Left + Right) cancel out cleanly to zero displacement.
   - Diagonal movement speed scaling verified: step time equals `1.22 * baseMoveDuration`.

3. **Combat & AI (`boundary-combat-ai.spec.ts`)**:
   - Player health hard cap: cannot exceed 20 HP via stat allocations or health potion consumption.
   - Player death at exactly 0 HP: stops movement, triggers Game Over screen, respawns with full HP.
   - Attacking with 0 mana for skills Q/E displays "Need Mana!" and does not cast.
   - Invulnerability frames: taking consecutive hits within 600ms registers only the first hit.
   - Beetle boss solid-tile crush immunity: boss pushed against cliffs takes standard damage only, no crush.
   - Ghost AI dawn transition instant despawn while actively in mid-attack animation.
   - Mantis/Maggot panic state at exactly 1 HP cannot be canceled by player re-engaging.

4. **World & Persistence (`boundary-world-persistence.spec.ts`)**:
   - Corrupted/truncated JSON in `autosave_map` falls back to fresh world with warning.
   - Legacy save with wrong `persistentGameId` or altered grid size rejected gracefully.
   - Viewport camera clamping at extreme map edges (no black borders or coordinate drift).
   - Spatial query with zero radius or extreme radius (beyond map bounds).
   - Rapid save/load spamming without file lock or serialization races.
   - Debug terminal extreme/malformed commands (`/tp 999999 999999`, `/health -50`, `/unknown`) output error message without crashing.

---

## 5. Verification & Test Execution Strategy
- **Playwright Test Runner Command:** `npx playwright test tests/e2e` (or `npm run test:e2e`).
- **Headless Mode:** Executed with Chromium (`--use-gl=angle` or software rasterizer fallback).
- **Diagnostics API (`window.__GAME__`):** Engine attaches a read-only state inspection and simulation control handle in test/demo environments, allowing reliable assertions on coordinates, health, timers, and enemy states without flaky pixel-only scraping.
