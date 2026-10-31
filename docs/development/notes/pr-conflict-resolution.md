# PR conflict resolution

## Goal

Preserve every saved workstream while resolving PR integration against current main. Original PR heads remain on `save/pre-conflict-resolution/*`; earlier all-work snapshots are also retained.

## Approach

Review order: #12 (running) → #9 (direction checkpoint) → #10 (stability) → #8 (world art/treasure). #11's saved visual follow-up is included in the reconciliation history and its final tree is byte-identical to #10; it is superseded rather than replaying obsolete implementations.

Both player-sprite and grove diagnostics survive. The canonical southwest strip is mirrored once, preserving frame sequence; animation regressions use its southwest alias. Simulation-owned slash identity, stationary aim assistance and movement-facing punches remain authoritative.

World art retains grove/soil layers and both asset-credit records. Native canopy envelopes pass through the shared LandscapePlan reservation query. Treasure is placed after encounter/hilltop preparation and before final landscape-trace attachment. Schema 2 loads generator versions 0–12; only v12 is generated, and future v13 metadata is rejected. Historical v10 fixtures remain unchanged and are verified through loading rather than incorrectly expecting v12 generation to reproduce them.

The visual snapshot's conflicting code represented older slash, minimap, weather-layer and combat-direction implementations already superseded in the newer branch. Those newer implementations and all nonconflicting visual work are retained; the original snapshot commit remains an ancestor.

## Validation

Combined code: typecheck, lint (zero errors; five existing landscape warnings), and production build pass. Full unit/integration run: 788 tests across 66 files. The focused integration pass also passed 284 tests. Browser coverage passed all 104 scenarios: 20 art/loot/bridge/save, eight landscape/sprint/minimap, and 76 direction/menu. The direction/menu run initially passed 72/76; four cases asserted the obsolete SE alias. After correcting only that assertion (the independent mirrored-pixel reference remains SE), all four affected cases passed in Chromium/Firefox. No tracked baseline fixture was regenerated.

## Handoff

Branches are pushed without force and PR bases are updated in dependency order. No PR is automatically merged into main. The final combined world-art branch must retain all five original PR heads as ancestors; check that invariant before completion. Other active worktrees and their indexes are untouched.
