# Simulation and rendering contract

The simulation owns movement, collision, combat, enemy behavior, world generation and portal eligibility. The renderer reads `RenderSnapshot` and never mutates simulation state. The interfaces in `src/types/render.ts` and `src/types/gameplay.ts` are the source of truth.

## Coordinates and collision

Entity positions and collision queries use tile units. Rendering interpolates previous/current positions, converts to world pixels, then applies the camera. Artwork, transparent padding and sprite depth never define collision.

Use `ObjectSemantics`, `entityFootprint` and `HillCollisionGeometry` for authoritative footprints. Debug overlays consume gameplay collider queries rather than treating every hill rim as a solid square. Plateau tops and stairs are walkable; jumps cross eligible cliff boundaries. See [world generation](../world-generation.md) for terrain ownership and [gameplay](../gameplay-systems.md) for movement rules.

## Entity presentation

- `facing`, `anim` and `animTimeMs` describe entity presentation; `animStartedAtMs` is optional. Enemy `attackPhase`, `moving`, `dead` and `hurtFlash` drive telegraphs, locomotion, death and damage feedback.
- A player's `attack` view carries simulation-owned swing identity, combo, locked direction and elapsed time. Slash effects follow the interpolated player origin and expire according to simulation age. A missed render observation must not restart an expired swing.
- Projectile `projectileType` selects bolt or acid artwork independently of the player's display direction. A moving ranged cast must not steer an ongoing melee attack.
- `worldVersion` identifies world replacement. Views and effects must release or reset their world-owned state when it changes.

## Portal presentation

`portalState` is authoritative when provided. `active` and player distance provide a visual fallback for older snapshots; they never authorize entry or complete a round.

| State           | Presentation             |
| --------------- | ------------------------ |
| `locked`        | Dormant portal           |
| `reacting`      | Locked approach reaction |
| `open`          | Usable portal            |
| `transitioning` | World transition effect  |

Simulation portal rules own approach, entry, reaction timing and round completion. Rendering uses those results rather than animation completion to decide the displayed state.

## Diagnostics

`window.__RENDER_DEBUG__` exposes renderer counters and preview controls in diagnostic sessions. `placeholderSprites` counts visible missing-art fallbacks and should be zero with shipped assets; deliberate missing-image tests verify the fallback path separately. `window.__GAME__.getGameplayDebug()` computes collision and gameplay inspection data on demand.

See [rendering](../rendering.md) for layer ownership and [testing](../testing.md) for browser checks and capture locations.
