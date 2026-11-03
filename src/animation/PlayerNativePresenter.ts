import pixels from './playerNativePixels.json';
import type { PlayerPose } from './PlayerMotion';
import { decodePlayerPixels } from './playerPixelMath';
import type { BlinkPhase } from './PlayerBlink';
import {
  blinkPlayerPixels,
  playerDirectionSuffix as suffix,
  playerHead,
  playerFaceInfo,
  transitionPlayerPixels,
  type PlayerHead,
} from './PlayerFace';
/** Complete indexed-pixel poses, shared by the game and the frame inspector. */
export class PlayerNativePresenter {
  private cache = new Map<string, Uint8Array>();
  private last: Uint8Array | undefined;
  private origin: Uint8Array | undefined;
  private head: PlayerHead | undefined;
  private originHead: PlayerHead | undefined;
  private shown: Uint8Array | undefined;
  private shownBase: Uint8Array | undefined;
  private phase: BlinkPhase = 'open';
  private bridgeId = -1;
  private key = '';
  get face() {
    return this.head ? playerFaceInfo(this.head, this.phase) : undefined;
  }
  render(pose: PlayerPose, phase: BlinkPhase = 'open'): Uint8Array {
    const p = pose.upper,
      dir = suffix[p.facing],
      key = `${dir}/${p.clip}/${p.frame}`;
    let target = this.cache.get(key);
    if (!target) {
      const encoded = pixels[dir][p.clip][p.frame];
      if (!encoded) throw Error(`Missing native player pose: ${key}`);
      target = decodePlayerPixels(encoded);
      if (this.cache.size >= 64) this.cache.delete(this.cache.keys().next().value ?? '');
      this.cache.set(key, target);
    }
    const bridge = pose.transition;
    if (!bridge) {
      this.bridgeId = -1;
      this.origin = undefined;
      this.last = target;
      this.head = playerHead(pose);
      this.key = key;
    } else {
      if (bridge.id !== this.bridgeId) {
        this.origin = this.last ?? target;
        this.originHead = this.head ?? playerHead(pose);
        this.bridgeId = bridge.id;
        this.key = '';
      }
      const nextKey = `${key}/${bridge.id}/${bridge.step}`;
      if (nextKey !== this.key || !this.last) {
        const result = transitionPlayerPixels(
          this.origin ?? target,
          target,
          this.originHead ?? playerHead(pose),
          playerHead(pose),
          bridge.step / 4,
        );
        this.last = result.pixels;
        this.head = result.head;
        this.key = nextKey;
      }
    }
    if (!this.last || !this.head) throw Error('Missing displayed player pose');
    // Retarget history is always unblinked; a closed eye must never become part
    // of the next body's transition material.
    if (this.shownBase !== this.last || this.phase !== phase || !this.shown) {
      this.shown = blinkPlayerPixels(this.last, this.head, phase);
      this.shownBase = this.last;
      this.phase = phase;
    }
    return this.shown;
  }
  reset(): void {
    this.last = undefined;
    this.origin = undefined;
    this.head = this.originHead = undefined;
    this.shown = this.shownBase = undefined;
    this.phase = 'open';
    this.bridgeId = -1;
    this.key = '';
    this.cache.clear();
  }
}
