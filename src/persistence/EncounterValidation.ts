import type { EncounterState } from '../types/encounters';
import type { WorldData } from '../types/world';
import { ENCOUNTER_CONFIG as C } from '../config/EncounterConfig';
import { canOccupy } from '../systems/CollisionSystem';

const object = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === 'object' && !Array.isArray(v);
const number = (v: unknown): v is number =>
  typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 1e9;
const timer = (v: Record<string, unknown>, names: string[]) => names.every((k) => number(v[k]));
const flags = (v: Record<string, unknown>, names: string[]) =>
  names.every((k) => typeof v[k] === 'boolean');
const phases = ['dormant', 'warning', 'emerging', 'fighting', 'returning', 'defeated'];
function fail(): never {
  throw new Error('Invalid encounter data');
}

export function validateEncounterSites(world: WorldData): void {
  const sites: unknown = world.encounterSites;
  if (sites === undefined) return;
  if (
    !Array.isArray(sites) ||
    sites.length > C.ghosts.maxGroves + 1 ||
    new Set(sites.map((s: unknown) => (object(s) ? s.id : null))).size !== sites.length
  )
    fail();
  let nests = 0;
  for (const s of sites) {
    if (
      !object(s) ||
      typeof s.id !== 'string' ||
      s.id.length > 160 ||
      !s.id.startsWith('encounter:') ||
      !['nest', 'grove'].includes(String(s.kind)) ||
      !number(s.x) ||
      !number(s.y) ||
      s.x >= world.meta.width ||
      s.y >= world.meta.height ||
      (s.legacy !== undefined && typeof s.legacy !== 'boolean') ||
      !canOccupy(world, s.x, s.y, 0.3, 'groundEnemy')
    )
      fail();
    if (s.kind === 'nest') nests++;
  }
  if (nests > 1 || (world.meta.isTutorial && sites.length)) fail();
}

export function validateEncounterState(
  world: WorldData,
  state: unknown,
): asserts state is EncounterState {
  if (state === undefined) return;
  if (
    !object(state) ||
    state.version !== 1 ||
    !Array.isArray(state.bosses) ||
    !Array.isArray(state.groves)
  )
    fail();
  const sites = world.encounterSites ?? [];
  if (
    state.bosses.length !== sites.filter((s) => s.kind === 'nest').length ||
    state.groves.length !== sites.filter((s) => s.kind === 'grove').length
  )
    fail();
  const seen = new Set<string>();
  for (const b of state.bosses) {
    if (
      !object(b) ||
      typeof b.siteId !== 'string' ||
      seen.has(b.siteId) ||
      !sites.some((s) => s.id === b.siteId && s.kind === 'nest') ||
      !phases.includes(String(b.phase)) ||
      !flags(b, ['discovered', 'rewardClaimed']) ||
      !timer(b, ['remainingMs', 'awayMs', 'unreachableMs', 'returnMs', 'health', 'maxHealth']) ||
      b.maxHealth === 0 ||
      (b.health as number) > (b.maxHealth as number) ||
      (b.phase === 'defeated'
        ? b.health !== 0 || b.rewardClaimed !== true
        : b.rewardClaimed !== false || b.health === 0)
    )
      fail();
    if (
      (b.phase === 'warning' && (b.remainingMs as number) > C.boss.warningMs) ||
      (b.phase === 'emerging' && (b.remainingMs as number) > C.boss.emergenceMs)
    )
      fail();
    if (!['warning', 'emerging'].includes(String(b.phase)) && b.remainingMs !== 0) fail();
    seen.add(b.siteId);
  }
  const ids = new Set<string>();
  let reserved = 0,
    introductions = 0;
  for (const g of state.groves) {
    if (
      !object(g) ||
      typeof g.siteId !== 'string' ||
      seen.has(g.siteId) ||
      !sites.some((s) => s.id === g.siteId && s.kind === 'grove') ||
      !['available', 'active', 'cooldown'].includes(String(g.phase)) ||
      !flags(g, [
        'discovered',
        'armed',
        'wasInside',
        'leftSinceClear',
        'introductory',
        'manifested',
      ]) ||
      !timer(g, ['cooldownMs', 'cycle', 'awayMs']) ||
      !Number.isInteger(g.cycle) ||
      (g.cooldownMs as number) > C.ghosts.cooldownMs ||
      !Array.isArray(g.members) ||
      g.members.length > C.ghosts.maxActive
    )
      fail();
    seen.add(g.siteId);
    if (g.phase !== 'cooldown' && g.cooldownMs !== 0) fail();
    if (
      g.phase === 'active' &&
      (g.members.length === 0 || (g.introductory && g.members.length !== 1))
    )
      fail();
    if (g.phase === 'active' && g.introductory) introductions++;
    for (let slot = 0; slot < g.members.length; slot++) {
      const m = g.members[slot];
      if (
        !object(m) ||
        typeof m.id !== 'string' ||
        m.id !== `${g.siteId}:cycle:${g.cycle}:ghost:${slot}` ||
        ids.has(m.id) ||
        !['pending', 'forming', 'active', 'killed', 'dismissed'].includes(String(m.status)) ||
        !timer(m, ['remainingMs', 'placementWaitMs', 'health', 'maxHealth', 'x', 'y']) ||
        m.maxHealth === 0 ||
        (m.health as number) > (m.maxHealth as number) ||
        (m.x as number) >= world.meta.width ||
        (m.y as number) >= world.meta.height ||
        (m.status === 'killed' ? m.health !== 0 : m.status !== 'dismissed' && m.health === 0) ||
        (m.remainingMs as number) >
          C.ghosts.formationMs + C.ghosts.staggerMs * (C.ghosts.maxActive - 1)
      )
        fail();
      ids.add(m.id);
      if (
        (m.status === 'active' && m.remainingMs !== 0) ||
        (m.status === 'forming' && (m.remainingMs as number) > C.ghosts.formationMs)
      )
        fail();
      if (['pending', 'forming', 'active'].includes(m.status as string)) {
        reserved++;
        if (g.phase !== 'active') fail();
      }
    }
  }
  if (reserved > C.ghosts.maxActive || introductions > 1) fail();
}
