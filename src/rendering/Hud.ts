import { Container, Graphics, Sprite, Text, Texture } from 'pixi.js';
import { translate } from '../ui/i18n';
import type { Language } from '../types/languages';
import type { PlayerStats, PlayerInventory } from '../types/entities';
import { hudLayout, EMPTY_INSETS, type HudLayout, type HudRect, type SafeInsets } from './hudLayout';

const INK = 0xf5ebcf,
  OUTLINE = 0x0b1610,
  HIGHLIGHT = 0xd9c27a,
  SHADOW = 0x6b5a33,
  DARK = 0x102219,
  EMPTY_HEART = 0x3b2a2a,
  FLASH_MS = 220;
function label(size = 11): Text {
  return new Text({
    text: '',
    // Supersampled so labels stay crisp when the HUD scales past 1×.
    resolution: 2,
    style: {
      fontFamily: 'DejaVu Sans Mono, monospace',
      fontSize: size,
      fontWeight: 'bold',
      fill: INK,
      stroke: { color: 0x102018, width: 2 },
    },
  });
}
/** Avoids re-rasterising text when the size is unchanged. */
function setSize(text: Text, size: number): void {
  if (text.style.fontSize !== size) text.style.fontSize = size;
}
/** Square-cornered bevelled panel: notched 2 px outline, gold highlight, bronze shadow. */
function pixelFrame(g: Graphics, x: number, y: number, w: number, h: number, fill = DARK, alpha = 0.85): void {
  g.rect(x + 1, y, w - 2, 2).fill(OUTLINE);
  g.rect(x + 1, y + h - 2, w - 2, 2).fill(OUTLINE);
  g.rect(x, y + 1, 2, h - 2).fill(OUTLINE);
  g.rect(x + w - 2, y + 1, 2, h - 2).fill(OUTLINE);
  g.rect(x + 2, y + 2, w - 4, h - 4).fill({ color: fill, alpha });
  g.rect(x + 2, y + 2, w - 4, 1).fill(HIGHLIGHT);
  g.rect(x + 2, y + 3, 1, h - 5).fill(HIGHLIGHT);
  g.rect(x + 2, y + h - 3, w - 4, 1).fill(SHADOW);
  g.rect(x + w - 3, y + 3, 1, h - 5).fill(SHADOW);
}
/** 1 px framed meter with a lighter top row on the fill. */
function pixelBar(g: Graphics, x: number, y: number, w: number, h: number, value: number, max: number, color: number, shine: number): void {
  g.rect(x, y, w, h).fill(OUTLINE);
  g.rect(x + 1, y + 1, w - 2, h - 2).fill(0x07100b);
  const fill = Math.round((w - 2) * Math.max(0, Math.min(1, value / Math.max(1, max))));
  if (fill > 0) {
    g.rect(x + 1, y + 1, fill, h - 2).fill(color);
    g.rect(x + 1, y + 1, fill, 1).fill(shine);
  }
}
/** 7×7 pixel coin. */
function pixelCoin(g: Graphics, x: number, y: number): void {
  g.rect(x + 2, y, 3, 7).fill(0x8a5a12);
  g.rect(x, y + 2, 7, 3).fill(0x8a5a12);
  g.rect(x + 1, y + 1, 5, 5).fill(0x8a5a12);
  g.rect(x + 2, y + 1, 3, 5).fill(0xf2c440);
  g.rect(x + 1, y + 2, 5, 3).fill(0xf2c440);
  g.rect(x + 2, y + 2, 1, 2).fill(0xfff2a8);
}
/**
 * Corner HUD: level/XP/coins top-left; hearts, MP/STA and a 5-slot hotbar bottom-right.
 * Layout is independent of world/camera transforms.
 */
export class Hud extends Container {
  private readonly levelPanel = new Container();
  private readonly cluster = new Container();
  private readonly levelGfx = new Graphics();
  private readonly clusterGfx = new Graphics();
  private readonly hearts = new Container();
  private readonly levelCaption = label(8);
  private readonly levelText = label(18);
  private readonly xpText = label(9);
  private readonly coinsText = label(12);
  private readonly manaText = label(8);
  private readonly staminaText = label(8);
  private readonly keys: Text[] = [];
  private readonly counts: Text[] = [];
  private readonly icons: (Sprite | null)[] = [];
  private readonly flashGfx = new Graphics();
  private readonly lastCounts: number[] = [];
  private readonly flashUntil: number[] = [];
  private geometry: HudLayout = hudLayout(1280, 720);
  private signature = '';
  constructor(
    private readonly heart: Texture,
    potions?: readonly [Texture, Texture],
  ) {
    super();
    this.levelPanel.addChild(this.levelGfx, this.levelCaption, this.levelText, this.xpText, this.coinsText);
    this.cluster.addChild(this.clusterGfx, this.hearts, this.manaText, this.staminaText);
    this.addChild(this.levelPanel, this.cluster);
    for (let i = 0; i < this.geometry.slotCount; i++) {
      const texture = potions?.[i];
      const icon = texture ? new Sprite(texture) : null;
      if (icon) {
        icon.anchor.set(0.5);
        this.cluster.addChild(icon);
      }
      this.icons.push(icon);
      const key = label(9),
        count = label(11);
      key.text = `${i + 1}`;
      count.anchor.set(1, 1);
      this.keys.push(key);
      this.counts.push(count);
      this.cluster.addChild(key, count);
    }
    this.cluster.addChild(this.flashGfx);
    this.levelCaption.anchor.set(0.5, 0);
    this.levelText.anchor.set(0.5, 0.5);
    this.xpText.anchor.set(0.5, 0.5);
    this.coinsText.anchor.set(0, 0.5);
    this.manaText.anchor.set(0.5, 0.5);
    this.staminaText.anchor.set(0.5, 0.5);
  }
  layout(
    width: number,
    height: number,
    uiScale: number,
    insets: SafeInsets = EMPTY_INSETS,
    reserveTopRight: HudRect | null = null,
  ): void {
    const next = hudLayout(width, height, uiScale, insets, reserveTopRight);
    if (next.heartStep !== this.geometry.heartStep) this.signature = '';
    this.geometry = next;
    this.levelPanel.position.set(next.level.x, next.level.y);
    this.levelPanel.scale.set(next.scale);
    this.cluster.position.set(next.cluster.x, next.cluster.y);
    this.cluster.scale.set(next.scale);
  }
  getLayoutDebug() {
    const bounds = this.getBounds(),
      level = this.levelPanel.getBounds(),
      cluster = this.cluster.getBounds();
    const rect = (b: { x: number; y: number; width: number; height: number }) => ({ x: b.x, y: b.y, width: b.width, height: b.height });
    return {
      ...rect(bounds),
      level: rect(level),
      cluster: rect(cluster),
      scale: this.geometry.scale,
      heartCount: this.hearts.children.length,
      slotCount: this.geometry.slotCount,
      visible: this.visible,
    };
  }
  update(stats: PlayerStats, inventory: PlayerInventory, language: Language): void {
    const l = this.geometry;
    this.updateLevel(stats, language);
    this.updateCluster(l, stats, inventory);
  }
  private updateLevel(stats: PlayerStats, language: Language): void {
    const g = this.levelGfx,
      { width, height } = this.geometry.level;
    g.clear();
    pixelFrame(g, 0, 0, width, height);
    // Level badge.
    const badge = height - 8,
      mid = 4 + badge / 2;
    pixelFrame(g, 4, 4, badge, badge, 0x24452a, 1);
    this.levelCaption.text = translate(language, 'Level');
    this.levelCaption.scale.set(Math.min(1, (badge - 6) / Math.max(1, this.levelCaption.getLocalBounds().width)));
    this.levelCaption.position.set(mid, 7);
    this.levelText.text = String(stats.level);
    this.levelText.scale.set(Math.min(1, (badge - 6) / Math.max(1, this.levelText.getLocalBounds().width)));
    this.levelText.position.set(mid, mid + 6);
    // XP meter.
    const barX = badge + 10,
      barW = width - barX - 6;
    pixelBar(g, barX, 8, barW, 13, stats.xp, stats.xpToNextLevel, 0x7fbf3a, 0xc4ee7e);
    this.xpText.text = `XP ${stats.xp}/${stats.xpToNextLevel}`;
    this.xpText.scale.set(Math.min(1, (barW - 4) / Math.max(1, this.xpText.getLocalBounds().width)));
    this.xpText.position.set(barX + barW / 2, 14.5);
    // Coins.
    pixelCoin(g, barX, 29);
    this.coinsText.text = `${translate(language, 'Coins')} ${stats.coins}`;
    this.coinsText.scale.set(Math.min(1, (barW - 12) / Math.max(1, this.coinsText.getLocalBounds().width)));
    this.coinsText.position.set(barX + 11, 32.5);
  }
  private updateCluster(l: HudLayout, stats: PlayerStats, inventory: PlayerInventory): void {
    const w = l.cluster.width,
      g = this.clusterGfx,
      pad = 6;
    const signature = `${stats.health}:${stats.maxHealth}:${l.heartStep}`;
    if (signature !== this.signature) {
      this.signature = signature;
      this.hearts.removeChildren().forEach((child) => child.destroy());
      const total = Math.min(20, stats.maxHealth);
      for (let i = 0; i < total; i++) {
        // First ten fill the bottom row; overflow stacks above. Rows are centred.
        const row = Math.floor(i / 10),
          inRow = Math.min(10, total - row * 10),
          col = i % 10,
          rowWidth = (inRow - 1) * l.heartStep + l.heartSize;
        const heart = new Sprite(this.heart);
        heart.width = l.heartSize;
        heart.height = l.heartSize;
        heart.position.set(Math.round((w - rowWidth) / 2) + col * l.heartStep, pad + (1 - row) * l.heartStep);
        if (i >= stats.health) heart.tint = EMPTY_HEART;
        this.hearts.addChild(heart);
      }
    }
    g.clear();
    // With ten or fewer hearts the panel drops its empty top row.
    const panelTop = stats.maxHealth > 10 ? 0 : l.heartStep;
    pixelFrame(g, 0, panelTop, w, l.vitalsHeight - panelTop);
    const barW = w - pad * 2,
      manaY = pad + l.heartStep * 2 + 3,
      bar = l.barHeight,
      staminaY = manaY + bar + 3;
    pixelBar(g, pad, manaY, barW, bar, stats.mana, stats.maxMana, 0x3f8fd0, 0x9ad4f5);
    pixelBar(g, pad, staminaY, barW, bar, stats.stamina, stats.maxStamina, 0x6fa83e, 0xbfe68a);
    const small = l.compact ? 8 : 9;
    setSize(this.manaText, small);
    this.manaText.text = `MP ${Math.floor(stats.mana)}/${stats.maxMana}`;
    this.manaText.position.set(w / 2, manaY + bar / 2);
    setSize(this.staminaText, small);
    this.staminaText.text = `STA ${Math.floor(stats.stamina)}/${stats.maxStamina}`;
    this.staminaText.position.set(w / 2, staminaY + bar / 2);

    const now = performance.now(),
      top = l.vitalsHeight + 4,
      s = l.slotSize,
      counts = [inventory.healthPotions, inventory.speedPotions];
    this.flashGfx.clear();
    for (let i = 0; i < l.slotCount; i++) {
      const x = i * (s + l.slotGap),
        count = counts[i],
        hasItem = count !== undefined && count > 0;
      if (count !== undefined) {
        const previous = this.lastCounts[i];
        if (previous !== undefined && count < previous) this.flashUntil[i] = now + FLASH_MS;
        this.lastCounts[i] = count;
      }
      pixelFrame(g, x, top, s, s, DARK, count === undefined ? 0.55 : 0.9);
      const icon = this.icons[i];
      if (icon) {
        const size = s - 14;
        icon.position.set(Math.round(x + s / 2), Math.round(top + s / 2 + 1));
        icon.scale.set(Math.min(size / icon.texture.width, size / icon.texture.height));
        icon.alpha = hasItem ? 1 : 0.35;
      }
      const key = this.keys[i];
      if (key) {
        setSize(key, l.compact ? 9 : 10);
        key.position.set(x + 4, top + 2);
        key.alpha = count === undefined ? 0.45 : 1;
      }
      const text = this.counts[i];
      if (text) {
        setSize(text, l.compact ? 11 : 13);
        text.text = count === undefined ? '' : count > 999 ? '999+' : String(count);
        text.position.set(x + s - 3, top + s - 1);
      }
      const remaining = (this.flashUntil[i] ?? 0) - now;
      if (remaining > 0)
        this.flashGfx.rect(x + 2, top + 2, s - 4, s - 4).fill({ color: 0xffffff, alpha: 0.6 * (remaining / FLASH_MS) });
    }
  }
}
