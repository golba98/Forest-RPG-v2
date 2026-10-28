import type { Game, GameShell as Shell, SceneState } from '../game/Game';
import type { SettingsStore } from '../persistence/SettingsStore';

export class GameShell implements Shell {
  game!: Game;
  private panel = document.createElement('section');
  private previousFocus: HTMLElement | null = null;
  constructor(private settings: SettingsStore, private applySettings: () => void) {
    const style = document.createElement('style');
    style.textContent = `#game-overlay{position:fixed;inset:0;display:flex;align-items:center;justify-content:center;background:#07140cc9;z-index:10;color:#eee;font:18px monospace}#game-overlay[hidden]{display:none}#game-overlay>div{background:#142b1e;border:3px solid #85aa68;padding:32px;min-width:290px;max-height:85vh;overflow:auto}#game-overlay button,#game-overlay select{display:block;width:100%;padding:12px;margin:10px 0;background:#284833;color:#fff;border:2px solid #85aa68;font:inherit;cursor:pointer}#game-overlay :focus-visible{outline:3px solid #f4da75}#game-overlay label{display:block;margin:12px 0}#game-overlay input{margin-left:12px}`;
    document.head.append(style); this.panel.id = 'game-overlay'; this.panel.hidden = true;
    this.panel.setAttribute('role', 'dialog'); this.panel.setAttribute('aria-modal', 'true'); this.panel.setAttribute('aria-label', 'Forest RPG menu');
    document.body.append(this.panel);
    this.panel.addEventListener('keydown', e => {
      if (e.code === 'Escape') { e.preventDefault(); if (this.game.currentScene === 'paused') this.game.resume(); }
      if (e.code !== 'Tab') return;
      const controls = [...this.panel.querySelectorAll<HTMLElement>('button,input,select')];
      const first = controls[0], last = controls.at(-1);
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); }
    });
  }
  onLoadingProgress(progress: number, status: string): void {
    const label = document.querySelector('#loading-screen span'); if (label) label.textContent = `${status} ${Math.round(progress * 100)}%`;
  }
  onLoadingFailed(error: Error): void { const el = document.querySelector('#loading-screen'); if (el) el.textContent = `Unable to start: ${error.message}`; }
  onSceneChanged(scene: SceneState): void {
    if (scene === 'loading' || scene === 'error') return;
    document.querySelector('#loading-screen')?.classList.add('hidden');
    this.panel.hidden = scene === 'playing';
    if (scene === 'playing') { this.previousFocus?.focus(); return; }
    this.previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    this.panel.replaceChildren(); const box = document.createElement('div'); this.panel.append(box);
    const title = document.createElement('h1'); title.textContent = scene === 'menu' ? 'Forest RPG V2' : scene === 'paused' ? 'Paused' : scene === 'victory' ? 'Victory' : 'Game Over'; box.append(title);
    const button = (label: string, id: string, action: () => void) => {
      const el = document.createElement('button'); el.textContent = label; el.dataset.testid = id; el.onclick = action; box.append(el);
    };
    if (scene === 'paused') button('Resume', 'resume-button', () => this.game.resume());
    else { button('New Game', 'new-game-button', () => this.game.startNewGame()); button('Tutorial', 'tutorial-button', () => this.game.startNewGame({ tutorial: true })); }
    button('Settings', 'settings-button', () => this.showSettings(scene));
    if (scene !== 'menu') button('Main Menu', 'main-menu-button', () => this.game.returnToMenu());
    const help = document.createElement('p'); help.textContent = 'WASD / arrows: move · Shift: sprint · Esc: pause'; box.append(help);
    this.panel.querySelector('button')?.focus();
  }
  private showSettings(scene: SceneState): void {
    const box = this.panel.firstElementChild; if (!box) return; box.replaceChildren();
    const heading = document.createElement('h1'); heading.textContent = 'Settings'; box.append(heading);
    for (const key of ['masterVolume', 'musicVolume', 'sfxVolume'] as const) {
      const label = document.createElement('label'); label.textContent = key;
      const slider = document.createElement('input'); slider.type = 'range'; slider.min = '0'; slider.max = '1'; slider.step = '0.05'; slider.value = String(this.settings.value[key]);
      slider.oninput = () => { this.settings.value[key] = Number(slider.value); this.persist(); }; label.append(slider); box.append(label);
    }
    const fpsLabel = document.createElement('label'); fpsLabel.textContent = 'Frame limit';
    const select = document.createElement('select');
    for (const fps of [60, 120, 144, 240, 0]) { const option = new Option(fps ? String(fps) : 'Unlimited', String(fps)); select.append(option); }
    select.value = String(this.settings.value.maxFps); select.onchange = () => { this.settings.value.maxFps = Number(select.value); this.persist(); }; fpsLabel.append(select); box.append(fpsLabel);
    for (const key of ['lighting', 'particles', 'hud'] as const) {
      const label = document.createElement('label'); label.textContent = key; const input = document.createElement('input'); input.type = 'checkbox'; input.checked = this.settings.value[key];
      input.onchange = () => { this.settings.value[key] = input.checked; this.persist(); }; label.append(input); box.append(label);
    }
    const fullscreen = document.createElement('button'); fullscreen.textContent = 'Toggle fullscreen'; fullscreen.onclick = () => { void this.game.toggleFullscreen(); }; box.append(fullscreen);
    const back = document.createElement('button'); back.textContent = 'Back'; back.onclick = () => this.onSceneChanged(scene); box.append(back); this.panel.querySelector('input')?.focus();
  }
  private persist(): void { this.settings.save(); this.applySettings(); }
}
