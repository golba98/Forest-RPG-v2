import type { Direction, EnemyEntity, PlayerEntity } from '../types/entities';
import type { NavigationDebug, TraversalProfile } from '../types/gameplay';
import type { TilePoint, WorldData } from '../types/world';
import { findPath } from '../world/pathfinding';
import { canOccupy, hasClearPath, moveWithCollision } from './CollisionSystem';

interface Brain {
  home: TilePoint;
  target: TilePoint | null;
  memory: number;
  replan: number;
  path: TilePoint[];
  unreachable: boolean;
  stuck: number;
  windup: number;
  recovery: number;
  panic: number;
  panicked: boolean;
  aim: TilePoint;
  phase: 'none' | 'windup' | 'strike' | 'recover';
  lunge: number;
  struck: boolean;
}
export interface EnemyActions {
  hurt(): void;
  shoot(enemy: EnemyEntity, dx: number, dy: number): void;
}
/** Decisions and routes live per-world; no renderer or DOM dependencies. */
export class EnemyAISystem {
  private brains = new Map<string, Brain>();
  private clearance = new Map<string, Uint8Array>();
  private world: WorldData | null = null;
  private now = 0;
  private searches = 0;
  invalidate(): void {
    this.clearance.clear();
    for (const b of this.brains.values()) b.replan = 0;
  }
  debug(): NavigationDebug[] {
    return [...this.brains].map(([id, b]) => ({
      id,
      target: b.target ? { ...b.target } : null,
      path: b.path.map((p) => ({ ...p })),
      unreachable: b.unreachable,
    }));
  }
  private setState(e: EnemyEntity, state: EnemyEntity['aiState'], anim: EnemyEntity['anim']): void {
    if (e.aiState !== state || e.anim !== anim) e.animTimeMs = 0;
    e.aiState = state;
    e.anim = anim;
  }
  step(
    world: WorldData,
    p: PlayerEntity,
    enemies: EnemyEntity[],
    dt: number,
    actions: EnemyActions,
  ): void {
    if (this.world !== world) {
      this.world = world;
      this.brains.clear();
      this.clearance.clear();
      this.now = 0;
    }
    this.now += dt * 1000;
    this.searches = 0;
    const ids = new Set(enemies.filter((e) => e.alive).map((e) => e.id));
    for (const id of this.brains.keys()) if (!ids.has(id)) this.brains.delete(id);
    for (const e of enemies) {
      e.prevX = e.x;
      e.prevY = e.y;
      e.hurtTimerMs = Math.max(0, e.hurtTimerMs - dt * 1000);
      e.attackCooldownMs = Math.max(0, e.attackCooldownMs - dt * 1000);
      if (!e.alive) {
        this.setState(e, 'dead', 'death');
        continue;
      }
      let b = this.brains.get(e.id);
      if (!b) {
        b = {
          home: { x: e.x, y: e.y },
          target: null,
          memory: 0,
          replan: 0,
          path: [],
          unreachable: false,
          stuck: 0,
          windup: 0,
          recovery: 0,
          panic: 0,
          panicked: false,
          aim: { x: 0, y: 1 },
          phase: 'none',
          lunge: 0,
          struck: false,
        };
        this.brains.set(e.id, b);
      }
      b.replan -= dt * 1000;
      if (!e.aggressive) {
        this.setState(e, 'idle', 'idle');
        continue;
      }
      if (e.hurtTimerMs > 0) {
        b.windup = 0;
        b.lunge = 0;
        b.phase = 'none';
        this.setState(e, 'stunned', 'hurt');
        continue;
      }
      const ghost = e.enemyType === 'ghost',
        profile: TraversalProfile = ghost ? 'ghost' : 'groundEnemy';
      const dx = p.x - e.x,
        dy = p.y - e.y,
        distance = Math.hypot(dx, dy);
      const visible =
        distance <= (b.memory > 0 ? 12 : 10) && (ghost || hasClearPath(world, e.x, e.y, p.x, p.y));
      if (visible) {
        b.target = { x: p.x, y: p.y };
        b.memory = 2500;
      } else b.memory = Math.max(0, b.memory - dt * 1000);
      if (distance > 0.001)
        e.facing = (
          Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'E' : 'W') : dy > 0 ? 'S' : 'N'
        ) as Direction;
      if ((e.enemyType === 'mantis' || e.enemyType === 'maggot') && e.health <= 1 && !b.panicked) {
        b.panicked = true;
        b.panic = 4000;
      }
      if (b.panic > 0) {
        b.panic = Math.max(0, b.panic - dt * 1000);
        b.windup = 0;
        b.phase = 'none';
        this.setState(e, 'flee', 'run');
        this.flee(world, e, p, dt, 3.3, profile);
        continue;
      }
      if (b.recovery > 0) {
        b.recovery = Math.max(0, b.recovery - dt * 1000);
        b.phase = 'recover';
        this.setState(e, 'recover', 'idle');
        continue;
      }
      if (b.lunge > 0) {
        b.lunge = Math.max(0, b.lunge - dt * 1000);
        b.phase = 'strike';
        this.setState(e, 'attack', 'attack');
        moveWithCollision(world, e, b.aim.x * 5 * dt, b.aim.y * 5 * dt, profile);
        if (
          !b.struck &&
          Math.hypot(e.x - p.x, e.y - p.y) < 1 &&
          hasClearPath(world, e.x, e.y, p.x, p.y)
        ) {
          b.struck = true;
          actions.hurt();
        }
        if (b.lunge === 0) b.recovery = 350;
        continue;
      }
      if (b.windup > 0) {
        this.setState(e, 'attack', 'attack');
        b.windup = Math.max(0, b.windup - dt * 1000);
        if (b.windup === 0) {
          b.phase = 'strike';
          if (e.enemyType === 'beetle') {
            b.lunge = 450;
            b.struck = false;
          } else {
            if (visible && e.enemyType === 'maggot' && distance <= 7)
              actions.shoot(e, b.aim.x, b.aim.y);
            else if (visible && distance <= 0.95) actions.hurt();
            b.recovery = 300;
          }
        }
        continue;
      }
      const ranged = e.enemyType === 'maggot',
        boss = e.enemyType === 'beetle';
      const range = boss ? 3.5 : ranged ? 7 : 0.85;
      if (visible && distance <= range && e.attackCooldownMs === 0) {
        b.windup = boss ? 350 : ranged ? 250 : 200;
        b.aim = { x: dx / (distance || 1), y: dy / (distance || 1) };
        b.phase = 'windup';
        e.attackCooldownMs = boss || ranged ? 1800 : 1000;
        this.setState(e, 'attack', 'attack');
        continue;
      }
      b.phase = 'none';
      if (visible && ranged && distance < 2.5) {
        this.setState(e, 'flee', 'walk');
        this.flee(world, e, p, dt, 2.1, profile);
        continue;
      }
      if (visible && distance < 0.8) {
        this.setState(e, 'recover', 'idle');
        continue;
      }
      if (b.memory > 0 && b.target) {
        this.setState(e, visible ? 'chase' : 'investigate', 'walk');
        this.navigate(world, e, b, b.target, dt, boss ? 2.1 : 2.6, profile);
      } else if (Math.hypot(e.x - b.home.x, e.y - b.home.y) > 0.2) {
        b.target = null;
        this.setState(e, 'return', 'walk');
        this.navigate(world, e, b, b.home, dt, 2.1, profile);
      } else {
        b.target = null;
        b.path = [];
        this.setState(e, 'idle', 'idle');
      }
    }
    this.separate(world, enemies, dt);
    for (const e of enemies) {
      const b = this.brains.get(e.id);
      e.attackPhase = b?.phase ?? 'none';
      e.moving = Math.hypot(e.x - e.prevX, e.y - e.prevY) > 1e-6;
    }
  }
  private flee(
    world: WorldData,
    e: EnemyEntity,
    p: PlayerEntity,
    dt: number,
    speed: number,
    profile: TraversalProfile,
  ): void {
    const a = Math.atan2(e.y - p.y, e.x - p.x);
    for (const offset of [0, 0.7, -0.7, 1.4, -1.4]) {
      const dx = Math.cos(a + offset) * speed * dt,
        dy = Math.sin(a + offset) * speed * dt;
      if (hasClearPath(world, e.x, e.y, e.x + dx, e.y + dy, e.halfSize, profile)) {
        moveWithCollision(world, e, dx, dy, profile);
        break;
      }
    }
  }
  private navigate(
    world: WorldData,
    e: EnemyEntity,
    b: Brain,
    target: TilePoint,
    dt: number,
    speed: number,
    profile: TraversalProfile,
  ): void {
    if (hasClearPath(world, e.x, e.y, target.x, target.y, e.halfSize, profile)) {
      b.path = [];
      b.unreachable = false;
      this.toward(world, e, target, dt, speed, profile);
      return;
    }
    const goal = { x: Math.floor(target.x), y: Math.floor(target.y) };
    const end = b.path[b.path.length - 1];
    if (b.replan <= 0 && this.searches < 2) {
      this.searches++;
      const key = `${profile}:${e.halfSize}`;
      let mask = this.clearance.get(key);
      if (!mask) {
        mask = new Uint8Array(world.tiles.length);
        this.clearance.set(key, mask);
      }
      const clearance = mask;
      const passable = (x: number, y: number) => {
        const i = y * world.meta.width + x;
        if (!clearance[i])
          clearance[i] = canOccupy(world, x + 0.5, y + 0.5, e.halfSize, profile) ? 2 : 1;
        return clearance[i] === 2;
      };
      let destination = goal;
      if (!passable(goal.x, goal.y)) {
        const options: TilePoint[] = [];
        for (let oy = -1; oy <= 1; oy++)
          for (let ox = -1; ox <= 1; ox++) {
            const x = goal.x + ox,
              y = goal.y + oy;
            if (x >= 0 && y >= 0 && x < world.meta.width && y < world.meta.height && passable(x, y))
              options.push({ x, y });
          }
        options.sort((a, c) => Math.hypot(a.x - e.x, a.y - e.y) - Math.hypot(c.x - e.x, c.y - e.y));
        destination = options[0] ?? goal;
      }
      // A valid actor can stand in the walkable fringe of a trunk tile whose
      // centre is blocked. Connect its physical position to a clear graph node.
      const starts: TilePoint[] = [];
      for (let oy = -1; oy <= 1; oy++)
        for (let ox = -1; ox <= 1; ox++) {
          const x = Math.floor(e.x) + ox,
            y = Math.floor(e.y) + oy;
          if (
            x >= 0 &&
            y >= 0 &&
            x < world.meta.width &&
            y < world.meta.height &&
            passable(x, y) &&
            hasClearPath(world, e.x, e.y, x + 0.5, y + 0.5, e.halfSize, profile)
          )
            starts.push({ x, y });
        }
      starts.sort(
        (a, c) =>
          Math.hypot(a.x + 0.5 - e.x, a.y + 0.5 - e.y) -
          Math.hypot(c.x + 0.5 - e.x, c.y + 0.5 - e.y),
      );
      const start = starts[0];
      const route = start ? findPath(world.meta, start, destination, passable, 1600) : null;
      b.path = route && start ? [start, ...route] : [];
      b.unreachable = route === null;
      b.replan = route ? 600 + (Number(e.id.replace(/\D/g, '')) % 5) * 40 : 1200;
    } else if (end && Math.hypot(end.x - goal.x, end.y - goal.y) > 2)
      b.replan = Math.min(b.replan, 100);
    while (b.path[0] && Math.hypot(e.x - b.path[0].x - 0.5, e.y - b.path[0].y - 0.5) < 0.08)
      b.path.shift();
    const next = b.path[0];
    if (!next) {
      e.anim = 'idle';
      return;
    }
    const oldX = e.x,
      oldY = e.y;
    this.toward(world, e, { x: next.x + 0.5, y: next.y + 0.5 }, dt, speed, profile);
    b.stuck = Math.hypot(e.x - oldX, e.y - oldY) < 0.001 ? b.stuck + dt * 1000 : 0;
    if (b.stuck >= 500) {
      b.path = [];
      b.replan = 0;
      b.stuck = 0;
    }
  }
  private toward(
    world: WorldData,
    e: EnemyEntity,
    target: TilePoint,
    dt: number,
    speed: number,
    profile: TraversalProfile,
  ): void {
    const dx = target.x - e.x,
      dy = target.y - e.y,
      length = Math.hypot(dx, dy);
    if (length < 1e-8) return;
    const step = Math.min(length, speed * dt);
    moveWithCollision(world, e, (dx / length) * step, (dy / length) * step, profile);
  }
  private separate(world: WorldData, enemies: EnemyEntity[], dt: number): void {
    // A tiny local bucket index avoids quadratic separation work.
    const buckets = new Map<string, EnemyEntity[]>();
    for (const e of enemies)
      if (e.alive) {
        const key = `${Math.floor(e.x)},${Math.floor(e.y)}`;
        const list = buckets.get(key) ?? [];
        list.push(e);
        buckets.set(key, list);
      }
    for (const e of enemies)
      if (e.alive && e.aggressive && e.aiState !== 'attack') {
        let sx = 0,
          sy = 0;
        for (let oy = -1; oy <= 1; oy++)
          for (let ox = -1; ox <= 1; ox++)
            for (const other of buckets.get(`${Math.floor(e.x) + ox},${Math.floor(e.y) + oy}`) ??
              []) {
              if (other === e) continue;
              let dx = e.x - other.x,
                dy = e.y - other.y;
              const d = Math.hypot(dx, dy);
              if (d >= 0.65) continue;
              if (d < 1e-6) {
                dx = e.id < other.id ? -1 : 1;
                dy = 0;
              }
              sx += dx / (d || 1);
              sy += dy / (d || 1);
            }
        const length = Math.hypot(sx, sy);
        if (length)
          moveWithCollision(
            world,
            e,
            (sx / length) * Math.min(0.5 * dt, 0.05),
            (sy / length) * Math.min(0.5 * dt, 0.05),
            e.enemyType === 'ghost' ? 'ghost' : 'groundEnemy',
          );
      }
  }
}
