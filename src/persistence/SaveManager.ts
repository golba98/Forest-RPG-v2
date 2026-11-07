import { libraryId, worldName, type WorldLibraryEntry } from './WorldLibrary';
import { randomSeed } from '../game/LaunchParams';
import type { Difficulty } from '../types/world';
import { validEnvironment, validEnvironmentAssetKey } from '../world/Biomes';
import {
  SAVE_SCHEMA_VERSION,
  assertGeneratorVersion,
  assertMigrationVersions,
  normalizeWorldCompatibility,
} from '../world/WorldCompatibility';
import { prepareHilltopObjects } from '../world/HilltopObjects';
import { repairSavedRivers } from '../world/RepairRivers';
import type { SimulationRuntime } from '../types/encounters';
import { validateEncounterSites, validateEncounterState } from './EncounterValidation';
import { prepareEncounterWorld } from '../world/EncounterPlacement';
import { restoreSafePosition } from '../systems/SpawnSafety';
import { adaptLegacySave } from './LegacySaveAdapter';
import type { Entity } from '../types/entities';
import { isTileId, Tile } from '../types/tiles';
import type { WorldBridge, WorldData } from '../types/world';
import { GAME_CONFIG } from '../config/GameConfig';
import { boundsOverlap, bridgeGeometry } from '../world/BridgeGeometry';
import { validBridgeTerrain } from '../world/generation/bridges';
import { GenGrid } from '../world/generation/GenGrid';
import type { Game } from '../game/Game';
import { Simulation } from '../simulation/Simulation';
import { WorldRepository } from './WorldRepository';
import type { WorldCheckpoint } from './WorldRepository';
import { exportInfinite, importInfinite, validateCheckpoint } from './InfiniteArchive';
import { preserveLegacyRegion } from '../world/infinite/LegacyRegion';
import { infiniteDescriptor, newWorldId } from '../world/infinite/InfiniteSession';
import { COORDINATE_LIMIT } from '../world/infinite/coordinates';

interface SavePayload {
  version: typeof SAVE_SCHEMA_VERSION;
  world: Omit<WorldData, 'tiles'> & { tiles: number[] };
  entities: Entity[];
  time: number;
  elapsedMs: number;
  tutorialStage: number;
  runtime: SimulationRuntime;
  legacyExtras?: Record<string, unknown>;
}
const object = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === 'object' && !Array.isArray(v);
const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const integer = (v: unknown): v is number => finite(v) && Number.isInteger(v);
const point = (v: unknown, w: number, h: number): boolean =>
  object(v) && finite(v.x) && finite(v.y) && v.x >= 0 && v.x < w && v.y >= 0 && v.y < h;
const hasNumbers = (o: Record<string, unknown>, keys: string[]): boolean =>
  keys.every((k) => finite(o[k]));
const directions = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
const animations = ['idle', 'walk', 'run', 'jump', 'attack', 'hurt', 'death'];
function validEntity(v: unknown, w: number, h: number): v is Entity {
  if (
    !object(v) ||
    !point(v, w, h) ||
    !finite(v.halfSize) ||
    v.halfSize <= 0 ||
    v.halfSize > 2 ||
    typeof v.id !== 'string' ||
    !v.id ||
    !directions.includes(String(v.facing)) ||
    !animations.includes(String(v.anim)) ||
    typeof v.alive !== 'boolean' ||
    (v.kind === 'player' &&
      v.hauntedIntroComplete !== undefined &&
      typeof v.hauntedIntroComplete !== 'boolean') ||
    (v.encounterId !== undefined &&
      (typeof v.encounterId !== 'string' || v.encounterId.length > 160)) ||
    !hasNumbers(v, ['prevX', 'prevY', 'halfSize', 'animTimeMs'])
  )
    return false;
  if (v.kind === 'player') {
    if (
      !object(v.stats) ||
      !hasNumbers(v.stats, [
        'health',
        'maxHealth',
        'mana',
        'maxMana',
        'stamina',
        'maxStamina',
        'level',
        'xp',
        'xpToNextLevel',
        'statPoints',
        'baseDamage',
        'coins',
      ]) ||
      !object(v.inventory) ||
      !hasNumbers(v.inventory, ['healthPotions', 'speedPotions']) ||
      !hasNumbers(v, [
        'vx',
        'vy',
        'sprintLockoutMs',
        'jumpProgress',
        'hurtTimerMs',
        'comboCount',
        'speedBuffMs',
      ]) ||
      typeof v.isSprinting !== 'boolean' ||
      typeof v.isJumping !== 'boolean' ||
      typeof v.isDashing !== 'boolean'
    )
      return false;
    const s = v.stats,
      i = v.inventory;
    return (
      finite(s.maxHealth) &&
      s.maxHealth > 0 &&
      s.maxHealth <= 20 &&
      finite(s.health) &&
      s.health >= 0 &&
      s.health <= s.maxHealth &&
      finite(s.maxMana) &&
      s.maxMana > 0 &&
      s.maxMana <= 100000 &&
      finite(s.mana) &&
      s.mana >= 0 &&
      s.mana <= s.maxMana &&
      finite(s.maxStamina) &&
      s.maxStamina > 0 &&
      s.maxStamina <= 100000 &&
      finite(s.stamina) &&
      s.stamina >= 0 &&
      s.stamina <= s.maxStamina &&
      integer(s.level) &&
      s.level >= 1 &&
      s.level <= 1000 &&
      finite(s.xpToNextLevel) &&
      s.xpToNextLevel > 0 &&
      finite(s.xp) &&
      s.xp >= 0 &&
      s.xp < s.xpToNextLevel &&
      integer(s.statPoints) &&
      s.statPoints >= 0 &&
      s.statPoints <= 10000 &&
      finite(s.baseDamage) &&
      s.baseDamage > 0 &&
      s.baseDamage <= 100000 &&
      finite(s.coins) &&
      s.coins >= 0 &&
      finite(i.healthPotions) &&
      i.healthPotions >= 0 &&
      finite(i.speedPotions) &&
      i.speedPotions >= 0
    );
  }
  if (v.kind === 'enemy')
    return (
      ['mantis', 'maggot', 'beetle', 'ghost'].includes(String(v.enemyType)) &&
      [
        'idle',
        'patrol',
        'chase',
        'attack',
        'flee',
        'investigate',
        'return',
        'recover',
        'stunned',
        'dead',
      ].includes(String(v.aiState)) &&
      typeof v.aggressive === 'boolean' &&
      hasNumbers(v, ['health', 'maxHealth', 'hurtTimerMs', 'attackCooldownMs'])
    );
  if (v.kind === 'pickup')
    return (
      ['coin', 'health_potion', 'speed_potion', 'chest'].includes(String(v.pickupType)) &&
      (v.value === undefined || (integer(v.value) && v.value >= 1 && v.value <= 100)) &&
      (v.requiredForCompletion === undefined || typeof v.requiredForCompletion === 'boolean') &&
      (v.chest === undefined ||
        (v.pickupType === 'chest' &&
          object(v.chest) &&
          ['wooden', 'reinforced'].includes(String(v.chest.variant)) &&
          ['closed', 'opening', 'opened'].includes(String(v.chest.state)) &&
          finite(v.chest.elapsedMs) &&
          v.chest.elapsedMs >= 0 &&
          v.chest.elapsedMs <= 600 &&
          (v.chest.state !== 'closed' || v.chest.elapsedMs === 0) &&
          (v.chest.state !== 'opened' || v.chest.elapsedMs === 600)))
    );
  if (v.kind === 'portal')
    return (
      typeof v.active === 'boolean' &&
      (v.portalState === undefined ||
        ['locked', 'reacting', 'open', 'transitioning'].includes(String(v.portalState))) &&
      (v.roundComplete === undefined || typeof v.roundComplete === 'boolean') &&
      (v.entryEligible === undefined || typeof v.entryEligible === 'boolean')
    );
  if (v.kind === 'projectile')
    return (
      ['acid', 'magic_bolt'].includes(String(v.projectileType)) &&
      typeof v.ownerId === 'string' &&
      hasNumbers(v, ['vx', 'vy', 'damage', 'travelled', 'maxDistance'])
    );
  return false;
}
function decode(raw: string): {
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
export class SaveManager {
  private repository: WorldRepository | undefined;
  private worlds(): WorldRepository {
    return (this.repository ??= new WorldRepository());
  }
  async initialize(): Promise<void> {
    if (!this.infinite) return;
    for (const slot of ['auto', 'biome-walk', 'walk-v14', 'walk-v15', 'walk-v16']) {
      const checkpoint = await this.worlds().load(slot);
      const key = `forestrpg.v3.slot.${slot}`;
      if (checkpoint && this.storage.getItem(key) !== '0') this.storage.setItem(key, '1');
      if (slot === 'biome-walk' && checkpoint?.descriptor.mode === 'biome-walk') {
        const archive = `walk-v${checkpoint.descriptor.generatorVersion}`;
        // Pin existing exploration snapshots before the first new-version entry.
        if (!(await this.worlds().load(archive)))
          await this.worlds().checkpoint(checkpoint, new Map(), archive);
        this.storage.setItem(`forestrpg.v3.slot.${archive}`, '1');
      }
    }
    await this.migrateLibrary();
  }
  listWorlds(): Promise<WorldLibraryEntry[]> {
    return this.worlds().listWorlds();
  }
  hasTutorialSave(): boolean {
    try {
      const raw = this.storage.getItem('forestrpg.v2.save.auto');
      return !!raw && decode(raw).world.meta.isTutorial === true;
    } catch {
      return false;
    }
  }
  developerContext(): void {
    WorldRepository.libraryContext = undefined;
  }
  async createWorld(name: string, seed: number | undefined, difficulty: Difficulty): Promise<void> {
    const now = Date.now();
    const entry: WorldLibraryEntry = {
      id: libraryId(),
      name: worldName(name),
      seed: seed ?? randomSeed(),
      difficulty,
      level: 1,
      createdAt: now,
      lastPlayedAt: now,
      kind: 'streamed',
    };
    const previous = WorldRepository.libraryContext;
    WorldRepository.libraryContext = entry;
    try {
      await this.game.startNewGame({ seed: entry.seed, difficulty });
      if (this.game.currentScene !== 'playing')
        throw new Error('World generation failed. Try again.');
      this.game.pause();
      await this.save();
      this.game.resume();
    } catch (error) {
      WorldRepository.libraryContext = previous;
      this.game.returnToMenu();
      throw error;
    }
  }
  async openWorld(entry: WorldLibraryEntry): Promise<void> {
    const previous = WorldRepository.libraryContext;
    WorldRepository.libraryContext = entry;
    try {
      if (entry.kind === 'streamed') {
        const state = await this.worlds().load(entry.id);
        if (!state) throw new Error('Saved world is missing.');
        await this.restoreInfinite(state);
      } else await this.load(entry.id);
      await this.worlds().putWorld({
        ...entry,
        lastPlayedAt: Date.now(),
        kind: this.sim.stream ? 'streamed' : 'finite',
      });
    } catch (error) {
      WorldRepository.libraryContext = previous;
      throw error;
    }
  }
  async renameWorld(entry: WorldLibraryEntry, name: string): Promise<void> {
    const updated = { ...entry, name: worldName(name) };
    await this.worlds().putWorld(updated);
    if (WorldRepository.libraryContext?.id === entry.id) WorldRepository.libraryContext = updated;
    if (this.sim.stream?.libraryEntry?.id === entry.id)
      this.sim.stream.libraryEntry.name = updated.name;
  }
  async deleteWorld(entry: WorldLibraryEntry): Promise<void> {
    await this.worlds().deleteWorld(entry.id);
    this.storage.removeItem(`forestrpg.v2.save.${entry.id}`);
    this.storage.removeItem(`forestrpg.v3.slot.${entry.id}`);
    if (WorldRepository.libraryContext?.id === entry.id) this.developerContext();
  }
  async exportWorld(entry: WorldLibraryEntry): Promise<Blob> {
    if (entry.kind === 'streamed') {
      const state = await this.worlds().load(entry.id);
      if (!state) throw new Error('Saved world is missing.');
      return exportInfinite(this.worlds(), state, new Map());
    }
    const raw = this.storage.getItem(`forestrpg.v2.save.${entry.id}`);
    if (!raw) throw new Error('Saved world is missing.');
    return new Blob([raw], { type: 'application/json' });
  }
  async importWorld(file: File): Promise<void> {
    const previous = WorldRepository.libraryContext;
    this.developerContext();
    try {
      if (file.name.endsWith('.jsonl')) {
        const state = await importInfinite(this.worlds(), file, (v) => this.validGlobalEntity(v));
        if (state.descriptor.mode === 'biome-walk')
          throw new Error('Exploration archives belong in Developer.');
        const now = Date.now();
        const entry: WorldLibraryEntry = {
          id: libraryId(),
          name: worldName(file.name.replace(/\.[^.]+$/, '').slice(0, 64) || 'Imported World'),
          seed: state.descriptor.seed,
          difficulty: state.descriptor.difficulty,
          level: state.descriptor.level,
          createdAt: now,
          lastPlayedAt: now,
          kind: 'streamed',
        };
        await this.worlds().checkpoint(state, new Map(), entry.id, entry);
        this.storage.setItem(`forestrpg.v3.slot.${entry.id}`, '1');
      } else {
        const raw = await file.text();
        const state = decode(raw);
        if (state.world.meta.isTutorial) throw new Error('Use Tutorial for training saves.');
        const now = Date.now(),
          id = libraryId();
        this.storage.setItem(`forestrpg.v2.save.${id}`, raw);
        await this.worlds().putWorld({
          id,
          name: file.name.replace(/\.[^.]+$/, '').slice(0, 64) || 'Imported World',
          seed: state.world.meta.seed,
          difficulty: state.world.meta.difficulty,
          level: state.world.meta.level,
          createdAt: now,
          lastPlayedAt: now,
          kind: 'finite',
        });
      }
    } finally {
      WorldRepository.libraryContext = previous;
    }
  }
  private async migrateLibrary(): Promise<void> {
    const known = new Set((await this.listWorlds()).map((entry) => entry.id));
    const keys = Array.from({ length: this.storage.length }, (_, i) => this.storage.key(i));
    for (const slot of await this.worlds().legacySlots()) {
      if (known.has(slot) || (await this.worlds().wasMigrated(`stream:${slot}`))) continue;
      const state = await this.worlds().load(slot);
      if (
        !state ||
        state.descriptor.mode === 'biome-walk' ||
        this.storage.getItem(`forestrpg.v3.slot.${slot}`) === '0'
      )
        continue;
      const id = libraryId(),
        now = Date.now();
      const entry: WorldLibraryEntry = {
        id,
        name: slot === 'auto' ? 'Previous Adventure' : slot,
        seed: state.descriptor.seed,
        difficulty: state.descriptor.difficulty,
        level: state.descriptor.level,
        createdAt: now,
        lastPlayedAt: now,
        kind: 'streamed',
      };
      await this.worlds().checkpoint(state, new Map(), id, entry, `stream:${slot}`);
      this.storage.setItem(`forestrpg.v3.slot.${id}`, '1');
    }
    for (const key of keys) {
      if (!key?.startsWith('forestrpg.v2.save.') && key !== 'autosave_map') continue;
      if (await this.worlds().wasMigrated(key)) continue;
      const slot = key.replace('forestrpg.v2.save.', '');
      if (known.has(slot)) continue;
      const raw = this.storage.getItem(key);
      if (!raw) continue;
      try {
        const parsed = JSON.parse(raw) as { version?: number };
        const meta =
          parsed.version === undefined
            ? adaptLegacySave(parsed).world.meta
            : decode(raw).world.meta;
        if (meta.isTutorial) continue;
        const id = libraryId(),
          now = Date.now();
        this.storage.setItem(`forestrpg.v2.save.${id}`, raw);
        await this.worlds().putWorld(
          {
            id,
            name: slot === 'auto' || key === 'autosave_map' ? 'Previous Adventure' : slot,
            seed: meta.seed,
            difficulty: meta.difficulty,
            level: meta.level,
            createdAt: now,
            lastPlayedAt: now,
            kind: 'finite',
          },
          key,
        );
      } catch {
        /* Keep unsupported legacy saves available to the existing importer. */
      }
    }
  }
  private validGlobalEntity(value: unknown): boolean {
    if (
      !object(value) ||
      !finite(value.x) ||
      !finite(value.y) ||
      Math.abs(value.x) > COORDINATE_LIMIT - 1024 ||
      Math.abs(value.y) > COORDINATE_LIMIT - 1024
    )
      return false;
    if (typeof value.id !== 'string' || value.id.length > 160) return false;
    if (
      value.kind === 'enemy' &&
      (!finite(value.health) ||
        !finite(value.maxHealth) ||
        value.health < 0 ||
        value.maxHealth <= 0 ||
        value.health > value.maxHealth ||
        value.maxHealth > 1000000)
    )
      return false;
    return validEntity(
      { ...value, x: value.x + COORDINATE_LIMIT, y: value.y + COORDINATE_LIMIT },
      COORDINATE_LIMIT * 2 + 1,
      COORDINATE_LIMIT * 2 + 1,
    );
  }
  private async restoreInfinite(state: WorldCheckpoint, fork = true): Promise<void> {
    validateCheckpoint(state, (v) => this.validGlobalEntity(v));
    if (state.legacy) {
      const legacy = state.legacy;
      if (
        !Array.isArray(legacy.exits) ||
        legacy.exits.length > 4 ||
        typeof legacy.travelLink !== 'boolean' ||
        legacy.exits.some(
          (e) =>
            !Number.isInteger(e.x) ||
            !Number.isInteger(e.y) ||
            e.x < 0 ||
            e.y < 0 ||
            e.x >= legacy.world.meta.width ||
            e.y >= legacy.world.meta.height ||
            legacy.world.tiles[e.y * legacy.world.meta.width + e.x] !== Tile.BORDER,
        )
      )
        throw new Error('Invalid preserved region exits');
      const normalized = decode(
        JSON.stringify(
          {
            version: 2,
            world: legacy.world,
            entities: legacy.entities,
            time: state.time,
            elapsedMs: state.elapsedMs,
            tutorialStage: 0,
            runtime: legacy.runtime ?? state.runtime,
          },
          (_key, value: unknown) => (value instanceof Uint8Array ? Array.from(value) : value),
        ),
      );
      state = {
        ...state,
        legacy: { ...legacy, world: normalized.world, entities: normalized.entities },
      };
    }
    this.legacyExtras = state.legacy?.legacyExtras;
    if (fork) state = await this.worlds().fork(state, newWorldId());
    const world = await this.sim.prepareInfinite(
      {
        seed: state.descriptor.seed,
        level: state.descriptor.level,
        difficulty: state.descriptor.difficulty,
      },
      state,
    );
    this.game.loadWorld(world);
    this.sim.restoreInfinite(state);
  }
  private async convertFinite(state: ReturnType<typeof decode>): Promise<void> {
    if (WorldRepository.libraryContext) WorldRepository.libraryContext.kind = 'streamed';
    const descriptor = infiniteDescriptor(state.world.meta),
      runtime = state.runtime ?? { rngState: state.world.meta.seed };
    const checkpoint: WorldCheckpoint = {
      version: 3,
      descriptor,
      revision: 0,
      entities: state.entities.filter((e) => e.kind === 'player' || e.kind === 'portal'),
      runtime: { rngState: runtime.rngState },
      time: state.time,
      elapsedMs: state.elapsedMs,
      objectives: [],
      legacy: preserveLegacyRegion(
        state.world,
        state.entities,
        runtime,
        state.elapsedMs,
        this.legacyExtras,
      ),
    };
    await this.restoreInfinite(checkpoint, false);
    await this.save('auto');
  }
  private legacyExtras: Record<string, unknown> | undefined;
  constructor(
    private readonly storage: Storage,
    private readonly game: Game,
    private readonly sim: Simulation,
    private readonly infinite = false,
  ) {}
  async exportFile(): Promise<Blob> {
    if (this.sim.stream) {
      const stream = this.sim.stream,
        runtime = this.sim.getRuntimeState();
      stream.capture(this.sim.world, this.sim.getEntities(), runtime, this.sim.elapsedMs);
      const state = stream.snapshot(
        this.sim.getEntities(),
        runtime,
        this.sim.getTimeOfDay(),
        this.sim.elapsedMs,
      );
      return exportInfinite(stream.repository, state, new Map(stream.deltas));
    }
    return new Blob([this.export()], { type: 'application/json' });
  }
  export(): string {
    if (this.sim.stream) throw new Error('Use asynchronous exportFile for streamed worlds');
    const payload: SavePayload = {
      version: SAVE_SCHEMA_VERSION,
      world: { ...this.sim.world, tiles: Array.from(this.sim.world.tiles) },
      entities: [...this.sim.getEntities()],
      time: this.sim.getTimeOfDay(),
      elapsedMs: this.sim.elapsedMs,
      tutorialStage: this.sim.tutorial.stage,
      runtime: this.sim.getRuntimeState(),
      ...(this.legacyExtras ? { legacyExtras: this.legacyExtras } : {}),
    };
    return JSON.stringify(payload);
  }
  import(raw: string): void | Promise<void> {
    if (raw.startsWith('{"format":"forestrpg"')) return this.importArchive(raw);
    if (raw.length > 8_000_000) throw new Error('Save file is too large');
    const parsed: unknown = JSON.parse(raw);
    if (object(parsed) && parsed.version === undefined) {
      const legacy = adaptLegacySave(parsed);
      if (this.infinite && !legacy.world.meta.isTutorial) {
        const staged = new Simulation();
        staged.loadWorld(legacy.world);
        staged.restoreLegacyEnemies(
          legacy.enemyHealth,
          legacy.legacyExtras.isPortalActive === true,
        );
        this.legacyExtras = legacy.legacyExtras;
        return this.convertFinite({
          world: staged.world,
          entities: structuredClone([...staged.getEntities()]),
          time: staged.getTimeOfDay(),
          elapsedMs: staged.elapsedMs,
          tutorialStage: 0,
          runtime: staged.getRuntimeState(),
        });
      }
      this.game.loadWorld(legacy.world);
      this.sim.restoreLegacyEnemies(
        legacy.enemyHealth,
        legacy.legacyExtras.isPortalActive === true,
      );
      this.legacyExtras = legacy.legacyExtras;
      return;
    }
    const state = decode(raw); // Validate fully before touching the running game.
    if (this.infinite && !state.world.meta.isTutorial && state.world.meta.generatorVersion < 13) {
      this.legacyExtras =
        object(parsed) && object(parsed.legacyExtras) ? parsed.legacyExtras : undefined;
      return this.convertFinite(state);
    }
    // Repair old penetrations before replacing the active world. An impossible
    // save fails here, while the current run remains intact.
    for (const e of state.entities)
      if (e.alive && (e.kind === 'player' || e.kind === 'enemy'))
        restoreSafePosition(
          state.world,
          e,
          e.kind === 'enemy' ? (e.enemyType === 'ghost' ? 'ghost' : 'groundEnemy') : 'player',
        );
    this.legacyExtras =
      object(parsed) && object(parsed.legacyExtras) ? parsed.legacyExtras : undefined;
    const install = () => {
      this.game.loadWorld(state.world);
      this.sim.restoreEntities(
        state.entities,
        state.time,
        state.elapsedMs,
        state.tutorialStage,
        state.runtime,
      );
    };
    if (state.world.environment && this.sim.preparePresentation)
      return this.sim.preparePresentation(state.world).then(install);
    install();
  }

  save(slot = 'auto'): void | Promise<void> {
    if (
      slot === 'auto' &&
      !this.sim.stream &&
      !this.sim.world.meta.isTutorial &&
      WorldRepository.libraryContext
    )
      slot = WorldRepository.libraryContext.id;
    if (!/^[a-z0-9_-]{1,32}$/i.test(slot)) throw new Error('Invalid save slot');
    if (this.sim.stream) slot = this.sim.stream.saveSlot(slot);
    if (this.sim.stream)
      return this.sim.saveInfinite(slot).then(() => {
        this.storage.setItem(`forestrpg.v3.slot.${slot}`, '1');
      });
    const exported = this.export();
    if (typeof exported !== 'string') throw new Error('World changed while saving');
    this.storage.setItem(`forestrpg.v2.save.${slot}`, exported);
    const entry = WorldRepository.libraryContext;
    if (this.storage.getItem(`forestrpg.v3.slot.${slot}`) !== null)
      this.storage.setItem(`forestrpg.v3.slot.${slot}`, '0');
    if (entry && entry.id === slot)
      return this.worlds().putWorld({
        ...entry,
        kind: 'finite',
        lastPlayedAt: Date.now(),
        level: this.sim.world.meta.level,
      });
  }
  load(slot = 'auto'): void | Promise<void> {
    if (!/^[a-z0-9_-]{1,32}$/i.test(slot)) throw new Error('Invalid save slot');
    if (this.storage.getItem(`forestrpg.v3.slot.${slot}`) === '1')
      return this.worlds()
        .load(slot)
        .then((state) => {
          if (!state) throw new Error('Saved world is missing from browser storage');
          return this.restoreInfinite(state);
        });
    const current = this.storage.getItem(`forestrpg.v2.save.${slot}`);
    const legacy = slot === 'auto' && !current ? this.storage.getItem('autosave_map') : null;
    const raw = current ?? legacy;
    if (!raw) throw new Error('No saved game in this slot');
    const imported = this.import(raw);
    if (imported instanceof Promise)
      return imported.then(() => {
        if (legacy) return this.save(slot);
      });
    if (legacy) return this.save(slot);
  }
  async importArchive(input: string | Blob): Promise<void> {
    const state = await importInfinite(this.worlds(), input, (v) => this.validGlobalEntity(v));
    await this.restoreInfinite(state, false);
    await this.save('auto');
  }
  exists(slot = 'auto'): boolean {
    try {
      return (
        this.storage.getItem(`forestrpg.v3.slot.${slot}`) === '1' ||
        this.storage.getItem(`forestrpg.v2.save.${slot}`) !== null ||
        (slot === 'auto' && this.storage.getItem('autosave_map') !== null)
      );
    } catch {
      return false;
    }
  }
}
