# Rendering

Portal asset loading: `assetCatalog` registers the existing `portal_forest.png`
through renderer extras when an older manifest omits it; the asset-regeneration
script also retains the alias. Omitting that entry previously reproduced the
magenta/black missing-art checker. Portal views now contribute to
`placeholderSprites`, and debug `portalTextures` reports the actual bound texture
dimensions and fallback status. The original portal artwork and state effects
are unchanged. `tests/e2e/portal-assets.spec.ts` checks both manifest variants,
save/reload, actual checker pixels, and deliberate image-load failure.

PixiJS renders cached terrain chunks, depth-sorted entities and props, light, weather and the HUD. Terrain uses nearest-neighbor sampling and integer camera scaling. Sprite animation resolves frames from sprite sheets; the camera follows the interpolated player.

## World visibility and residency

`WorldData` remains the authority for terrain, placements and saved mutations.
`WorldObjects` derives a disposable spatial catalog from those records and the
existing forest-tree planner. Its index covers complete visual bounds across
chunk boundaries. Native atlas frames, ground-contact depth and stable catalog
order determine the same appearance after eviction and recreation. Rendering
never generates authoritative objects or changes collision or AI activation.

`WorldVisibility` works entirely in world pixels using the inverse of the exact
snapped camera transform. The visible region intersects full sprite bounds;
preparation adds the native canopy reach, a worst-case frame of movement in all
directions, and 250 ms of measured camera motion. The configured maximum dash,
speed potion and sensitivity combination is approximately 789 world pixels/s.
Retention adds a 512-pixel chunk ring and five seconds of recent residency.

`TerrainChunks` prepares 16×16-tile chunks in tile-sized steps, normally spending
up to 2 ms per frame and baking at most one background chunk. A completed chunk
owns a nearest-neighbour render texture; temporary terrain sprites and sparse
soil atlases are released after baking. Visible content is completed before
presentation. Initial loads, teleports and abrupt viewport/zoom changes prepare
their immediate working set synchronously and can take a longer frame.

The owned-texture target is 64 MiB, including a conservative staging reserve.
Required preparation resources are pinned; if a viewport requires more than the
target, its computed working set determines the explicit larger budget. LRU
eviction limits retained extras. Shared decoded artwork remains reusable; prop
sources warm on entering preparation. Render textures disable automatic texture
GC, are explicitly destroyed on eviction, and rebuild after context restoration.
Offscreen tile changes never allocate a distant chunk, and removed props leave
the catalog even when they have no resident sprite. These caches are not saved.

Clouds retain parallax and thinning over the player. Both silhouettes share one
projected formation position and a fixed sun offset. Runtime births occur beyond
the preparation rectangle; lifetime expiry waits until both silhouettes are
offscreen. The formation count is capped at 64. Leaves and fireflies retain
world-space drift/orbit anchors and recycle beyond a 96-pixel screen margin.

Debug `getResidency()` reports resource bytes, queue depth, preparation/render CPU
time, evictions and urgent misses without constructing full object diagnostics.
`getInfo().worldObjects` distinguishes catalog existence, residency and visibility;
`hilltopViews`, `propViews` and bridge sprite counts describe instantiated views.
The debug-only `setZoom()` exposes the existing renderer zoom control for QA.

Hills are autotiled from elevation topology with a generated, project-owned cliff tileset (`scripts/build-hill-tileset.mjs`): every 8-neighbour configuration has a frame (plateau top, rims, south cliff faces, inner/outer corners, contact shadow). Forest trees are planned so every solid forest tile is visibly covered. Entities animate through `EntityAnimator` (clip restarts on state change, attack telegraphs, hurt flash, death fade); portals through `PortalView` (locked / reacting / open / transitioning, see `docs/contracts/visual-contract.md`). Press F3 in debug builds for the collider / sprite-bounds overlay.

Clouds are high, soft-focus and parallaxed with matching ground shadows, clipped to world bounds; settings control clouds, ambient particles, stars, fireflies, lighting and camera shake. Water clips the lower part of a grounded player's sprite and draws ripples; jumping lifts the character out of that effect. The HUD provides health, resource bars, inventory counts and a minimap. Menus use a video backdrop with a static woodland fallback. The portal, mud and backdrop include new artwork; icon sizes are provided for browsers and installed apps.

Visual acceptance remains a human review concern: the provided screenshots and automated browser checks cannot establish that every asset, scene and resolution meets the requested production quality.

Rain flights own fixed world-space landing positions; separate ground/deck layers draw terrain-specific impacts beneath scenery and the HUD. River and puddle ripples are clipped to their sampled surface. `SurfaceMoisture` owns terrain wetness and shallow puddle storage at 5 Hz, independently of rendering visibility and particle settings. Seeded irregular puddles accumulate on eligible flat ground, persist offscreen and across save/load, and drain after rain stops. Grounded movement through their actual masks produces footsteps; puddles never become river tiles or trigger swimming.

The original 32px water body textures, bright shallow/foam edges and pixel highlights are retained at the user's request. Soil and land-side bank textures retain the repaired mud transitions. Eight-neighbour masks use complete world terrain, including across 16-tile chunk boundaries. Moving crests follow a deterministic component flow field toward an outlet, retain world positions across tiles, and remain below decks. F3 also exposes water-cell, bank and chunk-edge overlays. Debug weather preview drives both the simulation and renderer.

Hilltop decoration inventory (Milestone 1): `rock_boulder` is substantial and now renders once through the actor/prop layer. `bush_small`, the three flower variants, and `rock_pebble` remain passable terrain decoration. No hilltop trees or logs were generated by this decoration list; existing tree/log world props retain their object semantics. The legacy coordinate hash and 0.9-scale, pixel-snapped boulder artwork are shared by generation, collision and rendering. Boulder depth uses the scaled ground-contact anchor in the same coordinate system as character feet. Raised objects have no screen-space translation in physics: their footprints and the continuous player bypass must fit wholly on raised terrain. Loading a world destroys/rebuilds terrain caches; no baked hill boulder is emitted, even for relocated/omitted candidates.

Bank soil uses a continuous material field (`soilMaterial.ts`) reconstructed from
saved cell centres. Water supports a bank up to the shoreline but cannot create
soil on its own. Soil/grass transitions and pigment sample world coordinates,
including across chunk boundaries; terrain IDs and movement rules remain
authoritative and unchanged. `SoilArt` packs only affected low-ground tiles into
a sparse chunk atlas. It is composed after grass and before flowers/contact
shadows, and released on chunk replacement, world load and renderer teardown.
This replaces the old nearly opaque `soil_patch_*` stamps and their tile-local
clipping, rather than adding a covering effect. Water, cliff, stair and bridge
art retain their own surface geometry. Browser coverage is in `tests/e2e/riverbank-material.spec.ts`; captures are written
to ignored per-test output directories (see [testing](testing.md)).

## Directional effects and HUD

Punch presentation uses the simulation's locked attack direction, swing ID, combo and elapsed time. Slashes follow the interpolated player origin and do not restart after missed frames. The remastered player sheets have independently authored directions whose filenames match their visible facing. The old southwest run mirror and diagonal attack alias swaps applied only to the replaced artwork; simulation direction selection remains unchanged.

The bottom HUD uses the pure `hudLayout` function with viewport size, UI scale and safe-area insets. It shows existing resources, progression and potion shortcuts. The minimap cycles through radar, full and hidden modes. Browser rendering checks cover resizing, effects lifetime, pause/resume, world replacement and map controls.

## Woodland art and treasure

World-art overhaul: `vegetationArt.ts` selects native source rectangles from the licensed LPC
Trees and LPC Flowers / Plants / Fungi / Wood atlases. Tree frames are 64×64 (young/compact),
64×96 (tall) and 96×128 (broad); plant frames are 32×32. Explicit root anchors align with the
existing narrow trunk footprints and ground-depth convention. Canopies remain passable. Transparent
logs now sort with actors; all solid props use their ground-contact depth, matching character feet.
Source alpha includes contact shadows; no resizing, smoothing, recolouring or generated substitute
art is applied. Atlas views share cached sources through `TextureStore.getRect` and are destroyed
without freeing the shared source. Attribution and CC BY-SA 3.0 travel with the public assets.

Generator v12 reserves the larger native canopy envelope around encounters, bridges and stairs.
Earlier saves use complete compact source trees without moving props or rewriting terrain. River
banks favor broad trees and ferns; dry floor slots vary between flowers, grass and mushrooms.
Pink/yellow flowers, terrain flower cells and hilltop vegetation all use LPC frames. Population
sizes are not increased. Bridges, hilltop boulders and their placement remain unchanged.

`lootArt.ts` retains the project-authored coin spin and four-frame wooden/reinforced chest art
from the preceding overhaul. The rejected procedural vegetation implementation was removed.

`LootView` observes committed balances for a transient +N label and chest particles. Interaction
hints share the simulation reach check. Opening animations read saved simulation progress;
particles and floating labels are cosmetic and are reset on world load.

## Player remaster

The approved artwork is the version previously labelled “Rejected remaster” in the review UI. All 56 strips / 456 frames are restored byte-for-byte. `docs/assets/source/player-remaster/approved-hashes.json` records their SHA-256 hashes. `node scripts/prepare-player-remaster.mjs` reproduces this exact set; the later fixed-head/procedural-body experiment is archived and its builder defaults to ignored artifact output.

The sprite cells remain 64×64 at one world pixel per source pixel, with source foot `(32,54)` and the unchanged 10-world-pixel foot offset. Visible dimensions, palette, silhouette, outlines and transparent padding are unchanged. Shadow/ripple sizing, collision and camera scale remain unchanged.

Locomotion continues to use eight poses per 64 world pixels travelled, preserving phase when switching between walking and running. On stopping, presentation settles through at most two existing chronological poses over at most 80 ms of simulation time. `scripts/player-flow/analyze-poses.mjs` selects the nearest idle join from the current and next two poses using opaque pixel and silhouette differences, without altering any PNG. A zero-step join lasts 40 ms. The settled phase carries into the next stride. New movement, attacks, jumping, damage/death, facing changes, teleports and world resets cancel settling immediately. Simulation movement is never delayed.

Idle remains six frames / 1200 ms; jump remains eight frames / 500 ms. Punches keep nine unchanged drawings, with pose durations `[40,40,40,60,40,30,30,40,40]` ms. Wind-up ends at 120 ms, the impact drawing holds for 60 ms, recovery eases through the remaining drawings, and the clip ends at 360 ms. All three combos use this presentation schedule; authoritative strike time, direction and hit detection are untouched. Optional `ClipDef.frameDurationsMs` supports pose dwell times; other clips retain uniform timing. `EntityAnimator` continues to forward the simulation-owned attack clock.

### Playback comparison

`npx vite --config scripts/player-study/vite.config.mjs` serves `http://localhost:4328/scripts/player-study/review.html`, defaulting to **Approved remaster / Improved flow**. Both playback options use the same artwork. A development-only transform disables the new playback settings for **Previous timing**; normal production has no URL-dependent playback switch. The old artwork comparisons remain archived in source/evidence folders rather than being presented as approved alternatives.

## Streamed coordinates and viewport preparation

The renderer consumes a bounded local world window. On an origin shift it
translates the camera, resident terrain sprites, actor presentation and effects
by the same integer tile offset. Terrain keys are rebased while owned texture
sources retain their global identity. Soil grain, tree variants and water glints
sample global tile coordinates; legacy props retain their source generation
version for artwork selection. Offscreen portal presentation is culled.

Window dimensions do not clamp a streamed camera. Resize and zoom requests first
prepare enough surrounding chunks, then apply the new viewport; newer requests
supersede older ones. The regional map uses only local pixels and discovery
masks; its larger view keeps a 128-tile region centred on the player. Chest and encounter presentation caches discard entries outside the
current view. See [performance](performance.md#infinite-world-streaming) for
measured residency and frame pacing.
