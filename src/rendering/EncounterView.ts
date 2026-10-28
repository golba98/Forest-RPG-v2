import { Container, Graphics, Text } from 'pixi.js';
import type { RenderSnapshot } from '../types/render';
import type { Language } from '../types/languages';
import { translate } from '../ui/i18n';

/** Pixel-sized site art and phase effects; all lifecycle decisions come from the simulation. */
export class EncounterView {
  readonly ground = new Graphics();
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
  private signature = '';
  constructor() {
    this.hud.addChild(this.panel, this.name, this.prompt);
    this.name.anchor.set(0.5, 0);
    this.prompt.anchor.set(0.5);
  }
  reset(): void {
    this.signature = '';
    this.ground.clear();
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
    const signature = sites.map((s) => `${s.id}:${s.phase === 'defeated'}`).join('|');
    if (signature !== this.signature) {
      this.signature = signature;
      this.ground.clear();
      for (const site of sites) {
        const x = site.x * 32,
          y = site.y * 32 + 8;
        if (site.kind === 'grove') this.grove(x, y);
      }
    }
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
  private grove(x: number, y: number): void {
    const g = this.ground;
    g.ellipse(x, y, 75, 46).fill({ color: 0x263d3a, alpha: 0.22 });
    // A dead, split trunk and fallen branches lie flat in the grove.
    g.rect(x - 9, y - 42, 18, 58).fill(0x343c37);
    g.rect(x - 6, y - 40, 11, 53).fill(0x81867a);
    g.rect(x - 3, y - 38, 3, 48).fill(0xb4b6a0);
    g.rect(x - 3, y - 40, 4, 26).fill(0x394842);
    g.poly([x - 5, y - 28, x - 32, y - 42, x - 35, y - 49, x - 8, y - 34]).fill(0x727c70);
    g.poly([x + 3, y - 18, x + 30, y - 33, x + 36, y - 29, x + 5, y - 11]).fill(0x858e7e);
    g.rect(x - 13, y + 9, 26, 8).fill(0x44483c);
    for (let i = 0; i < 12; i++) {
      const a = i * 2.4,
        px = Math.round(x + Math.cos(a) * (42 + (i % 3) * 13)),
        py = Math.round(y + Math.sin(a) * 39);
      if (i % 3 === 0) {
        g.rect(px - 5, py - 5, 11, 8).fill(0x76887f);
        g.rect(px - 3, py - 6, 6, 2).fill(0xadb7a4);
        g.rect(px, py - 4, 1, 5).fill(0x3f5a53);
      } else {
        g.rect(px, py, 2, 6).fill(0xbcc6a9);
        g.rect(px - 3, py - 2, 8, 3).fill(0xd6ddba);
        g.rect(px - 2, py - 4, 6, 2).fill(0xb6cbbc);
      }
    }
  }
}
