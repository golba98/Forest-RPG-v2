import { GAME_CONFIG as C } from '../config/GameConfig';
import type { Entity, EntityBase, EnemyType, PlayerEntity, PlayerIntent } from '../types/entities';
import type { RenderSnapshot } from '../types/render';
import type { ISimulation } from '../types/simulation';
import type { WorldData } from '../types/world';
import { generateTutorialWorld } from '../world/TutorialMap';
import { EncounterSystem } from '../systems/EncounterSystem';
import { movePlayer } from '../systems/MovementSystem';

export class Simulation implements ISimulation {
  world!: WorldData;
  player!: PlayerEntity;
  worldVersion = 0;
  elapsedMs = 0;
  private time = 0.3;
  private entities: Entity[] = [];
  private sequence = 0;
  private encounters = new EncounterSystem();
  constructor() { this.loadWorld(generateTutorialWorld()); }
  private base(kind: EntityBase['kind'], x: number, y: number): EntityBase {
    return { id: `${kind}-${this.sequence++}`, kind, x, y, prevX: x, prevY: y, halfSize: 0.3, facing: 'S', anim: 'idle', animTimeMs: 0, alive: true };
  }
  loadWorld(world: WorldData): void {
    this.encounters = new EncounterSystem();
    this.world = world; this.worldVersion++; this.elapsedMs = 0; this.time = 0.3; this.entities = [];
    this.player = { ...this.base('player', world.spawn.x + 0.5, world.spawn.y + 0.5), kind: 'player', vx: 0, vy: 0,
      stats: { health: 7, maxHealth: 7, mana: 100, maxMana: 100, stamina: 100, maxStamina: 100, level: 1, xp: 0, xpToNextLevel: 100, statPoints: 0, baseDamage: 1, coins: 0 },
      inventory: { healthPotions: 0, speedPotions: 0 }, isSprinting: false, sprintLockoutMs: 0, isJumping: false, jumpProgress: 0, isDashing: false, hurtTimerMs: 0, comboCount: 0, speedBuffMs: 0 };
    this.entities.push(this.player);
    for (const s of world.enemySpawns) {
      const id = this.spawnEnemy(s.type, s.x + 0.5, s.y + 0.5);
      const enemy = this.entities.find(e => e.id === id);
      if (enemy?.kind === 'enemy') { enemy.aggressive = s.aggressive ?? true; enemy.health = enemy.maxHealth = s.maxHealth ?? enemy.maxHealth; }
    }
    for (const s of world.pickupSpawns) this.entities.push({ ...this.base('pickup', s.x + 0.5, s.y + 0.5), kind: 'pickup', pickupType: s.type });
    this.entities.push({ ...this.base('portal', world.portal.x + 0.5, world.portal.y + 0.5), kind: 'portal', active: false });
  }
  step(dt: number, intent: PlayerIntent): void {
    this.elapsedMs += dt * 1000; this.time = (this.time + dt / C.dayNight.cycleSec) % 1;
    movePlayer(this.world, this.player, intent, dt);
    this.encounters.step(this.world, this.player, this.entities, intent, dt);
    this.entities = this.entities.filter(e => e.kind !== 'projectile' || e.alive);
    for (const e of this.entities) if (e !== this.player) e.animTimeMs += dt * 1000;
  }
  getEntities(): readonly Entity[] { return this.entities; }
  setPlayerPosition(x: number, y: number): void { this.player.x = this.player.prevX = x; this.player.y = this.player.prevY = y; }
  spawnEnemy(type: EnemyType, x: number, y: number): string {
    const e = { ...this.base('enemy', x, y), kind: 'enemy' as const, enemyType: type, health: type === 'beetle' ? 15 : 3, maxHealth: type === 'beetle' ? 15 : 3, aiState: 'idle' as const, aggressive: true, hurtTimerMs: 0, attackCooldownMs: 0 };
    this.entities.push(e); return e.id;
  }
  setTimeOfDay(ratio: number): void { this.time = ((ratio % 1) + 1) % 1; }
  getTimeOfDay(): number { return this.time; }
  buildRenderSnapshot(): RenderSnapshot {
    const darkness = Math.max(0, Math.cos(this.time * Math.PI * 2)) * 0.8;
    return { world: this.world, worldVersion: this.worldVersion, playerId: this.player.id,
      entities: this.entities.filter(e => e.alive).map(e => ({ ...e, spriteKey: e.kind === 'enemy' ? e.enemyType : e.kind === 'pickup' ? e.pickupType : e.kind, lift: 0, alpha: 1, hurtFlash: (e.kind === 'player' || e.kind === 'enemy') && e.hurtTimerMs > 0 })),
      environment: { timeOfDay: this.time, darkness, weather: 'clear', lights: [{ x: this.player.x, y: this.player.y, radiusPx: 520 - darkness / 0.8 * 290, color: 0xffdd99, intensity: 1 }] } };
  }
}
