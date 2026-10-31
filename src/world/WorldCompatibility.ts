import { WORLD_GENERATOR_VERSION, type WorldData, type WorldMeta } from '../types/world';

export const SAVE_SCHEMA_VERSION = 2;
/** Imported original maps and otherwise valid V2 worlds with unknown procedural provenance. */
export const LEGACY_GENERATOR_VERSION = 0;

export function assertGeneratorVersion(value: unknown): asserts value is number {
  if (
    typeof value !== 'number' ||
    !Number.isInteger(value) ||
    value < 0 ||
    value > WORLD_GENERATOR_VERSION
  )
    throw new Error(`Unsupported generator version: ${String(value)}`);
}
export function assertMigrationVersions(
  meta: Pick<WorldMeta, 'hilltopObjectsVersion' | 'riverRepairVersion'>,
): void {
  if (meta.riverRepairVersion !== undefined && meta.riverRepairVersion !== 1)
    throw new Error('Unsupported river repair version');
  if (meta.hilltopObjectsVersion !== undefined && meta.hilltopObjectsVersion !== 1)
    throw new Error('Unsupported hilltop objects version');
}
/** Existing version fields ARE the persisted migration IDs; no duplicate mutable ledger. */
export function appliedMigrations(meta: WorldMeta): readonly string[] {
  return [
    ...(meta.riverRepairVersion === 1 ? ['river-repair:1'] : []),
    ...(meta.hilltopObjectsVersion === 1 ? ['hilltop-objects:1'] : []),
  ];
}
export function normalizeWorldCompatibility(world: WorldData): WorldData {
  const version =
    world.meta.generatorVersion === undefined
      ? LEGACY_GENERATOR_VERSION
      : world.meta.generatorVersion;
  assertGeneratorVersion(version);
  assertMigrationVersions(world.meta);
  return world.meta.generatorVersion === version
    ? world
    : { ...world, meta: { ...world.meta, generatorVersion: version } };
}
