import { ENCOUNTER_CONFIG as C } from '../config/EncounterConfig';
import type {
  BossEncounter,
  EncounterPresentation,
  EncounterSite,
  EncounterState,
  GroveEncounter,
} from '../types/encounters';
import type { EnemyEntity, EnemyType, Entity, PlayerEntity, PlayerIntent } from '../types/entities';
import type { NavigationDebug } from '../types/gameplay';
import type { WorldData } from '../types/world';
import { nestGeometry } from '../world/NestGeometry';
import { Rng } from '../world/Rng';
import { isManifestationGround } from '../world/EncounterPlacement';
import { hasClearPath } from './CollisionSystem';
import { groundPosition, PLAYER_FOOTPRINT } from './EntityFootprint';
import { supportingSurface } from './SurfaceState';

type Factory = (type: EnemyType, x: number, y: number, id: string) => EnemyEntity;
export type EncounterCue = 'nestWarning' | 'bossEmerge' | 'ghostForm';
const distance = (a: { x: number; y: number }, b: { x: number; y: number }) =>
  Math.hypot(a.x - b.x, a.y - b.y);
const livingEnemies = (entities: readonly Entity[]) =>
  entities.filter((e): e is EnemyEntity => e.kind === 'enemy' && e.alive);
export const bossEntityId = (site: EncounterSite) => `${site.id}:boss`;

/** Sole owner of managed actor lifetimes. No renderer, camera or wall-clock dependencies. */
export class EncounterDirector {
  state: EncounterState;
  private sites: EncounterSite[];
  constructor(
    private readonly world: WorldData,
    private readonly create: Factory,
    private readonly cue: (kind: EncounterCue) => void = () => {},
  ) {
    this.sites = [...(world.encounterSites ?? [])];
    this.state = { version: 1, bosses: [], groves: [] };
    this.resetRecords();
  }
  getSites(): readonly EncounterSite[] {
    return this.sites;
  }
  private resetRecords(): void {
    const hp = 15 + (this.world.meta.level - 1) * 5;
    this.state = {
      version: 1,
      bosses: this.sites
        .filter((s) => s.kind === 'nest')
        .map((s) => ({
          siteId: s.id,
          phase: 'dormant',
          discovered: false,
          remainingMs: 0,
          awayMs: 0,
          unreachableMs: 0,
          returnMs: 0,
          health: hp,
          maxHealth: hp,
          rewardClaimed: false,
        })),
      groves: this.sites
        .filter((s) => s.kind === 'grove')
        .map((s) => ({
          siteId: s.id,
          phase: 'available',
          discovered: false,
          cooldownMs: 0,
          cycle: 0,
          armed: true,
          wasInside: false,
          leftSinceClear: true,
          awayMs: 0,
          introductory: false,
          manifested: false,
          members: [],
        })),
    };
  }
  private site(id: string): EncounterSite {
    const site = this.sites.find((s) => s.id === id);
    if (!site) throw new Error(`Unknown encounter site: ${id}`);
    return site;
  }
  private actor(entities: readonly Entity[], id: string): EnemyEntity | undefined {
    return entities.find((e): e is EnemyEntity => e.kind === 'enemy' && e.id === id && e.alive);
  }
  private bossActor(entities: readonly Entity[], b: BossEncounter) {
    return this.actor(entities, bossEntityId(this.site(b.siteId)));
  }

  canInteract(p: PlayerEntity, site: EncounterSite): boolean {
    const feet = groundPosition(p),
      d = distance(feet, site);
    return (
      !p.isJumping &&
      supportingSurface(this.world, p).kind !== 'water' &&
      d >= C.boss.interactMin &&
      d <= C.boss.interactMax &&
      hasClearPath(
        this.world,
        p.x,
        p.y,
        site.x,
        site.y - PLAYER_FOOTPRINT.offsetY,
        PLAYER_FOOTPRINT,
        'player',
        { ignoreNestId: site.id },
      )
    );
  }
  private beginBoss(b: BossEncounter): void {
    if (b.phase !== 'dormant') return;
    b.phase = 'warning';
    b.remainingMs = C.boss.warningMs;
    b.discovered = true;
    b.awayMs = b.unreachableMs = b.returnMs = 0;
    this.cue('nestWarning');
  }
  private setBossActor(b: BossEncounter, entities: readonly Entity[]): EnemyEntity {
    const site = this.site(b.siteId);
    const e =
      this.bossActor(entities, b) ?? this.create('beetle', site.x, site.y, bossEntityId(site));
    e.encounterId = site.id;
    e.encounterHome = { x: site.x, y: site.y };
    e.combatReady = b.phase === 'fighting';
    e.returningToNest = b.phase === 'returning';
    e.health = b.health;
    e.maxHealth = b.maxHealth;
    if (b.phase === 'emerging') this.crawl(b, e, true);
    return e;
  }
  private crawl(b: BossEncounter, e: EnemyEntity, restored = false): void {
    const { entrance, exit } = nestGeometry(this.world, this.site(b.siteId));
    const t = Math.max(0, Math.min(1, 1 - b.remainingMs / C.boss.emergenceMs));
    e.prevX = restored ? entrance.x : e.x;
    e.prevY = restored ? entrance.y + (exit.y - entrance.y) * t : e.y;
    e.x = entrance.x;
    e.y = entrance.y + (exit.y - entrance.y) * t;
    e.facing = 'S';
  }
  private suppresses(site: { x: number; y: number }, entities: readonly Entity[]): boolean {
    return this.state.bosses.some((b) => {
      if (!['warning', 'emerging', 'fighting', 'returning'].includes(b.phase)) return false;
      const nest = this.site(b.siteId),
        boss = this.bossActor(entities, b);
      return (
        distance(site, nest) < C.boss.suppressionRadius ||
        (boss !== undefined && distance(site, boss) < 6)
      );
    });
  }
  private reservedGhosts(): number {
    return this.state.groves.reduce(
      (n, g) =>
        n + g.members.filter((m) => ['pending', 'forming', 'active'].includes(m.status)).length,
      0,
    );
  }
  private ghostPoint(
    site: EncounterSite,
    p: PlayerEntity,
    entities: readonly Entity[],
    salt: string,
  ): { x: number; y: number } | null {
    const points: Array<{ x: number; y: number }> = [];
    const feet = groundPosition(p);
    for (let dy = -6; dy <= 6; dy++)
      for (let dx = -6; dx <= 6; dx++) {
        const point = { x: Math.floor(site.x) + dx + 0.5, y: Math.floor(site.y) + dy + 0.5 };
        const d = distance(point, feet);
        if (
          d < C.ghosts.minSpawnDistance ||
          d > C.ghosts.maxSpawnDistance ||
          distance(point, site) > 7 ||
          !isManifestationGround(this.world, point.x, point.y) ||
          this.suppresses(point, entities)
        )
          continue;
        if (
          livingEnemies(entities).some((e) => distance(e, point) < 1.5) ||
          this.state.groves.some((g) =>
            g.members.some(
              (m) =>
                ['pending', 'forming', 'active'].includes(m.status) && distance(m, point) < 1.5,
            ),
          )
        )
          continue;
        // A clear local escape corridor on at least two axes, not a thin ledge.
        const exits = (
          [
            [1, 0],
            [-1, 0],
            [0, 1],
            [0, -1],
          ] as const
        ).filter(([x, y]) =>
          hasClearPath(
            this.world,
            point.x,
            point.y,
            point.x + x * 1.5,
            point.y + y * 1.5,
            0.3,
            'groundEnemy',
          ),
        );
        if (exits.length >= 2) points.push(point);
      }
    return Rng.derive(this.world.meta.seed, salt).shuffle(points)[0] ?? null;
  }
  private finishGrove(g: GroveEncounter, p: PlayerEntity): void {
    if (g.introductory && g.manifested) p.hauntedIntroComplete = true;
    g.phase = 'cooldown';
    g.cooldownMs = C.ghosts.cooldownMs;
    g.leftSinceClear = false;
    g.armed = false;
    g.awayMs = 0;
  }
  private beginGrove(
    g: GroveEncounter,
    p: PlayerEntity,
    entities: readonly Entity[],
    night: boolean,
    force = false,
  ): boolean {
    if (
      g.phase !== 'available' ||
      this.suppresses(this.site(g.siteId), entities) ||
      this.state.groves.some((other) => other.phase === 'active' && other.introductory)
    )
      return false;
    const rng = Rng.derive(this.world.meta.seed, `${g.siteId}:visit:${g.cycle}`);
    const intro = !p.hauntedIntroComplete;
    const count = intro || !night ? 1 : rng.chance(C.ghosts.tripleChance) ? 3 : 2;
    if (this.reservedGhosts() + count > C.ghosts.maxActive) return false;
    g.cycle++;
    g.armed = false;
    if (!force && !night && !rng.chance(C.ghosts.daytimeChance)) {
      this.finishGrove(g, p);
      return false;
    }
    g.phase = 'active';
    g.introductory = intro;
    g.manifested = false;
    g.members = [];
    g.awayMs = 0;
    const hp = 3 + Math.floor(this.world.meta.level / 2);
    for (let slot = 0; slot < count; slot++) {
      const point = this.ghostPoint(
        this.site(g.siteId),
        p,
        entities,
        `${g.siteId}:${g.cycle}:${slot}`,
      );
      if (!point) break;
      g.members.push({
        id: `${g.siteId}:cycle:${g.cycle}:ghost:${slot}`,
        ...point,
        status: 'pending',
        remainingMs: C.ghosts.formationMs + slot * C.ghosts.staggerMs,
        placementWaitMs: 0,
        health: hp,
        maxHealth: hp,
      });
    }
    if (!g.members.length) this.finishGrove(g, p);
    return g.members.length > 0;
  }
  private dismiss(e: EnemyEntity | undefined): void {
    if (!e) return;
    e.combatReady = false;
    e.returningToNest = false;
    e.despawnMs = 500;
    e.attackPhase = 'none';
  }
  step(
    p: PlayerEntity,
    entities: Entity[],
    intent: PlayerIntent,
    dt: number,
    night: boolean,
    navigation: readonly NavigationDebug[],
  ): void {
    const ms = dt * 1000;
    for (const e of livingEnemies(entities))
      if (e.despawnMs !== undefined) {
        e.despawnMs = Math.max(0, e.despawnMs - ms);
        if (e.despawnMs === 0) {
          e.alive = false;
          e.anim = 'idle';
        }
      }
    for (const b of this.state.bosses) {
      const site = this.site(b.siteId),
        d = distance(groundPosition(p), site);
      if (d <= C.boss.discoveryRadius) b.discovered = true;
      if (b.phase === 'dormant' && intent.interact && this.canInteract(p, site)) this.beginBoss(b);
      else if (b.phase === 'warning' || b.phase === 'emerging') {
        b.remainingMs = Math.max(0, b.remainingMs - ms);
        if (b.remainingMs <= 1e-7) {
          if (b.phase === 'warning') {
            b.phase = 'emerging';
            b.remainingMs = C.boss.emergenceMs;
            this.setBossActor(b, entities);
            this.cue('bossEmerge');
          } else {
            const actor = this.bossActor(entities, b);
            if (actor) this.crawl(b, actor);
            b.phase = 'fighting';
            b.remainingMs = 0;
          }
        }
      }
      const e = this.bossActor(entities, b);
      if (e) {
        if (b.phase === 'emerging') this.crawl(b, e);
        e.combatReady = b.phase === 'fighting';
        e.returningToNest = b.phase === 'returning';
        if (b.phase === 'fighting') {
          b.awayMs = d > C.boss.territory ? b.awayMs + ms : 0;
          const unreachable =
            supportingSurface(this.world, p).kind === 'water' ||
            // Centre-cell routes can consider two sides of a thin cliff connected.
            // Eight seconds of continuous physical occlusion also ends that stalemate.
            !hasClearPath(this.world, e.x, e.y, p.x, p.y) ||
            navigation.some((n) => n.id === e.id && n.unreachable);
          b.unreachableMs = unreachable ? b.unreachableMs + ms : 0;
          if (b.awayMs >= C.boss.disengageMs || b.unreachableMs >= C.boss.unreachableMs) {
            b.phase = 'returning';
            b.returnMs = 0;
            e.combatReady = false;
            e.returningToNest = true;
          }
        } else if (b.phase === 'returning') {
          b.returnMs += ms;
          if (distance(e, site) < 0.3 || b.returnMs >= C.boss.returnTimeoutMs) {
            this.dismiss(e);
            b.phase = 'dormant';
            b.health = b.maxHealth;
            b.returnMs = b.awayMs = b.unreachableMs = 0;
          }
        }
      }
    }
    for (const g of this.state.groves) {
      const site = this.site(g.siteId),
        d = distance(groundPosition(p), site),
        inside = d < C.ghosts.activationRadius;
      if (d <= C.ghosts.activationRadius) g.discovered = true;
      if (g.phase === 'cooldown') {
        g.cooldownMs = Math.max(0, g.cooldownMs - ms);
        if (d > C.ghosts.leaveRadius) g.leftSinceClear = true;
        if (g.cooldownMs === 0 && g.leftSinceClear) g.phase = 'available';
      }
      if (d > C.ghosts.leaveRadius) g.armed = true;
      if (g.phase === 'available' && inside && !g.wasInside && g.armed)
        this.beginGrove(g, p, entities, night);
      g.wasInside = inside;
      if (g.phase !== 'active') continue;
      for (const m of g.members) {
        if (m.status === 'killed' || m.status === 'dismissed' || m.status === 'active') continue;
        m.remainingMs = Math.max(0, m.remainingMs - ms);
        if (m.remainingMs > C.ghosts.formationMs) continue;
        if (m.status === 'pending') {
          if (
            distance(m, groundPosition(p)) < C.ghosts.minSpawnDistance ||
            !isManifestationGround(this.world, m.x, m.y) ||
            this.suppresses(m, entities)
          ) {
            const previousWait = m.placementWaitMs;
            m.placementWaitMs += ms;
            m.remainingMs = C.ghosts.formationMs;
            if (Math.floor(previousWait / 250) === Math.floor(m.placementWaitMs / 250)) continue;
            const point = this.ghostPoint(site, p, entities, `${m.id}:retry`);
            if (point) {
              m.x = point.x;
              m.y = point.y;
            } else if (m.placementWaitMs >= C.ghosts.placementTimeoutMs) m.status = 'dismissed';
            continue;
          }
          const e = this.create('ghost', m.x, m.y, m.id);
          e.encounterId = site.id;
          e.combatReady = false;
          m.status = 'forming';
          this.cue('ghostForm');
        }
        const e = this.actor(entities, m.id);
        if (m.remainingMs <= 1e-7 && e) {
          m.remainingMs = 0;
          m.status = 'active';
          e.combatReady = true;
          g.manifested = true;
        }
      }
      const ghosts = g.members
        .map((m) => this.actor(entities, m.id))
        .filter((e): e is EnemyEntity => !!e);
      g.awayMs =
        d > C.ghosts.territory && ghosts.every((e) => distance(e, p) > C.ghosts.disengageDistance)
          ? g.awayMs + ms
          : 0;
      if (g.awayMs >= C.ghosts.disengageMs)
        for (const m of g.members)
          if (m.status !== 'killed') {
            m.status = 'dismissed';
            this.dismiss(this.actor(entities, m.id));
          }
      if (g.members.every((m) => m.status === 'killed' || m.status === 'dismissed'))
        this.finishGrove(g, p);
    }
  }
  /** Called synchronously from the existing combat reward path. */
  claimDefeat(e: EnemyEntity): boolean {
    if (!e.encounterId) return true;
    const b = this.state.bosses.find((b) => b.siteId === e.encounterId);
    if (b) {
      if (b.phase !== 'fighting' || b.rewardClaimed) return false;
      b.phase = 'defeated';
      b.rewardClaimed = true;
      b.health = 0;
      b.remainingMs = 0;
      e.combatReady = false;
      return true;
    }
    const g = this.state.groves.find((g) => g.siteId === e.encounterId),
      m = g?.members.find((m) => m.id === e.id);
    if (!m || m.status !== 'active') return false;
    m.status = 'killed';
    m.health = 0;
    e.combatReady = false;
    return true;
  }
  afterCombat(p: PlayerEntity, entities: readonly Entity[]): void {
    for (const b of this.state.bosses) {
      const e = this.bossActor(entities, b);
      if (e && ['fighting', 'returning', 'emerging'].includes(b.phase)) b.health = e.health;
      else if (
        b.phase === 'fighting' &&
        entities.some((e) => e.id === bossEntityId(this.site(b.siteId)) && !e.alive)
      ) {
        b.phase = 'defeated';
        b.rewardClaimed = true;
        b.health = 0;
      }
    }
    for (const g of this.state.groves) {
      for (const m of g.members) {
        const e = this.actor(entities, m.id);
        if (e) {
          m.health = e.health;
          m.x = e.x;
          m.y = e.y;
        } else if (m.status === 'active' || m.status === 'forming') m.status = 'dismissed';
      }
      if (
        g.phase === 'active' &&
        g.members.every((m) => m.status === 'killed' || m.status === 'dismissed')
      )
        this.finishGrove(g, p);
    }
  }
  pendingBosses(entities: readonly Entity[]): number {
    return this.state.bosses.filter((b) => b.phase !== 'defeated' && !this.bossActor(entities, b))
      .length;
  }
  presentation(p: PlayerEntity, entities: readonly Entity[]): EncounterPresentation {
    const active = this.state.bosses.find((b) => b.phase === 'fighting');
    const near = this.state.bosses.find(
      (b) =>
        b.phase === 'dormant' &&
        b.discovered &&
        distance(groundPosition(p), this.site(b.siteId)) <= C.boss.interactMax,
    );
    return {
      sites: this.sites.map((site) => {
        const record =
          this.state.bosses.find((b) => b.siteId === site.id) ??
          this.state.groves.find((g) => g.siteId === site.id);
        if (!record) throw new Error('Missing encounter record');
        const progress =
          'remainingMs' in record
            ? record.phase === 'warning'
              ? 1 - record.remainingMs / C.boss.warningMs
              : record.phase === 'emerging'
                ? 1 - record.remainingMs / C.boss.emergenceMs
                : 1
            : 1;
        return { ...site, phase: record.phase, discovered: record.discovered, progress };
      }),
      boss: active
        ? {
            name: 'Big Bug',
            health: active.health,
            maxHealth: active.maxHealth,
            phase: active.phase,
          }
        : null,
      interaction: near
        ? this.canInteract(p, this.site(near.siteId))
          ? 'disturb'
          : distance(groundPosition(p), this.site(near.siteId)) < C.boss.interactMin
            ? 'stepBack'
            : null
        : null,
      pendingBosses: this.pendingBosses(entities),
    };
  }
  appearance(e: EnemyEntity): {
    alpha: number;
    formation?: number;
    quietRemoval?: boolean;
    nestEmergence?: { siteId: string; progress: number };
  } {
    if (e.despawnMs !== undefined) return { alpha: e.despawnMs / 500, quietRemoval: true };
    const b = this.state.bosses.find((b) => b.siteId === e.encounterId);
    if (b?.phase === 'emerging') {
      const formation = 1 - b.remainingMs / C.boss.emergenceMs;
      return { alpha: 1, nestEmergence: { siteId: b.siteId, progress: formation } };
    }
    const m = this.state.groves.flatMap((g) => g.members).find((m) => m.id === e.id);
    if (m?.status === 'forming') {
      const formation = 1 - m.remainingMs / C.ghosts.formationMs;
      return { alpha: 0.15 + formation * 0.85, formation };
    }
    return { alpha: 1 };
  }

  /** Reconcile once before the first restored step. Records win over entity presence. */
  restore(saved: EncounterState | undefined, p: PlayerEntity, entities: Entity[]): void {
    for (const e of entities)
      if (e.kind === 'enemy') {
        delete e.combatReady;
        delete e.encounterHome;
        delete e.returningToNest;
        delete e.despawnMs;
      }
    this.resetRecords();
    if (saved) this.state = structuredClone(saved);
    else {
      const oldBosses = entities.filter(
        (e): e is EnemyEntity => e.kind === 'enemy' && e.enemyType === 'beetle',
      );
      const complete =
        entities.some((e) => e.kind === 'portal' && (e.roundComplete || e.active)) ||
        oldBosses.some((e) => !e.alive || e.health <= 0);
      for (const b of this.state.bosses) {
        const old = oldBosses.find((e) => e.alive && e.health > 0);
        if (old && !complete) {
          const copy = {
            ...old,
            id: bossEntityId(this.site(b.siteId)),
            encounterId: b.siteId,
            combatReady: true,
          };
          entities.splice(entities.indexOf(old), 1, copy);
          b.phase = 'fighting';
          b.health = old.health;
          b.maxHealth = old.maxHealth;
          b.discovered = true;
        } else {
          b.phase = 'defeated';
          b.health = 0;
          b.rewardClaimed = true;
        }
      }
      for (const g of this.state.groves) {
        g.wasInside = distance(p, this.site(g.siteId)) < C.ghosts.activationRadius;
        g.armed = !g.wasInside;
      }
      const ghosts = livingEnemies(entities).filter((e) => e.enemyType === 'ghost');
      if (ghosts.length) {
        p.hauntedIntroComplete = true;
        const g = this.state.groves[0];
        if (g) {
          g.phase = 'active';
          g.cycle = 1;
          g.manifested = true;
          g.members = ghosts.slice(0, C.ghosts.maxActive).map((e, slot) => {
            const id = `${g.siteId}:cycle:1:ghost:${slot}`;
            entities.splice(entities.indexOf(e), 1, {
              ...e,
              id,
              encounterId: g.siteId,
              combatReady: true,
            });
            return {
              id,
              x: e.x,
              y: e.y,
              status: 'active',
              remainingMs: 0,
              placementWaitMs: 0,
              health: e.health,
              maxHealth: e.maxHealth,
            };
          });
        }
      }
    }
    // Remove unowned/duplicate/resolved managed types; tutorial actors are deliberately exempt.
    if (!this.world.meta.isTutorial) {
      const keep = new Set<string>();
      for (const b of this.state.bosses)
        if (['emerging', 'fighting', 'returning'].includes(b.phase))
          keep.add(bossEntityId(this.site(b.siteId)));
      for (const g of this.state.groves)
        for (const m of g.members)
          if (m.status === 'forming' || m.status === 'active') keep.add(m.id);
      const seen = new Set<string>();
      for (let i = entities.length - 1; i >= 0; i--) {
        const e = entities[i];
        if (!e) continue;
        if (e.kind !== 'enemy' || (e.enemyType !== 'beetle' && e.enemyType !== 'ghost')) continue;
        if (!keep.has(e.id) || seen.has(e.id)) entities.splice(i, 1);
        else seen.add(e.id);
      }
      for (const b of this.state.bosses)
        if (keep.has(bossEntityId(this.site(b.siteId)))) this.setBossActor(b, entities);
      for (const g of this.state.groves)
        for (const m of g.members)
          if (keep.has(m.id)) {
            const e = this.actor(entities, m.id) ?? this.create('ghost', m.x, m.y, m.id);
            e.encounterId = g.siteId;
            e.combatReady = m.status === 'active';
            e.health = m.health;
            e.maxHealth = m.maxHealth;
            delete e.despawnMs;
            delete e.returningToNest;
          }
    }
  }
  /** Debug commands use the same ownership, timers, cap and defeated latch. */
  requestSpawn(
    type: 'beetle' | 'ghost',
    p: PlayerEntity,
    entities: Entity[],
    night: boolean,
  ): string {
    if (type === 'beetle') {
      const b = this.state.bosses[0];
      if (!b || b.phase === 'defeated') throw new Error('No undefeated boss nest.');
      this.beginBoss(b);
      return bossEntityId(this.site(b.siteId));
    }
    const g = [...this.state.groves].sort(
      (a, b) => distance(this.site(a.siteId), p) - distance(this.site(b.siteId), p),
    )[0];
    if (!g || !this.beginGrove(g, p, entities, night, true))
      throw new Error('No available haunted grove or ghost capacity.');
    const first = g.members[0];
    if (!first) throw new Error('No safe manifestation position.');
    return first.id;
  }
  clear(entities: Entity[], bossesOnly = false): void {
    for (const b of this.state.bosses) {
      b.phase = 'defeated';
      b.health = 0;
      b.rewardClaimed = true;
      b.remainingMs = 0;
      const e = this.bossActor(entities, b);
      if (e) {
        e.alive = false;
        e.health = 0;
        e.combatReady = false;
      }
    }
    if (!bossesOnly)
      for (const g of this.state.groves) {
        for (const m of g.members) {
          m.status = 'dismissed';
          this.dismiss(this.actor(entities, m.id));
        }
        g.phase = 'cooldown';
        g.cooldownMs = C.ghosts.cooldownMs;
        g.leftSinceClear = false;
        g.armed = false;
      }
  }
}
