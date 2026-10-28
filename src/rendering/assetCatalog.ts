import type { Direction } from '../types/entities';
import type { PropKind } from '../types/world';
import { HILL_ATLAS_ALIAS, HILL_ATLAS_SRC } from './hillAutotile';

/**
 * Pixi-free asset alias catalogue for the renderer.
 *
 * The shipped manifest does not list the player sheets or decor images yet, so
 * the TextureStore registers them itself under these aliases (skipping any
 * alias the manifest already defines).
 */

export const MANIFEST_URL = '/assets/manifests/asset_manifest.json';

/** Manifest bundles the renderer loads. */
export const MANIFEST_BUNDLES = ['boot', 'world', 'entities'] as const;

/** Bundle the TextureStore registers for assets missing from the manifest. */
export const RENDERER_EXTRA_BUNDLE = 'rendering_extras';

export const PLAYER_SHEET_ANIMS = ['idle', 'walk', 'run', 'jump', 'attack'] as const;
export type PlayerSheetAnim = (typeof PLAYER_SHEET_ANIMS)[number];

export const DIRECTIONS: readonly Direction[] = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];

/** File-name suffix used by `characters/player/<anim>/<anim>_<suffix>.png`. */
export const DIRECTION_FILE_SUFFIX: Readonly<Record<Direction, string>> = {
  N: 'north',
  NE: 'northeast',
  E: 'east',
  SE: 'southeast',
  S: 'south',
  SW: 'southwest',
  W: 'west',
  NW: 'northwest',
};

export const DECOR_KINDS: readonly PropKind[] = [
  'bush_small',
  'bush_obstacle',
  'flower_clump',
  'flower_pink',
  'flower_yellow',
  'log_horizontal',
  'log_vertical',
  'log_stump',
  'rock_boulder',
  'rock_pebble',
  'hole',
];

/**
 * Decor that lies flat and whose art is an opaque tile of baked-in grass. Drawn
 * under every actor: depth-sorting them lets the grass rectangle cover the player.
 */
export const GROUND_PROPS: ReadonlySet<PropKind> = new Set<PropKind>([
  'flower_clump',
  'flower_pink',
  'flower_yellow',
  'log_horizontal',
  'log_vertical',
  'rock_pebble',
  'hole',
]);

function buildPlayerAliases(): Readonly<Record<PlayerSheetAnim, Readonly<Record<Direction, string>>>> {
  const table = {} as Record<PlayerSheetAnim, Record<Direction, string>>;
  for (const anim of PLAYER_SHEET_ANIMS) {
    const row = {} as Record<Direction, string>;
    for (const dir of DIRECTIONS) row[dir] = `player_${anim}_${DIRECTION_FILE_SUFFIX[dir]}`;
    table[anim] = row;
  }
  return table;
}

/** Precomputed so hot-path frame selection never builds strings. */
export const PLAYER_SHEET_ALIASES = buildPlayerAliases();

export function playerSheetAlias(anim: PlayerSheetAnim, dir: Direction): string {
  return PLAYER_SHEET_ALIASES[anim][dir];
}

export function decorAlias(kind: PropKind): string {
  if (kind === 'tree') return 'tile_tree';
  return `decor_${kind}`;
}

export interface CatalogAsset {
  readonly alias: string;
  readonly src: string;
}

/** Assets the renderer needs that are not (yet) in the manifest. */
export function rendererExtraAssets(): CatalogAsset[] {
  const assets: CatalogAsset[] = [];
  for (const anim of PLAYER_SHEET_ANIMS) {
    for (const dir of DIRECTIONS) {
      assets.push({
        alias: playerSheetAlias(anim, dir),
        src: `assets/images/characters/player/${anim}/${anim}_${DIRECTION_FILE_SUFFIX[dir]}.png`,
      });
    }
  }
  for (const kind of DECOR_KINDS) {
    assets.push({ alias: decorAlias(kind), src: `assets/images/objects/decor/${kind}.png` });
  }
  for (let i = 1; i <= 4; i++) assets.push({ alias: `cloud_${i}`, src: `assets/images/objects/clouds/cloud_${i}.png` });
  assets.push({ alias: HILL_ATLAS_ALIAS, src: HILL_ATLAS_SRC });
  return assets;
}
