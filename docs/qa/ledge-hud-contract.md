# Ledge and bottom HUD handoff

User confirmed that walking to a rim is restrictive, selected a stop at the drop (jump/stairs cross), and chose a Minecraft-style centred bottom strip. Implementation is isolated on `codex/ledge-bottom-hud` in `../18-Forest RPG v2-ledge-hud`, based on dd039ba. Active work in the original workspace is preserved.

Gameplay owns `CollisionFootprint` and `entityFootprint`. Player foot rectangle is .44 × .20 tiles, at the existing 10px-below-entity foot anchor; combat `halfSize` is retained. Numeric square shapes remain supported for enemies, projectiles and older callers. Player occupancy, swept movement, safe loading and landing use the same rectangle.

`HillCollisionGeometry.ts` is renderer-independent. It matches the existing cliff atlas dimensions: 32px tile, south face starts at 12px, side rims 6px, north rim 4px, corner radius 6px. Full rim cells no longer block walking: boundary strips, rounded void corners and south cliff faces do. STAIRS creates a traversable opening. `Collider.source='cliff'` identifies the derived rectangles for diagnostics. Renderer consumers must not treat every rim cell as a full-tile collider. Jumping still clears rims, ghosts still phase. Art and asset-generation code are unchanged.

The bottom HUD has a pure `hudLayout` function, owns its screen-space transform, and receives viewport size, UI scale and safe-area insets. PixiRenderer integration is limited to constructing it with existing potion textures and calling `hud.layout(...)` instead of assigning a top-left position/scale. Claude should retain these two integration changes when merging current renderer work. No minimap, effects, world art or menu edits are part of this branch.

HUD: hearts left (10 per row), stamina right, mana below hearts, two potion readouts with 1/2 shortcuts in the middle, level and coins beside them, slim XP bar and figures below. It is a readout for existing potion controls, not a new action inventory.
