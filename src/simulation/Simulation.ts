import { CancelledWork } from '../core/WorkSlice';
import { findBiomeLanding } from '../world/infinite/BiomeLanding';
import type { BiomeId } from '../world/Biomes';
import { copyWindowOverlap } from '../world/infinite/WindowOverlap';
import { SurfaceSites } from '../systems/SurfaceMoisture';
import { preparePropIndex } from '../systems/CollisionSystem';
import { collectLoot, prepareLoot } from '../systems/LootSystem';
import {
  InfiniteSession,
  infiniteDescriptor,
  bindSession,
  sessionFor,
  translateEntity,
} from '../world/infinite/InfiniteSession';
import { WorldRepository } from '../persistence/WorldRepository';
import type { WorldCheckpoint } from '../persistence/WorldRepository';
import type { WorldGenOptions } from '../types/world';
import type { WorldEdit } from '../world/infinite/WorldEdits';

import { landscapeFor } from '../world/LandscapePlan';
import { normalizeWorldCompatibility } from '../world/WorldCompatibility';
import { prepareHilltopObjects } from '../world/HilltopObjects';
import { SurfaceMoisture, surfaceSites } from '../systems/SurfaceMoisture';
import type { WeatherKind } from '../types/render';
import { EncounterDirector, type EncounterCue } from '../systems/EncounterDirector';
import { prepareEncounterWorld } from '../world/EncounterPlacement';
import type { SimulationRuntime } from '../types/encounters';
import { entityFootprint, groundTile, resolveFootprint } from '../systems/EntityFootprint';
import { supportingSurface } from '../systems/SurfaceState';
import { PortalSystem } from '../systems/PortalSystem';
import { restoreSafePosition } from '../systems/SpawnSafety';
import { describeTerrain } from '../world/TerrainTopology';
import { queryColliders, canOccupy, hasClearPath } from '../systems/CollisionSystem';
import { floodFill, findPath } from '../world/pathfinding';
import type { GameplayDebug, PortalChange, RoundStatus } from '../types/gameplay';
import { Rng } from '../world/Rng';
import { GAME_CONFIG as C } from '../config/GameConfig';
import type { Entity, EntityBase, EnemyType, PlayerEntity, PlayerIntent } from '../types/entities';
import type { RenderSnapshot } from '../types/render';
import type { ISimulation } from '../types/simulation';
import type { WorldData } from '../types/world';
import { generateTutorialWorld } from '../world/TutorialMap';
import { TutorialSystem } from '../systems/TutorialSystem';
import { EncounterSystem, type CombatFeedback } from '../systems/EncounterSystem';
import {
  movePlayer,
  movementRuntime,
  restoreMovementRuntime,
  rebaseMovementRuntime,
} from '../systems/MovementSystem';

export class Simulation implements ISimulation {
  preparePresentation: ((world: WorldData) => Promise<void>) | undefined;
  async travelToBiome(biome: BiomeId): Promise<void> {
    const stream = this.stream;
    if (!stream?.exploration) throw new Error('Biome travel is available in Biome Walk');
    while (this.preparingStream) await new Promise<void>((resolve) => setTimeout(resolve, 1));
    stream.capture(this.world, this.entities, this.getRuntimeState(), this.elapsedMs);
    const landing = await findBiomeLanding(stream, biome, this.world);
    await this.setGlobalPosition(landing.position.x, landing.position.y);
    await this.saveInfinite('auto');
  }
  viewDimensions: (() => { width: number; height: number }) | undefined;
  destroy(): void {
    this.streamEpoch++;
    this.preparingStream = false;
    this.installingStream = false;
    this.stream?.dispose();
    this.preparingSession?.dispose();
  }
  stream: InfiniteSession | undefined;
  private preparingSession: InfiniteSession | undefined;
  private preparingStream = false;
  private installingStream = false;
  private streamEpoch = 0;
  private transitionSave: Promise<void> | undefined;
  async prepareInfinite(options: WorldGenOptions, state?: WorldCheckpoint): Promise<WorldData> {
    if (options.generatorVersion !== undefined && ![13, 14, 15, 16].includes(options.generatorVersion))
      throw new Error('Unsupported streamed generation request');
    this.preparingSession?.dispose();
    const session = new InfiniteSession(
      state?.descriptor ?? infiniteDescriptor(options),
      new WorldRepository(),
      state?.legacy,
    );
    const view = this.viewDimensions?.();
    if (view) session.setViewTiles(view.width, view.height);
    this.preparingSession = session;
    if (state) {
      session.revision = state.revision;
      if (state.exploration) {
        session.home = state.exploration.home;
        session.landings = { ...state.exploration.landings };
      }
      for (const id of state.objectives) session.objectives.add(id);
    }
    const p = state?.entities.find((e) => e.kind === 'player') ??
      state?.legacy?.entities.find((e) => e.kind === 'player') ?? { x: 0.5, y: 0.5 };
    try {
      if (!state && options.mode === 'biome-walk') {
        const landing = await findBiomeLanding(session, options.biome ?? 'forest');
        if (this.preparingSession !== session) throw new Error('World preparation cancelled');
        session.home = landing.position;
        session.commitWindow(landing.world);
        await this.preparePresentation?.(landing.world);
        this.preparingSession = undefined;
        return bindSession(landing.world, session);
      }
      await session.prepareAt(p.x, p.y);
      if (this.preparingSession !== session) throw new Error('World preparation cancelled');
      this.preparingSession = undefined;
      const world = session.buildWindow();
      await this.preparePresentation?.(world);
      return bindSession(world, session);
    } catch (error) {
      session.dispose();
      throw error;
    }
  }
  getWorldWaitReason():
    'installation' | 'preparation-edge' | 'stream-error-edge' | 'persistence-edge' | null {
    if (this.installingStream) return 'installation';
    const edge =
      this.stream &&
      this.player &&
      (this.player.x < 16 ||
        this.player.y < 16 ||
        this.player.x > this.world.meta.width - 16 ||
        this.player.y > this.world.meta.height - 16);
    if (edge && this.stream?.error) return 'stream-error-edge';
    if (edge && this.transitionSave) return 'persistence-edge';
    if (edge && this.preparingStream) return 'preparation-edge';
    return null;
  }
  isWaitingForWorld(): boolean {
    return this.getWorldWaitReason() !== null;
  }
  async saveInfinite(slot?: string): Promise<void> {
    while (this.installingStream) await new Promise<void>((resolve) => setTimeout(resolve, 1));
    const stream = this.stream;
    if (!stream) return;
    const recovering = !!stream.error;
    const runtime = this.getRuntimeState();
    stream.capture(this.world, this.entities, runtime, this.elapsedMs);
    await stream.checkpoint(this.entities, runtime, this.time, this.elapsedMs, slot);
    stream.error = null;
    if (recovering) stream.prune(false);
  }
  getStreamingDebug() {
    return this.stream
      ? {
          ...this.stream.source.info,
          worldId: this.stream.descriptor.id,
          generatorVersion: this.stream.descriptor.generatorVersion,
          mode: this.stream.descriptor.mode ?? 'adventure',
          biome:
            this.stream.generator.geography?.sample(
              Math.floor(this.player.x + this.stream.origin.x),
              Math.floor(this.player.y + this.stream.origin.y),
            ).biome ?? 0,
          origin: this.stream.origin,
          globalPosition: this.stream.globalPosition(this.player),
          transitions: this.stream.transitions,
          error: this.stream.error,
          preparing: this.preparingStream,
        }
      : null;
  }
  async ensureView(width: number, height: number): Promise<void> {
    const stream = this.stream;
    if (!stream) return;
    stream.setViewTiles(width, height);
    while (this.stream === stream && this.world.meta.width !== stream.windowSize) {
      await this.transitionSave;
      await this.advanceStream();
      if (stream.error) throw new Error(stream.error);
      if (this.preparingStream) await new Promise<void>((resolve) => setTimeout(resolve, 1));
    }
  }
  applyWorldEdit(edit: WorldEdit): void {
    const stream = this.stream;
    if (!stream) throw new Error('A streamed world is required');
    if (edit.kind === 'place') {
      const prop = {
        ...edit.prop,
        tileX: edit.prop.tileX - stream.origin.x,
        tileY: edit.prop.tileY - stream.origin.y,
      };
      if (
        !canOccupy(
          { ...this.world, props: [...this.world.props, prop] },
          this.player.x,
          this.player.y,
          entityFootprint(this.player),
        )
      )
        throw new Error('Object would overlap the player');
    }
    stream.edit(this.world, edit);
    if (edit.kind === 'event') return;
    const moisture = this.moisture.save();
    this.world = bindSession({ ...this.world, props: [...this.world.props] }, stream);
    this.encounters.rebase(this.world, 0, 0);
    this.moisture = new SurfaceMoisture(surfaceSites(this.world));
    this.moisture.restore(moisture);
    this.worldVersion++;
    if (edit.kind === 'tile') this.onCut?.(edit.x - stream.origin.x, edit.y - stream.origin.y);
  }
  planTravelPath(x: number, y: number): { x: number; y: number }[] {
    const origin = this.stream?.origin ?? { x: 0, y: 0 },
      world = this.world,
      cache = new Map<number, boolean>();
    const passable = (x: number, y: number) => {
      const key = y * world.meta.width + x;
      if (!cache.has(key))
        cache.set(key, canOccupy(world, x + 0.5, y + 0.5, entityFootprint(this.player)));
      return cache.get(key) ?? false;
    };
    const start = { x: Math.floor(this.player.x), y: Math.floor(this.player.y) };
    const target = { x: Math.floor(x - origin.x), y: Math.floor(y - origin.y) };
    const candidates: { x: number; y: number }[] = [];
    for (let dy = -8; dy <= 8; dy++)
      for (let dx = -8; dx <= 8; dx++) {
        const p = { x: target.x + dx, y: target.y + dy };
        if (
          p.x >= 2 &&
          p.y >= 2 &&
          p.x < world.meta.width - 2 &&
          p.y < world.meta.height - 2 &&
          passable(p.x, p.y)
        )
          candidates.push(p);
      }
    candidates.sort(
      (a, b) =>
        Math.hypot(a.x - target.x, a.y - target.y) - Math.hypot(b.x - target.x, b.y - target.y),
    );
    for (const candidate of candidates.slice(0, 16)) {
      const path = findPath(world.meta, start, candidate, passable, 6000, (a, b) =>
        hasClearPath(
          world,
          a.x + 0.5,
          a.y + 0.5,
          b.x + 0.5,
          b.y + 0.5,
          entityFootprint(this.player),
        ),
      );
      if (path) return path.map((p) => ({ x: p.x + origin.x + 0.5, y: p.y + origin.y + 0.5 }));
    }
    return [];
  }
  async setGlobalPosition(x: number, y: number): Promise<void> {
    await this.transitionSave;
    const stream = this.stream;
    if (!stream) {
      this.setPlayerPosition(x, y);
      return;
    }
    const origin = stream.origin,
      lx = x - origin.x,
      ly = y - origin.y;
    if (
      Number.isFinite(x) &&
      Number.isFinite(y) &&
      lx >= 32 &&
      ly >= 32 &&
      lx < this.world.meta.width - 32 &&
      ly < this.world.meta.height - 32 &&
      !this.installingStream
    ) {
      if (Math.hypot(this.player.x - lx, this.player.y - ly) > 4) {
        stream.teleportVersion++;
        if (this.world.window) this.world.window.teleportVersion = stream.teleportVersion;
      }
      this.player.x = this.player.prevX = lx;
      this.player.y = this.player.prevY = ly;
      void this.advanceStream();
      return;
    }
    if (this.preparingStream) {
      while (this.preparingStream) await new Promise<void>((resolve) => setTimeout(resolve, 1));
      return this.setGlobalPosition(x, y);
    }
    this.preparingStream = true;
    try {
      await stream.prepareAt(x, y);
      this.installingStream = true;
      const runtime = this.getRuntimeState(),
        old = stream.origin;
      stream.capture(this.world, this.entities, runtime, this.elapsedMs);
      await stream.checkpoint(this.entities, runtime, this.time, this.elapsedMs, 'auto');
      stream.teleportVersion++;
      // Keep the active origin and scene intact if decoding an entering biome
      // fails. Only publish after both terrain and its artwork are ready.
      let world: WorldData;
      try {
        world = await stream.stageWindow(this.world, () => this.stream === stream);
        await this.preparePresentation?.(world);
        if (this.stream !== stream) throw new CancelledWork();
      } catch (error) {
        if (this.stream === stream) stream.prune(false);
        throw error;
      }
      stream.commitWindow(world);
      const next = stream.origin;
      const player = translateEntity(this.player, old.x - next.x, old.y - next.y);
      player.x = player.prevX = x - next.x;
      player.y = player.prevY = y - next.y;
      const portal = this.entities.find((e) => e.kind === 'portal');
      this.installStream(
        world,
        player,
        portal ? translateEntity(portal, old.x - next.x, old.y - next.y) : undefined,
        runtime,
        this.entities
          .filter((e) => e.kind === 'projectile')
          .map((e) => translateEntity(e, old.x - next.x, old.y - next.y)),
      );
      restoreSafePosition(world, this.player);
      stream.error = null;
      stream.prune();
    } finally {
      this.preparingStream = false;
      this.installingStream = false;
    }
  }
  private installStream(
    world: WorldData,
    player: PlayerEntity,
    portal: Entity | undefined,
    runtime: SimulationRuntime,
    transient: readonly Entity[] = [],
    previousMoisture?: SurfaceMoisture,
    live?: readonly Entity[],
  ): void {
    const stream = this.stream;
    if (!stream) return;
    const old = this.world?.window,
      next = world.window;
    if (old && next)
      this.encounters.rebase(world, old.originX - next.originX, old.originY - next.originY);
    const mounted = stream.hydrate(world, player, portal, runtime);
    this.world = bindSession(world, stream);
    const retained = new Map(live?.map((e) => [e.id, e]));
    this.entities = [...mounted.entities, ...transient].map((e) => {
      const current = retained.get(e.id);
      if (!current || current.kind !== e.kind || e.id === player.id) return e;
      Object.assign(
        current,
        translateEntity(
          current,
          (old?.originX ?? 0) - (next?.originX ?? 0),
          (old?.originY ?? 0) - (next?.originY ?? 0),
        ),
      );
      return current;
    });
    this.player = player;
    this.director = new EncounterDirector(
      world,
      (type, x, y, id) => this.createEnemy(type, x, y, id),
      (kind) => this.onEncounterCue?.(kind),
    );
    const defaults = this.director.state,
      saved = mounted.runtime.encounters;
    this.director.restore(
      {
        version: 1,
        bosses: defaults.bosses.map((b) => saved?.bosses.find((v) => v.siteId === b.siteId) ?? b),
        groves: defaults.groves.map((g) => saved?.groves.find((v) => v.siteId === g.siteId) ?? g),
      },
      player,
      this.entities,
    );
    this.moisture = new SurfaceMoisture(surfaceSites(world));
    this.moisture.restore(stream.restoreMoisture(world, this.elapsedMs));
    if (previousMoisture) this.moisture.copyOverlap(previousMoisture);
    stream.reveal(world, player);
    prepareLoot(world, this.entities);
    this.worldVersion++;
  }
  restoreInfinite(state: WorldCheckpoint): void {
    const stream = this.stream;
    if (!stream) throw new Error('No infinite world prepared');
    const player = state.entities.find((e): e is PlayerEntity => e.kind === 'player');
    if (!player) throw new Error('Save has no player');
    const origin = stream.origin;
    const portal = state.entities.find((e) => e.kind === 'portal');
    this.installStream(
      this.world,
      translateEntity(player, -origin.x, -origin.y),
      portal ? translateEntity(portal, -origin.x, -origin.y) : undefined,
      state.runtime,
      state.entities
        .filter((e) => e.kind === 'projectile')
        .map((e) => translateEntity(e, -origin.x, -origin.y)),
    );
    this.time = state.time;
    this.elapsedMs = state.elapsedMs;
    stream.teleportVersion++;
    if (this.world.window) this.world.window.teleportVersion = stream.teleportVersion;
    this.moisture.restore(stream.restoreMoisture(this.world, this.elapsedMs));
    this.sequence = Math.max(this.sequence, state.runtime.entitySequence ?? 0);
    this.encounters.setSequence(state.runtime.lootSequence ?? this.sequence);
    this.encounters.setRandomState(state.runtime.rngState);
    const movement = state.runtime.movement;
    if (movement)
      restoreMovementRuntime(this.player, {
        ...(movement.dash ? { dash: movement.dash } : {}),
        ...(movement.landing
          ? { landing: { x: movement.landing.x - origin.x, y: movement.landing.y - origin.y } }
          : {}),
      });
    this.encounters.resetPlayerAttack();
    if (this.player.anim === 'attack') {
      this.player.anim = this.player.isJumping ? 'jump' : 'idle';
      this.player.animTimeMs = 0;
      this.player.comboCount = 0;
    }
    this.portal.restore(this.entities, 0, stream.objectiveStatus());
  }
  private async advanceStream(): Promise<void> {
    const stream = this.stream,
      epoch = this.streamEpoch;
    if (
      !stream ||
      this.preparingStream ||
      this.transitionSave ||
      stream.error ||
      (!stream.needsShift(this.player) && this.world.meta.width === stream.windowSize)
    )
      return;
    this.preparingStream = true;
    try {
      const p = stream.globalPosition(this.player);
      await stream.prepareAt(p.x, p.y);
      let world: WorldData;
      for (;;) {
        const active = this.world,
          count = active.props.length,
          teleportVersion = stream.teleportVersion;
        if (this.stream !== stream || epoch !== this.streamEpoch) throw new CancelledWork();
        // Capture current geometry before preparing metadata; actors/moisture are
        // captured again at publication, not frozen while asynchronous work runs.
        stream.capture(active, this.entities, this.getRuntimeState(), this.elapsedMs);
        const valid = () =>
          this.stream === stream &&
          epoch === this.streamEpoch &&
          this.world === active &&
          active.props.length === count &&
          stream.teleportVersion === teleportVersion &&
          stream.windowSize === worldSize;
        const worldSize = stream.windowSize;
        try {
          world = await stream.stageWindow(active, valid);
          await SurfaceSites.prepare(world, valid);
          await preparePropIndex(world, valid);
          await this.preparePresentation?.(world);
          if (!valid()) throw new CancelledWork();
          break;
        } catch (error) {
          if (
            !(error instanceof CancelledWork) ||
            this.stream !== stream ||
            epoch !== this.streamEpoch
          )
            throw error;
          const at = stream.globalPosition(this.player);
          await stream.prepareAt(at.x, at.y);
        }
      }
      // One synchronous publication between simulation calls. No storage await
      // occurs inside the installation guard.
      this.installingStream = true;
      const runtime = this.getRuntimeState(),
        previous = this.world,
        live = this.entities,
        moisture = this.moisture;
      stream.capture(previous, live, runtime, this.elapsedMs);
      const durable = stream.checkpoint(live, runtime, this.time, this.elapsedMs, 'auto');
      copyWindowOverlap(world, previous);
      const old = stream.origin;
      stream.commitWindow(world);
      const next = stream.origin,
        dx = old.x - next.x,
        dy = old.y - next.y;
      const player = this.player;
      player.x += dx;
      player.prevX += dx;
      player.y += dy;
      player.prevY += dy;
      rebaseMovementRuntime(player, dx, dy);
      const portal = live.find((e) => e.kind === 'portal');
      this.installStream(
        world,
        player,
        portal ? translateEntity(portal, dx, dy) : undefined,
        runtime,
        live.filter((e) => e.kind === 'projectile').map((e) => translateEntity(e, dx, dy)),
        moisture,
        live,
      );
      stream.transitions++;
      const saving = durable
        .then(() => {
          if (this.stream === stream) {
            stream.prune(false);
            stream.error = null;
          }
        })
        .catch((error: unknown) => {
          if (this.stream === stream)
            stream.error = error instanceof Error ? error.message : String(error);
        })
        .finally(() => {
          if (this.transitionSave === saving) this.transitionSave = undefined;
        });
      this.transitionSave = saving;
    } catch (error) {
      if (!(error instanceof CancelledWork) && this.stream === stream && epoch === this.streamEpoch)
        stream.error = error instanceof Error ? error.message : String(error);
    } finally {
      if (epoch === this.streamEpoch) {
        this.preparingStream = false;
        this.installingStream = false;
      }
    }
  }
  onPortalChange: ((change: PortalChange) => void) | null = null;
  onRoundComplete: ((status: RoundStatus) => void) | null = null;
  private portal = new PortalSystem(
    (change) => this.onPortalChange?.(change),
    (status) => this.onRoundComplete?.(status),
  );
  tutorial = new TutorialSystem();
  invertY = false;
  sensitivity = 5;
  world!: WorldData;
  player!: PlayerEntity;
  worldVersion = 0;
  elapsedMs = 0;
  private time = 0.3;
  moisture!: SurfaceMoisture;
  weatherOverride: WeatherKind | null = null;
  getWeather(): WeatherKind {
    return (
      this.weatherOverride ??
      (!this.world.meta.isTutorial &&
      Math.floor((this.elapsedMs + (this.world.meta.seed % 19) * 1000) / 30000) % 6 === 4
        ? 'rain'
        : 'clear')
    );
  }
  private entities: Entity[] = [];
  private sequence = 0;
  private director!: EncounterDirector;
  onEncounterCue: ((kind: EncounterCue) => void) | null = null;
  onFeedback:
    | ((
        kind: CombatFeedback,
        player: PlayerEntity,
        enemy?: import('../types/entities').EnemyEntity,
      ) => void)
    | null = null;
  onHit: ((enemy: import('../types/entities').EnemyEntity, damage: number) => void) | null = null;
  onCut: ((x: number, y: number, propId?: import('../types/world').WorldObjectId) => void) | null =
    null;
  private encounters = new EncounterSystem(
    (enemy, damage) => this.onHit?.(enemy, damage),
    undefined,
    (kind, player, enemy) => this.onFeedback?.(kind, player, enemy),
  );
  constructor() {
    this.loadWorld(generateTutorialWorld());
  }
  private base(kind: EntityBase['kind'], x: number, y: number): EntityBase {
    return {
      id: `${this.stream ? this.stream.descriptor.id + ':' : ''}${kind}-${this.sequence++}`,
      kind,
      x,
      y,
      prevX: x,
      prevY: y,
      halfSize: 0.3,
      facing: 'S',
      anim: 'idle',
      animTimeMs: 0,
      alive: true,
    };
  }
  loadWorld(world: WorldData): void {
    this.streamEpoch++;
    this.preparingStream = false;
    this.installingStream = false;
    const stream = sessionFor(world);
    if (world.window && !stream)
      throw new Error('Streamed views must be loaded through their session');
    if (this.preparingSession && this.preparingSession !== stream) {
      this.preparingSession.dispose();
      this.preparingSession = undefined;
    }
    if (this.stream && this.stream !== stream) this.stream.dispose();
    this.stream = stream;
    world = prepareHilltopObjects(prepareEncounterWorld(normalizeWorldCompatibility(world)));
    landscapeFor(world);
    this.encounters = new EncounterSystem(
      (enemy, damage) => this.onHit?.(enemy, damage),
      new Rng(world.meta.seed),
      (kind, player, enemy) => this.onFeedback?.(kind, player, enemy),
      (x, y, propId) => this.onCut?.(x, y, propId),
      (enemy) => this.director.claimDefeat(enemy),
    );
    this.tutorial = new TutorialSystem();
    this.portal = new PortalSystem(
      (change) => this.onPortalChange?.(change),
      (status) => this.onRoundComplete?.(status),
    );
    this.world = world;
    this.weatherOverride = null;
    this.moisture = new SurfaceMoisture(surfaceSites(world));
    this.worldVersion++;
    this.elapsedMs = 0;
    this.time = 0.3;
    this.entities = [];
    this.player = {
      ...this.base('player', world.spawn.x + 0.5, world.spawn.y + 0.5),
      kind: 'player',
      vx: 0,
      vy: 0,
      stats: {
        health: 7,
        maxHealth: 7,
        mana: 100,
        maxMana: 100,
        stamina: 100,
        maxStamina: 100,
        level: 1,
        xp: 0,
        xpToNextLevel: 100,
        statPoints: 0,
        baseDamage: 1,
        coins: 0,
      },
      inventory: { healthPotions: 0, speedPotions: 0 },
      isSprinting: false,
      sprintLockoutMs: 0,
      isJumping: false,
      jumpProgress: 0,
      isDashing: false,
      hurtTimerMs: 0,
      comboCount: 0,
      speedBuffMs: 0,
    };
    restoreSafePosition(world, this.player);
    this.entities.push(this.player);
    this.director = new EncounterDirector(
      world,
      (type, x, y, id) => this.createEnemy(type, x, y, id),
      (kind) => this.onEncounterCue?.(kind),
    );
    for (const s of world.enemySpawns) {
      // Forest boss/ghost spawn descriptors are migration evidence, not live spawn instructions.
      if (!world.meta.isTutorial && (s.type === 'beetle' || s.type === 'ghost')) continue;
      const enemy = this.createEnemy(s.type, s.x + 0.5, s.y + 0.5, s.id);
      if (enemy?.kind === 'enemy') {
        enemy.aggressive = s.aggressive ?? true;
        enemy.health = enemy.maxHealth = s.maxHealth ?? enemy.maxHealth;
      }
    }
    for (const s of world.pickupSpawns)
      this.entities.push({
        ...this.base('pickup', s.x + 0.5, s.y + 0.5),
        kind: 'pickup',
        pickupType: s.type,
        ...(s.id ? { id: s.id } : {}),
        ...(s.type === 'chest'
          ? {
              chest: {
                variant: s.chestVariant ?? 'wooden',
                state: 'closed',
                elapsedMs: 0,
              } as const,
            }
          : {}),
      });
    this.entities.push({
      ...this.base('portal', world.portal.x + 0.5, world.portal.y + 0.5),
      kind: 'portal',
      active: false,
      portalState: 'locked',
      roundComplete: false,
      entryEligible: false,
    });
    prepareLoot(this.world, this.entities);
    if (stream) {
      const runtime = this.getRuntimeState();
      this.installStream(
        world,
        this.player,
        this.entities.find((e) => e.kind === 'portal'),
        runtime,
      );
    }
  }
  step(dt: number, intent: PlayerIntent): void {
    if (!Number.isFinite(dt) || dt <= 0) return;
    if (this.stream) {
      if (Math.floor(this.elapsedMs / 500) !== Math.floor((this.elapsedMs + dt * 1000) / 500))
        this.stream.reveal(this.world, this.player);
      const travel = this.stream.travelTarget(this.player);
      if (travel && intent.interact) {
        void this.setGlobalPosition(travel.target.x, travel.target.y).catch((error) => {
          if (this.stream)
            this.stream.error = error instanceof Error ? error.message : String(error);
        });
        return;
      }
      void this.advanceStream();
      if (this.isWaitingForWorld()) return;
    }
    this.elapsedMs += dt * 1000;
    this.time = (this.time + dt / C.dayNight.cycleSec) % 1;
    this.moisture.step(dt * 1000, this.getWeather() === 'rain' || this.getWeather() === 'storm');
    const night = this.time >= C.dayNight.nightStart || this.time < C.dayNight.nightEnd;
    const effectiveIntent = this.invertY ? { ...intent, moveY: -intent.moveY } : intent;
    if (this.stream?.exploration) {
      this.player.stats.stamina = this.player.stats.maxStamina;
      this.player.stats.mana = this.player.stats.maxMana;
    }
    const locomotion = movePlayer(this.world, this.player, effectiveIntent, dt, this.sensitivity);
    const encounterInteraction =
      intent.interact === true &&
      !!this.director.presentation(this.player, this.entities).interaction;
    this.director.step(
      this.player,
      this.entities,
      intent,
      dt,
      night,
      this.encounters.getNavigationDebug(),
    );
    this.encounters.step(this.world, this.player, this.entities, effectiveIntent, dt);
    // One owner selects the player clip and clock; movement cannot restart an
    // active punch and combat cannot replace its direction on a later step.
    const attack = this.getPlayerAttack();
    this.player.animTimeMs = attack
      ? attack.elapsedMs
      : this.player.anim === locomotion
        ? this.player.animTimeMs + dt * 1000
        : 0;
    this.player.anim = attack ? 'attack' : locomotion;
    this.director.afterCombat(this.player, this.entities);
    collectLoot(
      this.world,
      this.player,
      this.entities,
      dt,
      intent.interact === true && !encounterInteraction,
      () => this.onFeedback?.('coin', this.player),
    );
    if (this.stream) {
      this.stream.recordDeaths(this.entities, { rngState: 0, encounters: this.director.state });
    }
    this.portal.step(
      this.player,
      this.entities,
      dt,
      this.director.pendingBosses(this.entities),
      this.stream?.objectiveStatus(),
    );
    if (this.world.meta.isTutorial) this.tutorial.update(this.player, this.entities, intent);
    this.entities = this.entities.filter(
      (e) =>
        e.alive || (e.kind !== 'projectile' && !(e.kind === 'enemy' && e.enemyType === 'ghost')),
    );
    for (const e of this.entities) if (e !== this.player) e.animTimeMs += dt * 1000;
  }
  allocateStat(stat: 'health' | 'damage' | 'mana' | 'stamina'): boolean {
    const s = this.player.stats;
    if (s.statPoints <= 0 || (stat === 'health' && s.maxHealth >= C.player.maxHealthCap))
      return false;
    s.statPoints--;
    if (stat === 'health') {
      s.maxHealth += C.progression.statHealth;
      s.health = Math.min(s.maxHealth, s.health + C.progression.statHealth);
    } else if (stat === 'damage') s.baseDamage += C.progression.statDamage;
    else if (stat === 'mana') {
      s.maxMana += C.progression.statMana;
      s.mana += C.progression.statMana;
    } else {
      s.maxStamina += C.progression.statStamina;
      s.stamina += C.progression.statStamina;
    }
    return true;
  }
  getRuntimeState(): SimulationRuntime {
    this.director.afterCombat(this.player, this.entities);
    return {
      ...(this.stream
        ? {
            entitySequence: this.sequence,
            lootSequence: this.encounters.getSequence(),
            movement: movementRuntime(this.player),
          }
        : {}),
      moisture: this.moisture.save(),
      rngState: this.encounters.getRandomState(),
      encounters: structuredClone(this.director.state),
    };
  }
  getEncounterDebug() {
    return { sites: this.director.getSites(), ...structuredClone(this.director.state) };
  }
  clearEncounters(bossesOnly = false): void {
    this.director.clear(this.entities, bossesOnly);
  }
  restoreEntities(
    entities: Entity[],
    time: number,
    elapsedMs: number,
    tutorialStage: number,
    runtime?: SimulationRuntime,
  ): void {
    const player = entities.find((e): e is PlayerEntity => e.kind === 'player');
    if (!player) throw new Error('Save has no player');
    this.entities = entities;
    this.player = player;
    this.encounters.resetPlayerAttack();
    if (player.anim === 'attack') {
      player.anim = player.isJumping ? 'jump' : 'idle';
      player.animTimeMs = 0;
      player.comboCount = 0;
    }
    this.time = time;
    this.elapsedMs = elapsedMs;
    this.moisture.restore(runtime?.moisture);
    this.tutorial.stage = tutorialStage;
    if (runtime) this.encounters.setRandomState(runtime.rngState);
    if (!runtime?.encounters && runtime?.ghostNightSpawned) this.player.hauntedIntroComplete = true;
    this.director.restore(runtime?.encounters, this.player, this.entities);
    for (const entity of entities) {
      const match = /-(\d+)$/.exec(entity.id);
      if (match) this.sequence = Math.max(this.sequence, Number(match[1]) + 1);
    }
    this.encounters.setSequence(this.sequence);
    prepareLoot(this.world, this.entities);
    for (const e of entities)
      if (e.alive && (e.kind === 'player' || e.kind === 'enemy'))
        restoreSafePosition(
          this.world,
          e,
          e.kind === 'enemy' ? (e.enemyType === 'ghost' ? 'ghost' : 'groundEnemy') : 'player',
        );
    this.portal.restore(entities, this.director.pendingBosses(this.entities));
  }
  claimPortalTransition(): boolean {
    return this.portal.claim(this.player, this.entities);
  }
  getGameplayDebug(): GameplayDebug {
    const { x, y } = groundTile(this.player),
      radius = 3;
    const reached = floodFill(this.world.meta, this.world.spawn, (tx, ty) =>
      canOccupy(this.world, tx + 0.5, ty + 0.5, entityFootprint(this.player)),
    );
    const portal = this.entities.find((e) => e.kind === 'portal');
    const f = resolveFootprint(entityFootprint(this.player));
    return {
      encounters: this.getEncounterDebug(),
      playerFootprint: {
        minX: this.player.x + f.offsetX - f.halfWidth,
        minY: this.player.y + f.offsetY - f.halfHeight,
        maxX: this.player.x + f.offsetX + f.halfWidth,
        maxY: this.player.y + f.offsetY + f.halfHeight,
      },
      seed: this.world.meta.seed,
      tile: { x, y },
      terrain: describeTerrain(this.world, x, y),
      colliders: [
        ...queryColliders(this.world, {
          minX: x - radius,
          minY: y - radius,
          maxX: x + radius,
          maxY: y + radius,
        }),
        ...(portal
          ? [
              {
                ownerId: portal.id,
                shape: 'aabb' as const,
                classification: 'trigger' as const,
                source: 'portal' as const,
                minX: portal.x - 0.8,
                minY: portal.y - 0.8,
                maxX: portal.x + 0.8,
                maxY: portal.y + 0.8,
              },
            ]
          : []),
      ],
      round: this.portal.getStatus(),
      portalState: portal?.kind === 'portal' ? (portal.portalState ?? 'locked') : 'locked',
      regionId: reached[y * this.world.meta.width + x] ? 0 : -1,
      navigation: this.encounters.getNavigationDebug(),
    };
  }
  getEntities(): readonly Entity[] {
    return this.entities;
  }
  setPlayerPosition(x: number, y: number): void {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    const half = this.player.halfSize;
    this.player.x = this.player.prevX = Math.max(half, Math.min(this.world.meta.width - half, x));
    this.player.y = this.player.prevY = Math.max(half, Math.min(this.world.meta.height - half, y));
    restoreSafePosition(this.world, this.player);
  }
  spawnEnemy(type: EnemyType, x: number, y: number): string {
    if (!this.world.meta.isTutorial && (type === 'beetle' || type === 'ghost'))
      return this.director.requestSpawn(
        type,
        this.player,
        this.entities,
        this.time < C.dayNight.nightEnd || this.time >= C.dayNight.nightStart,
      );
    return this.createEnemy(type, x, y).id;
  }
  private createEnemy(
    type: EnemyType,
    x: number,
    y: number,
    id?: string,
  ): import('../types/entities').EnemyEntity {
    if (id) {
      const existing = this.entities.find((e) => e.id === id);
      if (existing?.kind === 'enemy' && existing.alive) return existing;
      const index = this.entities.findIndex((e) => e.id === id);
      if (index >= 0) this.entities.splice(index, 1);
    }
    const hp =
      type === 'beetle'
        ? 15 + (this.world.meta.level - 1) * 5
        : type === 'maggot'
          ? 2 + Math.floor(this.world.meta.level / 3)
          : 3 + Math.floor(this.world.meta.level / 2);
    const e = {
      ...this.base('enemy', x, y),
      ...(id ? { id } : {}),
      kind: 'enemy' as const,
      enemyType: type,
      health: hp,
      maxHealth: hp,
      aiState: 'idle' as const,
      aggressive: true,
      hurtTimerMs: 0,
      attackCooldownMs: 0,
    };
    restoreSafePosition(this.world, e, type === 'ghost' ? 'ghost' : 'groundEnemy');
    this.entities.push(e);
    return e;
  }
  restoreLegacyEnemies(
    health: readonly { health: number; maxHealth: number }[],
    portalComplete = false,
  ): void {
    this.entities = this.entities.filter((e) => e.kind !== 'enemy');
    this.world.enemySpawns.forEach((spawn, index) => {
      const enemy = this.createEnemy(spawn.type, spawn.x + 0.5, spawn.y + 0.5);
      const saved = health[index];
      if (saved) {
        enemy.health = saved.health;
        enemy.maxHealth = saved.maxHealth;
        enemy.alive = saved.health > 0;
      }
    });
    const portal = this.entities.find((e) => e.kind === 'portal');
    if (portal?.kind === 'portal' && portalComplete) {
      portal.active = true;
      portal.roundComplete = true;
    }
    // A legacy boss saved inside a newly solid face may have been repaired above.
    // Adopt that repaired home rather than dropping the actor on a cramped map.
    if (
      !this.director.getSites().some((s) => s.kind === 'nest') &&
      this.entities.some((e) => e.kind === 'enemy' && e.enemyType === 'beetle')
    ) {
      const { encounterSites: _sites, ...oldWorld } = this.world;
      this.world = prepareEncounterWorld(oldWorld, this.entities);
      this.director = new EncounterDirector(
        this.world,
        (type, x, y, id) => this.createEnemy(type, x, y, id),
        (kind) => this.onEncounterCue?.(kind),
      );
    }
    this.director.restore(undefined, this.player, this.entities);
    this.portal.restore(this.entities, this.director.pendingBosses(this.entities));
  }
  setTimeOfDay(ratio: number): void {
    this.time = ((ratio % 1) + 1) % 1;
  }
  getTimeOfDay(): number {
    return this.time;
  }
  getPlayerAttack() {
    return this.encounters.getPlayerAttack();
  }
  buildRenderSnapshot(): RenderSnapshot {
    const darkness = Math.max(0, Math.cos(this.time * Math.PI * 2)) * 0.8;
    return {
      world: this.world,
      ...(this.stream ? { round: this.stream.objectiveStatus() } : {}),
      ...(this.stream?.travelTarget(this.player)
        ? { travelPrompt: this.stream.travelTarget(this.player)?.label }
        : {}),
      ...(this.stream?.error ? { streamingError: this.stream.error } : {}),
      moisture: this.moisture,
      elapsedMs: this.elapsedMs,
      encounters: this.director.presentation(this.player, this.entities),
      worldVersion: this.worldVersion,
      playerId: this.player.id,
      entities: this.entities
        .filter((e) => e.alive || (e.kind === 'enemy' && e.anim === 'death' && e.animTimeMs < 450))
        .map((e) => ({
          ...e,
          facing: e.kind === 'player' ? (this.getPlayerAttack()?.direction ?? e.facing) : e.facing,
          // Player clocks are reset here, so presentation must not infer a
          // later start when the first few attack frames were not rendered.
          ...(e.kind === 'player' ? { animStartedAtMs: 0, attack: this.getPlayerAttack() } : {}),
          dead: !e.alive,
          spriteKey: e.kind === 'enemy' ? e.enemyType : e.kind === 'pickup' ? e.pickupType : e.kind,
          lift:
            e.kind === 'player' && e.isJumping
              ? Math.sin(e.jumpProgress * Math.PI) * C.player.jumpPeakTiles
              : 0,
          submerged:
            e.kind === 'player' &&
            !e.isJumping &&
            supportingSurface(this.world, e).kind === 'water',
          ...(e.kind === 'enemy' ? this.director.appearance(e) : { alpha: 1 }),
          hurtFlash: (e.kind === 'player' || e.kind === 'enemy') && e.hurtTimerMs > 0,
        })),
      environment: {
        timeOfDay: this.time,
        darkness,
        weather: this.getWeather(),
        lights: [
          {
            x: this.player.x,
            y: this.player.y,
            radiusPx: 520 - (darkness / 0.8) * 290,
            color: 0xffdd99,
            intensity: 1,
          },
        ],
      },
    };
  }
}
