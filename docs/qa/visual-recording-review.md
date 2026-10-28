# Visual recording review and repair log

**Branch:** `visual-rendering-repair`, from `feat/forest-rpg-v2-foundation` @ 0596ad9.

**Scope:** rendering, assets, animation presentation and visual debugging. Simulation, collision, AI and generation belong to Codex (`codex/gameplay-repair`); see `docs/contracts/`.

## 1. Recordings inspected

I searched `~/Videos`, `~/Videos/Screencasts`, `~/Pictures`, `~/Downloads`, `~/Desktop` and the project for `.mp4/.mkv/.webm/.mov`. Each file was probed with `ffprobe` (all 2560×1440). Frames were extracted with `ffmpeg` at 1 fps into contact sheets, plus full-resolution crops. The recordings were not modified.

| Recording | Length | Content | Relevant |
|---|---|---|---|
| `~/Videos/Screencasts/Screencast From 2026-10-28 12-47-52.mp4` | 10.0 s | Generated world (level 1), pause menu at 0:08 | **Yes** |
| `~/Videos/Screencasts/Screencast From 2026-10-28 12-45-55.mp4` | 11.0 s | Tutorial glade, with alt-tab overviews at 0:03, 0:07 and 0:10 | **Yes** |
| `Screencast From 2026-10-27 18-39-23.mp4`, `18-37-40.mp4` | 34 s, 24 s | VSCodium Jupyter chatbot notebook | No |
| `Screencast From 2026-10-19 01-13-25.mp4` | 11 s | Unrelated FPS game | No |
| `Screencast From 2026-10-14 21-30-28.mp4` | 35 s | C++ editor | No |
| `Screencast From 2026-10-03 08-33-54.mp4` | 11 s | Desktop / the previous development session | No |
| `Screencast From 2026-09-30 22-56-29.mp4` | 21 s | YouTube Music / terminal | No |
| `~/Videos/youtube-terminal/terminal-video.mp4`, `public/assets/video/menu_vid.webm` | — | Unrelated / menu backdrop | No |

The evidence crops are in `docs/qa/frames/`.

## 2. Defects, causes and verification

All "after" evidence comes from the production bundle (`vite build` + `vite preview`), driven by Playwright in Chromium (WebGL) at 1280×720 unless noted. The "before" captures use the same spec against 0596ad9, so the pairs show identical seeds and positions.

**Reproduce:** `VISUAL_PHASE=before|after npx playwright test tests/e2e/visual-capture.spec.ts --project=chromium`.

The regression assertions are in `tests/e2e/visual-rendering.spec.ts`.

### V1: Floating pale-blue/white rectangle (Issue 1)

- **Seen in:** `12-47-52` @ 0:06, near the top-right tree (`frames/rec-124752-0m06s-bolt-rectangle.qa.png`). Generated world.
- **Reproduce:** press **R** (magic bolt), or let a maggot spit acid.
- **Root cause:**
  - `PixiRenderer.render` forced `Texture.WHITE` for every projectile, sized 10×6 and tinted `0xbfeaff`.
  - Underneath that, `Simulation.buildRenderSnapshot` sends `spriteKey: 'projectile'` for every projectile, so even without the override no art key could match. The acid-blob sheet was never used.
- **Fix:**
  - Art is chosen from `projectileType` (already in the snapshot through the entity spread): acid uses its 7-frame sheet, and the bolt is a procedural orb built to the legacy `PROCEDURAL_SPRITES` spec, with a fading glow trail.
  - `f.placeholder` can no longer map to white. The `TextureStore` fallback is now a magenta/black checker, and the renderer counts placeholder sprites.
  - On removal, projectiles emit a small coloured burst.
- **Status:** reproduced. Fixed and verified. `misc-01-magic-bolt` before shows the white rectangle; after shows the orb and trail. `check-magic-bolt` exists, and the spec asserts `projectiles > 0` and `placeholderSprites === 0`.

### V2: White translucent blobs on terrain and trees (Issue 1)

- **Seen in:** `12-45-55` @ 0:04–0:09 over the left tree line (`frames/rec-124555-0m05s-cloud-blob.qa.png`), and `12-47-52` @ 0:01–0:06 on hill rims and grass.
- **Root cause:** clouds were small (1.1–1.5×) cloud sprites at alpha 0.25, drawn in world space *above the actors* with no shadow. They read as stray white smudges on the ground.
- **Fix (the user chose "sky clouds and shadows"):** `effects/SkyLayer`:
  - The clouds are drawn at 3–4× scale, with blur, at alpha 0.3, and a 30% parallax against the camera.
  - Each cloud has a matching blurred dark ground shadow, offset for the north-west sun, drawn between the terrain and the actors.
  - Both layers are clipped to the world, and the Clouds setting still controls them.
- **Status:** reproduced. Fixed and verified in the after captures (e.g. `seed42-04-portal-approach`, `seed42-05-portal-open`).

### V3: Specks that ignore the camera; stars over the ground (Issue 1)

- **Seen in:** `12-45-55` dark border (specks). Also reproduced at night (`misc-02-night` before).
- **Root cause:** leaves (yellow `0xb5a644` ellipses), fireflies and 500 stars were drawn in **screen space** on top of the world. Leaves and fireflies stayed fixed while the camera moved, and stars appeared over the grass at night.
- **Fix:** `effects/AmbientLayer`:
  - Leaves are 2-tone pixel sprites in world space, wrapped around the view and clipped to world bounds.
  - Fireflies stay yellow (a legitimate effect) but are world-anchored glows above the darkness overlay.
  - Stars render *behind* the world root, so they only appear in the void outside it.
- **Status:** reproduced. Fixed and verified (`misc-02-night` before/after; `misc-03-tutorial` shows no specks in the void).

### V4: Hills drawn as thin orange zig-zags with blank lower areas (Issues 5 and 6)

- **Seen in:** `12-47-52` @ 0:00–0:07 (`frames/rec-124752-0m02s-hill-zigzag.qa.png`). Any generated seed (`seed{1,42,1337}-02-hill` before).
- **Root causes:**
  - **Squashed art:** `terrainArt` stretched the 96×33 / 34×92 / 77×78 rim images into 32×32 cells (`fit: 'fill'`), compressing a 3-tile strip into one tile. That produced the zig-zag.
  - **Invisible plateau:** PLATEAU, the solid hill interior, was grass tinted `0xeff3d8`, almost indistinguishable from the ground. Each map has 6,046–7,839 such tiles, about 30% of its area. Hills therefore had no visible body, and their "lower area" looked blank.
  - **No cliff face:** the art set had no cliff-face piece, so hills showed no elevation.
  - **Open corners:** the generator's cardinal-only autotile turns concave corners into PLATEAU with no rim, leaving 261–376 open corners per map.
- **Fix:**
  - A project-owned **cliff tileset** (`scripts/build-hill-tileset.mjs` → `cliff_tileset.png/json`). It has one frame per reduced 8-neighbour blob mask (47), plus plateau variants and a contact shadow, with a 2 px extruded gutter.
  - `hillAutotile.ts` picks frames from elevation topology. All 256 neighbour masks map to a non-blank frame (unit tested).
  - South edges get a rock cliff face, the ground below a face gets a soft contact shadow, and inner/outer corners close.
  - Collision topology is untouched.
- **Status:** reproduced. Fixed and verified for seeds 1, 42 and 1337 (`seed*-02-hill` before/after, `check-debug-overlay`).

### V5: Portal ignores its state (Issue 2)

- **Seen in:** `12-45-55`, top-right portal (static, tinted grey). Also `12-47-52`.
- **Root cause:**
  - The renderer forced `portal_forest` with a grey tint for every state, and ignored the `portal_active`/`portal_inactive` sheets (which are crude placeholders anyway).
  - There was no approach reaction and no transition.
  - The art was bottom-anchored at the tile **centre**.
- **Fix:**
  - **`PortalView`:** one container per portal entity, so sprites can't be duplicated:
    - **locked:** desaturated vortex.
    - **reacting:** colour flare, ring and a "Portal sealed" label, then back to locked.
    - **open:** a full-colour, ellipse-masked vortex rotating, with glow and sparks.
    - **transitioning:** a violet iris over the new world.
  - **`PortalVisualMachine`:**
    - Explicit `portalState` (Codex's contract) wins. Otherwise it derives the state from `active` plus distance hysteresis: 2.5 / 3.0 tiles and 600 ms, matching `PORTAL_RULES`.
    - All values are eased, so nothing restarts or flickers.
    - The art base sits on the portal tile's bottom edge.
- **Status:** fixed and verified:
  - `check-portal-reacting`, `check-portal-open` and `check-portal-transition` captures; `seed*-03..05` pairs.
  - The e2e spec asserts the sequence locked → reacting → locked (still near) → re-armed reacting → open (persists 1.5 s) → transition → locked in the next world.

### V6: Enemy animation contradicts AI state (Issue 3)

- **Reproduce:** spawn a mantis next to the player.
- **Root causes:**
  - `Simulation.step` only ever increments enemy `animTimeMs`. A one-shot attack clip was therefore already finished on entry and froze on its last pose for the whole attack state.
  - Idle mantises and maggots played their full walk cycle.
  - Facing flipped between rows at exact diagonals.
  - Hurt was a flat red tint, and death just vanished.
- **Fix:** `EntityAnimator`:
  - Restarts the clip clock on `anim` changes. It honours `animStartedAtMs` or a simulation reset.
  - Replays attacks with a 350 ms idle gap, plus a wind-up telegraph (squash and a red ground ring), or follows Codex's `attackPhase` when present.
  - Applies `moving === false` → idle.
  - Applies 120 ms facing hysteresis to enemies only.
  - Draws a white flash, then red with a recoil shake, on hurt.
  - Death fades and shrinks the last frame with a puff. It honours Codex's `dead` window without a double fade.
  - Idle clips are now a slow 2-frame breathe.
  - Damage, AI and timing are untouched.
- **Status:** fixed and verified (`check-enemy-telegraph`, `check-enemy-death`; `EntityAnimator.test.ts`).

### V7: Solid things that look walkable, walkable things that look solid (Issue 4)

- **Forest:** the even-grid tree layout left 150–196 solid forest tiles per map (20 in the tutorial) with no tree over them: invisible walls. `planForestTrees` covers every solid FOREST/BORDER tile (unit tested).
- **Other mismatches:** listed for Codex in `docs/contracts/visual-collision-mismatches.md`. These are the PLATEAU look, log footprints, boulders, the portal anchor, player feet and the projectile key.
- **Status:** fixed (renderer side) and verified with the debug overlay (`check-debug-overlay`).

## 3. Visual debugging tools

**F3**, in debug builds only (dev server or `?debug=1`), toggles the overlay. A checkbox panel switches its layers:
- **Colliders:**
  - Red: solid tiles from `TILE_PROPERTIES`.
  - Orange: solid props, or Codex's `queryColliders` once merged, through `setDebugColliderSource`.
  - Cyan: entity AABBs from `halfSize`.
  - Lime: portal entry and pickup radii.
- **Tile grid.**
- **Sprite bounds.**
- **Info panel:**
  - Seed, level and world size.
  - Cursor world coordinates, tile id and solidity.
  - The asset id, layer, z-index, anchor, position and frame of the sprite under the cursor.
  - Portal state and placeholder, effect and cloud counts.

`window.__RENDER_DEBUG__` exposes `setFlags`, `getFlags` and `getInfo` for tests. The overlay is off by default.

## 4. Earlier visual-repair test results (historical)

| Check | Result |
|---|---|
| `npm run typecheck` | Pass |
| `npx eslint .` | Pass (0 problems) |
| `npx vitest run` | 29 files, **238 tests pass**. 29 of them are new: hill autotile ×7, portal machine ×7, animator ×7, forest coverage ×3, manifest/frame rects ×5. |
| `npm run build` | Pass |
| `tests/e2e/visual-rendering.spec.ts` + `visual-capture.spec.ts` (Chromium) | **8 / 8 pass** |
| Full Chromium e2e | 72 pass, 12 fail. **The same 12 fail on the untouched base (0596ad9):** `tier1-feature` simulation/terminal and `tier2-boundary` combat/movement/terminal cases, unrelated to rendering. |
| **Trial integration** with `codex/gameplay-repair` @ 4f0957a, in a scratch worktree (not committed) | Two trivial conflicts (`src/types/render.ts` field union; prettier-reformatted `src/main.ts`). Typecheck passes; **287 unit tests pass**. Codex's `gameplay-repair.spec.ts`, `portal-flow.spec.ts` and the visual specs all pass (**10 / 10**). The overlay draws Codex's per-object colliders. |

Resizing (800×600, 1920×1080), camera movement (teleports and pans), regeneration ×5 (no actor leak, one portal view, zero placeholders) and seeds 1, 42 and 1337 are all covered by the specs above.

## 5. Remaining issues and notes

- **Simulation-side requests (Codex):**
  - Set `spriteKey` to the projectile type.
  - Export the portal entry radius. The renderer still has `PORTAL_ENTER_RADIUS_ASSUMED = 0.8` and should import `PORTAL_RULES.entryRadius` after the merge.
- **Transition detection:** the derived transition fires when a world swap follows a frame with an open portal within 1.6 tiles of the player. An explicit `portalState: 'transitioning'` from the simulation makes this exact.
- **East/west hill walls are thin rims, not faces.** The top-down ¾ convention shows faces only on south edges. RAMP tiles have no cliff-aware art; the current generator never produces RAMP tiles.
- **Cloud look:** the cloud PNGs are low-resolution pixel art. Soft-focus scaling reads as high clouds, but a dedicated larger cloud asset would look better.
- **Human visual sign-off is still needed.** Automated checks prove that states, counts and positions are correct; art quality at every zoom and resolution is a judgement call.

## 6. Minimap and combat-effects follow-up — 2026-10-28

Completed in the visual repair worktree on `visual-rendering-repair`.
the renderer's existing minimap, combat effects, aim assist and AI changes are preserved.

The slash and spin were already wired correctly. Installing Playwright's clock
**before navigation**, advancing it explicitly, and freezing it for screenshots
captures both effects at 80 ms. The regression tests check canvas pixels as well
as effect counts, including the white slashes, gold third-hit finisher and blue
spin ring. Separate fights exercise melee impacts and the player's white flash,
red tint and alternating invulnerability opacity.

Two defects were reproduced and fixed:

- `EffectsLayer.clear()` left an active portal transition and its drawing alive.
  Clearing now resets the transition too; portal entry still starts a fresh one
  after the world changes. A unit test failed before this fix and passes afterward.
- The tutorial's viewport is larger than its world, so the full-map camera frame
  extended across the surrounding HUD. Its rectangle now represents the visible
  intersection with the world. A browser pixel test failed before the fix and
  passes afterward.

The debug-only `getInfo()` result now includes read-only `minimapMode`.
No production renderer or simulation interface changed. New effects-layer tests
cover geometry, expansion, expiration, pause/resume, sprite cleanup and transition
cleanup. Browser checks also cover M cycling, player centering, the off-map portal
arrow, the full-map viewport frame, regeneration, and layouts at 800×600,
1280×720 and 1920×1080.

| Final check | Result |
|---|---|
| Typecheck (included in `npm run build`) | Pass |
| `npm run lint` | Pass |
| `npm test -- --reporter=dot` | **38 files, 312 tests pass** |
| `npm run build` | Pass; existing Pixi bundle size warning remains |
| `npx playwright test tests/e2e/visual-rendering.spec.ts --workers=1` | **20 / 20 pass**, 10 each in Chromium and Firefox |

Run these commands from the visual-repair worktree. Use `npm run dev` for local
play; use **E** for melee, **Q** for spin, and **M** to cycle minimap modes.
The complete unrelated gameplay/browser suite was not rerun for this follow-up.

Screenshots are attached by name in `playwright-report/index.html` and saved in
the corresponding `test-results/visual-rendering-*` directories, separately per
browser. Evidence includes `slash-{1,2,3}-80ms.png`, `spin-80ms.png`,
`melee-impact-160ms.png`, `hurt-white-flash.png`, `hurt-red-tint.png`,
`hurt-blink-{a,b}.png`, `minimap-radar.png`, `minimap-full-{800,1280,1920}.png`,
and `tutorial-full-map.png`. The finisher, spin, hurt tint, radar arrow and corrected
tutorial panel were also inspected visually. Generated captures and reports remain
ignored build/test artifacts.

## 7. Shared forest-and-gold menu theme — 2026-10-28

All menu surfaces now follow the HUD/minimap palette: forest-green panels,
cream text, muted gold borders and moss-green selections. ForestPixel headings
and main actions use the bundled font; settings labels and values use readable
monospace text with fallbacks for translated characters. The woodland video
and its poster fallback remain behind the main menu.

`src/ui/theme.css` now contains shared tokens and component styles instead of
overlapping settings/main-menu overrides. `src/ui/GameShell.ts` supplies common
panel/action classes and structured settings rows. Main menu, pause, welcome,
character, victory and game-over use the same panel/button treatment. Settings
retains its five categories, scrolling body, and persistent header/footer.

Content scaling uses font/spacing variables rather than whole-panel `zoom`.
Narrow layouts use horizontally scrolling category navigation, stacked settings
rows and stacked footer actions. Labels wrap without horizontal content overflow.
Desktop navigation scales wide enough for the translated category names.
Native controls and their labels remain intact, with at least 44 px interaction
targets (checkboxes use their surrounding label row).

Two related interaction issues were corrected: focus trapping now skips hidden
and disabled controls, and a failed menu video no longer substitutes its poster
behind settings opened over a paused world. Menu touch scrolling is enabled
without changing the canvas interaction policy during gameplay.

| Final check | Result |
|---|---|
| Typecheck (included in `npm run build`) | Pass |
| `npm run lint` | Pass |
| `npm test -- --reporter=dot` | **38 files, 312 tests pass** |
| `npm run build` | Pass; existing Pixi bundle size warning remains |
| Menu theme, presentation, onboarding and localization browser suites | **30 / 30 pass**, 15 each in Chromium and Firefox |
| Touch scrolling, Chromium mobile emulation at 390×844 | Pass; a swipe moved the settings body from scroll position 0 to 265 |

Browser coverage checks all five settings categories at 1920×1080, 1280×720,
800×600 and 390×844; Compact/Default/Large UI scales; English/Spanish/German;
footer reachability; keyboard focus; rebinding and cancellation; resets;
persistence; onboarding; returning to gameplay; and blocked-video fallback.
Main, pause, welcome, character and game-over captures use ordinary UI flows.
Victory was inspected through the existing `onSceneChanged('victory')` hook in
a temporary browser-only fixture; this change does not add a victory trigger.

Before/after captures were inspected together at matching viewport sizes.
Representative raw PNGs are retained locally under `docs/qa/screens/menu-theme/`
(ignored QA artifacts). Full per-category/per-browser captures are attached to
`playwright-report/index.html` and stored under `test-results/menu-theme-*`.

| Surface | Before | After |
|---|---|---|
| Main menu, 1920×1080 | [Before](screens/menu-theme/before-main-menu.png) | [After](screens/menu-theme/after-main-menu.png) |
| Settings, 1920×1080 | [Before](screens/menu-theme/before-settings.png) | [After](screens/menu-theme/after-settings.png) |
| Pause, 800×600 | [Before](screens/menu-theme/before-pause.png) | [After](screens/menu-theme/after-pause.png) |

Additional inspected captures: [800 px settings](screens/menu-theme/after-settings-800.png),
[German controls at Large scale on a narrow screen](screens/menu-theme/after-settings-small-german.png),
[welcome](screens/menu-theme/after-welcome.png), [character](screens/menu-theme/after-character.png),
[game over](screens/menu-theme/after-game-over.png), and [victory](screens/menu-theme/after-victory.png).

Reproduce from the visual repair worktree:

```sh
npm run dev
npm run build
npx playwright test tests/e2e/menu-theme.spec.ts tests/e2e/presentation.spec.ts tests/e2e/onboarding.spec.ts tests/e2e/localization.spec.ts --workers=1
```

The renderer, gameplay, settings storage schema and existing test IDs are
unchanged by this menu pass. No dependencies or production image assets were added.
