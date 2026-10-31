# World generation

The generator uses independent deterministic random streams derived from a seed. It builds the base forest, carves and smooths rivers, adds the border, creates hills and stairs, restores the spawn clearing, and selects bridges. It then prunes disconnected cells, places spaced trees and mud, and places the portal, props, enemies and pickups. Attempts that cannot fit the requested population or preserve valid crossings are retried using derived seeds. Generator version 7 introduces bridge structures over unchanged river and bank tiles.

Hills have a traversable plateau and a solid edge that can be crossed while jumping; landing checks prevent the player from being stranded in a solid tile. Tree trunks and solid props participate in collision. The fixed tutorial map has its own layout. Tests check seeded repeatability, borders, difficulty counts and reachability for selected seeds; they are not an exhaustive proof for all seeds.

Bridges are two tiles wide with a 52-pixel walking deck, continuous low side rails, and a full tile resting on each bank. Both banks must be flat and clear across the complete width. Two more approach tiles and a lateral safety buffer are reserved against trees (including canopy overhangs), props, mud patches, portals and spawns. Sites that connect substantial dry regions or save at least twelve tiles of walking are preferred; unsafe or redundant sites are omitted. The final layout is checked again against collision geometry after props and terrain cleanup.

Tune `GAME_CONFIG.world.bridges` for water spans (default 1–6 tiles), minimum structure spacing (16 tiles), target density (one per 4,500 map tiles, capped at eight), and approach clearance. Seeded `WorldData.bridges` records contain orientation, bank origin, span and art variant, and are saved with the existing version-2 payload. Older saves without records retain their legacy `RAMP`/`LOG` crossings.

`BridgeGeometry` defines the shared deck, rail and reservation bounds. River collision is removed only under the deck for ground enemies; the player remains able to swim elsewhere. The movement, submerged rendering, navigation queries, terrain diagnostics and minimap all recognize bridge surfaces. Native-resolution runtime textures supply distinct end sills, plank variants, beams, moss, worn approaches and shadows. Water animation stays below the deck, while posts and ropes sort among actors at their ground depth. Low rails follow the existing jumpable-obstacle policy.

Version 9 replaces rounded point stamps, random neighbour widening and discontinuous walk jumps with swept continuous channel strokes. Slowly varying radii maintain a connected band through diagonal bends. The seven-cell spawn clearing is avoided before carving; subsequent clearing and reachability cleanup preserve water. Hills protect existing channel cells, and bridges/scenery/spawns use the finalized terrain. Checkerboard contacts are repaired across the interior, including the old central-clear-area exclusion. Damp soil is selected from coherent noise only on grass immediately beside actual water, with bridge approaches reserved.

Rendering changes apply to existing worlds. Full course/width changes apply only to newly generated worlds; version-7/8 saves get the conservative local repair described in `save-format.md`. Ponds and islands are not blanket filled or connected to other water components. See `qa/weather-rivers.md` for the measured baseline, verification and protected-save limitations.

Generator version 10 adds authoritative hilltop boulders after terrain, structures and encounters are finalized. This stage consumes no generation RNG and does not alter tiles, existing props, bridges or spawn plans. It reproduces legacy decoration candidates from their tile hash and reserves stair approaches/landings, bridge buffers, encounter areas, spawn/interaction positions and a useful summit clearing per plateau. Each accepted footprint has a closed, continuously swept bypass using the real offset player footbox, plus diagonal corner clearance. This conservatively preserves routes between entrances without relying on connected tile centres. Invalid candidates try at most 49 positions within four tiles, ordered by distance then coordinates, restricted to the same raised component; otherwise they are omitted. Saved worlds use the identical placement stage, guarded by a separate compatibility version.

## Milestone 2: shared landscape facts

`LandscapePlan` is a read-only view over authoritative state, not a second editable map. `GenGrid.tiles` owns terrain during generation; `WorldData.tiles` owns saved/runtime terrain. `WorldData.props`, `bridges`, `encounterSites`, and spawn descriptors own placements. Plans borrow those records; region labels, summit selection, protection bounds, and access results are disposable derived information. No plan, collision cache, or diagnostic trace is serialized.

| Fact | Authority / producer | Available / consumers |
| --- | --- | --- |
| Ground, water, deck, elevation, cliff geometry | Saved tiles; `ElevationTopology`, `SurfaceState`, `HillCollisionGeometry`, `BridgeGeometry` | Queries use current cells and existing physical geometry; hilltop clearance and diagnostics |
| Cardinal plateau components and summit space | Raised cells; the Milestone 1 summit algorithm | Lazy after final terrain cleanup; hilltop placement, actor recovery, diagnostics |
| Cardinal water regions | `RiverTopology.channelTerrain` | Lazy from current tiles; diagnostics and later water planning; legacy RAMP/LOG cells retain channel connectivity |
| Stair protection | STAIRS cells and final elevation mask | Two-tile approach/landing buffer; woodland and hilltop placement |
| Bridge decks and approach protection | Bridge records / `BridgeGeometry` | After bridge selection; woodland, hilltop placement, existing crossing validation |
| Nest/grove protection | Encounter site records / `siteBounds` | Nest before hills; groves after ordinary props/spawns; placement consumers use only facts available at their stage |
| Spawn, portal, spawn-descriptor protection | Existing authoritative coordinates | Spawn early; other positions after selection; hilltop placement |
| Required gameplay access | Existing generation reachability / sweep checks | At their original validation positions; `LandscapeAccess` and diagnostic replay |

All plan coordinates and bounds are in **tiles**. Integer coordinates identify cells; continuous coordinates identify ground contact or actor anchors as documented by the query. Rendering uses 32 logical pixels per tile. No projection offset enters physics. `canOccupy` and `hasClearPath` remain the sole footprint and movement authorities; a region ID or surface label never proves that an actor fits. Legacy CLIFF is opaque terrain, not an invented raised walking surface. Plateau identities cover `isRaisedSurface`; water identities describe existing channels without predicting drainage or classifying permanent ponds.

Region IDs use their minimum row-major coordinate (`plateau:x,y`, `water:x,y`). Stair, bridge, site, point, and summit reservation IDs derive from authoritative IDs/coordinates. Query order and chunk visitation cannot assign identities. An authoritative topology edit may split/merge a component and therefore change its ID. Summit selection ignores promoted hilltop props when reconstructing the pre-promotion baseline, making its protections equivalent after save/reload; current occupancy and sweeps still include every solid object.

### Current stage exchange and future responsibilities

The running order remains base terrain → rivers/safe area/border → reserve/clear nest → hills → restore clearings/edges → stairs → bridges → reachability pruning → woodland → mud → tree-aware pruning → portal → props → collision-aware pruning/edge refresh → bridge validation → spawn plan → nest access validation → ghost groves → hilltop rocks. Named streams, stream salts, traversal/shuffle order, retries, and random consumption are unchanged. The reservation view before woodland is discarded when later pruning changes terrain. A fresh access view uses the finalized cells; the object view adds final sites and spawn descriptors. `Simulation.loadWorld` acquires the final view after compatibility conversion.

| Intended responsibility | Implemented now | Later extension |
| --- | --- | --- |
| Broad landforms and gameplay requirements | World options, spawn clearing, existing nest reservation and required-access checks | Milestone 3: hills/valleys planned together |
| Terrain surfaces, hills, cliffs, valleys | Existing hill generator; shared surfaces, boundaries, plateau IDs | Improved landform shape, without changing physical fit semantics |
| Waterways and pond locations | Existing rivers run before hills and are protected by them | Milestone 4: coordinated courses and permanent ponds |
| Final stairs, crossings, required access | Existing stairs/bridges and validation exposed through shared queries | Terrain-aware crossing decisions |
| Woodland and substantial objects | Existing woodland rules and Milestone 1 rocks consume shared protection | Milestone 5: groves and terrain-aware distributions |
| Passable local decoration | Existing ground/terrain decoration remains separate from solid props | Later decoration refinement |

These are responsibilities, not a reordered generator. There are no placeholder basin, drainage, valley, or grove fields.

Woodland retains its original canopy bounds, inclusive two-tile stair buffer, legacy-crossing exclusion, density and spacing. Hilltop objects retain their scaled physical bounds, strict gameplay-point distances, summit buffer, continuous player bypass and local actor recovery. Reservation policies are deliberately specific to each consumer: sharing facts does not make every reservation exclude every type of decoration.

Required gameplay access is distinct from optional exploration or decoration density. The spawn planner uses its existing 0.3-tile player/ground-enemy reachability checks; bridge validation sweeps three cross-deck positions; nest validation requires a reachable reserved clearing and two of four six-tile exits. Nest clearing validation precedes installation of the nest's own solid base, which is excluded explicitly in diagnostic replay. Ground enemies retain the existing overflow policy across swimming-only routes. Optional hilltop rocks relocate no farther than four tiles on the source plateau or are omitted. Unsatisfied required generation access rejects the attempt; 32 failed attempts throw with the seed. No new pathfinding or retry policy is introduced.

### Lifecycle and inspection

`landscapeFor(world)` caches a final view by world identity. Component maps and summits are lazy; there is no per-frame rebuild. `invalidateLandscape(world)` drops it after in-place terrain, reservation, or prop changes. Flower cutting/removal uses this hook beside the existing renderer, prop-index and AI invalidation. Replacing a world naturally creates a new view. Solid-object removals must also call `invalidatePropIndex`; bridge/structure replacement should replace/reload the world so existing bridge and renderer caches rebuild together. Generation views must not survive terrain mutation boundaries. Invalidating a view never reruns completed migrations or respawns removed objects.

With `?debug=1`, `/landscape 70.5 96.5` in the existing terminal, or `window.__GAME__.getLandscapeDebug(70.5, 96.5)`, shows surfaces, stable region IDs, cliff/deck bounds, protection IDs, and current placement explanations. Append `access` to the terminal command or pass `true` as the API's third argument for the more expensive required-access replay. It runs only on request. Inspector coordinates are continuous ground-contact positions in tiles.

Debug generation/conversion captures actual acceptance, relocation and rejection counts and reasons for woodland and hilltop objects, retaining at most 256 records per consumer. Traces live in a WeakMap, consume no RNG, and disappear on reload. Counts include all decisions; retained entries are bounded and filtered around the inspected coordinate. Static hypothetical explanations are labeled separately; woodland explanations cover protection, not random density/spacing, and hilltop explanations do not replay transient saved-actor recovery. No diagnostic information appears on the normal HUD.
