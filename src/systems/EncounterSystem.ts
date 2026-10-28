import { findPath } from '../world/pathfinding';
import { TILE_PROPERTIES, Tile, type TileId } from '../types/tiles';
import { awardXp } from './ProgressionSystem';
import { Rng } from '../world/Rng';
import { GAME_CONFIG as C } from '../config/GameConfig';
import type { Entity, EnemyEntity, PlayerEntity, PlayerIntent, Direction } from '../types/entities';
import type { WorldData } from '../types/world';
import { canOccupy, moveWithCollision } from './CollisionSystem';

const VECTORS: Record<Direction, readonly [number, number]> = { N: [0,-1], NE: [Math.SQRT1_2,-Math.SQRT1_2], E: [1,0], SE: [Math.SQRT1_2,Math.SQRT1_2], S: [0,1], SW: [-Math.SQRT1_2,Math.SQRT1_2], W: [-1,0], NW: [-Math.SQRT1_2,-Math.SQRT1_2] };

export type CombatFeedback = 'swing' | 'spin' | 'bolt' | 'hurt' | 'coin' | 'level' | 'crush';

/** Fixed-step encounter state. Created fresh for each world. */
export class EncounterSystem {
  constructor(private readonly onHit?: (enemy: EnemyEntity, damage: number) => void, private readonly rng = new Rng(0), private readonly onFeedback?: (kind: CombatFeedback, p: PlayerEntity, enemy?: EnemyEntity) => void, private readonly onCut?: (x: number, y: number, propId?: number) => void) {}
  setSequence(sequence: number): void { this.sequence = Math.max(this.sequence, sequence); }
  getRandomState(): number { return this.rng.getState(); }
  setRandomState(state: number): void { this.rng.setState(state); }
  private sequence = 0;
  private panicking = new Map<string, number>();
  private panicked = new Set<string>();
  private bossPaths = new Map<string, { remaining: number; stuck: number; path: Array<{ x: number; y: number }> }>();
  private lunge = new Map<string, number>();
  private attackRemaining = 0;
  private sinceDamageMs = 0;
  private regenMs = 0;
  private comboRemaining = 0;
  private pendingStrike = false;
  private strikeDamage = 0;
  step(world: WorldData, p: PlayerEntity, entities: Entity[], intent: PlayerIntent, dt: number): void {
    const ms = dt * 1000;
    this.sinceDamageMs += ms;
    if (this.sinceDamageMs >= C.player.healthRegenDelayMs && p.stats.health < p.stats.maxHealth) {
      this.regenMs += ms;
      if (this.regenMs >= C.player.healthRegenIntervalMs) { p.stats.health++; this.regenMs -= C.player.healthRegenIntervalMs; }
    }
    p.speedBuffMs = Math.max(0, p.speedBuffMs - ms);
    if (intent.potionSpeed && p.inventory.speedPotions > 0) { p.inventory.speedPotions--; p.speedBuffMs = C.player.speedPotionDurationMs; }
    p.hurtTimerMs = Math.max(0, p.hurtTimerMs - ms);
    p.stats.mana = Math.min(p.stats.maxMana, p.stats.mana + C.player.manaRegenPerSec * dt);
    this.comboRemaining = Math.max(0, this.comboRemaining - ms);
    if (this.comboRemaining === 0 && this.attackRemaining <= 0) p.comboCount = 0;
    const enemies = entities.filter((e): e is EnemyEntity => e.kind === 'enemy' && e.alive);
    if (intent.attack && this.attackRemaining <= 0 && p.stats.stamina >= C.player.attackStaminaCost) {
      const comboHit = this.comboRemaining > 0 ? p.comboCount + 1 : 1;
      p.comboCount = comboHit >= 3 ? 0 : comboHit;
      this.comboRemaining = C.combat.comboWindowMs; this.attackRemaining = 360; this.pendingStrike = true;
      this.strikeDamage = comboHit === 3 ? Math.floor(p.stats.baseDamage * 1.5) + 1 : p.stats.baseDamage;
      p.stats.stamina -= C.player.attackStaminaCost; p.animTimeMs = 0; this.onFeedback?.('swing', p);
    }
    if (this.attackRemaining > 0) {
      this.attackRemaining -= ms; p.anim = 'attack'; p.animTimeMs = 360 - this.attackRemaining;
      if (this.pendingStrike && this.attackRemaining <= 240) {
        this.pendingStrike = false;
        const [fx, fy] = VECTORS[p.facing];
        for (const e of enemies) {
          const dx = e.x - p.x, dy = e.y - p.y, distance = Math.hypot(dx, dy);
          if (distance <= C.combat.autoHitRadiusTiles || (distance <= C.combat.attackRangeTiles && (dx * fx + dy * fy) / distance >= Math.cos(C.combat.angleToleranceRad))) this.hit(world, p, e, this.strikeDamage, entities);
        }
        this.cutFlowers(world, p, entities, fx, fy);
      }
    }
    if (intent.skillQ && p.stats.mana >= C.combat.spin.manaCost) {
      p.stats.mana -= C.combat.spin.manaCost; this.onFeedback?.('spin', p);
      for (const e of enemies) if (Math.hypot(e.x - p.x, e.y - p.y) <= C.combat.spin.radiusTiles) this.hit(world, p, e, p.stats.baseDamage * 2, entities);
    }
    if (intent.skillE && p.stats.mana >= C.combat.bolt.manaCost) {
      p.stats.mana -= C.combat.bolt.manaCost; this.onFeedback?.('bolt', p);
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
        if (shot.ownerId !== p.id && Math.hypot(p.x - shot.x, p.y - shot.y) < 0.5) {
          shot.alive = false;
          if (p.hurtTimerMs === 0) { p.stats.health = Math.max(0, p.stats.health - shot.damage); p.hurtTimerMs = 800; this.onFeedback?.('hurt', p); this.sinceDamageMs = 0; this.regenMs = 0; }
        }
        for (const enemy of enemies) if (shot.ownerId === p.id && enemy.alive && Math.hypot(enemy.x - shot.x, enemy.y - shot.y) < C.combat.bolt.hitRadiusTiles) {
          this.hit(world, p, enemy, shot.damage, entities); shot.alive = false; break;
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
      if ((e.enemyType === 'mantis' || e.enemyType === 'maggot') && e.health <= 1 && !this.panicked.has(e.id)) { this.panicked.add(e.id); this.panicking.set(e.id, 4000); }
      const panic = this.panicking.get(e.id) ?? 0;
      if (panic > 0 && distance > 0) {
        this.panicking.set(e.id, Math.max(0, panic - ms)); e.aiState = 'flee'; e.anim = 'run';
        moveWithCollision(world, e, -dx / distance * 3.3 * dt, -dy / distance * 3.3 * dt); continue;
      }
      if (e.enemyType === 'beetle') { this.moveBoss(world, e, p, distance, dt); continue; }

      if (e.enemyType === 'maggot' && distance < 7 && distance > 0.85 && e.attackCooldownMs === 0) {
        e.aiState = 'attack'; e.anim = 'attack'; e.attackCooldownMs = 1800;
        entities.push({ id: `acid-${this.sequence++}`, kind: 'projectile', projectileType: 'acid', ownerId: e.id,
          x: e.x, y: e.y, prevX: e.x, prevY: e.y, halfSize: 0.12, facing: e.facing, anim: 'idle', animTimeMs: 0, alive: true,
          vx: dx / distance * 9, vy: dy / distance * 9, damage: 1, travelled: 0, maxDistance: 10 });
      } else if (e.enemyType === 'maggot' && distance < 2.5 && distance > 0.85) {
        e.aiState = 'flee'; e.anim = 'run'; moveWithCollision(world, e, -dx / distance * 2.1 * dt, -dy / distance * 2.1 * dt);
      } else if (distance > 0.85 && distance < 10) {
        e.aiState = 'chase'; e.anim = 'walk';
        const speed = 2.6;
        if (e.enemyType === 'ghost') { e.x += dx / distance * speed * dt; e.y += dy / distance * speed * dt; }
        else moveWithCollision(world, e, dx / distance * speed * dt, dy / distance * speed * dt);
      } else if (distance <= 0.85) {
        e.aiState = 'attack'; e.anim = 'attack';
        if (e.attackCooldownMs === 0 && p.hurtTimerMs === 0) {
          p.stats.health = Math.max(0, p.stats.health - 1); p.hurtTimerMs = 800; this.onFeedback?.('hurt', p); e.attackCooldownMs = 1000; this.sinceDamageMs = 0; this.regenMs = 0;
        }
      } else { e.aiState = 'idle'; e.anim = 'idle'; }
    }
    for (const e of entities) {
      if (e.kind === 'pickup' && e.alive && Math.hypot(e.x - p.x, e.y - p.y) < 0.7) {
        e.alive = false;
        if (e.pickupType === 'coin') { p.stats.coins++; this.onFeedback?.('coin', p); }
        else if (e.pickupType === 'health_potion') p.inventory.healthPotions++;
        else if (e.pickupType === 'speed_potion') p.inventory.speedPotions++;
      }
      if (e.kind === 'portal') e.active = !entities.some(other => other.alive && ((other.kind === 'enemy' && other.enemyType !== 'ghost') || (other.kind === 'pickup' && other.pickupType === 'coin')));
    }
  }
  private cutFlowers(world: WorldData, p: PlayerEntity, entities: Entity[], fx: number, fy: number): void {
    const inReach = (x: number, y: number) => {
      const dx = x - p.x, dy = y - p.y, distance = Math.hypot(dx, dy);
      return distance <= C.combat.attackRangeTiles && (distance < 0.4 || (dx * fx + dy * fy) / distance >= Math.cos(C.combat.angleToleranceRad));
    };
    const drop = (x: number, y: number) => {
      if (!this.rng.chance(C.combat.lootDropChance)) return;
      entities.push({ id: `loot-${this.sequence++}`, kind: 'pickup', pickupType: this.rng.chance(C.combat.lootHealthShare) ? 'health_potion' : 'speed_potion', x, y, prevX: x, prevY: y, halfSize: 0.2, facing: 'S', anim: 'idle', animTimeMs: 0, alive: true });
    };
    for (let y = Math.max(0, Math.floor(p.y - 2)); y <= Math.min(world.meta.height - 1, Math.floor(p.y + 2)); y++) {
      for (let x = Math.max(0, Math.floor(p.x - 2)); x <= Math.min(world.meta.width - 1, Math.floor(p.x + 2)); x++) {
        const index = y * world.meta.width + x;
        if (world.tiles[index] === Tile.FLOWERS && inReach(x + 0.5, y + 0.5)) {
          world.tiles[index] = Tile.GRASS; drop(x + 0.5, y + 0.5); this.onCut?.(x, y);
        }
      }
    }
    const props = world.props as import('../types/world').WorldProp[];
    for (let i = props.length - 1; i >= 0; i--) {
      const prop = props[i];
      if (prop && prop.kind.startsWith('flower_') && inReach(prop.tileX + 0.5, prop.tileY + 0.5)) {
        props.splice(i, 1); drop(prop.tileX + 0.5, prop.tileY + 0.5); this.onCut?.(prop.tileX, prop.tileY, prop.id);
      }
    }
  }
  private moveBoss(world: WorldData, e: EnemyEntity, p: PlayerEntity, distance: number, dt: number): void {
    const ms = dt * 1000;
    let state = this.bossPaths.get(e.id);
    if (!state) { state = { remaining: 0, stuck: 0, path: [] }; this.bossPaths.set(e.id, state); }
    let lunge = Math.max(0, (this.lunge.get(e.id) ?? 0) - ms);
    if (distance < 3.5 && distance > 0.8 && e.attackCooldownMs === 0) { lunge = 450; e.attackCooldownMs = 1800; }
    this.lunge.set(e.id, lunge);
    const dx = p.x - e.x, dy = p.y - e.y;
    if (distance < 1.0) {
      e.aiState = 'attack'; e.anim = 'attack';
      if (p.hurtTimerMs === 0 && (lunge > 0 || e.attackCooldownMs === 0)) { p.stats.health = Math.max(0, p.stats.health - 1); p.hurtTimerMs = 800; this.onFeedback?.('hurt', p); e.attackCooldownMs = 1200; this.sinceDamageMs = 0; this.regenMs = 0; }
      return;
    }
    state.remaining -= ms;
    if (state.remaining <= 0 && lunge <= 0) {
      const passable = (x: number, y: number) => {
        const tile = world.tiles[y * world.meta.width + x] as TileId;
        return !(TILE_PROPERTIES[tile]?.blocksMobs ?? true) && canOccupy(world, x + 0.5, y + 0.5, e.halfSize);
      };
      state.path = findPath(world.meta, { x: Math.floor(e.x), y: Math.floor(e.y) }, { x: Math.floor(p.x), y: Math.floor(p.y) }, passable, 4000) ?? [];
      state.remaining = 700;
    }
    while (state.path.length && Math.hypot(e.x - ((state.path[0]?.x ?? 0) + 0.5), e.y - ((state.path[0]?.y ?? 0) + 0.5)) < 0.2) state.path.shift();
    const target = lunge > 0 ? null : state.path[0];
    const tx = target ? target.x + 0.5 - e.x : dx, ty = target ? target.y + 0.5 - e.y : dy;
    const length = Math.hypot(tx, ty) || 1, speed = lunge > 0 ? 5 : 2.1;
    const oldX = e.x, oldY = e.y;
    e.aiState = lunge > 0 ? 'attack' : 'chase'; e.anim = lunge > 0 ? 'attack' : 'walk';
    moveWithCollision(world, e, tx / length * speed * dt, ty / length * speed * dt);
    state.stuck = Math.hypot(e.x - oldX, e.y - oldY) < 0.001 ? state.stuck + ms : 0;
    if (state.stuck >= 4000) {
      for (const [ox, oy] of [[3,0],[-3,0],[0,3],[0,-3]] as const) {
        const x = p.x + ox, y = p.y + oy;
        if (canOccupy(world, x, y, e.halfSize)) { e.x = e.prevX = x; e.y = e.prevY = y; break; }
      }
      state.stuck = 0; state.remaining = 0;
    }
  }
  private hit(world: WorldData, p: PlayerEntity, e: EnemyEntity, damage: number, entities: Entity[]): void {
    if (!e.alive || e.hurtTimerMs > 0) return;
    e.health = Math.max(0, e.health - damage); this.onHit?.(e, damage); e.hurtTimerMs = e.enemyType === 'beetle' ? 800 : 250;
    if (e.enemyType !== 'beetle' && e.enemyType !== 'ghost') {
      const dx = e.x - p.x, dy = e.y - p.y, distance = Math.hypot(dx, dy) || 1;
      const oldX = e.x, oldY = e.y;
      moveWithCollision(world, e, dx / distance * C.combat.enemyKnockbackTiles, dy / distance * C.combat.enemyKnockbackTiles);
      if (Math.hypot(e.x - oldX, e.y - oldY) < C.combat.enemyKnockbackTiles * 0.5) { e.health = 0; this.onFeedback?.('crush', p, e); }
    }
    if (e.health === 0) {
      e.alive = false; e.aiState = 'dead';
      if (this.rng.chance(C.combat.lootDropChance)) entities.push({ id: `loot-${this.sequence++}`, kind: 'pickup', pickupType: this.rng.chance(C.combat.lootHealthShare) ? 'health_potion' : 'speed_potion', x: e.x, y: e.y, prevX: e.x, prevY: e.y, halfSize: 0.2, facing: 'S', anim: 'idle', animTimeMs: 0, alive: true });
      const oldLevel = p.stats.level; awardXp(p.stats, e.enemyType === 'beetle' ? 100 : 20); if (p.stats.level > oldLevel) this.onFeedback?.('level', p);
    }
  }
}
