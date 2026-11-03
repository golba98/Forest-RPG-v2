# Environment packs

Rebuild with `node scripts/build-rock-sprites.mjs --environment` and
`node scripts/prepare-environment-assets.mjs`. The first command preserves the
original rock files when `--environment` is supplied.

`inventory.json` records actual source selections and production categories.
Forest, meadow, highlands, wetlands and autumn plant atlases are native LPC crops;
shared tree-12/13 are intact native LPC young trees. Their full credits and
CC BY-SA 3.0 license remain in [lpc](lpc/README.md).

Tree-0 through tree-11 were produced with OpenAI ImageGen using the LPC sheet as
an art-direction reference. The retained source and provenance are under
`docs/assets/source/environment/`. Cell isolation removes detached fragments;
nearest-neighbor sizing fits an 88×112 envelope in a 96×128 frame with root contact
at (48,120). This reference-derived tree pack is distributed under CC BY-SA 3.0
with the same LPC contributor attribution. This does not change the game-code license.

The six new rock forms use the project's original authored rock renderer and palette.
The original boulder and pebble artwork remain unchanged. Ground grain is authored
procedurally; the relief atlas adapts the project's existing atlas while retaining
all masks and collision geometry. Natural-slope overlays retain two-pixel cheeks.

Runtime packs share source textures and do not duplicate shared tree or rock files.
Inventory selections across packs are not counts of unique new artwork.
