import { GAME_CONFIG } from '../../config/GameConfig';
import { restoreSafePosition } from '../../systems/SpawnSafety';
import type { SimulationRuntime } from '../../types/encounters';
import type { Entity } from '../../types/entities';
import { isTileId, Tile } from '../../types/tiles';
import type { WorldBridge, WorldData } from '../../types/world';
import { validEnvironment, validEnvironmentAssetKey } from '../../world/Biomes';
import { boundsOverlap, bridgeGeometry } from '../../world/BridgeGeometry';
import { prepareEncounterWorld } from '../../world/EncounterPlacement';
import { validBridgeTerrain } from '../../world/generation/bridges';
import { GenGrid } from '../../world/generation/GenGrid';
import { prepareHilltopObjects } from '../../world/HilltopObjects';
import { repairSavedRivers } from '../../world/RepairRivers';
import {
  assertGeneratorVersion,
  assertMigrationVersions,
  normalizeWorldCompatibility,
  SAVE_SCHEMA_VERSION,
} from '../../world/WorldCompatibility';
import { validateEncounterSites, validateEncounterState } from '../EncounterValidation';
import { validEntity } from './EntityValidation';
import { finite, integer, object, point } from './validation';

export interface FiniteSavePayload {
  version: typeof SAVE_SCHEMA_VERSION;
  world: Omit<WorldData, 'tiles'> & { tiles: number[] };
  entities: Entity[];
  time: number;
  elapsedMs: number;
  tutorialStage: number;
  runtime: SimulationRuntime;
  legacyExtras?: Record<string, unknown>;
}

export function decodeFiniteSave(raw: string): {
  world: WorldData;
  entities: Entity[];
  time: number;
  elapsedMs: number;
  tutorialStage: number;
  runtime?: SimulationRuntime;
} {
  const data: unknown = JSON.parse(raw);
  if (
    !object(data) ||
    data.version !== SAVE_SCHEMA_VERSION ||
    !object(data.world) ||
    !object(data.world.meta)
  )
    throw new Error('Unsupported or invalid save');
  const world = data.world,
    meta = world.meta as Record<string, unknown>,
    w = meta.width,
    h = meta.height;
  if (
    !integer(w) ||
    !integer(h) ||
    w < 3 ||
    h < 3 ||
    w > 512 ||
    h > 512 ||
    !integer(meta.seed) ||
    !integer(meta.level) ||
    typeof meta.isTutorial !== 'boolean' ||
    !['easy', 'normal', 'hard'].includes(String(meta.difficulty))
  )
    throw new Error('Invalid world metadata');
  assertGeneratorVersion(meta.generatorVersion === undefined ? 0 : meta.generatorVersion);
  assertMigrationVersions(meta);
  if (
    ((meta.generatorVersion === 13 && !meta.isTutorial) || world.environment !== undefined) &&
    !validEnvironment(world.environment, w * h)
  )
    throw new Error('Invalid environment data');
  if (
    !Array.isArray(world.tiles) ||
    world.tiles.length !== w * h ||
    !world.tiles.every((v: unknown) => integer(v) && isTileId(v))
  )
    throw new Error('Invalid terrain');
  if (world.bridges !== undefined) {
    const rules = GAME_CONFIG.world.bridges;
    const validBridge = (b: unknown): b is WorldBridge =>
      object(b) &&
      integer(b.id) &&
      b.id >= 0 &&
      integer(b.x) &&
      integer(b.y) &&
      (b.orientation === 'horizontal' || b.orientation === 'vertical') &&
      integer(b.span) &&
      b.span >= rules.minSpan &&
      b.span <= rules.maxSpan &&
      integer(b.variant) &&
      b.variant >= 0 &&
      b.variant < 4;
    if (
      !Array.isArray(world.bridges) ||
      world.bridges.length > rules.maxCount ||
      !world.bridges.every(validBridge)
    )
      throw new Error('Invalid bridges');
    const bridges = world.bridges as WorldBridge[];
    const grid = new GenGrid(w, h, Tile.GRASS);
    grid.tiles.set(world.tiles as number[]);
    if (
      new Set(bridges.map((b) => b.id)).size !== bridges.length ||
      bridges.some(
        (b, i) =>
          // Existing deck geometry can support raised landings without rewriting saved terrain.
          !validBridgeTerrain(grid, b, true) ||
          bridges
            .slice(0, i)
            .some((other) =>
              boundsOverlap(bridgeGeometry(b).footprint, bridgeGeometry(other).footprint),
            ),
      )
    )
      throw new Error('Invalid bridges');
  }
  if (
    !point(world.spawn, w, h) ||
    !point(world.portal, w, h) ||
    !Array.isArray(world.props) ||
    world.props.length > Math.min(w * h, 25000) ||
    !world.props.every(
      (p: unknown) =>
        object(p) &&
        integer(p.id) &&
        integer(p.tileX) &&
        integer(p.tileY) &&
        point({ x: p.tileX, y: p.tileY }, w, h) &&
        typeof p.solid === 'boolean' &&
        validEnvironmentAssetKey(p.assetKey) &&
        (p.variant === undefined || (integer(p.variant) && p.variant >= 0 && p.variant < 256)) &&
        (p.featureKey === undefined ||
          (typeof p.featureKey === 'string' && p.featureKey.length <= 160)) &&
        (p.hilltop === undefined ||
          (object(p.hilltop) &&
            p.kind === 'rock_boulder' &&
            p.solid === true &&
            integer(p.hilltop.sourceX) &&
            integer(p.hilltop.sourceY) &&
            point({ x: p.hilltop.sourceX, y: p.hilltop.sourceY }, w, h))) &&
        [
          'tree',
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
        ].includes(String(p.kind)),
    )
  )
    throw new Error('Invalid world objects');
  if (new Set(world.props.map((p: { id: number }) => p.id)).size !== world.props.length)
    throw new Error('Duplicate world objects');
  if (
    !Array.isArray(world.enemySpawns) ||
    !Array.isArray(world.pickupSpawns) ||
    !world.enemySpawns.every(
      (v: unknown) =>
        point(v, w, h) &&
        object(v) &&
        ['mantis', 'maggot', 'beetle', 'ghost'].includes(String(v.type)) &&
        (v.aggressive === undefined || typeof v.aggressive === 'boolean') &&
        (v.maxHealth === undefined || finite(v.maxHealth)),
    ) ||
    !world.pickupSpawns.every(
      (v: unknown) =>
        point(v, w, h) &&
        object(v) &&
        ['coin', 'health_potion', 'speed_potion', 'chest'].includes(String(v.type)) &&
        (v.id === undefined ||
          (typeof v.id === 'string' && v.id.length > 0 && v.id.length <= 160)) &&
        (v.chestVariant === undefined ||
          (v.type === 'chest' && ['wooden', 'reinforced'].includes(String(v.chestVariant)))),
    )
  )
    throw new Error('Invalid spawn data');
  if (
    !Array.isArray(data.entities) ||
    data.entities.length > Math.min(w * h, 4096) ||
    !data.entities.every((e: unknown) => validEntity(e, w, h)) ||
    data.entities.filter((e: Entity) => e.kind === 'player').length !== 1 ||
    data.entities.filter((e: Entity) => e.kind === 'portal').length !== 1 ||
    new Set(data.entities.map((e: Entity) => e.id)).size !== data.entities.length
  )
    throw new Error('Invalid entities');
  if (
    !finite(data.time) ||
    data.time < 0 ||
    data.time >= 1 ||
    !finite(data.elapsedMs) ||
    data.elapsedMs < 0 ||
    !integer(data.tutorialStage) ||
    data.tutorialStage < 0 ||
    data.tutorialStage > 4
  )
    throw new Error('Invalid simulation clock');
  if (
    data.runtime !== undefined &&
    (!object(data.runtime) ||
      !integer(data.runtime.rngState) ||
      data.runtime.rngState < 0 ||
      data.runtime.rngState > 0xffffffff ||
      (data.runtime.ghostNightSpawned !== undefined &&
        typeof data.runtime.ghostNightSpawned !== 'boolean'))
  )
    throw new Error('Invalid runtime state');
  if (object(data.runtime) && data.runtime.moisture !== undefined) {
    const moisture = data.runtime.moisture;
    const bytes = (v: unknown) =>
      Array.isArray(v) && v.length === w * h && v.every((b) => integer(b) && b >= 0 && b <= 255);
    if (
      !object(moisture) ||
      moisture.version !== 1 ||
      !bytes(moisture.wetness) ||
      !bytes(moisture.puddles) ||
      !finite(moisture.remainderMs) ||
      moisture.remainderMs < 0 ||
      moisture.remainderMs >= 200
    )
      throw new Error('Invalid surface moisture');
  }
  if (
    meta.riverRepairSkipped !== undefined &&
    (!Array.isArray(meta.riverRepairSkipped) ||
      meta.riverRepairSkipped.length > w * h ||
      !meta.riverRepairSkipped.every((p) => point(p, w, h)))
  )
    throw new Error('Invalid river repair report');
  const runtime = data.runtime as SimulationRuntime | undefined;
  const convertedWorld = normalizeWorldCompatibility({
    ...(world as unknown as WorldData),
    tiles: Uint8Array.from(world.tiles as number[]),
  });
  if (convertedWorld.encounterSites === undefined && !runtime?.encounters)
    for (const e of data.entities as Entity[])
      if (e.alive && (e.kind === 'player' || e.kind === 'enemy'))
        restoreSafePosition(
          convertedWorld,
          e,
          e.kind === 'enemy' ? (e.enemyType === 'ghost' ? 'ghost' : 'groundEnemy') : 'player',
        );
  const restoredWorld = prepareHilltopObjects(
    repairSavedRivers(
      prepareEncounterWorld(convertedWorld, data.entities as Entity[]),
      data.entities as Entity[],
    ),
    data.entities as Entity[],
  );
  validateEncounterSites(restoredWorld);
  validateEncounterState(restoredWorld, runtime?.encounters);
  return {
    world: restoredWorld,
    entities: data.entities as Entity[],
    time: data.time,
    elapsedMs: data.elapsedMs,
    tutorialStage: data.tutorialStage,
    ...(runtime ? { runtime } : {}),
  };
}
