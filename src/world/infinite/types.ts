import type { Entity } from '../../types/entities';
import type { EncounterState } from '../../types/encounters';
import type { Difficulty, WorldBridge, WorldProp, WorldData } from '../../types/world';
import type { ChunkAddress } from './coordinates';

export const STREAM_GENERATOR_VERSION = 16;
export interface InfiniteDescriptor {
  readonly id: string;
  readonly seed: number;
  readonly generatorVersion: 13 | 14 | 15 | 16;
  readonly biomeVersion: 1 | 2;
  readonly mode?: 'adventure' | 'biome-walk';
  readonly chunkSize: 32 | 64;
  readonly level: number;
  readonly difficulty: Difficulty;
}
export interface RegionIdentity {
  readonly x: number;
  readonly y: number;
  readonly generatorVersion: 13 | 14 | 15 | 16;
  readonly biome: string;
  readonly biomeVersion: number;
}
export interface GeneratedChunk {
  readonly address: ChunkAddress;
  readonly size: number;
  readonly tiles: Uint8Array;
  readonly elevations?: Uint8Array;
  readonly environment?: import('../Biomes').WorldEnvironment;
  readonly props: readonly WorldProp[];
  readonly bridges: readonly WorldBridge[];
}
/** Sparse durable changes. Absent records reproduce the procedural baseline. */
export interface ChunkDelta {
  readonly events?: Readonly<Record<string, string | number | boolean>>;
  readonly tiles: Readonly<Record<string, number>>;
  readonly removed: readonly string[];
  readonly added: readonly WorldProp[];
  readonly entities: readonly Entity[];
  readonly encounters?: EncounterState;
  readonly activated: boolean;
  readonly discovered?: readonly number[];
  readonly moisture?: {
    readonly wetness: readonly number[];
    readonly puddles: readonly number[];
    readonly atMs: number;
  };
}
export interface LegacyRegion {
  readonly world: WorldData;
  readonly entities: readonly Entity[];
  readonly runtime?: import('../../types/encounters').SimulationRuntime;
  readonly elapsedMs?: number;
  readonly legacyExtras?: Record<string, unknown>;
  readonly exits: readonly { x: number; y: number }[];
  readonly travelLink: boolean;
}
export interface WorldWindow {
  readonly originX: number;
  readonly originY: number;
  readonly descriptor: InfiniteDescriptor;
  readonly discovered: Uint8Array;
  discoveryVersion: number;
  teleportVersion: number;
}
export interface WorldSource {
  readonly descriptor: InfiniteDescriptor;
  tileAt(x: number, y: number): number | undefined;
  prepare(addresses: readonly ChunkAddress[]): Promise<void>;
  evict(required: ReadonlySet<string>): void;
}
