import { ColorMatrixFilter, Container, Graphics, Sprite, Text, type Texture } from 'pixi.js';
import type { PortalVisualState } from '../types/render';
import type { EffectTextures } from './effects/proceduralTextures';

/** portal_forest.png: 1312×1199; the vortex ellipse measured from its purple pixels. */
const ART_WIDTH_PX = 86;
const VORTEX_CX = 652;
const VORTEX_CY = 645;
const VORTEX_RX = 188;
const VORTEX_RY = 198;
const SPARKS = 8;

const smooth = (current: number, target: number, dtMs: number, rate: number) =>
  current + (target - current) * (1 - Math.exp(-dtMs / rate));

/**
 * One portal's visuals. The stone frame never changes; the vortex (an
 * ellipse-masked copy of the art) is desaturated while locked, flares when
 * the player approaches a locked portal, and spins in full colour once open.
 * All changes are eased from the current values, so state switches never
 * restart an animation or flicker.
 */
export class PortalView extends Container {
  private readonly frame: Sprite;
  private readonly vortex: Sprite;
  private readonly vortexMask = new Graphics();
  private readonly glow: Sprite;
  private readonly ring: Sprite;
  private readonly sparks: Sprite[] = [];
  private readonly caption: Text;
  private readonly grade = new ColorMatrixFilter();
  private energy = 0;
  private flare = 0;
  private time = 0;
  private lastLabel = '';
  private lastLabelState: PortalVisualState | null = null;

  constructor(art: Texture, fx: EffectTextures) {
    super();
    const scale = ART_WIDTH_PX / art.width;
    this.frame = new Sprite(art);
    this.frame.anchor.set(0.5, 1);
    this.frame.scale.set(scale);

    // Vortex centre in container space (origin = bottom-centre of the art).
    const vx = (VORTEX_CX - art.width / 2) * scale;
    const vy = (VORTEX_CY - art.height) * scale;
    this.vortex = new Sprite(art);
    this.vortex.anchor.set(VORTEX_CX / art.width, VORTEX_CY / art.height);
    this.vortex.scale.set(scale);
    this.vortex.position.set(vx, vy);
    this.vortex.filters = [this.grade];
    this.vortexMask.ellipse(vx, vy, VORTEX_RX * scale, VORTEX_RY * scale).fill(0xffffff);
    this.vortex.mask = this.vortexMask;

    this.glow = new Sprite(fx.glow);
    this.glow.anchor.set(0.5);
    this.glow.position.set(vx, vy);
    this.glow.scale.set((VORTEX_RX * scale * 2.6) / 64, (VORTEX_RY * scale * 2.6) / 64);
    this.glow.tint = 0xb27cff;
    this.glow.blendMode = 'add';

    this.ring = new Sprite(fx.ring);
    this.ring.anchor.set(0.5);
    this.ring.position.set(vx, vy);
    this.ring.tint = 0xffb36b;
    this.ring.blendMode = 'add';
    this.ring.alpha = 0;

    for (let i = 0; i < SPARKS; i++) {
      const s = new Sprite(fx.spark);
      s.anchor.set(0.5);
      s.tint = i % 2 === 0 ? 0xe9d2ff : 0xfff1b0;
      s.blendMode = 'add';
      this.sparks.push(s);
    }

    this.caption = new Text({
      text: '',
      style: { fontFamily: 'Georgia', fontSize: 11, fill: 0xffe8ae, stroke: { color: 0x152718, width: 3 }, align: 'center' },
    });
    this.caption.anchor.set(0.5, 1);
    this.caption.position.set(0, -art.height * scale - 4);

    this.addChild(this.frame, this.vortexMask, this.vortex, this.glow, this.ring, ...this.sparks, this.caption);
  }

  /** Actual frame texture, including a missing-art fallback, for renderer diagnostics. */
  get artTexture(): Texture {
    return this.frame.texture;
  }

  /** Vortex centre relative to the portal's foot point (world px). */
  get vortexOffsetY(): number {
    return this.vortex.y;
  }

  update(state: PortalVisualState, reactProgress: number, dtMs: number, paused: boolean, labelText: string): void {
    if (!paused) this.time += dtMs;
    const dt = paused ? 0 : dtMs;
    const open = state === 'open' || state === 'transitioning';
    this.energy = smooth(this.energy, open ? 1 : 0, dt, 260);
    const flareTarget = state === 'reacting' ? Math.sin(Math.min(1, reactProgress) * Math.PI) : 0;
    this.flare = smooth(this.flare, flareTarget, dt, 70);

    // Locked: desaturated, dim vortex. Reacting: brief colour flare. Open: full colour.
    const colour = Math.min(1, this.energy + this.flare * 0.85);
    this.grade.reset();
    this.grade.saturate(-0.85 * (1 - colour), false);
    this.grade.brightness(0.55 + 0.45 * colour + this.flare * 0.25, true);

    const spin = 0.00025 + this.energy * 0.0016 + this.flare * 0.003;
    if (!paused) this.vortex.rotation -= spin * dtMs;

    const pulse = 0.5 + 0.5 * Math.sin(this.time / 600);
    this.glow.alpha = 0.06 + 0.06 * pulse + this.energy * (0.3 + 0.12 * pulse) + this.flare * 0.55;

    // Reaction ring expands once per flare.
    if (state === 'reacting') {
      // The ring finishes slightly before the flare (last 15% is fade-back).
      const t = Math.min(1, reactProgress / 0.85);
      this.ring.scale.set(0.6 + t * 2.4);
      this.ring.alpha = (1 - t) * 0.9;
    } else this.ring.alpha = smooth(this.ring.alpha, 0, dt, 80);

    this.sparks.forEach((s, i) => {
      const a = this.time / 900 + (i / SPARKS) * Math.PI * 2;
      const r = 13 + Math.sin(this.time / 300 + i) * 2;
      s.position.set(this.vortex.x + Math.cos(a) * r, this.vortex.y + Math.sin(a) * r * 1.05);
      s.alpha = this.energy * (0.5 + 0.5 * Math.sin(this.time / 200 + i * 1.3));
    });

    if (labelText !== this.lastLabel || state !== this.lastLabelState) {
      this.caption.text = labelText;
      this.caption.style.fill = open ? 0xd8b5ff : state === 'reacting' ? 0xffb38a : 0xffe8ae;
      this.lastLabel = labelText;
      this.lastLabelState = state;
    }
    this.caption.scale.set(state === 'reacting' ? 1 + 0.12 * Math.sin(reactProgress * Math.PI) : 1);
  }
}
