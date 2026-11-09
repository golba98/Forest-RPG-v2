import { CancelledWork } from '../../core/WorkSlice';
import { WorldRepository, type WorldCheckpoint } from '../../persistence/WorldRepository';
import { preparePropIndex } from '../../systems/CollisionSystem';
import { rebaseMovementRuntime } from '../../systems/MovementSystem';
import { restoreSafePosition } from '../../systems/SpawnSafety';
import { SurfaceSites, type SurfaceMoisture } from '../../systems/SurfaceMoisture';
import type { SimulationRuntime } from '../../types/encounters';
import type { Entity, PlayerEntity } from '../../types/entities';
import type { WorldData, WorldGenOptions } from '../../types/world';
import type { BiomeId } from '../../world/Biomes';
import { findBiomeLanding } from '../../world/infinite/BiomeLanding';
import {
  InfiniteSession,
  bindSession,
  infiniteDescriptor,
  sessionFor,
  translateEntity,
} from '../../world/infinite/InfiniteSession';
import { copyWindowOverlap } from '../../world/infinite/WindowOverlap';

interface StreamingHost {
  readonly world: WorldData;
  readonly player: PlayerEntity;
  readonly moisture: SurfaceMoisture;
  readonly elapsedMs: number;
  readonly viewDimensions: (() => { width: number; height: number }) | undefined;
  readonly preparePresentation: ((world: WorldData) => Promise<void>) | undefined;
  getEntities(): readonly Entity[];
  getTimeOfDay(): number;
  getRuntimeState(): SimulationRuntime;
  setPlayerPosition(x: number, y: number): void;
}
type InstallWindow = (
  world: WorldData,
  player: PlayerEntity,
  portal: Entity | undefined,
  runtime: SimulationRuntime,
  transient?: readonly Entity[],
  previousMoisture?: SurfaceMoisture,
  live?: readonly Entity[],
) => void;

/** Owns asynchronous session preparation and publication guards, never simulation state. */
export class StreamingCoordinator {
  session: InfiniteSession | undefined;
  private preparingSession: InfiniteSession | undefined;
  private preparingStream = false;
  private installingStream = false;
  private epoch = 0;
  private transitionSave: Promise<void> | undefined;
  constructor(
    private readonly host: StreamingHost,
    private readonly installWindow: InstallWindow,
  ) {}
  setWorld(world: WorldData): InfiniteSession | undefined {
    this.epoch++;
    this.preparingStream = false;
    this.installingStream = false;
    const session = sessionFor(world);
    if (world.window && !session)
      throw new Error('Streamed views must be loaded through their session');
    if (this.preparingSession && this.preparingSession !== session) {
      this.preparingSession.dispose();
      this.preparingSession = undefined;
    }
    if (this.session && this.session !== session) this.session.dispose();
    this.session = session;
    return session;
  }
  async travelToBiome(biome: BiomeId): Promise<void> {
    const stream = this.session;
    if (!stream?.exploration) throw new Error('Biome travel is available in Biome Walk');
    while (this.preparingStream) await new Promise<void>((resolve) => setTimeout(resolve, 1));
    stream.capture(
      this.host.world,
      this.host.getEntities(),
      this.host.getRuntimeState(),
      this.host.elapsedMs,
    );
    const landing = await findBiomeLanding(stream, biome, this.host.world);
    await this.setGlobalPosition(landing.position.x, landing.position.y);
    await this.saveInfinite('auto');
  }
  destroy(): void {
    this.epoch++;
    this.preparingStream = false;
    this.installingStream = false;
    this.session?.dispose();
    this.preparingSession?.dispose();
  }
  async prepareInfinite(options: WorldGenOptions, state?: WorldCheckpoint): Promise<WorldData> {
    if (
      options.generatorVersion !== undefined &&
      ![13, 14, 15, 16].includes(options.generatorVersion)
    )
      throw new Error('Unsupported streamed generation request');
    this.preparingSession?.dispose();
    const session = new InfiniteSession(
      state?.descriptor ?? infiniteDescriptor(options),
      new WorldRepository(),
      state?.legacy,
    );
    const view = this.host.viewDimensions?.();
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
        await this.host.preparePresentation?.(landing.world);
        this.preparingSession = undefined;
        return bindSession(landing.world, session);
      }
      await session.prepareAt(p.x, p.y);
      if (this.preparingSession !== session) throw new Error('World preparation cancelled');
      this.preparingSession = undefined;
      const world = session.buildWindow();
      await this.host.preparePresentation?.(world);
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
      this.session &&
      this.host.player &&
      (this.host.player.x < 16 ||
        this.host.player.y < 16 ||
        this.host.player.x > this.host.world.meta.width - 16 ||
        this.host.player.y > this.host.world.meta.height - 16);
    if (edge && this.session?.error) return 'stream-error-edge';
    if (edge && this.transitionSave) return 'persistence-edge';
    if (edge && this.preparingStream) return 'preparation-edge';
    return null;
  }
  async saveInfinite(slot?: string): Promise<void> {
    while (this.installingStream) await new Promise<void>((resolve) => setTimeout(resolve, 1));
    const stream = this.session;
    if (!stream) return;
    const recovering = !!stream.error;
    const runtime = this.host.getRuntimeState();
    stream.capture(this.host.world, this.host.getEntities(), runtime, this.host.elapsedMs);
    await stream.checkpoint(
      this.host.getEntities(),
      runtime,
      this.host.getTimeOfDay(),
      this.host.elapsedMs,
      slot,
    );
    stream.error = null;
    if (recovering) stream.prune(false);
  }
  getStreamingDebug() {
    return this.session
      ? {
          ...this.session.source.info,
          worldId: this.session.descriptor.id,
          generatorVersion: this.session.descriptor.generatorVersion,
          mode: this.session.descriptor.mode ?? 'adventure',
          biome:
            this.session.generator.geography?.sample(
              Math.floor(this.host.player.x + this.session.origin.x),
              Math.floor(this.host.player.y + this.session.origin.y),
            ).biome ?? 0,
          origin: this.session.origin,
          globalPosition: this.session.globalPosition(this.host.player),
          transitions: this.session.transitions,
          error: this.session.error,
          preparing: this.preparingStream,
        }
      : null;
  }
  async ensureView(width: number, height: number): Promise<void> {
    const stream = this.session;
    if (!stream) return;
    stream.setViewTiles(width, height);
    while (this.session === stream && this.host.world.meta.width !== stream.windowSize) {
      await this.transitionSave;
      await this.advance();
      if (stream.error) throw new Error(stream.error);
      if (this.preparingStream) await new Promise<void>((resolve) => setTimeout(resolve, 1));
    }
  }
  async setGlobalPosition(x: number, y: number): Promise<void> {
    await this.transitionSave;
    const stream = this.session;
    if (!stream) {
      this.host.setPlayerPosition(x, y);
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
      lx < this.host.world.meta.width - 32 &&
      ly < this.host.world.meta.height - 32 &&
      !this.installingStream
    ) {
      if (Math.hypot(this.host.player.x - lx, this.host.player.y - ly) > 4) {
        stream.teleportVersion++;
        if (this.host.world.window) this.host.world.window.teleportVersion = stream.teleportVersion;
      }
      this.host.player.x = this.host.player.prevX = lx;
      this.host.player.y = this.host.player.prevY = ly;
      void this.advance();
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
      const runtime = this.host.getRuntimeState(),
        old = stream.origin;
      stream.capture(this.host.world, this.host.getEntities(), runtime, this.host.elapsedMs);
      await stream.checkpoint(
        this.host.getEntities(),
        runtime,
        this.host.getTimeOfDay(),
        this.host.elapsedMs,
        'auto',
      );
      stream.teleportVersion++;
      // Keep the active origin and scene intact if decoding an entering biome
      // fails. Only publish after both terrain and its artwork are ready.
      let world: WorldData;
      try {
        world = await stream.stageWindow(this.host.world, () => this.session === stream);
        await this.host.preparePresentation?.(world);
        if (this.session !== stream) throw new CancelledWork();
      } catch (error) {
        if (this.session === stream) stream.prune(false);
        throw error;
      }
      stream.commitWindow(world);
      const next = stream.origin;
      const player = translateEntity(this.host.player, old.x - next.x, old.y - next.y);
      player.x = player.prevX = x - next.x;
      player.y = player.prevY = y - next.y;
      const portal = this.host.getEntities().find((e) => e.kind === 'portal');
      this.installWindow(
        world,
        player,
        portal ? translateEntity(portal, old.x - next.x, old.y - next.y) : undefined,
        runtime,
        this.host
          .getEntities()
          .filter((e) => e.kind === 'projectile')
          .map((e) => translateEntity(e, old.x - next.x, old.y - next.y)),
      );
      restoreSafePosition(world, this.host.player);
      stream.error = null;
      stream.prune();
    } finally {
      this.preparingStream = false;
      this.installingStream = false;
    }
  }
  async advance(): Promise<void> {
    const stream = this.session,
      epoch = this.epoch;
    if (
      !stream ||
      this.preparingStream ||
      this.transitionSave ||
      stream.error ||
      (!stream.needsShift(this.host.player) && this.host.world.meta.width === stream.windowSize)
    )
      return;
    this.preparingStream = true;
    try {
      const p = stream.globalPosition(this.host.player);
      await stream.prepareAt(p.x, p.y);
      let world: WorldData;
      for (;;) {
        const active = this.host.world,
          count = active.props.length,
          teleportVersion = stream.teleportVersion;
        if (this.session !== stream || epoch !== this.epoch) throw new CancelledWork();
        // Capture current geometry before preparing metadata; actors/moisture are
        // captured again at publication, not frozen while asynchronous work runs.
        stream.capture(
          active,
          this.host.getEntities(),
          this.host.getRuntimeState(),
          this.host.elapsedMs,
        );
        const valid = () =>
          this.session === stream &&
          epoch === this.epoch &&
          this.host.world === active &&
          active.props.length === count &&
          stream.teleportVersion === teleportVersion &&
          stream.windowSize === worldSize;
        const worldSize = stream.windowSize;
        try {
          world = await stream.stageWindow(active, valid);
          await SurfaceSites.prepare(world, valid);
          await preparePropIndex(world, valid);
          await this.host.preparePresentation?.(world);
          if (!valid()) throw new CancelledWork();
          break;
        } catch (error) {
          if (!(error instanceof CancelledWork) || this.session !== stream || epoch !== this.epoch)
            throw error;
          const at = stream.globalPosition(this.host.player);
          await stream.prepareAt(at.x, at.y);
        }
      }
      // One synchronous publication between simulation calls. No storage await
      // occurs inside the installation guard.
      this.installingStream = true;
      const runtime = this.host.getRuntimeState(),
        previous = this.host.world,
        live = this.host.getEntities(),
        moisture = this.host.moisture;
      stream.capture(previous, live, runtime, this.host.elapsedMs);
      const durable = stream.checkpoint(
        live,
        runtime,
        this.host.getTimeOfDay(),
        this.host.elapsedMs,
        'auto',
      );
      copyWindowOverlap(world, previous);
      const old = stream.origin;
      stream.commitWindow(world);
      const next = stream.origin,
        dx = old.x - next.x,
        dy = old.y - next.y;
      const player = this.host.player;
      player.x += dx;
      player.prevX += dx;
      player.y += dy;
      player.prevY += dy;
      rebaseMovementRuntime(player, dx, dy);
      const portal = live.find((e) => e.kind === 'portal');
      this.installWindow(
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
          if (this.session === stream) {
            stream.prune(false);
            stream.error = null;
          }
        })
        .catch((error: unknown) => {
          if (this.session === stream)
            stream.error = error instanceof Error ? error.message : String(error);
        })
        .finally(() => {
          if (this.transitionSave === saving) this.transitionSave = undefined;
        });
      this.transitionSave = saving;
    } catch (error) {
      if (!(error instanceof CancelledWork) && this.session === stream && epoch === this.epoch)
        stream.error = error instanceof Error ? error.message : String(error);
    } finally {
      if (epoch === this.epoch) {
        this.preparingStream = false;
        this.installingStream = false;
      }
    }
  }
}
