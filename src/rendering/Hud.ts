import { Container, Graphics, Sprite, Text, Texture } from 'pixi.js';
import { translate } from '../ui/i18n';
import type { Language } from '../types/languages';
import type { PlayerStats, PlayerInventory } from '../types/entities';
import { hudLayout, EMPTY_INSETS, type HudLayout, type SafeInsets } from './hudLayout';

const INK = 0xf5ebcf,
  BORDER = 0xb29b63,
  DARK = 0x102219;
function label(size = 11): Text {
  return new Text({
    text: '',
    style: {
      fontFamily: 'DejaVu Sans Mono, monospace',
      fontSize: size,
      fill: INK,
      stroke: { color: 0x102018, width: 2 },
    },
  });
}
/** Bottom-centred status strip. Layout is independent of world/camera transforms. */
export class Hud extends Container {
  private readonly backing = new Graphics();
  private readonly bars = new Graphics();
  private readonly hearts = new Container();
  private readonly manaText = label();
  private readonly staminaText = label();
  private readonly levelText = label();
  private readonly xpText = label();
  private readonly coinsText = label();
  private readonly potionText = [label(12), label(12)];
  private readonly keys = [label(10), label(10)];
  private readonly icons: Sprite[] = [];
  private geometry: HudLayout = hudLayout(1280, 720);
  private signature = '';
  constructor(
    private readonly heart: Texture,
    potions?: readonly [Texture, Texture],
  ) {
    super();
    this.addChild(
      this.backing,
      this.bars,
      this.hearts,
      this.manaText,
      this.staminaText,
      this.levelText,
      this.xpText,
      this.coinsText,
      ...this.potionText,
      ...this.keys,
    );
    if (potions)
      for (const texture of potions) {
        const sprite = new Sprite(texture);
        sprite.anchor.set(0.5);
        this.icons.push(sprite);
        this.addChild(sprite);
      }
    this.manaText.anchor.set(1, 0);
    this.staminaText.anchor.set(1, 0);
    this.xpText.anchor.set(0.5, 0);
    this.coinsText.anchor.set(1, 0.5);
    for (const text of this.potionText) text.anchor.set(1, 1);
  }
  layout(width: number, height: number, uiScale: number, insets: SafeInsets = EMPTY_INSETS): void {
    const next = hudLayout(width, height, uiScale, insets);
    if (next.width !== this.geometry.width) this.signature = '';
    this.geometry = next;
    this.position.set(next.x, next.y);
    this.scale.set(next.scale);
  }
  getLayoutDebug() {
    const bounds = this.getBounds();
    return {
      x: bounds.x,
      y: bounds.y,
      width: bounds.width,
      height: bounds.height,
      scale: this.geometry.scale,
      heartCount: this.hearts.children.length,
      visible: this.visible,
    };
  }
  update(stats: PlayerStats, inventory: PlayerInventory, language: Language): void {
    const l = this.geometry,
      w = l.width;
    const signature = `${stats.health}:${stats.maxHealth}:${w}`;
    if (signature !== this.signature) {
      this.signature = signature;
      this.hearts.removeChildren().forEach((child) => child.destroy());
      for (let i = 0; i < Math.min(20, stats.maxHealth); i++) {
        const heart = new Sprite(this.heart);
        heart.width = l.heartSize;
        heart.height = l.heartSize;
        heart.position.set((i % 10) * l.heartStep, 16 - Math.floor(i / 10) * 16);
        heart.alpha = i < stats.health ? 1 : 0.25;
        this.hearts.addChild(heart);
      }
    }
    this.backing.clear();
    this.bars.clear();
    // Small backings keep the field visible between the status and item groups.
    this.backing.roundRect(-6, -5, l.leftWidth + 12, 62, 4).fill({ color: DARK, alpha: 0.78 });
    this.backing
      .roundRect(l.rightX - 6, -5, l.rightWidth + 12, 62, 4)
      .fill({ color: DARK, alpha: 0.78 });
    const bar = (
      x: number,
      y: number,
      width: number,
      height: number,
      value: number,
      max: number,
      color: number,
    ) => {
      this.bars.rect(x, y, width, height).fill(0x07100b).stroke({ color: BORDER, width: 1 });
      const fill = (width - 2) * Math.max(0, Math.min(1, value / Math.max(1, max)));
      if (fill > 0) this.bars.rect(x + 1, y + 1, fill, height - 2).fill(color);
    };
    bar(0, 36, l.leftWidth, 7, stats.mana, stats.maxMana, 0x4ba7dc);
    bar(l.rightX, 18, l.rightWidth, 12, stats.stamina, stats.maxStamina, 0x84bb4e);
    this.manaText.text = `MP ${Math.floor(stats.mana)}/${stats.maxMana}`;
    this.manaText.position.set(l.leftWidth, 44);
    this.staminaText.text = `STA ${Math.floor(stats.stamina)}/${stats.maxStamina}`;
    this.staminaText.position.set(w, 34);
    const centre = w / 2,
      slot = 32,
      gap = 6,
      start = centre - slot - gap / 2;
    const counts = [inventory.healthPotions, inventory.speedPotions];
    for (let i = 0; i < 2; i++) {
      const x = start + i * (slot + gap);
      this.backing
        .rect(x, 57, slot, slot)
        .fill({ color: DARK, alpha: 0.94 })
        .stroke({ color: BORDER, width: 1.5 });
      const icon = this.icons[i];
      if (icon) {
        icon.position.set(x + slot / 2, 70);
        const size = 20;
        icon.scale.set(Math.min(size / icon.texture.width, size / icon.texture.height));
        icon.alpha = (counts[i] ?? 0) > 0 ? 1 : 0.4;
      }
      const key = this.keys[i];
      if (key) {
        key.text = `${i + 1}`;
        key.position.set(x + 3, 59);
      }
      const text = this.potionText[i];
      if (text) {
        const count = counts[i] ?? 0;
        text.text = count > 999 ? '999+' : String(count);
        text.position.set(x + slot - 2, 88);
      }
    }
    this.levelText.text = `${translate(language, 'Level')} ${stats.level}`;
    this.levelText.position.set(0, 77);
    this.coinsText.text = `${translate(language, 'Coins')} ${stats.coins}`;
    this.coinsText.position.set(w, 80);
    // Long translated labels/counts fit their own cells rather than the potion slots.
    const labelWidth = start - 8;
    this.levelText.scale.set(
      Math.min(1, labelWidth / Math.max(1, this.levelText.getLocalBounds().width)),
    );
    this.coinsText.scale.set(
      Math.min(1, labelWidth / Math.max(1, this.coinsText.getLocalBounds().width)),
    );
    bar(0, 96, w, 7, stats.xp, stats.xpToNextLevel, 0x9bd34c);
    this.xpText.text = `XP ${stats.xp}/${stats.xpToNextLevel}`;
    this.xpText.position.set(w / 2, 105);
    this.xpText.visible = true;
  }
}
