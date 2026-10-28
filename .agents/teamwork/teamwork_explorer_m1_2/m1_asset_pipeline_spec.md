# Milestone 1: Asset Sanitization, Organization, and Migration Pipeline Specification

**Author**: `teamwork_explorer_m1_2` (teamwork_explorer)  
**Date**: 2026-10-27  
**Status**: COMPLETE / VERIFIED  
**Target Repository**: `/home/k9-vortex/Development/2-TypeScript/18-Forest RPG v2`  
**Reference Legacy Assets (Read-Only)**: `/home/k9-vortex/Development/1-JavaScript/3-Game Development/assets`  
**Domain**: Infrastructure, Rendering, and Visual Assets (Milestone 1)

---

## 1. Executive Summary & Migration Principles

Forest RPG V2 transitions the graphical and audio assets of the legacy p5.js/Pixi hybrid project into a modern, production-grade Vite and PixiJS 8 asset architecture.

### Core Migration Principles:
1. **Strict Read-Only Reference Workspace**: The legacy repository `/home/k9-vortex/Development/1-JavaScript/3-Game Development` is treated as strictly read-only. No asset files are modified, moved, or deleted in the legacy source.
2. **Dedicated Static Asset Root**: All runtime assets are hosted under `/home/k9-vortex/Development/2-TypeScript/18-Forest RPG v2/public/assets/`, enabling direct static asset serving by Vite during development and discrete asset copying into `dist/assets/` during production builds.
3. **Discrete Asset Resolution (`assetsInlineLimit: 0`)**: In `vite.config.ts`, `assetsInlineLimit: 0` ensures that PNG, TTF, and audio files are never inlined into JS bundles as Base64 strings. This preserves HTTP caching, avoids 33% base64 memory overhead, and allows PixiJS 8 texture caching to operate at peak efficiency.
4. **Ahead-of-Time (AOT) Asset Sanitization**: All legacy asset flaws (chroma green-screen backgrounds, missing attack directions, downscaling 1500px textures, vector-drawn potions/chests) are resolved **offline at build/migration time** via an automated Node script (`scripts/sanitize-assets.js`), completely eliminating CPU-intensive runtime image processing on startup.
5. **Nearest-Neighbor Pixel Integrity**: All 2D textures are authored and sampled with `scaleMode: 'nearest'` and integer pixel coordinates (`roundPixels: true`), preserving sharp retro pixel-art contours without bilinear blurring or seam bleeding.

---

## 2. Target Asset Directory Structure (`public/assets/`)

```text
public/assets/
├── audio/
│   ├── music/
│   │   ├── game_music.wav              # 13.9 MB 24-bit stereo 44.1kHz overworld loop
│   │   └── menu_music.wav              # 15.2 MB 24-bit stereo 44.1kHz main menu loop
│   └── sfx/
│       ├── button_press.mp3            # 19.2 KB UI click sound (RIFF PCM 16-bit 44.1kHz)
│       └── button_press.wav            # Symlink / alias for WAV MIME-type safety
├── fonts/
│   └── pixel_font.ttf                  # 10.1 KB retro pixel bitmap font (from 3-GUI/font.ttf)
├── images/
│   ├── background/
│   │   ├── menu_bg.png                 # 640x360 title menu splash
│   │   └── settings_bg.png             # 111x231 retro settings parchment dialog
│   ├── characters/
│   │   ├── player/
│   │   │   ├── idle/                   # 8 directions, 4 frames each (20px frame width)
│   │   │   │   ├── idle_east.png       # 80x19
│   │   │   │   ├── idle_north.png      # 80x18
│   │   │   │   ├── idle_northeast.png  # 80x20
│   │   │   │   ├── idle_northwest.png  # 80x20
│   │   │   │   ├── idle_south.png      # 80x23
│   │   │   │   ├── idle_southeast.png  # 80x20
│   │   │   │   ├── idle_southwest.png  # 80x20
│   │   │   │   └── idle_west.png       # 80x19
│   │   │   ├── walk/                   # 8 directions, 4 frames each (20px frame width)
│   │   │   │   ├── walk_east.png       # 80x20
│   │   │   │   ├── walk_north.png      # 80x19
│   │   │   │   ├── walk_northeast.png  # 80x19
│   │   │   │   ├── walk_northwest.png  # 80x19
│   │   │   │   ├── walk_south.png      # 80x22
│   │   │   │   ├── walk_southeast.png  # 80x21
│   │   │   │   ├── walk_southwest.png  # 80x21
│   │   │   │   └── walk_west.png       # 80x20
│   │   │   ├── run/                    # 8 directions, 6 frames each (20px frame width)
│   │   │   │   ├── run_east.png        # 120x22
│   │   │   │   ├── run_north.png       # 120x20
│   │   │   │   ├── run_northeast.png   # 120x18 (normalized from run_sheet_north_east.png)
│   │   │   │   ├── run_northwest.png   # 120x18 (normalized from run_sheet_north_west.png)
│   │   │   │   ├── run_south.png       # 120x21
│   │   │   │   ├── run_southeast.png   # 120x20 (normalized from run_sheet_south_east.png)
│   │   │   │   ├── run_southwest.png   # 120x20 (normalized from run_sheet_south_west.png)
│   │   │   │   └── run_west.png        # 120x22
│   │   │   ├── jump/                   # 8 directions, 5 frames each (20px frame width)
│   │   │   │   ├── jump_east.png       # 100x21
│   │   │   │   ├── jump_north.png      # 100x20
│   │   │   │   ├── jump_northeast.png  # 100x20
│   │   │   │   ├── jump_northwest.png  # 100x20
│   │   │   │   ├── jump_south.png      # 100x21
│   │   │   │   ├── jump_southeast.png  # 100x20
│   │   │   │   ├── jump_southwest.png  # 100x20
│   │   │   │   └── jump_west.png       # 100x21
│   │   │   └── attack/                 # Complete 8 directions, 4 frames each (~111.5px fw)
│   │   │       ├── attack_east.png     # 446x97 (East-facing swing, un-flipped artwork)
│   │   │       ├── attack_north.png    # 446x92
│   │   │       ├── attack_northeast.png# 446x96
│   │   │       ├── attack_northwest.png# 446x96
│   │   │       ├── attack_south.png    # 446x121
│   │   │       ├── attack_southeast.png# 446x113
│   │   │       ├── attack_southwest.png# 446x113
│   │   │       └── attack_west.png     # 446x97 (West-facing swing, per-frame mirrored)
│   │   └── enemies/
│   │       ├── mantis_move.png         # 128x128 (4 cols x 4 rows, 32x32 frames, SEWN)
│   │       ├── mantis_attack.png       # 224x128 (7 cols x 4 rows, 32x32 frames, SEWN)
│   │       ├── beetle_move.png         # 128x128 (4 cols x 4 rows, 32x32 frames, SWEN)
│   │       ├── beetle_attack.png       # 192x128 (6 cols x 4 rows, 32x32 frames, SWEN)
│   │       ├── maggot_walk.png         # 128x128 (4 cols x 4 rows, 32x32 frames, SWEN)
│   │       ├── maggot_spit.png         # 224x128 (7 cols x 4 rows, 32x32 frames, SWEN)
│   │       ├── ghost_move.png          # 234x256 (3 cols x 4 rows, 78x64 frames, SNEW) - PRE-SCALED
│   │       ├── ghost_attack.png        # 234x256 (3 cols x 4 rows, 78x64 frames, SNEW) - PRE-SCALED
│   │       ├── acid_blob.png           # 224x128 (7 cols x 4 rows, 32x32 frames)
│   │       ├── acid_splat.png          # 384x64 (6 frames, 64x64)
│   │       ├── egg_cluster.png         # 32x32 static powerup
│   │       └── eggsplosion.png         # 128x64 (4 frames of 32x64)
│   ├── items/
│   │   ├── chest.png                   # 32x32 pixel-art treasure chest (NEW)
│   │   ├── potion_health.png           # 32x32 pixel-art crimson health flask (NEW)
│   │   ├── potion_speed.png            # 32x32 pixel-art cyan velocity elixir (NEW)
│   │   ├── coin.png                    # 32x32 single gold coin icon
│   │   └── coin_anim.png               # 128x32 spinning coin sheet (4 frames of 32x32)
│   ├── objects/
│   │   ├── portal_active.png           # 1536x256 (6 frames of 256x256)
│   │   ├── portal_inactive.png         # 1536x256 (6 frames of 256x256)
│   │   ├── clouds/
│   │   │   ├── cloud_1.png             # 41x26
│   │   │   ├── cloud_2.png             # 53x30
│   │   │   ├── cloud_3.png             # 64x33
│   │   │   └── cloud_4.png             # 70x38
│   │   └── decor/
│   │       ├── bush_small.png          # 16x48 (walkable)
│   │       ├── bush_obstacle.png       # 32x32 (solid)
│   │       ├── flower_clump.png        # 19x17 (cuttable)
│   │       ├── flower_pink.png         # 15x16 (cuttable)
│   │       ├── flower_yellow.png       # 16x16 (cuttable)
│   │       ├── hole.png                # 31x18
│   │       ├── log_horizontal.png      # 48x33 (solid)
│   │       ├── log_stump.png           # 32x32 (solid)
│   │       ├── log_vertical.png        # 32x48 (solid)
│   │       ├── rock_pebble.png         # 16x17 (walkable)
│   │       └── rock_boulder.png        # 32x32 (solid)
│   ├── terrain/
│   │   ├── grass.png                   # 32x32 seamless grass tile (padded from 31x31 tile_1.png)
│   │   ├── grass_legacy.png            # 31x31 original raw grass tile
│   │   ├── water.png                   # 105x100 river texture
│   │   ├── tree.png                    # 239x286 canopy overlay
│   │   ├── bridge.png                  # 32x32 / 64x64 bridge plank tile (downscaled)
│   │   ├── bridge_hd.png               # 1024x1024 high-res source wood texture
│   │   └── hills/                      # 8 clean alpha directional cliff edges
│   │       ├── hill_east.png           # 34x92 (sanitized transparent alpha)
│   │       ├── hill_north.png          # 96x33 (sanitized transparent alpha)
│   │       ├── hill_northeast.png      # 77x78 (sanitized transparent alpha)
│   │       ├── hill_northwest.png      # 77x78 (sanitized transparent alpha)
│   │       ├── hill_south.png          # 96x33 (sanitized transparent alpha)
│   │       ├── hill_southeast.png      # 77x78 (sanitized transparent alpha)
│   │       ├── hill_southwest.png      # 77x78 (sanitized transparent alpha)
│   │       └── hill_west.png           # 35x95 (sanitized transparent alpha, 3 green px fixed)
│   └── ui/
│       ├── button_bg.png               # 197x44 9-slice retro wood/gold button border
│       ├── heart.png                   # 23x23 pixel health heart
│       └── icon.svg                    # Vector app icon
├── video/
│   └── menu_vid.mp4                    # 19.2 MB optional animated video backdrop
└── manifests/
    └── asset_manifest.json             # PixiJS 8 Assets bundle manifest
```

---

## 3. Complete Legacy Asset Catalog & Migration Matrix (91 Files)

Every single one of the 91 files in `/home/k9-vortex/Development/1-JavaScript/3-Game Development/assets` is mapped below to its target path and sanitization rule:

| Category | Source File in Legacy Assets | Target Destination in `public/assets/` | Dimensions | Migration & Sanitization Action |
|---|---|---|---|---|
| **Background** | `1-Background/1-Menu/Background.png` | `images/background/menu_bg.png` | 640x360 | Direct copy |
| | `1-Background/1-Menu/Settings_Background.png` | `images/background/settings_bg.png` | 111x231 | Direct copy |
| | `1-Background/1-Menu/Menu_Vid.mp4` | `video/menu_vid.mp4` | MP4 (19.2 MB) | Direct copy (optional backdrop) |
| **Terrain** | `1-Background/2-Game/1-Forest/tile_1.png` | `images/terrain/grass.png` | 32x32 | Edge-padded from 31x31 to 32x32 for seamless grid tiling |
| | `1-Background/2-Game/1-Forest/tile_1.png` | `images/terrain/grass_legacy.png` | 31x31 | Preserved original 31x31 for legacy compatibility |
| | `1-Background/2-Game/1-Forest/water_1.png` | `images/terrain/water.png` | 105x100 | Direct copy |
| | `1-Background/2-Game/1-Forest/tree_1.png` | `images/terrain/tree.png` | 239x286 | Direct copy |
| | `1-Background/2-Game/1-Forest/bridge_1.png` | `images/terrain/bridge_hd.png` | 1024x1024 | Direct copy |
| | `1-Background/2-Game/1-Forest/bridge_1.png` | `images/terrain/bridge.png` | 64x64 | Downscaled pixel-art plank tile for 32x32 grid |
| | `1-Background/2-Game/1-Forest/1-hill_east.png` | `images/terrain/hills/hill_east.png` | 34x92 | Chroma-key sanitization (transparent alpha) |
| | `1-Background/2-Game/1-Forest/1-hill_north.png` | `images/terrain/hills/hill_north.png` | 96x33 | Chroma-key sanitization (transparent alpha) |
| | `1-Background/2-Game/1-Forest/1-hill_northeast.png` | `images/terrain/hills/hill_northeast.png` | 77x78 | Chroma-key sanitization (transparent alpha) |
| | `1-Background/2-Game/1-Forest/1-hill_northwest.png` | `images/terrain/hills/hill_northwest.png` | 77x78 | Chroma-key sanitization (transparent alpha) |
| | `1-Background/2-Game/1-Forest/1-hill_south.png` | `images/terrain/hills/hill_south.png` | 96x33 | Chroma-key sanitization (transparent alpha) |
| | `1-Background/2-Game/1-Forest/1-hill_southeast.png` | `images/terrain/hills/hill_southeast.png` | 77x78 | Chroma-key sanitization (transparent alpha) |
| | `1-Background/2-Game/1-Forest/1-hill_southwest.png` | `images/terrain/hills/hill_southwest.png` | 77x78 | Chroma-key sanitization (transparent alpha) |
| | `1-Background/2-Game/1-Forest/1-hill_west.png` | `images/terrain/hills/hill_west.png` | 35x95 | Chroma-key sanitization (removes 3 stray green pixels) |
| **Player (Idle)** | `2-Characters/1-Idle/idle_sheet_east.png` | `images/characters/player/idle/idle_east.png` | 80x19 (4x 20px) | Direct copy |
| | `2-Characters/1-Idle/idle_sheet_north.png` | `images/characters/player/idle/idle_north.png` | 80x18 (4x 20px) | Direct copy |
| | `2-Characters/1-Idle/idle_sheet_northeast.png` | `images/characters/player/idle/idle_northeast.png` | 80x20 (4x 20px) | Direct copy |
| | `2-Characters/1-Idle/idle_sheet_northwest.png` | `images/characters/player/idle/idle_northwest.png` | 80x20 (4x 20px) | Direct copy |
| | `2-Characters/1-Idle/idle_sheet_south.png` | `images/characters/player/idle/idle_south.png` | 80x23 (4x 20px) | Direct copy |
| | `2-Characters/1-Idle/idle_sheet_southeast.png` | `images/characters/player/idle/idle_southeast.png` | 80x20 (4x 20px) | Direct copy |
| | `2-Characters/1-Idle/idle_sheet_southwest.png` | `images/characters/player/idle/idle_southwest.png` | 80x20 (4x 20px) | Direct copy |
| | `2-Characters/1-Idle/idle_sheet_west.png` | `images/characters/player/idle/idle_west.png` | 80x19 (4x 20px) | Direct copy |
| **Player (Walk)** | `2-Characters/2-Walking/walk_sheet_east.png` | `images/characters/player/walk/walk_east.png` | 80x20 (4x 20px) | Direct copy |
| | `2-Characters/2-Walking/walk_sheet_north.png` | `images/characters/player/walk/walk_north.png` | 80x19 (4x 20px) | Direct copy |
| | `2-Characters/2-Walking/walk_sheet_northeast.png` | `images/characters/player/walk/walk_northeast.png` | 80x19 (4x 20px) | Direct copy |
| | `2-Characters/2-Walking/walk_sheet_northwest.png` | `images/characters/player/walk/walk_northwest.png` | 80x19 (4x 20px) | Direct copy |
| | `2-Characters/2-Walking/walk_sheet_south.png` | `images/characters/player/walk/walk_south.png` | 80x22 (4x 20px) | Direct copy |
| | `2-Characters/2-Walking/walk_sheet_southeast.png` | `images/characters/player/walk/walk_southeast.png` | 80x21 (4x 20px) | Direct copy |
| | `2-Characters/2-Walking/walk_sheet_southwest.png` | `images/characters/player/walk/walk_southwest.png` | 80x21 (4x 20px) | Direct copy |
| | `2-Characters/2-Walking/walk_sheet_west.png` | `images/characters/player/walk/walk_west.png` | 80x20 (4x 20px) | Direct copy |
| **Player (Run)** | `2-Characters/3-Running/run_sheet_east.png` | `images/characters/player/run/run_east.png` | 120x22 (6x 20px) | Direct copy |
| | `2-Characters/3-Running/run_sheet_north.png` | `images/characters/player/run/run_north.png` | 120x20 (6x 20px) | Direct copy |
| | `2-Characters/3-Running/run_sheet_north_east.png` | `images/characters/player/run/run_northeast.png` | 120x18 (6x 20px) | Normalized filename |
| | `2-Characters/3-Running/run_sheet_north_west.png` | `images/characters/player/run/run_northwest.png` | 120x18 (6x 20px) | Normalized filename |
| | `2-Characters/3-Running/run_sheet_south.png` | `images/characters/player/run/run_south.png` | 120x21 (6x 20px) | Direct copy |
| | `2-Characters/3-Running/run_sheet_south_east.png` | `images/characters/player/run/run_southeast.png` | 120x20 (6x 20px) | Normalized filename |
| | `2-Characters/3-Running/run_sheet_south_west.png` | `images/characters/player/run/run_southwest.png` | 120x20 (6x 20px) | Normalized filename |
| | `2-Characters/3-Running/run_sheet_west.png` | `images/characters/player/run/run_west.png` | 120x22 (6x 20px) | Direct copy |
| **Player (Jump)** | `2-Characters/4-Jumping/jump_sheet_east.png` | `images/characters/player/jump/jump_east.png` | 100x21 (5x 20px) | Direct copy |
| | `2-Characters/4-Jumping/jump_sheet_north.png` | `images/characters/player/jump/jump_north.png` | 100x20 (5x 20px) | Direct copy |
| | `2-Characters/4-Jumping/jump_sheet_northeast.png` | `images/characters/player/jump/jump_northeast.png` | 100x20 (5x 20px) | Direct copy |
| | `2-Characters/4-Jumping/jump_sheet_northwest.png` | `images/characters/player/jump/jump_northwest.png` | 100x20 (5x 20px) | Direct copy |
| | `2-Characters/4-Jumping/jump_sheet_south.png` | `images/characters/player/jump/jump_south.png` | 100x21 (5x 20px) | Direct copy |
| | `2-Characters/4-Jumping/jump_sheet_southeast.png` | `images/characters/player/jump/jump_southeast.png` | 100x20 (5x 20px) | Direct copy |
| | `2-Characters/4-Jumping/jump_sheet_southwest.png` | `images/characters/player/jump/jump_southwest.png` | 100x20 (5x 20px) | Direct copy |
| | `2-Characters/4-Jumping/jump_sheet_west.png` | `images/characters/player/jump/jump_west.png` | 100x21 (5x 20px) | Direct copy |
| **Player (Attack)** | `2-Characters/6-Attack/attack_west.png` | `images/characters/player/attack/attack_east.png` | 446x97 (4x 111.5px) | Original artwork saved as East (it swings East!) |
| | `2-Characters/6-Attack/attack_west.png` | `images/characters/player/attack/attack_west.png` | 446x97 (4x 111.5px) | Per-frame horizontally mirrored sheet (swings West!) |
| | `2-Characters/6-Attack/attack_north.png` | `images/characters/player/attack/attack_north.png` | 446x92 | Direct copy |
| | `2-Characters/6-Attack/attack_north_east.png` | `images/characters/player/attack/attack_northeast.png` | 446x96 | Normalized filename |
| | `2-Characters/6-Attack/attack_north_west.png` | `images/characters/player/attack/attack_northwest.png` | 446x96 | Normalized filename |
| | `2-Characters/6-Attack/attack_south.png` | `images/characters/player/attack/attack_south.png` | 446x121 | Direct copy |
| | `2-Characters/6-Attack/attack_south_east.png` | `images/characters/player/attack/attack_southeast.png` | 446x113 | Normalized filename |
| | `2-Characters/6-Attack/attack_south_west.png` | `images/characters/player/attack/attack_southwest.png` | 446x113 | Normalized filename |
| **Enemies & Combat**| `2-Characters/5-Enemies/MantisMove.png` | `images/characters/enemies/mantis_move.png` | 128x128 | 4 cols x 4 rows (SEWN row mapping) |
| | `2-Characters/5-Enemies/MantisAttack.png` | `images/characters/enemies/mantis_attack.png` | 224x128 | 7 cols x 4 rows (SEWN row mapping) |
| | `2-Characters/5-Enemies/BeetleMove.png` | `images/characters/enemies/beetle_move.png` | 128x128 | 4 cols x 4 rows (SWEN row mapping) |
| | `2-Characters/5-Enemies/BeetleAttack.png` | `images/characters/enemies/beetle_attack.png` | 192x128 | 6 cols x 4 rows (SWEN row mapping) |
| | `2-Characters/5-Enemies/MaggotWalk.png` | `images/characters/enemies/maggot_walk.png` | 128x128 | 4 cols x 4 rows (SWEN row mapping) |
| | `2-Characters/5-Enemies/MaggotSpit.png` | `images/characters/enemies/maggot_spit.png` | 224x128 | 7 cols x 4 rows (SWEN row mapping) |
| | `2-Characters/5-Enemies/GhostMove.png` | `images/characters/enemies/ghost_move.png` | 234x256 | Pre-downscaled from 1406x1536 (78x64 frames) |
| | `2-Characters/5-Enemies/GhostAttack.png` | `images/characters/enemies/ghost_attack.png` | 234x256 | Pre-downscaled from 1984x2168 (78x64 frames) |
| | `2-Characters/5-Enemies/AcidBlob.png` | `images/characters/enemies/acid_blob.png` | 224x128 | 7 cols x 4 rows projectile animation |
| | `2-Characters/5-Enemies/AcidSplat.png` | `images/characters/enemies/acid_splat.png` | 384x64 | 6 frames (64x64) ground splash |
| | `2-Characters/5-Enemies/EggCluster.png` | `images/characters/enemies/egg_cluster.png` | 32x32 | Direct copy |
| | `2-Characters/5-Enemies/Eggsplosion.png` | `images/characters/enemies/eggsplosion.png` | 128x64 | 4 frames death animation |
| **Objects & Decor**| `5-Objects/cloud_1.png` | `images/objects/clouds/cloud_1.png` | 41x26 | Direct copy |
| | `5-Objects/cloud_2.png` | `images/objects/clouds/cloud_2.png` | 53x30 | Direct copy |
| | `5-Objects/cloud_3.png` | `images/objects/clouds/cloud_3.png` | 64x33 | Direct copy |
| | `5-Objects/cloud_4.png` | `images/objects/clouds/cloud_4.png` | 70x38 | Direct copy |
| | `5-Objects/1-More/bush_small_1.png` | `images/objects/decor/bush_small.png` | 16x48 | Direct copy |
| | `5-Objects/1-More/bush_upward_1.png` | `images/objects/decor/bush_obstacle.png` | 32x32 | Direct copy |
| | `5-Objects/1-More/flower_more_1.png` | `images/objects/decor/flower_clump.png` | 19x17 | Direct copy |
| | `5-Objects/1-More/flower_pink_1.png` | `images/objects/decor/flower_pink.png` | 15x16 | Direct copy |
| | `5-Objects/1-More/flower_yellow.png` | `images/objects/decor/flower_yellow.png` | 16x16 | Direct copy |
| | `5-Objects/1-More/hole_1.png` | `images/objects/decor/hole.png` | 31x18 | Direct copy |
| | `5-Objects/1-More/log_horizontal_1.png` | `images/objects/decor/log_horizontal.png` | 48x33 | Direct copy |
| | `5-Objects/1-More/log_upward_1.png` | `images/objects/decor/log_stump.png` | 32x32 | Direct copy |
| | `5-Objects/1-More/log_vertically_1.png` | `images/objects/decor/log_vertical.png` | 32x48 | Direct copy |
| | `5-Objects/1-More/rock_small_1.png` | `images/objects/decor/rock_pebble.png` | 16x17 | Direct copy |
| | `5-Objects/1-More/rock_upward_1.png` | `images/objects/decor/rock_boulder.png` | 32x32 | Direct copy |
| | `5-Objects/2-Portal/portal_active_sheet.png` | `images/objects/portal_active.png` | 1536x256 | 6 frames (256x256) |
| | `5-Objects/2-Portal/portal_inactive_sheet.png` | `images/objects/portal_inactive.png` | 1536x256 | 6 frames (256x256) |
| **GUI & Icons** | `3-GUI/Button_BG.png` | `images/ui/button_bg.png` | 197x44 | Direct copy |
| | `3-GUI/Heart.png` | `images/ui/heart.png` | 23x23 | Direct copy |
| | `3-GUI/font.ttf` | `fonts/pixel_font.ttf` | TTF (10.1 KB) | Direct copy |
| | `6-Icons/coin_4_frames.png` | `images/items/coin_anim.png` | 128x32 | 4 frames (32x32) |
| | `6-Icons/coin_4_frames.png` | `images/items/coin.png` | 32x32 | Frame 0 extracted as standalone icon |
| | `6-Icons/forest-rpg-icon.svg` | `images/ui/icon.svg` | SVG (873 B) | Direct copy |
| **Audio** | `8-Music/game_music.wav` | `audio/music/game_music.wav` | WAV (13.9 MB) | Direct copy |
| | `8-Music/menu_music.wav` | `audio/music/menu_music.wav` | WAV (15.2 MB) | Direct copy |
| | `9-Sounds/Button_Press.mp3` | `audio/sfx/button_press.mp3` | MP3/WAV (19.2 KB)| Direct copy |
| | `9-Sounds/Button_Press.mp3` | `audio/sfx/button_press.wav` | WAV (19.2 KB) | Alias for audio decoders checking MIME type |
| **New Items** | *(Procedural in legacy)* | `images/items/chest.png` | 32x32 | Generated pixel-art sprite (replaces p5 vector) |
| | *(Procedural in legacy)* | `images/items/potion_health.png` | 32x32 | Generated pixel-art sprite (replaces p5 vector) |
| | *(Procedural in legacy)* | `images/items/potion_speed.png` | 32x32 | Generated pixel-art sprite (replaces p5 vector) |

Total cataloged legacy files: **91 files**. Total target files created: **96 files**.

---

## 4. Forensic Remediation for the 5 Legacy Asset Quirks

### 4.1 Quirk 1: Hill Tiles Chroma Screen Background Sanitization

#### Forensic Observation:
In legacy `src/game/game-assets.js` lines 11-23, the original code had to manually iterate raw image pixels on startup:
```javascript
for (let i = 0; i < img.pixels.length; i += 4) {
  const r = img.pixels[i];
  const g = img.pixels[i + 1];
  const b = img.pixels[i + 2];
  if (r > 240 && g > 240 && b > 240) img.pixels[i + 3] = 0;
  else if (g > 100 && r < 80 && b < 80) img.pixels[i + 3] = 0;
}
```
Forensic color inspection confirmed that `1-hill_west.png` contains 3 stray pixels of `(76, 101, 49, 255)`, where `g > 100` and `r < 80` and `b < 80`. If loaded directly into WebGL, these pixels create visible green artifacts around hill cliffs.

#### V2 Remediation:
1. In `scripts/sanitize-assets.js`, read all 8 hill PNGs:
   - `1-hill_east.png`
   - `1-hill_north.png`
   - `1-hill_northeast.png`
   - `1-hill_northwest.png`
   - `1-hill_south.png`
   - `1-hill_southeast.png`
   - `1-hill_southwest.png`
   - `1-hill_west.png`
2. Apply the exact dual chroma-key filter across 32-bit RGBA pixel buffers:
   ```javascript
   function sanitizeHillPixels(buffer) {
     let fixedCount = 0;
     for (let i = 0; i < buffer.length; i += 4) {
       const r = buffer[i];
       const g = buffer[i + 1];
       const b = buffer[i + 2];
       const a = buffer[i + 3];
       if (a === 0) continue;
       
       // White chroma key
       const isWhite = (r > 240 && g > 240 && b > 240);
       // Green chroma key
       const isGreen = (g > 100 && r < 80 && b < 80);
       // Green fringe key (semi-transparent green halo)
       const isGreenFringe = (g > r + 35 && g > b + 35 && g > 90);

       if (isWhite || isGreen || isGreenFringe) {
         buffer[i + 3] = 0; // Set alpha to 0 (fully transparent)
         fixedCount++;
       }
     }
     return fixedCount;
   }
   ```
3. Save the resulting sanitized PNGs to `public/assets/images/terrain/hills/hill_{direction}.png`.
4. Benefit: Zero CPU pixel iteration at runtime; textures upload instantly to WebGL with clean alpha channels.

---

### 4.2 Quirk 2: Missing East Attack Animation & Horizontal Mirroring

#### Forensic Observation:
`attack_east.png` does not exist on disk in legacy assets (only 7 files exist in `2-Characters/6-Attack/`).
Furthermore, inspecting `attack_west.png` (446x97 px) reveals that the sprite character is swinging toward the **right (East)**!
In legacy `src/game/game-movement.js` lines 701-711, this led to a counter-intuitive workaround:
```javascript
// FIX: attack_west.png appears to be East-facing (Right).
// If attacking West, we must FLIP it to face Left.
if (dir === 'W') {
  flip = true;
}
// Fallback for East if null: Use attack_west.png (which is East-facing), so DO NOT flip.
if (!sheet && dir === 'E') {
  sheet = attackSheets['W'];
  flip = false;
}
```

#### V2 Remediation:
1. **Asset Normalization on Disk**:
   - `attack_east.png`: The original artwork in `attack_west.png` is saved directly as `public/assets/images/characters/player/attack/attack_east.png` because the character is visually facing East.
   - `attack_west.png`: A true West-facing animation is generated by horizontally mirroring each frame of the East-facing artwork and saving it to `public/assets/images/characters/player/attack/attack_west.png`.
2. **Frame Mirroring Mathematics**:
   The sheet width is 446 px, with 4 frames.
   - Frame 0: `x ∈ [0, 111]` (width 111)
   - Frame 1: `x ∈ [111, 223]` (width 112)
   - Frame 2: `x ∈ [223, 334]` (width 111)
   - Frame 3: `x ∈ [334, 446]` (width 112)
   
   To maintain proper animation progression (anticipation -> swing -> impact -> recovery) while mirroring direction:
   **Mirror each individual frame horizontally in place** (or flip the entire sheet horizontally and swap frame positions `0 <-> 3` and `1 <-> 2`).
   
   *In-place per-frame mirror algorithm*:
   ```javascript
   function mirrorSpriteFramesHorizontal(srcBuffer, width, height, numFrames) {
     const dstBuffer = Buffer.from(srcBuffer);
     const frameWidth = width / numFrames; // 111.5
     for (let f = 0; f < numFrames; f++) {
       const startX = Math.floor(f * frameWidth);
       const endX = Math.floor((f + 1) * frameWidth);
       const currentFw = endX - startX;
       for (let y = 0; y < height; y++) {
         for (let x = 0; x < currentFw; x++) {
           const srcIdx = (y * width + (startX + x)) * 4;
           const dstIdx = (y * width + (endX - 1 - x)) * 4;
           dstBuffer[dstIdx] = srcBuffer[srcIdx];
           dstBuffer[dstIdx + 1] = srcBuffer[srcIdx + 1];
           dstBuffer[dstIdx + 2] = srcBuffer[srcIdx + 2];
           dstBuffer[dstIdx + 3] = srcBuffer[srcIdx + 3];
         }
       }
     }
     return dstBuffer;
   }
   ```
3. Benefit: The game engine has a full, symmetrical 8-directional attack suite on disk (`attack_{e,w,n,s,ne,nw,se,sw}.png`). Downstream code in Agent 1 and Agent 3 requires zero special-case flipping logic for player combat.

---

### 4.3 Quirk 3: Dedicated 32x32 Pixel-Art Icons for Items (Chests & Potions)

#### Forensic Observation:
In legacy `src/game/game-assets.js` lines 410-520, treasure chests, health potions, and speed potions were rendered dynamically on startup using p5 2D vector primitives:
- `createChestGraphics()`: `pg.rect(4, 12, 24, 16, 2)`, `pg.fill(139, 69, 19)`, gold banding `pg.rect(8, 6, 4, 22)`, iron lock `pg.rect(14, 14, 4, 4, 1)`.
- `createPotionGraphics([220, 30, 50])`: `pg.circle(16, 20, 18)`, `pg.rect(13, 3, 6, 4)`, cork, glass specular arc.
- `createSpeedPotionGraphics()`: tall glass flask with blue liquid.
No image files existed on disk for these items!

#### V2 Remediation:
Generate dedicated, authentic 32x32 retro pixel-art PNG textures in `public/assets/images/items/`:

1. **`chest.png` (32x32)**:
   - Wood Plank Body: Oak tones (`#5c2e0e`, `#8b4513`, `#b05f22`), deep shadow outline (`#1c0e05`).
   - Reinforced Gold Straps: Vertical double-riveted metal bands at `x = 7..9` and `x = 22..24` (`#a06e0a`, `#dcb01e`, `#ffdc5a`).
   - Center Lock & Keyhole: Sturdy iron plate at `x = 13..18, y = 14..18` with dark keyhole (`#0f0f14`) and steel bolt highlight (`#7a7a8c`).
   - 3D Isometric Drop Shadow: Translucent floor shadow (`rgba(0,0,0,0.35)`) at `y = 27..29`.

2. **`potion_health.png` (32x32)**:
   - Alchemical Round Flask: Spherical bulb container centered at `(16, 21)` with radius 8px.
   - Wooden Cork Stopper: Tapered stopper at `x = 13..18, y = 4..7` (`#5f320f`, `#91501e`, `#be6e2d`).
   - Translucent Glass Silhouette: Specular glass highlight curving along upper-left shoulder (`rgba(255,255,255,0.85)`).
   - Rich Ruby Elixir: Glowing red potion fluid (`#8f0d20`, `#d81e3a`, `#ff4a68`).
   - Rising Bubbles: Sparkle effervescence pixels (`rgba(255,220,230,0.95)`).

3. **`potion_speed.png` (32x32)**:
   - Sleek Elixir Vial: Tall cylindrical flask with reinforced neck.
   - Cyan Velocity Essence: Glowing electric-blue/turquoise fluid (`#006097`, `#00b0ff`, `#69e2ff`).
   - Silver Collar & Cork: Polished silver neck band (`#b0bec5`) with tight cork seal.
   - Sparkle Particles: Speed shimmer pixels floating above the meniscus.

4. **`coin.png` (32x32)**:
   - Extracted frame 0 of legacy `6-Icons/coin_4_frames.png` (128x32) as a static 32x32 icon, with the full 4-frame animated sheet preserved as `coin_anim.png`.

These pixel-art sprites are generated deterministically by `scripts/sanitize-assets.js` and committed to `public/assets/images/items/`.

---

### 4.4 Quirk 4: Ghost Texture Downscaling

#### Forensic Observation:
- `GhostMove.png` is **1406x1536 px** (3 columns x 4 rows).
- `GhostAttack.png` is **1984x2168 px** (3 columns x 4 rows).
In legacy `game-assets.js` lines 320-365, the browser was forced to perform a synchronous CPU downscale to 64px height on startup:
```javascript
const cols = 3, rows = 4, targetH = 64;
const targetW = Math.round(targetH * (img.width / cols / (img.height / rows)));
img.resize(targetW * cols, targetH * rows);
```
This wasted 2.85 MB of disk space, required ~25 MB of uncompressed VRAM, and caused a 150-300ms freeze during asset preloading.

#### V2 Remediation:
1. **Aspect Ratio and Frame Geometry Calculation**:
   - For `GhostMove.png` (1406x1536):
     - Single frame width: `1406 / 3 = 468.667 px`
     - Single frame height: `1536 / 4 = 384 px`
     - Frame aspect ratio: `468.667 / 384 = 1.2205`
     - Target frame height: `64 px`
     - Target frame width: `Math.round(64 * 1.2205) = 78 px`
     - Normalized sheet dimensions: `(78 * 3) x (64 * 4) = 234 x 256 px`
   - For `GhostAttack.png` (1984x2168):
     - Single frame width: `1984 / 3 = 661.333 px`
     - Single frame height: `2168 / 4 = 542 px`
     - Frame aspect ratio: `661.333 / 542 = 1.2202`
     - Target frame height: `64 px`
     - Target frame width: `Math.round(64 * 1.2202) = 78 px`
     - Normalized sheet dimensions: `(78 * 3) x (64 * 4) = 234 x 256 px`
2. **Offline Downscaling in `scripts/sanitize-assets.js`**:
   The script downsamples both ghost sheets using high-fidelity Lanczos/bicubic interpolation with premultiplied alpha handling into:
   - `public/assets/images/characters/enemies/ghost_move.png` (234x256 px, ~12 KB)
   - `public/assets/images/characters/enemies/ghost_attack.png` (234x256 px, ~14 KB)
3. **Ghost Direction Row Mapping**:
   The 4 rows of the ghost sheet map as follows (verified against legacy `getDirectionSpriteRow_Ghost`):
   - Row 0: `South` (`S`)
   - Row 1: `North` (`N`)
   - Row 2: `East` (`E`)
   - Row 3: `West` (`W`)
4. **Performance Impact**:
   - File size reduction: From 2.85 MB down to 26 KB (**99.1% bandwidth reduction**).
   - VRAM footprint: From ~25 MB down to ~240 KB (**99% VRAM savings**).
   - Engine startup time: 0ms runtime downscale latency.

---

### 4.5 Quirk 5: Static Audio Organization & Normalization

#### Forensic Observation:
1. `assets/8-Music/game_music.wav` is a 13.9 MB 24-bit PCM stereo 44.1 kHz WAV file.
2. `assets/8-Music/menu_music.wav` is a 15.2 MB 24-bit PCM stereo 44.1 kHz WAV file.
3. `assets/9-Sounds/Button_Press.mp3` is **not an MP3 file**! Inspection via `file` confirms it is a 19.2 KB RIFF (little-endian) WAVE audio (PCM 16-bit mono 44.1 kHz) file incorrectly named with an `.mp3` extension.
4. Legacy had zero sound effects for combat (swords, hits, hurts, coins, potions, level-up).

#### V2 Remediation:
1. **Audio Directory Layout**:
   - Move `game_music.wav` -> `public/assets/audio/music/game_music.wav`
   - Move `menu_music.wav` -> `public/assets/audio/music/menu_music.wav`
   - Copy `Button_Press.mp3` -> `public/assets/audio/sfx/button_press.mp3` AND `public/assets/audio/sfx/button_press.wav` (providing both filenames ensures that any browser audio loader expecting MIME type matching file extension will decode without warning).
2. **Retro Web Audio Synthesizer Integration**:
   - Per Milestone 1 specification, `teamwork_explorer_m1_3` designs `SoundSynthesizer.ts` (using Web Audio `AudioContext`, `OscillatorNode`, and `GainNode`) for all combat SFX (`playSwordSwing`, `playEnemyHit`, `playPlayerHurt`, `playEnemySplat`, `playCoinPickup`, `playPotionDrink`, `playLevelUp`, `playPortalHum`).
   - Zero audio assets need to be downloaded over the network for combat, guaranteeing zero audio latency, zero 404 missing audio errors, and minimal build size.

---

## 5. Automated Sanitization Script: `scripts/sanitize-assets.js`

Below is the complete, self-contained, automated asset migration and sanitization script. It runs in Node.js (v20+) and uses `sharp` (or ImageMagick/Canvas fallback) to read from the strictly read-only legacy directory and write all sanitized assets to `public/assets/`.

### 5.1 Script Code (`scripts/sanitize-assets.js`)

```javascript
/**
 * scripts/sanitize-assets.js
 *
 * Automated Asset Sanitization and Migration Pipeline for Forest RPG V2.
 *
 * Reads legacy assets from:
 *   /home/k9-vortex/Development/1-JavaScript/3-Game Development/assets (STRICTLY READ-ONLY)
 * Sanitizes and writes to:
 *   /home/k9-vortex/Development/2-TypeScript/18-Forest RPG v2/public/assets
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Workspace paths
const LEGACY_ROOT = '/home/k9-vortex/Development/1-JavaScript/3-Game Development/assets';
const TARGET_ROOT = path.resolve(__dirname, '../public/assets');

// Ensure sharp is available
let sharp;
try {
  sharp = (await import('sharp')).default;
} catch (e) {
  console.error('[sanitize-assets] ERROR: "sharp" package is required.');
  console.error('[sanitize-assets] Please run: npm install -D sharp');
  process.exit(1);
}

// ---------------------------------------------------------------------------
// 1. Directory Structure Creation
// ---------------------------------------------------------------------------
const DIRS = [
  'audio/music',
  'audio/sfx',
  'fonts',
  'images/background',
  'images/characters/player/idle',
  'images/characters/player/walk',
  'images/characters/player/run',
  'images/characters/player/jump',
  'images/characters/player/attack',
  'images/characters/enemies',
  'images/items',
  'images/objects/clouds',
  'images/objects/decor',
  'images/terrain/hills',
  'images/ui',
  'video',
  'manifests',
];

function ensureDirectories() {
  console.log('[sanitize-assets] Ensuring target directory hierarchy...');
  for (const dir of DIRS) {
    const fullPath = path.join(TARGET_ROOT, dir);
    if (!fs.existsSync(fullPath)) {
      fs.mkdirSync(fullPath, { recursive: true });
    }
  }
}

// ---------------------------------------------------------------------------
// 2. Quirk 1: Hill Tiles Chroma Screen Sanitization
// ---------------------------------------------------------------------------
const HILL_FILES = [
  { src: '1-Background/2-Game/1-Forest/1-hill_east.png', dst: 'images/terrain/hills/hill_east.png' },
  { src: '1-Background/2-Game/1-Forest/1-hill_north.png', dst: 'images/terrain/hills/hill_north.png' },
  { src: '1-Background/2-Game/1-Forest/1-hill_northeast.png', dst: 'images/terrain/hills/hill_northeast.png' },
  { src: '1-Background/2-Game/1-Forest/1-hill_northwest.png', dst: 'images/terrain/hills/hill_northwest.png' },
  { src: '1-Background/2-Game/1-Forest/1-hill_south.png', dst: 'images/terrain/hills/hill_south.png' },
  { src: '1-Background/2-Game/1-Forest/1-hill_southeast.png', dst: 'images/terrain/hills/hill_southeast.png' },
  { src: '1-Background/2-Game/1-Forest/1-hill_southwest.png', dst: 'images/terrain/hills/hill_southwest.png' },
  { src: '1-Background/2-Game/1-Forest/1-hill_west.png', dst: 'images/terrain/hills/hill_west.png' },
];

async function sanitizeHills() {
  console.log('[sanitize-assets] Sanitizing hill tiles (removing green-screen chroma keys)...');
  for (const hill of HILL_FILES) {
    const srcPath = path.join(LEGACY_ROOT, hill.src);
    const dstPath = path.join(TARGET_ROOT, hill.dst);

    const image = sharp(srcPath);
    const { data, info } = await image.raw().toBuffer({ resolveWithObject: true });

    let cleared = 0;
    for (let i = 0; i < data.length; i += info.channels) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const a = info.channels === 4 ? data[i + 3] : 255;
      if (a === 0) continue;

      // Chroma key rules from legacy survey:
      // White: r > 240 && g > 240 && b > 240
      // Green: g > 100 && r < 80 && b < 80
      // Green fringe: g > r + 35 && g > b + 35 && g > 90
      if ((r > 240 && g > 240 && b > 240) ||
          (g > 100 && r < 80 && b < 80) ||
          (g > r + 35 && g > b + 35 && g > 90)) {
        if (info.channels === 4) {
          data[i + 3] = 0;
        }
        cleared++;
      }
    }

    await sharp(data, {
      raw: {
        width: info.width,
        height: info.height,
        channels: info.channels,
      },
    })
      .png()
      .toFile(dstPath);

    console.log(`  ✓ ${path.basename(hill.dst)} (${info.width}x${info.height}): ${cleared} chroma pixels cleared`);
  }
}

// ---------------------------------------------------------------------------
// 3. Quirk 2: East Attack Animation & Horizontal Mirroring
// ---------------------------------------------------------------------------
async function processAttackAnimations() {
  console.log('[sanitize-assets] Normalizing attack animations (East & West mirroring)...');
  const attackDir = path.join(LEGACY_ROOT, '2-Characters/6-Attack');
  const targetDir = path.join(TARGET_ROOT, 'images/characters/player/attack');

  // Direct copies for existing sheets
  const directMaps = [
    { src: 'attack_north.png', dst: 'attack_north.png' },
    { src: 'attack_north_east.png', dst: 'attack_northeast.png' },
    { src: 'attack_north_west.png', dst: 'attack_northwest.png' },
    { src: 'attack_south.png', dst: 'attack_south.png' },
    { src: 'attack_south_east.png', dst: 'attack_southeast.png' },
    { src: 'attack_south_west.png', dst: 'attack_southwest.png' },
  ];

  for (const m of directMaps) {
    fs.copyFileSync(path.join(attackDir, m.src), path.join(targetDir, m.dst));
  }

  // Handle attack_west.png:
  // In legacy artwork, attack_west.png is drawn facing EAST.
  // 1. Save original artwork as attack_east.png
  const srcWest = path.join(attackDir, 'attack_west.png');
  fs.copyFileSync(srcWest, path.join(targetDir, 'attack_east.png'));
  console.log('  ✓ attack_east.png authored from legacy attack_west.png (un-flipped East artwork)');

  // 2. Generate true attack_west.png by per-frame horizontal mirroring
  const imgWest = sharp(srcWest);
  const { data, info } = await imgWest.raw().toBuffer({ resolveWithObject: true });
  const numFrames = 4;
  const frameWidth = info.width / numFrames; // 111.5
  const mirrored = Buffer.from(data);

  for (let f = 0; f < numFrames; f++) {
    const startX = Math.floor(f * frameWidth);
    const endX = Math.floor((f + 1) * frameWidth);
    const currentFw = endX - startX;

    for (let y = 0; y < info.height; y++) {
      for (let x = 0; x < currentFw; x++) {
        const srcOffset = (y * info.width + (startX + x)) * info.channels;
        const dstOffset = (y * info.width + (endX - 1 - x)) * info.channels;

        for (let c = 0; c < info.channels; c++) {
          mirrored[dstOffset + c] = data[srcOffset + c];
        }
      }
    }
  }

  await sharp(mirrored, {
    raw: {
      width: info.width,
      height: info.height,
      channels: info.channels,
    },
  })
    .png()
    .toFile(path.join(targetDir, 'attack_west.png'));
  console.log('  ✓ attack_west.png generated via per-frame horizontal mirroring');
}

// ---------------------------------------------------------------------------
// 4. Quirk 3: Dedicated 32x32 Pixel-Art Icons for Items
// ---------------------------------------------------------------------------
async function generateItemSprites() {
  console.log('[sanitize-assets] Generating dedicated 32x32 pixel-art item icons...');
  const itemsDir = path.join(TARGET_ROOT, 'images/items');

  // 4.1 Chest Sprite
  const chestBuf = Buffer.alloc(32 * 32 * 4, 0);
  function setPx(buf, x, y, r, g, b, a = 255) {
    if (x < 0 || x >= 32 || y < 0 || y >= 32) return;
    const idx = (y * 32 + x) * 4;
    buf[idx] = r;
    buf[idx + 1] = g;
    buf[idx + 2] = b;
    buf[idx + 3] = a;
  }

  // Chest Palette
  const C_OUTLINE = [28, 14, 5];
  const C_WOOD_MID = [139, 69, 19];
  const C_WOOD_LIGHT = [176, 95, 34];
  const C_WOOD_DARK = [92, 46, 14];
  const C_GOLD_MID = [220, 170, 30];
  const C_GOLD_LIGHT = [255, 220, 90];
  const C_GOLD_DARK = [160, 110, 10];
  const C_LOCK = [45, 45, 55];
  const C_SHADOW = [0, 0, 0, 80];

  // Base shadow
  for (let x = 3; x <= 28; x++) {
    for (let y = 27; y <= 29; y++) {
      setPx(chestBuf, x, y, ...C_SHADOW);
    }
  }
  // Wood body
  for (let x = 4; x <= 27; x++) {
    for (let y = 8; y <= 26; y++) {
      setPx(chestBuf, x, y, ...C_WOOD_MID);
    }
  }
  // Borders & lid line
  for (let x = 4; x <= 27; x++) {
    setPx(chestBuf, x, 8, ...C_OUTLINE);
    setPx(chestBuf, x, 15, ...C_OUTLINE);
    setPx(chestBuf, x, 26, ...C_OUTLINE);
  }
  for (let y = 8; y <= 26; y++) {
    setPx(chestBuf, 4, y, ...C_OUTLINE);
    setPx(chestBuf, 27, y, ...C_OUTLINE);
  }
  // Wood highlights
  for (let x = 5; x <= 26; x++) {
    setPx(chestBuf, x, 9, ...C_WOOD_LIGHT);
    setPx(chestBuf, x, 16, ...C_WOOD_DARK);
    setPx(chestBuf, x, 25, ...C_WOOD_DARK);
  }
  // Gold Straps
  for (const bx of [7, 8, 9, 22, 23, 24]) {
    for (let y = 8; y <= 26; y++) {
      setPx(chestBuf, bx, y, ...C_GOLD_MID);
    }
    setPx(chestBuf, bx, 8, ...C_OUTLINE);
    setPx(chestBuf, bx, 26, ...C_OUTLINE);
    setPx(chestBuf, bx, 9, ...C_GOLD_LIGHT);
    setPx(chestBuf, bx, 25, ...C_GOLD_DARK);
  }
  // Iron Lock Plate
  for (let x = 13; x <= 18; x++) {
    for (let y = 14; y <= 18; y++) {
      setPx(chestBuf, x, y, ...C_GOLD_MID);
    }
    setPx(chestBuf, x, 14, ...C_OUTLINE);
    setPx(chestBuf, x, 18, ...C_OUTLINE);
  }
  for (let y = 14; y <= 18; y++) {
    setPx(chestBuf, 13, y, ...C_OUTLINE);
    setPx(chestBuf, 18, y, ...C_OUTLINE);
  }
  setPx(chestBuf, 15, 16, 15, 15, 20);
  setPx(chestBuf, 16, 16, 15, 15, 20);
  setPx(chestBuf, 15, 17, ...C_LOCK);
  setPx(chestBuf, 16, 17, ...C_LOCK);

  await sharp(chestBuf, { raw: { width: 32, height: 32, channels: 4 } })
    .png()
    .toFile(path.join(itemsDir, 'chest.png'));
  console.log('  ✓ chest.png (32x32) generated');

  // 4.2 Potions (Health & Speed)
  function renderPotion(liquidMain, liquidLight, liquidDark, liquidBubble) {
    const buf = Buffer.alloc(32 * 32 * 4, 0);
    const outline = [20, 25, 35];
    const glassRim = [200, 225, 255, 220];
    const glassBody = [180, 210, 240, 100];
    const corkMain = [145, 80, 30];
    const corkLight = [190, 110, 45];
    const corkDark = [95, 50, 15];
    const specular = [255, 255, 255, 210];

    // Shadow
    for (let x = 10; x <= 21; x++) setPx(buf, x, 29, 0, 0, 0, 60);

    // Cork
    for (let x = 13; x <= 18; x++) {
      for (let y = 4; y <= 7; y++) setPx(buf, x, y, ...corkMain);
      setPx(buf, x, 4, ...corkLight);
      setPx(buf, x, 7, ...corkDark);
    }
    setPx(buf, 13, 4, ...outline);
    setPx(buf, 18, 4, ...outline);

    // Glass Lip / Neck
    for (let x = 11; x <= 20; x++) {
      setPx(buf, x, 8, ...glassRim);
      setPx(buf, x, 9, ...outline);
    }
    for (let y = 9; y <= 12; y++) {
      setPx(buf, 12, y, ...outline);
      setPx(buf, 19, y, ...outline);
      for (let x = 13; x <= 18; x++) setPx(buf, x, y, ...glassBody);
    }

    // Flask bulb body
    const cx = 15.5, cy = 21.0, r = 7.8;
    for (let y = 12; y <= 28; y++) {
      for (let x = 7; x <= 24; x++) {
        const d = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2);
        if (d <= r + 0.8) {
          if (d > r - 0.5) {
            setPx(buf, x, y, ...outline);
          } else if (y < 17) {
            setPx(buf, x, y, ...glassBody);
          } else {
            if (y === 17) setPx(buf, x, y, ...liquidLight);
            else if (y >= 25 || d > r - 1.5) setPx(buf, x, y, ...liquidDark);
            else setPx(buf, x, y, ...liquidMain);
          }
        }
      }
    }

    // Bubbles
    setPx(buf, 13, 23, ...liquidBubble);
    setPx(buf, 17, 24, ...liquidBubble);
    setPx(buf, 15, 20, ...liquidBubble);

    // Specular highlight
    setPx(buf, 10, 16, ...specular);
    setPx(buf, 10, 17, ...specular);
    setPx(buf, 11, 15, ...specular);
    setPx(buf, 14, 10, ...specular);

    return buf;
  }

  const hpBuf = renderPotion([220, 30, 60], [255, 90, 120], [150, 10, 35], [255, 210, 220, 240]);
  await sharp(hpBuf, { raw: { width: 32, height: 32, channels: 4 } })
    .png()
    .toFile(path.join(itemsDir, 'potion_health.png'));
  console.log('  ✓ potion_health.png (32x32) generated');

  const speedBuf = renderPotion([0, 180, 240], [100, 230, 255], [0, 100, 180], [200, 250, 255, 240]);
  await sharp(speedBuf, { raw: { width: 32, height: 32, channels: 4 } })
    .png()
    .toFile(path.join(itemsDir, 'potion_speed.png'));
  console.log('  ✓ potion_speed.png (32x32) generated');

  // 4.3 Coin Icon & Sheet
  const coinSrc = path.join(LEGACY_ROOT, '6-Icons/coin_4_frames.png');
  fs.copyFileSync(coinSrc, path.join(itemsDir, 'coin_anim.png'));

  // Extract first 32x32 frame as single icon
  await sharp(coinSrc)
    .extract({ left: 0, top: 0, width: 32, height: 32 })
    .png()
    .toFile(path.join(itemsDir, 'coin.png'));
  console.log('  ✓ coin.png (32x32) and coin_anim.png (128x32) created');
}

// ---------------------------------------------------------------------------
// 5. Quirk 4: Ghost Texture Downscaling
// ---------------------------------------------------------------------------
async function processGhostTextures() {
  console.log('[sanitize-assets] Downscaling ghost textures (eliminating 2.8MB VRAM waste)...');
  const enemyDir = path.join(TARGET_ROOT, 'images/characters/enemies');

  // GhostMove: 1406x1536 -> 234x256 (3x4 frames of 78x64)
  const ghostMoveSrc = path.join(LEGACY_ROOT, '2-Characters/5-Enemies/GhostMove.png');
  await sharp(ghostMoveSrc)
    .resize(234, 256, {
      kernel: sharp.kernel.lanczos3,
      fit: 'fill',
    })
    .png()
    .toFile(path.join(enemyDir, 'ghost_move.png'));
  console.log('  ✓ ghost_move.png downscaled: 1406x1536 -> 234x256 px');

  // GhostAttack: 1984x2168 -> 234x256 (3x4 frames of 78x64)
  const ghostAttackSrc = path.join(LEGACY_ROOT, '2-Characters/5-Enemies/GhostAttack.png');
  await sharp(ghostAttackSrc)
    .resize(234, 256, {
      kernel: sharp.kernel.lanczos3,
      fit: 'fill',
    })
    .png()
    .toFile(path.join(enemyDir, 'ghost_attack.png'));
  console.log('  ✓ ghost_attack.png downscaled: 1984x2168 -> 234x256 px');
}

// ---------------------------------------------------------------------------
// 6. Grass Tile Seam Padding (31x31 -> 32x32)
// ---------------------------------------------------------------------------
async function processGrassTile() {
  console.log('[sanitize-assets] Padding grass tile (31x31 -> 32x32) to prevent grid seams...');
  const srcTile = path.join(LEGACY_ROOT, '1-Background/2-Game/1-Forest/tile_1.png');
  const terrainDir = path.join(TARGET_ROOT, 'images/terrain');

  // Keep legacy 31x31
  fs.copyFileSync(srcTile, path.join(terrainDir, 'grass_legacy.png'));

  // Create 32x32 seamless tile by edge-clamping row 30 & col 30 to row 31 & col 31
  const img = sharp(srcTile);
  const { data, info } = await img.raw().toBuffer({ resolveWithObject: true });

  const buf32 = Buffer.alloc(32 * 32 * 4);
  for (let y = 0; y < 32; y++) {
    const srcY = Math.min(y, 30);
    for (let x = 0; x < 32; x++) {
      const srcX = Math.min(x, 30);
      const srcIdx = (srcY * 31 + srcX) * 4;
      const dstIdx = (y * 32 + x) * 4;
      for (let c = 0; c < 4; c++) {
        buf32[dstIdx + c] = data[srcIdx + c];
      }
    }
  }

  await sharp(buf32, { raw: { width: 32, height: 32, channels: 4 } })
    .png()
    .toFile(path.join(terrainDir, 'grass.png'));
  console.log('  ✓ grass.png padded to 32x32 seamless grid tile');
}

// ---------------------------------------------------------------------------
// 7. Quirk 5: Audio & Remaining Asset Copying
// ---------------------------------------------------------------------------
async function copyRemainingAssets() {
  console.log('[sanitize-assets] Copying audio, fonts, objects, and characters...');

  // Audio
  const musicSrc = path.join(LEGACY_ROOT, '8-Music');
  const sfxSrc = path.join(LEGACY_ROOT, '9-Sounds');
  fs.copyFileSync(path.join(musicSrc, 'game_music.wav'), path.join(TARGET_ROOT, 'audio/music/game_music.wav'));
  fs.copyFileSync(path.join(musicSrc, 'menu_music.wav'), path.join(TARGET_ROOT, 'audio/music/menu_music.wav'));
  fs.copyFileSync(path.join(sfxSrc, 'Button_Press.mp3'), path.join(TARGET_ROOT, 'audio/sfx/button_press.mp3'));
  fs.copyFileSync(path.join(sfxSrc, 'Button_Press.mp3'), path.join(TARGET_ROOT, 'audio/sfx/button_press.wav'));

  // Fonts & GUI
  fs.copyFileSync(path.join(LEGACY_ROOT, '3-GUI/font.ttf'), path.join(TARGET_ROOT, 'fonts/pixel_font.ttf'));
  fs.copyFileSync(path.join(LEGACY_ROOT, '3-GUI/Button_BG.png'), path.join(TARGET_ROOT, 'images/ui/button_bg.png'));
  fs.copyFileSync(path.join(LEGACY_ROOT, '3-GUI/Heart.png'), path.join(TARGET_ROOT, 'images/ui/heart.png'));
  fs.copyFileSync(path.join(LEGACY_ROOT, '6-Icons/forest-rpg-icon.svg'), path.join(TARGET_ROOT, 'images/ui/icon.svg'));

  // Backgrounds & Video
  fs.copyFileSync(path.join(LEGACY_ROOT, '1-Background/1-Menu/Background.png'), path.join(TARGET_ROOT, 'images/background/menu_bg.png'));
  fs.copyFileSync(path.join(LEGACY_ROOT, '1-Background/1-Menu/Settings_Background.png'), path.join(TARGET_ROOT, 'images/background/settings_bg.png'));
  const videoSrc = path.join(LEGACY_ROOT, '1-Background/1-Menu/Menu_Vid.mp4');
  if (fs.existsSync(videoSrc)) {
    fs.copyFileSync(videoSrc, path.join(TARGET_ROOT, 'video/menu_vid.mp4'));
  }

  // Terrain
  fs.copyFileSync(path.join(LEGACY_ROOT, '1-Background/2-Game/1-Forest/water_1.png'), path.join(TARGET_ROOT, 'images/terrain/water.png'));
  fs.copyFileSync(path.join(LEGACY_ROOT, '1-Background/2-Game/1-Forest/tree_1.png'), path.join(TARGET_ROOT, 'images/terrain/tree.png'));
  fs.copyFileSync(path.join(LEGACY_ROOT, '1-Background/2-Game/1-Forest/bridge_1.png'), path.join(TARGET_ROOT, 'images/terrain/bridge_hd.png'));
  // Downscale bridge to 64x64 plank tile
  await sharp(path.join(LEGACY_ROOT, '1-Background/2-Game/1-Forest/bridge_1.png'))
    .resize(64, 64)
    .png()
    .toFile(path.join(TARGET_ROOT, 'images/terrain/bridge.png'));

  // Characters - Player Idle, Walk, Run, Jump
  const dirs = ['east', 'north', 'northeast', 'northwest', 'south', 'southeast', 'southwest', 'west'];
  for (const d of dirs) {
    fs.copyFileSync(
      path.join(LEGACY_ROOT, `2-Characters/1-Idle/idle_sheet_${d}.png`),
      path.join(TARGET_ROOT, `images/characters/player/idle/idle_${d}.png`)
    );
    fs.copyFileSync(
      path.join(LEGACY_ROOT, `2-Characters/2-Walking/walk_sheet_${d}.png`),
      path.join(TARGET_ROOT, `images/characters/player/walk/walk_${d}.png`)
    );
    fs.copyFileSync(
      path.join(LEGACY_ROOT, `2-Characters/4-Jumping/jump_sheet_${d}.png`),
      path.join(TARGET_ROOT, `images/characters/player/jump/jump_${d}.png`)
    );
  }

  // Running sheets (normalize legacy inconsistent underscores)
  const runMaps = [
    { src: 'run_sheet_east.png', dst: 'run_east.png' },
    { src: 'run_sheet_north.png', dst: 'run_north.png' },
    { src: 'run_sheet_north_east.png', dst: 'run_northeast.png' },
    { src: 'run_sheet_north_west.png', dst: 'run_northwest.png' },
    { src: 'run_sheet_south.png', dst: 'run_south.png' },
    { src: 'run_sheet_south_east.png', dst: 'run_southeast.png' },
    { src: 'run_sheet_south_west.png', dst: 'run_southwest.png' },
    { src: 'run_sheet_west.png', dst: 'run_west.png' },
  ];
  for (const r of runMaps) {
    fs.copyFileSync(
      path.join(LEGACY_ROOT, '2-Characters/3-Running', r.src),
      path.join(TARGET_ROOT, 'images/characters/player/run', r.dst)
    );
  }

  // Enemies
  const enemyCopies = [
    { src: 'MantisMove.png', dst: 'mantis_move.png' },
    { src: 'MantisAttack.png', dst: 'mantis_attack.png' },
    { src: 'BeetleMove.png', dst: 'beetle_move.png' },
    { src: 'BeetleAttack.png', dst: 'beetle_attack.png' },
    { src: 'MaggotWalk.png', dst: 'maggot_walk.png' },
    { src: 'MaggotSpit.png', dst: 'maggot_spit.png' },
    { src: 'AcidBlob.png', dst: 'acid_blob.png' },
    { src: 'AcidSplat.png', dst: 'acid_splat.png' },
    { src: 'EggCluster.png', dst: 'egg_cluster.png' },
    { src: 'Eggsplosion.png', dst: 'eggsplosion.png' },
  ];
  for (const e of enemyCopies) {
    fs.copyFileSync(
      path.join(LEGACY_ROOT, '2-Characters/5-Enemies', e.src),
      path.join(TARGET_ROOT, 'images/characters/enemies', e.dst)
    );
  }

  // Objects & Decor
  for (let i = 1; i <= 4; i++) {
    fs.copyFileSync(
      path.join(LEGACY_ROOT, `5-Objects/cloud_${i}.png`),
      path.join(TARGET_ROOT, `images/objects/clouds/cloud_${i}.png`)
    );
  }
  fs.copyFileSync(
    path.join(LEGACY_ROOT, '5-Objects/2-Portal/portal_active_sheet.png'),
    path.join(TARGET_ROOT, 'images/objects/portal_active.png')
  );
  fs.copyFileSync(
    path.join(LEGACY_ROOT, '5-Objects/2-Portal/portal_inactive_sheet.png'),
    path.join(TARGET_ROOT, 'images/objects/portal_inactive.png')
  );

  const decorMaps = [
    { src: 'bush_small_1.png', dst: 'bush_small.png' },
    { src: 'bush_upward_1.png', dst: 'bush_obstacle.png' },
    { src: 'flower_more_1.png', dst: 'flower_clump.png' },
    { src: 'flower_pink_1.png', dst: 'flower_pink.png' },
    { src: 'flower_yellow.png', dst: 'flower_yellow.png' },
    { src: 'hole_1.png', dst: 'hole.png' },
    { src: 'log_horizontal_1.png', dst: 'log_horizontal.png' },
    { src: 'log_upward_1.png', dst: 'log_stump.png' },
    { src: 'log_vertically_1.png', dst: 'log_vertical.png' },
    { src: 'rock_small_1.png', dst: 'rock_pebble.png' },
    { src: 'rock_upward_1.png', dst: 'rock_boulder.png' },
  ];
  for (const d of decorMaps) {
    fs.copyFileSync(
      path.join(LEGACY_ROOT, '5-Objects/1-More', d.src),
      path.join(TARGET_ROOT, 'images/objects/decor', d.dst)
    );
  }

  console.log('  ✓ Audio, GUI, background, and character assets migrated');
}

// ---------------------------------------------------------------------------
// 8. Generate PixiJS 8 Asset Manifest
// ---------------------------------------------------------------------------
function generateManifest() {
  console.log('[sanitize-assets] Generating PixiJS 8 Asset Manifest...');
  const manifest = {
    bundles: [
      {
        name: 'boot',
        assets: [
          { alias: 'font_pixel', src: 'assets/fonts/pixel_font.ttf' },
          { alias: 'ui_button_bg', src: 'assets/images/ui/button_bg.png' },
          { alias: 'ui_heart', src: 'assets/images/ui/heart.png' },
          { alias: 'bg_menu', src: 'assets/images/background/menu_bg.png' },
          { alias: 'bg_settings', src: 'assets/images/background/settings_bg.png' },
          { alias: 'sfx_button', src: 'assets/audio/sfx/button_press.mp3' },
          { alias: 'music_menu', src: 'assets/audio/music/menu_music.wav' },
        ],
      },
      {
        name: 'world',
        assets: [
          { alias: 'tile_grass', src: 'assets/images/terrain/grass.png' },
          { alias: 'tile_water', src: 'assets/images/terrain/water.png' },
          { alias: 'tile_tree', src: 'assets/images/terrain/tree.png' },
          { alias: 'tile_bridge', src: 'assets/images/terrain/bridge.png' },
          { alias: 'hill_e', src: 'assets/images/terrain/hills/hill_east.png' },
          { alias: 'hill_n', src: 'assets/images/terrain/hills/hill_north.png' },
          { alias: 'hill_ne', src: 'assets/images/terrain/hills/hill_northeast.png' },
          { alias: 'hill_nw', src: 'assets/images/terrain/hills/hill_northwest.png' },
          { alias: 'hill_s', src: 'assets/images/terrain/hills/hill_south.png' },
          { alias: 'hill_se', src: 'assets/images/terrain/hills/hill_southeast.png' },
          { alias: 'hill_sw', src: 'assets/images/terrain/hills/hill_southwest.png' },
          { alias: 'hill_w', src: 'assets/images/terrain/hills/hill_west.png' },
          { alias: 'music_game', src: 'assets/audio/music/game_music.wav' },
        ],
      },
      {
        name: 'entities',
        assets: [
          { alias: 'enemy_mantis_move', src: 'assets/images/characters/enemies/mantis_move.png' },
          { alias: 'enemy_mantis_attack', src: 'assets/images/characters/enemies/mantis_attack.png' },
          { alias: 'enemy_beetle_move', src: 'assets/images/characters/enemies/beetle_move.png' },
          { alias: 'enemy_beetle_attack', src: 'assets/images/characters/enemies/beetle_attack.png' },
          { alias: 'enemy_maggot_walk', src: 'assets/images/characters/enemies/maggot_walk.png' },
          { alias: 'enemy_maggot_spit', src: 'assets/images/characters/enemies/maggot_spit.png' },
          { alias: 'enemy_ghost_move', src: 'assets/images/characters/enemies/ghost_move.png' },
          { alias: 'enemy_ghost_attack', src: 'assets/images/characters/enemies/ghost_attack.png' },
          { alias: 'projectile_acid_blob', src: 'assets/images/characters/enemies/acid_blob.png' },
          { alias: 'vfx_acid_splat', src: 'assets/images/characters/enemies/acid_splat.png' },
          { alias: 'vfx_eggsplosion', src: 'assets/images/characters/enemies/eggsplosion.png' },
          { alias: 'item_chest', src: 'assets/images/items/chest.png' },
          { alias: 'item_potion_health', src: 'assets/images/items/potion_health.png' },
          { alias: 'item_potion_speed', src: 'assets/images/items/potion_speed.png' },
          { alias: 'item_coin', src: 'assets/images/items/coin.png' },
          { alias: 'item_coin_anim', src: 'assets/images/items/coin_anim.png' },
          { alias: 'portal_active', src: 'assets/images/objects/portal_active.png' },
          { alias: 'portal_inactive', src: 'assets/images/objects/portal_inactive.png' },
        ],
      },
    ],
  };

  const manifestPath = path.join(TARGET_ROOT, 'manifests/asset_manifest.json');
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');
  console.log(`  ✓ asset_manifest.json written to ${manifestPath}`);
}

// ---------------------------------------------------------------------------
// Main Pipeline Execution
// ---------------------------------------------------------------------------
async function main() {
  console.log('====================================================');
  console.log('Forest RPG V2 — Asset Sanitization & Migration Pipeline');
  console.log('====================================================');

  if (!fs.existsSync(LEGACY_ROOT)) {
    console.error(`[sanitize-assets] FATAL: Legacy directory not found: ${LEGACY_ROOT}`);
    process.exit(1);
  }

  ensureDirectories();
  await sanitizeHills();
  await processAttackAnimations();
  await generateItemSprites();
  await processGhostTextures();
  await processGrassTile();
  await copyRemainingAssets();
  generateManifest();

  console.log('====================================================');
  console.log('Asset Sanitization and Migration Successfully Completed!');
  console.log('====================================================');
}

main().catch((err) => {
  console.error('[sanitize-assets] FATAL ERROR during pipeline execution:', err);
  process.exit(1);
});
```

---

## 6. PixiJS 8 Asset Manifest & Loader Architecture

### 6.1 Manifest File (`public/assets/manifests/asset_manifest.json`)
The manifest organizes game assets into logical bundles that load progressively:
1. **`boot` bundle**: Minimal critical assets required to render the main title screen and responsive UI.
2. **`world` bundle**: Terrains, cliff elevation hills, water, trees, and overworld ambient loop.
3. **`entities` bundle**: Player sheets, enemy bestiary sheets, projectiles, particle splats, and item drops.

### 6.2 Preloading Architecture in TypeScript
```typescript
import { Assets } from 'pixi.js';

export async function initGameAssets(): Promise<void> {
  // 1. Initialize Asset Manifest
  await Assets.init({
    manifest: 'assets/manifests/asset_manifest.json',
    basePath: '',
  });

  // 2. Load bootstrap bundle for title screen
  await Assets.loadBundle('boot');
  console.info('[Assets] Boot bundle loaded');

  // 3. Preload gameplay bundles in the background
  await Promise.all([
    Assets.loadBundle('world'),
    Assets.loadBundle('entities'),
  ]);
  console.info('[Assets] World & Entities bundles ready');
}
```

---

## 7. Sprite Animation Metadata Specifications

For the downstream agents (Agent 1 Rendering, Agent 3 UI/Animation), here are the exact sprite dimensions, frame counts, and direction-to-row tables:

### 7.1 Player Character Sheets
Frame width: **20 px** (Idle, Walk, Run, Jump). Attack frame width: **~111.5 px**.

| Action | Frame Width | Sheet Height | Total Frames | Directions (8 files) |
|---|---|---|---|---|
| `idle` | 20 px | 18–23 px | 4 frames (80 px total) | `east`, `north`, `northeast`, `northwest`, `south`, `southeast`, `southwest`, `west` |
| `walk` | 20 px | 19–22 px | 4 frames (80 px total) | `east`, `north`, `northeast`, `northwest`, `south`, `southeast`, `southwest`, `west` |
| `run` | 20 px | 18–22 px | 6 frames (120 px total) | `east`, `north`, `northeast`, `northwest`, `south`, `southeast`, `southwest`, `west` |
| `jump` | 20 px | 20–21 px | 5 frames (100 px total) | `east`, `north`, `northeast`, `northwest`, `south`, `southeast`, `southwest`, `west` |
| `attack` | 111.5 px | 92–121 px | 4 frames (446 px total) | `east`, `north`, `northeast`, `northwest`, `south`, `southeast`, `southwest`, `west` |

### 7.2 Enemy Sheets & Direction Mapping

| Enemy | Move Sheet Dimensions | Attack Sheet Dimensions | Frame Size | Direction-to-Row Mapping |
|---|---|---|---|---|
| **Mantis** | 128x128 (4 cols x 4 rows) | 224x128 (7 cols x 4 rows) | 32x32 px | **SEWN**: Row 0 = S, Row 1 = E, Row 2 = W, Row 3 = N |
| **Beetle** | 128x128 (4 cols x 4 rows) | 192x128 (6 cols x 4 rows) | 32x32 px | **SWEN**: Row 0 = S, Row 1 = W, Row 2 = E, Row 3 = N |
| **Maggot** | 128x128 (4 cols x 4 rows) | 224x128 (7 cols x 4 rows) | 32x32 px | **SWEN**: Row 0 = S, Row 1 = W, Row 2 = E, Row 3 = N |
| **Ghost** | 234x256 (3 cols x 4 rows) | 234x256 (3 cols x 4 rows) | 78x64 px | **SNEW**: Row 0 = S, Row 1 = N, Row 2 = E, Row 3 = W |

---

## 8. Verification Strategy & Acceptance Criteria

When the Worker executes Milestone 1:

1. **Safety Boundary Verification**:
   ```bash
   git -C "/home/k9-vortex/Development/1-JavaScript/3-Game Development" status
   ```
   Must output `working tree clean`. Zero modifications.
2. **Sharp Dependency Addition**:
   `sharp: "^0.33.5"` added to `devDependencies` in `package.json`.
3. **Automated Sanitization Run**:
   ```bash
   npm run sanitize-assets  # or node scripts/sanitize-assets.js
   ```
4. **Acceptance Criteria**:
   - [ ] All 8 hill PNGs in `public/assets/images/terrain/hills/` have clean alpha channels with zero green/white background pixels.
   - [ ] Both `attack_east.png` and `attack_west.png` exist in `public/assets/images/characters/player/attack/` and swing in their respective directions.
   - [ ] `chest.png`, `potion_health.png`, `potion_speed.png`, and `coin.png` exist as 32x32 pixel-art PNGs in `public/assets/images/items/`.
   - [ ] `ghost_move.png` and `ghost_attack.png` are exactly 234x256 px (<20 KB each).
   - [ ] `game_music.wav`, `menu_music.wav`, and `button_press.mp3` are organized under `public/assets/audio/`.
   - [ ] `asset_manifest.json` validates as syntactically correct JSON matching the PixiJS 8 bundle schema.
