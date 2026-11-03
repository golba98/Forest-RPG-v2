import { BiomeGeography } from './BiomeGeography';
import { BIOME_IDS } from '../Biomes';
import { PERF_BUILD, collector, profileEvent } from '../../performance/FrameProfiler';
import type { ChunkAddress } from './coordinates';
import { addressKey, splitCoordinate, REGION_SIZE } from './coordinates';
import { ForestGenerator } from './ForestGenerator';
import { biomes } from './biomes';
import type { GeneratedChunk, InfiniteDescriptor, RegionIdentity, WorldSource } from './types';

export interface ChunkBackend {
  establish(region: RegionIdentity): Promise<void>;
}
/** Only authoritative baseline chunks live here. Modified state belongs to the repository/session. */
export class ChunkSource implements WorldSource {
  private climate: BiomeGeography | undefined;
  readonly chunks = new Map<string, GeneratedChunk>();
  private readonly pending = new Map<string, Promise<void>>();
  private worker: Worker | undefined;
  private generator: ForestGenerator | undefined;
  private serial: Promise<void> = Promise.resolve();
  private sequence = 0;
  private disposed = false;
  private waiters = new Map<
    number,
    { resolve(chunk: GeneratedChunk): void; reject(error: Error): void }
  >();
  private readonly touched = new Map<string, number>();
  evictions = 0;
  generated = 0;
  maxGenerationMs = 0;
  private readonly generationTimes: number[] = [];
  constructor(
    readonly descriptor: InfiniteDescriptor,
    private readonly backend?: ChunkBackend,
    useWorker = true,
  ) {
    this.climate =
      descriptor.generatorVersion >= 14
        ? new BiomeGeography(descriptor.seed, descriptor.generatorVersion === 14 ? 14 : 15)
        : undefined;
    if (useWorker && typeof Worker !== 'undefined') {
      try {
        this.worker = new Worker(new URL('./generation.worker.ts', import.meta.url), {
          type: 'module',
        });
      } catch {
        return;
      }
      this.worker.onmessage = (
        event: MessageEvent<{
          id: number;
          chunk?: GeneratedChunk;
          error?: string;
          metrics?: {
            posted: number;
            dispatched?: number;
            received: number;
            constructed: number;
            finished: number;
            executeMs: number;
            constructMs: number;
            address: ChunkAddress;
            bytes: number;
            props: number;
          };
        }>,
      ) => {
        if (PERF_BUILD && event.data.metrics) {
          const m = event.data.metrics,
            received = performance.now();
          profileEvent('worker.chunk', received, m.executeMs, {
            ...m,
            id: event.data.id,
            world: this.descriptor.id,
            mainReceived: performance.timeOrigin + received,
            deliveryMs: performance.timeOrigin + received - m.posted,
            ...(m.dispatched === undefined
              ? {}
              : {
                  roundTripMs: performance.timeOrigin + received - m.dispatched,
                  communicationOverheadMs:
                    performance.timeOrigin + received - m.dispatched - m.executeMs - m.constructMs,
                }),
          });
        }
        const waiter = this.waiters.get(event.data.id);
        this.waiters.delete(event.data.id);
        if (event.data.chunk) waiter?.resolve(event.data.chunk);
        else waiter?.reject(new Error(event.data.error ?? 'Generation failed'));
      };
      this.worker.onerror = () => {
        for (const waiter of this.waiters.values())
          waiter.reject(new Error('Generation worker failed'));
        this.waiters.clear();
        this.worker?.terminate();
        this.worker = undefined;
      };
    }
  }
  tileAt(x: number, y: number): number | undefined {
    const sx = splitCoordinate(x, this.descriptor.chunkSize),
      sy = splitCoordinate(y, this.descriptor.chunkSize);
    return this.chunks.get(addressKey(sx.chunk, sy.chunk))?.tiles[
      sy.local * this.descriptor.chunkSize + sx.local
    ];
  }
  private async generate(address: ChunkAddress): Promise<GeneratedChunk> {
    if (this.worker) {
      const id = ++this.sequence;
      try {
        return await new Promise<GeneratedChunk>((resolve, reject) => {
          this.waiters.set(id, { resolve, reject });
          this.worker?.postMessage({
            id,
            descriptor: this.descriptor,
            address,
            ...(PERF_BUILD
              ? {
                  profile: !!collector()?.active,
                  dispatched: performance.timeOrigin + performance.now(),
                }
              : {}),
          });
        });
      } catch (error) {
        if (this.disposed || this.worker) throw error;
      }
    }
    // At most one chunk per task. Used by headless tests and browsers without workers.
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    this.generator ??= new ForestGenerator(this.descriptor);
    return this.generator.generateCooperatively(address);
  }
  async prepare(addresses: readonly ChunkAddress[]): Promise<void> {
    if (this.disposed) throw new Error('World source disposed');
    // Callers submit a bounded working set; generation is serial to avoid flooding the main thread.
    for (const address of addresses) {
      const key = addressKey(address.x, address.y);
      if (this.chunks.has(key)) {
        if (PERF_BUILD) profileEvent('source.hit', performance.now(), 0, { key });
        continue;
      }
      if (!this.pending.has(key)) {
        const queuedAt = PERF_BUILD ? performance.now() : 0;
        const job = this.serial
          .catch(() => {})
          .then(async () => {
            if (this.disposed) return;
            const started = performance.now();
            if (PERF_BUILD)
              profileEvent('source.queue', queuedAt, started - queuedAt, {
                key,
                pending: this.pending.size,
                resident: this.chunks.size,
              });
            const region = {
              x: Math.floor((address.x * this.descriptor.chunkSize) / REGION_SIZE),
              y: Math.floor((address.y * this.descriptor.chunkSize) / REGION_SIZE),
              generatorVersion: this.descriptor.generatorVersion,
              biome: this.climate
                ? BIOME_IDS[
                    this.climate.sample(
                      Math.floor((address.x * this.descriptor.chunkSize) / REGION_SIZE) *
                        REGION_SIZE +
                        128,
                      Math.floor((address.y * this.descriptor.chunkSize) / REGION_SIZE) *
                        REGION_SIZE +
                        128,
                    ).biome
                  ]!
                : 'forest',
              biomeVersion: this.descriptor.biomeVersion,
            } as const;
            biomes.get(region.biome, region.biomeVersion);
            await this.backend?.establish(region);
            if (PERF_BUILD)
              profileEvent('source.region', started, performance.now() - started, { key });
            const chunk = await this.generate(address);
            if (!this.disposed) {
              this.chunks.set(key, chunk);
              this.generated++;
              if (PERF_BUILD)
                profileEvent('source.ready', queuedAt, performance.now() - queuedAt, {
                  key,
                  tiles: chunk.tiles.byteLength,
                  props: chunk.props.length,
                });
              const duration = performance.now() - started;
              this.maxGenerationMs = Math.max(this.maxGenerationMs, duration);
              this.generationTimes.push(duration);
              if (this.generationTimes.length > 128) this.generationTimes.shift();
            }
          })
          .finally(() => {
            this.pending.delete(key);
          });
        this.pending.set(key, job);
        this.serial = job;
      }
    }
    await Promise.all(addresses.map((a) => this.pending.get(addressKey(a.x, a.y))));
  }
  evict(required: ReadonlySet<string>): void {
    const now = performance.now();
    for (const key of required) this.touched.set(key, now);
    const candidates = [...this.chunks.keys()]
      .filter((key) => !required.has(key))
      .sort((a, b) => (this.touched.get(a) ?? 0) - (this.touched.get(b) ?? 0));
    for (const key of candidates)
      if (
        now - (this.touched.get(key) ?? 0) >= 5000 ||
        this.chunks.size > Math.max(128, required.size)
      ) {
        if (PERF_BUILD) profileEvent('source.evicted', performance.now(), 0, { key });
        this.chunks.delete(key);
        this.touched.delete(key);
        this.evictions++;
      }
  }
  get info() {
    const times = [...this.generationTimes].sort((a, b) => a - b);
    return {
      residentChunks: this.chunks.size,
      queuedChunks: this.pending.size,
      generated: this.generated,
      evictions: this.evictions,
      maxGenerationMs: this.maxGenerationMs,
      generationP50Ms: times[Math.floor((times.length - 1) * 0.5)] ?? 0,
      generationP95Ms: times[Math.floor((times.length - 1) * 0.95)] ?? 0,
      elevationBytes: [...this.chunks.values()].reduce((n, c) => n + (c.elevations?.byteLength ?? 0), 0),
      tileBytes: [...this.chunks.values()].reduce((n, c) => n + c.tiles.byteLength, 0),
    };
  }
  dispose(): void {
    this.disposed = true;
    this.worker?.terminate();
    for (const waiter of this.waiters.values()) waiter.reject(new Error('World source disposed'));
    this.waiters.clear();
    this.chunks.clear();
  }
}
