/** Native-pixel LPC crops; source coordinates are recorded by prepare-grove-assets.mjs. */
export const GROVE_ASSETS = [
  { alias: 'grove_stump', src: 'assets/images/objects/grove/stump.png', width: 64, height: 48 },
  ...[1, 2, 3].map((i) => ({
    alias: `grove_mushroom_${i}`,
    src: `assets/images/objects/grove/mushroom_${i}.png`,
    width: 16,
    height: 16,
  })),
] as const;
