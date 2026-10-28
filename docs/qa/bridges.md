# Woodland bridge verification — 2026-10-28

New worlds generate seeded, two-tile-wide timber crossings over unchanged river tiles. Placement checks the full water gap, level bank ends and broad approaches, reserves them against later objects, and validates the finished route. The walking deck, rails, navigation and minimap share the bridge records and geometry. Swimming remains available outside the deck. Existing saves without bridge records retain their original terrain and crossings.

Validation completed:

- `npm test`: 371 tests passed across 43 files. Bridge placement fixtures cover both orientations and all water spans from 1 through 6 tiles. The existing 100-seed topology sweep now also checks bridge terrain, obstruction clearance and ground-enemy routes, across sizes from 32 to 150 tiles and all difficulties.
- After the final surface-query and validation adjustments, 78 focused collision, bridge, persistence and topology tests passed. Save tests cover a player on the deck, unchanged terrain, legacy compatibility, and rejection of invalid or overlapping bridge data.
- 50 distinct Playwright checks passed across Chromium and Firefox, covering bridges, generated worlds, terrain effects, visual rendering, ledge/HUD behavior and gameplay repair. Bridge checks walk short and long spans in both directions, at the centre and near both rails; verify side blocking, minimap pixels, page reloads, and regeneration cleanup; and traverse natural crossings in seeds 1, 42 and 456.
- The broader browser run exposed two terrain-replacement fixtures retaining copied bridge records. Those fixtures now clear bridges and fail explicitly if their save cannot load. The gameplay assertion also uses the current feet footprint instead of its old centred square. The affected checks pass after these fixture corrections.
- Build, TypeScript, ESLint and `git diff --check` pass. Vite continues to report its Pixi bundle-size advisory.

Normal-zoom screenshots were inspected for plank joins, shore coverage, bank anchoring, deck width, posts, player layering, shadows and unobstructed entrances:

- [Vertical crossing at 1080p, seed 1](evidence/bridges/vertical-1080p.png)
- [Horizontal crossing at 720p, seed 42](evidence/bridges/horizontal-720p.png)
- [Six-tile water span near a side rail](evidence/bridges/long-span-edge.png)

Bridge density, spacing, acceptable spans and approach reservations are configured in `GAME_CONFIG.world.bridges`. New art uses the existing runtime texture lifecycle; regeneration replaces bridge sprites without allocating another texture set. No new dependencies, hosting changes or pushes were made.
