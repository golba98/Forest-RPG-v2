import type { Renderer } from 'pixi.js';
import { ColorMatrixFilter, Container, Graphics, Sprite, type Texture } from 'pixi.js';
import { resolveSpriteFrame } from '../../animation/resolveSpriteFrame';
import type { Language } from '../../types/languages';
import type { RenderEntityView, RenderSnapshot } from '../../types/render';
import { translate } from '../../ui/i18n';
import { PORTAL_ART_ALIAS } from '../assetCatalog';
import { Camera } from '../Camera';
import { type SpriteDebugInfo, type VisualDebugInfo } from '../DebugOverlay';
import { EffectsLayer } from '../effects/EffectsLayer';
import { type EffectTextures } from '../effects/proceduralTextures';
import { EntityAnimator } from '../EntityAnimator';
import { LootView } from '../LootView';
import { NestView } from '../NestView';
import { PlayerCompositor } from '../PlayerCompositor';
import { PortalView } from '../PortalView';
import { PORTAL_ENTER_RADIUS_ASSUMED, PortalVisualMachine } from '../portalVisualState';
import { TextureStore } from '../TextureStore';
import { nearbyWaterBounds, wadingPose } from '../wadingGeometry';
import { WATER_PALETTE } from '../waterArt';
interface EntityFrame {
  readonly paused: boolean;
  readonly language: Language;
  readonly visualTime: number;
  readonly impactHoldMs: number;
  readonly streamingRebase: boolean;
  readonly renderer: Renderer;
}
const TILE = 32;

const HURT_WHITE_MS = 70;
/** After the white flash the hurt tint stays red this long, then the sprite blinks for the rest of the invulnerability. */
const HURT_RED_MS = 220;
const FACING_ANGLE: Readonly<Record<string, number>> = {
  E: 0,
  SE: Math.PI / 4,
  S: Math.PI / 2,
  SW: (3 * Math.PI) / 4,
  W: Math.PI,
  NW: (-3 * Math.PI) / 4,
  N: -Math.PI / 2,
  NE: -Math.PI / 4,
};
/** Matches the simulation's death display window (codex/gameplay-repair keeps dead enemies 450 ms). */
const DEATH_FADE_MS = 450;

/** Last drawn state of an entity sprite, kept so removals can fade out. */
interface EntityVisual {
  readonly sprite: Sprite;
  kind: RenderEntityView['kind'];
  spriteKey: string;
  hurtSince: number;
  /** The snapshot already showed this entity dying (`dead`), so removal needs no fade. */
  diedInView: boolean;
  quietRemoval: boolean;
  /** Soft ground shadow under characters and pickups (ground layer). */
  shadow: Sprite | null;
  lastAnim: string;
  lastAnimTimeMs: number;
  lastSwingId: number | null;
  /** Clip actually assigned to the sprite, retained during impact frame holds. */
  displayed:
    | (Pick<RenderEntityView, 'anim' | 'facing' | 'animTimeMs'> & {
        playerPose?: import('../../animation/PlayerMotion').PlayerPose;
        playerFace?: import('../../animation/PlayerFace').PlayerFaceInfo;
      })
    | null;
}

interface PortalEntry {
  readonly view: PortalView;
  readonly machine: PortalVisualMachine;
}

/** Player alpha while blinking out the post-hit invulnerability (~12 Hz). */
export function hurtBlinkAlpha(sinceHurtMs: number): number {
  return Math.floor(sinceHurtMs / 42) % 2 === 0 ? 0.35 : 1;
}

/**
 * Animation-set key for an entity. Projectiles arrive as `spriteKey:
 * 'projectile'`; their `projectileType` selects acid or magic-bolt art.
 */
function artKey(e: RenderEntityView): string {
  if (e.kind === 'projectile' && e.spriteKey === 'projectile')
    return e.projectileType ?? 'magic_bolt';
  return e.spriteKey;
}

/** Owns actor visuals, presentation clocks, portal views and water masks. */
export class EntityLayer {
  private readonly lootView = new LootView();
  private waterMask = new Graphics();
  private waterRipple = new Graphics();
  private waterFxMask = new Graphics();
  private wading: ReturnType<typeof wadingPose> | null = null;
  private playerCompositor: PlayerCompositor | null = null;
  private entities = new Map<string, EntityVisual>();
  private portals = new Map<string, PortalEntry>();
  private animator = new EntityAnimator();
  private hurtFilter = new ColorMatrixFilter();
  private enemyFilter = new ColorMatrixFilter();
  renderedEntities = 0;
  placeholderSprites = 0;
  enteringPortal = false;
  constructor(
    private readonly textures: TextureStore,
    private readonly actors: Container,
    private readonly groundFx: Container,
    private readonly nestView: NestView,
    private readonly camera: Camera,
    private readonly spriteInfo: WeakMap<Container, SpriteDebugInfo>,
    private readonly tag: <T extends Container>(sprite: T, assetId: string, layer: string) => T,
  ) {}
  attach(): void {
    this.hurtFilter.brightness(2.4, false);
    this.enemyFilter.brightness(1.18, false);
    this.actors.addChild(this.waterMask, this.waterRipple, this.waterFxMask);
    this.waterRipple.mask = this.waterFxMask;
  }
  resetActors(): void {
    for (const visual of this.entities.values()) {
      visual.sprite.destroy();
      visual.shadow?.destroy();
    }
    this.entities.clear();
    for (const { view } of this.portals.values()) view.destroy({ children: true });
    this.portals.clear();
    this.animator.clear();
    this.playerCompositor?.reset();
  }
  resetLoot(): void {
    this.lootView.reset();
    this.actors.addChild(this.lootView.container);
    this.lootView.container.zIndex = 1e8;
  }
  rebase(dx: number, dy: number): void {
    this.lootView.rebase(dx, dy);
    this.animator.rebase(dx, dy);
  }
  destroy(): void {
    this.playerCompositor?.destroy();
    this.playerCompositor = null;
  }
  get portalStates(): readonly string[] {
    return [...this.portals.values()].map((p) => p.machine.state);
  }
  private drawWading(
    cx: number,
    cut: number,
    half: number,
    dx: number,
    dy: number,
    frame: EntityFrame,
  ): void {
    const g = this.waterRipple,
      t = frame.visualTime,
      moving = dx !== 0 || dy !== 0;
    // Body under the surface: a dark, narrowing silhouette instead of a hard cut.
    for (let row = 0; row < 4; row++)
      g.rect(cx - half + row, cut + 1 + row, (half - row) * 2, 1).fill({
        color: WATER_PALETTE.deep,
        alpha: 0.45 - row * 0.08,
      });
    // Collar: a steady pixel ellipse hugging the body at the surface.
    for (let i = 0; i < 20; i++) {
      const a = (i / 20) * Math.PI * 2;
      g.rect(
        Math.round(cx + Math.cos(a) * (half + 2)),
        Math.round(cut + Math.sin(a) * 3),
        1,
        1,
      ).fill({ color: WATER_PALETTE.foam, alpha: 0.9 });
    }
    // Ripple rings: dotted ellipses that expand and fade; quicker while moving.
    const period = moving ? 620 : 1300;
    for (let k = 0; k < 2; k++) {
      const phase = (t / period + k / 2) % 1;
      const rx = half + 4 + phase * 14,
        ry = Math.max(2, rx * 0.34),
        dots = 16 + Math.round(phase * 12);
      for (let i = 0; i < dots; i++) {
        const a = (i / dots) * Math.PI * 2;
        g.rect(
          Math.round(cx + Math.cos(a) * rx),
          Math.round(cut + Math.sin(a) * ry),
          i % 3 ? 1 : 2,
          1,
        ).fill({ color: WATER_PALETTE.foam, alpha: (1 - phase) * 0.95 });
      }
    }
    // Waterline: bright lip with a stepped, shorter row beneath it.
    g.rect(cx - half, cut - 1, half * 2, 1).fill({ color: WATER_PALETTE.foam, alpha: 0.95 });
    g.rect(cx - half + 2, cut, half * 2 - 4, 1).fill({ color: WATER_PALETTE.wave, alpha: 0.9 });
    if (!moving) return;
    // Splash droplets kicked up on the trailing side.
    const len = Math.hypot(dx, dy) || 1,
      bx = -dx / len,
      by = -dy / len;
    for (let i = 0; i < 4; i++) {
      const phase = (t / 340 + i / 4) % 1,
        side = (i % 2 ? 1 : -1) * (2 + i);
      const px = cx + bx * (half + phase * 7) - by * side,
        py = cut + by * phase * 4 + bx * side * 0.3 - Math.sin(phase * Math.PI) * 6;
      const size = phase < 0.6 ? 2 : 1;
      g.rect(Math.round(px), Math.round(py), size, size).fill({
        color: i % 2 ? WATER_PALETTE.foam : WATER_PALETTE.glint,
        alpha: 1 - phase,
      });
    }
  }
  render(
    snapshot: RenderSnapshot,
    alpha: number,
    dt: number,
    player: RenderEntityView | undefined,
    fx: EffectTextures,
    effects: EffectsLayer,
    frame: EntityFrame,
  ): void {
    this.lootView.update(snapshot, frame.paused ? 0 : dt, effects);
    this.waterMask.clear();
    this.waterRipple.clear();
    this.waterFxMask.clear();
    effects.ground.clear();
    this.wading = null;
    effects.syncPlayerSlash(null);
    this.animator.beginFrame();
    const alive = new Set<string>();
    this.renderedEntities = snapshot.entities.length;
    this.placeholderSprites = 0;
    let entering = false;
    for (const e of snapshot.entities) {
      alive.add(e.id);
      const x = (e.prevX + (e.x - e.prevX) * alpha) * TILE;
      const y = (e.prevY + (e.y - e.prevY) * alpha - e.lift) * TILE;
      if (e.kind === 'portal') {
        if (this.renderPortal(e, x, y, dt, snapshot, player, fx, frame)) entering = true;
        continue;
      }
      const spriteKey = artKey(e);

      let visual = this.entities.get(e.id);
      const isNew = !visual;
      if (!visual) {
        visual = {
          sprite: new Sprite(),
          kind: e.kind,
          spriteKey,
          hurtSince: -1,
          diedInView: false,
          quietRemoval: false,
          shadow: null,
          lastAnim: e.anim,
          lastAnimTimeMs: e.animTimeMs,
          lastSwingId: null,
          displayed: null,
        };
        if (e.kind !== 'projectile') {
          visual.shadow = new Sprite(fx.glow);
          visual.shadow.anchor.set(0.5);
          visual.shadow.tint = 0x000000;
          this.groundFx.addChild(visual.shadow);
        }
        this.actors.addChild(visual.sprite);
        this.entities.set(e.id, visual);
      }
      const sprite = visual.sprite;
      visual.kind = e.kind;
      visual.spriteKey = spriteKey;
      visual.quietRemoval = e.quietRemoval === true;
      const anim = this.animator.resolve(
        e.nestEmergence
          ? {
              ...e,
              spriteKey,
              anim: 'walk',
              moving: true,
              animTimeMs: e.nestEmergence.progress * 800,
            }
          : spriteKey === e.spriteKey
            ? e
            : { ...e, spriteKey },
        frame.paused ? 0 : dt,
        e.kind === 'player' ? { x, y: y + e.lift * TILE } : undefined,
      );
      const f = resolveSpriteFrame(anim);
      const started =
        e.kind === 'player'
          ? !!e.attack && e.attack.swingId !== visual.lastSwingId
          : e.anim === 'attack' &&
            (visual.lastAnim !== 'attack' || e.animTimeMs + 1 < visual.lastAnimTimeMs);
      // Hold a frame within its clip, never an old pose from another facing or
      // animation. A new swing must display its own first frame immediately.
      const holdFrame =
        frame.impactHoldMs > 0 &&
        !isNew &&
        !started &&
        visual.displayed?.anim === anim.anim &&
        visual.displayed.facing === anim.facing &&
        (e.kind === 'player' || e.kind === 'enemy');
      if (anim.playerPose) {
        this.playerCompositor ??= new PlayerCompositor();
        // Advance independently of action time, including while a displayed
        // frame is held, so an impact/pause cannot accumulate catch-up time.
        this.playerCompositor.updateBlink?.(
          snapshot.elapsedMs ?? frame.visualTime,
          frame.paused || holdFrame || !!e.dead,
        );
      }
      if (!holdFrame) {
        let texture: Texture;
        if (e.chest)
          texture = this.textures.get(
            `woodland_chest_${e.chest.variant}_${e.chest.state === 'closed' ? 0 : e.chest.state === 'opened' ? 3 : Math.min(2, 1 + Math.floor(e.chest.elapsedMs / 300))}`,
          );
        else if (spriteKey === 'magic_bolt') texture = fx.bolt;
        else if (f.placeholder) texture = this.textures.getPlaceholder();
        else
          texture = this.textures.getRect(
            f.textureAlias,
            f.frame.x,
            f.frame.y,
            f.frame.w,
            f.frame.h,
          );
        if (anim.playerPose) {
          this.playerCompositor ??= new PlayerCompositor();
          texture = this.playerCompositor.render(frame.renderer, this.textures, anim.playerPose);
        }
        sprite.texture = texture;
        visual.displayed = {
          anim: anim.anim,
          facing: anim.facing,
          animTimeMs: anim.animTimeMs,
          ...(anim.playerPose ? { playerPose: anim.playerPose } : {}),
          ...(anim.playerPose && this.playerCompositor?.face
            ? { playerFace: this.playerCompositor.face }
            : {}),
        };
        this.spriteInfo.set(sprite, {
          assetId:
            spriteKey === 'magic_bolt' ? 'procedural:magic_bolt' : f.textureAlias || 'placeholder',
          layer: `actors/${e.kind}`,
        });
      }
      if (this.textures.isPlaceholder(sprite.texture)) this.placeholderSprites++;

      const flip = f.flipX ? -1 : 1;
      let sx = f.scale * flip,
        sy = f.scale;
      if (spriteKey === 'coin') sx = sy = 1;
      if (anim.telegraph > 0) {
        // Wind-up: squash and a red ground ring under the attacker.
        sx *= 1 + 0.1 * anim.telegraph;
        sy *= 1 - 0.1 * anim.telegraph;
        effects.ground
          .circle(x, (e.y + 0.3) * TILE, 9 + (1 - anim.telegraph) * 8)
          .stroke({ width: 1.5, color: 0xff4a3a, alpha: 0.85 * anim.telegraph });
      }
      if (spriteKey === 'magic_bolt') {
        sx = sy = 1;
        if (!frame.paused) effects.trail(x, y, y - 1);
      }
      sprite.anchor.set(f.anchorX, f.anchorY);
      sprite.scale.set(sx, sy);
      sprite.position.set(x, y);
      if (spriteKey === 'coin') sprite.y -= Math.round(2 + Math.sin(e.animTimeMs / 190) * 2);
      sprite.zIndex = y + e.lift * TILE;
      sprite.alpha = e.alpha;
      if (e.kind === 'enemy') this.nestView.apply(e, sprite);
      if (e.formation !== undefined) {
        const progress = Math.max(1 / 16, Math.round(e.formation * 16) / 16);
        const growth = e.spriteKey === 'ghost' ? 0.5 + progress * 0.5 : progress;
        sprite.scale.y *= growth;
        sprite.y += 10 * (1 - growth);
      }
      if (e.dead) {
        // Death shown by the simulation: fade and shrink over its death window.
        const t = Math.min(1, anim.animTimeMs / DEATH_FADE_MS);
        visual.diedInView = true;
        sprite.alpha = e.alpha * (1 - t);
        sprite.scale.set(sx * (1 - 0.4 * t), sy * (1 - 0.4 * t));
      }

      // Hurt: a short white flash, a brief red tint, then (player) a blink for
      // the rest of the invulnerability instead of staying solid red.
      if (e.hurtFlash) {
        if (visual.hurtSince < 0) visual.hurtSince = frame.visualTime;
        const since = frame.visualTime - visual.hurtSince;
        const white = since < HURT_WHITE_MS,
          red = !white && since < HURT_RED_MS;
        sprite.filters = white ? [this.hurtFilter] : e.kind === 'enemy' ? [this.enemyFilter] : null;
        sprite.tint = red || (e.kind === 'enemy' && !white) ? 0xff8080 : 0xffffff;
        if (e.kind === 'player' && !white && !red) sprite.alpha *= hurtBlinkAlpha(since);
        if (e.kind === 'enemy' && since < 160) sprite.x += Math.sin(since / 18) * 1.5;
      } else {
        visual.hurtSince = -1;
        sprite.filters = e.kind === 'enemy' ? [this.enemyFilter] : null;
        sprite.tint = e.dead ? 0xffc4c4 : 0xffffff;
      }

      // Ground shadow: stays on the ground during a jump and shrinks with height.
      // The remaster's 64 px cell includes padding; preserve the old 40 px
      // player presentation width for shadows and water ripples.
      const effectWidth = e.kind === 'player' ? 40 : Math.abs(sprite.width);
      if (visual.shadow) {
        const groundY = (e.prevY + (e.y - e.prevY) * alpha) * TILE + (e.kind === 'pickup' ? 9 : 8);
        const w = Math.max(14, Math.min(46, effectWidth * 0.7)) * (1 - Math.min(0.5, e.lift * 0.3));
        visual.shadow.position.set(x, groundY);
        visual.shadow.scale.set(w / 64, (w * 0.34) / 64);
        visual.shadow.alpha = e.nestEmergence ? 0 : 0.42 * sprite.alpha;
      }

      // The simulation owns swing identity, combo and age. Following the same
      // interpolated origin as the actor keeps moving attacks aligned.
      if (e.kind === 'player') {
        effects.syncPlayerSlash(
          e.attack
            ? {
                swingId: e.attack.swingId,
                comboStep: e.attack.comboStep,
                x,
                y: y - 12,
                angle: FACING_ANGLE[e.attack.direction] ?? Math.PI / 2,
                age: e.attack.elapsedMs,
              }
            : null,
        );
        visual.lastSwingId = e.attack?.swingId ?? null;
      }
      visual.lastAnim = e.anim;
      visual.lastAnimTimeMs = e.animTimeMs;

      if (e.kind === 'player') {
        if (e.submerged) {
          const pose = wadingPose(x, y);
          this.wading = pose;
          sprite.y = pose.spriteY;
          const height = Math.abs(sprite.height);
          const top = sprite.y - f.anchorY * height;
          const cut = Math.round(pose.waterlineY);
          this.waterMask.rect(sprite.x - 100, top - 5, 200, cut - top + 5).fill(0xffffff);
          sprite.mask = this.waterMask;
          for (const b of nearbyWaterBounds(snapshot.world, x, pose.waterlineY))
            this.waterFxMask
              .rect(
                b.minX * TILE,
                b.minY * TILE,
                (b.maxX - b.minX) * TILE,
                (b.maxY - b.minY) * TILE,
              )
              .fill(0xffffff);
          this.drawWading(
            Math.round(sprite.x),
            cut,
            Math.max(6, Math.round(effectWidth * 0.26)),
            e.x - e.prevX,
            e.y - e.prevY,
            frame,
          );
          // The ground shadow would show through the water as a dark blob.
          if (visual.shadow) visual.shadow.alpha = 0;
          this.waterRipple.zIndex = y + 1;
        } else sprite.mask = null;
      }
    }
    this.enteringPortal = entering;

    for (const [id, visual] of this.entities) {
      if (alive.has(id)) continue;
      const s = visual.sprite;
      if (!frame.streamingRebase && !frame.paused && !s.destroyed && !visual.quietRemoval) {
        if (visual.kind === 'enemy' && visual.diedInView)
          effects.burst(s.x, s.y - 10, 0xd9d2c4, 7, s.zIndex + 1, 0.05);
        else if (visual.kind === 'enemy')
          effects.spawnDeath(
            s.texture,
            s.x,
            s.y,
            s.anchor.x,
            s.anchor.y,
            s.scale.x,
            s.scale.y,
            s.zIndex,
          );
        else if (visual.kind === 'pickup')
          effects.burst(
            s.x,
            s.y,
            visual.spriteKey === 'coin' ? 0xffd84a : 0xf0f0ff,
            8,
            s.zIndex + 1,
          );
        else if (visual.kind === 'projectile')
          effects.burst(
            s.x,
            s.y,
            visual.spriteKey === 'acid' ? 0x9be04a : 0x8fe3ff,
            5,
            s.zIndex + 1,
            0.04,
          );
      }
      visual.shadow?.destroy();
      s.destroy();
      this.entities.delete(id);
    }
    for (const [id, entry] of this.portals)
      if (!alive.has(id)) {
        entry.view.destroy({ children: true });
        this.portals.delete(id);
      }
    this.animator.sweep();
  }
  private renderPortal(
    e: RenderEntityView,
    x: number,
    y: number,
    dt: number,
    snapshot: RenderSnapshot,
    player: RenderEntityView | undefined,
    fx: EffectTextures,
    frame: EntityFrame,
  ): boolean {
    if (snapshot.world.window) {
      const rect = this.camera.getVisibleRect();
      if (
        x < rect.x - 128 ||
        y < rect.y - 128 ||
        x > rect.x + rect.width + 128 ||
        y > rect.y + rect.height + 128
      ) {
        const offscreen = this.portals.get(e.id);
        if (offscreen) offscreen.view.visible = false;
        return false;
      }
    }
    let entry = this.portals.get(e.id);
    if (!entry) {
      const view = this.tag(
        new PortalView(this.textures.get(PORTAL_ART_ALIAS), fx),
        PORTAL_ART_ALIAS,
        'actors/portal',
      );
      entry = { view, machine: new PortalVisualMachine() };
      this.actors.addChild(view);
      this.portals.set(e.id, entry);
    }
    if (this.textures.isPlaceholder(entry.view.artTexture)) this.placeholderSprites++;
    entry.view.visible = true;
    const distance = player ? Math.hypot(e.x - player.x, e.y - player.y) : Infinity;
    const state = entry.machine.update({
      active: e.active === true,
      explicit: e.portalState,
      playerDistance: distance,
      dtMs: frame.paused ? 0 : dt,
    });
    let label: string;
    if (state === 'open' || state === 'transitioning')
      label = translate(frame.language, 'PORTAL OPEN');
    else {
      const coins =
        snapshot.round?.coinsRemaining ??
        snapshot.entities.filter(
          (item) => item.spriteKey === 'coin' && item.requiredForCompletion !== false,
        ).length;
      const enemies =
        snapshot.round?.enemiesRemaining ??
        snapshot.entities.filter((item) => item.kind === 'enemy' && item.spriteKey !== 'ghost')
          .length + (snapshot.encounters?.pendingBosses ?? 0);
      const progress = `${coins} ${translate(frame.language, 'Coins')} • ${enemies} ${translate(frame.language, 'foes')}`;
      label =
        state === 'reacting'
          ? `${translate(frame.language, 'Portal sealed')}\n${progress}`
          : progress;
    }
    // Foot point = bottom edge of the portal tile; the steps cover the entry point.
    entry.view.position.set(x, y + TILE / 2);
    entry.view.zIndex = entry.view.y;
    entry.view.update(state, entry.machine.reactProgress, dt, frame.paused, label);
    // Generous margin: at low frame rates a sprinting player can cross the
    // entry radius between two rendered frames.
    return (
      (state === 'open' || state === 'transitioning') &&
      distance <= PORTAL_ENTER_RADIUS_ASSUMED + 0.8
    );
  }
  getDebugInfo(): Pick<
    VisualDebugInfo,
    | 'playerSprite'
    | 'playerDepth'
    | 'wading'
    | 'portalStates'
    | 'portalViews'
    | 'portalTextures'
    | 'projectiles'
  > {
    const player = [...this.entities.values()].find((v) => v.kind === 'player');
    const sprite = player?.sprite;
    const bounds = sprite?.getBounds();
    return {
      playerSprite:
        sprite && player?.displayed && bounds
          ? {
              ...player.displayed,
              position: { x: sprite.x, y: sprite.y },
              assetId: this.spriteInfo.get(sprite)?.assetId ?? 'placeholder',
              frame: {
                x: sprite.texture.frame.x,
                y: sprite.texture.frame.y,
                w: sprite.texture.frame.width,
                h: sprite.texture.frame.height,
              },
              scaleX: sprite.scale.x,
              scaleY: sprite.scale.y,
              rotation: sprite.rotation,
              transform: {
                a: sprite.worldTransform.a,
                b: sprite.worldTransform.b,
                c: sprite.worldTransform.c,
                d: sprite.worldTransform.d,
              },
              bounds: { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height },
            }
          : null,
      playerDepth: [...this.entities.values()].find((v) => v.kind === 'player')?.sprite.zIndex,
      wading: this.wading,
      portalStates: [...this.portals.values()].map((p) => p.machine.state),
      portalViews: this.portals.size,
      portalTextures: [...this.portals].map(([id, { view }]) => ({
        id,
        width: view.artTexture.width,
        height: view.artTexture.height,
        placeholder: this.textures.isPlaceholder(view.artTexture),
      })),
      projectiles: [...this.entities.values()].filter((v) => v.kind === 'projectile').length,
    };
  }
}
