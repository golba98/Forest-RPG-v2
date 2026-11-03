import { BufferImageSource, Texture, type Renderer } from 'pixi.js';
import type { PlayerPose } from '../animation/PlayerMotion';
import { PlayerNativePresenter } from '../animation/PlayerNativePresenter';
import { playerRgba } from '../animation/playerPixelMath';
import { PlayerBlink } from '../animation/PlayerBlink';
import type { TextureStore } from './TextureStore';
const suffix = {
  N: 'north',
  NE: 'northeast',
  E: 'east',
  SE: 'southeast',
  S: 'south',
  SW: 'southwest',
  W: 'west',
  NW: 'northwest',
};
/** A single complete native sprite. One reusable texture covers action changes. */
export class PlayerCompositor {
  private presenter = new PlayerNativePresenter();
  private blink = new PlayerBlink();
  get face() {
    return this.presenter.face;
  }
  updateBlink(timeMs: number, frozen: boolean): void {
    this.blink.update(timeMs, frozen);
  }
  private source: BufferImageSource | undefined;
  private texture: Texture | undefined;
  private lastPixels: Uint8Array | undefined;
  render(_renderer: Renderer, textures: TextureStore, pose: PlayerPose): Texture {
    const pixels = this.presenter.render(pose, this.blink.phase);
    if (!pose.transition && (this.blink.phase === 'open' || !this.face?.eyes.length)) {
      const p = pose.upper;
      return textures.getRect(`player_${p.clip}_${suffix[p.facing]}`, p.frame * 64, 0, 64, 64);
    }
    if (!this.source) {
      this.source = new BufferImageSource({
        resource: new Uint8Array(64 * 64 * 4),
        width: 64,
        height: 64,
        format: 'rgba8unorm',
        scaleMode: 'nearest',
        alphaMode: 'no-premultiply-alpha',
        autoGarbageCollect: false,
      });
      this.texture = new Texture({ source: this.source });
    }
    if (pixels !== this.lastPixels) {
      (this.source.resource as Uint8Array).set(playerRgba(pixels));
      this.source.update();
      this.lastPixels = pixels;
    }
    return this.texture!;
  }
  reset(): void {
    this.presenter.reset();
    this.blink.reset();
    this.lastPixels = undefined;
  }
  destroy(): void {
    this.reset();
    this.texture?.destroy(true);
    this.texture = undefined;
    this.source = undefined;
  }
}
