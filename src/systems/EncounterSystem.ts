import { GAME_CONFIG as C } from '../config/GameConfig';
import type { Entity, EnemyEntity, PlayerEntity, PlayerIntent, Direction } from '../types/entities';
import type { WorldData } from '../types/world';
import { canOccupy, moveWithCollision } from './CollisionSystem';

const VECTORS: Record<Direction, readonly [number, number]> = { N: [0,-1], NE: [Math.SQRT1_2,-Math.SQRT1_2], E: [1,0], SE: [Math.SQRT1_2,Math.SQRT1_2], S: [0,1], SW: [-Math.SQRT1_2,Math.SQRT1_2], W: [-1,0], NW: [-Math.SQRT1_2,-Math.SQRT1_2] };

/** Fixed-step encounter state. Created fresh for each world. */
export class EncounterSystem {
  private sequence = 0;
  private attackRemaining = 0;
  private comboRemaining = 0;
  private pendingStrike = false;
  private strikeDamage = 0;
  step(world: WorldData, p: PlayerEntity, entities: Entity[], intent: PlayerIntent, dt: number): void {
    const ms = dt * 1000;
    p.hurtTimerMs = Math.max(0, p.hurtTimerMs - ms);
    p.stats.mana = Math.min(p.stats.maxMana, p.stats.mana + C.player.manaRegenPerSec * dt);
    this.comboRemaining = Math.max(0, this.comboRemaining - ms);
    const enemies = entities.filter((e): e is EnemyEntity => e.kind === 'enemy' && e.alive);
    if (intent.attack && this.attackRemaining <= 0 && p.stats.stamina >= C.player.attackStaminaCost) {
      p.comboCount = this.comboRemaining > 0 ? (p.comboCount + 1) % 3 : 0;
      this.comboRemaining = C.combat.comboWindowMs; this.attackRemaining = 360; this.pendingStrike = true;
      this.strikeDamage = p.comboCount === 2 ? Math.floor(p.stats.baseDamage * 1.5) + 1 : p.stats.baseDamage;
      p.stats.stamina -= C.player.attackStaminaCost; p.animTimeMs = 0;
    }
    if (this.attackRemaining > 0) {
      this.attackRemaining -= ms; p.anim = 'attack'; p.animTimeMs = 360 - this.attackRemaining;
      if (this.pendingStrike && this.attackRemaining <= 240) {
        this.pendingStrike = false;
        const [fx, fy] = VECTORS[p.facing];
        for (const e of enemies) {
          const dx = e.x - p.x, dy = e.y - p.y, distance = Math.hypot(dx, dy);
          if (distance <= C.combat.autoHitRadiusTiles || (distance <= C.combat.attackRangeTiles && (dx * fx + dy * fy) / distance >= Math.cos(C.combat.angleToleranceRad))) this.hit(world, p, e, this.strikeDamage);
        }
      }
    }
    if (intent.skillQ && p.stats.mana >= C.combat.spin.manaCost) {
      p.stats.mana -= C.combat.spin.manaCost;
      for (const e of enemies) if (Math.hypot(e.x - p.x, e.y - p.y) <= C.combat.spin.radiusTiles) this.hit(world, p, e, p.stats.baseDamage * 2);
    }
    if (intent.skillE && p.stats.mana >= C.combat.bolt.manaCost) {
      p.stats.mana -= C.combat.bolt.manaCost;
      const [fx, fy] = VECTORS[p.facing];
      entities.push({ id: `bolt-${this.sequence++}`, kind: 'projectile', projectileType: 'magic_bolt', ownerId: p.id,
        x: p.x, y: p.y, prevX: p.x, prevY: p.y, halfSize: 0.12, facing: p.facing, anim: 'idle', animTimeMs: 0, alive: true,
        vx: fx * C.combat.bolt.speedTilesPerSec, vy: fy * C.combat.bolt.speedTilesPerSec, damage: p.stats.baseDamage * 2, travelled: 0, maxDistance: 15 });
    }
    for (const shot of entities) if (shot.kind === 'projectile' && shot.alive) {
      shot.prevX = shot.x; shot.prevY = shot.y;
      const steps = Math.max(1, Math.ceil(Math.hypot(shot.vx, shot.vy) * dt / 0.15));
      for (let step = 0; step < steps && shot.alive; step++) {
        shot.x += shot.vx * dt / steps; shot.y += shot.vy * dt / steps;
        shot.travelled += Math.hypot(shot.vx, shot.vy) * dt / steps;
        if (!canOccupy(world, shot.x, shot.y, shot.halfSize) || shot.travelled >= shot.maxDistance) shot.alive = false;
        for (const enemy of enemies) if (enemy.alive && Math.hypot(enemy.x - shot.x, enemy.y - shot.y) < C.combat.bolt.hitRadiusTiles) {
          this.hit(world, p, enemy, shot.damage); shot.alive = false; break;
        }
      }
    }
    if (intent.potionHealth && p.inventory.healthPotions > 0 && p.stats.health < p.stats.maxHealth) {
      p.inventory.healthPotions--; p.stats.health = Math.min(p.stats.maxHealth, p.stats.health + C.player.healthPotionHeal);
    }
    for (const e of enemies) {
      e.prevX = e.x; e.prevY = e.y;
      e.hurtTimerMs = Math.max(0, e.hurtTimerMs - ms); e.attackCooldownMs = Math.max(0, e.attackCooldownMs - ms);
      if (!e.alive || !e.aggressive || e.hurtTimerMs > 0) continue;
      const dx = p.x - e.x, dy = p.y - e.y, distance = Math.hypot(dx, dy);
      e.facing = Math.abs(dx) > Math.abs(dy) ? dx > 0 ? 'E' : 'W' : dy > 0 ? 'S' : 'N';
      if (distance > 0.85 && distance < 10) {
        e.aiState = 'chase'; e.anim = 'walk';
        const speed = e.enemyType === 'beetle' ? 2.1 : 2.6;
        if (e.enemyType === 'ghost') { e.x += dx / distance * speed * dt; e.y += dy / distance * speed * dt; }
        else moveWithCollision(world, e, dx / distance * speed * dt, dy / distance * speed * dt);
      } else if (distance <= 0.85) {
        e.aiState = 'attack'; e.anim = 'attack';
        if (e.attackCooldownMs === 0 && p.hurtTimerMs === 0) {
          p.stats.health = Math.max(0, p.stats.health - 1); p.hurtTimerMs = 800; e.attackCooldownMs = 1000;
        }
      } else { e.aiState = 'idle'; e.anim = 'idle'; }
    }
    for (const e of entities) {
      if (e.kind === 'pickup' && e.alive && Math.hypot(e.x - p.x, e.y - p.y) < 0.7) {
        e.alive = false;
        if (e.pickupType === 'coin') p.stats.coins++;
        else if (e.pickupType === 'health_potion') p.inventory.healthPotions++;
        else if (e.pickupType === 'speed_potion') p.inventory.speedPotions++;
      }
      if (e.kind === 'portal') e.active = !entities.some(other => other.alive && ((other.kind === 'enemy' && other.enemyType !== 'ghost') || (other.kind === 'pickup' && other.pickupType === 'coin')));
    }
  }
  private hit(world: WorldData, p: PlayerEntity, e: EnemyEntity, damage: number): void {
    if (!e.alive || e.hurtTimerMs > 0) return;
    e.health = Math.max(0, e.health - damage); e.hurtTimerMs = e.enemyType === 'beetle' ? 800 : 250;
    if (e.enemyType !== 'beetle' && e.enemyType !== 'ghost') {
      const dx = e.x - p.x, dy = e.y - p.y, distance = Math.hypot(dx, dy) || 1;
      moveWithCollision(world, e, dx / distance * 0.6, dy / distance * 0.6);
    }
    if (e.health === 0) {
      e.alive = false; e.aiState = 'dead'; p.stats.xp += e.enemyType === 'beetle' ? 100 : 20;
      while (p.stats.xp >= p.stats.xpToNextLevel) {
        p.stats.xp -= p.stats.xpToNextLevel; p.stats.level++; p.stats.statPoints++;
        p.stats.xpToNextLevel = Math.floor(100 * 1.5 ** (p.stats.level - 1));
      }
    }
  }
}
