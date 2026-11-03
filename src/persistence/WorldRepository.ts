import type {
  ChunkDelta,
  InfiniteDescriptor,
  RegionIdentity,
  LegacyRegion,
} from '../world/infinite/types';
import type { Entity } from '../types/entities';
import type { SimulationRuntime } from '../types/encounters';

export interface WorldCheckpoint {
  readonly version: 3;
  readonly exploration?: {
    home: { x: number; y: number };
    landings: Partial<Record<import('../world/Biomes').BiomeId, { x: number; y: number }>>;
  };
  readonly descriptor: InfiniteDescriptor;
  readonly revision: number;
  readonly entities: readonly Entity[];
  readonly runtime: SimulationRuntime;
  readonly time: number;
  readonly elapsedMs: number;
  readonly objectives: readonly string[];
  readonly legacy?: LegacyRegion;
}
const completed = (tx: IDBTransaction) =>
  new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onabort = tx.onerror = () =>
      reject(tx.error ?? new Error('World storage transaction failed'));
  });
const result = <T>(req: IDBRequest<T>) =>
  new Promise<T>((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('World storage request failed'));
  });
/** Native IndexedDB, with atomic checkpoints and immutable historical chunk revisions. */
export class WorldRepository {
  close(): void {
    const pending = this.db;
    this.db = undefined;
    if (pending)
      void pending.then(
        (db) => db.close(),
        () => {},
      );
    this.parents.clear();
  }
  async stageChunk(id: string, key: string, delta: ChunkDelta): Promise<void> {
    const db = await this.open(),
      tx = db.transaction('chunks', 'readwrite'),
      done = completed(tx);
    tx.objectStore('chunks').put(delta, [id, key, 0]);
    await done;
  }
  async discard(id: string): Promise<void> {
    const db = await this.open(),
      tx = db.transaction(['chunks', 'regions', 'checkpoints', 'lineages'], 'readwrite'),
      done = completed(tx);
    for (const name of ['chunks', 'regions', 'checkpoints'])
      tx.objectStore(name).delete(IDBKeyRange.bound([id], [id, '\uffff']));
    tx.objectStore('lineages').delete(id);
    this.parents.delete(id);
    await done;
  }
  private async *localRegions(id: string): AsyncGenerator<RegionIdentity> {
    const db = await this.open();
    let after: IDBValidKey | undefined;
    for (;;) {
      const range = after
        ? IDBKeyRange.bound(after, [id, '\uffff'], true)
        : IDBKeyRange.bound([id], [id, '\uffff']);
      const cursor = await result(
        db.transaction('regions').objectStore('regions').openCursor(range),
      );
      if (!cursor) return;
      after = cursor.key;
      yield cursor.value as RegionIdentity;
    }
  }
  async *regions(id: string): AsyncGenerator<RegionIdentity> {
    const db = await this.open(),
      descendants: string[] = [];
    let current: string | null = id;
    while (current) {
      for await (const region of this.localRegions(current)) {
        let shadowed = false;
        for (const child of descendants)
          if (
            await result(
              db.transaction('regions').objectStore('regions').get([child, region.x, region.y]),
            )
          ) {
            shadowed = true;
            break;
          }
        if (!shadowed) yield region;
      }
      descendants.push(current);
      current = (await this.parent(current))?.id ?? null;
    }
  }
  private async region(id: string, x: number, y: number): Promise<RegionIdentity | undefined> {
    const db = await this.open();
    let current: string | null = id;
    while (current) {
      const found = (await result(
        db.transaction('regions').objectStore('regions').get([current, x, y]),
      )) as RegionIdentity | undefined;
      if (found) return found;
      current = (await this.parent(current))?.id ?? null;
    }
    return undefined;
  }
  private readonly parents = new Map<string, { id: string; revision: number } | null>();
  private async parent(id: string): Promise<{ id: string; revision: number } | null> {
    if (this.parents.has(id)) return this.parents.get(id) ?? null;
    const db = await this.open(),
      row = (await result(db.transaction('lineages').objectStore('lineages').get(id))) as
        { parentId: string; parentRevision: number } | undefined;
    const parent = row ? { id: row.parentId, revision: row.parentRevision } : null;
    if (this.parents.size >= 32) this.parents.delete(this.parents.keys().next().value ?? '');
    this.parents.set(id, parent);
    return parent;
  }
  private db: Promise<IDBDatabase> | undefined;
  constructor(private readonly factory: IDBFactory = indexedDB) {}
  private open(): Promise<IDBDatabase> {
    return (this.db ??= new Promise((resolve, reject) => {
      const request = this.factory.open('forestrpg.worlds', 4);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains('lineages'))
          request.result
            .createObjectStore('lineages', { keyPath: 'id' })
            .createIndex('parent', 'parentId');
        for (const name of ['chunks', 'regions', 'checkpoints', 'slots'])
          if (!request.result.objectStoreNames.contains(name))
            request.result.createObjectStore(name);
      };
      request.onsuccess = () => {
        request.result.onversionchange = () => {
          request.result.close();
          this.db = undefined;
        };
        resolve(request.result);
      };
      request.onerror = () => reject(request.error ?? new Error('Cannot open world storage'));
      request.onblocked = () =>
        reject(new Error('Close other Forest RPG tabs to upgrade world storage'));
    }));
  }
  async establish(id: string, region: RegionIdentity): Promise<void> {
    const inherited = await this.region(id, region.x, region.y);
    if (
      inherited &&
      (inherited.generatorVersion !== region.generatorVersion ||
        inherited.biome !== region.biome ||
        inherited.biomeVersion !== region.biomeVersion)
    )
      throw new Error('Established region identity mismatch');
    const db = await this.open(),
      tx = db.transaction('regions', 'readwrite'),
      done = completed(tx),
      store = tx.objectStore('regions'),
      key = [id, region.x, region.y];
    const existing = (await result(store.get(key))) as RegionIdentity | undefined;
    if (
      existing &&
      (existing.generatorVersion !== region.generatorVersion ||
        existing.biome !== region.biome ||
        existing.biomeVersion !== region.biomeVersion)
    ) {
      tx.abort();
      await done;
      throw new Error('Established region identity mismatch');
    }
    if (!existing) store.put(region, key);
    await done;
  }
  async readChunk(id: string, key: string, revision: number): Promise<ChunkDelta | undefined> {
    let current: { id: string; revision: number } | null = { id, revision };
    while (current) {
      const delta = await this.readLocalChunk(current.id, key, current.revision);
      if (delta) return delta;
      current = await this.parent(current.id);
    }
    return undefined;
  }
  private async readLocalChunk(
    id: string,
    key: string,
    revision: number,
  ): Promise<ChunkDelta | undefined> {
    const db = await this.open(),
      tx = db.transaction('chunks', 'readonly');
    const cursor = await result(
      tx
        .objectStore('chunks')
        .openCursor(IDBKeyRange.bound([id, key, 0], [id, key, revision]), 'prev'),
    );
    return cursor?.value as ChunkDelta | undefined;
  }
  async checkpoint(
    state: WorldCheckpoint,
    changes: ReadonlyMap<string, ChunkDelta>,
    slot?: string,
  ): Promise<void> {
    const db = await this.open(),
      tx = db.transaction(['chunks', 'checkpoints', 'slots'], 'readwrite'),
      done = completed(tx);
    for (const [key, delta] of changes)
      tx.objectStore('chunks').put(delta, [state.descriptor.id, key, state.revision]);
    tx.objectStore('checkpoints').put(state, [state.descriptor.id, state.revision]);
    if (slot)
      tx.objectStore('slots').put({ id: state.descriptor.id, revision: state.revision }, slot);
    // Keep one durable exploration per generator. Installing new terrain must
    // never discard the preceding landscape or mix its edits into a new baseline.
    const explorationSlot =
      slot === 'biome-walk' && state.descriptor.mode === 'biome-walk'
        ? `walk-v${state.descriptor.generatorVersion}`
        : undefined;
    if (explorationSlot)
      tx.objectStore('slots').put(
        { id: state.descriptor.id, revision: state.revision },
        explorationSlot,
      );
    await done;
    if (slot)
      try {
        if (typeof localStorage !== 'undefined')
          localStorage.setItem(`forestrpg.v3.slot.${slot}`, '1');
        if (typeof localStorage !== 'undefined' && explorationSlot)
          localStorage.setItem(`forestrpg.v3.slot.${explorationSlot}`, '1');
      } catch {
        /* Secondary index; IndexedDB remains authoritative. */
      }
    if (state.revision > 0 && state.revision % 16 === 0)
      void this.compact(state.descriptor.id, state.revision).catch((error) =>
        console.warn('World history compaction failed', error),
      );
  }
  /** Keep slot snapshots and the two latest recovery checkpoints; discard superseded revisions. */
  private async compact(id: string, revision: number): Promise<void> {
    const db = await this.open(),
      tx = db.transaction(['chunks', 'checkpoints', 'slots', 'lineages'], 'readwrite'),
      done = completed(tx);
    const pointers = (await result(tx.objectStore('slots').getAll())) as {
      id: string;
      revision: number;
    }[];
    const pins = new Set(pointers.filter((p) => p.id === id).map((p) => p.revision));
    const children = (await result(tx.objectStore('lineages').index('parent').getAll(id))) as {
      parentRevision: number;
    }[];
    for (const child of children) pins.add(child.parentRevision);
    pins.add(revision);
    const previous = await result(
      tx
        .objectStore('checkpoints')
        .openCursor(IDBKeyRange.bound([id, 0], [id, revision], false, true), 'prev'),
    );
    if (previous) pins.add((previous.key as [string, number])[1]);
    const chunks = tx.objectStore('chunks'),
      request = chunks.openCursor(IDBKeyRange.bound([id], [id, '\uffff', revision]));
    let group: string | undefined;
    let versions: { key: IDBValidKey; revision: number }[] = [];
    const trim = () => {
      const keep = new Set<IDBValidKey>();
      for (const pin of pins) {
        const selected = versions.filter((v) => v.revision <= pin).at(-1);
        if (selected) keep.add(selected.key);
      }
      for (const v of versions)
        if (v.revision <= revision && !keep.has(v.key)) chunks.delete(v.key);
      versions = [];
    };
    request.onsuccess = () => {
      const c = request.result;
      if (!c) {
        trim();
        return;
      }
      const key = c.key as [string, string, number];
      if (group !== key[1]) {
        trim();
        group = key[1];
      }
      versions.push({ key: c.key, revision: key[2] });
      c.continue();
    };
    const checkpoints = tx
      .objectStore('checkpoints')
      .openCursor(IDBKeyRange.bound([id, 0], [id, revision]));
    checkpoints.onsuccess = () => {
      const c = checkpoints.result;
      if (c) {
        if (!pins.has((c.key as [string, number])[1])) c.delete();
        c.continue();
      }
    };
    await done;
  }
  async load(slot: string): Promise<WorldCheckpoint | undefined> {
    const db = await this.open();
    const pointer = (await result(db.transaction('slots').objectStore('slots').get(slot))) as
      { id: string; revision: number } | undefined;
    return pointer
      ? ((await result(
          db
            .transaction('checkpoints')
            .objectStore('checkpoints')
            .get([pointer.id, pointer.revision]),
        )) as WorldCheckpoint | undefined)
      : undefined;
  }
  async *records(id: string, revision: number): AsyncGenerator<{ key: string; delta: ChunkDelta }> {
    const descendants: { id: string; revision: number }[] = [];
    let current: { id: string; revision: number } | null = { id, revision };
    while (current) {
      for await (const record of this.localRecords(current.id, current.revision)) {
        let shadowed = false;
        for (const child of descendants)
          if (await this.readLocalChunk(child.id, record.key, child.revision)) {
            shadowed = true;
            break;
          }
        if (!shadowed) yield record;
      }
      descendants.push(current);
      current = await this.parent(current.id);
    }
  }
  private async *localRecords(
    id: string,
    revision: number,
  ): AsyncGenerator<{ key: string; delta: ChunkDelta }> {
    const db = await this.open();
    let after: IDBValidKey | undefined;
    // One small cursor transaction at a time: never retain the complete explored world in JS.
    for (;;) {
      const range = after
        ? IDBKeyRange.bound(after, [id, '\uffff', Number.MAX_SAFE_INTEGER], true)
        : IDBKeyRange.bound([id], [id, '\uffff', Number.MAX_SAFE_INTEGER]);
      const cursor = await result(db.transaction('chunks').objectStore('chunks').openCursor(range));
      if (!cursor) break;
      const key = cursor.key as [string, string, number];
      const delta = await this.readLocalChunk(id, key[1], revision);
      if (delta) yield { key: key[1], delta };
      after = [id, key[1], Number.MAX_SAFE_INTEGER];
    }
  }
  /** Fork only a revision reference: loading never copies the complete explored world. */
  async fork(state: WorldCheckpoint, newId: string): Promise<WorldCheckpoint> {
    const db = await this.open(),
      tx = db.transaction('lineages', 'readwrite'),
      done = completed(tx);
    tx.objectStore('lineages').put({
      id: newId,
      parentId: state.descriptor.id,
      parentRevision: state.revision,
    });
    await done;
    return { ...state, descriptor: { ...state.descriptor, id: newId }, revision: 0 };
  }
}
