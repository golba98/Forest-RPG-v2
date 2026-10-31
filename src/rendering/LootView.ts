import { Container, Text } from 'pixi.js';
import type { RenderSnapshot } from '../types/render';
import { canReachLoot, LOOT_RULES } from '../systems/LootSystem';
import type { PickupEntity, PlayerEntity } from '../types/entities';
import type { EffectsLayer } from './effects/EffectsLayer';

/** Presentation observes committed balances; it never awards loot. */
export class LootView {
  readonly container = new Container();
  private readonly prompt = new Text({
    text: 'G · Open',
    style: {
      fontFamily: 'monospace',
      fontSize: 11,
      fill: 0xf4e5b7,
      stroke: { color: 0x253a31, width: 3 },
    },
  });
  private readonly reward = new Text({
    text: '',
    style: {
      fontFamily: 'monospace',
      fontSize: 14,
      fill: 0xffdf83,
      stroke: { color: 0x253a31, width: 3 },
    },
  });
  private coins: number | null = null;
  private remaining = 0;
  private readonly states = new Map<string, string>();
  constructor() {
    this.prompt.anchor.set(0.5, 1);
    this.reward.anchor.set(0.5, 1);
    this.container.addChild(this.prompt, this.reward);
  }
  reset(): void {
    this.coins = null;
    this.remaining = 0;
    this.states.clear();
    this.prompt.visible = false;
    this.reward.visible = false;
  }
  update(snapshot: RenderSnapshot, dt: number, effects: EffectsLayer): void {
    const p = snapshot.entities.find((e) => e.id === snapshot.playerId) as
      ((typeof snapshot.entities)[number] & PlayerEntity) | undefined;
    if (!p) return;
    const balance = p.stats.coins;
    if (this.coins !== null && balance > this.coins) {
      this.reward.text = `+${balance - this.coins}`;
      this.remaining = 850;
      this.reward.position.set(p.x * 32, p.y * 32 - 35);
    }
    this.coins = balance;
    this.remaining = Math.max(0, this.remaining - dt);
    this.reward.visible = this.remaining > 0;
    this.reward.alpha = Math.min(1, this.remaining / 200);
    this.reward.y -= dt * 0.015;
    this.prompt.visible = false;
    let nearest = LOOT_RULES.chestRadius as number;
    for (const e of snapshot.entities) {
      if (!e.chest) continue;
      const previous = this.states.get(e.id);
      if (previous === 'opening' && e.chest.state === 'opened')
        effects.burst(e.x * 32, e.y * 32 - 8, 0xffdf83, 12, e.y * 32 + 1);
      this.states.set(e.id, e.chest.state);
      const d = Math.hypot(e.x - p.x, e.y - p.y);
      if (
        e.chest.state === 'closed' &&
        d < nearest &&
        !snapshot.encounters?.interaction &&
        canReachLoot(snapshot.world, p, e as unknown as PickupEntity)
      ) {
        nearest = d;
        this.prompt.text = `G · Open`;
        this.prompt.position.set(e.x * 32, e.y * 32 - 20);
        this.prompt.visible = true;
      }
      if (previous === 'closed' && e.chest.state === 'opening')
        effects.burst(e.x * 32, e.y * 32 - 6, 0xb18d60, 4, e.y * 32 + 1, 0.02);
    }
  }
}
