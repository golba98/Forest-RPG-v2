import { GROVE_ASSETS } from './groveArt';
import { ANIMATION_DEFS, type ClipDef, type SpriteSetDef } from '../animation/AnimationDefs';
import { DECOR_KINDS, GROUND_PROPS, decorAlias } from './assetCatalog';
import { HILL_ATLAS_ALIAS, HILL_ATLAS_SRC } from './hillAutotile';
import type { PropKind } from '../types/world';

/**
 * Structured visual metadata for every texture the world renderer draws.
 * Pixi-free; consumed by tests (dimensions vs PNG headers, alias coverage),
 * by docs/assets/visual-manifest.md and as the reference for collision
 * alignment discussions with the simulation owners.
 *
 * Solid footprints are annotations only: collision is defined by
 * TILE_PROPERTIES and `WorldProp.solid` (see docs/contracts), never by art.
 */

export type RenderLayer = 'terrain' | 'ground-fx' | 'actors' | 'sky';
/** Point whose y sorts the sprite among actors. */
export type DepthAnchor = 'none' | 'foot' | 'tile-bottom';

export interface ClipSummary {
  readonly frames: number;
  readonly frameMs: number;
  readonly loop: boolean;
}

export interface VisualAssetEntry {
  readonly id: string;
  readonly alias: string;
  /** Path under public/. */
  readonly path: string;
  /** Full texture size in source px (checked against the PNG header). */
  readonly texture: { readonly w: number; readonly h: number };
  /** One animation/atlas frame in source px. */
  readonly frame: { readonly w: number; readonly h: number };
  readonly anchor: { readonly x: number; readonly y: number };
  /** Offset from the entity/tile anchor point, world px. */
  readonly renderOffset: { readonly x: number; readonly y: number };
  /** Nominal on-screen size in tiles (32 px). */
  readonly tileFootprint: { readonly w: number; readonly h: number };
  readonly depthAnchor: DepthAnchor;
  readonly layer: RenderLayer;
  readonly animation?: Readonly<Record<string, ClipSummary>>;
  /** What blocks movement, when anything does. */
  readonly solidFootprint?: string;
}

const TILE = 32;
const OBSTACLE_PROPS: ReadonlySet<PropKind> = new Set(['bush_obstacle', 'log_vertical', 'log_stump', 'log_horizontal']);

/** Measured source sizes (tests compare these with the PNG headers). */
const DECOR_SIZE: Readonly<Record<string, readonly [number, number]>> = {
  bush_small: [16, 48],
  bush_obstacle: [32, 32],
  flower_clump: [19, 17],
  flower_pink: [15, 16],
  flower_yellow: [16, 16],
  log_horizontal: [48, 33],
  log_vertical: [32, 48],
  log_stump: [32, 32],
  rock_boulder: [32, 32],
  rock_pebble: [16, 17],
  hole: [31, 18],
};

const MANIFEST_PATHS: Readonly<Record<string, string>> = {
  enemy_mantis_move: 'assets/images/characters/enemies/mantis_move.png',
  enemy_mantis_attack: 'assets/images/characters/enemies/mantis_attack.png',
  enemy_beetle_move: 'assets/images/characters/enemies/beetle_move.png',
  enemy_beetle_attack: 'assets/images/characters/enemies/beetle_attack.png',
  enemy_maggot_walk: 'assets/images/characters/enemies/maggot_walk.png',
  enemy_maggot_spit: 'assets/images/characters/enemies/maggot_spit.png',
  enemy_ghost_move: 'assets/images/characters/enemies/ghost_move.png',
  enemy_ghost_attack: 'assets/images/characters/enemies/ghost_attack.png',
  projectile_acid_blob: 'assets/images/characters/enemies/acid_blob.png',
  item_chest: 'assets/images/items/chest.png',
  item_potion_health: 'assets/images/items/potion_health.png',
  item_potion_speed: 'assets/images/items/potion_speed.png',
  item_coin_anim: 'assets/images/items/coin_anim.png',
  portal_active: 'assets/images/objects/portal_active.png',
  portal_inactive: 'assets/images/objects/portal_inactive.png',
};

function summarise(clips: SpriteSetDef['clips']): Record<string, ClipSummary> {
  const out: Record<string, ClipSummary> = {};
  for (const [name, clip] of Object.entries(clips) as Array<[string, ClipDef | undefined]>) {
    if (clip) out[name] = { frames: clip.frameCount, frameMs: clip.frameDurationMs, loop: clip.loop };
  }
  return out;
}

function sheetEntries(): VisualAssetEntry[] {
  const out = new Map<string, VisualAssetEntry>();
  for (const [key, def] of Object.entries(ANIMATION_DEFS)) {
    const anchor = def.anchor.kind === 'center' ? { x: 0.5, y: 0.5 } : { x: 0.5, y: 1 };
    const footOffset = def.anchor.kind === 'feet' ? def.anchor.footOffsetPx : 0;
    for (const clips of [def.clips, def.activeClips]) {
      if (!clips) continue;
      for (const clip of Object.values(clips)) {
        if (!clip) continue;
        const scale = clip.scale ?? def.scale;
        const sheets = clip.source.kind === 'perDirectionSheets'
          ? Object.values(clip.source.sheets).map((s) => ({ alias: s.alias, w: s.sheetWidth, h: s.sheetHeight, cols: clip.frameCount, rows: 1 }))
          : [{ alias: clip.source.sheet.alias, w: clip.source.sheet.sheetWidth, h: clip.source.sheet.sheetHeight, cols: clip.source.sheet.columns, rows: clip.source.sheet.rows }];
        for (const sheet of sheets) {
          if (out.has(sheet.alias)) continue;
          const frame = { w: Math.floor(sheet.w / sheet.cols), h: Math.floor(sheet.h / sheet.rows) };
          const player = key === 'player';
          out.set(sheet.alias, {
            id: `${key}:${sheet.alias}`,
            alias: sheet.alias,
            path: player ? playerPath(sheet.alias) : MANIFEST_PATHS[sheet.alias] ?? '',
            texture: { w: sheet.w, h: sheet.h },
            frame,
            anchor,
            renderOffset: { x: 0, y: footOffset },
            tileFootprint: { w: (frame.w * scale) / TILE, h: (frame.h * scale) / TILE },
            depthAnchor: key === 'portal' ? 'tile-bottom' : 'foot',
            layer: 'actors',
            animation: summarise(clips),
            solidFootprint: key === 'portal' ? 'none; entry radius 0.8 tiles around the portal tile centre' : 'entity AABB, halfSize 0.3 tiles (simulation)',
          });
        }
      }
    }
  }
  return [...out.values()];
}

function playerPath(alias: string): string {
  const [, anim, dir] = alias.split('_');
  return `assets/images/characters/player/${anim}/${anim}_${dir}.png`;
}

export function buildVisualManifest(): VisualAssetEntry[] {
  const fullTile = (id: string, alias: string, path: string, w: number, h: number): VisualAssetEntry => ({
    id, alias, path, texture: { w, h }, frame: { w, h }, anchor: { x: 0, y: 0 }, renderOffset: { x: 0, y: 0 },
    tileFootprint: { w: 1, h: 1 }, depthAnchor: 'none', layer: 'terrain',
  });
  const entries: VisualAssetEntry[] = [
    fullTile('terrain:grass', 'tile_grass', 'assets/images/terrain/grass.png', 32, 32),
    { ...fullTile('terrain:water', 'tile_water', 'assets/images/terrain/water.png', 105, 100), solidFootprint: 'not solid; slows the player, blocks ground enemies' },
    fullTile('terrain:bridge', 'tile_bridge', 'assets/images/terrain/bridge.png', 64, 64),
    fullTile('terrain:mud', 'tile_mud', 'assets/images/terrain/mud.png', 1254, 1254),
    {
      ...fullTile('terrain:hill-cliff', HILL_ATLAS_ALIAS, HILL_ATLAS_SRC, 360, 216),
      frame: { w: 32, h: 32 },
      solidFootprint: 'HILL_* edges solid to walking, crossable by jumping; PLATEAU tops and STAIRS walkable (TILE_PROPERTIES)',
    },
    {
      id: 'actor:forest-tree', alias: 'tile_tree', path: 'assets/images/terrain/tree.png', texture: { w: 239, h: 286 }, frame: { w: 239, h: 286 },
      anchor: { x: 0.5, y: 1 }, renderOffset: { x: 16, y: 32 }, tileFootprint: { w: 2, h: 2 }, depthAnchor: 'tile-bottom', layer: 'actors',
      solidFootprint: 'FOREST/BORDER tiles are solid; canopy spans columns x-1..x+1 and rows y-1..y (planForestTrees covers every solid tile)',
    },
    {
      id: 'sky:cloud', alias: 'cloud_1', path: 'assets/images/objects/clouds/cloud_1.png', texture: { w: 64, h: 36 }, frame: { w: 64, h: 36 },
      anchor: { x: 0.5, y: 0.5 }, renderOffset: { x: 0, y: 0 }, tileFootprint: { w: 6, h: 3.4 }, depthAnchor: 'none', layer: 'sky',
    },
    {
      id: 'actor:portal-frame', alias: 'portal_forest', path: 'assets/images/objects/portal_forest.png', texture: { w: 1312, h: 1199 }, frame: { w: 1312, h: 1199 },
      anchor: { x: 0.5, y: 1 }, renderOffset: { x: 0, y: 16 }, tileFootprint: { w: 86 / TILE, h: (86 * 1199) / 1312 / TILE }, depthAnchor: 'tile-bottom', layer: 'actors',
      solidFootprint: 'none; entry radius 0.8 tiles around the portal tile centre (Game.fixedUpdate)',
    },
  ];
  for (const kind of DECOR_KINDS) {
    const [w, h] = DECOR_SIZE[kind] ?? [32, 32];
    const flower = kind.startsWith('flower_');
    const scale = Math.min(1, TILE / w, (TILE * (flower ? 1 : 1.5)) / h);
    entries.push({
      id: `prop:${kind}`, alias: decorAlias(kind), path: `assets/images/objects/decor/${kind}.png`, texture: { w, h }, frame: { w, h },
      anchor: { x: 0, y: 0 }, renderOffset: { x: (TILE - w * scale) / 2, y: flower ? (TILE - h * scale) / 2 : TILE - h * scale },
      tileFootprint: { w: (w * scale) / TILE, h: (h * scale) / TILE },
      ...(GROUND_PROPS.has(kind) ? { depthAnchor: 'none' as const, layer: 'terrain' as const } : { depthAnchor: 'tile-bottom' as const, layer: 'actors' as const }),
      ...(OBSTACLE_PROPS.has(kind) ? { solidFootprint: 'own tile when placed as an obstacle (WorldProp.solid)' } : {}),
    });
  }
  for (const layer of ['body', 'front', 'ground', 'cleared']) entries.push({
    id: `nest_${layer}`, alias: `nest_${layer}`, path: `assets/images/objects/nest/nest_${layer}.png`,
    texture: { w: 96, h: 80 }, frame: { w: 96, h: 80 }, anchor: { x: 0.5, y: 0.65 },
    renderOffset: { x: 0, y: -10 }, tileFootprint: { w: 3, h: 2.5 },
    depthAnchor: layer === 'ground' ? 'none' : 'foot', layer: layer === 'ground' ? 'ground-fx' : 'actors',
    solidFootprint: 'player-only stepped nest base; upper projections and padding excluded',
  });
  for (const asset of GROVE_ASSETS) entries.push({
    id: asset.alias, alias: asset.alias, path: asset.src,
    texture: { w: asset.width, h: asset.height }, frame: { w: asset.width, h: asset.height },
    anchor: { x: 0.5, y: 1 }, renderOffset: { x: 0, y: 8 },
    tileFootprint: { w: asset.width / TILE, h: asset.height / TILE },
    depthAnchor: asset.alias === 'grove_stump' ? 'foot' : 'none',
    layer: asset.alias === 'grove_stump' ? 'actors' : 'ground-fx',
    solidFootprint: 'none; grove artwork does not add collision',
  });
  entries.push(...sheetEntries());
  return entries;
}
