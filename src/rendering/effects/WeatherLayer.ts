import { Container, Graphics } from 'pixi.js';
import type { RenderEntityView } from '../../types/render';
import type { WorldData } from '../../types/world';
import {
  surfaceSites,
  surfaceHash,
  type MoistureView,
  type SurfaceSample,
} from '../../systems/SurfaceMoisture';
import { PLAYER_FOOTPRINT } from '../../systems/EntityFootprint';

const DROP_LIMIT = 256,
  IMPACT_LIMIT = 96,
  STEP_LIMIT = 24;
interface Rect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}
interface Drop {
  x: number;
  y: number;
  age: number;
  duration: number;
  active: boolean;
}
interface Impact {
  x: number;
  y: number;
  age: number;
  duration: number;
  material: SurfaceSample['material'];
  active: boolean;
  foot: boolean;
}
export interface WeatherOptions {
  paused: boolean;
  enabled: boolean;
  screenWidth: number;
  screenHeight: number;
  view: Rect;
  world: WorldData;
  moisture?: MoistureView | undefined;
  player?: RenderEntityView | undefined;
  worldToScreen: (x: number, y: number) => { x: number; y: number };
}

/** Flights own a fixed landing point; impacts retain that point until expiration. */
export class WeatherLayer {
  readonly sky = new Container();
  readonly ground = new Graphics();
  readonly deck = new Graphics();
  private readonly overcast = new Graphics();
  private readonly streaks = new Graphics();
  private readonly drops: Drop[] = Array.from({ length: DROP_LIMIT }, () => ({
    x: 0,
    y: 0,
    age: 0,
    duration: 1,
    active: false,
  }));
  private readonly impacts: Impact[] = Array.from({ length: IMPACT_LIMIT + STEP_LIMIT }, () => ({
    x: 0,
    y: 0,
    age: 0,
    duration: 1,
    material: 'grass',
    active: false,
    foot: false,
  }));
  private intensity = 0;
  private sequence = 0;
  private emission = 0;
  private impactCursor = 0;
  private stepCursor = 0;
  private lastFoot: { x: number; y: number } | null = null;
  private travel = 0;
  constructor() {
    this.sky.addChild(this.overcast, this.streaks);
  }
  get raining(): boolean {
    return this.intensity > 0.01;
  }
  get info() {
    return {
      drops: this.drops.filter((d) => d.active).length,
      impacts: this.impacts.filter((d) => d.active && !d.foot).length,
      footsteps: this.impacts.filter((d) => d.active && d.foot).length,
      positions: this.impacts
        .filter((d) => d.active)
        .slice(0, 12)
        .map((d) => ({ x: d.x, y: d.y, material: d.material, foot: d.foot })),
    };
  }
  reset(): void {
    for (const d of [...this.drops, ...this.impacts]) d.active = false;
    this.intensity = 0;
    this.sequence = 0;
    this.emission = 0;
    this.lastFoot = null;
    this.travel = 0;
    this.ground.clear();
    this.deck.clear();
    this.streaks.clear();
    this.overcast.clear();
  }
  private impact(sample: SurfaceSample, foot = false): void {
    const i = foot
      ? IMPACT_LIMIT + (this.stepCursor++ % STEP_LIMIT)
      : this.impactCursor++ % IMPACT_LIMIT;
    Object.assign(this.impacts[i] as Impact, sample, {
      age: 0,
      duration: sample.material === 'river' || sample.material === 'puddle' ? 520 : 240,
      active: true,
      foot,
    });
  }
  update(dtMs: number, rain: boolean, opts: WeatherOptions): void {
    const sites = surfaceSites(opts.world),
      dt = opts.paused ? 0 : Math.min(100, Math.max(0, dtMs));
    this.intensity = Math.min(1, Math.max(0, this.intensity + (rain ? dt : -dt) / 1800));
    this.overcast.clear();
    this.streaks.clear();
    this.ground.clear();
    this.deck.clear();
    const foot = opts.player
      ? {
          x: (opts.player.x + PLAYER_FOOTPRINT.offsetX) * 32,
          y: (opts.player.y + PLAYER_FOOTPRINT.offsetY) * 32,
        }
      : null;
    if (foot && this.lastFoot && dt) {
      const distance = Math.hypot(foot.x - this.lastFoot.x, foot.y - this.lastFoot.y);
      if (
        distance < 32 &&
        opts.player &&
        opts.player.lift === 0 &&
        opts.player.anim !== 'jump' &&
        Math.hypot(opts.player.x - opts.player.prevX, opts.player.y - opts.player.prevY) > 0.00001
      ) {
        this.travel += distance;
        if (this.travel >= 11) {
          this.travel %= 11;
          const sample = sites.sample(foot.x, foot.y, opts.moisture);
          if (opts.enabled && sample?.material === 'puddle') this.impact(sample, true);
        }
      } else this.travel = 0;
    }
    this.lastFoot = foot;
    if (!opts.enabled) {
      for (const d of [...this.drops, ...this.impacts]) d.active = false;
      return;
    }
    const k = this.intensity;
    // Clip atmospheric tint to the world; airborne streaks are projected independently of ground FX.
    const origin = opts.worldToScreen(0, 0),
      end = opts.worldToScreen(opts.world.meta.width * 32, opts.world.meta.height * 32);
    this.overcast
      .rect(
        Math.max(0, origin.x),
        Math.max(0, origin.y),
        Math.max(0, Math.min(opts.screenWidth, end.x) - Math.max(0, origin.x)),
        Math.max(0, Math.min(opts.screenHeight, end.y) - Math.max(0, origin.y)),
      )
      .fill({ color: 0x1b2c3a, alpha: 0.14 * k });
    this.emission = Math.min(DROP_LIMIT, this.emission + dt * 0.32 * k);
    for (const drop of this.drops) {
      if (!drop.active && this.emission >= 1) {
        this.emission--;
        const hash = surfaceHash(this.sequence++, opts.world.meta.seed, 73);
        const x = Math.round(opts.view.x - 40 + ((hash % 65536) / 65535) * (opts.view.width + 80));
        const y = Math.round(opts.view.y - 40 + ((hash >>> 16) / 65535) * (opts.view.height + 80));
        if (sites.sample(x, y, opts.moisture))
          Object.assign(drop, { x, y, age: 0, duration: 350 + (hash % 220), active: true });
      }
      if (!drop.active) continue;
      drop.age += dt;
      if (drop.age >= drop.duration) {
        drop.active = false;
        const sample = sites.sample(drop.x, drop.y, opts.moisture);
        if (sample) this.impact(sample);
        continue;
      }
      const p = drop.age / drop.duration,
        lift = 100 * (1 - p);
      const a = opts.worldToScreen(drop.x - lift * 0.18, drop.y - lift),
        b = opts.worldToScreen(drop.x - lift * 0.18 - 2, drop.y - lift - 12);
      this.streaks
        .moveTo(Math.round(a.x), Math.round(a.y))
        .lineTo(Math.round(b.x), Math.round(b.y));
    }
    this.streaks.stroke({ color: 0xacc8ce, alpha: 0.48 * k, width: 1 });
    for (const impact of this.impacts) {
      if (!impact.active) continue;
      impact.age += dt;
      if (impact.age >= impact.duration) {
        impact.active = false;
        continue;
      }
      const p = impact.age / impact.duration,
        g = impact.material === 'deck' ? this.deck : this.ground;
      const water = impact.material === 'river' || impact.material === 'puddle';
      const color = water ? 0xa8c6c3 : impact.material === 'soil' ? 0x9b9e82 : 0xa0b497;
      const plot = (x: number, y: number) => {
        const sx = Math.round(x),
          sy = Math.round(y),
          sample = sites.sample(sx, sy, opts.moisture);
        if (sample?.material === impact.material)
          g.rect(sx, sy, 1, 1).fill({ color, alpha: (1 - p) * (impact.foot ? 0.8 : 0.6) });
      };
      if (water) {
        const radius = 1 + p * (impact.foot ? 7 : 4);
        for (let j = 0; j < 12; j++) {
          const angle = (j * Math.PI) / 6;
          plot(impact.x + Math.cos(angle) * radius, impact.y + Math.sin(angle) * radius * 0.45);
        }
      } else {
        for (const direction of [-1, 1])
          plot(impact.x + direction * (1 + p * 3), impact.y - Math.sin(p * Math.PI) * 3);
        if (p < 0.35) plot(impact.x, impact.y);
      }
    }
  }
}
