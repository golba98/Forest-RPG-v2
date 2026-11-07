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

## Biome environment rendering

Streamed v14 restores the original native LPC forest trees and grass presentation.
The other biomes use their curated generated species and LPC understory selections.
`vegetationArt.ts` owns native frame/root metadata; `environmentAssets.json` owns
shared generated-tree anchors and collision dimensions. Stable prop `assetKey`
values select art independent of the current window origin. Tree sprites fade to
45% opacity while covering the player. Complete sprite bounds drive culling,
including canopies rooted beyond viewport/chunk edges.

Ground starts with existing pixel-art tiles, tinted by primary/secondary biome
weights. Highlands add relief-driven stone exposure, wetlands use actual mud and
shallow-water terrain, and slopes retain the existing collision topology. Original
bridges, boulders and player sprites remain intact. Soil grain uses global coordinates
so it stays anchored during local window rebases.

Streamed versions 15 and 16 use each biome's `upland.png`: a native 360×648 atlas
with three 58-frame banks. `scripts/build-upland-art.mjs`, called by the environment
pipeline, authors irregular rock strata, moss/soil rims and four oriented stone-step
flights over the existing cliff collision silhouette. Forest, meadow, highland,
wetland and autumn materials have distinct palettes. There are 141 mask frames,
12 step frames, 15 interior frames and 6 shadow frames per pack; material skins
share geometry and are not 870 unrelated designs. Existing plateau textures and
shadows are reused. Stair overlays contain stone treads and cheeks, with transparent
ground margins. `stairGround.ts` fills the 28px passable opening using the existing
grass/plateau textures and upper/lower floor tints. The soil compositor then applies
local stone or mud coverage before the steps are drawn. This keeps the opening
opaque over its cliff while matching the surrounding material at both ends.
Source-frame pixels are cached with weak texture keys; the completed ground is
baked into the existing terrain chunk cache, with no per-frame compositing.
Metadata in `environmentAssets.json` records atlas dimensions,
variation stride, frame layout, biome support and collision dependency.

World-coordinate hashing selects variants independently of local window rebasing.
Height-relative masks expose edges between two already-raised surfaces. Highland
soil exposure stays above plateau grass but below steps, masking out cliff faces.
Relief sources load only for biomes present in the prepared window and unload with
the existing environment lifecycle. Versions 13/14 retain their legacy relief.

`prepareWorld()` deduplicates requests for tree sources and plant packs actually
needed in the nearby window. Initial entry and biome jumps await those assets;
normal streaming prepares them before publishing the next window. After old sprites
and subtextures are released, unused biome sources unload. Shared terrain and native
LPC sources remain resident. No future-biome library is loaded wholesale at startup.

Terrain uses the existing global-identity texture cache and budgeted preparation.
`__RENDER_DEBUG__.getResidency()` exposes render/cache counters;
`getInfo().environment.assetLoads` retains the last 64 fetch/decode intervals.
GPU upload time is separate. These presentation fields never replace authoritative
tile, trunk, bridge and swept-movement collision rules.

## Player remaster

The user-approved native sources live in `docs/assets/source/player-face-continuity/`, with exact source/export/runtime hashes in `approval.json`. Earlier variants are in the ignored `archive/player-character/` folder; the game does not depend on that archive. Each direction reuses the exact first-idle head and open eyes at explicit integer offsets. Core poses keep that head's contour, shading and eye spacing. Idle has one-pixel head breathing; locomotion and combat retain their body poses, with local neck corrections and original fist overlays.

The set still contains 12 idle, 16 walk, 16 run, 16 jump and 18 frames per punch in eight directions (912 slots). The lossless packer exports 64×64 PNGs to 56 strips. Counts, timing, palette and gait offsets are unchanged. This is assisted source-pixel correction, not a redesign or resolution increase.

`PlayerBlink` advances from snapshot elapsed time independently of animation/action time. A separate seeded cosmetic random stream selects 2.8–5.2 second open intervals. Opaque authored eyelid patches close for 40 ms, remain closed for 60 ms and reopen for 60 ms. Both eyes share the same phase. All living actions support blinking; rear-facing heads have no visible eyes. Pause, displayed impact holds and death freeze the clock without catch-up. Session replacement resets it.

`PlayerPoseController` still limits action transitions to 60 ms, or 80 ms when stopping. `PlayerNativePresenter` preserves unblinked history on rapid retargets. `PlayerFace` keeps the exact head at an interpolated integer position while the existing body transition runs; head contours and facial materials are never morphed. Foreground fists remain in front of the eyelids. Facing cancellation and locked attack-facing behavior are unchanged.

`PlayerCompositor` uses ordinary PNG rectangles for open-eye core frames and one reusable nearest-filtered 64×64 RGBA texture for transitions or visible blinks. No alpha crossfade, smooth scaling or face filter is used. Debug `playerSprite.playerFace` records the actually displayed phase, head offset and eye rectangles, including held frames.

Strike time remains 120 ms, attack duration 360 ms and jump duration 500 ms. Foot reference (32,54), cell dimensions, scale, collision and depth sorting are unchanged. Original body pose variation, discrete one-pixel motion and fractional camera sampling remain visible limits.

Start `npx vite --config scripts/player-study/recovery.vite.mjs` and open `http://localhost:4330/`. The viewer displays only the approved character, with the same production assets and presentation code. The inspector provides native pixels, enlargement, normal/quarter speed, pause, frame stepping and **Blink now**. See [testing](testing.md#player-animation-review) and [source provenance and reproduction](assets/source/player-face-continuity/README.md).

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
