# Rendering

PixiJS renders cached terrain chunks, depth-sorted entities and props, light, weather and the HUD. Terrain uses nearest-neighbor sampling and integer camera scaling. Sprite animation resolves frames from sprite sheets; the camera follows the interpolated player.

Hills are autotiled from elevation topology with a generated, project-owned cliff tileset (`scripts/build-hill-tileset.mjs`): every 8-neighbour configuration has a frame (plateau top, rims, south cliff faces, inner/outer corners, contact shadow). Forest trees are planned so every solid forest tile is visibly covered. Entities animate through `EntityAnimator` (clip restarts on state change, attack telegraphs, hurt flash, death fade); portals through `PortalView` (locked / reacting / open / transitioning, see `docs/contracts/visual-contract.md`). Press F3 in debug builds for the collider / sprite-bounds overlay.

Clouds are high, soft-focus and parallaxed with matching ground shadows, clipped to world bounds; settings control clouds, ambient particles, stars, fireflies, lighting and camera shake. Water clips the lower part of a grounded player's sprite and draws ripples; jumping lifts the character out of that effect. The HUD provides health, resource bars, inventory counts and a minimap. Menus use a video backdrop with a static woodland fallback. The portal, mud and backdrop include new artwork; icon sizes are provided for browsers and installed apps.

Visual acceptance remains a human review concern: the provided screenshots and automated browser checks cannot establish that every asset, scene and resolution meets the requested production quality.
