import { Container, Graphics, Sprite } from 'pixi.js';
import type { RenderSnapshot, RenderEntityView } from '../types/render';
import type { TextureStore } from './TextureStore';
import { PLAYER_FOOTPRINT } from '../systems/EntityFootprint';
import { nestLayout, nestBaseBounds } from '../world/NestGeometry';

/** Aligned bitmap layers share the mouth's feet anchor (48, 52). */
export class NestView {
  readonly ground = new Container();
  readonly particles = new Graphics();
  private views = new Map<
    string,
    {
      body: Sprite;
      front: Sprite;
      cleared: Sprite;
      ground: Sprite;
      mask: Graphics;
      bugLipY: number;
    }
  >();
  reset(): void {
    for (const v of this.views.values())
      for (const s of [v.body, v.front, v.cleared, v.ground, v.mask]) s.destroy();
    this.views.clear();
    this.particles.clear();
  }
  update(snapshot: RenderSnapshot, actors: Container, textures: TextureStore, time: number): void {
    this.particles.clear();
    for (const site of snapshot.encounters?.sites ?? []) {
      if (site.kind !== 'nest') continue;
      let v = this.views.get(site.id);
      if (!v) {
        v = {
          body: new Sprite(textures.get('nest_body')),
          front: new Sprite(textures.get('nest_front')),
          cleared: new Sprite(textures.get('nest_cleared')),
          ground: new Sprite(textures.get('nest_ground')),
          mask: new Graphics(),
          bugLipY: 0,
        };
        this.ground.addChild(v.ground);
        actors.addChild(v.body, v.front, v.cleared, v.mask);
        this.views.set(site.id, v);
      }
      const { entrance, mouthX: x, mouthY: y, originX, originY } = nestLayout(snapshot.world, site);
      const shake = site.phase === 'warning' ? Math.round(Math.sin(time / 48)) : 0;
      for (const s of [v.body, v.front, v.cleared, v.ground]) s.position.set(originX, originY);
      v.body.x += shake;
      v.front.x += shake;
      v.bugLipY = entrance.y * 32 + 12;
      v.body.zIndex = entrance.y * 32 - 2;
      v.front.zIndex =
        (Math.max(...nestBaseBounds(snapshot.world, site).map((b) => b.maxY)) -
          PLAYER_FOOTPRINT.offsetY) *
        32;
      v.cleared.zIndex = v.front.zIndex + 0.1;
      v.cleared.visible = site.phase === 'defeated';
      // Reveal the unchanged bug through the mouth, revealing its full silhouette as its feet clear the rim
      // before the handoff. The front rim additionally hides its lower body.
      if (site.phase === 'emerging') {
        if (!v.mask.parent) actors.addChild(v.mask);
      } else v.mask.removeFromParent();
      v.mask.clear();
      v.mask.rect(x - 60, y - 18, 120, 150).fill(0xffffff);
      if (site.phase === 'warning' || site.phase === 'emerging') {
        for (let i = 0; i < 5; i++) {
          const p = (time / 650 + i / 5) % 1;
          this.particles
            .rect(
              Math.round(x - 22 + i * 10 + p * 4),
              Math.round(y + 8 - Math.sin(p * Math.PI) * 9),
              2,
              2,
            )
            .fill({ color: i % 2 ? 0x9a8248 : 0x665132, alpha: (1 - p) * 0.7 });
        }
      }
    }
  }
  apply(entity: RenderEntityView, sprite: Sprite): void {
    const view = entity.nestEmergence ? this.views.get(entity.nestEmergence.siteId) : undefined;
    if (view)
      sprite.zIndex =
        entity.y * 32 < view.bugLipY
          ? Math.min(sprite.zIndex, view.front.zIndex - 0.1)
          : Math.max(sprite.zIndex, view.front.zIndex + 0.1);
    sprite.mask = entity.nestEmergence
      ? (this.views.get(entity.nestEmergence.siteId)?.mask ?? null)
      : null;
  }
}
