# E2E Test Infra: Forest RPG V2

## Test Philosophy
- Opaque-box, requirement-driven. Derived strictly from `ORIGINAL_REQUEST.md` and user-facing specifications, without internal module dependencies.
- Verification mechanism: Playwright browser test runners and headless simulation harness.
- Methodology: Category-Partition + Boundary Value Analysis (BVA) + Pairwise Combinatorial Testing + Real-World Workload Testing across 4 sequential tiers.

## Feature Inventory
| # | Feature | Source (requirement) | Tier 1 (Feature) | Tier 2 (Boundary) | Tier 3 (Cross-Feature) |
|---|---------|---------------------|:----------------:|:-----------------:|:----------------------:|
| 1 | Standalone TypeScript Engine & Loop | ORIGINAL_REQUEST §R1 | 5 | 5 | ✓ |
| 2 | 2D Camera (Follow, Zoom, Bounds, Shake) | ORIGINAL_REQUEST §R1 | 5 | 5 | ✓ |
| 3 | Keyboard Input System & Rebinding | ORIGINAL_REQUEST §R1 | 5 | 5 | ✓ |
| 4 | High-Fidelity Pixel-Art & Nearest-Neighbor | ORIGINAL_REQUEST §R2 | 5 | 5 | ✓ |
| 5 | Chunked Terrain & Viewport Culling | ORIGINAL_REQUEST §R2 | 5 | 5 | ✓ |
| 6 | Depth-Sorted Entity Layers | ORIGINAL_REQUEST §R2 | 5 | 5 | ✓ |
| 7 | Day/Night Lighting Transitions | ORIGINAL_REQUEST §R2 | 5 | 5 | ✓ |
| 8 | Ambient Weather Particle Effects | ORIGINAL_REQUEST §R2 | 5 | 5 | ✓ |
| 9 | Pixel-Art HUD & Adaptive Scaling | ORIGINAL_REQUEST §R2 | 5 | 5 | ✓ |
| 10 | Seeded Procedural World Gen & Connectivity | ORIGINAL_REQUEST §R3 | 5 | 5 | ✓ |
| 11 | Top-Down Collision Detection & Response | ORIGINAL_REQUEST §R3 | 5 | 5 | ✓ |
| 12 | Player Mechanics (Move, Sprint, Stamina, Mana) | ORIGINAL_REQUEST §R3 | 5 | 5 | ✓ |
| 13 | Player Jump Arc & Dash Mechanics | ORIGINAL_REQUEST §R3 | 5 | 5 | ✓ |
| 14 | Bestiary AI (Mantis Melee, Flee at 1 HP) | ORIGINAL_REQUEST §R3 | 5 | 5 | ✓ |
| 15 | Bestiary AI (Maggot Ranged Acid Spit) | ORIGINAL_REQUEST §R3 | 5 | 5 | ✓ |
| 16 | Bestiary AI (Beetle Boss, Lunge, Anti-Stuck) | ORIGINAL_REQUEST §R3 | 5 | 5 | ✓ |
| 17 | Bestiary AI (Ghost Night Elite, Phase Walls) | ORIGINAL_REQUEST §R3 | 5 | 5 | ✓ |
| 18 | Real-Time Combat (Combo, Crush, Skills Q/E) | ORIGINAL_REQUEST §R3 | 5 | 5 | ✓ |
| 19 | Loot Drops, Consumables & Environmental Cut | ORIGINAL_REQUEST §R3 | 5 | 5 | ✓ |
| 20 | XP Progression, Leveling & Stat Points | ORIGINAL_REQUEST §R3 | 5 | 5 | ✓ |
| 21 | Tutorial Flow (Training Glade -> Level 1) | ORIGINAL_REQUEST §R3 | 5 | 5 | ✓ |
| 22 | Portal Activation & Victory Sequence | ORIGINAL_REQUEST §R3 | 5 | 5 | ✓ |
| 23 | In-Game Debug Terminal Commands | ORIGINAL_REQUEST §R3 | 5 | 5 | ✓ |
| 24 | Versioned JSON Persistence | ORIGINAL_REQUEST §R3 | 5 | 5 | ✓ |
| 25 | Legacy Save Adapter (active_map.json format) | ORIGINAL_REQUEST §R3 | 5 | 5 | ✓ |

## Test Architecture
- **Test Runner**:
  - Unit/Integration: `npm test` (Vitest)
  - E2E Browser: `npm run test:e2e` (Playwright)
  - Headless WebGL / Chromium: executed with `--use-gl=angle` or software rasterizer fallback.
- **Pass/Fail Semantics**: Exit code 0, 100% assertions green, zero console errors or uncaught exceptions.
- **Directory Layout**:
  - `tests/e2e/tier1-feature/`
  - `tests/e2e/tier2-boundary/`
  - `tests/e2e/tier3-pairwise/`
  - `tests/e2e/tier4-application/`
  - `tests/benchmarks/`

## Real-World Application Scenarios (Tier 4)
| # | Scenario | Features Exercised | Complexity |
|---|----------|--------------------|------------|
| 1 | Complete Tutorial to Level 1 Progression | F3, F9, F10, F11, F12, F18, F21, F22 | High |
| 2 | Night Survival & Ghost Encounter | F7, F8, F12, F17, F18, F19, F20 | High |
| 3 | Beetle Boss Dungeon Showdown | F2, F9, F11, F12, F16, F18, F20, F22 | Very High |
| 4 | Legacy Save Migration & Playback | F10, F11, F24, F25 | Medium |
| 5 | Full Level Clear & Portal Victory Run | F2, F5, F6, F9, F10, F11, F14, F15, F18, F19, F20, F22 | Extreme |
| 6 | Debug Console Terminal Cheat & Stress Test | F1, F10, F18, F23 | Medium |

## Coverage Thresholds
- 25 Identified Features:
  - Tier 1: ≥ 125 test cases (5 per feature)
  - Tier 2: ≥ 125 test cases (5 per feature)
  - Tier 3: ≥ 25 pairwise cross-feature interaction test cases
  - Tier 4: ≥ 13 realistic end-to-end application scenarios
- **Total Minimum Target: ≥ 288 test cases**
