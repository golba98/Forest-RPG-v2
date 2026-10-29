# Rain, wet ground and river repair

Visual follow-up: the user approved the repaired river structure and requested the original water appearance. The original water texture detail, shallow/foam edges and animated pixel glints are restored; channel geometry, flow direction, rain, wetness and gameplay fixes remain. [Current river appearance](evidence/weather-rivers/restored-river-look.png). Earlier screenshots, recording and rendering performance figures below document the preceding visual iteration.

Implemented on 2026-10-29 against clean commit `dc52edf`. The referenced attachments/current browser save were unavailable; repository seeds 42, 123, 1 and 1337 were selected as the baseline. The reproduced version-8 scene is seed 42, normal level 1, player `(23.5, 87.5)`, viewport 1280×720, daylight 0.5, default rendering settings.

## Confirmed causes and resulting behaviour

- Splash centres were recalculated from the visible rectangle every frame. They therefore followed the camera despite using a world-transformed layer. Flights and impacts were unrelated, and no surface/height sampling existed. Each new flight now owns its landing point; impacts retain that position and sample grass, soil, river, actual puddle or supported deck.
- Main-river stamps measured integer offsets before flooring fractional centres; small radii produced single-cell stamps along diagonal motion. Guided walks added independent random neighbours and could jump to another map edge mid-course. Diagonal repair excluded the large central clearing. New channels use densely sampled swept strokes, gradual widths and connected branches.
- A later spawn-clearing pass replaced water with grass, and later reachability passes could replace more water. Channels now avoid the spawn reservation before carving; later passes preserve river terrain.
- Mud generation spread random 3×3 neighbourhoods inland, then rendered a large texture as full square tiles. New mud follows coherent patches immediately beside water; loaded mud keeps its terrain classification but gains grass fringes and rounded transitions.
- Shore rendering overlaid a bright foam strip on every exposed side. Independent strips accumulated at corners. The first iteration replaced that border; the visual follow-up restores the original shallow/foam overlays at the user's request.
- Animated crests restarted inside every tile and always travelled right. A deterministic field derived from saved water cells now directs pooled world-space crests through bends and across tile/chunk boundaries. Closed ponds stay near-still.
- Chunk rendering already used the entire terrain grid for neighbouring cells. No generation-at-chunk-boundary fault was found. Water/bank/chunk-edge overlays remain available in debug builds for inspection.

Wetness and puddle storage advance at 5 Hz in simulation state. Stable seeded masks select eligible flat grass/soil and avoid structures and solid scenery. Wetting takes roughly 10 seconds; sustained rain grows shallow pools after saturation. Wetness dries over approximately 90 seconds and stored puddles drain over up to 120 seconds. Hidden chunks continue to evolve. Pausing or closing the game freezes simulation time. Save/load preserves storage to byte precision; positions and masks stay fixed.

Ground effects are beneath scenery, deck effects are above supported decks, and screen/HUD layers retain their order. Sampling rejects cliff faces, solid footprints and nest art coverage. Footsteps require real resolved grounded movement through a puddle mask. Wet patches and puddles never change river tiles, swimming classification, movement speed, enemy navigation or bridge support.

## Existing saves

Rendering improvements apply to all loaded worlds. Full river course and width changes apply to newly generated version-9 worlds. A separately versioned, idempotent correction handles known local defects in non-tutorial generator-7/8 saves. It protects all prop/actor placements, spawn and objective areas, encounter reservations and bridge approaches, then verifies that existing reachable dry cells retain their ground route. Unsafe proposals remain unchanged; original saves are not automatically overwritten on load.

For the captured version-8 save, 16 cells changed and corner-only contacts fell from 13 to five. Protected contacts remain at `(45,15)`, `(24,78)`, `(36,94)`, `(46,100)`, `(47,102)`. The isolated-looking water at the top of the matched screenshot is one such preserved contact. Prop and bridge records remain identical. Older/legacy versions receive visual improvements without unverified terrain rewriting. The encounter migration cutoff stays at version 8, so the terrain bump does not introduce new nests or reset progress.

## Evidence and checks

Lossless gameplay captures:

- [Before, clear](evidence/weather-rivers/before-clear.png) / [after, clear](evidence/weather-rivers/after-clear.png).
- [Before, rain](evidence/weather-rivers/before-rain.png) / [after, sustained rain](evidence/weather-rivers/after-rain.png).
- [Puddle footstep](evidence/weather-rivers/puddle-footstep.png), [rain on a bridge](evidence/weather-rivers/rain-bridge.png), [drying](evidence/weather-rivers/drying.png), [dry terrain](evidence/weather-rivers/dry.png).
- [Normal 2× gameplay zoom](evidence/weather-rivers/rain-normal-2x.png), and new-world river views for [42](evidence/weather-rivers/new-seed42.png), [123](evidence/weather-rivers/new-seed123.png), [1](evidence/weather-rivers/new-seed1.png), [1337](evidence/weather-rivers/new-seed1337.png).
- [31-second motion capture](evidence/weather-rivers/surface-weather.webm): rain, camera movement, puddle crossing, bridge crossing and drying. Accumulation/drying use the existing 8× debug time scale; particle animation stays in real time. The fixed fixture isolates weather from combat.

Visual review inspected these gameplay captures at 1×/2× pixel zoom and sampled the motion recording. Ground impacts/pools remain attached during camera movement, pools recede without relocating, dry/puddle contact remains shallow, and bridge support remains dry. The four selected new-world views show connected channels and subdued banks. These observations cover the captured views; they are not an exhaustive review of every seed or animation frame.

Automated verification:

- `npm run typecheck`, `npm run lint`, `npm run build`: pass. Vite retains its pre-existing large-Pixi-bundle advisory.
- `npm test`: 54 files, **485 tests passed**, including combat direction/aim, collisions, nest emergence/collision, bridge support, save validation, and the 100-seed topology/repeatability sweep across several sizes/difficulties.
- Focused Chromium/Firefox suite: **48 distinct checks validated** across bridge spans/orientations, raised banks, swimming, collision/navigation, encounters/nests, saves, and surface weather. Initial run: 46/48 passed; the two drying failures were corrected test timing (100ms requested ticks were clamped to 50ms by the existing loop). Re-run of the four surface-weather checks: 4/4 passed. After tightening bank-soil generation, the six natural-crossing/regeneration cases also passed again in both browsers.
- New coverage includes central diagonal contacts, swept channels crossing chunk edges, isolated river cells, spawn clearing, protected/idempotent save repair, bank soil placement, fixed impact coordinates, bounded effects, moisture persistence/drying, and actual puddle footsteps. Whole-world replacement fixtures explicitly discard moisture belonging to their previous dimensions.

## Performance and limits

Paired Chrome 156.0.8078.4 measurements use the same version-8 saved scene and actors at 1280×720 on an Intel i7-13700. Each sample collects 180 real animation frames after warmup. The original build was built independently from `dc52edf`; the working build loads the same save with its scoped repair.

| Sustained rain | Before | After |
|---|---:|---:|
| Median frame interval | 16.7 ms | 16.7 ms |
| p95 frame interval | 16.7 ms | 16.8 ms |
| Browser task time per sampled frame | 2.98 ms | 3.42 ms |
| Forced-GC JavaScript heap | 55.7 MB | 61.6 MB |

New rain remains bounded by 256 flights, 96 rain impacts, 24 footstep effects, and 96 water crests. Surface graphics rebuild at 5 Hz or when the visible tile range changes; terrain chunks retain static caching. Measured frame cadence stays near 60 Hz. Browser task time is not isolated GPU/render timing; heap excludes GPU memory. One short sample is not a leak test or a guarantee at higher refresh rates.

A separate sequential headless comparison of seeds 1–20, after three warmups, measured generation mean 299→347 ms, median 306→235 ms, p95 564→804 ms. Generation retries remain seed-dependent; the sampled tail is slower. The generic benchmark also completed; it overlapped capture work and should not be compared with isolated historical numbers. Raw [frame/heap](evidence/weather-rivers/performance.json), [generation](evidence/weather-rivers/generation-performance.json), [repair](evidence/weather-rivers/repair-observations.json) and [visual observations](evidence/weather-rivers/visual-observations.json) are retained.

Puddles use seeded shallow basins on eligible flat terrain rather than a new physical hydrology/elevation simulation. Existing protected save gaps can remain. Entirely different old generator versions are not automatically remodelled. Static native-pixel masks still follow the game's tile representation; screenshots should be viewed at native resolution when judging pixel size.

## Changed code and assets

- Generation/topology: `src/world/generation/{rivers,mud,placement}.ts`, `WorldGenerator.ts`, new `RiverTopology.ts`, new `RepairRivers.ts`; generator metadata and fixed encounter compatibility in `src/types/world.ts` and `EncounterPlacement.ts`.
- Simulation/persistence: new `src/systems/SurfaceMoisture.ts`, `src/simulation/Simulation.ts`, `src/persistence/SaveManager.ts`, runtime/render types and debug weather wiring in `src/main.ts`.
- Rendering: `waterArt.ts`, `terrainArt.ts`, `PixiRenderer.ts`, `DebugOverlay.ts`, `effects/{WeatherLayer,WaterLayer}.ts`, new `effects/SurfaceWaterLayer.ts`.
- Tests: new river, moisture, weather and browser cases; water art, topology and save regressions; existing browser fixture setup clears incompatible moisture when replacing worlds.
- Reproduction: `scripts/capture-surface-weather.mjs`, `scripts/profile-surface-weather.mjs`; rendering, generation, save-format, asset and testing documentation.

All bank/soil/water additions are procedural project-authored 32px textures and native-pixel geometry. No external artwork or third-party licences were introduced. Existing bridge, collision, combat and nest assets/behaviour remain covered by their regressions. Run locally with `npm run dev`; build with `npm run build`.
