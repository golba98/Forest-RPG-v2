# World art and loot overhaul

Branch: `feat/world-art-loot-overhaul` · baseline: `58baaf8` · 2026-10-31.
Worktree: `../18-Forest-RPG-v2-world-art`. No merge or deployment. PR publication authorized in the follow-up request.

**Current revision:** the initial procedural vegetation was rejected by the user. The selected
Detailed LPC forest replacement described below supersedes that art; the verified treasure and
currency implementation is retained. Earlier screenshots are retained as before evidence.

## Initial audit and priorities

The engine uses 32-pixel tiles, PixiJS nearest sampling, cached terrain chunks and a depth-sorted actor layer. Generator v10 has independent seeded streams, bridge reservations, encounter reservations and authoritative hilltop boulders. V2 saves retain terrain, props, entities, encounter state and RNG state. Runtime weather, moisture, lighting, contact effects and coin pickup particles already exist.

| Priority | Finding | Resolution |
|---|---|---|
| 1 | The 239×286 tree PNG is squeezed into 64×64, has very bright noisy foliage and a rectangular ground patch. Its collision includes the canopy row. | Native pixel tree family, transparent rooted bases, narrow trunk collision and shared ground-depth convention. |
| 1 | Chest is a static 32×32 icon. The generic pickup loop consumes it without a reward. | Reuse chest pickup entities with explicit opening state, saved progress, rewards and permanent opened artwork. |
| 2 | Four 32×32 coin frames are largely flat yellow silhouettes. Distance-only collection ignores intervening obstacles. | Shaded native-pixel spin, grounded reach/visibility checks, existing sound plus particles and balance feedback. |
| 2 | Bushes and logs mix proportions, lighting and pixel density; small ground detail feels scattered. | Cohesive native-pixel bushes/logs/stumps; substitute ferns/mushrooms within the existing decoration population. |
| Keep | Bridges have structured wood, worn edges, moss and physical deck/rail geometry. Boulders use deliberate facets, moss, contact shadows and established collision. | Neither artwork nor bridge/boulder implementation was changed. |

Coins already use `PlayerStats.coins`, HUD presentation, save persistence and portal objectives. Inventory already supports health/speed potions. Enemy defeats already award XP and occasional potions. These systems were extended, not duplicated. Chests had no usable opening mechanics. Legacy forest/border terrain remains solid; object trees can now be walked behind.

## Art direction, source and ownership

The user selected **Detailed LPC forest** after reviewing the source sheets. The first procedural
canopies had repetitive polygon silhouettes and weak leaf detail; changing their colours or adding
more trees would not address that rejection. The replacement uses a curated subset of actual LPC
sprites: young 64×64, tall 64×96, broad 96×128, and compact 64×64 compatibility/boundary trees.
Their clustered foliage, branching trunks, exposed roots and original translucent contact shadows
are retained at one source pixel per world pixel. Giant and cartoon-style trees in the pack are unused.

Bushes, fallen logs, upright cut trunks, stumps, ferns, grass tufts, small mushrooms and pink/yellow/
mixed flowers use 32×32 source rectangles. Flower terrain and hilltop flower/bush rendering were
also replaced, avoiding a mixture of old and new flower art. Biome variation replaces existing
slots: broad trees and ferns near water; mixed flowers, grass or mushrooms in dry clearings.
No extra vegetation population or animation was added. Transparent logs now sort among actors; solid
vegetation uses the same foot-relative depth convention as boulders, without changing collision. Coins and chest pixels remain the
project-authored bridge-palette artwork, now isolated in `lootArt.ts`.

Source and licence records:

- [LPC Trees](https://opengameart.org/content/lpc-trees), `trees-pale.png`, 1024×1024.
- [LPC Flowers / Plants / Fungi / Wood](https://opengameart.org/content/lpc-flowers-plants-fungi-wood), `plants.png`, 512×1024.
- Both compilations: **CC BY-SA 3.0**, bluecarrot16 and the contributors credited in the supplied
  full attribution files. These files and the full licence are redistributed with the sheets in
  [the public source folder](../../public/assets/images/environment/lpc/README.md).
- Source sheets are byte-for-byte originals. Runtime frame selection is documented in
  `vegetationArt.ts`; there is no resampling, recolouring, repainting or alpha replacement. Future
  adapted artwork must keep attribution and the same licence. No watermark or generated substitute.

Generator v12 reserves three tiles above tree roots and the full broad crown width around bridge
and encounter reservations, with larger stair clearance. Existing v0–11 saves use complete small
source trees; prop coordinates, identifiers, trunk footprints and saved terrain are unchanged.
Native canopy bounds are checked against actual bridge reservations. Subtextures share the
loaded atlases safely through the existing `getRect` cache; source textures are not registered as
runtime-owned aliases. Two PNGs add approximately 289 KiB on disk / 6 MiB decoded RGBA.

Actual gameplay screenshots were inspected at 1280×720 and 1920×1080. The new trees have distinct
leaf clusters, natural branching and clear ground contact, while flowers remain small readable
accents. Behind/front views show the player obscured by foliage and emerging around the trunk;
movement assertions confirm that only the base blocks traversal. The dense grass and bright
cliff palette still compete with the vegetation and are documented as a separate improvement.

## Gameplay implemented

- Existing coin balance and inventory remain authoritative. Missing coin values default to one. Bonus drops carry `requiredForCompletion: false`; original world coins still gate the portal.
- Mantis/maggot defeats award one optional coin, beetles five, ghosts none. Tutorial enemies have no new coin drops. The existing accepted-defeat path owns creation; IDs derive from the defeated enemy.
- Pickup radius remains 0.7 tiles. Collection requires a grounded player, compatible elevation and an unobstructed path. Collection marks the entity dead before feedback observers can save.
- Up to three wooden chests and one reinforced chest are placed in new standard worlds. Counts reduce when safe sites are unavailable. Clear 5×5 sites, continuous player bypasses, bridge/stair/encounter buffers, spawn spacing and reachable approach space constrain placement.
- `G` opens the nearest reachable chest within 1.25 tiles. Existing encounter interaction takes priority. A short prompt appears only when usable.
- Opening lasts 600 ms, pauses with simulation and resumes after reload. Wooden/reinforced chests grant 5/10 coins at the single opening→opened transition. Balance and state commit before sound/particle feedback. Opened chests remain visible and solid.
- Coin lift/spin, existing synthesized pickup sound, chest sparks and a transient `+N` label provide feedback. No shop, second currency, rare chest tier or new item economy was added.

## Compatibility and integration

Generator version is 11. Treasure uses an independent seeded stream; it does not consume combat RNG or move existing props. Chest spawn IDs are coordinate-derived. Loaded worlds are never regenerated or retrofitted with treasure. Existing river and hilltop compatibility passes remain unchanged.

The V2 save envelope remains unchanged. Optional pickup fields store value, completion role and chest state/progress. Missing live legacy chest state becomes closed wooden state; already-consumed legacy chests remain consumed. Load validates added fields before replacing the world and rebuilds chest collision before actor recovery. Reopening, repeated interaction, mid-animation saves and reloads cannot replay a committed reward. As with the existing save system, deliberately restoring an older exported save restores that historical game state.

Shared-file integration points are deliberately limited:

- `Simulation`: pickup construction, loot step after combat, collision preparation on load/restore.
- `EncounterSystem`: remove the old collection loop and append optional coin drops to the existing accepted-defeat transaction. No attack/facing/aim logic changes.
- `PixiRenderer`: atlas/native-frame selection, root anchors, chest frame override, native coin scale/lift, loot-view update and bonus-aware portal label.
- `terrainArt` / `assetCatalog`: native flowers on terrain/hills, atlas loading, transparent logs in the actor layer. `ObjectSemantics.propDepth` aligns all solid prop bases with character feet; collision footprints are unchanged by the LPC revision.
- Entity/render/world types and `SaveManager`: optional additive loot fields and validation.
- `CollisionSystem`: registered chest base footprints plus a target-only visibility exclusion. Movement algorithms are unchanged.

Agent 1's checkout and uncommitted work were not edited or copied. Changes to overlapping files require normal integration review; no branches were merged.

## Verification

Latest unit validation: **527 unit/integration tests passed across 58 files**. Browser validation is recorded below. Commands use this worktree's own `npm ci` dependencies. An initial shared-dependency run was discarded because that installation used Vite 7/Vitest 4 instead of the lockfile's Vite 5/Vitest 2.

- Full unit/integration suite: latest run **527/527 passed across 58 files**, including atlas bounds/transparency, native hilltop flowers, legacy tree compatibility and actual canopy clearance.
- Focused tests cover deterministic seeds 42, 1, 123 and 456, unique chest IDs, safe approaches/bypasses, trunk collision, canopy traversal, optional progression, exactly-once rewards, legacy defaults, corrupted-save rejection and mid-opening restore.
- After the final transparent-log depth correction, **4/4 focused Chromium/Firefox checks passed again**, including behind/front log views and collision. No page errors or missing textures.
- Production browser suite: **20/20 passed across Chromium and Firefox**. It covers the new gameplay scenarios plus existing bridge traversal, rails, layering, save/reload and save-flow checks. The suite uses an isolated production preview on port 4183, hardware WebGL, one worker and a 90-second budget. The clock setup now leaves 60 seconds of headroom before pausing to avoid host-load timing races. An earlier development-server broad run was interrupted after screenshot timeouts amid concurrent browser workloads and source updates; it is not counted as passing evidence.
- Production build succeeds. Vite reports the existing large Pixi vendor-chunk advisory.
- Typecheck, lint (zero warnings) and `git diff --check` pass.
- Current generator-v12 benchmark: **815.63 ms mean** across 10 varying-seed 150×150 worlds (501.09–1,616.91 ms, ±29.52% RME on this shared host). Command: `npm run benchmark -- tests/benchmarks/world.bench.ts`; [raw output](evidence/lpc-vegetation/world-generation-benchmark.txt). This is a generation measurement, not an FPS claim.
- Historical first-pass world-generation benchmarks completed on both baseline and changed code. A same-process alternating comparison for seeds 42/1/123/456 averaged 2,213 ms before and 2,253 ms after (about +1.8%); every new world had four chests and prop counts stayed equal or decreased slightly. These single-sample shared-host timings are indicative, not a stable hardware performance guarantee. Raw results: `evidence/world-art-loot/generation-timings.json`.

Reproduce: `npm ci`, `npm test`, `npm run typecheck`, `npm run lint`, `npm run build`, then `npx playwright test --config playwright.world-art.config.ts`. Run locally with `npm run dev -- --port 4182`.

## Screenshot evidence

Current LPC evidence is under `docs/qa/evidence/lpc-vegetation/`; original and rejected-first-pass captures remain under `docs/qa/evidence/world-art-loot/`. The baseline screenshot is from the unmodified committed baseline; generator version changes mean a new seed-42 layout need not match v10 placements exactly. Browser screenshots exercise the actual game, with debug relocation used to reach distant objects and a documented bridge fixture for controlled occlusion/traversal checks.

- [Before: seed 42](evidence/world-art-loot/before-seed42.png)
- [Before: matched bridge/vegetation fixture](evidence/world-art-loot/before-bridge-boulder-vegetation.png)
- [Forest artwork](evidence/lpc-vegetation/chromium-forest.png)
- [Desktop forest, 1920×1080](evidence/lpc-vegetation/chromium-forest-desktop.png)
- [Closed chest](evidence/lpc-vegetation/chromium-chest-closed.png)
- [Opening animation](evidence/lpc-vegetation/chromium-chest-opening.png)
- [Reward and opened chest](evidence/lpc-vegetation/chromium-chest-reward.png)
- [World coin](evidence/lpc-vegetation/chromium-coin-world.png)
- [Coin collected](evidence/lpc-vegetation/chromium-coin-collected.png)
- [Behind log](evidence/lpc-vegetation/chromium-log-behind.png)
- [In front of log](evidence/lpc-vegetation/chromium-log-front.png)
- [Behind tree](evidence/lpc-vegetation/chromium-tree-behind.png)
- [In front of tree](evidence/lpc-vegetation/chromium-tree-front.png)
- [Bridge, boulder and vegetation comparison](evidence/lpc-vegetation/chromium-bridge-boulder-vegetation.png)

- [Hilltop boulder and native flowers](evidence/lpc-vegetation/chromium-hilltop-boulder-flowers.png)
- [Version-11 save with compact trees](evidence/lpc-vegetation/chromium-legacy-compact-trees.png)
- [Rejected procedural vegetation](evidence/world-art-loot/chromium-bridge-boulder-vegetation.png)

Equivalent Firefox captures are retained with the `firefox-` prefix. Screenshots are visual evidence, not a substitute for the movement, collision and persistence assertions in the tests.

## Remaining opportunities

The dense legacy grass pattern, coarse grove landmark and bright cliff rims remain visually busier than the new objects. Some small props in the LPC compilation have simpler shading than its trees; only a restrained subset is used. The chosen baseline predates the locally available commit titled “Improve landscape rendering and grove artwork”; that branch was not merged or duplicated in this workstream. A terrain-palette pass should be separately reviewed against the user's existing river preferences. More species, stronger biome differentiation and subtle canopy movement could follow; this revision deliberately limits variety and avoids extra scenery density. Chests have no item rewards and there is no rare tier. Runtime asset metadata could eventually be folded into a single expanded manifest; the existing PNG manifest remains a source-file inventory, with runtime additions documented in `docs/assets/replacements.md`.

## Changed files

The final Git commit is the authoritative inventory. New modules cover woodland/loot art, loot presentation, loot simulation and treasure placement. Existing edits are limited to the integration points above, tree semantics/generation, portal completion, regression assertions and rendering/save documentation. New unit and browser tests, the dedicated Playwright configuration and this evidence/report complete the workstream.

### Southwest-running correction — separate PR #12

The fix is now isolated in [PR #12](https://github.com/golba98/Forest-RPG-v2/pull/12), with its code and focused tests removed from the world-art PR to allow independent review. `run_southwest.png` and `run_southeast.png`
contain identical decoded pixels, both facing southeast. `AnimationDefs.ts` now mirrors each
southwest run frame through the existing `flipX` renderer path. Frame sequence, timing, source
PNGs, movement vectors and the separate punch mapping are preserved.

Validation: **83 focused tests passed** across animation, punch direction, input/simulation
movement, frame bounds and renderer animation. The new test drives all eight run directions,
both diagonal key orders, all six run frames and run→walk→idle transitions. A decoded-PNG
regression documents the duplicated source so replacing that source later requires revisiting
the flip. Typecheck (through build), lint and production build pass.

**Two browser checks passed**, Chromium and Firefox, using actual held WASD+Shift keys in a
clear fixture. Screenshots were inspected for all diagonal runs; southwest now faces left/down
and southeast faces right/down. Evidence:
[SW](evidence/player-running/chromium-SW.png),
[SE](evidence/player-running/chromium-SE.png),
[NW](evidence/player-running/chromium-NW.png),
[NE](evidence/player-running/chromium-NE.png).
Equivalent Firefox captures are retained. Run with
`npx playwright test --config playwright.world-art.config.ts tests/e2e/player-running.spec.ts`.

Integration point: the run-sheet mapping in `AnimationDefs.ts`; Agent 1's worktree was not edited.
New regression files: `tests/unit/animation/playerRunDirection.test.ts` and
`tests/e2e/player-running.spec.ts`. The dedicated Playwright configuration includes the new test.

### File inventory

- `README.md` (attribution link)
- `docs/assets/replacements.md`
- `docs/qa/world-art-loot-overhaul.md`
- `docs/rendering.md`
- `docs/save-format.md`
- `playwright.world-art.config.ts`
- `src/persistence/SaveManager.ts`
- `src/rendering/LootView.ts`
- `src/rendering/PixiRenderer.ts`
- `src/rendering/woodlandArt.ts` (removed in LPC revision)
- `src/rendering/lootArt.ts`
- `src/rendering/vegetationArt.ts`
- `src/rendering/assetCatalog.ts`
- `src/rendering/terrainArt.ts`
- `public/assets/images/environment/lpc/`: original sheets, original credits, full licence and source README
- `tests/unit/rendering/vegetationArt.test.ts`
- `src/simulation/Simulation.ts`
- `src/systems/CollisionSystem.ts`
- `src/systems/EncounterSystem.ts`
- `src/systems/LootSystem.ts`
- `src/systems/PortalSystem.ts`
- `src/types/entities.ts`
- `src/types/render.ts`
- `src/types/world.ts`
- `src/world/ObjectSemantics.ts`
- `src/world/TreasurePlacement.ts`
- `src/world/WorldGenerator.ts`
- `src/world/generation/woodland.ts`
- `tests/e2e/bridges.spec.ts`
- `tests/e2e/world-art-loot.spec.ts`
- `tests/unit/persistence/saves.test.ts`
- `tests/unit/rendering/weather.test.ts`
- `tests/unit/simulation/collision-regression.test.ts`
- `tests/unit/simulation/loot.test.ts`
- `tests/unit/world/treasure.test.ts`
- `docs/qa/evidence/world-art-loot/`: baseline, Chromium/Firefox captures and generation timings.

- `docs/qa/evidence/lpc-vegetation/`: current Chromium/Firefox gameplay and compatibility captures.

## PR integration handoff

All implementation, licensed source assets, attribution and screenshot evidence are committed.
The reviewed branch starts at `58baaf8`; target `main` advanced to `ce971fe` with landscape/grove
art and documentation changes during development. A read-only `git merge-tree` integration check
found conflicts in `README.md`, `docs/assets/replacements.md`, `docs/rendering.md`,
`docs/save-format.md`, `src/rendering/PixiRenderer.ts`, `src/simulation/Simulation.ts`,
`src/world/WorldGenerator.ts`, and `src/world/generation/woodland.ts`.

The PR is published as a draft to preserve the independently tested work and the instruction to
keep parallel branches separate. Integration must combine the upstream landscape/grove behavior
with the LPC rendering, canopy reservations and treasure initialization, then rerun save,
generation and browser checks. The results above apply to this branch, not an untested combined
revision. Agent 1's separate directional-stability worktree is not included in this PR.

## Complete repository backup

The follow-up request to save everything covers all five registered worktrees and all 19
pre-existing local branches. Ten previously local-only branches were pushed, including
`fix/directional-stability`, `checkpoint/directional-punch`, gameplay repair, visual repair,
integration and earlier agent work. Existing remote branches were preserved. The older local
`main` head has its own backup ref; remote `main` was not rewound.

Previously uncommitted tracked and non-ignored untracked files were saved in new commits:

- [Main-checkout snapshot: 26 files](https://github.com/golba98/Forest-RPG-v2/commit/085447c5ad7aec83fef112c846c63321322cd4ff), branch `save/all-work-20261031-153832/main`.
- [Visual-repair snapshot: 15 files](https://github.com/golba98/Forest-RPG-v2/commit/74f81138237071e413b8d5e6b7dfc13e17188bbd), branch `save/all-work-20261031-153832/claude/visual-rendering-repair`.

Temporary Git indexes captured these snapshots without changing either active checkout's files,
index or branch. All recorded remote commit IDs were checked after an atomic push. The snapshots
preserve work in progress; this does not claim that those other worktrees passed this branch's tests.
Generated dependencies, builds and caches remain excluded by the existing Git ignore rules.

[Machine-readable inventory](evidence/all-work-backup-20261031.json) records every original
branch, its saved commit and remote ref, plus both snapshots' complete file lists. These are
independent recoverable branches; integration conflicts described above remain a separate step.

## Separate pull requests

- [#8 — Woodland artwork and persistent treasure](https://github.com/golba98/Forest-RPG-v2/pull/8).
- [#9 — Player direction/punch checkpoint, including all 26 main-checkout files](https://github.com/golba98/Forest-RPG-v2/pull/9).
- [#10 — Later facing/attack stability, stacked on #9](https://github.com/golba98/Forest-RPG-v2/pull/10).
- [#11 — All 15 visual-repair follow-up files](https://github.com/golba98/Forest-RPG-v2/pull/11).
- [#12 — Standalone southwest-running artwork correction](https://github.com/golba98/Forest-RPG-v2/pull/12).

PR #9's head has exactly the same tree as the saved main-working-copy snapshot. PR #11 compares
the visual follow-up against its original visual-repair branch, showing its complete 15-file
patch. PR #12 is independently based on current main and passed 84 focused tests, both browser
checks and the production build; lint reports five existing landscape warnings. The other
workstreams retain their original test evidence and draft integration notes. Historical backup
branches remain available in the full inventory; no backup was deleted.

## Resolved integration

Current stack: #12 → #9 → #10 → #8. #11's saved visual snapshot is incorporated: its reconciled file tree equals #10's, with original history preserved. All original PR heads have backup refs under `save/pre-conflict-resolution/`. No PR has been merged into main.

Combined verification: 788 unit/integration tests; all 104 browser scenarios passed across the selections documented in [the resolution note](../development/notes/pr-conflict-resolution.md), including the four corrected alias assertions. Typecheck and production build pass; lint has zero errors and five existing landscape warnings. The static v10 fixtures are preserved and load-compatibility checks replace obsolete v10-generation expectations. See the resolution note for the reservation, trace, renderer and combat reconciliation decisions.
