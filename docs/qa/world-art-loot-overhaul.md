# World art and loot overhaul

Branch: `feat/world-art-loot-overhaul` · baseline: `58baaf8` · 2026-10-31.
Worktree: `../18-Forest-RPG-v2-world-art`. No merge, push or deployment.

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

All new art is authored in `src/rendering/woodlandArt.ts` using integer pixels and polygon scan conversion. It extends the existing project-owned bridge material palette and the boulders' northwest lighting convention. There are no downloaded packs, generated bitmap placeholders, watermarks or new third-party license obligations. Existing source PNGs remain intact with their existing provenance; this work does not assert new ownership over those originals.

Native assets: tall 64×80, broad 80×64, young 40×48; compatibility/boundary 64×64; bushes 16×48 and 32×32; logs/stump 32×32, 32×48 and 32×32; fern/mushroom 24×24; coin four 32×32 frames; two chest sets with four 32×32 states each. No smooth gradients or fractional sprite scaling are used for the new trees, coins, chests or logs. Sparse translucent contact shadows integrate the silhouettes with terrain.

Existing saved object trees retain their coordinates and 64×64 envelope. New-world trees reserve the larger canopy envelope. River-adjacent trees favor broad crowns; bank detail favors ferns. Other flower kinds remain unchanged. Ferns and mushrooms reuse existing passable flower-clump slots: object count does not grow. Solid forest/border tiles use additional understory within the boundary-tree sprite so their blocked space remains visually legible.

Visual iteration: the first log revision looked too much like straight posts. It was replaced with broken contours, branching ends, bark grain, cut wood and moss. Final comparison captures disable clouds to expose silhouettes and depth clearly; the normal cloud/weather behavior is unchanged.

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
- `PixiRenderer`: texture registration, tree selection, chest frame override, native coin scale/lift, loot-view update and bonus-aware portal label.
- Entity/render/world types and `SaveManager`: optional additive loot fields and validation.
- `CollisionSystem`: registered chest base footprints plus a target-only visibility exclusion. Movement algorithms are unchanged.

Agent 1's checkout and uncommitted work were not edited or copied. Changes to overlapping files require normal integration review; no branches were merged.

## Verification

Final validation results: **522 unit/integration tests and 20 production browser checks passed**. Commands use this worktree's own `npm ci` dependencies. An initial shared-dependency run was discarded because that installation used Vite 7/Vitest 4 instead of the lockfile's Vite 5/Vitest 2.

- Full unit/integration suite: final run **522/522 passed across 57 files**, including the additional persistence and defeat tests.
- Focused tests cover deterministic seeds 42, 1, 123 and 456, unique chest IDs, safe approaches/bypasses, trunk collision, canopy traversal, optional progression, exactly-once rewards, legacy defaults, corrupted-save rejection and mid-opening restore.
- Initial Chromium and Firefox visual/gameplay run: **4/4 passed**, with no page errors or missing textures.
- Production browser suite: **20/20 passed across Chromium and Firefox**. It covers the new gameplay scenarios plus existing bridge traversal, rails, layering, save/reload and save-flow checks. The final run uses an isolated production preview on port 4183, hardware WebGL, one worker and a 90-second budget. The clock setup now leaves 60 seconds of headroom before pausing to avoid host-load timing races. An earlier development-server broad run was interrupted after screenshot timeouts amid concurrent browser workloads and source updates; it is not counted as passing evidence.
- Production build succeeds. Vite reports the existing large Pixi vendor-chunk advisory.
- Typecheck, lint and `git diff --check` are run separately.
- Existing world-generation benchmarks completed on both baseline and changed code. A same-process alternating comparison for seeds 42/1/123/456 averaged 2,213 ms before and 2,253 ms after (about +1.8%); every new world had four chests and prop counts stayed equal or decreased slightly. These single-sample shared-host timings are indicative, not a stable hardware performance guarantee. Raw results: `evidence/world-art-loot/generation-timings.json`.

Reproduce: `npm ci`, `npm test`, `npm run typecheck`, `npm run lint`, `npm run build`, then `npx playwright test --config playwright.world-art.config.ts`. Run locally with `npm run dev -- --port 4182`.

## Screenshot evidence

All evidence is under `docs/qa/evidence/world-art-loot/`. The baseline screenshot is from the unmodified committed baseline; generator version changes mean a new seed-42 layout need not match v10 placements exactly. Browser screenshots exercise the actual game, with debug relocation used to reach distant objects and a documented bridge fixture for controlled occlusion/traversal checks.

- [Before: seed 42](evidence/world-art-loot/before-seed42.png)
- [Before: matched bridge/vegetation fixture](evidence/world-art-loot/before-bridge-boulder-vegetation.png)
- [Forest artwork](evidence/world-art-loot/chromium-forest.png)
- [Desktop forest, 1920×1080](evidence/world-art-loot/chromium-forest-desktop.png)
- [Closed chest](evidence/world-art-loot/chromium-chest-closed.png)
- [Opening animation](evidence/world-art-loot/chromium-chest-opening.png)
- [Reward and opened chest](evidence/world-art-loot/chromium-chest-reward.png)
- [World coin](evidence/world-art-loot/chromium-coin-world.png)
- [Coin collected](evidence/world-art-loot/chromium-coin-collected.png)
- [Behind tree](evidence/world-art-loot/chromium-tree-behind.png)
- [In front of tree](evidence/world-art-loot/chromium-tree-front.png)
- [Bridge, boulder and vegetation comparison](evidence/world-art-loot/chromium-bridge-boulder-vegetation.png)

Equivalent Firefox captures are retained with the `firefox-` prefix. Screenshots are visual evidence, not a substitute for the movement, collision and persistence assertions in the tests.

## Remaining opportunities

The dense legacy grass pattern, coarse grove landmark and bright cliff rims remain visually busier than the new objects. The chosen baseline predates the locally available commit titled “Improve landscape rendering and grove artwork”; that branch was not merged or duplicated in this workstream. A terrain-palette pass should be separately reviewed against the user's existing river preferences. More species, stronger biome differentiation and subtle canopy movement could follow; this revision deliberately limits variety and avoids extra scenery density. Chests have no item rewards and there is no rare tier. Runtime asset metadata could eventually be folded into a single expanded manifest; the existing PNG manifest remains a source-file inventory, with runtime additions documented in `docs/assets/replacements.md`.

## Changed files

The final Git commit is the authoritative inventory. New modules cover woodland/loot art, loot presentation, loot simulation and treasure placement. Existing edits are limited to the integration points above, tree semantics/generation, portal completion, regression assertions and rendering/save documentation. New unit and browser tests, the dedicated Playwright configuration and this evidence/report complete the workstream.

### Directional regression reported during this workstream

The user reports that **A+S+Shift (southwest running) displays the S+D+Shift (southeast) appearance**.
Reference supplied: `/home/k9-vortex/Pictures/Screenshots/Screenshot From 2026-10-31 16-17-27.png`.
The static screenshot cannot independently establish the held keys. Agent 1 should compare the
southwest/southeast run-sheet selection and horizontal mirroring with the actual movement vector.
No directional code was changed on this branch; this is an integration review item, not a claimed fix.

### File inventory

- `docs/assets/replacements.md`
- `docs/qa/world-art-loot-overhaul.md`
- `docs/rendering.md`
- `docs/save-format.md`
- `playwright.world-art.config.ts`
- `src/persistence/SaveManager.ts`
- `src/rendering/LootView.ts`
- `src/rendering/PixiRenderer.ts`
- `src/rendering/woodlandArt.ts`
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
