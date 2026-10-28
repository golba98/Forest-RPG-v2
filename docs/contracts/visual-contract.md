# Visual contract (renderer ↔ simulation)

Owner split:

- **Simulation / Codex:** game rules, AI, collision, portal rules, world generation (`src/simulation`, `src/systems`, `src/world`, `src/game/Game.ts`). Branch `codex/gameplay-repair`; its side of the boundary is `docs/qa/renderer-gameplay-contract.md`.
- **Renderer / the renderer team:** sprites, animation, terrain art, effects, debug overlays (`src/rendering`, `src/animation`, assets). Branch `visual-rendering-repair`.

The renderer reads `RenderSnapshot` (`src/types/render.ts`) and never mutates simulation state. Every field below is **optional**: the renderer has a safe fallback, so either branch can merge first. Field names and unions match Codex's contract.

## Field reconciliation with `codex/gameplay-repair`

| `RenderEntityView` field | Codex contract | Renderer use (this branch) |
|---|---|---|
| `portalState` | `PortalState` (`locked`/`reacting`/`open`/`transitioning`), authoritative | `PortalVisualState` is the same union. Explicit values win over the derived fallback. |
| `active` | Kept as the adapter for open/transitioning | Fallback input when `portalState` is absent. |
| `attackPhase` | `none`/`windup`/`strike`/`recover` | `windup` draws the telegraph. `recover`/`none` show the idle pose. |
| `moving` | Movement flag | `false` suppresses walk/run frames. |
| `dead` | Dead enemies stay in the snapshot for their death window (~450 ms) | Fades and shrinks over 450 ms, with no second fade on removal. |
| `animTimeMs` | Resets on state change | Honoured. The renderer also restarts its own clock on `anim` changes, which is harmless when the simulation already resets. |
| `animStartedAtMs` | Not provided | Optional. The clip plays at `animTimeMs - animStartedAtMs`. |
| `projectileType` | Present at runtime via the entity spread (`spriteKey` is `'projectile'`) | Selects acid-sheet vs magic-bolt art. **Request:** set `spriteKey` to the projectile type. |
| `roundComplete`, `entryEligible`, `aiState` | Codex adds these | Not needed by the renderer yet. They are accepted when merged. |

**Merge note:** both branches add optional fields at the end of `RenderEntityView`. Resolve the conflict by keeping the union of the fields. `PortalVisualState` and `gameplay.PortalState` are the same union, so either type works.

## Portal presentation

| State | Meaning | Renderer fallback when `portalState` is absent |
|---|---|---|
| `locked` | Round incomplete; portal dormant (desaturated, dim vortex) | `active !== true` and no reaction is running. |
| `reacting` | Player approached an incomplete-round portal: a one-shot flare, a "Portal sealed" label, then back to `locked` | Triggers on entering 2.5 tiles and lasts 600 ms. It re-arms after leaving 3 tiles (same as `PORTAL_RULES`). |
| `open` | Round complete; vortex spins in full colour and stays active | `active === true`. |
| `transitioning` | Entering an open portal | Detected when `worldVersion` changes while the previous frame showed an open portal with the player within 1.6 tiles. Plays a 650 ms violet iris over the new world. An explicit value is honoured in place. |

The renderer contains **no** round-completion logic.

## `RendererStats.placeholderSprites?: number`

The number of sprites drawn with the missing-art checker texture. It must be 0. The visual e2e suite asserts this through `window.__RENDER_DEBUG__.getInfo()`.

## Terrain topology

Hill art is chosen from elevation topology: HILL_* or PLATEAU cells, with an 8-neighbour mask in N,NE,E,SE,S,SW,W,NW bit order. That is the same order as Codex's `TerrainInfo.hillNeighbors`. Art never changes collision.

## Debug overlay data

On this branch the collider layer reads `TILE_PROPERTIES`, `WorldProp.solid` and entity `halfSize`. After the merge, Codex's per-object footprints (`ObjectSemantics.OBJECT_FOOTPRINTS`) become authoritative. The overlay should then draw `queryColliders` / `__GAME__.getGameplayDebug().colliders` instead. This is a one-line source swap in `src/main.ts` (`renderer.setDebugEntitySource` / collider source).

See also [visual-collision-mismatches.md](visual-collision-mismatches.md).

## Hill access (2026-10-28, user decision: stairs and jumping)

- `PLATEAU` (hill tops) and the new `Tile.STAIRS` (23) are walkable ground. `HILL_*` cliff edges stay solid to walking, but they carry `TileProperties.jumpable`: the `jumping` traversal profile passes over them.
- A jump that lands on a cliff edge completes the climb or drop to the first free spot ahead (`MovementSystem.finishCrossing`). Props still return the player to the take-off point.
- `placeStairs` cuts 1–3 staircases into straight edges of every hill with a top, preferring south faces. Its foot must be landable ground or soon-to-be woodland, and trees and decor are kept off stair landings. The first reachability prune now treats FOREST as passable, because woodland converts it right after.
- Generator version is now 5. The connectivity tests (100 seeds) prove every hill top is reachable on foot.
- Ground enemies can use stairs and hill tops; ghosts are unchanged.
