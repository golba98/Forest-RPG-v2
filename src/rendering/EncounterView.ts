import { Container, Graphics, Text } from 'pixi.js';
import type { RenderSnapshot } from '../types/render';
import type { Language } from '../types/languages';
import { translate } from '../ui/i18n';

/** Encounter phase effects and HUD; static grove artwork lives in GroveView. */
export class EncounterView {
  readonly effects = new Graphics();
  readonly glow = new Graphics();
  readonly hud = new Container();
  private panel = new Graphics();
  private name = new Text({
    text: '',
    style: {
      fontFamily: 'DejaVu Sans Mono, monospace',
      fontSize: 14,
      fontWeight: 'bold',
      fill: 0xf5e4bd,
    },
  });
  private prompt = new Text({
    text: '',
    style: {
      fontFamily: 'DejaVu Sans Mono, monospace',
      fontSize: 12,
      fill: 0xffe8a6,
      stroke: { color: 0x102219, width: 4 },
    },
  });
  constructor() {
    this.hud.addChild(this.panel, this.name, this.prompt);
    this.name.anchor.set(0.5, 0);
    this.prompt.anchor.set(0.5);
  }
  reset(): void {
    this.effects.clear();
    this.glow.clear();
  }

  update(
    snapshot: RenderSnapshot,
    time: number,
    width: number,
    height: number,
    binding: string,
    language: Language,
  ): void {
    const state = snapshot.encounters,
      sites = state?.sites ?? [];
    this.effects.clear();
    this.glow.clear();
    for (const site of sites) {
      const x = site.x * 32,
        y = site.y * 32 + 8;
      if (site.kind === 'grove') {
        for (let i = 0; i < 9; i++) {
          const phase = time / 5000 + i * 2.4;
          const px = Math.round(x + Math.sin(phase) * (30 + i * 6)),
            py = Math.round(y + Math.cos(phase * 0.7) * 35 - i * 2);
          this.glow
            .rect(px - 2, py - 2, 5, 5)
            .fill({ color: 0x98e2d4, alpha: 0.08 + snapshot.environment.darkness * 0.1 });
          this.glow
            .rect(px, py, 1, 2)
            .fill({ color: 0xd1f2e5, alpha: 0.3 + Math.sin(phase) * 0.12 });
        }
        for (let i = 0; i < 5; i++) {
          const offset = Math.round(Math.sin(time / 3000 + i) * 8);
          this.effects
            .rect(x - 70 + i * 22 + offset, y + (i % 3) * 15 - 20, 48, 3)
            .fill({ color: 0xb8d1d2, alpha: 0.08 + snapshot.environment.darkness * 0.07 });
        }
      }
    }
    for (const e of snapshot.entities)
      if (e.kind === 'enemy' && e.formation !== undefined && e.spriteKey === 'ghost') {
        const p = e.formation,
          x = e.x * 32,
          y = e.y * 32 + 8;
        for (let i = 0; i < 14; i++) {
          const a = i * 2.4 + time / 650,
            r = 10 + (1 - p) * 40;
          const px = Math.round(x + Math.cos(a) * r),
            py = Math.round(y - p * 20 + Math.sin(a) * r * 0.4);
          this.effects.rect(px, py, 2, 2).fill({ color: 0xd2f2eb, alpha: 0.3 + p * 0.6 });
          this.glow.rect(px - 2, py - 2, 5, 5).fill({ color: 0x99c4dc, alpha: 0.2 });
          this.glow.rect(px, py, 2, 2).fill({ color: 0xd2f2eb, alpha: 0.65 });
        }
      }
    this.panel.clear();
    this.name.visible = !!state?.boss;
    if (state?.boss) {
      const boss = state.boss,
        w = Math.min(400, width - 32),
        x = (width - w) / 2,
        y = width < 650 ? 86 : 20;
      this.panel
        .rect(x, y, w, 48)
        .fill({ color: 0x0d1712, alpha: 0.94 })
        .stroke({ color: 0xba9857, width: 2 });
      this.panel.rect(x + 10, y + 29, w - 20, 10).fill(0x312921);
      this.panel
        .rect(x + 11, y + 30, Math.round((w - 22) * Math.max(0, boss.health / boss.maxHealth)), 8)
        .fill(0xad533f);
      this.panel
        .rect(x + 11, y + 30, Math.round((w - 22) * Math.max(0, boss.health / boss.maxHealth)), 2)
        .fill(0xe19c69);
      this.name.text = `${translate(language, boss.name)}  ${boss.health}/${boss.maxHealth}`;
      this.name.position.set(width / 2, y + 6);
    }
    this.prompt.text =
      state?.interaction === 'disturb'
        ? `[${binding}] ${translate(language, 'Disturb nest')}`
        : state?.interaction === 'stepBack'
          ? translate(language, 'Step back to disturb the nest')
          : '';
    this.prompt.position.set(width / 2, height - (width < 650 ? 168 : 64));
  }
}
