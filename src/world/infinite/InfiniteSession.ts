import { prepareInSlices } from '../../core/WorkSlice';
import { hydrateWindow, type MountedWindow } from './WindowPopulation';
import { translateEntity } from './EntityCoordinates';
export { translateEntity } from './EntityCoordinates';
import { applyWorldEdit, type WorldEdit } from './WorldEdits';
import { restoreWindowMoisture } from './ChunkMoisture';
import type { Entity, PlayerEntity } from '../../types/entities';
import type { EncounterSite, SimulationRuntime, EncounterState } from '../../types/encounters';
import type { WorldData, WorldProp, WorldGenOptions } from '../../types/world';
import { Tile } from '../../types/tiles';
import { ChunkSource } from './ChunkSource';
import { ForestGenerator } from './ForestGenerator';
import { addressKey, COORDINATE_LIMIT } from './coordinates';
import type { ChunkAddress } from './coordinates';
import type { ChunkDelta, InfiniteDescriptor, LegacyRegion } from './types';
import { WorldRepository } from '../../persistence/WorldRepository';
import type { SavedMoisture } from '../../systems/SurfaceMoisture';
import type { WorldCheckpoint } from '../../persistence/WorldRepository';

const EMPTY: ChunkDelta = { tiles: {}, removed: [], added: [], entities: [], activated: false };
export const newWorldId = () =>
  typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `world-${Date.now()}-${Math.random()}`;
export function infiniteDescriptor(options: WorldGenOptions): InfiniteDescriptor {
  return {
    id: newWorldId(),
    seed: options.seed >>> 0,
    generatorVersion: 13,
    biomeVersion: 1,
    chunkSize: 32,
    level: options.level,
    difficulty: options.difficulty,
  };
}
/** Authoritative chunks plus a bounded compatibility view for the existing swept physics. */
export class InfiniteSession {
  readonly source: ChunkSource;
  readonly generator: ForestGenerator;
  readonly deltas = new Map<string, ChunkDelta>();
  readonly objectives = new Set<string>();
  private readonly requiredIds = new Set<string>();
  revision = 0;
  lastCheckpoint: WorldCheckpoint | undefined;
  legacy: LegacyRegion | undefined;
  private travelOutside: { x: number; y: number } | undefined;
  private originX = 0;
  private originY = 0;
  private size = 192;
  private requestedSize = 192;
  private preparedSize = 192;
  private preparedCenter = { x: 0.5, y: 0.5 };
  private prepared: ChunkAddress[] = [];
  private desired: { x: number; y: number } | null = null;
  private saveTail: Promise<void> = Promise.resolve();
  error: string | null = null;
  transitions = 0;
  teleportVersion = 0;
  constructor(
    readonly descriptor: InfiniteDescriptor,
    readonly repository: WorldRepository,
    legacy?: LegacyRegion,
  ) {
    this.legacy = legacy;
    this.generator = new ForestGenerator(descriptor, 2048);
    if (legacy) {
      for (const e of legacy.entities)
        if (
          (e.kind === 'enemy' && e.enemyType !== 'ghost') ||
          (e.kind === 'pickup' && e.pickupType === 'coin' && e.requiredForCompletion !== false)
        )
          this.requiredIds.add(e.id);
      for (const s of legacy.world.encounterSites ?? [])
        if (s.kind === 'nest') this.requiredIds.add(`${s.id}:boss`);
    } else {
      this.generator.starting.enemies.forEach((_, i) => this.requiredIds.add(`start:enemy:${i}`));
      this.generator.starting.coins.forEach((_, i) => this.requiredIds.add(`start:coin:${i}`));
      this.requiredIds.add('start:nest:boss');
    }
    if (legacy?.travelLink) {
      search: for (let dy = 0; dy < 128; dy++)
        for (let dx = 16; dx < 144; dx++) {
          const x = legacy.world.meta.width + dx,
            y = Math.floor(legacy.world.spawn.y + dy - 64);
          if (
            [
              [0, 0],
              [1, 0],
              [-1, 0],
              [0, 1],
              [0, -1],
            ].every(([a = 0, b = 0]) => this.generator.tileAt(x + a, y + b) === Tile.GRASS)
          ) {
            this.travelOutside = { x: x + 0.5, y: y + 0.5 };
            break search;
          }
        }
      if (!this.travelOutside) throw new Error('Cannot prepare a safe forest travel link');
    }
    this.source = new ChunkSource(descriptor, {
      establish: (r) => repository.establish(descriptor.id, r),
    });
  }
  globalPosition(p: { x: number; y: number }) {
    return { x: p.x + this.originX, y: p.y + this.originY };
  }
  get origin() {
    return { x: this.originX, y: this.originY };
  }
  get windowSize() {
    return this.requestedSize;
  }
  setViewTiles(width: number, height: number): void {
    this.requestedSize = Math.min(
      512,
      Math.max(
        192,
        Math.ceil((Math.max(width, height) + 128) / this.descriptor.chunkSize) *
          this.descriptor.chunkSize,
      ),
    );
  }
  private addresses(x: number, y: number, size = this.size): ChunkAddress[] {
    const s = this.descriptor.chunkSize,
      result: ChunkAddress[] = [];
    for (let cy = y / s - 1; cy < (y + size) / s + 1; cy++)
      for (let cx = x / s - 1; cx < (x + size) / s + 1; cx++) result.push({ x: cx, y: cy });
    result.sort(
      (a, b) =>
        Math.hypot(a.x * s - x - size / 2, a.y * s - y - size / 2) -
        Math.hypot(b.x * s - x - size / 2, b.y * s - y - size / 2),
    );
    return result;
  }
  private target(x: number, y: number, size = this.requestedSize) {
    const s = this.descriptor.chunkSize;
    return {
      x: Math.floor(x / s) * s - Math.floor(size / s / 2) * s,
      y: Math.floor(y / s) * s - Math.floor(size / s / 2) * s,
    };
  }
  async prepareAt(x: number, y: number): Promise<void> {
    if (
      !Number.isFinite(x) ||
      !Number.isFinite(y) ||
      Math.abs(x) > COORDINATE_LIMIT - 1024 ||
      Math.abs(y) > COORDINATE_LIMIT - 1024
    )
      throw new RangeError('World coordinate exceeds the supported range');
    const size = this.requestedSize,
      t = this.target(x, y, size),
      addresses = this.addresses(t.x, t.y, size);
    await this.source.prepare(addresses);
    await Promise.all(
      addresses.map(async (a) => {
        const key = addressKey(a.x, a.y);
        if (!this.deltas.has(key)) {
          const delta = await this.repository.readChunk(this.descriptor.id, key, this.revision);
          const legacy = this.legacy;
          const s = this.descriptor.chunkSize,
            overlaps =
              legacy &&
              a.x * s < legacy.world.meta.width &&
              a.y * s < legacy.world.meta.height &&
              (a.x + 1) * s > 0 &&
              (a.y + 1) * s > 0;
          const ids = new Set(
            (legacy?.world.encounterSites ?? [])
              .filter((p) => this.keyAt(p.x, p.y) === key)
              .map((p) => p.id),
          );
          const wet = legacy?.runtime?.moisture;
          const wetness: number[] = [],
            puddles: number[] = [];
          if (overlaps && wet)
            for (let y = 0; y < s; y++)
              for (let x = 0; x < s; x++) {
                const i = (a.y * s + y) * legacy.world.meta.width + a.x * s + x;
                wetness.push(wet.wetness[i] ?? 0);
                puddles.push(wet.puddles[i] ?? 0);
              }
          const imported: ChunkDelta = overlaps
            ? {
                ...EMPTY,
                ...(wet ? { moisture: { wetness, puddles, atMs: legacy.elapsedMs ?? 0 } } : {}),
                activated: true,
                entities: legacy.entities.filter(
                  (e) => e.kind !== 'player' && e.kind !== 'portal' && this.keyAt(e.x, e.y) === key,
                ),
                encounters: {
                  version: 1,
                  bosses: (legacy.runtime?.encounters?.bosses ?? []).filter((b) =>
                    ids.has(b.siteId),
                  ),
                  groves: (legacy.runtime?.encounters?.groves ?? []).filter((g) =>
                    ids.has(g.siteId),
                  ),
                },
              }
            : EMPTY;
          this.deltas.set(key, delta ?? imported);
        }
      }),
    );
    this.prepared = addresses;
    this.preparedSize = size;
    this.preparedCenter = { x, y };
    this.desired = t;
  }
  travelTarget(player: PlayerEntity): { target: { x: number; y: number }; label: string } | null {
    if (!this.travelOutside || !this.legacy) return null;
    const p = this.globalPosition(player),
      home = { x: this.legacy.world.spawn.x + 0.5, y: this.legacy.world.spawn.y + 0.5 };
    if (Math.hypot(p.x - home.x, p.y - home.y) < 2)
      return { target: this.travelOutside, label: 'Enter the forest' };
    if (Math.hypot(p.x - this.travelOutside.x, p.y - this.travelOutside.y) < 2)
      return { target: home, label: 'Return to the old forest' };
    return null;
  }
  private keyAt(x: number, y: number) {
    const s = this.descriptor.chunkSize;
    return addressKey(Math.floor(x / s), Math.floor(y / s));
  }
  private deltaAt(x: number, y: number) {
    return this.deltas.get(this.keyAt(x, y)) ?? EMPTY;
  }
  private legacyTile(x: number, y: number): number | undefined {
    const r = this.legacy;
    if (!r || x < 0 || y < 0 || x >= r.world.meta.width || y >= r.world.meta.height)
      return undefined;
    if (r.exits.some((e) => e.x === x && e.y === y)) return Tile.GRASS;
    return r.world.tiles[y * r.world.meta.width + x];
  }
  tileAt(x: number, y: number): number {
    const s = this.descriptor.chunkSize,
      key = String((y - Math.floor(y / s) * s) * s + x - Math.floor(x / s) * s);
    return (
      this.deltaAt(x, y).tiles[key] ??
      this.legacyTile(x, y) ??
      this.source.tileAt(x, y) ??
      Tile.BORDER
    );
  }
  private props(origin = this.origin): WorldProp[] {
    const result: WorldProp[] = [];
    for (const a of this.prepared) {
      const key = addressKey(a.x, a.y),
        chunk = this.source.chunks.get(key),
        delta = this.deltas.get(key) ?? EMPTY;
      if (!chunk) continue;
      const base = [
        ...chunk.props.filter((p) => this.legacyTile(p.tileX, p.tileY) === undefined),
        ...(this.legacy?.world.props
          .filter((p) => this.keyAt(p.tileX, p.tileY) === key)
          .map((p) => ({
            ...p,
            sourceGeneratorVersion: this.legacy?.world.meta.generatorVersion ?? 0,
          })) ?? []),
      ];
      for (const p of [
        ...base.filter((p) => !delta.removed.includes(String(p.id))),
        ...delta.added,
      ]) {
        if (
          this.travelOutside &&
          this.legacyTile(p.tileX, p.tileY) === undefined &&
          Math.hypot(p.tileX - this.travelOutside.x, p.tileY - this.travelOutside.y) < 4
        )
          continue;
        result.push({ ...p, tileX: p.tileX - origin.x, tileY: p.tileY - origin.y });
      }
    }
    const legacyOrder = new Map((this.legacy?.world.props ?? []).map((p, i) => [String(p.id), i]));
    return result.sort((a, b) => {
      const first = legacyOrder.get(String(a.id)),
        second = legacyOrder.get(String(b.id));
      if (first !== undefined && second !== undefined) return first - second;
      if (first !== undefined) return -1;
      if (second !== undefined) return 1;
      return (
        a.tileY - b.tileY ||
        a.tileX - b.tileX ||
        (String(a.id) < String(b.id) ? -1 : String(a.id) > String(b.id) ? 1 : 0)
      );
    });
  }
  private sites(origin = this.origin, size = this.size): EncounterSite[] {
    const s = this.generator.starting,
      sites: EncounterSite[] = this.legacy
        ? [...(this.legacy.world.encounterSites ?? [])]
        : [{ id: 'start:nest', kind: 'nest', ...s.nest }];
    const cell = 96;
    for (
      let y = Math.floor(origin.y / cell);
      y <= Math.floor((origin.y + size) / cell);
      y++
    )
      for (
        let x = Math.floor(origin.x / cell);
        x <= Math.floor((origin.x + size) / cell);
        x++
      ) {
        const px = x * cell + 48,
          py = y * cell + 48;
        if (this.generator.hasGrove(x, y) && this.legacyTile(px, py) === undefined)
          sites.push({ id: `grove:${x},${y}`, kind: 'grove', x: px, y: py });
      }
    return sites
      .filter(
        (p) =>
          p.x >= origin.x + 12 &&
          p.y >= origin.y + 12 &&
          p.x < origin.x + size - 12 &&
          p.y < origin.y + size - 12,
      )
      .map((p) => ({ ...p, x: p.x - origin.x, y: p.y - origin.y }));
  }
  buildWindow(): WorldData {
    if (!this.desired) throw new Error('World has not been prepared');
    const work = this.windowWork(this.desired, this.preparedSize);
    let result = work.next();
    while (!result.done) result = work.next();
    this.commitWindow(result.value);
    return result.value;
  }
  async stageWindow(current: WorldData, valid: () => boolean): Promise<WorldData> {
    if (!this.desired) throw new Error('World has not been prepared');
    const work = this.windowWork({...this.desired}, this.preparedSize, current);
    let world: WorldData | undefined;
    function* collect(): Generator<void> {
      for (;;) {
        const next = work.next();
        if (next.done) { world = next.value; return; }
        yield;
      }
    }
    await prepareInSlices(collect(), valid);
    if (!world) throw new Error('Missing staged world');
    return world;
  }
  commitWindow(world: WorldData): void {
    if (!world.window) throw new Error('Missing staged origin');
    this.originX = world.window.originX;
    this.originY = world.window.originY;
    this.size = world.meta.width;
  }
  private *windowWork(origin: {x:number;y:number}, size: number, current?: WorldData): Generator<void, WorldData> {
    const tiles = new Uint8Array(size * size), chunkSize = this.descriptor.chunkSize;
    const old = current?.window;
    for (let y=0; y<size; y+=chunkSize) for(let x=0;x<size;x+=chunkSize) {
      const gx=origin.x+x, gy=origin.y+y;
      if (current && old && gx>=old.originX && gy>=old.originY && gx+chunkSize<=old.originX+current.meta.width && gy+chunkSize<=old.originY+current.meta.height) {
        for(let row=0;row<chunkSize;row++) {
          const i=(gy-old.originY+row)*current.meta.width+gx-old.originX;
          tiles.set(current.tiles.subarray(i,i+chunkSize),(y+row)*size+x);
        }
      } else {
        const chunk=this.source.chunks.get(addressKey(gx/chunkSize,gy/chunkSize));
        if (!chunk) throw new Error('Baseline chunk not ready');
        for(let row=0;row<chunkSize;row++) tiles.set(chunk.tiles.subarray(row*chunkSize,(row+1)*chunkSize),(y+row)*size+x);
        for(const [key,value] of Object.entries(this.deltaAt(gx,gy).tiles)) {
          const i=Number(key); tiles[(y+Math.floor(i/chunkSize))*size+x+i%chunkSize]=value;
        }
        if(this.legacy) for(let row=0;row<chunkSize;row++) for(let col=0;col<chunkSize;col++) {
          const tile=this.legacyTile(gx+col,gy+row);
          if(tile!==undefined) tiles[(y+row)*size+x+col]=this.deltaAt(gx+col,gy+row).tiles[String(row*chunkSize+col)]??tile;
        }
      }
      yield;
    }
    const legacy = this.legacy?.world,
      portal = legacy?.portal ?? this.generator.starting.portal;
    const bridges = [...this.source.chunks.values()]
      .flatMap((c) => c.bridges)
      .filter((b) => this.legacyTile(b.x, b.y) === undefined)
      .concat(legacy?.bridges ?? [])
      .sort((a, b) => (String(a.id) < String(b.id) ? -1 : String(a.id) > String(b.id) ? 1 : 0))
      .map((b) => ({ ...b, x: b.x - origin.x, y: b.y - origin.y }));
    const pickups =
      legacy?.pickupSpawns ??
      this.generator.starting.coins.map((p, i) => ({
        ...p,
        id: `start:coin:${i}`,
        type: 'coin' as const,
      }));
    const enemies =
      legacy?.enemySpawns ??
      this.generator.starting.enemies.map((p, i) => ({
        ...p,
        id: `start:enemy:${i}`,
        type: i % 2 ? ('maggot' as const) : ('mantis' as const),
      }));
    const inside = (p: { x: number; y: number }) =>
      p.x >= origin.x + 4 &&
      p.y >= origin.y + 4 &&
      p.x < origin.x + size - 4 &&
      p.y < origin.y + size - 4;
    const local = (p: { x: number; y: number }) => ({
      ...p,
      x: p.x - origin.x,
      y: p.y - origin.y,
    });
    return {
      window: {
        originX: origin.x,
        originY: origin.y,
        descriptor: this.descriptor,
        discovered: this.discovery(origin, size),
        discoveryVersion: 0,
        teleportVersion: this.teleportVersion,
      },
      meta: {
        seed: this.descriptor.seed,
        generatorVersion: 13,
        hilltopObjectsVersion: 1,
        width: size,
        height: size,
        isTutorial: false,
        level: this.descriptor.level,
        difficulty: this.descriptor.difficulty,
      },
      tiles,
      props: this.props(origin),
      bridges,
      spawn: {
        x: Math.floor(this.preparedCenter.x) - origin.x,
        y: Math.floor(this.preparedCenter.y) - origin.y,
      },
      portal: local(portal),
      enemySpawns: enemies.filter(inside).map((p) => ({ ...p, ...local(p) })),
      pickupSpawns: pickups.filter(inside).map((p) => ({ ...p, ...local(p) })),
      encounterSites: this.sites(origin, size),
    };
  }
  private discovery(origin = this.origin, size = this.size): Uint8Array {
    const out=new Uint8Array(size*size), s=this.descriptor.chunkSize;
    for(let y=0;y<size;y+=s)for(let x=0;x<size;x+=s) {
      const gx=origin.x+x,gy=origin.y+y,bits=this.deltaAt(gx,gy).discovered;
      if(!bits && !this.legacy)continue;
      for(let row=0;row<s;row++)for(let col=0;col<s;col++) {
        const i=row*s+col;
        if(this.legacyTile(gx+col,gy+row)!==undefined || ((bits?.[Math.floor(i/8)]??0)&(1<<(i%8))))
          out[(y+row)*size+x+col]=1;
      }
    }
    return out;
  }
  reveal(world: WorldData, player: PlayerEntity): void {
    const window = world.window;
    if (!window) return;
    const s = this.descriptor.chunkSize,
      changed = new Map<string, number[]>();
    for (
      let y = Math.max(0, Math.floor(player.y - 28));
      y < Math.min(world.meta.height, player.y + 28);
      y++
    )
      for (
        let x = Math.max(0, Math.floor(player.x - 28));
        x < Math.min(world.meta.width, player.x + 28);
        x++
      ) {
        if (
          Math.hypot(x - player.x, y - player.y) > 28 ||
          window.discovered[y * world.meta.width + x]
        )
          continue;
        window.discovered[y * world.meta.width + x] = 1;
        window.discoveryVersion++;
        const gx = x + window.originX,
          gy = y + window.originY,
          key = this.keyAt(gx, gy),
          i = (gy - Math.floor(gy / s) * s) * s + gx - Math.floor(gx / s) * s;
        const bits =
          changed.get(key) ??
          Array.from(this.deltas.get(key)?.discovered ?? new Uint8Array((s * s) / 8));
        bits[Math.floor(i / 8)] = (bits[Math.floor(i / 8)] ?? 0) | (1 << (i % 8));
        changed.set(key, bits);
      }
    for (const [key, bits] of changed)
      this.deltas.set(key, { ...(this.deltas.get(key) ?? EMPTY), discovered: bits });
  }
  restoreMoisture(world: WorldData, elapsedMs: number): SavedMoisture {
    return restoreWindowMoisture(
      world,
      elapsedMs,
      this.descriptor.seed,
      this.descriptor.chunkSize,
      this.origin,
      (x, y) => this.deltaAt(x, y),
    );
  }
  capture(
    world: WorldData,
    entities: readonly Entity[],
    runtime: SimulationRuntime,
    elapsedMs = 0,
  ): void {
    const s = this.descriptor.chunkSize,
      offset = world.window;
    if (!offset) return;
    const props = new Set(world.props.map((p) => String(p.id)));
    for (const a of this.addresses(offset.originX, offset.originY, world.meta.width)) {
      const key = addressKey(a.x, a.y),
        chunk = this.source.chunks.get(key);
      if (!chunk) continue;
      const prior = this.deltas.get(key) ?? EMPTY,
        tiles = { ...prior.tiles };
      for (let ly = 0; ly < s; ly++)
        for (let lx = 0; lx < s; lx++) {
          const gx = a.x * s + lx,
            gy = a.y * s + ly,
            x = gx - offset.originX,
            y = gy - offset.originY;
          if (x < 0 || y < 0 || x >= world.meta.width || y >= world.meta.height) continue;
          const value = world.tiles[y * world.meta.width + x] ?? Tile.GRASS,
            base = this.legacyTile(gx, gy) ?? chunk.tiles[ly * s + lx];
          if (value !== base) tiles[String(ly * s + lx)] = value;
          else delete tiles[String(ly * s + lx)];
        }
      const removed = new Set(prior.removed);
      const baseProps = [
        ...chunk.props.filter((p) => this.legacyTile(p.tileX, p.tileY) === undefined),
        ...(this.legacy?.world.props
          .filter((p) => this.keyAt(p.tileX, p.tileY) === key)
          .map((p) => ({
            ...p,
            sourceGeneratorVersion: this.legacy?.world.meta.generatorVersion ?? 0,
          })) ?? []),
      ];
      for (const p of baseProps)
        if (
          p.tileX >= offset.originX &&
          p.tileY >= offset.originY &&
          p.tileX < offset.originX + world.meta.width &&
          p.tileY < offset.originY + world.meta.height &&
          !props.has(String(p.id))
        )
          removed.add(String(p.id));
      const activeSites = new Set((world.encounterSites ?? []).map((s) => s.id));
      const owner = (e: Entity) => {
        const site =
          e.kind === 'enemy' && e.encounterId
            ? (world.encounterSites ?? []).find((s) => s.id === e.encounterId)
            : undefined;
        return site
          ? this.keyAt(site.x + offset.originX, site.y + offset.originY)
          : this.keyAt(e.x + offset.originX, e.y + offset.originY);
      };
      const actorRecords = [
        ...entities
          .filter(
            (e) =>
              e.kind !== 'player' &&
              e.kind !== 'portal' &&
              e.kind !== 'projectile' &&
              owner(e) === key,
          )
          .map((e) => translateEntity(e, offset.originX, offset.originY)),
        ...prior.entities.filter(
          (e) => e.kind === 'enemy' && e.encounterId && !activeSites.has(e.encounterId),
        ),
      ];
      const sites = new Set(
        (world.encounterSites ?? [])
          .filter((p) => this.keyAt(p.x + offset.originX, p.y + offset.originY) === key)
          .map((p) => p.id),
      );
      const encounters: EncounterState = {
        version: 1,
        bosses: [
          ...(runtime.encounters?.bosses ?? []).filter((b) => sites.has(b.siteId)).map(b => structuredClone(b)),
          ...(prior.encounters?.bosses ?? []).filter((b) => !activeSites.has(b.siteId)),
        ],
        groves: (runtime.encounters?.groves ?? [])
          .filter((g) => sites.has(g.siteId))
          .map((g) => ({
            ...g,
            members: g.members.map((m) => ({
              ...m,
              x: m.x + offset.originX,
              y: m.y + offset.originY,
            })),
          }))
          .concat((prior.encounters?.groves ?? []).filter((g) => !activeSites.has(g.siteId))),
      };
      // The halo is preparation only: do not mark it activated or erase suspended actors.
      const active =
        a.x * s >= offset.originX &&
        a.y * s >= offset.originY &&
        a.x * s < offset.originX + world.meta.width &&
        a.y * s < offset.originY + world.meta.height;
      if (active) {
        const wetness: number[] = [],
          puddles: number[] = [];
        for (let y = 0; y < s; y++)
          for (let x = 0; x < s; x++) {
            const i =
              (a.y * s + y - offset.originY) * world.meta.width + a.x * s + x - offset.originX;
            wetness.push(runtime.moisture?.wetness[i] ?? 0);
            puddles.push(runtime.moisture?.puddles[i] ?? 0);
          }
        this.deltas.set(key, {
          ...prior,
          tiles,
          removed: [...removed],
          added: prior.added.filter(
            (p) =>
              p.tileX < offset.originX ||
              p.tileY < offset.originY ||
              p.tileX >= offset.originX + world.meta.width ||
              p.tileY >= offset.originY + world.meta.height ||
              props.has(String(p.id)),
          ),
          entities: actorRecords,
          activated: true,
          encounters,
          moisture: {
            wetness: wetness.some((v) => v !== 0) ? wetness : [],
            puddles: puddles.some((v) => v !== 0) ? puddles : [],
            atMs: elapsedMs,
          },
        });
      }
    }
    this.recordDeaths(entities, runtime);
  }
  snapshot(
    entities: readonly Entity[],
    runtime: SimulationRuntime,
    time: number,
    elapsedMs: number,
  ): WorldCheckpoint {
    return {
      version: 3,
      descriptor: this.descriptor,
      revision: this.revision,
      entities: entities
        .filter(
          (e) => e.kind === 'player' || e.kind === 'portal' || (e.kind === 'projectile' && e.alive),
        )
        .map((e) => translateEntity(e, this.originX, this.originY)),
      runtime: {
        rngState: runtime.rngState,
        entitySequence: runtime.entitySequence ?? 0,
        lootSequence: runtime.lootSequence ?? 0,
        ...(runtime.movement
          ? {
              movement: {
                ...(runtime.movement.dash ? { dash: runtime.movement.dash } : {}),
                ...(runtime.movement.landing
                  ? {
                      landing: {
                        x: runtime.movement.landing.x + this.originX,
                        y: runtime.movement.landing.y + this.originY,
                      },
                    }
                  : {}),
              },
            }
          : {}),
      },
      time,
      elapsedMs,
      objectives: [...this.objectives],
      ...(this.legacy ? { legacy: this.legacy } : {}),
    };
  }
  checkpoint(
    entities: readonly Entity[],
    runtime: SimulationRuntime,
    time: number,
    elapsedMs: number,
    slot?: string,
  ): Promise<void> {
    const state = this.snapshot(entities, runtime, time, elapsedMs);
    this.revision++;
    const committed = { ...state, revision: this.revision };
    const changes = new Map(this.deltas);
    this.saveTail = this.saveTail
      .catch(() => {})
      .then(() =>
        this.repository.checkpoint(committed, changes, slot).then(() => {
          this.lastCheckpoint = committed;
        }),
      );
    return this.saveTail;
  }
  hydrate(
    world: WorldData,
    player: PlayerEntity,
    portal: Entity | undefined,
    runtime: SimulationRuntime,
  ): MountedWindow {
    return hydrateWindow(world, player, portal, runtime, {
      descriptor: this.descriptor,
      prepared: this.prepared,
      origin: this.origin,
      deltas: this.deltas,
      generator: this.generator,
      keyAt: (x, y) => this.keyAt(x, y),
      legacyTile: (x, y) => this.legacyTile(x, y),
    });
  }
  edit(world: WorldData, edit: WorldEdit): void {
    applyWorldEdit(world, this.deltas, edit);
  }
  recordDeaths(entities: readonly Entity[], runtime?: SimulationRuntime): void {
    for (const e of entities) if (!e.alive && this.requiredIds.has(e.id)) this.objectives.add(e.id);
    for (const b of runtime?.encounters?.bosses ?? [])
      if (b.phase === 'defeated' && this.requiredIds.has(`${b.siteId}:boss`))
        this.objectives.add(`${b.siteId}:boss`);
  }
  objectiveStatus() {
    if (this.legacy) {
      const complete = this.legacy.entities.some(
        (e) => e.kind === 'portal' && (e.roundComplete || e.active),
      );
      const enemies =
        this.legacy.entities.filter(
          (e) =>
            e.alive && e.kind === 'enemy' && e.enemyType !== 'ghost' && !this.objectives.has(e.id),
        ).length +
        (this.legacy.runtime?.encounters?.bosses ?? []).filter(
          (b) =>
            b.phase !== 'defeated' &&
            !this.objectives.has(`${b.siteId}:boss`) &&
            !this.legacy?.entities.some((e) => e.id === `${b.siteId}:boss`),
        ).length;
      const coins = this.legacy.entities.filter(
        (e) =>
          e.alive &&
          e.kind === 'pickup' &&
          e.pickupType === 'coin' &&
          e.requiredForCompletion !== false &&
          !this.objectives.has(e.id),
      ).length;
      return {
        complete: complete || (enemies === 0 && coins === 0),
        enemiesRemaining: complete ? 0 : enemies,
        coinsRemaining: complete ? 0 : coins,
      };
    }
    const enemies =
        this.generator.starting.enemies.filter((_, i) => !this.objectives.has(`start:enemy:${i}`))
          .length + (this.objectives.has('start:nest:boss') ? 0 : 1),
      coins = this.generator.starting.coins.filter(
        (_, i) => !this.objectives.has(`start:coin:${i}`),
      ).length;
    return {
      complete: enemies === 0 && coins === 0,
      enemiesRemaining: enemies,
      coinsRemaining: coins,
    };
  }
  needsShift(player: PlayerEntity): boolean {
    return (
      player.x < 64 || player.y < 64 || player.x >= this.size - 64 || player.y >= this.size - 64
    );
  }
  prune(countTransition = true): void {
    const keep = new Set([...this.prepared, ...this.addresses(this.originX, this.originY, this.size)].map((a) => addressKey(a.x, a.y)));
    this.source.evict(keep);
    for (const key of this.deltas.keys()) if (!keep.has(key)) this.deltas.delete(key);
    if (countTransition) this.transitions++;
  }
  dispose(): void {
    this.source.dispose();
    this.deltas.clear();
    this.repository.close();
  }
}

const sessions = new WeakMap<WorldData, InfiniteSession>();
export function bindSession(world: WorldData, session: InfiniteSession): WorldData {
  sessions.set(world, session);
  return world;
}
export function sessionFor(world: WorldData): InfiniteSession | undefined {
  return sessions.get(world);
}
