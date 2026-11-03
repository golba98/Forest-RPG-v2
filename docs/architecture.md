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
