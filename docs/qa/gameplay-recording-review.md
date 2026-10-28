# Gameplay recording review and repair

## Sources and limitations

Reviewed the eight most recent MP4 screencasts under `/home/k9-vortex/Videos/Screencasts`, sorted by modification time, using ffprobe metadata and timestamped ffmpeg contact sheets. Searched Videos (including Screencasts and recording subdirectories), Pictures, Downloads, Desktop, and the project for MP4/MKV/WebM/MOV files. No project QA gameplay recordings were present at investigation time; `public/assets/video/menu_vid.webm` and its build copy are menu media. Original recordings were read only. Contact sheets are derived copies.

| Screencast filename suffix | Duration | Relevance |
| --- | ---: | --- |
| 2026-10-28 12-47-52.mp4 | 10.01 s | Forest RPG generated world |
| 2026-10-28 12-45-55.mp4 | 10.95 s | Forest RPG Training Glade |
| 2026-10-27 18-39-23.mp4 | 34.05 s | Unrelated Python chatbot |
| 2026-10-27 18-37-40.mp4 | 24.15 s | Unrelated Python chatbot |
| 2026-10-19 01-13-25.mp4 | 11.23 s | Unrelated Counter-Strike |
| 2026-10-14 21-30-28.mp4 | 35.17 s | Unrelated programming exercise |
| 2026-10-03 08-33-54.mp4 | 11.02 s | Unrelated desktop/terminal |
| 2026-09-30 22-56-29.mp4 | 21.45 s | Unrelated music application |

All filenames begin `Screencast From `. The relevant recordings expose neither world seed, numerical player coordinates, nor keyboard input. Exact inputs cannot be reconstructed from a screen recording without an input overlay. Movement descriptions below are observations or separately controlled reproductions, not claims about recorded key presses.

## Recording evidence

- **12-47-52, 00:00–00:02:** player is near the portal and river bridges. A purple portal image alone cannot prove entry eligibility. Expected: locked until required enemies and coins are cleared. The clip does not demonstrate completion or a transition.
- **12-47-52, 00:02–00:07:** camera follows movement away from the portal across an area bordered by discontinuous hill outlines and broad grass-like interiors. Expected: continuous authoritative cliff boundaries and matching visuals. This establishes the visual reproduction, but does not establish the W+A sequence or prove collision penetration by itself.
- **12-47-52, 00:08:** pause screen; remaining frames show desktop switching.
- **12-45-55, 00:00–00:02, 00:04–00:06, 00:08–00:09:** Training Glade, player south of the passive beetle dummy, nearby coins and locked portal. The stationary dummy is intentional tutorial behavior, not evidence of failed enemy pursuit. Desktop switching interrupts the other intervals.

[Generated-world contact sheet](evidence/recording-generated-world-contact-sheet.jpg) · [Tutorial contact sheet](evidence/recording-tutorial-contact-sheet.jpg)

## Controlled reproductions and actual causes

| Defect | Reproduction / position / input | Expected and observed baseline | Repair |
| --- | --- | --- | --- |
| Walk-through boulder | Seed 123, object tile (58,77); occupancy query at its centre | Rock should block; generated `solid:false` allowed standing inside it | Semantic footprint registry; generated boulders are solid; old V2 and mapped legacy decorations use the same registry |
| Hill boundary bypass | Synthetic grass map with vertical HILL_W wall at x=5, player (4.7,4.5), D+W for 30 steps at 60 Hz | Exact contact should allow sliding; inclusive tile sampling marked contact as `onHill`, enabling the universal hill exemption and allowing x≈6.91 | Swept collision, strict-overlap contact tolerance, removal of `onHill` and airborne hill exemptions |
| Wall-seam sticking | Same wall, displacement (4,2), partitioned into 1/30/60/144 steps | Same final position; initial repair exposed spurious normals at internal tile seams | Ignore internal faces of the terrain union; regression compares timestep partitions |
| Poor obstacle navigation | Ground enemy chases around a tree/hill; target subsequently occluded | Most enemies previously steered directly into obstacles; only boss had BFS and could teleport after four seconds stuck | Shared bounded A*, physical clearance, last-seen memory, return state, retries/backoff; no teleport |
| Terrain vision and attacks | Put a cliff between player and enemy; approach within detection range | Ground enemies previously detected and could attack without terrain visibility | Collision-derived line of sight; attack windup, execution checks, consumed strike and recovery |
| Portal state gaps | Approach while incomplete; clear enemies and coins nearby/far away; enter repeatedly | A recomputed boolean had no reacting or transitioning state and could relock when new enemies appeared | Simulation-owned state machine with latched completion, one unlock event and atomic transition claim |
| Hill topology drift | Hills overwrite river/bridge areas; spawn clearing removes classified hill cells | Earlier edge IDs could survive after neighboring occupancy changed; cardinal-only classification omitted concave information | Protect waterways/crossing landings, derive final edge IDs and expose full edge/corner metadata |
| Suspected empty lower hills | Seeds 1,123,456,999,20261028; inspect every row | All five baseline maps contained thousands of lower-half hill cells; PLATEAU is rendered as lightly tinted grass | No fabricated lower-quadrant fill. Explicit lower-boundary tests and final topology metadata; visual reproduction handed to the renderer team |

The exact hill contact reproduction was initially injected at (4.7,4.5), which baseline `canOccupy` incorrectly rejected despite the physical AABBs only touching. Final diagnostics also repair debug teleports and loaded positions that genuinely overlap solids.

## Rules and ownership

The user chose impassable hills/cliffs even during jumps, with designated RAMP/LOG crossings. Replace the previous acceptance test permitting hill jumping. Jumping over short props retains the existing safe-landing rule; jumping never bypasses trees, hills, or map boundaries.

The original project's `hasRemainingVictoryEnemies()` explicitly excludes ghosts, and its victory check also requires no coins. V2's documented rule agrees. Preserve that conjunction, including the beetle boss and tutorial dummy; potions and optional ghosts do not gate completion.

The renderer team owns visual fixes. Remaining visual integration includes concave/multiple-edge hill tiles, PLATEAU appearance, portal reaction animation, and FOREST cells whose renderer currently skips individual sprites at odd coordinates. Codex did not change renderer, pixel assets, UI, or hill transition art. See [contract handoff](renderer-gameplay-contract.md); the renderer team's acknowledgment is not claimed.

## Regression coverage

- Eight movement directions at 30/60/144 Hz with sprint and jump; tree and boulder footprints; exact contact, diagonal gaps, huge deltas, wall sliding, bridges, river traversal profiles, and prop-cache invalidation.
- 100 deterministic seeds: 1,123,456,999,20261028 and 1000–1094. Five full-size maps plus varied rectangular 32/48/64 dimensions and all difficulties. Validate initialized IDs, player/objective reachability, ground-enemy reachability, final hill edges, lower-row processing, crossing preservation and corner metadata.
- Enemy detection, occlusion, pursuit, obstacle detours, attack windup/cooldown/single strike, interruption, target loss/return, unreachable boss, separation and world/death cleanup.
- Locked approach/leave/re-entry, both completion requirements, near/far unlock, permanent openness, portal entry boundary, one transition, regeneration and V2/legacy save normalization.
- Actual browser keyboard movement and combat in Chromium and Firefox. Fixture imports set up known geometry; debug commands complete objectives explicitly. Production browser tests cover save/load and five seeds; no claim that debug-assisted completion is manual combat.

Final command results and remaining legacy-suite failures are recorded in [validation results](validation-results.md).

## Reproducible lower-hill visual handoff

Final generator version 4, seed **123**, tile **(111,101)**, player **(111.5,101.5)**: the lower region contains complete solid hill data but the plateau interior still resembles empty grass. [Browser capture](evidence/lower-hill-seed-123.png) and [9×9 tile neighborhood plus collision diagnostics](evidence/lower-hill-seed-123.json) give the renderer team a concrete visual/data comparison. The capture uses `/kill all` to avoid interruption while inspecting; coins remain, so the portal is locked.

Additional final evidence: [bridge traversal](evidence/collision-and-bridge.png), [completed portal](evidence/portal-open.png), and [two enemies navigating](evidence/enemy-navigation.png). Screenshots were visually inspected after browser assertions passed.
