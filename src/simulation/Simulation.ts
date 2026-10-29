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
import { queryColliders, canOccupy } from '../systems/CollisionSystem';
import { floodFill } from '../world/pathfinding';
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
import { movePlayer } from '../systems/MovementSystem';

export class Simulation implements ISimulation {
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
    return this.weatherOverride ?? (!this.world.meta.isTutorial && Math.floor((this.elapsedMs + (this.world.meta.seed % 19) * 1000) / 30000) % 6 === 4 ? 'rain' : 'clear');
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
  onCut: ((x: number, y: number, propId?: number) => void) | null = null;
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
      id: `${kind}-${this.sequence++}`,
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
    world = prepareHilltopObjects(prepareEncounterWorld(world));
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
    this.director = new EncounterDirector(world, (type, x, y, id) => this.createEnemy(type, x, y, id), (kind) => this.onEncounterCue?.(kind));
    for (const s of world.enemySpawns) {
      // Forest boss/ghost spawn descriptors are migration evidence, not live spawn instructions.
      if (!world.meta.isTutorial && (s.type === 'beetle' || s.type === 'ghost')) continue;
      const enemy = this.createEnemy(s.type, s.x + 0.5, s.y + 0.5);
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
      });
    this.entities.push({
      ...this.base('portal', world.portal.x + 0.5, world.portal.y + 0.5),
      kind: 'portal',
      active: false,
      portalState: 'locked',
      roundComplete: false,
      entryEligible: false,
    });
  }
  step(dt: number, intent: PlayerIntent): void {
    if (!Number.isFinite(dt) || dt <= 0) return;
    this.elapsedMs += dt * 1000;
    this.time = (this.time + dt / C.dayNight.cycleSec) % 1;
    this.moisture.step(dt * 1000, this.getWeather() === 'rain' || this.getWeather() === 'storm');
    const night = this.time >= C.dayNight.nightStart || this.time < C.dayNight.nightEnd;
    movePlayer(
      this.world,
      this.player,
      this.invertY ? { ...intent, moveY: -intent.moveY } : intent,
      dt,
      this.sensitivity,
    );
    this.director.step(this.player, this.entities, intent, dt, night, this.encounters.getNavigationDebug());
    this.encounters.step(this.world, this.player, this.entities, intent, dt);
    this.director.afterCombat(this.player, this.entities);
    this.portal.step(this.player, this.entities, dt, this.director.pendingBosses(this.entities));
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
    return { moisture: this.moisture.save(), rngState: this.encounters.getRandomState(), encounters: structuredClone(this.director.state) };
  }
  getEncounterDebug() { return { sites: this.director.getSites(), ...structuredClone(this.director.state) }; }
  clearEncounters(bossesOnly = false): void { this.director.clear(this.entities, bossesOnly); }
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
      return this.director.requestSpawn(type, this.player, this.entities, this.time < C.dayNight.nightEnd || this.time >= C.dayNight.nightStart);
    return this.createEnemy(type, x, y).id;
  }
  private createEnemy(type: EnemyType, x: number, y: number, id?: string): import('../types/entities').EnemyEntity {
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
  restoreLegacyEnemies(health: readonly { health: number; maxHealth: number }[], portalComplete = false): void {
    this.entities = this.entities.filter((e) => e.kind !== 'enemy');
    this.world.enemySpawns.forEach((spawn, index) => {
      const enemy = this.createEnemy(spawn.type, spawn.x + 0.5, spawn.y + 0.5);
      const saved = health[index];
      if (saved) { enemy.health = saved.health; enemy.maxHealth = saved.maxHealth; enemy.alive = saved.health > 0; }
    });
    const portal = this.entities.find((e) => e.kind === 'portal');
    if (portal?.kind === 'portal' && portalComplete) { portal.active = true; portal.roundComplete = true; }
    // A legacy boss saved inside a newly solid face may have been repaired above.
    // Adopt that repaired home rather than dropping the actor on a cramped map.
    if (!this.director.getSites().some((s) => s.kind === 'nest') && this.entities.some((e) => e.kind === 'enemy' && e.enemyType === 'beetle')) {
      const { encounterSites: _sites, ...oldWorld } = this.world;
      this.world = prepareEncounterWorld(oldWorld, this.entities);
      this.director = new EncounterDirector(this.world, (type, x, y, id) => this.createEnemy(type, x, y, id), (kind) => this.onEncounterCue?.(kind));
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
  buildRenderSnapshot(): RenderSnapshot {
    const darkness = Math.max(0, Math.cos(this.time * Math.PI * 2)) * 0.8;
    return {
      world: this.world,
      moisture: this.moisture,
      elapsedMs: this.elapsedMs,
      encounters: this.director.presentation(this.player, this.entities),
      worldVersion: this.worldVersion,
      playerId: this.player.id,
      entities: this.entities
        .filter((e) => e.alive || (e.kind === 'enemy' && e.anim === 'death' && e.animTimeMs < 450))
        .map((e) => ({
          ...e,
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
