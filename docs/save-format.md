# Save format

Settings use `forestrpg.v2.settings`; game slots use `forestrpg.v2.save.<slot>`, with `auto` as the default. V2 JSON contains world metadata and terrain, entities, the game clock, tutorial stage and selected deterministic runtime state. Export and import use the same JSON. Input is validated before replacing the active game, including size, terrain, entity identity and player stat bounds.

The legacy adapter accepts supported original `autosave_map` data, converts terrain, props and spawns, and preserves the original payload in `legacyExtras`. The first successful Continue of a legacy autosave writes a V2 autosave. Unsupported or corrupt data should be rejected rather than partially loaded.

Transient combat and pathfinding timers are not all serialized, so a reload does not promise frame-exact continuation of an ongoing fight. Browser storage can be cleared by the user or browser; export a save to retain a separate copy.

Optional `runtime.moisture` version 1 stores per-cell wetness and puddle storage as byte-valued arrays, plus the sub-200ms update remainder. They are validated against the saved world's dimensions before the active game changes. Old payloads without moisture begin dry. Placement masks are regenerated deterministically from the saved terrain, structures and seed; drying uses simulation time, including offscreen terrain, and freezes while paused or closed.

Generator version 9 introduced the river update. Loaded non-tutorial version-7/8 worlds receive a scoped river repair, tracked separately by `world.meta.riverRepairVersion: 1`. It only proposes known local corner contacts and single-cell gaps. Existing placements, crossings, encounter reservations and dry connectivity are protected; unsafe proposals remain unchanged and are listed in `riverRepairSkipped`. No saved world is regenerated and no actor or prop is moved by the repair. Other generator versions and converted legacy maps receive rendering improvements without terrain rewriting. The encounter compatibility cutoff remains version 8 independently of terrain generator bumps.

Generator version 10 promotes solid hilltop decoration to saved `world.props`. Optional `hilltop: { sourceX, sourceY }` records its original coordinate hash; the prop's `tileX/tileY` is its accepted location on the plateau. That source deterministically defines the existing sprite's scale/jitter, scaled ground-boulder footprint and depth anchor. Stable IDs use `1000000 + sourceY * width + sourceX`. `world.meta.hilltopObjectsVersion: 1` records completed placement, including omissions, so subsequent loads do not recreate omitted or removed rocks. Unmarked worlds run the same clearance/relocation pass against their saved tiles, without regeneration. A newly overlapping player or ground actor is moved at most two tiles locally, through previously clear space on the same plateau; if no such recovery exists, placement of that rock is retried elsewhere or omitted. Terrain caches are rebuilt on world load and no longer contain solid hill decorations.

Generator version 11 adds optional treasure to new worlds only. Saved worlds retain their terrain,
placements and IDs; they are never regenerated or retrofitted with treasure. Pickup entities may
include `value` (integer 1–100, default 1), `requiredForCompletion` (default true for coins), and
`chest: { variant, state, elapsedMs }`. Wooden/reinforced chests grant 5/10 coins at the single
opening→opened transition after 600 ms. The balance and state are committed before feedback
callbacks. Opened chests stay alive and visible; consumed legacy chest pickups stay dead.
Live legacy chest pickups without state become closed wooden chests. Opening progress resumes
on load. Collision is rebuilt from live chest entities before actor position recovery. Optional
enemy coins never delay portal completion. The V2 save envelope is unchanged.
