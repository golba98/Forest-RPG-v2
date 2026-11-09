# Architecture

The Vite entry point composes the event bus, input manager, game, simulation, renderer, audio and DOM shell. `Game` owns scene transitions and a fixed-step loop; `IntentMapper` turns frame-based input into fixed-step intents. Gameplay is measured in tile units, while the renderer interpolates previous and current entity positions.

`src/types` defines the simulation and renderer boundaries. `src/world`, `src/systems`, `src/simulation` and `src/persistence` are headless; an ESLint restriction prevents them importing Pixi or UI code. The Pixi renderer consumes snapshots and does not decide combat, movement or portal rules. Menus, settings and the debug terminal use DOM overlays.

Generated world data, entities and runtime state can be saved locally. `window.__GAME__` is installed only in development or when the debug query parameter is enabled; its commands are for inspection, not an authentication boundary.

`LandscapePlan` borrows authoritative world/generation records and exposes shared terrain, region, reservation and clearance queries. Hilltop objects and woodland consume its protections; `LandscapeAccess` runs the existing required-access checks at their original stages. Component/summit caches are lazy and disposable, keyed by world identity and explicitly invalidated at in-place mutation seams. Physics remains owned by `CollisionSystem`; planning never substitutes tile labels for swept footprint checks. See `world-generation.md` for stage ownership, consumer-specific policies and Milestone 3 extension points, and `save-format.md` for the separate schema/generator/migration contracts.

Streamed worlds have a headless chunk source, a versioned five-biome generator,
chunk/window coordinate helpers, a biome registry and an infinite session. The
session presents a bounded camera-local `WorldData` adapter to existing gameplay
systems. `WorldData.window` distinguishes this view from a finite map; dimensions
in a streamed view are never global world dimensions. Baseline chunks and sparse
persistent changes are authoritative. The composition root connects asynchronous
viewport preparation and persistence without adding Pixi dependencies to world
or simulation code. Worker failure uses the cooperative generator fallback.

World creation, streamed saves, loading and file export are asynchronous. The
finite compatibility adapter keeps its synchronous export/fixture interfaces;
`SaveManager.exportFile()` supports both formats. Streamed slot restoration uses
copy-on-write revision references instead of loading every visited area. See
[world generation](world-generation.md#streamed-worlds) and
[save format](save-format.md#streamed-worlds-schema-3) for the concrete contracts.

## Ownership and module boundaries

Keep the existing subsystem directories rather than adding a parallel engine hierarchy:

| Owner                                               | Responsibility                                                                                                 |
| --------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `bootstrap.ts`, `game/Game.ts`, `core/`             | Composition, scene lifecycle, fixed loop, typed events and input                                               |
| `simulation/Simulation.ts`                          | Authoritative world, actors, clocks, gameplay updates and stream window installation                           |
| `simulation/streaming/StreamingCoordinator.ts`      | Active/pending sessions, cancellation epochs, asynchronous preparation, publication and transition persistence |
| `world/generation/`, `world/infinite/`              | Finite terrain stages and versioned streamed generation, chunk sources and residency                           |
| `systems/`, `entities/`                             | Movement, collision, combat, encounters, loot and portals                                                      |
| `rendering/PixiRenderer.ts`                         | Camera, terrain, layer composition and frame order                                                             |
| `rendering/entities/EntityLayer.ts`                 | Actor animation/views, portal views, shadows, wading masks and view cleanup                                    |
| `animation/PlayerSheets.ts`                         | Shared player animation/direction names and texture aliases                                                    |
| `ui/GameShell.ts`, `ui/settings/SettingsMenu.ts`    | Menu navigation and settings controls, with explicit listener teardown                                         |
| `persistence/SaveManager.ts`, `persistence/codecs/` | Save/library orchestration and finite save/entity validation; storage formats remain separate contracts        |

The streaming coordinator holds session orchestration state once. It asks the simulation to install a prepared window; it does not own a second player/world copy. The entity layer consumes a frame context and never decides gameplay. Settings return a teardown callback so leaving a key-binding screen cancels temporary keyboard capture.

Use direct imports from each owner. `NestGeometry` receives the swept-path predicate from its caller, avoiding a runtime dependency cycle with `CollisionSystem` while keeping physical rules in collision. Save readers share record/finite predicates, but retain format-specific limits. Audio uses the core event contract rather than a second bus interface.

Finite generator 13, tutorial fixtures, streamed generator versions 13–16, old save readers, key-binding conversions and cooperative worker fallback are active compatibility paths. Keep them until their consumers and stored formats can be deliberately migrated. Historical player review tools and source artwork are development evidence; a missing static application import does not justify deleting them.

`check:unused` covers app and worker roots, browser/unit tests, asset tools, profiling CLIs and review pages. Narrow exceptions retain the historical player-study asset adapter, dynamically called study exports and approved pixel-math exports. `check:cycles` checks runtime import cycles; type-only relationships do not introduce runtime cycles. Update tool entrypoints when moving scripts rather than suppressing unresolved imports.

## Finite-world audit and integration

The original generator builds a complete row-major map, normally 150×150, with
border terrain and one ordered random stream. Those assumptions remain valid for
finite fixtures and the tutorial. Infinite worlds use the following integration:

| Existing assumption / owner                              | Streamed-world change                                                                                                                            |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `WorldGenerator`, `Rng`: complete map before play        | Finite version 13 retained; streamed versions 13/14/15/16 generate independent signed chunks with coordinate-derived fields and ranked features. |
| `WorldData`: positive array indices and fixed dimensions | Bounded local arrays with a chunk-aligned global origin; dimensions describe residency only.                                                     |
| `CollisionSystem`, hill/bridge geometry, A*              | Existing swept physics and artwork retained inside the view; halo preparation covers overhanging features. Infinite AI checks swept path edges.  |
| `Simulation`, encounter director: all actors present     | Active actors hydrate from chunk records; distant actors suspend. Stable IDs and an objective ledger preserve completion.                        |
| `MovementSystem`: weak-map dash/jump state               | Player identity and jump landing anchors survive origin rebases; checkpoint runtime restores them on load.                                       |
| `PortalSystem`, `Game`: synchronous world replacement    | Asynchronous preparation with cancellation; next-world progression carries the existing character state once the new world is ready.             |
| `SaveManager`: complete JSON in localStorage             | Atomic IndexedDB checkpoints, sparse deltas, revisioned slots and streamed archives; old JSON imports preserve an original snapshot region.      |
| Camera, terrain/object caches, water, sky, effects       | Local rendering coordinates, global artwork hashes, translated retained textures/effects and camera-aware asynchronous viewport preparation.     |
| `Minimap`: complete fixed map image                      | Bounded regional image and persisted per-chunk discovery masks.                                                                                  |
| Debug terminal / diagnostics: local teleport coordinates | Global streamed coordinates, residency counters and an optional swept route planner.                                                             |

Shared integration files include `Simulation`, `PixiRenderer`, terrain/object
residency classes, world types and save/UI entry points. Renderer integration depends on
`TerrainChunks`, `WorldObjects`, `WorldVisibility` and `ResidencyCache`; source
artwork remains owned by the existing asset pipelines. Rendering data chunks (32 tiles)
and existing texture chunks (16 tiles) deliberately remain separate concerns.

## World library and demo content browser

`WorldLibraryMenu` owns the Play world-list and creation screens; `SaveManager` coordinates library operations with `WorldRepository`. `WorldLibraryEntry` defines stable player-facing identity. Each streamed session captures its library context at construction, so automatic streaming checkpoints cannot target a different adventure after menu navigation. New level sessions inherit the active library context.

`DeveloperMenu` is a demo-only registration in `GameShell`, independent of player-world operations. Its canvas previews use the runtime visual manifest, environment catalog and animation frame resolver, without advancing simulation or emitting gameplay audio. Leaving the browser cancels its animation frame and releases image references. Biome exploration uses the existing isolated exploration save slots. Remove the Developer menu registration and module when the demo tools are retired.
