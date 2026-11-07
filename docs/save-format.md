# Save format

Settings use `forestrpg.v2.settings`. Finite/tutorial game slots use `forestrpg.v2.save.<slot>`, with `auto` as the default; streamed worlds use schema 3 below. V2 JSON contains world metadata and terrain, entities, the game clock, tutorial stage and selected deterministic runtime state. Export and import use the same JSON. Input is validated before replacing the active game, including size, terrain, entity identity and player stat bounds.

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

Generator version 12 changes woodland canopy reservations for native LPC tree artwork. Only new
worlds use the taller/wider silhouettes; generator versions 0–11 select complete compact 64×64
source trees. This is a rendering compatibility rule, not a migration: saved terrain, prop IDs,
positions, trunk footprints, collection state and chest rewards remain intact. No new save fields
or additional collectibles are introduced. Sprite selection uses coordinates without consuming
simulation RNG. The V2 save envelope and existing scoped migrations remain unchanged.

The finite compatibility path keeps **save schema 2** and **generator version 13**. New streamed games use schema 3 / generator 16 below. `WorldCompatibility` distinguishes these from the independent applied migrations. The existing `riverRepairVersion: 1` and `hilltopObjectsVersion: 1` fields are the persisted migration ledger; `appliedMigrations(meta)` derives `river-repair:1` and `hilltop-objects:1` for inspection. There is no second editable ledger. A missing migration field means unapplied; unsupported values are rejected, including explicit `null` or a future migration version.

Stored generator versions **0–13** are loadable; their saved cells/objects are authoritative. A missing `generatorVersion` in an otherwise valid schema-2 payload becomes **0**, meaning legacy/unknown procedural provenance, and exports explicitly as 0. It does not guess v7/v8 from terrain appearance or run their scoped river repair. Original-format conversion also uses 0. Missing top-level schema metadata continues through the existing original-format adapter; it does not reinterpret a malformed V2 payload. Unsupported schema/generator/migration versions fail before replacing the running world, with no fallback to regeneration. Existing encounter compatibility and scoped river/hilltop conversions retain their original order and responsibilities.

Finite `generateWorld()` accepts an optional `WorldGenOptions.generatorVersion`, defaulting to 13. It generates finite version 13 only; historical versions are **load-only**. Unsupported requests throw before consuming RNG. Loading never calls generation. The reproduction contract is seed + generator version + relevant configuration: dimensions, level and difficulty are already saved; fixed generation constants and generation-relevant `GAME_CONFIG`/`ENCOUNTER_CONFIG` tuning are part of each version's contract. Changing output-affecting tuning requires a new generator version. Future decisions may use keyed or independent streams; the existing stream salts and consumption order cannot be retroactively changed under v10.

Planning state is reconstructed after encounter preparation, scoped river repair and hilltop conversion from the saved terrain, props, bridge records, site IDs and spawn descriptors. Stable source coordinates on promoted rocks and completion markers preserve relocation/omission decisions. Plateau/water identities, summit protections and clearance queries survive save/reload equivalently without serializing derived maps. Diagnostic traces are intentionally transient. The captured seed-42 v10 fixture remains the reproduction baseline for `(70,96)` and ground reference `(87,37)`.

## Generator 13 environment payload

Schema 2 now accepts generator 13. New non-tutorial worlds require
`world.environment.version: 1` and seven row-major number arrays: `biome`,
`secondary` (0–4), `blend`, `cover`, `moisture`, `relief` (0–255), and `material`
(0–7). Each array must match the saved dimensions. Classifications are saved rather
than recomputed when loading. Optional prop `variant` and coordinate `featureKey`
retain artwork selection and ecological source identity. Existing IDs, removed
props, treasure state, tiles and migration ledgers remain authoritative.

Versions 0–12 retain their previous terrain and art-selection behavior; they do not
receive a new environment payload or regenerate. Tutorial fixtures keep their
existing appearance. Unsupported generator/environment versions and malformed arrays
are rejected before active state changes. Historical coordinate regression tests use
the captured v10 seed-42 world rather than assuming v13 repeats its landforms.

## Streamed worlds: schema 3

Streamed worlds use native IndexedDB database `forestrpg.worlds`. Its internal
database revision is 5; this is separate from save schema 3 and generator versions 13/14/15/16.
Settings and finite/tutorial schema-2 saves retain their existing localStorage
formats. Small `forestrpg.v3.slot.<slot>` values index streamed slots; `1` means a
streamed save and `0` means a newer finite/tutorial save takes precedence. These
values contain no world terrain. The IndexedDB slot/checkpoint transaction owns
streamed save correctness.

| Store         | Durable contents                                                                                                                   |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `regions`     | Established region coordinates and pinned biome/generator versions                                                                 |
| `chunks`      | Sparse tile overrides, removed IDs, placed objects/events, discovery, changed actors, encounters and moisture                      |
| `checkpoints` | Global player/portal/projectile state, inventory, clock, RNG, ID counters, dash/jump anchors and bounded required-objective ledger |
| `slots`       | Immutable checkpoint references for autosave and named saves                                                                       |
| `lineages`    | Copy-on-write parent revision references created when loading a snapshot                                                           |

Baseline procedural tile arrays and derived collision, topology, rendering and
navigation caches are not saved. A loaded chunk reproduces its baseline and
then applies its modifications. Actor activation flags distinguish an untouched
spawn plan from an area whose pickups or enemies have already been consumed.
Opened chests remain opened, completed encounters retain their reward flags, and
runtime IDs include their storage lineage namespace. Global counters are saved
with the same checkpoint as rewards and inventory.

Saving publishes the player, objective progress and dirty chunk state in one
transaction. Autosave runs every thirty seconds, and streaming checkpoints before
it releases dirty areas. Loading a named save creates a copy-on-write lineage;
it does not copy every explored chunk or change the saved slot. Only nearby
records are needed to resume. Historical compaction retains named-slot revisions,
parent references and the latest recovery checkpoints.

Storage failure leaves the old checkpoint and dirty active state intact. The
player cannot advance into unavailable terrain. The HUD reports the actual
failure; export can include unsaved active changes without first writing another
checkpoint. Browser storage remains subject to browser clearing and quotas.

### Biome versions and exploration isolation

New descriptors pin `generatorVersion: 16`, `biomeVersion: 2`, seed, chunk size,
difficulty, level and mode (`adventure` or `biome-walk`). Version 13 / biome 1
remains supported with its original forest geography, and version 14 / biome 2
retains its original five-biome geography. Version 15 retains its original binary hills. Derived biome/relief/elevation arrays
are regenerated for streamed windows; they are not stored as whole-map payloads.
Explicit prop `assetKey`/variant values retain stable artwork selection for edits.

Biome Walk maps `auto` to the `biome-walk` slot and named saves to `walk-<name>`.
It never writes the normal adventure autosave. Optional checkpoint `exploration`
contains the original spawn and at most five validated biome landings. Restoring
that checkpoint reuses its seed, versions and chunk changes through the existing
copy-on-write lineage mechanism. Changing biome within play keeps the same live
world identity. Both autosave markers are recovered from committed checkpoints
on startup; localStorage is only an index, not the durable world state.

Exploration autosaves atomically pin an additional `walk-v<generator>` slot to
the same checkpoint. Startup also pins a pre-existing exploration before opening
new terrain. Developer → Biomes opens/resumes version 16, while the versioned **Resume previous
landscape** buttons load preserved version-14 or version-15 checkpoints and their edits. Change Biome
within either session keeps that session's version. Returning from the older
landscape cannot overwrite the pinned newer one. Adventure saves are unaffected;
no baseline terrain is silently regenerated under existing edits or actors.

### Conversion and portable archives

Supported original/V2 generator-0–12 saves run their existing validated compatibility
passes, then become preserved finite snapshot regions. Finite generator-13 saves
remain bounded and preserve their saved environment arrays. Original coordinates, saved cells,
props, bridges, actor progress and legacy extras remain the baseline; the seed
is not used to regenerate them. Only recorded artificial `BORDER` exits are
opened where an existing reachable approach is clear. If none is safe, an
interaction at the saved spawn travels to a protected exterior landing and back.
The tutorial remains finite. Source localStorage saves are retained.

The pause menu exports streamed worlds as `.jsonl` archives: a schema-3 header,
established-region records, chunk modifications, and a final record count and
checksum. Export reads records incrementally. Import stages records under a new
storage identity and validates the complete archive before replacing the game;
truncated, unsupported or malformed data does not partially load. Failed staging
is removed. Schema-2 `.json` and original-format import remain supported.

## Named world library

IndexedDB revision 5 adds `library` and `libraryMigrations` stores. A library entry has a stable 32-character ID, display name, original seed, difficulty, level and timestamps. Its ID is also its save slot; runtime streamed descriptors remain independent copy-on-write identities. Library checkpoints commit catalog metadata, slot references and chunk changes together. Portal transitions retain the active library identity while generating the next level.

Play lists adventures by last played date. Creation accepts a 1–64 character trimmed name and an optional unsigned 32-bit seed. Import creates another entry, and export uses the existing JSON/JSONL formats. Supported previous adventure slots migrate once; exploration and tutorial slots remain separate. Deleting an entry removes its catalog and slot references and records a tombstone against late checkpoints; historical chunk records remain available to existing lineages.

Developer biome exploration retains its existing dedicated slots. Tutorial saves never target an adventure library slot.
