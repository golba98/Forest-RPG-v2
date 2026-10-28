import { Container, Graphics, Sprite, Text, Texture } from 'pixi.js';
import { translate } from '../ui/i18n';
import type { Language } from '../types/languages';
import type { PlayerStats, PlayerInventory } from '../types/entities';

/** Screen-space player status, using the game's heart artwork. */
export class Hud extends Container {
  private panel = new Graphics();
  private bars = new Graphics();
  private hearts = new Container();
  private text = new Text({ text: '', style: { fontFamily: 'Georgia', fontSize: 13, fill: 0xf5ebcf, stroke: { color: 0x172719, width: 3 } } });
  private labels = new Text({ text: '', style: { fontFamily: 'Georgia', fontSize: 11, fill: 0xf5ebcf, stroke: { color: 0x172719, width: 2 } } });
  private signature = '';
  constructor(private readonly heart: Texture) {
    super(); this.addChild(this.panel, this.bars, this.hearts, this.labels, this.text);
  }
  update(stats: PlayerStats, inventory: PlayerInventory, language: Language): void {
    const signature = `${stats.health},${stats.maxHealth}`;
    if (signature !== this.signature) {
      this.signature = signature; this.hearts.removeChildren().forEach(child => child.destroy());
      for (let i = 0; i < stats.maxHealth; i++) {
        const heart = new Sprite(this.heart); heart.width = 16; heart.height = 16; heart.x = 15 + (i % 14) * 17; heart.y = 9 + Math.floor(i / 14) * 16;
        heart.alpha = i < stats.health ? 1 : 0.25; this.hearts.addChild(heart);
      }
    }
    const extra = stats.maxHealth > 14 ? 16 : 0;
    this.panel.clear().roundRect(0, 0, 278, 116 + extra, 8).fill({ color: 0x12261b, alpha: 0.86 }).stroke({ color: 0xb29b63, width: 1 });
    this.text.position.set(16, 88 + extra); this.labels.position.set(202, 30 + extra);
    this.labels.text = `${Math.floor(stats.mana)}/${stats.maxMana}\n${Math.floor(stats.stamina)}/${stats.maxStamina}\n${stats.xp}/${stats.xpToNextLevel}`;
    this.bars.clear();
    const bar = (y: number, value: number, max: number, color: number) => {
      this.bars.roundRect(15, y, 180, 10, 3).fill(0x1b251c).stroke({ color: 0x9f9569, width: 1 });
      this.bars.roundRect(16, y + 1, 178 * Math.max(0, Math.min(1, value / Math.max(1, max))), 8, 2).fill(color);
    };
    bar(32 + extra, stats.mana, stats.maxMana, 0x549bc1); bar(48 + extra, stats.stamina, stats.maxStamina, 0x81b255); bar(64 + extra, stats.xp, stats.xpToNextLevel, 0xd5ac4d);
    this.text.text = `${translate(language, 'Level')} ${stats.level}   ${translate(language, 'Coins')} ${stats.coins}   ${translate(language, 'Potions')} ${inventory.healthPotions}/${inventory.speedPotions}`;
  }
}
