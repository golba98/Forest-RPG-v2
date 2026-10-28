# Visual contract (renderer ↔ simulation)

Owner split:

- **Simulation / Codex:** game rules, AI, collision, portal rules, world generation (`src/simulation`, `src/systems`, `src/world`, `src/game/Game.ts`).
- **Renderer / Claude:** sprites, animation, terrain art, effects, debug overlays (`src/rendering`, `src/animation`, assets).

The renderer reads `RenderSnapshot` (`src/types/render.ts`) and never mutates simulation state. Every field below is **optional**: the renderer has a safe fallback, so either side can land first.

## `RenderEntityView.portalState?: PortalVisualState`

`'locked' | 'reacting' | 'open' | 'transitioning'`

| State | Meaning | Renderer fallback when the field is absent |
|---|---|---|
| `locked` | Round incomplete; portal dormant. | `active !== true` and the player is not near. |
| `reacting` | Player approached an incomplete-round portal. It plays a one-shot flare, then returns to `locked`. | `active !== true` and the player is within 2.5 tiles. It re-arms only after the player leaves 3.2 tiles. |
| `open` | Round complete. The portal stays active. | `active === true`. |
| `transitioning` | Player is entering an open portal. | The renderer detects a `worldVersion` change while the previous frame showed an open portal with the player inside the entry radius, and plays a ~650 ms vortex fade over the new world. |

The renderer contains **no** round-completion logic. It shows `active` / `portalState` only. If the simulation adds an entry delay, set `portalState: 'transitioning'` during it and the renderer will play the effect in place.

## `RenderEntityView.animStartedAtMs?: number`

The simulation time at which `anim` last changed.

**Current behaviour:** `Simulation.step` only ever increments enemy `animTimeMs` (`src/simulation/Simulation.ts`), so one-shot clips (attack) are already finished by the time the state is entered. The renderer works around this by restarting its own clip clock when `anim` changes (`src/rendering/EntityAnimator.ts`).

**Request to Codex:** either reset `animTimeMs = 0` whenever `anim` changes, or fill `animStartedAtMs`. Both are honoured.

## `RendererStats.placeholderSprites?: number`

The number of sprites drawn with the missing-art checker texture. It must be 0 in normal play, and the visual e2e suite asserts this.

## Constants the renderer would like exported

- `PORTAL_ENTER_RADIUS` is currently the literal `0.8` in `Game.fixedUpdate`. The debug overlay shows it as an assumed value until it is exported.

## Animation-state expectations (AI → renderer)

| `anim` | Expected when | Renderer shows |
|---|---|---|
| `idle` | Not moving | Slow breathing frames, never walk frames |
| `walk` / `run` | Moving | Walk cycle (run falls back to a faster walk) |
| `attack` | Attack state active | Wind-up telegraph, then a one-shot attack clip. While the state persists the clip replays after a short hold. |
| `hurt` | `hurtFlash` true | White→red flash and recoil |
| (removed) | `alive` false / entity leaves the snapshot | Renderer-side death fade with a puff |

`facing` is shown with ~120 ms hysteresis, so 4-way flips at exact diagonals don't flicker. The simulation's facing is unaffected.

See also [visual-collision-mismatches.md](visual-collision-mismatches.md).
