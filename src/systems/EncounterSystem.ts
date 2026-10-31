import { EnemyAISystem } from './EnemyAISystem';
import { Tile } from '../types/tiles';
import { awardXp } from './ProgressionSystem';
import { Rng } from '../world/Rng';
import { GAME_CONFIG as C } from '../config/GameConfig';
import type { Entity, EnemyEntity, PlayerEntity, PlayerIntent, PlayerAttackView } from '../types/entities';
import { directionFromVector, DIRECTION_VECTORS as VECTORS } from '../core/math/Direction';
import type { WorldData } from '../types/world';
import { canOccupy, hasClearPath, moveWithCollision, invalidatePropIndex } from './CollisionSystem';

export type CombatFeedback = 'swing' | 'spin' | 'bolt' | 'hurt' | 'coin' | 'level' | 'crush';

/** 8-way facing for a direction vector. */
export const facingToward = directionFromVector;

const ATTACK_DURATION_MS = 360;
const STRIKE_AT_MS = 120;

interface PlayerAttack extends PlayerAttackView {
  elapsedMs: number;
  pendingStrike: boolean;
  readonly damage: number;
}

/** Bolt aim assist only kicks in when nothing is within this cone of the facing. */
const BOLT_ASSIST_CONE_RAD = 0.45;
const BOLT_ASSIST_RANGE_TILES = 8;

/** Fixed-step encounter state. Created fresh for each world. */
export class EncounterSystem {
  constructor(
    private readonly onHit?: (enemy: EnemyEntity, damage: number) => void,
    private readonly rng = new Rng(0),
    private readonly onFeedback?: (
      kind: CombatFeedback,
      p: PlayerEntity,
      enemy?: EnemyEntity,
    ) => void,
    private readonly onCut?: (x: number, y: number, propId?: number) => void,
    private readonly claimDefeat?: (enemy: EnemyEntity) => boolean,
  ) {}
  setSequence(sequence: number): void {
    this.sequence = Math.max(this.sequence, sequence);
  }
  getRandomState(): number {
    return this.rng.getState();
  }
  setRandomState(state: number): void {
    this.rng.setState(state);
  }
  private sequence = 0;
  private ai = new EnemyAISystem();
  getNavigationDebug() {
    return this.ai.debug();
  }
  private attack: PlayerAttack | null = null;
  getPlayerAttack(): PlayerAttackView | null {
    return this.attack ? { direction: this.attack.direction, elapsedMs: this.attack.elapsedMs } : null;
  }
  resetPlayerAttack(): void {
    this.attack = null;
    this.comboRemaining = 0;
  }
  private sinceDamageMs = 0;
  private regenMs = 0;
  private comboRemaining = 0;
  step(
    world: WorldData,
    p: PlayerEntity,
    entities: Entity[],
    intent: PlayerIntent,
    dt: number,
  ): void {
    const ms = dt * 1000;
    this.sinceDamageMs += ms;
    if (this.sinceDamageMs >= C.player.healthRegenDelayMs && p.stats.health < p.stats.maxHealth) {
      this.regenMs += ms;
      if (this.regenMs >= C.player.healthRegenIntervalMs) {
        p.stats.health++;
        this.regenMs -= C.player.healthRegenIntervalMs;
      }
    }
    p.speedBuffMs = Math.max(0, p.speedBuffMs - ms);
    if (intent.potionSpeed && p.inventory.speedPotions > 0) {
      p.inventory.speedPotions--;
      p.speedBuffMs = C.player.speedPotionDurationMs;
    }
    p.hurtTimerMs = Math.max(0, p.hurtTimerMs - ms);
    p.stats.mana = Math.min(p.stats.maxMana, p.stats.mana + C.player.manaRegenPerSec * dt);
    this.comboRemaining = Math.max(0, this.comboRemaining - ms);
    if (this.comboRemaining === 0 && !this.attack) p.comboCount = 0;
    const enemies = entities.filter((e): e is EnemyEntity => e.kind === 'enemy' && e.alive && e.combatReady !== false);
    if (
      intent.attack &&
      !this.attack &&
      p.stats.stamina >= C.player.attackStaminaCost
    ) {
      const comboHit = this.comboRemaining > 0 ? p.comboCount + 1 : 1;
      p.comboCount = comboHit >= 3 ? 0 : comboHit;
      this.comboRemaining = C.combat.comboWindowMs;
      p.stats.stamina -= C.player.attackStaminaCost;
      // Movement intent wins even when collision prevents displacement. Aim
      // assist remains useful when stationary, but never redirects a moving punch.
      if (intent.moveX === 0 && intent.moveY === 0)
        this.aimAt(world, p, enemies, C.combat.attackRangeTiles, C.combat.angleToleranceRad);
      this.attack = {
        direction: directionFromVector(intent.moveX, intent.moveY, p.facing),
        elapsedMs: 0,
        pendingStrike: true,
        damage: comboHit === 3 ? Math.floor(p.stats.baseDamage * 1.5) + 1 : p.stats.baseDamage,
      };
      this.onFeedback?.('swing', p);
    }
    const attack = this.attack;
    if (attack) {
      attack.elapsedMs += ms;
      if (attack.pendingStrike && attack.elapsedMs >= STRIKE_AT_MS) {
        attack.pendingStrike = false;
        const [fx, fy] = VECTORS[attack.direction];
        for (const e of enemies) {
          const dx = e.x - p.x,
            dy = e.y - p.y,
            distance = Math.hypot(dx, dy);
          if (
            distance <= C.combat.autoHitRadiusTiles ||
            (distance <= C.combat.attackRangeTiles &&
              (dx * fx + dy * fy) / distance >= Math.cos(C.combat.angleToleranceRad))
          )
            this.hit(world, p, e, attack.damage, entities);
        }
        this.cutFlowers(world, p, entities, fx, fy);
      }
      if (attack.elapsedMs >= ATTACK_DURATION_MS) this.attack = null;
    }
    if (intent.skillQ && p.stats.mana >= C.combat.spin.manaCost) {
      p.stats.mana -= C.combat.spin.manaCost;
      this.onFeedback?.('spin', p);
      for (const e of enemies)
        if (Math.hypot(e.x - p.x, e.y - p.y) <= C.combat.spin.radiusTiles)
          this.hit(world, p, e, p.stats.baseDamage * 2, entities);
    }
    if (intent.skillE && p.stats.mana >= C.combat.bolt.manaCost) {
      p.stats.mana -= C.combat.bolt.manaCost;
      const target = this.aimAt(world, p, enemies, BOLT_ASSIST_RANGE_TILES, BOLT_ASSIST_CONE_RAD);
      this.onFeedback?.('bolt', p);
      let [fx, fy] = VECTORS[p.facing];
      if (target) {
        const d = Math.hypot(target.x - p.x, target.y - p.y) || 1;
        fx = (target.x - p.x) / d;
        fy = (target.y - p.y) / d;
      }
      entities.push({
        id: `bolt-${this.sequence++}`,
        kind: 'projectile',
        projectileType: 'magic_bolt',
        ownerId: p.id,
        x: p.x,
        y: p.y,
        prevX: p.x,
        prevY: p.y,
        halfSize: 0.12,
        facing: p.facing,
        anim: 'idle',
        animTimeMs: 0,
        alive: true,
        vx: fx * C.combat.bolt.speedTilesPerSec,
        vy: fy * C.combat.bolt.speedTilesPerSec,
        damage: p.stats.baseDamage * 2,
        travelled: 0,
        maxDistance: 15,
      });
    }
    for (const shot of entities)
      if (shot.kind === 'projectile' && shot.alive) {
        shot.prevX = shot.x;
        shot.prevY = shot.y;
        const steps = Math.max(1, Math.ceil((Math.hypot(shot.vx, shot.vy) * dt) / 0.15));
        for (let step = 0; step < steps && shot.alive; step++) {
          shot.x += (shot.vx * dt) / steps;
          shot.y += (shot.vy * dt) / steps;
          shot.travelled += (Math.hypot(shot.vx, shot.vy) * dt) / steps;
          if (
            !canOccupy(world, shot.x, shot.y, shot.halfSize) ||
            shot.travelled >= shot.maxDistance
          ) {
            shot.alive = false;
            break;
          }
          if (shot.ownerId !== p.id && Math.hypot(p.x - shot.x, p.y - shot.y) < 0.5) {
            shot.alive = false;
            if (p.hurtTimerMs === 0) {
              p.stats.health = Math.max(0, p.stats.health - shot.damage);
              p.hurtTimerMs = 800;
              this.onFeedback?.('hurt', p);
              this.sinceDamageMs = 0;
              this.regenMs = 0;
            }
          }
          for (const enemy of enemies)
            if (
              shot.ownerId === p.id &&
              enemy.alive &&
              Math.hypot(enemy.x - shot.x, enemy.y - shot.y) < C.combat.bolt.hitRadiusTiles
            ) {
              this.hit(world, p, enemy, shot.damage, entities, false);
              shot.alive = false;
              break;
            }
        }
      }
    if (
      intent.potionHealth &&
      p.inventory.healthPotions > 0 &&
      p.stats.health < p.stats.maxHealth
    ) {
      p.inventory.healthPotions--;
      p.stats.health = Math.min(p.stats.maxHealth, p.stats.health + C.player.healthPotionHeal);
    }
    this.ai.step(world, p, entities.filter((e): e is EnemyEntity => e.kind === 'enemy' && e.alive), dt, {
      hurt: () => {
        if (p.hurtTimerMs === 0) {
          p.stats.health = Math.max(0, p.stats.health - 1);
          p.hurtTimerMs = 800;
          this.onFeedback?.('hurt', p);
          this.sinceDamageMs = 0;
          this.regenMs = 0;
        }
      },
      shoot: (e, dx, dy) =>
        entities.push({
          id: `acid-${this.sequence++}`,
          kind: 'projectile',
          projectileType: 'acid',
          ownerId: e.id,
          x: e.x,
          y: e.y,
          prevX: e.x,
          prevY: e.y,
          halfSize: 0.12,
          facing: e.facing,
          anim: 'idle',
          animTimeMs: 0,
          alive: true,
          vx: dx * 9,
          vy: dy * 9,
          damage: 1,
          travelled: 0,
          maxDistance: 10,
        }),
    });
    for (const e of entities) {
      if (e.kind === 'pickup' && e.alive && Math.hypot(e.x - p.x, e.y - p.y) < 0.7) {
        e.alive = false;
        if (e.pickupType === 'coin') {
          p.stats.coins++;
          this.onFeedback?.('coin', p);
        } else if (e.pickupType === 'health_potion') p.inventory.healthPotions++;
        else if (e.pickupType === 'speed_potion') p.inventory.speedPotions++;
      }
    }
  }
  /**
   * Aim assist: when no visible enemy within `reach` lies inside the facing
   * cone, turn the player toward the nearest visible one in reach. Returns the
   * enemy that was turned toward, if any.
   */
  private aimAt(
    world: WorldData,
    p: PlayerEntity,
    enemies: readonly EnemyEntity[],
    reach: number,
    cone: number,
  ): EnemyEntity | null {
    const [fx, fy] = VECTORS[p.facing];
    let nearest: EnemyEntity | null = null;
    let nearestDistance = Infinity;
    for (const e of enemies) {
      const dx = e.x - p.x,
        dy = e.y - p.y,
        distance = Math.hypot(dx, dy);
      if (distance > reach || !hasClearPath(world, p.x, p.y, e.x, e.y)) continue;
      if (distance > 1e-6 && (dx * fx + dy * fy) / distance >= Math.cos(cone)) return null;
      if (distance < nearestDistance) {
        nearest = e;
        nearestDistance = distance;
      }
    }
    if (nearest && nearestDistance > 1e-6) p.facing = facingToward(nearest.x - p.x, nearest.y - p.y);
    return nearest;
  }
  private cutFlowers(
    world: WorldData,
    p: PlayerEntity,
    entities: Entity[],
    fx: number,
    fy: number,
  ): void {
    const inReach = (x: number, y: number) => {
      const dx = x - p.x,
        dy = y - p.y,
        distance = Math.hypot(dx, dy);
      return (
        distance <= C.combat.attackRangeTiles &&
        (distance < 0.4 || (dx * fx + dy * fy) / distance >= Math.cos(C.combat.angleToleranceRad))
      );
    };
    const drop = (x: number, y: number) => {
      if (!this.rng.chance(C.combat.lootDropChance)) return;
      entities.push({
        id: `loot-${this.sequence++}`,
        kind: 'pickup',
        pickupType: this.rng.chance(C.combat.lootHealthShare) ? 'health_potion' : 'speed_potion',
        x,
        y,
        prevX: x,
        prevY: y,
        halfSize: 0.2,
        facing: 'S',
        anim: 'idle',
        animTimeMs: 0,
        alive: true,
      });
    };
    for (
      let y = Math.max(0, Math.floor(p.y - 2));
      y <= Math.min(world.meta.height - 1, Math.floor(p.y + 2));
      y++
    ) {
      for (
        let x = Math.max(0, Math.floor(p.x - 2));
        x <= Math.min(world.meta.width - 1, Math.floor(p.x + 2));
        x++
      ) {
        const index = y * world.meta.width + x;
        if (world.tiles[index] === Tile.FLOWERS && inReach(x + 0.5, y + 0.5)) {
          world.tiles[index] = Tile.GRASS;
          drop(x + 0.5, y + 0.5);
          this.onCut?.(x, y);
        }
      }
    }
    const props = world.props as import('../types/world').WorldProp[];
    let changedProps = false;
    for (let i = props.length - 1; i >= 0; i--) {
      const prop = props[i];
      if (prop && prop.kind.startsWith('flower_') && inReach(prop.tileX + 0.5, prop.tileY + 0.5)) {
        props.splice(i, 1);
        changedProps = true;
        drop(prop.tileX + 0.5, prop.tileY + 0.5);
        this.onCut?.(prop.tileX, prop.tileY, prop.id);
      }
    }
    if (changedProps) {
      invalidatePropIndex(world);
      this.ai.invalidate();
    }
  }
  private hit(
    world: WorldData,
    p: PlayerEntity,
    e: EnemyEntity,
    damage: number,
    entities: Entity[],
    requireLineOfSight = true,
  ): void {
    if (
      !e.alive ||
      e.combatReady === false ||
      e.hurtTimerMs > 0 ||
      (requireLineOfSight && !hasClearPath(world, p.x, p.y, e.x, e.y))
    )
      return;
    e.health = Math.max(0, e.health - damage);
    // Managed defeat, loot and XP must be committed before feedback observers can save.
    if (!e.encounterId) this.onHit?.(e, damage);
    e.hurtTimerMs = e.enemyType === 'beetle' ? 800 : 250;
    if (e.enemyType !== 'beetle' && e.enemyType !== 'ghost') {
      const dx = e.x - p.x,
        dy = e.y - p.y,
        distance = Math.hypot(dx, dy) || 1;
      const oldX = e.x,
        oldY = e.y;
      moveWithCollision(
        world,
        e,
        (dx / distance) * C.combat.enemyKnockbackTiles,
        (dy / distance) * C.combat.enemyKnockbackTiles,
        'groundEnemy',
      );
      if (Math.hypot(e.x - oldX, e.y - oldY) < C.combat.enemyKnockbackTiles * 0.5) {
        e.health = 0;
        this.onFeedback?.('crush', p, e);
      }
    }
    if (e.health === 0) {
      e.alive = false;
      e.aiState = 'dead';
      e.anim = 'death';
      e.animTimeMs = 0;
      if (this.claimDefeat && !this.claimDefeat(e)) return;
      if (this.rng.chance(C.combat.lootDropChance))
        entities.push({
          id: `loot-${this.sequence++}`,
          kind: 'pickup',
          pickupType: this.rng.chance(C.combat.lootHealthShare) ? 'health_potion' : 'speed_potion',
          x: e.x,
          y: e.y,
          prevX: e.x,
          prevY: e.y,
          halfSize: 0.2,
          facing: 'S',
          anim: 'idle',
          animTimeMs: 0,
          alive: true,
        });
      const oldLevel = p.stats.level;
      awardXp(p.stats, e.enemyType === 'beetle' ? 100 : 20);
      if (p.stats.level > oldLevel) this.onFeedback?.('level', p);
    }
    if (e.encounterId) this.onHit?.(e, damage);
  }
}
