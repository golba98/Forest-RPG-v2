import { Container, Sprite, type Texture } from 'pixi.js';
import type { EncounterSiteView } from '../types/encounters';
import { CHARACTER_FOOT_OFFSET_PX } from '../types/physical';
import type { TextureStore } from './TextureStore';

interface GroveSprites {
  body: Sprite;
  shadow: Sprite;
  fungi: Sprite[];
}

/** Visual-only landmark. Site identity, activation and collision remain simulation-owned. */
export class GroveView {
  readonly ground = new Container();
  private views = new Map<string, GroveSprites>();

  update(
    sites: readonly EncounterSiteView[],
    actors: Container,
    textures: Pick<TextureStore, 'get'>,
    shadowTexture: Texture,
  ): void {
    const alive = new Set<string>();
    for (const site of sites) {
      if (site.kind !== 'grove') continue;
      alive.add(site.id);
      let v = this.views.get(site.id);
      if (!v) {
        const body = new Sprite(textures.get('grove_stump'));
        body.anchor.set(0.5, 1);
        const shadow = new Sprite(shadowTexture);
        shadow.anchor.set(0.5);
        shadow.tint = 0x000000;
        shadow.alpha = 0.18;
        shadow.width = 48;
        shadow.height = 12;
        const fungi = Array.from({ length: 12 }, (_, i) => {
          const sprite = new Sprite(textures.get(`grove_mushroom_${(i % 3) + 1}`));
          sprite.anchor.set(0.5, 1);
          return sprite;
        });
        actors.addChild(body);
        this.ground.addChild(shadow, ...fungi);
        v = { body, shadow, fungi };
        this.views.set(site.id, v);
      }
      const x = Math.round(site.x * 32),
        y = Math.round(site.y * 32 + 8);
      v.body.position.set(x, y);
      // Characters sort by their sprite anchor, ten pixels above their ground contact.
      v.body.zIndex = y - CHARACTER_FOOT_OFFSET_PX;
      v.shadow.position.set(x, y);
      for (const [i, sprite] of v.fungi.entries()) {
        const a = i * 2.4;
        sprite.position.set(
          Math.round(x + Math.cos(a) * (42 + (i % 3) * 13)),
          Math.round(y + Math.sin(a) * 39),
        );
      }
    }
    for (const [id, v] of this.views)
      if (!alive.has(id)) {
        this.destroySprites(v);
        this.views.delete(id);
      }
  }

  private destroySprites(v: GroveSprites): void {
    for (const sprite of [v.body, v.shadow, ...v.fungi]) sprite.destroy();
  }
  reset(): void {
    for (const v of this.views.values()) this.destroySprites(v);
    this.views.clear();
  }
  placeholderCount(textures: Pick<TextureStore, 'isPlaceholder'>): number {
    let count = 0;
    for (const v of this.views.values())
      for (const s of [v.body, ...v.fungi]) if (textures.isPlaceholder(s.texture)) count++;
    return count;
  }
  get info() {
    return [...this.views].map(([id, v]) => ({
      id,
      x: v.body.x,
      y: v.body.y,
      width: v.body.texture.width,
      height: v.body.texture.height,
      scaleX: v.body.scale.x,
      scaleY: v.body.scale.y,
      depth: v.body.zIndex,
      fungi: v.fungi.length,
    }));
  }
}
