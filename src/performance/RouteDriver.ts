import type { Simulation } from '../simulation/Simulation';
import { collector } from './FrameProfiler';

export interface DriverOptions {
  readonly points: readonly { x: number; y: number }[];
  readonly fast?: boolean;
  readonly combat?: boolean;
  readonly loop?: boolean;
}
/** Generates keyboard events through the game's normal InputManager; never moves actors directly. */
export class RouteDriver {
  private handle = 0;
  private held = new Set<string>();
  private index = 0;
  private started = 0;
  private lastAction = 0;
  private lastPotion = 0;
  private lastHealing = 0;
  private lastMotion = 0;
  private last = { x: 0, y: 0 };
  private distance = 0;
  private error: string | null = null;
  private done = false;
  private calls = 0;
  private sampledCpu = 0;
  private samples = 0;
  private progressTarget: { x: number; y: number } | undefined;
  private bestTargetDistance = Infinity;
  private lastProgress = 0;
  private lastWaypoint = 0;
  private progressIndex = 0;
  private correcting = false;
  private corrections = 0;
  private blurs = 0;
  private readonly onBlur = () => {
    this.held.clear();
    this.blurs++;
    collector()?.event('driver.blur', performance.now(), 0);
  };
  constructor(
    private readonly simulation: Simulation,
    private readonly failed?: (message: string) => void,
  ) {}
  start(options: DriverOptions): void {
    this.stop();
    this.index = 0;
    this.distance = 0;
    this.error = null;
    this.done = false;
    this.calls = this.samples = this.sampledCpu = 0;
    this.started = this.lastMotion = performance.now();
    this.lastProgress = this.lastWaypoint = this.started;
    this.progressTarget = undefined;
    this.bestTargetDistance = Infinity;
    this.progressIndex = 0;
    this.correcting = false;
    this.corrections = 0;
    this.blurs = 0;
    window.addEventListener('blur', this.onBlur);
    const origin = this.simulation.stream?.origin ?? { x: 0, y: 0 };
    this.last = { x: this.simulation.player.x + origin.x, y: this.simulation.player.y + origin.y };
    const tick = (now: number) => {
      const sample = this.calls++ % 32 === 0,
        start = sample ? performance.now() : 0;
      this.advance(now, options);
      if (sample) {
        this.sampledCpu += performance.now() - start;
        this.samples++;
      }
      if (!this.done && !this.error) this.handle = requestAnimationFrame(tick);
    };
    this.handle = requestAnimationFrame(tick);
  }
  private keys(keys: Set<string>): void {
    for (const code of this.held)
      if (!keys.has(code))
        window.dispatchEvent(new KeyboardEvent('keyup', { code, key: code, bubbles: true }));
    for (const code of keys)
      if (!this.held.has(code))
        window.dispatchEvent(new KeyboardEvent('keydown', { code, key: code, bubbles: true }));
    this.held = keys;
  }
  private tap(code: string): void {
    window.dispatchEvent(new KeyboardEvent('keydown', { code, key: code, bubbles: true }));
    window.dispatchEvent(new KeyboardEvent('keyup', { code, key: code, bubbles: true }));
  }
  private advance(now: number, options: DriverOptions): void {
    const sim = this.simulation,
      origin = sim.stream?.origin ?? { x: 0, y: 0 };
    const point = { x: sim.player.x + origin.x, y: sim.player.y + origin.y };
    const moved = Math.hypot(point.x - this.last.x, point.y - this.last.y);
    this.distance += moved;
    if (moved > 0.015) {
      this.lastMotion = now;
      this.last = point;
    }
    let target = options.points[this.index];
    while (target && Math.hypot(target.x - point.x, target.y - point.y) < 0.18) {
      this.index++;
      if (this.index === options.points.length && options.loop) this.index = 0;
      target = options.points[this.index];
    }
    if (!target) {
      this.done = true;
      this.keys(new Set());
      return;
    }
    if (this.index !== this.progressIndex) {
      this.lastWaypoint = now;
      this.progressIndex = this.index;
    }
    const targetDistance = Math.hypot(target.x - point.x, target.y - point.y);
    if (this.progressTarget !== target) {
      this.progressTarget = target;
      this.bestTargetDistance = targetDistance;
      this.lastProgress = now;
    }
    if (targetDistance < this.bestTargetDistance - 0.08) {
      this.bestTargetDistance = targetDistance;
      this.lastProgress = now;
    }
    if (now - this.lastProgress > 20000) {
      this.error =
        'No progress toward target for 20 seconds at ' +
        JSON.stringify(point) +
        ' toward ' +
        JSON.stringify(target);
      this.keys(new Set());
      this.failed?.(this.error);
      return;
    }
    if (now - this.lastMotion > 15000) {
      this.error =
        'No movement for 15 seconds at ' +
        JSON.stringify(point) +
        ' toward ' +
        JSON.stringify(target);
      this.keys(new Set());
      this.failed?.(this.error);
      return;
    }
    const dx = target.x - point.x,
      dy = target.y - point.y,
      keys = new Set<string>();
    const correcting = now - this.lastProgress > 600,
      deadZone = correcting ? 0.005 : 0.08;
    if (correcting && !this.correcting) {
      this.corrections++;
      collector()?.event('driver.steeringCorrection', performance.now(), 0, {
        index: this.index,
        point,
        target,
      });
    }
    this.correcting = correcting;
    if (Math.abs(dx) > deadZone) keys.add(dx > 0 ? 'KeyD' : 'KeyA');
    if (Math.abs(dy) > deadZone) keys.add(dy > 0 ? 'KeyS' : 'KeyW');
    if (options.fast) {
      keys.add('ShiftLeft');
      if (now - this.lastPotion > 7900) {
        this.tap('Digit2');
        this.lastPotion = now;
      }
    }
    if (
      (now - this.lastMotion > 1800 || now - this.lastProgress > 1200) &&
      now - this.lastAction > 650
    ) {
      this.tap('Space');
      this.lastAction = now;
    }
    if (options.combat && now - this.lastAction > 420) {
      this.tap('KeyE');
      if (this.calls % 3 === 0) this.tap('KeyR');
      this.lastAction = now;
    }
    if (
      options.combat &&
      sim.player.stats.health < sim.player.stats.maxHealth &&
      now - this.lastHealing > 500
    ) {
      this.tap('Digit1');
      this.lastHealing = now;
    }
    this.keys(keys);
  }
  stop(): void {
    window.removeEventListener('blur', this.onBlur);
    cancelAnimationFrame(this.handle);
    this.handle = 0;
    this.keys(new Set());
  }
  snapshot() {
    return {
      index: this.index,
      distanceTiles: this.distance,
      elapsedMs: performance.now() - this.started,
      error: this.error,
      finished: this.done,
      calls: this.calls,
      sampledCpuMs: this.sampledCpu,
      samples: this.samples,
      waypointIdleMs: performance.now() - this.lastWaypoint,
      progressIdleMs: performance.now() - this.lastProgress,
      corrections: this.corrections,
      blurs: this.blurs,
    };
  }
}
