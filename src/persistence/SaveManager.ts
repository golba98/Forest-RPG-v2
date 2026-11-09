import type { Game } from '../game/Game';
import { randomSeed } from '../game/LaunchParams';
import { Simulation } from '../simulation/Simulation';
import { restoreSafePosition } from '../systems/SpawnSafety';
import { Tile } from '../types/tiles';
import type { Difficulty } from '../types/world';
import { infiniteDescriptor, newWorldId } from '../world/infinite/InfiniteSession';
import { preserveLegacyRegion } from '../world/infinite/LegacyRegion';
import { SAVE_SCHEMA_VERSION } from '../world/WorldCompatibility';
import { validGlobalEntity } from './codecs/EntityValidation';
import { decodeFiniteSave, type FiniteSavePayload } from './codecs/FiniteSaveCodec';
import { object } from './codecs/validation';
import { exportInfinite, importInfinite, validateCheckpoint } from './InfiniteArchive';
import { adaptLegacySave } from './LegacySaveAdapter';
import { libraryId, worldName, type WorldLibraryEntry } from './WorldLibrary';
import type { WorldCheckpoint } from './WorldRepository';
import { WorldRepository } from './WorldRepository';
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
      return !!raw && decodeFiniteSave(raw).world.meta.isTutorial === true;
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
        const state = await importInfinite(this.worlds(), file, validGlobalEntity);
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
        const state = decodeFiniteSave(raw);
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
            : decodeFiniteSave(raw).world.meta;
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
  private async restoreInfinite(state: WorldCheckpoint, fork = true): Promise<void> {
    validateCheckpoint(state, validGlobalEntity);
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
      const normalized = decodeFiniteSave(
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
  private async convertFinite(state: ReturnType<typeof decodeFiniteSave>): Promise<void> {
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
    const payload: FiniteSavePayload = {
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
    const state = decodeFiniteSave(raw); // Validate fully before touching the running game.
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
    const state = await importInfinite(this.worlds(), input, validGlobalEntity);
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
